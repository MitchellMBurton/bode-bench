import { describe, expect, it } from 'vitest';

import { FrameBus } from '../audio/frameBus';
import { ScrollSpeedStore } from '../audio/scrollSpeed';
import type { AudioEngine } from '../audio/engine';
import type { AudioFrame } from '../types';
import { SpectralAnatomyStore } from './spectralAnatomy';

function createAudioEngineStub() {
  const resetListeners = new Set<() => void>();
  return {
    sampleRate: 48_000,
    playbackRate: 1,
    onReset(fn: () => void) {
      resetListeners.add(fn);
      return () => {
        resetListeners.delete(fn);
      };
    },
    emitReset() {
      for (const fn of [...resetListeners]) {
        fn();
      }
    },
  };
}

function createFrame(amplitude: number, currentTime: number, fileId: number): AudioFrame {
  const samples = new Float32Array(64);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((i / samples.length) * Math.PI * 2);
  }

  return {
    currentTime,
    timeDomain: samples,
    timeDomainRight: new Float32Array(samples),
    frequencyDb: new Float32Array(32),
    frequencyDbRight: new Float32Array(32),
    peakLeft: amplitude,
    peakRight: amplitude,
    rmsLeft: amplitude / Math.sqrt(2),
    rmsRight: amplitude / Math.sqrt(2),
    sampleRate: 48_000,
    playId: 1,
    fileId,
    displayGain: 1,
    fftBinCount: 32,
    spectralCentroid: 440,
    f0Hz: 440,
    f0Confidence: 1,
    phaseCorrelation: 1,
  };
}

describe('SpectralAnatomyStore', () => {
  it('keeps integrated LUFS live after the legacy fixed buffer would have filled', () => {
    const frameBus = new FrameBus();
    const audioEngine = createAudioEngineStub();
    const store = new SpectralAnatomyStore(
      frameBus,
      audioEngine as unknown as AudioEngine,
      new ScrollSpeedStore(),
    );

    for (let i = 0; i < 7200; i++) {
      frameBus.publish(createFrame(0.02, i / 20, 1));
    }
    const beforeOverflow = store.integratedValueLufs;

    for (let i = 0; i < 40; i++) {
      frameBus.publish(createFrame(0.4, (7200 + i) / 20, 1));
    }

    expect(store.hasIntegratedValue).toBe(true);
    expect(store.integratedValueLufs).toBeGreaterThan(beforeOverflow + 1);

    store.destroy();
  });

  it('resets integrated LUFS state cleanly on engine reset', () => {
    const frameBus = new FrameBus();
    const audioEngine = createAudioEngineStub();
    const store = new SpectralAnatomyStore(
      frameBus,
      audioEngine as unknown as AudioEngine,
      new ScrollSpeedStore(),
    );

    for (let i = 0; i < 40; i++) {
      frameBus.publish(createFrame(0.3, i / 20, 1));
    }
    expect(store.hasIntegratedValue).toBe(true);
    expect(store.getLatestMomentaryLufs()).not.toBeNull();

    audioEngine.emitReset();

    expect(store.hasIntegratedValue).toBe(false);
    expect(store.integratedValueLufs).toBe(-60);
    expect(store.getLatestMomentaryLufs()).toBeNull();

    store.destroy();
  });
});
