import type { AudioFrameFeatures } from './frameAnalysis';

export const ANALYSIS_WORKER_PROTOCOL_VERSION = 1;

export interface AnalysisFramePayload {
  readonly currentTimeS: number;
  readonly sampleRateHz: number;
  readonly fftBinCount: number;
  readonly playId: number;
  readonly fileId: number;
  readonly displayGain: number;
  readonly analysisGeneration: number;
  readonly timeDomainLeft: Float32Array<ArrayBuffer>;
  readonly timeDomainRight: Float32Array<ArrayBuffer>;
  readonly frequencyDbLeft: Float32Array<ArrayBuffer>;
  readonly frequencyDbRight: Float32Array<ArrayBuffer>;
}

export interface AnalyzeFrameRequest {
  readonly kind: 'analyze-frame';
  readonly protocolVersion: typeof ANALYSIS_WORKER_PROTOCOL_VERSION;
  readonly id: number;
  readonly payload: AnalysisFramePayload;
}

export type AnalysisWorkerRequest = AnalyzeFrameRequest;

export interface AnalysisFrameResult {
  readonly kind: 'analysis-frame-result';
  readonly protocolVersion: typeof ANALYSIS_WORKER_PROTOCOL_VERSION;
  readonly id: number;
  readonly payload: AnalysisFramePayload;
  readonly features: AudioFrameFeatures;
  readonly elapsedMs: number;
}

export type AnalysisWorkerErrorCode = 'invalid-request' | 'analysis-failed';

export interface AnalysisWorkerError {
  readonly kind: 'analysis-error';
  readonly protocolVersion: typeof ANALYSIS_WORKER_PROTOCOL_VERSION;
  readonly id: number | null;
  readonly code: AnalysisWorkerErrorCode;
  readonly message: string;
}

export type AnalysisWorkerResponse = AnalysisFrameResult | AnalysisWorkerError;

export function getAnalysisFrameTransferables(payload: AnalysisFramePayload): Transferable[] {
  const transferables: Transferable[] = [];
  const seen = new Set<ArrayBuffer>();

  const addBuffer = (array: Float32Array<ArrayBuffer>): void => {
    if (seen.has(array.buffer)) return;
    seen.add(array.buffer);
    transferables.push(array.buffer);
  };

  addBuffer(payload.timeDomainLeft);
  addBuffer(payload.timeDomainRight);
  addBuffer(payload.frequencyDbLeft);
  addBuffer(payload.frequencyDbRight);

  return transferables;
}

export function getAnalysisFrameResultTransferables(result: AnalysisFrameResult): Transferable[] {
  return getAnalysisFrameTransferables(result.payload);
}

export function createAnalysisWorkerErrorResponse(
  id: number | null,
  code: AnalysisWorkerErrorCode,
  message: string,
): AnalysisWorkerError {
  return {
    kind: 'analysis-error',
    protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
    id,
    code,
    message,
  };
}

export function getAnalysisWorkerRequestId(value: unknown): number | null {
  if (!isRecord(value)) return null;
  return isRequestId(value.id) ? value.id : null;
}

export function isAnalysisWorkerRequest(value: unknown): value is AnalysisWorkerRequest {
  if (!isRecord(value)) return false;
  if (value.kind !== 'analyze-frame') return false;
  if (value.protocolVersion !== ANALYSIS_WORKER_PROTOCOL_VERSION) return false;
  if (!isRequestId(value.id)) return false;
  return isAnalysisFramePayload(value.payload);
}

export function isAnalysisWorkerResponse(value: unknown): value is AnalysisWorkerResponse {
  if (!isRecord(value)) return false;
  if (value.protocolVersion !== ANALYSIS_WORKER_PROTOCOL_VERSION) return false;

  if (value.kind === 'analysis-frame-result') {
    return (
      isRequestId(value.id) &&
      isAnalysisFramePayload(value.payload) &&
      isAudioFrameFeatures(value.features) &&
      typeof value.elapsedMs === 'number' &&
      Number.isFinite(value.elapsedMs) &&
      value.elapsedMs >= 0
    );
  }

  if (value.kind === 'analysis-error') {
    return (
      (value.id === null || isRequestId(value.id)) &&
      isAnalysisWorkerErrorCode(value.code) &&
      typeof value.message === 'string'
    );
  }

  return false;
}

function isAnalysisFramePayload(value: unknown): value is AnalysisFramePayload {
  if (!isRecord(value)) return false;
  const {
    currentTimeS,
    sampleRateHz,
    fftBinCount,
    playId,
    fileId,
    displayGain,
    analysisGeneration,
    timeDomainLeft,
    timeDomainRight,
    frequencyDbLeft,
    frequencyDbRight,
  } = value;
  return (
    isFiniteNumber(currentTimeS) &&
    currentTimeS >= 0 &&
    typeof sampleRateHz === 'number' &&
    Number.isFinite(sampleRateHz) &&
    sampleRateHz > 0 &&
    isPositiveSafeInteger(fftBinCount) &&
    isRequestId(playId) &&
    isRequestId(fileId) &&
    isFiniteNumber(displayGain) &&
    displayGain >= 0 &&
    isPositiveSafeInteger(analysisGeneration) &&
    timeDomainLeft instanceof Float32Array &&
    timeDomainRight instanceof Float32Array &&
    frequencyDbLeft instanceof Float32Array &&
    frequencyDbRight instanceof Float32Array &&
    timeDomainLeft.length === timeDomainRight.length &&
    frequencyDbLeft.length === fftBinCount &&
    frequencyDbRight.length === fftBinCount
  );
}

function isAudioFrameFeatures(value: unknown): value is AudioFrameFeatures {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.peakLeft) &&
    isFiniteNumber(value.peakRight) &&
    isFiniteNumber(value.rmsLeft) &&
    isFiniteNumber(value.rmsRight) &&
    isFiniteNumber(value.spectralCentroid) &&
    (value.f0Hz === null || isFiniteNumber(value.f0Hz)) &&
    isFiniteNumber(value.f0Confidence) &&
    isFiniteNumber(value.phaseCorrelation)
  );
}

function isAnalysisWorkerErrorCode(value: unknown): value is AnalysisWorkerErrorCode {
  return value === 'invalid-request' || value === 'analysis-failed';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRequestId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
