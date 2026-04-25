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
import type { AnalysisConfig, AudioFrame, FileAnalysis, ScrubStyle, TransportState } from '../types';
import { RATE_MIN, RATE_MAX, PITCH_MIN, PITCH_MAX } from '../constants';
import type { PerformanceDiagnosticsStore } from '../diagnostics/logStore';

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
const MAX_STRETCH_PREP_BYTES = 512 * 1024 * 1024;
const MAX_IN_MEMORY_FILE_BYTES = 384 * 1024 * 1024;
const MAX_DECODE_AUDIO_BYTES = 768 * 1024 * 1024;
const DEFERRED_ANALYSIS_SLICE_MS = 6;
const DEFERRED_ANALYSIS_SAMPLE_BATCH = 16_384;
const STREAMED_MEDIA_SAMPLE_RATE = 48_000;
const STREAMED_MEDIA_CHANNELS = 2;
const STREAMED_OVERVIEW_PROBE_FFT_SIZE = 2048;

type PlaybackBackend = 'decoded' | 'streamed';
export interface StreamedOverviewProbe {
  readonly element: HTMLMediaElement;
  readonly analyser: AnalyserNode;
  readonly timeDomain: Float32Array;
  dispose(): void;
}
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
  private readonly performanceDiagnostics: PerformanceDiagnosticsStore | null;
  private analysisConfig: AnalysisConfig;

  constructor(
    frameBus: FrameBus,
    performanceDiagnostics: PerformanceDiagnosticsStore | null = null,
    analysisConfig: AnalysisConfig,
  ) {
    this.frameBus = frameBus;
    this.performanceDiagnostics = performanceDiagnostics;
    this.analysisConfig = analysisConfig;
  }

  private ctx: AudioContext | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private playGainNode: GainNode | null = null;
  private streamedPitchInputNode: GainNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private mediaElement: HTMLMediaElement | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private mediaObjectUrl: string | null = null;
  private stretchNode: StretchNode | null = null;
  private stretchNodeReady: Promise<StretchNode> | null = null;
  private stretchChannelCount = 0;
  private stretchLatency = 0;
  private stretchEnabledForBuffer = false;
  private stretchEnabledForStream = false;
  private stretchLastProgressAt = 0;
  private pitchShiftAvailable = true;
  private playbackBackend: PlaybackBackend = 'decoded';

  private buffer: AudioBuffer | null = null;
  private startedAt = 0;
  private offsetAt = 0;
  private _isPlaying = false;
  private rafId: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onVisibilityChange: (() => void) | null = null;
  private _volume = 1;
  private _playbackRate = 1;
  private _pitchSemitones = 0;
  private playId = 0;
  private streamedPlayAttemptId = 0;
  private fileId = 0;
  private loadVersion = 0;
  private _displayGain = 1;
  private _loopStart: number | null = null;
  private _loopEnd: number | null = null;
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

  private transportListeners = new Set<TransportListener>();
  private resetListeners = new Set<() => void>();
  private fileReadyListeners = new Set<(analysis: FileAnalysis) => void>();
  private _fileAnalysis: FileAnalysis | null = null;
  private _filename: string | null = null;
  private lastAnalysisAt = 0;
  private stretchMutationChain: Promise<void> = Promise.resolve();
  private deferredAnalysisCancel: (() => void) | null = null;

  private invalidateStreamedPlayAttempt(): void {
    this.streamedPlayAttemptId++;
  }

  private isBenignStreamedPlayInterruption(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return true;
    }

    const message = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
    return /play\(\) request was interrupted by a call to pause\(\)/i.test(message);
  }

  private shouldPreflightStreaming(file: File): boolean {
    return file.type.startsWith('video/') || file.size >= MAX_IN_MEMORY_FILE_BYTES;
  }

  private shouldPreferStreamingLoad(file: File, durationSeconds: number | null): boolean {
    if (file.size >= MAX_IN_MEMORY_FILE_BYTES) return true;
    if (durationSeconds !== null && Number.isFinite(durationSeconds) && durationSeconds > 0) {
      const estimatedDecodedBytes = durationSeconds * STREAMED_MEDIA_SAMPLE_RATE * STREAMED_MEDIA_CHANNELS * Float32Array.BYTES_PER_ELEMENT;
      if (estimatedDecodedBytes >= MAX_DECODE_AUDIO_BYTES) return true;
    }
    return false;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.buildGraph();
    }
    return this.ctx;
  }

  private buildGraph(): void {
    const ctx = this.ctx!;
    const fftSize = this.analysisConfig.general.fftSize;
    const smoothing = this.analysisConfig.general.smoothing;
    const dbMin = this.analysisConfig.spectrogram.dbMin;
    const dbMax = this.analysisConfig.spectrogram.dbMax;

    this.analyserL = ctx.createAnalyser();
    this.analyserL.fftSize = fftSize;
    this.analyserL.smoothingTimeConstant = smoothing;
    this.analyserL.minDecibels = dbMin;
    this.analyserL.maxDecibels = dbMax;

    this.analyserR = ctx.createAnalyser();
    this.analyserR.fftSize = fftSize;
    this.analyserR.smoothingTimeConstant = smoothing;
    this.analyserR.minDecibels = dbMin;
    this.analyserR.maxDecibels = dbMax;

    this.timeDomainData = new Float32Array(new ArrayBuffer(fftSize * 4));
    this.timeDomainDataR = new Float32Array(new ArrayBuffer(fftSize * 4));
    this.frequencyData = new Float32Array(new ArrayBuffer((fftSize / 2) * 4));
    this.frequencyDataR = new Float32Array(new ArrayBuffer((fftSize / 2) * 4));

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this._volume;
    this.masterGain.connect(ctx.destination);

    this.playGainNode = ctx.createGain();
    this.playGainNode.gain.value = 0;
    this.playGainNode.channelCount = 2;
    this.playGainNode.channelCountMode = 'explicit';
    this.playGainNode.connect(this.masterGain);

    this.streamedPitchInputNode = ctx.createGain();
    this.streamedPitchInputNode.gain.value = 1;
    this.streamedPitchInputNode.channelCount = STREAMED_MEDIA_CHANNELS;
    this.streamedPitchInputNode.channelCountMode = 'explicit';
    this.streamedPitchInputNode.channelInterpretation = 'speakers';

    this.splitterNode = ctx.createChannelSplitter(2);
    this.playGainNode.connect(this.splitterNode);
    this.splitterNode.connect(this.analyserL, 0);
    this.splitterNode.connect(this.analyserR, 1);
  }

  /** Apply analysis configuration changes to the live analyser nodes.
   *  Called by AppSession when the AnalysisConfigStore emits. */
  applyAnalysisConfig(config: AnalysisConfig): void {
    this.analysisConfig = config;
    if (!this.analyserL || !this.analyserR) return;

    const fftSizeChanged = this.analyserL.fftSize !== config.general.fftSize;

    this.analyserL.fftSize = config.general.fftSize;
    this.analyserL.smoothingTimeConstant = config.general.smoothing;
    this.analyserL.minDecibels = config.spectrogram.dbMin;
    this.analyserL.maxDecibels = config.spectrogram.dbMax;

    this.analyserR.fftSize = config.general.fftSize;
    this.analyserR.smoothingTimeConstant = config.general.smoothing;
    this.analyserR.minDecibels = config.spectrogram.dbMin;
    this.analyserR.maxDecibels = config.spectrogram.dbMax;

    if (fftSizeChanged) {
      this.timeDomainData = new Float32Array(config.general.fftSize);
      this.timeDomainDataR = new Float32Array(config.general.fftSize);
      this.frequencyData = new Float32Array(config.general.fftSize / 2);
      this.frequencyDataR = new Float32Array(config.general.fftSize / 2);
    }
  }

  private queueStretchCommand(command: Promise<unknown>, label: string): void {
    void command.catch((error) => {
      console.error(`stretch ${label} failed`, error);
    });
  }

  private async runSerializedStretchMutation<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.stretchMutationChain.then(fn, fn);
    this.stretchMutationChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
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

  private get stretchActive(): boolean {
    return this.stretchEnabledForBuffer || this.stretchEnabledForStream;
  }

  private get streamedPitchShiftActive(): boolean {
    return this.playbackBackend === 'streamed' && this.stretchEnabledForStream && !!this.mediaElement;
  }

  private get scrubConfig(): ScrubStyleConfig {
    return SCRUB_STYLE_CONFIG[this._scrubStyle];
  }

  private get streamedScrubCanStayLive(): boolean {
    return this.playbackBackend === 'streamed' && !!this.mediaElement;
  }

  private async disposeStretchNode(): Promise<void> {
    const readyNode = this.stretchNode ?? await this.stretchNodeReady?.catch(() => null) ?? null;
    if (this.streamedPitchInputNode) {
      try {
        this.streamedPitchInputNode.disconnect();
      } catch {
        // Already disconnected.
      }
    }
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

  private prepareStretchBuffers(buffer: AudioBuffer): Float32Array[] {
    return Array.from({ length: buffer.numberOfChannels }, (_, channel) => {
      return new Float32Array(buffer.getChannelData(channel));
    });
  }

  private routeStreamedSource(throughStretch: boolean): void {
    if (!this.mediaSourceNode || !this.playGainNode) return;

    try {
      this.mediaSourceNode.disconnect();
    } catch {
      // Already disconnected.
    }

    if (throughStretch) {
      if (this.stretchNode && this.streamedPitchInputNode) {
        try { this.streamedPitchInputNode.disconnect(this.stretchNode); } catch { /* already disconnected */ }
        this.streamedPitchInputNode.connect(this.stretchNode);
        this.mediaSourceNode.connect(this.streamedPitchInputNode);
      }
      return;
    }

    if (this.stretchNode && this.streamedPitchInputNode) {
      try { this.streamedPitchInputNode.disconnect(this.stretchNode); } catch { /* already disconnected */ }
    }
    this.mediaSourceNode.connect(this.playGainNode);
  }

  private setMediaElementPitchPreservation(enabled: boolean): void {
    if (!this.mediaElement) return;
    const pitchPreservingElement = this.mediaElement as HTMLMediaElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    if ('preservesPitch' in pitchPreservingElement) {
      pitchPreservingElement.preservesPitch = enabled;
    }
    if ('mozPreservesPitch' in pitchPreservingElement) {
      pitchPreservingElement.mozPreservesPitch = enabled;
    }
    if ('webkitPreservesPitch' in pitchPreservingElement) {
      pitchPreservingElement.webkitPreservesPitch = enabled;
    }
  }

  private get activeStreamInputRate(): number {
    return this.scrubActive ? this.scrubPreviewRate : this.nativeFallbackRate;
  }

  private get streamedPitchCompensatedSemitones(): number {
    const inputRate = Math.max(0.01, this.activeStreamInputRate);
    return this._pitchSemitones - 12 * Math.log2(inputRate);
  }

  private get streamedPitchScheduleLeadTime(): number {
    return Math.max(this.stretchLatency, 0.05);
  }

  private get streamedFormantCompensationEnabled(): boolean {
    const effectiveSemitones = Math.abs(this.streamedPitchCompensatedSemitones);
    if (effectiveSemitones <= 0.001) return false;
    return effectiveSemitones <= 4.5;
  }

  private buildStreamedPitchSchedule(outputTime: number): StretchSchedule {
    return {
      active: true,
      outputTime,
      semitones: this.streamedPitchCompensatedSemitones,
      formantCompensation: this.streamedFormantCompensationEnabled,
      formantBaseHz: 0,
    };
  }

  private scheduleStreamedPitchUpdate(
    outputTime = (this.ctx?.currentTime ?? 0) + this.streamedPitchScheduleLeadTime,
    label = 'stream-pitch',
  ): void {
    if (!this.streamedPitchShiftActive || !this.stretchNode) return;
    this.queueStretchCommand(this.stretchNode.schedule(this.buildStreamedPitchSchedule(outputTime)), label);
  }

  private async prepareStreamedPitchShift(loadVersion: number): Promise<void> {
    await this.runSerializedStretchMutation(async () => {
      if (loadVersion !== this.loadVersion || this.playbackBackend !== 'streamed' || !this.mediaElement) return;
      try {
        await this.ensureStretchNode(STREAMED_MEDIA_CHANNELS);
        if (loadVersion !== this.loadVersion || this.playbackBackend !== 'streamed' || !this.mediaElement) return;
        this.pitchShiftAvailable = true;
        this.emitTransport();
      } catch (error) {
        if (loadVersion !== this.loadVersion || this.playbackBackend !== 'streamed') return;
        this.pitchShiftAvailable = false;
        this._pitchSemitones = 0;
        this.emitTransport();
        console.warn('streamed pitch prep failed, native playback retained', error);
      }
    });
  }

  private async setStreamedPitchShiftEnabled(enabled: boolean): Promise<boolean> {
    if (this.playbackBackend !== 'streamed' || !this.mediaElement || !this.mediaSourceNode) {
      return false;
    }

    if (!enabled) {
      if (this.stretchEnabledForStream && this.ctx && this.stretchNode) {
        try {
          await this.stretchNode.stop(this.ctx.currentTime + DECLICK_FADE_S);
        } catch {
          // Ignore live stretch stop failures while returning to native playback.
        }
      }
      this.routeStreamedSource(false);
      this.setMediaElementPitchPreservation(true);
      this.stretchEnabledForStream = false;
      return true;
    }

    try {
      await this.ensureStretchNode(STREAMED_MEDIA_CHANNELS);
    } catch (error) {
      this.stretchEnabledForStream = false;
      this.pitchShiftAvailable = false;
      console.warn('streamed pitch activation failed, native playback retained', error);
      return false;
    }

    if (this.playbackBackend !== 'streamed' || !this.mediaElement || !this.mediaSourceNode) {
      this.stretchEnabledForStream = false;
      return false;
    }

    this.routeStreamedSource(true);
    this.setMediaElementPitchPreservation(false);
    this.stretchEnabledForStream = true;
    this.pitchShiftAvailable = true;
    return true;
  }

  private async enableStreamedPitchShiftLive(): Promise<boolean> {
    if (
      this.playbackBackend !== 'streamed'
      || !this.mediaElement
      || !this.mediaSourceNode
      || !this.ctx
      || !this._isPlaying
    ) {
      return this.setStreamedPitchShiftEnabled(true);
    }

    const resumeAt = this.currentTime;
    const previewRate = this.scrubActive ? this.scrubPreviewRate : this.nativeFallbackRate;
    const enabled = await this.setStreamedPitchShiftEnabled(true);
    if (!enabled || !this.stretchNode || this.playbackBackend !== 'streamed' || !this.mediaElement || !this.ctx) {
      return false;
    }

    const outputTime = this.ctx.currentTime + this.streamedPitchScheduleLeadTime;
    this.offsetAt = resumeAt;
    this.startedAt = outputTime;
    this.mediaElement.currentTime = resumeAt;
    this.mediaElement.defaultPlaybackRate = this.nativeFallbackRate;
    this.mediaElement.playbackRate = previewRate;
    this.rampPlayGain(1, DECLICK_IN_S, outputTime);
    this.emitTransport();

    try {
      await this.stretchNode.start(this.buildStreamedPitchSchedule(outputTime));
      return true;
    } catch (error) {
      console.error('streamed pitch live-enable failed, native playback retained', error);
      this.offsetAt = resumeAt;
      this.startedAt = this.ctx.currentTime;
      await this.setStreamedPitchShiftEnabled(false);
      this.pitchShiftAvailable = false;
      this._pitchSemitones = 0;
      this.setMediaElementPitchPreservation(true);
      this.emitTransport();
      return false;
    }
  }

  private estimateStretchPrepBytes(buffer: AudioBuffer): number {
    return buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
  }

  private async createPreflightMediaElement(file: File): Promise<{
    readonly element: HTMLMediaElement;
    readonly url: string;
    readonly duration: number | null;
  }> {
    const url = URL.createObjectURL(file);
    const element = file.type.startsWith('video/')
      ? document.createElement('video')
      : new Audio();
    element.preload = 'metadata';
    element.src = url;
    element.crossOrigin = 'anonymous';
    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
    }

    return await new Promise((resolve, reject) => {
      const cleanup = () => {
        element.onloadedmetadata = null;
        element.onerror = null;
      };

      element.onloadedmetadata = () => {
        cleanup();
        const duration = Number.isFinite(element.duration) && element.duration > 0
          ? element.duration
          : null;
        resolve({ element, url, duration });
      };

      element.onerror = () => {
        cleanup();
        URL.revokeObjectURL(url);
        reject(new DOMException('The media element could not read this file.', 'NotSupportedError'));
      };
    });
  }

  private disposePreflightMediaElement(element: HTMLMediaElement, url: string): void {
    element.pause();
    element.removeAttribute('src');
    element.load();
    URL.revokeObjectURL(url);
  }

  private disposeStreamedMedia(): void {
    if (this.mediaElement) {
      this.invalidateStreamedPlayAttempt();
      this.mediaElement.pause();
      this.mediaElement.onended = null;
      this.mediaElement.onerror = null;
      this.mediaElement.onloadedmetadata = null;
      this.mediaElement.onseeked = null;
      this.mediaElement.onpause = null;
      this.mediaElement.onplay = null;
      this.mediaElement.removeAttribute('src');
      this.mediaElement.load();
      this.mediaElement = null;
    }

    if (this.mediaSourceNode) {
      try {
        this.mediaSourceNode.disconnect();
      } catch {
        // Already disconnected.
      }
      this.mediaSourceNode = null;
    }

    if (this.mediaObjectUrl) {
      URL.revokeObjectURL(this.mediaObjectUrl);
      this.mediaObjectUrl = null;
    }

    this.stretchEnabledForStream = false;
    this.playbackBackend = 'decoded';
  }

  private async activateStreamedMediaLoad(
    displayFilename: string,
    media: {
      readonly element: HTMLMediaElement;
      readonly url: string;
      readonly duration: number | null;
    },
    loadVersion: number,
    loadStartedAt: number,
    readMs: number,
    decodeMs: number,
    stretchMs: number,
  ): Promise<void> {
    const ctx = this.ensureContext();
    if (!this.playGainNode) {
      this.disposePreflightMediaElement(media.element, media.url);
      throw new Error('playGainNode is not initialized');
    }

    this.disposeStreamedMedia();
    await this.runSerializedStretchMutation(async () => {
      if (loadVersion !== this.loadVersion) return;
      if (this.stretchNode || this.stretchNodeReady) {
        await this.disposeStretchNode();
      }
    });
    if (loadVersion !== this.loadVersion) {
      this.disposePreflightMediaElement(media.element, media.url);
      return;
    }

    media.element.muted = false;
    media.element.volume = 1;
    media.element.defaultPlaybackRate = this.nativeFallbackRate;
    media.element.playbackRate = this.nativeFallbackRate;
    media.element.currentTime = 0;

    const sourceNode = ctx.createMediaElementSource(media.element);
    sourceNode.connect(this.playGainNode);

    media.element.onended = () => {
      if (this.mediaElement !== media.element) return;
      if (!this._isPlaying) return;
      this.stopPlayback(true, 'stream-ended');
      this.emitTransport();
    };
    media.element.onseeked = () => {
      if (this.mediaElement !== media.element || this._isPlaying) return;
      this.offsetAt = media.element.currentTime;
      this.emitTransport();
    };

    this.mediaElement = media.element;
    this.mediaSourceNode = sourceNode;
    this.mediaObjectUrl = media.url;
    this.setMediaElementPitchPreservation(true);
    this.playbackBackend = 'streamed';
    this.buffer = null;
    this.stretchEnabledForBuffer = false;
    this.stretchEnabledForStream = false;
    this.pitchShiftAvailable = false;
    this._pitchSemitones = 0;
    this._displayGain = 1;
    this._fileAnalysis = null;
    this._waveformPeaks = null;
    this._filename = displayFilename;
    this.offsetAt = 0;
    this.fileId++;

    this.performanceDiagnostics?.noteLoadSample({
      filename: displayFilename,
      totalMs: performance.now() - loadStartedAt,
      readMs,
      decodeMs,
      stretchMs,
      channels: 0,
      durationS: media.duration ?? 0,
      stretchEnabled: false,
    });

    this.emitTransport();
    void this.prepareStreamedPitchShift(loadVersion);
  }

  private cancelDeferredAnalysis(): void {
    if (this.deferredAnalysisCancel) {
      this.deferredAnalysisCancel();
      this.deferredAnalysisCancel = null;
    }
  }

  private scheduleDeferredBufferAnalysis(
    buffer: AudioBuffer,
    fileId: number,
    loadVersion: number,
  ): void {
    this.cancelDeferredAnalysis();

    const channelData = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
    const binSamples = AudioEngine.WAVEFORM_BIN_SAMPLES;
    const numBins = Math.ceil(buffer.length / binSamples);
    const peaks = new Float32Array(numBins * 2);
    let channelIndex = 0;
    let sampleIndex = 0;
    let peak = 0;
    let rmsSum = 0;
    let totalSamples = 0;
    let clipCount = 0;
    let cancelled = false;
    let timer: number | null = null;

    const finalize = (): void => {
      if (cancelled) return;
      const rms = totalSamples > 0 ? Math.sqrt(rmsSum / totalSamples) : 0;
      const peakDb = peak > 0 ? 20 * Math.log10(peak) : -100;
      const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;

      if (this.fileId !== fileId || loadVersion !== this.loadVersion || this.buffer !== buffer) {
        return;
      }

      this._displayGain = peak > 0.001 ? 0.95 / peak : 1;
      this._fileAnalysis = {
        crestFactorDb: peakDb - rmsDb,
        peakDb,
        rmsDb,
        clipCount,
        duration: buffer.duration,
        channels: buffer.numberOfChannels,
        decodedSampleRate: buffer.sampleRate,
        contextSampleRate: this.ctx?.sampleRate ?? buffer.sampleRate,
        fileId,
      };
      this._waveformPeaks = peaks;
      this.deferredAnalysisCancel = null;

      for (const fn of this.fileReadyListeners) {
        fn(this._fileAnalysis);
      }
    };

    const step = (): void => {
      timer = null;
      if (cancelled) return;

      const sliceStartedAt = performance.now();
      while (channelIndex < channelData.length) {
        const data = channelData[channelIndex];
        const end = Math.min(sampleIndex + DEFERRED_ANALYSIS_SAMPLE_BATCH, data.length);

        for (let sample = sampleIndex; sample < end; sample++) {
          const value = data[sample];
          const abs = Math.abs(value);
          if (abs > peak) peak = abs;
          rmsSum += value * value;
          totalSamples++;
          if (abs >= 0.9999) clipCount++;

          if (channelIndex === 0) {
            const bin = Math.floor(sample / binSamples);
            const peakIndex = bin * 2;
            if (value < peaks[peakIndex]) peaks[peakIndex] = value;
            if (value > peaks[peakIndex + 1]) peaks[peakIndex + 1] = value;
          }
        }

        sampleIndex = end;
        if (sampleIndex >= data.length) {
          channelIndex++;
          sampleIndex = 0;
        }

        if (performance.now() - sliceStartedAt >= DEFERRED_ANALYSIS_SLICE_MS) {
          timer = window.setTimeout(step, 0);
          return;
        }
      }

      finalize();
    };

    this.deferredAnalysisCancel = () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    timer = window.setTimeout(step, 0);
  }

  async load(file: File, displayFilename = file.name): Promise<void> {
    const ctx = this.ensureContext();
    const loadVersion = ++this.loadVersion;
    const loadStartedAt = performance.now();
    let readMs = 0;
    let decodeMs = 0;
    let stretchMs = 0;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (loadVersion !== this.loadVersion) return;

    this.clearSeekResume();
    this.clearScrubTimers();
    this.cancelDeferredAnalysis();
    this.disposeStreamedMedia();
    this.scrubActive = false;
    this.scrubResumeAfter = false;
    this.scrubPreviewRate = 1;
    this.scrubLastTarget = 0;
    this.scrubLastMoveAt = 0;
    this.stopPlayback(true, 'load');
    this._loopStart = null;
    this._loopEnd = null;
    this._playbackRate = 1;
    this._pitchSemitones = 0;
    this.buffer = null;
    this._filename = null;
    this.offsetAt = 0;
    this._displayGain = 1;
    this._fileAnalysis = null;
    this._waveformPeaks = null;
    this.stretchEnabledForBuffer = false;
    this.pitchShiftAvailable = true;
    this.playbackBackend = 'decoded';
    this.emitTransport();

    let preflightMedia: {
      readonly element: HTMLMediaElement;
      readonly url: string;
      readonly duration: number | null;
    } | null = null;

    if (this.shouldPreflightStreaming(file)) {
      try {
        preflightMedia = await this.createPreflightMediaElement(file);
        if (loadVersion !== this.loadVersion) {
          this.disposePreflightMediaElement(preflightMedia.element, preflightMedia.url);
          return;
        }
        if (this.shouldPreferStreamingLoad(file, preflightMedia.duration)) {
          await this.activateStreamedMediaLoad(
            displayFilename,
            preflightMedia,
            loadVersion,
            loadStartedAt,
            readMs,
            decodeMs,
            stretchMs,
          );
          return;
        }
      } catch {
        preflightMedia = null;
      }
    }

    let arrayBuffer: ArrayBuffer;
    try {
      const readStartedAt = performance.now();
      arrayBuffer = await file.arrayBuffer();
      readMs = performance.now() - readStartedAt;
    } catch (error) {
      const streamedMedia = preflightMedia ?? await this.createPreflightMediaElement(file).catch(() => null);
      if (streamedMedia) {
        await this.activateStreamedMediaLoad(
          displayFilename,
          streamedMedia,
          loadVersion,
          loadStartedAt,
          readMs,
          decodeMs,
          stretchMs,
        );
        return;
      }
      throw error;
    }
    if (loadVersion !== this.loadVersion) {
      if (preflightMedia) {
        this.disposePreflightMediaElement(preflightMedia.element, preflightMedia.url);
      }
      return;
    }

    if (preflightMedia) {
      this.disposePreflightMediaElement(preflightMedia.element, preflightMedia.url);
      preflightMedia = null;
    }

    let decodedBuffer: AudioBuffer;
    try {
      const decodeStartedAt = performance.now();
      decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
      decodeMs = performance.now() - decodeStartedAt;
    } catch (error) {
      const streamedMedia = await this.createPreflightMediaElement(file).catch(() => null);
      if (streamedMedia) {
        await this.activateStreamedMediaLoad(
          displayFilename,
          streamedMedia,
          loadVersion,
          loadStartedAt,
          readMs,
          decodeMs,
          stretchMs,
        );
        return;
      }
      throw error;
    }
    if (loadVersion !== this.loadVersion) return;

    const stretchStartedAt = performance.now();
    let stretchEnabledForBuffer = false;
    const stretchPrepBytes = this.estimateStretchPrepBytes(decodedBuffer);
    if (stretchPrepBytes > MAX_STRETCH_PREP_BYTES) {
      await this.runSerializedStretchMutation(async () => {
        if (loadVersion !== this.loadVersion) return;
        if (this.stretchNode || this.stretchNodeReady) {
          await this.disposeStretchNode();
        }
      });
    } else {
      await this.runSerializedStretchMutation(async () => {
        if (loadVersion !== this.loadVersion) return;
        try {
          const stretchNode = await this.ensureStretchNode(decodedBuffer.numberOfChannels);
          if (loadVersion !== this.loadVersion) return;
          await stretchNode.dropBuffers();
          if (loadVersion !== this.loadVersion) return;
          await stretchNode.addBuffers(this.prepareStretchBuffers(decodedBuffer));
          if (loadVersion !== this.loadVersion) return;
          stretchEnabledForBuffer = true;
        } catch {
          console.warn('stretch prep failed, native playback retained');
          if (loadVersion === this.loadVersion) {
            await this.disposeStretchNode();
          }
        }
      });
    }
    stretchMs = performance.now() - stretchStartedAt;
    if (loadVersion !== this.loadVersion) return;

    this.stretchEnabledForBuffer = stretchEnabledForBuffer;
    this.pitchShiftAvailable = stretchEnabledForBuffer;
    this.playbackBackend = 'decoded';
    this.buffer = decodedBuffer;
    this._filename = displayFilename;
    this.offsetAt = 0;
    this.fileId++;

    this.performanceDiagnostics?.noteLoadSample({
      filename: displayFilename,
      totalMs: performance.now() - loadStartedAt,
      readMs,
      decodeMs,
      stretchMs,
      channels: decodedBuffer.numberOfChannels,
      durationS: decodedBuffer.duration,
      stretchEnabled: stretchEnabledForBuffer,
    });

    this.emitTransport();

    const capturedFileId = this.fileId;
    this.scheduleDeferredBufferAnalysis(decodedBuffer, capturedFileId, loadVersion);
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
    if (this.streamedScrubCanStayLive) return;
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
    if (!this.scrubActive || (!this.buffer && !this.mediaElement)) return;
    if (this._isPlaying) {
      this.refreshScrubStopTimer();
      return;
    }

    this.scrubPreviewTimer = window.setTimeout(() => {
      this.scrubPreviewTimer = null;
      if (!this.scrubActive || (!this.buffer && !this.mediaElement)) return;

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
    if (this.streamedScrubCanStayLive) return false;
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

      if (this.stretchActive && this.stretchNode) {
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

      if (this.mediaElement) {
        this.invalidateStreamedPlayAttempt();
        this.mediaElement.pause();
      }
    }

    this.sourceNode = null;
    this.offsetAt = nextOffset;
    this.startedAt = 0;
    this._isPlaying = false;
    if (this.mediaElement && resetToStart) {
      this.mediaElement.currentTime = 0;
    }
    this.stopRaf();
  }

  play(): void {
    this.clearSeekResume();
    if (this._isPlaying || (!this.buffer && !this.mediaElement) || !this.playGainNode) {
      return;
    }

    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    if (this.mediaElement && this.playbackBackend === 'streamed') {
      const playAttemptId = ++this.streamedPlayAttemptId;
      const previewRate = this.scrubActive ? this.scrubPreviewRate : this.nativeFallbackRate;
      this.mediaElement.playbackRate = previewRate;
      this.setMediaElementPitchPreservation(!this.streamedPitchShiftActive);
      if (Math.abs(this.mediaElement.currentTime - this.offsetAt) > 0.05) {
        this.mediaElement.currentTime = this.offsetAt;
      }
      const outputTime = this.streamedPitchShiftActive ? ctx.currentTime + this.stretchLatency : ctx.currentTime;
      this.rampPlayGain(1, DECLICK_IN_S, outputTime);
      this.startedAt = outputTime;
      this._isPlaying = true;
      this.playId++;
      this.startRaf();
      this.emitTransport();
      if (this.streamedPitchShiftActive && this.stretchNode) {
        const schedule = this.buildStreamedPitchSchedule(outputTime);
        void this.stretchNode.start(schedule).catch((error) => {
          console.error('streamed pitch start failed, native playback retained', error);
          if (this.playbackBackend !== 'streamed' || !this.mediaElement) return;
          const wasPlaying = this._isPlaying;
          const resumeAt = this.currentTime;
          this.stopPlayback(false, 'stream-pitch-fallback');
          this.offsetAt = resumeAt;
          void this.setStreamedPitchShiftEnabled(false).then(() => {
            this.pitchShiftAvailable = false;
            this._pitchSemitones = 0;
            this.emitTransport();
            if (wasPlaying) this.play();
          });
        });
      }
      void this.mediaElement.play().catch((error) => {
        const staleAttempt = playAttemptId !== this.streamedPlayAttemptId;
        if (staleAttempt) {
          return;
        }
        if (this.isBenignStreamedPlayInterruption(error)) {
          return;
        }
        if (this.mediaElement) {
          this.offsetAt = this.mediaElement.currentTime;
        }
        this._isPlaying = false;
        this.stopRaf();
        this.emitTransport();
        console.error('streamed media play failed', error);
      });
      return;
    }

    const useNativeScrubPreview = this.scrubActive && this.scrubConfig.preferNative;

    if (this.stretchEnabledForBuffer && this.stretchNode && !useNativeScrubPreview) {
      const outputTime = ctx.currentTime + this.stretchLatency;
      const scheduledOffset = this.offsetAt;
      const playAttemptId = this.playId + 1;
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
      this.playId++;
      this.startRaf();
      this.emitTransport();

      void this.stretchNode.start(schedule).catch((error) => {
        console.error('stretch start failed, falling back to native playback', error);
        if (playAttemptId !== this.playId || !this._isPlaying || !this.stretchEnabledForBuffer) return;
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
    this.cancelDeferredAnalysis();
    this.scrubActive = false;
    this.scrubResumeAfter = false;
    this.scrubPreviewRate = 1;
    this.scrubLastTarget = 0;
    this.scrubLastMoveAt = 0;
    this.stopPlayback(true, 'stop');
    this.emitTransport();
  }

  reset(): void {
    this.loadVersion++;
    this.clearSeekResume();
    this.clearScrubTimers();
    this.cancelDeferredAnalysis();
    this.scrubActive = false;
    this.scrubResumeAfter = false;
    this.scrubPreviewRate = 1;
    this.scrubLastTarget = 0;
    this.scrubLastMoveAt = 0;
    this.stopPlayback(true, 'reset');
    this.buffer = null;
    this._filename = null;
    this.fileId++;
    this._displayGain = 1;
    this._fileAnalysis = null;
    this._waveformPeaks = null;
    this._loopStart = null;
    this._loopEnd = null;
    this.playbackBackend = 'decoded';

    if (this.stretchNode) {
      this.queueStretchCommand(this.stretchNode.dropBuffers(), 'dropBuffers');
    }

    this.disposeStreamedMedia();

    this.emitTransport();
    for (const fn of this.resetListeners) {
      fn();
    }
  }

  dispose(): void {
    this.loadVersion++;
    this.playId++;
    this.clearSeekResume();
    this.clearScrubTimers();
    this.cancelDeferredAnalysis();
    this.scrubActive = false;
    this.scrubResumeAfter = false;
    this.scrubPreviewRate = 1;
    this.scrubLastTarget = 0;
    this.scrubLastMoveAt = 0;
    this.stopPlayback(true, 'dispose');
    this.disposeStreamedMedia();

    const ctx = this.ctx;
    const masterGain = this.masterGain;
    const playGainNode = this.playGainNode;
    const streamedPitchInputNode = this.streamedPitchInputNode;
    const splitterNode = this.splitterNode;
    const analyserL = this.analyserL;
    const analyserR = this.analyserR;

    this.transportListeners.clear();
    this.resetListeners.clear();
    this.fileReadyListeners.clear();
    this.buffer = null;
    this._filename = null;
    this._fileAnalysis = null;
    this._waveformPeaks = null;
    this._loopStart = null;
    this._loopEnd = null;
    this.playbackBackend = 'decoded';
    this.masterGain = null;
    this.playGainNode = null;
    this.streamedPitchInputNode = null;
    this.splitterNode = null;
    this.analyserL = null;
    this.analyserR = null;
    this.sourceNode = null;
    this.ctx = null;

    for (const node of [splitterNode, streamedPitchInputNode, playGainNode, masterGain, analyserL, analyserR]) {
      if (!node) continue;
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
    }

    void this.runSerializedStretchMutation(async () => {
      await this.disposeStretchNode();
      if (ctx && ctx.state !== 'closed') {
        await ctx.close().catch(() => {});
      }
    });
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
    if (!this.buffer && !this.mediaElement) return;

    const pendingResume = this.seekResumePending;
    this.clearSeekResume();
    if (!this.scrubActive) {
      this.scrubResumeAfter = this._isPlaying || pendingResume;
    }

    this.clearScrubTimers();
    if (this._isPlaying && !this.streamedScrubCanStayLive) {
      this.stopPlayback(false, 'scrub-begin');
    }

    this.scrubLastTarget = this.currentTime;
    this.scrubLastMoveAt = 0;
    this.scrubPreviewRate = 1;
    this.scrubActive = true;
    this.emitTransport();
  }

  scrubTo(seconds: number): void {
    if (!this.buffer && !this.mediaElement) return;
    if (!this.scrubActive) {
      this.beginScrub();
    }

    const nextOffset = Math.max(0, Math.min(seconds, this.duration));
    this.updateScrubPreviewRate(nextOffset);
    const shouldRestart = this.shouldRestartScrubPreview(nextOffset);

    this.clearScrubTimers();
    if (this._isPlaying && shouldRestart) {
      this.stopPlayback(false, 'scrub-shift');
    }

    this.offsetAt = nextOffset;
    if (this.mediaElement) {
      this.mediaElement.currentTime = nextOffset;
    }
    this.emitTransport();

    if (this._isPlaying && !shouldRestart) {
      if (this.mediaElement) {
        this.mediaElement.playbackRate = this.scrubPreviewRate;
        this.setMediaElementPitchPreservation(!this.streamedPitchShiftActive);
        if (this.streamedPitchShiftActive) {
          this.scheduleStreamedPitchUpdate(undefined, 'stream-scrub');
        }
      }
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
    const keepContinuousPlayback = this.streamedScrubCanStayLive && this._isPlaying && shouldResume;
    if (this._isPlaying && !keepContinuousPlayback) {
      this.stopPlayback(false, 'scrub-end');
    }

    this.offsetAt = resumeAt;
    this.scrubActive = false;
    this.scrubResumeAfter = false;
    this.scrubPreviewRate = 1;
    this.scrubLastMoveAt = 0;
    this.scrubLastTarget = resumeAt;

    if (keepContinuousPlayback && this.mediaElement) {
      this.mediaElement.currentTime = resumeAt;
      this.mediaElement.defaultPlaybackRate = this.nativeFallbackRate;
      this.mediaElement.playbackRate = this.nativeFallbackRate;
      this.setMediaElementPitchPreservation(!this.streamedPitchShiftActive);
      if (this.streamedPitchShiftActive) {
        this.scheduleStreamedPitchUpdate(undefined, 'stream-scrub-end');
      }
      if (this.ctx) {
        this.startedAt = this.ctx.currentTime;
      }
      this.offsetAt = resumeAt;
      this.emitTransport();
      return;
    }

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
    if (this.mediaElement) {
      this.mediaElement.currentTime = this.offsetAt;
      if (resumeAfterSeek) {
        this.mediaElement.playbackRate = this.nativeFallbackRate;
      }
    }
    this.emitTransport();

    if (resumeAfterSeek) {
      this.scheduleSeekResume();
    }
  }

  get currentTime(): number {
    if (this.scrubActive) return this.scrubLastTarget;
    if (this.mediaElement) {
      if (this.streamedPitchShiftActive) {
        return this.playbackHeadTime;
      }
      return this._isPlaying ? this.mediaElement.currentTime : this.offsetAt;
    }
    if (!this.ctx) return 0;
    if (!this._isPlaying) return this.offsetAt;
    return this.playbackHeadTime;
  }

  get duration(): number {
    if (this.buffer) return this.buffer.duration;
    if (this.mediaElement) {
      return Number.isFinite(this.mediaElement.duration) ? this.mediaElement.duration : 0;
    }
    return 0;
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
    if (this.rafId !== null || this.intervalId !== null) return;
    this.lastAnalysisAt = 0;
    this.attachVisibilityHandler();
    this.resumeLoop();
  }

  private resumeLoop(): void {
    if (document.hidden) {
      // Background: use setInterval so the loop keeps running while unfocused.
      // Watchdog is skipped — AudioContext may be suspended and stretchLastProgressAt
      // won't update, so checking it would produce false positives on resume.
      if (this.intervalId === null) {
        this.intervalId = setInterval(() => {
          const now = performance.now();
          if (this.lastAnalysisAt !== 0 && now - this.lastAnalysisAt < ANALYSIS_FRAME_MS) return;
          this.lastAnalysisAt = now;
          this.extractFrame();
          if (this.scrubActive) return;
          if (this._isPlaying && this._loopStart !== null && this._loopEnd !== null && this.currentTime >= this._loopEnd) {
            this.seek(this._loopStart);
            return;
          }
          if (this._isPlaying && this._loopStart === null && this.currentTime >= this.duration) {
            this.stopPlayback(true, 'ended');
            this.emitTransport();
          }
        }, ANALYSIS_FRAME_MS);
      }
      return;
    }

    // Foreground: use RAF for smooth panel rendering.
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

        if (this._isPlaying && this.stretchEnabledForBuffer && this.ctx) {
          if (
            this.ctx.currentTime > this.startedAt + STRETCH_WATCHDOG_GRACE_S &&
            this.ctx.currentTime - this.stretchLastProgressAt > STRETCH_WATCHDOG_TIMEOUT_S
          ) {
            this.fallbackToNativePlayback('watchdog');
            return;
          }
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

  private attachVisibilityHandler(): void {
    if (this.onVisibilityChange !== null) return;
    this.onVisibilityChange = () => {
      const loopRunning = this.rafId !== null || this.intervalId !== null;
      if (!loopRunning) return;

      if (document.hidden) {
        // Switch from RAF to interval
        if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
        this.resumeLoop();
      } else {
        // Switch from interval back to RAF; also resume AudioContext if suspended
        if (this.ctx?.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        if (this.intervalId !== null) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
        this.resumeLoop();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.onVisibilityChange !== null) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
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

    // Phase correlation: r = Σ(L·R) / √(Σ(L²)·Σ(R²))
    // Reuses peak/rms loop accumulators for L²/R² sums
    let sumLR = 0;
    const sumL2 = rmsL * rmsL * tdL.length; // rmsL² × N = Σ(L²)
    const sumR2 = rmsR * rmsR * tdR.length;
    for (let i = 0; i < tdL.length; i++) {
      sumLR += tdL[i] * tdR[i];
    }
    const corrDenom = Math.sqrt(sumL2 * sumR2);
    const phaseCorrelation = corrDenom > 0 ? sumLR / corrDenom : 0;

    // Zero-copy: pass pre-allocated analyser buffers directly.
    // Safe because frameBus.publish() is synchronous — all subscribers
    // read array data during the callback, before the next extractFrame()
    // overwrites these buffers. Do NOT store these arrays across frames.
    const frame: AudioFrame = {
      currentTime: this.currentTime,
      timeDomain: tdL,
      timeDomainRight: tdR,
      frequencyDb: this.frequencyData,
      frequencyDbRight: this.frequencyDataR,
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
      phaseCorrelation,
    };

    this.frameBus.publish(frame);
  }

  setVolume(v: number): void {
    const nextVolume = Math.max(0, Math.min(1, v));
    if (Math.abs(nextVolume - this._volume) < 0.0001) return;
    this._volume = nextVolume;
    if (this.masterGain) {
      this.masterGain.gain.value = this._volume;
    }
    this.emitTransport();
  }

  setPlaybackRate(r: number): void {
    const nextRate = Math.max(RATE_MIN, Math.min(RATE_MAX, r));
    if (Math.abs(nextRate - this._playbackRate) < 0.0001) return;

    this.rebasePlaybackClock();
    this._playbackRate = nextRate;
    if (this.stretchEnabledForBuffer) {
      this.scheduleStretchUpdate();
    }
    if (this.mediaElement) {
      const activeRate = this.scrubActive ? this.scrubPreviewRate : this.nativeFallbackRate;
      this.mediaElement.defaultPlaybackRate = this.nativeFallbackRate;
      this.mediaElement.playbackRate = activeRate;
      this.setMediaElementPitchPreservation(!this.streamedPitchShiftActive);
      if (this._isPlaying) {
        this.scheduleStreamedPitchUpdate(undefined, 'stream-rate');
      }
    } else if (this.sourceNode) {
      this.sourceNode.playbackRate.value = this.scrubActive ? this.scrubPreviewRate : this.nativeFallbackRate;
    }
    this.emitTransport();
  }

  setPitchSemitones(semitones: number): void {
    const nextPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, semitones));
    if (Math.abs(nextPitch - this._pitchSemitones) < 0.0001) return;

    if (this.playbackBackend === 'streamed' && this.mediaElement) {
      const shouldEnableStreamPitch = Math.abs(nextPitch) > 0.0001;
      this._pitchSemitones = nextPitch;

      if (!shouldEnableStreamPitch) {
        if (!this.stretchEnabledForStream) {
          this.emitTransport();
          return;
        }
        const wasPlaying = this._isPlaying;
        const resumeAt = this.currentTime;
        if (wasPlaying) {
          this.stopPlayback(false, 'stream-pitch-off');
        }
        this.offsetAt = resumeAt;
        void this.setStreamedPitchShiftEnabled(false).then(() => {
          this._pitchSemitones = 0;
          this.emitTransport();
          if (wasPlaying) this.play();
        });
        return;
      }

      if (!this.stretchEnabledForStream) {
        const wasPlaying = this._isPlaying;
        const resumeAt = this.currentTime;
        if (!wasPlaying) {
          this.offsetAt = resumeAt;
        }
        const enablePitch = wasPlaying
          ? this.enableStreamedPitchShiftLive()
          : this.setStreamedPitchShiftEnabled(true);
        void enablePitch.then((enabled) => {
          if (!enabled) {
            this._pitchSemitones = 0;
            this.emitTransport();
            return;
          }
          this.emitTransport();
          if (!wasPlaying) this.play();
        });
        return;
      }

      if (this._isPlaying) {
        this.scheduleStreamedPitchUpdate(undefined, 'stream-pitch');
      }
      this.emitTransport();
      return;
    }

    if (!this.pitchShiftAvailable) return;

    if (!this.stretchEnabledForBuffer) {
      this.rebasePlaybackClock();
    }
    this._pitchSemitones = nextPitch;
    if (this.stretchEnabledForBuffer) {
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
  get volume(): number { return this._volume; }
  get playbackRate(): number { return this._playbackRate; }
  get pitchSemitones(): number { return this._pitchSemitones; }
  get scrubStyle(): ScrubStyle { return this._scrubStyle; }
  get analysisFps(): number { return ANALYSIS_FPS; }
  get fileAnalysis(): FileAnalysis | null { return this._fileAnalysis; }
  get audioBuffer(): AudioBuffer | null { return this.buffer; }
  get displayGain(): number { return this._displayGain; }
  get waveformPeaks(): Float32Array | null { return this._waveformPeaks; }
  get waveformBinSamples(): number { return AudioEngine.WAVEFORM_BIN_SAMPLES; }
  get sampleRate(): number { return this.ctx?.sampleRate ?? 44100; }
  get backendMode(): 'decoded' | 'streamed' { return this.playbackBackend; }
  createStreamedOverviewProbe(): StreamedOverviewProbe | null {
    if (this.playbackBackend !== 'streamed' || !this.mediaObjectUrl || !this.mediaElement) return null;

    const ctx = this.ensureContext();
    const element = this.mediaElement instanceof HTMLVideoElement
      ? document.createElement('video')
      : new Audio();
    element.preload = 'auto';
    element.src = this.mediaObjectUrl;
    element.crossOrigin = 'anonymous';
    element.defaultPlaybackRate = 1;
    element.playbackRate = 1;
    element.defaultMuted = true;
    element.muted = true;

    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
    }

    const source = ctx.createMediaElementSource(element);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = STREAMED_OVERVIEW_PROBE_FFT_SIZE;
    analyser.smoothingTimeConstant = 0.08;
    analyser.minDecibels = CANVAS.dbMin;
    analyser.maxDecibels = CANVAS.dbMax;

    const sink = ctx.createGain();
    sink.gain.value = 0;

    source.connect(analyser);
    analyser.connect(sink);
    sink.connect(ctx.destination);

    const timeDomain = new Float32Array(analyser.fftSize);

    return {
      element,
      analyser,
      timeDomain,
      dispose: () => {
        element.pause();
        element.removeAttribute('src');
        element.load();
        try {
          source.disconnect();
        } catch {
          // Already disconnected.
        }
        try {
          analyser.disconnect();
        } catch {
          // Already disconnected.
        }
        try {
          sink.disconnect();
        } catch {
          // Already disconnected.
        }
      },
    };
  }

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

  private createTransportState(): TransportState {
    return {
      isPlaying: this._isPlaying && !this.scrubActive,
      currentTime: this.currentTime,
      duration: this.duration,
      filename: this._filename,
      volume: this._volume,
      playbackBackend: this.playbackBackend,
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
