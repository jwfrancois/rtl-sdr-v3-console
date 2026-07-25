"use client";

import { useEffect, useState } from "react";
import {
  onRealNotch,
  addRealNotch,
  removeRealNotch,
  clearRealAutoNotches,
  configureRealNotch,
} from "@/lib/real-sdr/use-real-sdr";
import { useSdrStore } from "@/lib/sdr-store";
import type { NotchSpec } from "@/lib/real-sdr/notch-filter";
import { Filter, X, Eraser, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Notch filter panel — manage manual and auto-detected notches that
 * suppress strong interfering signals.
 */
export function NotchFilterPanel() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const [notches, setNotches] = useState<NotchSpec[]>([]);
  const [autoDetect, setAutoDetect] = useState(false);
  const [manualFreq, setManualFreq] = useState(100000);

  useEffect(() => {
    const unsub = onRealNotch((n) => setNotches([...n]));
    return unsub;
  }, []);

  useEffect(() => {
    configureRealNotch({ autoDetect });
  }, [autoDetect]);

  const handleAdd = () => {
    addRealNotch(manualFreq, 30);
    setManualFreq((f) => f + 100000);
  };

  if (backend !== "real" || !hwConnected) {
    return (
      <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
            <Filter className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
            <span>Notch Filter</span>
          </div>
        </div>
        <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-2">
          Connect a real RTL-SDR to enable notch filtering.
        </div>
      </div>
    );
  }

  const autoNotches = notches.filter((n) => n.auto);
  const manualNotches = notches.filter((n) => !n.auto);

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Filter className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Notch Filter</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.55_0.04_250)]">
          {notches.length} active
        </span>
      </div>

      {/* Auto-detect toggle */}
      <button
        type="button"
        onClick={() => setAutoDetect(!autoDetect)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 mb-3 rounded-md border transition-all",
          autoDetect
            ? "bg-[oklch(0.80_0.18_155/0.12)] border-[oklch(0.80_0.18_155/0.45)]"
            : "bg-[oklch(0.18_0.03_255/0.6)] border-[oklch(0.85_0.18_195/0.15)]",
        )}
      >
        <div className="flex items-center gap-2">
          <Sparkles className={cn("h-3.5 w-3.5", autoDetect ? "text-[oklch(0.80_0.18_155)]" : "text-[oklch(0.55_0.04_250)]")} />
          <span className={cn("text-[11px] sdr-mono", autoDetect ? "text-[oklch(0.80_0.18_155)]" : "text-[oklch(0.65_0.04_250)]")}>
            Auto-detect interferers
          </span>
        </div>
        <div className={cn(
          "h-4 w-7 rounded-full relative transition-colors",
          autoDetect ? "bg-[oklch(0.80_0.18_155/0.5)]" : "bg-[oklch(0.5_0.04_250/0.3)]",
        )}>
          <div className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all",
            autoDetect ? "left-3.5" : "left-0.5",
          )} />
        </div>
      </button>

      {/* Manual notch add */}
      <div className="flex items-center gap-1.5 mb-3">
        <input
          type="number"
          value={manualFreq}
          onChange={(e) => setManualFreq(Number(e.target.value))}
          step={10000}
          className="flex-1 px-2 py-1 rounded-md bg-[oklch(0.05_0.02_250/0.7)] border border-[oklch(0.85_0.18_195/0.18)] text-[11px] sdr-mono text-[oklch(0.92_0.01_250)] focus:outline-none focus:ring-1 focus:ring-[oklch(0.85_0.18_195/0.5)]"
        />
        <span className="text-[10px] sdr-mono text-[oklch(0.55_0.04_250)]">Hz</span>
        <button
          type="button"
          onClick={handleAdd}
          className="px-2 py-1 rounded-md bg-[oklch(0.85_0.18_195/0.14)] border border-[oklch(0.85_0.18_195/0.35)] text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.85_0.18_195/0.22)]"
          title="Add notch"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Active notches list */}
      <div className="space-y-1 max-h-40 overflow-y-auto sdr-scroll pr-1">
        {notches.length === 0 ? (
          <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-3 text-center">
            No notches active. Toggle auto-detect or add manually above.
          </div>
        ) : (
          notches.map((n, i) => (
            <div
              key={`${n.freqHz}-${i}`}
              className="group flex items-center justify-between gap-2 px-2 py-1 rounded-md border border-transparent hover:bg-[oklch(0.18_0.03_255/0.6)] hover:border-[oklch(0.85_0.18_195/0.15)] transition-all"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    n.auto ? "bg-[oklch(0.80_0.18_155)]" : "bg-[oklch(0.82_0.16_70)]",
                  )}
                />
                <span className="text-[11px] sdr-mono text-[oklch(0.85_0.04_250)]">
                  {(n.freqHz >= 0 ? "+" : "") + (n.freqHz / 1e3).toFixed(1)} kHz
                </span>
                {n.auto && (
                  <span className="text-[9px] px-1 rounded sdr-mono text-[oklch(0.80_0.18_155)] bg-[oklch(0.80_0.18_155/0.1)]">
                    AUTO
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeRealNotch(n.freqHz)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[oklch(0.5_0.2_25/0.3)] text-[oklch(0.7_0.04_250)] hover:text-[oklch(0.85_0.2_25)] transition-all"
                aria-label="Remove notch"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Clear all auto notches */}
      {autoNotches.length > 0 && (
        <button
          type="button"
          onClick={clearRealAutoNotches}
          className="w-full flex items-center justify-center gap-1.5 mt-2 py-1 rounded-md bg-[oklch(0.5_0.2_25/0.12)] border border-[oklch(0.5_0.2_25/0.3)] text-[oklch(0.85_0.05_25)] hover:bg-[oklch(0.5_0.2_25/0.22)] text-[10px] sdr-mono transition-all"
        >
          <Eraser className="h-3 w-3" />
          CLEAR AUTO ({autoNotches.length})
        </button>
      )}
    </div>
  );
}
