"use client";

import { create } from "zustand";
import {
  DemodMode,
  FREQ_MAX,
  FREQ_MIN,
  SAMPLE_RATES,
  STATIONS,
  findStationAt,
} from "./sdr-engine";
import type { SdrStatus } from "./real-sdr/types";

// ----------------------------------------------------------------------
// localStorage persistence — load saved state on startup
// ----------------------------------------------------------------------
const STORAGE_KEY = "rtl-sdr-v3-console-state-v1";

interface PersistedState {
  frequency: number;
  demod: DemodMode;
  bandwidth: number;
  sampleRate: number;
  gainDb: number;
  autoGain: boolean;
  squelch: number;
  volume: number;
  ppmCorrection: number;
  agcSpeed: "slow" | "medium" | "fast";
  bookmarks: Bookmark[];
  backend: SdrBackend;
  bridgeUrl: string;
}

function loadPersistedState(): Partial<PersistedState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Debounced save — don't write on every frequency change
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persistState(state: PersistedState) {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, 500);
}

export interface Bookmark {
  id: string;
  label: string;
  freq: number;
  modulation: DemodMode;
  bandwidth: number;
  note?: string;
}

export interface SdrSettings {
  frequency: number; // Hz
  demod: DemodMode;
  bandwidth: number; // Hz
  sampleRate: number; // Hz
  gainDb: number; // dB (0 = auto)
  autoGain: boolean;
  squelch: number; // 0..1
  volume: number; // 0..1
  audioEnabled: boolean;
  ppmCorrection: number; // parts per million
  agcSpeed: "slow" | "medium" | "fast";
  running: boolean;
}

export type SdrBackend = "simulated" | "real";

interface SdrState extends SdrSettings {
  // Setters
  setFrequency: (hz: number) => void;
  setDemod: (m: DemodMode) => void;
  setBandwidth: (hz: number) => void;
  setSampleRate: (hz: number) => void;
  setGainDb: (db: number) => void;
  setAutoGain: (a: boolean) => void;
  setSquelch: (s: number) => void;
  setVolume: (v: number) => void;
  setAudioEnabled: (e: boolean) => void;
  setPpmCorrection: (p: number) => void;
  setAgcSpeed: (s: "slow" | "medium" | "fast") => void;
  setRunning: (r: boolean) => void;

  // Bookmarks
  bookmarks: Bookmark[];
  addBookmark: (b: Omit<Bookmark, "id">) => void;
  removeBookmark: (id: string) => void;
  loadBookmark: (id: string) => void;

  // History (recently tuned frequencies)
  history: Array<{ freq: number; demod: DemodMode; ts: number }>;
  pushHistory: (freq: number, demod: DemodMode) => void;

  // Recording
  recording: boolean;
  toggleRecording: () => void;

  // Helpers
  tuneStep: (direction: 1 | -1, stepHz: number) => void;

  // Real-SDR connection state
  backend: SdrBackend;
  bridgeUrl: string;
  bridgeConnecting: boolean;
  bridgeError: string | null;
  hwStatus: SdrStatus | null;
  setBackend: (b: SdrBackend) => void;
  setBridgeUrl: (u: string) => void;
  setBridgeConnecting: (b: boolean) => void;
  setBridgeError: (e: string | null) => void;
  setHwStatus: (s: SdrStatus | null) => void;

  // Fullscreen spectrum mode
  fullscreen: boolean;
  setFullscreen: (b: boolean) => void;

  // Scan mode state
  scanning: boolean;
  scanMode: "peak" | "squelch" | "sweep";
  scanBand: { label: string; start: number; end: number } | null;
  scanFoundFreq: number | null;
  setScanning: (b: boolean) => void;
  setScanMode: (m: "peak" | "squelch" | "sweep") => void;
  setScanBand: (b: { label: string; start: number; end: number } | null) => void;
  setScanFoundFreq: (f: number | null) => void;
}

const DEFAULT_BOOKMARKS: Bookmark[] = [
  {
    id: "bm-1",
    label: "Galaxy FM",
    freq: 88.1e6,
    modulation: "WFM",
    bandwidth: 180e3,
    note: "Indie rock",
  },
  {
    id: "bm-2",
    label: "Talk Radio 97",
    freq: 97.3e6,
    modulation: "WFM",
    bandwidth: 180e3,
    note: "News & talk",
  },
  {
    id: "bm-3",
    label: "Approach ATC",
    freq: 127.2e6,
    modulation: "AM",
    bandwidth: 25e3,
    note: "Arrival control",
  },
  {
    id: "bm-4",
    label: "NOAA WX",
    freq: 162.4e6,
    modulation: "NFM",
    bandwidth: 25e3,
    note: "Weather",
  },
  {
    id: "bm-5",
    label: "20m Ham USB",
    freq: 14.2e6,
    modulation: "USB",
    bandwidth: 3e3,
    note: "DX voice",
  },
  {
    id: "bm-6",
    label: "WWV 10 MHz",
    freq: 10e6,
    modulation: "AM",
    bandwidth: 10e3,
    note: "Time standard",
  },
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Load saved state once (only on client)
const _persisted = loadPersistedState();

export const useSdrStore = create<SdrState>((set, get) => ({
  frequency: _persisted.frequency ?? 91.5e6,
  demod: _persisted.demod ?? "WFM",
  bandwidth: _persisted.bandwidth ?? 180e3,
  sampleRate: _persisted.sampleRate ?? 2.4e6,
  gainDb: _persisted.gainDb ?? 30,
  autoGain: _persisted.autoGain ?? false,
  squelch: _persisted.squelch ?? 0.15,
  volume: _persisted.volume ?? 0.7,
  audioEnabled: false, // Never persist audioEnabled — must be user-gesture initiated
  ppmCorrection: _persisted.ppmCorrection ?? 0,
  agcSpeed: _persisted.agcSpeed ?? "medium",
  running: true,

  setFrequency: (hz) =>
    set({ frequency: clamp(hz, FREQ_MIN, FREQ_MAX) }),
  setDemod: (m) =>
    set({ demod: m }),
  setBandwidth: (hz) => set({ bandwidth: Math.max(100, hz) }),
  setSampleRate: (hz) => {
    if (!SAMPLE_RATES.includes(hz)) return;
    set({ sampleRate: hz });
  },
  setGainDb: (db) => set({ gainDb: clamp(db, 0, 50) }),
  setAutoGain: (a) => set({ autoGain: a }),
  setSquelch: (s) => set({ squelch: clamp(s, 0, 1) }),
  setVolume: (v) => set({ volume: clamp(v, 0, 1) }),
  setAudioEnabled: (e) => set({ audioEnabled: e }),
  setPpmCorrection: (p) => set({ ppmCorrection: clamp(p, -200, 200) }),
  setAgcSpeed: (s) => set({ agcSpeed: s }),
  setRunning: (r) => set({ running: r }),

  bookmarks: _persisted.bookmarks ?? DEFAULT_BOOKMARKS,
  addBookmark: (b) =>
    set((s) => ({
      bookmarks: [
        ...s.bookmarks,
        { ...b, id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
      ],
    })),
  removeBookmark: (id) =>
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),
  loadBookmark: (id) => {
    const b = get().bookmarks.find((x) => x.id === id);
    if (!b) return;
    set({
      frequency: b.freq,
      demod: b.modulation,
      bandwidth: b.bandwidth,
    });
  },

  history: [],
  pushHistory: (freq, demod) =>
    set((s) => ({
      history: [
        { freq, demod, ts: Date.now() },
        ...s.history.filter((h) => h.freq !== freq),
      ].slice(0, 24),
    })),

  recording: false,
  toggleRecording: () => set((s) => ({ recording: !s.recording })),

  tuneStep: (direction, stepHz) =>
    set((s) => ({
      frequency: clamp(s.frequency + direction * stepHz, FREQ_MIN, FREQ_MAX),
    })),

  // Real-SDR connection state
  backend: _persisted.backend ?? "simulated",
  bridgeUrl: _persisted.bridgeUrl ?? "ws://localhost:8080",
  bridgeConnecting: false,
  bridgeError: null,
  hwStatus: null,
  setBackend: (b) => set({ backend: b }),
  setBridgeUrl: (u) => set({ bridgeUrl: u }),
  setBridgeConnecting: (b) => set({ bridgeConnecting: b }),
  setBridgeError: (e) => set({ bridgeError: e }),
  setHwStatus: (s) => set({ hwStatus: s }),

  // Fullscreen spectrum
  fullscreen: false,
  setFullscreen: (b) => set({ fullscreen: b }),

  // Scan mode
  scanning: false,
  scanMode: "peak",
  scanBand: null,
  scanFoundFreq: null,
  setScanning: (b) => set({ scanning: b }),
  setScanMode: (m) => set({ scanMode: m }),
  setScanBand: (b) => set({ scanBand: b }),
  setScanFoundFreq: (f) => set({ scanFoundFreq: f }),
}));

/** Select the strongest station currently under the cursor, if any. */
export function useActiveStation() {
  return useSdrStore((s) => findStationAt(s.frequency));
}

// Auto-persist on every change (debounced). This must run only on the
// client — guarded by the typeof window check inside persistState.
if (typeof window !== "undefined") {
  useSdrStore.subscribe((s) => {
    persistState({
      frequency: s.frequency,
      demod: s.demod,
      bandwidth: s.bandwidth,
      sampleRate: s.sampleRate,
      gainDb: s.gainDb,
      autoGain: s.autoGain,
      squelch: s.squelch,
      volume: s.volume,
      ppmCorrection: s.ppmCorrection,
      agcSpeed: s.agcSpeed,
      bookmarks: s.bookmarks,
      backend: s.backend,
      bridgeUrl: s.bridgeUrl,
    });
  });
}

export { STATIONS };
