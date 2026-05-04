import { describe, expect, it } from 'vitest';

import {
  DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
  getDecodedSpectrogramBuildTransferables,
  getDecodedSpectrogramChunkTransferables,
  isDecodedSpectrogramWorkerRequest,
  isDecodedSpectrogramWorkerResponse,
  type BuildDecodedSpectrogramRequest,
  type DecodedSpectrogramChunk,
} from './decodedSpectrogramWorkerProtocol';

function createBuildRequest(): BuildDecodedSpectrogramRequest {
  const left = new Float32Array([0, 0.1, -0.1, 0]);
  const right = new Float32Array([0, 0.2, -0.2, 0]);
  return {
    kind: 'build-decoded-spectrogram',
    protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
    id: 1,
    payload: {
      source: {
        left,
        right,
        length: left.length,
        sampleRate: 48_000,
        numberOfChannels: 2,
      },
      fftSize: 1024,
      width: 12,
      rowBands: [{ lowBin: 1, highBin: 8 }],
      dbMin: -90,
      dbMax: 0,
      priorityRange: { startColumn: 3, endColumn: 6 },
      chunkBudgetMs: 8,
    },
  };
}

describe('decoded spectrogram worker protocol', () => {
  it('validates build, priority, and cancel requests', () => {
    const request = createBuildRequest();

    expect(isDecodedSpectrogramWorkerRequest(request)).toBe(true);
    expect(isDecodedSpectrogramWorkerRequest({
      kind: 'prioritize-decoded-spectrogram',
      protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
      id: 1,
      priorityRange: null,
    })).toBe(true);
    expect(isDecodedSpectrogramWorkerRequest({
      kind: 'cancel-decoded-spectrogram',
      protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
      id: 1,
    })).toBe(true);
    expect(isDecodedSpectrogramWorkerRequest({
      ...request,
      payload: {
        ...request.payload,
        source: {
          ...request.payload.source,
          right: new Float32Array([0]),
        },
      },
    })).toBe(false);
  });

  it('exposes source and chunk transferables', () => {
    const request = createBuildRequest();
    const chunk: DecodedSpectrogramChunk = {
      kind: 'decoded-spectrogram-chunk',
      protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
      id: 1,
      width: 12,
      height: 1,
      startColumn: 3,
      endColumn: 6,
      levels: new Int16Array([1, 2, 3]),
      completedColumns: 3,
      done: false,
      elapsedMs: 2.5,
    };

    expect(getDecodedSpectrogramBuildTransferables(request)).toEqual([
      request.payload.source.left.buffer,
      request.payload.source.right.buffer,
    ]);
    expect(isDecodedSpectrogramWorkerResponse(chunk)).toBe(true);
    expect(getDecodedSpectrogramChunkTransferables(chunk)).toEqual([chunk.levels.buffer]);
  });

  it('rejects malformed chunks at the boundary', () => {
    expect(isDecodedSpectrogramWorkerResponse({
      kind: 'decoded-spectrogram-chunk',
      protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
      id: 1,
      width: 12,
      height: 2,
      startColumn: 3,
      endColumn: 6,
      levels: new Int16Array([1, 2, 3]),
      completedColumns: 3,
      done: false,
      elapsedMs: 2.5,
    })).toBe(false);
  });
});
