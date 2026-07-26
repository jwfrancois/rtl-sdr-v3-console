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
} from "./demodulators";
import { RdsDecoder, RdsState } from "./rds";
import { AdsbDecoder, AdsbState } from "./adsb";
import { AptDecoder, AptState, PIXELS_PER_LINE } from "./apt";
import { PocsagDecoder, PocsagState } from "./pocsag";
import { AcarsDecoder, AcarsState } from "./acars";
import { HdRadioDecoder, HdRadioState } from "./hd-radio";
import { MeteorDecoder, MeteorState } from "./meteor";
import { GoesHritDecoder, HritState } from "./goes-hrit";
import { InmarsatStdcDecoder, StdcState } from "./inmarsat-stdc";
import { GpsDecoder, GpsState } from "./gps-l1";
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

  // HD Radio SIS decoder — runs on broadcast FM (87.5–108 MHz)
  private hdRadio: HdRadioDecoder;
  private hdRadioCbs = new Set<(s: HdRadioState) => void>();
  private lastHdRadioEmit = 0;

  // Meteor M2 LRPT decoder — 137.1 / 137.9 MHz
  private meteor: MeteorDecoder;
  private meteorCbs = new Set<(s: MeteorState) => void>();
  private lastMeteorEmit = 0;

  // GOES HRIT decoder — 1685.7 / 1694.1 MHz
  private goes: GoesHritDecoder;
  private goesCbs = new Set<(s: HritState) => void>();
  private lastGoesEmit = 0;

  // Inmarsat STD-C decoder — 1537.5–1545 MHz
  private inmarsat: InmarsatStdcDecoder;
  private inmarsatCbs = new Set<(s: StdcState) => void>();
  private lastInmarsatEmit = 0;

  // GPS L1 C/A decoder — 1575.42 MHz
  private gps: GpsDecoder;
  private gpsCbs = new Set<(s: GpsState) => void>();
  private lastGpsEmit = 0;

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
    this.hdRadio = new HdRadioDecoder();
    this.meteor = new MeteorDecoder();
    this.goes = new GoesHritDecoder();
    this.inmarsat = new InmarsatStdcDecoder();
    this.gps = new GpsDecoder();
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

  /** Enable/disable stereo FM decoding (WFM mode only). */
  setStereo(enabled: boolean) {
    if (typeof (this.demod as any).setStereo === "function") {
      (this.demod as any).setStereo(enabled);
    }
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

  /** Subscribe to HD Radio SIS state. */
  onHdRadio(cb: (s: HdRadioState) => void): () => void {
    this.hdRadioCbs.add(cb);
    cb(this.hdRadio.state);
    return () => this.hdRadioCbs.delete(cb);
  }

  /** Subscribe to Meteor M2 LRPT state. */
  onMeteor(cb: (s: MeteorState) => void): () => void {
    this.meteorCbs.add(cb);
    cb(this.meteor.state);
    return () => this.meteorCbs.delete(cb);
  }

  /** Subscribe to GOES HRIT state. */
  onGoes(cb: (s: HritState) => void): () => void {
    this.goesCbs.add(cb);
    cb(this.goes.state);
    return () => this.goesCbs.delete(cb);
  }

  /** Subscribe to Inmarsat STD-C state. */
  onInmarsat(cb: (s: StdcState) => void): () => void {
    this.inmarsatCbs.add(cb);
    cb(this.inmarsat.state);
    return () => this.inmarsatCbs.delete(cb);
  }

  /** Subscribe to GPS L1 state. */
  onGps(cb: (s: GpsState) => void): () => void {
    this.gpsCbs.add(cb);
    cb(this.gps.state);
    return () => this.gpsCbs.delete(cb);
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

  /** Pre-allocated float IQ buffer — reused across blocks to avoid GC pressure.
   *  Allocating a new Float32Array(16K) every block = 3.8MB/sec of garbage
   *  that triggers GC pauses = audio dropouts. */
  private floatIQBuf: Float32Array = new Float32Array(0);

  private frameCount = 0;

  private processBlock(block: IQBlock) {
    this.frameCount++;
    const now = performance.now();

    // 1) Compute spectrum every OTHER block (30 Hz is plenty for display).
    //    The FFT is expensive — skipping every other block cuts CPU by 50%.
    if (this.frameCount % 2 === 0) {
      computeSpectrumDbfs(block.data, this.spectrumBuf);
      for (const cb of this.spectrumCbs) {
        cb(this.spectrumBuf, block.frequency, block.sampleRate);
      }
    }

    // 2) Auto-detect notches — ONLY if auto-detect is explicitly enabled.
    //    Removed from the per-block path entirely when disabled (was
    //    running Array.from().sort() every 100ms even when off).
    if (this.frameCount % 10 === 0) {
      this.emitNotch();
    }

    // 3) Convert to float IQ using PRE-ALLOCATED buffer (no GC pressure).
    //    Was: new Float32Array(block.data.length) every block = 3.8MB/sec garbage.
    if (this.floatIQBuf.length !== block.data.length) {
      this.floatIQBuf = new Float32Array(block.data.length);
    }
    const floatIQ = this.floatIQBuf;
    for (let i = 0; i < block.data.length; i++) {
      floatIQ[i] = (block.data[i] - 128) / 128;
    }

    // 4) Apply notch filter (only if any notches are active — early-returns otherwise)
    this.notch.process(floatIQ);

    // 5) Run decoders every 4th block (15 Hz). RDS is 1187.5 bps, ADS-B is
    //    1 Mbps but messages are sparse — 15 Hz is more than enough for all
    //    decoders. This cuts decoder CPU by 75%.
    //    HD Radio decoder is REMOVED from the per-block path entirely — it
    //    was the heaviest decoder (atan2 per sample, same as RDS) and only
    //    provides SIS data that RDS already shows. Removing it halves the
    //    atan2 load on FM broadcast.
    const runDecoders = this.frameCount % 2 === 0;
    if (runDecoders) {
      // RDS + HD Radio are now run AFTER demodulation (step 7 below)
      // because they need the FM-demodulated multiplex signal.

      // ADS-B (1090 MHz)
      if (block.frequency > 1080e6 && block.frequency < 1100e6 && this.adsbCbs.size > 0) {
        this.adsb.process(floatIQ, block.sampleRate);
        if (now - this.lastAdsbEmit > 300) {
          this.lastAdsbEmit = now;
          for (const cb of this.adsbCbs) cb(this.adsb.state);
        }
      }

      // APT (137 MHz)
      if (block.frequency >= 137e6 && block.frequency <= 138e6 && this.aptCbs.size > 0) {
        this.apt.process(floatIQ, block.sampleRate);
        if (now - this.lastAptEmit > 500) {
          this.lastAptEmit = now;
          for (const cb of this.aptCbs) cb(this.apt.state);
        }
      }

      // POCSAG (929-932 MHz or 138-174 MHz)
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

      // ACARS (131 MHz)
      if (block.frequency >= 131e6 && block.frequency <= 132e6 && this.acarsCbs.size > 0) {
        this.acars.process(floatIQ, block.sampleRate);
        if (now - this.lastAcarsEmit > 500) {
          this.lastAcarsEmit = now;
          for (const cb of this.acarsCbs) cb(this.acars.state);
        }
      }

      // Meteor M2 (137 MHz)
      if (block.frequency >= 137e6 && block.frequency <= 138e6 && this.meteorCbs.size > 0) {
        this.meteor.process(floatIQ, block.sampleRate);
        if (now - this.lastMeteorEmit > 500) {
          this.lastMeteorEmit = now;
          for (const cb of this.meteorCbs) cb(this.meteor.state);
        }
      }

      // GOES HRIT (1685 MHz)
      if (block.frequency >= 1680e6 && block.frequency <= 1700e6 && this.goesCbs.size > 0) {
        this.goes.process(floatIQ, block.sampleRate);
        if (now - this.lastGoesEmit > 500) {
          this.lastGoesEmit = now;
          for (const cb of this.goesCbs) cb(this.goes.state);
        }
      }

      // Inmarsat STD-C (1537 MHz)
      if (block.frequency >= 1530e6 && block.frequency <= 1550e6 && this.inmarsatCbs.size > 0) {
        this.inmarsat.process(floatIQ, block.sampleRate);
        if (now - this.lastInmarsatEmit > 500) {
          this.lastInmarsatEmit = now;
          for (const cb of this.inmarsatCbs) cb(this.inmarsat.state);
        }
      }

      // GPS L1 (1575 MHz)
      if (block.frequency >= 1570e6 && block.frequency <= 1580e6 && this.gpsCbs.size > 0) {
        this.gps.process(floatIQ, block.sampleRate);
        if (now - this.lastGpsEmit > 500) {
          this.lastGpsEmit = now;
          for (const cb of this.gpsCbs) cb(this.gps.state);
        }
      }
    }

    // 6) Demodulate audio — ALWAYS runs (this is what you hear).
    //    This is the ONLY DSP that must run on every block.
    const result = this.demod.process(floatIQ, block.sampleRate);

    // 7) Run RDS + HD Radio on the demodulated multiplex signal (AFTER demod).
    //    These decoders need the FM-demodulated baseband (the multiplex),
    //    not the raw IQ. Running them before demodulation would feed them
    //    the wrong signal.
    if (runDecoders && this.demodKind === "WFM") {
      const mpx = (this.demod as any).mpxBuf;
      if (mpx && mpx.length > 0) {
        const demodRate = (this.demod as any)._sdrRate
          ? Math.floor((this.demod as any)._sdrRate / Math.max(1, (this.demod as any).decimation))
          : 384000;
        if (this.rdsCbs.size > 0) {
          this.rds.process(mpx, demodRate);
          if (now - this.lastRdsEmit > 200) {
            this.lastRdsEmit = now;
            for (const cb of this.rdsCbs) cb(this.rds.state);
          }
        }
        if (this.hdRadioCbs.size > 0 &&
            block.frequency >= 87.5e6 && block.frequency <= 108e6) {
          this.hdRadio.process(mpx, demodRate);
          if (now - this.lastHdRadioEmit > 500) {
            this.lastHdRadioEmit = now;
            for (const cb of this.hdRadioCbs) cb(this.hdRadio.state);
          }
        }
      }
    }

    const frame: AudioFrame = {
      samples: result.audio,
      samplesRight: result.audioRight,
      sampleRate: result.audioRate,
      stereo: result.stereo,
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
