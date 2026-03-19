import type { VideoSyncDecisionInput } from './videoSyncPolicy';

type RecoveryTimerId = ReturnType<typeof setTimeout>;

export type VideoSyncDecisionState = Pick<
  VideoSyncDecisionInput,
  'transportCatchupActive' | 'lastHardSyncAtMs' | 'lastRecoveryAtMs' | 'persistentDriftSinceMs'
>;

export class VideoSyncController {
  private lastHardSyncAtMs = 0;
  private lastRecoveryAtMs = 0;
  private syncGraceUntilMs = 0;
  private seekPending = false;
  private pendingPlay = false;
  private transportCatchupUntilMs = 0;
  private recoveryTimerId: RecoveryTimerId | null = null;
  private persistentDriftSinceMs = 0;

  canClearIndicator(nowMs: number): boolean {
    return nowMs >= this.syncGraceUntilMs;
  }

  markSyncGrace(nowMs: number, durationMs: number): void {
    this.syncGraceUntilMs = Math.max(this.syncGraceUntilMs, nowMs + durationMs);
  }

  shouldHoldSync(nowMs: number): boolean {
    return this.seekPending || nowMs < this.syncGraceUntilMs;
  }

  isSyncGraceActive(nowMs: number): boolean {
    return nowMs < this.syncGraceUntilMs;
  }

  markTransportCatchup(nowMs: number, durationMs: number): void {
    this.transportCatchupUntilMs = nowMs + durationMs;
  }

  isCatchupActive(nowMs: number): boolean {
    return nowMs < this.transportCatchupUntilMs;
  }

  clearRecoveryTimer(): void {
    if (this.recoveryTimerId === null) return;
    clearTimeout(this.recoveryTimerId);
    this.recoveryTimerId = null;
  }

  scheduleRecovery(delayMs: number, onRecover: () => void): void {
    if (this.recoveryTimerId !== null) return;
    this.recoveryTimerId = setTimeout(() => {
      this.recoveryTimerId = null;
      onRecover();
    }, delayMs);
  }

  resetTransportSync(): void {
    this.transportCatchupUntilMs = 0;
    this.persistentDriftSinceMs = 0;
    this.clearRecoveryTimer();
  }

  noteHardSync(nowMs: number, settleMs: number, pendingPlay: boolean): void {
    this.persistentDriftSinceMs = 0;
    this.clearRecoveryTimer();
    this.seekPending = true;
    this.pendingPlay = pendingPlay;
    this.markSyncGrace(nowMs, settleMs);
    this.lastHardSyncAtMs = nowMs;
  }

  noteCanPlay(nowMs: number, settleMs: number): void {
    this.seekPending = false;
    this.clearRecoveryTimer();
    this.markSyncGrace(nowMs, settleMs);
  }

  noteSeeking(nowMs: number, settleMs: number): void {
    this.seekPending = true;
    this.markSyncGrace(nowMs, settleMs);
  }

  noteSeeked(nowMs: number, settleMs: number): void {
    this.seekPending = false;
    this.persistentDriftSinceMs = 0;
    this.clearRecoveryTimer();
    this.markSyncGrace(nowMs, settleMs);
  }

  canRecover(nowMs: number, cooldownMs: number): boolean {
    return nowMs - this.lastRecoveryAtMs >= cooldownMs;
  }

  noteRecovery(nowMs: number, settleMs: number): void {
    this.lastRecoveryAtMs = nowMs;
    this.persistentDriftSinceMs = 0;
    this.clearRecoveryTimer();
    this.pendingPlay = true;
    this.markSyncGrace(nowMs, settleMs);
  }

  notePlaying(nowMs: number): boolean {
    this.clearRecoveryTimer();
    if (this.isCatchupActive(nowMs) || this.isSyncGraceActive(nowMs)) {
      return false;
    }
    this.persistentDriftSinceMs = 0;
    return true;
  }

  noteEnded(): void {
    this.pendingPlay = false;
    this.seekPending = false;
    this.resetTransportSync();
  }

  setPendingPlay(nextPendingPlay: boolean): void {
    this.pendingPlay = nextPendingPlay;
  }

  hasPendingPlay(): boolean {
    return this.pendingPlay;
  }

  setSeekPending(nextSeekPending: boolean): void {
    this.seekPending = nextSeekPending;
  }

  isSeekPending(): boolean {
    return this.seekPending;
  }

  wasHardSyncedRecently(nowMs: number, recentMs: number): boolean {
    return nowMs - this.lastHardSyncAtMs < recentMs;
  }

  clearPersistentDrift(): void {
    this.persistentDriftSinceMs = 0;
  }

  setPersistentDriftSinceMs(nextPersistentDriftSinceMs: number): void {
    this.persistentDriftSinceMs = nextPersistentDriftSinceMs;
  }

  getDecisionState(nowMs: number): VideoSyncDecisionState {
    return {
      transportCatchupActive: this.isCatchupActive(nowMs),
      lastHardSyncAtMs: this.lastHardSyncAtMs,
      lastRecoveryAtMs: this.lastRecoveryAtMs,
      persistentDriftSinceMs: this.persistentDriftSinceMs,
    };
  }

  reset(): void {
    this.lastHardSyncAtMs = 0;
    this.lastRecoveryAtMs = 0;
    this.syncGraceUntilMs = 0;
    this.seekPending = false;
    this.pendingPlay = false;
    this.transportCatchupUntilMs = 0;
    this.persistentDriftSinceMs = 0;
    this.clearRecoveryTimer();
  }
}