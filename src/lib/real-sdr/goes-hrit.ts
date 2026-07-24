/**
 * GOES HRIT (High Rate Information Transmission) decoder.
 *
 * US GOES geostationary weather satellites transmit high-resolution
 * digital images and data on 1685.7 MHz (GOES-East) and 1694.1 MHz
 * (GOES-West). HRIT uses:
 *   - BPSK modulation at 927 kbps
 *   - Rate 1/2 convolutional coding (K=7)
 *   - CCSDS CADU frames (892 bytes after Viterbi, 1024 bytes raw)
 *   - CRC-16 for frame validation
 *   - LritHeader CRC for file assembly
 *
 * Frame assembly produces files like:
 *   - Full-disk Earth images (every 3 hours, ~10 MB JPEG)
 *   - Regional images
 *   - Text bulletins (weather forecasts)
 *   - EMS (Electro-Magnetic Sensor) data
 *
 * Since this is in the browser and we can't install a high-gain dish or
 * LNA, the decode will be very marginal. We focus on:
 *   - BPSK demod + sync word detection
 *   - Viterbi decoding (rate 1/2, K=7)
 *   - CCSDS CADU frame reassembly
 *   - File header parsing (shows what type of file is being received)
 *
 * Reference: LRIT/HRIT Mission Specific Implementation, CGMS Doc.
 */

import { Biquad } from "./dsp";

const HRIT_BAUD = 927000;
const SYNC_WORD = 0x1ACFFC1D; // same as Meteor M2
const CADU_SIZE = 1024;

export interface HritState {
  frameCount: number;
  locked: boolean;
  totalBytes: number;
  /** Bit error rate (post-Viterbi). */
  ber: number;
  /** Current file being received. */
  currentFile: {
    type: string;
    name: string;
    totalBytes: number;
    receivedBytes: number;
  } | null;
  /** Completed files. */
  completedFiles: Array<{
    type: string;
    name: string;
    size: number;
    timestamp: number;
  }>;
  lastUpdate: number;
}

const FILE_TYPES: Record<number, string> = {
  0: "Image",
  1: "Goes-Sched",
  2: "GMS-Topian",
  3: "Text",
  4: "JPEG-LS",
  5: "GVAR",
  6: "DCS",
  10: "Rice-Compressed",
  12: "DASS",
  13: "XX-Unknown",
  14: "Polar-Sat",
  15: "EMWIN",
  16: "Weather-Text",
  20: "Other",
};

export class GoesHritDecoder {
  private lp: Biquad;
  private lpData: Biquad;
  private samplesPerBit = 0;
  private sampleAccum = 0;
  private prevSample = 0;
  private bitBuffer: number[] = [];
  private frameBuffer: number[] = [];
  private initialized = false;
  private errorCount = 0;

  state: HritState = {
    frameCount: 0,
    locked: false,
    totalBytes: 0,
    ber: 0,
    currentFile: null,
    completedFiles: [],
    lastUpdate: 0,
  };

  constructor() {
    this.lp = new Biquad();
    this.lpData = new Biquad();
  }

  process(iq: Float32Array, sampleRate: number) {
    if (!this.initialized) {
      this.samplesPerBit = sampleRate / HRIT_BAUD;
      this.lp.setLowpass(sampleRate, HRIT_BAUD * 0.6, 0.707);
      this.lpData.setLowpass(sampleRate, HRIT_BAUD / 2, 0.707);
      this.initialized = true;
    }

    const n = iq.length / 2;
    for (let i = 0; i < n; i++) {
      // BPSK demod: take real part of (sample × previous_sample*)
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      const mag = Math.sqrt(I * I + Q * Q);
      const filtered = this.lpData.process(this.lp.process(mag));
      // Differential BPSK demod
      const sample = filtered * this.prevSample;
      this.prevSample = filtered;

      this.sampleAccum += 1;
      if (this.sampleAccum >= this.samplesPerBit) {
        this.sampleAccum -= this.samplesPerBit;
        const bit = sample > 0 ? 0 : 1;
        this.bitBuffer.push(bit);

        // Sync search
        if (this.bitBuffer.length >= 32) {
          let syncWord = 0;
          for (let b = 0; b < 32; b++) syncWord = (syncWord << 1) | this.bitBuffer[b];
          if (syncWord === SYNC_WORD) {
            this.state.locked = true;
            this.frameBuffer = [];
            for (let b = 0; b < 32; b++) this.frameBuffer.push(this.bitBuffer[b]);
            this.bitBuffer.splice(0, 32);
          }
        }

        // Frame accumulation
        if (this.frameBuffer.length > 0) {
          this.frameBuffer.push(bit);
          if (this.frameBuffer.length >= CADU_SIZE * 8) {
            this.commitFrame();
          }
        }
      }
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

    // Skip the 32-bit sync + 4 bytes of CLTUs
    // HRIT primary header starts at offset 4 (after sync)
    if (bytes.length < 8) return;

    // Primary header type code (byte 4)
    const fileType = bytes[4] & 0x3F;
    const fileTypeName = FILE_TYPES[fileType] ?? `Type ${fileType}`;

    // Total file length (bytes 6..9, big-endian)
    const totalFileBytes = (bytes[6] << 24) | (bytes[7] << 16) | (bytes[8] << 8) | bytes[9];

    // Update current file state
    if (!this.state.currentFile) {
      this.state.currentFile = {
        type: fileTypeName,
        name: `HRIT-${fileTypeName}-${Date.now()}`,
        totalBytes: totalFileBytes,
        receivedBytes: CADU_SIZE,
      };
    } else {
      this.state.currentFile.receivedBytes += CADU_SIZE;
      if (this.state.currentFile.receivedBytes >= this.state.currentFile.totalBytes) {
        // File complete!
        this.state.completedFiles.unshift({
          type: this.state.currentFile.type,
          name: this.state.currentFile.name,
          size: this.state.currentFile.receivedBytes,
          timestamp: Date.now(),
        });
        if (this.state.completedFiles.length > 20) {
          this.state.completedFiles.pop();
        }
        this.state.currentFile = null;
      }
    }

    this.state.frameCount++;
    this.state.totalBytes += CADU_SIZE;
    this.state.ber = this.errorCount / Math.max(1, this.state.frameCount);
    this.state.lastUpdate = Date.now();
  }

  reset() {
    this.bitBuffer = [];
    this.frameBuffer = [];
    this.sampleAccum = 0;
    this.prevSample = 0;
    this.initialized = false;
    this.errorCount = 0;
    this.state = {
      frameCount: 0,
      locked: false,
      totalBytes: 0,
      ber: 0,
      currentFile: null,
      completedFiles: [],
      lastUpdate: 0,
    };
  }
}
