// ============================================================
// AnalysisConfigStore — tunable analysis parameters shared by
// the audio engine and canvas panels. Follows the same
// subscribe/getSnapshot pattern as DisplayModeStore so React
// chrome can re-render while RAF loops read the snapshot
// directly without triggering re-renders.
// ============================================================

import type { AnalysisConfig, FftSizeOption, FreqResponseBandwidth } from '../types';

const STORAGE_KEY = 'console:analysis-config';

const DEFAULTS: AnalysisConfig = {
  fftSize: 8192,
  smoothing: 0.8,
  freqResponseBandwidth: '1/6-oct',
  spectroDbMin: -80,
  spectroDbMax: 0,
};

const VALID_FFT_SIZES: readonly FftSizeOption[] = [2048, 4096, 8192, 16384];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function loadFromStorage(): AnalysisConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AnalysisConfig>;
    return {
      fftSize: VALID_FFT_SIZES.includes(parsed.fftSize as FftSizeOption) ? parsed.fftSize as FftSizeOption : DEFAULTS.fftSize,
      smoothing: typeof parsed.smoothing === 'number' ? clamp(parsed.smoothing, 0, 1) : DEFAULTS.smoothing,
      freqResponseBandwidth: (['1/12-oct', '1/6-oct', '1/3-oct', '1-oct'] as FreqResponseBandwidth[]).includes(parsed.freqResponseBandwidth as FreqResponseBandwidth)
        ? parsed.freqResponseBandwidth as FreqResponseBandwidth
        : DEFAULTS.freqResponseBandwidth,
      spectroDbMin: typeof parsed.spectroDbMin === 'number' ? clamp(parsed.spectroDbMin, -120, -20) : DEFAULTS.spectroDbMin,
      spectroDbMax: typeof parsed.spectroDbMax === 'number' ? clamp(parsed.spectroDbMax, -10, 0) : DEFAULTS.spectroDbMax,
    };
  } catch {
    return DEFAULTS;
  }
}

export class AnalysisConfigStore {
  private readonly listeners = new Set<() => void>();
  private config: AnalysisConfig;

  constructor() {
    this.config = loadFromStorage();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): AnalysisConfig => this.config;

  setFftSize(size: FftSizeOption): void {
    if (this.config.fftSize === size) return;
    this.update({ fftSize: size });
  }

  setSmoothing(value: number): void {
    const clamped = clamp(value, 0, 1);
    if (this.config.smoothing === clamped) return;
    this.update({ smoothing: clamped });
  }

  setBandwidth(bw: FreqResponseBandwidth): void {
    if (this.config.freqResponseBandwidth === bw) return;
    this.update({ freqResponseBandwidth: bw });
  }

  setSpectroDbRange(min: number, max: number): void {
    const clampedMin = clamp(min, -120, -20);
    const clampedMax = clamp(max, -10, 0);
    if (this.config.spectroDbMin === clampedMin && this.config.spectroDbMax === clampedMax) return;
    this.update({ spectroDbMin: clampedMin, spectroDbMax: clampedMax });
  }

  /** Restore from a previously serialised snapshot (future session persistence). */
  restore(snapshot: AnalysisConfig): void {
    this.config = { ...snapshot };
    this.persist();
    this.emit();
  }

  private update(partial: Partial<AnalysisConfig>): void {
    this.config = { ...this.config, ...partial };
    this.persist();
    this.emit();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch { /* quota exceeded — silent */ }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
