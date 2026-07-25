/**
 * Shared types for the real-SDR pipeline.
 *
 * The browser cannot talk to USB radio hardware directly at the rates the
 * RTL2832U needs (2.4+ MS/s of bulk transfers). Instead, the user runs a
 * small bridge on their PC that wraps `rtl_tcp` and exposes the IQ stream
 * over WebSocket. This module defines the contract between that bridge and
 * this app.
 */

/** A single IQ sample (unsigned 8-bit, as the RTL2832U produces). */
export interface IQBlock {
  /** Raw bytes from the SDR — interleaved I, Q, I, Q, … (each 0–255, DC at 127). */
  data: Uint8Array;
  /** Sample rate in Hz the SDR was running at when these were captured. */
  sampleRate: number;
  /** Center frequency in Hz the SDR was tuned to. */
  frequency: number;
  /** Server timestamp (ms) when this block was captured. */
  timestamp: number;
}

/** Commands the app sends to the bridge. */
export type SdrCommand =
  | { type: "set_frequency"; hz: number }
  | { type: "set_sample_rate"; hz: number }
  | { type: "set_gain"; db: number | "auto" }
  | { type: "set_ppm"; ppm: number }
  | { type: "start" }
  | { type: "stop" }
  | { type: "status" }
  | { type: "start_recording"; name?: string }
  | { type: "stop_recording" }
  | { type: "flush" }; // flush IQ buffer on retune

/** Status payload the bridge periodically reports. */
export interface SdrStatus {
  connected: boolean;
  deviceName: string;
  frequency: number;
  sampleRate: number;
  gainDb: number | "auto";
  ppm: number;
  /** Available gain values the tuner supports (dB). */
  gains: number[];
  /** Buffer overruns since connect — non-zero means the bridge is dropping samples. */
  overruns: number;
  /** Time the bridge has been streaming (seconds). */
  uptime: number;
  /** Recording info if a recording is in progress, else null. */
  recording: {
    path: string;
    bytes: number;
    duration: number; // seconds
    sampleRate: number;
    frequency: number;
  } | null;
}

/** A demodulated audio frame, ready to be pushed to the audio output. */
export interface AudioFrame {
  /** Left channel PCM samples in [-1, 1] (also the mono channel when stereo=false). */
  samples: Float32Array;
  /** Right channel PCM samples in [-1, 1] (only present when stereo). */
  samplesRight?: Float32Array;
  /** Sample rate of the audio (after decimation), typically 48 kHz. */
  sampleRate: number;
  /** Whether this frame contains stereo data. */
  stereo: boolean;
}

/** Common interface implemented by both the simulated and real SDR sources. */
export interface SdrSource {
  readonly kind: "simulated" | "real";
  /** Subscribe to live spectrum updates (dBFS per bin, length = fftSize). */
  onSpectrum(cb: (data: Float32Array, freqCenter: number, sampleRate: number) => void): () => void;
  /** Subscribe to demodulated audio frames. */
  onAudio(cb: (frame: AudioFrame) => void): () => void;
  /** Subscribe to status updates. */
  onStatus(cb: (s: SdrStatus) => void): () => void;
  /** Apply control settings. */
  configure(cmd: SdrCommand): void;
  /** Stop the source and release resources. */
  dispose(): void;
}
