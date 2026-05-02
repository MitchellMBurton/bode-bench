import { describe, expect, it } from 'vitest';
import { CANVAS } from '../theme';
import type { AudioFrame } from '../types';
import { buildLiveMeasurementProbe } from './measurementProbe';

function makeFrame(overrides: Partial<AudioFrame> = {}): AudioFrame {
  const frequencyDb = new Float32Array(1024);
  frequencyDb.fill(CANVAS.dbMin);
  const frequencyDbRight = new Float32Array(1024);
  frequencyDbRight.fill(CANVAS.dbMin);
  return {
    currentTime: 0,
    timeDomain: new Float32Array(2048),
    timeDomainRight: new Float32Array(2048),
    frequencyDb,
    frequencyDbRight,
    peakLeft: 0.25,
    peakRight: 0.125,
    rmsLeft: 0.1,
    rmsRight: 0.08,
    sampleRate: 44100,
    playId: 1,
    fileId: 1,
    displayGain: 1,
    fftBinCount: frequencyDb.length,
    spectralCentroid: 211,
    f0Hz: 88,
    f0Confidence: 0.72,
    phaseCorrelation: 0.9,
    ...overrides,
  };
}

describe('buildLiveMeasurementProbe', () => {
  it('returns idle values without a frame or transport time', () => {
    const probe = buildLiveMeasurementProbe(null, null, null);

    expect(probe.time).toBe('--');
    expect(probe.levels).toBe('L/R --/--');
    expect(probe.momentaryLufs).toBe('M --');
    expect(probe.f0).toBe('F0 --');
    expect(probe.centroid).toBe('CENT --');
    expect(probe.band).toBe('BAND --');
    expect(probe.correlation).toBe('CORR --');
  });

  it('formats silence levels as unavailable', () => {
    const probe = buildLiveMeasurementProbe(makeFrame({ peakLeft: 0, peakRight: 0 }), null, 29.75);

    expect(probe.time).toBe('00:29.7');
    expect(probe.levels).toBe('L/R --/--');
  });

  it('does not report low-confidence pitch as a measurement', () => {
    const probe = buildLiveMeasurementProbe(makeFrame({ f0Hz: 112, f0Confidence: 0.2 }), null, 0);

    expect(probe.f0).toBe('F0 --');
  });

  it('formats valid frame and loudness measurements', () => {
    const probe = buildLiveMeasurementProbe(
      makeFrame({ peakLeft: 0.25, peakRight: 0.125, phaseCorrelation: 0.9 }),
      -12.7,
      29.75,
    );

    expect(probe.levels).toBe('L/R -12/-18 dB');
    expect(probe.momentaryLufs).toBe('M -12.7 LUFS');
    expect(probe.f0).toBe('F0 88 Hz');
    expect(probe.centroid).toBe('CENT 211 Hz');
    expect(probe.correlation).toBe('CORR +0.90');
  });

  it('selects the strongest frequency band', () => {
    const frequencyDb = new Float32Array(1024);
    frequencyDb.fill(CANVAS.dbMin);
    const sampleRate = 44100;
    const binHz = sampleRate / (frequencyDb.length * 2);
    const midBin = Math.round(500 / binHz);
    frequencyDb[midBin] = -12;
    frequencyDb[midBin + 1] = -13;

    const probe = buildLiveMeasurementProbe(makeFrame({ frequencyDb, sampleRate }), null, 0);

    expect(probe.band).toBe('BAND Mid');
  });

  it('treats missing loudness as unavailable', () => {
    const missing = buildLiveMeasurementProbe(makeFrame(), null, 0);

    expect(missing.momentaryLufs).toBe('M --');
  });
});
