import { describe, expect, it } from 'vitest';

import {
  decideVideoSyncDecision,
  getAdaptiveVideoSyncProfile,
  getVideoCanPlayResyncDrift,
  getPausedVideoResyncDrift,
  getVideoResumeSettleMs,
  getVideoTransportRetuneTiming,
  getTransportStressFactor,
  getVideoHardSyncMinStep,
} from './videoSyncPolicy';

describe('getTransportStressFactor', () => {
  it('returns the baseline factor for normal playback', () => {
    expect(getTransportStressFactor(1, 0)).toBe(1);
  });

  it('raises the factor for slow playback and pitch shift', () => {
    expect(getTransportStressFactor(0.75, 7)).toBeGreaterThan(1);
  });

  it('clamps the factor to the configured maximum', () => {
    expect(getTransportStressFactor(0.1, 48)).toBe(2.35);
  });
});

describe('getAdaptiveVideoSyncProfile', () => {
  it('relaxes drift thresholds under high-load playback', () => {
    const normal = getAdaptiveVideoSyncProfile(1, 0, false);
    const highLoad = getAdaptiveVideoSyncProfile(1, 0, true);

    expect(highLoad.softSyncDrift).toBeGreaterThan(normal.softSyncDrift);
    expect(highLoad.hardSyncDrift).toBeGreaterThan(normal.hardSyncDrift);
    expect(highLoad.rateTrimGain).toBeLessThan(normal.rateTrimGain);
    expect(highLoad.rateTrimMax).toBeLessThan(normal.rateTrimMax);
  });
});

describe('step thresholds', () => {
  it('derives the hard-sync minimum step from the sync profile', () => {
    const profile = getAdaptiveVideoSyncProfile(1, 0, false);
    expect(getVideoHardSyncMinStep(false, profile)).toBeCloseTo(Math.max(0.04, profile.softSyncDrift * 0.55), 5);
  });

  it('keeps paused resync drift above the hard-sync minimum step', () => {
    const profile = getAdaptiveVideoSyncProfile(1, 0, true);
    expect(getPausedVideoResyncDrift(true, profile)).toBeGreaterThanOrEqual(getVideoHardSyncMinStep(true, profile));
  });

  it('derives canplay resync drift from the sync profile', () => {
    const profile = getAdaptiveVideoSyncProfile(1, 0, false);
    expect(getVideoCanPlayResyncDrift(false, profile)).toBeCloseTo(Math.max(0.04, profile.softSyncDrift * 0.9), 5);
  });

  it('derives resume settle time from the sync profile', () => {
    const profile = getAdaptiveVideoSyncProfile(0.75, 5, false);
    expect(getVideoResumeSettleMs(profile)).toBe(Math.max(250, Math.round(profile.settleMs * 0.5)));
  });
});

describe('transport retune timing', () => {
  it('keeps retune timing at configured minimums', () => {
    const timing = getVideoTransportRetuneTiming(1, 0);

    expect(timing.stressFactor).toBe(1);
    expect(timing.settleMs).toBe(330);
    expect(timing.catchupMs).toBe(1600);
  });

  it('stretches retune timing under transport stress', () => {
    const timing = getVideoTransportRetuneTiming(0.7, 7);

    expect(timing.stressFactor).toBeGreaterThan(1);
    expect(timing.settleMs).toBeGreaterThan(330);
    expect(timing.catchupMs).toBeGreaterThan(1600);
  });
});

describe('decideVideoSyncDecision', () => {
  it('trims playback rate for moderate drift', () => {
    const decision = decideVideoSyncDecision({
      drift: 0.1,
      currentTime: 12,
      baseRate: 1,
      nowMs: 2000,
      playbackRate: 1,
      pitchSemitones: 0,
      highLoadVideoMode: false,
      transportCatchupActive: false,
      lastHardSyncAtMs: 0,
      lastRecoveryAtMs: 0,
      persistentDriftSinceMs: 0,
    });

    expect(decision.kind).toBe('rate-trim');
    if (decision.kind !== 'rate-trim') {
      throw new Error('expected rate-trim decision');
    }
    expect(decision.nextPlaybackRate).toBeCloseTo(1.024, 3);
    expect(decision.nextPersistentDriftSinceMs).toBe(0);
  });

  it('prefers hard sync for large drift after cooldown', () => {
    const decision = decideVideoSyncDecision({
      drift: 0.4,
      currentTime: 33,
      baseRate: 1,
      nowMs: 2000,
      playbackRate: 1,
      pitchSemitones: 0,
      highLoadVideoMode: false,
      transportCatchupActive: false,
      lastHardSyncAtMs: 0,
      lastRecoveryAtMs: 0,
      persistentDriftSinceMs: 0,
    });

    expect(decision.kind).toBe('hard-sync');
    if (decision.kind !== 'hard-sync') {
      throw new Error('expected hard-sync decision');
    }
    expect(decision.targetTime).toBe(33);
    expect(decision.driftMs).toBe(400);
    expect(decision.nextPersistentDriftSinceMs).toBe(0);
  });

  it('keeps drift in soft correction during transport catchup', () => {
    const decision = decideVideoSyncDecision({
      drift: 0.4,
      currentTime: 33,
      baseRate: 1,
      nowMs: 2000,
      playbackRate: 1,
      pitchSemitones: 0,
      highLoadVideoMode: false,
      transportCatchupActive: true,
      lastHardSyncAtMs: 0,
      lastRecoveryAtMs: 0,
      persistentDriftSinceMs: 0,
    });

    expect(decision.kind).toBe('rate-trim');
  });

  it('clears catchup state once drift is stable again', () => {
    const decision = decideVideoSyncDecision({
      drift: 0.01,
      currentTime: 5,
      baseRate: 1,
      nowMs: 1200,
      playbackRate: 1,
      pitchSemitones: 0,
      highLoadVideoMode: false,
      transportCatchupActive: true,
      lastHardSyncAtMs: 0,
      lastRecoveryAtMs: 0,
      persistentDriftSinceMs: 200,
    });

    expect(decision.kind).toBe('stable');
    if (decision.kind !== 'stable') {
      throw new Error('expected stable decision');
    }
    expect(decision.shouldClearCatchup).toBe(true);
    expect(decision.nextPersistentDriftSinceMs).toBe(0);
  });

  it('starts persistent drift tracking before recovery', () => {
    const nowMs = 1800;
    const decision = decideVideoSyncDecision({
      drift: 0.25,
      currentTime: 18,
      baseRate: 1,
      nowMs,
      playbackRate: 1,
      pitchSemitones: 0,
      highLoadVideoMode: false,
      transportCatchupActive: false,
      lastHardSyncAtMs: 0,
      lastRecoveryAtMs: 0,
      persistentDriftSinceMs: 0,
    });

    expect(decision.kind).toBe('rate-trim');
    expect(decision.nextPersistentDriftSinceMs).toBe(nowMs);
  });

  it('requests recovery when persistent drift lasts too long', () => {
    const decision = decideVideoSyncDecision({
      drift: 0.25,
      currentTime: 18,
      baseRate: 1,
      nowMs: 1800,
      playbackRate: 1,
      pitchSemitones: 0,
      highLoadVideoMode: false,
      transportCatchupActive: false,
      lastHardSyncAtMs: 700,
      lastRecoveryAtMs: 0,
      persistentDriftSinceMs: 1200,
    });

    expect(decision.kind).toBe('recover');
    expect(decision.nextPersistentDriftSinceMs).toBe(0);
  });
});