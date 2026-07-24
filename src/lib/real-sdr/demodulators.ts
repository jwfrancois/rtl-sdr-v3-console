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
  /** Mono audio samples in [-1, 1]. */
  audio: Float32Array;
  /** Sample rate of the output audio (Hz). */
  audioRate: number;
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
 * FM demodulator: differentiate the phase of each sample.
 *
 *   phase = atan2(Q, I)
 *   output = (phase - prevPhase) / (2π · df)
 * where df is the frequency deviation we expect (75 kHz for broadcast FM).
 */
class FmDemod implements Demodulator {
  kind: DemodKind = "WFM";
  private prevPhase = 0;
  private audioLp: Biquad;
  private deemph: Biquad;
  private readonly deviation: number;
  private readonly audioCutoff: number;

  constructor(bandwidth: number, deviation: number, audioCutoff: number) {
    this.deviation = deviation;
    this.audioCutoff = audioCutoff;
    this.audioLp = new Biquad();
    this.deemph = new Biquad();
    // We'll set sample rate on first process call (we don't know it yet)
    this._initialized = false;
  }
  private _initialized: boolean;

  process(iq: Float32Array, sampleRate: number): DemodResult {
    if (!this._initialized) {
      this.audioLp.setLowpass(sampleRate, this.audioCutoff, 0.707);
      // De-emphasis (75 µs time constant → ~2122 Hz cutoff) — matches US FM broadcast
      this.deemph.setLowpass(sampleRate, 2122, 0.707);
      this._initialized = true;
    }

    const n = iq.length / 2;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      const phase = Math.atan2(Q, I);
      let diff = phase - this.prevPhase;
      // Unwrap phase to [-π, π]
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.prevPhase = phase;
      // Normalize by expected deviation
      raw[i] = (diff / Math.PI) * (this.deviation / 75000);
    }

    // Low-pass the audio, then decimate to 48 kHz
    const filtered = new Float32Array(n);
    for (let i = 0; i < n; i++) filtered[i] = this.deemph.process(this.audioLp.process(raw[i]));
    const decimation = Math.max(1, Math.floor(sampleRate / 48000));
    const out = new Float32Array(Math.floor(n / decimation));
    for (let i = 0; i < out.length; i++) {
      out[i] = filtered[i * decimation];
    }
    return { audio: out, audioRate: Math.floor(sampleRate / decimation) };
  }

  reset(): void {
    this.prevPhase = 0;
    this.audioLp.reset();
    this.deemph.reset();
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
    return { audio: out, audioRate: Math.floor(sampleRate / decimation) };
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
    return { audio: out, audioRate: Math.floor(sampleRate / decimation) };
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
    return { audio: out, audioRate: Math.floor(sampleRate / decimation) };
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
    return { audio: out, audioRate: sampleRate };
  }
  reset(): void {}
}
