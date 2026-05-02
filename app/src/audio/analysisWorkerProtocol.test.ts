import { describe, expect, it } from 'vitest';

import {
  ANALYSIS_WORKER_PROTOCOL_VERSION,
  createAnalysisWorkerErrorResponse,
  getAnalysisFrameTransferables,
  getAnalysisFrameResultTransferables,
  getAnalysisWorkerRequestId,
  isAnalysisWorkerRequest,
  isAnalysisWorkerResponse,
  type AnalysisFrameResult,
  type AnalysisWorkerRequest,
} from './analysisWorkerProtocol';

function createRequest(): AnalysisWorkerRequest {
  return {
    kind: 'analyze-frame',
    protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
    id: 7,
    payload: {
      sampleRateHz: 48_000,
      currentTimeS: 1.25,
      fftBinCount: 3,
      playId: 2,
      fileId: 4,
      displayGain: 1.2,
      analysisGeneration: 1,
      timeDomainLeft: new Float32Array([0, 0.25, -0.25]),
      timeDomainRight: new Float32Array([0, 0.2, -0.2]),
      frequencyDbLeft: new Float32Array([-100, -40, -20]),
      frequencyDbRight: new Float32Array([-100, -42, -22]),
    },
  };
}

describe('analysis worker protocol', () => {
  it('accepts a versioned analyze-frame request with typed buffers', () => {
    expect(isAnalysisWorkerRequest(createRequest())).toBe(true);
  });

  it('rejects malformed worker messages at the boundary', () => {
    expect(isAnalysisWorkerRequest({ ...createRequest(), protocolVersion: 2 })).toBe(false);
    expect(isAnalysisWorkerRequest({ ...createRequest(), id: -1 })).toBe(false);
    expect(isAnalysisWorkerRequest({ ...createRequest(), payload: { sampleRateHz: 48_000 } })).toBe(false);
    expect(isAnalysisWorkerRequest({ ...createRequest(), payload: { ...createRequest().payload, sampleRateHz: 0 } })).toBe(
      false,
    );
    expect(isAnalysisWorkerRequest({ ...createRequest(), payload: { ...createRequest().payload, currentTimeS: -1 } })).toBe(
      false,
    );
    expect(isAnalysisWorkerRequest({ ...createRequest(), payload: { ...createRequest().payload, frequencyDbRight: new Float32Array(2) } })).toBe(
      false,
    );
  });

  it('validates worker responses at the boundary', () => {
    expect(
      isAnalysisWorkerResponse({
        kind: 'analysis-frame-result',
        protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
        id: 7,
        payload: createRequest().payload,
        elapsedMs: 0.5,
        features: {
          peakLeft: 0.1,
          peakRight: 0.2,
          rmsLeft: 0.05,
          rmsRight: 0.06,
          spectralCentroid: 400,
          f0Hz: null,
          f0Confidence: 0,
          phaseCorrelation: 0.8,
        },
      }),
    ).toBe(true);
    expect(
      isAnalysisWorkerResponse({
        kind: 'analysis-error',
        protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
        id: null,
        code: 'analysis-failed',
        message: 'No frame.',
      }),
    ).toBe(true);
    expect(
      isAnalysisWorkerResponse({
        kind: 'analysis-frame-result',
        protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
        id: 7,
        elapsedMs: -1,
        features: {},
      }),
    ).toBe(false);
    expect(
      isAnalysisWorkerResponse({
        kind: 'analysis-error',
        protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
        id: 7,
        code: 'unknown',
        message: 'No frame.',
      }),
    ).toBe(false);
  });

  it('keeps request ids available for invalid-request diagnostics', () => {
    expect(getAnalysisWorkerRequestId({ id: 3, kind: 'unknown' })).toBe(3);
    expect(getAnalysisWorkerRequestId({ id: 1.5 })).toBeNull();
    expect(getAnalysisWorkerRequestId(null)).toBeNull();
  });

  it('returns unique transferables for the frame payload buffers', () => {
    const request = createRequest();
    const transferables = getAnalysisFrameTransferables(request.payload);

    expect(transferables).toEqual([
      request.payload.timeDomainLeft.buffer,
      request.payload.timeDomainRight.buffer,
      request.payload.frequencyDbLeft.buffer,
      request.payload.frequencyDbRight.buffer,
    ]);

    const sharedTimeDomain = new Float32Array(6);
    const sharedFrequencyDb = new Float32Array(6);

    expect(
      getAnalysisFrameTransferables({
        currentTimeS: 0,
        sampleRateHz: 48_000,
        fftBinCount: 3,
        playId: 0,
        fileId: 0,
        displayGain: 1,
        analysisGeneration: 1,
        timeDomainLeft: sharedTimeDomain.subarray(0, 3),
        timeDomainRight: sharedTimeDomain.subarray(3, 6),
        frequencyDbLeft: sharedFrequencyDb.subarray(0, 3),
        frequencyDbRight: sharedFrequencyDb.subarray(3, 6),
      }),
    ).toEqual([sharedTimeDomain.buffer, sharedFrequencyDb.buffer]);
  });

  it('returns response transferables for the analyzed payload buffers', () => {
    const request = createRequest();
    const result: AnalysisFrameResult = {
      kind: 'analysis-frame-result' as const,
      protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
      id: 7,
      payload: request.payload,
      elapsedMs: 0.5,
      features: {
        peakLeft: 0.1,
        peakRight: 0.2,
        rmsLeft: 0.05,
        rmsRight: 0.06,
        spectralCentroid: 400,
        f0Hz: null,
        f0Confidence: 0,
        phaseCorrelation: 0.8,
      },
    };

    expect(getAnalysisFrameResultTransferables(result)).toEqual(getAnalysisFrameTransferables(request.payload));
  });

  it('builds versioned error responses', () => {
    expect(createAnalysisWorkerErrorResponse(7, 'invalid-request', 'Bad payload')).toEqual({
      kind: 'analysis-error',
      protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
      id: 7,
      code: 'invalid-request',
      message: 'Bad payload',
    });
  });
});
