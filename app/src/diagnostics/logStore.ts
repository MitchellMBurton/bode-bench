export type DiagnosticsTone = 'dim' | 'info' | 'warn';
export type DiagnosticsSource = 'system' | 'transport' | 'decode' | 'video' | 'console';

export interface DiagnosticsEntry {
  readonly id: number;
  readonly atMs: number;
  readonly clock: string;
  readonly source: DiagnosticsSource;
  readonly tone: DiagnosticsTone;
  readonly text: string;
}

type Listener = () => void;

const MAX_ENTRIES = 256;

let consoleCaptureInstalled = false;
let activeConsolePush: ((text: string, tone?: DiagnosticsTone, source?: DiagnosticsSource) => void) | null = null;

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatConsoleArg(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (value === null || value === undefined) return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function installConsoleCapture(): void {
  if (consoleCaptureInstalled || typeof window === 'undefined') return;

  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.warn = (...args: unknown[]) => {
    activeConsolePush?.(`warn ${args.map(formatConsoleArg).join(' ')}`, 'warn', 'console');
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    activeConsolePush?.(`error ${args.map(formatConsoleArg).join(' ')}`, 'warn', 'console');
    originalError(...args);
  };

  window.addEventListener('error', (event) => {
    activeConsolePush?.(
      `window error ${event.message}`,
      'warn',
      'console',
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    activeConsolePush?.(
      `unhandled rejection ${formatConsoleArg(event.reason)}`,
      'warn',
      'console',
    );
  });

  consoleCaptureInstalled = true;
}

export class DiagnosticsLogStore {
  private entries: readonly DiagnosticsEntry[] = [];
  private listeners = new Set<Listener>();
  private nextId = 1;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): readonly DiagnosticsEntry[] => {
    return this.entries;
  };

  attachGlobalCapture(): void {
    activeConsolePush = this.push.bind(this);
    installConsoleCapture();
  }

  push(text: string, tone: DiagnosticsTone = 'dim', source: DiagnosticsSource = 'system'): void {
    const now = new Date();
    const nextEntry: DiagnosticsEntry = {
      id: this.nextId++,
      atMs: now.getTime(),
      clock: formatClock(now),
      source,
      tone,
      text,
    };

    const next = [...this.entries, nextEntry];
    this.entries = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    this.emit();
  }

  clear(): void {
    if (this.entries.length === 0) return;
    this.entries = [];
    this.emit();
  }

  exportText(entries: readonly DiagnosticsEntry[] = this.entries): string {
    return entries
      .map((entry) => `${entry.clock}  [${entry.source.toUpperCase()}]  ${entry.text}`)
      .join('\n');
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}


export type PerformanceTone = 'dim' | 'info' | 'warn';
export type PerformanceSource = 'ui' | 'video' | 'load' | 'transport';
export type PerformanceVideoState = 'idle' | 'playing' | 'sync' | 'waiting' | 'stalled' | 'scrub';

export interface PerformanceEvent {
  readonly id: number;
  readonly atMs: number;
  readonly clock: string;
  readonly source: PerformanceSource;
  readonly tone: PerformanceTone;
  readonly text: string;
}

export interface PerformanceLoadSample {
  readonly filename: string;
  readonly totalMs: number;
  readonly readMs: number;
  readonly decodeMs: number;
  readonly stretchMs: number;
  readonly channels: number;
  readonly durationS: number;
  readonly stretchEnabled: boolean;
}

export interface PerformanceTraceSample {
  readonly atMs: number;
  readonly uiFrameP95Ms: number;
  readonly videoDriftMs: number;
  readonly longTaskPulseMs: number;
  readonly loadPulseMs: number;
  readonly videoCatchupActive: boolean;
}

export interface PerformanceDiagnosticsSnapshot {
  readonly filename: string | null;
  readonly transportPlaying: boolean;
  readonly transportRate: number;
  readonly pitchSemitones: number;
  readonly uiFps: number;
  readonly uiFrameAvgMs: number;
  readonly uiFrameP95Ms: number;
  readonly uiJankPercent: number;
  readonly longTaskCount: number;
  readonly lastLongTaskMs: number | null;
  readonly videoState: PerformanceVideoState;
  readonly videoDriftMs: number;
  readonly videoPreviewRate: number;
  readonly videoReadyState: number;
  readonly videoCatchupActive: boolean;
  readonly videoHardSyncCount: number;
  readonly videoRecoveryCount: number;
  readonly videoWaitCount: number;
  readonly videoStallCount: number;
  readonly lastLoad: PerformanceLoadSample | null;
  readonly trace: readonly PerformanceTraceSample[];
  readonly recentEvents: readonly PerformanceEvent[];
}

interface VideoTelemetry {
  readonly driftMs: number;
  readonly previewRate: number;
  readonly readyState: number;
  readonly catchupActive: boolean;
}

type VideoEventKind = 'waiting' | 'stalled' | 'hard-sync' | 'recover' | 'retune' | 'playing';

const PERF_MAX_FRAME_SAMPLES = 120;
const PERF_MAX_EVENTS = 40;
const PERF_HOT_EMIT_MS = 180;
const PERF_TRACE_MAX_SAMPLES = 180;
const PERF_TRACE_SAMPLE_MS = 450;
const PERF_TRACE_LONG_TASK_HOLD_MS = 2200;
const PERF_TRACE_LOAD_HOLD_MS = 3000;

function perfNowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index];
}

const INITIAL_PERF_SNAPSHOT: PerformanceDiagnosticsSnapshot = {
  filename: null,
  transportPlaying: false,
  transportRate: 1,
  pitchSemitones: 0,
  uiFps: 0,
  uiFrameAvgMs: 0,
  uiFrameP95Ms: 0,
  uiJankPercent: 0,
  longTaskCount: 0,
  lastLongTaskMs: null,
  videoState: 'idle',
  videoDriftMs: 0,
  videoPreviewRate: 1,
  videoReadyState: 0,
  videoCatchupActive: false,
  videoHardSyncCount: 0,
  videoRecoveryCount: 0,
  videoWaitCount: 0,
  videoStallCount: 0,
  lastLoad: null,
  trace: [],
  recentEvents: [],
};

export class PerformanceDiagnosticsStore {
  private snapshot: PerformanceDiagnosticsSnapshot = INITIAL_PERF_SNAPSHOT;
  private listeners = new Set<Listener>();
  private nextEventId = 1;
  private frameSamples: number[] = [];
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEmitAt = 0;
  private lastEventAt = new Map<string, number>();
  private lastTraceSampleAt = 0;
  private lastLongTaskAtMs = 0;
  private lastLoadAtMs = 0;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PerformanceDiagnosticsSnapshot => {
    return this.snapshot;
  };

  noteUiFrame(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 1000) return;
    this.frameSamples.push(deltaMs);
    if (this.frameSamples.length > PERF_MAX_FRAME_SAMPLES) {
      this.frameSamples.shift();
    }

    const avgMs = this.frameSamples.reduce((sum, sample) => sum + sample, 0) / this.frameSamples.length;
    const p95Ms = percentile(this.frameSamples, 0.95);
    const jankFrames = this.frameSamples.filter((sample) => sample >= 22).length;

    this.snapshot = {
      ...this.snapshot,
      uiFps: avgMs > 0 ? 1000 / avgMs : 0,
      uiFrameAvgMs: avgMs,
      uiFrameP95Ms: p95Ms,
      uiJankPercent: this.frameSamples.length > 0 ? (jankFrames / this.frameSamples.length) * 100 : 0,
    };
    this.scheduleEmit();
  }

  noteLongTask(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    this.lastLongTaskAtMs = Date.now();
    this.snapshot = {
      ...this.snapshot,
      longTaskCount: this.snapshot.longTaskCount + 1,
      lastLongTaskMs: durationMs,
    };
    this.pushEvent('ui', `long task ${durationMs.toFixed(0)} ms`, 'warn', 1200);
    this.scheduleEmit(true);
  }

  noteTransport(state: {
    readonly filename: string | null;
    readonly isPlaying: boolean;
    readonly playbackRate: number;
    readonly pitchSemitones: number;
  }): void {
    this.snapshot = {
      ...this.snapshot,
      filename: state.filename,
      transportPlaying: state.isPlaying,
      transportRate: state.playbackRate,
      pitchSemitones: state.pitchSemitones,
    };
    this.scheduleEmit();
  }

  noteVideoTelemetry(telemetry: VideoTelemetry): void {
    this.snapshot = {
      ...this.snapshot,
      videoDriftMs: telemetry.driftMs,
      videoPreviewRate: telemetry.previewRate,
      videoReadyState: telemetry.readyState,
      videoCatchupActive: telemetry.catchupActive,
    };
    this.scheduleEmit();
  }

  setVideoState(state: PerformanceVideoState): void {
    if (this.snapshot.videoState === state) return;
    this.snapshot = {
      ...this.snapshot,
      videoState: state,
    };
    this.scheduleEmit();
  }

  noteVideoEvent(
    kind: VideoEventKind,
    text: string,
    tone: PerformanceTone = 'dim',
    minIntervalMs = 900,
  ): void {
    let nextState = this.snapshot.videoState;
    let hardSyncCount = this.snapshot.videoHardSyncCount;
    let recoveryCount = this.snapshot.videoRecoveryCount;
    let waitCount = this.snapshot.videoWaitCount;
    let stallCount = this.snapshot.videoStallCount;

    if (kind === 'waiting') {
      nextState = 'waiting';
      waitCount += 1;
    } else if (kind === 'stalled') {
      nextState = 'stalled';
      stallCount += 1;
    } else if (kind === 'hard-sync') {
      nextState = 'sync';
      hardSyncCount += 1;
    } else if (kind === 'recover' || kind === 'retune') {
      nextState = 'sync';
      if (kind === 'recover') recoveryCount += 1;
    } else if (kind === 'playing') {
      nextState = 'playing';
    }

    this.snapshot = {
      ...this.snapshot,
      videoState: nextState,
      videoHardSyncCount: hardSyncCount,
      videoRecoveryCount: recoveryCount,
      videoWaitCount: waitCount,
      videoStallCount: stallCount,
    };
    this.pushEvent('video', text, tone, minIntervalMs);
    this.scheduleEmit(true);
  }

  noteLoadSample(sample: PerformanceLoadSample): void {
    this.lastLoadAtMs = Date.now();
    this.snapshot = {
      ...this.snapshot,
      lastLoad: sample,
    };
    const tone: PerformanceTone =
      sample.totalMs >= 1800 || sample.decodeMs >= 1200
        ? 'warn'
        : sample.totalMs >= 900
          ? 'info'
          : 'dim';
    this.pushEvent(
      'load',
      `${sample.filename} loaded in ${sample.totalMs.toFixed(0)} ms (${sample.decodeMs.toFixed(0)} ms decode / ${sample.stretchMs.toFixed(0)} ms stretch)`,
      tone,
      0,
    );
    this.scheduleEmit(true);
  }

  clearEvents(): void {
    if (this.snapshot.recentEvents.length === 0 && this.snapshot.trace.length === 0) return;
    this.snapshot = {
      ...this.snapshot,
      trace: [],
      recentEvents: [],
    };
    this.lastTraceSampleAt = 0;
    this.lastLongTaskAtMs = 0;
    this.lastLoadAtMs = 0;
    this.lastEventAt.clear();
    this.scheduleEmit(true);
  }

  private pushEvent(
    source: PerformanceSource,
    text: string,
    tone: PerformanceTone,
    minIntervalMs: number,
  ): void {
    const stamp = Date.now();
    const throttleKey = `${source}:${text}`;
    const lastAt = this.lastEventAt.get(throttleKey) ?? 0;
    if (minIntervalMs > 0 && stamp - lastAt < minIntervalMs) {
      return;
    }
    this.lastEventAt.set(throttleKey, stamp);

    const nextEvent: PerformanceEvent = {
      id: this.nextEventId++,
      atMs: stamp,
      clock: formatClock(new Date(stamp)),
      source,
      tone,
      text,
    };

    const nextEvents = [...this.snapshot.recentEvents, nextEvent];
    this.snapshot = {
      ...this.snapshot,
      recentEvents: nextEvents.length > PERF_MAX_EVENTS ? nextEvents.slice(nextEvents.length - PERF_MAX_EVENTS) : nextEvents,
    };
  }

  private scheduleEmit(force = false): void {
    if (force) {
      if (this.emitTimer !== null) {
        clearTimeout(this.emitTimer);
        this.emitTimer = null;
      }
      this.emit();
      return;
    }

    const elapsed = perfNowMs() - this.lastEmitAt;
    const waitMs = Math.max(0, PERF_HOT_EMIT_MS - elapsed);
    if (waitMs === 0) {
      this.emit();
      return;
    }
    if (this.emitTimer !== null) return;

    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emit();
    }, waitMs);
  }

  private emit(): void {
    this.appendTraceSample();
    this.lastEmitAt = perfNowMs();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private appendTraceSample(): void {
    const stamp = Date.now();
    if (this.lastTraceSampleAt > 0 && stamp - this.lastTraceSampleAt < PERF_TRACE_SAMPLE_MS) {
      return;
    }

    const longTaskPulseMs =
      this.snapshot.lastLongTaskMs !== null && stamp - this.lastLongTaskAtMs <= PERF_TRACE_LONG_TASK_HOLD_MS
        ? this.snapshot.lastLongTaskMs
        : 0;
    const loadPulseMs =
      this.snapshot.lastLoad !== null && stamp - this.lastLoadAtMs <= PERF_TRACE_LOAD_HOLD_MS
        ? this.snapshot.lastLoad.totalMs
        : 0;

    const nextSample: PerformanceTraceSample = {
      atMs: stamp,
      uiFrameP95Ms: this.snapshot.uiFrameP95Ms,
      videoDriftMs: this.snapshot.videoDriftMs,
      longTaskPulseMs,
      loadPulseMs,
      videoCatchupActive: this.snapshot.videoCatchupActive,
    };

    const nextTrace = [...this.snapshot.trace, nextSample];
    this.snapshot = {
      ...this.snapshot,
      trace: nextTrace.length > PERF_TRACE_MAX_SAMPLES ? nextTrace.slice(nextTrace.length - PERF_TRACE_MAX_SAMPLES) : nextTrace,
    };
    this.lastTraceSampleAt = stamp;
  }
}
