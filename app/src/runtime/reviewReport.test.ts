import { describe, expect, it } from 'vitest';

import {
  buildReviewReportFilename,
  buildReviewReportMarkdown,
  buildReviewReportRangeMeasurement,
  formatReviewReportRangeMeasurement,
} from './reviewReport';
import type { RangeIntelligenceSummary } from './rangeIntelligence';

const unavailableLoudness = {
  momentaryLufs: null,
  integratedLufs: null,
  hasIntegratedLufs: false,
  truePeakDb: null,
};

describe('review report helpers', () => {
  it('builds a stable markdown report sorted by range time', () => {
    const report = buildReviewReportMarkdown({
      filename: 'Episode 01.mkv',
      durationS: 90,
      currentTimeS: 12.5,
      loudnessSummary: unavailableLoudness,
      scrubIdentifyingInfo: false,
      selectedRangeId: 2,
      generatedAt: new Date('2026-04-25T10:30:00.000Z'),
      rangeMarks: [
        { id: 2, startS: 20, endS: 24, label: 'R2', note: 'chorus' },
        { id: 1, startS: 5, endS: 8, label: 'R1' },
      ],
    });

    expect(report).toContain('- Session: Episode 01.mkv');
    expect(report).toContain('- Saved ranges: 2');
    expect(report).toContain('- Active range: R2');
    expect(report).toContain('## Loudness Summary');
    expect(report).toContain('| R2 | 00:20.0 | 00:24.0 | 00:04.0 | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | chorus |');
    expect(report.indexOf('| R1 |')).toBeLessThan(report.indexOf('| R2 |'));
  });

  it('sanitizes suggested markdown filenames', () => {
    expect(buildReviewReportFilename('Episode 01: Angel.mkv', new Date('2026-04-25T10:30:00.000Z')))
      .toBe('Episode_01_Angel_review_2026-04-25T10-30-00-000Z.md');
  });

  it('escapes markdown table-sensitive range labels and notes', () => {
    const markdown = buildReviewReportMarkdown({
      filename: 'mix.wav',
      durationS: 10,
      currentTimeS: 0,
      loudnessSummary: unavailableLoudness,
      scrubIdentifyingInfo: false,
      selectedRangeId: null,
      generatedAt: new Date('2026-04-25T10:30:00.000Z'),
      rangeMarks: [
        { id: 1, label: 'R|1', startS: 1, endS: 2, note: 'phase | drift\ncheck' },
      ],
    });

    expect(markdown).toContain('| R\\|1 | 00:01.0 | 00:02.0 | 00:01.0 | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | phase \\| drift<br>check |');
  });

  it('includes supplied loudness measurements with explicit units', () => {
    const markdown = buildReviewReportMarkdown({
      filename: 'mix.wav',
      durationS: 10,
      currentTimeS: 0,
      loudnessSummary: {
        momentaryLufs: -18.25,
        integratedLufs: -20.75,
        hasIntegratedLufs: true,
        truePeakDb: -1.2,
      },
      scrubIdentifyingInfo: false,
      selectedRangeId: null,
      generatedAt: new Date('2026-04-25T10:30:00.000Z'),
      rangeMarks: [],
    });

    expect(markdown).toContain('- Momentary: -18.3 LUFS');
    expect(markdown).toContain('- Integrated: -20.8 LUFS');
    expect(markdown).toContain('- True peak: -1.2 dBTP');
  });

  it('renders unavailable loudness instead of guessing missing values', () => {
    const markdown = buildReviewReportMarkdown({
      filename: 'mix.wav',
      durationS: 10,
      currentTimeS: 0,
      loudnessSummary: {
        momentaryLufs: null,
        integratedLufs: -22,
        hasIntegratedLufs: false,
        truePeakDb: null,
      },
      scrubIdentifyingInfo: false,
      selectedRangeId: null,
      generatedAt: new Date('2026-04-25T10:30:00.000Z'),
      rangeMarks: [],
    });

    expect(markdown).toContain('- Momentary: Unavailable');
    expect(markdown).toContain('- Integrated: Unavailable');
    expect(markdown).toContain('- True peak: Unavailable');
  });

  it('scrubs the source filename from the report body', () => {
    const markdown = buildReviewReportMarkdown({
      filename: 'Private Session.wav',
      durationS: 10,
      currentTimeS: 0,
      loudnessSummary: unavailableLoudness,
      scrubIdentifyingInfo: true,
      selectedRangeId: null,
      generatedAt: new Date('2026-04-25T10:30:00.000Z'),
      rangeMarks: [],
    });

    expect(markdown).toContain('- Session: <source>');
    expect(markdown).not.toContain('Private Session.wav');
  });

  it('renders per-range measurements when supplied', () => {
    const markdown = buildReviewReportMarkdown({
      filename: 'mix.wav',
      durationS: 10,
      currentTimeS: 0,
      loudnessSummary: unavailableLoudness,
      scrubIdentifyingInfo: false,
      selectedRangeId: null,
      generatedAt: new Date('2026-04-25T10:30:00.000Z'),
      rangeMarks: [
        { id: 1, label: 'R1', startS: 1, endS: 2, note: 'check' },
      ],
      rangeMeasurements: [{
        rangeId: 1,
        summaryText: '1.0s  M -18.2  PK -4  F0 80-110  CORR +.92  Lo-Mid',
        peakDb: -4.25,
        meanMomentaryLufs: -18.24,
        f0MinHz: 80,
        f0MaxHz: 110,
        meanPhaseCorrelation: 0.92,
        strongestBandLabel: 'Lo-Mid',
        coverageRatio: 1,
        sampleCount: 12,
      }],
    });

    expect(markdown).toContain('| Label | Start | End | Length | Measure | Peak | F0 | Corr | Coverage | Note |');
    expect(markdown).toContain('| R1 | 00:01.0 | 00:02.0 | 00:01.0 | -18.2 LUFS / Lo-Mid | -4.3 dB | 80-110 Hz | +0.92 | 100% | check |');
  });

  it('renders partial measurement coverage explicitly', () => {
    const markdown = buildReviewReportMarkdown({
      filename: 'mix.wav',
      durationS: 10,
      currentTimeS: 0,
      loudnessSummary: unavailableLoudness,
      scrubIdentifyingInfo: false,
      selectedRangeId: null,
      generatedAt: new Date('2026-04-25T10:30:00.000Z'),
      rangeMarks: [
        { id: 1, label: 'R1', startS: 1, endS: 4 },
      ],
      rangeMeasurements: [{
        rangeId: 1,
        summaryText: '3.0s  M -20.0  PARTIAL 42%',
        peakDb: null,
        meanMomentaryLufs: -20,
        f0MinHz: null,
        f0MaxHz: null,
        meanPhaseCorrelation: null,
        strongestBandLabel: null,
        coverageRatio: 0.42,
        sampleCount: 2,
      }],
    });

    expect(markdown).toContain('| R1 | 00:01.0 | 00:04.0 | 00:03.0 | -20.0 LUFS | Unavailable | Unavailable | Unavailable | Partial 42% |  |');
  });

  it('formats range measurement summaries without implying certainty', () => {
    const emptySummary: RangeIntelligenceSummary = {
      durationS: 3,
      sampleCount: 0,
      coverageRatio: 0,
      peakDb: null,
      meanMomentaryLufs: null,
      f0MinHz: null,
      f0MaxHz: null,
      meanCentroidHz: null,
      meanPhaseCorrelation: null,
      strongestBandLabel: null,
    };
    const measuredSummary: RangeIntelligenceSummary = {
      durationS: 1,
      sampleCount: 8,
      coverageRatio: 0.76,
      peakDb: -1.6,
      meanMomentaryLufs: -16.55,
      f0MinHz: 219,
      f0MaxHz: 221,
      meanCentroidHz: 800,
      meanPhaseCorrelation: -0.12,
      strongestBandLabel: 'Body',
    };

    expect(formatReviewReportRangeMeasurement(buildReviewReportRangeMeasurement(1, emptySummary))).toEqual({
      measure: 'Unavailable',
      peak: 'Unavailable',
      f0: 'Unavailable',
      corr: 'Unavailable',
      coverage: 'Unavailable',
    });
    expect(formatReviewReportRangeMeasurement(buildReviewReportRangeMeasurement(2, measuredSummary))).toEqual({
      measure: '-16.6 LUFS / Body',
      peak: '-1.6 dB',
      f0: '220 Hz',
      corr: '-0.12',
      coverage: 'Partial 76%',
    });
  });
});
