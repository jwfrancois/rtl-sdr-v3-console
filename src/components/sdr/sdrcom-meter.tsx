"use client";

import { useEffect, useRef, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { onRealSpectrum } from "@/lib/real-sdr/use-real-sdr";
import { findStationAt, stationSignalAt } from "@/lib/sdr-engine";
import { Gauge, Activity, Waves } from "lucide-react";
import { PausedCanvas } from "./paused-canvas";
import { useNonEssentialThrottle } from "@/lib/render-throttle";

/**
 * SDRCOM Receiver Meter — a professional-grade signal meter with
 * dBm, SNR, noise floor, and peak signal readouts.
 *
 * Inspired by the meters in SDR# / SDR Console — shows more detail
 * than the basic S-meter. Computes all values from the live FFT
 * spectrum (real or simulated).
 *
 * Metrics:
 *   - Signal (dBFS): peak power in the demodulator bandwidth
 *   - Noise floor (dBFS): median bin power outside the signal
 *   - SNR (dB): signal - noise floor
 *   - dBm: estimated absolute signal power (S9 = -73 dBm, each S-unit = 6 dB)
 *   - S-units: traditional S0-S9+60 readout
 *   - Bandwidth: currently selected filter bandwidth
 *   - Peak hold: highest signal seen in the last 5 seconds
 */

interface MeterReading {
  signalDb: number;
  noiseFloorDb: number;
  snrDb: number;
  dbm: number;
  sUnits: string;
  peakDb: number;
  bandwidth: number;
}

export function SdrcomMeter() {
  const backend = useSdrStore((s) => s.backend);
  const hwConnected = useSdrStore((s) => !!s.hwStatus?.connected);
  const frequency = useSdrStore((s) => s.frequency);
  const sampleRate = useSdrStore((s) => s.sampleRate);
  const bandwidth = useSdrStore((s) => s.bandwidth);
  const demod = useSdrStore((s) => s.demod);
  const gainDb = useSdrStore((s) => s.gainDb);
  const autoGain = useSdrStore((s) => s.autoGain);
  const squelch = useSdrStore((s) => s.squelch);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const { shouldRender, isActive } = useNonEssentialThrottle();
  const peakRef = useRef(-200);
  const peakTimeRef = useRef(0);
  const [reading, setReading] = useState<MeterReading | null>(null);

  // Subscribe to spectrum data (real or simulated via fallback)
  const spectrumRef = useRef<{ data: Float32Array; fc: number; sr: number } | null>(null);
  useEffect(() => {
    const unsub = onRealSpectrum((data, fc, sr) => {
      spectrumRef.current = { data, fc, sr };
    });
    return unsub;
  }, []);

  // Compute meter readings from the spectrum. Throttle setState to ~10 Hz
  // to avoid re-rendering this component (and its children) every frame.
  // The meter bar canvas is drawn by its own rAF loop and reads from refs,
  // so it stays smooth at 60 Hz.
  const readingRef = useRef<MeterReading | null>(null);
  useEffect(() => {
    let lastSetState = 0;
    const compute = () => {
      const spec = spectrumRef.current;
      let signalDb = -120;
      let noiseFloorDb = -100;
      let snrDb = 0;
      let dbm = -150;
      let sUnits = "S0";
      let peakDb = peakRef.current;

      if (spec && spec.data.length > 0) {
        const n = spec.data.length;
        // The spectrum is centered: bins 0..n/2-1 are negative freq,
        // bins n/2..n-1 are positive freq (after mirroring for display).
        // For metering, just take the center band (within demod bandwidth).
        // demod bandwidth in Hz → fraction of sampleRate → fraction of bins
        const bwFrac = Math.min(0.95, bandwidth / spec.sr);
        const centerStart = Math.floor(n / 2 - (n * bwFrac) / 2);
        const centerEnd = Math.ceil(n / 2 + (n * bwFrac) / 2);
        // Signal = max bin in the center band
        let maxDb = -200;
        for (let i = centerStart; i < centerEnd && i < n; i++) {
          if (spec.data[i] > maxDb) maxDb = spec.data[i];
        }
        // Noise floor = median of all bins outside the center band
        const noiseBins: number[] = [];
        for (let i = 0; i < n; i++) {
          if (i < centerStart || i >= centerEnd) noiseBins.push(spec.data[i]);
        }
        noiseBins.sort((a, b) => a - b);
        noiseFloorDb = noiseBins[Math.floor(noiseBins.length / 2)] ?? -100;
        signalDb = maxDb;
        snrDb = signalDb - noiseFloorDb;
        // Estimate dBm: S9 = -73 dBm at the antenna, each S-unit = 6 dB.
        // dBFS→dBm conversion is rough: assume S9 corresponds to ~-30 dBFS
        // with default gain. Adjust by current gain.
        const gainOffset = (autoGain ? 35 : gainDb) - 30;
        dbm = signalDb - 30 + 73 - gainOffset; // very rough
        if (dbm > -127) {
          // Convert dBm to S-units: S0=-127, S9=-73, each S-unit = 6 dB
          const sValue = (dbm + 127) / 6;
          if (sValue < 9) sUnits = `S${Math.floor(sValue)}`;
          else sUnits = `S9+${Math.floor((dbm + 73) / 10) * 10}`;
        } else {
          sUnits = "S0";
        }
        // Peak hold (5-second decay)
        if (signalDb > peakRef.current) {
          peakRef.current = signalDb;
          peakTimeRef.current = Date.now();
        } else if (Date.now() - peakTimeRef.current > 5000) {
          peakRef.current = Math.max(signalDb, peakRef.current - 0.2);
        }
        peakDb = peakRef.current;
      } else {
        // Simulated fallback — derive from station signal strength
        const station = findStationAt(frequency);
        const signal = station ? stationSignalAt(station, frequency) : 0;
        if (signal > 0) {
          signalDb = -60 + signal * 40;
          noiseFloorDb = -85;
          snrDb = signalDb - noiseFloorDb;
          const gainOffset = (autoGain ? 35 : gainDb) - 30;
          dbm = signalDb - 30 + 73 - gainOffset;
          const sValue = (dbm + 127) / 6;
          if (sValue < 9) sUnits = `S${Math.floor(sValue)}`;
          else sUnits = `S9+${Math.floor((dbm + 73) / 10) * 10}`;
          if (signalDb > peakRef.current) {
            peakRef.current = signalDb;
            peakTimeRef.current = Date.now();
          } else if (Date.now() - peakTimeRef.current > 5000) {
            peakRef.current = Math.max(signalDb, peakRef.current - 0.2);
          }
          peakDb = peakRef.current;
        }
      }

      // Update the ref every frame (cheap), but only setState at ~10 Hz
      // to avoid re-rendering the component every frame.
      readingRef.current = {
        signalDb, noiseFloorDb, snrDb, dbm, sUnits, peakDb,
        bandwidth,
      };
      const now = performance.now();
      if (now - lastSetState > 100) {
        setReading(readingRef.current);
        lastSetState = now;
      }
      rafRef.current = requestAnimationFrame(compute);
    };
    rafRef.current = requestAnimationFrame(compute);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [frequency, bandwidth, sampleRate, gainDb, autoGain]);

  // Draw the meter bar
  useEffect(() => {
    const draw = () => {
      if (!shouldRender()) { rafRef.current = requestAnimationFrame(draw); return; }
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) {
        requestAnimationFrame(draw);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const cssW = container.clientWidth;
      const cssH = 28;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        requestAnimationFrame(draw);
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // Background
      ctx.fillStyle = "rgba(8, 14, 28, 0.95)";
      ctx.fillRect(0, 0, cssW, cssH);

      if (!reading) {
        requestAnimationFrame(draw);
        return;
      }

      // Signal level (0..1 from -120..0 dBFS)
      const sigT = Math.max(0, Math.min(1, (reading.signalDb + 120) / 120));
      const noiseT = Math.max(0, Math.min(1, (reading.noiseFloorDb + 120) / 120));
      const peakT = Math.max(0, Math.min(1, (reading.peakDb + 120) / 120));
      // Squelch threshold marker
      const sqT = squelch;

      // Meter track
      ctx.fillStyle = "rgba(40, 50, 70, 0.5)";
      ctx.fillRect(2, 6, cssW - 4, cssH - 12);

      // Noise floor (dim)
      const noiseW = noiseT * (cssW - 4);
      const noiseGrad = ctx.createLinearGradient(0, 0, noiseW, 0);
      noiseGrad.addColorStop(0, "rgba(60, 80, 120, 0.6)");
      noiseGrad.addColorStop(1, "rgba(60, 80, 120, 0.3)");
      ctx.fillStyle = noiseGrad;
      ctx.fillRect(2, 6, noiseW, cssH - 12);

      // Signal level (gradient green→yellow→red)
      const sigW = sigT * (cssW - 4);
      const sigGrad = ctx.createLinearGradient(2, 0, cssW - 2, 0);
      sigGrad.addColorStop(0, "rgba(60, 200, 110, 0.9)");
      sigGrad.addColorStop(0.55, "rgba(255, 220, 80, 0.95)");
      sigGrad.addColorStop(0.85, "rgba(255, 140, 60, 1)");
      sigGrad.addColorStop(1, "rgba(255, 80, 80, 1)");
      ctx.fillStyle = sigGrad;
      ctx.fillRect(2, 6, sigW, cssH - 12);

      // Peak hold marker (thin white line)
      const peakX = 2 + peakT * (cssW - 4);
      ctx.strokeStyle = "rgba(255, 240, 180, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(255, 240, 180, 0.7)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(peakX, 4);
      ctx.lineTo(peakX, cssH - 4);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Squelch threshold marker (dashed red)
      const sqX = 2 + sqT * (cssW - 4);
      ctx.strokeStyle = "rgba(255, 100, 100, 0.7)";
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sqX, 2);
      ctx.lineTo(sqX, cssH - 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tick marks (-120, -90, -60, -30, 0 dBFS)
      ctx.fillStyle = "rgba(180, 200, 220, 0.5)";
      ctx.font = "7px monospace";
      ctx.textAlign = "center";
      for (let db = -120; db <= 0; db += 30) {
        const x = 2 + ((db + 120) / 120) * (cssW - 4);
        ctx.fillRect(x, cssH - 4, 1, 2);
        ctx.fillText(`${db}`, x, cssH - 1);
      }
      ctx.textAlign = "start";

      requestAnimationFrame(draw);
    };
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [reading, squelch]);

  if (!isActive) {
    return (
      <div className="sdr-panel rounded-xl p-4">
        <PausedCanvas label="SDRCOM Meter" />
      </div>
    );
  }
  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Gauge className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>SDRCOM Receiver Meter</span>
        </div>
        <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
          {backend === "real" && hwConnected ? "LIVE HW" : "SIMULATED"}
        </span>
      </div>

      {/* Big S-unit + dBm readout */}
      <div className="flex items-end justify-between mb-2">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">S-Units</span>
          <span className="text-2xl font-bold sdr-mono text-[oklch(0.92_0.04_195)] sdr-text-glow leading-tight">
            {reading?.sUnits ?? "S0"}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">Power</span>
          <span className="text-xl font-bold sdr-mono text-[oklch(0.85_0.18_195)] leading-tight">
            {reading ? `${reading.dbm.toFixed(0)}` : "—"} <span className="text-[10px] text-[oklch(0.55_0.04_250)]">dBm</span>
          </span>
        </div>
      </div>

      {/* Meter bar canvas */}
      <div ref={containerRef} className="w-full" style={{ height: 28 }}>
        <canvas ref={canvasRef} className="rounded-md" />
      </div>

      {/* Detailed readouts */}
      <div className="grid grid-cols-4 gap-2 mt-3 text-[10px] sdr-mono">
        <Metric label="Signal" value={reading ? `${reading.signalDb.toFixed(1)}` : "—"} unit="dBFS" color="cyan" />
        <Metric label="Noise" value={reading ? `${reading.noiseFloorDb.toFixed(1)}` : "—"} unit="dBFS" color="dim" />
        <Metric label="SNR" value={reading ? `${reading.snrDb.toFixed(1)}` : "—"} unit="dB" color={reading && reading.snrDb > 10 ? "emerald" : "amber"} />
        <Metric label="Peak" value={reading ? `${reading.peakDb.toFixed(1)}` : "—"} unit="dBFS" color="amber" />
      </div>

      {/* Footer with bandwidth + mode */}
      <div className="mt-2 pt-2 border-t border-[oklch(0.85_0.18_195/0.1)] flex items-center justify-between text-[9px] sdr-mono text-[oklch(0.5_0.04_250)]">
        <span className="flex items-center gap-1">
          <Activity className="h-2.5 w-2.5" />
          {demod} · BW {(bandwidth / 1e3).toFixed(1)} kHz
        </span>
        <span className="flex items-center gap-1">
          <Waves className="h-2.5 w-2.5" />
          {autoGain ? "AGC" : `${gainDb.toFixed(1)} dB`}
        </span>
      </div>
    </div>
  );
}

function Metric({
  label, value, unit, color,
}: {
  label: string;
  value: string;
  unit: string;
  color: "cyan" | "amber" | "emerald" | "dim";
}) {
  const colors = {
    cyan: "text-[oklch(0.85_0.18_195)]",
    amber: "text-[oklch(0.82_0.16_70)]",
    emerald: "text-[oklch(0.80_0.18_155)]",
    dim: "text-[oklch(0.65_0.04_250)]",
  };
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-wider text-[oklch(0.5_0.04_250)]">
        {label}
      </span>
      <div className="flex items-baseline gap-0.5">
        <span className={`text-[12px] font-semibold ${colors[color]}`}>{value}</span>
        <span className="text-[8px] text-[oklch(0.5_0.04_250)]">{unit}</span>
      </div>
    </div>
  );
}
