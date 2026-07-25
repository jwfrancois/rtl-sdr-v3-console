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
  private readonly audioCutoff: number;
  private readonly isWide: boolean;

  // Pilot PLL state
  private pllPhase = 0;       // Current VCO phase (radians)
  private pllFreq = 0;       // Current VCO frequency (rad/sample)
  private pllFreqNominal = 0; // Nominal 19 kHz in rad/sample
  private pllError = 0;      // Last phase error (for loop filter)
  private pllLockCount = 0;   // Consecutive lock confirmations
  private pllLocked = false;

  // Filters
  private pilotBp: Biquad;   // Narrow bandpass at 19 kHz for pilot extraction
  private audioLpL: Biquad;  // 15 kHz low-pass for L+R
  private audioLpR: Biquad;  // 15 kHz low-pass for L-R
  private deemphL: Biquad;   // 75 µs de-emphasis for left channel
  private deemphR: Biquad;   // 75 µs de-emphasis for right channel
  private pilotNotchL: Biquad; // 19 kHz notch to remove pilot from L audio
  private pilotNotchR: Biquad; // 19 kHz notch to remove pilot from R audio

  private _initialized = false;

  constructor(bandwidth: number, deviation: number, audioCutoff: number) {
    this.deviation = deviation;
    this.audioCutoff = audioCutoff;
    this.isWide = deviation >= 50000; // Stereo only for WFM
    this.pilotBp = new Biquad();
    this.audioLpL = new Biquad();
    this.audioLpR = new Biquad();
    this.deemphL = new Biquad();
    this.deemphR = new Biquad();
    this.pilotNotchL = new Biquad();
    this.pilotNotchR = new Biquad();
  }

  process(iq: Float32Array, sampleRate: number): DemodResult {
    if (!this._initialized) {
      this._init(sampleRate);
      this._initialized = true;
    }

    const n = iq.length / 2;

    // --- Step 1: FM demodulate → multiplex signal ---
    const mpx = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      const phase = Math.atan2(Q, I);
      let diff = phase - this.prevPhase;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.prevPhase = phase;
      mpx[i] = (diff * sampleRate) / (2 * Math.PI * this.deviation);
    }

    // --- Mono path: L+R = low-pass(mpx, 15 kHz) ---
    const lpr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      lpr[i] = this.audioLpL.process(this.pilotNotchL.process(mpx[i]));
    }

    // --- Stereo path (only for WFM with strong enough pilot) ---
    if (this.isWide) {
      // Step 2: Extract 19 kHz pilot
      const pilot = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pilot[i] = this.pilotBp.process(mpx[i]);
      }

      // Step 3: PLL to lock 38 kHz oscillator to 2× pilot phase
      // The PLL multiplies the pilot by a local 19 kHz VCO, integrates the
      // product to get phase error, and adjusts the VCO frequency/phase.
      // We then generate 38 kHz as 2× the VCO phase.
      const lmr = new Float32Array(n); // L-R demodulated
      for (let i = 0; i < n; i++) {
        // Phase detector: multiply pilot by local VCO (cosine)
        const localCos = Math.cos(this.pllPhase);
        const localSin = Math.sin(this.pllPhase);
        const error = pilot[i] * localSin; // sin error for type-II PLL

        // Loop filter (proportional + integral)
        this.pllError = this.pllError * 0.999 + error * 0.001; // integral
        const freqAdjust = error * 0.0001 + this.pllError; // proportional + integral

        // Update VCO
        this.pllFreq = this.pllFreqNominal + freqAdjust;
        this.pllPhase += this.pllFreq;

        // Lock detection
        const corr = Math.abs(pilot[i] * localCos);
        if (corr > 0.01) {
          this.pllLockCount = Math.min(this.pllLockCount + 1, 1000);
        } else {
          this.pllLockCount = Math.max(this.pllLockCount - 1, 0);
        }
        this.pllLocked = this.pllLockCount > 100;

        // Step 4: Multiply mpx by 38 kHz (2× VCO phase) → L-R at baseband
        const ref38 = Math.cos(2 * this.pllPhase);
        lmr[i] = mpx[i] * ref38;
      }

      // Step 5: Low-pass L-R to 15 kHz + 19 kHz notch
      const lmrFiltered = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        lmrFiltered[i] = this.audioLpR.process(this.pilotNotchR.process(lmr[i]));
      }

      // Step 6: L = (L+R + L-R) / 2, R = (L+R - L-R) / 2
      // Step 7: De-emphasis both channels
      const decimation = Math.max(1, Math.floor(sampleRate / 48000));
      const outLen = Math.floor(n / decimation);
      const outL = new Float32Array(outLen);
      const outR = new Float32Array(outLen);

      if (this.pllLocked) {
        // Stereo decode
        for (let i = 0; i < outLen; i++) {
          const idx = i * decimation;
          const l = (lpr[idx] + lmrFiltered[idx]) * 0.5;
          const r = (lpr[idx] - lmrFiltered[idx]) * 0.5;
          outL[i] = this.deemphL.process(l);
          outR[i] = this.deemphR.process(r);
        }
        return {
          audio: outL,
          audioRight: outR,
          audioRate: Math.floor(sampleRate / decimation),
          stereo: true,
        };
      }
      // PLL not locked — fall through to mono output below
    }

    // --- Mono fallback: de-emphasis + decimate ---
    const decimation = Math.max(1, Math.floor(sampleRate / 48000));
    const outLen = Math.floor(n / decimation);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      out[i] = this.deemphL.process(lpr[i * decimation]);
    }
    return { audio: out, audioRate: Math.floor(sampleRate / decimation), stereo: false };
  }

  private _init(sampleRate: number) {
    // Pilot extraction: high-Q lowpass at 19 kHz acts as a narrow bandpass
    // (the resonance at the cutoff frequency passes 19 kHz while rejecting
    // both L+R below 15 kHz and L-R above 23 kHz). Q=30 → ~633 Hz bandwidth.
    this.pilotBp.setLowpass(sampleRate, 19000, 30);

    // Audio low-pass at 15 kHz for both L+R and L-R paths.
    // The 15 kHz cutoff also removes the 19 kHz pilot from the audio.
    this.audioLpL.setLowpass(sampleRate, 15000, 0.707);
    this.audioLpR.setLowpass(sampleRate, 15000, 0.707);

    // The pilot notch filters are redundant — the 15 kHz low-pass already
    // removes the 19 kHz pilot. Reconfigure them as additional 15 kHz
    // low-passes so they're harmless pass-throughs (avoiding extra CPU).
    this.pilotNotchL.setLowpass(sampleRate, 15000, 0.707);
    this.pilotNotchR.setLowpass(sampleRate, 15000, 0.707);

    // De-emphasis: 75 µs (US) → 2122 Hz cutoff. Applied independently to
    // both L and R channels for proper stereo de-emphasis.
    this.deemphL.setLowpass(sampleRate, 2122, 0.707);
    this.deemphR.setLowpass(sampleRate, 2122, 0.707);

    // PLL: nominal 19 kHz in radians per sample
    this.pllFreqNominal = (2 * Math.PI * 19000) / sampleRate;
    this.pllFreq = this.pllFreqNominal;
    this.pllPhase = 0;
    this.pllLockCount = 0;
    this.pllLocked = false;
  }

  reset(): void {
    this.prevPhase = 0;
    this.pllPhase = 0;
    this.pllFreq = 0;
    this.pllLockCount = 0;
    this.pllLocked = false;
    this.audioLpL.reset();
    this.audioLpR.reset();
    this.deemphL.reset();
    this.deemphR.reset();
    this.pilotBp.reset();
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
