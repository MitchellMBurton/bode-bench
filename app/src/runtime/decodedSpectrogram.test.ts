import { describe, expect, it } from 'vitest';

import {
  buildDecodedSpectrogramHistory,
  canBuildDecodedSpectrogramOverview,
  pickDecodedSpectrogramColumnCount,
  projectDecodedSpectrogramHistory,
  resolveDecodedSpectrogramPlaybackRatio,
} from './decodedSpectrogram';

function createBuffer(samples: Float32Array, sampleRate = 1024): AudioBuffer {
  return {
    duration: samples.length / sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

describe('decoded spectrogram overview', () => {
  it('builds a bounded decoded-source spectrogram history', () => {
    const samples = new Float32Array(2048);
    for (let index = 0; index < samples.length; index++) {
      samples[index] = Math.sin((2 * Math.PI * 64 * index) / 1024);
    }

    const history = buildDecodedSpectrogramHistory({
      buffer: createBuffer(samples),
      fftSize: 256,
      width: 12,
      rowBands: [
        { lowBin: 1, highBin: 6 },
        { lowBin: 12, highBin: 20 },
      ],
      dbMin: -90,
      dbMax: 0,
    });

    expect(history).toHaveLength(24);
    expect(Math.max(...history)).toBeGreaterThan(0);
  });

  it('projects full-source columns into a visible window', () => {
    const source = Int16Array.from([
      1, 2, 3, 4,
      5, 6, 7, 8,
    ]);

    expect(Array.from(projectDecodedSpectrogramHistory(source, 4, 2, 2, 0.25, 0.75))).toEqual([
      2, 3,
      6, 7,
    ]);
  });

  it('keeps browser overview work bounded to decoded-safe sources', () => {
    expect(pickDecodedSpectrogramColumnCount(2000)).toBe(720);
    expect(canBuildDecodedSpectrogramOverview(createBuffer(new Float32Array(256)))).toBe(true);

    const large = {
      length: (97 * 1024 * 1024) / Float32Array.BYTES_PER_ELEMENT,
      numberOfChannels: 1,
      sampleRate: 48_000,
    } as AudioBuffer;
    expect(canBuildDecodedSpectrogramOverview(large)).toBe(false);
  });

  it('maps playback into full and window scan-line ratios', () => {
    expect(resolveDecodedSpectrogramPlaybackRatio('full', 25, 100, { start: 20, end: 40 })).toBe(0.25);
    expect(resolveDecodedSpectrogramPlaybackRatio('window', 25, 100, { start: 20, end: 40 })).toBe(0.25);
    expect(resolveDecodedSpectrogramPlaybackRatio('window', 10, 100, { start: 20, end: 40 })).toBeNull();
    expect(resolveDecodedSpectrogramPlaybackRatio('live', 25, 100, { start: 20, end: 40 })).toBeNull();
  });
});
