import {
  getDecodedSpectrogramSourceTransferables,
  type DecodedSpectrogramColumnRange,
  type DecodedSpectrogramSource,
  type SpectrogramRowBand,
} from './decodedSpectrogram';

export const DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION = 1;

export interface DecodedSpectrogramWorkerInput {
  readonly source: DecodedSpectrogramSource;
  readonly fftSize: number;
  readonly width: number;
  readonly rowBands: readonly SpectrogramRowBand[];
  readonly dbMin: number;
  readonly dbMax: number;
  readonly priorityRange: DecodedSpectrogramColumnRange | null;
  readonly chunkBudgetMs: number;
}

export interface BuildDecodedSpectrogramRequest {
  readonly kind: 'build-decoded-spectrogram';
  readonly protocolVersion: typeof DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION;
  readonly id: number;
  readonly payload: DecodedSpectrogramWorkerInput;
}

export interface PrioritizeDecodedSpectrogramRequest {
  readonly kind: 'prioritize-decoded-spectrogram';
  readonly protocolVersion: typeof DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION;
  readonly id: number;
  readonly priorityRange: DecodedSpectrogramColumnRange | null;
}

export interface CancelDecodedSpectrogramRequest {
  readonly kind: 'cancel-decoded-spectrogram';
  readonly protocolVersion: typeof DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION;
  readonly id: number;
}

export type DecodedSpectrogramWorkerRequest =
  | BuildDecodedSpectrogramRequest
  | PrioritizeDecodedSpectrogramRequest
  | CancelDecodedSpectrogramRequest;

export interface DecodedSpectrogramChunk {
  readonly kind: 'decoded-spectrogram-chunk';
  readonly protocolVersion: typeof DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION;
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly startColumn: number;
  readonly endColumn: number;
  readonly levels: Int16Array<ArrayBuffer>;
  readonly completedColumns: number;
  readonly done: boolean;
  readonly elapsedMs: number;
}

export type DecodedSpectrogramWorkerErrorCode = 'invalid-request' | 'build-failed';

export interface DecodedSpectrogramWorkerError {
  readonly kind: 'decoded-spectrogram-error';
  readonly protocolVersion: typeof DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION;
  readonly id: number | null;
  readonly code: DecodedSpectrogramWorkerErrorCode;
  readonly message: string;
}

export type DecodedSpectrogramWorkerResponse =
  | DecodedSpectrogramChunk
  | DecodedSpectrogramWorkerError;

export function getDecodedSpectrogramBuildTransferables(
  request: BuildDecodedSpectrogramRequest,
): Transferable[] {
  return getDecodedSpectrogramSourceTransferables(request.payload.source);
}

export function getDecodedSpectrogramChunkTransferables(
  response: DecodedSpectrogramChunk,
): Transferable[] {
  return [response.levels.buffer];
}

export function createDecodedSpectrogramWorkerErrorResponse(
  id: number | null,
  code: DecodedSpectrogramWorkerErrorCode,
  message: string,
): DecodedSpectrogramWorkerError {
  return {
    kind: 'decoded-spectrogram-error',
    protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
    id,
    code,
    message,
  };
}

export function getDecodedSpectrogramWorkerRequestId(value: unknown): number | null {
  if (!isRecord(value)) return null;
  return isRequestId(value.id) ? value.id : null;
}

export function isDecodedSpectrogramWorkerRequest(value: unknown): value is DecodedSpectrogramWorkerRequest {
  if (!isRecord(value)) return false;
  if (value.protocolVersion !== DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION) return false;
  if (!isRequestId(value.id)) return false;

  if (value.kind === 'build-decoded-spectrogram') {
    return isDecodedSpectrogramWorkerInput(value.payload);
  }

  if (value.kind === 'prioritize-decoded-spectrogram') {
    return value.priorityRange === null || isColumnRange(value.priorityRange);
  }

  return value.kind === 'cancel-decoded-spectrogram';
}

export function isDecodedSpectrogramWorkerResponse(value: unknown): value is DecodedSpectrogramWorkerResponse {
  if (!isRecord(value)) return false;
  if (value.protocolVersion !== DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION) return false;

  if (value.kind === 'decoded-spectrogram-chunk') {
    return (
      isRequestId(value.id) &&
      isPositiveSafeInteger(value.width) &&
      isPositiveSafeInteger(value.height) &&
      isNonNegativeSafeInteger(value.startColumn) &&
      isNonNegativeSafeInteger(value.endColumn) &&
      value.endColumn >= value.startColumn &&
      value.endColumn <= value.width &&
      value.levels instanceof Int16Array &&
      value.levels.length === (value.endColumn - value.startColumn) * value.height &&
      isNonNegativeSafeInteger(value.completedColumns) &&
      value.completedColumns <= value.width &&
      typeof value.done === 'boolean' &&
      isFiniteNumber(value.elapsedMs) &&
      value.elapsedMs >= 0
    );
  }

  if (value.kind === 'decoded-spectrogram-error') {
    return (
      (value.id === null || isRequestId(value.id)) &&
      (value.code === 'invalid-request' || value.code === 'build-failed') &&
      typeof value.message === 'string'
    );
  }

  return false;
}

function isDecodedSpectrogramWorkerInput(value: unknown): value is DecodedSpectrogramWorkerInput {
  if (!isRecord(value)) return false;
  return (
    isDecodedSpectrogramSource(value.source) &&
    isPositiveSafeInteger(value.fftSize) &&
    isPositiveSafeInteger(value.width) &&
    Array.isArray(value.rowBands) &&
    value.rowBands.every(isRowBand) &&
    isFiniteNumber(value.dbMin) &&
    isFiniteNumber(value.dbMax) &&
    value.dbMax > value.dbMin &&
    (value.priorityRange === null || isColumnRange(value.priorityRange)) &&
    isFiniteNumber(value.chunkBudgetMs) &&
    value.chunkBudgetMs >= 0
  );
}

function isDecodedSpectrogramSource(value: unknown): value is DecodedSpectrogramSource {
  if (!isRecord(value)) return false;
  return (
    value.left instanceof Float32Array &&
    value.right instanceof Float32Array &&
    isPositiveSafeInteger(value.length) &&
    value.left.length === value.length &&
    value.right.length === value.length &&
    isFiniteNumber(value.sampleRate) &&
    value.sampleRate > 0 &&
    isPositiveSafeInteger(value.numberOfChannels)
  );
}

function isRowBand(value: unknown): value is SpectrogramRowBand {
  if (!isRecord(value)) return false;
  return isNonNegativeSafeInteger(value.lowBin) && isNonNegativeSafeInteger(value.highBin);
}

function isColumnRange(value: unknown): value is DecodedSpectrogramColumnRange {
  if (!isRecord(value)) return false;
  return (
    isNonNegativeSafeInteger(value.startColumn) &&
    isNonNegativeSafeInteger(value.endColumn) &&
    value.endColumn >= value.startColumn
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRequestId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
