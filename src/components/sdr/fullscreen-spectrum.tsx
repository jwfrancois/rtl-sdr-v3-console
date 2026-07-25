"use client";

import { useEffect } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { SpectrumAnalyzer } from "./spectrum-analyzer";
import { WaterfallDisplay } from "./waterfall-display";
import { RdsOverlay } from "./rds-overlay";
import { X } from "lucide-react";

/** Fullscreen spectrum mode — overlays the whole viewport. */
export function FullscreenSpectrum() {
  const fullscreen = useSdrStore((s) => s.fullscreen);
  const setFullscreen = useSdrStore((s) => s.setFullscreen);

  // ESC to exit
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, setFullscreen]);

  if (!fullscreen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[oklch(0.05_0.02_250)] flex flex-col p-4 gap-3">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm sdr-mono text-[oklch(0.85_0.18_195)] sdr-text-glow uppercase tracking-widest">
          Fullscreen Spectrum
        </div>
        <button
          type="button"
          onClick={() => setFullscreen(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[oklch(0.18_0.03_255/0.6)] border border-[oklch(0.85_0.18_195/0.25)] text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.22_0.04_255/0.8)] text-xs sdr-mono"
        >
          <X className="h-3.5 w-3.5" />
          <span>EXIT (ESC)</span>
        </button>
      </div>

      {/* Spectrum */}
      <div className="sdr-panel sdr-panel-glow rounded-xl p-4 flex-shrink-0">
        <SpectrumAnalyzer height={300} />
      </div>

      {/* Waterfall */}
      <div className="sdr-panel sdr-panel-glow rounded-xl p-4 flex-1 min-h-0">
        <WaterfallDisplay height={400} />
      </div>

      {/* RDS overlay */}
      <div className="absolute top-20 right-6 w-72">
        <RdsOverlay />
      </div>
    </div>
  );
}
