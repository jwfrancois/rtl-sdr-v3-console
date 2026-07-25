"use client";

import { useEffect, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { bandForFrequency, findStationAt, formatFrequency } from "@/lib/sdr-engine";
import { RadioTower, Cpu, Activity, Clock, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

/** Animated dot used in the header to indicate "live" state. */
function LiveDot({ active = true }: { active?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {active && (
        <span className="absolute inset-0 rounded-full bg-[oklch(0.80_0.18_155)] animate-ping opacity-60" />
      )}
      <span
        className={cn(
          "relative inline-flex rounded-full h-2 w-2",
          active ? "bg-[oklch(0.80_0.18_155)]" : "bg-[oklch(0.5_0.04_250)]",
        )}
      />
    </span>
  );
}

export function StatusHeader() {
  const frequency = useSdrStore((s) => s.frequency);
  const demod = useSdrStore((s) => s.demod);
  const sampleRate = useSdrStore((s) => s.sampleRate);
  const gainDb = useSdrStore((s) => s.gainDb);
  const autoGain = useSdrStore((s) => s.autoGain);
  const ppmCorrection = useSdrStore((s) => s.ppmCorrection);
  const running = useSdrStore((s) => s.running);
  const audioEnabled = useSdrStore((s) => s.audioEnabled);
  const recording = useSdrStore((s) => s.recording);

  // Don't render time-sensitive values during SSR — they always differ from
  // the client's local clock and trigger hydration mismatches. Render a
  // stable placeholder (`mounted === false`) on the first client paint,
  // which matches the SSR markup. The clock then ticks via setInterval.
  const [now, setNow] = useState<Date | null>(null);
  const [uptime, setUptime] = useState(0);
  const mounted = now !== null;

  useEffect(() => {
    // Start the interval immediately; first tick at ~100 ms gives a near-
    // instant clock without an explicit setState-during-effect call.
    let tick = 0;
    const id = window.setInterval(() => {
      setNow(new Date());
      tick += 1;
      if (tick > 0) setUptime(tick - 1);
    }, 1000);
    // Fire one immediate tick to populate the clock without setState-in-effect
    // (this runs inside the interval callback, not the effect body)
    return () => window.clearInterval(id);
  }, []);

  const station = findStationAt(frequency);
  const band = bandForFrequency(frequency);
  const backend = useSdrStore((s) => s.backend);
  const hwStatus = useSdrStore((s) => s.hwStatus);
  const hwConnected = !!hwStatus?.connected;

  // Mock: SNR derived from signal strength (just for header display in sim mode).
  // In real mode, the HW overruns + uptime tell us the device is healthy.
  const signal = station ? station.power : 0;
  const snr = Math.max(0, signal * 30 + 3);

  const stats = [
    { label: "Source", value: backend === "real" && hwConnected ? "HW LIVE" : backend === "real" ? "HW OFFLINE" : "SIMULATED" },
    { label: "Band", value: band },
    { label: "Mode", value: demod },
    { label: "Sample Rate", value: `${(sampleRate / 1e6).toFixed(2)} M` },
    { label: "Gain", value: autoGain ? "Auto" : `${gainDb.toFixed(1)} dB` },
    { label: "PPM", value: `${ppmCorrection > 0 ? "+" : ""}${ppmCorrection}` },
    ...(backend === "real" && hwConnected && hwStatus
      ? [{ label: "HW Uptime", value: `${hwStatus.uptime.toFixed(0)}s` }]
      : [{ label: "SNR", value: `${snr.toFixed(1)} dB` }]),
  ];

  return (
    <header className="sdr-panel sdr-panel-glow rounded-xl px-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
        {/* Logo / brand */}
        <div className="flex items-center gap-3 pr-4 border-r border-[oklch(0.85_0.18_195/0.12)]">
          <div className="relative">
            <RadioTower className="h-7 w-7 text-[oklch(0.85_0.18_195)] sdr-text-glow" />
            <span className="absolute -top-0.5 -right-0.5">
              <LiveDot active={running} />
            </span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-bold tracking-wider text-[oklch(0.95_0.04_195)] sdr-text-glow sdr-mono">
              RTL-SDR V3
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)]">
              Magical SDR Console
            </span>
          </div>
        </div>

        {/* Active frequency display */}
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)]">
            Tuned Frequency
          </span>
          <span className="text-xl font-bold sdr-mono text-[oklch(0.92_0.04_195)] sdr-text-glow">
            {formatFrequency(frequency)}
          </span>
        </div>

        {/* Active station */}
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)]">
            Active Station
          </span>
          <span className="text-sm sdr-mono text-[oklch(0.85_0.18_195)] truncate max-w-[220px]">
            {station ? station.label : <span className="text-[oklch(0.5_0.04_250)]">— No signal locked —</span>}
          </span>
        </div>

        {/* Spacer pushes stats to the right on wide screens */}
        <div className="flex-1 hidden md:block" />

        {/* Live stats grid */}
        <div className="hidden md:grid grid-cols-3 lg:grid-cols-7 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col leading-tight min-w-[64px]">
              <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
                {s.label}
              </span>
              <span className="text-[12px] sdr-mono text-[oklch(0.85_0.04_250)]">
                {s.value}
              </span>
            </div>
          ))}
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 ml-auto md:ml-0">
          <StatusBadge
            icon={<Cpu className="h-3 w-3" />}
            label={running ? "SDR ON" : "SDR OFF"}
            color={running ? "cyan" : "dim"}
            pulse={running}
          />
          <StatusBadge
            icon={<Activity className="h-3 w-3" />}
            label={audioEnabled ? "AUDIO" : "MUTED"}
            color={audioEnabled ? "amber" : "dim"}
          />
          <StatusBadge
            icon={<Wifi className="h-3 w-3" />}
            label={recording ? "REC" : "IDLE"}
            color={recording ? "red" : "dim"}
            pulse={recording}
          />
        </div>

        {/* Clock */}
        <div className="flex items-center gap-1.5 text-[11px] sdr-mono text-[oklch(0.6_0.04_250)]">
          <Clock className="h-3 w-3" />
          <span suppressHydrationWarning>
            {mounted && now
              ? now.toLocaleTimeString("en-US", { hour12: false })
              : "--:--:--"}
          </span>
          <span className="text-[oklch(0.4_0.04_250)]">·</span>
          <span className="text-[oklch(0.5_0.04_250)]" suppressHydrationWarning>
            UP {mounted ? formatUptime(uptime) : "0s"}
          </span>
        </div>
      </div>

      {/* Mobile stats strip */}
      <div className="md:hidden mt-3 pt-3 border-t border-[oklch(0.85_0.18_195/0.1)] grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col leading-tight">
            <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
              {s.label}
            </span>
            <span className="text-[11px] sdr-mono text-[oklch(0.85_0.04_250)]">
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </header>
  );
}

function StatusBadge({
  icon,
  label,
  color,
  pulse,
}: {
  icon: React.ReactNode;
  label: string;
  color: "cyan" | "amber" | "red" | "dim";
  pulse?: boolean;
}) {
  const palette = {
    cyan: "bg-[oklch(0.85_0.18_195/0.14)] border-[oklch(0.85_0.18_195/0.5)] text-[oklch(0.95_0.05_195)] shadow-[0_0_10px_oklch(0.85_0.18_195/0.25)]",
    amber: "bg-[oklch(0.82_0.16_70/0.14)] border-[oklch(0.82_0.16_70/0.5)] text-[oklch(0.95_0.04_70)] shadow-[0_0_10px_oklch(0.82_0.16_70/0.25)]",
    red: "bg-[oklch(0.5_0.2_25/0.18)] border-[oklch(0.5_0.2_25/0.55)] text-[oklch(0.95_0.05_25)] shadow-[0_0_10px_oklch(0.5_0.2_25/0.3)]",
    dim: "bg-[oklch(0.18_0.03_255/0.5)] border-[oklch(0.85_0.18_195/0.12)] text-[oklch(0.55_0.04_250)]",
  }[color];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] sdr-mono uppercase tracking-wider",
        palette,
        pulse && "sdr-pulse",
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
