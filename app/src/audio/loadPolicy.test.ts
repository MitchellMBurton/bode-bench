import { describe, expect, it } from 'vitest';

import {
  canPrepareStretchBuffers,
  estimateDecodedPcmBytes,
  estimateStretchPrepBytes,
  shouldPreferStreamingLoad,
  shouldPreflightStreaming,
} from './loadPolicy';

function createFile(size: number, type: string): File {
  return { size, type } as File;
}

function createAudioBuffer(length: number, numberOfChannels: number): AudioBuffer {
  return { length, numberOfChannels } as AudioBuffer;
}

describe('audio load policy', () => {
  it('preflights all video and very large files', () => {
    expect(shouldPreflightStreaming(createFile(10, 'video/mp4'))).toBe(true);
    expect(shouldPreflightStreaming(createFile(384 * 1024 * 1024, 'audio/wav'))).toBe(true);
    expect(shouldPreflightStreaming(createFile(32 * 1024 * 1024, 'audio/wav'))).toBe(false);
  });

  it('prefers streaming when decoded PCM would exceed the memory budget', () => {
    expect(estimateDecodedPcmBytes(1, 48_000, 2)).toBe(384_000);
    expect(shouldPreferStreamingLoad(createFile(32 * 1024 * 1024, 'audio/wav'), 30 * 60)).toBe(false);
    expect(shouldPreferStreamingLoad(createFile(32 * 1024 * 1024, 'audio/wav'), 45 * 60)).toBe(true);
    expect(shouldPreferStreamingLoad(createFile(32 * 1024 * 1024, 'audio/wav'), null)).toBe(false);
  });

  it('uses decoded buffer size to gate stretch preparation', () => {
    const small = createAudioBuffer(1_000, 2);
    const tooLarge = createAudioBuffer((512 * 1024 * 1024) / Float32Array.BYTES_PER_ELEMENT + 1, 1);

    expect(estimateStretchPrepBytes(small)).toBe(8_000);
    expect(canPrepareStretchBuffers(small)).toBe(true);
    expect(canPrepareStretchBuffers(tooLarge)).toBe(false);
  });
});
