import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VideoSyncController } from './videoSyncController';

describe('VideoSyncController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks hard sync as a pending seek that can resume playback', () => {
    const controller = new VideoSyncController();

    controller.noteHardSync(100, 250, true);

    expect(controller.isSeekPending()).toBe(true);
    expect(controller.hasPendingPlay()).toBe(true);
    expect(controller.shouldHoldSync(200)).toBe(true);
    expect(controller.wasHardSyncedRecently(250, 200)).toBe(true);
  });

  it('deduplicates and clears recovery scheduling', () => {
    const controller = new VideoSyncController();
    const recover = vi.fn();

    controller.scheduleRecovery(100, recover);
    controller.scheduleRecovery(100, recover);
    vi.advanceTimersByTime(99);
    expect(recover).not.toHaveBeenCalled();

    controller.clearRecoveryTimer();
    vi.advanceTimersByTime(1);
    expect(recover).not.toHaveBeenCalled();
  });

  it('settles can-play and seeked transitions without leaving seek pending', () => {
    const controller = new VideoSyncController();

    controller.noteHardSync(100, 200, true);
    controller.noteCanPlay(150, 120);
    expect(controller.isSeekPending()).toBe(false);
    expect(controller.shouldHoldSync(250)).toBe(true);

    controller.setPersistentDriftSinceMs(180);
    controller.noteSeeked(260, 120);
    expect(controller.isSeekPending()).toBe(false);
    expect(controller.getDecisionState(260).persistentDriftSinceMs).toBe(0);
  });

  it('tracks recovery cooldown and playback resume', () => {
    const controller = new VideoSyncController();

    controller.noteRecovery(100, 220);

    expect(controller.hasPendingPlay()).toBe(true);
    expect(controller.canRecover(180, 120)).toBe(false);
    expect(controller.canRecover(221, 120)).toBe(true);
    expect(controller.shouldHoldSync(250)).toBe(true);
  });

  it('clears persistent drift only after catchup and grace settle', () => {
    const controller = new VideoSyncController();

    controller.markTransportCatchup(100, 200);
    controller.markSyncGrace(100, 150);
    controller.setPersistentDriftSinceMs(120);
    expect(controller.notePlaying(200)).toBe(false);
    expect(controller.getDecisionState(200).persistentDriftSinceMs).toBe(120);

    expect(controller.notePlaying(320)).toBe(true);
    expect(controller.getDecisionState(320).persistentDriftSinceMs).toBe(0);
  });

  it('resets the full sync state', () => {
    const controller = new VideoSyncController();
    const recover = vi.fn();

    controller.noteHardSync(100, 200, true);
    controller.markTransportCatchup(100, 300);
    controller.setPersistentDriftSinceMs(180);
    controller.scheduleRecovery(100, recover);
    controller.reset();

    expect(controller.isSeekPending()).toBe(false);
    expect(controller.hasPendingPlay()).toBe(false);
    expect(controller.shouldHoldSync(101)).toBe(false);
    expect(controller.isCatchupActive(101)).toBe(false);
    expect(controller.getDecisionState(101)).toEqual({
      transportCatchupActive: false,
      lastHardSyncAtMs: 0,
      lastRecoveryAtMs: 0,
      persistentDriftSinceMs: 0,
    });

    vi.advanceTimersByTime(100);
    expect(recover).not.toHaveBeenCalled();
  });
});