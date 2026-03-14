// ============================================================
// Audio Engine - Web Audio graph, transport, and frame extraction.
// Owns all AudioContext, analyser, and stretch-node logic.
// Publishes typed AudioFrame objects to the frame bus each RAF.
//
// Graph topology:
//
//   stretchNode -> playGain -> masterGain -> destination
//                         \-> splitter -> analyserL
//                                      -> analyserR
//
// The stretch node handles tempo and pitch independently. The
// playGain stage only exists for de-click fades during transport.
// ============================================================

import type { FrameBus } from './frameBus';
import { createStretchNode, type StretchNode, type StretchSchedule } from './stretchNode';
import { CANVAS } from '../theme';
import type { AudioFrame, FileAnalysis, ScrubStyle, TransportState } from '../types';
import { RATE_MIN, RATE_MAX, PITCH_MIN, PITCH_MAX } from '../constants';

type TransportListener = (state: TransportState) => void;

interface ScrubStyleConfig {
  readonly delayMs: number;
  readonly windowMs: number;
  readonly continuityThresholdS: number;
  readonly baseRate: number;
  readonly velocityRateGain: number;
  readonly maxPreviewRate: number;
  readonly preferNative: boolean;
}

const ANALYSIS_FPS = 20;
const ANALYSIS_FRAME_MS = 1000 / ANALYSIS_FPS;
const DECLICK_FADE_S = 0.006;
const DECLICK_IN_S = 0.008;
const SEEK_RESUME_DELAY_MS = 140;
const STRETCH_WATCHDOG_GRACE_S = 0.75;
const STRETCH_WATCHDOG_TIMEOUT_S = 0.6;
const SCRUB_STYLE_CONFIG: Record<ScrubStyle, ScrubStyleConfig> = {
  step: {
    delayMs: 28,
    windowMs: 72,
    continuityThresholdS: 0.02,
    baseRate: 1,
    velocityRateGain: 0,
    maxPreviewRate: 1,
    preferNative: false,
  },
  tape: {
    delayMs: 0,
    windowMs: 240,
    continuityThresholdS: 0.28,
    baseRate: 0.98,
    velocityRateGain: 0.1,
    maxPreviewRate: 1.6,
    preferNative: true,
  },
  wheel: {
    delayMs: 0,
    windowMs: 320,
    continuityThresholdS: 0.42,
    baseRate: 1.06,
    velocityRateGain: 0.26,
    maxPreviewRate: 2.8,
    preferNative: true,
  },
};

export class AudioEngine {
  private readonly frameBus: FrameBus;

  constructor(frameBus: FrameBus) {
    this.frameBus = frameBus;
  }

  private ctx: AudioContext | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private playGainNode: GainNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private stretchNode: StretchNode | null = null;
  private stretchNodeReady: Promise<StretchNode> | null = null;
  private stretchChannelCount = 0;
  private stretchLatency = 0;
  private stretchEnabledForBuffer = false;
  private stretchLastProgressAt = 0;
  private pitchShiftAvailable = true;

  private buffer: AudioBuffer | null = null;
  private startedAt = 0;
  private offsetAt = 0;
  private _isPlaying = false;
  private rafId: number | null = null;
  private _volume = 1;
  private _playbackRate = 1;
  private _pitchSemitones = 0;
  private playId = 0;
  private fileId = 0;
  private _displayGain = 1;
  private _loopStart: number | null = null;
  private _loopEnd: number | null = null;
  // True only when the current playback was actually started through the stretch
  // worklet. Used to gate the stretch watchdog so it does not fire when we are
  // running the native path with stretch buffers loaded but idle.
  private _usingStretchForPlayback = false;

  // Media-element path — used for video files to avoid decoding the entire
  // audio track into a large PCM AudioBuffer, which causes memory pressure and
  // audio thread starvation (crackling) on long content.
  private mediaElement: HTMLAudioElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private mediaElementUrl: string | null = null;
  private mediaElementMode = false;

  private seekResumeTimer: number | null = null;
  private seekResumePending = false;
  private scrubActive = false;
  private scrubResumeAfter = false;
  private scrubPreviewTimer: number | null = null;
  private scrubStopTimer: number | null = null;
  private _scrubStyle: ScrubStyle = 'tape';
  private scrubPreviewRate = 1;
  private scrubLastTarget = 0;
  private scrubLastMoveAt = 0;

  private static readonly WAVEFORM_BIN_SAMPLES = 800;
  private _waveformPeaks: Float32Array | null = null;

  private timeDomainData!: Float32Array;
  private timeDomainDataR!: Float32Array;
  private frequencyData!: Float32Array;
  private frequencyDataR!: Float32Array;

  // Ping-pong output buffers — pre-allocated to avoid per-frame GC pressure.
  // We alternate between slot 0 and 1 so panels can hold a stable reference
  // to the previous frame while the engine writes the next one.
  private frameSlot = 0;
  private frameTD: [Float32Array, Float32Array] = [new Float32Array(0), new Float32Array(0)];
  private frameFD: [Float32Array, Float32Array] = [new Float32Array(0), new Float32Array(0)];
  private frameFDR: [Float32Array, Float32Array] = [new Float32Array(0), new Float32Array(0)];

  private transportListeners = new Set<TransportListener>();
  private resetListeners = new Set<() => void>();
  private fileReadyListeners = new Set<(analysis: FileAnalysis) => void>();
  private _fileAnalysis: FileAnalysis | null = null;
  private _filename: string | null = null;
  private lastAnalysisAt = 0;

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

    this.frameSlot = 0;
    this.frameTD = [new Float32Array(fftSize), new Float32Array(fftSize)];
    this.frameFD = [new Float32Array(fftSize / 2), new Float32Array(fftSize / 2)];
    this.frameFDR = [new Float32Array(fftSize / 2), new Float32Array(fftSize / 2)];

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this._volume;
    this.masterGain.connect(ctx.destination);

    this.playGainNode = ctx.createGain();
    this.playGainNode.gain.value = 0;
    this.playGainNode.channelCount = 2;
    this.playGainNode.channelCountMode = 'explicit';
    this.playGainNode.connect(this.masterGain);

    this.splitterNode = ctx.createChannelSplitter(2);
    this.playGainNode.connect(this.splitterNode);
    this.splitterNode.connect(this.analyserL, 0);
    this.splitterNode.connect(this.analyserR, 1);
  }

  private queueStretchCommand(command: Promise<unknown>, label: string): void {
    void command.catch((error) => {
      console.error(`stretch ${label} failed`, error);
    });
  }

  private get transportRate(): number {
    return this._playbackRate;
  }

  private get nativeFallbackRate(): number {
    return this._playbackRate;
  }

  private get traversalRate(): number {
    return this.stretchEnabledForBuffer ? this.transportRate : this.nativeFallbackRate;
  }

  // Returns true only when the stretch worklet should actually drive playback.
  // At identity parameters (rate=1.0, pitch=0) the worklet adds overhead with no
  // benefit, so we bypass it and use AudioBufferSourceNode directly. This is the
  // primary fix for crackling on long video files.
  private get useStretchPath(): boolean {
    if (!this.stretchEnabledForBuffer || !this.stretchNode) return false;
    return Math.abs(this._playbackRate - 1.0) > 0.001 || Math.abs(this._pitchSemitones) > 0.001;
  }

  private get scrubConfig(): ScrubStyleConfig {
    return SCRUB_STYLE_CONFIG[this._scrubStyle];
  }

  private async disposeStretchNode(): Promise<void> {
    const readyNode = this.stretchNode ?? await this.stretchNodeReady?.catch(() => null) ?? null;
    if (readyNode) {
      try {
        await readyNode.dropBuffers();
      } catch {
        // Ignore cleanup failures during reconfiguration.
      }
      try {
        readyNode.disconnect();
      } catch {
        // Already disconnected.
      }
    }

    this.stretchNode = null;
    this.stretchNodeReady = null;
    this.stretchChannelCount = 0;
    this.stretchLatency = 0;
    this.stretchLastProgressAt = 0;
  }

  private async ensureStretchNode(channelCount: number): Promise<StretchNode> {
    if (this.stretchNode && this.stretchChannelCount === channelCount) {
      return this.stretchNode;
    }

    if (this.stretchNode || this.stretchNodeReady) {
      await this.disposeStretchNode();
    }

    const ctx = this.ensureContext();
    if (!this.playGainNode) {
      throw new Error('playGainNode is not initialized');
    }

    const pending = createStretchNode(ctx, channelCount)
      .then(async (stretchNode) => {
        stretchNode.connect(this.playGainNode!);
        await stretchNode.configure({ preset: 'default' });
        await stretchNode.setUpdateInterval(0.1, () => {
          this.stretchLastProgressAt = this.ctx?.currentTime ?? 0;
        });
        this.stretchLatency = Math.max(0, Number(await stretchNode.latency()) || 0);
        this.stretchChannelCount = channelCount;
        this.stretchNode = stretchNode;
        return stretchNode;
      })
      .catch((error) => {
        this.stretchNode = null;
        this.stretchNodeReady = null;
        this.stretchChannelCount = 0;
        this.stretchLatency = 0;
        throw error;
      });

    this.stretchNodeReady = pending;
    return pending;
  }

  private clearMediaElement(): void {
    if (this.mediaSource) {
      try { this.mediaSource.disconnect(); } catch { /* already disconnected */ }
      this.mediaSource = null;
    }
    if (this.mediaElement) {
      this.mediaElement.pause();
      this.mediaElement.src = '';
      this.mediaElement = null;
    }
    if (this.mediaElementUrl) {
      URL.revokeObjectURL(this.mediaElementUrl);
      this.mediaElementUrl = null;
    }
    this.mediaElementMode = false;
  }

  private prepareStretchBuffers(buffer: AudioBuffer): Float32Array[] {
    return Array.from({ length: buffer.numberOfChannels }, (_, channel) => {
      return new Float32Array(buffer.getChannelData(channel));
    });
  }

  async load(file: File): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    this.stop();
    this.clearSeekResume();
    this.clearScrubTimers();
    this.clearMediaElement();
    this.scrubActive = false;
    this.scrubResumeAfter = false;
    this.scrubPreviewRate = 1;
    this.scrubLastTarget = 0;
    this.scrubLastMoveAt = 0;
    this._loopStart = null;
    this._loopEnd = null;
    this._playbackRate = 1;
    this._pitchSemitones = 0;

    const isVideo = file.type.startsWith('video/') ||
      /\.(mkv|mp4|m4v|mov|avi|webm|ts|flv|wmv)$/i.test(file.name);

    if (isVideo) {
      await this.loadViaMediaElement(file, ctx);
    } else {
      await this.loadViaBuffer(file, ctx);
    }
  }

  private async loadViaMediaElement(file: File, ctx: AudioContext): Promise<void> {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    el.src = url;
    el.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      const onMeta = () => { el.removeEventListener('loadedmetadata', onMeta); el.removeEventListener('error', onErr); resolve(); };
      const onErr = () => { el.removeEventListener('loadedmetadata', onMeta); el.removeEventListener('error', onErr); reject(new Error('media element failed to load')); };
      el.addEventListener('loadedmetadata', onMeta, { once: true });
      el.addEventListener('error', onErr, { once: true });
    });

    const source = ctx.createMediaElementSource(el);
    source.connect(this.playGainNode!);

    this.mediaElement = el;
    this.mediaElementUrl = url;
    this.mediaSource = source;
    this.mediaElementMode = true;
    this.pitchShiftAvailable = false;
    this.stretchEnabledForBuffer = false;
    this._filename = file.name;
    this.offsetAt = 0;
    this.fileId++;
    this._displayGain = 1;

    this.emitTransport();

    // Fire a minimal FileAnalysis so the diagnostics log has duration/channel info.
    const capturedFileId = this.fileId;
    setTimeout(() => {
      if (this.fileId !== capturedFileId || !this.mediaElement) return;
      const analysis: FileAnalysis = {
        crestFactorDb: 0,
        peakDb: 0,
        rmsDb: 0,
        clipCount: 0,
        duration: this.mediaElement.duration,
        channels: this.mediaSource?.channelCount ?? 2,
        decodedSampleRate: ctx.sampleRate,
        contextSampleRate: ctx.sampleRate,
        fileId: capturedFileId,
      };
      this._fileAnalysis = analysis;
      for (const fn of this.fileReadyListeners) {
        fn(analysis);
      }
    }, 0);
  }

  private async loadViaBuffer(file: File, ctx: AudioContext): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.stretchEnabledForBuffer = false;
    this.pitchShiftAvailable = true;
    try {
      const stretchNode = await this.ensureStretchNode(decodedBuffer.numberOfChannels);
      await stretchNode.dropBuffers();
      await stretchNode.addBuffers(this.prepareStretchBuffers(decodedBuffer));
      this.stretchEnabledForBuffer = true;
    } catch (error) {
      console.error('stretch load failed, falling back to native playback', error);
      await this.disposeStretchNode();
    }

    this.buffer = decodedBuffer;
    this._filename = file.name;
    this.offsetAt = 0;
    this.fileId++;

    this.emitTransport();

    const capturedBuffer = this.buffer;
    const capturedFileId = this.fileId;
    setTimeout(() => {
      if (this.fileId !== capturedFileId) return;
      this._displayGain = this.computeDisplayGain(capturedBuffer);
      this._fileAnalysis = this.computeFileAnalysis(capturedBuffer);
      this._waveformPeaks = this.computeWaveformPeaks(capturedBuffer);
      for (const fn of this.fileReadyListeners) {
        fn(this._fileAnalysis!);
      }
    }, 0);
  }

  private rampPlayGain(target: number, durationSeconds: number, startAt?: number): void {
    if (!this.ctx || !this.playGainNode) return;

    const now = this.ctx.currentTime;
    const beginAt = startAt ?? now;
    const gain = this.playGainNode.gain;

    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    if (beginAt > now) {
      gain.setValueAtTime(target === 0 ? gain.value : 0, beginAt);
    }
    gain.linearRampToValueAtTime(target, beginAt + durationSeconds);
  }

  private clearSeekResume(): void {
    if (this.seekResumeTimer !== null) {
      window.clearTimeout(this.seekResumeTimer);
      this.seekResumeTimer = null;
    }
    this.seekResumePending = false;
  }

  private scheduleSeekResume(): void {
    this.seekResumePending = true;
    if (this.seekResumeTimer !== null) {
      window.clearTimeout(this.seekResumeTimer);
    }
    this.seekResumeTimer = window.setTimeout(() => {
      this.seekResumeTimer = null;
      if (!this.seekResumePending) return;
      this.seekResumePending = false;
      this.play();
    }, SEEK_RESUME_DELAY_MS);
  }

  private get playbackHeadTime(): number {
    if (!this.ctx || !this._isPlaying) return this.offsetAt;
    const elapsed = Math.max(0, this.ctx.currentTime - this.startedAt);
    const activeRate = this.scrubActive ? this.scrubPreviewRate : this.traversalRate;
    const rawTime = this.offsetAt + elapsed * activeRate;
    return Math.max(0, Math.min(rawTime, this.duration));
  }

  private clearScrubTimers(): void {
    if (this.scrubPreviewTimer !== null) {
      window.clearTimeout(this.scrubPreviewTimer);
      this.scrubPreviewTimer = null;
    }
    if (this.scrubStopTimer !== null) {
      window.clearTimeout(this.scrubStopTimer);
      this.scrubStopTimer = null;
    }
  }

  private refreshScrubStopTimer(): void {
    if (this.scrubStopTimer !== null) {
      window.clearTimeout(this.scrubStopTimer);
    }
    if (!this.scrubActive) return;
    this.scrubStopTimer = window.setTimeout(() => {
      this.scrubStopTimer = null;
      if (!this.scrubActive || !this._isPlaying) return;
      this.stopPlayback(false, 'scrub-preview');
      this.emitTransport();
    }, this.scrubConfig.windowMs);
  }

  private scheduleScrubPreview(): void {
    if (this.scrubPreviewTimer !== null) {
      window.clearTimeout(this.scrubPreviewTimer);
      this.scrubPreviewTimer = null;
    }
    if (!this.scrubActive || !this.buffer) return;
    if (this._isPlaying) {
      this.refreshScrubStopTimer();
      return;
    }

    this.scrubPreviewTimer = window.setTimeout(() => {
      this.scrubPreviewTimer = null;
      if (!this.scrubActive || !this.buffer) return;

      this.play();
      this.refreshScrubStopTimer();
    }, this.scrubConfig.delayMs);
  }

  private updateScrubPreviewRate(targetSeconds: number): void {
    const now = performance.now();
    const previousTarget = this.scrubLastTarget;
    const previousAt = this.scrubLastMoveAt;
    this.scrubLastTarget = targetSeconds;
    this.scrubLastMoveAt = now;

    if (this._scrubStyle === 'step' || previousAt === 0) {
      this.scrubPreviewRate = 1;
      return;
    }

    const dtSeconds = Math.max((now - previousAt) / 1000, 0.001);
    const scrubSpeed = Math.abs(targetSeconds - previousTarget) / dtSeconds;
    const nextRate = this.scrubConfig.baseRate + scrubSpeed * this.scrubConfig.velocityRateGain;
    const clampedRate = Math.max(0.85, Math.min(this.scrubConfig.maxPreviewRate, nextRate));
    this.scrubPreviewRate = this.scrubPreviewRate * 0.55 + clampedRate * 0.45;
  }

  private shouldRestartScrubPreview(targetSeconds: number): boolean {
    if (!this._isPlaying) return true;
    if (!this.scrubConfig.preferNative) return true;
    return Math.abs(targetSeconds - this.playbackHeadTime) > this.scrubConfig.continuityThresholdS;
  }

  private fallbackToNativePlayback(reason: string): void {
    if (!this.stretchEnabledForBuffer) return;

    const wasPlaying = this._isPlaying;
    const resumeAt = this.currentTime;
    console.error(`stretch unavailable (${reason}), falling back to native playback`);

    this.stopPlayback(false, `fallback:${reason}`);
    this.stretchEnabledForBuffer = false;
    this.pitchShiftAvailable = false;
    this._pitchSemitones = 0;
    this.offsetAt = resumeAt;
    this.emitTransport();

    if (wasPlaying) {
      this.play();
    }
  }

  private stopPlayback(resetToStart: boolean, label: string): void {
    const nextOffset = resetToStart
      ? 0
      : this.scrubActive
        ? this.scrubLastTarget
        : this.currentTime;

    if (this._isPlaying && this.ctx) {
      this.rampPlayGain(0, DECLICK_FADE_S);

      if (this.mediaElementMode && this.mediaElement) {
        // The gain ramp to 0 handles the declick; pause the element after it lands.
        const el = this.mediaElement;
        window.setTimeout(() => { try { el.pause(); } catch { /* ignore */ } }, DECLICK_FADE_S * 1000 + 10);
      } else {
        if (this.stretchEnabledForBuffer && this.stretchNode) {
          this.queueStretchCommand(
            this.stretchNode.stop(this.ctx.currentTime + DECLICK_FADE_S),
            label,
          );
        }

        if (this.sourceNode) {
          try {
            this.sourceNode.stop(this.ctx.currentTime + DECLICK_FADE_S + 0.001);
          } catch {
            // Ignore stop on an already-ended native source.
          }
        }
      }
    }

    this.sourceNode = null;
    this.offsetAt = nextOffset;
    this.startedAt = 0;
    this._isPlaying = false;
    this._usingStretchForPlayback = false;
    this.stopRaf();
  }

  play(): void {
    this.clearSeekResume();
    if (this._isPlaying || !this.playGainNode) return;
    if (!this.mediaElementMode && !this.buffer) return;

    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    if (this.mediaElementMode && this.mediaElement) {
      const el = this.mediaElement;
      el.currentTime = this.offsetAt;
      el.playbackRate = this._playbackRate;

      this.rampPlayGain(1, DECLICK_IN_S, ctx.currentTime);
      this.startedAt = ctx.currentTime;
      this._isPlaying = true;
      this.playId++;

      el.onended = () => {
        if (this.mediaElement !== el || !this._isPlaying) return;
        this.stopPlayback(this._loopStart === null, 'ended');
        this.emitTransport();
      };

      void el.play().catch((error) => {
        console.error('media element play failed', error);
        if (this.mediaElement !== el || !this._isPlaying) return;
        this._isPlaying = false;
        this.emitTransport();
      });

      this.startRaf();
      this.emitTransport();
      return;
    }

    const useNativeScrubPreview = this.scrubActive && this.scrubConfig.preferNative;

    const stretchNode = this.stretchNode;
    if (this.useStretchPath && stretchNode && !useNativeScrubPreview) {
      const outputTime = ctx.currentTime + this.stretchLatency;
      const scheduledOffset = this.offsetAt;
      this.rampPlayGain(1, DECLICK_IN_S, outputTime);

      const schedule: StretchSchedule = {
        active: true,
        input: this.offsetAt,
        outputTime,
        rate: this._playbackRate,
        semitones: this._pitchSemitones,
      };

      this.startedAt = outputTime;
      this.stretchLastProgressAt = outputTime;
      this._isPlaying = true;
      this._usingStretchForPlayback = true;
      this.playId++;
      this.startRaf();
      this.emitTransport();

      void stretchNode.start(schedule).catch((error) => {
        console.error('stretch start failed, falling back to native playback', error);
        if (!this._isPlaying || !this.stretchEnabledForBuffer) return;
        this.offsetAt = scheduledOffset;
        this.fallbackToNativePlayback('start');
      });
      return;
    }

    this.sourceNode = ctx.createBufferSource();
    this.sourceNode.buffer = this.buffer;
    this.sourceNode.playbackRate.value = this.scrubActive ? this.scrubPreviewRate : this.nativeFallbackRate;
    this.sourceNode.connect(this.playGainNode);

    this.rampPlayGain(1, DECLICK_IN_S, ctx.currentTime);
    this.sourceNode.start(0, this.offsetAt);
    this.startedAt = ctx.currentTime;
    this._isPlaying = true;
    this.playId++;

    const nativeSource = this.sourceNode;
    nativeSource.onended = () => {
      try {
        nativeSource.disconnect();
      } catch {
        // Source may already be disconnected.
      }
      if (this.sourceNode !== nativeSource) return;
      this.sourceNode = null;
      if (!this._isPlaying) return;
      this.stopPlayback(this.scrubActive ? false : true, this.scrubActive ? 'scrub-ended' : 'ended');
      this.emitTransport();
    };

    this.startRaf();
    this.emitTransport();
  }

  pause(): void {
    this.clearSeekResume();
    const wasScrubbing = this.scrubActive;
    this.clearScrubTimers();
    this.scrubActive = false;
    this.scrubResumeAfter = false;
    this.scrubPreviewRate = 1;
    this.scrubLastTarget = this.offsetAt;
    this.scrubLastMoveAt = 0;
    if (!this._isPlaying && !wasScrubbing) return;
    if (this._isPlaying) {
      this.stopPlayback(false, 'pause');
    }
    this.emitTransport();
  }

  stop(): void {
    this.clearSeekResume();
    this.clearScrubTimers();
    this.scrubActive = false;
    this.scrubResumeAfter = false;
    this.scrubPreviewRate = 1;
    this.scrubLastTarget = 0;
    this.scrubLastMoveAt = 0;
    this.stopPlayback(true, 'stop');
    this.emitTransport();
  }

  reset(): void {
    this.clearSeekResume();
    this.clearScrubTimers();
    this.scrubActive = false;
    this.scrubResumeAfter = false;
    this.scrubPreviewRate = 1;
    this.scrubLastTarget = 0;
    this.scrubLastMoveAt = 0;
    this.stopPlayback(true, 'reset');
    this.clearMediaElement();
    this.buffer = null;
    this._filename = null;
    this.fileId++;
    this._displayGain = 1;
    this._fileAnalysis = null;
    this._waveformPeaks = null;
    this._loopStart = null;
    this._loopEnd = null;

    if (this.stretchNode) {
      this.queueStretchCommand(this.stretchNode.dropBuffers(), 'dropBuffers');
    }

    this.emitTransport();
    for (const fn of this.resetListeners) {
      fn();
    }
  }

  setLoop(start: number, end: number): void {
    const dur = this.duration;
    this._loopStart = Math.max(0, Math.min(start, dur));
    this._loopEnd = Math.max(0, Math.min(end, dur));
    if (this._loopStart >= this._loopEnd) {
      this._loopStart = null;
      this._loopEnd = null;
    }
    this.emitTransport();
  }

  clearLoop(): void {
    this._loopStart = null;
    this._loopEnd = null;
    this.emitTransport();
  }

  get loopStart(): number | null { return this._loopStart; }
  get loopEnd(): number | null { return this._loopEnd; }

  beginScrub(): void {
    if (!this.buffer && !this.mediaElementMode) return;

    const pendingResume = this.seekResumePending;
    this.clearSeekResume();
    if (!this.scrubActive) {
      this.scrubResumeAfter = this._isPlaying || pendingResume;
    }

    this.clearScrubTimers();
    if (this._isPlaying) {
      this.stopPlayback(false, 'scrub-begin');
    }

    this.scrubLastTarget = this.offsetAt;
    this.scrubLastMoveAt = 0;
    this.scrubPreviewRate = 1;
    this.scrubActive = true;
    this.emitTransport();
  }

  scrubTo(seconds: number): void {
    if (!this.buffer && !this.mediaElementMode) return;
    if (!this.scrubActive) {
      this.beginScrub();
    }

    // In media-element mode, just seek directly — no preview audio.
    if (this.mediaElementMode && this.mediaElement) {
      const nextOffset = Math.max(0, Math.min(seconds, this.duration));
      this.clearScrubTimers();
      if (this._isPlaying) this.stopPlayback(false, 'scrub-shift');
      this.offsetAt = nextOffset;
      this.scrubLastTarget = nextOffset;
      this.mediaElement.currentTime = nextOffset;
      this.emitTransport();
      return;
    }

    const nextOffset = Math.max(0, Math.min(seconds, this.buffer!.duration));
    this.updateScrubPreviewRate(nextOffset);
    const shouldRestart = this.shouldRestartScrubPreview(nextOffset);

    this.clearScrubTimers();
    if (this._isPlaying && shouldRestart) {
      this.stopPlayback(false, 'scrub-shift');
    }

    this.offsetAt = nextOffset;
    this.emitTransport();

    if (this._isPlaying && !shouldRestart) {
      if (this.sourceNode) {
        this.sourceNode.playbackRate.value = this.scrubPreviewRate;
      }
      this.refreshScrubStopTimer();
      return;
    }

    this.scheduleScrubPreview();
  }

  endScrub(): void {
    if (!this.scrubActive) return;

    const resumeAt = Math.max(0, Math.min(this.scrubLastTarget, this.duration));
    const shouldResume = this.scrubResumeAfter && resumeAt < this.duration;
    this.clearScrubTimers();
    if (this._isPlaying) {
      this.stopPlayback(false, 'scrub-end');
    }

    this.offsetAt = resumeAt;
    this.scrubActive = false;
    this.scrubResumeAfter = false;
    this.scrubPreviewRate = 1;
    this.scrubLastMoveAt = 0;
    this.scrubLastTarget = resumeAt;

    if (shouldResume) {
      this.play();
      return;
    }

    this.emitTransport();
  }

  seek(seconds: number): void {
    if (this.scrubActive) {
      this.scrubTo(seconds);
      return;
    }

    const resumeAfterSeek = this._isPlaying || this.seekResumePending;

    if (this._isPlaying) {
      this.stopPlayback(false, 'seek');
      this.emitTransport();
    }

    if (this.seekResumePending) {
      this.clearSeekResume();
    }

    this.offsetAt = Math.max(0, Math.min(seconds, this.duration));
    this.emitTransport();

    if (resumeAfterSeek) {
      this.scheduleSeekResume();
    }
  }

  get currentTime(): number {
    if (this.scrubActive) return this.scrubLastTarget;
    if (this.mediaElementMode && this.mediaElement) {
      return this.mediaElement.currentTime;
    }
    if (!this.ctx) return 0;
    if (!this._isPlaying) return this.offsetAt;
    return this.playbackHeadTime;
  }

  get duration(): number {
    if (this.mediaElementMode && this.mediaElement) {
      const d = this.mediaElement.duration;
      return isFinite(d) ? d : (this.buffer?.duration ?? 0);
    }
    return this.buffer?.duration ?? 0;
  }

  private computeDisplayGain(buffer: AudioBuffer): number {
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const value = Math.abs(data[i]);
        if (value > peak) peak = value;
      }
    }
    return peak > 0.001 ? 0.95 / peak : 1;
  }

  private rebasePlaybackClock(): void {
    if (!this._isPlaying || !this.ctx) return;
    this.offsetAt = this.currentTime;
    this.startedAt = this.ctx.currentTime;
  }

  private scheduleStretchUpdate(): void {
    if (!this._isPlaying || !this.ctx || !this.stretchNode || !this.stretchEnabledForBuffer) return;

    const schedule: StretchSchedule = {
      active: true,
      outputTime: this.ctx.currentTime,
      rate: this._playbackRate,
      semitones: this._pitchSemitones,
    };

    this.queueStretchCommand(this.stretchNode.schedule(schedule), 'schedule');
  }

  private startRaf(): void {
    if (this.rafId !== null) return;

    this.lastAnalysisAt = 0;
    const loop = () => {
      const now = performance.now();
      if (this.lastAnalysisAt === 0 || now - this.lastAnalysisAt >= ANALYSIS_FRAME_MS) {
        this.lastAnalysisAt = now;
        this.extractFrame();

        if (this.scrubActive) {
          this.rafId = requestAnimationFrame(loop);
          return;
        }

        if (this._isPlaying && this._loopStart !== null && this._loopEnd !== null && this.currentTime >= this._loopEnd) {
          this.seek(this._loopStart);
          return;
        }

        if (
          this._isPlaying &&
          this._usingStretchForPlayback &&
          this.ctx &&
          this.ctx.currentTime >= this.startedAt + STRETCH_WATCHDOG_GRACE_S &&
          this.ctx.currentTime - this.stretchLastProgressAt > STRETCH_WATCHDOG_TIMEOUT_S
        ) {
          this.fallbackToNativePlayback('watchdog');
          return;
        }

        if (this._isPlaying && this._loopStart === null && this.currentTime >= this.duration) {
          this.stopPlayback(true, 'ended');
          this.emitTransport();
          return;
        }
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

  private detectF0(td: Float32Array, sampleRate: number): { f0: number | null; confidence: number } {
    const size = Math.min(2048, td.length);
    const minLag = Math.floor(sampleRate / 1000);
    const maxLag = Math.min(Math.floor(sampleRate / 60), size - 1);

    let rms = 0;
    for (let i = 0; i < size; i++) {
      rms += td[i] * td[i];
    }
    if (Math.sqrt(rms / size) < 0.005) {
      return { f0: null, confidence: 0 };
    }

    let bestLag = -1;
    let bestCorr = 0;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      let norm1 = 0;
      let norm2 = 0;
      const limit = size - lag;
      for (let i = 0; i < limit; i++) {
        const a = td[i];
        const b = td[i + lag];
        sum += a * b;
        norm1 += a * a;
        norm2 += b * b;
      }
      const denom = Math.sqrt(norm1 * norm2);
      const corr = denom > 0 ? sum / denom : 0;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    const f0 = bestLag > 0 && bestCorr > 0.4 ? sampleRate / bestLag : null;
    return { f0, confidence: Math.max(0, bestCorr) };
  }

  private extractFrame(): void {
    if (!this.analyserL || !this.analyserR || !this.ctx) return;

    this.analyserL.getFloatTimeDomainData(this.timeDomainData as Float32Array<ArrayBuffer>);
    this.analyserL.getFloatFrequencyData(this.frequencyData as Float32Array<ArrayBuffer>);
    this.analyserR.getFloatTimeDomainData(this.timeDomainDataR as Float32Array<ArrayBuffer>);
    this.analyserR.getFloatFrequencyData(this.frequencyDataR as Float32Array<ArrayBuffer>);

    const tdL = this.timeDomainData;
    const tdR = this.timeDomainDataR;
    const fftBinCount = this.frequencyData.length;

    let peakL = 0;
    let rmsL = 0;
    for (let i = 0; i < tdL.length; i++) {
      const value = Math.abs(tdL[i]);
      if (value > peakL) peakL = value;
      rmsL += tdL[i] * tdL[i];
    }
    rmsL = Math.sqrt(rmsL / tdL.length);

    let peakR = 0;
    let rmsR = 0;
    for (let i = 0; i < tdR.length; i++) {
      const value = Math.abs(tdR[i]);
      if (value > peakR) peakR = value;
      rmsR += tdR[i] * tdR[i];
    }
    rmsR = Math.sqrt(rmsR / tdR.length);

    const binHz = this.ctx.sampleRate / (fftBinCount * 2);
    let centroidNum = 0;
    let centroidDen = 0;
    for (let i = 1; i < fftBinCount; i++) {
      const power = Math.pow(10, this.frequencyData[i] / 10);
      centroidNum += i * binHz * power;
      centroidDen += power;
    }
    const spectralCentroid = centroidDen > 0 ? centroidNum / centroidDen : 0;

    const { f0, confidence } = this.detectF0(tdL, this.ctx.sampleRate);

    this.frameSlot = this.frameSlot === 0 ? 1 : 0;
    const slot = this.frameSlot;
    this.frameTD[slot].set(tdL);
    this.frameFD[slot].set(this.frequencyData);
    this.frameFDR[slot].set(this.frequencyDataR);

    const frame: AudioFrame = {
      currentTime: this.currentTime,
      timeDomain: this.frameTD[slot],
      frequencyDb: this.frameFD[slot],
      frequencyDbRight: this.frameFDR[slot],
      peakLeft: Math.min(peakL, 1),
      peakRight: Math.min(peakR, 1),
      rmsLeft: Math.min(rmsL, 1),
      rmsRight: Math.min(rmsR, 1),
      sampleRate: this.ctx.sampleRate,
      fftBinCount,
      playId: this.playId,
      fileId: this.fileId,
      displayGain: this._displayGain,
      spectralCentroid,
      f0Hz: f0,
      f0Confidence: confidence,
    };

    this.frameBus.publish(frame);
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.value = this._volume;
    }
  }

  setPlaybackRate(r: number): void {
    const nextRate = Math.max(RATE_MIN, Math.min(RATE_MAX, r));
    if (Math.abs(nextRate - this._playbackRate) < 0.0001) return;

    const wasUsingStretch = this.useStretchPath;
    this.rebasePlaybackClock();
    this._playbackRate = nextRate;
    const nowUsingStretch = this.useStretchPath;

    if (this.mediaElementMode && this.mediaElement) {
      this.mediaElement.playbackRate = nextRate;
      this.emitTransport();
      return;
    }

    if (wasUsingStretch !== nowUsingStretch && this._isPlaying) {
      // Crossing the identity threshold — restart with the appropriate path.
      this.stopPlayback(false, 'stretch-mode-change');
      this.play();
    } else if (nowUsingStretch) {
      this.scheduleStretchUpdate();
    } else if (this.sourceNode) {
      this.sourceNode.playbackRate.value = this.nativeFallbackRate;
    }
    this.emitTransport();
  }

  setPitchSemitones(semitones: number): void {
    if (!this.pitchShiftAvailable) return;
    const nextPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, semitones));
    if (Math.abs(nextPitch - this._pitchSemitones) < 0.0001) return;

    const wasUsingStretch = this.useStretchPath;
    this.rebasePlaybackClock();
    this._pitchSemitones = nextPitch;
    const nowUsingStretch = this.useStretchPath;

    if (wasUsingStretch !== nowUsingStretch && this._isPlaying) {
      // Crossing the identity threshold — restart with the appropriate path.
      this.stopPlayback(false, 'stretch-mode-change-pitch');
      this.play();
    } else if (nowUsingStretch) {
      this.scheduleStretchUpdate();
    } else if (this.sourceNode) {
      this.sourceNode.playbackRate.value = this.nativeFallbackRate;
    }
    this.emitTransport();
  }

  setScrubStyle(style: ScrubStyle): void {
    this._scrubStyle = style;
  }

  get isPlaying(): boolean { return this._isPlaying; }
  get playbackRate(): number { return this._playbackRate; }
  get pitchSemitones(): number { return this._pitchSemitones; }
  get scrubStyle(): ScrubStyle { return this._scrubStyle; }
  get analysisFps(): number { return ANALYSIS_FPS; }
  get audioBuffer(): AudioBuffer | null { return this.buffer; }
  get displayGain(): number { return this._displayGain; }
  get waveformPeaks(): Float32Array | null { return this._waveformPeaks; }
  get waveformBinSamples(): number { return AudioEngine.WAVEFORM_BIN_SAMPLES; }
  get sampleRate(): number { return this.ctx?.sampleRate ?? 44100; }

  getTimeDomainData(out: Float32Array): void {
    if (this.analyserL) {
      this.analyserL.getFloatTimeDomainData(out as Float32Array<ArrayBuffer>);
    } else {
      out.fill(0);
    }
  }

  onFileReady(fn: (analysis: FileAnalysis) => void): () => void {
    this.fileReadyListeners.add(fn);
    return () => {
      this.fileReadyListeners.delete(fn);
    };
  }

  onTransport(fn: TransportListener): () => void {
    this.transportListeners.add(fn);
    fn(this.createTransportState());
    return () => {
      this.transportListeners.delete(fn);
    };
  }

  onReset(fn: () => void): () => void {
    this.resetListeners.add(fn);
    return () => {
      this.resetListeners.delete(fn);
    };
  }

  private computeWaveformPeaks(buffer: AudioBuffer): Float32Array {
    const data = buffer.getChannelData(0);
    const binSamples = AudioEngine.WAVEFORM_BIN_SAMPLES;
    const numBins = Math.ceil(data.length / binSamples);
    const peaks = new Float32Array(numBins * 2);
    for (let bin = 0; bin < numBins; bin++) {
      const start = bin * binSamples;
      const end = Math.min(start + binSamples, data.length);
      let min = 0;
      let max = 0;
      for (let sample = start; sample < end; sample++) {
        const value = data[sample];
        if (value < min) min = value;
        if (value > max) max = value;
      }
      peaks[bin * 2] = min;
      peaks[bin * 2 + 1] = max;
    }
    return peaks;
  }

  private computeFileAnalysis(buffer: AudioBuffer): FileAnalysis {
    let peak = 0;
    let rmsSum = 0;
    let totalSamples = 0;
    let clipCount = 0;

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const value = Math.abs(data[i]);
        if (value > peak) peak = value;
        rmsSum += data[i] * data[i];
        totalSamples++;
        if (value >= 0.9999) clipCount++;
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

  private createTransportState(): TransportState {
    return {
      isPlaying: this._isPlaying && !this.scrubActive,
      currentTime: this.currentTime,
      duration: this.duration,
      filename: this._filename,
      scrubActive: this.scrubActive,
      playbackRate: this._playbackRate,
      pitchSemitones: this._pitchSemitones,
      pitchShiftAvailable: this.pitchShiftAvailable,
      loopStart: this._loopStart,
      loopEnd: this._loopEnd,
    };
  }

  private emitTransport(): void {
    const state = this.createTransportState();

    for (const fn of this.transportListeners) {
      fn(state);
    }
  }
}






