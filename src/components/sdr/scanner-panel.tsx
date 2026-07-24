"use client";

import { useEffect, useRef, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { onRealSpectrum } from "@/lib/real-sdr/use-real-sdr";
import { Search, Radar, StopCircle, ChevronRight, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Band scan presets — common scanning ranges.
 */
const BAND_PRESETS = [
  { label: "FM Broadcast", start: 87.5e6, end: 108e6, step: 200e3, demod: "WFM" as const, bw: 180e3 },
  { label: "Airband (AM)", start: 118e6, end: 137e6, step: 25e3, demod: "AM" as const, bw: 25e3 },
  { label: "2m Ham Band", start: 144e6, end: 148e6, step: 12.5e3, demod: "NFM" as const, bw: 12.5e3 },
  { label: "NOAA Weather", start: 162.4e6, end: 162.55e6, step: 25e3, demod: "NFM" as const, bw: 25e3 },
  { label: "Marine VHF", start: 156e6, end: 162e6, step: 25e3, demod: "NFM" as const, bw: 25e3 },
  { label: "70cm Ham", start: 420e6, end: 450e6, step: 25e3, demod: "NFM" as const, bw: 25e3 },
  { label: "GMRS / FRS", start: 462e6, end: 467e6, step: 12.5e3, demod: "NFM" as const, bw: 12.5e3 },
  { label: "Shortwave (HF)", start: 3e6, end: 30e6, step: 5e3, demod: "AM" as const, bw: 10e3 },
  { label: "CB Radio", start: 26.965e6, end: 27.405e6, step: 10e3, demod: "AM" as const, bw: 10e3 },
];

interface FoundSignal {
  freq: number;
  strengthDb: number;
  band: string;
}

/**
 * Scan mode — sweeps a band looking for signals and lets you jump to them.
 *
 * Three scan modes:
 *  - "peak": continuously find the strongest signal in the current view
 *  - "squelch": sweep through a band and stop on each signal above squelch
 *  - "sweep": sweep through a band, collecting every signal peak
 *
 * The peak/sweep modes work off the spectrum data coming from the
 * real-SDR source (or simulated if no HW). For squelch mode, we tune
 * across the band in stepHz increments and check whether the central
 * bin is above the squelch threshold.
 */
export function ScannerPanel() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const frequency = useSdrStore((s) => s.frequency);
  const sampleRate = useSdrStore((s) => s.sampleRate);
  const squelch = useSdrStore((s) => s.squelch);
  const setFrequency = useSdrStore((s) => s.setFrequency);
  const setDemod = useSdrStore((s) => s.setDemod);
  const setBandwidth = useSdrStore((s) => s.setBandwidth);

  const scanning = useSdrStore((s) => s.scanning);
  const setScanning = useSdrStore((s) => s.setScanning);
  const scanMode = useSdrStore((s) => s.scanMode);
  const setScanMode = useSdrStore((s) => s.setScanMode);
  const scanBand = useSdrStore((s) => s.scanBand);
  const setScanBand = useSdrStore((s) => s.setScanBand);
  const scanFoundFreq = useSdrStore((s) => s.scanFoundFreq);
  const setScanFoundFreq = useSdrStore((s) => s.setScanFoundFreq);

  const [found, setFound] = useState<FoundSignal[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);

  // Subscribe to spectrum updates for peak detection
  const spectrumRef = useRef<{ data: Float32Array; fc: number; sr: number } | null>(null);
  useEffect(() => {
    const unsub = onRealSpectrum((data, fc, sr) => {
      spectrumRef.current = { data, fc, sr };
    });
    return unsub;
  }, []);

  // Peak scan loop — runs when scanMode === "peak"
  useEffect(() => {
    if (!scanning || scanMode !== "peak") return;
    let raf = 0;
    let lastFound = 0;
    const tick = () => {
      const spec = spectrumRef.current;
      if (spec && Date.now() - lastFound > 800) {
        // Find the strongest bin
        let maxIdx = 0;
        let maxDb = -200;
        const half = spec.data.length;
        for (let i = 0; i < half; i++) {
          if (spec.data[i] > maxDb) {
            maxDb = spec.data[i];
            maxIdx = i;
          }
        }
        // Map bin to frequency. The spectrum covers [fc - sr/2, fc + sr/2]
        // with `half` bins covering the positive half (we mirror for display).
        // For peak detection we use the positive half directly.
        const binFreqOffset = (maxIdx / (half - 1)) * (spec.sr / 2);
        const foundFreq = spec.fc + binFreqOffset;
        // Only jump if the peak is reasonably strong (above -50 dBFS)
        if (maxDb > -55) {
          setFrequency(foundFreq);
          setScanFoundFreq(foundFreq);
          lastFound = Date.now();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scanning, scanMode, setFrequency, setScanFoundFreq]);

  // Squelch scan loop — steps through the band, stops on strong signals
  useEffect(() => {
    if (!scanning || scanMode !== "squelch" || !scanBand) return;
    let stop = false;
    let currentFreq = scanBand.start;
    const step = BAND_PRESETS.find((p) => p.label === scanBand.label)?.step ?? 25e3;

    const tick = () => {
      if (stop) return;
      // Tune to the next frequency
      if (currentFreq > scanBand.end) currentFreq = scanBand.start;
      setFrequency(currentFreq);
      setScanFoundFreq(currentFreq);
      // Wait for spectrum to settle, then check signal strength
      window.setTimeout(() => {
        if (stop) return;
        const spec = spectrumRef.current;
        if (spec) {
          // Check the center bin (which corresponds to fc after tuning)
          const centerBin = Math.floor(spec.data.length / 2);
          const strength = spec.data[centerBin];
          // Convert dBFS to 0..1 (rough)
          const level = Math.max(0, Math.min(1, (strength + 80) / 80));
          if (level > squelch) {
            // Found a signal — add to the list and hold here for 3 s
            const band = scanBand.label;
            setFound((prev) => {
              if (prev.some((f) => Math.abs(f.freq - currentFreq) < step / 2)) return prev;
              return [...prev, { freq: currentFreq, strengthDb: strength, band }];
            });
            window.setTimeout(() => {
              if (!stop) {
                currentFreq += step;
                tick();
              }
            }, 3000);
            return;
          }
        }
        currentFreq += step;
        // Pace the scan
        window.setTimeout(tick, 80);
      }, 150);
    };

    tick();
    return () => { stop = true; };
  }, [scanning, scanMode, scanBand, squelch, setFrequency, setScanFoundFreq]);

  // Sweep scan — fast scan that just collects peaks
  useEffect(() => {
    if (!scanning || scanMode !== "sweep" || !scanBand) return;
    let stop = false;
    let currentFreq = scanBand.start;
    const step = BAND_PRESETS.find((p) => p.label === scanBand.label)?.step ?? 100e3;
    // Clear the found list at the start of a sweep via a deferred callback
    // so we don't trigger a synchronous setState-in-effect warning.
    let cleared = false;
    const tick = () => {
      if (!cleared) {
        cleared = true;
        setFound([]);
      }
      if (stop) return;
      if (currentFreq > scanBand.end) {
        // Done sweeping — stop
        setScanning(false);
        return;
      }
      setFrequency(currentFreq);
      setScanFoundFreq(currentFreq);
      window.setTimeout(() => {
        if (stop) return;
        const spec = spectrumRef.current;
        if (spec) {
          // Find the strongest bin in the visible spectrum
          let maxDb = -200;
          let maxIdx = 0;
          for (let i = 0; i < spec.data.length; i++) {
            if (spec.data[i] > maxDb) { maxDb = spec.data[i]; maxIdx = i; }
          }
          if (maxDb > -60) {
            const half = spec.data.length;
            const binFreqOffset = (maxIdx / (half - 1)) * (spec.sr / 2);
            const foundFreq = spec.fc + binFreqOffset;
            setFound((prev) => {
              if (prev.some((f) => Math.abs(f.freq - foundFreq) < step / 2)) return prev;
              return [...prev, { freq: foundFreq, strengthDb: maxDb, band: scanBand.label }].sort((a, b) => b.strengthDb - a.strengthDb);
            });
          }
        }
        currentFreq += sampleRate * 0.7; // move by 70% of view to overlap
        tick();
      }, 120);
    };
    tick();
    return () => { stop = true; };
  }, [scanning, scanMode, scanBand, sampleRate, setFrequency, setScanFoundFreq, setScanning]);

  const handleStart = (mode: "peak" | "squelch" | "sweep", preset?: typeof BAND_PRESETS[number]) => {
    setFound([]);
    setCurrentIdx(-1);
    if (preset) {
      setScanBand({ label: preset.label, start: preset.start, end: preset.end });
      setDemod(preset.demod);
      setBandwidth(preset.bw);
    }
    setScanMode(mode);
    setScanning(true);
  };

  const handleStop = () => {
    setScanning(false);
  };

  const handleJump = (f: FoundSignal, idx: number) => {
    setFrequency(f.freq);
    setCurrentIdx(idx);
  };

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Radar className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Scanner</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.55_0.04_250)]">
          {scanning ? `SCANNING (${scanMode})` : "IDLE"}
        </span>
      </div>

      {/* Quick action: peak scan (no band needed) */}
      <button
        type="button"
        onClick={scanning ? handleStop : () => handleStart("peak")}
        disabled={backend !== "real" && backend !== "simulated"}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2 mb-3 rounded-md border transition-all text-sm sdr-mono",
          scanning && scanMode === "peak"
            ? "bg-[oklch(0.5_0.2_25/0.18)] border-[oklch(0.5_0.2_25/0.6)] text-[oklch(0.95_0.05_25)]"
            : "bg-[oklch(0.85_0.18_195/0.14)] border-[oklch(0.85_0.18_195/0.45)] text-[oklch(0.95_0.05_195)] hover:bg-[oklch(0.85_0.18_195/0.22)]",
        )}
      >
        {scanning && scanMode === "peak" ? (
          <>
            <StopCircle className="h-3.5 w-3.5" />
            <span>STOP PEAK SCAN</span>
          </>
        ) : (
          <>
            <Search className="h-3.5 w-3.5" />
            <span>FIND STRONGEST SIGNAL</span>
          </>
        )}
      </button>

      {/* Band presets for sweep/squelch scan */}
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)] mb-1.5">
          Band scan
        </div>
        <div className="grid grid-cols-1 gap-1">
          {BAND_PRESETS.map((p) => {
            const isScanningThis = scanning && scanBand?.label === p.label;
            return (
              <div
                key={p.label}
                className="flex items-center justify-between gap-1 px-2 py-1 rounded-md border border-transparent hover:bg-[oklch(0.18_0.03_255/0.6)] hover:border-[oklch(0.85_0.18_195/0.15)] transition-all"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Waves className="h-3 w-3 text-[oklch(0.5_0.04_250)] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] text-[oklch(0.85_0.04_250)] truncate">{p.label}</div>
                    <div className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
                      {(p.start / 1e6).toFixed(1)}–{(p.end / 1e6).toFixed(1)} MHz
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => isScanningThis ? handleStop() : handleStart("sweep", p)}
                    disabled={scanning && !isScanningThis}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] sdr-mono border transition-all",
                      isScanningThis && scanMode === "sweep"
                        ? "bg-[oklch(0.5_0.2_25/0.18)] border-[oklch(0.5_0.2_25/0.5)] text-[oklch(0.95_0.05_25)]"
                        : "bg-[oklch(0.82_0.16_70/0.12)] border-[oklch(0.82_0.16_70/0.3)] text-[oklch(0.85_0.04_70)] hover:bg-[oklch(0.82_0.16_70/0.22)]",
                    )}
                  >
                    SWEEP
                  </button>
                  <button
                    type="button"
                    onClick={() => isScanningThis ? handleStop() : handleStart("squelch", p)}
                    disabled={scanning && !isScanningThis}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] sdr-mono border transition-all",
                      isScanningThis && scanMode === "squelch"
                        ? "bg-[oklch(0.5_0.2_25/0.18)] border-[oklch(0.5_0.2_25/0.5)] text-[oklch(0.95_0.05_25)]"
                        : "bg-[oklch(0.80_0.18_155/0.12)] border-[oklch(0.80_0.18_155/0.3)] text-[oklch(0.80_0.18_155)] hover:bg-[oklch(0.80_0.18_155/0.22)]",
                    )}
                  >
                    SQL
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Found signals */}
      {found.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[oklch(0.85_0.18_195/0.1)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)]">
              Found ({found.length})
            </span>
            <button
              type="button"
              onClick={() => setFound([])}
              className="text-[10px] text-[oklch(0.5_0.04_250)] hover:text-[oklch(0.7_0.04_250)]"
            >
              Clear
            </button>
          </div>
          <div className="max-h-32 overflow-y-auto sdr-scroll pr-1 space-y-0.5">
            {found.map((f, i) => (
              <button
                key={`${f.freq.toFixed(0)}-${i}`}
                type="button"
                onClick={() => handleJump(f, i)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-left transition-all border",
                  currentIdx === i
                    ? "bg-[oklch(0.85_0.18_195/0.16)] border-[oklch(0.85_0.18_195/0.5)]"
                    : "border-transparent hover:bg-[oklch(0.18_0.03_255/0.6)]",
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <ChevronRight className="h-3 w-3 text-[oklch(0.5_0.04_250)] shrink-0" />
                  <span className="text-[11px] sdr-mono text-[oklch(0.92_0.04_195)]">
                    {(f.freq / 1e6).toFixed(4)} MHz
                  </span>
                </div>
                <span className="text-[10px] sdr-mono text-[oklch(0.82_0.16_70)]">
                  {f.strengthDb.toFixed(0)} dB
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Live scan position */}
      {scanning && scanFoundFreq !== null && (
        <div className="mt-3 pt-3 border-t border-[oklch(0.85_0.18_195/0.1)] text-[10px] sdr-mono text-[oklch(0.6_0.04_250)]">
          Currently at: <span className="text-[oklch(0.85_0.18_195)]">{(scanFoundFreq / 1e6).toFixed(4)} MHz</span>
        </div>
      )}
    </div>
  );
}
