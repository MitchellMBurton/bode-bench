import { describe, expect, it } from 'vitest';

import { analyzeFrameOnMainThread, mainThreadAnalysisAdapter } from './analysisRuntime';
import { computeAudioFrameFeatures } from './frameAnalysis';
import type { AnalysisFramePayload } from './analysisWorkerProtocol';

function createPayload(): AnalysisFramePayload {
  return {
    currentTimeS: 0,
    sampleRateHz: 48_000,
    fftBinCount: 1024,
    playId: 0,
    fileId: 0,
    displayGain: 1,
    analysisGeneration: 1,
    timeDomainLeft: Float32Array.from({ length: 2048 }, (_, index) =>
      0.5 * Math.sin((index / 48_000) * Math.PI * 2 * 240),
    ),
    timeDomainRight: Float32Array.from({ length: 2048 }, (_, index) =>
      0.5 * Math.sin((index / 48_000) * Math.PI * 2 * 240),
    ),
    frequencyDbLeft: new Float32Array(1024).fill(-90),
    frequencyDbRight: new Float32Array(1024).fill(-90),
  };
}

describe('analysis runtime adapter', () => {
  it('matches the existing frame feature computation on the main thread', () => {
    const payload = createPayload();

    expect(analyzeFrameOnMainThread(payload)).toEqual(
      computeAudioFrameFeatures(
        payload.timeDomainLeft,
        payload.timeDomainRight,
        payload.frequencyDbLeft,
        payload.sampleRateHz,
      ),
    );
  });

  it('exposes the current analysis runtime mode explicitly', () => {
    expect(mainThreadAnalysisAdapter.mode).toBe('main-thread');
    expect(mainThreadAnalysisAdapter.analyzeFrame(createPayload()).f0Hz).toBeGreaterThan(230);
  });
});
