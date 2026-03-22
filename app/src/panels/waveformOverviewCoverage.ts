import type { TimelineProfile } from '../runtime/performanceProfile';

export interface WaveformOverviewViewRange {
  readonly start: number;
  readonly end: number;
}

export interface StreamedScoutTarget {
  readonly colStart: number;
  readonly colEnd: number;
  readonly timeStart: number;
  readonly timeEnd: number;
  readonly time: number;
}

export type DetailRenderMode = 'detail' | 'session-scaffold';

export const SHORT_STREAMED_DETAIL_FULL_VIEW_S = 45;
export const DETAIL_READY_RATIO = 0.7;
export const DETAIL_SCAFFOLD_RATIO = 0.18;
export const FULL_VIEW_SPAN_RATIO = 0.6;
const STREAMED_DETAIL_SECONDS_PER_TARGET = 0.5;

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function buildBisectionSlots(count: number): number[] {
  const slots: number[] = [];
  const queue: Array<[number, number]> = [[0, count - 1]];
  while (queue.length > 0 && slots.length < count) {
    const [lo, hi] = queue.shift()!;
    const mid = lo + Math.floor((hi - lo) / 2);
    slots.push(mid);
    if (lo < mid) queue.push([lo, mid - 1]);
    if (mid < hi) queue.push([mid + 1, hi]);
  }
  return slots;
}

function buildScoutTargets(
  cols: number,
  duration: number,
  targetCount: number,
  rangeStart: number,
  rangeEnd: number,
): StreamedScoutTarget[] {
  if (cols <= 0 || duration <= 0) return [];

  const clampedStart = clampNumber(rangeStart, 0, duration);
  const clampedEnd = clampNumber(rangeEnd, clampedStart, duration);
  const rangeSpan = Math.max(0, clampedEnd - clampedStart);
  if (rangeSpan <= 0) return [];

  const boundedTargetCount = Math.max(1, targetCount);
  const slots = buildBisectionSlots(boundedTargetCount);

  return slots.map((slot) => {
    const timeStart = clampedStart + (slot / boundedTargetCount) * rangeSpan;
    const timeEnd = clampedStart + ((slot + 1) / boundedTargetCount) * rangeSpan;
    const colStart = Math.max(0, Math.min(cols - 1, Math.floor((timeStart / duration) * cols)));
    const colEnd = Math.max(
      colStart,
      Math.min(cols - 1, Math.ceil((timeEnd / duration) * cols) - 1),
    );

    return {
      colStart,
      colEnd,
      timeStart,
      timeEnd,
      time: timeStart + (timeEnd - timeStart) / 2,
    };
  });
}

export function buildSessionScoutTargets(
  cols: number,
  duration: number,
  timeline: TimelineProfile,
): StreamedScoutTarget[] {
  const targetCount = Math.max(1, Math.min(cols, timeline.scoutTargetSamples));
  return buildScoutTargets(cols, duration, targetCount, 0, duration);
}

export function coverageRatioInRange(
  coverageMap: Uint8Array | null,
  start: number,
  end: number,
  duration: number,
): number {
  if (!coverageMap || coverageMap.length === 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;

  const clampedStart = clampNumber(start, 0, duration);
  const clampedEnd = clampNumber(end, clampedStart, duration);
  if (clampedEnd <= clampedStart) return 0;

  const indexStart = Math.max(0, Math.floor((clampedStart / duration) * coverageMap.length));
  const indexEnd = Math.min(
    coverageMap.length - 1,
    Math.max(indexStart, Math.ceil((clampedEnd / duration) * coverageMap.length) - 1),
  );

  let covered = 0;
  let total = 0;
  for (let index = indexStart; index <= indexEnd; index++) {
    total++;
    if (coverageMap[index] !== 0) covered++;
  }

  return total > 0 ? covered / total : 0;
}

export function shouldUseFullViewDetailScout(duration: number, viewSpanRatio: number): boolean {
  return duration <= SHORT_STREAMED_DETAIL_FULL_VIEW_S || viewSpanRatio >= FULL_VIEW_SPAN_RATIO;
}

export function chooseDetailRenderMode(
  detailCoverageRatio: number,
  sessionCoverageRatio: number,
): DetailRenderMode {
  if (detailCoverageRatio >= DETAIL_READY_RATIO) return 'detail';
  if (sessionCoverageRatio >= DETAIL_READY_RATIO) return 'session-scaffold';
  if (detailCoverageRatio < DETAIL_SCAFFOLD_RATIO && sessionCoverageRatio > detailCoverageRatio) {
    return 'session-scaffold';
  }
  return 'detail';
}

export function buildDetailScoutRange(
  duration: number,
  viewRange: WaveformOverviewViewRange,
): WaveformOverviewViewRange {
  const safeDuration = Math.max(0, duration);
  const span = Math.max(0, viewRange.end - viewRange.start);
  const viewSpanRatio = safeDuration > 0 ? span / safeDuration : 0;
  if (safeDuration > 0 && shouldUseFullViewDetailScout(safeDuration, viewSpanRatio) && safeDuration <= SHORT_STREAMED_DETAIL_FULL_VIEW_S) {
    return { start: 0, end: safeDuration };
  }
  return viewRange;
}

export function buildDetailScoutTargets(
  cols: number,
  duration: number,
  viewRange: WaveformOverviewViewRange,
  timeline: TimelineProfile,
): StreamedScoutTarget[] {
  if (cols <= 0 || duration <= 0) return [];

  const scoutRange = buildDetailScoutRange(duration, viewRange);
  const span = Math.max(0, scoutRange.end - scoutRange.start);
  if (span <= 0) return [];

  const targetCount = Math.max(1, Math.min(Math.ceil(span / STREAMED_DETAIL_SECONDS_PER_TARGET), timeline.scoutTargetSamples));

  return buildScoutTargets(cols, duration, targetCount, scoutRange.start, scoutRange.end);
}

export function targetNeedsSample(
  coverageMap: Uint8Array | null,
  target: StreamedScoutTarget,
): boolean {
  if (!coverageMap || coverageMap.length === 0) return true;
  for (let index = target.colStart; index <= target.colEnd; index++) {
    if (coverageMap[index] === 0) return true;
  }
  return false;
}
