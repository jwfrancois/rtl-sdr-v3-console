"use client";

import { useEffect, useRef } from "react";
import { Clock, Sun, Moon, Globe } from "lucide-react";
import { useSdrStore } from "@/lib/sdr-store";
import { useNonEssentialThrottle } from "@/lib/render-throttle";

/**
 * UTC Clock + Greyline indicator.
 *
 * Hams care about UTC time because all logbooks use it, and about the
 * greyline (the day/night terminator) because propagation along the
 * greyline is enhanced for low-band (80m/160m) DX.
 *
 * This component shows:
 *   - Live UTC time (HH:MM:SS) prominently
 *   - Local time + offset
 *   - Sun elevation at the receiver (rough estimate based on local time)
 *   - Day/Night indicator
 *   - Greyline hint (best time for low-band DX)
 */
export function UtcClock() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const { shouldRender } = useNonEssentialThrottle();
  const frequency = useSdrStore((s) => s.frequency);

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
      const cssH = 56;
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

      const now = new Date();
      const utcHours = now.getUTCHours();
      const utcMins = now.getUTCMinutes();
      const utcSecs = now.getUTCSeconds();
      const utcStr = `${pad(utcHours)}:${pad(utcMins)}:${pad(utcSecs)}`;

      // Compute sun elevation (rough): peak at local noon, zero at 6/18h boundary
      const localHours = now.getHours() + now.getMinutes() / 60;
      const sunElev = Math.sin(((localHours - 6) / 12) * Math.PI) * 90; // -90..90
      const isDay = sunElev > 0;

      // Background gradient — day/night strip
      const grad = ctx.createLinearGradient(0, 0, cssW, 0);
      for (let i = 0; i <= 24; i++) {
        const elev = Math.sin(((i - 6) / 12) * Math.PI) * 90;
        const t = i / 24;
        if (elev > 30) grad.addColorStop(t, "rgba(255, 200, 80, 0.18)");
        else if (elev > 0) grad.addColorStop(t, "rgba(255, 200, 80, 0.10)");
        else if (elev > -30) grad.addColorStop(t, "rgba(80, 100, 150, 0.15)");
        else grad.addColorStop(t, "rgba(20, 30, 60, 0.4)");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cssW, cssH);

      // Sun marker at current UTC hour position
      const sunX = ((utcHours + utcMins / 60) / 24) * cssW;
      const sunY = cssH / 2;
      ctx.fillStyle = isDay ? "rgba(255, 220, 100, 0.95)" : "rgba(180, 200, 240, 0.6)";
      ctx.shadowColor = isDay ? "rgba(255, 200, 80, 0.8)" : "rgba(150, 180, 220, 0.4)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Hour ticks (UTC 0, 6, 12, 18)
      ctx.strokeStyle = "rgba(180, 200, 230, 0.4)";
      ctx.fillStyle = "rgba(180, 200, 230, 0.6)";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      for (let h = 0; h < 24; h += 6) {
        const x = (h / 24) * cssW;
        ctx.beginPath();
        ctx.moveTo(x, cssH - 10);
        ctx.lineTo(x, cssH - 6);
        ctx.stroke();
        ctx.fillText(`${pad(h)}Z`, x, cssH - 1);
      }
      ctx.textAlign = "start";

      // Big UTC time
      ctx.fillStyle = "rgba(220, 240, 255, 0.95)";
      ctx.font = "bold 18px monospace";
      ctx.shadowColor = "rgba(80, 220, 255, 0.5)";
      ctx.shadowBlur = 8;
      ctx.fillText(utcStr, 6, 18);
      ctx.shadowBlur = 0;

      // Local time + offset
      const localOffset = -now.getTimezoneOffset() / 60;
      const offsetStr = `UTC${localOffset >= 0 ? "+" : ""}${localOffset}`;
      const localStr = `${pad(now.getHours())}:${pad(now.getMinutes())} LOCAL`;
      ctx.fillStyle = "rgba(180, 200, 230, 0.7)";
      ctx.font = "9px monospace";
      ctx.fillText(localStr, 6, 30);
      ctx.fillStyle = "rgba(140, 180, 220, 0.6)";
      ctx.fillText(offsetStr, 6, 42);

      // Day/Night indicator on the right
      ctx.textAlign = "right";
      ctx.fillStyle = isDay ? "rgba(255, 220, 100, 0.95)" : "rgba(180, 200, 240, 0.85)";
      ctx.font = "10px monospace";
      ctx.fillText(isDay ? "DAY" : "NIGHT", cssW - 6, 18);
      // Greyline hint
      const isGreyline = Math.abs(sunElev) < 15;
      if (isGreyline) {
        ctx.fillStyle = "rgba(255, 200, 80, 0.95)";
        ctx.fillText("GREYLINE!", cssW - 6, 30);
        ctx.fillStyle = "rgba(180, 200, 230, 0.6)";
        ctx.font = "8px monospace";
        ctx.fillText("low-band DX", cssW - 6, 42);
      } else {
        ctx.fillStyle = "rgba(140, 180, 220, 0.6)";
        ctx.font = "8px monospace";
        ctx.fillText(`Sun elev: ${sunElev.toFixed(0)}°`, cssW - 6, 42);
      }
      ctx.textAlign = "start";

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [frequency]);

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)]">
          <Globe className="h-3 w-3 text-[oklch(0.85_0.18_195)]" />
          <span>UTC Clock · Greyline</span>
        </div>
        <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
          24h cycle
        </span>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: 56 }}>
        <canvas ref={canvasRef} className="rounded-md" />
      </div>
    </div>
  );
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
