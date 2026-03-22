import { describe, expect, it } from 'vitest';
import {
  buildDetailScoutRange,
  buildDetailScoutTargets,
  chooseDetailRenderMode,
  coverageRatioInRange,
  shouldUseFullViewDetailScout,
  targetNeedsSample,
} from './waveformOverviewCoverage';

const timeline = {
  sessionMapMinCols: 512,
  sessionMapMaxCols: 1536,
  sessionMapSecondsPerCol: 8,
  detailMapMaxCols: 65536,
  scoutTargetSamples: 1536,
  scoutSamplesPerTarget: 2,
  scoutActiveDelayMs: 72,
  scoutStressDelayMs: 420,
} as const;

describe('waveformOverviewCoverage', () => {
  it('computes coverage ratio inside a range', () => {
    const coverage = new Uint8Array([1, 1, 0, 0]);
    expect(coverageRatioInRange(coverage, 0, 2, 4)).toBe(1);
    expect(coverageRatioInRange(coverage, 0, 4, 4)).toBe(0.5);
    expect(coverageRatioInRange(coverage, 2, 4, 4)).toBe(0);
  });

  it('uses full-duration detail scouting for short media', () => {
    expect(shouldUseFullViewDetailScout(30, 0.2)).toBe(true);
    expect(buildDetailScoutRange(30, { start: 4, end: 12 })).toEqual({ start: 0, end: 30 });
  });

  it('keeps current-view detail scouting for longer media', () => {
    expect(shouldUseFullViewDetailScout(120, 0.2)).toBe(false);
    expect(buildDetailScoutRange(120, { start: 20, end: 40 })).toEqual({ start: 20, end: 40 });
  });

  it('chooses coarse scaffold only when detail coverage is very low', () => {
    expect(chooseDetailRenderMode(0.8, 0.1)).toBe('detail');
    expect(chooseDetailRenderMode(0.05, 0.5)).toBe('session-scaffold');
    expect(chooseDetailRenderMode(0.3, 0.9)).toBe('session-scaffold');
    expect(chooseDetailRenderMode(0.3, 0.4)).toBe('detail');
  });

  it('builds detail scout targets inside the current view for long media', () => {
    const targets = buildDetailScoutTargets(1024, 120, { start: 20, end: 40 }, timeline);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0]!.timeStart).toBeGreaterThanOrEqual(20);
    expect(targets.at(-1)!.timeEnd).toBeLessThanOrEqual(40);
  });

  it('tests detail targets against detail coverage rather than coarse session coverage', () => {
    const targets = buildDetailScoutTargets(1024, 120, { start: 20, end: 40 }, timeline);
    const detailCoverage = new Uint8Array(1024);
    const sessionCoverage = new Uint8Array(1024).fill(1);

    expect(targets.some((target) => targetNeedsSample(detailCoverage, target))).toBe(true);
    expect(targets.some((target) => targetNeedsSample(sessionCoverage, target))).toBe(false);
  });
});
