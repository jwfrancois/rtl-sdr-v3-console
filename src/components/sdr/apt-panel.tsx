"use client";

import { useEffect, useRef, useState } from "react";
import { onRealApt } from "@/lib/real-sdr/use-real-sdr";
import { useSdrStore } from "@/lib/sdr-store";
import type { AptState } from "@/lib/real-sdr/apt";
import { PIXELS_PER_LINE } from "@/lib/real-sdr/apt";
import { Satellite, Radio } from "lucide-react";

/**
 * APT image display — shows the live NOAA weather satellite image as
 * it's being decoded. Updates every 500 ms with the latest lines.
 *
 * Tune to 137.5 MHz (NOAA-19) or 137.1 MHz (NOAA-15) etc. — satellites
 * pass overhead every ~100 min. A full pass lasts ~12 min and produces
 * a ~1500-pixel-tall image of the Earth below.
 */
export function AptPanel() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const frequency = useSdrStore((s) => s.frequency);

  const [state, setState] = useState<AptState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const unsub = onRealApt((s) => setState({ ...s, buffer: s.buffer }));
    return unsub;
  }, []);

  // Redraw the image whenever state updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state || !state.buffer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const linesToShow = Math.min(state.lineCount, state.buffer.length / PIXELS_PER_LINE);
    canvas.width = PIXELS_PER_LINE;
    canvas.height = Math.max(1, linesToShow);
    // Build ImageData
    const imgData = ctx.createImageData(PIXELS_PER_LINE, linesToShow);
    for (let y = 0; y < linesToShow; y++) {
      for (let x = 0; x < PIXELS_PER_LINE; x++) {
        const v = Math.max(0, Math.min(1, state.buffer[y * PIXELS_PER_LINE + x]));
        const c = Math.round(v * 255);
        const idx = (y * PIXELS_PER_LINE + x) * 4;
        imgData.data[idx] = c;
        imgData.data[idx + 1] = c;
        imgData.data[idx + 2] = c;
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [state]);

  const inBand = frequency >= 137e6 && frequency <= 138e6;
  const shouldShow = backend === "real" && hwConnected && inBand;

  if (!shouldShow) {
    return (
      <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
            <Satellite className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
            <span>APT Weather Sat</span>
          </div>
          <span className="text-[10px] sdr-mono text-[oklch(0.5_0.04_250)]">
            {inBand ? "0 lines" : "Tune 137 MHz"}
          </span>
        </div>
        <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-2 leading-relaxed">
          Tune to a NOAA weather satellite frequency to decode live images:
          <div className="mt-2 space-y-0.5 text-[10px] sdr-mono">
            <div>• 137.100 MHz — NOAA-15</div>
            <div>• 137.9125 MHz — NOAA-18</div>
            <div>• 137.500 MHz — NOAA-19</div>
          </div>
          <div className="mt-2 text-[10px]">
            Satellites pass every ~100 min. Use{" "}
            <a href="https://www.n2yo.com/" target="_blank" rel="noopener noreferrer"
              className="text-[oklch(0.85_0.18_195)] underline decoration-dotted">
              N2YO.com
            </a>{" "}
            to track pass times.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Satellite className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>APT Weather Sat</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.85_0.18_195)]">
          {state?.lineCount ?? 0} lines · {state?.locked ? "LOCKED" : "searching…"}
        </span>
      </div>

      {state && state.lineCount > 0 ? (
        <div className="bg-black rounded-md overflow-hidden max-h-64 overflow-y-auto sdr-scroll">
          <canvas
            ref={canvasRef}
            className="w-full"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
      ) : (
        <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-8 text-center flex flex-col items-center gap-2">
          <Radio className="h-6 w-6 text-[oklch(0.65_0.04_250)] sdr-pulse" />
          <div>Searching for APT sync pattern…</div>
          <div className="text-[10px]">
            Make sure your antenna has a clear view of the sky.
          </div>
        </div>
      )}
    </div>
  );
}
