"use client";

import { useSdrStore } from "@/lib/sdr-store";
import { GAIN_VALUES_DB, SAMPLE_RATES } from "@/lib/sdr-engine";
import { cn } from "@/lib/utils";
import { Gauge, Sliders, Volume2, Settings2 } from "lucide-react";

export function GainControls() {
  const gainDb = useSdrStore((s) => s.gainDb);
  const setGainDb = useSdrStore((s) => s.setGainDb);
  const autoGain = useSdrStore((s) => s.autoGain);
  const setAutoGain = useSdrStore((s) => s.setAutoGain);
  const sampleRate = useSdrStore((s) => s.sampleRate);
  const setSampleRate = useSdrStore((s) => s.setSampleRate);
  const squelch = useSdrStore((s) => s.squelch);
  const setSquelch = useSdrStore((s) => s.setSquelch);
  const volume = useSdrStore((s) => s.volume);
  const setVolume = useSdrStore((s) => s.setVolume);
  const ppmCorrection = useSdrStore((s) => s.ppmCorrection);
  const setPpmCorrection = useSdrStore((s) => s.setPpmCorrection);
  const agcSpeed = useSdrStore((s) => s.agcSpeed);
  const setAgcSpeed = useSdrStore((s) => s.setAgcSpeed);

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Sliders className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>RF &amp; Audio</span>
        </div>
        <span className="text-[10px] sdr-mono text-[oklch(0.55_0.04_250)]">RTL2832U</span>
      </div>

      {/* Gain control */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[11px] text-[oklch(0.75_0.04_250)]">
            <Gauge className="h-3 w-3 text-[oklch(0.82_0.16_70)]" />
            <span>Tuner Gain</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] sdr-mono text-[oklch(0.85_0.18_195)]">
              {autoGain ? "Auto" : `${gainDb.toFixed(1)} dB`}
            </span>
            <label className="flex items-center gap-1 text-[10px] text-[oklch(0.55_0.04_250)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoGain}
                onChange={(e) => setAutoGain(e.target.checked)}
                className="accent-[oklch(0.85_0.18_195)] h-3 w-3"
              />
              AGC
            </label>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={GAIN_VALUES_DB.length - 1}
          step={1}
          value={GAIN_VALUES_DB.indexOf(gainDb) >= 0 ? GAIN_VALUES_DB.indexOf(gainDb) : 15}
          onChange={(e) => setGainDb(GAIN_VALUES_DB[Number(e.target.value)])}
          disabled={autoGain}
          className="sdr-range w-full disabled:opacity-40"
        />
      </div>

      {/* Sample rate */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-[oklch(0.75_0.04_250)]">Sample Rate</span>
          <span className="text-[11px] sdr-mono text-[oklch(0.85_0.18_195)]">
            {(sampleRate / 1e6).toFixed(3)} Msps
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {SAMPLE_RATES.map((sr) => {
            const active = sr === sampleRate;
            return (
              <button
                key={sr}
                type="button"
                onClick={() => setSampleRate(sr)}
                className={cn(
                  "py-1 rounded text-[10px] sdr-mono border transition-all",
                  active
                    ? "bg-[oklch(0.85_0.18_195/0.18)] border-[oklch(0.85_0.18_195/0.6)] text-[oklch(0.95_0.05_195)]"
                    : "bg-[oklch(0.13_0.025_255/0.6)] border-[oklch(0.85_0.18_195/0.12)] text-[oklch(0.65_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)]",
                )}
              >
                {(sr / 1e6).toFixed(2)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Squelch */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-[oklch(0.75_0.04_250)]">Squelch</span>
          <span className="text-[11px] sdr-mono text-[oklch(0.82_0.16_70)]">
            {(squelch * 100).toFixed(0)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={squelch}
          onChange={(e) => setSquelch(Number(e.target.value))}
          className="sdr-range w-full"
        />
      </div>

      {/* Volume */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[11px] text-[oklch(0.75_0.04_250)]">
            <Volume2 className="h-3 w-3 text-[oklch(0.85_0.18_195)]" />
            <span>Audio Volume</span>
          </div>
          <span className="text-[11px] sdr-mono text-[oklch(0.85_0.18_195)]">
            {(volume * 100).toFixed(0)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="sdr-range w-full"
        />
      </div>

      {/* Advanced: PPM & AGC speed */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[oklch(0.85_0.18_195/0.1)]">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-[oklch(0.55_0.04_250)] flex items-center gap-1">
              <Settings2 className="h-2.5 w-2.5" /> PPM
            </span>
            <span className="text-[10px] sdr-mono text-[oklch(0.85_0.18_195)]">
              {ppmCorrection > 0 ? "+" : ""}
              {ppmCorrection}
            </span>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={ppmCorrection}
            onChange={(e) => setPpmCorrection(Number(e.target.value))}
            className="sdr-range w-full"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-[oklch(0.55_0.04_250)]">
              AGC Speed
            </span>
          </div>
          <div className="flex gap-1">
            {(["slow", "medium", "fast"] as const).map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setAgcSpeed(sp)}
                className={cn(
                  "flex-1 py-1 rounded text-[10px] sdr-mono border transition-all capitalize",
                  agcSpeed === sp
                    ? "bg-[oklch(0.82_0.16_70/0.18)] border-[oklch(0.82_0.16_70/0.6)] text-[oklch(0.95_0.04_70)]"
                    : "bg-[oklch(0.13_0.025_255/0.6)] border-[oklch(0.82_0.16_70/0.12)] text-[oklch(0.65_0.04_250)] hover:bg-[oklch(0.18_0.03_255/0.8)]",
                )}
              >
                {sp}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
