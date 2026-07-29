"use client";

import { useEffect, useRef } from "react";
import { getAudioEngine } from "@/lib/sdr-audio";
import { useSdrStore } from "@/lib/sdr-store";
import { PausedCanvas } from "./paused-canvas";
import { useNonEssentialThrottle } from "@/lib/render-throttle";
import { Disc3 } from "lucide-react";

/**
 * Circular Audio Visualizer — a spinning radial frequency display
 * that reacts to the live audio output. Like a vintage VU meter crossed
 * with a spectrum analyzer, rendered as a circular oscilloscope.
 *
 * Draws 64 frequency bars arranged in a circle, each bar's length
 * proportional to the power at that frequency bin from the Web Audio
 * AnalyserNode. The whole visualization rotates slowly for a
 * hypnotic, magical effect.
 *
 * Uses the audio engine's built-in AnalyserNode — zero extra processing.
 */

export function CircularVisualizer({ size = 120 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const rotationRef = useRef(0);
  const { shouldRender, isActive } = useNonEssentialThrottle();
  const audioEnabled = useSdrStore((s) => s.audioEnabled);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      if (!shouldRender()) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const cssSize = size;
      if (canvas.width !== cssSize * dpr) {
        canvas.width = cssSize * dpr;
        canvas.height = cssSize * dpr;
        canvas.style.width = `${cssSize}px`;
        canvas.style.height = `${cssSize}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssSize, cssSize);

      const cx = cssSize / 2;
      const cy = cssSize / 2;
      const innerR = cssSize * 0.22;
      const maxBarLen = cssSize * 0.25;

      // Get audio frequency data
      const engine = getAudioEngine();
      const freqData = engine.getOutputLevels();
      const bins = 32;

      // Rotation
      rotationRef.current += 0.005;

      // Draw bars
      for (let i = 0; i < bins; i++) {
        const angle = (i / bins) * Math.PI * 2 + rotationRef.current;
        let val = 0;
        if (freqData && audioEnabled) {
          // Sample frequency data logarithmically
          const idx = Math.floor(Math.pow(i / bins, 2) * (freqData.length * 0.5));
          val = freqData[idx] / 255;
        }

        const barLen = val * maxBarLen + 2;
        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * (innerR + barLen);
        const y2 = cy + Math.sin(angle) * (innerR + barLen);

        // Color gradient based on frequency
        const hue = (i / bins) * 360 + rotationRef.current * 50;
        const r = Math.floor(128 + 127 * Math.sin(hue * Math.PI / 180));
        const g = Math.floor(128 + 127 * Math.sin((hue + 120) * Math.PI / 180));
        const b = Math.floor(128 + 127 * Math.sin((hue + 240) * Math.PI / 180));

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.4 + val * 0.6})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
        ctx.shadowBlur = val > 0.3 ? 6 : 0;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // Center circle
      ctx.fillStyle = "rgba(10, 14, 26, 0.8)";
      ctx.beginPath();
      ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
      ctx.fill();

      // Center glow when audio is active
      if (audioEnabled && freqData) {
        let avg = 0;
        for (let i = 0; i < freqData.length; i += 8) avg += freqData[i];
        avg = avg / (freqData.length / 8) / 255;
        ctx.fillStyle = `rgba(0, 212, 255, ${0.15 + avg * 0.3})`;
        ctx.shadowColor = "rgba(0, 212, 255, 0.6)";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, cy, innerR - 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [shouldRender, audioEnabled, size]);

  if (!isActive) {
    return (
      <div className="sdr-panel rounded-xl p-4">
        <PausedCanvas label="Visualizer" />
      </div>
    );
  }
  return (
    <div className="sdr-panel rounded-lg p-2 flex flex-col items-center">
      <div className="flex items-center gap-1.5 mb-1 text-[9px] uppercase tracking-widest text-[oklch(0.55_0.04_250)]">
        <Disc3 className="h-2.5 w-2.5 text-[oklch(0.85_0.18_195)] sdr-spin-slow" />
        <span>Visualizer</span>
      </div>
      <canvas ref={canvasRef} className="rounded-full" />
    </div>
  );
}
