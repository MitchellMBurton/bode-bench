import { describe, expect, it } from 'vitest';

import {
  decideVideoBufferingDecision,
  decideVideoEndedDecision,
} from './videoSyncEvents';

describe('decideVideoBufferingDecision', () => {
  it('keeps buffering events in settling mode while sync is held', () => {
    expect(decideVideoBufferingDecision({
      shouldHoldSync: true,
      nearEnd: false,
      loopActive: false,
      catchupActive: true,
    })).toEqual({ kind: 'settling' });
  });

  it('treats near-end loop buffering as a loop wrap', () => {
    expect(decideVideoBufferingDecision({
      shouldHoldSync: false,
      nearEnd: true,
      loopActive: true,
      catchupActive: true,
    })).toEqual({ kind: 'loop-wrap' });
  });

  it('treats near-end non-loop buffering as ended', () => {
    expect(decideVideoBufferingDecision({
      shouldHoldSync: false,
      nearEnd: true,
      loopActive: false,
      catchupActive: true,
    })).toEqual({ kind: 'ended' });
  });

  it('requests recovery while catchup is active', () => {
    expect(decideVideoBufferingDecision({
      shouldHoldSync: false,
      nearEnd: false,
      loopActive: false,
      catchupActive: true,
    })).toEqual({
      kind: 'wait',
      shouldScheduleRecovery: true,
    });
  });

  it('waits without recovery outside catchup', () => {
    expect(decideVideoBufferingDecision({
      shouldHoldSync: false,
      nearEnd: false,
      loopActive: false,
      catchupActive: false,
    })).toEqual({
      kind: 'wait',
      shouldScheduleRecovery: false,
    });
  });
});

describe('decideVideoEndedDecision', () => {
  it('maps looping playback to loop-wrap', () => {
    expect(decideVideoEndedDecision(true)).toBe('loop-wrap');
  });

  it('maps non-looping playback to ended', () => {
    expect(decideVideoEndedDecision(false)).toBe('ended');
  });
});