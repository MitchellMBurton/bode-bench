// ============================================================
// Audio Engine — Web Audio graph, transport, and frame extraction.
// Owns all AudioContext and AnalyserNode logic.
// Publishes typed AudioFrame objects to the frame bus each RAF.
//
// Graph topology (per play session):
//
//   source ──→ playGain ──→ masterGain ──→ destination
//          └──→ splitter ──→ analyserL  (dead-end tap, not in audio path)
//                       └──→ analyserR  (dead-end tap, not in audio path)
//
// Analysers are monitoring taps ONLY. They never sit inline in the
// signal path, which eliminates the ChannelMerger timing artifacts
// that cause crackling. Per-play gain nodes allow old and new sources
// to fade independently during seek without touching masterGain.
// ============================================================

import { frameBus } from './frameBus';
import { CANVAS } from '../theme';
import type { AudioFrame, FileAnalysis, TransportState } from '../types';

type TransportListener = (state: TransportState) => void;
const ANALYSIS_FPS = 20;
const ANALYSIS_FRAME_MS = 1000 / ANALYSIS_FPS;
const DECLICK_FADE_S = 0.006;  // 6 ms fade-out on stop/pause
const DECLICK_IN_S   = 0.008;  // 8 ms fade-in on play

class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;

  // Per-play nodes — recreated each play(), discarded after stop
  private sourceNode: AudioBufferSourceNode | null = null;
  private playGainNode: GainNode | null = null;       // de-click gain, isolated per play
  private splitterNode: ChannelSplitterNode | null = null;

  private buffer: AudioBuffer | null = null;
  private startedAt = 0;   // AudioContext.currentTime when play started
  private offsetAt = 0;    // buffer offset when play started (seconds)
  private _isPlaying = false;
  private rafId: number | null = null;
  private _volume = 1;
  private _playbackRate = 1;
  private playId = 0;
  private fileId = 0;
  private displayGain = 1;

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
  private lastAnalysisAt = 0;

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
    this.analyserL.minDecibels = CANVAS.dbMin;
    this.analyserL.maxDecibels = CANVAS.dbMax;

    this.analyserR = ctx.createAnalyser();
    this.analyserR.fftSize = fftSize;
    this.analyserR.smoothingTimeConstant = CANVAS.smoothingTimeConstant;
    this.analyserR.minDecibels = CANVAS.dbMin;
    this.analyserR.maxDecibels = CANVAS.dbMax;

    this.timeDomainData = new Float32Array(new ArrayBuffer(fftSize * 4));
    this.timeDomainDataR = new Float32Array(new ArrayBuffer(fftSize * 4));
    this.frequencyData = new Float32Array(new ArrayBuffer((fftSize / 2) * 4));
    this.frequencyDataR = new Float32Array(new ArrayBuffer((fftSize / 2) * 4));

    // masterGain is the only persistent node in the signal path
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this._volume;
    this.masterGain.connect(ctx.destination);

    // Analysers are dead-ends — no output connection needed.
    // They receive signal via per-play splitter tap.
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

    // Emit transport immediately so the file is available for playback.
    // Heavy buffer scans (displayGain, fileAnalysis) are deferred to the next
    // task to avoid blocking the main thread for ~900 ms on long files.
    this.emitTransport();

    const capturedBuffer = this.buffer;
    const capturedFileId = this.fileId;
    setTimeout(() => {
      if (this.fileId !== capturedFileId) return;
      this.displayGain = this.computeDisplayGain(capturedBuffer);
      this._fileAnalysis = this.computeFileAnalysis(capturedBuffer);
      for (const fn of this.fileReadyListeners) fn(this._fileAnalysis!);
    }, 0);
  }

  // ----------------------------------------------------------
  // Transport
  // ----------------------------------------------------------
  play(): void {
    if (!this.ctx) return;
    if (this._isPlaying) return;

    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    if (!this.buffer || !this.masterGain || !this.analyserL || !this.analyserR) return;

    this.sourceNode = ctx.createBufferSource();
    this.sourceNode.buffer = this.buffer;
    this.sourceNode.playbackRate.value = this._playbackRate;

    // Per-play gain for de-click fade-in (isolated from masterGain).
    // Force explicit stereo so the analysis tap always sees a stable 2-ch signal
    // regardless of source channel count — eliminates double fan-out from the source buffer.
    this.playGainNode = ctx.createGain();
    this.playGainNode.channelCount = 2;
    this.playGainNode.channelCountMode = 'explicit';
    const now = ctx.currentTime;
    this.playGainNode.gain.setValueAtTime(0, now);
    this.playGainNode.gain.linearRampToValueAtTime(1, now + DECLICK_IN_S);

    // Main audio path: source → playGain → masterGain → destination
    this.sourceNode.connect(this.playGainNode);
    this.playGainNode.connect(this.masterGain);

    // Analysis taps — tap from playGain (not source) to avoid a second render-quantum
    // pull on the large source buffer. Dead-end: never connected to destination.
    this.splitterNode = ctx.createChannelSplitter(2);
    this.playGainNode.connect(this.splitterNode);
    this.splitterNode.connect(this.analyserL, 0);
    this.splitterNode.connect(this.analyserR, 1);

    this.sourceNode.start(0, this.offsetAt);
    this.startedAt = ctx.currentTime;
    this._isPlaying = true;
    this.playId++;

    const ownSource = this.sourceNode;
    ownSource.onended = () => {
      if (this._isPlaying && this.sourceNode === ownSource) {
        this._isPlaying = false;
        this.offsetAt = 0;
        this.sourceNode = null;
        this.playGainNode = null;
        this.clearSplitter();
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
    for (const fn of this.resetListeners) fn();
  }

  private _stopSource(): void {
    if (this.sourceNode && this.playGainNode && this.ctx) {
      // De-click: fade the per-play gain to 0, then let the source stop naturally
      const now = this.ctx.currentTime;
      this.playGainNode.gain.cancelScheduledValues(now);
      this.playGainNode.gain.setValueAtTime(this.playGainNode.gain.value, now);
      this.playGainNode.gain.linearRampToValueAtTime(0, now + DECLICK_FADE_S);
      try { this.sourceNode.stop(now + DECLICK_FADE_S + 0.001); } catch { /* already ended */ }
      // Source and playGain will be GC'd after they stop; nulling refs is enough
    } else if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch { /* already ended */ }
      this.sourceNode.disconnect();
    }
    this.sourceNode = null;
    this.playGainNode = null;
    this.clearSplitter();
  }

  private clearSplitter(): void {
    if (this.splitterNode) {
      this.splitterNode.disconnect();
      this.splitterNode = null;
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
    this.lastAnalysisAt = 0;
    const loop = () => {
      const now = performance.now();
      if (this.lastAnalysisAt === 0 || now - this.lastAnalysisAt >= ANALYSIS_FRAME_MS) {
        this.lastAnalysisAt = now;
        this.extractFrame();
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastAnalysisAt = 0;
  }

  private extractFrame(): void {
    const analyserL = this.analyserL;
    const analyserR = this.analyserR;
    if (!analyserL || !analyserR || !this.ctx) return;

    analyserL.getFloatTimeDomainData(this.timeDomainData);
    analyserL.getFloatFrequencyData(this.frequencyData);
    analyserR.getFloatTimeDomainData(this.timeDomainDataR);
    analyserR.getFloatFrequencyData(this.frequencyDataR);

    const tdL = this.timeDomainData;
    const tdR = this.timeDomainDataR;
    const fftBinCount = this.frequencyData.length;

    let peakL = 0, rmsL = 0;
    for (let i = 0; i < tdL.length; i++) {
      const v = Math.abs(tdL[i]);
      if (v > peakL) peakL = v;
      rmsL += tdL[i] * tdL[i];
    }
    rmsL = Math.sqrt(rmsL / tdL.length);

    let peakR = 0, rmsR = 0;
    for (let i = 0; i < tdR.length; i++) {
      const v = Math.abs(tdR[i]);
      if (v > peakR) peakR = v;
      rmsR += tdR[i] * tdR[i];
    }
    rmsR = Math.sqrt(rmsR / tdR.length);

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
      timeDomain: new Float32Array(tdL),
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
  // Public controls
  // ----------------------------------------------------------
  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this._volume;
  }

  setPlaybackRate(r: number): void {
    this._playbackRate = Math.max(0.25, Math.min(2, r));
    if (this.sourceNode) this.sourceNode.playbackRate.value = this._playbackRate;
    this.emitTransport();
  }

  get playbackRate(): number { return this._playbackRate; }
  get analysisFps(): number  { return ANALYSIS_FPS; }
  get audioBuffer(): AudioBuffer | null { return this.buffer; }

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
      decodedSampleRate: buffer.sampleRate,
      contextSampleRate: this.ctx?.sampleRate ?? buffer.sampleRate,
      fileId: this.fileId,
    };
  }

  private emitTransport(): void {
    const state: TransportState = {
      isPlaying: this._isPlaying,
      currentTime: this.currentTime,
      duration: this.duration,
      filename: this._filename,
      playbackRate: this._playbackRate,
    };
    for (const fn of this.transportListeners) fn(state);
  }
}

// Singleton
export const audioEngine = new AudioEngine();
