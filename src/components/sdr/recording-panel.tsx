"use client";

import { useEffect, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { RealSdrSource } from "@/lib/real-sdr/real-sdr-source";
import { Circle, Square, Download, HardDrive, Clock, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * IQ Recording panel — controls the bridge's server-side recording.
 *
 * Recordings are written to `recordings/` next to the bridge script as
 * raw IQ files (interleaved unsigned 8-bit I/Q, header-less —
 * compatible with SDR#, GQRX, GNU Radio, etc., via the `RTLSDR` source).
 *
 * The HTTP server on the bridge (port 8081 by default) serves files
 * from that directory.
 */
export function RecordingPanel() {
  const backend = useSdrStore((s) => s.backend);
  const hwStatus = useSdrStore((s) => s.hwStatus);
  const recording = useSdrStore((s) => s.recording);
  const toggleRecording = useSdrStore((s) => s.toggleRecording);

  const [files, setFiles] = useState<
    Array<{ name: string; size: number; mtime: string }>
  >([]);

  // Recording state on the bridge
  const hwRecording = hwStatus?.recording ?? null;
  const isRecording = recording && backend === "real" && !!hwRecording;

  // Refresh the file list every 3 seconds while recording
  useEffect(() => {
    const refresh = () => fetchFiles(setFiles, backend, hwStatus);
    refresh();
    if (isRecording) {
      const id = window.setInterval(refresh, 2000);
      return () => window.clearInterval(id);
    }
  }, [isRecording, backend, hwStatus]);

  // Derive the bridge HTTP URL (replace ws:// with http://, wss:// with https://)
  const bridgeUrl = useSdrStore((s) => s.bridgeUrl);
  const httpUrl = backend === "real"
    ? bridgeUrl.replace(/^ws(s?):\/\//, "http$1://").replace(/:\d+$/, (m) => `:${Number(m.slice(1)) + 1}`)
    : null;

  const handleToggle = () => {
    if (backend !== "real" || !hwStatus?.connected) return;
    // Send the command via the singleton source — we don't have direct access
    // through the hook, so we send via a custom event listener pattern.
    // Actually: we can dispatch through the store by importing the source.
    // Simpler: emit a window event the source manager listens for.
    // But cleanest: send directly. Let's grab the source via a helper.
    import("@/lib/real-sdr/use-real-sdr").then(({ _getSource }) => {
      const src = _getSource?.(bridgeUrl);
      if (!src) return;
      if (!recording) {
        src.configure({ type: "start_recording" });
        toggleRecording();
      } else {
        src.configure({ type: "stop_recording" });
        toggleRecording();
      }
    });
  };

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <HardDrive className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>IQ Recording</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.55_0.04_250)]">
          {isRecording ? "RECORDING" : recording ? "STOPPING…" : "IDLE"}
        </span>
      </div>

      {backend !== "real" || !hwStatus?.connected ? (
        <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-2 leading-relaxed">
          Connect a real RTL-SDR to enable IQ recording.
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={handleToggle}
            disabled={backend !== "real" || !hwStatus?.connected}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-md border transition-all text-sm sdr-mono",
              isRecording
                ? "bg-[oklch(0.5_0.2_25/0.18)] border-[oklch(0.5_0.2_25/0.6)] text-[oklch(0.95_0.05_25)] shadow-[0_0_12px_oklch(0.5_0.2_25/0.3)]"
                : "bg-[oklch(0.18_0.03_255/0.6)] border-[oklch(0.85_0.18_195/0.18)] text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.22_0.04_255/0.8)]",
            )}
          >
            {isRecording ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>STOP</span>
              </>
            ) : (
              <>
                <Circle className="h-3.5 w-3.5 fill-current" />
                <span>RECORD</span>
              </>
            )}
          </button>

          {/* Live recording stats */}
          {isRecording && hwRecording && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] sdr-mono">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
                  Duration
                </span>
                <span className="text-[12px] text-[oklch(0.95_0.05_25)] flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(hwRecording.duration)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
                  Size
                </span>
                <span className="text-[12px] text-[oklch(0.95_0.05_25)]">
                  {(hwRecording.bytes / 1e6).toFixed(1)} MB
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
                  Rate
                </span>
                <span className="text-[12px] text-[oklch(0.95_0.05_25)] flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  {((hwRecording.sampleRate * 2) / 1e6).toFixed(1)} MB/s
                </span>
              </div>
            </div>
          )}

          {/* Recording file list */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)]">
                Saved recordings
              </span>
              <span className="text-[10px] sdr-mono text-[oklch(0.5_0.04_250)]">
                {files.length} files
              </span>
            </div>
            <div className="max-h-44 overflow-y-auto sdr-scroll pr-1 space-y-1">
              {files.length === 0 ? (
                <div className="text-[11px] text-[oklch(0.5_0.04_250)] py-3 text-center">
                  No recordings yet. Press RECORD to capture raw IQ data.
                </div>
              ) : (
                files.map((f) => (
                  <div
                    key={f.name}
                    className="group flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border border-transparent hover:bg-[oklch(0.18_0.03_255/0.6)] hover:border-[oklch(0.85_0.18_195/0.18)] transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] sdr-mono text-[oklch(0.85_0.04_250)] truncate">
                        {f.name}
                      </div>
                      <div className="text-[9px] text-[oklch(0.5_0.04_250)] sdr-mono">
                        {(f.size / 1e6).toFixed(1)} MB · {new Date(f.mtime).toLocaleString()}
                      </div>
                    </div>
                    {httpUrl && (
                      <a
                        href={`${httpUrl}/recordings/${encodeURIComponent(f.name)}`}
                        download
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.85_0.18_195)]"
                        aria-label="Download recording"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

async function fetchFiles(
  setFiles: (f: Array<{ name: string; size: number; mtime: string }>) => void,
  backend: string,
  hwStatus: any,
) {
  if (backend !== "real" || !hwStatus?.connected) {
    setFiles([]);
    return;
  }
  const bridgeUrl = useSdrStore.getState().bridgeUrl;
  const httpUrl = bridgeUrl
    .replace(/^ws(s?):\/\//, "http$1://")
    .replace(/:\d+$/, (m) => `:${Number(m.slice(1)) + 1}`);
  try {
    const res = await fetch(`${httpUrl}/recordings`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setFiles(Array.isArray(data) ? data.map((f: any) => ({
      name: f.name,
      size: f.size,
      mtime: f.mtime,
    })) : []);
  } catch (err) {
    setFiles([]);
  }
}

function formatDuration(s: number): string {
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  if (m < 60) return `${m}m ${sec}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
