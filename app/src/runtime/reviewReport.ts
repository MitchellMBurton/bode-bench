import type { RangeMark } from '../types';
import { formatTransportTime } from '../utils/format';

export interface ReviewReportInput {
  readonly filename: string | null;
  readonly durationS: number;
  readonly currentTimeS: number;
  readonly rangeMarks: readonly RangeMark[];
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

  const lines = [
    '# Review Report',
    '',
    `- Session: ${input.filename ?? 'Untitled session'}`,
    `- Duration: ${formatTransportTime(input.durationS)}`,
    `- Transport: ${formatTransportTime(input.currentTimeS)}`,
    `- Generated: ${generatedAt.toISOString()}`,
    `- Saved ranges: ${ranges.length}`,
    `- Total selected time: ${formatTransportTime(totalRangeS)}`,
    selectedRange ? `- Active range: ${selectedRange.label}` : '- Active range: None',
    '',
    '## Ranges',
    '',
  ];

  if (ranges.length === 0) {
    lines.push('No saved ranges.');
  } else {
    lines.push('| Label | Start | End | Length | Note |');
    lines.push('| --- | ---: | ---: | ---: | --- |');
    for (const range of ranges) {
      lines.push(`| ${escapeMarkdownTableCell(range.label)} | ${formatTransportTime(range.startS)} | ${formatTransportTime(range.endS)} | ${formatTransportTime(range.endS - range.startS)} | ${escapeMarkdownTableCell(range.note ?? '')} |`);
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
