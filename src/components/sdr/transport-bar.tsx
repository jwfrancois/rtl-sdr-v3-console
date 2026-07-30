"use client";

import { useEffect, useRef, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { findStationAt, stationSignalAt } from "@/lib/sdr-engine";
import { getAudioEngine } from "@/lib/sdr-audio";
import { onRealAudio } from "@/lib/real-sdr/use-real-sdr";
import { Play, Pause, Volume2, VolumeX, Circle, Headphones, Disc3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Live signal level (0..1), optional — used to gate audio. */
  level?: number;
}

/**
 * Top transport bar — play/pause SDR, enable audio, recording indicator.
 * Also drives the audio engine: when audio is enabled we resume the
 * AudioContext, when disabled we suspend the gain.
 */
export function TransportBar({ level }: Props) {
  const running = useSdrStore((s) => s.running);
  const setRunning = useSdrStore((s) => s.setRunning);
  const audioEnabled = useSdrStore((s) => s.audioEnabled);
  const setAudioEnabled = useSdrStore((s) => s.setAudioEnabled);
  const volume = useSdrStore((s) => s.volume);
  const setVolume = useSdrStore((s) => s.setVolume);
  const recording = useSdrStore((s) => s.recording);
  const toggleRecording = useSdrStore((s) => s.toggleRecording);
  const frequency = useSdrStore((s) => s.frequency);
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const [hifiMode, setHifiMode] = useState(false);

  const audioReadyRef = useRef(false);
  const settingsRef = useRef({ audioEnabled, volume, backend, hwConnected });
  useEffect(() => {
    settingsRef.current = { audioEnabled, volume, backend, hwConnected };
  }, [audioEnabled, volume, backend, hwConnected]);

  // Track real-audio frame stats via REFS (not state) so audio frame
  // processing NEVER triggers React re-renders. The activity meter is
  // updated by a separate lightweight rAF loop that reads the refs.
  // This is critical: calling setState on every audio frame (even throttled
  // to 10-20 Hz) causes re-renders that disrupt the audio engine's
  // scheduling and produce choppy audio.
  const audioLevelRef = useRef(0);
  const audioFrameCountRef = useRef(0);
  const [audioLevelDisplay, setAudioLevelDisplay] = useState(0);
  const [audioFrameDisplay, setAudioFrameDisplay] = useState(0);

  // Subscribe to real-audio frames and push them to the audio engine.
  // This callback must be FAST — no React state updates here.
  useEffect(() => {
    const unsub = onRealAudio((frame) => {
      const s = settingsRef.current;
      if (s.backend !== "real" || !s.hwConnected || !s.audioEnabled) return;
      const engine = getAudioEngine();
      engine.setRealMode(true);
      engine.pushRealAudioFrame(frame.samples, frame.sampleRate, s.volume, frame.samplesRight);
      // Update refs (cheap — no re-render). Sample only every 10th value
      // to avoid the peak computation cost on every frame.
      audioFrameCountRef.current++;
      if (audioFrameCountRef.current % 4 === 0) {
        let peak = 0;
        const samples = frame.samples;
        // Stride-4 sampling: still accurate enough for a meter
        for (let i = 0; i < samples.length; i += 4) {
          const v = Math.abs(samples[i]);
          if (v > peak) peak = v;
        }
        audioLevelRef.current = peak;
      }
    });
    return unsub;
  }, []);

  // Separate rAF loop updates the visible meter at ~15 Hz. This decouples
  // the meter display from audio processing.
  useEffect(() => {
    let raf = 0;
    let lastUpdate = 0;
    const tick = () => {
      const now = performance.now();
      if (now - lastUpdate > 66) {  // ~15 Hz
        setAudioLevelDisplay(audioLevelRef.current);
        setAudioFrameDisplay(audioFrameCountRef.current);
        lastUpdate = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Drive the simulated audio engine when in simulated mode (or real but
  // not connected yet — we still want some output during the demo).
  // Track the last frequency we flushed for so we only flush on ACTUAL
  // frequency changes — not on every re-render (which would constantly
  // cancel in-flight audio and cause choppiness).
  const lastFlushedFreqRef = useRef<number>(-1);
  useEffect(() => {
    const engine = getAudioEngine();
    const useReal = backend === "real" && hwConnected;
    const freqChanged = frequency !== lastFlushedFreqRef.current;
    if (useReal) {
      // Switch to real mode — synth voices will be muted
      engine.setRealMode(true);
      // Only flush on actual frequency change — flushing on every render
      // causes choppiness by cancelling in-flight audio frames.
      if (freqChanged) {
        engine.flushPendingAudio();
        lastFlushedFreqRef.current = frequency;
      }
      return;
    }
    // Simulated mode (or real-but-disconnected) — drive synth voices
    engine.setRealMode(false);
    if (freqChanged) {
      engine.flushPendingAudio();
      lastFlushedFreqRef.current = frequency;
    }
    const station = findStationAt(frequency);
    const signal = station ? stationSignalAt(station, frequency) : 0;
    if (audioEnabled) {
      engine.start().then(() => {
        audioReadyRef.current = true;
      });
    }
    const effectiveSignal = audioEnabled ? signal : 0;
    const effectiveVol = audioEnabled ? volume : 0;
    engine.setStation(audioEnabled ? station : null, effectiveSignal, effectiveVol);
    if (!audioEnabled) {
      engine.stop();
    }
  }, [frequency, audioEnabled, volume, backend, hwConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        getAudioEngine().stop();
      } catch {}
    };
  }, []);

  // Compute signal level if not provided
  const station = findStationAt(frequency);
  const signal = station ? stationSignalAt(station, frequency) : 0;
  const liveLevel = level ?? signal;
  const squelch = useSdrStore((s) => s.squelch);
  const isMutedBySquelch = liveLevel < squelch;

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
      {/* Play/pause SDR */}
      <button
        type="button"
        onClick={() => setRunning(!running)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all text-sm sdr-mono",
          running
            ? "bg-[oklch(0.85_0.18_195/0.18)] border-[oklch(0.85_0.18_195/0.6)] text-[oklch(0.95_0.05_195)] shadow-[0_0_12px_oklch(0.85_0.18_195/0.3)]"
            : "bg-[oklch(0.5_0.2_25/0.18)] border-[oklch(0.5_0.2_25/0.5)] text-[oklch(0.95_0.05_25)]",
        )}
        aria-label={running ? "Stop SDR" : "Start SDR"}
      >
        {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        <span>{running ? "STOP" : "START"}</span>
      </button>

      {/* Audio toggle */}
      <button
        type="button"
        onClick={async () => {
          if (!audioEnabled) {
            await getAudioEngine().start();
            if (backend === "real" && hwConnected) {
              getAudioEngine().setRealMode(true);
            }
          }
          setAudioEnabled(!audioEnabled);
        }}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all text-sm sdr-mono",
          audioEnabled
            ? "bg-[oklch(0.82_0.16_70/0.18)] border-[oklch(0.82_0.16_70/0.6)] text-[oklch(0.95_0.04_70)] shadow-[0_0_12px_oklch(0.82_0.16_70/0.3)]"
            : "bg-[oklch(0.18_0.03_255/0.6)] border-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.7_0.04_250)] hover:bg-[oklch(0.22_0.04_255/0.8)]",
        )}
        aria-label={audioEnabled ? "Mute audio" : "Enable audio"}
      >
        {audioEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        <span>{audioEnabled ? "AUDIO ON" : "AUDIO OFF"}</span>
      </button>

      {/* HiFi Studio Mode toggle */}
      <button
        type="button"
        onClick={() => {
          const next = !hifiMode;
          setHifiMode(next);
          getAudioEngine().setHifiMode(next);
        }}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all text-sm sdr-mono",
          hifiMode
            ? "bg-[oklch(0.85_0.18_195/0.18)] border-[oklch(0.85_0.18_195/0.6)] text-[oklch(0.95_0.05_195)] shadow-[0_0_12px_oklch(0.85_0.18_195/0.35)]"
            : "bg-[oklch(0.18_0.03_255/0.6)] border-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.7_0.04_250)] hover:bg-[oklch(0.22_0.04_255/0.8)]",
        )}
        title="HiFi Studio Mode: tube amp warmth + bass boost + presence boost"
        aria-label="Toggle HiFi Studio Mode"
      >
        <Disc3 className={cn("h-3.5 w-3.5", hifiMode && "sdr-spin-slow")} />
        <span>HIFI</span>
      </button>

      {/* Volume slider */}
      <div className="flex items-center gap-2 flex-1 min-w-[120px] max-w-[200px]">
        <Headphones className="h-3.5 w-3.5 text-[oklch(0.55_0.04_250)] shrink-0" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="sdr-range w-full"
          aria-label="Master volume"
        />
      </div>

      {/* Recording */}
      <button
        type="button"
        onClick={toggleRecording}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md border transition-all text-sm sdr-mono",
          recording
            ? "bg-[oklch(0.5_0.2_25/0.2)] border-[oklch(0.5_0.2_25/0.6)] text-[oklch(0.95_0.05_25)]"
            : "bg-[oklch(0.18_0.03_255/0.6)] border-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.7_0.04_250)] hover:bg-[oklch(0.22_0.04_255/0.8)]",
        )}
        aria-label="Toggle recording"
      >
        <Circle
          className={cn("h-3 w-3", recording ? "fill-current sdr-pulse" : "")}
        />
        <span>{recording ? "REC" : "REC"}</span>
        {recording && (
          <span className="text-[10px] text-[oklch(0.85_0.05_25)]">●</span>
        )}
      </button>

      {/* Squelch indicator */}
      <div className="flex items-center gap-1.5 text-[10px] sdr-mono text-[oklch(0.55_0.04_250)]">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isMutedBySquelch
              ? "bg-[oklch(0.5_0.2_25/0.6)]"
              : "bg-[oklch(0.80_0.18_155)] shadow-[0_0_6px_oklch(0.80_0.18_155)] sdr-pulse",
          )}
        />
        {isMutedBySquelch ? "SQL CLOSED" : "SQL OPEN"}
      </div>

      {/* Real-audio activity meter — only shown when in real mode.
          Uses the display state updated by the separate rAF loop, so
          audio frame processing never triggers re-renders. */}
      {backend === "real" && hwConnected && audioEnabled && (
        <div className="flex items-center gap-2 text-[10px] sdr-mono text-[oklch(0.55_0.04_250)]">
          <span className="text-[9px] uppercase tracking-wider">Audio</span>
          <div className="flex items-center gap-0.5">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
              const threshold = (i + 1) * 0.12;
              const active = audioLevelDisplay >= threshold;
              const color =
                i < 4
                  ? "bg-[oklch(0.80_0.18_155)]"
                  : i < 6
                    ? "bg-[oklch(0.82_0.16_70)]"
                    : "bg-[oklch(0.5_0.2_25)]";
              return (
                <span
                  key={i}
                  className={cn(
                    "h-2 w-1 rounded-sm transition-opacity",
                    color,
                    active ? "opacity-100" : "opacity-20",
                  )}
                />
              );
            })}
          </div>
          <span className="text-[oklch(0.65_0.04_250)]">
            {(audioLevelDisplay * 100).toFixed(0)}%
          </span>
          <span className="text-[oklch(0.4_0.04_250)]">
            · {audioFrameDisplay} frames
          </span>
        </div>
      )}
    </div>
  );
}
