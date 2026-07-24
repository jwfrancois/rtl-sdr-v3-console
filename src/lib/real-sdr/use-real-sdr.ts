"use client";

import { useEffect, useRef } from "react";
import { useSdrStore } from "@/lib/sdr-store";
import { RealSdrSource } from "./real-sdr-source";
import { AudioFrame, SdrStatus } from "./types";
import { RdsState } from "./rds";
import { AdsbState } from "./adsb";
import { AptState } from "./apt";
import { PocsagState } from "./pocsag";
import { AcarsState } from "./acars";
import { NotchSpec } from "./notch-filter";

/**
 * Global callback sets for all signal sources.
 */
const spectrumCbs = new Set<(data: Float32Array, fc: number, sr: number) => void>();
const audioCbs = new Set<(f: AudioFrame) => void>();
const rdsCbs = new Set<(s: RdsState) => void>();
const adsbCbs = new Set<(s: AdsbState) => void>();
const aptCbs = new Set<(s: AptState) => void>();
const pocsagCbs = new Set<(s: PocsagState) => void>();
const acarsCbs = new Set<(s: AcarsState) => void>();
const notchCbs = new Set<(n: NotchSpec[]) => void>();

/**
 * Singleton holder for the RealSdrSource. The source is created on first
 * connect and torn down when the user disconnects.
 */
let source: RealSdrSource | null = null;
let sourceWired = false; // have we already attached the dispatch listeners?
let statusSubscribed = false;

/** Get or create the singleton source (used by the recording panel). */
export function _getSource(bridgeUrl: string): RealSdrSource | null {
  if (!source) return null;
  if (source.url !== bridgeUrl) return null;
  return source;
}

function getSource(bridgeUrl: string): RealSdrSource {
  if (!source || source.url !== bridgeUrl) {
    if (source) source.dispose();
    source = new RealSdrSource(bridgeUrl, 1024);
    sourceWired = false;
  }
  // Wire the source's spectrum/audio/RDS dispatchers to our global sets.
  // This is idempotent — we only do it once per source instance.
  if (!sourceWired) {
    source.onSpectrum((data, fc, sr) => {
      for (const cb of spectrumCbs) {
        try {
          cb(data, fc, sr);
        } catch (e) {
          console.error("[sdr] spectrum callback error", e);
        }
      }
    });
    source.onAudio((frame) => {
      for (const cb of audioCbs) {
        try {
          cb(frame);
        } catch (e) {
          console.error("[sdr] audio callback error", e);
        }
      }
    });
    source.onRds((state) => {
      for (const cb of rdsCbs) {
        try {
          cb(state);
        } catch (e) {
          console.error("[sdr] RDS callback error", e);
        }
      }
    });
    source.onAdsb((state) => {
      for (const cb of adsbCbs) {
        try {
          cb(state);
        } catch (e) {
          console.error("[sdr] ADS-B callback error", e);
        }
      }
    });
    source.onApt((state) => {
      for (const cb of aptCbs) {
        try {
          cb(state);
        } catch (e) {
          console.error("[sdr] APT callback error", e);
        }
      }
    });
    source.onPocsag((state) => {
      for (const cb of pocsagCbs) {
        try {
          cb(state);
        } catch (e) {
          console.error("[sdr] POCSAG callback error", e);
        }
      }
    });
    source.onAcars((state) => {
      for (const cb of acarsCbs) {
        try {
          cb(state);
        } catch (e) {
          console.error("[sdr] ACARS callback error", e);
        }
      }
    });
    source.onNotch((notches) => {
      for (const cb of notchCbs) {
        try {
          cb(notches);
        } catch (e) {
          console.error("[sdr] notch callback error", e);
        }
      }
    });
    sourceWired = true;
  }
  return source;
}

/**
 * React hook that owns the real-SDR source lifecycle. When `backend === "real"`
 * we connect to the bridge, subscribe to status, and forward settings
 * (frequency, gain, sample rate, demod) to the bridge as the user changes them.
 * When the backend flips back to "simulated", we tear down.
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
        sourceWired = false;
        statusSubscribed = false;
        setHwStatus(null);
      }
      return;
    }

    const src = getSource(bridgeUrl);
    setBridgeConnecting(true);
    setBridgeError(null);

    // Subscribe to status updates (once per source instance)
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

/**
 * Subscribe to real-SDR spectrum updates. Works even if the source
 * doesn't exist yet — the callback will automatically receive data
 * once the source is created (when the user switches to "real" mode).
 */
export function onRealSpectrum(
  cb: (data: Float32Array, fc: number, sr: number) => void,
): () => void {
  spectrumCbs.add(cb);
  return () => {
    spectrumCbs.delete(cb);
  };
}

/**
 * Subscribe to real-SDR audio frames. Same lifecycle guarantee as
 * `onRealSpectrum`.
 */
export function onRealAudio(cb: (f: AudioFrame) => void): () => void {
  audioCbs.add(cb);
  return () => {
    audioCbs.delete(cb);
  };
}

/**
 * Subscribe to RDS state updates. Same lifecycle guarantee as the others.
 * Only produces meaningful updates when in WFM mode and tuned to a
 * broadcast FM station carrying RDS.
 */
export function onRealRds(cb: (s: RdsState) => void): () => void {
  rdsCbs.add(cb);
  return () => {
    rdsCbs.delete(cb);
  };
}

/** Subscribe to ADS-B aircraft state. Updates when tuned to ~1090 MHz. */
export function onRealAdsb(cb: (s: AdsbState) => void): () => void {
  adsbCbs.add(cb);
  return () => { adsbCbs.delete(cb); };
}

/** Subscribe to APT image updates. Updates when tuned to 137–138 MHz. */
export function onRealApt(cb: (s: AptState) => void): () => void {
  aptCbs.add(cb);
  return () => { aptCbs.delete(cb); };
}

/** Subscribe to POCSAG pager messages. Updates when tuned to pager bands. */
export function onRealPocsag(cb: (s: PocsagState) => void): () => void {
  pocsagCbs.add(cb);
  return () => { pocsagCbs.delete(cb); };
}

/** Subscribe to ACARS messages. Updates when tuned to 131–132 MHz. */
export function onRealAcars(cb: (s: AcarsState) => void): () => void {
  acarsCbs.add(cb);
  return () => { acarsCbs.delete(cb); };
}

/** Subscribe to notch filter list changes. */
export function onRealNotch(cb: (n: NotchSpec[]) => void): () => void {
  notchCbs.add(cb);
  return () => { notchCbs.delete(cb); };
}

/** Add a manual notch at a frequency offset (Hz). */
export function addRealNotch(freqHz: number, q: number = 30) {
  if (!source) return;
  source.addNotch(freqHz, q);
}

/** Remove a notch at a frequency offset (Hz). */
export function removeRealNotch(freqHz: number) {
  if (!source) return;
  source.removeNotch(freqHz);
}

/** Clear all auto-detected notches. */
export function clearRealAutoNotches() {
  if (!source) return;
  source.clearAutoNotches();
}

/** Configure the notch filter. */
export function configureRealNotch(opts: {
  autoDetect?: boolean;
  autoDetectMinDb?: number;
  autoDetectMinSpacingHz?: number;
}) {
  if (!source) return;
  source.configureNotch(opts);
}
