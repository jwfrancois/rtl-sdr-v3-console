"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import {
  dbToWaterfall,
  formatFreqAxis,
  generateSpectrum,
  waterfallColor,
} from "@/lib/sdr-engine";

interface Props {
  height?: number;
  onSeek?: (freqHz: number) => void;
  onHover?: (freqHz: number | null) => void;
}

const SIZE = 512;

export function WaterfallDisplay({ height = 280, onSeek, onHover }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSpectrumRef = useRef<Float32Array>(new Float32Array(SIZE));
  const lastDrawTimeRef = useRef(0);
  const dragRef = useRef(false);

  const frequency = useSdrStore((s) => s.frequency);
  const sampleRate = useSdrStore((s) => s.sampleRate);
  const gainDb = useSdrStore((s) => s.gainDb);
  const autoGain = useSdrStore((s) => s.autoGain);
  const bandwidth = useSdrStore((s) => s.bandwidth);
  const running = useSdrStore((s) => s.running);
  const setFrequency = useSdrStore((s) => s.setFrequency);

  const stateRef = useRef({
    frequency, sampleRate, gainDb, autoGain, bandwidth, running, height,
  });
  useEffect(() => {
    stateRef.current = {
      frequency, sampleRate, gainDb, autoGain, bandwidth, running, height,
    };
  }, [frequency, sampleRate, gainDb, autoGain, bandwidth, running, height]);

  useEffect(() => {
    const draw = () => {
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
        const ctx0 = canvas.getContext("2d");
        if (ctx0) {
          ctx0.fillStyle = "#04060c";
          ctx0.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const now = performance.now();
      const dt = now - lastDrawTimeRef.current;
      // Throttle to ~40 FPS for the waterfall — smoother & lighter
      if (dt > 24) {
        lastDrawTimeRef.current = now;

        const s = stateRef.current;

        // Slide existing content down
        const slide = 2;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(
          canvas,
          0,
          0,
          canvas.width,
          canvas.height - slide * dpr,
          0,
          slide * dpr,
          canvas.width,
          canvas.height - slide * dpr,
        );
        ctx.globalCompositeOperation = "source-over";
        ctx.restore();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (s.running) {
          const effGain = s.autoGain ? 35 : s.gainDb;
          lastSpectrumRef.current = generateSpectrum(
            s.frequency,
            s.sampleRate,
            effGain,
            SIZE,
            now,
          );
        }
        const spec = lastSpectrumRef.current;

        const left = 28;
        const right = 8;
        const plotW = cssW - left - right;
        const rowH = slide + 1;
        const imgData = ctx.createImageData(
          Math.ceil(plotW * dpr),
          Math.ceil(rowH * dpr),
        );
        const data = imgData.data;
        const w = imgData.width;
        for (let px = 0; px < w; px++) {
          const frac = px / (w - 1);
          const bin = Math.min(SIZE - 1, Math.floor(frac * (SIZE - 1)));
          const t = dbToWaterfall(spec[bin]);
          const [r, g, b] = waterfallColor(t);
          for (let py = 0; py < imgData.height; py++) {
            const idx = (py * w + px) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
        const offscreen = document.createElement("canvas");
        offscreen.width = imgData.width;
        offscreen.height = imgData.height;
        const offCtx = offscreen.getContext("2d")!;
        offCtx.putImageData(imgData, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          offscreen,
          0,
          0,
          imgData.width,
          imgData.height,
          left,
          0,
          plotW,
          rowH,
        );

        // Overlay gridlines & labels
        ctx.fillStyle = "rgba(4, 6, 12, 0.92)";
        ctx.fillRect(0, 0, 28, cssH);
        ctx.fillRect(cssW - 8, 0, 8, cssH);

        const bwFrac = Math.min(0.95, s.bandwidth / s.sampleRate);
        const bwX = 28 + (0.5 - bwFrac / 2) * (cssW - 36);
        const bwW = bwFrac * (cssW - 36);
        ctx.strokeStyle = "rgba(255, 200, 80, 0.55)";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bwX, 0);
        ctx.lineTo(bwX, cssH);
        ctx.moveTo(bwX + bwW, 0);
        ctx.lineTo(bwX + bwW, cssH);
        ctx.stroke();
        ctx.setLineDash([]);

        const centerX = 28 + 0.5 * (cssW - 36);
        ctx.strokeStyle = "rgba(255, 220, 120, 0.85)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, cssH);
        ctx.stroke();

        // Frequency axis labels at bottom
        const halfBw = s.sampleRate / 2;
        const fStart = s.frequency - halfBw;
        const fEnd = s.frequency + halfBw;
        const span = fEnd - fStart;
        const desiredSteps = 8;
        const niceStep = niceNumber(span / desiredSteps);
        const firstTick = Math.ceil(fStart / niceStep) * niceStep;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(4, 6, 12, 0.95)";
        ctx.fillRect(0, cssH - 14, cssW, 14);
        ctx.fillStyle = "rgba(200, 220, 240, 0.85)";
        ctx.font = "10px monospace";
        for (let f = firstTick; f < fEnd; f += niceStep) {
          const x = 28 + ((f - fStart) / span) * (cssW - 36);
          ctx.fillText(formatFreqAxis(f), x, cssH - 4);
        }
        ctx.textAlign = "start";
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handlePointer = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return undefined;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const frac = (x - 28) / (rect.width - 36);
      const halfBw = sampleRate / 2;
      const f = frequency - halfBw + frac * sampleRate;
      return f;
    },
    [frequency, sampleRate],
  );

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="rounded-lg cursor-crosshair touch-none"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          dragRef.current = true;
          const f = handlePointer(e);
          if (f) {
            setFrequency(f);
            onSeek?.(f);
          }
        }}
        onPointerMove={(e) => {
          const f = handlePointer(e);
          if (f) onHover?.(f);
          if (dragRef.current && f) {
            setFrequency(f);
            onSeek?.(f);
          }
        }}
        onPointerUp={(e) => {
          dragRef.current = false;
          (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        }}
        onPointerLeave={() => onHover?.(null)}
      />
    </div>
  );
}

function niceNumber(value: number): number {
  const exp = Math.floor(Math.log10(value));
  const f = value / Math.pow(10, exp);
  let nice;
  if (f < 1.5) nice = 1;
  else if (f < 3) nice = 2;
  else if (f < 7) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}
