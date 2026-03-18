import { describe, it, expect } from 'vitest';
import { freqToX, xToFreq, formatHz, levelToDb, dbToFraction } from './canvas';

describe('freqToX', () => {
  it('maps minHz to x = 0', () => {
    expect(freqToX(20, 1000)).toBeCloseTo(0);
  });

  it('maps maxHz to x = width', () => {
    expect(freqToX(20000, 1000)).toBeCloseTo(1000);
  });

  it('maps 1 kHz to ~56.6% of width (log scale)', () => {
    const x = freqToX(1000, 1000);
    // (log10(1000) - log10(20)) / (log10(20000) - log10(20)) ≈ 0.566
    expect(x).toBeCloseTo(566.3, 0);
  });
});

describe('xToFreq', () => {
  it('maps x = 0 to minHz', () => {
    expect(xToFreq(0, 1000)).toBeCloseTo(20);
  });

  it('maps x = width to maxHz', () => {
    expect(xToFreq(1000, 1000)).toBeCloseTo(20000);
  });
});

describe('freqToX / xToFreq roundtrip', () => {
  it.each([20, 100, 440, 1000, 4000, 12000, 20000])(
    'roundtrips %d Hz within 1 Hz',
    (hz) => {
      expect(xToFreq(freqToX(hz, 800), 800)).toBeCloseTo(hz, 0);
    },
  );
});

describe('formatHz', () => {
  it.each([
    [20, '20 Hz'],
    [440, '440 Hz'],
    [999, '999 Hz'],
    [1000, '1.00 kHz'],
    [4320, '4.32 kHz'],
    [10000, '10.0 kHz'],
    [20000, '20.0 kHz'],
  ] as [number, string][])('formats %d Hz as %s', (input, expected) => {
    expect(formatHz(input)).toBe(expected);
  });
});

describe('levelToDb', () => {
  it('returns -Infinity for 0', () => {
    expect(levelToDb(0)).toBe(-Infinity);
  });

  it('returns 0 dB for full-scale (1)', () => {
    expect(levelToDb(1)).toBeCloseTo(0);
  });

  it('returns approximately -6 dB for 0.5', () => {
    expect(levelToDb(0.5)).toBeCloseTo(-6.02, 1);
  });
});

describe('dbToFraction', () => {
  it('clamps at 0 for dB below display range', () => {
    expect(dbToFraction(-200)).toBe(0);
  });

  it('clamps at 1 for 0 dBFS', () => {
    expect(dbToFraction(0)).toBeCloseTo(1);
  });

  it('maps midpoint correctly', () => {
    // CANVAS.dbMin = -80, dbMax = 0 → -40 dB maps to 0.5
    const mid = dbToFraction(-40);
    expect(mid).toBeCloseTo(0.5, 2);
  });
});
