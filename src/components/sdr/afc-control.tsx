"use client";

import { useEffect, useRef, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { onRealSpectrum } from "@/lib/real-sdr/use-real-sdr";
import { Target, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AFC (Automatic Frequency Control) — automatically fine-tunes to the
 * center of the strongest signal in the visible spectrum.
 *
 * How it works:
 *   1. Every ~500ms, reads the latest spectrum data
 *   2. Finds the peak bin (strongest signal)
 *   3. Computes the exact frequency of that peak
 *   4. If the peak is more than 5 kHz from the current tuned frequency,
 *      adjusts the frequency to center on the peak
 *   5. Only adjusts within ±50 kHz (doesn't jump across the band)
 *
 * This mimics the AFC feature on traditional FM radios — you click
 * near a station and the radio locks onto the exact center frequency.
 */
export function AfcControl() {
  const frequency = useSdrStore((s) => s.frequency);
  const setFrequency = useSdrStore((s) => s.setFrequency);
  const sampleRate = useSdrStore((s) => s.sampleRate);
  const [afcEnabled, setAfcEnabled] = useState(false);
  const afcEnabledRef = useRef(false);
  const lastAdjustRef = useRef(0);

  useEffect(() => {
    afcEnabledRef.current = afcEnabled;
  }, [afcEnabled]);

  useEffect(() => {
    const unsub = onRealSpectrum((data, fc, sr) => {
      if (!afcEnabledRef.current) return;
      const now = performance.now();
      if (now - lastAdjustRef.current < 500) return; // adjust at most 2 Hz
      lastAdjustRef.current = now;

      // Find the peak bin in the center 80% of the spectrum
      // (avoid edges which may have filter roll-off artifacts)
      const n = data.length;
      const startBin = Math.floor(n * 0.1);
      const endBin = Math.floor(n * 0.9);
      let maxDb = -200;
      let maxIdx = startBin;
      for (let i = startBin; i < endBin; i++) {
        if (data[i] > maxDb) {
          maxDb = data[i];
          maxIdx = i;
        }
      }

      // Only adjust if the peak is strong enough (above noise floor)
      if (maxDb < -60) return;

      // Map bin to frequency offset from center
      // The spectrum covers [fc - sr/2, fc + sr/2] across n bins
      // But our spectrum is mirrored: first half is negative freq, second half positive
      const binFreqOffset = ((maxIdx - n / 2) / (n - 1)) * sr;

      // Only adjust if more than 5 kHz off-center
      if (Math.abs(binFreqOffset) < 5000) return;

      // Only adjust within ±50 kHz (don't jump across the band)
      if (Math.abs(binFreqOffset) > 50000) return;

      // Adjust frequency toward the peak
      const newFreq = fc + binFreqOffset;
      setFrequency(newFreq);
    });
    return unsub;
  }, [setFrequency]);

  return (
    <button
      type="button"
      onClick={() => setAfcEnabled(!afcEnabled)}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] sdr-mono transition-all",
        afcEnabled
          ? "bg-[oklch(0.80_0.18_155/0.18)] border-[oklch(0.80_0.18_155/0.6)] text-[oklch(0.92_0.04_155)] shadow-[0_0_10px_oklch(0.80_0.18_155/0.3)]"
          : "bg-[oklch(0.18_0.03_255/0.6)] border-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.65_0.04_250)] hover:bg-[oklch(0.22_0.04_255/0.8)]",
      )}
      title="AFC: auto-tune to signal center"
    >
      <Target className={cn("h-3 w-3", afcEnabled && "sdr-pulse")} />
      <span>AFC</span>
    </button>
  );
}
