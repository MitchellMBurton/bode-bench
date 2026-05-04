import {
  copyDecodedSpectrogramSource,
  type DecodedSpectrogramColumnRange,
  type SpectrogramRowBand,
} from './decodedSpectrogram';
import {
  DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
  getDecodedSpectrogramBuildTransferables,
  isDecodedSpectrogramWorkerResponse,
  type BuildDecodedSpectrogramRequest,
  type DecodedSpectrogramChunk,
  type DecodedSpectrogramWorkerError,
  type DecodedSpectrogramWorkerRequest,
} from './decodedSpectrogramWorkerProtocol';

export interface DecodedSpectrogramWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: DecodedSpectrogramWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface DecodedSpectrogramWorkerJobInput {
  readonly buffer: AudioBuffer;
  readonly fftSize: number;
  readonly width: number;
  readonly rowBands: readonly SpectrogramRowBand[];
  readonly dbMin: number;
  readonly dbMax: number;
  readonly priorityRange: DecodedSpectrogramColumnRange | null;
  readonly chunkBudgetMs: number;
}

export interface DecodedSpectrogramWorkerJob {
  readonly id: number;
  updatePriority(priorityRange: DecodedSpectrogramColumnRange | null): void;
  cancel(): void;
}

export interface DecodedSpectrogramWorkerClientOptions {
  readonly createWorker?: () => DecodedSpectrogramWorkerPort;
  readonly onChunk: (chunk: DecodedSpectrogramChunk) => void;
  readonly onError?: (error: DecodedSpectrogramWorkerError) => void;
}

export function createBrowserDecodedSpectrogramWorker(): DecodedSpectrogramWorkerPort {
  return new Worker(new URL('./decodedSpectrogramWorker.ts', import.meta.url), { type: 'module' });
}

export class DecodedSpectrogramWorkerClient {
  private readonly options: Required<DecodedSpectrogramWorkerClientOptions>;
  private worker: DecodedSpectrogramWorkerPort | null = null;
  private nextJobId = 1;
  private activeJobId: number | null = null;
  private disposed = false;

  constructor(options: DecodedSpectrogramWorkerClientOptions) {
    this.options = {
      createWorker: options.createWorker ?? createBrowserDecodedSpectrogramWorker,
      onChunk: options.onChunk,
      onError: options.onError ?? (() => {}),
    };
  }

  start(input: DecodedSpectrogramWorkerJobInput): DecodedSpectrogramWorkerJob {
    if (this.disposed) {
      throw new Error('Decoded spectrogram worker client is disposed.');
    }

    const id = this.nextJobId++;
    this.activeJobId = id;
    const request: BuildDecodedSpectrogramRequest = {
      kind: 'build-decoded-spectrogram',
      protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
      id,
      payload: {
        source: copyDecodedSpectrogramSource(input.buffer),
        fftSize: input.fftSize,
        width: input.width,
        rowBands: input.rowBands,
        dbMin: input.dbMin,
        dbMax: input.dbMax,
        priorityRange: input.priorityRange,
        chunkBudgetMs: input.chunkBudgetMs,
      },
    };

    this.ensureWorker().postMessage(request, getDecodedSpectrogramBuildTransferables(request));
    return {
      id,
      updatePriority: (priorityRange) => {
        if (this.disposed || this.activeJobId !== id) return;
        this.ensureWorker().postMessage({
          kind: 'prioritize-decoded-spectrogram',
          protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
          id,
          priorityRange,
        });
      },
      cancel: () => {
        if (this.disposed || this.activeJobId !== id) return;
        this.ensureWorker().postMessage({
          kind: 'cancel-decoded-spectrogram',
          protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
          id,
        });
        this.activeJobId = null;
      },
    };
  }

  dispose(): void {
    this.disposed = true;
    this.activeJobId = null;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
    }
    this.worker = null;
  }

  private ensureWorker(): DecodedSpectrogramWorkerPort {
    if (this.worker) return this.worker;

    const worker = this.options.createWorker();
    worker.onmessage = (event: MessageEvent<unknown>) => {
      this.handleMessage(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      this.handleError({
        kind: 'decoded-spectrogram-error',
        protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
        id: this.activeJobId,
        code: 'build-failed',
        message: event.message || 'Decoded spectrogram worker failed.',
      });
    };
    this.worker = worker;
    return worker;
  }

  private handleMessage(value: unknown): void {
    if (this.disposed) return;
    if (!isDecodedSpectrogramWorkerResponse(value)) {
      this.handleError({
        kind: 'decoded-spectrogram-error',
        protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
        id: this.activeJobId,
        code: 'build-failed',
        message: 'Invalid decoded spectrogram worker response.',
      });
      return;
    }

    if (value.kind === 'decoded-spectrogram-error') {
      this.handleError(value);
      return;
    }

    if (value.id !== this.activeJobId) return;
    this.options.onChunk(value);
    if (value.done) {
      this.activeJobId = null;
    }
  }

  private handleError(error: DecodedSpectrogramWorkerError): void {
    if (error.id === null || error.id === this.activeJobId) {
      this.activeJobId = null;
    }
    this.options.onError(error);
  }
}
