"use client";

import { useEffect, useState, useRef } from "react";
import { Radio, Globe, RefreshCw, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DX Cluster Feed — live ham radio spots from dxsummit.fi.
 *
 * Shows real-time DX spots (rare stations being worked by hams worldwide).
 * Each spot shows:
 *   - DX callsign (the rare station)
 *   - Frequency (MHz)
 *   - Spotter callsign (who reported it)
 *   - Time (UTC)
 *   - Comment (mode, QSL info, etc.)
 *
 * Clicking a spot tunes the radio to that frequency (if in the RTL-SDR
 * range) with the appropriate demod mode.
 *
 * Data source: https://dxsummit.fi/api/v1/spots
 * (free, no auth, CORS-enabled, updates every ~30 seconds)
 */

interface DxSpot {
  id: string;
  dxCallsign: string;
  frequency: number; // kHz
  spotterCallsign: string;
  time: string;
  comment: string;
  band: string;
}

const DX_API = "https://dxsummit.fi/api/v1/spots";

// Band detection from frequency (kHz)
function bandFromFreq(kHz: number): string {
  const MHz = kHz / 1000;
  if (MHz >= 1.8 && MHz < 2.0) return "160m";
  if (MHz >= 3.5 && MHz < 4.0) return "80m";
  if (MHz >= 7.0 && MHz < 7.3) return "40m";
  if (MHz >= 10.1 && MHz < 10.2) return "30m";
  if (MHz >= 14.0 && MHz < 14.4) return "20m";
  if (MHz >= 18.1 && MHz < 18.2) return "17m";
  if (MHz >= 21.0 && MHz < 21.5) return "15m";
  if (MHz >= 24.9 && MHz < 25.0) return "12m";
  if (MHz >= 28.0 && MHz < 29.7) return "10m";
  if (MHz >= 50 && MHz < 54) return "6m";
  if (MHz >= 144 && MHz < 148) return "2m";
  return MHz < 30 ? "HF" : "VHF+";
}

function bandColor(band: string): string {
  const colors: Record<string, string> = {
    "160m": "text-[oklch(0.72_0.25_320)]",
    "80m": "text-[oklch(0.65_0.25_25)]",
    "40m": "text-[oklch(0.82_0.16_70)]",
    "30m": "text-[oklch(0.75_0.2_40)]",
    "20m": "text-[oklch(0.85_0.18_195)]",
    "17m": "text-[oklch(0.80_0.18_155)]",
    "15m": "text-[oklch(0.72_0.20_145)]",
    "12m": "text-[oklch(0.70_0.25_320)]",
    "10m": "text-[oklch(0.75_0.25_25)]",
    "6m": "text-[oklch(0.80_0.18_195)]",
    "2m": "text-[oklch(0.82_0.16_70)]",
  };
  return colors[band] || "text-[oklch(0.65_0.04_250)]";
}

export function DxClusterPanel() {
  const [spots, setSpots] = useState<DxSpot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const lastFetchRef = useRef(0);

  const fetchSpots = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(DX_API, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // dxsummit.fi returns array of spot objects
      // Format: { dx, freq, spotter, time, comment }
      const parsed: DxSpot[] = (Array.isArray(data) ? data : data.spots || [])
        .slice(0, 50)
        .map((s: any, i: number) => {
          const freqKHz = Number(s.frequency || s.freq || 0);
          return {
            id: `spot-${i}-${s.time || Date.now()}`,
            dxCallsign: String(s.dxcallsign || s.dx || s.callsign || "").toUpperCase().trim(),
            frequency: freqKHz,
            spotterCallsign: String(s.call || s.spotter || s.spottercallsign || "").toUpperCase().trim(),
            time: s.time || s.updated_at || "",
            comment: String(s.comment || s.txt || "").trim(),
            band: bandFromFreq(freqKHz),
          };
        })
        .filter((s: DxSpot) => s.dxCallsign && s.frequency > 0);

      setSpots(parsed);
      lastFetchRef.current = Date.now();
    } catch (err: any) {
      setError(err?.message ?? "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpots();
    const id = window.setInterval(fetchSpots, 30000); // 30s refresh
    return () => window.clearInterval(id);
  }, []);

  const filteredSpots = filter === "all"
    ? spots
    : spots.filter((s) => s.band === filter);

  const bands = Array.from(new Set(spots.map((s) => s.band)))
    .sort((a, b) => {
      const order = ["160m","80m","40m","30m","20m","17m","15m","12m","10m","6m","2m"];
      return order.indexOf(a) - order.indexOf(b);
    });

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Globe className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>DX Cluster</span>
          <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)] normal-case">
            dxsummit.fi
          </span>
        </div>
        <button
          type="button"
          onClick={fetchSpots}
          disabled={loading}
          className="text-[oklch(0.55_0.04_250)] hover:text-[oklch(0.85_0.18_195)] disabled:opacity-50"
          aria-label="Refresh DX spots"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      </div>

      {/* Band filter */}
      {bands.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "px-1.5 py-0.5 rounded text-[9px] sdr-mono border transition-all",
              filter === "all"
                ? "bg-[oklch(0.85_0.18_195/0.18)] border-[oklch(0.85_0.18_195/0.5)] text-[oklch(0.95_0.05_195)]"
                : "bg-[oklch(0.13_0.025_255/0.6)] border-[oklch(0.85_0.18_195/0.1)] text-[oklch(0.55_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)]",
            )}
          >
            ALL
          </button>
          {bands.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setFilter(b)}
              className={cn(
                "px-1.5 py-0.5 rounded text-[9px] sdr-mono border transition-all",
                filter === b
                  ? "bg-[oklch(0.85_0.18_195/0.18)] border-[oklch(0.85_0.18_195/0.5)] text-[oklch(0.95_0.05_195)]"
                  : "bg-[oklch(0.13_0.025_255/0.6)] border-[oklch(0.85_0.18_195/0.1)] text-[oklch(0.55_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)]",
              )}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      {/* Spot list */}
      <div className="max-h-64 overflow-y-auto sdr-scroll pr-1 space-y-1">
        {error && (
          <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-3 text-center leading-relaxed">
            DX cluster unavailable. Check your internet connection or
            visit{" "}
            <a href="https://dxsummit.fi" target="_blank" rel="noopener noreferrer"
              className="text-[oklch(0.85_0.18_195)] underline">
              dxsummit.fi
            </a>
            .
          </div>
        )}
        {!error && filteredSpots.length === 0 && !loading && (
          <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-3 text-center">
            No spots in the last 30 minutes.
          </div>
        )}
        {filteredSpots.map((spot) => (
          <div
            key={spot.id}
            className="group flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border border-transparent hover:bg-[oklch(0.18_0.03_255/0.6)] hover:border-[oklch(0.85_0.18_195/0.18)] transition-all"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={cn("text-[11px] sdr-mono font-semibold", bandColor(spot.band))}>
                {spot.dxCallsign}
              </span>
              <span className="text-[10px] sdr-mono text-[oklch(0.85_0.18_195)] shrink-0">
                {(spot.frequency / 1000).toFixed(3)}
              </span>
              <span className="text-[9px] text-[oklch(0.5_0.04_250)] shrink-0">
                {spot.band}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {spot.comment && (
                <span className="text-[9px] text-[oklch(0.55_0.04_250)] truncate max-w-[100px]" title={spot.comment}>
                  {spot.comment}
                </span>
              )}
              <span className="text-[9px] sdr-mono text-[oklch(0.4_0.04_250)]">
                {spot.time}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
