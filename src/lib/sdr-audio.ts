"use client";

import { RadioStation, stationSignalAt } from "./sdr-engine";

/**
 * Web Audio synthesizer that produces believable audio for the
 * currently tuned station. We synthesize different audio kinds:
 *  - music: layered oscillators with slow modulation
 *  - voice: filtered noise modulated at speech cadence
 *  - morse: keyed tone at ~700 Hz
 *  - weather: slow voice-like cadence with subtle tones
 *  - aviation: clipped voice-like noise
 *  - data: bpsk-style tonal patterns
 *  - noise / silent: pure noise / silence
 *
 * The output is shaped by the station's signal strength and the
 * user's volume setting.
 */
export class SdrAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private voices: AudioNode[] = [];
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private currentStation: RadioStation | null = null;
  private currentKind: RadioStation["audioKind"] | null = null;
  private outputFreqData: Uint8Array | null = null;

  /** Lazily create the AudioContext (must be from a user gesture). */
  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.outputFreqData = new Uint8Array(this.analyser.frequencyBinCount);
    }
    return this.ctx;
  }

  async start() {
    const ctx = this.ensureCtx();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  }

  stop() {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.05);
    }
  }

  isActive(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  /**
   * Push a frame of real demodulated audio (from the IQ stream) into the
   * output. We schedule it back-to-back with the previously queued frame
   * so playback is continuous.
   *
   * The audio frame is mono Float32 PCM at `frame.sampleRate` Hz. We
   * create an AudioBuffer, copy the samples in, and connect a
   * BufferSourceNode through the master gain (which the parent sets
   * based on volume + signal).
   *
   * When in real mode, the synth voices should be silent — the caller is
   * responsible for switching the engine into real mode by calling
   * `setRealMode(true)`.
   */
  private realMode = false;
  private nextStartTime = 0;
  private realGain: GainNode | null = null;
  /** Pending buffer sources — tracked so we can cancel them on tune. */
  private pendingSources: Set<AudioBufferSourceNode> = new Set();
  /** EQ: 10 biquad filters chained, between realGain and masterGain. */
  private eqFilters: BiquadFilterNode[] = [];
  private eqInput: GainNode | null = null;
  private eqOutput: GainNode | null = null;
  private eqBypass = false;
  private eqGains: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // dB per band

  /** EQ band center frequencies (Hz) — standard ISO 1/3-octave spacing. */
  static readonly EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  setRealMode(enabled: boolean) {
    // Guard: don't do anything if we're already in this mode. This is
    // critical because pushRealAudioFrame() calls setRealMode(true) on
    // every audio frame (~100 Hz), and the setup below is expensive
    // enough to cause choppiness if it runs every frame.
    if (this.realMode === enabled) return;
    this.realMode = enabled;
    if (enabled) {
      // Mute the synth voices
      this.setStation(null, 0, 0);
      // Ensure the real-audio gain node exists
      const ctx = this.ensureCtx();
      if (!this.realGain) {
        this.realGain = ctx.createGain();
        this.realGain.gain.value = 1;
        // Build the EQ chain: realGain -> eqInput -> [10 biquads] -> eqOutput -> masterGain
        this.eqInput = ctx.createGain();
        this.eqOutput = ctx.createGain();
        this.eqFilters = [];
        let prev: AudioNode = this.eqInput;
        for (let i = 0; i < 10; i++) {
          const filter = ctx.createBiquadFilter();
          filter.type = "peaking";
          filter.frequency.value = SdrAudioEngine.EQ_BANDS[i];
          filter.Q.value = 1.41; // ~1 octave bandwidth
          filter.gain.value = 0; // flat by default
          prev.connect(filter);
          prev = filter;
          this.eqFilters.push(filter);
        }
        prev.connect(this.eqOutput);
        this.realGain.connect(this.eqInput);
        this.eqOutput.connect(this.masterGain!);
      }
      // Open the master gain so real audio is audible
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
      }
      this.nextStartTime = Math.max(this.nextStartTime, ctx.currentTime + 0.02);
    } else {
      // Tear down real-audio gain + EQ chain
      if (this.realGain) {
        try {
          this.realGain.disconnect();
        } catch {}
        this.realGain = null;
      }
      if (this.eqInput) {
        try { this.eqInput.disconnect(); } catch {}
        this.eqInput = null;
      }
      if (this.eqOutput) {
        try { this.eqOutput.disconnect(); } catch {}
        this.eqOutput = null;
      }
      this.eqFilters = [];
      this.nextStartTime = 0;
    }
  }

  /** Set the gain (dB) for a specific EQ band (0-9). */
  setEqBand(band: number, gainDb: number) {
    if (band < 0 || band >= 10) return;
    if (!this.eqFilters[band]) return;
    const ctx = this.ctx;
    if (!ctx) return;
    this.eqGains[band] = gainDb;
    this.eqFilters[band].gain.setTargetAtTime(gainDb, ctx.currentTime, 0.02);
  }

  /** Set all 10 EQ band gains at once. */
  setEqAll(gains: number[]) {
    for (let i = 0; i < 10 && i < gains.length; i++) {
      this.setEqBand(i, gains[i]);
    }
  }

  /** Get the current EQ gains (copy). */
  getEqGains(): number[] {
    return [...this.eqGains];
  }

  /** Toggle EQ bypass (true = flat passthrough, false = active EQ). */
  setEqBypass(bypass: boolean) {
    this.eqBypass = bypass;
    if (!this.ctx || !this.eqInput || !this.eqOutput || !this.realGain) return;
    // We can't easily rewire in Web Audio, so just zero all gains when bypassing
    for (let i = 0; i < 10; i++) {
      if (this.eqFilters[i]) {
        this.eqFilters[i].gain.setTargetAtTime(
          bypass ? 0 : this.eqGains[i],
          this.ctx.currentTime,
          0.02,
        );
      }
    }
  }

  getEqBypass(): boolean {
    return this.eqBypass;
  }

  /**
   * Cancel all pending audio frames. Called when the user tunes to a new
   * frequency — we want the old audio GONE immediately, so the new
   * frequency's audio plays without waiting for the queue to drain.
   *
   * Without this, you hear 100-200ms of the OLD station after clicking
   * the new one, which feels laggy compared to a real radio.
   */
  flushPendingAudio() {
    if (!this.ctx) return;
    for (const src of this.pendingSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    this.pendingSources.clear();
    // Reset the schedule so the next frame plays with a small look-ahead
    // (30ms — same as the buffer look-ahead, to absorb jitter).
    this.nextStartTime = this.ctx.currentTime + 0.03;
  }

  /** Push a real demodulated audio frame into the output queue.
   *  Supports both mono and stereo frames. */
  pushRealAudioFrame(samples: Float32Array, sampleRate: number, volume: number, samplesRight?: Float32Array) {
    if (!this.realMode || !this.ctx || !this.masterGain || !this.realGain) return;
    const ctx = this.ctx;
    // Update volume via the realGain (don't touch masterGain — that's our
    // global gate)
    this.realGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.03);

    // Create stereo or mono buffer depending on whether we have R channel
    const isStereo = samplesRight && samplesRight.length === samples.length;
    const numChannels = isStereo ? 2 : 1;
    const buf = ctx.createBuffer(numChannels, samples.length, sampleRate);
    buf.copyToChannel(samples, 0);
    if (isStereo) {
      buf.copyToChannel(samplesRight!, 1);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.realGain);
    // Schedule back-to-back with previously queued frames. 30ms look-ahead
    // absorbs network jitter. Was 20ms — too tight for desktop mode where
    // Electron + Next.js + bridge compete for CPU.
    const start = Math.max(this.nextStartTime, ctx.currentTime + 0.03);
    src.start(start);
    this.nextStartTime = start + samples.length / sampleRate;
    // Track for cancellation
    this.pendingSources.add(src);
    // Cleanup source after it finishes
    src.onended = () => {
      this.pendingSources.delete(src);
      try {
        src.disconnect();
      } catch {}
    };
  }

  getOutputLevels(): Uint8Array | null {
    if (!this.analyser || !this.outputFreqData) return null;
    this.analyser.getByteFrequencyData(this.outputFreqData);
    return this.outputFreqData;
  }

  /** Tear down all current voices. */
  private clearVoices() {
    for (const v of this.voices) {
      try {
        (v as any).stop?.();
      } catch {}
      try {
        v.disconnect();
      } catch {}
    }
    this.voices = [];
    if (this.noiseSource) {
      try {
        this.noiseSource.stop();
      } catch {}
      this.noiseSource.disconnect();
      this.noiseSource = null;
    }
    if (this.lfo) {
      try {
        this.lfo.stop();
      } catch {}
      this.lfo.disconnect();
      this.lfo = null;
    }
    this.noiseGain = null;
    this.lfoGain = null;
  }

  /** Build a noise buffer (1 s of white noise). */
  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  /**
   * Configure the audio engine for a given station & signal strength.
   * If the kind hasn't changed, we just adjust levels. Otherwise, we
   * rebuild the voice graph.
   */
  setStation(station: RadioStation | null, signal: number, volume: number) {
    const ctx = this.ensureCtx();
    if (!this.masterGain) return;

    // Update master gain
    const targetGain = Math.max(0, Math.min(1, signal)) * volume * 0.5;
    this.masterGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.08);

    if (!station) {
      this.clearVoices();
      this.currentStation = null;
      this.currentKind = null;
      return;
    }

    // If switching kind, rebuild
    if (this.currentKind !== station.audioKind || this.voices.length === 0) {
      this.clearVoices();
      this.buildVoiceGraph(ctx, station.audioKind);
      this.currentKind = station.audioKind;
    }
    this.currentStation = station;
  }

  private buildVoiceGraph(ctx: AudioContext, kind: RadioStation["audioKind"]) {
    const master = this.masterGain!;

    // Always create a noise source — used in most kinds.
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx);
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.0;
    noise.connect(noiseGain).connect(master);
    noise.start(0);
    this.noiseSource = noise;
    this.noiseGain = noiseGain;

    switch (kind) {
      case "music": {
        // Layered synth — major chord with slow vibrato
        const base = 196; // G3
        const freqs = [base, base * 1.26, base * 1.5, base * 2]; // G, B, D, G
        const vibrato = ctx.createOscillator();
        vibrato.frequency.value = 5;
        const vibratoGain = ctx.createGain();
        vibratoGain.gain.value = 4;
        vibrato.connect(vibratoGain);
        vibrato.start(0);
        this.lfo = vibrato;
        this.lfoGain = vibratoGain;
        for (const f of freqs) {
          const osc = ctx.createOscillator();
          osc.type = "triangle";
          osc.frequency.value = f;
          vibratoGain.connect(osc.frequency);
          const g = ctx.createGain();
          g.gain.value = 0.13;
          osc.connect(g).connect(master);
          osc.start(0);
          this.voices.push(osc, g);
        }
        // Slow melodic LFO on noise gain to simulate drums
        const drumLfo = ctx.createOscillator();
        drumLfo.frequency.value = 2.4;
        const drumLfoGain = ctx.createGain();
        drumLfoGain.gain.value = 0.04;
        drumLfo.connect(drumLfoGain).connect(noiseGain.gain);
        drumLfo.start(0);
        this.voices.push(drumLfo, drumLfoGain);
        break;
      }
      case "voice":
      case "weather": {
        // Filtered noise modulated at speech cadence (~4 Hz)
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1200;
        bp.Q.value = 1.2;
        const speechLfo = ctx.createOscillator();
        speechLfo.frequency.value = 4.2;
        const speechGain = ctx.createGain();
        speechGain.gain.value = 0.18;
        speechLfo.connect(speechGain).connect(noiseGain.gain);
        speechLfo.start(0);
        noiseGain.gain.value = 0.06;
        noise.disconnect();
        noise.connect(bp).connect(noiseGain).connect(master);
        this.voices.push(bp, speechLfo, speechGain);
        if (kind === "weather") {
          // Add a soft alert tone every ~3 s
          const alert = ctx.createOscillator();
          alert.type = "sine";
          alert.frequency.value = 880;
          const alertGain = ctx.createGain();
          alertGain.gain.value = 0;
          alert.connect(alertGain).connect(master);
          alert.start(0);
          const alertLfo = ctx.createOscillator();
          alertLfo.frequency.value = 0.33;
          const alertLfoGain = ctx.createGain();
          alertLfoGain.gain.value = 0.08;
          alertLfo.connect(alertLfoGain).connect(alertGain.gain);
          alertLfo.start(0);
          this.voices.push(alert, alertGain, alertLfo, alertLfoGain);
        }
        break;
      }
      case "aviation": {
        // Clipped, slightly distorted voice — narrow bandpass
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1600;
        bp.Q.value = 2.5;
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(257);
        for (let i = 0; i < 257; i++) {
          const x = (i - 128) / 128;
          curve[i] = Math.tanh(x * 3);
        }
        shaper.curve = curve;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 3.6;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.18;
        lfo.connect(lfoGain).connect(noiseGain.gain);
        lfo.start(0);
        noiseGain.gain.value = 0.04;
        noise.disconnect();
        noise.connect(bp).connect(shaper).connect(noiseGain).connect(master);
        this.voices.push(bp, shaper, lfo, lfoGain);
        break;
      }
      case "morse": {
        // Keyed 700 Hz tone at varying morse rhythm
        const tone = ctx.createOscillator();
        tone.type = "sine";
        tone.frequency.value = 700;
        const toneGain = ctx.createGain();
        toneGain.gain.value = 0;
        tone.connect(toneGain).connect(master);
        tone.start(0);
        // Morse keyer LFO — non-square shape so it has attack/decay
        const keyer = ctx.createOscillator();
        keyer.type = "square";
        keyer.frequency.value = 4; // ~24 wpm-ish
        const keyerGain = ctx.createGain();
        keyerGain.gain.value = 0.22;
        keyer.connect(keyerGain).connect(toneGain.gain);
        keyer.start(0);
        this.voices.push(tone, toneGain, keyer, keyerGain);
        break;
      }
      case "data": {
        // Two alternating FSK tones (e.g., 9600/1200 baud simulation)
        const mark = ctx.createOscillator();
        mark.type = "sine";
        mark.frequency.value = 1200;
        const markGain = ctx.createGain();
        markGain.gain.value = 0.18;
        mark.connect(markGain).connect(master);
        mark.start(0);
        const space = ctx.createOscillator();
        space.type = "sine";
        space.frequency.value = 2200;
        const spaceGain = ctx.createGain();
        spaceGain.gain.value = 0;
        space.connect(spaceGain).connect(master);
        space.start(0);
        // FSK keyer
        const keyer = ctx.createOscillator();
        keyer.type = "square";
        keyer.frequency.value = 12;
        const keyerGain = ctx.createGain();
        keyerGain.gain.value = 0.18;
        keyer.connect(keyerGain);
        keyer.start(0);
        // Invert to alternate mark/space
        const inverter = ctx.createGain();
        inverter.gain.value = -1;
        keyerGain.connect(markGain.gain);
        keyerGain.connect(inverter).connect(spaceGain.gain);
        // Bias
        const bias = ctx.createConstantSource();
        bias.offset.value = 0.18;
        bias.connect(markGain.gain);
        bias.start(0);
        // Background hiss
        noiseGain.gain.value = 0.02;
        this.voices.push(
          mark, markGain, space, spaceGain, keyer, keyerGain, inverter, bias,
        );
        break;
      }
      case "noise": {
        noiseGain.gain.value = 0.2;
        break;
      }
      case "silent":
      default: {
        noiseGain.gain.value = 0;
        break;
      }
    }
  }
}

let singleton: SdrAudioEngine | null = null;
export function getAudioEngine(): SdrAudioEngine {
  if (!singleton) singleton = new SdrAudioEngine();
  return singleton;
}
