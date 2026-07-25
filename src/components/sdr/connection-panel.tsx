"use client";

import { useEffect, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { useRealSdrManager } from "@/lib/real-sdr/use-real-sdr";
import {
  Usb,
  Radio,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Download,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hardware connection panel — lets the user switch between the built-in
 * simulated SDR engine and a real RTL-SDR V3 connected via the local
 * bridge (see `download/sdr-bridge/`).
 */
export function ConnectionPanel() {
  // Owns the real-SDR source lifecycle for the whole app
  useRealSdrManager();

  const backend = useSdrStore((s) => s.backend);
  const setBackend = useSdrStore((s) => s.setBackend);
  const bridgeUrl = useSdrStore((s) => s.bridgeUrl);
  const setBridgeUrl = useSdrStore((s) => s.setBridgeUrl);
  const connecting = useSdrStore((s) => s.bridgeConnecting);
  const error = useSdrStore((s) => s.bridgeError);
  const hwStatus = useSdrStore((s) => s.hwStatus);
  const [urlInput, setUrlInput] = useState(bridgeUrl);

  // Sync input field if bridgeUrl changes elsewhere
  useEffect(() => {
    setUrlInput(bridgeUrl);
  }, [bridgeUrl]);

  const connected = !!hwStatus?.connected;

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Usb className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Hardware Source</span>
        </div>
        <span
          className={cn(
            "text-[10px] sdr-mono px-2 py-0.5 rounded-md border",
            connected
              ? "bg-[oklch(0.80_0.18_155/0.18)] border-[oklch(0.80_0.18_155/0.55)] text-[oklch(0.92_0.04_155)]"
              : backend === "real"
                ? "bg-[oklch(0.82_0.16_70/0.18)] border-[oklch(0.82_0.16_70/0.5)] text-[oklch(0.92_0.04_70)]"
                : "bg-[oklch(0.18_0.03_255/0.6)] border-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.65_0.04_250)]",
          )}
        >
          {connected ? "LIVE HW" : backend === "real" ? (connecting ? "CONNECTING" : "OFFLINE") : "SIMULATED"}
        </span>
      </div>

      {/* Backend toggle */}
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <button
          type="button"
          onClick={() => setBackend("simulated")}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 rounded-md border text-xs sdr-mono transition-all",
            backend === "simulated"
              ? "bg-[oklch(0.85_0.18_195/0.18)] border-[oklch(0.85_0.18_195/0.6)] text-[oklch(0.95_0.05_195)] shadow-[0_0_12px_oklch(0.85_0.18_195/0.3)]"
              : "bg-[oklch(0.13_0.025_255/0.6)] border-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.65_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)]",
          )}
        >
          <Radio className="h-3.5 w-3.5" />
          Simulated
        </button>
        <button
          type="button"
          onClick={() => setBackend("real")}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 rounded-md border text-xs sdr-mono transition-all",
            backend === "real"
              ? "bg-[oklch(0.80_0.18_155/0.18)] border-[oklch(0.80_0.18_155/0.6)] text-[oklch(0.92_0.04_155)] shadow-[0_0_12px_oklch(0.80_0.18_155/0.3)]"
              : "bg-[oklch(0.13_0.025_255/0.6)] border-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.65_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)]",
          )}
        >
          <Usb className="h-3.5 w-3.5" />
          Real RTL-SDR
        </button>
      </div>

      {backend === "real" ? (
        <>
          {/* Bridge URL input */}
          <div className="mb-3">
            <label className="block text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)] mb-1.5">
              Bridge WebSocket URL
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onBlur={() => setBridgeUrl(urlInput.trim())}
                placeholder="ws://localhost:8080"
                className="flex-1 px-2.5 py-1.5 rounded-md bg-[oklch(0.05_0.02_250/0.7)] border border-[oklch(0.85_0.18_195/0.18)] text-[11px] sdr-mono text-[oklch(0.92_0.01_250)] placeholder:text-[oklch(0.45_0.04_250)] focus:outline-none focus:ring-1 focus:ring-[oklch(0.85_0.18_195/0.5)]"
              />
            </div>
            <p className="mt-1.5 text-[10px] text-[oklch(0.5_0.04_250)] leading-relaxed">
              Run the bridge on your PC, then enter its WebSocket URL here. The
              app connects from your browser to your PC over the local network.
            </p>
          </div>

          {/* Connection state */}
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-[11px] flex items-center gap-2",
              error
                ? "bg-[oklch(0.5_0.2_25/0.12)] border-[oklch(0.5_0.2_25/0.45)] text-[oklch(0.92_0.05_25)]"
                : connected
                  ? "bg-[oklch(0.80_0.18_155/0.12)] border-[oklch(0.80_0.18_155/0.4)] text-[oklch(0.92_0.04_155)]"
                  : connecting
                    ? "bg-[oklch(0.82_0.16_70/0.12)] border-[oklch(0.82_0.16_70/0.4)] text-[oklch(0.92_0.04_70)]"
                    : "bg-[oklch(0.18_0.03_255/0.5)] border-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.65_0.04_250)]",
            )}
          >
            {error ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate">{error}</span>
              </>
            ) : connected ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0">
                  Connected to {hwStatus?.deviceName ?? "RTL-SDR"}
                  {hwStatus && hwStatus.overruns > 0 && (
                    <span className="ml-2 text-[oklch(0.82_0.16_70)]">
                      {hwStatus.overruns} overruns
                    </span>
                  )}
                </span>
              </>
            ) : connecting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                <span>Connecting to bridge…</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 shrink-0" />
                <span>Disconnected — bridge not reachable.</span>
              </>
            )}
          </div>

          {/* Live HW stats */}
          {connected && hwStatus && (
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] sdr-mono">
              <HwStat label="Device" value={hwStatus.deviceName} />
              <HwStat label="Uptime" value={`${hwStatus.uptime.toFixed(0)}s`} />
              <HwStat
                label="HW Freq"
                value={`${(hwStatus.frequency / 1e6).toFixed(4)} MHz`}
              />
              <HwStat
                label="HW SR"
                value={`${(hwStatus.sampleRate / 1e6).toFixed(2)} Msps`}
              />
              <HwStat
                label="Gain"
                value={
                  hwStatus.gainDb === "auto"
                    ? "Auto"
                    : `${hwStatus.gainDb.toFixed(1)} dB`
                }
              />
              <HwStat label="PPM" value={`${hwStatus.ppm}`} />
            </div>
          )}

          {/* Bridge download / setup hint */}
          <div className="mt-3 pt-3 border-t border-[oklch(0.85_0.18_195/0.1)]">
            <a
              href="/download/sdr-bridge/bridge.mjs"
              download
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[oklch(0.85_0.18_195/0.1)] border border-[oklch(0.85_0.18_195/0.25)] text-[11px] text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.85_0.18_195/0.2)] transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              Download bridge script
            </a>
            <p className="mt-2 text-[10px] text-[oklch(0.5_0.04_250)] leading-relaxed">
              Need setup help? See{" "}
              <a
                href="/download/sdr-bridge/README.md"
                download
                className="text-[oklch(0.85_0.18_195)] underline decoration-dotted hover:decoration-solid"
              >
                README.md
              </a>{" "}
              in the bridge download.
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-md border border-[oklch(0.85_0.18_195/0.15)] bg-[oklch(0.05_0.02_250/0.5)] px-3 py-3">
          <div className="flex items-start gap-2 text-[11px] text-[oklch(0.6_0.04_250)] leading-relaxed">
            <Settings2 className="h-3.5 w-3.5 mt-0.5 text-[oklch(0.65_0.04_250)] shrink-0" />
            <span>
              Using the built-in simulated SDR engine. The spectrum, waterfall,
              and audio are all synthesized in-browser — perfect for demos and
              testing. Switch to{" "}
              <span className="text-[oklch(0.85_0.18_195)]">Real RTL-SDR</span>{" "}
              to use your physical dongle.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function HwStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
        {label}
      </span>
      <span className="text-[11px] text-[oklch(0.85_0.18_195)] truncate">
        {value}
      </span>
    </div>
  );
}
