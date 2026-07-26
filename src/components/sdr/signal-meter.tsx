"use client";

import { useEffect, useRef } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { findStationAt, stationSignalAt } from "@/lib/sdr-engine";
import { Signal } from "lucide-react";
import { useRenderThrottle } from "@/lib/render-throttle";

const S_POINTS = ["S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "+10", "+20", "+30", "+40", "+50", "+60"];

function levelToS(level: number): number {
  if (level <= 0) return 0;
  const t = Math.sqrt(level);
  return Math.min(15, Math.max(0, t * 15));
}

interface Props {
  level?: number;
}

export function SignalMeter({ level }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const { shouldRender } = useRenderThrottle();
  const smoothedRef = useRef(0);

  const frequency = useSdrStore((s) => s.frequency);
  const squelch = useSdrStore((s) => s.squelch);

  const stateRef = useRef({ frequency, squelch, level });
  useEffect(() => {
    stateRef.current = { frequency, squelch, level };
  }, [frequency, squelch, level]);

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

      const s = stateRef.current;
      let target = s.level ?? 0;
      if (s.level === undefined) {
        const st = findStationAt(s.frequency);
        if (st) target = stationSignalAt(st, s.frequency);
        target = Math.max(0, target + (Math.random() - 0.5) * 0.04);
      }
      const cur = smoothedRef.current;
      const next = cur + (target - cur) * 0.18;
      smoothedRef.current = next;

      // Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, cssH);
      bgGrad.addColorStop(0, "rgba(8, 14, 28, 0.95)");
      bgGrad.addColorStop(1, "rgba(4, 8, 18, 0.98)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, cssW, cssH);

      // Squelch threshold marker
      const sqX = 12 + s.squelch * (cssW - 24);
      ctx.strokeStyle = "rgba(255, 120, 120, 0.5)";
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(sqX, 4);
      ctx.lineTo(sqX, cssH - 16);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tick marks & labels
      ctx.fillStyle = "rgba(150, 180, 200, 0.4)";
      ctx.font = "8px monospace";
      const tickCount = S_POINTS.length;
      for (let i = 0; i < tickCount; i++) {
        const x = 12 + (i / (tickCount - 1)) * (cssW - 24);
        const isMajor = i % 2 === 0;
        ctx.strokeStyle = i >= 9
          ? "rgba(255, 200, 80, 0.5)"
          : "rgba(140, 200, 230, 0.35)";
        ctx.beginPath();
        ctx.moveTo(x, cssH - 14);
        ctx.lineTo(x, cssH - (isMajor ? 9 : 11));
        ctx.stroke();
        if (isMajor) {
          ctx.textAlign = "center";
          ctx.fillText(S_POINTS[i], x, cssH - 2);
        }
      }
      ctx.textAlign = "start";

      // Meter fill
      const meterX = 12;
      const meterW = cssW - 24;
      const meterY = 6;
      const meterH = cssH - 22;
      const fillW = Math.max(0, Math.min(1, next)) * meterW;

      ctx.fillStyle = "rgba(40, 50, 70, 0.5)";
      ctx.fillRect(meterX, meterY, meterW, meterH);

      const fillGrad = ctx.createLinearGradient(meterX, 0, meterX + meterW, 0);
      fillGrad.addColorStop(0, "rgba(60, 200, 110, 0.85)");
      fillGrad.addColorStop(0.55, "rgba(255, 220, 80, 0.9)");
      fillGrad.addColorStop(0.85, "rgba(255, 140, 60, 0.95)");
      fillGrad.addColorStop(1, "rgba(255, 80, 80, 1)");
      ctx.fillStyle = fillGrad;
      ctx.fillRect(meterX, meterY, fillW, meterH);

      if (fillW > 4) {
        ctx.shadowColor = "rgba(255, 220, 120, 0.9)";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "rgba(255, 240, 180, 0.9)";
        ctx.fillRect(meterX + fillW - 2, meterY, 2, meterH);
        ctx.shadowBlur = 0;
      }

      const sIdx = Math.round(levelToS(next));
      const sLabel = S_POINTS[Math.max(0, Math.min(15, sIdx))];
      ctx.fillStyle = "rgba(200, 230, 255, 0.85)";
      ctx.font = "10px monospace";
      ctx.fillText(sLabel, 14, 16);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Signal className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Signal Strength</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.55_0.04_250)]">S-Meter</span>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: 48 }}>
        <canvas ref={canvasRef} className="rounded-md" />
      </div>
    </div>
  );
}
