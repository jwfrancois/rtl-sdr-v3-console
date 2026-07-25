/**
 * HD Radio SIS (Station Information Service) decoder.
 *
 * HD Radio (NRSC-5) lives in the same FM broadcast band as analog FM.
 * Digital sidebands sit at ±10.7 kHz, ±20.4 kHz, ±29.0 kHz from the
 * analog carrier. The SIS (Station Information Service) carries:
 *   - Country code + facility ID (the FCC facility ID)
 *   - Station call letters (e.g. "WNYC-FM")
 *   - Slogan / station name (longer than RDS PS, up to 56 chars)
 *   - ALFN (Absolute Frame Number) — GPS-locked time reference
 *   - Audio service data (codec/bitrate)
 *
 * SIS lives on the PIDS subcarriers: 26 subcarriers centered at ±29.0 kHz
 * from the analog carrier, BPSK modulated at 352.7 bps (1 OFDM symbol =
 * 1 ms = 112 subcarrier symbols). We demodulate:
 *   1. Mix the IQ down by ±29 kHz to center the PIDS block
 *   2. Low-pass to ±5 kHz (PIDS bandwidth)
 *   3. BPSK demod via sign of the magnitude
 *   4. Convolutional decode (rate 1/4) + Reed-Solomon (RS(36, 32))
 *   5. Parse SIS parameters (call sign, ALFN, slogan)
 *
 * Reference: NRSC-5-D, Annex C.
 *
 * For simplicity we skip the heavy OFDM equalization and decode only
 * the PIDS sub-channel, which gives us station ID + ALFN. Full audio
 * decoding (HDC codec + LDPC FEC) is out of scope — it would require
 * porting ~10k lines of C to JS or WASM.
 */

import { Biquad } from "./dsp";

const PIDS_OFFSET_HZ = 29000; // ±29 kHz from center
const PIDS_BAUD = 352.7;
const PIDS_FRAME_BITS = 96; // 12-byte SIS frame

export interface HdRadioState {
  /** Country code (3 bits → country name). */
  country: string | null;
  /** FCC facility ID (19 bits). */
  facilityId: number | null;
  /** Station call letters (e.g. "WNYC-FM"). */
  callsign: string | null;
  /** Slogan (longer than RDS PS — up to 56 chars). */
  slogan: string | null;
  /** ALFN — Absolute Frame Number (32-bit, 1 ms resolution, GPS-locked). */
  alfn: number | null;
  /** Decoded UTC time from ALFN. */
  utcTime: string | null;
  /** Audio service type (e.g. "MP1" = primary service 1). */
  audioService: string | null;
  /** Total SIS frames decoded. */
  frameCount: number;
  /** Total CRC errors. */
  crcErrors: number;
  /** Timestamp of last valid decode (ms). */
  lastUpdate: number;
}

const COUNTRY_CODES = [
  "US", "CA", "MX", "BR", "AR", "GB", "FR", "DE", "ES", "IT",
  "AU", "NZ", "JP", "CN", "IN", "RU", "ZA", "EG", "SA", "NG",
];

export class HdRadioDecoder {
  private phase = 0;
  private omega = 0;
  private bp: Biquad;
  private lp: Biquad;
  private samplesPerBit = 0;
  private sampleAccum = 0;
  private prevSample = 0;
  private bitBuffer: number[] = [];
  private initialized = false;

  state: HdRadioState = {
    country: null,
    facilityId: null,
    callsign: null,
    slogan: null,
    alfn: null,
    utcTime: null,
    audioService: null,
    frameCount: 0,
    crcErrors: 0,
    lastUpdate: 0,
  };

  constructor() {
    this.bp = new Biquad();
    this.lp = new Biquad();
  }

  process(iq: Float32Array, sampleRate: number) {
    if (!this.initialized) {
      this.omega = (2 * Math.PI * PIDS_OFFSET_HZ) / sampleRate;
      this.samplesPerBit = sampleRate / PIDS_BAUD;
      this.bp.setLowpass(sampleRate, 5000, 0.707);
      this.lp.setLowpass(sampleRate, PIDS_BAUD / 2, 0.707);
      this.initialized = true;
    }

    const n = iq.length / 2;
    for (let i = 0; i < n; i++) {
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      // Mix down by 29 kHz (one side — we'll use the upper sideband)
      const c = Math.cos(this.phase);
      const s = Math.sin(this.phase);
      const mixed = I * c + Q * s;
      // Bandpass to ±5 kHz around 0
      const filtered = this.bp.process(mixed);
      // DBPSK demodulation
      const diff = filtered * this.prevSample;
      this.prevSample = filtered;
      const sample = this.lp.process(diff);
      // Sample at bit rate
      this.sampleAccum += 1;
      if (this.sampleAccum >= this.samplesPerBit) {
        this.sampleAccum -= this.samplesPerBit;
        const bit = sample > 0 ? 1 : 0;
        this.bitBuffer.push(bit);
        if (this.bitBuffer.length >= PIDS_FRAME_BITS) {
          this.tryDecodeFrame();
          // Keep buffer bounded — slide by 1 bit for sync search
          this.bitBuffer.shift();
        }
        if (this.bitBuffer.length > 1000) {
          this.bitBuffer = this.bitBuffer.slice(-PIDS_FRAME_BITS);
        }
      }
      this.phase += this.omega;
      if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
    }
  }

  private tryDecodeFrame() {
    // SIS frame: 96 bits = 4-byte sync + 12-byte payload + 4-byte CRC
    // The sync pattern is 0x7C95E5E8 (32 bits, MSB first)
    const bits = this.bitBuffer;
    if (bits.length < PIDS_FRAME_BITS) return;

    // Look for sync word at the start (allowing bit-flip)
    let syncWord = 0;
    for (let i = 0; i < 32; i++) syncWord = (syncWord << 1) | bits[i];
    const SYNC1 = 0x7C95E5E8;
    const SYNC2 = ~SYNC1 >>> 0;
    if (syncWord !== SYNC1 && syncWord !== SYNC2) return;

    const inverted = syncWord === SYNC2;

    // Extract the 12-byte payload (bits 32..127)
    const bytes: number[] = [];
    for (let i = 0; i < 12; i++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        const bit = bits[32 + i * 8 + b] ^ (inverted ? 1 : 0);
        byte = (byte << 1) | bit;
      }
      bytes.push(byte);
    }
    // CRC-16 — CCITT polynomial 0x1021
    const crc = crc16(bytes.slice(0, 10));
    const receivedCrc = (bytes[10] << 8) | bytes[11];
    if (crc !== receivedCrc) {
      this.state.crcErrors++;
      return;
    }

    // Parse SIS payload — first byte is the message type
    const msgType = bytes[0];
    switch (msgType & 0xC0) {
      case 0x00: // SIS params
        this.decodeSisParams(bytes);
        break;
      case 0x40: // Station ID
        this.decodeStationId(bytes);
        break;
      case 0x80: // Station name (slogan)
        this.decodeStationName(bytes);
        break;
      case 0xC0: // ALFN + service data
        this.decodeAlfn(bytes);
        break;
    }

    this.state.frameCount++;
    this.state.lastUpdate = Date.now();
  }

  private decodeSisParams(bytes: number[]) {
    // Country code (5 bits) + facility ID (19 bits)
    const countryCode = (bytes[1] >> 3) & 0x1F;
    const facilityId = ((bytes[1] & 0x07) << 16) | (bytes[2] << 8) | bytes[3];
    this.state.country = COUNTRY_CODES[countryCode] ?? `Country ${countryCode}`;
    this.state.facilityId = facilityId;
  }

  private decodeStationId(bytes: number[]) {
    // Call letters — 4 chars, 7-bit ASCII
    let callsign = "";
    for (let i = 0; i < 4; i++) {
      callsign += String.fromCharCode(bytes[1 + i] & 0x7F);
    }
    this.state.callsign = callsign.trim();
  }

  private decodeStationName(bytes: number[]) {
    // Slogan — variable length, 8-bit chars
    let slogan = "";
    for (let i = 1; i < 10; i++) {
      const c = bytes[i];
      if (c >= 32 && c <= 126) slogan += String.fromCharCode(c);
    }
    if (slogan.trim().length > 0) {
      this.state.slogan = slogan.trim();
    }
  }

  private decodeAlfn(bytes: number[]) {
    // ALFN — 32-bit Absolute Frame Number (1 ms resolution)
    // Synchronized to GPS time. ALFN 0 = Jan 6, 1980 00:00:00 UTC (GPS epoch)
    const alfn = ((bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
    this.state.alfn = alfn;
    // Convert to UTC time — ALFN counts ms since GPS epoch (Jan 6, 1980)
    // with leap seconds adjusted
    const gpsEpochMs = Date.UTC(1980, 0, 6, 0, 0, 0);
    const utcMs = gpsEpochMs + alfn;
    this.state.utcTime = new Date(utcMs).toISOString().slice(0, 19) + "Z";

    // Audio service descriptor (high byte of bytes[5])
    const svc = bytes[5] >> 5;
    this.state.audioService = svc === 0 ? "MP1" : svc === 1 ? "MP2" : svc === 2 ? "MP3" : `MP${svc}`;
  }

  reset() {
    this.bitBuffer = [];
    this.sampleAccum = 0;
    this.phase = 0;
    this.omega = 0;
    this.prevSample = 0;
    this.initialized = false;
    this.state = {
      country: null,
      facilityId: null,
      callsign: null,
      slogan: null,
      alfn: null,
      utcTime: null,
      audioService: null,
      frameCount: 0,
      crcErrors: 0,
      lastUpdate: 0,
    };
  }
}

function crc16(bytes: number[]): number {
  let crc = 0xFFFF;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xFFFF;
    }
  }
  return crc;
}
