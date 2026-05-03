import { describe, expect, it } from 'vitest';

import {
  buildDecodedSpectrogramHistory,
  canBuildDecodedSpectrogramOverview,
  createDecodedSpectrogramBuilder,
  pickDecodedSpectrogramColumnCount,
  pickDecodedSpectrogramFftSize,
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

  it('can progressively prioritize visible window columns', () => {
    const samples = new Float32Array(4096);
    for (let index = 0; index < samples.length; index++) {
      samples[index] = Math.sin((2 * Math.PI * 96 * index) / 1024);
    }

    const builder = createDecodedSpectrogramBuilder({
      buffer: createBuffer(samples),
      fftSize: 256,
      width: 24,
      rowBands: [{ lowBin: 1, highBin: 12 }],
      dbMin: -90,
      dbMax: 0,
    });

    const result = builder.advance(0, { startColumn: 10, endColumn: 14 });

    expect(result.completedColumns).toBeGreaterThan(0);
    expect(result.builtRanges[0]).toEqual({ startColumn: 10, endColumn: 11 });
    expect(builder.history[10]).toBeGreaterThanOrEqual(0);
    expect(builder.history[0]).toBe(-1);
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
    expect(pickDecodedSpectrogramColumnCount(100)).toBe(125);
    expect(pickDecodedSpectrogramColumnCount(1000, 2.6)).toBe(4160);
    expect(pickDecodedSpectrogramColumnCount(1000, 168)).toBe(14000);
    expect(pickDecodedSpectrogramColumnCount(30_000, 168)).toBe(24576);
    expect(canBuildDecodedSpectrogramOverview(createBuffer(new Float32Array(256)))).toBe(true);

    const thirteenMinuteStereo = {
      length: 796 * 44_100,
      numberOfChannels: 2,
      sampleRate: 44_100,
    } as AudioBuffer;
    expect(canBuildDecodedSpectrogramOverview(thirteenMinuteStereo)).toBe(true);

    const tooLarge = {
      length: (385 * 1024 * 1024) / (2 * Float32Array.BYTES_PER_ELEMENT),
      numberOfChannels: 2,
      sampleRate: 48_000,
    } as AudioBuffer;
    expect(canBuildDecodedSpectrogramOverview(tooLarge)).toBe(false);
  });

  it('uses shorter decoded display windows for very short sources', () => {
    expect(pickDecodedSpectrogramFftSize(8192, 2.6, 48_000)).toBe(2048);
    expect(pickDecodedSpectrogramFftSize(8192, 8, 48_000)).toBe(4096);
    expect(pickDecodedSpectrogramFftSize(2048, 2.6, 48_000)).toBe(2048);
    expect(pickDecodedSpectrogramFftSize(8192, 30, 48_000)).toBe(8192);
  });

  it('maps playback into full and window scan-line ratios', () => {
    expect(resolveDecodedSpectrogramPlaybackRatio('full', 25, 100, { start: 20, end: 40 })).toBe(0.25);
    expect(resolveDecodedSpectrogramPlaybackRatio('window', 25, 100, { start: 20, end: 40 })).toBe(0.25);
    expect(resolveDecodedSpectrogramPlaybackRatio('window', 10, 100, { start: 20, end: 40 })).toBeNull();
    expect(resolveDecodedSpectrogramPlaybackRatio('live', 25, 100, { start: 20, end: 40 })).toBeNull();
  });
});
