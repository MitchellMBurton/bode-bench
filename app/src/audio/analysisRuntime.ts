import { computeAudioFrameFeatures, type AudioFrameFeatures } from './frameAnalysis';
import type { AnalysisFramePayload } from './analysisWorkerProtocol';

export type AnalysisRuntimeMode = 'main-thread' | 'worker';

export interface MainThreadAnalysisAdapter {
  readonly mode: 'main-thread';
  analyzeFrame(payload: AnalysisFramePayload): AudioFrameFeatures;
}

export function analyzeFrameOnMainThread(payload: AnalysisFramePayload): AudioFrameFeatures {
  return computeAudioFrameFeatures(
    payload.timeDomainLeft,
    payload.timeDomainRight,
    payload.frequencyDbLeft,
    payload.sampleRateHz,
  );
}

export const mainThreadAnalysisAdapter: MainThreadAnalysisAdapter = {
  mode: 'main-thread',
  analyzeFrame: analyzeFrameOnMainThread,
};
