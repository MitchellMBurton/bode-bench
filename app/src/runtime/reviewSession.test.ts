import { describe, expect, it } from 'vitest';

import { DEFAULT_ANALYSIS_CONFIG } from '../audio/analysisConfig';
import { RANGE_NOTE_MAX_LENGTH } from '../types';
import {
  buildReviewSessionFilename,
  matchReviewSessionSource,
  migrateReviewSessionV1ToV2,
  parseReviewSession,
  REVIEW_SESSION_SCHEMA,
  REVIEW_SESSION_VERSION,
} from './reviewSession';

describe('review session helpers', () => {
  it('normalizes a valid v1 session', () => {
    const result = parseReviewSession({
      schema: REVIEW_SESSION_SCHEMA,
      version: REVIEW_SESSION_VERSION,
      metadata: { savedAt: '2026-04-26T00:00:00.000Z' },
      source: {
        filename: 'episode.mkv',
        kind: 'video',
        durationS: 120,
        mediaKey: 'episode.mkv:100:1',
        size: 100,
        lastModified: 1,
        sourcePath: 'C:\\media\\episode.mkv',
      },
      review: {
        markers: [{ id: 2, time: 8, label: 'M2' }],
        pendingRangeStartS: 3,
        rangeMarks: [{ id: 5, startS: 20, endS: 10, label: 'R5', note: 'reverse input' }],
        selectedRangeId: 5,
      },
      workspace: {
        visualMode: 'optic',
        grayscale: true,
        analysisConfig: DEFAULT_ANALYSIS_CONFIG,
        layout: { 'console:root': [0.7, 0.3] },
        runtimeTrayHeight: 320,
      },
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.session.review.rangeMarks[0]).toMatchObject({
      startS: 10,
      endS: 20,
      note: 'reverse input',
    });
    expect(result.session.workspace.visualMode).toBe('optic');
    expect(result.session.workspace.layout['console:root']).toEqual([0.7, 0.3]);
    expect(result.session.source).toMatchObject({
      size: 100,
      lastModified: 1,
      sourcePath: 'C:\\media\\episode.mkv',
    });
  });

  it('rejects unsupported versions', () => {
    const result = parseReviewSession({
      schema: REVIEW_SESSION_SCHEMA,
      version: 999,
    });

    expect(result.kind).toBe('error');
  });

  it('drops invalid markers and ranges while keeping the session usable', () => {
    const result = parseReviewSession({
      schema: REVIEW_SESSION_SCHEMA,
      version: REVIEW_SESSION_VERSION,
      review: {
        markers: [{ id: 1, time: 2, label: 'M1' }, { id: 'bad' }],
        rangeMarks: [{ id: 2, startS: 1, endS: 1, label: 'R2' }, { id: 3, startS: 2, endS: 4, label: 'R3' }],
      },
      workspace: {},
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.session.review.markers).toHaveLength(1);
    expect(result.session.review.rangeMarks).toHaveLength(1);
  });

  it('drops ranges that clamp to zero duration', () => {
    const result = parseReviewSession({
      schema: REVIEW_SESSION_SCHEMA,
      version: REVIEW_SESSION_VERSION,
      review: {
        rangeMarks: [
          { id: 2, startS: -5, endS: -1, label: 'R2' },
          { id: 3, startS: -1, endS: 2, label: 'R3' },
        ],
      },
      workspace: {},
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.session.review.rangeMarks).toEqual([
      expect.objectContaining({ id: 3, startS: 0, endS: 2 }),
    ]);
  });

  it('trims and caps range notes at the session boundary', () => {
    const result = parseReviewSession({
      schema: REVIEW_SESSION_SCHEMA,
      version: REVIEW_SESSION_VERSION,
      review: {
        rangeMarks: [{
          id: 1,
          startS: 2,
          endS: 4,
          label: 'R1',
          note: `  ${'a'.repeat(RANGE_NOTE_MAX_LENGTH + 12)}\ncheck  `,
        }],
      },
      workspace: {},
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.session.review.rangeMarks[0].note).toBe('a'.repeat(RANGE_NOTE_MAX_LENGTH));
  });

  it('sanitizes review session filenames', () => {
    expect(buildReviewSessionFilename('Episode 01: Angel.mkv', new Date('2026-04-26T00:00:00.000Z')))
      .toBe('Episode_01_Angel_2026-04-26T00-00-00-000Z.review-session.json');
  });

  it('matches by exact media key or filename with duration tolerance', () => {
    expect(matchReviewSessionSource(
      { filename: 'a.wav', kind: 'audio', durationS: 10, mediaKey: 'key', size: null, lastModified: null, sourcePath: null },
      { filename: 'b.wav', kind: 'audio', durationS: 9, mediaKey: 'key', size: 10, lastModified: 1, sourcePath: 'C:\\media\\b.wav' },
    ).kind).toBe('match');

    expect(matchReviewSessionSource(
      { filename: 'a.wav', kind: 'audio', durationS: 10, mediaKey: null, size: null, lastModified: null, sourcePath: null },
      { filename: 'a.wav', kind: 'audio', durationS: 10.5, mediaKey: null, size: null, lastModified: null, sourcePath: null },
    ).kind).toBe('match');

    expect(matchReviewSessionSource(
      { filename: 'a.wav', kind: 'audio', durationS: 10, mediaKey: 'a.wav:100:1', size: null, lastModified: null, sourcePath: null },
      { filename: 'a.wav', kind: 'audio', durationS: 10, mediaKey: 'a.wav:200:2', size: 200, lastModified: 2, sourcePath: 'C:\\media\\a.wav' },
    ).kind).toBe('mismatch');

    expect(matchReviewSessionSource(
      { filename: 'a.wav', kind: 'audio', durationS: 10, mediaKey: null, size: null, lastModified: null, sourcePath: null },
      { filename: 'b.wav', kind: 'audio', durationS: 10, mediaKey: null, size: null, lastModified: null, sourcePath: null },
    ).kind).toBe('mismatch');

    expect(matchReviewSessionSource(
      { filename: 'a.wav', kind: 'audio', durationS: 10, mediaKey: 'same-key', size: null, lastModified: null, sourcePath: null },
      { filename: 'a.wav', kind: 'video', durationS: 10, mediaKey: 'same-key', size: null, lastModified: null, sourcePath: null },
    ).kind).toBe('mismatch');
  });

  it('migrates v1 source identity into v2 primary source', () => {
    const parsed = parseReviewSession({
      schema: REVIEW_SESSION_SCHEMA,
      version: REVIEW_SESSION_VERSION,
      metadata: { savedAt: '2026-04-26T00:00:00.000Z' },
      source: {
        filename: 'primary.wav',
        kind: 'audio',
        durationS: 90,
        mediaKey: 'primary.wav:100:1',
        size: 100,
        lastModified: 1,
        sourcePath: 'C:\\media\\primary.wav',
      },
      review: {
        markers: [],
        rangeMarks: [],
      },
      workspace: {},
    });

    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;

    const migrated = migrateReviewSessionV1ToV2(parsed.session);

    expect(migrated.version).toBe(2);
    expect(migrated.sources.primary).toEqual(parsed.session.source);
    expect(migrated.sources.reference).toBeNull();
  });
});
