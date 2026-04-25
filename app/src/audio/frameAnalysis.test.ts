import { describe, expect, it } from 'vitest';

import { computeAudioFrameFeatures, detectFundamental } from './frameAnalysis';

function sineWave(frequencyHz: number, sampleRate: number, sampleCount: number, amplitude = 0.5): Float32Array {
  return Float32Array.from({ length: sampleCount }, (_, index) =>
    amplitude * Math.sin((index / sampleRate) * Math.PI * 2 * frequencyHz),
  );
}

describe('frame analysis', () => {
  it('detects the fundamental of a clean periodic frame', () => {
    const sampleRate = 48_000;
    const samples = sineWave(240, sampleRate, 2048);
    const result = detectFundamental(samples, sampleRate, 0.35);

    expect(result.f0).toBeGreaterThan(230);
    expect(result.f0).toBeLessThan(250);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('rejects quiet frames before autocorrelation work matters', () => {
    const result = detectFundamental(new Float32Array(2048), 48_000, 0);

    expect(result).toEqual({ f0: null, confidence: 0 });
  });

  it('computes stereo level, phase, centroid, and pitch features in one pass', () => {
    const sampleRate = 48_000;
    const left = sineWave(240, sampleRate, 2048, 0.5);
    const right = Float32Array.from(left, (value) => value * -1);
    const frequency = new Float32Array(1024).fill(-100);
    frequency[10] = -10;
    frequency[20] = -40;

    const features = computeAudioFrameFeatures(left, right, frequency, sampleRate);

    expect(features.peakLeft).toBeCloseTo(0.5, 3);
    expect(features.peakRight).toBeCloseTo(0.5, 3);
    expect(features.rmsLeft).toBeGreaterThan(0.3);
    expect(features.phaseCorrelation).toBeLessThan(-0.99);
    expect(features.spectralCentroid).toBeGreaterThan(200);
    expect(features.f0Hz).toBeGreaterThan(230);
    expect(features.f0Hz).toBeLessThan(250);
  });
});
