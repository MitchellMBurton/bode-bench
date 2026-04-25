import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrameBus } from '../audio/frameBus';
import type { FileAnalysis, TransportState } from '../types';
import type { PerformanceProfileSnapshot } from './performanceProfile';
import { WaveformPyramidStore } from './waveformPyramid';

function createSnapshot(detailTargetBins = 16): PerformanceProfileSnapshot {
  return {
    runtimeKind: 'web',
    preference: 'web-safe',
    activeProfile: 'web-safe',
    label: 'WEB SAFE',
    summary: 'test profile',
    timeline: {
      sessionMapMinCols: 16,
      sessionMapMaxCols: 16,
      sessionMapSecondsPerCol: 1,
      detailMapMaxCols: 32,
    },
    waveform: {
      sessionMapTargetBins: 4,
      detailTargetBins,
      visibleRefineSliceMs: 10,
      backgroundRefineSliceMs: 10,
      sampleViewMaxVisibleSpanS: 0.25,
      streamedOverviewTargetBins: 4,
      streamedVisibleTargetSeconds: 0.5,
      streamedPlayheadWindowS: 2,
      streamedSamplesPerTarget: 1,
      streamedActiveDelayMs: 1,
      streamedStressDelayMs: 1,
      persistentCacheEnabled: false,
    },
  };
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function createBuffer(samples: readonly number[], sampleRate = 100): AudioBuffer {
  const data = Float32Array.from(samples);
  return {
    numberOfChannels: 1,
    sampleRate,
    length: data.length,
    getChannelData() {
      return data;
    },
  } as unknown as AudioBuffer;
}

class FakeProfileStore {
  private listeners = new Set<() => void>();
  private snapshot: PerformanceProfileSnapshot;

  constructor(snapshot: PerformanceProfileSnapshot) {
    this.snapshot = snapshot;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PerformanceProfileSnapshot => {
    return this.snapshot;
  };
}

class FakeAudioEngine {
  private transportListeners = new Set<(transport: TransportState) => void>();
  private fileReadyListeners = new Set<(analysis: FileAnalysis) => void>();
  private resetListeners = new Set<() => void>();
  private buffer: AudioBuffer | null;
  private gain: number;

  constructor(buffer: AudioBuffer | null, gain = 1) {
    this.buffer = buffer;
    this.gain = gain;
  }

  get audioBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  get displayGain(): number {
    return this.gain;
  }

  onTransport(listener: (transport: TransportState) => void): () => void {
    this.transportListeners.add(listener);
    return () => {
      this.transportListeners.delete(listener);
    };
  }

  onFileReady(listener: (analysis: FileAnalysis) => void): () => void {
    this.fileReadyListeners.add(listener);
    return () => {
      this.fileReadyListeners.delete(listener);
    };
  }

  onReset(listener: () => void): () => void {
    this.resetListeners.add(listener);
    return () => {
      this.resetListeners.delete(listener);
    };
  }

  emitTransport(transport: TransportState): void {
    for (const listener of this.transportListeners) {
      listener(transport);
    }
  }

  emitFileReady(analysis: FileAnalysis): void {
    for (const listener of this.fileReadyListeners) {
      listener(analysis);
    }
  }

  emitReset(): void {
    for (const listener of this.resetListeners) {
      listener();
    }
  }

  createStreamedOverviewProbe() {
    return null;
  }

  get fileAnalysis(): FileAnalysis | null {
    return null;
  }
}

function createTransport(duration: number, playbackBackend: TransportState['playbackBackend'] = 'decoded'): TransportState {
  return {
    isPlaying: false,
    currentTime: 0,
    duration,
    filename: 'fixture.wav',
    volume: 1,
    playbackBackend,
    scrubActive: false,
    playbackRate: 1,
    pitchSemitones: 0,
    pitchShiftAvailable: true,
    loopStart: null,
    loopEnd: null,
  };
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
  await Promise.resolve();
}

describe('WaveformPyramidStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds decoded multi-level summaries with exact confidence', async () => {
    const samples = [
      0, 0.5, -0.75, 0.25,
      0.1, 0.3, -0.2, 0.4,
      0.9, -0.95, 0.2, -0.1,
      0, 0.15, -0.35, 0.6,
    ];
    const frameBus = new FrameBus();
    const engine = new FakeAudioEngine(createBuffer(samples, 10));
    const store = new WaveformPyramidStore(
      frameBus,
      engine as unknown as never,
      new FakeProfileStore(createSnapshot(samples.length)) as unknown as never,
    );

    engine.emitTransport(createTransport(samples.length / 10));
    engine.emitFileReady({
      crestFactorDb: 12,
      peakDb: -0.2,
      rmsDb: -16,
      clipCount: 0,
      duration: samples.length / 10,
      channels: 1,
      decodedSampleRate: 10,
      contextSampleRate: 10,
      fileId: 1,
    });

    await flushAsyncWork();

    const levels = store.currentLevels;
    expect(levels.length).toBeGreaterThan(1);
    expect(levels[0].binCount).toBe(samples.length);
    expect(Array.from(levels[0].confidence)).toEqual(new Array(samples.length).fill(2));
    expect(levels[0].max[8]).toBeCloseTo(0.9, 5);
    expect(levels[0].min[9]).toBeCloseTo(-0.95, 5);

    const parent = levels[1];
    expect(parent.confidence[4]).toBe(2);
    expect(parent.max[4]).toBeCloseTo(0.9, 5);
    expect(parent.min[4]).toBeCloseTo(-0.95, 5);
    expect(store.displayPeakNormalizer).toBeCloseTo(1, 5);

    store.destroy();
  });

  it('switches into sample view only for decoded tight spans', async () => {
    const frameBus = new FrameBus();
    const engine = new FakeAudioEngine(createBuffer(new Array(64).fill(0).map((_, index) => Math.sin(index / 3)), 128));
    const store = new WaveformPyramidStore(
      frameBus,
      engine as unknown as never,
      new FakeProfileStore(createSnapshot(64)) as unknown as never,
    );

    engine.emitTransport(createTransport(0.5));
    await flushAsyncWork();

    expect(store.shouldUseSampleView(0, 0.12, 240)).toBe(true);
    expect(store.shouldUseSampleView(0, 0.4, 240)).toBe(false);

    engine.emitTransport(createTransport(0.5, 'streamed'));
    expect(store.shouldUseSampleView(0, 0.12, 240)).toBe(false);

    store.destroy();
  });

  it('builds local streamed refine targets on the finest level and episode targets on the overview level', async () => {
    const frameBus = new FrameBus();
    const engine = new FakeAudioEngine(null);
    const store = new WaveformPyramidStore(
      frameBus,
      engine as unknown as never,
      new FakeProfileStore(createSnapshot(16)) as unknown as never,
    );

    engine.emitTransport(createTransport(120, 'streamed'));
    store.setViewRange({ start: 24, end: 36 });

    const targets = ((store as unknown as { buildStreamedTargets(): Array<{ levelIndex: number; foreground: boolean }> }).buildStreamedTargets());
    expect(targets.some((target) => target.foreground && target.levelIndex === 0)).toBe(true);
    expect(targets.some((target) => !target.foreground && target.levelIndex === 2)).toBe(true);
    expect(targets.some((target) => !target.foreground && target.levelIndex === 0)).toBe(false);

    store.destroy();
  });

  it('keeps streamed exact writes on the chosen level and only aggregates upward', async () => {
    const frameBus = new FrameBus();
    const engine = new FakeAudioEngine(null);
    const store = new WaveformPyramidStore(
      frameBus,
      engine as unknown as never,
      new FakeProfileStore(createSnapshot(16)) as unknown as never,
    );

    engine.emitTransport(createTransport(4, 'streamed'));

    const mergeExact = (store as unknown as {
      mergeTimeDomainRangeIntoLevel(levelIndex: number, timeStart: number, timeEnd: number, data: Float32Array, confidence: 1 | 2): void;
    }).mergeTimeDomainRangeIntoLevel.bind(store);

    mergeExact(2, 0, 1, Float32Array.from([0.1, -0.4, 0.2, -0.3]), 2);
    mergeExact(2, 1, 2, Float32Array.from([0.3, -0.5, 0.4, -0.2]), 2);

    const levels = store.currentLevels;
    expect(levels[0].confidence[0]).toBe(0);
    expect(levels[2].confidence[0]).toBe(2);
    expect(levels[2].confidence[1]).toBe(2);
    expect(levels[3].confidence[0]).toBe(2);

    store.destroy();
  });

  it('prefers dense exact coarse coverage over sparse finest proxy coverage for long spans', async () => {
    const frameBus = new FrameBus();
    const engine = new FakeAudioEngine(null);
    const store = new WaveformPyramidStore(
      frameBus,
      engine as unknown as never,
      new FakeProfileStore(createSnapshot(16)) as unknown as never,
    );

    engine.emitTransport(createTransport(16, 'streamed'));

    const mergeProxy = (store as unknown as {
      mergeProxyTimeDomainRange(timeStart: number, timeEnd: number, data: Float32Array): void;
    }).mergeProxyTimeDomainRange.bind(store);
    const mergeExact = (store as unknown as {
      mergeTimeDomainRangeIntoLevel(levelIndex: number, timeStart: number, timeEnd: number, data: Float32Array, confidence: 1 | 2): void;
    }).mergeTimeDomainRangeIntoLevel.bind(store);

    mergeProxy(0, 16, Float32Array.from(new Array(64).fill(0).map((_, index) => Math.sin(index / 5) * 0.3)));
    mergeExact(2, 0, 16, Float32Array.from(new Array(128).fill(0).map((_, index) => Math.sin(index / 7) * 0.6)), 2);

    const overviewLevel = store.pickOverviewLevel();
    const detailLevel = store.pickDetailLevel(0, 16, 6, true);

    expect(overviewLevel?.binCount).toBe(4);
    expect(detailLevel?.binCount).toBe(4);

    store.destroy();
  });
});
