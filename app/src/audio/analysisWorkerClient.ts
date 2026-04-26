import {
  ANALYSIS_WORKER_PROTOCOL_VERSION,
  getAnalysisFrameTransferables,
  isAnalysisWorkerResponse,
  type AnalysisFramePayload,
  type AnalysisFrameResult,
  type AnalysisWorkerError,
  type AnalysisWorkerRequest,
} from './analysisWorkerProtocol';

export interface AnalysisWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: AnalysisWorkerRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export type AnalysisWorkerFactory = () => AnalysisWorkerPort;
export type AnalysisFrameResultHandler = (result: AnalysisFrameResult) => void;
export type AnalysisWorkerErrorHandler = (error: AnalysisWorkerError) => void;

export interface AnalysisWorkerDiagnostics {
  readonly requestedFrames: number;
  readonly completedFrames: number;
  readonly droppedFrames: number;
  readonly failedFrames: number;
  readonly invalidResponses: number;
  readonly inFlightFrames: number;
  readonly lastElapsedMs: number | null;
  readonly lastError: string | null;
}

export interface AnalysisWorkerClientOptions {
  readonly createWorker: AnalysisWorkerFactory;
  readonly onFrame: AnalysisFrameResultHandler;
  readonly onError?: AnalysisWorkerErrorHandler;
}

export function createBrowserAnalysisWorker(): AnalysisWorkerPort {
  return new Worker(new URL('./analysisWorker.ts', import.meta.url), { type: 'module' });
}

export class AnalysisWorkerClient {
  private readonly options: AnalysisWorkerClientOptions;
  private worker: AnalysisWorkerPort | null = null;
  private nextRequestId = 1;
  private inFlightRequestId: number | null = null;
  private disposed = false;
  private diagnostics: AnalysisWorkerDiagnostics = {
    requestedFrames: 0,
    completedFrames: 0,
    droppedFrames: 0,
    failedFrames: 0,
    invalidResponses: 0,
    inFlightFrames: 0,
    lastElapsedMs: null,
    lastError: null,
  };

  constructor(options: AnalysisWorkerClientOptions) {
    this.options = options;
  }

  requestFrame(payload: AnalysisFramePayload): boolean {
    if (this.disposed) return false;
    if (this.inFlightRequestId !== null) {
      this.updateDiagnostics({ droppedFrames: this.diagnostics.droppedFrames + 1 });
      return false;
    }

    const worker = this.ensureWorker();
    const request: AnalysisWorkerRequest = {
      kind: 'analyze-frame',
      protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
      id: this.nextRequestId++,
      payload,
    };

    this.inFlightRequestId = request.id;
    this.updateDiagnostics({
      requestedFrames: this.diagnostics.requestedFrames + 1,
      inFlightFrames: 1,
      lastError: null,
    });
    worker.postMessage(request, getAnalysisFrameTransferables(payload));
    return true;
  }

  getDiagnostics(): AnalysisWorkerDiagnostics {
    return { ...this.diagnostics };
  }

  dispose(): void {
    this.disposed = true;
    this.inFlightRequestId = null;
    this.updateDiagnostics({ inFlightFrames: 0 });
    this.worker?.terminate();
    this.worker = null;
  }

  private ensureWorker(): AnalysisWorkerPort {
    if (this.worker) return this.worker;

    const worker = this.options.createWorker();
    worker.onmessage = (event: MessageEvent<unknown>): void => {
      this.handleResponse(event.data);
    };
    worker.onerror = (event: ErrorEvent): void => {
      this.handleWorkerError(event.message || 'Analysis worker failed.');
    };
    this.worker = worker;
    return worker;
  }

  private handleResponse(value: unknown): void {
    if (!isAnalysisWorkerResponse(value)) {
      this.handleInvalidResponse();
      return;
    }

    if (value.kind === 'analysis-error') {
      this.handleProtocolError(value);
      return;
    }

    if (value.id !== this.inFlightRequestId) {
      this.handleInvalidResponse();
      return;
    }

    this.inFlightRequestId = null;
    this.updateDiagnostics({
      completedFrames: this.diagnostics.completedFrames + 1,
      inFlightFrames: 0,
      lastElapsedMs: value.elapsedMs,
      lastError: null,
    });
    this.options.onFrame(value);
  }

  private handleProtocolError(error: AnalysisWorkerError): void {
    if (error.id === null || error.id === this.inFlightRequestId) {
      this.inFlightRequestId = null;
      this.updateDiagnostics({ inFlightFrames: 0 });
    }

    this.updateDiagnostics({
      failedFrames: this.diagnostics.failedFrames + 1,
      lastError: error.message,
    });
    this.options.onError?.(error);
  }

  private handleInvalidResponse(): void {
    this.inFlightRequestId = null;
    const error: AnalysisWorkerError = {
      kind: 'analysis-error',
      protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
      id: null,
      code: 'analysis-failed',
      message: 'Invalid analysis worker response.',
    };

    this.updateDiagnostics({
      failedFrames: this.diagnostics.failedFrames + 1,
      invalidResponses: this.diagnostics.invalidResponses + 1,
      inFlightFrames: 0,
      lastError: error.message,
    });
    this.options.onError?.(error);
  }

  private handleWorkerError(message: string): void {
    this.inFlightRequestId = null;
    const error: AnalysisWorkerError = {
      kind: 'analysis-error',
      protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
      id: null,
      code: 'analysis-failed',
      message,
    };

    this.updateDiagnostics({
      failedFrames: this.diagnostics.failedFrames + 1,
      inFlightFrames: 0,
      lastError: message,
    });
    this.options.onError?.(error);
  }

  private updateDiagnostics(next: Partial<AnalysisWorkerDiagnostics>): void {
    this.diagnostics = { ...this.diagnostics, ...next };
  }
}
