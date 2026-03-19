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
  readonly scoutTargetSamples: number;
  readonly scoutSamplesPerTarget: number;
  readonly scoutActiveDelayMs: number;
  readonly scoutStressDelayMs: number;
}

export interface PerformanceProfileSnapshot {
  readonly runtimeKind: RuntimeKind;
  readonly preference: PerformanceProfilePreference;
  readonly activeProfile: PerformanceProfileId;
  readonly label: string;
  readonly summary: string;
  readonly timeline: TimelineProfile;
}

const PROFILE_TIMELINES: Record<PerformanceProfileId, TimelineProfile> = {
  'web-safe': {
    sessionMapMinCols: 256,
    sessionMapMaxCols: 768,
    sessionMapSecondsPerCol: 12,
    detailMapMaxCols: 32_768,
    scoutTargetSamples: 768,
    scoutSamplesPerTarget: 1,
    scoutActiveDelayMs: 120,
    scoutStressDelayMs: 900,
  },
  'desktop-high': {
    sessionMapMinCols: 512,
    sessionMapMaxCols: 1_536,
    sessionMapSecondsPerCol: 8,
    detailMapMaxCols: 65_536,
    scoutTargetSamples: 1_536,
    scoutSamplesPerTarget: 2,
    scoutActiveDelayMs: 72,
    scoutStressDelayMs: 420,
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
