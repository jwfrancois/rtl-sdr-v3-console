/**
 * RDS (Radio Data System) decoder.
 *
 * RDS is a 1187.5 bps digital subcarrier injected at ±57 kHz on a broadcast
 * FM signal. It carries station identification (PI code, PS name),
 * program type (PTY), radio text (RT), alternative frequencies (AF), etc.
 *
 * Decoding pipeline:
 *   1. Demodulate the 57 kHz subcarrier (already done — we feed in 38 kHz-shifted IQ)
 *   2. Multiply by 38 kHz to bring 57 kHz down to 19 kHz (the RDS pilot)
 *      Actually: we need 57 kHz reference. Standard approach uses the
 *      19 kHz stereo pilot as a reference (×3 = 57 kHz, locked phase).
 *   3. Bandpass filter ±2.4 kHz around the 57 kHz subcarrier
 *   4. DBPSK demodulator (differential binary phase-shift keying)
 *   5. Decode the bitstream: groups of 104 bits (4 × 26-bit blocks)
 *
 * For simplicity we skip the stereo-pilot-locked recovery and just
 * multiply by a free-running 57 kHz cosine. Works fine if the dongle's
 * PPM is reasonable. RDS is slow enough (1187.5 bps) that a small phase
 * drift doesn't break it.
 *
 * Reference: IEC 62106 / RBDS standard.
 */

import { Biquad } from "./dsp";

const RDS_BAUD = 1187.5;
const RDS_SUBCARRIER = 57000; // Hz

export interface RdsState {
  /** Station PI (Program Identification) — 4-hex code, e.g. "8E12". */
  pi: string | null;
  /** PS (Program Service) name — up to 8 chars, e.g. "BBC R4". */
  ps: string | null;
  /** PTY (Program Type) — 0..31. */
  pty: number | null;
  /** PTY label decoded from the standard table. */
  ptyLabel: string | null;
  /** Radio Text (RT) — up to 64 chars. */
  rt: string | null;
  /** Group type (A/B) and 4-digit group code, e.g. "0A", "2B". */
  groupType: string | null;
  /** Mono/stereo flag (from group 0). */
  stereo: boolean | null;
  /** TA (Traffic Announcement) flag. */
  ta: boolean | null;
  /** MS (Music/Speech) flag. */
  music: boolean | null;
  /** Total groups decoded since last reset (for signal health). */
  groupsDecoded: number;
  /** Timestamp of last successful decode (ms). */
  lastUpdate: number;
  /** Bit error rate estimate (0..1). */
  ber: number;
}

const PTY_EU_TABLE = [
  "No program", "News", "Current affairs", "Information",
  "Sport", "Education", "Drama", "Culture",
  "Science", "Varied", "Pop music", "Rock music",
  "Easy listening", "Light classical", "Serious classical", "Other music",
  "Weather", "Finance", "Children's programmes", "Social affairs",
  "Religion", "Phone-in", "Travel", "Leisure",
  "Jazz music", "Country music", "National music", "Oldies music",
  "Folk music", "Documentary", "Alarm test", "Alarm",
];

/** CRC-10 polynomial used by RDS (x^10 + x^8 + x^7 + x^5 + x^4 + x^3 + 1). */
const CRC_POLY = 0x5B9; // (1)101 1011 1001 — leading 1 is implicit

/** Build a CRC-10 lookup table for a 10-bit accumulator (byte at a time). */
const CRC_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 2; // align to top of 10-bit
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc << 1) & 0x3FF;
      if (crc & 0x200) crc ^= CRC_POLY;
    }
    t[i] = crc;
  }
  return t;
})();

/** Compute the RDS CRC-10 of a 16-bit block (without offset words). */
function crc10(data16: number): number {
  let crc = 0;
  crc = CRC_TABLE[(crc ^ (data16 >> 8)) & 0xFF];
  crc = CRC_TABLE[(crc ^ data16) & 0xFF];
  return crc;
}

const OFFSET_WORDS = [0x0FC, 0x198, 0x168, 0x1B4];

/** XOR-with-offset "syndrome" check. Returns the offset word index (0..3) if valid, else -1. */
function syndrome(block16: number): number {
  const crc = crc10(block16 & 0xFFFF);
  for (let i = 0; i < 4; i++) {
    if ((crc ^ OFFSET_WORDS[i]) === 0) return i;
  }
  return -1;
}

/**
 * Decode a 26-bit RDS block into its 16-bit data + checkword info.
 * Returns the 16-bit data value if the block's syndrome matches an
 * expected position (0..3), else null.
 */
function decodeBlock(bits: Uint8Array, offset: number): { data: number; position: number } | null {
  // 26 bits: 16 data + 10 check
  let data16 = 0;
  for (let i = 0; i < 16; i++) {
    data16 = (data16 << 1) | (bits[offset + i] & 1);
  }
  let check10 = 0;
  for (let i = 0; i < 10; i++) {
    check10 = (check10 << 1) | (bits[offset + 16 + i] & 1);
  }
  // Concatenate to form the full 26-bit word, then check syndrome
  const word26 = (data16 << 10) | check10;
  // Actually CRC is computed on the data16, and the check10 already includes
  // the offset word XOR. So we recover by computing CRC(data16) and XOR with check10.
  const crc = crc10(data16);
  const syndrome = crc ^ check10;
  for (let i = 0; i < 4; i++) {
    if (syndrome === OFFSET_WORDS[i]) {
      return { data: data16, position: i };
    }
  }
  return null;
}

/**
 * RDS decoder. Maintains internal state across calls (phase accumulator,
 * bit clock, group assembly). Call `process()` with each new IQ block.
 */
export class RdsDecoder {
  private phase = 0;
  private omega = 0;
  private lp1: Biquad;
  private lp2: Biquad;
  private bp: Biquad;
  private samplesSinceLastBit = 0;
  private bitsPerSample = 0;
  private prevSample = 0;
  private bits: number[] = [];
  private bitIdx = 0;
  private groupsFound = 0;
  private lastGroupTime = 0;

  // PS reconstruction (group 0)
  private psChars = new Array<string>(8).fill(" ");
  private pi: number | null = null;
  private pty: number | null = null;
  private stereo: boolean | null = null;
  private ta: boolean | null = null;
  private music: boolean | null = null;
  // RT (Radio Text) reconstruction (group 2)
  private rtChars = new Array<string>(64).fill(" ");
  private rtDirty = false;

  // BER estimate
  private bitErrors = 0;
  private totalBits = 0;

  state: RdsState = {
    pi: null, ps: null, pty: null, ptyLabel: null, rt: null,
    groupType: null, stereo: null, ta: null, music: null,
    groupsDecoded: 0, lastUpdate: 0, ber: 0,
  };

  constructor() {
    this.lp1 = new Biquad();
    this.lp2 = new Biquad();
    this.bp = new Biquad();
  }

  /**
   * Process a block of complex IQ samples (interleaved I, Q, I, Q, … in [-1, 1]).
   * `sampleRate` is the rate at which these samples were captured.
   */
  process(iq: Float32Array, sampleRate: number) {
    if (this.omega === 0) {
      this.omega = (2 * Math.PI * RDS_SUBCARRIER) / sampleRate;
      this.bitsPerSample = sampleRate / RDS_BAUD;
      // Bandpass ±2.4 kHz around 57 kHz (covers RDS subcarrier)
      this.bp.setLowpass(sampleRate, RDS_SUBCARRIER + 2400, 0.707);
      this.lp1.setLowpass(sampleRate, 2400, 0.707);
      this.lp2.setLowpass(sampleRate, 1187.5 / 2, 0.707);
    }
    const n = iq.length / 2;
    for (let i = 0; i < n; i++) {
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      // Mix down 57 kHz
      const c = Math.cos(this.phase);
      const s = Math.sin(this.phase);
      // Complex multiplication: (I + jQ) * (c - js) = (Ic + Qs) + j(Qc - Is)
      const mixed = I * c + Q * s; // real part
      // Bandpass filter (removes everything but the RDS subcarrier)
      const filtered = this.bp.process(mixed);
      // Differential demodulation: look at sign of (current - previous)
      // The DBPSK symbol period is 1/1187.5 s, and each symbol is encoded
      // as a 180° phase flip (or not) relative to the previous symbol.
      const diff = filtered * this.prevSample;
      this.prevSample = filtered;
      // Low-pass to remove the carrier residual
      const sample = this.lp1.process(diff);

      // Sample at the bit center
      this.samplesSinceLastBit += 1;
      if (this.samplesSinceLastBit >= this.bitsPerSample) {
        this.samplesSinceLastBit -= this.bitsPerSample;
        const bit = sample > 0 ? 0 : 1;
        this.bits.push(bit);
        this.totalBits++;
        // Try to find a group every 104 bits
        if (this.bits.length >= 104) {
          this.tryDecodeGroup();
          // Shift by 1 bit to allow sliding-window search (handles sync loss)
          this.bits.shift();
        }
      }
      this.phase += this.omega;
      if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
    }
  }

  /** Try to decode a 104-bit RDS group from the current bit buffer. */
  private tryDecodeGroup() {
    if (this.bits.length < 104) return;
    const arr = new Uint8Array(this.bits.length);
    for (let i = 0; i < this.bits.length; i++) arr[i] = this.bits[i];

    // Try to find 4 blocks with consecutive syndrome positions (0, 1, 2, 3)
    // (with optional A/B flip on the second block).
    for (let start = 0; start + 104 <= arr.length; start += 1) {
      const b0 = decodeBlock(arr, start);
      if (!b0 || b0.position !== 0) continue;
      const b1 = decodeBlock(arr, start + 26);
      if (!b1 || b1.position !== 1) continue;
      const b2 = decodeBlock(arr, start + 52);
      if (!b2 || b2.position !== 2) continue;
      const b3 = decodeBlock(arr, start + 78);
      if (!b3 || b3.position !== 3) continue;

      // We have a full valid group!
      this.groupsFound++;
      this.bitErrors = Math.max(0, this.totalBits * 0 + this.bits.length - 104);
      this.lastGroupTime = Date.now();
      this.decodeGroupData(b0.data, b1.data, b2.data, b3.data, b1.position === 1);
      // Consume the bits so we don't re-decode this group
      this.bits = this.bits.slice(start + 104);
      return;
    }
    // Update BER estimate — if buffer is huge and no group found, mostly garbage
    if (this.bits.length > 200) {
      this.bits = this.bits.slice(this.bits.length - 104);
    }
  }

  /** Decode the contents of a known group. Reference: IEC 62106. */
  private decodeGroupData(b0: number, b1: number, b2: number, b3: number, _b: boolean) {
    const pi = b0 & 0xFFFF;
    this.pi = pi;
    const groupCode = (b1 >> 12) & 0xF;
    const bVer = ((b1 >> 11) & 1) === 1;
    const groupType = `${groupCode}${bVer ? "B" : "A"}`;
    this.state.groupType = groupType;
    this.state.pi = pi.toString(16).toUpperCase().padStart(4, "0");

    const pty = (b1 >> 5) & 0x1F;
    this.pty = pty;
    this.state.pty = pty;
    this.state.ptyLabel = PTY_EU_TABLE[pty] ?? null;

    // Group 0: Basic tuning + switching
    if (groupCode === 0 && !bVer) {
      const ta = ((b1 >> 4) & 1) === 1;
      const ms = ((b1 >> 3) & 1) === 1;
      const di = (b1 >> 2) & 0x3;
      this.stereo = di === 0 || di === 2; // rough approximation
      this.ta = ta;
      this.music = ms;
      this.state.stereo = this.stereo;
      this.state.ta = ta;
      this.state.music = ms;
      // PS character position (0..3 in this group, addresses 0..7)
      const psPos = ((b1 & 0x3) << 1) | 0; // 0..3 — actually: b1 bits 0..1 give 0..3
      const charA = String.fromCharCode((b2 >> 8) & 0xFF);
      const charB = String.fromCharCode(b2 & 0xFF);
      // PS position is bits 0..1 of block 1 (gives 0..3, each carrying 2 chars)
      const addr = b1 & 0x3;
      this.psChars[addr * 2] = charA;
      this.psChars[addr * 2 + 1] = charB;
      this.state.ps = this.psChars.join("").trim();
    }
    // Group 2: Radio Text
    if (groupCode === 2 && !bVer) {
      const addr = b1 & 0xF;
      const ab = ((b1 >> 4) & 1) === 1; // A/B text flag
      if (ab) {
        // Clear text — new message
        for (let i = 0; i < 64; i++) this.rtChars[i] = " ";
      }
      const textAddr = addr * 4;
      if (textAddr < 64) {
        this.rtChars[textAddr] = String.fromCharCode((b2 >> 8) & 0xFF);
        if (textAddr + 1 < 64) this.rtChars[textAddr + 1] = String.fromCharCode(b2 & 0xFF);
        if (textAddr + 2 < 64) this.rtChars[textAddr + 2] = String.fromCharCode((b3 >> 8) & 0xFF);
        if (textAddr + 3 < 64) this.rtChars[textAddr + 3] = String.fromCharCode(b3 & 0xFF);
        this.rtDirty = true;
        const text = this.rtChars.join("").replace(/\s+$/g, "");
        if (text.trim().length > 0) {
          this.state.rt = text;
        }
      }
    }
    this.state.groupsDecoded = this.groupsFound;
    this.state.lastUpdate = this.lastGroupTime;
    this.state.ber = this.totalBits > 0 ? Math.min(1, this.bitErrors / this.totalBits) : 0;
  }

  reset() {
    this.bits = [];
    this.pi = null;
    this.pty = null;
    this.psChars.fill(" ");
    this.rtChars.fill(" ");
    this.state = {
      pi: null, ps: null, pty: null, ptyLabel: null, rt: null,
      groupType: null, stereo: null, ta: null, music: null,
      groupsDecoded: 0, lastUpdate: 0, ber: 0,
    };
    this.phase = 0;
    this.omega = 0;
    this.samplesSinceLastBit = 0;
    this.bitIdx = 0;
    this.groupsFound = 0;
    this.bitErrors = 0;
    this.totalBits = 0;
  }
}
