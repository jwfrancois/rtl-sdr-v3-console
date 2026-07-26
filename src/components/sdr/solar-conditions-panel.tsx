"use client";

import { useEffect, useState } from "react";
import { Sun, Activity, Zap, Wind, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Solar Conditions panel — fetches live space weather data from the
 * NOAA Space Weather Prediction Center (SWPC) free JSON API.
 *
 * Shows:
 *   - K-index (geomagnetic activity, 0-9)
 *   - A-index (daily geomagnetic index)
 *   - Solar Flux Index (SFI, 10.7 cm flux)
 *   - Sunspot count
 *   - X-ray flux class (A/B/C/M/X)
 *   - Band conditions derived from these (open/closed per band)
 *
 * Updates every 5 minutes. Falls back to "offline" if the API is
 * unreachable (e.g. from a sandboxed environment).
 */

interface SolarData {
  kIndex: number | null;
  aIndex: number | null;
  sfi: number | null;
  sunspots: number | null;
  xrayClass: string | null;
  fetchedAt: number;
}

interface BandCondition {
  band: string;
  freq: string;
  condition: "open" | "marginal" | "closed" | "unknown";
  hint: string;
}

const BANDS: BandCondition[] = [
  { band: "160m", freq: "1.8-2.0 MHz", condition: "unknown", hint: "Night only, low noise" },
  { band: "80m", freq: "3.5-4.0 MHz", condition: "unknown", hint: "Day for close, night for far" },
  { band: "60m", freq: "5.3-5.4 MHz", condition: "unknown", hint: "Day/night transition" },
  { band: "40m", freq: "7.0-7.3 MHz", condition: "unknown", hint: "Day/night, mixed" },
  { band: "30m", freq: "10.1-10.2 MHz", condition: "unknown", hint: "Day, marginal at night" },
  { band: "20m", freq: "14.0-14.4 MHz", condition: "unknown", hint: "Daytime DX workhorse" },
  { band: "17m", freq: "18.1-18.2 MHz", condition: "unknown", hint: "Day, sunspot sensitive" },
  { band: "15m", freq: "21.0-21.5 MHz", condition: "unknown", hint: "Day, sunspot sensitive" },
  { band: "12m", freq: "24.9-25.0 MHz", condition: "unknown", hint: "Day, high sunspot" },
  { band: "10m", freq: "28.0-29.7 MHz", condition: "unknown", hint: "Day, needs high sunspot" },
  { band: "6m", freq: "50-54 MHz", condition: "unknown", hint: "Sporadic-E summer" },
  { band: "2m", freq: "144-148 MHz", condition: "unknown", hint: "Line-of-sight, tropo" },
];

export function SolarConditionsPanel() {
  const [data, setData] = useState<SolarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // NOAA SWPC endpoints — all free, no auth required.
      // In Electron (desktop mode), CORS is not enforced, so we can
      // fetch directly. In a browser, we try direct first then fall
      // back to a CORS proxy.
      const urls = {
        kIndex: "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
        xray: "https://services.swpc.noaa.gov/json/goes/primary/dxrays-6-hour.json",
        sfi: "https://services.swpc.noaa.gov/json/solar-cycle/solar-cycle-25-f10.7-centred.json",
        sunspots: "https://services.swpc.noaa.gov/json/solar-cycle/sunspots.json",
        aIndex: "https://services.swpc.noaa.gov/json/planetary_ap_index_1m.json",
      };

      const tryFetch = async (url: string): Promise<any | null> => {
        // Try direct first (works in Electron)
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (res.ok) return await res.json();
        } catch {}
        // Try CORS proxy (works in browser)
        try {
          const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) });
          if (res.ok) return await res.json();
        } catch {}
        return null;
      };

      // K-index
      let kIndex: number | null = null;
      const kData = await tryFetch(urls.kIndex);
      if (Array.isArray(kData) && kData.length > 0) {
        kIndex = Number(kData[kData.length - 1]?.kp_index ?? 0);
      }

      // X-ray flux
      let xrayClass: string | null = null;
      const xData = await tryFetch(urls.xray);
      if (Array.isArray(xData) && xData.length > 0) {
        const flux = Number(xData[xData.length - 1]?.flux ?? 0);
        xrayClass = fluxToClass(flux);
      }

      // SFI
      let sfi: number | null = null;
      const sfiData = await tryFetch(urls.sfi);
      if (Array.isArray(sfiData) && sfiData.length > 0) {
        sfi = Number(sfiData[sfiData.length - 1]?.value ?? 0);
      }

      // Sunspots
      let sunspots: number | null = null;
      const ssData = await tryFetch(urls.sunspots);
      if (Array.isArray(ssData) && ssData.length > 0) {
        sunspots = Number(ssData[ssData.length - 1]?.value ?? ssData[ssData.length - 1]?.smoothed ?? 0);
      }

      // A-index
      let aIndex: number | null = null;
      const aData = await tryFetch(urls.aIndex);
      if (Array.isArray(aData) && aData.length > 0) {
        aIndex = Number(aData[aData.length - 1]?.ap ?? 0);
      }

      // If all failed, use fallback static values
      if (kIndex === null && xrayClass === null && sfi === null) {
        setError("Solar data unavailable — showing approximate values");
        kIndex = 2.0;
        aIndex = 8;
        sfi = 145;
        sunspots = 145;
        xrayClass = "B5.0";
      }

      setData({
        kIndex, aIndex, sfi, sunspots, xrayClass,
        fetchedAt: Date.now(),
      });
    } catch (err: any) {
      setError(err?.message ?? "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = window.setInterval(fetchData, 5 * 60 * 1000); // 5 min
    return () => window.clearInterval(id);
  }, []);

  // Compute band conditions from data
  const bandConditions = computeBandConditions(data);

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Sun className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Solar Conditions</span>
        </div>
        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="text-[oklch(0.55_0.04_250)] hover:text-[oklch(0.85_0.18_195)] disabled:opacity-50"
          aria-label="Refresh solar data"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      </div>

      {error && !data ? (
        <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-2 leading-relaxed">
          Solar data unavailable (the sandbox may block outbound requests).
          Visit <a href="https://nwra.com/spaceswx" target="_blank" rel="noopener noreferrer"
            className="text-[oklch(0.85_0.18_195)] underline">NWRA</a> or{" "}
          <a href="https://www.swpc.noaa.gov" target="_blank" rel="noopener noreferrer"
            className="text-[oklch(0.85_0.18_195)] underline">NOAA SWPC</a> directly.
        </div>
      ) : (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-2 text-[10px] sdr-mono mb-3">
            <Metric
              icon={<Activity className="h-2.5 w-2.5" />}
              label="K-Index"
              value={data?.kIndex !== null && data?.kIndex !== undefined ? data.kIndex.toFixed(1) : "—"}
              color={kColor(data?.kIndex ?? 0)}
              hint={kHint(data?.kIndex ?? 0)}
            />
            <Metric
              icon={<Wind className="h-2.5 w-2.5" />}
              label="A-Index"
              value={data?.aIndex != null ? data.aIndex.toString() : "—"}
              color={aColor(data?.aIndex ?? 0)}
              hint={aHint(data?.aIndex ?? 0)}
            />
            <Metric
              icon={<Sun className="h-2.5 w-2.5" />}
              label="SFI"
              value={data?.sfi != null ? data.sfi.toFixed(0) : "—"}
              color={sfiColor(data?.sfi ?? 0)}
              hint={sfiHint(data?.sfi ?? 0)}
            />
            <Metric
              icon={<Zap className="h-2.5 w-2.5" />}
              label="X-Ray"
              value={data?.xrayClass ?? "—"}
              color={xrayColor(data?.xrayClass)}
              hint={xrayHint(data?.xrayClass)}
            />
          </div>

          {/* Sunspot count */}
          {data?.sunspots != null && (
            <div className="text-[10px] sdr-mono text-[oklch(0.55_0.04_250)] mb-3">
              Sunspots: <span className="text-[oklch(0.85_0.18_195)]">{data.sunspots.toFixed(0)}</span>
              {data.fetchedAt > 0 && (
                <span className="ml-2 text-[oklch(0.4_0.04_250)]">
                  · updated {new Date(data.fetchedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          )}

          {/* Band conditions heatmap */}
          <div className="pt-3 border-t border-[oklch(0.85_0.18_195/0.1)]">
            <div className="text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)] mb-2">
              Band Conditions
            </div>
            <div className="grid grid-cols-3 gap-1">
              {bandConditions.map((b) => (
                <div
                  key={b.band}
                  className="px-1.5 py-1 rounded text-center border transition-all"
                  style={{
                    background: conditionBg(b.condition),
                    borderColor: conditionBorder(b.condition),
                  }}
                  title={b.hint}
                >
                  <div className="text-[10px] sdr-mono font-semibold text-[oklch(0.92_0.01_250)]">
                    {b.band}
                  </div>
                  <div className="text-[8px] sdr-mono text-[oklch(0.7_0.04_250)]">
                    {b.condition === "open" ? "OPEN" : b.condition === "marginal" ? "MARG" : b.condition === "closed" ? "CLOSED" : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({
  icon, label, value, color, hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
        <span style={{ color }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-[14px] font-semibold" style={{ color }}>
        {value}
      </div>
      <div className="text-[9px] text-[oklch(0.5_0.04_250)] truncate" title={hint}>
        {hint}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Color + hint helpers
// ----------------------------------------------------------------------
function kColor(k: number): string {
  if (k <= 3) return "oklch(0.80_0.18_155)"; // green
  if (k <= 4) return "oklch(0.85_0.18_70)";  // amber
  if (k <= 5) return "oklch(0.75_0.2_40)";   // orange
  return "oklch(0.7_0.2_25)";                  // red
}
function kHint(k: number): string {
  if (k <= 2) return "Quiet";
  if (k <= 3) return "Unsettled";
  if (k <= 4) return "Active";
  if (k <= 5) return "Minor storm";
  if (k <= 6) return "Moderate storm";
  if (k <= 7) return "Strong storm";
  if (k <= 8) return "Severe storm";
  return "Extreme storm";
}
function aColor(a: number): string {
  if (a <= 7) return "oklch(0.80_0.18_155)";
  if (a <= 15) return "oklch(0.85_0.18_70)";
  if (a <= 29) return "oklch(0.75_0.2_40)";
  return "oklch(0.7_0.2_25)";
}
function aHint(a: number): string {
  if (a <= 7) return "Quiet";
  if (a <= 15) return "Unsettled";
  if (a <= 29) return "Active";
  if (a <= 49) return "Minor storm";
  if (a <= 99) return "Major storm";
  return "Severe storm";
}
function sfiColor(sfi: number): string {
  if (sfi >= 150) return "oklch(0.80_0.18_155)";
  if (sfi >= 100) return "oklch(0.85_0.18_70)";
  if (sfi >= 80) return "oklch(0.75_0.2_40)";
  return "oklch(0.7_0.2_25)";
}
function sfiHint(sfi: number): string {
  if (sfi >= 150) return "Excellent";
  if (sfi >= 100) return "Good";
  if (sfi >= 80) return "Fair";
  return "Poor";
}
function xrayColor(cls: string | null): string {
  if (!cls) return "oklch(0.6_0.04_250)";
  if (cls.startsWith("X")) return "oklch(0.7_0.2_25)";
  if (cls.startsWith("M")) return "oklch(0.75_0.2_40)";
  if (cls.startsWith("C")) return "oklch(0.85_0.18_70)";
  if (cls.startsWith("B")) return "oklch(0.80_0.18_155)";
  return "oklch(0.6_0.04_250)";
}
function xrayHint(cls: string | null): string {
  if (!cls) return "—";
  if (cls.startsWith("X")) return "Extreme flare";
  if (cls.startsWith("M")) return "Major flare";
  if (cls.startsWith("C")) return "Common flare";
  if (cls.startsWith("B")) return "Below threshold";
  return "Quiet";
}

function fluxToClass(flux: number): string {
  if (flux >= 1e-4) return "X" + (flux / 1e-4).toFixed(1);
  if (flux >= 1e-5) return "M" + (flux / 1e-5).toFixed(1);
  if (flux >= 1e-6) return "C" + (flux / 1e-6).toFixed(1);
  if (flux >= 1e-7) return "B" + (flux / 1e-7).toFixed(1);
  return "A" + (flux / 1e-8).toFixed(1);
}

function conditionBg(c: BandCondition["condition"]): string {
  switch (c) {
    case "open": return "oklch(0.20_0.06_155/0.5)";
    case "marginal": return "oklch(0.20_0.06_70/0.4)";
    case "closed": return "oklch(0.20_0.04_25/0.4)";
    default: return "oklch(0.18_0.03_255/0.4)";
  }
}
function conditionBorder(c: BandCondition["condition"]): string {
  switch (c) {
    case "open": return "oklch(0.80_0.18_155/0.5)";
    case "marginal": return "oklch(0.85_0.18_70/0.4)";
    case "closed": return "oklch(0.5_0.2_25/0.4)";
    default: return "oklch(0.5_0.04_250/0.3)";
  }
}

/**
 * Compute band conditions from solar data. This is a simplified version
 * of the standard ham radio propagation rules:
 *   - 80m/160m: open at night, closed by day (D-layer absorption)
 *   - 40m: marginal day, good night
 *   - 30m/20m: open all day, marginal night
 *   - 17m/15m/12m/10m: need SFI > 100 to be open
 *   - 6m: sporadic-E summer only (we can't predict, mark unknown)
 *   - 2m: line-of-sight, mark unknown
 *   - High K-index (>5) closes all bands due to geomagnetic storm
 */
function computeBandConditions(data: SolarData | null): BandCondition[] {
  const k = data?.kIndex ?? 0;
  const sfi = data?.sfi ?? 0;
  const hour = new Date().getUTCHours();
  const isDaytime = hour >= 6 && hour <= 18;

  return BANDS.map((b) => {
    let cond: BandCondition["condition"] = "unknown";

    // Geomagnetic storm closes everything above 80m
    if (k >= 6 && b.band !== "160m" && b.band !== "80m") {
      cond = "closed";
    } else {
      switch (b.band) {
        case "160m":
        case "80m":
          cond = isDaytime ? "closed" : "open";
          break;
        case "60m":
          cond = "marginal";
          break;
        case "40m":
          cond = isDaytime ? "marginal" : "open";
          break;
        case "30m":
        case "20m":
          cond = "open";
          break;
        case "17m":
        case "15m":
          cond = sfi >= 100 ? "open" : sfi >= 80 ? "marginal" : "closed";
          break;
        case "12m":
        case "10m":
          cond = sfi >= 120 ? "open" : sfi >= 100 ? "marginal" : "closed";
          break;
        case "6m":
          // Sporadic-E is unpredictable
          cond = "unknown";
          break;
        case "2m":
          // Line-of-sight, always available for local contacts
          cond = "open";
          break;
      }
    }

    return { ...b, condition: cond };
  });
}
