import type {
  Marker,
  MediaJobRecord,
  MediaJobResult,
  MediaJobSpec,
  RangeMark,
} from '../types';

type Listener = () => void;

export interface DerivedMediaSnapshot {
  readonly markers: readonly Marker[];
  readonly pendingRangeStartS: number | null;
  readonly rangeMarks: readonly RangeMark[];
  readonly selectedRangeId: number | null;
  readonly jobs: readonly MediaJobRecord[];
}

const EMPTY_SNAPSHOT: DerivedMediaSnapshot = {
  markers: [],
  pendingRangeStartS: null,
  rangeMarks: [],
  selectedRangeId: null,
  jobs: [],
};

function normalizeRange(startS: number, endS: number): { startS: number; endS: number } {
  const normalizedStartS = Math.max(0, Math.min(startS, endS));
  const normalizedEndS = Math.max(0, Math.max(startS, endS));
  if (normalizedStartS === normalizedEndS) {
    throw new Error('range marks require a non-zero duration');
  }
  return {
    startS: normalizedStartS,
    endS: normalizedEndS,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export class DerivedMediaStore {
  private listeners = new Set<Listener>();
  private snapshot: DerivedMediaSnapshot = EMPTY_SNAPSHOT;
  private nextMarkerId = 1;
  private nextRangeId = 1;
  private nextJobId = 1;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): DerivedMediaSnapshot => {
    return this.snapshot;
  };

  reset(): void {
    if (
      this.snapshot.markers.length === 0 &&
      this.snapshot.pendingRangeStartS === null &&
      this.snapshot.rangeMarks.length === 0 &&
      this.snapshot.selectedRangeId === null &&
      this.snapshot.jobs.length === 0
    ) {
      this.nextMarkerId = 1;
      this.nextRangeId = 1;
      this.nextJobId = 1;
      return;
    }

    this.nextMarkerId = 1;
    this.nextRangeId = 1;
    this.nextJobId = 1;
    this.snapshot = EMPTY_SNAPSHOT;
    this.emit();
  }

  addMarker(time: number): Marker {
    const markerId = this.nextMarkerId++;
    const marker: Marker = {
      id: markerId,
      time: Math.max(0, time),
      label: `M${markerId}`,
    };
    this.snapshot = {
      ...this.snapshot,
      markers: [...this.snapshot.markers, marker],
    };
    this.emit();
    return marker;
  }

  deleteMarker(markerId: number): void {
    const nextMarkers = this.snapshot.markers.filter((marker) => marker.id !== markerId);
    if (nextMarkers.length === this.snapshot.markers.length) return;
    this.snapshot = {
      ...this.snapshot,
      markers: nextMarkers,
    };
    this.emit();
  }

  clearMarkers(): void {
    if (this.snapshot.markers.length === 0) return;
    this.snapshot = {
      ...this.snapshot,
      markers: [],
    };
    this.emit();
  }

  setPendingRangeStart(time: number): number {
    const pendingRangeStartS = Math.max(0, time);
    if (this.snapshot.pendingRangeStartS === pendingRangeStartS) return pendingRangeStartS;
    this.snapshot = {
      ...this.snapshot,
      pendingRangeStartS,
    };
    this.emit();
    return pendingRangeStartS;
  }

  clearPendingRangeStart(): void {
    if (this.snapshot.pendingRangeStartS === null) return;
    this.snapshot = {
      ...this.snapshot,
      pendingRangeStartS: null,
    };
    this.emit();
  }

  addRange(startS: number, endS: number): RangeMark {
    const normalizedRange = normalizeRange(startS, endS);
    const rangeId = this.nextRangeId++;
    const rangeMark: RangeMark = {
      id: rangeId,
      label: `R${rangeId}`,
      startS: normalizedRange.startS,
      endS: normalizedRange.endS,
    };
    this.snapshot = {
      ...this.snapshot,
      pendingRangeStartS: null,
      rangeMarks: [...this.snapshot.rangeMarks, rangeMark],
      selectedRangeId: rangeId,
    };
    this.emit();
    return rangeMark;
  }

  commitPendingRange(endS: number): RangeMark {
    if (this.snapshot.pendingRangeStartS === null) {
      throw new Error('cannot create a range without an in-point');
    }
    return this.addRange(this.snapshot.pendingRangeStartS, endS);
  }

  updateRange(rangeId: number, startS: number, endS: number): RangeMark {
    const normalizedRange = normalizeRange(startS, endS);
    let updatedRange: RangeMark | null = null;
    let changed = false;

    const nextRanges = this.snapshot.rangeMarks.map((rangeMark) => {
      if (rangeMark.id !== rangeId) return rangeMark;
      if (rangeMark.startS === normalizedRange.startS && rangeMark.endS === normalizedRange.endS) {
        updatedRange = rangeMark;
        return rangeMark;
      }
      changed = true;
      updatedRange = {
        ...rangeMark,
        startS: normalizedRange.startS,
        endS: normalizedRange.endS,
      };
      return updatedRange;
    });

    assert(updatedRange, 'cannot update an unknown range');
    if (!changed) return updatedRange;

    this.snapshot = {
      ...this.snapshot,
      rangeMarks: nextRanges,
      selectedRangeId: rangeId,
    };
    this.emit();
    return updatedRange;
  }

  deleteRange(rangeId: number): void {
    const nextRanges = this.snapshot.rangeMarks.filter((rangeMark) => rangeMark.id !== rangeId);
    if (nextRanges.length === this.snapshot.rangeMarks.length) return;
    this.snapshot = {
      ...this.snapshot,
      rangeMarks: nextRanges,
      selectedRangeId:
        this.snapshot.selectedRangeId === rangeId
          ? (nextRanges[nextRanges.length - 1]?.id ?? null)
          : this.snapshot.selectedRangeId,
    };
    this.emit();
  }

  selectRange(rangeId: number | null): void {
    if (rangeId !== null) {
      const rangeExists = this.snapshot.rangeMarks.some((rangeMark) => rangeMark.id === rangeId);
      assert(rangeExists, 'cannot select an unknown range');
    }
    if (this.snapshot.selectedRangeId === rangeId) return;
    this.snapshot = {
      ...this.snapshot,
      selectedRangeId: rangeId,
    };
    this.emit();
  }

  clearRanges(): void {
    if (this.snapshot.rangeMarks.length === 0 && this.snapshot.selectedRangeId === null) return;
    this.snapshot = {
      ...this.snapshot,
      rangeMarks: [],
      selectedRangeId: null,
    };
    this.emit();
  }

  enqueueJob(spec: MediaJobSpec): MediaJobRecord {
    const queuedAtMs = Date.now();
    const job: MediaJobRecord = {
      id: `job-${this.nextJobId++}`,
      spec,
      status: 'queued',
      queuedAtMs,
      startedAtMs: null,
      finishedAtMs: null,
      progress: null,
      result: null,
      errorText: null,
    };
    this.snapshot = {
      ...this.snapshot,
      jobs: [...this.snapshot.jobs, job],
    };
    this.emit();
    return job;
  }

  deleteJob(jobId: string): void {
    const nextJobs = this.snapshot.jobs.filter((job) => job.id !== jobId);
    if (nextJobs.length === this.snapshot.jobs.length) return;
    this.snapshot = {
      ...this.snapshot,
      jobs: nextJobs,
    };
    this.emit();
  }

  markJobRunning(jobId: string, percent: number, message: string): void {
    this.updateJob(jobId, (job) => ({
      ...job,
      status: 'running',
      startedAtMs: job.startedAtMs ?? Date.now(),
      progress: {
        percent,
        message,
      },
    }));
  }

  completeJob(jobId: string, result: MediaJobResult): void {
    this.updateJob(jobId, (job) => ({
      ...job,
      status: 'completed',
      finishedAtMs: Date.now(),
      progress: {
        percent: 100,
        message: 'completed',
      },
      result,
      errorText: null,
    }));
  }

  failJob(jobId: string, errorText: string): void {
    this.updateJob(jobId, (job) => ({
      ...job,
      status: 'failed',
      finishedAtMs: Date.now(),
      errorText,
    }));
  }

  cancelJob(jobId: string): void {
    this.updateJob(jobId, (job) => ({
      ...job,
      status: 'canceled',
      finishedAtMs: Date.now(),
    }));
  }

  clearJobs(): void {
    if (this.snapshot.jobs.length === 0) return;
    this.snapshot = {
      ...this.snapshot,
      jobs: [],
    };
    this.emit();
  }

  private updateJob(
    jobId: string,
    update: (job: MediaJobRecord) => MediaJobRecord,
  ): void {
    let didChange = false;
    const nextJobs = this.snapshot.jobs.map((job) => {
      if (job.id !== jobId) return job;
      didChange = true;
      return update(job);
    });
    if (!didChange) return;
    this.snapshot = {
      ...this.snapshot,
      jobs: nextJobs,
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
