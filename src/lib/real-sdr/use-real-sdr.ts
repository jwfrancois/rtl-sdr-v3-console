"use client";

import { useEffect, useRef } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { RealSdrSource } from "./real-sdr-source";
import { AudioFrame, SdrStatus } from "./types";

/**
 * Singleton holder for the RealSdrSource. The source is created on first
 * connect and torn down when the user disconnects. It is NOT recreated on
 * every render — that would lose the WebSocket connection.
 */
let source: RealSdrSource | null = null;
let statusSubscribed = false;

function getSource(bridgeUrl: string): RealSdrSource {
  if (!source || source["url" as keyof RealSdrSource] !== (bridgeUrl as never)) {
    if (source) source.dispose();
    source = new RealSdrSource(bridgeUrl, 1024);
  }
  return source;
}

/**
 * React hook that owns the real-SDR source lifecycle. When `backend === "real"`
 * we connect to the bridge, subscribe to status/spectrum/audio, and forward
 * settings (frequency, gain, sample rate, demod) to the bridge as the user
 * changes them. When the backend flips back to "simulated", we tear down.
 *
 * The spectrum and audio are exposed via callbacks registered by individual
 * components (so each canvas can subscribe independently). This hook only
 * manages connection + control forwarding.
 */
export function useRealSdrManager() {
  const backend = useSdrStore((s) => s.backend);
  const bridgeUrl = useSdrStore((s) => s.bridgeUrl);
  const setBridgeConnecting = useSdrStore((s) => s.setBridgeConnecting);
  const setBridgeError = useSdrStore((s) => s.setBridgeError);
  const setHwStatus = useSdrStore((s) => s.setHwStatus);

  // Track latest settings so we can forward to the bridge
  const settingsRef = useRef({
    frequency: useSdrStore.getState().frequency,
    sampleRate: useSdrStore.getState().sampleRate,
    gainDb: useSdrStore.getState().gainDb,
    autoGain: useSdrStore.getState().autoGain,
    ppm: useSdrStore.getState().ppmCorrection,
    demod: useSdrStore.getState().demod,
    bandwidth: useSdrStore.getState().bandwidth,
    running: useSdrStore.getState().running,
  });
  useEffect(() => {
    const unsub = useSdrStore.subscribe((s) => {
      settingsRef.current = {
        frequency: s.frequency,
        sampleRate: s.sampleRate,
        gainDb: s.gainDb,
        autoGain: s.autoGain,
        ppm: s.ppmCorrection,
        demod: s.demod,
        bandwidth: s.bandwidth,
        running: s.running,
      };
    });
    return unsub;
  }, []);

  // Connect / disconnect when backend changes
  useEffect(() => {
    if (backend !== "real") {
      if (source) {
        source.dispose();
        source = null;
        statusSubscribed = false;
        setHwStatus(null);
      }
      return;
    }

    const src = getSource(bridgeUrl);
    setBridgeConnecting(true);
    setBridgeError(null);

    // Subscribe to status updates
    if (!statusSubscribed) {
      src.onStatus((s: SdrStatus) => {
        setHwStatus(s);
        if (s.connected) {
          setBridgeConnecting(false);
          setBridgeError(null);
        }
      });
      statusSubscribed = true;
    }

    src.connect()
      .then(() => {
        setBridgeConnecting(false);
        // Push current settings to the bridge
        const s = settingsRef.current;
        src.configure({ type: "set_frequency", hz: s.frequency });
        src.configure({ type: "set_sample_rate", hz: s.sampleRate });
        src.configure({
          type: "set_gain",
          db: s.autoGain ? "auto" : s.gainDb,
        });
        src.configure({ type: "set_ppm", ppm: s.ppm });
        src.setDemod(s.demod, s.bandwidth);
        if (s.running) src.configure({ type: "start" });
        else src.configure({ type: "stop" });
      })
      .catch((err: Error) => {
        setBridgeConnecting(false);
        setBridgeError(err.message);
      });

    return () => {
      // Don't dispose on every re-render — only when the user explicitly
      // switches backends. The `backend !== "real"` branch above handles
      // that case.
    };
  }, [backend, bridgeUrl, setBridgeConnecting, setBridgeError, setHwStatus]);

  // Forward control changes to the bridge whenever settings change
  const lastForwardedRef = useRef({
    frequency: -1,
    sampleRate: -1,
    gainDb: -1,
    autoGain: null as boolean | null,
    ppm: 0,
    demod: "",
    bandwidth: -1,
    running: null as boolean | null,
  });
  useEffect(() => {
    if (backend !== "real" || !source) return;
    const s = settingsRef.current;
    const last = lastForwardedRef.current;
    if (s.frequency !== last.frequency) {
      source.configure({ type: "set_frequency", hz: s.frequency });
      last.frequency = s.frequency;
    }
    if (s.sampleRate !== last.sampleRate) {
      source.configure({ type: "set_sample_rate", hz: s.sampleRate });
      last.sampleRate = s.sampleRate;
    }
    if (s.gainDb !== last.gainDb || s.autoGain !== last.autoGain) {
      source.configure({ type: "set_gain", db: s.autoGain ? "auto" : s.gainDb });
      last.gainDb = s.gainDb;
      last.autoGain = s.autoGain;
    }
    if (s.ppm !== last.ppm) {
      source.configure({ type: "set_ppm", ppm: s.ppm });
      last.ppm = s.ppm;
    }
    if (s.demod !== last.demod || s.bandwidth !== last.bandwidth) {
      source.setDemod(s.demod, s.bandwidth);
      last.demod = s.demod;
      last.bandwidth = s.bandwidth;
    }
    if (s.running !== last.running) {
      source.configure({ type: s.running ? "start" : "stop" });
      last.running = s.running;
    }
  });
}

/** Register a spectrum callback against the live real-SDR source (if connected). */
export function onRealSpectrum(
  cb: (data: Float32Array, fc: number, sr: number) => void,
): () => void {
  if (!source) return () => {};
  return source.onSpectrum(cb);
}

/** Register an audio callback against the live real-SDR source (if connected). */
export function onRealAudio(cb: (f: AudioFrame) => void): () => void {
  if (!source) return () => {};
  return source.onAudio(cb);
}

/** Returns true iff we are connected to a real SDR via the bridge. */
export function isRealSdrConnected(): boolean {
  return !!source && useSdrStore.getState().hwStatus?.connected === true;
}
