import { describe, expect, it } from 'vitest';

import { AnalysisFrameBufferPool } from './analysisFrameBufferPool';

describe('analysis frame buffer pool', () => {
  it('reuses returned buffers for the same fft size', () => {
    const pool = new AnalysisFrameBufferPool(8);
    const first = pool.acquire();
    pool.release(first);

    expect(pool.availableCount).toBe(1);
    const second = pool.acquire();

    expect(second.timeDomainLeft).toBe(first.timeDomainLeft);
    expect(second.frequencyDbRight).toBe(first.frequencyDbRight);
    expect(second.timeDomainLeft).toHaveLength(8);
    expect(second.frequencyDbLeft).toHaveLength(4);
  });

  it('drops pooled buffers when the fft size changes', () => {
    const pool = new AnalysisFrameBufferPool(8);
    const first = pool.acquire();
    pool.release(first);

    pool.resize(16);
    const second = pool.acquire();

    expect(second.timeDomainLeft).not.toBe(first.timeDomainLeft);
    expect(second.timeDomainLeft).toHaveLength(16);
    expect(second.frequencyDbLeft).toHaveLength(8);
  });

  it('ignores wrong-sized buffers returned after a resize', () => {
    const pool = new AnalysisFrameBufferPool(8);
    const stale = pool.acquire();
    pool.resize(16);
    pool.release(stale);

    expect(pool.availableCount).toBe(0);
  });
});
