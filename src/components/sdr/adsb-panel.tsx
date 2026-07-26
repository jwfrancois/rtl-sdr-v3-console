"use client";

import { useEffect, useRef, useState } from "react";
import { onRealAdsb } from "@/lib/real-sdr/use-real-sdr";
import { useSdrStore } from "@/lib/sdr-store";
import type { AdsbState, Aircraft } from "@/lib/real-sdr/adsb";
import { Plane, Radar, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { PausedCanvas } from "./paused-canvas";
import { useNonEssentialThrottle } from "@/lib/render-throttle";

/**
 * ADS-B aircraft tracker — shows a live radar-style polar plot of
 * decoded aircraft around the receiver, plus a sortable list with
 * callsigns, altitudes, speeds, and tracks.
 *
 * The radar uses the receiver's lat/lon as the center. We don't actually
 * know the receiver's GPS position, so we use the average of all decoded
 * aircraft positions as a rough "center of mass" — usually close to the
 * receiver since ADS-B range is ~150 nm max.
 */
export function AdsbPanel() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const frequency = useSdrStore((s) => s.frequency);
  const setFrequency = useSdrStore((s) => s.setFrequency);

  const [state, setState] = useState<AdsbState | null>(null);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);

  useEffect(() => {
    const unsub = onRealAdsb((s) => {
      // Convert Map to array, sort by lastSeen desc, expire stale entries
      const list = Array.from(s.aircraft.values())
        .filter((a) => Date.now() - a.lastSeen < 60_000) // 1-minute expiry
        .sort((a, b) => b.lastSeen - a.lastSeen);
      setState({ ...s });
      setAircraft(list);
    });
    return unsub;
  }, []);

  // Filter stale aircraft on a timer so the list cleans up even without new messages
  useEffect(() => {
    const id = window.setInterval(() => {
      setAircraft((prev) => prev.filter((a) => Date.now() - a.lastSeen < 60_000));
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const inBand = frequency >= 1080e6 && frequency <= 1100e6;
  const shouldShow = backend === "real" && hwConnected && inBand;

  if (!shouldShow) {
    return (
      <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
            <Plane className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
            <span>ADS-B Tracker</span>
          </div>
          <span className="text-[10px] sdr-mono text-[oklch(0.5_0.04_250)]">
            {inBand ? "0 AC" : "Tune 1090 MHz"}
          </span>
        </div>
        <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-2 leading-relaxed">
          {inBand && backend === "real"
            ? "Tuned to 1090 MHz. Waiting for ADS-B messages…"
            : "Tune to 1090 MHz to decode aircraft transponders (Mode S Extended Squitter)."}
        </div>
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="sdr-panel rounded-xl p-4">
        <PausedCanvas label="{label}" />
      </div>
    );
  }
  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Plane className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>ADS-B Tracker</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.85_0.18_195)]">
          {aircraft.length} AC · {state?.msgCount ?? 0} msgs
        </span>
      </div>

      {/* Radar plot */}
      <div className="relative h-48 mb-3 rounded-lg overflow-hidden bg-[oklch(0.05_0.02_250/0.7)] border border-[oklch(0.85_0.18_195/0.15)]">
        <RadarView aircraft={aircraft} />
      </div>

      {/* Aircraft list */}
      <div className="max-h-40 overflow-y-auto sdr-scroll pr-1 space-y-0.5">
        {aircraft.length === 0 ? (
          <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-3 text-center">
            No aircraft decoded yet. Move your antenna near a window.
          </div>
        ) : (
          aircraft.map((a) => (
            <div
              key={a.icao}
              className="px-2 py-1.5 rounded-md border border-transparent hover:bg-[oklch(0.18_0.03_255/0.6)] hover:border-[oklch(0.85_0.18_195/0.15)] transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Plane className="h-3 w-3 text-[oklch(0.85_0.18_195)] shrink-0" />
                  <span className="text-[12px] sdr-mono text-[oklch(0.92_0.04_195)] truncate">
                    {a.callsign ?? a.icao}
                  </span>
                </div>
                <span className="text-[10px] sdr-mono text-[oklch(0.55_0.04_250)]">
                  {a.altitude ? `${(a.altitude / 1000).toFixed(0)}k ft` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
                  {a.lat && a.lon ? `${a.lat.toFixed(3)}, ${a.lon.toFixed(3)}` : "no pos"}
                </span>
                <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
                  {a.speed ? `${a.speed.toFixed(0)} kt @ ${a.track?.toFixed(0)}°` : ""}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RadarView({ aircraft }: { aircraft: Aircraft[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const { shouldRender, isActive } = useNonEssentialThrottle();

  useEffect(() => {
    const draw = () => {
      if (!shouldRender()) { rafRef.current = requestAnimationFrame(draw); return; }
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // Compute "center" as centroid of all aircraft positions
      const positioned = aircraft.filter((a) => a.lat !== null && a.lon !== null);
      let centerLat = 0, centerLon = 0;
      if (positioned.length > 0) {
        for (const a of positioned) {
          centerLat += a.lat!;
          centerLon += a.lon!;
        }
        centerLat /= positioned.length;
        centerLon /= positioned.length;
      }

      const cx = cssW / 2;
      const cy = cssH / 2;
      const maxR = Math.min(cssW, cssH) / 2 - 8;

      // Range rings (50, 100, 150 nm)
      ctx.strokeStyle = "rgba(120, 200, 230, 0.15)";
      ctx.lineWidth = 1;
      for (let nm = 50; nm <= 200; nm += 50) {
        const r = (nm / 200) * maxR;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = "rgba(140, 180, 200, 0.5)";
        ctx.font = "9px monospace";
        ctx.fillText(`${nm}nm`, cx + 4, cy - r + 10);
      }
      // Crosshair
      ctx.strokeStyle = "rgba(120, 200, 230, 0.2)";
      ctx.beginPath();
      ctx.moveTo(cx, 4);
      ctx.lineTo(cx, cssH - 4);
      ctx.moveTo(4, cy);
      ctx.lineTo(cssW - 4, cy);
      ctx.stroke();

      // Plot aircraft
      for (const a of positioned) {
        const dLat = a.lat! - centerLat;
        const dLon = (a.lon! - centerLon) * Math.cos((centerLat * Math.PI) / 180);
        const distNm = Math.sqrt(dLat * dLat + dLon * dLon) * 60;
        const bearing = (Math.atan2(dLon, dLat) * 180) / Math.PI;
        const r = Math.min(maxR, (distNm / 200) * maxR);
        const x = cx + Math.sin((bearing * Math.PI) / 180) * r;
        const y = cy - Math.cos((bearing * Math.PI) / 180) * r;
        // Aircraft symbol (triangle pointing in direction of travel)
        const heading = (a.track ?? 0) * Math.PI / 180;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(heading);
        ctx.fillStyle = a.callsign ? "rgba(255, 220, 120, 0.95)" : "rgba(80, 220, 255, 0.9)";
        ctx.shadowColor = ctx.fillStyle as string;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(4, 4);
        ctx.lineTo(0, 2);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // Label
        ctx.fillStyle = "rgba(200, 230, 255, 0.85)";
        ctx.font = "9px monospace";
        ctx.fillText(a.callsign ?? a.icao, x + 6, y - 4);
      }

      // Center marker (receiver)
      ctx.fillStyle = "rgba(80, 220, 255, 0.9)";
      ctx.shadowColor = "rgba(80, 220, 255, 0.8)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Sweep effect — slow rotating beam
      const sweepAngle = (performance.now() / 4000) * 2 * Math.PI;
      const grad = ctx.createConicGradient(sweepAngle, cx, cy);
      grad.addColorStop(0, "rgba(80, 220, 255, 0.18)");
      grad.addColorStop(0.05, "rgba(80, 220, 255, 0)");
      grad.addColorStop(1, "rgba(80, 220, 255, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, 2 * Math.PI);
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [aircraft]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} />
    </div>
  );
}
