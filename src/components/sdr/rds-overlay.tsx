"use client";

import { useEffect, useState } from "react";
import { onRealRds } from "@/lib/real-sdr/use-real-sdr";
import { useSdrStore } from "@/lib/sdr-store";
import type { RdsState } from "@/lib/real-sdr/rds";
import { Radio, Hash, Type, Music2, Volume2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * RDS overlay — shows live decoded RDS (Radio Data System) data from
 * the current broadcast FM station: PI code, PS name (the station's
 * "screen name" you'd see on a car radio), PTY, Radio Text, etc.
 *
 * Only meaningful when:
 *   - the real SDR backend is connected
 *   - we're in WFM mode
 *   - the tuned frequency is in the FM broadcast band (87.5–108 MHz)
 *
 * RDS is slow (~1 Hz update rate) so don't expect instant changes.
 * Be patient — a clean RDS decode usually takes 2–10 seconds of
 * continuous signal.
 */
export function RdsOverlay() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const demod = useSdrStore((s) => s.demod);
  const frequency = useSdrStore((s) => s.frequency);

  const [state, setState] = useState<RdsState | null>(null);

  useEffect(() => {
    const unsub = onRealRds((s) => setState({ ...s }));
    return unsub;
  }, []);

  const inFmBand = frequency >= 87.5e6 && frequency <= 108e6;
  const shouldShow = backend === "real" && hwConnected && demod === "WFM" && inFmBand;
  const hasData = state && (state.pi !== null || state.ps !== null);

  if (!shouldShow) return null;

  return (
    <div className="sdr-panel rounded-lg p-3 backdrop-blur-md bg-[oklch(0.05_0.02_250/0.85)] border-[oklch(0.80_0.18_155/0.25)]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Radio className="h-3 w-3 text-[oklch(0.80_0.18_155)]" />
          <span>RDS</span>
        </div>
        <div className="flex items-center gap-2">
          {state && state.groupsDecoded > 0 && (
            <span className="text-[9px] sdr-mono text-[oklch(0.80_0.18_155)] flex items-center gap-1">
              <Activity className="h-2.5 w-2.5" />
              {state.groupsDecoded} grps
            </span>
          )}
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              hasData
                ? "bg-[oklch(0.80_0.18_155)] shadow-[0_0_6px_oklch(0.80_0.18_155)] sdr-pulse"
                : "bg-[oklch(0.5_0.04_250)]",
            )}
          />
        </div>
      </div>

      {!hasData ? (
        <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-1 leading-relaxed">
          {inFmBand
            ? "Waiting for RDS data… (takes a few seconds of clean signal)"
            : "Tune to a broadcast FM station (87.5–108 MHz) in WFM mode to decode RDS."}
        </div>
      ) : (
        <div className="space-y-2">
          {/* PS (Program Service name) — the big station name like a car radio */}
          {state.ps && (
            <div className="text-xl font-bold sdr-mono text-[oklch(0.92_0.04_155)] sdr-text-glow truncate">
              {state.ps}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-[10px] sdr-mono">
            {state.pi && (
              <RdsField icon={<Hash className="h-2.5 w-2.5" />} label="PI" value={state.pi} />
            )}
            {state.ptyLabel && (
              <RdsField icon={<Type className="h-2.5 w-2.5" />} label="PTY" value={state.ptyLabel} />
            )}
            {state.music !== null && (
              <RdsField
                icon={<Music2 className="h-2.5 w-2.5" />}
                label="M/S"
                value={state.music ? "Music" : "Speech"}
              />
            )}
            {state.stereo !== null && (
              <RdsField
                icon={<Volume2 className="h-2.5 w-2.5" />}
                label="Tx"
                value={state.stereo ? "Stereo" : "Mono"}
              />
            )}
            {state.groupType && (
              <RdsField icon={<Activity className="h-2.5 w-2.5" />} label="GRP" value={state.groupType} />
            )}
            {state.ta !== null && (
              <RdsField
                icon={<Activity className="h-2.5 w-2.5" />}
                label="TA"
                value={state.ta ? "ON" : "OFF"}
              />
            )}
          </div>
          {state.rt && state.rt.trim().length > 0 && (
            <div className="pt-2 border-t border-[oklch(0.85_0.18_195/0.1)]">
              <div className="text-[9px] uppercase tracking-widest text-[oklch(0.5_0.04_250)] mb-0.5">
                Radio Text
              </div>
              <div className="text-[11px] text-[oklch(0.85_0.04_250)] leading-relaxed">
                {state.rt}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RdsField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[oklch(0.5_0.04_250)] shrink-0">{icon}</span>
      <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)] shrink-0">
        {label}
      </span>
      <span className="text-[10px] text-[oklch(0.85_0.18_195)] truncate">
        {value}
      </span>
    </div>
  );
}
