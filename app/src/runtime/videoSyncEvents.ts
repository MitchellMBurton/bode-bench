export type VideoBufferingEventKind = 'waiting' | 'stalled';

export interface VideoBufferingDecisionInput {
  readonly shouldHoldSync: boolean;
  readonly nearEnd: boolean;
  readonly loopActive: boolean;
  readonly catchupActive: boolean;
}

export type VideoBufferingDecision =
  | {
      readonly kind: 'settling';
    }
  | {
      readonly kind: 'loop-wrap';
    }
  | {
      readonly kind: 'ended';
    }
  | {
      readonly kind: 'wait';
      readonly shouldScheduleRecovery: boolean;
    };

export type VideoEndedDecision = 'loop-wrap' | 'ended';

export function decideVideoBufferingDecision(
  input: VideoBufferingDecisionInput,
): VideoBufferingDecision {
  if (input.shouldHoldSync) {
    return { kind: 'settling' };
  }
  if (input.nearEnd) {
    return input.loopActive ? { kind: 'loop-wrap' } : { kind: 'ended' };
  }
  return {
    kind: 'wait',
    shouldScheduleRecovery: input.catchupActive,
  };
}

export function decideVideoEndedDecision(loopActive: boolean): VideoEndedDecision {
  return loopActive ? 'loop-wrap' : 'ended';
}