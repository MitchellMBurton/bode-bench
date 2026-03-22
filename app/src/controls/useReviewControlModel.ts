import { useCallback, useEffect, useState } from 'react';

import {
  useAudioEngine,
  useDerivedMediaSnapshot,
  useDerivedMediaStore,
  useDiagnosticsLog,
} from '../core/session';
import type { RangeMark, TransportState } from '../types';
import { formatTransportTime } from '../utils/format';

const INITIAL_TRANSPORT: TransportState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  filename: null,
  volume: 1,
  playbackBackend: 'decoded',
  scrubActive: false,
  playbackRate: 1,
  pitchSemitones: 0,
  pitchShiftAvailable: true,
  loopStart: null,
  loopEnd: null,
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export interface ReviewControlModel {
  readonly transport: TransportState;
  readonly pendingRangeStartS: number | null;
  readonly selectedRangeId: number | null;
  readonly selectedRange: RangeMark | null;
  readonly rangeMarks: readonly RangeMark[];
  readonly markersCount: number;
  readonly canCommitRange: boolean;
  readonly loopReady: boolean;
  readonly setIn: () => void;
  readonly setOut: () => void;
  readonly captureLoop: () => void;
  readonly clearIn: () => void;
  readonly clearRanges: () => void;
  readonly selectRange: (rangeId: number) => void;
  readonly auditionRange: (rangeMark: RangeMark) => void;
  readonly deleteRange: (rangeId: number) => void;
}

export function useReviewControlModel(): ReviewControlModel {
  const audioEngine = useAudioEngine();
  const derivedMedia = useDerivedMediaStore();
  const snapshot = useDerivedMediaSnapshot();
  const diagnosticsLog = useDiagnosticsLog();
  const [transport, setTransport] = useState<TransportState>(INITIAL_TRANSPORT);

  useEffect(() => {
    return audioEngine.onTransport(setTransport);
  }, [audioEngine]);

  const selectedRange = snapshot.selectedRangeId === null
    ? null
    : snapshot.rangeMarks.find((rangeMark) => rangeMark.id === snapshot.selectedRangeId) ?? null;
  if (snapshot.selectedRangeId !== null) {
    assert(selectedRange, 'selected review range is missing');
  }

  const pendingRangeStartS = snapshot.pendingRangeStartS;
  const loopReady = transport.loopStart !== null && transport.loopEnd !== null;
  const canCommitRange = pendingRangeStartS !== null && Math.abs(transport.currentTime - pendingRangeStartS) >= 0.01;

  const setIn = useCallback((): void => {
    const startS = derivedMedia.setPendingRangeStart(transport.currentTime);
    diagnosticsLog.push(`range in @ ${formatTransportTime(startS)}`, 'info', 'transport');
  }, [derivedMedia, diagnosticsLog, transport.currentTime]);

  const setOut = useCallback((): void => {
    if (!canCommitRange) return;
    const rangeMark = derivedMedia.commitPendingRange(transport.currentTime);
    diagnosticsLog.push(
      `range ${rangeMark.label} ${formatTransportTime(rangeMark.startS)} -> ${formatTransportTime(rangeMark.endS)}`,
      'info',
      'transport',
    );
  }, [canCommitRange, derivedMedia, diagnosticsLog, transport.currentTime]);

  const captureLoop = useCallback((): void => {
    if (!loopReady) return;
    assert(transport.loopStart !== null && transport.loopEnd !== null, 'loop range is missing');
    const rangeMark = derivedMedia.addRange(transport.loopStart, transport.loopEnd);
    diagnosticsLog.push(
      `range ${rangeMark.label} from loop ${formatTransportTime(rangeMark.startS)} -> ${formatTransportTime(rangeMark.endS)}`,
      'info',
      'transport',
    );
  }, [derivedMedia, diagnosticsLog, loopReady, transport.loopEnd, transport.loopStart]);

  const clearIn = useCallback((): void => {
    if (pendingRangeStartS === null) return;
    derivedMedia.clearPendingRangeStart();
    diagnosticsLog.push('range in cleared', 'dim', 'transport');
  }, [derivedMedia, diagnosticsLog, pendingRangeStartS]);

  const clearRanges = useCallback((): void => {
    if (snapshot.rangeMarks.length === 0) return;
    derivedMedia.clearRanges();
    diagnosticsLog.push('ranges cleared', 'info', 'transport');
  }, [derivedMedia, diagnosticsLog, snapshot.rangeMarks.length]);

  const selectRange = useCallback((rangeId: number): void => {
    derivedMedia.selectRange(rangeId);
  }, [derivedMedia]);

  const auditionRange = useCallback((rangeMark: RangeMark): void => {
    derivedMedia.selectRange(rangeMark.id);
    audioEngine.setLoop(rangeMark.startS, rangeMark.endS);
    audioEngine.seek(rangeMark.startS);
    diagnosticsLog.push(
      `loop audition ${rangeMark.label} ${formatTransportTime(rangeMark.startS)} -> ${formatTransportTime(rangeMark.endS)}`,
      'info',
      'transport',
    );
  }, [audioEngine, derivedMedia, diagnosticsLog]);

  const deleteRange = useCallback((rangeId: number): void => {
    const rangeMark = snapshot.rangeMarks.find((entry) => entry.id === rangeId);
    assert(rangeMark, 'range to delete is missing');
    derivedMedia.deleteRange(rangeId);
    diagnosticsLog.push(`range ${rangeMark.label} removed`, 'dim', 'transport');
  }, [derivedMedia, diagnosticsLog, snapshot.rangeMarks]);

  return {
    transport,
    pendingRangeStartS,
    selectedRangeId: snapshot.selectedRangeId,
    selectedRange,
    rangeMarks: snapshot.rangeMarks,
    markersCount: snapshot.markers.length,
    canCommitRange,
    loopReady,
    setIn,
    setOut,
    captureLoop,
    clearIn,
    clearRanges,
    selectRange,
    auditionRange,
    deleteRange,
  };
}
