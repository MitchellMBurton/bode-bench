import { describe, expect, it } from 'vitest';

import {
  amplitudeToEventHeight,
  computeEventModeBlend,
  computeTransientIntensity,
  EVENT_MODE_BLEND_END_S,
  EVENT_MODE_BLEND_START_S,
  EVENT_MODE_DB_FLOOR_DB,
  pickWaveformDetailRenderMode,
  shouldUseEventScaffold,
} from './waveformDetailMode';

describe('waveform detail mode policy', () => {
  it('selects sample, envelope, and event modes from zoom intent', () => {
    expect(pickWaveformDetailRenderMode(0.15, true)).toBe('sample');
    expect(pickWaveformDetailRenderMode(8, false)).toBe('envelope');
    expect(pickWaveformDetailRenderMode(12, false)).toBe('envelope');
    expect(pickWaveformDetailRenderMode(12.01, false)).toBe('event');
  });

  it('maps amplitudes into the event-mode dB range', () => {
    expect(amplitudeToEventHeight(1, EVENT_MODE_DB_FLOOR_DB)).toBeCloseTo(1, 5);
    expect(amplitudeToEventHeight(10 ** (EVENT_MODE_DB_FLOOR_DB / 20), EVENT_MODE_DB_FLOOR_DB)).toBeCloseTo(0, 5);
    expect(amplitudeToEventHeight(0, EVENT_MODE_DB_FLOOR_DB)).toBeCloseTo(0, 5);
    expect(amplitudeToEventHeight(0.5, EVENT_MODE_DB_FLOOR_DB)).toBeGreaterThan(amplitudeToEventHeight(0.1, EVENT_MODE_DB_FLOOR_DB));
  });

  it('smoothly blends event emphasis around the long-span threshold', () => {
    expect(computeEventModeBlend(EVENT_MODE_BLEND_START_S)).toBeCloseTo(0, 5);
    expect(computeEventModeBlend((EVENT_MODE_BLEND_START_S + EVENT_MODE_BLEND_END_S) / 2)).toBeCloseTo(0.5, 5);
    expect(computeEventModeBlend(EVENT_MODE_BLEND_END_S)).toBeCloseTo(1, 5);
  });

  it('prefers scaffold only when coverage is materially better', () => {
    expect(shouldUseEventScaffold(0.55, 0.66)).toBe(false);
    expect(shouldUseEventScaffold(0.55, 0.68)).toBe(true);
  });

  it('raises transient intensity for crest, contrast, and clipping', () => {
    const calm = computeTransientIntensity(0.22, 0.18, 0, 0.02);
    const punchy = computeTransientIntensity(0.85, 0.25, 0.4, 0.3);
    expect(punchy).toBeGreaterThan(calm);
    expect(punchy).toBeLessThanOrEqual(1);
  });
});
