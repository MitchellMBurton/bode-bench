import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useTheaterMode } from '../core/session';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import type { FileAnalysis, ScrubStyle, TransportState } from '../types';

interface EnvelopeData {
  peakEnv: Float32Array;
  rmsEnv: Float32Array;
  clipMap: Uint8Array;
}
interface StreamedScoutTarget {
  readonly colStart: number;
  readonly colEnd: number;
  readonly time: number;
}

const CLIP_THRESHOLD = 0.9999;
const PANEL_DPR_MAX = 1.25;
const DEFAULT_ENVELOPE_COLS = 1024;
const ENVELOPE_COL_BUCKET = 64;
const ENVELOPE_SLICE_BUDGET_MS = 5;
const STREAMED_ENVELOPE_MAX_COLS = 2048;
const STREAMED_ENVELOPE_SECONDS_PER_COL = 4;
const STREAMED_ENVELOPE_BRIDGE_MAX_BINS = 24;
const STREAMED_SCOUT_TARGET_SAMPLES = 192;
const STREAMED_SCOUT_READY_TIMEOUT_MS = 1800;
const STREAMED_SCOUT_SAMPLE_WINDOW_MS = 110;
const STREAMED_SCOUT_IDLE_DELAY_MS = 72;
const STREAMED_SCOUT_ACTIVE_DELAY_MS = 240;
const STREAMED_SCOUT_STRESS_DELAY_MS = 900;
const SCRUB_STYLE_OPTIONS: ReadonlyArray<{
  readonly value: ScrubStyle;
  readonly label: string;
  readonly detail: string;
}> = [
  { value: 'step', label: 'STEP', detail: 'precise bite' },
  { value: 'tape', label: 'TAPE', detail: 'smooth shuttle' },
  { value: 'wheel', label: 'WHEEL', detail: 'jog emphasis' },
];

function bucketEnvelopeCols(cols: number): number {
  const rounded = Math.max(DEFAULT_ENVELOPE_COLS, Math.round(cols / ENVELOPE_COL_BUCKET) * ENVELOPE_COL_BUCKET);
  return Math.max(64, rounded);
}

function pickStreamedEnvelopeCols(duration: number): number {
  const target = Math.max(DEFAULT_ENVELOPE_COLS, Math.round(duration / STREAMED_ENVELOPE_SECONDS_PER_COL));
  return Math.min(STREAMED_ENVELOPE_MAX_COLS, bucketEnvelopeCols(target));
}

function buildMediaKey(filename: string | null, duration: number): string | null {
  if (!filename || !Number.isFinite(duration) || duration <= 0) return null;
  return `${filename}:${duration.toFixed(3)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitForMediaReadyState(element: HTMLMediaElement, timeoutMs: number): Promise<void> {
  if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;

    const cleanup = () => {
      element.removeEventListener('loadeddata', onReady);
      element.removeEventListener('canplay', onReady);
      element.removeEventListener('error', onReady);
      if (timer) window.clearTimeout(timer);
    };

    const onReady = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    timer = window.setTimeout(onReady, timeoutMs);
    element.addEventListener('loadeddata', onReady, { once: true });
    element.addEventListener('canplay', onReady, { once: true });
    element.addEventListener('error', onReady, { once: true });
  });
}

function seekMediaElement(element: HTMLMediaElement, time: number, timeoutMs: number): Promise<void> {
  if (!Number.isFinite(time) || time < 0) return Promise.resolve();
  if (Math.abs(element.currentTime - time) <= 0.025) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;

    const cleanup = () => {
      element.removeEventListener('seeked', onDone);
      element.removeEventListener('error', onDone);
      if (timer) window.clearTimeout(timer);
    };

    const onDone = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    timer = window.setTimeout(onDone, timeoutMs);
    element.addEventListener('seeked', onDone, { once: true });
    element.addEventListener('error', onDone, { once: true });
    element.currentTime = time;
  });
}

function sampleTimeDomainLevels(data: Float32Array): { peak: number; rms: number } {
  let peak = 0;
  let sumSquares = 0;

  for (let index = 0; index < data.length; index++) {
    const value = data[index];
    const abs = Math.abs(value);
    if (abs > peak) peak = abs;
    sumSquares += value * value;
  }

  return {
    peak,
    rms: data.length > 0 ? Math.sqrt(sumSquares / data.length) : 0,
  };
}

function buildMidpointScoutOrder(sampleCount: number): number[] {
  if (sampleCount <= 0) return [];

  const order: number[] = [];
  const queue: Array<readonly [number, number]> = [[0, sampleCount - 1]];

  while (queue.length > 0) {
    const [start, end] = queue.shift()!;
    const mid = Math.floor((start + end) / 2);
    order.push(mid);

    if (start <= mid - 1) queue.push([start, mid - 1]);
    if (mid + 1 <= end) queue.push([mid + 1, end]);
  }

  return order;
}

function buildStreamedScoutTargets(cols: number, duration: number): StreamedScoutTarget[] {
  const targetCount = Math.max(1, Math.min(cols, STREAMED_SCOUT_TARGET_SAMPLES));
  const slotOrder = buildMidpointScoutOrder(targetCount);

  return slotOrder.map((slot) => {
    const colStart = Math.floor((slot * cols) / targetCount);
    const colEnd = Math.min(cols - 1, Math.max(colStart, Math.floor(((slot + 1) * cols) / targetCount) - 1));
    const timeFraction = ((colStart + colEnd + 1) / 2) / cols;

    return {
      colStart,
      colEnd,
      time: Math.max(0, Math.min(duration, timeFraction * duration)),
    };
  });
}

function shouldThrottleStreamedScout(transport: TransportState): boolean {
  if (transport.scrubActive) return true;
  if (!transport.isPlaying) return false;
  return Math.abs(transport.playbackRate - 1) > 0.15 || transport.pitchSemitones !== 0;
}

function computeEnvelopeAndClipMapAsync(
  buffer: AudioBuffer,
  cols: number,
  onComplete: (data: EnvelopeData) => void,
): () => void {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const samplesPerCol = left.length / cols;
  const peakEnv = new Float32Array(cols);
  const rmsEnv = new Float32Array(cols);
  const clipMap = new Uint8Array(cols);
  let envPeak = 0;
  let col = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const finish = (): void => {
    if (cancelled) return;
    if (envPeak > 0) {
      for (let index = 0; index < cols; index++) {
        peakEnv[index] /= envPeak;
        rmsEnv[index] /= envPeak;
      }
    }
    onComplete({ peakEnv, rmsEnv, clipMap });
  };

  const step = (): void => {
    timer = null;
    if (cancelled) return;

    const sliceStartedAt = performance.now();
    while (col < cols) {
      const start = Math.floor(col * samplesPerCol);
      const end = Math.min(Math.floor((col + 1) * samplesPerCol), left.length);
      let colPeak = 0;
      let rmsSum = 0;
      let sampleCount = 0;

      for (let sample = start; sample < end; sample++) {
        const leftValue = left[sample];
        const leftAbs = Math.abs(leftValue);
        if (leftAbs > colPeak) colPeak = leftAbs;
        rmsSum += leftValue * leftValue;
        sampleCount++;
        if (leftAbs >= CLIP_THRESHOLD) clipMap[col] = 1;

        if (right) {
          const rightValue = right[sample];
          const rightAbs = Math.abs(rightValue);
          if (rightAbs > colPeak) colPeak = rightAbs;
          rmsSum += rightValue * rightValue;
          sampleCount++;
          if (rightAbs >= CLIP_THRESHOLD) clipMap[col] = 1;
        }
      }

      peakEnv[col] = colPeak;
      rmsEnv[col] = sampleCount > 0 ? Math.sqrt(rmsSum / sampleCount) : 0;
      if (colPeak > envPeak) envPeak = colPeak;
      col++;

      if (performance.now() - sliceStartedAt >= ENVELOPE_SLICE_BUDGET_MS) {
        timer = window.setTimeout(step, 0);
        return;
      }
    }

    finish();
  };

  step();

  return () => {
    cancelled = true;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
}

function pickGridInterval(duration: number): number {
  for (const interval of [5, 10, 15, 20, 30, 60, 90, 120, 180, 300, 600]) {
    const lines = duration / interval;
    if (lines >= 3 && lines <= 12) return interval;
  }
  return Math.max(1, Math.round(duration / 6));
}

function fmtTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return minutes > 0 ? `${minutes}:${String(secs).padStart(2, '0')}` : `${secs}s`;
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  color: string,
  rightX: number,
  topY: number,
  dpr: number,
): void {
  ctx.font = `${9 * dpr}px ${FONTS.mono}`;
  const textWidth = ctx.measureText(text).width;
  const padX = 4 * dpr;
  const padY = 2 * dpr;
  const badgeH = 11 * dpr;
  ctx.fillStyle = 'rgba(8,8,11,0.78)';
  ctx.fillRect(rightX - textWidth - padX * 2, topY, textWidth + padX * 2, badgeH + padY * 2);
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(text, rightX - padX, topY + padY);
}

export function WaveformOverviewPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const theaterMode = useTheaterMode();
  const [scrubStyle, setScrubStyle] = useState<ScrubStyle>(() => audioEngine.scrubStyle);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peakEnvRef = useRef<Float32Array | null>(null);
  const rmsEnvRef = useRef<Float32Array | null>(null);
  const clipMapRef = useRef<Uint8Array | null>(null);
  const streamedPeakEnvRef = useRef<Float32Array | null>(null);
  const streamedRmsEnvRef = useRef<Float32Array | null>(null);
  const streamedCoverageRef = useRef<Uint8Array | null>(null);
  const streamedPeakMaxRef = useRef(0);
  const streamedLearnedCountRef = useRef(0);
  const streamedFileIdRef = useRef<number | null>(null);
  const streamedLastBinRef = useRef<number | null>(null);
  const streamedEnvelopeKeyRef = useRef<string | null>(null);
  const streamedScoutCancelRef = useRef<(() => void) | null>(null);
  const streamedScoutKeyRef = useRef<string | null>(null);
  const transportModeRef = useRef<TransportState['playbackBackend']>('decoded');
  const transportKeyRef = useRef<string | null>(null);
  const transportRef = useRef<TransportState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    filename: null,
    playbackBackend: 'decoded',
    scrubActive: false,
    playbackRate: 1,
    pitchSemitones: 0,
    pitchShiftAvailable: true,
    loopStart: null,
    loopEnd: null,
  });
  const analysisRef = useRef<FileAnalysis | null>(null);
  const centroidRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const envelopeCancelRef = useRef<(() => void) | null>(null);
  const envelopeRequestIdRef = useRef(0);
  const envelopeColsRef = useRef(0);
  const envelopeFileIdRef = useRef(-1);
  const isDraggingRef = useRef(false);
  const isShiftDragRef = useRef(false);
  const loopDragStartRef = useRef<number | null>(null);

  const cancelEnvelopeCompute = useCallback(() => {
    if (envelopeCancelRef.current) {
      envelopeCancelRef.current();
      envelopeCancelRef.current = null;
    }
  }, []);

  const cancelStreamedScout = useCallback(() => {
    if (streamedScoutCancelRef.current) {
      streamedScoutCancelRef.current();
      streamedScoutCancelRef.current = null;
    }
    streamedScoutKeyRef.current = null;
  }, []);

  const mergeStreamedEnvelopeRange = useCallback((startIndex: number, endIndex: number, peak: number, rms: number) => {
    const peakEnv = streamedPeakEnvRef.current;
    const rmsEnv = streamedRmsEnvRef.current;
    const coverage = streamedCoverageRef.current;
    if (!peakEnv || !rmsEnv || !coverage || peakEnv.length === 0) return;

    const boundedStart = Math.max(0, Math.min(peakEnv.length - 1, startIndex));
    const boundedEnd = Math.max(boundedStart, Math.min(peakEnv.length - 1, endIndex));
    const boundedPeak = Math.max(0, peak);
    const boundedRms = Math.max(0, Math.min(boundedPeak, rms));

    for (let index = boundedStart; index <= boundedEnd; index++) {
      peakEnv[index] = Math.max(peakEnv[index], boundedPeak);
      rmsEnv[index] = Math.max(rmsEnv[index], boundedRms);
      if (coverage[index] === 0) {
        coverage[index] = 1;
        streamedLearnedCountRef.current++;
      }
    }

    if (boundedPeak > streamedPeakMaxRef.current) {
      streamedPeakMaxRef.current = boundedPeak;
    }
  }, []);

  const resetStreamedEnvelope = useCallback(() => {
    streamedPeakEnvRef.current = null;
    streamedRmsEnvRef.current = null;
    streamedCoverageRef.current = null;
    streamedPeakMaxRef.current = 0;
    streamedLearnedCountRef.current = 0;
    streamedFileIdRef.current = null;
    streamedLastBinRef.current = null;
    streamedEnvelopeKeyRef.current = null;
  }, []);

  const initializeStreamedEnvelope = useCallback((filename: string, duration: number, force = false): boolean => {
    const key = buildMediaKey(filename, duration);
    if (!key) {
      resetStreamedEnvelope();
      return false;
    }
    if (
      !force
      && streamedEnvelopeKeyRef.current === key
      && streamedPeakEnvRef.current
      && streamedRmsEnvRef.current
      && streamedCoverageRef.current
    ) {
      return true;
    }

    const cols = pickStreamedEnvelopeCols(duration);
    streamedPeakEnvRef.current = new Float32Array(cols);
    streamedRmsEnvRef.current = new Float32Array(cols);
    streamedCoverageRef.current = new Uint8Array(cols);
    streamedPeakMaxRef.current = 0;
    streamedLearnedCountRef.current = 0;
    streamedFileIdRef.current = null;
    streamedLastBinRef.current = null;
    streamedEnvelopeKeyRef.current = key;
    return true;
  }, [resetStreamedEnvelope]);

  const scheduleEnvelopeCompute = useCallback((requestedCols: number, force = false) => {
    const buffer = audioEngine.audioBuffer;
    const analysis = analysisRef.current;
    if (!buffer || !analysis || requestedCols <= 0) return;

    const targetCols = bucketEnvelopeCols(requestedCols);
    if (
      !force
      && envelopeFileIdRef.current === analysis.fileId
      && envelopeColsRef.current === targetCols
      && peakEnvRef.current
      && rmsEnvRef.current
      && clipMapRef.current
    ) {
      return;
    }

    cancelEnvelopeCompute();

    const requestId = envelopeRequestIdRef.current + 1;
    envelopeRequestIdRef.current = requestId;
    const fileId = analysis.fileId;

    envelopeCancelRef.current = computeEnvelopeAndClipMapAsync(buffer, targetCols, (data) => {
      if (envelopeRequestIdRef.current !== requestId) return;
      if (analysisRef.current?.fileId !== fileId) return;
      peakEnvRef.current = data.peakEnv;
      rmsEnvRef.current = data.rmsEnv;
      clipMapRef.current = data.clipMap;
      envelopeColsRef.current = targetCols;
      envelopeFileIdRef.current = fileId;
      envelopeCancelRef.current = null;
    });
  }, [audioEngine, cancelEnvelopeCompute]);

  const startStreamedScout = useCallback((filename: string, duration: number) => {
    const key = buildMediaKey(filename, duration);
    if (!key) return;

    if (!initializeStreamedEnvelope(filename, duration)) return;
    if (streamedScoutKeyRef.current === key && streamedScoutCancelRef.current) return;

    cancelStreamedScout();

    const probe = audioEngine.createStreamedOverviewProbe();
    if (!probe) return;

    let cancelled = false;
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      probe.dispose();
      if (streamedScoutCancelRef.current === cancel) {
        streamedScoutCancelRef.current = null;
      }
      if (streamedScoutKeyRef.current === key) {
        streamedScoutKeyRef.current = null;
      }
    };

    streamedScoutKeyRef.current = key;
    streamedScoutCancelRef.current = cancel;

    const run = async () => {
      try {
        await waitForMediaReadyState(probe.element, STREAMED_SCOUT_READY_TIMEOUT_MS);
        if (cancelled) return;

        const targets = buildStreamedScoutTargets(
          streamedPeakEnvRef.current?.length ?? pickStreamedEnvelopeCols(duration),
          duration,
        );

        for (const target of targets) {
          if (cancelled) break;

          const coverage = streamedCoverageRef.current;
          if (!coverage) break;

          let needsSample = false;
          for (let index = target.colStart; index <= target.colEnd; index++) {
            if (coverage[index] === 0) {
              needsSample = true;
              break;
            }
          }
          if (!needsSample) continue;

          if (shouldThrottleStreamedScout(transportRef.current)) {
            await delay(STREAMED_SCOUT_STRESS_DELAY_MS);
            continue;
          }

          await seekMediaElement(probe.element, target.time, STREAMED_SCOUT_READY_TIMEOUT_MS);
          if (cancelled) break;

          try {
            await Promise.resolve(probe.element.play());
            await delay(STREAMED_SCOUT_SAMPLE_WINDOW_MS);
          } catch {
            await delay(STREAMED_SCOUT_SAMPLE_WINDOW_MS);
          }

          probe.analyser.getFloatTimeDomainData(probe.timeDomain as Float32Array<ArrayBuffer>);
          probe.element.pause();
          const { peak, rms } = sampleTimeDomainLevels(probe.timeDomain);
          if (peak > 0.0001) {
            mergeStreamedEnvelopeRange(target.colStart, target.colEnd, peak, rms);
          }

          await delay(transportRef.current.isPlaying ? STREAMED_SCOUT_ACTIVE_DELAY_MS : STREAMED_SCOUT_IDLE_DELAY_MS);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('streamed overview scout failed, retained live learning', error);
        }
      } finally {
        cancel();
      }
    };

    void run();
  }, [audioEngine, cancelStreamedScout, initializeStreamedEnvelope, mergeStreamedEnvelopeRange]);

  useEffect(() => frameBus.subscribe((frame) => {
    centroidRef.current = frame.spectralCentroid;

    const transport = transportRef.current;
    if (transport.playbackBackend !== 'streamed' || !transport.filename || transport.duration <= 0) {
      return;
    }

    if (!initializeStreamedEnvelope(transport.filename, transport.duration)) return;
    if (
      streamedFileIdRef.current !== null
      && streamedFileIdRef.current !== frame.fileId
      && !initializeStreamedEnvelope(transport.filename, transport.duration, true)
    ) {
      return;
    }

    streamedFileIdRef.current = frame.fileId;

    const peakEnv = streamedPeakEnvRef.current;
    const rmsEnv = streamedRmsEnvRef.current;
    const coverage = streamedCoverageRef.current;
    if (!peakEnv || !rmsEnv || !coverage || peakEnv.length === 0) return;

    const duration = Math.max(0.001, transport.duration);
    const cols = peakEnv.length;
    const currentIndex = Math.max(
      0,
      Math.min(cols - 1, Math.round((Math.max(0, Math.min(duration, frame.currentTime)) / duration) * (cols - 1))),
    );
    const framePeak = Math.max(frame.peakLeft, frame.peakRight);
    const frameRms = Math.max(frame.rmsLeft, frame.rmsRight);
    const previousIndex = streamedLastBinRef.current;
    let startIndex = currentIndex;
    let endIndex = currentIndex;

    if (previousIndex !== null && Math.abs(currentIndex - previousIndex) <= STREAMED_ENVELOPE_BRIDGE_MAX_BINS) {
      startIndex = Math.min(previousIndex, currentIndex);
      endIndex = Math.max(previousIndex, currentIndex);
    }

    mergeStreamedEnvelopeRange(startIndex, endIndex, framePeak, frameRms);
    streamedLastBinRef.current = currentIndex;
  }), [frameBus, initializeStreamedEnvelope, mergeStreamedEnvelopeRange]);

  useEffect(() => audioEngine.onTransport((transport) => {
    transportRef.current = transport;
    const nextKey = buildMediaKey(transport.filename, transport.duration);
    const modeChanged = transport.playbackBackend !== transportModeRef.current;
    const keyChanged = nextKey !== transportKeyRef.current;

    if (!modeChanged && !keyChanged) return;

    transportModeRef.current = transport.playbackBackend;
    transportKeyRef.current = nextKey;

    if (transport.playbackBackend === 'streamed' && transport.filename && transport.duration > 0) {
      cancelEnvelopeCompute();
      peakEnvRef.current = null;
      rmsEnvRef.current = null;
      clipMapRef.current = null;
      analysisRef.current = null;
      envelopeColsRef.current = 0;
      envelopeFileIdRef.current = -1;
      initializeStreamedEnvelope(transport.filename, transport.duration, true);
      startStreamedScout(transport.filename, transport.duration);
      return;
    }

    cancelStreamedScout();
    resetStreamedEnvelope();
  }), [audioEngine, cancelEnvelopeCompute, cancelStreamedScout, initializeStreamedEnvelope, resetStreamedEnvelope, startStreamedScout]);

  useEffect(() => audioEngine.onFileReady((analysis) => {
    cancelStreamedScout();
    resetStreamedEnvelope();
    analysisRef.current = analysis;
    const canvas = canvasRef.current;
    const cols = canvas && canvas.width > 0 ? canvas.width : DEFAULT_ENVELOPE_COLS;
    scheduleEnvelopeCompute(cols, true);
  }), [audioEngine, cancelStreamedScout, resetStreamedEnvelope, scheduleEnvelopeCompute]);

  useEffect(() => audioEngine.onReset(() => {
    cancelEnvelopeCompute();
    cancelStreamedScout();
    peakEnvRef.current = null;
    rmsEnvRef.current = null;
    clipMapRef.current = null;
    resetStreamedEnvelope();
    analysisRef.current = null;
    centroidRef.current = 0;
    envelopeColsRef.current = 0;
    envelopeFileIdRef.current = -1;
  }), [audioEngine, cancelEnvelopeCompute, cancelStreamedScout, resetStreamedEnvelope]);

  const fractionFromPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  }, []);

  const scrubFromPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const duration = audioEngine.duration;
    if (duration > 0) audioEngine.scrubTo(fractionFromPointer(event) * duration);
  }, [audioEngine, fractionFromPointer]);

  const finishPointerGesture = useCallback(() => {
    const shouldEndScrub = !isShiftDragRef.current;
    isDraggingRef.current = false;
    isShiftDragRef.current = false;
    loopDragStartRef.current = null;
    if (shouldEndScrub) {
      audioEngine.endScrub();
    }
  }, [audioEngine]);

  const onScrubStyleChange = useCallback((nextStyle: ScrubStyle) => {
    setScrubStyle(nextStyle);
    audioEngine.setScrubStyle(nextStyle);
  }, [audioEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
        const nextWidth = Math.round(width * dpr);
        const nextHeight = Math.round(height * dpr);
        const prevWidth = canvas.width;
        canvas.width = nextWidth;
        canvas.height = nextHeight;

        if (nextWidth > 0 && (nextWidth !== prevWidth || !peakEnvRef.current)) {
          scheduleEnvelopeCompute(nextWidth);
        }
      }
    });

    ro.observe(canvas);
    return () => {
      ro.disconnect();
      cancelEnvelopeCompute();
    };
  }, [cancelEnvelopeCompute, scheduleEnvelopeCompute]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || theaterMode) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.nge;
      const hyper = displayMode.hyper;
      const clipZoneH = Math.round(18 * dpr);
      const separatorH = 1;
      const waveH = height - clipZoneH - separatorH;
      const backgroundFill = nge ? CANVAS.nge.bg2 : hyper ? CANVAS.hyper.bg2 : COLORS.bg2;
      const stripFill = nge ? 'rgba(8,18,8,0.92)' : hyper ? 'rgba(8,14,32,0.92)' : COLORS.bg3;
      const gridColor = nge ? 'rgba(22,54,18,1)' : hyper ? 'rgba(28,42,88,0.92)' : COLORS.bg3;
      const textColor = nge ? CANVAS.nge.label : hyper ? CANVAS.hyper.label : COLORS.textDim;
      const waveformFill = nge ? 'rgba(160,216,64,0.18)' : hyper ? 'rgba(98,232,255,0.22)' : 'rgba(200, 146, 42, 0.22)';
      const waveformStroke = nge ? CANVAS.nge.trace : hyper ? CANVAS.hyper.trace : COLORS.waveform;
      const waveformShadow = nge ? 'rgba(160,216,64,0.35)' : hyper ? 'rgba(255,92,188,0.32)' : 'rgba(200, 146, 42, 0.35)';
      const playFill = nge ? 'rgba(80, 160, 50, 0.10)' : hyper ? 'rgba(98,232,255,0.08)' : 'rgba(80, 96, 192, 0.10)';
      const playFillWave = nge ? 'rgba(80, 160, 50, 0.07)' : hyper ? 'rgba(98,232,255,0.07)' : 'rgba(80, 96, 192, 0.07)';
      const playCursor = hyper ? 'rgba(255,92,188,0.92)' : COLORS.accent;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = backgroundFill;
      ctx.fillRect(0, 0, width, height);

      const decodedPeakEnv = peakEnvRef.current;
      const decodedRmsEnv = rmsEnvRef.current;
      const clipMap = clipMapRef.current;
      const streamedPeakEnv = streamedPeakEnvRef.current;
      const streamedRmsEnv = streamedRmsEnvRef.current;
      const streamedCoverage = streamedCoverageRef.current;
      const analysis = analysisRef.current;
      const duration = audioEngine.duration;
      const currentTime = audioEngine.currentTime;
      const isStreamedOverview = Boolean(
        audioEngine.backendMode === 'streamed'
        && streamedPeakEnv
        && streamedRmsEnv
        && streamedCoverage,
      );
      const peakEnv = isStreamedOverview ? streamedPeakEnv! : decodedPeakEnv;
      const rmsEnv = isStreamedOverview ? streamedRmsEnv! : decodedRmsEnv;
      const coverageMap = isStreamedOverview ? streamedCoverage! : null;
      const peakNormalizer = isStreamedOverview
        ? 1 / Math.max(streamedPeakMaxRef.current, 0.0001)
        : 1;
      const learnedRatio = coverageMap
        ? streamedLearnedCountRef.current / Math.max(1, coverageMap.length)
        : 0;

      if (duration > 0) {
        const clipZoneY = waveH + separatorH;

        ctx.fillStyle = stripFill;
        ctx.fillRect(0, clipZoneY, width, clipZoneH);

        if (clipMap) {
          const envLen = clipMap.length;
          const scaleX = width / envLen;
          for (let i = 0; i < envLen; i++) {
            const x = i * scaleX;
            const columnW = Math.max(1, scaleX);
            ctx.fillStyle = clipMap[i] ? 'rgba(200, 40, 40, 1)' : 'rgba(56, 168, 80, 0.10)';
            ctx.fillRect(x, clipZoneY, columnW, clipZoneH);
          }

          ctx.fillStyle = 'rgba(255, 60, 60, 0.90)';
          for (let i = 0; i < envLen; i++) {
            if (clipMap[i]) ctx.fillRect(i * scaleX, clipZoneY, Math.max(1, scaleX), 2 * dpr);
          }
        } else if (coverageMap) {
          const envLen = coverageMap.length;
          const scaleX = width / envLen;
          const learnedFill = hyper ? 'rgba(98,232,255,0.18)' : 'rgba(80, 96, 192, 0.22)';
          const learnedHighlight = hyper ? 'rgba(255,92,188,0.52)' : 'rgba(160, 170, 240, 0.46)';
          for (let i = 0; i < envLen; i++) {
            if (!coverageMap[i]) continue;
            const x = i * scaleX;
            const columnW = Math.max(1, scaleX);
            ctx.fillStyle = learnedFill;
            ctx.fillRect(x, clipZoneY, columnW, clipZoneH);
            ctx.fillStyle = learnedHighlight;
            ctx.fillRect(x, clipZoneY, columnW, Math.max(1, dpr));
          }
        }

        const playX = (currentTime / duration) * width;
        ctx.fillStyle = playFill;
        ctx.fillRect(0, clipZoneY, playX, clipZoneH);

        ctx.fillStyle = hyper ? 'rgba(32,52,110,0.92)' : COLORS.border;
        ctx.fillRect(0, waveH, width, separatorH);
      }

      if (peakEnv && rmsEnv && duration > 0) {
        const midY = waveH / 2;
        const ampH = midY - 3 * dpr;
        const envLen = peakEnv.length;
        const scaleX = width / envLen;

        const interval = pickGridInterval(duration);
        ctx.lineWidth = 1;
        for (let t = interval; t < duration; t += interval) {
          const x = Math.round((t / duration) * width) + 0.5;
          ctx.strokeStyle = gridColor;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, waveH);
          ctx.stroke();
          ctx.font = `${7 * dpr}px ${FONTS.mono}`;
          ctx.fillStyle = textColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(fmtTime(t), x, 2 * dpr);
        }

        if (coverageMap) {
          for (let i = 0; i < envLen; i++) {
            if (!coverageMap[i]) continue;
            const x = i * scaleX;
            const columnW = Math.max(1, scaleX);
            const peak = Math.max(0, Math.min(1, peakEnv[i] * peakNormalizer));
            const rms = Math.max(0, Math.min(peak, rmsEnv[i] * peakNormalizer));
            const rmsHalf = rms * ampH;
            const peakHalf = peak * ampH;

            if (rmsHalf > 0) {
              ctx.fillStyle = waveformFill;
              ctx.fillRect(x, midY - rmsHalf, columnW, rmsHalf * 2);
            }

            if (peakHalf > 0) {
              ctx.fillStyle = waveformStroke;
              ctx.fillRect(x, midY - peakHalf, columnW, Math.max(1, dpr));
              ctx.fillStyle = waveformShadow;
              ctx.fillRect(x, midY + peakHalf - Math.max(1, dpr), columnW, Math.max(1, dpr));
            }
          }
        } else {
          ctx.beginPath();
          ctx.moveTo(0, midY);
          for (let i = 0; i < envLen; i++) ctx.lineTo(i * scaleX, midY - rmsEnv[i] * ampH);
          for (let i = envLen - 1; i >= 0; i--) ctx.lineTo(i * scaleX, midY + rmsEnv[i] * ampH);
          ctx.closePath();
          ctx.fillStyle = waveformFill;
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(0, midY);
          for (let i = 0; i < envLen; i++) ctx.lineTo(i * scaleX, midY - peakEnv[i] * ampH);
          ctx.strokeStyle = waveformStroke;
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(0, midY);
          for (let i = 0; i < envLen; i++) ctx.lineTo(i * scaleX, midY + peakEnv[i] * ampH);
          ctx.strokeStyle = waveformShadow;
          ctx.stroke();
        }

        if (clipMap) {
          const cmLen = clipMap.length;
          const cmScaleX = width / cmLen;
          ctx.fillStyle = 'rgba(200, 40, 40, 0.55)';
          for (let i = 0; i < cmLen; i++) {
            if (clipMap[i]) ctx.fillRect(i * cmScaleX, 0, Math.max(1, cmScaleX), waveH);
          }
        }

        const playX = (currentTime / duration) * width;
        ctx.fillStyle = playFillWave;
        ctx.fillRect(0, 0, playX, waveH);

        ctx.strokeStyle = playCursor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(playX, 0);
        ctx.lineTo(playX, waveH);
        ctx.stroke();

        // Loop region overlay
        const loopStart = audioEngine.loopStart;
        const loopEnd = audioEngine.loopEnd;
        if (loopStart !== null && loopEnd !== null) {
          const lx1 = (loopStart / duration) * width;
          const lx2 = (loopEnd / duration) * width;
          ctx.fillStyle = 'rgba(80, 200, 120, 0.10)';
          ctx.fillRect(lx1, 0, lx2 - lx1, waveH);
          ctx.strokeStyle = 'rgba(80, 200, 120, 0.60)';
          ctx.lineWidth = 1.5 * dpr;
          ctx.beginPath(); ctx.moveTo(lx1, 0); ctx.lineTo(lx1, waveH); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(lx2, 0); ctx.lineTo(lx2, waveH); ctx.stroke();
          // Loop label
          ctx.font = `${7 * dpr}px ${FONTS.mono}`;
          ctx.fillStyle = 'rgba(80, 200, 120, 0.70)';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText('LOOP', lx1 + 3 * dpr, 3 * dpr);
        }

        if (analysis) {
          const dr = analysis.crestFactorDb;
          const drColor =
            dr >= 12 ? COLORS.statusOk :
            dr >= 8 ? COLORS.statusWarn :
            COLORS.statusErr;
          const clipText = analysis.clipCount > 0 ? `${analysis.clipCount} CLIPS` : 'CLEAN';
          const clipColor = analysis.clipCount > 0 ? COLORS.statusErr : COLORS.statusOk;

          drawBadge(ctx, `DR ${dr.toFixed(1)} dB`, drColor, width - SPACING.sm * dpr, 4 * dpr, dpr);
          drawBadge(ctx, clipText, clipColor, width - SPACING.sm * dpr, 19 * dpr, dpr);
        } else if (isStreamedOverview) {
          const liveColor = hyper ? CANVAS.hyper.trace : COLORS.borderHighlight;
          drawBadge(ctx, 'LIVE OVR', liveColor, width - SPACING.sm * dpr, 4 * dpr, dpr);
          drawBadge(ctx, `${Math.round(learnedRatio * 100)}% LEARNED`, COLORS.textTitle, width - SPACING.sm * dpr, 19 * dpr, dpr);
        }

        const centroid = centroidRef.current;
        if (centroid > 0) {
          ctx.font = `${8 * dpr}px ${FONTS.mono}`;
          ctx.fillStyle = textColor;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`CENT ${Math.round(centroid)} Hz`, width - SPACING.sm * dpr, waveH - 4 * dpr);
        }
      } else {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, waveH / 2);
        ctx.lineTo(width, waveH / 2);
        ctx.stroke();
      }

      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(isStreamedOverview ? 'OVERVIEW / LIVE' : 'OVERVIEW', SPACING.sm * dpr, 4 * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [audioEngine, displayMode, theaterMode]);

  return (
    <div style={panelStyle}>
      <div style={scrubToolbarStyle}>
        <div style={scrubToolbarHeaderStyle}>
          <span style={scrubToolbarLabelStyle}>SCRUB</span>
          <span style={scrubToolbarValueStyle}>
            {SCRUB_STYLE_OPTIONS.find((option) => option.value === scrubStyle)?.detail ?? 'smooth shuttle'}
          </span>
        </div>
        <div style={scrubButtonRowStyle}>
          {SCRUB_STYLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              style={{
                ...scrubButtonStyle,
                ...(scrubStyle === option.value ? scrubButtonActiveStyle : {}),
              }}
              onClick={() => onScrubStyleChange(option.value)}
              title={`Scrub feel: ${option.detail}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        onPointerDown={(event) => {
          isDraggingRef.current = true;
          isShiftDragRef.current = event.shiftKey;
          event.currentTarget.setPointerCapture(event.pointerId);
          if (event.shiftKey) {
            const t = fractionFromPointer(event) * audioEngine.duration;
            loopDragStartRef.current = t;
          } else {
            loopDragStartRef.current = null;
            audioEngine.beginScrub();
            scrubFromPointer(event);
          }
        }}
        onPointerMove={(event) => {
          if (!isDraggingRef.current) return;
          if (isShiftDragRef.current && loopDragStartRef.current !== null) {
            const t2 = fractionFromPointer(event) * audioEngine.duration;
            const start = Math.min(loopDragStartRef.current, t2);
            const end = Math.max(loopDragStartRef.current, t2);
            if (end - start > 0.1) audioEngine.setLoop(start, end);
          } else {
            scrubFromPointer(event);
          }
        }}
        onPointerUp={(event) => {
          if (!isShiftDragRef.current) {
            scrubFromPointer(event);
          }
          finishPointerGesture();
        }}
        onPointerCancel={finishPointerGesture}
        onLostPointerCapture={finishPointerGesture}
      />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  background: COLORS.bg2,
  overflow: 'hidden',
};

const scrubToolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: SPACING.sm,
  padding: `${SPACING.xs}px ${SPACING.sm}px`,
  borderBottom: `1px solid ${COLORS.border}`,
  background: COLORS.bg1,
  flexShrink: 0,
};

const scrubToolbarHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: SPACING.sm,
  minWidth: 0,
};

const scrubToolbarLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  letterSpacing: '0.12em',
};

const scrubToolbarValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};

const scrubButtonRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.xs,
  flexShrink: 0,
};

const scrubButtonStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  background: COLORS.bg2,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: COLORS.border,
  borderRadius: 2,
  padding: '2px 6px',
  cursor: 'pointer',
  letterSpacing: '0.08em',
  lineHeight: 1.2,
};

const scrubButtonActiveStyle: React.CSSProperties = {
  color: COLORS.textPrimary,
  background: COLORS.accentDim,
  borderColor: COLORS.borderHighlight,
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  minHeight: 0,
  flex: 1,
  cursor: 'crosshair',
};
