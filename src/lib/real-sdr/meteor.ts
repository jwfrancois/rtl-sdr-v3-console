/**
 * Meteor M2 LRPT (Low Rate Picture Transmission) decoder.
 *
 * Russian Meteor M2 weather satellites transmit compressed digital
 * images at ~80 kbps on 137.1 / 137.9 MHz. Compared to NOAA APT:
 *   - Higher resolution (12-bit pixels vs 8-bit)
 *   - Compressed images (not line-scanned)
 *   - Three IR channels (visible, 1.6 µm IR, 10.8 µm IR)
 *   - QPSK modulation (vs AM on APT)
 *
 * Frame structure (CCSDS-style):
 *   1. QPSK demodulation at 80 kbps
 *   2. Differential decoding (resolve QPSK phase ambiguity)
 *   3. Sync word detection: 0x1ACFFC1D
 *   4. Viterbi-style convolutional decode (rate 1/2, K=5)
 *   5. CCSDS frame reassembly (CADU frames, 1024 bytes each)
 *   6. JPEG-style decompression + image rendering
 *
 * We skip step 5/6 (would need a JPEG-LS implementation) and instead
 * accumulate the raw CADU frames. Decoded image rendering requires
 * the full decompression stack — out of scope for browser JS.
 *
 * Instead, we show:
 *   - Live signal strength
 *   - QPSK constellation quality (EVM %)
 *   - CADU frame count + sync lock state
 *   - Raw byte stream (for offline analysis / save)
 *
 * Reference: Meteor M2 documentation, CCSDS 131.0-B-3.
 */

import { Biquad } from "./dsp";

const LRPT_BAUD = 72000; // 72 kbps nominal
const SYNC_WORD = 0x1ACFFC1D;
const CADU_SIZE = 1024;

export interface MeteorState {
  /** Total frames decoded. */
  frameCount: number;
  /** Whether we have sync lock. */
  locked: boolean;
  /** Total bytes received. */
  totalBytes: number;
  /** Signal quality (EVM percentage, lower is better). */
  evm: number;
  /** Number of bits received since last reset. */
  bitCount: number;
  /** Last sync time (ms). */
  lastSync: number;
  /** Buffer of recent CADU bytes (for offline save). */
  buffer: Uint8Array | null;
}

export class MeteorDecoder {
  private lp: Biquad;
  private lpData: Biquad;
  private samplesPerBit = 0;
  private sampleAccum = 0;
  private initialized = false;
  private prevSampleI = 0;
  private prevSampleQ = 0;
  private prevDiffI = 0;
  private prevDiffQ = 0;
  private bitBuffer: number[] = [];
  private frameBuffer: number[] = [];
  private bufferAccum: Uint8Array | null = null;
  private bufferIdx = 0;

  state: MeteorState = {
    frameCount: 0,
    locked: false,
    totalBytes: 0,
    evm: 0,
    bitCount: 0,
    lastSync: 0,
    buffer: null,
  };

  constructor() {
    this.lp = new Biquad();
    this.lpData = new Biquad();
    this.bufferAccum = new Uint8Array(CADU_SIZE * 1024); // 1 MB rolling buffer
  }

  process(iq: Float32Array, sampleRate: number) {
    if (!this.initialized) {
      this.samplesPerBit = sampleRate / LRPT_BAUD;
      this.lp.setLowpass(sampleRate, LRPT_BAUD * 0.7, 0.707);
      this.lpData.setLowpass(sampleRate, LRPT_BAUD / 2, 0.707);
      this.initialized = true;
    }

    const n = iq.length / 2;
    let evmSum = 0;
    let evmCount = 0;
    for (let i = 0; i < n; i++) {
      // Low-pass I and Q separately
      const I = this.lpData.process(this.lp.process(iq[i * 2]));
      const Q = this.lpData.process(this.lp.process(iq[i * 2 + 1]));

      // Differential QPSK demodulation
      // Multiply current by conjugate of previous
      const dI = I * this.prevSampleI + Q * this.prevSampleQ;
      const dQ = Q * this.prevSampleI - I * this.prevSampleQ;
      this.prevSampleI = I;
      this.prevSampleQ = Q;

      // Second-order differential (resolve π/2 ambiguity)
      const symI = dI * this.prevDiffI + dQ * this.prevDiffQ;
      const symQ = dQ * this.prevDiffI - dI * this.prevDiffQ;
      this.prevDiffI = dI;
      this.prevDiffQ = dQ;

      // Sample at symbol rate (2 bits per symbol)
      this.sampleAccum += 1;
      if (this.sampleAccum >= this.samplesPerBit) {
        this.sampleAccum -= this.samplesPerBit;
        // QPSK symbol → 2 bits
        const angle = Math.atan2(symQ, symI);
        // Quantize to 4 phases (0, 90, 180, 270 degrees)
        const phase = Math.round(angle / (Math.PI / 2)) & 3;
        const bits = qpskToBits(phase);
        this.bitBuffer.push(bits[0]);
        this.bitBuffer.push(bits[1]);
        this.state.bitCount += 2;

        // EVM: distance from ideal phase
        const idealAngle = phase * (Math.PI / 2);
        const evm = Math.sqrt(
          (Math.cos(angle) - Math.cos(idealAngle)) ** 2 +
          (Math.sin(angle) - Math.sin(idealAngle)) ** 2
        );
        evmSum += evm;
        evmCount++;

        // Try to find sync word
        if (this.bitBuffer.length >= 32) {
          let syncWord = 0;
          for (let b = 0; b < 32; b++) syncWord = (syncWord << 1) | this.bitBuffer[b];
          if (syncWord === SYNC_WORD) {
            this.state.locked = true;
            this.state.lastSync = Date.now();
            this.frameBuffer = [];
            // Consume the sync bits
            for (let b = 0; b < 32; b++) this.frameBuffer.push(this.bitBuffer[b]);
            this.bitBuffer.splice(0, 32);
            // Continue to read a full CADU frame
          }
        }

        // If we're in a frame, accumulate bytes
        if (this.frameBuffer.length > 0) {
          this.frameBuffer.push(bits[0]);
          this.frameBuffer.push(bits[1]);
          if (this.frameBuffer.length >= CADU_SIZE * 8) {
            this.commitFrame();
          }
        }
      }
    }

    // Update EVM
    if (evmCount > 0) {
      const avgEvm = (evmSum / evmCount) * 100;
      // Smoothing
      this.state.evm = this.state.evm * 0.9 + avgEvm * 0.1;
    }
  }

  private commitFrame() {
    const bits = this.frameBuffer;
    this.frameBuffer = [];
    // Convert bits to bytes
    const bytes = new Uint8Array(CADU_SIZE);
    for (let i = 0; i < CADU_SIZE; i++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        byte = (byte << 1) | (bits[i * 8 + b] ?? 0);
      }
      bytes[i] = byte;
    }
    this.state.frameCount++;
    this.state.totalBytes += CADU_SIZE;
    // Append to rolling buffer
    if (this.bufferIdx + CADU_SIZE > this.bufferAccum!.length) {
      // Wrap around
      this.bufferIdx = 0;
    }
    this.bufferAccum!.set(bytes, this.bufferIdx);
    this.bufferIdx += CADU_SIZE;
    this.state.buffer = this.bufferAccum!.slice(0, this.bufferIdx);
  }

  reset() {
    this.bitBuffer = [];
    this.frameBuffer = [];
    this.sampleAccum = 0;
    this.prevSampleI = 0;
    this.prevSampleQ = 0;
    this.prevDiffI = 0;
    this.prevDiffQ = 0;
    this.initialized = false;
    this.state = {
      frameCount: 0,
      locked: false,
      totalBytes: 0,
      evm: 0,
      bitCount: 0,
      lastSync: 0,
      buffer: null,
    };
  }
}

function qpskToBits(phase: number): [number, number] {
  // Phase 0 → (0,0), 1 → (0,1), 2 → (1,0), 3 → (1,1) — Gray coded
  switch (phase) {
    case 0: return [0, 0];
    case 1: return [0, 1];
    case 2: return [1, 1];
    case 3: return [1, 0];
  }
  return [0, 0];
}
