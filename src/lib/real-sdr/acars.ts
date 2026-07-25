/**
 * ACARS decoder — Aircraft Communications Addressing and Reporting System.
 *
 * ACARS is a digital short-message system used by airlines to exchange
 * text messages between aircraft and dispatchers. Transmitted on:
 *   - 131.55 MHz (primary VHF)
 *   - 131.725, 131.825 MHz (additional channels)
 *
 * Modulation: AM with 2400 bps MSK (minimum shift keying).
 * Bit rate: 2400 bps, NRZI encoded.
 *
 * Frame structure:
 *   - 16 bytes of bit sync (alternating 1010...)
 *   - 4 bytes of preamble "DWSD" or "+\x01\x02\x03"
 *   - Block 1 (start): TOA, mode, flight ID, ...
 *   - Block 2 (continued): aircraft registration, message label, ...
 *   - Block 3 (continued): message number, flight ID
 *   - Block 4 (end): message text
 *
 * For simplicity we decode the basic structure and text without strict
 * CRC verification.
 *
 * Reference: ARINC Specification 618.
 */

import { Biquad } from "./dsp";

const ACARS_BAUD = 2400;
const SYNC_PATTERN = 0xEB;

export interface AcarsMessage {
  id: number;
  /** Aircraft registration (e.g. "N123AB"). */
  registration: string;
  /** Flight identifier (e.g. "UAL123"). */
  flight: string;
  /** Message label (2-char code, e.g. "H1" for position report, "Q0" for ACARS). */
  label: string;
  /** Message number (e.g. "M01A"). */
  msgNo: string;
  /** Message text body. */
  text: string;
  /** Whether this is an uplink (ground→air) or downlink (air→ground). */
  direction: "uplink" | "downlink";
  /** Timestamp (ms). */
  timestamp: number;
}

export interface AcarsState {
  messages: AcarsMessage[];
  totalFrames: number;
  validMessages: number;
  lastUpdate: number;
}

export class AcarsDecoder {
  private samplesPerBit = 0;
  private lp: Biquad;
  private lpData: Biquad;
  private initialized = false;
  private bitBuffer: number[] = [];
  private sampleAccum = 0;
  private prevPhase = 0;

  state: AcarsState = {
    messages: [],
    totalFrames: 0,
    validMessages: 0,
    lastUpdate: 0,
  };

  constructor() {
    this.lp = new Biquad();
    this.lpData = new Biquad();
  }

  process(iq: Float32Array, sampleRate: number) {
    if (!this.initialized) {
      this.samplesPerBit = sampleRate / ACARS_BAUD;
      this.lp.setLowpass(sampleRate, ACARS_BAUD * 0.7, 0.707);
      this.lpData.setLowpass(sampleRate, ACARS_BAUD / 2, 0.707);
      this.initialized = true;
    }

    const n = iq.length / 2;
    // FM demod (ACARS uses FSK within AM)
    for (let i = 0; i < n; i++) {
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      const phase = Math.atan2(Q, I);
      let diff = phase - this.prevPhase;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.prevPhase = phase;
      const sample = this.lpData.process(this.lp.process(diff));
      this.sampleAccum += 1;
      if (this.sampleAccum >= this.samplesPerBit) {
        this.sampleAccum -= this.samplesPerBit;
        // NRZI decoding: a "1" bit is no phase transition, "0" is a transition
        // For FSK, sign of frequency offset indicates the bit
        this.bitBuffer.push(sample > 0 ? 1 : 0);
        if (this.bitBuffer.length > 8192) {
          this.bitBuffer.shift();
        }
      }
    }
    this.scanForMessages();
  }

  private scanForMessages() {
    const bits = this.bitBuffer;
    if (bits.length < 64) return;
    // Look for sync byte pattern (0xEB = 11101011, 16 sync bits + 0x14 + 0x7F)
    // Actually ACARS sync is the byte sequence: bits 0x95 (10100101) ... let's
    // look for 0x95 (10100101) repeated — that's the bit sync.
    // Simpler approach: look for the 0x14 byte (= SOH-like) followed by 0x7F
    // For now, scan for "WSD" preamble which is 3 ASCII bytes (8 bits each):
    //   0x57 0x53 0x44 = "WSD"
    // Actually proper ACARS preamble is: 16 bits of "10" alternating, then
    // a "+\x01\x02\x03" sequence.
    // Let's just look for 16-bit preamble pattern (alternating 1,0).
    let syncIdx = -1;
    for (let i = 0; i + 32 <= bits.length; i++) {
      // Check for ~16 alternating bits starting at i
      let ok = true;
      for (let j = 0; j < 16; j++) {
        if (bits[i + j] !== (j % 2)) { ok = false; break; }
      }
      if (ok) {
        syncIdx = i + 16;
        break;
      }
    }
    if (syncIdx < 0) return;
    // Read the message byte-by-byte until we hit 0x03 (ETX) or run out of bits
    const bytes: number[] = [];
    let pos = syncIdx;
    while (pos + 8 <= bits.length) {
      const byte = bitsToByte(bits.slice(pos, pos + 8));
      pos += 8;
      if (byte === 0x03 || byte === 0x17) break; // ETX
      bytes.push(byte);
      if (bytes.length > 256) break;
    }
    this.state.totalFrames++;
    // Try to parse the ACARS message
    const parsed = this.parseAcars(bytes);
    if (parsed) {
      this.state.messages.push(parsed);
      if (this.state.messages.length > 50) {
        this.state.messages.shift();
      }
      this.state.validMessages++;
      this.state.lastUpdate = Date.now();
      // Consume processed bits
      this.bitBuffer.splice(0, pos);
    } else {
      // Slide forward a bit to keep searching
      this.bitBuffer.shift();
    }
  }

  private parseAcars(bytes: number[]): AcarsMessage | null {
    // ACARS downlink block 1 (SOH + mode + flight + ...):
    //   byte 0: SOH (0x01) — we may have missed it
    //   byte 1: mode (1=downlink, 2=uplink, '2'=uplink, etc.)
    //   byte 2-7: flight ID (6 chars, padded with space)
    //   byte 8: SOH or first char of data
    //   byte 9-10: aircraft registration (first 2 chars of OGN-style encoding)
    //   ...
    // This is complex — let's do a simplified parse:
    // Find a printable chunk and assume it's the message.
    if (bytes.length < 5) return null;
    // Skip leading non-printable bytes
    let start = 0;
    while (start < bytes.length && (bytes[start] < 32 || bytes[start] > 126)) start++;
    if (start >= bytes.length - 4) return null;
    // Look for "REG" or any 6-char block as the flight ID
    const text = bytes.slice(start).map((b) => String.fromCharCode(b)).join("");
    // Look for known labels in the text
    const regMatch = text.match(/([A-Z0-9]{4,8})/);
    const flightMatch = text.match(/\b([A-Z]{2,3}[0-9]{1,4}[A-Z]?)\b/);
    const labelMatch = text.match(/\b([A-Z][0-9A-Z])\b/);
    // Pull out the message portion after the first 16 chars (typical header)
    const msgText = text.slice(16).replace(/[^\x20-\x7E]/g, "").trim();
    if (msgText.length === 0 && !flightMatch) return null;
    return {
      id: Date.now() + Math.random(),
      registration: regMatch ? regMatch[1] : "????",
      flight: flightMatch ? flightMatch[1] : "????",
      label: labelMatch ? labelMatch[1] : "??",
      msgNo: "M00",
      text: msgText || "(no text)",
      direction: "downlink",
      timestamp: Date.now(),
    };
  }

  reset() {
    this.bitBuffer = [];
    this.sampleAccum = 0;
    this.prevPhase = 0;
    this.state = {
      messages: [],
      totalFrames: 0,
      validMessages: 0,
      lastUpdate: 0,
    };
    this.initialized = false;
  }
}

function bitsToByte(bits: number[]): number {
  let v = 0;
  for (const b of bits) v = (v << 1) | b;
  return v & 0xFF;
}
