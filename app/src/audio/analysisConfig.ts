// ============================================================
// AnalysisConfigStore — grouped, typed analysis parameters
// shared by the audio engine and spectral display panels.
// Persists one global defaults snapshot to localStorage and
// normalises legacy flat storage on load.
// ============================================================

import type {
  AnalysisConfig,
  FftSizeOption,
  FreqResponseBandwidth,
  FreqResponseDbSpan,
  LoudnessReferenceMode,
  LoudnessTargetPreset,
  SpectrogramGridDensity,
} from '../types';

const STORAGE_KEY = 'console:analysis-config';

export const FFT_SIZE_OPTIONS = [2048, 4096, 8192, 16384] as const satisfies readonly FftSizeOption[];
export const FREQ_RESPONSE_BANDWIDTH_OPTIONS = ['1/12-oct', '1/6-oct', '1/3-oct', '1-oct'] as const satisfies readonly FreqResponseBandwidth[];
export const FREQ_RESPONSE_DB_SPAN_OPTIONS = [36, 54, 72] as const satisfies readonly FreqResponseDbSpan[];
export const SPECTROGRAM_GRID_DENSITY_OPTIONS = ['off', 'major-only', 'major+minor'] as const satisfies readonly SpectrogramGridDensity[];
export const LOUDNESS_TARGET_PRESET_OPTIONS = ['stream', 'apple', 'ebu', 'cinema'] as const satisfies readonly LoudnessTargetPreset[];
export const LOUDNESS_REFERENCE_MODE_OPTIONS = ['all', 'target-only'] as const satisfies readonly LoudnessReferenceMode[];

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  general: {
    fftSize: 8192,
    smoothing: 0.8,
  },
  frequencyResponse: {
    bandwidth: '1/6-oct',
    dbSpan: 54,
  },
  spectrogram: {
    dbMin: -80,
    dbMax: 0,
    gridDensity: 'major+minor',
  },
  loudness: {
    targetPreset: 'stream',
    referenceMode: 'all',
    showRmsGuides: true,
  },
};

interface LegacyAnalysisConfig {
  readonly fftSize?: unknown;
  readonly smoothing?: unknown;
  readonly freqResponseBandwidth?: unknown;
  readonly spectroDbMin?: unknown;
  readonly spectroDbMax?: unknown;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function coerceOption<T extends string | number>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function cloneConfig(config: AnalysisConfig): AnalysisConfig {
  return {
    general: { ...config.general },
    frequencyResponse: { ...config.frequencyResponse },
    spectrogram: { ...config.spectrogram },
    loudness: { ...config.loudness },
  };
}

function normalizeAnalysisConfig(raw: unknown): AnalysisConfig {
  const parsed = isRecord(raw) ? raw : {};
  const general = isRecord(parsed.general) ? parsed.general : parsed;
  const frequencyResponse = isRecord(parsed.frequencyResponse) ? parsed.frequencyResponse : parsed;
  const spectrogram = isRecord(parsed.spectrogram) ? parsed.spectrogram : parsed;
  const loudness = isRecord(parsed.loudness) ? parsed.loudness : {};
  const legacy = parsed as LegacyAnalysisConfig;

  const dbMin = clamp(
    typeof spectrogram.dbMin === 'number'
      ? spectrogram.dbMin
      : typeof legacy.spectroDbMin === 'number'
        ? legacy.spectroDbMin
        : DEFAULT_ANALYSIS_CONFIG.spectrogram.dbMin,
    -120,
    -20,
  );
  const dbMax = clamp(
    typeof spectrogram.dbMax === 'number'
      ? spectrogram.dbMax
      : typeof legacy.spectroDbMax === 'number'
        ? legacy.spectroDbMax
        : DEFAULT_ANALYSIS_CONFIG.spectrogram.dbMax,
    -10,
    0,
  );

  return {
    general: {
      fftSize: coerceOption(general.fftSize, FFT_SIZE_OPTIONS, DEFAULT_ANALYSIS_CONFIG.general.fftSize),
      smoothing: typeof general.smoothing === 'number'
        ? clamp(general.smoothing, 0, 1)
        : typeof legacy.smoothing === 'number'
          ? clamp(legacy.smoothing, 0, 1)
          : DEFAULT_ANALYSIS_CONFIG.general.smoothing,
    },
    frequencyResponse: {
      bandwidth: coerceOption(
        frequencyResponse.bandwidth ?? legacy.freqResponseBandwidth,
        FREQ_RESPONSE_BANDWIDTH_OPTIONS,
        DEFAULT_ANALYSIS_CONFIG.frequencyResponse.bandwidth,
      ),
      dbSpan: coerceOption(
        frequencyResponse.dbSpan,
        FREQ_RESPONSE_DB_SPAN_OPTIONS,
        DEFAULT_ANALYSIS_CONFIG.frequencyResponse.dbSpan,
      ),
    },
    spectrogram: {
      dbMin: Math.min(dbMin, dbMax),
      dbMax: Math.max(dbMin, dbMax),
      gridDensity: coerceOption(
        spectrogram.gridDensity,
        SPECTROGRAM_GRID_DENSITY_OPTIONS,
        DEFAULT_ANALYSIS_CONFIG.spectrogram.gridDensity,
      ),
    },
    loudness: {
      targetPreset: coerceOption(
        loudness.targetPreset,
        LOUDNESS_TARGET_PRESET_OPTIONS,
        DEFAULT_ANALYSIS_CONFIG.loudness.targetPreset,
      ),
      referenceMode: coerceOption(
        loudness.referenceMode,
        LOUDNESS_REFERENCE_MODE_OPTIONS,
        DEFAULT_ANALYSIS_CONFIG.loudness.referenceMode,
      ),
      showRmsGuides: typeof loudness.showRmsGuides === 'boolean'
        ? loudness.showRmsGuides
        : DEFAULT_ANALYSIS_CONFIG.loudness.showRmsGuides,
    },
  };
}

function loadFromStorage(): AnalysisConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneConfig(DEFAULT_ANALYSIS_CONFIG);
    return normalizeAnalysisConfig(JSON.parse(raw));
  } catch {
    return cloneConfig(DEFAULT_ANALYSIS_CONFIG);
  }
}

export class AnalysisConfigStore {
  private readonly listeners = new Set<() => void>();
  private config: AnalysisConfig;

  constructor() {
    this.config = loadFromStorage();
    this.persist();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): AnalysisConfig => this.config;

  setFftSize(size: FftSizeOption): void {
    if (this.config.general.fftSize === size) return;
    this.replace({
      ...this.config,
      general: { ...this.config.general, fftSize: size },
    });
  }

  setSmoothing(value: number): void {
    const smoothing = clamp(value, 0, 1);
    if (this.config.general.smoothing === smoothing) return;
    this.replace({
      ...this.config,
      general: { ...this.config.general, smoothing },
    });
  }

  setBandwidth(bandwidth: FreqResponseBandwidth): void {
    if (this.config.frequencyResponse.bandwidth === bandwidth) return;
    this.replace({
      ...this.config,
      frequencyResponse: { ...this.config.frequencyResponse, bandwidth },
    });
  }

  setFrequencyResponseDbSpan(dbSpan: FreqResponseDbSpan): void {
    if (this.config.frequencyResponse.dbSpan === dbSpan) return;
    this.replace({
      ...this.config,
      frequencyResponse: { ...this.config.frequencyResponse, dbSpan },
    });
  }

  setSpectroDbRange(min: number, max: number): void {
    const dbMin = clamp(min, -120, -20);
    const dbMax = clamp(max, -10, 0);
    const nextMin = Math.min(dbMin, dbMax);
    const nextMax = Math.max(dbMin, dbMax);
    if (this.config.spectrogram.dbMin === nextMin && this.config.spectrogram.dbMax === nextMax) return;
    this.replace({
      ...this.config,
      spectrogram: { ...this.config.spectrogram, dbMin: nextMin, dbMax: nextMax },
    });
  }

  setSpectrogramGridDensity(gridDensity: SpectrogramGridDensity): void {
    if (this.config.spectrogram.gridDensity === gridDensity) return;
    this.replace({
      ...this.config,
      spectrogram: { ...this.config.spectrogram, gridDensity },
    });
  }

  setLoudnessTargetPreset(targetPreset: LoudnessTargetPreset): void {
    if (this.config.loudness.targetPreset === targetPreset) return;
    this.replace({
      ...this.config,
      loudness: { ...this.config.loudness, targetPreset },
    });
  }

  setLoudnessReferenceMode(referenceMode: LoudnessReferenceMode): void {
    if (this.config.loudness.referenceMode === referenceMode) return;
    this.replace({
      ...this.config,
      loudness: { ...this.config.loudness, referenceMode },
    });
  }

  setShowRmsGuides(showRmsGuides: boolean): void {
    if (this.config.loudness.showRmsGuides === showRmsGuides) return;
    this.replace({
      ...this.config,
      loudness: { ...this.config.loudness, showRmsGuides },
    });
  }

  restoreDefaults(): void {
    this.replace(cloneConfig(DEFAULT_ANALYSIS_CONFIG));
  }

  restore(snapshot: AnalysisConfig): void {
    this.replace(normalizeAnalysisConfig(snapshot));
  }

  private replace(config: AnalysisConfig): void {
    this.config = config;
    this.persist();
    this.emit();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // Ignore storage quota failures. The live config remains usable.
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
