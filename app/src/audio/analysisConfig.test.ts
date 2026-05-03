import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisConfigStore, DEFAULT_ANALYSIS_CONFIG } from './analysisConfig';

const STORAGE_KEY = 'console:analysis-config';

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

describe('AnalysisConfigStore', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('migrates a legacy flat snapshot into the grouped config shape', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      fftSize: 4096,
      smoothing: 0.45,
      freqResponseBandwidth: '1/3-oct',
      spectroDbMin: -92,
      spectroDbMax: -6,
    }));

    const store = new AnalysisConfigStore();

    expect(store.getSnapshot()).toEqual({
      general: {
        fftSize: 4096,
        smoothing: 0.45,
      },
      frequencyResponse: {
        bandwidth: '1/3-oct',
        dbSpan: 54,
      },
      spectrogram: {
        dbMin: -92,
        dbMax: -6,
        gridDensity: 'major+minor',
        viewMode: 'live',
      },
      loudness: {
        targetPreset: 'stream',
        referenceMode: 'all',
        showRmsGuides: true,
      },
    });
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null')).toEqual(store.getSnapshot());
  });

  it('normalizes invalid grouped values back to the supported ranges and defaults', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      general: {
        fftSize: 123,
        smoothing: 99,
      },
      frequencyResponse: {
        bandwidth: 'bad',
        dbSpan: 99,
      },
      spectrogram: {
        dbMin: -200,
        dbMax: 12,
        gridDensity: 'noise',
        viewMode: 'sideways',
      },
      loudness: {
        targetPreset: 'tv',
        referenceMode: 'solo',
        showRmsGuides: 'yes',
      },
    }));

    const store = new AnalysisConfigStore();

    expect(store.getSnapshot()).toEqual({
      general: {
        fftSize: 8192,
        smoothing: 1,
      },
      frequencyResponse: {
        bandwidth: '1/6-oct',
        dbSpan: 54,
      },
      spectrogram: {
        dbMin: -120,
        dbMax: 0,
        gridDensity: 'major+minor',
        viewMode: 'live',
      },
      loudness: {
        targetPreset: 'stream',
        referenceMode: 'all',
        showRmsGuides: true,
      },
    });
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null')).toEqual(store.getSnapshot());
  });

  it('persists updates and restore-defaults in the grouped shape', () => {
    const store = new AnalysisConfigStore();

    store.setFftSize(16384);
    store.setSmoothing(0.33);
    store.setBandwidth('1-oct');
    store.setFrequencyResponseDbSpan(72);
    store.setSpectroDbRange(-48, -72);
    store.setSpectrogramGridDensity('major-only');
    store.setSpectrogramViewMode('window');
    store.setLoudnessTargetPreset('cinema');
    store.setLoudnessReferenceMode('target-only');
    store.setShowRmsGuides(false);

    expect(store.getSnapshot()).toEqual({
      general: {
        fftSize: 16384,
        smoothing: 0.33,
      },
      frequencyResponse: {
        bandwidth: '1-oct',
        dbSpan: 72,
      },
      spectrogram: {
        dbMin: -48,
        dbMax: -10,
        gridDensity: 'major-only',
        viewMode: 'window',
      },
      loudness: {
        targetPreset: 'cinema',
        referenceMode: 'target-only',
        showRmsGuides: false,
      },
    });

    store.restoreDefaults();

    expect(store.getSnapshot()).toEqual(DEFAULT_ANALYSIS_CONFIG);
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null')).toEqual(DEFAULT_ANALYSIS_CONFIG);
  });
});
