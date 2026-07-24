"use client";

import { useSdrStore } from "@/lib/sdr-store";
import { findStationAt, formatFrequency, stationSignalAt } from "@/lib/sdr-engine";
import { Radio, Signal, AudioWaveform, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

/** Compact "now playing" style info card showing the active station. */
export function ActiveStationCard() {
  const frequency = useSdrStore((s) => s.frequency);
  const demod = useSdrStore((s) => s.demod);
  const bandwidth = useSdrStore((s) => s.bandwidth);
  const station = findStationAt(frequency);
  const signal = station ? stationSignalAt(station, frequency) : 0;
  const strengthPct = Math.round(signal * 100);

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4 relative overflow-hidden">
      {/* Animated radio waves backdrop */}
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border border-[oklch(0.85_0.18_195/0.25)] sdr-spin-slow" />
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full border border-[oklch(0.85_0.18_195/0.15)] sdr-spin-slow" style={{ animationDirection: "reverse" }} />
      </div>

      <div className="flex items-center gap-2 mb-2 relative">
        <Radio className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
        <span className="text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          Now Tuned
        </span>
      </div>

      <div className="relative">
        {station ? (
          <>
            <div className="text-lg font-bold text-[oklch(0.95_0.04_195)] sdr-text-glow truncate">
              {station.label}
            </div>
            <div className="text-[11px] text-[oklch(0.7_0.04_250)] mb-2">
              {station.band} · {station.modulation} · {(station.bandwidth / 1e3).toFixed(1)} kHz
            </div>
            {station.description && (
              <div className="text-[12px] text-[oklch(0.75_0.04_250)] mb-3 leading-relaxed">
                {station.description}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-lg font-bold text-[oklch(0.5_0.04_250)] truncate mb-2">
              No station locked
            </div>
            <div className="text-[12px] text-[oklch(0.55_0.04_250)] mb-3 leading-relaxed">
              Tune to a known frequency or click anywhere on the spectrum to look for signals.
              The current frequency is shown below in full resolution.
            </div>
          </>
        )}

        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[oklch(0.85_0.18_195/0.1)]">
          <Stat
            icon={<Signal className="h-3 w-3" />}
            label="Signal"
            value={`${strengthPct}%`}
            color={signal > 0.6 ? "emerald" : signal > 0.3 ? "amber" : "dim"}
          />
          <Stat
            icon={<Tag className="h-3 w-3" />}
            label="Frequency"
            value={(frequency / 1e6).toFixed(4)}
            unit="MHz"
            color="cyan"
          />
          <Stat
            icon={<AudioWaveform className="h-3 w-3" />}
            label="Mode"
            value={demod}
            color="cyan"
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  unit,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  color: "cyan" | "amber" | "emerald" | "dim";
}) {
  const palette = {
    cyan: "text-[oklch(0.85_0.18_195)]",
    amber: "text-[oklch(0.82_0.16_70)]",
    emerald: "text-[oklch(0.80_0.18_155)]",
    dim: "text-[oklch(0.55_0.04_250)]",
  }[color];

  return (
    <div className="flex flex-col leading-tight">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
        <span className={palette}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className={cn("text-[13px] sdr-mono font-semibold", palette)}>
        {value}
        {unit && (
          <span className="text-[9px] text-[oklch(0.5_0.04_250)] ml-0.5 font-normal">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
