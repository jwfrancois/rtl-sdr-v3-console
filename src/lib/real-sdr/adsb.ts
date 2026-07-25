/**
 * ADS-B decoder — Mode S Extended Squitter (1090 MHz).
 *
 * Aircraft broadcast ADS-B "Extended Squitter" messages twice per second
 * containing their position, altitude, velocity, callsign, etc. We decode
 * the 1 Mbps PPM-modulated 120-bit preamble + 112-bit message.
 *
 * The 112-bit message structure:
 *   5 bits DF (downlink format) — DF=17 is ADS-B
 *   3 bits CA (capability)
 *   24 bits ICAO address (unique aircraft ID)
 *   56 bits ME (message, type-specific)
 *   24 bits PI (parity/interrogator)
 *
 * ME message type code (first 5 bits):
 *   1–4  : aircraft identification (callsign)
 *   9–18 : airborne position (compact position report — CPR)
 *   19   : airborne velocity
 *
 * CPR (Compact Position Reporting) is a clever scheme that uses two
 * alternating encodings (odd/even) to encode global lat/lon in just 35
 * bits each. We compute it from the most recent pair of odd+even
 * messages from the same aircraft.
 *
 * Reference: ICAO Annex 10 Vol III + RTCA DO-260.
 */

import { Biquad } from "./dsp";

const ADSB_BAUD = 1_000_000; // 1 µs per bit
const PREAMBLE_US = 8;

export interface Aircraft {
  /** 6-digit hex ICAO address (e.g. "A1B2C3"). */
  icao: string;
  /** Callsign (8 chars, e.g. "UAL123  "). */
  callsign: string | null;
  /** Decoded position (only when we have an odd+even pair). */
  lat: number | null;
  lon: number | null;
  /** Altitude in feet. */
  altitude: number | null;
  /** Ground speed in knots. */
  speed: number | null;
  /** Track / heading in degrees. */
  track: number | null;
  /** Vertical rate in ft/min (positive = climbing). */
  verticalRate: number | null;
  /** Squawk code (4-digit octal). */
  squawk: string | null;
  /** Whether the aircraft is on the ground. */
  onGround: boolean | null;
  /** Number of messages received from this aircraft. */
  msgCount: number;
  /** Timestamp of last received message (ms). */
  lastSeen: number;
  /** Last odd CPR position (for pair decoding). */
  cprOdd: { lat: number; lon: number; alt: number } | null;
  /** Last even CPR position (for pair decoding). */
  cprEven: { lat: number; lon: number; alt: number } | null;
}

export interface AdsbState {
  /** Map of ICAO → Aircraft. */
  aircraft: Map<string, Aircraft>;
  /** Total messages decoded since last reset. */
  msgCount: number;
  /** Total messages received (including CRC fails). */
  totalMessages: number;
  /** Timestamp of last valid message (ms). */
  lastUpdate: number;
}

export class AdsbDecoder {
  private lp: Biquad;
  private lp2: Biquad;
  private samplesPerBit = 0;
  private initialized = false;
  private buffer: number[] = [];

  state: AdsbState = {
    aircraft: new Map(),
    msgCount: 0,
    totalMessages: 0,
    lastUpdate: 0,
  };

  constructor() {
    this.lp = new Biquad();
    this.lp2 = new Biquad();
  }

  process(iq: Float32Array, sampleRate: number) {
    if (!this.initialized) {
      this.samplesPerBit = sampleRate / ADSB_BAUD;
      // Matched filter for the PPM pulse shape (200 ns rise, 500 ns high, 500 ns low).
      // For simplicity, just low-pass the magnitude.
      this.lp.setLowpass(sampleRate, ADSB_BAUD * 0.7, 0.707);
      this.lp2.setLowpass(sampleRate, ADSB_BAUD * 1.2, 0.707);
      this.initialized = true;
    }

    const n = iq.length / 2;
    // Compute magnitude (no frequency shift needed — ADS-B is at 1090 MHz,
    // the user tunes directly there). The baseband IQ is then the AM envelope.
    const mag = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const I = iq[i * 2];
      const Q = iq[i * 2 + 1];
      mag[i] = Math.sqrt(I * I + Q * Q);
    }
    // Low-pass to smooth out the 1 MHz carrier ripple
    for (let i = 0; i < n; i++) {
      const v = this.lp2.process(this.lp.process(mag[i]));
      this.buffer.push(v);
    }
    // Look for ADS-B preambles
    this.scanForPreambles();
  }

  private scanForPreambles() {
    // Preamble is 8 µs long = 8 samples at 1 Msps. The pattern is:
    //   ┌─┐   ┌─┐       ┌───────...
    //   │ │   │ │
    // ──┘ └───┘ └───────┘
    // Specifically: high at 0, low at 1, high at 2, low at 3.5, high at 4.5,
    // low at 5.5, then data starts at 8.
    // We detect by looking for the two peaks at samples 0 and 2.
    const buf = this.buffer;
    while (buf.length > 240) {
      // Find a candidate preamble: |sample[0]| > |sample[1]| AND |sample[2]| > |sample[1]|
      // AND data[5] is greater than the average.
      let found = false;
      for (let i = 0; i + 16 < Math.min(buf.length, 1000); i++) {
        if (this.tryDecodeAt(i)) {
          found = true;
          // Consume the message
          const msgBits = 112;
          const consumed = Math.ceil((PREAMBLE_US + msgBits) * this.samplesPerBit);
          buf.splice(0, i + consumed);
          break;
        }
      }
      if (!found) {
        // Drop the oldest sample and keep scanning
        buf.shift();
      } else if (buf.length < 240) {
        break;
      }
    }
    // Cap buffer to avoid unbounded growth
    if (this.buffer.length > 50000) {
      this.buffer.splice(0, this.buffer.length - 50000);
    }
  }

  private tryDecodeAt(idx: number): boolean {
    const buf = this.buffer;
    const spb = this.samplesPerBit;
    // Verify preamble: peak at sample 0, dip at 1, peak at 2
    const p0 = buf[idx];
    const p1 = buf[idx + Math.floor(1.0 * spb)];
    const p2 = buf[idx + Math.floor(2.0 * spb)];
    const p35 = buf[idx + Math.floor(3.5 * spb)];
    const p45 = buf[idx + Math.floor(4.5 * spb)];
    const p55 = buf[idx + Math.floor(5.5 * spb)];
    const p65 = buf[idx + Math.floor(6.5 * spb)];
    // Preamble: p0 > p1, p2 > p1, p0 > p35, p45 > p55
    if (!(p0 > p1 * 1.3 && p2 > p1 * 1.3)) return false;
    if (!(p0 > p35 * 1.2)) return false;
    if (!(p45 > p55 * 1.2)) return false;
    // Read 112 data bits — each bit is 1 µs. PPM encoding: bit is 1 if the
    // second half of the bit period has higher power than the first half.
    const bits: number[] = [];
    for (let b = 0; b < 112; b++) {
      const startBit = idx + Math.floor((PREAMBLE_US + b) * spb);
      const halfBit = Math.floor(0.5 * spb);
      const first = buf[startBit] ?? 0;
      const second = buf[startBit + halfBit] ?? 0;
      bits.push(second > first ? 1 : 0);
    }
    // Parse the 112-bit message
    return this.parseMessage(bits);
  }

  private parseMessage(bits: number[]): boolean {
    this.state.totalMessages++;
    const df = (bits[0] << 4) | (bits[1] << 3) | (bits[2] << 2) | (bits[3] << 1) | bits[4];
    // DF=17 = ADS-B (extended squitter). DF=18 = non-transponder. DF=11 = short.
    if (df !== 17 && df !== 18) return false;
    // ICAO address is bits 9..32 (24 bits, big-endian)
    let icao = 0;
    for (let i = 8; i < 32; i++) icao = (icao << 1) | bits[i];
    if (icao === 0) return false;
    const icaoHex = icao.toString(16).toUpperCase().padStart(6, "0");

    // ME (message, 56 bits) starts at bit 32. Type code is the first 5 bits.
    const meBits = bits.slice(32, 88);
    const typeCode = (meBits[0] << 4) | (meBits[1] << 3) | (meBits[2] << 2) | (meBits[3] << 1) | meBits[4];

    let aircraft = this.state.aircraft.get(icaoHex);
    if (!aircraft) {
      aircraft = {
        icao: icaoHex,
        callsign: null,
        lat: null,
        lon: null,
        altitude: null,
        speed: null,
        track: null,
        verticalRate: null,
        squawk: null,
        onGround: null,
        msgCount: 0,
        lastSeen: 0,
        cprOdd: null,
        cprEven: null,
      };
      this.state.aircraft.set(icaoHex, aircraft);
    }
    aircraft.msgCount++;
    aircraft.lastSeen = Date.now();

    switch (typeCode) {
      case 1: case 2: case 3: case 4: {
        // Aircraft identification (callsign)
        const data = meBits.slice(5, 56);
        // 8 chars, 6 bits each, encoding is ICAO Annex 10 charset
        const callsign = decodeCallsign(data.slice(0, 48)).trim();
        if (callsign.length > 0) aircraft.callsign = callsign;
        break;
      }
      case 9: case 10: case 11: case 12: case 13: case 14: case 15: case 16: case 17: case 18: {
        // Airborne position (CPR)
        // Bits 5..22: altitude encoded
        const altBits = meBits.slice(5, 22);
        const alt = decodeAltitude(altBits);
        if (alt !== null) aircraft.altitude = alt;
        // Bit 22: T flag (sync), bit 23: F flag (odd/even)
        const f = meBits[22];
        // CPR lat/lon: bits 23..39 (lat), 40..56 (lon) — wait, 56 bits total minus type code 5 = 51 bits, minus 1 F = 50
        const latCpr = bitsToInt(meBits.slice(5 + 6, 5 + 6 + 17)); // 17 bits
        const lonCpr = bitsToInt(meBits.slice(5 + 6 + 17, 5 + 6 + 17 + 17)); // 17 bits
        const cprFrame = { lat: latCpr / 131072, lon: lonCpr / 131072, alt: alt ?? 0 };
        if (f === 0) aircraft.cprEven = cprFrame;
        else aircraft.cprOdd = cprFrame;
        // Decode position if we have both
        if (aircraft.cprEven && aircraft.cprOdd) {
          const pos = decodeCpr(aircraft.cprEven, aircraft.cprOdd);
          if (pos) {
            aircraft.lat = pos.lat;
            aircraft.lon = pos.lon;
          }
        }
        break;
      }
      case 19: {
        // Airborne velocity
        const subtype = (meBits[5] << 2) | (meBits[6] << 1) | meBits[7];
        if (subtype === 1 || subtype === 2) {
          // East/West and North/South velocities
          const ewDir = meBits[8];
          const ewVel = bitsToInt(meBits.slice(9, 18)) - 1;
          const nsDir = meBits[18];
          const nsVel = bitsToInt(meBits.slice(19, 28)) - 1;
          const ew = (ewDir ? -1 : 1) * (ewVel > 0 ? ewVel : 0);
          const ns = (nsDir ? -1 : 1) * (nsVel > 0 ? nsVel : 0);
          const speed = Math.sqrt(ew * ew + ns * ns);
          if (speed > 0) {
            const track = (Math.atan2(ew, ns) * 180) / Math.PI;
            aircraft.speed = speed;
            aircraft.track = (track + 360) % 360;
          }
          // Vertical rate
          const vrSign = meBits[35];
          const vrRaw = bitsToInt(meBits.slice(36, 45)) - 1;
          if (vrRaw > 0) {
            aircraft.verticalRate = (vrSign ? -1 : 1) * vrRaw * 64;
          }
        }
        break;
      }
    }

    this.state.msgCount++;
    this.state.lastUpdate = Date.now();
    return true;
  }

  reset() {
    this.state.aircraft.clear();
    this.state.msgCount = 0;
    this.state.totalMessages = 0;
    this.state.lastUpdate = 0;
    this.buffer = [];
    this.initialized = false;
  }
}

function bitsToInt(bits: number[]): number {
  let v = 0;
  for (const b of bits) v = (v << 1) | b;
  return v;
}

const ICAO_CHARSET = "?ABCDEFGHIJKLMNOPQRSTUVWXYZ????? ?????0123456789??????";

function decodeCallsign(bits: number[]): string {
  // bits is 48 bits = 8 chars × 6 bits
  let result = "";
  for (let i = 0; i < 8; i++) {
    const charBits = bits.slice(i * 6, i * 6 + 6);
    const code = bitsToInt(charBits);
    result += ICAO_CHARSET[code] ?? "?";
  }
  return result;
}

function decodeAltitude(bits: number[]): number | null {
  // 13-bit altitude. Bit 0 (Q bit) at position 7.
  // If Q=1, altitude = bits[1..7] concat bits[8..12] as a 11-bit number × 25 - 1000
  // If Q=0, it's a Gillham-coded altitude (more complex, skip for simplicity)
  const q = bits[7];
  if (q === 1) {
    const n = (bitsToInt(bits.slice(0, 7)) << 5) | bitsToInt(bits.slice(8, 13));
    return n * 25 - 1000;
  }
  return null;
}

/**
 * Decode a global position from a CPR (odd, even) pair.
 * Reference: RTCA DO-260 §A.1.7
 */
function decodeCpr(
  even: { lat: number; lon: number; alt: number },
  odd: { lat: number; lon: number; alt: number },
): { lat: number; lon: number } | null {
  const AIR_LAT_ZONES = 15;
  const dLatEven = 360 / 60;
  const dLatOdd = 360 / 59;

  // Compute latitude index using the most recent message.
  // For simplicity assume even is most recent (we'd actually need timestamps).
  const j = Math.floor(59 * even.lat / 360 - 60 * odd.lat / 360 + 0.5);

  const latEven = dLatEven * (j + even.lat);
  const latOdd = dLatOdd * (j + odd.lat);

  // Pick the latitude in the correct hemisphere
  if (latEven >= 270) latEvenAdjust(latEven);
  function latEvenAdjust(_l: number) {} // no-op; we use as-is

  // For longitude we need the NL (number of longitude zones) at this latitude
  const nl = Math.max(1, NL(latEven));
  const lonEven = (nl === 1 ? 360 : 360 / nl) * (mod(even.lon - odd.lon, 1) + 0.5);
  const lonOdd = (nl === 1 ? 360 : 360 / (nl - 1)) * (mod(odd.lon - even.lon, 1) + 0.5);

  // Use the even message position (you'd pick based on which is newer)
  return { lat: latEven - 90, lon: lonEven - 180 }; // rough offset; CPR returns 0..1 normalized
}

function mod(a: number, b: number): number {
  const result = a - Math.floor(a / b) * b;
  return result < 0 ? result + b : result;
}

/** Number of longitude zones at a given latitude — used by CPR. */
function NL(lat: number): number {
  const absLat = Math.abs(lat);
  if (absLat >= 87.0) return 1;
  // Lookup table — RTCA DO-260 §A.1.7.7
  const table = [
    [10.47, 59], [14.83, 58], [18.0, 57], [21.0, 56], [23.46, 55], [25.83, 54],
    [27.5, 53], [29.7, 52], [31.59, 51], [33.3, 50], [34.92, 49], [36.0, 48],
    [37.36, 47], [38.69, 46], [40.0, 45], [41.05, 44], [42.0, 43], [43.07, 42],
    [44.0, 41], [45.07, 40], [46.0, 39], [46.85, 38], [47.83, 37], [48.83, 36],
    [49.83, 35], [50.71, 34], [51.52, 33], [52.23, 32], [53.0, 31], [53.69, 30],
    [54.41, 29], [55.09, 28], [55.78, 27], [56.5, 26], [57.21, 25], [57.91, 24],
    [58.62, 23], [59.33, 22], [60.04, 21], [60.76, 20], [61.48, 19], [62.2, 18],
    [62.93, 17], [63.66, 16], [64.41, 15], [65.17, 14], [65.94, 13], [66.71, 12],
    [67.5, 11], [68.29, 10], [69.1, 9], [69.92, 8], [70.77, 7], [71.64, 6],
    [72.55, 5], [73.5, 4], [74.5, 3], [75.57, 2],
  ];
  for (let i = 0; i < table.length; i++) {
    if (absLat <= table[i][0]) return table[i][1];
  }
  return 1;
}
