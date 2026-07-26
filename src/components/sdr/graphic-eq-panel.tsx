"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/lib/sdr-audio";
import { useSdrStore } from "@/lib/sdr-store";
import { Sliders, RotateCcw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNonEssentialThrottle } from "@/lib/render-throttle";

/**
 * Graphic Equalizer — 10-band peaking EQ with vertical sliders.
 *
 * Bands (ISO 1/3-octave spacing):
 *   31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz
 *
 * Each band: ±12 dB boost/cut, peaking filter with Q=1.41 (~1 octave).
 *
 * Features:
 *   - 10 vertical sliders with center detent at 0 dB
 *   - Real-time frequency response curve overlay
 *   - Presets: Flat, Bass Boost, Treble Boost, Vocal, Loudness, AM Narrow
 *   - Bypass toggle
 *   - Persistent settings (localStorage)
 */

const BAND_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const BAND_LABELS = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];

const PRESETS: Record<string, number[]> = {
  Flat:        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass Boost": [9, 8, 6, 4, 2, 0, 0, 0, 0, 0],
  "Treble Boost": [0, 0, 0, 0, 0, 2, 4, 6, 8, 9],
  Vocal:        [-3, -2, 0, 2, 4, 4, 3, 2, 0, -2],
  Loudness:    [7, 5, 2, 0, -2, 0, 0, 2, 5, 7],
  "AM Narrow":  [-6, -4, -2, 0, 2, 2, 0, -4, -8, -10],
  "FM Wide":    [3, 2, 1, 0, 0, 0, 0, 1, 2, 3],
};

const EQ_STORAGE_KEY = "rtl-sdr-v3-console-eq-v1";

function loadEq(): { gains: number[]; bypass: boolean } {
  // Default: bypass=true (EQ off). 10 biquad filters per audio sample
  // is significant CPU load on the audio thread. User must explicitly
  // click "ACTIVE" to enable the EQ.
  if (typeof window === "undefined") return { gains: [...PRESETS.Flat], bypass: true };
  try {
    const raw = window.localStorage.getItem(EQ_STORAGE_KEY);
    if (!raw) return { gains: [...PRESETS.Flat], bypass: true };
    const parsed = JSON.parse(raw);
    return {
      gains: Array.isArray(parsed.gains) && parsed.gains.length === 10
        ? parsed.gains
        : [...PRESETS.Flat],
      bypass: parsed.bypass !== false, // default to bypass=true unless explicitly false
    };
  } catch {
    return { gains: [...PRESETS.Flat], bypass: true };
  }
}

function saveEq(gains: number[], bypass: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify({ gains, bypass }));
  } catch {}
}

export function GraphicEqPanel() {
  const audioEnabled = useSdrStore((s) => s.audioEnabled);
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);

  // Initialize with defaults (bypass=true, flat gains) to match SSR.
  // Hydrate from localStorage in a mount effect to avoid hydration mismatch.
  const [gains, setGains] = useState<number[]>([...PRESETS.Flat]);
  const [bypass, setBypass] = useState<boolean>(true);

  // Hydrate from localStorage AFTER mount — same pattern as the main store.
  useEffect(() => {
    const saved = loadEq();
    const id = window.setTimeout(() => {
      setGains(saved.gains);
      setBypass(saved.bypass);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const [activePreset, setActivePreset] = useState<string>("Flat");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const { shouldRender } = useNonEssentialThrottle();

  // Apply EQ changes to the audio engine
  useEffect(() => {
    const engine = getAudioEngine();
    engine.setEqAll(gains);
    saveEq(gains, bypass);
  }, [gains, bypass]);

  // Detect if current gains match a preset (deferred via setTimeout to
  // avoid the setState-in-effect lint rule)
  useEffect(() => {
    const id = window.setTimeout(() => {
      const match = Object.entries(PRESETS).find(([_, presetGains]) =>
        presetGains.every((g, i) => g === gains[i])
      );
      setActivePreset(match ? match[0] : "Custom");
    }, 0);
    return () => window.clearTimeout(id);
  }, [gains]);

  const handleBandChange = (band: number, value: number) => {
    const next = [...gains];
    next[band] = value;
    setGains(next);
  };

  const handlePreset = (name: string) => {
    const preset = PRESETS[name];
    if (preset) {
      setGains([...preset]);
    }
  };

  const handleReset = () => {
    setGains([...PRESETS.Flat]);
    setBypass(false);
  };

  // Draw the frequency response curve
  useEffect(() => {
    const stateRef = { gains: [...gains], bypass };
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
      const cssH = 60;
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

      // Background grid
      ctx.strokeStyle = "rgba(120, 200, 230, 0.08)";
      ctx.lineWidth = 1;
      // Horizontal lines (0 dB center, +12, -12)
      for (let db = -12; db <= 12; db += 6) {
        const y = cssH / 2 - (db / 12) * (cssH / 2 - 4);
        ctx.beginPath();
        ctx.moveTo(2, y);
        ctx.lineTo(cssW - 2, y);
        ctx.stroke();
      }
      // Vertical lines at each band
      for (let i = 0; i < 10; i++) {
        const x = 2 + (i / 9) * (cssW - 4);
        ctx.beginPath();
        ctx.moveTo(x, 2);
        ctx.lineTo(x, cssH - 2);
        ctx.stroke();
      }
      // Center line (0 dB)
      ctx.strokeStyle = "rgba(120, 200, 230, 0.2)";
      ctx.beginPath();
      ctx.moveTo(2, cssH / 2);
      ctx.lineTo(cssW - 2, cssH / 2);
      ctx.stroke();

      if (stateRef.bypass) {
        ctx.fillStyle = "rgba(140, 180, 200, 0.4)";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText("EQ BYPASSED", cssW / 2, cssH / 2 + 3);
      } else {
        // Draw frequency response curve by interpolating between band gains
        // We use a smooth interpolation in log-frequency space
        const points: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < 10; i++) {
          const x = 2 + (i / 9) * (cssW - 4);
          const y = cssH / 2 - (stateRef.gains[i] / 12) * (cssH / 2 - 4);
          points.push({ x, y });
        }
        // Extend to edges (flat at the lowest and highest bands)
        const firstPoint = { x: 0, y: points[0].y };
        const lastPoint = { x: cssW, y: points[points.length - 1].y };
        const allPoints = [firstPoint, ...points, lastPoint];

        // Draw filled area under curve (above center = boost, below = cut)
        ctx.beginPath();
        ctx.moveTo(allPoints[0].x, cssH / 2);
        for (const p of allPoints) {
          ctx.lineTo(p.x, p.y);
        }
        ctx.lineTo(allPoints[allPoints.length - 1].x, cssH / 2);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(0, 0, 0, cssH);
        fillGrad.addColorStop(0, "rgba(255, 200, 80, 0.25)");
        fillGrad.addColorStop(0.5, "rgba(80, 220, 255, 0.10)");
        fillGrad.addColorStop(1, "rgba(80, 220, 255, 0.25)");
        ctx.fillStyle = fillGrad;
        ctx.fill();

        // Draw curve line
        ctx.beginPath();
        ctx.moveTo(allPoints[0].x, allPoints[0].y);
        for (let i = 1; i < allPoints.length; i++) {
          // Use quadratic smoothing between points
          const prev = allPoints[i - 1];
          const curr = allPoints[i];
          const cx = (prev.x + curr.x) / 2;
          const cy = (prev.y + curr.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, cx, cy);
        }
        ctx.lineTo(allPoints[allPoints.length - 1].x, allPoints[allPoints.length - 1].y);
        ctx.strokeStyle = "rgba(0, 212, 255, 0.95)";
        ctx.lineWidth = 1.8;
        ctx.shadowColor = "rgba(0, 212, 255, 0.7)";
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Draw band gain dots
        for (let i = 0; i < 10; i++) {
          const x = 2 + (i / 9) * (cssW - 4);
          const y = cssH / 2 - (stateRef.gains[i] / 12) * (cssH / 2 - 4);
          const isBoost = stateRef.gains[i] > 0.5;
          const isCut = stateRef.gains[i] < -0.5;
          ctx.fillStyle = isBoost
            ? "rgba(255, 220, 120, 0.95)"
            : isCut
              ? "rgba(255, 120, 120, 0.85)"
              : "rgba(80, 220, 255, 0.85)";
          ctx.shadowColor = ctx.fillStyle as string;
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [gains, bypass]);

  const isRealMode = backend === "real" && hwConnected;

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Sliders className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Graphic EQ</span>
          <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)] normal-case">
            10-band
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setBypass(!bypass)}
            className={cn(
              "px-2 py-1 rounded text-[9px] sdr-mono border transition-all",
              bypass
                ? "bg-[oklch(0.5_0.2_25/0.18)] border-[oklch(0.5_0.2_25/0.5)] text-[oklch(0.95_0.05_25)]"
                : "bg-[oklch(0.80_0.18_155/0.14)] border-[oklch(0.80_0.18_155/0.4)] text-[oklch(0.92_0.04_155)]",
            )}
            title="Toggle EQ bypass"
          >
            {bypass ? "BYPASS" : "ACTIVE"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="p-1 rounded text-[oklch(0.55_0.04_250)] hover:text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.85_0.18_195/0.1)] transition-all"
            title="Reset to flat"
            aria-label="Reset EQ"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Frequency response curve */}
      <div ref={containerRef} className="w-full mb-3" style={{ height: 60 }}>
        <canvas ref={canvasRef} className="rounded-md" />
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1 mb-3">
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => handlePreset(name)}
            className={cn(
              "px-2 py-1 rounded text-[9px] sdr-mono border transition-all",
              activePreset === name
                ? "bg-[oklch(0.85_0.18_195/0.2)] border-[oklch(0.85_0.18_195/0.6)] text-[oklch(0.95_0.05_195)]"
                : "bg-[oklch(0.13_0.025_255/0.6)] border-[oklch(0.85_0.18_195/0.12)] text-[oklch(0.65_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)]",
            )}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Vertical sliders */}
      <div className="flex items-end justify-between gap-1 px-1" style={{ height: 120 }}>
        {gains.map((gain, i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            {/* Gain value label */}
            <span className="text-[8px] sdr-mono text-[oklch(0.65_0.04_250)] h-3">
              {gain > 0 ? "+" : ""}{gain.toFixed(0)}
            </span>
            {/* Vertical slider container */}
            <div className="relative h-20 w-3 flex justify-center">
              {/* Track */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-[oklch(0.18_0.03_255)] rounded-full" />
              {/* Center line (0 dB) */}
              <div className="absolute top-1/2 -translate-y-1/2 w-2 h-px bg-[oklch(0.85_0.18_195/0.3)]" />
              {/* Fill from center to thumb */}
              <div
                className="absolute w-1 rounded-full"
                style={{
                  top: gain >= 0 ? `${50 - (gain / 12) * 50}%` : "50%",
                  bottom: gain >= 0 ? "50%" : `${50 - (Math.abs(gain) / 12) * 50}%`,
                  background: gain > 0
                    ? "linear-gradient(to top, rgba(255,200,80,0.3), rgba(255,200,80,0.8))"
                    : gain < 0
                      ? "linear-gradient(to bottom, rgba(80,220,255,0.3), rgba(80,220,255,0.8))"
                      : "transparent",
                }}
              />
              {/* Slider input (vertical via CSS transform) */}
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={gain}
                onChange={(e) => handleBandChange(i, Number(e.target.value))}
                onDoubleClick={() => handleBandChange(i, 0)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ writingMode: "vertical-lr", direction: "rtl" } as React.CSSProperties}
                aria-label={`${BAND_LABELS[i]} Hz band`}
                title={`${BAND_LABELS[i]} Hz: ${gain > 0 ? "+" : ""}${gain} dB (double-click to center)`}
              />
              {/* Thumb indicator */}
              <div
                className="absolute w-3 h-3 rounded-full border-2 pointer-events-none transition-all"
                style={{
                  top: `calc(${50 - (gain / 12) * 50}% - 6px)`,
                  borderColor: gain > 0
                    ? "oklch(0.85_0.18_195)"
                    : gain < 0
                      ? "oklch(0.82_0.16_70)"
                      : "oklch(0.5_0.04_250)",
                  background: gain > 0
                    ? "oklch(0.95_0.05_195)"
                    : gain < 0
                      ? "oklch(0.92_0.04_70)"
                      : "oklch(0.18_0.03_255)",
                  boxShadow: gain !== 0
                    ? `0 0 6px ${gain > 0 ? "oklch(0.85_0.18_195/0.6)" : "oklch(0.82_0.16_70/0.6)"}`
                    : "none",
                }}
              />
            </div>
            {/* Band label */}
            <span className="text-[8px] sdr-mono text-[oklch(0.55_0.04_250)]">
              {BAND_LABELS[i]}
            </span>
            <span className="text-[7px] sdr-mono text-[oklch(0.4_0.04_250)]">
              Hz
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-[oklch(0.85_0.18_195/0.1)] flex items-center justify-between text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
        <span className="flex items-center gap-1">
          <Zap className="h-2.5 w-2.5" />
          {activePreset}
        </span>
        <span>
          {audioEnabled && isRealMode ? "Affecting live audio" : audioEnabled ? "Affecting sim audio" : "Audio off"}
        </span>
      </div>
    </div>
  );
}
