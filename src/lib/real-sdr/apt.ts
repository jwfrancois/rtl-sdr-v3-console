/**
 * APT (Automatic Picture Transmission) decoder.
 *
 * NOAA weather satellites transmit grayscale images of the Earth below
 * them on 137–138 MHz. The image is scanned line-by-line:
 *   - 2 lines/second (line period = 0.5 s)
 *   - Each line: 2080 pixels = 39 sync + 909 ch.A (visible) + 54 space +
 *     909 ch.B (IR) + 127 telemetry
 *   - Modulation: AM with a 2.4 kHz subcarrier
 *
 * We demodulate by:
 *   1. Compute magnitude envelope (AM demod)
 *   2. Low-pass to 2080 Hz (one full line per cycle of 2 Hz sync)
 *   3. Sample at exactly 4160 sps (2× line rate, to capture pixels)
 *   4. Look for the sync A pattern (7 black + 7 white + 7 black pulses at
 *      1040 Hz) to align line boundaries
 *
 * The resulting image is rendered to a canvas as it's decoded.
 *
 * Reference: NOAA KLM Users Guide §4.2.
 */

import { Biquad } from "./dsp";

const LINE_RATE = 2; // 2 lines per second
const PIXELS_PER_LINE = 2080;
const SYNC_PATTERN_LENGTH = 39;
const CH_A_LENGTH = 909;
const SPACE_LENGTH = 54;
const CH_B_LENGTH = 909;
const TELEMETRY_LENGTH = 127;
// Total = 39 + 909 + 54 + 909 + 127 = 2038 ... we use 2080 as the standard

const APT_PIXEL_RATE = LINE_RATE * PIXELS_PER_LINE; // 4160 sps

export interface AptState {
  /** Pixels decoded so far, line-by-line. Each line is PIXELS_PER_LINE. */
  lineCount: number;
  /** Lines decoded (rows in the final image). */
  totalPixels: number;
  /** Whether we've locked onto the sync pattern. */
  locked: boolean;
  /** Timestamp of last successful sync (ms). */
  lastSync: number;
  /** Image data buffer (we expose as a single Float32Array of grayscale values 0..1). */
  buffer: Float32Array | null;
  /** Buffer width (= PIXELS_PER_LINE). */
  width: number;
}

export class AptDecoder {
  private lpAudio: Biquad;
  private lpSub: Biquad;
  private samplesPerLine = 0;
  private samplesPerPixel = 0;
  private initialized = false;
  private lineBuffer: number[] = [];
  private currentLine: number[] = [];
  private pixelIdx = 0;
  private sampleAccum = 0;
  private dcAvg = 0;

  state: AptState = {
    lineCount: 0,
    totalPixels: 0,
    locked: false,
    lastSync: 0,
    buffer: null,
    width: PIXELS_PER_LINE,
  };

  constructor() {
    this.lpAudio = new Biquad();
    this.lpSub = new Biquad();
  }

  process(iq: Float32Array, sampleRate: number) {
    if (!this.initialized) {
      this.samplesPerLine = sampleRate / LINE_RATE;
      this.samplesPerPixel = sampleRate / APT_PIXEL_RATE;
      // Low-pass to capture just the 2.4 kHz subcarrier (and its AM envelope)
      this.lpSub.setLowpass(sampleRate, 2400, 0.707);
      // Low-pass the envelope down to the pixel rate
      this.lpAudio.setLowpass(sampleRate, APT_PIXEL_RATE / 2, 0.707);
      this.state.buffer = new Float32Array(PIXELS_PER_LINE * 1024); // 1024-line rolling buffer
      this.initialized = true;
    }

    const n = iq.length / 2;
    for (let i = 0; i < n; i++) {
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      // AM demodulation: magnitude
      const mag = Math.sqrt(I * I + Q * Q);
      // Low-pass to extract just the subcarrier envelope
      const sub = this.lpSub.process(mag);
      // DC tracker (slow) so we don't drift with signal strength
      this.dcAvg += (sub - this.dcAvg) * 0.0002;
      const envelope = sub - this.dcAvg;
      // Low-pass the envelope to pixel rate
      const pix = this.lpAudio.process(envelope);

      // Sample at pixel rate
      this.sampleAccum += 1;
      if (this.sampleAccum >= this.samplesPerPixel) {
        this.sampleAccum -= this.samplesPerPixel;
        this.currentLine.push(Math.max(0, Math.min(1, pix)));
        if (this.currentLine.length >= PIXELS_PER_LINE) {
          this.commitLine();
        }
      }
    }
  }

  private commitLine() {
    const line = this.currentLine;
    this.currentLine = [];
    // Look for the sync pattern in the line: alternating black/white at
    // 1040 Hz (= 2 pixels per cycle). The sync occupies 39 pixels in the
    // "sync A" region (first 39 pixels of each line).
    const bestOffset = this.findSync(line);
    if (bestOffset === null) {
      // Not locked — drop the line and wait for next sync
      return;
    }
    // Shift the line so sync starts at pixel 0
    const aligned = new Array(PIXELS_PER_LINE);
    for (let i = 0; i < PIXELS_PER_LINE; i++) {
      aligned[i] = line[(i + bestOffset) % PIXELS_PER_LINE];
    }
    // Write into the rolling buffer
    const buf = this.state.buffer!;
    const lineIdx = this.state.lineCount % (buf.length / PIXELS_PER_LINE);
    for (let i = 0; i < PIXELS_PER_LINE; i++) {
      buf[lineIdx * PIXELS_PER_LINE + i] = aligned[i];
    }
    this.state.lineCount++;
    this.state.totalPixels += PIXELS_PER_LINE;
    this.state.locked = true;
    this.state.lastSync = Date.now();
  }

  /**
   * Find the position of the sync-A pattern (7 black, 7 white, 7 black)
   * within the first 80 pixels of the line.
   */
  private findSync(line: number[]): number | null {
    if (line.length < 80) return null;
    let bestScore = 0;
    let bestIdx = -1;
    for (let offset = 0; offset < 80; offset++) {
      let score = 0;
      // Sync A: 7 pixels high, 7 low, 7 high, 7 low (28 pixels total)
      // Pattern approx: 7 dark + 7 bright + 7 dark + 7 bright ...
      for (let i = 0; i < 28; i++) {
        const phase = (Math.floor(i / 7)) % 2;
        const want = phase === 0 ? 0 : 1; // alternating
        const got = line[(offset + i) % line.length];
        if (want === 0) score += 1 - got; // want dark
        else score += got; // want bright
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = offset;
      }
    }
    // Sync should be a strong pattern — require at least 20/28 = 0.71
    if (bestScore >= 20) return bestIdx;
    return null;
  }

  reset() {
    this.currentLine = [];
    this.lineBuffer = [];
    this.pixelIdx = 0;
    this.sampleAccum = 0;
    this.dcAvg = 0;
    this.state = {
      lineCount: 0,
      totalPixels: 0,
      locked: false,
      lastSync: 0,
      buffer: null,
      width: PIXELS_PER_LINE,
    };
    this.initialized = false;
  }
}

export { PIXELS_PER_LINE };
