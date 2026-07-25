"use client";

import { useState, useEffect } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { FILTER_BANDWIDTHS, type DemodMode } from "@/lib/sdr-engine";
import { _getSource } from "@/lib/real-sdr/use-real-sdr";
import { cn } from "@/lib/utils";
import { Waves, Radio, Headphones, Wifi, Mic, Binary, Zap } from "lucide-react";

const MODES: Array<{
  id: DemodMode;
  label: string;
  fullLabel: string;
  icon: React.ReactNode;
  hint: string;
}> = [
  { id: "WFM", label: "WFM", fullLabel: "Wide FM", icon: <Radio className="h-3.5 w-3.5" />, hint: "Broadcast FM" },
  { id: "NFM", label: "NFM", fullLabel: "Narrow FM", icon: <Waves className="h-3.5 w-3.5" />, hint: "VHF/UHF voice" },
  { id: "AM", label: "AM", fullLabel: "Amplitude", icon: <Wifi className="h-3.5 w-3.5" />, hint: "Airband / SW" },
  { id: "USB", label: "USB", fullLabel: "Upper Sideband", icon: <Headphones className="h-3.5 w-3.5" />, hint: "HF SSB" },
  { id: "LSB", label: "LSB", fullLabel: "Lower Sideband", icon: <Headphones className="h-3.5 w-3.5" />, hint: "HF SSB" },
  { id: "CW", label: "CW", fullLabel: "Morse Code", icon: <Zap className="h-3.5 w-3.5" />, hint: "Carrier wave" },
  { id: "RAW", label: "RAW", fullLabel: "Raw I/Q", icon: <Binary className="h-3.5 w-3.5" />, hint: "Unclassified" },
];

export function DemodulatorControls() {
  const demod = useSdrStore((s) => s.demod);
  const setDemod = useSdrStore((s) => s.setDemod);
  const bandwidth = useSdrStore((s) => s.bandwidth);
  const setBandwidth = useSdrStore((s) => s.setBandwidth);
  const [stereo, setStereo] = useState(false);

  // When demod changes away from WFM, reset stereo
  useEffect(() => {
    if (demod !== "WFM") {
      const id = window.setTimeout(() => setStereo(false), 0);
      return () => window.clearTimeout(id);
    }
  }, [demod]);

  const bandwidths = FILTER_BANDWIDTHS[demod];

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Mic className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Demodulator</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.55_0.04_250)]">
          {MODES.find((m) => m.id === demod)?.fullLabel}
        </span>
      </div>

      {/* Mode grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {MODES.map((m) => {
          const active = demod === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setDemod(m.id)}
              title={`${m.fullLabel} — ${m.hint}`}
              className={cn(
                "relative flex flex-col items-center gap-1 py-2 rounded-md border transition-all text-xs sdr-mono",
                active
                  ? "bg-[oklch(0.85_0.18_195/0.18)] border-[oklch(0.85_0.18_195/0.7)] text-[oklch(0.95_0.05_195)] shadow-[0_0_14px_oklch(0.85_0.18_195/0.35)]"
                  : "bg-[oklch(0.13_0.025_255/0.6)] border-[oklch(0.85_0.18_195/0.12)] text-[oklch(0.65_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)] hover:border-[oklch(0.85_0.18_195/0.35)]",
              )}
            >
              <span className={active ? "text-[oklch(0.85_0.18_195)]" : ""}>
                {m.icon}
              </span>
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Bandwidth presets */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)]">
            Filter Bandwidth
          </span>
          <span className="text-[11px] sdr-mono text-[oklch(0.85_0.18_195)]">
            {(bandwidth / 1e3).toFixed(2)} kHz
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {bandwidths.map((bw) => {
            const active = bandwidth === bw;
            return (
              <button
                key={bw}
                type="button"
                onClick={() => setBandwidth(bw)}
                className={cn(
                  "py-1.5 rounded-md border text-[10px] sdr-mono transition-all",
                  active
                    ? "bg-[oklch(0.82_0.16_70/0.18)] border-[oklch(0.82_0.16_70/0.6)] text-[oklch(0.95_0.04_70)]"
                    : "bg-[oklch(0.13_0.025_255/0.6)] border-[oklch(0.82_0.16_70/0.12)] text-[oklch(0.65_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)] hover:border-[oklch(0.82_0.16_70/0.3)]",
                )}
              >
                {bw >= 1e6
                  ? `${(bw / 1e6).toFixed(1)}M`
                  : bw >= 1e3
                    ? `${(bw / 1e3).toFixed(1)}k`
                    : `${bw}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stereo toggle — only for WFM */}
      {demod === "WFM" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)]">
              Stereo
            </span>
            <span className="text-[10px] sdr-mono text-[oklch(0.82_0.16_70)]">
              {stereo ? "STEREO" : "MONO"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !stereo;
              setStereo(next);
              const src = _getSource(useSdrStore.getState().bridgeUrl);
              src?.setStereo(next);
            }}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2 rounded-md border transition-all text-xs sdr-mono",
              stereo
                ? "bg-[oklch(0.82_0.16_70/0.18)] border-[oklch(0.82_0.16_70/0.6)] text-[oklch(0.95_0.04_70)] shadow-[0_0_12px_oklch(0.82_0.16_70/0.3)]"
                : "bg-[oklch(0.13_0.025_255/0.6)] border-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.65_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)]",
            )}
          >
            <Headphones className="h-3.5 w-3.5" />
            {stereo ? "STEREO ON" : "STEREO OFF"}
          </button>
          <p className="mt-1.5 text-[9px] text-[oklch(0.5_0.04_250)] leading-relaxed">
            Stereo adds pilot PLL + L-R demod. Enable on strong signals for HiFi. Disable for weak signals (mono is cleaner).
          </p>
        </div>
      )}
    </div>
  );
}
