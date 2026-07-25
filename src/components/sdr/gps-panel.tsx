"use client";

import { useEffect, useState } from "react";
import { onRealGps } from "@/lib/real-sdr/use-real-sdr";
import { useSdrStore } from "@/lib/sdr-store";
import type { GpsState, GpsSatellite } from "@/lib/real-sdr/gps-l1";
import { Navigation, Satellite as SatelliteIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * GPS L1 C/A decoder panel — only shown when tuned to 1570–1580 MHz
 * (L1 center = 1575.42 MHz).
 *
 * Tracks up to 12 GPS satellites, decodes nav messages, and shows
 * satellite positions / C/N0 / pseudoranges.
 *
 * Note: requires a GPS antenna (active, with LNA) for proper reception —
 * the stock RTL-SDR whip can't pick up GPS reliably.
 */
export function GpsPanel() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const frequency = useSdrStore((s) => s.frequency);

  const [state, setState] = useState<GpsState | null>(null);
  const [sats, setSats] = useState<GpsSatellite[]>([]);

  useEffect(() => {
    const unsub = onRealGps((s) => {
      setState({ ...s, satellites: new Map(s.satellites) });
      setSats(Array.from(s.satellites.values()));
    });
    return unsub;
  }, []);

  const inBand = frequency >= 1570e6 && frequency <= 1580e6;
  const shouldShow = backend === "real" && hwConnected && inBand;

  if (!shouldShow) return null;

  const tracked = sats.filter((s) => s.tracking === "tracking");
  const searching = sats.filter((s) => s.tracking === "searching");

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Navigation className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>GPS L1 C/A</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.85_0.18_195)]">
          {tracked.length}/{sats.length} tracked
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px] sdr-mono mb-3">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
            PRNs Tracked
          </span>
          <span className="text-[12px] text-[oklch(0.92_0.04_195)]">
            {tracked.length}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
            Searching
          </span>
          <span className="text-[12px] text-[oklch(0.82_0.16_70)]">
            {searching.length}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
            Correlations
          </span>
          <span className="text-[12px] text-[oklch(0.92_0.04_195)]">
            {state?.correlations ?? 0}
          </span>
        </div>
      </div>

      {/* Skyview-style satellite list */}
      <div className="space-y-1 max-h-48 overflow-y-auto sdr-scroll pr-1">
        {sats.map((s) => (
          <div
            key={s.prn}
            className={cn(
              "flex items-center justify-between gap-2 px-2 py-1 rounded-md border transition-all",
              s.tracking === "tracking"
                ? "bg-[oklch(0.85_0.18_195/0.12)] border-[oklch(0.85_0.18_195/0.4)]"
                : "border-transparent hover:bg-[oklch(0.18_0.03_255/0.6)]",
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <SatelliteIcon
                className={cn(
                  "h-3 w-3 shrink-0",
                  s.tracking === "tracking"
                    ? "text-[oklch(0.85_0.18_195)] sdr-pulse"
                    : "text-[oklch(0.5_0.04_250)]",
                )}
              />
              <span className="text-[11px] sdr-mono text-[oklch(0.92_0.04_195)]">
                PRN-{s.prn.toString().padStart(2, "0")}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] sdr-mono">
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[9px]",
                s.tracking === "tracking"
                  ? "bg-[oklch(0.80_0.18_155/0.18)] text-[oklch(0.92_0.04_155)]"
                  : "bg-[oklch(0.18_0.03_255/0.6)] text-[oklch(0.5_0.04_250)]",
              )}>
                {s.tracking === "tracking" ? "TRK" : "SRCH"}
              </span>
              <span className="text-[oklch(0.85_0.18_195)] w-12 text-right">
                {s.cn0 > 0 ? `${s.cn0.toFixed(1)}dB` : "—"}
              </span>
              <span className="text-[oklch(0.5_0.04_250)] w-16 text-right">
                {s.dopplerHz !== 0 ? `${s.dopplerHz > 0 ? "+" : ""}${s.dopplerHz.toFixed(0)}Hz` : "—"}
              </span>
              {s.pseudorange !== null && (
                <span className="text-[oklch(0.82_0.16_70)] w-16 text-right">
                  {(s.pseudorange / 1e6).toFixed(1)}Mm
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {tracked.length === 0 && (
        <div className="mt-3 text-[10px] text-[oklch(0.5_0.04_250)] leading-relaxed">
          CDMA BPSK at 1.023 Mchip/s. Requires an active GPS antenna
          (with built-in LNA) for proper reception. Position fix needs
          4+ satellites with valid ephemeris.
        </div>
      )}

      {tracked.length >= 4 && (
        <div className="mt-3 p-2 rounded-md bg-[oklch(0.80_0.18_155/0.12)] border border-[oklch(0.80_0.18_155/0.4)]">
          <div className="text-[10px] sdr-mono text-[oklch(0.92_0.04_155)]">
            4+ satellites tracked — position fix theoretically possible
            (would need ephemeris parsing + trilateration).
          </div>
        </div>
      )}
    </div>
  );
}
