import { describe, expect, it } from 'vitest';

import { buildReviewReportFilename, buildReviewReportMarkdown } from './reviewReport';

describe('review report helpers', () => {
  it('builds a stable markdown report sorted by range time', () => {
    const report = buildReviewReportMarkdown({
      filename: 'Episode 01.mkv',
      durationS: 90,
      currentTimeS: 12.5,
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
    expect(report).toContain('| R2 | 00:20.0 | 00:24.0 | 00:04.0 | chorus |');
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
      selectedRangeId: null,
      generatedAt: new Date('2026-04-25T10:30:00.000Z'),
      rangeMarks: [
        { id: 1, label: 'R|1', startS: 1, endS: 2, note: 'phase | drift\ncheck' },
      ],
    });

    expect(markdown).toContain('| R\\|1 | 00:01.0 | 00:02.0 | 00:01.0 | phase \\| drift<br>check |');
  });
});
