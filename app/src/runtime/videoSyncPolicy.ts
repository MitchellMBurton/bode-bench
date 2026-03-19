export interface VideoSyncProfile {
  readonly settleMs: number;
  readonly softSyncDrift: number;
  readonly hardSyncDrift: number;
  readonly rateTrimGain: number;
  readonly rateTrimMax: number;
}

export interface VideoTransportRetuneTiming {
  readonly stressFactor: number;
  readonly settleMs: number;
  readonly catchupMs: number;
}

export interface VideoSyncDecisionInput {
  readonly drift: number;
  readonly currentTime: number;
  readonly baseRate: number;
  readonly nowMs: number;
  readonly playbackRate: number;
  readonly pitchSemitones: number;
  readonly highLoadVideoMode: boolean;
  readonly transportCatchupActive: boolean;
  readonly lastHardSyncAtMs: number;
  readonly lastRecoveryAtMs: number;
  readonly persistentDriftSinceMs: number;
}

interface VideoSyncDecisionBase {
  readonly nextPersistentDriftSinceMs: number;
}

export type VideoSyncDecision =
  | ({
      readonly kind: 'recover';
    } & VideoSyncDecisionBase)
  | ({
      readonly kind: 'hard-sync';
      readonly targetTime: number;
      readonly driftMs: number;
      readonly nextPlaybackRate: number;
    } & VideoSyncDecisionBase)
  | ({
      readonly kind: 'rate-trim';
      readonly nextPlaybackRate: number;
    } & VideoSyncDecisionBase)
  | ({
      readonly kind: 'stable';
      readonly nextPlaybackRate: number;
      readonly shouldClearCatchup: boolean;
    } & VideoSyncDecisionBase);

const VIDEO_SOFT_SYNC_DRIFT_S = 0.045;
const VIDEO_HARD_SYNC_DRIFT_S = 0.35;
const VIDEO_RATE_TRIM_GAIN = 0.24;
const VIDEO_RATE_TRIM_MAX = 0.05;
export const VIDEO_HARD_SYNC_COOLDOWN_MS = 900;
export const VIDEO_HARD_SYNC_MIN_STEP_S = 0.04;
const HIGH_RES_SOFT_SYNC_DRIFT_S = 0.09;
const HIGH_RES_HARD_SYNC_DRIFT_S = 0.5;
const HIGH_RES_RATE_TRIM_GAIN = 0.12;
const HIGH_RES_RATE_TRIM_MAX = 0.025;
export const HIGH_RES_HARD_SYNC_MIN_STEP_S = 0.065;
export const VIDEO_SYNC_GRACE_MS = 550;
export const VIDEO_TRANSPORT_CATCHUP_MS = 1600;
const VIDEO_TRANSPORT_FORCE_HARD_SYNC_S = 0.9;
export const VIDEO_TRANSPORT_RECOVERY_COOLDOWN_MS = 1400;
const VIDEO_PERSISTENT_DRIFT_RECOVERY_S = 0.24;
const VIDEO_PERSISTENT_DRIFT_RECOVERY_MS = 480;
export const VIDEO_PAUSED_RESYNC_DRIFT_S = 0.12;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getTransportStressFactor(playbackRate: number, pitchSemitones: number): number {
  let factor = 1;
  if (playbackRate < 1) {
    factor += (1 - playbackRate) * 1.4;
  } else if (playbackRate > 1.2) {
    factor += Math.min(0.45, (playbackRate - 1.2) * 0.35);
  }
  factor += Math.min(0.55, (Math.abs(pitchSemitones) / 12) * 0.45);
  return clamp(factor, 1, 2.35);
}

export function getAdaptiveVideoSyncProfile(
  playbackRate: number,
  pitchSemitones: number,
  highLoadVideoMode: boolean,
): VideoSyncProfile {
  const stressFactor = getTransportStressFactor(playbackRate, pitchSemitones);
  const baseSoftSyncDrift = highLoadVideoMode ? HIGH_RES_SOFT_SYNC_DRIFT_S : VIDEO_SOFT_SYNC_DRIFT_S;
  const baseHardSyncDrift = highLoadVideoMode ? HIGH_RES_HARD_SYNC_DRIFT_S : VIDEO_HARD_SYNC_DRIFT_S;
  const baseRateTrimGain = highLoadVideoMode ? HIGH_RES_RATE_TRIM_GAIN : VIDEO_RATE_TRIM_GAIN;
  const baseRateTrimMax = highLoadVideoMode ? HIGH_RES_RATE_TRIM_MAX : VIDEO_RATE_TRIM_MAX;

  return {
    settleMs: Math.round(VIDEO_SYNC_GRACE_MS * stressFactor),
    softSyncDrift: baseSoftSyncDrift * stressFactor,
    hardSyncDrift: baseHardSyncDrift * stressFactor,
    rateTrimGain: baseRateTrimGain / stressFactor,
    rateTrimMax: baseRateTrimMax / Math.sqrt(stressFactor),
  };
}

export function getVideoHardSyncMinStep(
  highLoadVideoMode: boolean,
  syncProfile: VideoSyncProfile,
): number {
  return Math.max(
    highLoadVideoMode ? HIGH_RES_HARD_SYNC_MIN_STEP_S : VIDEO_HARD_SYNC_MIN_STEP_S,
    syncProfile.softSyncDrift * 0.55,
  );
}

export function getPausedVideoResyncDrift(
  highLoadVideoMode: boolean,
  syncProfile: VideoSyncProfile,
): number {
  return Math.max(
    VIDEO_PAUSED_RESYNC_DRIFT_S,
    highLoadVideoMode ? HIGH_RES_HARD_SYNC_MIN_STEP_S : VIDEO_HARD_SYNC_MIN_STEP_S,
    syncProfile.softSyncDrift * 0.9,
  );
}

export function getVideoResumeSettleMs(syncProfile: VideoSyncProfile): number {
  return Math.max(250, Math.round(syncProfile.settleMs * 0.5));
}

export function getVideoCanPlayResyncDrift(
  highLoadVideoMode: boolean,
  syncProfile: VideoSyncProfile,
): number {
  return Math.max(
    highLoadVideoMode ? HIGH_RES_HARD_SYNC_MIN_STEP_S : VIDEO_HARD_SYNC_MIN_STEP_S,
    syncProfile.softSyncDrift * 0.9,
  );
}

export function getVideoTransportRetuneTiming(
  playbackRate: number,
  pitchSemitones: number,
): VideoTransportRetuneTiming {
  const stressFactor = getTransportStressFactor(playbackRate, pitchSemitones);
  return {
    stressFactor,
    settleMs: Math.max(220, Math.round(VIDEO_SYNC_GRACE_MS * stressFactor * 0.6)),
    catchupMs: Math.max(950, Math.round(VIDEO_TRANSPORT_CATCHUP_MS * stressFactor)),
  };
}

export function decideVideoSyncDecision(input: VideoSyncDecisionInput): VideoSyncDecision {
  const syncProfile = getAdaptiveVideoSyncProfile(
    input.playbackRate,
    input.pitchSemitones,
    input.highLoadVideoMode,
  );

  let softSyncDrift = syncProfile.softSyncDrift;
  let hardSyncDrift = syncProfile.hardSyncDrift;
  let rateTrimGain = syncProfile.rateTrimGain;
  let rateTrimMax = syncProfile.rateTrimMax;

  if (input.transportCatchupActive) {
    softSyncDrift = Math.max(0.024, softSyncDrift * 0.75);
    hardSyncDrift = Math.max(
      VIDEO_TRANSPORT_FORCE_HARD_SYNC_S,
      hardSyncDrift * 1.3,
    );
    rateTrimGain *= 1.2;
    rateTrimMax = Math.max(rateTrimMax, input.highLoadVideoMode ? 0.04 : 0.07);
  }

  const absDrift = Math.abs(input.drift);
  const stableDriftThreshold = Math.max(0.02, softSyncDrift * 0.6);
  const persistentDriftThreshold = Math.max(
    VIDEO_PERSISTENT_DRIFT_RECOVERY_S,
    softSyncDrift * (input.transportCatchupActive ? 4 : 3),
  );

  let nextPersistentDriftSinceMs = input.persistentDriftSinceMs;
  if (absDrift <= stableDriftThreshold) {
    nextPersistentDriftSinceMs = 0;
  } else if (
    absDrift >= persistentDriftThreshold &&
    input.nowMs - input.lastHardSyncAtMs >= VIDEO_HARD_SYNC_COOLDOWN_MS * 0.55
  ) {
    if (nextPersistentDriftSinceMs === 0) {
      nextPersistentDriftSinceMs = input.nowMs;
    } else if (
      input.nowMs - nextPersistentDriftSinceMs >= VIDEO_PERSISTENT_DRIFT_RECOVERY_MS &&
      input.nowMs - input.lastRecoveryAtMs >= VIDEO_TRANSPORT_RECOVERY_COOLDOWN_MS * 0.7
    ) {
      return {
        kind: 'recover',
        nextPersistentDriftSinceMs: 0,
      };
    }
  } else {
    nextPersistentDriftSinceMs = 0;
  }

  if (
    absDrift >= hardSyncDrift &&
    input.nowMs - input.lastHardSyncAtMs >= VIDEO_HARD_SYNC_COOLDOWN_MS
  ) {
    return {
      kind: 'hard-sync',
      targetTime: input.currentTime,
      driftMs: Math.round(input.drift * 1000),
      nextPlaybackRate: input.baseRate,
      nextPersistentDriftSinceMs: 0,
    };
  }

  if (absDrift >= softSyncDrift) {
    const correction = clamp(input.drift * rateTrimGain, -rateTrimMax, rateTrimMax);
    return {
      kind: 'rate-trim',
      nextPlaybackRate: input.baseRate + correction,
      nextPersistentDriftSinceMs,
    };
  }

  return {
    kind: 'stable',
    nextPlaybackRate: input.baseRate,
    nextPersistentDriftSinceMs,
    shouldClearCatchup: input.transportCatchupActive,
  };
}