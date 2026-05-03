import type { RangeMark } from '../types';
import { formatTransportTime } from '../utils/format';
import { formatRangeIntelligenceSummary, type RangeIntelligenceSummary } from './rangeIntelligence';

export interface ReviewReportRangeMeasurement {
  readonly rangeId: number;
  readonly summaryText: string;
  readonly peakDb: number | null;
  readonly meanMomentaryLufs: number | null;
  readonly f0MinHz: number | null;
  readonly f0MaxHz: number | null;
  readonly meanPhaseCorrelation: number | null;
  readonly strongestBandLabel: string | null;
  readonly coverageRatio: number;
  readonly sampleCount: number;
}

export interface FormattedReviewReportRangeMeasurement {
  readonly measure: string;
  readonly peak: string;
  readonly f0: string;
  readonly corr: string;
  readonly coverage: string;
}

export interface ReviewReportInput {
  readonly filename: string | null;
  readonly durationS: number;
  readonly currentTimeS: number;
  readonly loudnessSummary: {
    readonly momentaryLufs: number | null;
    readonly integratedLufs: number | null;
    readonly hasIntegratedLufs: boolean;
    readonly truePeakDb: number | null;
  };
  readonly scrubIdentifyingInfo: boolean;
  readonly rangeMarks: readonly RangeMark[];
  readonly rangeMeasurements?: readonly ReviewReportRangeMeasurement[];
  readonly selectedRangeId: number | null;
  readonly generatedAt?: Date;
}

function sanitizeFilenamePart(value: string): string {
  const cleaned = value
    .replace(/\.[^/.\\]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'session';
}

function formatDateForFilename(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function escapeMarkdownTableCell(value: string): string {
  return value
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|');
}

function formatLufs(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'Unavailable' : `${value.toFixed(1)} LUFS`;
}

function formatTruePeak(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'Unavailable' : `${value.toFixed(1)} dBTP`;
}

function formatPeakDb(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'Unavailable' : `${value.toFixed(1)} dB`;
}

function formatF0Range(minHz: number | null, maxHz: number | null): string {
  if (minHz === null || maxHz === null || !Number.isFinite(minHz) || !Number.isFinite(maxHz)) {
    return 'Unavailable';
  }
  const min = Math.round(minHz);
  const max = Math.round(maxHz);
  return Math.abs(max - min) <= 2 ? `${Math.round((minHz + maxHz) / 2)} Hz` : `${min}-${max} Hz`;
}

function formatCorrelation(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'Unavailable';
  }
  const clamped = Math.max(-1, Math.min(1, value));
  return `${clamped >= 0 ? '+' : ''}${clamped.toFixed(2)}`;
}

function formatCoverage(measurement: ReviewReportRangeMeasurement | null): string {
  if (measurement === null || measurement.sampleCount <= 0) {
    return 'Unavailable';
  }
  const percent = Math.round(Math.max(0, Math.min(1, measurement.coverageRatio)) * 100);
  return measurement.coverageRatio > 0 && measurement.coverageRatio < 0.8
    ? `Partial ${percent}%`
    : `${percent}%`;
}

export function buildReviewReportRangeMeasurement(
  rangeId: number,
  summary: RangeIntelligenceSummary,
): ReviewReportRangeMeasurement {
  return {
    rangeId,
    summaryText: summary.sampleCount > 0
      ? formatRangeIntelligenceSummary(summary, 'row')
      : 'Unavailable',
    peakDb: summary.peakDb,
    meanMomentaryLufs: summary.meanMomentaryLufs,
    f0MinHz: summary.f0MinHz,
    f0MaxHz: summary.f0MaxHz,
    meanPhaseCorrelation: summary.meanPhaseCorrelation,
    strongestBandLabel: summary.strongestBandLabel,
    coverageRatio: summary.coverageRatio,
    sampleCount: summary.sampleCount,
  };
}

export function formatReviewReportRangeMeasurement(
  measurement: ReviewReportRangeMeasurement | null,
): FormattedReviewReportRangeMeasurement {
  if (measurement === null || measurement.sampleCount <= 0) {
    return {
      measure: 'Unavailable',
      peak: 'Unavailable',
      f0: 'Unavailable',
      corr: 'Unavailable',
      coverage: 'Unavailable',
    };
  }

  const measureParts: string[] = [];
  if (measurement.meanMomentaryLufs !== null && Number.isFinite(measurement.meanMomentaryLufs)) {
    measureParts.push(formatLufs(measurement.meanMomentaryLufs));
  }
  if (measurement.strongestBandLabel) {
    measureParts.push(measurement.strongestBandLabel);
  }

  return {
    measure: measureParts.length > 0 ? measureParts.join(' / ') : 'Unavailable',
    peak: formatPeakDb(measurement.peakDb),
    f0: formatF0Range(measurement.f0MinHz, measurement.f0MaxHz),
    corr: formatCorrelation(measurement.meanPhaseCorrelation),
    coverage: formatCoverage(measurement),
  };
}

export function buildReviewReportFilename(filename: string | null, generatedAt = new Date()): string {
  return `${sanitizeFilenamePart(filename ?? 'session')}_review_${formatDateForFilename(generatedAt)}.md`;
}

export function buildReviewReportMarkdown(input: ReviewReportInput): string {
  const generatedAt = input.generatedAt ?? new Date();
  const ranges = input.rangeMarks.slice().sort((a, b) => a.startS - b.startS || a.id - b.id);
  const selectedRange = input.selectedRangeId === null
    ? null
    : ranges.find((range) => range.id === input.selectedRangeId) ?? null;
  const totalRangeS = ranges.reduce((sum, range) => sum + Math.max(0, range.endS - range.startS), 0);
  const sessionLabel = input.scrubIdentifyingInfo
    ? '<source>'
    : input.filename ?? 'Untitled session';
  const integratedLufs = input.loudnessSummary.hasIntegratedLufs
    ? input.loudnessSummary.integratedLufs
    : null;
  const measurementsByRangeId = new Map(
    (input.rangeMeasurements ?? []).map((measurement) => [measurement.rangeId, measurement]),
  );

  const lines = [
    '# Review Report',
    '',
    `- Session: ${sessionLabel}`,
    `- Duration: ${formatTransportTime(input.durationS)}`,
    `- Transport: ${formatTransportTime(input.currentTimeS)}`,
    `- Generated: ${generatedAt.toISOString()}`,
    `- Saved ranges: ${ranges.length}`,
    `- Total selected time: ${formatTransportTime(totalRangeS)}`,
    selectedRange ? `- Active range: ${selectedRange.label}` : '- Active range: None',
    '',
    '## Loudness Summary',
    '',
    `- Momentary: ${formatLufs(input.loudnessSummary.momentaryLufs)}`,
    `- Integrated: ${formatLufs(integratedLufs)}`,
    `- True peak: ${formatTruePeak(input.loudnessSummary.truePeakDb)}`,
    '',
    '## Ranges',
    '',
  ];

  if (ranges.length === 0) {
    lines.push('No saved ranges.');
  } else {
    lines.push('| Label | Start | End | Length | Measure | Peak | F0 | Corr | Coverage | Note |');
    lines.push('| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- |');
    for (const range of ranges) {
      const measurement = formatReviewReportRangeMeasurement(measurementsByRangeId.get(range.id) ?? null);
      lines.push(`| ${escapeMarkdownTableCell(range.label)} | ${formatTransportTime(range.startS)} | ${formatTransportTime(range.endS)} | ${formatTransportTime(range.endS - range.startS)} | ${escapeMarkdownTableCell(measurement.measure)} | ${escapeMarkdownTableCell(measurement.peak)} | ${escapeMarkdownTableCell(measurement.f0)} | ${escapeMarkdownTableCell(measurement.corr)} | ${escapeMarkdownTableCell(measurement.coverage)} | ${escapeMarkdownTableCell(range.note ?? '')} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function downloadReviewReport(report: string, filename: string): void {
  const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
