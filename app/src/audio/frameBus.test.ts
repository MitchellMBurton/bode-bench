import { describe, expect, it } from 'vitest';

import type { AudioFrame } from '../types';
import { FrameBus } from './frameBus';

function makeFrame(overrides: Partial<AudioFrame> = {}): AudioFrame {
  return {
    currentTime: 1,
    timeDomain: new Float32Array([0.1, 0.2]),
    timeDomainRight: new Float32Array([0.3, 0.4]),
    frequencyDb: new Float32Array([-12, -24]),
    frequencyDbRight: new Float32Array([-18, -30]),
    peakLeft: 0.2,
    peakRight: 0.3,
    rmsLeft: 0.1,
    rmsRight: 0.15,
    sampleRate: 48000,
    playId: 1,
    fileId: 1,
    displayGain: 1,
    fftBinCount: 2,
    spectralCentroid: 1200,
    f0Hz: 220,
    f0Confidence: 0.9,
    phaseCorrelation: 0.5,
    ...overrides,
  };
}

describe('FrameBus', () => {
  it('publishes a retained frame snapshot that survives source buffer reuse', () => {
    const bus = new FrameBus();
    const source = makeFrame();
    const retainedFrames: AudioFrame[] = [];

    bus.subscribe((frame) => {
      retainedFrames.push(frame);
    });

    bus.publish(source);
    source.timeDomain[0] = 0.99;
    source.timeDomainRight[0] = 0.99;
    source.frequencyDb[0] = -99;
    source.frequencyDbRight[0] = -99;

    const retained = retainedFrames[0];
    expect(retained).toBeDefined();
    expect(retained.timeDomain).not.toBe(source.timeDomain);
    expect(retained.timeDomain[0]).toBeCloseTo(0.1);
    expect(retained.timeDomain[1]).toBeCloseTo(0.2);
    expect(retained.timeDomainRight[0]).toBeCloseTo(0.3);
    expect(retained.timeDomainRight[1]).toBeCloseTo(0.4);
    expect(Array.from(retained.frequencyDb)).toEqual([-12, -24]);
    expect(Array.from(retained.frequencyDbRight)).toEqual([-18, -30]);
  });

  it('isolates listener failures and continues dispatching', () => {
    const errors: string[] = [];
    const bus = new FrameBus({
      onListenerError: (error) => {
        errors.push(error instanceof Error ? error.message : String(error));
      },
    });
    let delivered = false;

    bus.subscribe(() => {
      throw new Error('panel failed');
    });
    bus.subscribe(() => {
      delivered = true;
    });

    expect(() => bus.publish(makeFrame())).not.toThrow();
    expect(errors).toEqual(['panel failed']);
    expect(delivered).toBe(true);
  });
});
