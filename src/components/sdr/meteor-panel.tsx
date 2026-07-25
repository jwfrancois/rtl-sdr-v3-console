"use client";

import { useEffect, useRef, useState } from "react";
import { onRealMeteor } from "@/lib/real-sdr/use-real-sdr";
import { useSdrStore } from "@/lib/sdr-store";
import type { MeteorState } from "@/lib/real-sdr/meteor";
import { Satellite, Activity, Download } from "lucide-react";

/**
 * Meteor M2 LRPT decoder panel.
 *
 * Russian Meteor M2 satellites transmit compressed digital weather
 * images at 137.1 / 137.9 MHz. This panel shows decode status, signal
 * quality (EVM), and accumulated CADU frames.
 *
 * Note: full image decompression requires JPEG-LS which is out of
 * scope — we save the raw CADU bytes for offline analysis.
 */
export function MeteorPanel() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const frequency = useSdrStore((s) => s.frequency);

  const [state, setState] = useState<MeteorState | null>(null);
  const downloadRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const unsub = onRealMeteor((s) => setState({ ...s, buffer: s.buffer }));
    return unsub;
  }, []);

  const inBand = frequency >= 137e6 && frequency <= 138e6;
  // APT and Meteor overlap at 137.1 and 137.9 — show Meteor when not on a NOAA freq
  const isNoaaApt = [137.1e6, 137.5e6, 137.9125e6, 137.4e6].some(
    (f) => Math.abs(frequency - f) < 50e3,
  );
  const shouldShow = backend === "real" && hwConnected && inBand && !isNoaaApt;

  if (!shouldShow) return null;

  const handleDownload = () => {
    if (!state?.buffer || state.buffer.length === 0) return;
    const blob = new Blob([state.buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    if (downloadRef.current) {
      downloadRef.current.href = url;
      downloadRef.current.download = `meteor-cadu-${Date.now()}.bin`;
      downloadRef.current.click();
    }
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Satellite className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Meteor M2 LRPT</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.85_0.18_195)]">
          {state?.locked ? "LOCKED" : "searching…"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px] sdr-mono">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
            CADU Frames
          </span>
          <span className="text-[12px] text-[oklch(0.92_0.04_195)]">
            {state?.frameCount ?? 0}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
            Bytes
          </span>
          <span className="text-[12px] text-[oklch(0.92_0.04_195)]">
            {((state?.totalBytes ?? 0) / 1e6).toFixed(2)} MB
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
            EVM
          </span>
          <span className="text-[12px] text-[oklch(0.85_0.18_195)]">
            {(state?.evm ?? 0).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="mt-3 text-[10px] text-[oklch(0.55_0.04_250)] leading-relaxed">
        QPSK @ 72 kbps. Decompression (JPEG-LS) is out of scope — saving
        raw CADU frames for offline processing.
      </div>

      {state && state.frameCount > 0 && (
        <button
          type="button"
          onClick={handleDownload}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-[oklch(0.85_0.18_195/0.14)] border border-[oklch(0.85_0.18_195/0.35)] text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.85_0.18_195/0.22)] text-[10px] sdr-mono transition-all"
        >
          <Download className="h-3 w-3" />
          DOWNLOAD CADU ({((state.totalBytes) / 1e6).toFixed(1)} MB)
        </button>
      )}
      <a ref={downloadRef} className="hidden" />
    </div>
  );
}
