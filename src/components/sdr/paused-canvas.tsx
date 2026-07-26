"use client";

import { useNonEssentialThrottle } from "@/lib/render-throttle";
import { Pause, Eye } from "lucide-react";

/**
 * Paused canvas placeholder — shown when a non-essential canvas is
 * paused (performance mode = "essential" or audio priority is on).
 *
 * Instead of a blank/empty canvas, shows a subtle "paused" indicator
 * with the panel name, so the user knows the feature is there but
 * intentionally paused for performance.
 */
export function PausedCanvas({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-4 text-[oklch(0.4_0.04_250)]">
      <Pause className="h-4 w-4 opacity-50" />
      <span className="text-[10px] sdr-mono uppercase tracking-wider opacity-60">
        {label} paused
      </span>
      <span className="text-[9px] text-[oklch(0.35_0.04_250)]">
        Switch to Full mode to enable
      </span>
    </div>
  );
}
