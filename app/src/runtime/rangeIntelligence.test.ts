import { describe, expect, it } from 'vitest';
import { CANVAS } from '../theme';
import { formatRangeIntelligenceSummary, summarizeRangeIntelligenceSamples, type RangeIntelligenceSample } from './rangeIntelligence';

function sample(overrides: Partial<RangeIntelligenceSample> = {}): RangeIntelligenceSample {
  return {
    timeS: 0,
    fileId: 1,
    peakDb: -12,
    momentaryLufs: -18,
    f0Hz: 88,
    centroidHz: 200,
    phaseCorrelation: 0.9,
    bandIndex: 1,
    ...overrides,
  };
}

describe('range intelligence summaries', () => {
  it('returns duration and no measurement when no samples cover the range', () => {
    const summary = summarizeRangeIntelligenceSamples([], { startS: 10, endS: 14.25 });

    expect(summary.sampleCount).toBe(0);
    expect(summary.durationS).toBeCloseTo(4.25);
    expect(formatRangeIntelligenceSummary(summary)).toBe('4.3s  MEASURE --');
  });

  it('summarizes observed measurements inside the selected range', () => {
    const summary = summarizeRangeIntelligenceSamples([
      sample({ timeS: 1, peakDb: -12, momentaryLufs: -18, f0Hz: 80, phaseCorrelation: 0.8, bandIndex: 1 }),
      sample({ timeS: 1.1, peakDb: -6, momentaryLufs: -16, f0Hz: 110, phaseCorrelation: 1, bandIndex: 2 }),
      sample({ timeS: 1.2, peakDb: -9, momentaryLufs: null, f0Hz: null, phaseCorrelation: 0.9, bandIndex: 2 }),
      sample({ timeS: 8, peakDb: -1, momentaryLufs: -3, f0Hz: 400, phaseCorrelation: -1, bandIndex: 5 }),
    ], { startS: 1, endS: 1.25 });

    expect(summary.sampleCount).toBe(3);
    expect(summary.peakDb).toBe(-6);
    expect(summary.meanMomentaryLufs).toBeCloseTo(-17);
    expect(summary.f0MinHz).toBe(80);
    expect(summary.f0MaxHz).toBe(110);
    expect(summary.meanPhaseCorrelation).toBeCloseTo(0.9);
    expect(summary.strongestBandLabel).toBe(CANVAS.frequencyBands[2].label);
  });

  it('formats compact row and active summaries', () => {
    const summary = summarizeRangeIntelligenceSamples([
      sample({ timeS: 2, peakDb: -2.2, momentaryLufs: -14.6, f0Hz: 82, phaseCorrelation: 0.94, bandIndex: 1 }),
      sample({ timeS: 2.1, peakDb: -1.1, momentaryLufs: -14.2, f0Hz: 84, phaseCorrelation: 0.92, bandIndex: 1 }),
    ], { startS: 2, endS: 2.12 });

    expect(formatRangeIntelligenceSummary(summary, 'row')).toContain('PK -1');
    expect(formatRangeIntelligenceSummary(summary, 'row')).toContain('Lo-Mid');
    expect(formatRangeIntelligenceSummary(summary, 'active')).not.toContain('PK');
    expect(formatRangeIntelligenceSummary(summary, 'active')).not.toContain('Lo-Mid');
  });
});
