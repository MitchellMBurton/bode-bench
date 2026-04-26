import { describe, expect, it } from 'vitest';

import { AnalysisWorkerClient, type AnalysisWorkerPort } from './analysisWorkerClient';
import {
  ANALYSIS_WORKER_PROTOCOL_VERSION,
  type AnalysisFramePayload,
  type AnalysisFrameResult,
  type AnalysisWorkerRequest,
  type AnalysisWorkerResponse,
} from './analysisWorkerProtocol';

class FakeAnalysisWorker implements AnalysisWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: Array<{ message: AnalysisWorkerRequest; transfer: Transferable[] }> = [];
  terminated = false;

  postMessage(message: AnalysisWorkerRequest, transfer: Transferable[]): void {
    this.posted.push({ message, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  emitResponse(response: AnalysisWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<unknown>);
  }

  emitUnknown(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }

  emitError(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function createPayload(): AnalysisFramePayload {
  return {
    sampleRateHz: 48_000,
    timeDomainLeft: new Float32Array([0, 0.1, -0.1]),
    timeDomainRight: new Float32Array([0, 0.1, -0.1]),
    frequencyDbLeft: new Float32Array([-100, -30, -80]),
  };
}

function createResult(id: number): AnalysisFrameResult {
  return {
    kind: 'analysis-frame-result',
    protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
    id,
    elapsedMs: 1.25,
    features: {
      peakLeft: 0.1,
      peakRight: 0.1,
      rmsLeft: 0.08,
      rmsRight: 0.08,
      spectralCentroid: 500,
      f0Hz: null,
      f0Confidence: 0,
      phaseCorrelation: 1,
    },
  };
}

describe('analysis worker client', () => {
  it('posts one transferable analysis frame request and records completion diagnostics', () => {
    const worker = new FakeAnalysisWorker();
    const received: AnalysisFrameResult[] = [];
    const client = new AnalysisWorkerClient({
      createWorker: () => worker,
      onFrame: (result) => received.push(result),
    });
    const payload = createPayload();

    expect(client.requestFrame(payload)).toBe(true);
    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0].message).toMatchObject({
      kind: 'analyze-frame',
      protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
      id: 1,
    });
    expect(worker.posted[0].transfer).toEqual([
      payload.timeDomainLeft.buffer,
      payload.timeDomainRight.buffer,
      payload.frequencyDbLeft.buffer,
    ]);
    expect(client.getDiagnostics()).toMatchObject({ requestedFrames: 1, inFlightFrames: 1 });

    worker.emitResponse(createResult(1));

    expect(received).toEqual([createResult(1)]);
    expect(client.getDiagnostics()).toMatchObject({
      completedFrames: 1,
      inFlightFrames: 0,
      lastElapsedMs: 1.25,
      lastError: null,
    });
  });

  it('drops frames while a worker request is in flight', () => {
    const worker = new FakeAnalysisWorker();
    const client = new AnalysisWorkerClient({
      createWorker: () => worker,
      onFrame: () => {},
    });

    expect(client.requestFrame(createPayload())).toBe(true);
    expect(client.requestFrame(createPayload())).toBe(false);

    expect(worker.posted).toHaveLength(1);
    expect(client.getDiagnostics()).toMatchObject({
      requestedFrames: 1,
      droppedFrames: 1,
      inFlightFrames: 1,
    });
  });

  it('reports protocol errors and clears matching in-flight work', () => {
    const worker = new FakeAnalysisWorker();
    const errors: string[] = [];
    const client = new AnalysisWorkerClient({
      createWorker: () => worker,
      onFrame: () => {},
      onError: (error) => errors.push(error.message),
    });

    client.requestFrame(createPayload());
    worker.emitResponse({
      kind: 'analysis-error',
      protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
      id: 1,
      code: 'analysis-failed',
      message: 'Worker could not analyze frame.',
    });

    expect(errors).toEqual(['Worker could not analyze frame.']);
    expect(client.getDiagnostics()).toMatchObject({
      failedFrames: 1,
      inFlightFrames: 0,
      lastError: 'Worker could not analyze frame.',
    });
  });

  it('treats invalid worker responses as boundary failures without getting stuck', () => {
    const worker = new FakeAnalysisWorker();
    const errors: string[] = [];
    const client = new AnalysisWorkerClient({
      createWorker: () => worker,
      onFrame: () => {},
      onError: (error) => errors.push(error.message),
    });

    client.requestFrame(createPayload());
    worker.emitUnknown({ kind: 'analysis-frame-result', id: 1 });

    expect(errors).toEqual(['Invalid analysis worker response.']);
    expect(client.getDiagnostics()).toMatchObject({
      failedFrames: 1,
      invalidResponses: 1,
      inFlightFrames: 0,
    });
    expect(client.requestFrame(createPayload())).toBe(true);
    expect(worker.posted).toHaveLength(2);
  });

  it('terminates the worker on disposal and refuses new frames', () => {
    const worker = new FakeAnalysisWorker();
    const client = new AnalysisWorkerClient({
      createWorker: () => worker,
      onFrame: () => {},
    });

    client.requestFrame(createPayload());
    client.dispose();

    expect(worker.terminated).toBe(true);
    expect(client.requestFrame(createPayload())).toBe(false);
    expect(client.getDiagnostics().inFlightFrames).toBe(0);
  });

  it('reports worker runtime errors', () => {
    const worker = new FakeAnalysisWorker();
    const errors: string[] = [];
    const client = new AnalysisWorkerClient({
      createWorker: () => worker,
      onFrame: () => {},
      onError: (error) => errors.push(error.message),
    });

    client.requestFrame(createPayload());
    worker.emitError('Worker crashed.');

    expect(errors).toEqual(['Worker crashed.']);
    expect(client.getDiagnostics()).toMatchObject({
      failedFrames: 1,
      inFlightFrames: 0,
      lastError: 'Worker crashed.',
    });
  });
});
