import { AudioEngine, type StreamedOverviewProbe } from '../audio/engine';
import type { FrameBus } from '../audio/frameBus';
import type { PerformanceProfileSnapshot, PerformanceProfileStore } from './performanceProfile';
import type { AudioFrame, FileAnalysis, TransportState, WaveformConfidence, WaveformLevel } from '../types';

type Listener = () => void;

interface ViewRange {
  readonly start: number;
  readonly end: number;
}

interface DecodedBuildTask {
  readonly startBin: number;
  readonly endBin: number;
  readonly foreground: boolean;
}

interface StreamedScoutTarget {
  readonly levelIndex: number;
  readonly colStart: number;
  readonly colEnd: number;
  readonly timeStart: number;
  readonly timeEnd: number;
  readonly time: number;
  readonly foreground: boolean;
  readonly requiredConfidence: WaveformConfidence;
}

const CLIP_THRESHOLD = 0.9999;
const STREAMED_SCOUT_READY_TIMEOUT_MS = 1800;
const STREAMED_SCOUT_SAMPLE_WINDOW_MS = 110;
const STREAMED_IDLE_DELAY_MS = 24;
const DECODED_CHUNK_BINS = 128;

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeRange(start: number, end: number, duration: number): ViewRange {
  const boundedStart = clampNumber(start, 0, duration);
  const boundedEnd = clampNumber(end, boundedStart, duration);
  return { start: boundedStart, end: boundedEnd };
}

function buildSourceKey(transport: TransportState): string | null {
  if (!transport.filename || !Number.isFinite(transport.duration) || transport.duration <= 0) {
    return null;
  }
  return `${transport.playbackBackend}:${transport.filename}:${transport.duration.toFixed(3)}`;
}

function buildBisectionSlots(count: number): number[] {
  const slots: number[] = [];
  const queue: Array<[number, number]> = [[0, count - 1]];
  while (queue.length > 0 && slots.length < count) {
    const [lo, hi] = queue.shift()!;
    const mid = lo + Math.floor((hi - lo) / 2);
    slots.push(mid);
    if (lo < mid) queue.push([lo, mid - 1]);
    if (mid < hi) queue.push([mid + 1, hi]);
  }
  return slots;
}

function createWaveformLevel(binCount: number): WaveformLevel {
  return {
    binCount,
    min: new Float32Array(binCount),
    max: new Float32Array(binCount),
    rms: new Float32Array(binCount),
    clipDensity: new Float32Array(binCount),
    confidence: new Uint8Array(binCount),
  };
}

function createLevelChain(baseBinCount: number): WaveformLevel[] {
  const levels: WaveformLevel[] = [];
  let binCount = Math.max(1, baseBinCount);
  while (binCount >= 1) {
    levels.push(createWaveformLevel(binCount));
    if (binCount === 1) break;
    binCount = Math.max(1, Math.ceil(binCount / 2));
  }
  return levels;
}

function computePeakAbs(level: WaveformLevel, index: number): number {
  return Math.max(Math.abs(level.min[index]), Math.abs(level.max[index]));
}

function coverageRatioInLevel(
  level: WaveformLevel | null,
  start: number,
  end: number,
  duration: number,
  minimumConfidence: WaveformConfidence = 1,
): number {
  if (!level || level.binCount === 0 || duration <= 0) return 0;
  const clamped = normalizeRange(start, end, duration);
  if (clamped.end <= clamped.start) return 0;
  const indexStart = Math.max(0, Math.floor((clamped.start / duration) * level.binCount));
  const indexEnd = Math.min(level.binCount - 1, Math.max(indexStart, Math.ceil((clamped.end / duration) * level.binCount) - 1));
  let covered = 0;
  let total = 0;
  for (let index = indexStart; index <= indexEnd; index++) {
    total++;
    if (level.confidence[index] >= minimumConfidence) covered++;
  }
  return total > 0 ? covered / total : 0;
}

function pickLevelIndexForTargetBins(levels: readonly WaveformLevel[], targetBins: number): number {
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  const safeTarget = Math.max(1, targetBins);
  for (let index = 0; index < levels.length; index++) {
    const score = Math.abs(Math.log2(Math.max(1, levels[index]!.binCount) / safeTarget));
    if (score < bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex;
}

function seekMediaElement(element: HTMLMediaElement, time: number, timeoutMs: number): Promise<void> {
  if (!Number.isFinite(time) || time < 0) return Promise.resolve();
  if (Math.abs(element.currentTime - time) <= 0.025) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;

    const cleanup = () => {
      element.removeEventListener('seeked', onDone);
      element.removeEventListener('error', onDone);
      if (timer) window.clearTimeout(timer);
    };

    const onDone = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    timer = window.setTimeout(onDone, timeoutMs);
    element.addEventListener('seeked', onDone, { once: true });
    element.addEventListener('error', onDone, { once: true });
    element.currentTime = time;
  });
}

function waitForMediaReadyState(element: HTMLMediaElement, timeoutMs: number): Promise<void> {
  if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;

    const cleanup = () => {
      element.removeEventListener('loadeddata', onReady);
      element.removeEventListener('canplay', onReady);
      element.removeEventListener('error', onReady);
      if (timer) window.clearTimeout(timer);
    };

    const onReady = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    timer = window.setTimeout(onReady, timeoutMs);
    element.addEventListener('loadeddata', onReady, { once: true });
    element.addEventListener('canplay', onReady, { once: true });
    element.addEventListener('error', onReady, { once: true });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildRangeTargets(
  cols: number,
  duration: number,
  start: number,
  end: number,
  targetCount: number,
  foreground: boolean,
  levelIndex: number,
  requiredConfidence: WaveformConfidence,
): StreamedScoutTarget[] {
  if (cols <= 0 || duration <= 0 || targetCount <= 0) return [];
  const clamped = normalizeRange(start, end, duration);
  const span = clamped.end - clamped.start;
  if (span <= 0) return [];

  const slots = buildBisectionSlots(targetCount);
  return slots.map((slot) => {
    const timeStart = clamped.start + (slot / targetCount) * span;
    const timeEnd = clamped.start + ((slot + 1) / targetCount) * span;
    const colStart = Math.max(0, Math.min(cols - 1, Math.floor((timeStart / duration) * cols)));
    const colEnd = Math.max(colStart, Math.min(cols - 1, Math.ceil((timeEnd / duration) * cols) - 1));
    return {
      levelIndex,
      colStart,
      colEnd,
      timeStart,
      timeEnd,
      time: timeStart + (timeEnd - timeStart) / 2,
      foreground,
      requiredConfidence,
    };
  });
}

function targetNeedsSample(levels: readonly WaveformLevel[], target: StreamedScoutTarget): boolean {
  const level = levels[target.levelIndex] ?? null;
  if (!level) return true;
  for (let index = target.colStart; index <= target.colEnd; index++) {
    if (level.confidence[index] < target.requiredConfidence) {
      return true;
    }
  }
  return false;
}

function shouldThrottleStreamedScout(transport: TransportState): boolean {
  if (transport.scrubActive) return true;
  if (!transport.isPlaying) return false;
  return Math.abs(transport.playbackRate - 1) > 0.15 || transport.pitchSemitones !== 0;
}

export class WaveformPyramidStore {
  private listeners = new Set<Listener>();
  private version = 0;
  private readonly audioEngine: AudioEngine;

  private profile: PerformanceProfileSnapshot;
  private transport: TransportState = {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    filename: null,
    volume: 1,
    playbackBackend: 'decoded',
    scrubActive: false,
    playbackRate: 1,
    pitchSemitones: 0,
    pitchShiftAvailable: true,
    loopStart: null,
    loopEnd: null,
  };

  private levels: WaveformLevel[] = [];
  private sourceKey: string | null = null;
  private fileId = -1;
  private peakNormalizer = 1;
  private observedPeakMax = 0;
  private currentView: ViewRange = { start: 0, end: 0 };
  private selectedRange: ViewRange | null = null;
  private lastFrameTime: number | null = null;

  private decodedQueueForeground: DecodedBuildTask[] = [];
  private decodedQueueBackground: DecodedBuildTask[] = [];
  private decodedTimer: number | null = null;

  private streamedRunToken = 0;
  private streamedScoutCancel: (() => void) | null = null;

  private readonly unsubscribeTransport: () => void;
  private readonly unsubscribeFileReady: () => void;
  private readonly unsubscribeReset: () => void;
  private readonly unsubscribeProfile: () => void;
  private readonly unsubscribeFrameBus: () => void;

  constructor(
    frameBus: FrameBus,
    audioEngine: AudioEngine,
    performanceProfileStore: PerformanceProfileStore,
  ) {
    this.audioEngine = audioEngine;
    this.profile = performanceProfileStore.getSnapshot();

    this.unsubscribeTransport = audioEngine.onTransport((transport) => {
      this.handleTransport(transport);
    });
    this.unsubscribeFileReady = audioEngine.onFileReady((analysis) => {
      this.handleFileReady(analysis);
    });
    this.unsubscribeReset = audioEngine.onReset(() => {
      this.reset();
      this.emit();
    });
    this.unsubscribeProfile = performanceProfileStore.subscribe(() => {
      this.handleProfileChange(performanceProfileStore.getSnapshot());
    });
    this.unsubscribeFrameBus = frameBus.subscribe((frame) => {
      this.handleFrame(frame);
    });
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): number => {
    return this.version;
  };

  destroy(): void {
    this.cancelDecodedBuild();
    this.cancelStreamedScout();
    this.unsubscribeTransport();
    this.unsubscribeFileReady();
    this.unsubscribeReset();
    this.unsubscribeProfile();
    this.unsubscribeFrameBus();
    this.listeners.clear();
  }

  get currentSourceKey(): string | null {
    return this.sourceKey;
  }

  get currentDuration(): number {
    return this.transport.duration;
  }

  get currentBackendMode(): TransportState['playbackBackend'] {
    return this.transport.playbackBackend;
  }

  get currentFileId(): number {
    return this.fileId;
  }

  get currentLevels(): readonly WaveformLevel[] {
    return this.levels;
  }

  get learnedRatio(): number {
    const finest = this.levels[0];
    if (!finest || finest.binCount === 0) return 0;
    let learned = 0;
    for (let index = 0; index < finest.binCount; index++) {
      if (finest.confidence[index] > 0) learned++;
    }
    return learned / finest.binCount;
  }

  get displayPeakNormalizer(): number {
    return this.peakNormalizer;
  }

  get currentViewRange(): ViewRange {
    return this.currentView;
  }

  setViewRange(range: ViewRange): void {
    if (this.transport.duration <= 0) {
      this.currentView = { start: 0, end: 0 };
      return;
    }
    const next = normalizeRange(range.start, range.end, this.transport.duration);
    if (next.start === this.currentView.start && next.end === this.currentView.end) {
      return;
    }
    this.currentView = next;
    if (this.transport.playbackBackend === 'decoded') {
      this.rebuildDecodedQueue();
    } else {
      this.scheduleStreamedScout();
    }
    this.emit();
  }

  setSelectedRange(range: ViewRange | null): void {
    const next = range && this.transport.duration > 0
      ? normalizeRange(range.start, range.end, this.transport.duration)
      : null;
    if (
      (!next && !this.selectedRange)
      || (next && this.selectedRange && next.start === this.selectedRange.start && next.end === this.selectedRange.end)
    ) {
      return;
    }
    this.selectedRange = next;
    if (this.transport.playbackBackend === 'decoded') {
      this.rebuildDecodedQueue();
    } else {
      this.scheduleStreamedScout();
    }
  }

  pickOverviewLevel(): WaveformLevel | null {
    if (this.levels.length === 0) return null;
    const target = this.profile.waveform.sessionMapTargetBins;
    let best: WaveformLevel | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const level of this.levels) {
      const exactCoverage = coverageRatioInLevel(level, 0, this.transport.duration, this.transport.duration, 2);
      const learnedCoverage = coverageRatioInLevel(level, 0, this.transport.duration, this.transport.duration, 1);
      if (learnedCoverage <= 0) continue;
      const binScore = Math.abs(Math.log2(Math.max(1, level.binCount) / Math.max(1, target)));
      const coveragePenalty = exactCoverage > 0
        ? (1 - exactCoverage) * 1.8
        : 2.5 + (1 - learnedCoverage) * 0.35;
      const score = binScore + coveragePenalty;
      if (score < bestScore) {
        best = level;
        bestScore = score;
      }
    }
    return best ?? this.levels[this.levels.length - 1] ?? null;
  }

  pickDetailLevel(start: number, end: number, pixelWidth: number, preferExactCoverage = false): WaveformLevel | null {
    if (this.levels.length === 0 || this.transport.duration <= 0 || pixelWidth <= 0) return null;
    const span = Math.max(0.001, end - start);
    let best: WaveformLevel | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const level of this.levels) {
      const visibleBins = (level.binCount * span) / this.transport.duration;
      const binsPerPixel = visibleBins / Math.max(1, pixelWidth);
      const densityScore = binsPerPixel < 1
        ? 1 - binsPerPixel
        : binsPerPixel > 4
          ? binsPerPixel - 4
          : Math.abs(2 - binsPerPixel) * 0.35;
      const learnedCoverage = coverageRatioInLevel(level, start, end, this.transport.duration, 1);
      if (learnedCoverage <= 0) continue;
      const exactCoverage = coverageRatioInLevel(level, start, end, this.transport.duration, 2);
      const coveragePenalty = preferExactCoverage
        ? exactCoverage > 0
          ? (1 - exactCoverage) * 1.2
          : 2 + (1 - learnedCoverage) * 0.25
        : (1 - learnedCoverage) * 0.5;
      const score = densityScore + coveragePenalty;
      if (score < bestScore) {
        best = level;
        bestScore = score;
      }
    }

    return best ?? this.levels[0] ?? null;
  }

  pickScaffoldLevel(start: number, end: number, pixelWidth: number, detailLevel: WaveformLevel | null): WaveformLevel | null {
    if (!detailLevel || this.levels.length === 0) return null;
    const detailIndex = this.levels.indexOf(detailLevel);
    if (detailIndex < 0) return null;

    const detailCoverage = coverageRatioInLevel(detailLevel, start, end, this.transport.duration);
    let best: WaveformLevel | null = null;
    let bestCoverage = detailCoverage;

    for (let index = detailIndex + 1; index < this.levels.length; index++) {
      const level = this.levels[index];
      const coverage = coverageRatioInLevel(level, start, end, this.transport.duration);
      if (coverage <= bestCoverage + 0.12) continue;
      const visibleBins = (level.binCount * Math.max(0.001, end - start)) / Math.max(0.001, this.transport.duration);
      if (visibleBins / Math.max(1, pixelWidth) < 0.2) continue;
      best = level;
      bestCoverage = coverage;
    }

    return best;
  }

  coverageRatio(level: WaveformLevel | null, start: number, end: number, minimumConfidence: WaveformConfidence = 1): number {
    return coverageRatioInLevel(level, start, end, this.transport.duration, minimumConfidence);
  }

  shouldUseSampleView(start: number, end: number, pixelWidth: number): boolean {
    const buffer = this.audioEngine.audioBuffer;
    if (!buffer || this.transport.playbackBackend !== 'decoded') return false;
    const span = Math.max(0, end - start);
    if (span <= 0 || span > this.profile.waveform.sampleViewMaxVisibleSpanS) return false;
    const visibleSamples = span * buffer.sampleRate;
    return visibleSamples / Math.max(1, pixelWidth) <= 10;
  }

  private handleProfileChange(nextProfile: PerformanceProfileSnapshot): void {
    if (nextProfile.activeProfile === this.profile.activeProfile) {
      return;
    }
    this.profile = nextProfile;
    if (!this.sourceKey) {
      this.emit();
      return;
    }

    const transport = this.transport;
    this.reset();
    this.transport = transport;
    this.initializeForTransport(transport);
    this.emit();
  }

  private handleTransport(transport: TransportState): void {
    const nextKey = buildSourceKey(transport);
    const sourceChanged = nextKey !== this.sourceKey;
    this.transport = transport;

    if (transport.duration > 0 && this.currentView.end <= this.currentView.start) {
      this.currentView = { start: 0, end: Math.min(transport.duration, Math.max(3, transport.duration * 0.16)) };
    }

    if (sourceChanged) {
      this.reset();
      this.transport = transport;
      this.initializeForTransport(transport);
      this.emit();
      return;
    }

    if (transport.playbackBackend === 'decoded') {
      this.peakNormalizer = this.audioEngine.displayGain > 0 ? this.audioEngine.displayGain : 1;
      this.rebuildDecodedQueue();
    } else if (this.observedPeakMax > 0) {
      this.peakNormalizer = 1 / this.observedPeakMax;
      this.scheduleStreamedScout();
    }
  }

  private handleFileReady(analysis: FileAnalysis): void {
    this.fileId = analysis.fileId;
    if (this.transport.playbackBackend !== 'decoded' || !this.sourceKey) {
      return;
    }
    this.peakNormalizer = this.audioEngine.displayGain > 0 ? this.audioEngine.displayGain : 1;
    if (this.levels.length === 0) {
      this.initializeForTransport(this.transport);
    } else {
      this.rebuildDecodedQueue();
    }
    this.emit();
  }

  private handleFrame(frame: AudioFrame): void {
    this.fileId = frame.fileId;
    if (this.transport.playbackBackend !== 'streamed' || this.transport.duration <= 0 || this.levels.length === 0) {
      return;
    }

    const duration = Math.max(0.001, this.transport.duration);
    const baseLevel = this.levels[0];
    const currentBin = Math.max(0, Math.min(baseLevel.binCount - 1, Math.round((frame.currentTime / duration) * (baseLevel.binCount - 1))));
    let startBin = currentBin;
    let endBin = currentBin;

    if (this.lastFrameTime !== null) {
      const previousBin = Math.max(0, Math.min(baseLevel.binCount - 1, Math.round((this.lastFrameTime / duration) * (baseLevel.binCount - 1))));
      if (Math.abs(currentBin - previousBin) <= 96) {
        startBin = Math.min(previousBin, currentBin);
        endBin = Math.max(previousBin, currentBin);
      }
    }

    const startTime = (startBin / Math.max(1, baseLevel.binCount - 1)) * duration;
    const endTime = ((endBin + 1) / baseLevel.binCount) * duration;
    this.mergeProxyTimeDomainRange(startTime, endTime, frame.timeDomain);
    this.lastFrameTime = frame.currentTime;
  }

  private initializeForTransport(transport: TransportState): void {
    this.sourceKey = buildSourceKey(transport);
    if (!this.sourceKey) {
      this.levels = [];
      return;
    }

    this.levels = createLevelChain(this.profile.waveform.detailTargetBins);
    this.peakNormalizer = transport.playbackBackend === 'decoded'
      ? (this.audioEngine.displayGain > 0 ? this.audioEngine.displayGain : 1)
      : 1;

    if (transport.playbackBackend === 'decoded' && this.audioEngine.audioBuffer) {
      this.rebuildDecodedQueue();
    } else if (transport.playbackBackend === 'streamed') {
      this.scheduleStreamedScout();
    }
  }

  private reset(): void {
    this.cancelDecodedBuild();
    this.cancelStreamedScout();
    this.levels = [];
    this.sourceKey = null;
    this.fileId = -1;
    this.observedPeakMax = 0;
    this.peakNormalizer = 1;
    this.lastFrameTime = null;
  }

  private emit(): void {
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private cancelDecodedBuild(): void {
    this.decodedQueueForeground = [];
    this.decodedQueueBackground = [];
    if (this.decodedTimer !== null) {
      window.clearTimeout(this.decodedTimer);
      this.decodedTimer = null;
    }
  }

  private rebuildDecodedQueue(): void {
    const buffer = this.audioEngine.audioBuffer;
    const baseLevel = this.levels[0];
    if (!buffer || !baseLevel || this.transport.duration <= 0) {
      return;
    }

    const foreground = new Map<number, DecodedBuildTask>();
    const background = new Map<number, DecodedBuildTask>();
    const totalChunks = Math.ceil(baseLevel.binCount / DECODED_CHUNK_BINS);
    const clampedView = normalizeRange(this.currentView.start, this.currentView.end, this.transport.duration);
    const viewSpan = Math.max(0.001, clampedView.end - clampedView.start);
    const playheadRange = normalizeRange(
      this.transport.currentTime - Math.max(1.5, viewSpan * 0.2),
      this.transport.currentTime + Math.max(1.5, viewSpan * 0.2),
      this.transport.duration,
    );

    const pushRange = (map: Map<number, DecodedBuildTask>, range: ViewRange | null, isForeground: boolean) => {
      if (!range || range.end <= range.start) return;
      const startBin = Math.max(0, Math.floor((range.start / this.transport.duration) * baseLevel.binCount));
      const endBin = Math.min(baseLevel.binCount - 1, Math.max(startBin, Math.ceil((range.end / this.transport.duration) * baseLevel.binCount) - 1));
      const startChunk = Math.floor(startBin / DECODED_CHUNK_BINS);
      const endChunk = Math.floor(endBin / DECODED_CHUNK_BINS);
      for (let chunk = startChunk; chunk <= endChunk; chunk++) {
        const chunkStart = chunk * DECODED_CHUNK_BINS;
        if (this.chunkIsExact(chunkStart, baseLevel)) continue;
        map.set(chunkStart, {
          startBin: chunkStart,
          endBin: Math.min(baseLevel.binCount - 1, chunkStart + DECODED_CHUNK_BINS - 1),
          foreground: isForeground,
        });
      }
    };

    pushRange(foreground, clampedView, true);
    pushRange(foreground, playheadRange, true);
    pushRange(foreground, this.loopRange, true);
    pushRange(foreground, this.selectedRange, true);

    const chunkSlots = buildBisectionSlots(totalChunks);
    for (const slot of chunkSlots) {
      const chunkStart = slot * DECODED_CHUNK_BINS;
      if (foreground.has(chunkStart) || this.chunkIsExact(chunkStart, baseLevel)) continue;
      background.set(chunkStart, {
        startBin: chunkStart,
        endBin: Math.min(baseLevel.binCount - 1, chunkStart + DECODED_CHUNK_BINS - 1),
        foreground: false,
      });
    }

    this.decodedQueueForeground = [...foreground.values()];
    this.decodedQueueBackground = [...background.values()];
    this.scheduleDecodedBuild();
  }

  private chunkIsExact(chunkStart: number, level: WaveformLevel): boolean {
    const end = Math.min(level.binCount - 1, chunkStart + DECODED_CHUNK_BINS - 1);
    for (let index = chunkStart; index <= end; index++) {
      if (level.confidence[index] !== 2) {
        return false;
      }
    }
    return true;
  }

  private scheduleDecodedBuild(): void {
    if (this.decodedTimer !== null) {
      return;
    }

    this.decodedTimer = window.setTimeout(() => {
      this.decodedTimer = null;
      this.processDecodedBuildSlice();
    }, 0);
  }

  private processDecodedBuildSlice(): void {
    const buffer = this.audioEngine.audioBuffer;
    const baseLevel = this.levels[0];
    if (!buffer || !baseLevel) return;

    let changed = false;
    const activeQueue = this.decodedQueueForeground.length > 0 ? this.decodedQueueForeground : this.decodedQueueBackground;
    const budget = activeQueue === this.decodedQueueForeground
      ? this.profile.waveform.visibleRefineSliceMs
      : this.profile.waveform.backgroundRefineSliceMs;
    const sliceStartedAt = performance.now();

    while (activeQueue.length > 0 && performance.now() - sliceStartedAt < budget) {
      const task = activeQueue.shift()!;
      if (this.computeDecodedBins(buffer, task.startBin, task.endBin, baseLevel)) {
        changed = true;
      }
    }

    if (changed) {
      this.emit();
    }

    if (this.decodedQueueForeground.length > 0 || this.decodedQueueBackground.length > 0) {
      this.scheduleDecodedBuild();
    }
  }

  private computeDecodedBins(buffer: AudioBuffer, startBin: number, endBin: number, baseLevel: WaveformLevel): boolean {
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
    const samplesPerBin = left.length / baseLevel.binCount;
    let changed = false;

    for (let bin = startBin; bin <= endBin; bin++) {
      if (baseLevel.confidence[bin] === 2) continue;
      const sampleStart = Math.floor(bin * samplesPerBin);
      const sampleEnd = Math.min(left.length, Math.floor((bin + 1) * samplesPerBin));
      if (sampleEnd <= sampleStart) {
        baseLevel.min[bin] = 0;
        baseLevel.max[bin] = 0;
        baseLevel.rms[bin] = 0;
        baseLevel.clipDensity[bin] = 0;
        baseLevel.confidence[bin] = 2;
        changed = true;
        continue;
      }

      let min = 1;
      let max = -1;
      let rmsSum = 0;
      let sampleCount = 0;
      let clipCount = 0;

      for (let sample = sampleStart; sample < sampleEnd; sample++) {
        const leftValue = left[sample];
        if (leftValue < min) min = leftValue;
        if (leftValue > max) max = leftValue;
        rmsSum += leftValue * leftValue;
        sampleCount++;
        if (Math.abs(leftValue) >= CLIP_THRESHOLD) clipCount++;

        if (right) {
          const rightValue = right[sample];
          if (rightValue < min) min = rightValue;
          if (rightValue > max) max = rightValue;
          rmsSum += rightValue * rightValue;
          sampleCount++;
          if (Math.abs(rightValue) >= CLIP_THRESHOLD) clipCount++;
        }
      }

      baseLevel.min[bin] = sampleCount > 0 ? min : 0;
      baseLevel.max[bin] = sampleCount > 0 ? max : 0;
      baseLevel.rms[bin] = sampleCount > 0 ? Math.sqrt(rmsSum / sampleCount) : 0;
      baseLevel.clipDensity[bin] = sampleCount > 0 ? clipCount / sampleCount : 0;
      baseLevel.confidence[bin] = 2;
      this.observedPeakMax = Math.max(this.observedPeakMax, computePeakAbs(baseLevel, bin));
      changed = true;
    }

    if (changed) {
      this.peakNormalizer = this.audioEngine.displayGain > 0 ? this.audioEngine.displayGain : 1;
      this.propagateFromLevel(0, startBin, endBin);
    }

    return changed;
  }

  private cancelStreamedScout(): void {
    this.streamedRunToken += 1;
    if (this.streamedScoutCancel) {
      this.streamedScoutCancel();
      this.streamedScoutCancel = null;
    }
  }

  private scheduleStreamedScout(): void {
    if (this.transport.playbackBackend !== 'streamed' || !this.transport.filename || this.transport.duration <= 0) {
      return;
    }
    if (this.streamedScoutCancel) {
      return;
    }
    void this.runStreamedScout(this.streamedRunToken + 1);
  }

  private buildStreamedTargets(): StreamedScoutTarget[] {
    const baseLevel = this.levels[0];
    if (!baseLevel) return [];
    const overviewLevelIndex = pickLevelIndexForTargetBins(
      this.levels,
      this.profile.waveform.streamedOverviewTargetBins,
    );
    const overviewLevel = this.levels[overviewLevelIndex] ?? baseLevel;
    const targetSeconds = this.profile.waveform.streamedVisibleTargetSeconds;
    const targets: StreamedScoutTarget[] = [];
    const seen = new Set<string>();

    const pushTargets = (items: readonly StreamedScoutTarget[]) => {
      for (const item of items) {
        const key = `${item.levelIndex}:${item.colStart}:${item.colEnd}`;
        if (seen.has(key) || !targetNeedsSample(this.levels, item)) continue;
        seen.add(key);
        targets.push(item);
      }
    };

    const duration = this.transport.duration;
    const viewRange = normalizeRange(this.currentView.start, this.currentView.end, duration);
    const viewSpan = Math.max(0, viewRange.end - viewRange.start);
    const detailTargetCount = Math.max(
      1,
      Math.min(baseLevel.binCount, Math.ceil(viewSpan / targetSeconds)),
    );
    pushTargets(buildRangeTargets(
      baseLevel.binCount,
      duration,
      viewRange.start,
      viewRange.end,
      detailTargetCount,
      true,
      0,
      2,
    ));

    const playheadWindow = this.profile.waveform.streamedPlayheadWindowS;
    const playheadRange = normalizeRange(
      this.transport.currentTime - playheadWindow,
      this.transport.currentTime + playheadWindow,
      duration,
    );
    const playheadTargetCount = Math.max(
      1,
      Math.min(baseLevel.binCount, Math.ceil((playheadRange.end - playheadRange.start) / targetSeconds)),
    );
    pushTargets(buildRangeTargets(
      baseLevel.binCount,
      duration,
      playheadRange.start,
      playheadRange.end,
      playheadTargetCount,
      true,
      0,
      2,
    ));

    if (this.loopRange) {
      const loopSpan = this.loopRange.end - this.loopRange.start;
      const loopTargetCount = Math.max(1, Math.min(baseLevel.binCount, Math.ceil(loopSpan / targetSeconds)));
      pushTargets(buildRangeTargets(
        baseLevel.binCount,
        duration,
        this.loopRange.start,
        this.loopRange.end,
        loopTargetCount,
        true,
        0,
        2,
      ));
    }

    if (this.selectedRange) {
      const selectedSpan = this.selectedRange.end - this.selectedRange.start;
      const selectedTargetCount = Math.max(1, Math.min(baseLevel.binCount, Math.ceil(selectedSpan / targetSeconds)));
      pushTargets(buildRangeTargets(
        baseLevel.binCount,
        duration,
        this.selectedRange.start,
        this.selectedRange.end,
        selectedTargetCount,
        true,
        0,
        2,
      ));
    }

    pushTargets(buildRangeTargets(
      overviewLevel.binCount,
      duration,
      0,
      duration,
      overviewLevel.binCount,
      false,
      overviewLevelIndex,
      2,
    ));
    return targets;
  }

  private async runStreamedScout(runToken: number): Promise<void> {
    const targets = this.buildStreamedTargets();
    if (targets.length === 0) return;

    const probe = this.audioEngine.createStreamedOverviewProbe();
    if (!probe) return;

    let cancelled = false;
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      probe.dispose();
      if (this.streamedScoutCancel === cancel) {
        this.streamedScoutCancel = null;
      }
    };

    this.streamedRunToken = runToken;
    this.streamedScoutCancel = cancel;

    try {
      await waitForMediaReadyState(probe.element, STREAMED_SCOUT_READY_TIMEOUT_MS);
      if (cancelled || this.streamedRunToken !== runToken) return;

      for (const target of targets) {
        if (cancelled || this.streamedRunToken !== runToken) break;
        if (shouldThrottleStreamedScout(this.transport)) {
          await delay(this.profile.waveform.streamedStressDelayMs);
          continue;
        }
        if (!targetNeedsSample(this.levels, target)) continue;
        await this.sampleStreamedTarget(probe, target, runToken);
        if (cancelled || this.streamedRunToken !== runToken) break;
        await delay(target.foreground ? this.profile.waveform.streamedActiveDelayMs : STREAMED_IDLE_DELAY_MS);
      }
    } catch (error) {
      if (!cancelled) {
        console.warn('waveform streamed scout failed; retaining learned proxy', error);
      }
    } finally {
      cancel();
    }
  }

  private async sampleStreamedTarget(probe: StreamedOverviewProbe, target: StreamedScoutTarget, runToken: number): Promise<void> {
    const sampleCount = Math.max(1, this.profile.waveform.streamedSamplesPerTarget);
    const span = Math.max(0, target.timeEnd - target.timeStart);
    for (let index = 0; index < sampleCount; index++) {
      if (this.streamedRunToken !== runToken) return;
      const time = sampleCount === 1
        ? target.time
        : target.timeStart + ((index + 1) / (sampleCount + 1)) * span;

      await seekMediaElement(probe.element, time, STREAMED_SCOUT_READY_TIMEOUT_MS);
      if (this.streamedRunToken !== runToken) return;
      await waitForMediaReadyState(probe.element, STREAMED_SCOUT_READY_TIMEOUT_MS);
      if (this.streamedRunToken !== runToken) return;

      let played = false;
      try {
        await Promise.resolve(probe.element.play());
        played = true;
        await delay(STREAMED_SCOUT_SAMPLE_WINDOW_MS);
      } catch {
        await delay(this.profile.waveform.streamedActiveDelayMs);
        continue;
      } finally {
        if (played) {
          probe.element.pause();
        }
      }

      probe.analyser.getFloatTimeDomainData(probe.timeDomain as Float32Array<ArrayBuffer>);
      const segmentStart = target.timeStart + (span * index) / sampleCount;
      const segmentEnd = target.timeStart + (span * (index + 1)) / sampleCount;
      this.mergeTimeDomainRangeIntoLevel(
        target.levelIndex,
        segmentStart,
        Math.max(segmentStart, segmentEnd),
        probe.timeDomain,
        target.requiredConfidence,
      );
    }
  }

  private mergeTimeDomainRangeIntoLevel(
    levelIndex: number,
    timeStart: number,
    timeEnd: number,
    data: Float32Array,
    confidence: WaveformConfidence,
  ): void {
    const level = this.levels[levelIndex];
    if (!level || this.transport.duration <= 0 || data.length === 0) return;
    const duration = Math.max(0.001, this.transport.duration);
    const startIndex = Math.max(0, Math.min(level.binCount - 1, Math.floor((clampNumber(timeStart, 0, duration) / duration) * level.binCount)));
    const endIndex = Math.max(
      startIndex,
      Math.min(level.binCount - 1, Math.ceil((clampNumber(timeEnd, 0, duration) / duration) * level.binCount) - 1),
    );
    const columnCount = endIndex - startIndex + 1;
    const samplesPerColumn = Math.max(1, Math.floor(data.length / columnCount));
    let changed = false;

    for (let column = 0; column < columnCount; column++) {
      const envIndex = startIndex + column;
      if (confidence === 1 && level.confidence[envIndex] === 2) {
        continue;
      }
      const sampleStart = Math.min(data.length - 1, column * samplesPerColumn);
      const sampleEnd = column === columnCount - 1
        ? data.length
        : Math.min(data.length, sampleStart + samplesPerColumn);

      let min = 1;
      let max = -1;
      let sumSquares = 0;
      let clipCount = 0;
      let count = 0;

      for (let sample = sampleStart; sample < sampleEnd; sample++) {
        const value = data[sample];
        if (value < min) min = value;
        if (value > max) max = value;
        sumSquares += value * value;
        count++;
        if (Math.abs(value) >= CLIP_THRESHOLD) clipCount++;
      }

      const nextMin = count > 0 ? min : 0;
      const nextMax = count > 0 ? max : 0;
      const nextRms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
      const nextClipDensity = count > 0 ? clipCount / count : 0;

      if (confidence === 2 && level.confidence[envIndex] < 2) {
        level.min[envIndex] = nextMin;
        level.max[envIndex] = nextMax;
        level.rms[envIndex] = nextRms;
        level.clipDensity[envIndex] = nextClipDensity;
      } else if (level.confidence[envIndex] === 0) {
        level.min[envIndex] = nextMin;
        level.max[envIndex] = nextMax;
        level.rms[envIndex] = nextRms;
        level.clipDensity[envIndex] = nextClipDensity;
      } else {
        level.min[envIndex] = Math.min(level.min[envIndex], nextMin);
        level.max[envIndex] = Math.max(level.max[envIndex], nextMax);
        level.rms[envIndex] = Math.max(level.rms[envIndex], nextRms);
        level.clipDensity[envIndex] = Math.max(level.clipDensity[envIndex], nextClipDensity);
      }

      level.confidence[envIndex] = Math.max(level.confidence[envIndex], confidence);
      this.observedPeakMax = Math.max(this.observedPeakMax, computePeakAbs(level, envIndex));
      changed = true;
    }

    if (changed) {
      this.peakNormalizer = this.observedPeakMax > 0 ? 1 / this.observedPeakMax : 1;
      this.propagateFromLevel(levelIndex, startIndex, endIndex);
      this.emit();
    }
  }

  private mergeProxyTimeDomainRange(timeStart: number, timeEnd: number, data: Float32Array): void {
    this.mergeTimeDomainRangeIntoLevel(0, timeStart, timeEnd, data, 1);
  }

  private propagateFromLevel(levelIndex: number, startIndex: number, endIndex: number): void {
    let childStart = startIndex;
    let childEnd = endIndex;

    for (let currentLevelIndex = levelIndex + 1; currentLevelIndex < this.levels.length; currentLevelIndex++) {
      const child = this.levels[currentLevelIndex - 1];
      const parent = this.levels[currentLevelIndex];
      const parentStart = Math.floor(childStart / 2);
      const parentEnd = Math.floor(childEnd / 2);

      for (let parentIndex = parentStart; parentIndex <= parentEnd; parentIndex++) {
        const leftIndex = parentIndex * 2;
        const rightIndex = Math.min(child.binCount - 1, leftIndex + 1);
        const leftConfidence = child.confidence[leftIndex];
        const rightConfidence = child.confidence[rightIndex];

        if (leftConfidence === 0 && rightConfidence === 0) {
          parent.min[parentIndex] = 0;
          parent.max[parentIndex] = 0;
          parent.rms[parentIndex] = 0;
          parent.clipDensity[parentIndex] = 0;
          parent.confidence[parentIndex] = 0;
          continue;
        }

        const min = rightIndex === leftIndex
          ? child.min[leftIndex]
          : Math.min(child.min[leftIndex], child.min[rightIndex]);
        const max = rightIndex === leftIndex
          ? child.max[leftIndex]
          : Math.max(child.max[leftIndex], child.max[rightIndex]);
        const leftRms = child.rms[leftIndex];
        const rightRms = rightIndex === leftIndex ? 0 : child.rms[rightIndex];
        const divisor = rightIndex === leftIndex ? 1 : 2;

        parent.min[parentIndex] = min;
        parent.max[parentIndex] = max;
        parent.rms[parentIndex] = Math.sqrt((leftRms * leftRms + rightRms * rightRms) / divisor);
        parent.clipDensity[parentIndex] = rightIndex === leftIndex
          ? child.clipDensity[leftIndex]
          : (child.clipDensity[leftIndex] + child.clipDensity[rightIndex]) / 2;
        parent.confidence[parentIndex] = leftConfidence === 2 && rightConfidence === 2
          ? 2
          : Math.max(leftConfidence, rightConfidence) > 0
            ? 1
            : 0;
      }

      childStart = parentStart;
      childEnd = parentEnd;
    }
  }

  private get loopRange(): ViewRange | null {
    if (this.transport.loopStart === null || this.transport.loopEnd === null || this.transport.loopEnd <= this.transport.loopStart) {
      return null;
    }
    return {
      start: this.transport.loopStart,
      end: this.transport.loopEnd,
    };
  }
}
