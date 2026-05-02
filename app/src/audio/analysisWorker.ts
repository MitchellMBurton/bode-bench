import { analyzeFrameOnMainThread } from './analysisRuntime';
import {
  ANALYSIS_WORKER_PROTOCOL_VERSION,
  createAnalysisWorkerErrorResponse,
  getAnalysisFrameResultTransferables,
  getAnalysisWorkerRequestId,
  isAnalysisWorkerRequest,
  type AnalysisFrameResult,
  type AnalysisWorkerResponse,
} from './analysisWorkerProtocol';

interface AnalysisWorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: AnalysisWorkerResponse, transfer?: Transferable[]): void;
}

const workerScope = self as unknown as AnalysisWorkerScope;

workerScope.onmessage = (event: MessageEvent<unknown>): void => {
  const startedAt = performance.now();
  const requestId = getAnalysisWorkerRequestId(event.data);

  if (!isAnalysisWorkerRequest(event.data)) {
    workerScope.postMessage(
      createAnalysisWorkerErrorResponse(requestId, 'invalid-request', 'Invalid analysis worker request.'),
    );
    return;
  }

  try {
    const response: AnalysisFrameResult = {
      kind: 'analysis-frame-result',
      protocolVersion: ANALYSIS_WORKER_PROTOCOL_VERSION,
      id: event.data.id,
      payload: event.data.payload,
      features: analyzeFrameOnMainThread(event.data.payload),
      elapsedMs: Math.max(0, performance.now() - startedAt),
    };
    workerScope.postMessage(response, getAnalysisFrameResultTransferables(response));
  } catch (error) {
    workerScope.postMessage(
      createAnalysisWorkerErrorResponse(
        event.data.id,
        'analysis-failed',
        error instanceof Error ? error.message : 'Analysis failed.',
      ),
    );
  }
};

export {};
