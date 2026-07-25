/**
 * Notch filter — suppresses strong interfering signals in the IQ stream
 * before demodulation, so a strong local station doesn't swamp a weaker
 * signal you're trying to receive.
 *
 * We use an IIR notch filter (single-conjugate-pair zero at the notch
 * frequency, single-conjugate-pole just inside the unit circle). The
 * notch width is set by the "Q" parameter.
 *
 * The component can run in two modes:
 *   1. Manual: user specifies notch frequencies
 *   2. Auto: we auto-detect strong bins in the spectrum and notch them
 *
 * Auto-detection runs periodically (every ~100 ms of audio), looks for
 * bins whose power is significantly above the local noise floor, and
 * adds them to the notch list.
 */

const MAX_NOTCHES = 16;

export interface NotchSpec {
  /** Frequency offset from center (Hz). */
  freqHz: number;
  /** Q factor — higher = narrower notch. */
  q: number;
  /** Auto-detected (true) or user-specified (false)? */
  auto: boolean;
}

export class NotchFilter {
  /** Per-notch biquad coefficients. */
  private notchBiquads: Array<{
    freqHz: number;
    q: number;
    auto: boolean;
    // IIR coefficients (computed in init)
    a1: number;
    a2: number;
    b1: number;
    b2: number;
    // Per-channel state (we apply to complex I/Q separately)
    x1r: number; x2r: number; y1r: number; y2r: number;
    x1i: number; x2i: number; y1i: number; y2i: number;
    // Latch so we recompute coefficients when sample rate changes
    sampleRate: number;
  }> = [];

  private sampleRate = 0;
  private autoDetectEnabled = false;
  private autoDetectMinStrengthDb = -30;
  private autoDetectMinNotchSpacingHz = 50000;

  configure(opts: {
    sampleRate: number;
    notches?: NotchSpec[];
    autoDetect?: boolean;
    autoDetectMinDb?: number;
    autoDetectMinSpacingHz?: number;
  }) {
    this.sampleRate = opts.sampleRate;
    if (opts.autoDetect !== undefined) this.autoDetectEnabled = opts.autoDetect;
    if (opts.autoDetectMinDb !== undefined) this.autoDetectMinStrengthDb = opts.autoDetectMinDb;
    if (opts.autoDetectMinSpacingHz !== undefined) this.autoDetectMinNotchSpacingHz = opts.autoDetectMinSpacingHz;
    if (opts.notches !== undefined) {
      this.notchBiquads = opts.notches.map((n) => this.makeBiquad(n));
    }
  }

  /** Returns the current notch list (for display). */
  getNotches(): NotchSpec[] {
    return this.notchBiquads.map((b) => ({
      freqHz: b.freqHz,
      q: b.q,
      auto: b.auto,
    }));
  }

  addNotch(freqHz: number, q: number = 30, auto: boolean = false) {
    if (this.notchBiquads.length >= MAX_NOTCHES) return;
    if (this.notchBiquads.some((b) => Math.abs(b.freqHz - freqHz) < 1000)) return;
    this.notchBiquads.push(this.makeBiquad({ freqHz, q, auto }));
  }

  removeNotch(freqHz: number) {
    this.notchBiquads = this.notchBiquads.filter(
      (b) => Math.abs(b.freqHz - freqHz) > 1000,
    );
  }

  clearAutoNotches() {
    this.notchBiquads = this.notchBiquads.filter((b) => !b.auto);
  }

  /**
   * Auto-detect strong bins in the spectrum and add them as notches.
   * Call this with the latest FFT magnitude spectrum (in dBFS).
   */
  autoDetectFromSpectrum(spectrum: Float32Array, centerFreqHz: number, sampleRate: number) {
    if (!this.autoDetectEnabled) return;
    // Compute the noise floor (median of bins)
    const sorted = Array.from(spectrum).sort((a, b) => a - b);
    const noiseFloor = sorted[Math.floor(sorted.length / 2)];
    // Find bins significantly above the floor
    const threshold = noiseFloor + 25; // 25 dB above floor
    for (let i = 0; i < spectrum.length; i++) {
      if (spectrum[i] > threshold && spectrum[i] > this.autoDetectMinStrengthDb) {
        // Map bin to frequency
        const binFreqOffset = (i / (spectrum.length - 1)) * (sampleRate / 2);
        // Check spacing from existing notches
        const tooClose = this.notchBiquads.some(
          (b) => Math.abs(b.freqHz - binFreqOffset) < this.autoDetectMinNotchSpacingHz,
        );
        if (!tooClose) {
          this.addNotch(binFreqOffset, 30, true);
        }
      }
    }
  }

  private makeBiquad(spec: NotchSpec) {
    const w = (2 * Math.PI * spec.freqHz) / this.sampleRate;
    const cosw = Math.cos(w);
    const sinw = Math.sin(w);
    const alpha = sinw / (2 * spec.q);
    // Notch filter (biquad) — zeros on the unit circle at ±w0
    //   b0 = 1, b1 = -2 cos(w0), b2 = 1, a0 = 1, a1 = -2 r cos(w0), a2 = r^2
    // Where r = 1 - alpha (radius of poles slightly inside unit circle)
    const r = 1 - alpha;
    return {
      freqHz: spec.freqHz,
      q: spec.q,
      auto: spec.auto,
      b1: -2 * cosw,
      b2: 1,
      a1: -2 * r * cosw,
      a2: r * r,
      x1r: 0, x2r: 0, y1r: 0, y2r: 0,
      x1i: 0, x2i: 0, y1i: 0, y2i: 0,
      sampleRate: this.sampleRate,
    };
  }

  /**
   * Apply the notch filters to a block of complex IQ samples (in place).
   */
  process(iq: Float32Array): void {
    if (this.notchBiquads.length === 0) return;
    const n = iq.length / 2;
    for (const biquad of this.notchBiquads) {
      // Recompute coefficients if sample rate has changed
      if (biquad.sampleRate !== this.sampleRate) {
        const w = (2 * Math.PI * biquad.freqHz) / this.sampleRate;
        const cosw = Math.cos(w);
        const sinw = Math.sin(w);
        const alpha = sinw / (2 * biquad.q);
        const r = 1 - alpha;
        biquad.b1 = -2 * cosw;
        biquad.b2 = 1;
        biquad.a1 = -2 * r * cosw;
        biquad.a2 = r * r;
        biquad.sampleRate = this.sampleRate;
        biquad.x1r = biquad.x2r = biquad.y1r = biquad.y2r = 0;
        biquad.x1i = biquad.x2i = biquad.y1i = biquad.y2i = 0;
      }
      for (let i = 0; i < n; i++) {
        // Process I
        const xr = iq[i * 2];
        const yr = xr + biquad.b1 * biquad.x1r + biquad.b2 * biquad.x2r
          - biquad.a1 * biquad.y1r - biquad.a2 * biquad.y2r;
        biquad.x2r = biquad.x1r;
        biquad.x1r = xr;
        biquad.y2r = biquad.y1r;
        biquad.y1r = yr;
        iq[i * 2] = yr;
        // Process Q
        const xi = iq[i * 2 + 1];
        const yi = xi + biquad.b1 * biquad.x1i + biquad.b2 * biquad.x2i
          - biquad.a1 * biquad.y1i - biquad.a2 * biquad.y2i;
        biquad.x2i = biquad.x1i;
        biquad.x1i = xi;
        biquad.y2i = biquad.y1i;
        biquad.y1i = yi;
        iq[i * 2 + 1] = yi;
      }
    }
  }

  reset() {
    for (const b of this.notchBiquads) {
      b.x1r = b.x2r = b.y1r = b.y2r = 0;
      b.x1i = b.x2i = b.y1i = b.y2i = 0;
    }
  }
}
