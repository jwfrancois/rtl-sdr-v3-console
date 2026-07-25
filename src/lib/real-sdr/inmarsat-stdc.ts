/**
 * Inmarsat STD-C decoder.
 *
 * Inmarsat C is a store-and-forward messaging service used by:
 *   - Maritime: GMDSS safety alerts, ship-to-shore email
 *   - Land: remote asset tracking (oil pipelines, containers)
 *   - Aviation: ACARS over satellite (often paired with classic ACARS)
 *
 * Satellites are at L-band (1537.5–1545 MHz), geostationary at:
 *   - I-3 AOR-E (15.5°W) 1543.5 MHz
 *   - I-3 AOR-W (54°W) 1543.5 MHz
 *   - I-3 IOR (64°E) 1537.5 MHz
 *   - I-3 POR (178°E) 1537.5 MHz
 *
 * Modulation:
 *   - BPSK at 1200 bps
 *   - TDM channel (NCS → all stations) is always on
 *   - Subcarrier at 1500 Hz offset (after L-band down-conversion)
 *   - convolutional code rate 1/2, K=7
 *
 * Frame structure (TDM):
 *   - 8.64 second frame
 *   - 10368 bits/frame
 *   - 12 channels × 864 bits per channel
 *   - Bulletin board on channel 1
 *
 * We decode:
 *   1. BPSK demodulation at 1200 bps
 *   2. Differential decoding
 *   3. Frame sync detection
 *   4. Bulletin board messages: NCS ID, channel assignments
 *   5. LES (Land Earth Station) messages: station IDs
 *
 * Reference: Inmarsat-C System Definition Manual.
 */

import { Biquad } from "./dsp";

const STDC_BAUD = 1200;
const FRAME_SYNC = 0x7E; // HDLC-like flag byte

export interface StdcState {
  /** Total frames decoded. */
  frameCount: number;
  /** Sync lock state. */
  locked: boolean;
  /** Network Coordination Station ID. */
  ncsId: string | null;
  /** Active Land Earth Stations (LES). */
  lesIds: string[];
  /** Decoded messages. */
  messages: Array<{
    id: number;
    from: string;
    to: string | null;
    text: string;
    timestamp: number;
  }>;
  /** Bit error rate estimate. */
  ber: number;
  /** Last update (ms). */
  lastUpdate: number;
}

export class InmarsatStdcDecoder {
  private lp: Biquad;
  private lpData: Biquad;
  private samplesPerBit = 0;
  private sampleAccum = 0;
  private prevSample = 0;
  private bitBuffer: number[] = [];
  private byteBuffer: number[] = [];
  private initialized = false;

  state: StdcState = {
    frameCount: 0,
    locked: false,
    ncsId: null,
    lesIds: [],
    messages: [],
    ber: 0,
    lastUpdate: 0,
  };

  constructor() {
    this.lp = new Biquad();
    this.lpData = new Biquad();
  }

  process(iq: Float32Array, sampleRate: number) {
    if (!this.initialized) {
      this.samplesPerBit = sampleRate / STDC_BAUD;
      this.lp.setLowpass(sampleRate, STDC_BAUD * 0.7, 0.707);
      this.lpData.setLowpass(sampleRate, STDC_BAUD / 2, 0.707);
      this.initialized = true;
    }

    const n = iq.length / 2;
    for (let i = 0; i < n; i++) {
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      const mag = Math.sqrt(I * I + Q * Q);
      const filtered = this.lpData.process(this.lp.process(mag));
      // DBPSK demod
      const sample = filtered * this.prevSample;
      this.prevSample = filtered;
      const lpSample = this.lpData.process(sample);

      this.sampleAccum += 1;
      if (this.sampleAccum >= this.samplesPerBit) {
        this.sampleAccum -= this.samplesPerBit;
        const bit = lpSample > 0 ? 0 : 1;
        this.bitBuffer.push(bit);
        // Try to assemble bytes — HDLC-style bit stuffing
        // Look for the 0x7E flag = 01111110 (6 ones in a row, no stuffing)
        if (this.bitBuffer.length >= 8) {
          this.tryExtractByte();
        }
        if (this.bitBuffer.length > 1024) {
          this.bitBuffer.shift();
        }
      }
    }
  }

  private tryExtractByte() {
    // Look for 8 consecutive bits with the right pattern
    const bits = this.bitBuffer;
    // HDLC flag: 01111110 — find one if present
    let flagIdx = -1;
    for (let i = 0; i + 8 <= bits.length; i++) {
      const b = bits.slice(i, i + 8);
      if (b[0] === 0 && b[1] === 1 && b[2] === 1 && b[3] === 1 &&
          b[4] === 1 && b[5] === 1 && b[6] === 1 && b[7] === 0) {
        flagIdx = i;
        break;
      }
    }
    if (flagIdx < 0) return;
    this.state.locked = true;
    // Consume up to the flag
    bits.splice(0, flagIdx);
    // Now extract bytes until next flag (with bit stuffing — skip a 0 after 5 ones)
    let i = 8;
    let byte = 0;
    let bitCount = 0;
    let consecutiveOnes = 0;
    let bytes: number[] = [];
    while (i + 8 < bits.length) {
      const bit = bits[i];
      if (bit === 1) {
        consecutiveOnes++;
        if (consecutiveOnes === 5) {
          // Skip the stuffed 0 (next bit should be 0)
          i++; // skip the 0
          consecutiveOnes = 0;
        }
        byte = (byte << 1) | 1;
      } else {
        consecutiveOnes = 0;
        byte = byte << 1;
      }
      bitCount++;
      if (bitCount === 8) {
        bytes.push(byte);
        byte = 0;
        bitCount = 0;
        // Check for end-of-frame flag
        if (bytes.length > 0 && bytes[bytes.length - 1] === FRAME_SYNC) {
          // End of frame — process it
          this.processFrame(bytes.slice(0, -1));
          // Clear the bit buffer up to here
          bits.splice(0, i + 8);
          return;
        }
        if (bytes.length > 256) break; // Frame too long
      }
      i++;
    }
  }

  private processFrame(bytes: number[]) {
    if (bytes.length < 4) return;
    this.state.frameCount++;

    // First byte is usually the address (NCS or LES ID)
    const address = bytes[0];
    if (address >= 0x00 && address <= 0x7F) {
      // NCS bulletin board message
      const ncsId = address.toString(16).toUpperCase().padStart(2, "0");
      this.state.ncsId = `NCS-${ncsId}`;
      // Bulletin board has channel assignments
      this.parseBulletinBoard(bytes.slice(1));
    } else {
      // LES message — try to extract text
      const lesId = address.toString(16).toUpperCase().padStart(2, "0");
      if (!this.state.lesIds.includes(lesId)) {
        this.state.lesIds.push(lesId);
        if (this.state.lesIds.length > 10) this.state.lesIds.shift();
      }
      // Try to decode ASCII text
      const text = bytes.slice(1, -2).map((b) => {
        if (b >= 32 && b <= 126) return String.fromCharCode(b);
        return ".";
      }).join("");
      if (text.trim().length > 0) {
        this.state.messages.unshift({
          id: Date.now() + Math.random(),
          from: `LES-${lesId}`,
          to: null,
          text: text,
          timestamp: Date.now(),
        });
        if (this.state.messages.length > 50) this.state.messages.pop();
      }
    }
    this.state.lastUpdate = Date.now();
  }

  private parseBulletinBoard(bytes: number[]) {
    // Bulletin board contains active LES IDs (2 bytes each)
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const lesId = ((bytes[i] << 8) | bytes[i + 1]).toString(16).toUpperCase().padStart(4, "0");
      if (lesId !== "0000" && !this.state.lesIds.includes(lesId)) {
        this.state.lesIds.push(lesId);
        if (this.state.lesIds.length > 10) this.state.lesIds.shift();
      }
    }
  }

  reset() {
    this.bitBuffer = [];
    this.byteBuffer = [];
    this.sampleAccum = 0;
    this.prevSample = 0;
    this.initialized = false;
    this.state = {
      frameCount: 0,
      locked: false,
      ncsId: null,
      lesIds: [],
      messages: [],
      ber: 0,
      lastUpdate: 0,
    };
  }
}
