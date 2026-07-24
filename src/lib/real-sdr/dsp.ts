/**
 * Minimal in-place radix-2 Cooley-Tukey FFT.
 *
 * Power-of-2 sizes only (we use 512 / 1024 / 2048). The implementation is
 * not the fastest, but it has zero dependencies and is plenty fast for a
 * 60 fps spectrum on a 1024-bin FFT (≤ ~1 ms per transform on a modern CPU).
 */

export function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`fftRadix2: size must be a power of 2, got ${n}`);
  }

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  // Butterfly stages
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const tableStep = -2 * Math.PI / size;
    for (let i = 0; i < n; i += size) {
      for (let j = i; j < i + half; j++) {
        const k = j + half;
        const angle = tableStep * (j - i);
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const tr = re[k] * wr - im[k] * wi;
        const ti = re[k] * wi + im[k] * wr;
        re[k] = re[j] - tr;
        im[k] = im[j] - ti;
        re[j] += tr;
        im[j] += ti;
      }
    }
  }
}

/**
 * Compute a magnitude spectrum (in dBFS) from a block of unsigned IQ bytes.
 *
 * The RTL2832U delivers unsigned 8-bit samples centred on 127. We subtract
 * 128 and divide by 128 to get values in roughly [-1, 1]. We apply a Hann
 * window to reduce spectral leakage, then run the FFT and return the first
 * N/2 bins (the rest are the symmetric negative-frequency mirror).
 *
 * Output is in dBFS, where 0 dBFS = a full-scale sine wave. Real RTL-SDR
 * noise floors typically sit around -60 to -80 dBFS depending on gain.
 */
export function computeSpectrumDbfs(
  iq: Uint8Array,
  out: Float32Array,
): void {
  const fftSize = out.length * 2; // we keep only the positive half
  if (iq.length < fftSize * 2) {
    out.fill(-120);
    return;
  }

  // Reusable buffers — allocate lazily per call (cheap for ≤ 2048 size)
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  // Hann window
  for (let i = 0; i < fftSize; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    const idx = i * 2;
    re[i] = ((iq[idx] - 128) / 128) * w;
    im[i] = ((iq[idx + 1] - 128) / 128) * w;
  }

  fftRadix2(re, im);

  // Magnitude → dBFS. We normalize by fftSize/2 (parseval), then convert.
  const norm = 2 / fftSize;
  for (let i = 0; i < out.length; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]) * norm;
    // -160 dBFS floor to avoid -Infinity on zeros
    const db = mag > 1e-8 ? 20 * Math.log10(mag) : -160;
    out[i] = db;
  }
}

/**
 * Apply a simple boxcar decimation by an integer factor.
 * Returns a new Float32Array of length floor(input.length / factor).
 */
export function decimate(input: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return input;
  const out = new Float32Array(Math.floor(input.length / factor));
  for (let i = 0; i < out.length; i++) {
    out[i] = input[i * factor];
  }
  return out;
}

/** Biquad filter — used for low-pass / band-pass / high-pass. */
export class Biquad {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  /** Set coefficients for a low-pass filter at the given cutoff. */
  setLowpass(sampleRate: number, cutoffHz: number, q = 0.707): void {
    const w = (2 * Math.PI * cutoffHz) / sampleRate;
    const cosw = Math.cos(w);
    const sinw = Math.sin(w);
    const alpha = sinw / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = ((1 - cosw) / 2) / a0;
    this.b1 = (1 - cosw) / a0;
    this.b2 = ((1 - cosw) / 2) / a0;
    this.a1 = (-2 * cosw) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  /** Set coefficients for a high-pass filter. */
  setHighpass(sampleRate: number, cutoffHz: number, q = 0.707): void {
    const w = (2 * Math.PI * cutoffHz) / sampleRate;
    const cosw = Math.cos(w);
    const sinw = Math.sin(w);
    const alpha = sinw / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = ((1 + cosw) / 2) / a0;
    this.b1 = -(1 + cosw) / a0;
    this.b2 = ((1 + cosw) / 2) / a0;
    this.a1 = (-2 * cosw) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  reset(): void {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}
