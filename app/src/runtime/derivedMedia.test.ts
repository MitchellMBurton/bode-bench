import { describe, expect, it } from 'vitest';

import type { MediaJobSpec } from '../types';
import { DerivedMediaStore } from './derivedMedia';

const EXPORT_JOB_SPEC: MediaJobSpec = {
  kind: 'clip-export',
  sourceAssetId: 'asset-1',
  label: 'Prelude clip',
  clip: {
    startS: 12,
    endS: 24,
    presetId: 'wav-24',
  },
  tuning: null,
  preset: {
    id: 'wav-24',
    label: 'WAV 24-bit PCM',
    container: 'wav',
    audioCodec: 'pcm_s24le',
    videoCodec: null,
    qualityMode: 'exact-master',
  },
  processor: {
    kind: 'ffmpeg',
    name: 'ffmpeg',
    version: null,
  },
};

describe('DerivedMediaStore', () => {
  it('adds, deletes, and clears markers with sequential labels', () => {
    const store = new DerivedMediaStore();

    const first = store.addMarker(1.25);
    const second = store.addMarker(3.5);

    expect(first.label).toBe('M1');
    expect(second.label).toBe('M2');
    expect(store.getSnapshot().markers).toHaveLength(2);

    store.deleteMarker(first.id);
    expect(store.getSnapshot().markers).toEqual([second]);

    store.clearMarkers();
    expect(store.getSnapshot().markers).toEqual([]);
  });

  it('adds normalized range marks with sequential labels', () => {
    const store = new DerivedMediaStore();

    const range = store.addRange(9, 4);

    expect(range.label).toBe('R1');
    expect(range.startS).toBe(4);
    expect(range.endS).toBe(9);
    expect(store.getSnapshot().rangeMarks).toEqual([range]);
    expect(store.getSnapshot().selectedRangeId).toBe(range.id);
  });

  it('tracks explicit range selection and falls back when a selected range is removed', () => {
    const store = new DerivedMediaStore();

    const first = store.addRange(4, 8);
    const second = store.addRange(10, 12.5);

    store.selectRange(first.id);
    expect(store.getSnapshot().selectedRangeId).toBe(first.id);

    store.deleteRange(first.id);
    expect(store.getSnapshot().selectedRangeId).toBe(second.id);
  });

  it('tracks and commits a pending in-point into a range', () => {
    const store = new DerivedMediaStore();

    store.setPendingRangeStart(8.5);
    const range = store.commitPendingRange(12);

    expect(range.label).toBe('R1');
    expect(range.startS).toBe(8.5);
    expect(range.endS).toBe(12);
    expect(store.getSnapshot().pendingRangeStartS).toBeNull();
  });

  it('clears a pending in-point without touching committed ranges', () => {
    const store = new DerivedMediaStore();

    store.setPendingRangeStart(6);
    store.clearPendingRangeStart();

    expect(store.getSnapshot().pendingRangeStartS).toBeNull();
    expect(store.getSnapshot().rangeMarks).toEqual([]);
  });

  it('updates a range note and trims surrounding whitespace', () => {
    const store = new DerivedMediaStore();
    const range = store.addRange(4, 8);

    store.updateRangeNote(range.id, '  vocal level mismatch  ');
    expect(store.getSnapshot().rangeMarks[0].note).toBe('vocal level mismatch');
  });

  it('clears a range note when set to empty or whitespace-only', () => {
    const store = new DerivedMediaStore();
    const range = store.addRange(4, 8);

    store.updateRangeNote(range.id, 'temporary');
    expect(store.getSnapshot().rangeMarks[0].note).toBe('temporary');

    store.updateRangeNote(range.id, '   ');
    expect(store.getSnapshot().rangeMarks[0].note).toBeUndefined();
  });

  it('does not emit when a range note update is a no-op', () => {
    const store = new DerivedMediaStore();
    const range = store.addRange(4, 8);
    let emitCount = 0;
    store.subscribe(() => {
      emitCount++;
    });

    store.updateRangeNote(range.id, '');
    expect(emitCount).toBe(0);

    store.updateRangeNote(range.id, 'first');
    expect(emitCount).toBe(1);

    store.updateRangeNote(range.id, '  first  ');
    expect(emitCount).toBe(1);
  });

  it('ignores note updates for unknown range ids', () => {
    const store = new DerivedMediaStore();
    store.addRange(4, 8);
    let emitCount = 0;
    store.subscribe(() => {
      emitCount++;
    });

    store.updateRangeNote(999, 'phantom');
    expect(emitCount).toBe(0);
  });

  it('rejects zero-length range marks', () => {
    const store = new DerivedMediaStore();

    expect(() => store.addRange(5, 5)).toThrow('range marks require a non-zero duration');
    expect(store.addRange(5, 7).label).toBe('R1');
  });

  it('tracks job state transitions', () => {
    const store = new DerivedMediaStore();

    const job = store.enqueueJob(EXPORT_JOB_SPEC);
    store.markJobRunning(job.id, 48, 'encoding');
    store.completeJob(job.id, {
      artifacts: [
        {
          id: 'artifact-1',
          role: 'media',
          path: 'C:/exports/prelude.wav',
          sha256: null,
          createdAtMs: 1,
        },
      ],
      metrics: {
        durationS: 12,
      },
    });

    expect(store.getSnapshot().jobs).toHaveLength(1);
    expect(store.getSnapshot().jobs[0].status).toBe('completed');
    expect(store.getSnapshot().jobs[0].progress?.percent).toBe(100);
    expect(store.getSnapshot().jobs[0].result?.artifacts[0].path).toBe('C:/exports/prelude.wav');
  });

  it('removes queued jobs without disturbing the rest of the queue', () => {
    const store = new DerivedMediaStore();

    const first = store.enqueueJob(EXPORT_JOB_SPEC);
    const second = store.enqueueJob({
      ...EXPORT_JOB_SPEC,
      label: 'Second clip',
    });

    store.deleteJob(first.id);

    expect(store.getSnapshot().jobs).toHaveLength(1);
    expect(store.getSnapshot().jobs[0].id).toBe(second.id);
    expect(store.getSnapshot().jobs[0].spec.label).toBe('Second clip');
  });

  it('restores markers, ranges, and selection from a session snapshot', () => {
    const store = new DerivedMediaStore();

    store.restore({
      markers: [
        { id: 3, time: 7, label: 'M3' },
        { id: 7, time: 21.5, label: 'M7' },
      ],
      pendingRangeStartS: null,
      rangeMarks: [
        { id: 4, startS: 9, endS: 4, label: 'R4', note: '  cued in  ' },
        { id: 11, startS: 30, endS: 36, label: 'R11' },
      ],
      selectedRangeId: 11,
    });

    const snapshot = store.getSnapshot();
    expect(snapshot.markers).toHaveLength(2);
    expect(snapshot.rangeMarks[0]).toMatchObject({ id: 4, startS: 4, endS: 9, note: 'cued in' });
    expect(snapshot.rangeMarks[1].note).toBeUndefined();
    expect(snapshot.selectedRangeId).toBe(11);

    // Future ids continue past the highest restored id.
    expect(store.addMarker(5).label).toBe('M8');
    expect(store.addRange(40, 42).label).toBe('R12');
  });

  it('falls back to the latest range when restored selection is missing', () => {
    const store = new DerivedMediaStore();

    store.restore({
      markers: [],
      pendingRangeStartS: null,
      rangeMarks: [
        { id: 1, startS: 1, endS: 2, label: 'R1' },
        { id: 2, startS: 3, endS: 4, label: 'R2' },
      ],
      selectedRangeId: 999,
    });

    expect(store.getSnapshot().selectedRangeId).toBe(2);
  });

  it('resets markers, ranges, jobs, and id counters together', () => {
    const store = new DerivedMediaStore();

    store.addMarker(2);
    store.addRange(2, 4);
    store.enqueueJob(EXPORT_JOB_SPEC);
    store.reset();

    expect(store.getSnapshot()).toEqual({
      markers: [],
      pendingRangeStartS: null,
      rangeMarks: [],
      selectedRangeId: null,
      jobs: [],
    });

    expect(store.addMarker(7).label).toBe('M1');
    expect(store.addRange(7, 9).label).toBe('R1');
  });
});
