"use client";

import { useCallback, useEffect, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { bandForFrequency, formatFrequency } from "@/lib/sdr-engine";
import { ChevronUp, ChevronDown, Radio, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

/** Steps available for the +/- tune buttons. */
const STEP_OPTIONS = [
  { label: "10 Hz", value: 10 },
  { label: "100 Hz", value: 100 },
  { label: "1 kHz", value: 1e3 },
  { label: "5 kHz", value: 5e3 },
  { label: "12.5 kHz", value: 12.5e3 },
  { label: "25 kHz", value: 25e3 },
  { label: "100 kHz", value: 100e3 },
  { label: "1 MHz", value: 1e6 },
];

/**
 * Decompose a frequency in Hz into digit groups:
 * GHz · MHz · kHz · Hz
 *
 * Returns an array of {value, weight, label} for each place we want
 * to render as an editable digit-group. We split into 9 digit cells:
 *  G G G  ·  M M M  ·  k k k  ·  H H H
 * so the user can click any digit to increment/decrement it.
 */
function digitCells(freqHz: number) {
  // Pad to 12 digits: GGG.MMM.kkk.HHH (3 GHz, 3 MHz, 3 kHz, 3 Hz)
  const totalHz = Math.round(freqHz);
  const cells: Array<{ weight: number; digit: number; group: "GHz" | "MHz" | "kHz" | "Hz" }> = [];
  for (let i = 11; i >= 0; i--) {
    const weight = Math.pow(10, i);
    const digit = Math.floor((totalHz % (weight * 10)) / weight);
    let group: "GHz" | "MHz" | "kHz" | "Hz";
    if (i >= 9) group = "GHz";
    else if (i >= 6) group = "MHz";
    else if (i >= 3) group = "kHz";
    else group = "Hz";
    cells.push({ weight, digit, group });
  }
  return cells;
}

interface Props {
  onTune?: (freq: number) => void;
}

export function FrequencyTuner({ onTune }: Props) {
  const frequency = useSdrStore((s) => s.frequency);
  const setFrequency = useSdrStore((s) => s.setFrequency);
  const tuneStep = useSdrStore((s) => s.tuneStep);
  const pushHistory = useSdrStore((s) => s.pushHistory);
  const [stepIdx, setStepIdx] = useState(4); // default 12.5 kHz
  const [justTuned, setJustTuned] = useState(false);

  const cells = digitCells(frequency);
  const band = bandForFrequency(frequency);

  const bumpDigit = useCallback(
    (weight: number, direction: 1 | -1) => {
      const newVal = frequency + direction * weight;
      setFrequency(newVal);
      setJustTuned(true);
      onTune?.(newVal);
      window.setTimeout(() => setJustTuned(false), 250);
    },
    [frequency, setFrequency, onTune],
  );

  const handleStep = useCallback(
    (direction: 1 | -1) => {
      const step = STEP_OPTIONS[stepIdx].value;
      tuneStep(direction, step);
      setJustTuned(true);
      onTune?.(frequency + direction * step);
      window.setTimeout(() => setJustTuned(false), 250);
    },
    [tuneStep, stepIdx, frequency, onTune],
  );

  // Push to history when frequency is stable for ~600ms
  useEffect(() => {
    const id = window.setTimeout(() => {
      pushHistory(frequency, useSdrStore.getState().demod);
    }, 600);
    return () => window.clearTimeout(id);
  }, [frequency, pushHistory]);

  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-5 relative">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Radio className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>VFO · Tuner</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-md bg-[oklch(0.85_0.18_195/0.12)] border border-[oklch(0.85_0.18_195/0.25)] text-[oklch(0.85_0.18_195)]">
            {band}
          </span>
        </div>
      </div>

      {/* Big frequency display */}
      <div
        className={cn(
          "relative flex items-center justify-center gap-1 py-4 px-3 rounded-lg bg-[oklch(0.05_0.02_250/0.7)] border border-[oklch(0.85_0.18_195/0.15)] transition-all duration-200",
          justTuned && "border-[oklch(0.85_0.18_195/0.55)] shadow-[0_0_24px_oklch(0.85_0.18_195/0.25)]",
        )}
      >
        {/* Subtle scanline overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-30 sdr-grid-bg rounded-lg" />
        <div className="flex items-stretch gap-0 sdr-mono text-3xl sm:text-4xl md:text-5xl font-bold tracking-wider text-[oklch(0.92_0.04_195)] sdr-text-glow">
          {cells.map((cell, idx) => {
            const isGroupStart =
              idx > 0 &&
              cells[idx - 1].group !== cell.group;
            const isGHzGroup = cell.group === "GHz";
            const isMHzGroup = cell.group === "MHz";
            const isKHzGroup = cell.group === "kHz";
            return (
              <div key={idx} className="flex items-center">
                {isGroupStart && (
                  <span className="mx-1 text-[oklch(0.55_0.04_250)] font-light">·</span>
                )}
                <DigitCell
                  digit={cell.digit}
                  weight={cell.weight}
                  bump={bumpDigit}
                  groupColor={
                    isGHzGroup
                      ? "text-[oklch(0.85_0.18_195)]"
                      : isMHzGroup
                        ? "text-[oklch(0.92_0.04_195)]"
                        : isKHzGroup
                          ? "text-[oklch(0.85_0.18_195/0.92)]"
                          : "text-[oklch(0.75_0.04_250)]"
                  }
                />
              </div>
            );
          })}
          <span className="ml-2 text-sm sm:text-base font-medium text-[oklch(0.55_0.04_250)] self-end mb-1">
            Hz
          </span>
        </div>
      </div>

      {/* Band label & formatted frequency */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-[oklch(0.55_0.04_250)]">
          <Activity className="h-3 w-3" />
          <span className="sdr-mono">{formatFrequency(frequency)}</span>
        </div>
        <div className="text-[oklch(0.55_0.04_250)] sdr-mono text-[10px]">
          {STEP_OPTIONS[stepIdx].label} step
        </div>
      </div>

      {/* Step selector + tune buttons */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => handleStep(-1)}
          className="group flex items-center justify-center gap-1.5 py-2.5 rounded-md bg-[oklch(0.18_0.03_255/0.6)] border border-[oklch(0.85_0.18_195/0.18)] hover:border-[oklch(0.85_0.18_195/0.5)] hover:bg-[oklch(0.22_0.04_255/0.8)] transition-all text-sm text-[oklch(0.85_0.18_195)]"
        >
          <ChevronDown className="h-4 w-4 group-active:translate-y-0.5 transition-transform" />
          <span>Down</span>
        </button>
        <select
          value={stepIdx}
          onChange={(e) => setStepIdx(Number(e.target.value))}
          className="bg-[oklch(0.18_0.03_255/0.6)] border border-[oklch(0.85_0.18_195/0.18)] rounded-md text-xs text-center text-[oklch(0.92_0.01_250)] py-2.5 cursor-pointer hover:border-[oklch(0.85_0.18_195/0.5)] focus:outline-none focus:ring-1 focus:ring-[oklch(0.85_0.18_195/0.5)]"
          aria-label="Tuning step size"
        >
          {STEP_OPTIONS.map((s, i) => (
            <option key={s.label} value={i} className="bg-[oklch(0.13_0.02_255)]">
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => handleStep(1)}
          className="group flex items-center justify-center gap-1.5 py-2.5 rounded-md bg-[oklch(0.18_0.03_255/0.6)] border border-[oklch(0.85_0.18_195/0.18)] hover:border-[oklch(0.85_0.18_195/0.5)] hover:bg-[oklch(0.22_0.04_255/0.8)] transition-all text-sm text-[oklch(0.85_0.18_195)]"
        >
          <span>Up</span>
          <ChevronUp className="h-4 w-4 group-active:-translate-y-0.5 transition-transform" />
        </button>
      </div>

      {/* Quick band scan buttons */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[
          { label: "FM", freq: 96.5e6, demod: "WFM" as const, bw: 180e3 },
          { label: "Airband", freq: 127.2e6, demod: "AM" as const, bw: 25e3 },
          { label: "Marine", freq: 156.8e6, demod: "NFM" as const, bw: 25e3 },
          { label: "NOAA", freq: 162.4e6, demod: "NFM" as const, bw: 25e3 },
          { label: "20m Ham", freq: 14.2e6, demod: "USB" as const, bw: 3e3 },
          { label: "WWV", freq: 10e6, demod: "AM" as const, bw: 10e3 },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => {
              setFrequency(b.freq);
              useSdrStore.getState().setDemod(b.demod);
              useSdrStore.getState().setBandwidth(b.bw);
              onTune?.(b.freq);
            }}
            className="px-2.5 py-1 rounded-md text-[11px] sdr-mono bg-[oklch(0.16_0.03_255/0.6)] border border-[oklch(0.85_0.18_195/0.15)] hover:bg-[oklch(0.22_0.04_255/0.8)] hover:border-[oklch(0.85_0.18_195/0.5)] transition-all text-[oklch(0.78_0.05_250)]"
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface DigitCellProps {
  digit: number;
  weight: number;
  bump: (weight: number, direction: 1 | -1) => void;
  groupColor: string;
}

function DigitCell({ digit, weight, bump, groupColor }: DigitCellProps) {
  return (
    <div className="relative group flex flex-col items-center">
      <button
        type="button"
        onClick={() => bump(weight, 1)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-[oklch(0.85_0.18_195)] hover:text-[oklch(0.95_0.04_195)]"
        tabIndex={-1}
        aria-label={`Increment digit ${weight}`}
      >
        <ChevronUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => bump(weight, 1)}
        onContextMenu={(e) => {
          e.preventDefault();
          bump(weight, -1);
        }}
        className={cn(
          "px-1 sm:px-1.5 py-0.5 rounded leading-none cursor-pointer transition-colors hover:bg-[oklch(0.85_0.18_195/0.15)] hover:text-[oklch(0.95_0.05_195)] select-none",
          groupColor,
        )}
        title={`Click to +${weight} Hz · Right-click to -${weight} Hz`}
      >
        {digit}
      </button>
      <button
        type="button"
        onClick={() => bump(weight, -1)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-[oklch(0.85_0.18_195)] hover:text-[oklch(0.95_0.04_195)]"
        tabIndex={-1}
        aria-label={`Decrement digit ${weight}`}
      >
        <ChevronDown className="h-3 w-3" />
      </button>
    </div>
  );
}
