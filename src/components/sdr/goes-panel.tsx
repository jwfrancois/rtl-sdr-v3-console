"use client";

import { useEffect, useState } from "react";
import { onRealGoes } from "@/lib/real-sdr/use-real-sdr";
import { useSdrStore } from "@/lib/sdr-store";
import type { HritState } from "@/lib/real-sdr/goes-hrit";
import { Satellite, FileText, Activity } from "lucide-react";

/**
 * GOES HRIT decoder panel — only shown when tuned to 1680–1700 MHz
 * (GOES-East at 1685.7 MHz or GOES-West at 1694.1 MHz).
 *
 * Requires a dish or helical antenna + LNA for proper reception —
 * the stock whip won't work for this.
 */
export function GoesPanel() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const frequency = useSdrStore((s) => s.frequency);

  const [state, setState] = useState<HritState | null>(null);

  useEffect(() => {
    const unsub = onRealGoes((s) => setState({
      ...s,
      currentFile: s.currentFile ? { ...s.currentFile } : null,
      completedFiles: [...s.completedFiles],
    }));
    return unsub;
  }, []);

  const inBand = frequency >= 1680e6 && frequency <= 1700e6;
  const shouldShow = backend === "real" && hwConnected && inBand;

  if (!shouldShow) return null;

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Satellite className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>GOES HRIT</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.85_0.18_195)]">
          {state?.locked ? "LOCKED" : "searching…"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px] sdr-mono">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
            Frames
          </span>
          <span className="text-[12px] text-[oklch(0.92_0.04_195)]">
            {state?.frameCount ?? 0}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
            Bytes
          </span>
          <span className="text-[12px] text-[oklch(0.92_0.04_195)]">
            {((state?.totalBytes ?? 0) / 1e6).toFixed(2)} MB
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
            BER
          </span>
          <span className="text-[12px] text-[oklch(0.85_0.18_195)]">
            {((state?.ber ?? 0) * 100).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Current file */}
      {state?.currentFile && (
        <div className="mt-3 p-2 rounded-md bg-[oklch(0.05_0.02_250/0.7)] border border-[oklch(0.85_0.18_195/0.15)]">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="h-3 w-3 text-[oklch(0.85_0.18_195)] sdr-pulse" />
            <span className="text-[10px] uppercase tracking-wider text-[oklch(0.55_0.04_250)]">
              Receiving
            </span>
          </div>
          <div className="text-[11px] sdr-mono text-[oklch(0.92_0.04_195)] truncate">
            {state.currentFile.type}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-[oklch(0.18_0.03_255)] overflow-hidden">
            <div
              className="h-full bg-[oklch(0.85_0.18_195)] transition-all"
              style={{
                width: `${Math.min(100, (state.currentFile.receivedBytes / state.currentFile.totalBytes) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-1 text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
            {(state.currentFile.receivedBytes / 1e6).toFixed(1)} / {(state.currentFile.totalBytes / 1e6).toFixed(1)} MB
          </div>
        </div>
      )}

      {/* Completed files */}
      {state && state.completedFiles.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)] mb-1.5 flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span>Completed Files</span>
          </div>
          <div className="max-h-32 overflow-y-auto sdr-scroll pr-1 space-y-1">
            {state.completedFiles.map((f, i) => (
              <div
                key={i}
                className="px-2 py-1 rounded-md border border-transparent hover:bg-[oklch(0.18_0.03_255/0.6)]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sdr-mono text-[oklch(0.85_0.04_250)] truncate">
                    {f.type}
                  </span>
                  <span className="text-[10px] sdr-mono text-[oklch(0.5_0.04_250)]">
                    {(f.size / 1e6).toFixed(1)} MB
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!state?.locked && state?.frameCount === 0 && (
        <div className="mt-3 text-[10px] text-[oklch(0.5_0.04_250)] leading-relaxed">
          GOES HRIT at 927 kbps. Requires a dish or helical antenna + LNA
          for proper reception — stock whip won't work.
        </div>
      )}
    </div>
  );
}
