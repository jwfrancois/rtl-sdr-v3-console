"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { Radio, RotateCw } from "lucide-react";
import { PausedCanvas } from "./paused-canvas";
import { useNonEssentialThrottle } from "@/lib/render-throttle";

/**
 * Tuning Dial — a rotary knob frequency tuner with analog-radio aesthetics.
 *
 * Drag vertically (or scroll) to tune:
 *   - Small drag (within inner ring): ±1 kHz per pixel
 *   - Larger drag (within outer ring): ±10 kHz per pixel
 *   - Shift+drag: ±100 kHz per pixel
 *   - Ctrl+drag: ±1 MHz per pixel
 *
 * Click anywhere on the dial to jump by the current step.
 * Right-click to enter an exact frequency via a prompt.
 *
 * Visual design:
 *   - 96 tick marks around the circumference (4 major ticks at N/E/S/W)
 *   - Inner rotor with a frequency readout
 *   - Subtle glow that intensifies when active (dragging)
 *   - Animated indicator showing the current position within the MHz
 */
export function TuningDial() {
  const frequency = useSdrStore((s) => s.frequency);
  const setFrequency = useSdrStore((s) => s.setFrequency);
  const tuneStep = useSdrStore((s) => s.tuneStep);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const { shouldRender, isActive } = useNonEssentialThrottle();

  // Drag state
  const dragRef = useRef<{
    startY: number;
    startFreq: number;
    shift: boolean;
    ctrl: boolean;
  } | null>(null);

  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);

  // Keep latest state in a ref so the animation loop reads fresh values
  const stateRef = useRef({ frequency, active, hover });
  useEffect(() => {
    stateRef.current = { frequency, active, hover };
  }, [frequency, active, hover]);

  useEffect(() => {
    const draw = () => {
      if (!shouldRender()) { rafRef.current = requestAnimationFrame(draw); return; }
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const size = Math.min(container.clientWidth, 180);
      if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const s = stateRef.current;
      const cx = size / 2;
      const cy = size / 2;
      const outerR = size / 2 - 4;
      const innerR = outerR * 0.7;

      // Outer ring background
      const ringGrad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      ringGrad.addColorStop(0, "rgba(15, 23, 38, 0.95)");
      ringGrad.addColorStop(1, "rgba(10, 14, 26, 0.95)");
      ctx.fillStyle = ringGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
      ctx.fill();

      // Outer ring border (cyan glow when active/hover)
      const glowIntensity = s.active ? 1.0 : s.hover ? 0.5 : 0.2;
      ctx.strokeStyle = `rgba(0, 212, 255, ${glowIntensity})`;
      ctx.lineWidth = s.active ? 2 : 1.5;
      ctx.shadowColor = "rgba(0, 212, 255, 0.6)";
      ctx.shadowBlur = s.active ? 14 : s.hover ? 8 : 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Tick marks — 96 ticks, 4 major at 90-degree intervals.
      // The dial position represents MHz fraction (0..1 MHz)
      const mhzFraction = (s.frequency % 1e6) / 1e6;
      const rotation = mhzFraction * 2 * Math.PI;
      for (let i = 0; i < 96; i++) {
        const angle = (i / 96) * 2 * Math.PI - Math.PI / 2 + rotation;
        const isMajor = i % 24 === 0;
        const tickLen = isMajor ? 8 : 4;
        const x1 = cx + Math.cos(angle) * (outerR - 2);
        const y1 = cy + Math.sin(angle) * (outerR - 2);
        const x2 = cx + Math.cos(angle) * (outerR - 2 - tickLen);
        const y2 = cy + Math.sin(angle) * (outerR - 2 - tickLen);
        ctx.strokeStyle = isMajor ? "rgba(255, 220, 120, 0.8)" : "rgba(120, 200, 230, 0.3)";
        ctx.lineWidth = isMajor ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // Major tick labels (0, 250k, 500k, 750k)
        if (isMajor) {
          const labelX = cx + Math.cos(angle) * (outerR - 18);
          const labelY = cy + Math.sin(angle) * (outerR - 18);
          ctx.fillStyle = "rgba(255, 220, 120, 0.7)";
          ctx.font = "8px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const labels = [".0", ".25", ".5", ".75"];
          ctx.fillText(labels[i / 24], labelX, labelY);
        }
      }

      // Inner rotor (the spinning part)
      const rotorGrad = ctx.createRadialGradient(cx - 8, cy - 8, 0, cx, cy, innerR);
      rotorGrad.addColorStop(0, "rgba(40, 55, 80, 0.95)");
      rotorGrad.addColorStop(0.7, "rgba(20, 30, 50, 0.95)");
      rotorGrad.addColorStop(1, "rgba(10, 14, 26, 0.95)");
      ctx.fillStyle = rotorGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
      ctx.fill();

      // Rotor border
      ctx.strokeStyle = "rgba(0, 212, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
      ctx.stroke();

      // Rotor indicator line (points to current position)
      const indicatorAngle = rotation - Math.PI / 2;
      const indX = cx + Math.cos(indicatorAngle) * (innerR - 8);
      const indY = cy + Math.sin(indicatorAngle) * (innerR - 8);
      ctx.strokeStyle = "rgba(255, 220, 120, 0.95)";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(255, 220, 120, 0.8)";
      ctx.shadowBlur = s.active ? 10 : 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(indX, indY);
      ctx.stroke();
      // Indicator dot
      ctx.fillStyle = "rgba(255, 220, 120, 0.95)";
      ctx.beginPath();
      ctx.arc(indX, indY, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Center hub
      ctx.fillStyle = "rgba(80, 220, 255, 0.9)";
      ctx.shadowColor = "rgba(80, 220, 255, 0.8)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Frequency readout in the lower half of the rotor
      ctx.fillStyle = "rgba(220, 240, 255, 0.95)";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const freqText = `${(s.frequency / 1e6).toFixed(4)} MHz`;
      ctx.fillText(freqText, cx, cy + innerR * 0.4);

      // Mode label in the upper half
      ctx.fillStyle = "rgba(0, 212, 255, 0.7)";
      ctx.font = "8px monospace";
      ctx.fillText("TUNING DIAL", cx, cy - innerR * 0.4);

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Pointer handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startY: e.clientY,
      startFreq: frequency,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
    };
    setActive(true);
  }, [frequency]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dy = e.clientY - dragRef.current.startY;
    // Drag UP to increase frequency (more intuitive for a knob)
    const delta = -dy;
    // Determine step size based on modifiers
    let stepPerPx: number;
    if (e.ctrlKey || dragRef.current.ctrl) stepPerPx = 1e6;     // 1 MHz/px
    else if (e.shiftKey || dragRef.current.shift) stepPerPx = 100e3; // 100 kHz/px
    else stepPerPx = 1e3;                                          // 1 kHz/px
    setFrequency(dragRef.current.startFreq + delta * stepPerPx);
  }, [setFrequency]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    setActive(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    // Scroll up = increase, scroll down = decrease
    const direction = e.deltaY < 0 ? 1 : -1;
    // Step depends on modifiers
    let step: number;
    if (e.ctrlKey) step = 1e6;
    else if (e.shiftKey) step = 100e3;
    else step = 25e3;
    tuneStep(direction, step);
  }, [tuneStep]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const input = window.prompt("Enter frequency (MHz, e.g. 91.5, 1090, 137.5):", (frequency / 1e6).toString());
    if (input !== null) {
      const mhz = parseFloat(input);
      if (!isNaN(mhz) && mhz > 0) {
        setFrequency(mhz * 1e6);
      }
    }
  }, [frequency, setFrequency]);

  if (!isActive) {
    return (
      <div className="sdr-panel rounded-xl p-4">
        <PausedCanvas label="{label}" />
      </div>
    );
  }
  return (
    <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
          <Radio className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
          <span>Tuning Dial</span>
        </div>
        <span className="text-[9px] sdr-mono text-[oklch(0.5_0.04_250)] flex items-center gap-1">
          <RotateCw className="h-2.5 w-2.5" />
          drag · scroll · right-click
        </span>
      </div>
      <div
        ref={containerRef}
        className="flex justify-center items-center"
        style={{ minHeight: 200 }}
      >
        <canvas
          ref={canvasRef}
          className="cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onContextMenu={onContextMenu}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        />
      </div>
      <div className="mt-2 text-[10px] text-[oklch(0.5_0.04_250)] text-center leading-relaxed">
        Drag up/down to tune · Shift=100kHz · Ctrl=1MHz · Scroll for fine · Right-click for direct entry
      </div>
    </div>
  );
}
