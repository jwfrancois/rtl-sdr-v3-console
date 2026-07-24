"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { formatFreqAxis, generateSpectrum } from "@/lib/sdr-engine";

interface Props {
  height?: number;
  onSeek?: (freqHz: number) => void;
  onHover?: (freqHz: number | null) => void;
}

const SIZE = 512;

export function SpectrumAnalyzer({ height = 220, onSeek, onHover }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSpectrumRef = useRef<Float32Array>(new Float32Array(SIZE));
  const smoothRef = useRef<Float32Array>(new Float32Array(SIZE).fill(-100));
  const peakRef = useRef<Float32Array>(new Float32Array(SIZE).fill(-100));
  const peakDecayRef = useRef<Float32Array>(new Float32Array(SIZE));
  const dragRef = useRef(false);

  // Subscribe to store values for both rendering and pointer math
  const frequency = useSdrStore((s) => s.frequency);
  const sampleRate = useSdrStore((s) => s.sampleRate);
  const gainDb = useSdrStore((s) => s.gainDb);
  const autoGain = useSdrStore((s) => s.autoGain);
  const bandwidth = useSdrStore((s) => s.bandwidth);
  const demod = useSdrStore((s) => s.demod);
  const running = useSdrStore((s) => s.running);
  const setFrequency = useSdrStore((s) => s.setFrequency);

  // Keep latest settings in a ref so the animation loop reads fresh values
  // without being recreated on every render.
  const stateRef = useRef({
    frequency, sampleRate, gainDb, autoGain, bandwidth, demod, running, height,
  });
  useEffect(() => {
    stateRef.current = {
      frequency, sampleRate, gainDb, autoGain, bandwidth, demod, running, height,
    };
  }, [frequency, sampleRate, gainDb, autoGain, bandwidth, demod, running, height]);

  // Single mount effect that owns the rAF loop.
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
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const s = stateRef.current;
      const now = performance.now();
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
      const smooth = smoothRef.current;
      const peaks = peakRef.current;
      const peakDecay = peakDecayRef.current;
      const attack = 0.55;
      const decay = 0.08;
      for (let i = 0; i < SIZE; i++) {
        const target = spec[i];
        if (target > smooth[i]) {
          smooth[i] += (target - smooth[i]) * attack;
        } else {
          smooth[i] += (target - smooth[i]) * decay;
        }
        if (smooth[i] > peaks[i]) {
          peaks[i] = smooth[i];
          peakDecay[i] = 0;
        } else {
          peakDecay[i] += 1;
          if (peakDecay[i] > 20) peaks[i] -= 0.2;
        }
      }

      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, cssH);
      bgGrad.addColorStop(0, "rgba(8, 14, 28, 0.95)");
      bgGrad.addColorStop(1, "rgba(4, 8, 18, 0.98)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, cssW, cssH);

      // Grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(120, 200, 230, 0.07)";
      ctx.font = "10px monospace";
      ctx.fillStyle = "rgba(140, 180, 200, 0.55)";
      const gridSteps = 5;
      for (let i = 0; i <= gridSteps; i++) {
        const y = (cssH - 18) * (i / gridSteps) + 8;
        ctx.beginPath();
        ctx.moveTo(28, y);
        ctx.lineTo(cssW - 8, y);
        ctx.stroke();
        const db = -100 + (100 * i) / gridSteps;
        ctx.fillText(`${db} dB`, 4, y + 3);
      }
      const halfBw = s.sampleRate / 2;
      const fStart = s.frequency - halfBw;
      const fEnd = s.frequency + halfBw;
      const desiredSteps = 8;
      const span = fEnd - fStart;
      const niceStep = niceNumber(span / desiredSteps);
      const firstTick = Math.ceil(fStart / niceStep) * niceStep;
      ctx.textAlign = "center";
      for (let f = firstTick; f < fEnd; f += niceStep) {
        const x = 28 + ((f - fStart) / span) * (cssW - 36);
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x, cssH - 18);
        ctx.stroke();
        ctx.fillText(formatFreqAxis(f), x, cssH - 5);
      }
      ctx.textAlign = "start";

      // Filter window
      const bwFrac = Math.min(0.95, s.bandwidth / s.sampleRate);
      const bwX = 28 + (0.5 - bwFrac / 2) * (cssW - 36);
      const bwW = bwFrac * (cssW - 36);
      const bwGrad = ctx.createLinearGradient(bwX, 0, bwX, cssH);
      bwGrad.addColorStop(0, "rgba(255, 200, 80, 0.06)");
      bwGrad.addColorStop(0.5, "rgba(255, 200, 80, 0.13)");
      bwGrad.addColorStop(1, "rgba(255, 200, 80, 0.04)");
      ctx.fillStyle = bwGrad;
      ctx.fillRect(bwX, 8, bwW, cssH - 16);
      ctx.strokeStyle = "rgba(255, 200, 80, 0.55)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(bwX, 8);
      ctx.lineTo(bwX, cssH - 8);
      ctx.moveTo(bwX + bwW, 8);
      ctx.lineTo(bwX + bwW, cssH - 8);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tuned frequency marker
      const centerX = 28 + 0.5 * (cssW - 36);
      ctx.strokeStyle = "rgba(255, 220, 120, 0.95)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, 4);
      ctx.lineTo(centerX, cssH - 16);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 220, 120, 0.95)";
      ctx.beginPath();
      ctx.moveTo(centerX, 2);
      ctx.lineTo(centerX - 5, 10);
      ctx.lineTo(centerX + 5, 10);
      ctx.closePath();
      ctx.fill();

      // Area fill
      const fillGrad = ctx.createLinearGradient(0, 0, 0, cssH);
      fillGrad.addColorStop(0, "rgba(80, 220, 255, 0.55)");
      fillGrad.addColorStop(0.5, "rgba(80, 220, 255, 0.20)");
      fillGrad.addColorStop(1, "rgba(80, 220, 255, 0.02)");
      ctx.beginPath();
      ctx.moveTo(28, cssH - 16);
      for (let i = 0; i < SIZE; i++) {
        const x = 28 + (i / (SIZE - 1)) * (cssW - 36);
        const t = Math.max(0, Math.min(1, (smooth[i] + 100) / 100));
        const y = cssH - 16 - t * (cssH - 24);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(cssW - 8, cssH - 16);
      ctx.lineTo(28, cssH - 16);
      ctx.closePath();
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Peak line
      ctx.beginPath();
      for (let i = 0; i < SIZE; i++) {
        const x = 28 + (i / (SIZE - 1)) * (cssW - 36);
        const t = Math.max(0, Math.min(1, (peaks[i] + 100) / 100));
        const y = cssH - 16 - t * (cssH - 24);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(255, 200, 80, 0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Spectrum line with glow
      ctx.shadowColor = "rgba(80, 220, 255, 0.7)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < SIZE; i++) {
        const x = 28 + (i / (SIZE - 1)) * (cssW - 36);
        const t = Math.max(0, Math.min(1, (smooth[i] + 100) / 100));
        const y = cssH - 16 - t * (cssH - 24);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(150, 240, 255, 0.95)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Mode label
      ctx.fillStyle = "rgba(180, 220, 255, 0.85)";
      ctx.font = "11px monospace";
      ctx.fillText(
        `${s.demod} • BW ${(s.bandwidth / 1e3).toFixed(1)} kHz • SR ${(s.sampleRate / 1e6).toFixed(2)} Msps`,
        32,
        22,
      );

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
