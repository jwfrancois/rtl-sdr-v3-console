"use client";

import { useEffect, useState } from "react";
import { onRealHdRadio } from "@/lib/real-sdr/use-real-sdr";
import { useSdrStore } from "@/lib/sdr-store";
import type { HdRadioState } from "@/lib/real-sdr/hd-radio";
import { Radio, Clock, Building2, Tag } from "lucide-react";

/**
 * HD Radio SIS overlay — appears alongside (or in place of) the RDS
 * overlay when an HD Radio signal is detected on broadcast FM.
 */
export function HdRadioOverlay() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const demod = useSdrStore((s) => s.demod);
  const frequency = useSdrStore((s) => s.frequency);

  const [state, setState] = useState<HdRadioState | null>(null);

  useEffect(() => {
    const unsub = onRealHdRadio((s) => setState({ ...s }));
    return unsub;
  }, []);

  const inFmBand = frequency >= 87.5e6 && frequency <= 108e6;
  const shouldShow = backend === "real" && hwConnected && demod === "WFM" && inFmBand;
  const hasData = state && state.frameCount > 0;

  if (!shouldShow) return null;

  return (
    <div className="sdr-panel rounded-lg p-3 backdrop-blur-md bg-[oklch(0.05_0.02_250/0.85)] border-[oklch(0.85_0.18_195/0.25)]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Radio className="h-3 w-3 text-[oklch(0.85_0.18_195)]" />
          <span>HD Radio</span>
        </div>
        <span
          className={
            hasData
              ? "text-[9px] sdr-mono text-[oklch(0.85_0.18_195)] sdr-pulse"
              : "text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]"
          }
        >
          {hasData ? "HD LOCK" : "searching…"}
        </span>
      </div>

      {!hasData ? (
        <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-1 leading-relaxed">
          Listening for HD Radio sidebands at ±29 kHz…
        </div>
      ) : (
        <div className="space-y-2">
          {state.callsign && (
            <div className="text-base font-bold sdr-mono text-[oklch(0.92_0.04_195)] sdr-text-glow truncate">
              {state.callsign}
            </div>
          )}
          {state.slogan && state.slogan !== state.callsign && (
            <div className="text-[11px] text-[oklch(0.75_0.04_250)] truncate">
              {state.slogan}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-[10px] sdr-mono">
            {state.country && (
              <Field icon={<Building2 className="h-2.5 w-2.5" />} label="Country" value={state.country} />
            )}
            {state.facilityId !== null && (
              <Field
                icon={<Tag className="h-2.5 w-2.5" />}
                label="Facility ID"
                value={state.facilityId.toString()}
              />
            )}
            {state.audioService && (
              <Field icon={<Radio className="h-2.5 w-2.5" />} label="Audio" value={state.audioService} />
            )}
            {state.utcTime && (
              <Field icon={<Clock className="h-2.5 w-2.5" />} label="UTC (ALFN)" value={state.utcTime} />
            )}
          </div>
          <div className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
            {state.frameCount} frames · {state.crcErrors} CRC errors
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[oklch(0.5_0.04_250)] shrink-0">{icon}</span>
      <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)] shrink-0">
        {label}
      </span>
      <span className="text-[10px] text-[oklch(0.85_0.18_195)] truncate">{value}</span>
    </div>
  );
}
