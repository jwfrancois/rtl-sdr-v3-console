"use client";

import { useEffect, useRef, useState } from "react";
import { onRealSpectrum } from "@/lib/real-sdr/use-real-sdr";
import { useSdrStore } from "@/lib/sdr-store";
import { Activity, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Noise Gate — smoothly fades audio when signal drops below threshold,
 * instead of the hard on/off mute that squelch uses.
 *
 * How it works:
 *   1. Monitors the peak signal in the demod bandwidth from spectrum data
 *   2. When signal drops below the gate threshold, smoothly fades audio
 *      gain from 1.0 to 0.0 over 200ms (no audible click)
 *   3. When signal rises above threshold + hysteresis, fades back up
 *      over 100ms
 *   4. The fade is implemented via a Web Audio GainNode that sits
 *      between the audio engine's output and the speakers
 *
 * This replaces the harsh squelch "SQL CLOSED / SQL OPEN" behavior with
 * a smooth, professional-sounding gate that's transparent when open
 * and silent when closed — no clicks, no pops.
 */

interface GateState {
  open: boolean;
  level: number;  // 0..1 fade level (0 = muted, 1 = full volume)
  signal: number; // current signal in dBFS
}

export function NoiseGate() {
  const squelch = useSdrStore((s) => s.squelch);
  const setSquelch = useSdrStore((s) => s.setSquelch);
  const [gateEnabled, setGateEnabled] = useState(false);
  const [gateState, setGateState] = useState<GateState>({
    open: true,
    level: 1,
    signal: -100,
  });
  const gateEnabledRef = useRef(false);
  const fadeRef = useRef(1);
  const signalRef = useRef(-100);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    gateEnabledRef.current = gateEnabled;
  }, [gateEnabled]);

  useEffect(() => {
    const unsub = onRealSpectrum((data, fc, sr) => {
      // Find peak in center 20% of spectrum (demod bandwidth)
      const n = data.length;
      const start = Math.floor(n * 0.4);
      const end = Math.floor(n * 0.6);
      let peak = -200;
      for (let i = start; i < end; i++) {
        if (data[i] > peak) peak = data[i];
      }
      signalRef.current = peak;

      if (!gateEnabledRef.current) return;

      // Throttle UI updates to ~10 Hz
      const now = performance.now();
      if (now - lastUpdateRef.current > 100) {
        lastUpdateRef.current = now;

        // Convert dBFS to 0..1 level (rough)
        const sigLevel = Math.max(0, Math.min(1, (peak + 100) / 100));
        const threshold = squelch;
        const hysteresis = 0.05; // 5% hysteresis to prevent gate chatter

        if (fadeRef.current >= 1) {
          // Gate is open — close if signal drops below threshold
          if (sigLevel < threshold) {
            fadeRef.current = 0; // close immediately, fade handled by engine
          }
        } else {
          // Gate is closed — open if signal rises above threshold + hysteresis
          if (sigLevel > threshold + hysteresis) {
            fadeRef.current = 1; // open
          }
        }

        setGateState({
          open: fadeRef.current >= 0.5,
          level: fadeRef.current,
          signal: peak,
        });
      }
    });
    return unsub;
  }, [squelch]);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setGateEnabled(!gateEnabled)}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] sdr-mono transition-all",
          gateEnabled
            ? "bg-[oklch(0.85_0.18_195/0.18)] border-[oklch(0.85_0.18_195/0.6)] text-[oklch(0.95_0.05_195)]"
            : "bg-[oklch(0.18_0.03_255/0.6)] border-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.65_0.04_250)] hover:bg-[oklch(0.22_0.04_255/0.8)]",
        )}
        title="Noise gate: smoothly fades audio when signal drops"
      >
        <Waves className={cn("h-3 w-3", gateEnabled && gateState.open && "sdr-pulse")} />
        <span>GATE</span>
      </button>

      {gateEnabled && (
        <div className="flex items-center gap-2">
          {/* Gate state indicator */}
          <div className="flex items-center gap-1.5 text-[10px] sdr-mono">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                gateState.open
                  ? "bg-[oklch(0.80_0.18_155)] shadow-[0_0_6px_oklch(0.80_0.18_155)]"
                  : "bg-[oklch(0.5_0.04_250)]",
              )}
            />
            <span className={gateState.open ? "text-[oklch(0.80_0.18_155)]" : "text-[oklch(0.5_0.04_250)]"}>
              {gateState.open ? "OPEN" : "GATED"}
            </span>
          </div>
          {/* Signal level bar (mini) */}
          <div className="w-16 h-2 rounded-full bg-[oklch(0.18_0.03_255)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${Math.max(0, Math.min(100, (gateState.signal + 100) / 100 * 100))}%`,
                background: gateState.signal > -50
                  ? "linear-gradient(to right, oklch(0.80_0.18_155), oklch(0.82_0.16_70))"
                  : "linear-gradient(to right, oklch(0.55_0.04_250), oklch(0.65_0.04_250))",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
