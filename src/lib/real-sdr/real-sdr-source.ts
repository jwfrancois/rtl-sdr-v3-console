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
import { RdsDecoder, RdsState } from "./rds";
import { AdsbDecoder, AdsbState } from "./adsb";
import { AptDecoder, AptState, PIXELS_PER_LINE } from "./apt";
import { PocsagDecoder, PocsagState } from "./pocsag";
import { AcarsDecoder, AcarsState } from "./acars";
import { NotchFilter, NotchSpec } from "./notch-filter";
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

  // RDS decoder — only runs when in WFM mode
  private rds: RdsDecoder;
  private rdsCbs = new Set<(s: RdsState) => void>();
  private lastRdsEmit = 0;

  // Other decoders — each runs based on the current frequency/mode
  private adsb: AdsbDecoder;
  private adsbCbs = new Set<(s: AdsbState) => void>();
  private lastAdsbEmit = 0;
  private apt: AptDecoder;
  private aptCbs = new Set<(s: AptState) => void>();
  private lastAptEmit = 0;
  private pocsag: PocsagDecoder;
  private pocsagCbs = new Set<(s: PocsagState) => void>();
  private lastPocsagEmit = 0;
  private acars: AcarsDecoder;
  private acarsCbs = new Set<(s: AcarsState) => void>();
  private lastAcarsEmit = 0;

  // Notch filter — applied to IQ before demod
  private notch: NotchFilter;
  private notchCbs = new Set<(n: NotchSpec[]) => void>();
  private lastNotchEmit = 0;
  private autoNotchLastRun = 0;

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
    this.rds = new RdsDecoder();
    this.adsb = new AdsbDecoder();
    this.apt = new AptDecoder();
    this.pocsag = new PocsagDecoder();
    this.acars = new AcarsDecoder();
    this.notch = new NotchFilter();
  }

  /** Set the demodulator mode + bandwidth. Recreates the demod instance. */
  setDemod(mode: DemodMode, bandwidth: number) {
    const kind = mode as DemodKind;
    if (kind === this.demodKind && bandwidth === this.bandwidth) return;
    this.demodKind = kind;
    this.bandwidth = bandwidth;
    this.demod = createDemodulator(kind, bandwidth);
    // RDS only makes sense on broadcast FM — reset it otherwise
    if (kind !== "WFM") this.rds.reset();
  }

  /** Subscribe to RDS state updates. */
  onRds(cb: (s: RdsState) => void): () => void {
    this.rdsCbs.add(cb);
    cb(this.rds.state);
    return () => this.rdsCbs.delete(cb);
  }

  /** Subscribe to ADS-B state updates (aircraft positions). */
  onAdsb(cb: (s: AdsbState) => void): () => void {
    this.adsbCbs.add(cb);
    cb(this.adsb.state);
    return () => this.adsbCbs.delete(cb);
  }

  /** Subscribe to APT image updates (NOAA weather satellite). */
  onApt(cb: (s: AptState) => void): () => void {
    this.aptCbs.add(cb);
    cb(this.apt.state);
    return () => this.aptCbs.delete(cb);
  }

  /** Subscribe to POCSAG pager messages. */
  onPocsag(cb: (s: PocsagState) => void): () => void {
    this.pocsagCbs.add(cb);
    cb(this.pocsag.state);
    return () => this.pocsagCbs.delete(cb);
  }

  /** Subscribe to ACARS aircraft messaging. */
  onAcars(cb: (s: AcarsState) => void): () => void {
    this.acarsCbs.add(cb);
    cb(this.acars.state);
    return () => this.acarsCbs.delete(cb);
  }

  /** Subscribe to notch filter list updates. */
  onNotch(cb: (n: NotchSpec[]) => void): () => void {
    this.notchCbs.add(cb);
    cb(this.notch.getNotches());
    return () => this.notchCbs.delete(cb);
  }

  /** Add a manual notch at the given offset. */
  addNotch(freqHz: number, q: number = 30) {
    this.notch.addNotch(freqHz, q, false);
    this.emitNotch();
  }

  /** Remove a notch at the given offset. */
  removeNotch(freqHz: number) {
    this.notch.removeNotch(freqHz);
    this.emitNotch();
  }

  /** Clear all auto-detected notches. */
  clearAutoNotches() {
    this.notch.clearAutoNotches();
    this.emitNotch();
  }

  /** Configure the notch filter. */
  configureNotch(opts: {
    sampleRate?: number;
    autoDetect?: boolean;
    autoDetectMinDb?: number;
    autoDetectMinSpacingHz?: number;
  }) {
    const sampleRate = opts.sampleRate ?? this.currentStatus.sampleRate ?? 2.4e6;
    this.notch.configure({
      sampleRate,
      autoDetect: opts.autoDetect,
      autoDetectMinDb: opts.autoDetectMinDb,
      autoDetectMinSpacingHz: opts.autoDetectMinSpacingHz,
    });
    this.emitNotch();
  }

  private emitNotch() {
    const notches = this.notch.getNotches();
    for (const cb of this.notchCbs) cb(notches);
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
    // 1) Compute spectrum (on raw IQ, before notch — so we still SEE the interferers)
    computeSpectrumDbfs(block.data, this.spectrumBuf);
    for (const cb of this.spectrumCbs) {
      cb(this.spectrumBuf, block.frequency, block.sampleRate);
    }

    // 2) Auto-detect notches from the spectrum (run ~10 Hz)
    const now = performance.now();
    if (now - this.autoNotchLastRun > 100) {
      this.autoNotchLastRun = now;
      this.notch.autoDetectFromSpectrum(this.spectrumBuf, block.frequency, block.sampleRate);
    }

    // 3) Convert to float IQ and apply notch filter (in place)
    const floatIQ = bytesToFloatIQ(block.data);
    this.notch.configure({
      sampleRate: block.sampleRate,
    });
    this.notch.process(floatIQ);

    // 4) Run RDS decoder only in WFM mode (broadcast FM)
    if (this.demodKind === "WFM" && this.rdsCbs.size > 0) {
      this.rds.process(floatIQ, block.sampleRate);
      if (now - this.lastRdsEmit > 200) {
        this.lastRdsEmit = now;
        for (const cb of this.rdsCbs) cb(this.rds.state);
      }
    }

    // 5) Run ADS-B decoder if tuned to ~1090 MHz
    if (block.frequency > 1080e6 && block.frequency < 1100e6 && this.adsbCbs.size > 0) {
      this.adsb.process(floatIQ, block.sampleRate);
      if (now - this.lastAdsbEmit > 300) {
        this.lastAdsbEmit = now;
        for (const cb of this.adsbCbs) cb(this.adsb.state);
      }
    }

    // 6) Run APT decoder if tuned to 137-138 MHz
    if (block.frequency >= 137e6 && block.frequency <= 138e6 && this.aptCbs.size > 0) {
      this.apt.process(floatIQ, block.sampleRate);
      if (now - this.lastAptEmit > 500) {
        this.lastAptEmit = now;
        for (const cb of this.aptCbs) cb(this.apt.state);
      }
    }

    // 7) Run POCSAG decoder if tuned to 929-932 MHz (US pager band) or 138-174 MHz
    if (
      ((block.frequency >= 929e6 && block.frequency <= 932e6) ||
       (block.frequency >= 138e6 && block.frequency <= 174e6)) &&
      this.pocsagCbs.size > 0
    ) {
      this.pocsag.process(floatIQ, block.sampleRate);
      if (now - this.lastPocsagEmit > 500) {
        this.lastPocsagEmit = now;
        for (const cb of this.pocsagCbs) cb(this.pocsag.state);
      }
    }

    // 8) Run ACARS decoder if tuned to ~131.55 MHz
    if (
      block.frequency >= 131e6 && block.frequency <= 132e6 &&
      this.acarsCbs.size > 0
    ) {
      this.acars.process(floatIQ, block.sampleRate);
      if (now - this.lastAcarsEmit > 500) {
        this.lastAcarsEmit = now;
        for (const cb of this.acarsCbs) cb(this.acars.state);
      }
    }

    // 9) Emit notch list (throttled)
    if (now - this.lastNotchEmit > 1000) {
      this.lastNotchEmit = now;
      this.emitNotch();
    }

    // 10) Demodulate audio (on notched IQ)
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
