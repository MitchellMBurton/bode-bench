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
});
