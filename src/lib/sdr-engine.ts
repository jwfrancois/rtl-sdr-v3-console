/**
 * RTL-SDR V3 — Simulated SDR Engine
 *
 * Generates believable spectrum data, signal peaks, and audio synthesis
 * parameters based on the current tuned frequency. Used by the UI to
 * provide a fully functional experience without real hardware.
 */

export type DemodMode = "WFM" | "NFM" | "AM" | "USB" | "LSB" | "CW" | "RAW";

export interface RadioStation {
  freq: number; // Hz
  label: string;
  band: string;
  modulation: DemodMode;
  bandwidth: number; // Hz
  power: number; // 0..1 relative
  audioKind:
    | "music"
    | "voice"
    | "morse"
    | "noise"
    | "data"
    | "weather"
    | "aviation"
    | "silent";
  description?: string;
}

/**
 * A curated set of stations across the supported bands.
 * Frequencies are realistic and grouped by band.
 */
export const STATIONS: RadioStation[] = [
  // FM Broadcast 88-108 MHz
  { freq: 88.1e6, label: "Galaxy FM", band: "FM Broadcast", modulation: "WFM", bandwidth: 180e3, power: 0.78, audioKind: "music", description: "Indie rock & alternative" },
  { freq: 91.5e6, label: "Jazz Horizon", band: "FM Broadcast", modulation: "WFM", bandwidth: 180e3, power: 0.82, audioKind: "music", description: "Smooth jazz 24/7" },
  { freq: 94.7e6, label: "Pulse FM", band: "FM Broadcast", modulation: "WFM", bandwidth: 180e3, power: 0.7, audioKind: "music", description: "Electronic dance" },
  { freq: 97.3e6, label: "Talk Radio 97", band: "FM Broadcast", modulation: "WFM", bandwidth: 180e3, power: 0.85, audioKind: "voice", description: "News & talk" },
  { freq: 101.5e6, label: "Classical One", band: "FM Broadcast", modulation: "WFM", bandwidth: 180e3, power: 0.75, audioKind: "music", description: "Classical orchestral" },
  { freq: 104.3e6, label: "Rock Nation", band: "FM Broadcast", modulation: "WFM", bandwidth: 180e3, power: 0.88, audioKind: "music", description: "Classic rock hits" },
  { freq: 107.9e6, label: "Aurora FM", band: "FM Broadcast", modulation: "WFM", bandwidth: 180e3, power: 0.72, audioKind: "music", description: "Ambient & chillout" },

  // Airband 108-137 MHz AM
  { freq: 121.5e6, label: "Emergency Guard", band: "Airband", modulation: "AM", bandwidth: 25e3, power: 0.45, audioKind: "aviation", description: "Aviation emergency" },
  { freq: 122.8e6, label: "Unicom", band: "Airband", modulation: "AM", bandwidth: 25e3, power: 0.55, audioKind: "aviation", description: "Airfield advisory" },
  { freq: 127.2e6, label: "Approach", band: "Airband", modulation: "AM", bandwidth: 25e3, power: 0.6, audioKind: "aviation", description: "Arrival control" },
  { freq: 135.65e6, label: "Ground Control", band: "Airband", modulation: "AM", bandwidth: 25e3, power: 0.5, audioKind: "aviation", description: "Taxi clearance" },

  // Marine VHF 156-162 MHz
  { freq: 156.8e6, label: "Ch 16 — Distress", band: "Marine VHF", modulation: "NFM", bandwidth: 25e3, power: 0.62, audioKind: "voice", description: "Marine distress & calling" },
  { freq: 156.3e6, label: "Ch 13 — Bridge", band: "Marine VHF", modulation: "NFM", bandwidth: 25e3, power: 0.5, audioKind: "voice", description: "Bridge-to-bridge" },

  // NOAA Weather 162 MHz
  { freq: 162.4e6, label: "NOAA WX 1", band: "Weather", modulation: "NFM", bandwidth: 25e3, power: 0.8, audioKind: "weather", description: "Weather broadcast" },
  { freq: 162.475e6, label: "NOAA WX 2", band: "Weather", modulation: "NFM", bandwidth: 25e3, power: 0.7, audioKind: "weather", description: "Weather broadcast" },
  { freq: 162.55e6, label: "NOAA WX 3", band: "Weather", modulation: "NFM", bandwidth: 25e3, power: 0.65, audioKind: "weather", description: "Weather broadcast" },

  // 2m Amateur Band 144-148 MHz
  { freq: 145.5e6, label: "2m Simplex", band: "Ham Radio", modulation: "NFM", bandwidth: 12.5e3, power: 0.42, audioKind: "voice", description: "Ham simplex" },
  { freq: 146.94e6, label: "2m Repeater", band: "Ham Radio", modulation: "NFM", bandwidth: 25e3, power: 0.55, audioKind: "voice", description: "Local repeater" },

  // Shortwave HF — sampled across bands
  { freq: 3.75e6, label: "80m Ham SSB", band: "HF Ham", modulation: "LSB", bandwidth: 3e3, power: 0.5, audioKind: "voice", description: "80m voice" },
  { freq: 5.0e6, label: "WWV Time", band: "Time", modulation: "AM", bandwidth: 10e3, power: 0.85, audioKind: "data", description: "Time & frequency standard" },
  { freq: 7.2e6, label: "40m Ham SSB", band: "HF Ham", modulation: "LSB", bandwidth: 3e3, power: 0.55, audioKind: "voice", description: "40m voice" },
  { freq: 9.65e6, label: "SW Broadcast", band: "Shortwave", modulation: "AM", bandwidth: 10e3, power: 0.7, audioKind: "music", description: "International broadcast" },
  { freq: 11.9e6, label: "SW Broadcast", band: "Shortwave", modulation: "AM", bandwidth: 10e3, power: 0.65, audioKind: "music", description: "International broadcast" },
  { freq: 14.2e6, label: "20m Ham SSB", band: "HF Ham", modulation: "USB", bandwidth: 3e3, power: 0.62, audioKind: "voice", description: "20m DX voice" },
  { freq: 15.0e6, label: "WWV Time", band: "Time", modulation: "AM", bandwidth: 10e3, power: 0.75, audioKind: "data", description: "Time standard" },

  // 70cm Ham 420-450 MHz
  { freq: 446.0e6, label: "70cm Simplex", band: "Ham Radio", modulation: "NFM", bandwidth: 12.5e3, power: 0.48, audioKind: "voice", description: "UHF simplex" },
  { freq: 445.0e6, label: "70cm Repeater", band: "Ham Radio", modulation: "NFM", bandwidth: 25e3, power: 0.52, audioKind: "voice", description: "UHF repeater" },

  // AIS Marine 162 MHz
  { freq: 161.975e6, label: "AIS Ch A", band: "Marine VHF", modulation: "NFM", bandwidth: 25e3, power: 0.55, audioKind: "data", description: "Ship identification" },

  // Misc
  { freq: 243.0e6, label: "Military Guard", band: "Airband", modulation: "AM", bandwidth: 25e3, power: 0.45, audioKind: "aviation", description: "Mil emergency" },
];

/** RTL-SDR V3 supported frequency range. */
export const FREQ_MIN = 500e3; // 500 kHz
export const FREQ_MAX = 1.75e9; // 1.75 GHz

/** Available sample rates for the RTL2832U. */
export const SAMPLE_RATES = [240e3, 1.024e6, 1.44e6, 1.92e6, 2.048e6, 2.4e6, 2.88e6, 3.2e6];

/** Available tuner gain values in dB (RTL-SDR V3 typical). */
export const GAIN_VALUES_DB = [
  0, 0.9, 1.4, 2.7, 3.7, 7.7, 8.7, 12.5, 14.4, 15.7, 16.6, 19.7, 20.7, 22.9, 25.4,
  28.0, 29.7, 32.8, 33.8, 36.4, 37.2, 38.6, 40.2, 42.1, 43.4, 43.9, 44.5, 48.0, 49.6,
];

/** Filter bandwidth presets per demod mode (Hz). */
export const FILTER_BANDWIDTHS: Record<DemodMode, number[]> = {
  WFM: [180e3, 200e3, 220e3, 240e3],
  NFM: [12.5e3, 16e3, 20e3, 25e3, 30e3],
  AM: [6e3, 8e3, 10e3, 12e3, 16e3],
  USB: [2.4e3, 2.8e3, 3.0e3, 3.5e3],
  LSB: [2.4e3, 2.8e3, 3.0e3, 3.5e3],
  CW: [300, 500, 800, 1000],
  RAW: [240e3, 500e3, 1e6, 2e6],
};

/**
 * Find the strongest station near the given tuned frequency.
 * Returns the nearest station whose frequency is within the
 * "lock range" (roughly half a channel bandwidth).
 */
export function findStationAt(freq: number): RadioStation | null {
  let best: RadioStation | null = null;
  let bestDelta = Infinity;
  for (const s of STATIONS) {
    const delta = Math.abs(s.freq - freq);
    const lockRange = Math.max(s.bandwidth * 0.6, 5e3);
    if (delta < lockRange && delta < bestDelta) {
      best = s;
      bestDelta = delta;
    }
  }
  return best;
}

/** Compute a smooth power level (0..1) for a station given a tuned offset. */
export function stationSignalAt(station: RadioStation, tunedFreq: number): number {
  const delta = Math.abs(station.freq - tunedFreq);
  const halfBw = station.bandwidth / 2;
  if (delta > halfBw * 1.5) return 0;
  // Cosine roll-off profile to mimic IF filter shape
  const x = delta / (halfBw * 1.5);
  const shape = 0.5 * (1 + Math.cos(Math.PI * x));
  return station.power * shape;
}

/**
 * Generate a simulated FFT spectrum.
 *
 * The spectrum is N bins wide and represents the sample-rate window
 * centered on the tuned frequency. We add:
 *   - thermal noise floor proportional to 1/gain
 *   - shaped peaks for every station within the visible window
 *   - small noise variation per bin
 *
 * Returns Float32Array of length N with values in dBFS (roughly -100..0).
 */
export function generateSpectrum(
  tunedFreq: number,
  sampleRate: number,
  gainDb: number,
  size: number,
  timeMs: number,
): Float32Array {
  const out = new Float32Array(size);
  const gainFactor = Math.pow(10, (gainDb - 30) / 20); // 0 dB -> 0.03, 50 dB -> 3.16
  const noiseFloorDb = -85 + 30 * gainFactor; // higher gain raises floor slightly
  const halfBw = sampleRate / 2;

  // Center each bin at tunedFreq - halfBw + bin*(sampleRate/size)
  for (let i = 0; i < size; i++) {
    const freq = tunedFreq - halfBw + (i / size) * sampleRate;
    let db = noiseFloorDb;

    // Add station peaks
    for (const st of STATIONS) {
      const delta = Math.abs(st.freq - freq);
      const halfBwStation = st.bandwidth / 2;
      if (delta > halfBwStation * 2) continue;
      // Hann-shaped peak centered on the station
      const x = delta / (halfBwStation * 2);
      const shape = Math.cos((Math.PI / 2) * Math.min(1, x));
      const peakDb = -10 + st.power * 30 + 10 * Math.log10(gainFactor + 0.1);
      db = Math.max(db, noiseFloorDb + (peakDb - noiseFloorDb) * shape * shape);
    }

    // Add slow fading on HF frequencies (ionospheric propagation)
    if (freq < 30e6) {
      const fade = 0.5 + 0.5 * Math.sin(timeMs / 5371 + freq / 13e3);
      db -= (1 - fade) * 6;
    }

    // Per-bin noise (gaussian-ish via two uniforms)
    const noise = (Math.random() + Math.random() - 1) * 4;
    db += noise;

    out[i] = db;
  }

  return out;
}

/** Map a dBFS value (roughly -100..0) to a 0..1 waterfall intensity. */
export function dbToWaterfall(db: number): number {
  const min = -95;
  const max = -10;
  return Math.max(0, Math.min(1, (db - min) / (max - min)));
}

/** Viridis-inspired colormap → returns [r, g, b] in 0..255. */
export function waterfallColor(t: number): [number, number, number] {
  // Stop list (viridis-like): dark purple → blue → teal → green → yellow
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [10, 8, 35]],
    [0.18, [32, 16, 90]],
    [0.36, [38, 60, 140]],
    [0.52, [22, 120, 155]],
    [0.68, [60, 175, 110]],
    [0.82, [180, 205, 70]],
    [1.0, [255, 240, 160]],
  ];
  if (t <= 0) return stops[0][1];
  if (t >= 1) return stops[stops.length - 1][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const k = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/** Format a frequency in Hz to a human-readable string. */
export function formatFrequency(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(5)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(5)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(3)} kHz`;
  return `${hz.toFixed(0)} Hz`;
}

/** Format frequency compactly for axis labels. */
export function formatFreqAxis(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(2)}G`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(1)}M`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(0)}k`;
  return `${hz.toFixed(0)}`;
}

/** Identify the band name for a given frequency. */
export function bandForFrequency(hz: number): string {
  if (hz < 540e3) return "VLF/LF";
  if (hz < 1.7e6) return "MW AM";
  if (hz < 30e6) return "Shortwave";
  if (hz < 88e6) return "VHF Low";
  if (hz < 108e6) return "FM Broadcast";
  if (hz < 137e6) return "Airband";
  if (hz < 148e6) return "2m Ham";
  if (hz < 174e6) return "VHF High";
  if (hz < 216e6) return "VHF TV";
  if (hz < 470e6) return "UHF Gov";
  if (hz < 512e6) return "UHF TV";
  if (hz < 806e6) return "UHF High";
  if (hz < 960e6) return "900 MHz ISM";
  if (hz < 1.3e9) return "L-Band";
  if (hz < 1.75e9) return "L-Band High";
  return "Out of Range";
}
