import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PerformanceDiagnosticsStore } from './logStore';

describe('PerformanceDiagnosticsStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears pending batched emits when disposed', () => {
    const store = new PerformanceDiagnosticsStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.noteTransport({
      filename: 'session.wav',
      isPlaying: true,
      playbackRate: 1,
      pitchSemitones: 0,
    });
    store.dispose();
    vi.runOnlyPendingTimers();

    expect(listener).not.toHaveBeenCalled();
  });

  it('records analysis telemetry and emits mode changes immediately', () => {
    const store = new PerformanceDiagnosticsStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.noteAnalysisTelemetry({
      mode: 'main-thread',
      requestedFrames: 2,
      completedFrames: 2,
      droppedFrames: 0,
      failedFrames: 0,
      invalidResponses: 0,
      inFlightFrames: 0,
      lastElapsedMs: 0.5,
      lastError: null,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().analysis).toMatchObject({
      mode: 'main-thread',
      completedFrames: 2,
      lastElapsedMs: 0.5,
    });
    expect(store.getSnapshot().recentEvents.at(-1)?.source).toBe('analysis');
  });
});
