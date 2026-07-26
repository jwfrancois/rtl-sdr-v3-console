"use client";

import { useEffect, useRef } from "react";

/**
 * Throttle hook for canvas rendering.
 *
 * Instead of rendering at 60 Hz (browser default rAF rate), this limits
 * canvas rendering to 20 Hz (every 50ms). This cuts rendering CPU by 67%
 * while remaining visually smooth — 20 Hz is fast enough for spectrum
 * displays, meters, and waterfalls.
 *
 * Also pauses ALL rendering when the page is hidden (window minimized or
 * tab in background) using the Page Visibility API — saves 100% of
 * rendering CPU when the user isn't looking.
 *
 * Usage in a canvas component:
 *
 *   const { shouldRender, isVisible } = useRenderThrottle();
 *   useEffect(() => {
 *     const draw = () => {
 *       if (shouldRender()) {
 *         // ... do expensive canvas work
 *       }
 *       raf = requestAnimationFrame(draw);
 *     };
 *     raf = requestAnimationFrame(draw);
 *     return () => cancelAnimationFrame(raf);
 *   }, []);
 */

const THROTTLE_MS = 50; // 20 Hz max render rate
let globalLastRender = 0;

export function useRenderThrottle() {
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const onVisibility = () => {
      isVisibleRef.current = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const shouldRender = (): boolean => {
    // Skip entirely if page is hidden (window minimized or tab backgrounded)
    if (!isVisibleRef.current) return false;
    // Throttle to THROTTLE_MS
    const now = performance.now();
    if (now - globalLastRender < THROTTLE_MS) return false;
    globalLastRender = now;
    return true;
  };

  return { shouldRender, isVisibleRef };
}

/**
 * Global audio priority flag. When true, all non-essential canvas
 * rendering is paused. Set this when the user enables audio.
 */
let audioPriority = false;

export function setAudioPriority(enabled: boolean) {
  audioPriority = enabled;
}

export function isAudioPriority(): boolean {
  return audioPriority;
}

/**
 * Throttle for non-essential rendering. When audio priority is on,
 * non-essential canvases (tuning dial, UTC clock, solar graph, etc.)
 * are paused entirely. Essential canvases (spectrum, waterfall) still
 * render at reduced rate.
 */
const NON_ESSENTIAL_THROTTLE_MS = 100; // 10 Hz when audio is off
let nonEssentialLastRender = 0;

export function useNonEssentialThrottle() {
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const onVisibility = () => {
      isVisibleRef.current = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const shouldRender = (): boolean => {
    if (!isVisibleRef.current) return false;
    if (audioPriority) return false; // pause non-essential when audio is on
    const now = performance.now();
    if (now - nonEssentialLastRender < NON_ESSENTIAL_THROTTLE_MS) return false;
    nonEssentialLastRender = now;
    return true;
  };

  return { shouldRender, isVisibleRef };
}
