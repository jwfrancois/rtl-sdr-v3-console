"use client";

import {
  AudioFrame,
  IQBlock,
  SdrCommand,
  SdrSource,
  SdrStatus,
} from "./types";
import { computeSpectrumDbfs } from "./dsp";
import {
  DemodKind,
  createDemodulator,
  bytesToFloatIQ,
} from "./demodulators";
import { DemodMode } from "@/lib/sdr-engine";

/**
 * Real-SDR source that connects to a local bridge (see
 * `download/sdr-bridge/`) which in turn talks to `rtl_tcp` on your PC.
 *
 * The bridge protocol is JSON control messages one way, binary IQ bytes
 * the other. See `download/sdr-bridge/README.md` for setup instructions.
 */
export class RealSdrSource implements SdrSource {
  readonly kind = "real" as const;

  private ws: WebSocket | null = null;
  /** Public so the manager can detect URL changes. */
  readonly url: string;
  private fftSize: number;
  private spectrumBuf: Float32Array;
  private demod: ReturnType<typeof createDemodulator>;
  private demodKind: DemodKind;
  private bandwidth: number;
  private pendingCmds: SdrCommand[] = [];
  private closed = false;

  // Subscribers
  private spectrumCbs = new Set<(d: Float32Array, fc: number, sr: number) => void>();
  private audioCbs = new Set<(f: AudioFrame) => void>();
  private statusCbs = new Set<(s: SdrStatus) => void>();

  // Latest known SDR state (from bridge status messages)
  private currentStatus: SdrStatus = {
    connected: false,
    deviceName: "—",
    frequency: 0,
    sampleRate: 0,
    gainDb: "auto",
    ppm: 0,
    gains: [],
    overruns: 0,
    uptime: 0,
  };

  constructor(url: string, fftSize = 1024) {
    this.url = url;
    this.fftSize = fftSize;
    this.spectrumBuf = new Float32Array(fftSize / 2);
    this.demodKind = "WFM";
    this.bandwidth = 180e3;
    this.demod = createDemodulator(this.demodKind, this.bandwidth);
  }

  /** Set the demodulator mode + bandwidth. Recreates the demod instance. */
  setDemod(mode: DemodMode, bandwidth: number) {
    const kind = mode as DemodKind;
    if (kind === this.demodKind && bandwidth === this.bandwidth) return;
    this.demodKind = kind;
    this.bandwidth = bandwidth;
    this.demod = createDemodulator(kind, bandwidth);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        try {
          this.ws.close();
        } catch {}
      }
      try {
        this.ws = new WebSocket(this.url);
        this.ws.binaryType = "arraybuffer";
      } catch (err) {
        reject(err);
        return;
      }
      const onOpen = () => {
        this.ws?.removeEventListener("open", onOpen);
        this.ws?.removeEventListener("error", onErr);
        // Flush any pending commands
        for (const cmd of this.pendingCmds) this.sendCmd(cmd);
        this.pendingCmds = [];
        this.sendCmd({ type: "status" });
        this.sendCmd({ type: "start" });
        resolve();
      };
      const onErr = (ev: Event) => {
        this.ws?.removeEventListener("open", onOpen);
        this.ws?.removeEventListener("error", onErr);
        reject(new Error(`Failed to connect to ${this.url}`));
      };
      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("error", onErr);
      this.ws.addEventListener("message", this.onMessage);
      this.ws.addEventListener("close", this.onClose);
    });
  }

  private onMessage = (ev: MessageEvent) => {
    if (typeof ev.data === "string") {
      // JSON control message
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "status") {
          this.currentStatus = { ...this.currentStatus, ...msg.payload };
          for (const cb of this.statusCbs) cb(this.currentStatus);
        } else if (msg.type === "error") {
          // Bridge reported an error — emit a status with connected=false
          console.warn("[rtl-sdr bridge]", msg.message);
        }
      } catch (e) {
        console.warn("[rtl-sdr] bad JSON from bridge", e);
      }
      return;
    }
    // Binary IQ block — first 16 bytes are a header:
    //   uint32 LE sampleRate
    //   uint64 LE frequency
    //   uint32 LE timestamp (truncated ms)
    //   rest = IQ bytes
    const buf = new Uint8Array(ev.data);
    if (buf.length < 20) return;
    const dv = new DataView(ev.data);
    const sampleRate = dv.getUint32(0, true);
    // 64-bit freq — read as two 32-bit (safe up to 4 GHz × 2)
    const freqLo = dv.getUint32(4, true);
    const freqHi = dv.getUint32(8, true);
    const frequency = freqLo + freqHi * 0x100000000;
    const timestamp = dv.getUint32(12, true);
    const iq = buf.slice(16);
    const block: IQBlock = { data: iq, sampleRate, frequency, timestamp };
    this.processBlock(block);
  };

  private onClose = () => {
    if (this.closed) return;
    this.currentStatus = { ...this.currentStatus, connected: false };
    for (const cb of this.statusCbs) cb(this.currentStatus);
  };

  private processBlock(block: IQBlock) {
    // 1) Compute spectrum
    computeSpectrumDbfs(block.data, this.spectrumBuf);
    for (const cb of this.spectrumCbs) {
      cb(this.spectrumBuf, block.frequency, block.sampleRate);
    }
    // 2) Demodulate audio
    const floatIQ = bytesToFloatIQ(block.data);
    const result = this.demod.process(floatIQ, block.sampleRate);
    const frame: AudioFrame = {
      samples: result.audio,
      sampleRate: result.audioRate,
    };
    for (const cb of this.audioCbs) cb(frame);
  }

  private sendCmd(cmd: SdrCommand) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingCmds.push(cmd);
      return;
    }
    this.ws.send(JSON.stringify(cmd));
  }

  configure(cmd: SdrCommand): void {
    this.sendCmd(cmd);
  }

  onSpectrum(cb: (data: Float32Array, fc: number, sr: number) => void): () => void {
    this.spectrumCbs.add(cb);
    return () => this.spectrumCbs.delete(cb);
  }
  onAudio(cb: (f: AudioFrame) => void): () => void {
    this.audioCbs.add(cb);
    return () => this.audioCbs.delete(cb);
  }
  onStatus(cb: (s: SdrStatus) => void): () => void {
    this.statusCbs.add(cb);
    // Emit the latest status immediately
    cb(this.currentStatus);
    return () => this.statusCbs.delete(cb);
  }

  dispose(): void {
    this.closed = true;
    this.spectrumCbs.clear();
    this.audioCbs.clear();
    this.statusCbs.clear();
    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: "stop" }));
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
