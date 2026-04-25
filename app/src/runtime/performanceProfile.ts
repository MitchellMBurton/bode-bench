export type RuntimeKind = 'web' | 'desktop';
export type PerformanceProfilePreference = 'auto' | 'web-safe' | 'desktop-high';
export type PerformanceProfileId = Exclude<PerformanceProfilePreference, 'auto'>;

type Listener = () => void;

const STORAGE_KEY = 'console:performance-profile';

export interface TimelineProfile {
  readonly sessionMapMinCols: number;
  readonly sessionMapMaxCols: number;
  readonly sessionMapSecondsPerCol: number;
  readonly detailMapMaxCols: number;
}

export interface WaveformProfile {
  readonly sessionMapTargetBins: number;
  readonly detailTargetBins: number;
  readonly visibleRefineSliceMs: number;
  readonly backgroundRefineSliceMs: number;
  readonly sampleViewMaxVisibleSpanS: number;
  readonly streamedOverviewTargetBins: number;
  readonly streamedVisibleTargetSeconds: number;
  readonly streamedPlayheadWindowS: number;
  readonly streamedSamplesPerTarget: number;
  readonly streamedActiveDelayMs: number;
  readonly streamedStressDelayMs: number;
  readonly persistentCacheEnabled: boolean;
}

export interface PerformanceProfileSnapshot {
  readonly runtimeKind: RuntimeKind;
  readonly preference: PerformanceProfilePreference;
  readonly activeProfile: PerformanceProfileId;
  readonly label: string;
  readonly summary: string;
  readonly timeline: TimelineProfile;
  readonly waveform: WaveformProfile;
}

const PROFILE_TIMELINES: Record<PerformanceProfileId, TimelineProfile> = {
  'web-safe': {
    sessionMapMinCols: 256,
    sessionMapMaxCols: 768,
    sessionMapSecondsPerCol: 12,
    detailMapMaxCols: 32_768,
  },
  'desktop-high': {
    sessionMapMinCols: 512,
    sessionMapMaxCols: 1_536,
    sessionMapSecondsPerCol: 8,
    detailMapMaxCols: 65_536,
  },
};

const PROFILE_WAVEFORMS: Record<PerformanceProfileId, WaveformProfile> = {
  'web-safe': {
    sessionMapTargetBins: 512,
    detailTargetBins: 16_384,
    visibleRefineSliceMs: 6,
    backgroundRefineSliceMs: 4,
    sampleViewMaxVisibleSpanS: 0.18,
    streamedOverviewTargetBins: 2_048,
    streamedVisibleTargetSeconds: 0.25,
    streamedPlayheadWindowS: 8,
    streamedSamplesPerTarget: 2,
    streamedActiveDelayMs: 72,
    streamedStressDelayMs: 600,
    persistentCacheEnabled: false,
  },
  'desktop-high': {
    sessionMapTargetBins: 1_024,
    detailTargetBins: 32_768,
    visibleRefineSliceMs: 10,
    backgroundRefineSliceMs: 6,
    sampleViewMaxVisibleSpanS: 0.32,
    streamedOverviewTargetBins: 4_096,
    streamedVisibleTargetSeconds: 0.18,
    streamedPlayheadWindowS: 12,
    streamedSamplesPerTarget: 3,
    streamedActiveDelayMs: 48,
    streamedStressDelayMs: 300,
    persistentCacheEnabled: true,
  },
};

function detectRuntimeKind(): RuntimeKind {
  const w = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  if ('__TAURI__' in w || '__TAURI_INTERNALS__' in w || location.protocol === 'tauri:' || location.hostname === 'tauri.localhost') {
    return 'desktop';
  }
  return 'web';
}

function readPreference(): PerformanceProfilePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'auto' || stored === 'web-safe' || stored === 'desktop-high') return stored;
  return 'auto';
}

function resolveActiveProfile(
  runtimeKind: RuntimeKind,
  preference: PerformanceProfilePreference,
): PerformanceProfileId {
  if (preference === 'auto') {
    return runtimeKind === 'desktop' ? 'desktop-high' : 'web-safe';
  }
  return preference;
}

function buildSnapshot(
  runtimeKind: RuntimeKind,
  preference: PerformanceProfilePreference,
): PerformanceProfileSnapshot {
  const activeProfile = resolveActiveProfile(runtimeKind, preference);
  return {
    runtimeKind,
    preference,
    activeProfile,
    label: activeProfile === 'desktop-high' ? 'DESKTOP HIGH' : 'WEB SAFE',
    summary:
      activeProfile === 'desktop-high'
        ? 'Desktop installs can index and refine large media more aggressively.'
        : 'Browser-safe profile keeps large media lighter and more conservative.',
    timeline: PROFILE_TIMELINES[activeProfile],
    waveform: PROFILE_WAVEFORMS[activeProfile],
  };
}

export class PerformanceProfileStore {
  private readonly runtimeKind = detectRuntimeKind();
  private preference = readPreference();
  private snapshot = buildSnapshot(this.runtimeKind, this.preference);
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PerformanceProfileSnapshot => {
    return this.snapshot;
  };

  setPreference(next: PerformanceProfilePreference): void {
    if (next === this.preference) return;
    this.preference = next;
    localStorage.setItem(STORAGE_KEY, next);
    this.snapshot = buildSnapshot(this.runtimeKind, this.preference);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
