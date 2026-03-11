// ============================================================
// Audio Engine — Web Audio graph, transport, and frame extraction.
// Owns all AudioContext and AnalyserNode logic.
// Publishes typed AudioFrame objects to the frame bus each RAF.
// ============================================================

import { frameBus } from './frameBus';
import { CANVAS } from '../theme';
import type { AudioFrame, FileAnalysis, TransportState } from '../types';

type TransportListener = (state: TransportState) => void;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private startedAt = 0;   // AudioContext.currentTime when play started
  private offsetAt = 0;    // buffer offset when play started (seconds)
  private _isPlaying = false;
  private rafId: number | null = null;
  private masterGain: GainNode | null = null;
  private _volume = 1;
  private _playbackRate = 1;
  private playId = 0;  // increments on every play()
  private fileId = 0;  // increments on every load() — panels clear history on new file only
  private displayGain = 1; // 0.95 / filePeak — visual scale only, audio unaffected

  // Frame data arrays (reused each frame to avoid allocation)
  private timeDomainData!: Float32Array<ArrayBuffer>;
  private timeDomainDataR!: Float32Array<ArrayBuffer>;
  private frequencyData!: Float32Array<ArrayBuffer>;
  private frequencyDataR!: Float32Array<ArrayBuffer>;

  private transportListeners = new Set<TransportListener>();
  private resetListeners = new Set<() => void>();
  private fileReadyListeners = new Set<(a: FileAnalysis) => void>();
  private _fileAnalysis: FileAnalysis | null = null;
  private _filename: string | null = null;

  // ----------------------------------------------------------
  // Context initialisation
  // ----------------------------------------------------------
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.buildGraph();
    }
    return this.ctx;
  }

  private buildGraph(): void {
    const ctx = this.ctx!;
    const fftSize = CANVAS.fftSize;

    this.analyserL = ctx.createAnalyser();
    this.analyserL.fftSize = fftSize;
    this.analyserL.smoothingTimeConstant = CANVAS.smoothingTimeConstant;

    this.analyserR = ctx.createAnalyser();
    this.analyserR.fftSize = fftSize;
    this.analyserR.smoothingTimeConstant = CANVAS.smoothingTimeConstant;

    this.timeDomainData = new Float32Array(new ArrayBuffer(fftSize * Float32Array.BYTES_PER_ELEMENT));
    this.timeDomainDataR = new Float32Array(new ArrayBuffer(fftSize * Float32Array.BYTES_PER_ELEMENT));
    this.frequencyData = new Float32Array(new ArrayBuffer((fftSize / 2) * Float32Array.BYTES_PER_ELEMENT));
    this.frequencyDataR = new Float32Array(new ArrayBuffer((fftSize / 2) * Float32Array.BYTES_PER_ELEMENT));

    // Route both analysers through a master gain node to destination
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this._volume;
    this.analyserL.connect(this.masterGain);
    this.analyserR.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
  }

  // ----------------------------------------------------------
  // Ingest
  // ----------------------------------------------------------
  async load(file: File): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    this.stop();

    const arrayBuffer = await file.arrayBuffer();
    this.buffer = await ctx.decodeAudioData(arrayBuffer);
    this._filename = file.name;
    this.offsetAt = 0;
    this.fileId++;
    this.displayGain = this.computeDisplayGain(this.buffer);
    this._fileAnalysis = this.computeFileAnalysis(this.buffer);
    for (const fn of this.fileReadyListeners) fn(this._fileAnalysis);
    this.emitTransport();
  }

  // ----------------------------------------------------------
  // Transport
  // ----------------------------------------------------------
  play(): void {
    if (!this.buffer || !this.ctx) return;
    if (this._isPlaying) return;

    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    this.sourceNode = ctx.createBufferSource();
    this.sourceNode.buffer = this.buffer;

    // Wire: source → splitter → L/R analysers
    const splitter = ctx.createChannelSplitter(2);
    this.sourceNode.connect(splitter);

    // Channel 0 = left, channel 1 = right
    splitter.connect(this.analyserL!, 0);
    splitter.connect(this.analyserR!, 1);

    this.sourceNode.playbackRate.value = this._playbackRate;
    this.sourceNode.start(0, this.offsetAt);
    this.startedAt = ctx.currentTime;
    this._isPlaying = true;
    this.playId++;

    // Capture the node reference so the handler only fires for THIS play session.
    // Without this, a seek causes: pause() → stop old node (fires onended async) →
    // play() sets _isPlaying=true → old onended fires → sees _isPlaying=true → kills RAF.
    const ownSource = this.sourceNode;
    ownSource.onended = () => {
      if (this._isPlaying && this.sourceNode === ownSource) {
        // Natural playback end — not a seek or stop
        this._isPlaying = false;
        this.offsetAt = 0;
        this.sourceNode = null;
        this.stopRaf();
        this.emitTransport();
      }
    };

    this.startRaf();
    this.emitTransport();
  }

  pause(): void {
    if (!this._isPlaying || !this.ctx) return;
    this.offsetAt = this.offsetAt + (this.ctx.currentTime - this.startedAt) * this._playbackRate;
    this._stopSource();
    this._isPlaying = false;
    this.stopRaf();
    this.emitTransport();
  }

  stop(): void {
    this.offsetAt = 0;
    this._stopSource();
    this._isPlaying = false;
    this.stopRaf();
    this.emitTransport();
  }

  /** Full reset — stops playback, clears the loaded file, increments fileId so panels wipe history. */
  reset(): void {
    this._stopSource();
    this._isPlaying = false;
    this.stopRaf();
    this.buffer = null;
    this._filename = null;
    this.offsetAt = 0;
    this.fileId++;
    this.displayGain = 1;
    this._fileAnalysis = null;
    this.emitTransport();
    for (const fn of this.resetListeners) fn();  // tell panels to wipe visuals immediately
  }

  private _stopSource(): void {
    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch { /* already ended */ }
      this.sourceNode = null;
    }
  }

  seek(seconds: number): void {
    const wasPlaying = this._isPlaying;
    if (wasPlaying) this.pause();
    this.offsetAt = Math.max(0, Math.min(seconds, this.buffer?.duration ?? 0));
    if (wasPlaying) this.play();
    else this.emitTransport();
  }

  get currentTime(): number {
    if (!this.ctx) return 0;
    if (this._isPlaying) return this.offsetAt + (this.ctx.currentTime - this.startedAt) * this._playbackRate;
    return this.offsetAt;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  /** Scan all channels for peak amplitude and return a display gain that brings it to 0.95. */
  private computeDisplayGain(buffer: AudioBuffer): number {
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    return peak > 0.001 ? 0.95 / peak : 1;
  }

  // ----------------------------------------------------------
  // Frame extraction (RAF loop)
  // ----------------------------------------------------------
  private startRaf(): void {
    if (this.rafId !== null) return;
    const loop = () => {
      this.extractFrame();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private extractFrame(): void {
    const analyserL = this.analyserL;
    const analyserR = this.analyserR;
    if (!analyserL || !analyserR || !this.ctx) return;

    // Time domain (mono average for oscilloscope display)
    analyserL.getFloatTimeDomainData(this.timeDomainData);

    // Frequency domain: left and right channels
    analyserL.getFloatFrequencyData(this.frequencyData);
    analyserR.getFloatFrequencyData(this.frequencyDataR);

    // Peak and RMS: use timeDomainData for L, cached buffer for R
    const tdL = this.timeDomainData;
    const fftBinCount = this.frequencyData.length;

    let peakL = 0, rmsL = 0;
    for (let i = 0; i < tdL.length; i++) {
      const v = Math.abs(tdL[i]);
      if (v > peakL) peakL = v;
      rmsL += tdL[i] * tdL[i];
    }
    rmsL = Math.sqrt(rmsL / tdL.length);

    // R channel time domain for separate peak/rms
    const tdR = this.timeDomainDataR;
    analyserR.getFloatTimeDomainData(tdR);
    let peakR = 0, rmsR = 0;
    for (let i = 0; i < tdR.length; i++) {
      const v = Math.abs(tdR[i]);
      if (v > peakR) peakR = v;
      rmsR += tdR[i] * tdR[i];
    }
    rmsR = Math.sqrt(rmsR / tdR.length);

    // Spectral centroid: weighted mean frequency of left channel power spectrum (Hz)
    const binHz = this.ctx.sampleRate / (fftBinCount * 2);
    let centNum = 0, centDen = 0;
    for (let i = 1; i < fftBinCount; i++) {
      const power = Math.pow(10, this.frequencyData[i] / 10);
      centNum += i * binHz * power;
      centDen += power;
    }
    const spectralCentroid = centDen > 0 ? centNum / centDen : 0;

    const frame: AudioFrame = {
      currentTime: this.currentTime,
      timeDomain: new Float32Array(tdL),      // copy so panels can hold refs
      frequencyDb: new Float32Array(this.frequencyData),
      frequencyDbRight: new Float32Array(this.frequencyDataR),
      peakLeft: Math.min(peakL, 1),
      peakRight: Math.min(peakR, 1),
      rmsLeft: Math.min(rmsL, 1),
      rmsRight: Math.min(rmsR, 1),
      sampleRate: this.ctx.sampleRate,
      fftBinCount,
      playId: this.playId,
      fileId: this.fileId,
      displayGain: this.displayGain,
      spectralCentroid,
    };

    frameBus.publish(frame);
  }

  // ----------------------------------------------------------
  // Transport listeners
  // ----------------------------------------------------------
  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this._volume;
  }

  setPlaybackRate(r: number): void {
    this._playbackRate = Math.max(0.25, Math.min(2, r));
    if (this.sourceNode) this.sourceNode.playbackRate.value = this._playbackRate;
  }

  /** Decoded AudioBuffer for the currently loaded file, or null. Read-only — do not mutate. */
  get audioBuffer(): AudioBuffer | null { return this.buffer; }

  /** Subscribe to file-ready events fired after each successful load().
   *  Receives a FileAnalysis with quality metrics computed from the full buffer. */
  onFileReady(fn: (analysis: FileAnalysis) => void): () => void {
    this.fileReadyListeners.add(fn);
    return () => { this.fileReadyListeners.delete(fn); };
  }

  onTransport(fn: TransportListener): () => void {
    this.transportListeners.add(fn);
    return () => { this.transportListeners.delete(fn); };
  }

  onReset(fn: () => void): () => void {
    this.resetListeners.add(fn);
    return () => { this.resetListeners.delete(fn); };
  }

  private computeFileAnalysis(buffer: AudioBuffer): FileAnalysis {
    let peak = 0;
    let rmsSum = 0;
    let totalSamples = 0;
    let clipCount = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
        rmsSum += data[i] * data[i];
        totalSamples++;
        if (v >= 0.9999) clipCount++;
      }
    }
    const rms = Math.sqrt(rmsSum / totalSamples);
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -100;
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
    return {
      crestFactorDb: peakDb - rmsDb,
      peakDb,
      rmsDb,
      clipCount,
      duration: buffer.duration,
      channels: buffer.numberOfChannels,
      fileId: this.fileId,
    };
  }

  private emitTransport(): void {
    const state: TransportState = {
      isPlaying: this._isPlaying,
      currentTime: this.currentTime,
      duration: this.duration,
      filename: this._filename,
    };
    for (const fn of this.transportListeners) fn(state);
  }
}

// Singleton
export const audioEngine = new AudioEngine();
