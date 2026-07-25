/**
 * Demodulator implementations for real IQ data.
 *
 * Each demodulator consumes complex IQ samples (already converted to
 * [-1, 1] floats) and produces mono audio samples in [-1, 1]. The
 * demodulators are stateful so they can track phase, DC offsets, etc.
 *
 * After demodulation we typically low-pass filter + decimate to bring the
 * audio sample rate down to 48 kHz (or 24 kHz for narrow modes).
 */

import { Biquad } from "./dsp";

export type DemodKind = "WFM" | "NFM" | "AM" | "USB" | "LSB" | "CW" | "RAW";

export interface DemodResult {
  /** Left channel (or mono) audio samples in [-1, 1]. */
  audio: Float32Array;
  /** Right channel samples (only present for stereo). */
  audioRight?: Float32Array;
  /** Sample rate of the output audio (Hz). */
  audioRate: number;
  /** Whether this result contains stereo audio. */
  stereo: boolean;
}

export interface Demodulator {
  kind: DemodKind;
  /** Process a block of IQ samples and return audio. */
  process(iq: Float32Array, sampleRate: number): DemodResult;
  /** Reset internal state (e.g., when the user changes modes). */
  reset(): void;
}

/** Convert raw RTL2832U bytes → interleaved float IQ in [-1, 1]. */
export function bytesToFloatIQ(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = (bytes[i] - 128) / 128;
  }
  return out;
}

/** Factory: build a demodulator instance for the given mode + bandwidth. */
export function createDemodulator(kind: DemodKind, bandwidthHz: number): Demodulator {
  switch (kind) {
    case "WFM": return new FmDemod(bandwidthHz, 75e3, 15e3);
    case "NFM": return new FmDemod(bandwidthHz, 5e3, 3e3);
    case "AM":  return new AmDemod(bandwidthHz, 4e3);
    case "USB": return new SsbDemod("usb", bandwidthHz, 3e3);
    case "LSB": return new SsbDemod("lsb", bandwidthHz, 3e3);
    case "CW":  return new CwDemod(bandwidthHz, 800);
    case "RAW": return new RawDemod(bandwidthHz);
  }
}

/**
 * FM demodulator with stereo decoding.
 *
 * Broadcast FM signal structure (the "multiplex" or "MPX" signal):
 *   L+R (mono)      : 0–15 kHz
 *   Pilot            : 19 kHz (±8% deviation, sine wave)
 *   L-R (DSB-SC)    : 38 kHz ± 15 kHz (double-sideband suppressed carrier)
 *   RDS              : 57 kHz
 *   SCA              : 67 kHz, 92 kHz (subcarrier audio)
 *
 * Stereo decoding process:
 *   1. FM demodulate (phase differentiation) → produces the multiplex signal
 *   2. Extract the 19 kHz pilot with a narrow bandpass filter
 *   3. Phase-lock a local 38 kHz oscillator to 2× the pilot frequency
 *      (Costas loop — multiply pilot × local_19kHz, integrate, adjust phase)
 *   4. Multiply the multiplex by the 38 kHz reference → L-R at baseband
 *   5. Low-pass both L+R (0–15 kHz) and L-R (0–15 kHz) to 15 kHz
 *   6. L = (L+R + L-R) / 2,  R = (L+R − L-R) / 2
 *   7. Apply 75 µs de-emphasis to both L and R independently
 *   8. Decimate to 48 kHz
 *
 * The pilot PLL is critical for good stereo separation. A free-running 38 kHz
 * oscillator drifts with PPM error and destroys separation within seconds.
 * The PLL tracks the pilot and keeps the 38 kHz reference phase-locked.
 *
 * For weak signals, a "blend" control gradually mixes L and R toward mono
 * to reduce noise (stereo noise is 3 dB worse than mono due to the L-R
 * subcarrier being 20 dB below L+R).
 */
class FmDemod implements Demodulator {
  kind: DemodKind = "WFM";
  private prevPhase = 0;
  private readonly deviation: number;
  private readonly isWide: boolean;
  private stereoEnabled = false;

  // Pre-decimation: decimate from SDR rate to ~384 kHz before demodulation.
  // FM only needs ±100 kHz bandwidth (180 kHz channel + pilot + RDS).
  // Running at 384 kHz instead of 2.4 MHz = 6x less atan2 calls + 6x less
  // filter calls. Massive CPU savings with zero quality loss.
  private decimation: number = 1;
  private preDecimLp: Biquad;  // anti-aliasing low-pass before decimation

  // Post-decimation filters (run at decimated rate, ~384 kHz)
  private audioLp1: Biquad;  // 15 kHz low-pass stage 1
  private audioLp2: Biquad;  // 15 kHz low-pass stage 2
  // Stereo-only filters (only allocated when stereo is enabled)
  private pilotBp: Biquad | null = null;   // 19 kHz bandpass
  private audioLpR1: Biquad | null = null;  // 15 kHz low-pass for L-R stage 1
  private audioLpR2: Biquad | null = null;  // 15 kHz low-pass for L-R stage 2

  // Post-decimation de-emphasis (run at 48 kHz output rate)
  private deemphL: Biquad;
  private deemphR: Biquad | null = null;

  // Pilot PLL state
  private pllPhase = 0;
  private pllFreq = 0;
  private pllFreqNominal = 0;
  private pllError = 0;
  private pllLockCount = 0;
  private pllLocked = false;

  // Pre-allocated buffers
  private mpxBuf: Float32Array = new Float32Array(0);
  private lprBuf: Float32Array = new Float32Array(0);
  private lmrBuf: Float32Array = new Float32Array(0);
  private outLBuf: Float32Array = new Float32Array(0);
  private outRBuf: Float32Array = new Float32Array(0);

  private _sdrRate = 0;
  private _outRate = 48000;
  private _initialized = false;

  constructor(bandwidth: number, deviation: number, _audioCutoff: number) {
    this.deviation = deviation;
    this.isWide = deviation >= 50000;
    this.preDecimLp = new Biquad();
    this.audioLp1 = new Biquad();
    this.audioLp2 = new Biquad();
    this.deemphL = new Biquad();
  }

  setStereo(enabled: boolean) {
    this.stereoEnabled = enabled && this.isWide;
    if (this.stereoEnabled && !this.pilotBp) {
      this.pilotBp = new Biquad();
      this.audioLpR1 = new Biquad();
      this.audioLpR2 = new Biquad();
      this.deemphR = new Biquad();
    }
    this.reset();
  }

  process(iq: Float32Array, sampleRate: number): DemodResult {
    if (!this._initialized || this._sdrRate !== sampleRate) {
      this._sdrRate = sampleRate;
      this._init(sampleRate);
      this._initialized = true;
    }

    const n = iq.length / 2;
    const decimation = Math.max(1, Math.floor(sampleRate / this._outRate));

    // Pre-decimate: reduce from SDR rate to ~384 kHz for FM demodulation.
    // This is the single biggest CPU savings: 2.4 MHz → 384 kHz = 6x less
    // atan2 calls + 6x less biquad filter calls, with zero quality loss
    // (FM multiplex only needs ±100 kHz).
    const targetDemodRate = 384000;
    this.decimation = Math.max(1, Math.floor(sampleRate / targetDemodRate));
    const demodRate = sampleRate / this.decimation;
    const demodLen = Math.floor(n / this.decimation);

    // Ensure buffers
    if (this.mpxBuf.length !== demodLen) {
      this.mpxBuf = new Float32Array(demodLen);
      this.lprBuf = new Float32Array(demodLen);
      if (this.stereoEnabled) this.lmrBuf = new Float32Array(demodLen);
    }
    const outLen = Math.floor(demodLen / decimation);
    if (this.outLBuf.length !== outLen) {
      this.outLBuf = new Float32Array(outLen);
      if (this.stereoEnabled) this.outRBuf = new Float32Array(outLen);
    }
    const mpx = this.mpxBuf;
    const lpr = this.lprBuf;

    // --- Step 1: Pre-decimate (anti-alias filter both I and Q) ---
    // Low-pass at 150 kHz (covers full FM multiplex) before decimating.
    // Must filter BOTH I and Q — filtering only I corrupts the phase.
    for (let i = 0, j = 0; i < n; i++) {
      const fi = this.preDecimLp.process(iq[i * 2]);
      const fq = this.preDecimLp.process(iq[i * 2 + 1]);
      if (i % this.decimation === 0 && j < demodLen) {
        // FM demodulate using Math.atan2 (correct, no approximation)
        const phase = Math.atan2(fq, fi);
        let diff = phase - this.prevPhase;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        this.prevPhase = phase;
        mpx[j] = (diff * demodRate) / (2 * Math.PI * this.deviation);
        j++;
      }
    }

    // --- Step 2: Low-pass L+R at 15 kHz (cascaded biquads, demod rate) ---
    // Two stages give a much sharper cutoff than one — critical for
    // rejecting the 19 kHz pilot and 23-53 kHz L-R subcarrier.
    for (let i = 0; i < demodLen; i++) {
      lpr[i] = this.audioLp2.process(this.audioLp1.process(mpx[i]));
    }

    // --- Step 3: Stereo path (only if enabled AND PLL locks) ---
    if (this.stereoEnabled && this.pilotBp && this.audioLpR1 && this.audioLpR2) {
      const lmr = this.lmrBuf;
      // Pilot extract + PLL + L-R demod in one pass
      for (let i = 0; i < demodLen; i++) {
        const p = this.pilotBp.process(mpx[i]);
        const localSin = Math.sin(this.pllPhase);
        const error = p * localSin;
        this.pllError = this.pllError * 0.999 + error * 0.001;
        this.pllFreq = this.pllFreqNominal + error * 0.0001 + this.pllError;
        this.pllPhase += this.pllFreq;
        const corr = Math.abs(p * Math.cos(this.pllPhase));
        if (corr > 0.005) this.pllLockCount = Math.min(this.pllLockCount + 1, 1000);
        else this.pllLockCount = Math.max(this.pllLockCount - 1, 0);
        this.pllLocked = this.pllLockCount > 50;
        lmr[i] = mpx[i] * Math.cos(2 * this.pllPhase);
      }
      // Low-pass L-R at 15 kHz (cascaded biquads)
      for (let i = 0; i < demodLen; i++) {
        lmr[i] = this.audioLpR2.process(this.audioLpR1.process(lmr[i]));
      }

      if (this.pllLocked) {
        // Stereo: decimate, then de-emphasis at output rate
        for (let i = 0; i < outLen; i++) {
          const idx = i * decimation;
          const l = (lpr[idx] + lmr[idx]) * 0.5;
          const r = (lpr[idx] - lmr[idx]) * 0.5;
          this.outLBuf[i] = this.deemphL.process(l);
          this.outRBuf[i] = this.deemphR!.process(r);
        }
        return { audio: this.outLBuf, audioRight: this.outRBuf, audioRate: this._outRate, stereo: true };
      }
    }

    // --- Mono: decimate L+R, then de-emphasis at output rate ---
    for (let i = 0; i < outLen; i++) {
      this.outLBuf[i] = this.deemphL.process(lpr[i * decimation]);
    }
    return { audio: this.outLBuf, audioRate: this._outRate, stereo: false };
  }

  private _init(sampleRate: number) {
    // Pre-decimation anti-aliasing: low-pass at 150 kHz (covers full FM multiplex)
    this.preDecimLp.setLowpass(sampleRate, 150000, 0.707);

    // Decimation factor to get to ~384 kHz
    this.decimation = Math.max(1, Math.floor(sampleRate / 384000));
    const demodRate = sampleRate / this.decimation;

    // Audio low-pass at 15 kHz at the decimated rate (much sharper at 384 kHz
    // than at 2.4 MHz because the biquad has more relative headroom)
    this.audioLp1.setLowpass(demodRate, 15000, 0.707);
    this.audioLp2.setLowpass(demodRate, 15000, 0.54);
    // Post-decimation: de-emphasis at 48 kHz output rate
    this._outRate = Math.floor(demodRate / Math.max(1, Math.floor(demodRate / 48000)));
    this.deemphL.setLowpass(this._outRate, 2122, 0.707);

    if (this.stereoEnabled) {
      this.pilotBp!.setLowpass(demodRate, 19000, 30);
      this.audioLpR1!.setLowpass(demodRate, 15000, 0.707);
      this.audioLpR2!.setLowpass(demodRate, 15000, 0.54);
      this.deemphR!.setLowpass(this._outRate, 2122, 0.707);
      this.pllFreqNominal = (2 * Math.PI * 19000) / demodRate;
      this.pllFreq = this.pllFreqNominal;
      this.pllPhase = 0;
      this.pllLockCount = 0;
      this.pllLocked = false;
    }
  }

  reset(): void {
    this.prevPhase = 0;
    this.pllPhase = 0;
    this.pllLockCount = 0;
    this.pllLocked = false;
    this.preDecimLp.reset();
    this.audioLp1.reset();
    this.audioLp2.reset();
    this.deemphL.reset();
    if (this.pilotBp) this.pilotBp.reset();
    if (this.audioLpR1) this.audioLpR1.reset();
    if (this.audioLpR2) this.audioLpR2.reset();
    if (this.deemphR) this.deemphR.reset();
    this._initialized = false;
  }
}

/**
 * AM demodulator: compute the magnitude envelope.
 *   output = sqrt(I² + Q²) - DC
 */
class AmDemod implements Demodulator {
  kind: DemodKind = "AM";
  private dcAvg = 0;
  private audioLp: Biquad;
  private readonly audioCutoff: number;
  private _initialized = false;

  constructor(_bandwidth: number, audioCutoff: number) {
    this.audioCutoff = audioCutoff;
    this.audioLp = new Biquad();
  }

  process(iq: Float32Array, sampleRate: number): DemodResult {
    if (!this._initialized) {
      this.audioLp.setLowpass(sampleRate, this.audioCutoff, 0.707);
      this._initialized = true;
    }
    const n = iq.length / 2;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      const mag = Math.sqrt(I * I + Q * Q);
      // Slow DC tracker (attack ~50 ms)
      this.dcAvg += (mag - this.dcAvg) * 0.0008 * (sampleRate / 1000);
      raw[i] = mag - this.dcAvg;
    }
    const filtered = new Float32Array(n);
    for (let i = 0; i < n; i++) filtered[i] = this.audioLp.process(raw[i]);
    const decimation = Math.max(1, Math.floor(sampleRate / 48000));
    const out = new Float32Array(Math.floor(n / decimation));
    for (let i = 0; i < out.length; i++) {
      out[i] = filtered[i * decimation];
    }
    return { audio: out, audioRate: Math.floor(sampleRate / decimation), stereo: false };
  }

  reset(): void {
    this.dcAvg = 0;
    this.audioLp.reset();
    this._initialized = false;
  }
}

/**
 * SSB demodulator: shift the signal to baseband (USB → freq offset > 0,
 * LSB → freq offset < 0), then low-pass the result.
 *
 * For simplicity we use the "phasing method" with a complex mixer:
 *   - USB: out = I·cos(ωt) + Q·sin(ωt)  (after low-pass)
 *   - LSB: out = I·cos(ωt) - Q·sin(ωt)  (after low-pass)
 *
 * where ω is a small offset frequency (~500 Hz) so we don't sit on DC.
 */
class SsbDemod implements Demodulator {
  kind: DemodKind;
  private sideband: "usb" | "lsb";
  private audioLp: Biquad;
  private readonly audioCutoff: number;
  private phase = 0;
  private _initialized = false;

  constructor(sideband: "usb" | "lsb", _bandwidth: number, audioCutoff: number) {
    this.sideband = sideband;
    this.kind = sideband === "usb" ? "USB" : "LSB";
    this.audioCutoff = audioCutoff;
    this.audioLp = new Biquad();
  }

  process(iq: Float32Array, sampleRate: number): DemodResult {
    if (!this._initialized) {
      this.audioLp.setLowpass(sampleRate, this.audioCutoff, 0.707);
      this._initialized = true;
    }
    const n = iq.length / 2;
    const offset = 500; // Hz BFO
    const omega = (2 * Math.PI * offset) / sampleRate;
    const sign = this.sideband === "usb" ? 1 : -1;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      const c = Math.cos(this.phase);
      const s = Math.sin(this.phase);
      // Complex multiply (I + jQ) · (c + js) = (Ic - Qs) + j(Is + Qc)
      // For USB we keep the real part, for LSB we flip the sign of the imaginary component
      raw[i] = I * c - sign * Q * s;
      this.phase += omega;
      if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
    }
    const filtered = new Float32Array(n);
    for (let i = 0; i < n; i++) filtered[i] = this.audioLp.process(raw[i]);
    const decimation = Math.max(1, Math.floor(sampleRate / 48000));
    const out = new Float32Array(Math.floor(n / decimation));
    for (let i = 0; i < out.length; i++) {
      out[i] = filtered[i * decimation];
    }
    return { audio: out, audioRate: Math.floor(sampleRate / decimation), stereo: false };
  }

  reset(): void {
    this.phase = 0;
    this.audioLp.reset();
    this._initialized = false;
  }
}

/** CW demodulator: mix to a 700 Hz tone then band-pass around it. */
class CwDemod implements Demodulator {
  kind: DemodKind = "CW";
  private bfo = 700; // Hz
  private phase = 0;
  private bpL: Biquad;
  private bpH: Biquad;
  private readonly bandwidth: number;
  private _initialized = false;

  constructor(_bandwidth: number, _tone: number) {
    this.bandwidth = 800;
    this.bpL = new Biquad();
    this.bpH = new Biquad();
  }

  process(iq: Float32Array, sampleRate: number): DemodResult {
    if (!this._initialized) {
      this.bpL.setLowpass(sampleRate, 900, 0.707);
      this.bpH.setHighpass(sampleRate, 500, 0.707);
      this._initialized = true;
    }
    const n = iq.length / 2;
    const omega = (2 * Math.PI * this.bfo) / sampleRate;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      // Mix down to baseband, then BFO back up to 700 Hz
      const baseband = Math.sqrt(I * I + Q * Q);
      raw[i] = baseband * Math.cos(this.phase);
      this.phase += omega;
      if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
    }
    const filtered = new Float32Array(n);
    for (let i = 0; i < n; i++) filtered[i] = this.bpH.process(this.bpL.process(raw[i]));
    const decimation = Math.max(1, Math.floor(sampleRate / 48000));
    const out = new Float32Array(Math.floor(n / decimation));
    for (let i = 0; i < out.length; i++) {
      out[i] = filtered[i * decimation];
    }
    return { audio: out, audioRate: Math.floor(sampleRate / decimation), stereo: false };
  }

  reset(): void {
    this.phase = 0;
    this.bpL.reset();
    this.bpH.reset();
    this._initialized = false;
  }
}

/** RAW: no demodulation — output the magnitude as a placeholder. */
class RawDemod implements Demodulator {
  kind: DemodKind = "RAW";
  process(iq: Float32Array, sampleRate: number): DemodResult {
    const n = iq.length / 2;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      out[i] = Math.sqrt(I * I + Q * Q) * 0.5;
    }
    return { audio: out, audioRate: sampleRate, stereo: false };
  }
  reset(): void {}
}
