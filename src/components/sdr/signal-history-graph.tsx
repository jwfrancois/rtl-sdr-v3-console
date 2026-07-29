"use client";

import { useEffect, useRef, useState } from "react";
import { onRealSpectrum } from "@/lib/real-sdr/use-real-sdr";
import { PausedCanvas } from "./paused-canvas";
import { useNonEssentialThrottle } from "@/lib/render-throttle";
import { TrendingUp } from "lucide-react";

/**
 * Signal History Graph — tracks signal strength over time.
 *
 * Shows a rolling 60-second chart of the peak signal in the demod
 * bandwidth. Useful for DXing: watch the graph to see when propagation
 * opens (signal rises) or closes (signal fades).
 *
 * Also shows min/max/avg stats for the current session.
 */

const HISTORY_SECONDS = 60;
const SAMPLE_HZ = 4; // sample 4 times per second
const MAX_SAMPLES = HISTORY_SECONDS * SAMPLE_HZ;

export function SignalHistoryGraph() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const { shouldRender, isActive } = useNonEssentialThrottle();
  const historyRef = useRef<number[]>([]);
  const lastSampleRef = useRef(0);
  const [stats, setStats] = useState({ min: -100, max: -100, avg: -100 });

  // Sample signal strength from spectrum data
  useEffect(() => {
    const unsub = onRealSpectrum((data, fc, sr) => {
      const now = performance.now();
      if (now - lastSampleRef.current < 250) return; // 4 Hz
      lastSampleRef.current = now;

      // Find peak in the center 20% of the spectrum (demod bandwidth)
      const n = data.length;
      const start = Math.floor(n * 0.4);
      const end = Math.floor(n * 0.6);
      let peak = -200;
      for (let i = start; i < end; i++) {
        if (data[i] > peak) peak = data[i];
      }

      historyRef.current.push(peak);
      if (historyRef.current.length > MAX_SAMPLES) {
        historyRef.current.shift();
      }

      // Update stats (throttled)
      const h = historyRef.current;
      if (h.length > 10) {
        let min = 0, max = 0, sum = 0;
        for (const v of h) { min = Math.min(min || v, v); max = Math.max(max, v); sum += v; }
        setStats({ min, max, avg: sum / h.length });
      }
    });
    return unsub;
  }, []);

  // Draw the graph
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      if (!shouldRender()) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const cssW = container.clientWidth;
      const cssH = 48;
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

      const history = historyRef.current;
      if (history.length < 2) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Background
      ctx.fillStyle = "rgba(8, 14, 28, 0.9)";
      ctx.fillRect(0, 0, cssW, cssH);

      // Grid lines at -30, -60, -90 dBFS
      ctx.strokeStyle = "rgba(120, 200, 230, 0.08)";
      ctx.lineWidth = 1;
      ctx.font = "7px monospace";
      ctx.fillStyle = "rgba(140, 180, 200, 0.3)";
      for (const db of [-30, -60, -90]) {
        const y = cssH - ((db + 120) / 120) * cssH;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cssW, y);
        ctx.stroke();
        ctx.fillText(`${db}`, 2, y - 1);
      }

      // Draw the signal trace
      const stepX = cssW / MAX_SAMPLES;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const x = i * stepX;
        const y = cssH - ((history[i] + 120) / 120) * cssH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      // Fill under the curve
      ctx.lineTo(history.length * stepX, cssH);
      ctx.lineTo(0, cssH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, cssH);
      grad.addColorStop(0, "rgba(0, 212, 255, 0.3)");
      grad.addColorStop(1, "rgba(0, 212, 255, 0.02)");
      ctx.fillStyle = grad;
      ctx.fill();

      // Stroke the line
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const x = i * stepX;
        const y = cssH - ((history[i] + 120) / 120) * cssH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(0, 212, 255, 0.9)";
      ctx.lineWidth = 1.2;
      ctx.shadowColor = "rgba(0, 212, 255, 0.5)";
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [shouldRender]);

  if (!isActive) {
    return (
      <div className="sdr-panel rounded-xl p-4">
        <PausedCanvas label="Signal History" />
      </div>
    );
  }
  return (
    <div className="sdr-panel rounded-lg p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)]">
          <TrendingUp className="h-3 w-3 text-[oklch(0.85_0.18_195)]" />
          <span>Signal History · 60s</span>
        </div>
        <div className="flex items-center gap-3 text-[9px] sdr-mono">
          <span className="text-[oklch(0.80_0.18_155)]">min {stats.min.toFixed(0)}</span>
          <span className="text-[oklch(0.85_0.18_195)]">avg {stats.avg.toFixed(0)}</span>
          <span className="text-[oklch(0.82_0.16_70)]">max {stats.max.toFixed(0)}</span>
        </div>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: 48 }}>
        <canvas ref={canvasRef} className="rounded-md" />
      </div>
    </div>
  );
}
