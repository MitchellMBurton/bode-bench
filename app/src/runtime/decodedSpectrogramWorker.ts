import {
  createDecodedSpectrogramSourceBuilder,
  type DecodedSpectrogramBuilder,
  type DecodedSpectrogramColumnRange,
} from './decodedSpectrogram';
import {
  DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
  createDecodedSpectrogramWorkerErrorResponse,
  getDecodedSpectrogramChunkTransferables,
  getDecodedSpectrogramWorkerRequestId,
  isDecodedSpectrogramWorkerRequest,
  type DecodedSpectrogramChunk,
  type DecodedSpectrogramWorkerRequest,
  type DecodedSpectrogramWorkerResponse,
} from './decodedSpectrogramWorkerProtocol';

interface DecodedSpectrogramWorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: DecodedSpectrogramWorkerResponse, transfer?: Transferable[]): void;
  setTimeout(callback: () => void, delay?: number): number;
  clearTimeout(id: number): void;
}

interface ActiveJob {
  readonly id: number;
  readonly startedAt: number;
  readonly builder: DecodedSpectrogramBuilder;
  readonly chunkBudgetMs: number;
  priorityRange: DecodedSpectrogramColumnRange | null;
  scheduled: number | null;
  cancelled: boolean;
}

const workerScope = self as unknown as DecodedSpectrogramWorkerScope;
let activeJob: ActiveJob | null = null;

workerScope.onmessage = (event: MessageEvent<unknown>): void => {
  const requestId = getDecodedSpectrogramWorkerRequestId(event.data);
  if (!isDecodedSpectrogramWorkerRequest(event.data)) {
    workerScope.postMessage(
      createDecodedSpectrogramWorkerErrorResponse(requestId, 'invalid-request', 'Invalid decoded spectrogram request.'),
    );
    return;
  }

  handleRequest(event.data);
};

function handleRequest(request: DecodedSpectrogramWorkerRequest): void {
  switch (request.kind) {
    case 'build-decoded-spectrogram':
      cancelActiveJob();
      try {
        const builder = createDecodedSpectrogramSourceBuilder(request.payload);
        activeJob = {
          id: request.id,
          startedAt: performance.now(),
          builder,
          chunkBudgetMs: request.payload.chunkBudgetMs,
          priorityRange: request.payload.priorityRange,
          scheduled: null,
          cancelled: false,
        };
        scheduleJob(activeJob);
      } catch (error) {
        workerScope.postMessage(
          createDecodedSpectrogramWorkerErrorResponse(
            request.id,
            'build-failed',
            error instanceof Error ? error.message : 'Decoded spectrogram build failed.',
          ),
        );
      }
      break;

    case 'prioritize-decoded-spectrogram':
      if (activeJob?.id === request.id) {
        activeJob.priorityRange = request.priorityRange;
      }
      break;

    case 'cancel-decoded-spectrogram':
      if (activeJob?.id === request.id) {
        cancelActiveJob();
      }
      break;

    default:
      break;
  }
}

function scheduleJob(job: ActiveJob): void {
  if (job.cancelled || activeJob !== job || job.scheduled !== null) return;
  job.scheduled = workerScope.setTimeout(() => {
    job.scheduled = null;
    runJobChunk(job);
  }, 0);
}

function runJobChunk(job: ActiveJob): void {
  if (job.cancelled || activeJob !== job) return;

  try {
    const result = job.builder.advance(job.chunkBudgetMs, job.priorityRange);
    for (const range of result.builtRanges) {
      postBuiltRange(job, range);
    }

    if (job.builder.done) {
      activeJob = null;
      return;
    }

    scheduleJob(job);
  } catch (error) {
    activeJob = null;
    workerScope.postMessage(
      createDecodedSpectrogramWorkerErrorResponse(
        job.id,
        'build-failed',
        error instanceof Error ? error.message : 'Decoded spectrogram build failed.',
      ),
    );
  }
}

function postBuiltRange(job: ActiveJob, range: DecodedSpectrogramColumnRange): void {
  const { builder } = job;
  const start = Math.max(0, Math.min(builder.width, range.startColumn));
  const end = Math.max(start, Math.min(builder.width, range.endColumn));
  if (end <= start || builder.height <= 0) return;

  const columnCount = end - start;
  const levels = new Int16Array(columnCount * builder.height);
  for (let y = 0; y < builder.height; y++) {
    const sourceStart = y * builder.width + start;
    const targetStart = y * columnCount;
    levels.set(builder.history.subarray(sourceStart, sourceStart + columnCount), targetStart);
  }

  const response: DecodedSpectrogramChunk = {
    kind: 'decoded-spectrogram-chunk',
    protocolVersion: DECODED_SPECTROGRAM_WORKER_PROTOCOL_VERSION,
    id: job.id,
    width: builder.width,
    height: builder.height,
    startColumn: start,
    endColumn: end,
    levels,
    completedColumns: builder.completedColumns,
    done: builder.done,
    elapsedMs: Math.max(0, performance.now() - job.startedAt),
  };
  workerScope.postMessage(response, getDecodedSpectrogramChunkTransferables(response));
}

function cancelActiveJob(): void {
  if (!activeJob) return;
  activeJob.cancelled = true;
  if (activeJob.scheduled !== null) {
    workerScope.clearTimeout(activeJob.scheduled);
  }
  activeJob = null;
}

export {};
