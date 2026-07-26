"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Render throttle system with "performance mode" toggle.
 *
 * Two modes:
 *   - "full": All canvases render at 20 Hz (everything visible)
 *   - "essential": Only essential canvases render (spectrum, waterfall,
 *     signal meter, audio scope). Non-essential canvases (tuning dial,
 *     UTC clock, EQ graph, visualizer, signal history, ADS-B radar,
 *     SDRCOM meter) show a static "paused" placeholder instead of
 *     empty/blank canvases.
 *
 * Also pauses ALL rendering when the page is hidden (Page Visibility API).
 *
 * The mode is stored in localStorage and restored on page load.
 */

const THROTTLE_MS = 50; // 20 Hz
let globalLastRender = 0;
const NON_ESSENTIAL_THROTTLE_MS = 100; // 10 Hz
let nonEssentialLastRender = 0;

// Global mode — "full" or "essential"
type RenderMode = "full" | "essential";
let globalMode: RenderMode = "full";
const modeListeners = new Set<(mode: RenderMode) => void>();

const MODE_KEY = "rtl-sdr-v3-render-mode";

export function getRenderMode(): RenderMode {
  return globalMode;
}

export function setRenderMode(mode: RenderMode) {
  globalMode = mode;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {}
  for (const cb of modeListeners) cb(mode);
}

export function useRenderMode(): [RenderMode, (m: RenderMode) => void] {
  const [mode, setMode] = useState<RenderMode>(globalMode);

  useEffect(() => {
    // Load from localStorage on mount (deferred to avoid lint error)
    const loadId = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(MODE_KEY) as RenderMode | null;
        if (saved === "full" || saved === "essential") {
          globalMode = saved;
          setMode(saved);
        }
      } catch {}
    }, 0);

    const cb = (m: RenderMode) => setMode(m);
    modeListeners.add(cb);
    return () => { window.clearTimeout(loadId); modeListeners.delete(cb); };
  }, []);

  return [mode, setRenderMode];
}

// Audio priority — when audio is on, non-essential canvases pause
let audioPriority = false;

export function setAudioPriority(enabled: boolean) {
  audioPriority = enabled;
}

export function isAudioPriority(): boolean {
  return audioPriority;
}

/** Hook for ESSENTIAL canvases (spectrum, waterfall, signal meter, audio scope).
 *  These always render (at throttled rate) regardless of mode. */
export function useRenderThrottle() {
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const onVisibility = () => { isVisibleRef.current = !document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const shouldRender = (): boolean => {
    if (!isVisibleRef.current) return false;
    const now = performance.now();
    if (now - globalLastRender < THROTTLE_MS) return false;
    globalLastRender = now;
    return true;
  };

  return { shouldRender, isVisibleRef };
}

/** Hook for NON-ESSENTIAL canvases (tuning dial, UTC clock, EQ graph,
 *  visualizer, signal history, ADS-B radar, SDRCOM meter).
 *  These are paused when mode is "essential" or when audio priority is on. */
export function useNonEssentialThrottle() {
  const isVisibleRef = useRef(true);
  const [isActive, setIsActive] = useState(globalMode === "full");

  useEffect(() => {
    const onVisibility = () => { isVisibleRef.current = !document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();

    const modeCb = (m: RenderMode) => setIsActive(m === "full");
    modeListeners.add(modeCb);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      modeListeners.delete(modeCb);
    };
  }, []);

  const shouldRender = (): boolean => {
    if (!isVisibleRef.current) return false;
    if (globalMode === "essential") return false;
    if (audioPriority) return false;
    const now = performance.now();
    if (now - nonEssentialLastRender < NON_ESSENTIAL_THROTTLE_MS) return false;
    nonEssentialLastRender = now;
    return true;
  };

  return { shouldRender, isVisibleRef, isActive };
}
