"use client";

import { useEffect, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { DemodMode, SAMPLE_RATES } from "@/lib/sdr-engine";
import { Keyboard, X } from "lucide-react";

const DEMOD_MODES: DemodMode[] = ["WFM", "NFM", "AM", "USB", "LSB", "CW", "RAW"];
const STEP_OPTIONS = [10, 100, 1e3, 5e3, 12.5e3, 25e3, 100e3, 1e6];

/**
 * Global keyboard shortcuts handler + help overlay.
 *
 *   Space        → toggle audio mute
 *   ↑ / ↓        → tune up / down by current step
 *   ← / →        → switch demod mode (left = previous, right = next)
 *   [ / ]        → sample rate down / up
 *   - / +        → gain down / up
 *   M            → toggle mute (same as Space)
 *   A            → toggle AGC
 *   R            → toggle IQ recording
 *   S            → toggle scan mode (peak)
 *   F            → toggle fullscreen spectrum
 *   ?            → show this help
 *   ESC          → close help / exit fullscreen
 */
export function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);
  const setFrequency = useSdrStore((s) => s.setFrequency);
  const frequency = useSdrStore((s) => s.frequency);
  const tuneStep = useSdrStore((s) => s.tuneStep);
  const audioEnabled = useSdrStore((s) => s.audioEnabled);
  const setAudioEnabled = useSdrStore((s) => s.setAudioEnabled);
  const demod = useSdrStore((s) => s.demod);
  const setDemod = useSdrStore((s) => s.setDemod);
  const sampleRate = useSdrStore((s) => s.sampleRate);
  const setSampleRate = useSdrStore((s) => s.setSampleRate);
  const gainDb = useSdrStore((s) => s.gainDb);
  const setGainDb = useSdrStore((s) => s.setGainDb);
  const autoGain = useSdrStore((s) => s.autoGain);
  const setAutoGain = useSdrStore((s) => s.setAutoGain);
  const recording = useSdrStore((s) => s.recording);
  const toggleRecording = useSdrStore((s) => s.toggleRecording);
  const scanning = useSdrStore((s) => s.scanning);
  const setScanning = useSdrStore((s) => s.setScanning);
  const fullscreen = useSdrStore((s) => s.fullscreen);
  const setFullscreen = useSdrStore((s) => s.setFullscreen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't trigger when typing in an input
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      // Don't trigger on modifier combos (browser shortcuts)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case " ":
        case "m":
        case "M":
          e.preventDefault();
          setAudioEnabled(!audioEnabled);
          break;
        case "ArrowUp":
          e.preventDefault();
          tuneStep(1, 25e3);
          break;
        case "ArrowDown":
          e.preventDefault();
          tuneStep(-1, 25e3);
          break;
        case "ArrowLeft": {
          e.preventDefault();
          const idx = DEMOD_MODES.indexOf(demod);
          setDemod(DEMOD_MODES[(idx - 1 + DEMOD_MODES.length) % DEMOD_MODES.length]);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const idx = DEMOD_MODES.indexOf(demod);
          setDemod(DEMOD_MODES[(idx + 1) % DEMOD_MODES.length]);
          break;
        }
        case "[":
        case "{": {
          e.preventDefault();
          const idx = SAMPLE_RATES.indexOf(sampleRate);
          if (idx > 0) setSampleRate(SAMPLE_RATES[idx - 1]);
          break;
        }
        case "]":
        case "}": {
          e.preventDefault();
          const idx = SAMPLE_RATES.indexOf(sampleRate);
          if (idx < SAMPLE_RATES.length - 1) setSampleRate(SAMPLE_RATES[idx + 1]);
          break;
        }
        case "-":
        case "_":
          e.preventDefault();
          if (!autoGain) setGainDb(Math.max(0, gainDb - 1));
          break;
        case "=":
        case "+":
          e.preventDefault();
          if (!autoGain) setGainDb(Math.min(50, gainDb + 1));
          break;
        case "a":
        case "A":
          e.preventDefault();
          setAutoGain(!autoGain);
          break;
        case "r":
        case "R":
          e.preventDefault();
          toggleRecording();
          break;
        case "s":
        case "S":
          e.preventDefault();
          setScanning(!scanning);
          break;
        case "f":
        case "F":
          e.preventDefault();
          setFullscreen(!fullscreen);
          break;
        case "?":
        case "/":
          e.preventDefault();
          setShowHelp(true);
          break;
        case "Escape":
          setShowHelp(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    audioEnabled, demod, sampleRate, gainDb, autoGain, recording, scanning, fullscreen,
    frequency, setAudioEnabled, setDemod, setSampleRate, setGainDb, setAutoGain,
    toggleRecording, setScanning, setFullscreen, setFrequency, tuneStep,
  ]);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowHelp(true)}
        className="fixed bottom-4 right-4 z-40 p-2 rounded-full bg-[oklch(0.18_0.03_255/0.8)] border border-[oklch(0.85_0.18_195/0.3)] text-[oklch(0.65_0.04_250)] hover:text-[oklch(0.85_0.18_195)] hover:border-[oklch(0.85_0.18_195/0.5)] backdrop-blur-md transition-all"
        title="Keyboard shortcuts (?)"
        aria-label="Show keyboard shortcuts"
      >
        <Keyboard className="h-4 w-4" />
      </button>

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="sdr-panel sdr-panel-glow rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto sdr-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm uppercase tracking-widest text-[oklch(0.85_0.18_195)]">
                <Keyboard className="h-4 w-4" />
                <span>Keyboard Shortcuts</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="p-1 rounded text-[oklch(0.65_0.04_250)] hover:text-[oklch(0.85_0.18_195)] hover:bg-[oklch(0.85_0.18_195/0.1)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-[12px]">
              <ShortcutRow keys={["Space", "/ M"]} desc="Toggle audio mute" />
              <ShortcutRow keys={["↑", "↓"]} desc="Tune up / down (25 kHz step)" />
              <ShortcutRow keys={["←", "→"]} desc="Switch demodulator mode" />
              <ShortcutRow keys={["[", "]"]} desc="Sample rate down / up" />
              <ShortcutRow keys={["-", "+"]} desc="Gain down / up" />
              <ShortcutRow keys={["A"]} desc="Toggle AGC" />
              <ShortcutRow keys={["R"]} desc="Toggle IQ recording" />
              <ShortcutRow keys={["S"]} desc="Toggle scan mode" />
              <ShortcutRow keys={["F"]} desc="Toggle fullscreen spectrum" />
              <ShortcutRow keys={["?"]} desc="Show this help" />
              <ShortcutRow keys={["Esc"]} desc="Close dialog / exit fullscreen" />
            </div>
            <div className="mt-4 pt-4 border-t border-[oklch(0.85_0.18_195/0.1)] text-[10px] text-[oklch(0.5_0.04_250)]">
              Note: shortcuts are disabled while typing in input fields.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ShortcutRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="px-2 py-0.5 rounded border border-[oklch(0.85_0.18_195/0.2)] bg-[oklch(0.05_0.02_250/0.7)] text-[oklch(0.85_0.18_195)] sdr-mono text-[11px]"
          >
            {k}
          </kbd>
        ))}
      </div>
      <span className="text-[oklch(0.85_0.04_250)]">{desc}</span>
    </div>
  );
}
