"use client";

import { useEffect, useRef, useState } from "react";
import { onRealAudio } from "@/lib/real-sdr/use-real-sdr";
import { useSdrStore } from "@/lib/sdr-store";
import { Mic, Square, Download, Trash2, Disc3 } from "lucide-react";

interface RecordedClip {
  id: number;
  name: string;
  url: string;
  size: number;
  duration: number;
  timestamp: number;
}

/**
 * Audio WAV recorder — captures the demodulated audio in-browser.
 *
 * The real-SDR source emits demodulated PCM frames at 48 kHz (or 24 kHz
 * for narrow modes). We accumulate them into a growing Float32Array and,
 * when the user clicks STOP, we encode it as a WAV file (44-byte header
 * + 16-bit PCM samples) and create a download link.
 */
export function AudioRecorder() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const audioEnabled = useSdrStore((s) => s.audioEnabled);
  const demod = useSdrStore((s) => s.demod);

  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [clips, setClips] = useState<RecordedClip[]>([]);
  const sampleRateRef = useRef(48000);
  const bufferRef = useRef<Float32Array>(new Float32Array(0));
  const startTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const nextClipIdRef = useRef(1);

  useEffect(() => {
    const unsub = onRealAudio((frame) => {
      if (!recording) return;
      // Grow our buffer
      const old = bufferRef.current;
      const next = new Float32Array(old.length + frame.samples.length);
      next.set(old, 0);
      next.set(frame.samples, old.length);
      bufferRef.current = next;
      sampleRateRef.current = frame.sampleRate;
    });
    return unsub;
  }, [recording]);

  // Tick the duration display while recording
  useEffect(() => {
    if (!recording) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      setDuration((Date.now() - startTimeRef.current) / 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [recording]);

  const handleStart = () => {
    bufferRef.current = new Float32Array(0);
    startTimeRef.current = Date.now();
    setDuration(0);
    setRecording(true);
  };

  const handleStop = () => {
    setRecording(false);
    const buffer = bufferRef.current;
    const sampleRate = sampleRateRef.current;
    if (buffer.length === 0) return;
    // Encode as WAV
    const wavBytes = encodeWav(buffer, sampleRate);
    const blob = new Blob([wavBytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const freq = (useSdrStore.getState().frequency / 1e6).toFixed(4);
    const name = `audio-${stamp}-${freq}MHz-${demod}.wav`;
    const clip: RecordedClip = {
      id: nextClipIdRef.current++,
      name,
      url,
      size: blob.size,
      duration: (Date.now() - startTimeRef.current) / 1000,
      timestamp: Date.now(),
    };
    setClips((c) => [clip, ...c]);
    bufferRef.current = new Float32Array(0);
  };

  const handleDelete = (id: number) => {
    setClips((c) => {
      const clip = c.find((x) => x.id === id);
      if (clip) URL.revokeObjectURL(clip.url);
      return c.filter((x) => x.id !== id);
    });
  };

  if (backend !== "real" || !hwConnected || !audioEnabled) {
    return null;
  }

  return (
    <div className="sdr-panel rounded-xl p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[oklch(0.55_0.04_250)]">
          <Mic className="h-3 w-3 text-[oklch(0.85_0.18_195)]" />
          <span>Audio Recording (WAV)</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.55_0.04_250)]">
          {recording ? `${duration.toFixed(1)}s` : `${clips.length} clips`}
        </span>
      </div>

      <button
        type="button"
        onClick={recording ? handleStop : handleStart}
        className={
          recording
            ? "w-full flex items-center justify-center gap-2 py-2 rounded-md border bg-[oklch(0.5_0.2_25/0.18)] border-[oklch(0.5_0.2_25/0.6)] text-[oklch(0.95_0.05_25)] text-xs sdr-mono"
            : "w-full flex items-center justify-center gap-2 py-2 rounded-md border bg-[oklch(0.85_0.18_195/0.14)] border-[oklch(0.85_0.18_195/0.4)] text-[oklch(0.95_0.05_195)] hover:bg-[oklch(0.85_0.18_195/0.22)] text-xs sdr-mono"
        }
      >
        {recording ? (
          <>
            <Square className="h-3.5 w-3.5 fill-current" />
            <span>STOP ({duration.toFixed(1)}s)</span>
          </>
        ) : (
          <>
            <Disc3 className="h-3.5 w-3.5" />
            <span>RECORD AUDIO</span>
          </>
        )}
      </button>

      {clips.length > 0 && (
        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto sdr-scroll pr-1">
          {clips.map((c) => (
            <div
              key={c.id}
              className="group flex items-center justify-between gap-2 px-2 py-1 rounded-md hover:bg-[oklch(0.18_0.03_255/0.6)]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[11px] sdr-mono text-[oklch(0.85_0.04_250)] truncate">
                  {c.name}
                </div>
                <div className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
                  {c.duration.toFixed(1)}s · {(c.size / 1024).toFixed(0)} KB
                </div>
              </div>
              <a
                href={c.url}
                download={c.name}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[oklch(0.85_0.18_195/0.15)] text-[oklch(0.85_0.18_195)]"
                aria-label="Download"
              >
                <Download className="h-3 w-3" />
              </a>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[oklch(0.5_0.2_25/0.3)] text-[oklch(0.7_0.04_250)] hover:text-[oklch(0.85_0.2_25)]"
                aria-label="Delete clip"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Encode a Float32Array of PCM samples as a 16-bit PCM WAV file (Blob). */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  // fmt subchunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // subchunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
  // data subchunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  // PCM samples (clamp to [-1, 1] then scale to int16)
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
