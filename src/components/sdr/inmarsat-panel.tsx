"use client";

import { useEffect, useState } from "react";
import { onRealInmarsat } from "@/lib/real-sdr/use-real-sdr";
import { useSdrStore } from "@/lib/sdr-store";
import type { StdcState } from "@/lib/real-sdr/inmarsat-stdc";
import { Satellite, Radio } from "lucide-react";

/**
 * Inmarsat STD-C decoder panel — only shown when tuned to 1530–1550 MHz
 * (L-band, geostationary Inmarsat-3 satellites).
 *
 * Shows NCS (Network Coordination Station) ID, active LES (Land Earth
 * Stations), and any decoded text messages.
 *
 * Requires a helical or patch antenna pointed at the satellite — the
 * stock whip won't work for L-band satellite reception.
 */
export function InmarsatPanel() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const frequency = useSdrStore((s) => s.frequency);

  const [state, setState] = useState<StdcState | null>(null);

  useEffect(() => {
    const unsub = onRealInmarsat((s) => setState({
      ...s,
      lesIds: [...s.lesIds],
      messages: [...s.messages],
    }));
    return unsub;
  }, []);

  const inBand = frequency >= 1530e6 && frequency <= 1550e6;
  const shouldShow = backend === "real" && hwConnected && inBand;

  if (!shouldShow) return null;

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Satellite className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Inmarsat STD-C</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.85_0.18_195)]">
          {state?.locked ? "LOCKED" : "searching…"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px] sdr-mono mb-3">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
            NCS ID
          </span>
          <span className="text-[12px] text-[oklch(0.92_0.04_195)] truncate">
            {state?.ncsId ?? "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
            Frames
          </span>
          <span className="text-[12px] text-[oklch(0.92_0.04_195)]">
            {state?.frameCount ?? 0}
          </span>
        </div>
      </div>

      {/* Active LES IDs */}
      {state && state.lesIds.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)] mb-1.5">
            Active LES (Land Earth Stations)
          </div>
          <div className="flex flex-wrap gap-1">
            {state.lesIds.map((id, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 rounded text-[10px] sdr-mono bg-[oklch(0.85_0.18_195/0.12)] border border-[oklch(0.85_0.18_195/0.25)] text-[oklch(0.85_0.18_195)]"
              >
                LES-{id}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Decoded messages */}
      {state && state.messages.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[oklch(0.85_0.18_195/0.1)]">
          <div className="text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)] mb-2">
            Messages ({state.messages.length})
          </div>
          <div className="max-h-40 overflow-y-auto sdr-scroll pr-1 space-y-1">
            {state.messages.map((m) => (
              <div
                key={m.id}
                className="px-2 py-1.5 rounded-md border border-[oklch(0.85_0.18_195/0.1)] bg-[oklch(0.05_0.02_250/0.5)]"
              >
                <div className="flex items-center justify-between text-[10px] sdr-mono">
                  <span className="text-[oklch(0.85_0.18_195)]">{m.from}</span>
                  <span className="text-[oklch(0.5_0.04_250)]">
                    {new Date(m.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {m.text && (
                  <div className="mt-1 text-[11px] sdr-mono text-[oklch(0.92_0.01_250)] break-all">
                    {m.text}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!state?.locked && state?.frameCount === 0 && (
        <div className="text-[10px] text-[oklch(0.5_0.04_250)] leading-relaxed">
          BPSK @ 1200 bps, L-band geostationary. Requires a helical or
          patch antenna pointed at the satellite (I-3 AOR-E at 15.5°W, etc.).
        </div>
      )}
    </div>
  );
}
