import { describe, expect, it } from 'vitest';

import {
  DecodedSpectrogramWorkerClient,
  type DecodedSpectrogramWorkerPort,
} from './decodedSpectrogramWorkerClient';
import {
  DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
  type DecodedSpectrogramChunk,
  type DecodedSpectrogramWorkerRequest,
  type DecodedSpectrogramWorkerResponse,
} from './decodedSpectrogramWorkerProtocol';

class FakeDecodedSpectrogramWorker implements DecodedSpectrogramWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: Array<{ message: DecodedSpectrogramWorkerRequest; transfer: Transferable[] }> = [];
  terminated = false;

  postMessage(message: DecodedSpectrogramWorkerRequest, transfer: Transferable[] = []): void {
    this.posted.push({ message, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  emitResponse(response: DecodedSpectrogramWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<unknown>);
  }

  emitUnknown(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }

  emitError(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function createBuffer(): AudioBuffer {
  const left = new Float32Array([0, 0.1, -0.1, 0.05]);
  const right = new Float32Array([0, 0.2, -0.2, 0.1]);
  return {
    duration: left.length / 48_000,
    length: left.length,
    numberOfChannels: 2,
    sampleRate: 48_000,
    getChannelData: (channel: number) => (channel === 0 ? left : right),
  } as unknown as AudioBuffer;
}

function createChunk(id: number): DecodedSpectrogramChunk {
  return {
    kind: 'decoded-spectrogram-chunk',
    protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
    id,
    width: 8,
    height: 1,
    startColumn: 2,
    endColumn: 5,
    levels: new Int16Array([4, 5, 6]),
    completedColumns: 3,
    done: false,
    elapsedMs: 4.5,
  };
}

describe('decoded spectrogram worker client', () => {
  it('starts a transferable build request and accepts matching chunks', () => {
    const worker = new FakeDecodedSpectrogramWorker();
    const chunks: DecodedSpectrogramChunk[] = [];
    const client = new DecodedSpectrogramWorkerClient({
      createWorker: () => worker,
      onChunk: (chunk) => chunks.push(chunk),
    });

    const job = client.start({
      buffer: createBuffer(),
      fftSize: 1024,
      width: 8,
      rowBands: [{ lowBin: 1, highBin: 4 }],
      dbMin: -90,
      dbMax: 0,
      priorityRange: { startColumn: 2, endColumn: 5 },
      chunkBudgetMs: 12,
    });

    expect(job.id).toBe(1);
    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0].message).toMatchObject({
      kind: 'build-decoded-spectrogram',
      protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
      id: 1,
    });
    expect(worker.posted[0].transfer).toHaveLength(2);

    const chunk = createChunk(1);
    worker.emitResponse(chunk);

    expect(chunks).toEqual([chunk]);
  });

  it('updates priority and cancels only the active job', () => {
    const worker = new FakeDecodedSpectrogramWorker();
    const client = new DecodedSpectrogramWorkerClient({
      createWorker: () => worker,
      onChunk: () => {},
    });

    const job = client.start({
      buffer: createBuffer(),
      fftSize: 1024,
      width: 8,
      rowBands: [{ lowBin: 1, highBin: 4 }],
      dbMin: -90,
      dbMax: 0,
      priorityRange: null,
      chunkBudgetMs: 12,
    });
    job.updatePriority({ startColumn: 4, endColumn: 6 });
    job.cancel();
    job.updatePriority({ startColumn: 1, endColumn: 2 });

    expect(worker.posted.map((entry) => entry.message.kind)).toEqual([
      'build-decoded-spectrogram',
      'prioritize-decoded-spectrogram',
      'cancel-decoded-spectrogram',
    ]);
  });

  it('ignores stale chunks and reports invalid responses', () => {
    const worker = new FakeDecodedSpectrogramWorker();
    const chunks: DecodedSpectrogramChunk[] = [];
    const errors: string[] = [];
    const client = new DecodedSpectrogramWorkerClient({
      createWorker: () => worker,
      onChunk: (chunk) => chunks.push(chunk),
      onError: (error) => errors.push(error.message),
    });

    client.start({
      buffer: createBuffer(),
      fftSize: 1024,
      width: 8,
      rowBands: [{ lowBin: 1, highBin: 4 }],
      dbMin: -90,
      dbMax: 0,
      priorityRange: null,
      chunkBudgetMs: 12,
    });

    worker.emitResponse(createChunk(99));
    worker.emitUnknown({ kind: 'decoded-spectrogram-chunk', id: 1 });

    expect(chunks).toEqual([]);
    expect(errors).toEqual(['Invalid decoded spectrogram worker response.']);
  });

  it('terminates the worker on disposal', () => {
    const worker = new FakeDecodedSpectrogramWorker();
    const client = new DecodedSpectrogramWorkerClient({
      createWorker: () => worker,
      onChunk: () => {},
    });

    client.start({
      buffer: createBuffer(),
      fftSize: 1024,
      width: 8,
      rowBands: [{ lowBin: 1, highBin: 4 }],
      dbMin: -90,
      dbMax: 0,
      priorityRange: null,
      chunkBudgetMs: 12,
    });
    client.dispose();

    expect(worker.terminated).toBe(true);
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
  });
});
