"use client";

import { useEffect, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { Moon, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sleep Timer — auto-mutes audio after a set number of minutes.
 *
 * Perfect for bedside radio use: set 15/30/60 minutes and the audio
 * fades out gently, then stops. The timer state is visible in the
 * transport bar.
 */
export function SleepTimer() {
  const audioEnabled = useSdrStore((s) => s.audioEnabled);
  const setAudioEnabled = useSdrStore((s) => s.setAudioEnabled);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (minutes === null) {
      const id = window.setTimeout(() => setRemaining(0), 0);
      return () => window.clearTimeout(id);
    }
    const totalSeconds = minutes * 60;
    const initId = window.setTimeout(() => setRemaining(totalSeconds), 0);
    const id = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          setMinutes(null);
          if (useSdrStore.getState().audioEnabled) {
            setAudioEnabled(false);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { window.clearTimeout(initId); window.clearInterval(id); };
  }, [minutes, setAudioEnabled]);

  const formatTime = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (minutes !== null) {
    // Timer running — show countdown + cancel
    return (
      <button
        type="button"
        onClick={() => setMinutes(null)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-[oklch(0.5_0.2_25/0.12)] border-[oklch(0.5_0.2_25/0.4)] text-[oklch(0.92_0.05_25)] text-[10px] sdr-mono hover:bg-[oklch(0.5_0.2_25/0.2)] transition-all"
        title="Cancel sleep timer"
      >
        <Moon className="h-3 w-3" />
        <span>{formatTime(remaining)}</span>
        <X className="h-3 w-3 opacity-60" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setMinutes(15)}
        className="px-1.5 py-1 rounded-md text-[9px] sdr-mono border border-[oklch(0.85_0.18_195/0.12)] bg-[oklch(0.13_0.025_255/0.6)] text-[oklch(0.55_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)] hover:text-[oklch(0.85_0.18_195)] transition-all"
        title="Sleep 15 min"
      >
        15m
      </button>
      <button
        type="button"
        onClick={() => setMinutes(30)}
        className="px-1.5 py-1 rounded-md text-[9px] sdr-mono border border-[oklch(0.85_0.18_195/0.12)] bg-[oklch(0.13_0.025_255/0.6)] text-[oklch(0.55_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)] hover:text-[oklch(0.85_0.18_195)] transition-all"
        title="Sleep 30 min"
      >
        30m
      </button>
      <button
        type="button"
        onClick={() => setMinutes(60)}
        className="px-1.5 py-1 rounded-md text-[9px] sdr-mono border border-[oklch(0.85_0.18_195/0.12)] bg-[oklch(0.13_0.025_255/0.6)] text-[oklch(0.55_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)] hover:text-[oklch(0.85_0.18_195)] transition-all"
        title="Sleep 60 min"
      >
        60m
      </button>
    </div>
  );
}
