"use client";

import { useEffect, useRef } from "react";
import { getAudioEngine } from "@/lib/sdr-audio";
import { useSdrStore } from "@/lib/sdr-store";
import { findStationAt, stationSignalAt } from "@/lib/sdr-engine";
import { AudioLines } from "lucide-react";
import { useRenderThrottle } from "@/lib/render-throttle";

/** Mini audio oscilloscope that reads the AudioEngine's analyser output. */
export function AudioOscilloscope({ height = 64 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const { shouldRender } = useRenderThrottle();
  const freq = useSdrStore((s) => s.frequency);
  const audioEnabled = useSdrStore((s) => s.audioEnabled);

  const stateRef = useRef({ height, audioEnabled, freq });
  useEffect(() => {
    stateRef.current = { height, audioEnabled, freq };
  }, [height, audioEnabled, freq]);

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
      const cssH = stateRef.current.height;
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

      // Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, cssH);
      bgGrad.addColorStop(0, "rgba(6, 10, 20, 0.95)");
      bgGrad.addColorStop(1, "rgba(4, 6, 14, 0.98)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, cssW, cssH);

      // Center line
      ctx.strokeStyle = "rgba(120, 200, 230, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cssH / 2);
      ctx.lineTo(cssW, cssH / 2);
      ctx.stroke();

      const engine = getAudioEngine();
      const data = engine.getOutputLevels();

      if (!stateRef.current.audioEnabled || !data) {
        // Flat line
        ctx.strokeStyle = "rgba(120, 200, 230, 0.25)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, cssH / 2);
        ctx.lineTo(cssW, cssH / 2);
        ctx.stroke();
      } else {
        // Draw frequency-domain audio visualization
        const bins = data.length;
        const step = Math.max(1, Math.floor(bins / cssW));
        ctx.lineWidth = 1.4;
        ctx.shadowColor = "rgba(80, 220, 255, 0.7)";
        ctx.shadowBlur = 6;
        ctx.strokeStyle = "rgba(150, 240, 255, 0.95)";
        ctx.beginPath();
        for (let x = 0; x < cssW; x++) {
          const start = x * step;
          const end = Math.min(bins, start + step);
          let max = 0;
          for (let i = start; i < end; i++) {
            if (data[i] > max) max = data[i];
          }
          const v = max / 255;
          const y = cssH - v * (cssH - 4) - 2;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="sdr-panel rounded-lg p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)]">
          <AudioLines className="h-3 w-3 text-[oklch(0.85_0.18_195)]" />
          <span>Audio Output</span>
        </div>
        <span className="text-[9px] sdr-mono text-[oklch(0.45_0.04_250)]">
          {audioEnabled ? "LIVE" : "MUTED"}
        </span>
      </div>
      <div ref={containerRef} className="w-full" style={{ height }}>
        <canvas ref={canvasRef} className="rounded-md" />
      </div>
    </div>
  );
}
