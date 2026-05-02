import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useTheaterMode, useWaveformPyramidStore } from '../core/session';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import { shouldSkipFrame } from '../utils/rafGuard';
import type { Marker, RangeMark, ScrubStyle, TransportState, WaveformLevel } from '../types';
import { formatTransportTime } from '../utils/format';
import { drawCanvasRangeChip } from '../controls/reviewChromeShared';
import {
  amplitudeToEventHeight,
  computeEventModeBlend,
  computeTransientIntensity,
  pickWaveformDetailRenderMode,
  shouldUseEventScaffold,
  type WaveformDetailRenderMode,
} from './waveformDetailMode';

interface ViewRange {
  readonly start: number;
  readonly end: number;
}

interface TimelineRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface TimelineLayout {
  readonly session: TimelineRect;
  readonly view: TimelineRect;
  readonly loop: TimelineRect;
  readonly detail: TimelineRect;
}

type TimelineGestureKind =
  | 'scrub-session'
  | 'scrub-detail'
  | 'view-pan'
  | 'view-resize-start'
  | 'view-resize-end'
  | 'range-pan'
  | 'range-resize-start'
  | 'range-resize-end'
  | 'loop-create'
  | 'loop-pan'
  | 'loop-resize-start'
  | 'loop-resize-end'
  | 'detail-loop-resize-start'
  | 'detail-loop-resize-end';

interface TimelineGesture {
  readonly kind: TimelineGestureKind;
  readonly pointerId: number;
  readonly anchorTime: number;
  readonly anchorX: number;
  readonly initialView: ViewRange;
  readonly initialLoopStart: number | null;
  readonly initialLoopEnd: number | null;
  readonly initialRangeStart?: number | null;
  readonly initialRangeEnd?: number | null;
  readonly rangeId?: number | null;
  readonly timeSpace?: 'session' | 'detail';
}

type TimelineHitRegion =
  | 'session'
  | 'detail'
  | 'view-track'
  | 'view-body'
  | 'view-start'
  | 'view-end'
  | 'loop-track'
  | 'loop-body'
  | 'loop-start'
  | 'loop-end'
  | 'detail-loop-start'
  | 'detail-loop-end';

interface TimelineHit {
  readonly region: TimelineHitRegion;
  readonly time: number;
}

type RangeHitRegion = 'body' | 'start' | 'end';

interface RangeHit {
  readonly rangeMark: RangeMark;
  readonly region: RangeHitRegion;
  readonly timeSpace: 'session' | 'detail';
  readonly isSelected: boolean;
}

const PANEL_DPR_MAX = 1.25;
const MIN_VIEWPORT_SECONDS = 3;
const MIN_LOOP_SECONDS = 0.1;
const MIN_RANGE_EDIT_SECONDS = 0.01;
const VIEW_FOLLOW_MARGIN = 0.22;
const VIEW_FOLLOW_LEAD = 0.35;
const SESSION_MAP_MIN_PX = 28;
const SESSION_MAP_MAX_PX = 44;
const CONTROL_ROW_MIN_PX = 12;
const CONTROL_ROW_MAX_PX = 16;
const TIMELINE_SEPARATOR_PX = 1;
const EXPANDED_TIMELINE_MIN_CSS_PX = 420;
const EXPANDED_SESSION_MAP_MIN_PX = 34;
const EXPANDED_SESSION_MAP_MAX_PX = 72;
const EXPANDED_CONTROL_ROW_MIN_PX = 16;
const EXPANDED_CONTROL_ROW_MAX_PX = 22;
const EXPANDED_TIMELINE_SEPARATOR_PX = 2;
const HANDLE_HIT_PX = 14;

const SCRUB_STYLE_OPTIONS: ReadonlyArray<{
  readonly value: ScrubStyle;
  readonly label: string;
  readonly detail: string;
}> = [
  { value: 'step', label: 'STEP', detail: 'precise bite' },
  { value: 'tape', label: 'TAPE', detail: 'smooth shuttle' },
  { value: 'wheel', label: 'WHEEL', detail: 'jog emphasis' },
];

function peakAt(level: WaveformLevel, index: number): number {
  return Math.max(Math.abs(level.min[index]), Math.abs(level.max[index]));
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

function formatSpan(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function pickDefaultViewSpan(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(duration, Math.max(30, Math.min(180, duration * 0.12)));
}

function normalizeViewRange(start: number, end: number, duration: number, minSpan: number): ViewRange {
  if (!Number.isFinite(duration) || duration <= 0) {
    return { start: 0, end: 0 };
  }

  const boundedMinSpan = Math.max(0.25, Math.min(duration, minSpan));
  const requestedSpan = Math.max(end - start, boundedMinSpan);
  const span = Math.min(duration, requestedSpan);
  const clampedStart = clampNumber(start, 0, Math.max(0, duration - span));
  return { start: clampedStart, end: clampedStart + span };
}

function centerViewRange(centerTime: number, span: number, duration: number): ViewRange {
  if (!Number.isFinite(duration) || duration <= 0) {
    return { start: 0, end: 0 };
  }

  const safeSpan = Math.min(duration, Math.max(0.25, span));
  const start = clampNumber(centerTime - safeSpan / 2, 0, Math.max(0, duration - safeSpan));
  return { start, end: start + safeSpan };
}

function isExpandedTimelineLayout(height: number, dpr: number): boolean {
  return height / Math.max(dpr, 1) >= EXPANDED_TIMELINE_MIN_CSS_PX;
}

function buildTimelineLayout(width: number, height: number, dpr: number): TimelineLayout {
  const expanded = isExpandedTimelineLayout(height, dpr);
  const separator = Math.max(
    1,
    Math.round((expanded ? EXPANDED_TIMELINE_SEPARATOR_PX : TIMELINE_SEPARATOR_PX) * dpr),
  );
  const controlRowMinPx = expanded ? EXPANDED_CONTROL_ROW_MIN_PX : CONTROL_ROW_MIN_PX;
  const controlRowMaxPx = expanded ? EXPANDED_CONTROL_ROW_MAX_PX : CONTROL_ROW_MAX_PX;
  const sessionMapMinPx = expanded ? EXPANDED_SESSION_MAP_MIN_PX : SESSION_MAP_MIN_PX;
  const sessionMapMaxPx = expanded ? EXPANDED_SESSION_MAP_MAX_PX : SESSION_MAP_MAX_PX;
  const controlRowH = Math.max(
    Math.round(controlRowMinPx * dpr),
    Math.min(Math.round(controlRowMaxPx * dpr), Math.round(height * (expanded ? 0.06 : 0.1))),
  );
  const sessionMapH = Math.max(
    Math.round(sessionMapMinPx * dpr),
    Math.min(Math.round(sessionMapMaxPx * dpr), Math.round(height * (expanded ? 0.18 : 0.28))),
  );
  const viewY = sessionMapH + separator;
  const loopY = viewY + controlRowH + separator;
  const detailY = loopY + controlRowH + separator;

  return {
    session: { x: 0, y: 0, w: width, h: sessionMapH },
    view: { x: 0, y: viewY, w: width, h: controlRowH },
    loop: { x: 0, y: loopY, w: width, h: controlRowH },
    detail: { x: 0, y: detailY, w: width, h: Math.max(24, height - detailY) },
  };
}

function timeToX(time: number, start: number, end: number, rect: TimelineRect): number {
  const span = Math.max(0.001, end - start);
  const fraction = clampNumber((time - start) / span, 0, 1);
  return rect.x + fraction * rect.w;
}

function xToTime(x: number, start: number, end: number, rect: TimelineRect): number {
  const fraction = rect.w > 0 ? clampNumber((x - rect.x) / rect.w, 0, 1) : 0;
  return start + fraction * Math.max(0, end - start);
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  color: string,
  rightX: number,
  topY: number,
  dpr: number,
  background: string = 'rgba(8,8,11,0.78)',
): void {
  ctx.font = `${9 * dpr}px ${FONTS.mono}`;
  const textWidth = ctx.measureText(text).width;
  const padX = 4 * dpr;
  const padY = 2 * dpr;
  const badgeH = 11 * dpr;
  ctx.fillStyle = background;
  ctx.fillRect(rightX - textWidth - padX * 2, topY, textWidth + padX * 2, badgeH + padY * 2);
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(text, rightX - padX, topY + padY);
}

interface WaveformOverviewPanelProps {
  markers?: readonly Marker[];
  rangeMarks?: readonly RangeMark[];
  pendingRangeStartS?: number | null;
  selectedRangeId?: number | null;
  onDeleteMarker?: (id: number) => void;
  onClearMarkers?: () => void;
  onClearRanges?: () => void;
  onSelectRange?: (id: number) => void;
  onUpdateRange?: (id: number, startS: number, endS: number) => void;
}

export function WaveformOverviewPanel({
  markers = [],
  rangeMarks = [],
  pendingRangeStartS = null,
  selectedRangeId = null,
  onDeleteMarker,
  onClearMarkers,
  onClearRanges,
  onSelectRange,
  onUpdateRange,
}: WaveformOverviewPanelProps): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const waveformPyramid = useWaveformPyramidStore();
  const displayMode = useDisplayMode();
  const amber = displayMode.mode === 'amber';
  const optic = displayMode.mode === 'optic';
  const red = displayMode.mode === 'red';
  const theaterMode = useTheaterMode();
  const [scrubStyle, setScrubStyle] = useState<ScrubStyle>(() => audioEngine.scrubStyle);
  const markersRef = useRef<readonly Marker[]>(markers);
  markersRef.current = markers;
  const rangeMarksRef = useRef<readonly RangeMark[]>(rangeMarks);
  rangeMarksRef.current = rangeMarks;
  const pendingRangeStartRef = useRef<number | null>(pendingRangeStartS);
  pendingRangeStartRef.current = pendingRangeStartS;
  const selectedRangeIdRef = useRef<number | null>(selectedRangeId);
  selectedRangeIdRef.current = selectedRangeId;
  const onDeleteMarkerRef = useRef(onDeleteMarker);
  onDeleteMarkerRef.current = onDeleteMarker;
  const onClearMarkersRef = useRef(onClearMarkers);
  onClearMarkersRef.current = onClearMarkers;
  const onClearRangesRef = useRef(onClearRanges);
  onClearRangesRef.current = onClearRanges;
  const onSelectRangeRef = useRef(onSelectRange);
  onSelectRangeRef.current = onSelectRange;
  const onUpdateRangeRef = useRef(onUpdateRange);
  onUpdateRangeRef.current = onUpdateRange;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transportKeyRef = useRef<string | null>(null);
  const transportRef = useRef<TransportState>({
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
  });
  const centroidRef = useRef(0);
  const liveCurrentTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const gestureRef = useRef<TimelineGesture | null>(null);
  const viewRangeRef = useRef<ViewRange>({ start: 0, end: 0 });
  const viewFollowRef = useRef(true);
  const viewKeyRef = useRef<string | null>(null);
  const loopKeyRef = useRef<string | null>(null);

  const setCanvasCursor = useCallback((cursor: string) => {
    if (canvasRef.current) {
      canvasRef.current.style.cursor = cursor;
    }
  }, []);

  const setViewRange = useCallback((next: ViewRange, options?: { readonly manual?: boolean; readonly follow?: boolean }) => {
    const duration = Math.max(0, transportRef.current.duration || audioEngine.duration);
    if (duration <= 0) {
      viewRangeRef.current = { start: 0, end: 0 };
      return;
    }

    const normalized = normalizeViewRange(next.start, next.end, duration, Math.min(MIN_VIEWPORT_SECONDS, duration));
    viewRangeRef.current = normalized;

    if (typeof options?.follow === 'boolean') {
      viewFollowRef.current = options.follow;
    } else if (options?.manual) {
      viewFollowRef.current = false;
    }
    waveformPyramid.setViewRange(normalized);
  }, [audioEngine, waveformPyramid]);

  const resetViewRange = useCallback((durationOverride?: number) => {
    const duration = Math.max(0, durationOverride ?? transportRef.current.duration ?? audioEngine.duration);
    if (duration <= 0) {
      viewRangeRef.current = { start: 0, end: 0 };
      viewFollowRef.current = true;
      return;
    }

    const span = pickDefaultViewSpan(duration);
    viewRangeRef.current = { start: 0, end: Math.min(duration, span) };
    viewFollowRef.current = true;
  }, [audioEngine]);

  useEffect(() => frameBus.subscribe((frame) => {
    centroidRef.current = frame.spectralCentroid;
    liveCurrentTimeRef.current = frame.currentTime;
  }), [frameBus]);

  useEffect(() => audioEngine.onTransport((transport) => {
    transportRef.current = transport;
    liveCurrentTimeRef.current = transport.currentTime;
    const nextKey = transport.filename && transport.duration > 0
      ? `${transport.playbackBackend}:${transport.filename}:${transport.duration.toFixed(3)}`
      : null;
    const nextLoopKey = transport.loopStart !== null && transport.loopEnd !== null
      ? `${transport.loopStart.toFixed(3)}:${transport.loopEnd.toFixed(3)}`
      : null;
    const keyChanged = nextKey !== transportKeyRef.current;
    const loopChanged = nextLoopKey !== loopKeyRef.current;

    if (keyChanged) {
      viewKeyRef.current = nextKey;
      resetViewRange(transport.duration);
    } else if (transport.duration > 0) {
      const currentRange = viewRangeRef.current;
      const span = currentRange.end > currentRange.start
        ? currentRange.end - currentRange.start
        : pickDefaultViewSpan(transport.duration);
      let nextRange = normalizeViewRange(
        currentRange.start,
        currentRange.start + span,
        transport.duration,
        Math.min(MIN_VIEWPORT_SECONDS, transport.duration),
      );
      const loopActive = transport.loopStart !== null && transport.loopEnd !== null && transport.loopEnd > transport.loopStart;
      const viewSpan = nextRange.end - nextRange.start;
      if (loopActive) {
        const loopStart = transport.loopStart!;
        const loopEnd = transport.loopEnd!;
        const loopSpan = loopEnd - loopStart;
        const loopFullyVisible = nextRange.start <= loopStart && nextRange.end >= loopEnd;

        if (loopChanged || !loopFullyVisible) {
          const focusSpan = Math.max(viewSpan, Math.min(transport.duration, loopSpan * 1.8));
          nextRange = centerViewRange((loopStart + loopEnd) / 2, focusSpan, transport.duration);
        }

        viewFollowRef.current = false;
      }

      if (!loopActive && viewFollowRef.current && nextRange.end > nextRange.start && nextRange.end < transport.duration + 0.001) {
        const margin = viewSpan * VIEW_FOLLOW_MARGIN;
        if (
          transport.currentTime < nextRange.start + margin
          || transport.currentTime > nextRange.end - margin
        ) {
          const anchoredStart = clampNumber(
            transport.currentTime - viewSpan * VIEW_FOLLOW_LEAD,
            0,
            Math.max(0, transport.duration - viewSpan),
          );
          nextRange = { start: anchoredStart, end: anchoredStart + viewSpan };
        }
      }

      viewRangeRef.current = nextRange;
    } else {
      viewRangeRef.current = { start: 0, end: 0 };
    }

    loopKeyRef.current = nextLoopKey;
    transportKeyRef.current = nextKey;
    waveformPyramid.setViewRange(viewRangeRef.current);
  }), [audioEngine, resetViewRange, waveformPyramid]);

  useEffect(() => {
    const selectedRange = rangeMarks.find((rangeMark) => rangeMark.id === selectedRangeId) ?? null;
    waveformPyramid.setSelectedRange(
      selectedRange
        ? { start: selectedRange.startS, end: selectedRange.endS }
        : null,
    );
  }, [rangeMarks, selectedRangeId, waveformPyramid]);

  useEffect(() => audioEngine.onReset(() => {
    centroidRef.current = 0;
    viewRangeRef.current = { start: 0, end: 0 };
    viewKeyRef.current = null;
    viewFollowRef.current = true;
    waveformPyramid.setSelectedRange(null);
    waveformPyramid.setViewRange({ start: 0, end: 0 });
  }), [audioEngine, waveformPyramid]);

  const hitTestRange = useCallback((
    x: number,
    y: number,
    layout: TimelineLayout,
    duration: number,
    selectedOnly = false,
  ): RangeHit | null => {
    const safeDuration = Math.max(0.001, duration);
    const viewRange = normalizeViewRange(
      viewRangeRef.current.start,
      viewRangeRef.current.end || pickDefaultViewSpan(safeDuration),
      safeDuration,
      Math.min(MIN_VIEWPORT_SECONDS, safeDuration),
    );
    const activeRangeId = selectedRangeIdRef.current;

    const hitRect = (
      rect: TimelineRect,
      start: number,
      end: number,
      timeSpace: 'session' | 'detail',
    ): RangeHit | null => {
      if (y < rect.y || y > rect.y + rect.h) return null;

      const handleTol = Math.max(HANDLE_HIT_PX, rect.h * (timeSpace === 'detail' ? 0.08 : 0.45));
      for (let index = rangeMarksRef.current.length - 1; index >= 0; index--) {
        const rangeMark = rangeMarksRef.current[index];
        const isSelected = rangeMark.id === activeRangeId;
        if (selectedOnly && !isSelected) continue;

        const overlapStart = Math.max(start, rangeMark.startS);
        const overlapEnd = Math.min(end, rangeMark.endS);
        if (overlapEnd <= overlapStart) continue;

        const x1 = timeToX(overlapStart, start, end, rect);
        const x2 = timeToX(overlapEnd, start, end, rect);
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);

        if (isSelected) {
          const startVisible = rangeMark.startS >= start && rangeMark.startS <= end;
          const endVisible = rangeMark.endS >= start && rangeMark.endS <= end;
          const startDelta = startVisible ? Math.abs(x - timeToX(rangeMark.startS, start, end, rect)) : Number.POSITIVE_INFINITY;
          const endDelta = endVisible ? Math.abs(x - timeToX(rangeMark.endS, start, end, rect)) : Number.POSITIVE_INFINITY;
          const nearestHandleDelta = Math.min(startDelta, endDelta);
          if (nearestHandleDelta <= handleTol) {
            return {
              rangeMark,
              region: startDelta <= endDelta ? 'start' : 'end',
              timeSpace,
              isSelected,
            };
          }
        }

        if (x >= minX && x <= maxX) {
          return {
            rangeMark,
            region: 'body',
            timeSpace,
            isSelected,
          };
        }
      }

      return null;
    };

    return hitRect(layout.detail, viewRange.start, viewRange.end, 'detail')
      ?? hitRect(layout.session, 0, safeDuration, 'session');
  }, []);

  const hitTestTimeline = useCallback((x: number, y: number, layout: TimelineLayout, duration: number): TimelineHit => {
    const safeDuration = Math.max(0.001, duration);
    const viewRange = normalizeViewRange(
      viewRangeRef.current.start,
      viewRangeRef.current.end || pickDefaultViewSpan(safeDuration),
      safeDuration,
      Math.min(MIN_VIEWPORT_SECONDS, safeDuration),
    );

    const viewHandleTol = Math.max(HANDLE_HIT_PX, layout.view.h * 0.75);
    const loopHandleTol = Math.max(HANDLE_HIT_PX, layout.loop.h * 0.75);
    const viewStartX = timeToX(viewRange.start, 0, safeDuration, layout.view);
    const viewEndX = timeToX(viewRange.end, 0, safeDuration, layout.view);
    const loopStart = transportRef.current.loopStart;
    const loopEnd = transportRef.current.loopEnd;
    const sessionTime = xToTime(x, 0, safeDuration, layout.session);
    const detailTime = xToTime(x, viewRange.start, viewRange.end, layout.detail);

    if (y >= layout.session.y && y <= layout.session.y + layout.session.h) {
      return { region: 'session', time: sessionTime };
    }
    if (y >= layout.view.y && y <= layout.view.y + layout.view.h) {
      if (Math.abs(x - viewStartX) <= viewHandleTol) return { region: 'view-start', time: sessionTime };
      if (Math.abs(x - viewEndX) <= viewHandleTol) return { region: 'view-end', time: sessionTime };
      if (x >= viewStartX && x <= viewEndX) return { region: 'view-body', time: sessionTime };
      return { region: 'view-track', time: sessionTime };
    }
    if (y >= layout.loop.y && y <= layout.loop.y + layout.loop.h) {
      if (loopStart !== null && loopEnd !== null) {
        const loopStartX = timeToX(loopStart, 0, safeDuration, layout.loop);
        const loopEndX = timeToX(loopEnd, 0, safeDuration, layout.loop);
        if (Math.abs(x - loopStartX) <= loopHandleTol) return { region: 'loop-start', time: sessionTime };
        if (Math.abs(x - loopEndX) <= loopHandleTol) return { region: 'loop-end', time: sessionTime };
        if (x >= loopStartX && x <= loopEndX) return { region: 'loop-body', time: sessionTime };
      }
      return { region: 'loop-track', time: sessionTime };
    }
    if (loopStart !== null && loopEnd !== null && y >= layout.detail.y && y <= layout.detail.y + layout.detail.h) {
      const overlapStart = Math.max(viewRange.start, loopStart);
      const overlapEnd = Math.min(viewRange.end, loopEnd);
      if (overlapEnd > overlapStart) {
        const detailLoopStartX = timeToX(overlapStart, viewRange.start, viewRange.end, layout.detail);
        const detailLoopEndX = timeToX(overlapEnd, viewRange.start, viewRange.end, layout.detail);
        const detailHandleTol = Math.max(loopHandleTol, layout.detail.h * 0.08);
        if (Math.abs(x - detailLoopStartX) <= detailHandleTol) return { region: 'detail-loop-start', time: detailTime };
        if (Math.abs(x - detailLoopEndX) <= detailHandleTol) return { region: 'detail-loop-end', time: detailTime };
      }
    }
    return { region: 'detail', time: detailTime };
  }, []);

  const updatePointerCursor = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || gestureRef.current) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const duration = Math.max(0, transportRef.current.duration || audioEngine.duration);
    if (duration <= 0) {
      setCanvasCursor('default');
      return;
    }

    const layout = buildTimelineLayout(canvas.width, canvas.height, Math.min(devicePixelRatio, PANEL_DPR_MAX));
    const rangeHit = hitTestRange(x, y, layout, duration);
    if (rangeHit) {
      if (rangeHit.isSelected && (rangeHit.region === 'start' || rangeHit.region === 'end')) {
        setCanvasCursor('ew-resize');
        return;
      }
      setCanvasCursor(rangeHit.isSelected ? 'grab' : 'pointer');
      return;
    }

    const hit = hitTestTimeline(x, y, layout, duration);
    switch (hit.region) {
      case 'view-start':
      case 'view-end':
      case 'loop-start':
      case 'loop-end':
      case 'detail-loop-start':
      case 'detail-loop-end':
        setCanvasCursor('ew-resize');
        return;
      case 'view-body':
      case 'loop-body':
        setCanvasCursor('grab');
        return;
      case 'view-track':
      case 'loop-track':
        setCanvasCursor('pointer');
        return;
      default:
        setCanvasCursor('crosshair');
    }
  }, [audioEngine, hitTestRange, hitTestTimeline, setCanvasCursor]);

  const updateGestureFromPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const gesture = gestureRef.current;
    if (!canvas || !gesture) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const duration = Math.max(0, transportRef.current.duration || audioEngine.duration);
    if (duration <= 0) return;

    const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
    const layout = buildTimelineLayout(canvas.width, canvas.height, dpr);
    const fullTime = xToTime(x, 0, duration, layout.session);
    const detailRange = viewRangeRef.current.end > viewRangeRef.current.start
      ? viewRangeRef.current
      : normalizeViewRange(0, pickDefaultViewSpan(duration), duration, Math.min(MIN_VIEWPORT_SECONDS, duration));
    const detailTime = xToTime(x, detailRange.start, detailRange.end, layout.detail);
    const deltaTime = ((x - gesture.anchorX) / Math.max(1, layout.view.w)) * duration;
    const rangePointerTime = gesture.timeSpace === 'detail' ? detailTime : fullTime;
    const rangeDeltaTime = rangePointerTime - gesture.anchorTime;

    switch (gesture.kind) {
      case 'scrub-session':
        audioEngine.scrubTo(fullTime);
        break;
      case 'scrub-detail':
        audioEngine.scrubTo(detailTime);
        break;
      case 'view-pan': {
        const span = gesture.initialView.end - gesture.initialView.start;
        const start = clampNumber(gesture.initialView.start + deltaTime, 0, Math.max(0, duration - span));
        setViewRange({ start, end: start + span }, { manual: true });
        break;
      }
      case 'view-resize-start':
        setViewRange({ start: fullTime, end: gesture.initialView.end }, { manual: true });
        break;
      case 'view-resize-end':
        setViewRange({ start: gesture.initialView.start, end: fullTime }, { manual: true });
        break;
      case 'range-pan':
        if (
          gesture.rangeId !== undefined
          && gesture.rangeId !== null
          && gesture.initialRangeStart !== undefined
          && gesture.initialRangeStart !== null
          && gesture.initialRangeEnd !== undefined
          && gesture.initialRangeEnd !== null
          && onUpdateRangeRef.current
        ) {
          const span = gesture.initialRangeEnd - gesture.initialRangeStart;
          const start = clampNumber(gesture.initialRangeStart + rangeDeltaTime, 0, Math.max(0, duration - span));
          onUpdateRangeRef.current(gesture.rangeId, start, start + span);
        }
        break;
      case 'range-resize-start':
        if (
          gesture.rangeId !== undefined
          && gesture.rangeId !== null
          && gesture.initialRangeEnd !== undefined
          && gesture.initialRangeEnd !== null
          && onUpdateRangeRef.current
        ) {
          const latestStart = Math.max(0, gesture.initialRangeEnd - MIN_RANGE_EDIT_SECONDS);
          const start = clampNumber(rangePointerTime, 0, latestStart);
          onUpdateRangeRef.current(gesture.rangeId, start, gesture.initialRangeEnd);
        }
        break;
      case 'range-resize-end':
        if (
          gesture.rangeId !== undefined
          && gesture.rangeId !== null
          && gesture.initialRangeStart !== undefined
          && gesture.initialRangeStart !== null
          && onUpdateRangeRef.current
        ) {
          const earliestEnd = Math.min(duration, gesture.initialRangeStart + MIN_RANGE_EDIT_SECONDS);
          const end = clampNumber(rangePointerTime, earliestEnd, duration);
          onUpdateRangeRef.current(gesture.rangeId, gesture.initialRangeStart, end);
        }
        break;
      case 'loop-create': {
        const start = Math.min(gesture.anchorTime, fullTime);
        const end = Math.max(gesture.anchorTime, fullTime);
        if (end - start >= MIN_LOOP_SECONDS) {
          audioEngine.setLoop(start, end);
        }
        break;
      }
      case 'loop-pan': {
        if (gesture.initialLoopStart === null || gesture.initialLoopEnd === null) break;
        const span = gesture.initialLoopEnd - gesture.initialLoopStart;
        const start = clampNumber(gesture.initialLoopStart + deltaTime, 0, Math.max(0, duration - span));
        audioEngine.setLoop(start, start + span);
        break;
      }
      case 'loop-resize-start':
        if (gesture.initialLoopEnd !== null) {
          audioEngine.setLoop(Math.min(fullTime, gesture.initialLoopEnd - MIN_LOOP_SECONDS), gesture.initialLoopEnd);
        }
        break;
      case 'loop-resize-end':
        if (gesture.initialLoopStart !== null) {
          audioEngine.setLoop(gesture.initialLoopStart, Math.max(fullTime, gesture.initialLoopStart + MIN_LOOP_SECONDS));
        }
        break;
      case 'detail-loop-resize-start':
        if (gesture.initialLoopEnd !== null) {
          audioEngine.setLoop(Math.min(detailTime, gesture.initialLoopEnd - MIN_LOOP_SECONDS), gesture.initialLoopEnd);
        }
        break;
      case 'detail-loop-resize-end':
        if (gesture.initialLoopStart !== null) {
          audioEngine.setLoop(gesture.initialLoopStart, Math.max(detailTime, gesture.initialLoopStart + MIN_LOOP_SECONDS));
        }
        break;
      default:
        break;
    }
  }, [audioEngine, setViewRange]);

  const finishPointerGesture = useCallback((event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (event) {
      updateGestureFromPointer(event);
    }

    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.kind === 'scrub-session' || gesture.kind === 'scrub-detail') {
      audioEngine.endScrub();
    }

    gestureRef.current = null;
    setCanvasCursor('crosshair');
  }, [audioEngine, setCanvasCursor, updateGestureFromPointer]);

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
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
    });

    ro.observe(canvas);
    return () => {
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || theaterMode) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (shouldSkipFrame(canvas)) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const layout = buildTimelineLayout(width, height, dpr);
      const expandedTimeline = isExpandedTimelineLayout(height, dpr);
      const laneLabelFontPx = expandedTimeline ? 9 : 8;
      const gridLabelFontPx = expandedTimeline ? 8 : 7;
      const laneLabelTopInset = (expandedTimeline ? 5 : 4) * dpr;
      const detailTimeInset = (expandedTimeline ? 20 : 18) * dpr;
      const nge = displayMode.mode === 'nge';
      const amber = displayMode.mode === 'amber';
      const hyper = displayMode.mode === 'hyper';
      const optic = displayMode.mode === 'optic';
      const red = displayMode.mode === 'red';
      const eva = displayMode.mode === 'eva';
      const backgroundFill = nge ? CANVAS.nge.bg2 : amber ? CANVAS.amber.bg2 : hyper ? CANVAS.hyper.bg2 : optic ? CANVAS.optic.bg2 : red ? CANVAS.red.bg2 : eva ? CANVAS.eva.bg2 : COLORS.bg2;
      const gridColor = nge ? 'rgba(22,54,18,1)' : amber ? 'rgba(86,56,14,0.96)' : hyper ? 'rgba(28,42,88,0.92)' : optic ? 'rgba(169,186,197,0.96)' : red ? 'rgba(74,22,24,0.96)' : eva ? 'rgba(74,26,144,0.35)' : COLORS.bg3;
      const textColor = nge ? CANVAS.nge.label : amber ? CANVAS.amber.label : hyper ? CANVAS.hyper.label : optic ? CANVAS.optic.label : red ? CANVAS.red.label : eva ? CANVAS.eva.label : COLORS.textDim;
      const waveformFill = nge ? 'rgba(160,216,64,0.18)' : amber ? 'rgba(255,176,48,0.20)' : hyper ? 'rgba(98,232,255,0.22)' : optic ? 'rgba(18,118,164,0.14)' : red ? 'rgba(255,90,74,0.16)' : eva ? 'rgba(255,123,0,0.22)' : 'rgba(200, 146, 42, 0.22)';
      const waveformStroke = nge ? CANVAS.nge.trace : amber ? CANVAS.amber.trace : hyper ? CANVAS.hyper.trace : optic ? CANVAS.optic.trace : red ? CANVAS.red.trace : eva ? CANVAS.eva.trace : COLORS.waveform;
      const waveformShadow = nge ? 'rgba(160,216,64,0.35)' : amber ? 'rgba(255,176,48,0.30)' : hyper ? 'rgba(255,92,188,0.32)' : optic ? 'rgba(18,124,173,0.18)' : red ? 'rgba(255,90,74,0.26)' : eva ? 'rgba(255,123,0,0.35)' : 'rgba(200, 146, 42, 0.35)';
      const playFillWave = nge ? 'rgba(80, 160, 50, 0.07)' : amber ? 'rgba(255,176,48,0.07)' : hyper ? 'rgba(98,232,255,0.07)' : optic ? 'rgba(18,118,164,0.05)' : red ? 'rgba(156,40,32,0.10)' : eva ? 'rgba(255,123,0,0.07)' : 'rgba(80, 96, 192, 0.07)';
      const playCursor = amber ? 'rgba(255,196,92,0.92)' : hyper ? 'rgba(255,92,188,0.92)' : optic ? 'rgba(11,30,46,0.96)' : red ? 'rgba(255,110,92,0.92)' : eva ? 'rgba(255,123,0,0.92)' : COLORS.accent;
      const learnedWaveHint = nge ? 'rgba(160,216,64,0.12)' : amber ? 'rgba(255,176,48,0.10)' : hyper ? 'rgba(98,232,255,0.10)' : optic ? 'rgba(89,129,153,0.06)' : red ? 'rgba(255,90,74,0.08)' : eva ? 'rgba(255,123,0,0.10)' : 'rgba(160, 170, 240, 0.10)';
      const learnedWaveLine = nge ? 'rgba(160,216,64,0.32)' : amber ? 'rgba(255,196,92,0.24)' : hyper ? 'rgba(255,92,188,0.32)' : optic ? 'rgba(89,129,153,0.16)' : red ? 'rgba(255,90,74,0.22)' : eva ? 'rgba(255,123,0,0.32)' : 'rgba(200, 210, 255, 0.26)';
      const controlFill = nge ? 'rgba(12,20,12,0.96)' : amber ? 'rgba(18,12,4,0.98)' : hyper ? 'rgba(10,14,28,0.96)' : optic ? 'rgba(242,247,250,0.98)' : red ? 'rgba(20,8,9,0.98)' : eva ? 'rgba(8,4,26,0.96)' : 'rgba(14,16,25,0.98)';
      const controlTrack = nge ? 'rgba(40,72,28,0.86)' : amber ? 'rgba(94,62,18,0.84)' : hyper ? 'rgba(36,46,90,0.85)' : optic ? 'rgba(201,214,223,0.96)' : red ? 'rgba(74,22,24,0.84)' : eva ? 'rgba(74,26,144,0.55)' : 'rgba(48,56,86,0.82)';
      const viewWindowFill = amber ? 'rgba(255,176,48,0.18)' : hyper ? 'rgba(96,150,255,0.26)' : optic ? 'rgba(71,126,158,0.20)' : red ? 'rgba(198,70,60,0.26)' : eva ? 'rgba(255,123,0,0.26)' : 'rgba(126, 130, 240, 0.24)';
      const viewWindowStroke = amber ? 'rgba(255,214,138,0.86)' : hyper ? 'rgba(120,210,255,0.9)' : optic ? 'rgba(47,105,136,0.84)' : red ? 'rgba(255,132,116,0.84)' : eva ? 'rgba(255,160,40,0.9)' : COLORS.borderHighlight;
      const loopFill = 'rgba(80, 200, 120, 0.16)';
      const loopStroke = 'rgba(80, 200, 120, 0.74)';
      const handleBackFill = amber ? 'rgba(10,7,2,0.96)' : hyper ? 'rgba(8,12,20,0.96)' : optic ? 'rgba(232,240,245,0.98)' : red ? 'rgba(14,4,5,0.96)' : eva ? 'rgba(8,4,26,0.96)' : 'rgba(8, 10, 16, 0.94)';
      const handleGripFill = amber ? 'rgba(255,220,154,0.92)' : hyper ? 'rgba(186,222,255,0.92)' : optic ? 'rgba(62,118,149,0.92)' : red ? 'rgba(255,188,176,0.92)' : eva ? 'rgba(255,180,80,0.92)' : 'rgba(214, 220, 255, 0.92)';
      const unknownFill = nge ? 'rgba(160,216,64,0.04)' : amber ? 'rgba(255,176,48,0.05)' : hyper ? 'rgba(98,232,255,0.04)' : optic ? 'rgba(147,170,184,0.08)' : red ? 'rgba(124,40,39,0.08)' : eva ? 'rgba(255,123,0,0.04)' : 'rgba(120, 134, 200, 0.05)';
      const unknownLine = nge ? 'rgba(160,216,64,0.12)' : amber ? 'rgba(255,176,48,0.14)' : hyper ? 'rgba(98,232,255,0.14)' : optic ? 'rgba(122,150,166,0.18)' : red ? 'rgba(124,40,39,0.18)' : eva ? 'rgba(255,123,0,0.14)' : 'rgba(130, 142, 212, 0.14)';
      const badgeBackground = amber ? 'rgba(18,12,4,0.92)' : optic ? 'rgba(243,248,251,0.96)' : red ? 'rgba(20,6,7,0.90)' : 'rgba(8,8,11,0.78)';
      const badgeX = width - SPACING.sm * dpr;
      const transport = transportRef.current;
      const duration = Math.max(0, transport.duration);
      const transportCursorTime = transport.scrubActive ? transport.currentTime : liveCurrentTimeRef.current;
      const currentTime = clampNumber(
        Number.isFinite(transportCursorTime) ? transportCursorTime : transport.currentTime,
        0,
        duration || 0,
      );

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = backgroundFill;
      ctx.fillRect(0, 0, width, height);

      const analysis = audioEngine.fileAnalysis;
      const isStreamedOverview = transport.playbackBackend === 'streamed';

      if (duration <= 0) {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, layout.detail.y + layout.detail.h / 2);
        ctx.lineTo(width, layout.detail.y + layout.detail.h / 2);
        ctx.stroke();
        ctx.font = `${laneLabelFontPx * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('SESSION MAP', SPACING.sm * dpr, laneLabelTopInset);
        return;
      }

      const viewRange = normalizeViewRange(
        viewRangeRef.current.start,
        viewRangeRef.current.end || pickDefaultViewSpan(duration),
        duration,
        Math.min(MIN_VIEWPORT_SECONDS, duration),
      );
      viewRangeRef.current = viewRange;
      const overviewLevel = waveformPyramid.pickOverviewLevel();
      const visibleSpan = viewRange.end - viewRange.start;
      const useSampleView = waveformPyramid.shouldUseSampleView(viewRange.start, viewRange.end, layout.detail.w);
      const eventBlend = useSampleView ? 0 : computeEventModeBlend(visibleSpan);
      const detailRenderMode: WaveformDetailRenderMode = pickWaveformDetailRenderMode(visibleSpan, useSampleView);
      const detailLevel = waveformPyramid.pickDetailLevel(
        viewRange.start,
        viewRange.end,
        layout.detail.w,
        detailRenderMode === 'event',
      );
      const scaffoldLevel = waveformPyramid.pickScaffoldLevel(viewRange.start, viewRange.end, layout.detail.w, detailLevel);
      const detailCoverageRatio = waveformPyramid.coverageRatio(
        detailLevel,
        viewRange.start,
        viewRange.end,
        detailRenderMode === 'event' ? 2 : 1,
      );
      const scaffoldCoverageRatio = waveformPyramid.coverageRatio(
        scaffoldLevel,
        viewRange.start,
        viewRange.end,
        detailRenderMode === 'event' ? 2 : 1,
      );
      const eventSourceLevel = detailRenderMode === 'event' && scaffoldLevel && shouldUseEventScaffold(detailCoverageRatio, scaffoldCoverageRatio)
        ? scaffoldLevel
        : detailLevel;
      const learnedRatio = waveformPyramid.learnedRatio;
      const peakNormalizer = waveformPyramid.displayPeakNormalizer;
      const loopStart = transport.loopStart;
      const loopEnd = transport.loopEnd;

      const drawTimeGrid = (rect: TimelineRect, start: number, end: number, drawLabels: boolean, labelOffsetY = 3 * dpr): void => {
        const span = Math.max(0.001, end - start);
        const interval = pickGridInterval(span);
        const firstTick = Math.ceil(start / interval) * interval;
        ctx.lineWidth = 1;
        ctx.font = `${gridLabelFontPx * dpr}px ${FONTS.mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        for (let t = firstTick; t < end; t += interval) {
          const x = Math.round(timeToX(t, start, end, rect)) + 0.5;
          ctx.strokeStyle = gridColor;
          ctx.beginPath();
          ctx.moveTo(x, rect.y);
          ctx.lineTo(x, rect.y + rect.h);
          ctx.stroke();
          if (drawLabels) {
            ctx.fillStyle = textColor;
            ctx.fillText(fmtTime(t), x, rect.y + labelOffsetY);
          }
        }
      };

      const drawPlayCursor = (rect: TimelineRect, start: number, end: number, fillLeft: boolean): void => {
        if (currentTime < start || currentTime > end) return;
        const playX = timeToX(currentTime, start, end, rect);
        if (fillLeft) {
          ctx.fillStyle = playFillWave;
          ctx.fillRect(rect.x, rect.y, playX - rect.x, rect.h);
        }

        ctx.strokeStyle = optic ? 'rgba(244, 248, 251, 0.86)' : hyper ? 'rgba(16, 22, 36, 0.92)' : red ? 'rgba(22, 6, 7, 0.96)' : eva ? 'rgba(22, 12, 48, 0.92)' : 'rgba(12, 12, 18, 0.92)';
        ctx.lineWidth = Math.max(optic ? 3 * dpr : 2 * dpr, optic ? 2 : 1.5);
        ctx.beginPath();
        ctx.moveTo(playX, rect.y);
        ctx.lineTo(playX, rect.y + rect.h);
        ctx.stroke();

        ctx.strokeStyle = playCursor;
        ctx.lineWidth = Math.max(1.5 * dpr, 1);
        ctx.beginPath();
        ctx.moveTo(playX, rect.y);
        ctx.lineTo(playX, rect.y + rect.h);
        ctx.stroke();

        ctx.fillStyle = playCursor;
        ctx.fillRect(playX - dpr, rect.y, Math.max(2 * dpr, 2), Math.max(2 * dpr, 2));
        ctx.fillRect(playX - dpr, rect.y + rect.h - Math.max(2 * dpr, 2), Math.max(2 * dpr, 2), Math.max(2 * dpr, 2));
      };

      const drawControlHandle = (
        rect: TimelineRect,
        centerX: number,
        accentFill: string,
        accentStroke: string,
      ): void => {
        const handleW = Math.max(8 * dpr, rect.h * 0.62);
        const handleH = Math.max(10 * dpr, rect.h - 2 * dpr);
        const x = clampNumber(centerX - handleW / 2, rect.x + dpr, rect.x + rect.w - handleW - dpr);
        const y = rect.y + Math.max(dpr, (rect.h - handleH) / 2);
        const gripCount = 3;
        const gripGap = Math.max(1.2 * dpr, handleW * 0.16);

        ctx.save();
        ctx.fillStyle = handleBackFill;
        ctx.fillRect(x - dpr, y - dpr, handleW + 2 * dpr, handleH + 2 * dpr);
        ctx.fillStyle = accentFill;
        ctx.fillRect(x, y, handleW, handleH);
        ctx.strokeStyle = accentStroke;
        ctx.lineWidth = dpr;
        ctx.strokeRect(x + 0.5 * dpr, y + 0.5 * dpr, Math.max(1, handleW - dpr), Math.max(1, handleH - dpr));
        ctx.fillStyle = handleGripFill;
        for (let grip = 0; grip < gripCount; grip++) {
          const lineX = x + handleW / 2 - gripGap + grip * gripGap;
          ctx.fillRect(lineX - dpr / 2, y + 2 * dpr, Math.max(1, dpr), Math.max(2, handleH - 4 * dpr));
        }
        ctx.restore();
      };

      const drawLoopOverlay = (rect: TimelineRect, start: number, end: number): void => {
        if (loopStart === null || loopEnd === null) return;
        const overlapStart = Math.max(start, loopStart);
        const overlapEnd = Math.min(end, loopEnd);
        if (overlapEnd <= overlapStart) return;
        const x1 = timeToX(overlapStart, start, end, rect);
        const x2 = timeToX(overlapEnd, start, end, rect);
        ctx.fillStyle = loopFill;
        ctx.fillRect(x1, rect.y, Math.max(1, x2 - x1), rect.h);
        ctx.strokeStyle = loopStroke;
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath();
        ctx.moveTo(x1, rect.y);
        ctx.lineTo(x1, rect.y + rect.h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, rect.y);
        ctx.lineTo(x2, rect.y + rect.h);
        ctx.stroke();
      };

      const drawRangeOverlays = (rect: TimelineRect, start: number, end: number): void => {
        const ranges = rangeMarksRef.current;
        const pendingStart = pendingRangeStartRef.current;
        const activeRangeId = selectedRangeIdRef.current;
        if (ranges.length === 0 && pendingStart === null) return;

        const rangeStroke = nge ? 'rgba(160,230,60,0.56)' : amber ? 'rgba(255,184,72,0.82)' : hyper ? 'rgba(98,200,255,0.86)' : optic ? 'rgba(17,122,165,0.88)' : red ? 'rgba(130,176,255,0.90)' : eva ? 'rgba(255,150,80,0.84)' : 'rgba(124,182,255,0.84)';
        const rangeFill = nge ? 'rgba(80,140,38,0.14)' : amber ? 'rgba(120,72,12,0.16)' : hyper ? 'rgba(32,118,167,0.16)' : optic ? 'rgba(17,122,165,0.12)' : red ? 'rgba(64,90,170,0.18)' : eva ? 'rgba(160,90,255,0.12)' : 'rgba(92,126,214,0.14)';
        const selectedRangeStroke = nge ? 'rgba(210,255,148,0.90)' : amber ? 'rgba(255,220,154,0.98)' : hyper ? 'rgba(170,230,255,0.98)' : optic ? 'rgba(11,96,130,0.98)' : red ? 'rgba(206,224,255,0.98)' : eva ? 'rgba(255,192,118,0.98)' : 'rgba(196,220,255,0.98)';
        const selectedRangeFill = nge ? 'rgba(120,176,56,0.24)' : amber ? 'rgba(148,92,16,0.24)' : hyper ? 'rgba(48,138,188,0.26)' : optic ? 'rgba(17,122,165,0.20)' : red ? 'rgba(86,112,200,0.28)' : eva ? 'rgba(182,104,255,0.20)' : 'rgba(112,146,232,0.24)';
        const rangeLabelBg = amber ? 'rgba(18,12,4,0.92)' : optic ? 'rgba(243,248,251,0.96)' : red ? 'rgba(20,6,7,0.92)' : 'rgba(8,10,18,0.74)';
        const rangeLabelColor = nge ? 'rgba(180,240,100,0.92)' : amber ? 'rgba(255,214,132,0.94)' : hyper ? 'rgba(152,220,255,0.94)' : optic ? 'rgba(17,122,165,0.96)' : red ? 'rgba(186,208,255,0.92)' : eva ? 'rgba(255,170,88,0.9)' : 'rgba(152,196,255,0.94)';

        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();

        for (const rangeMark of ranges) {
          if (rangeMark.endS <= start || rangeMark.startS >= end) continue;
          const isSelected = activeRangeId === rangeMark.id;
          const overlapStart = Math.max(start, rangeMark.startS);
          const overlapEnd = Math.min(end, rangeMark.endS);
          const x1 = timeToX(overlapStart, start, end, rect);
          const x2 = timeToX(overlapEnd, start, end, rect);
          const rangeWidth = Math.max(1, x2 - x1);

          ctx.fillStyle = isSelected ? selectedRangeFill : rangeFill;
          ctx.fillRect(x1, rect.y, rangeWidth, rect.h);
          ctx.strokeStyle = isSelected ? selectedRangeStroke : rangeStroke;
          ctx.lineWidth = isSelected ? Math.max(1.75 * dpr, 1.5) : dpr;
          ctx.beginPath();
          ctx.moveTo(x1, rect.y);
          ctx.lineTo(x1, rect.y + rect.h);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x2, rect.y);
          ctx.lineTo(x2, rect.y + rect.h);
          ctx.stroke();

          if (isSelected) {
            const handleWidth = Math.max(6 * dpr, Math.min(10 * dpr, rect.h * 0.16));
            const handleHeight = Math.max(10 * dpr, Math.min(rect.h - 4 * dpr, rect.h * 0.64));
            const handleY = rect.y + Math.max(2 * dpr, (rect.h - handleHeight) / 2);
            const gripInset = Math.max(dpr, handleWidth * 0.22);
            const gripTop = handleY + Math.max(dpr, handleHeight * 0.22);
            const gripBottom = handleY + handleHeight - Math.max(dpr, handleHeight * 0.22);
            const visibleStart = rangeMark.startS >= start && rangeMark.startS <= end;
            const visibleEnd = rangeMark.endS >= start && rangeMark.endS <= end;

            const drawRangeHandle = (handleTime: number): void => {
              const handleCenter = timeToX(handleTime, start, end, rect);
              const handleX = clampNumber(handleCenter - handleWidth / 2, rect.x, rect.x + rect.w - handleWidth);
              ctx.fillStyle = handleBackFill;
              ctx.fillRect(handleX, handleY, handleWidth, handleHeight);
              ctx.strokeStyle = selectedRangeStroke;
              ctx.lineWidth = dpr;
              ctx.strokeRect(handleX + 0.5 * dpr, handleY + 0.5 * dpr, Math.max(handleWidth - dpr, dpr), Math.max(handleHeight - dpr, dpr));
              ctx.strokeStyle = handleGripFill;
              ctx.lineWidth = Math.max(dpr, 1);
              for (let index = 0; index < 2; index++) {
                const gripX = handleX + gripInset + index * Math.max(dpr, handleWidth * 0.24);
                ctx.beginPath();
                ctx.moveTo(gripX, gripTop);
                ctx.lineTo(gripX, gripBottom);
                ctx.stroke();
              }
            };

            if (visibleStart) drawRangeHandle(rangeMark.startS);
            if (visibleEnd) drawRangeHandle(rangeMark.endS);
          }

          const badgeY = rect.y + rect.h - 14.5 * dpr;
          drawCanvasRangeChip(ctx, {
            label: rangeMark.label,
            x: x1 + 1.5 * dpr,
            y: badgeY,
            dpr,
            visualMode: displayMode.mode,
            selected: isSelected,
            minX: rect.x + dpr,
            maxX: rect.x + rect.w - dpr,
          });
        }

        if (pendingStart !== null && pendingStart >= start - 0.001 && pendingStart <= end + 0.001) {
          const pendingX = Math.round(timeToX(pendingStart, start, end, rect)) + 0.5;
          ctx.strokeStyle = rangeStroke;
          ctx.lineWidth = dpr;
          ctx.setLineDash([3 * dpr, 2 * dpr]);
          ctx.beginPath();
          ctx.moveTo(pendingX, rect.y);
          ctx.lineTo(pendingX, rect.y + rect.h);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.font = `${6.5 * dpr}px ${FONTS.mono}`;
          const label = 'IN';
          const textWidth = ctx.measureText(label).width;
          const pad = 2 * dpr;
          const badgeWidth = textWidth + pad * 2;
          const badgeHeight = 8.5 * dpr;
          const badgeX = Math.min(pendingX + 2 * dpr, rect.x + rect.w - badgeWidth - dpr);
          const badgeY = rect.y + 1.5 * dpr;
          ctx.fillStyle = rangeLabelBg;
          ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
          ctx.fillStyle = rangeLabelColor;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(label, badgeX + pad, badgeY + dpr);
        }

        ctx.restore();
      };

      const drawMarkers = (rect: TimelineRect, start: number, end: number): void => {
        const mks = markersRef.current;
        if (!mks.length) return;
        const markerColor = nge ? 'rgba(200,240,80,0.82)' : amber ? 'rgba(255,196,92,0.90)' : hyper ? 'rgba(255,200,80,0.88)' : optic ? 'rgba(19,109,154,0.94)' : red ? 'rgba(255,132,116,0.90)' : eva ? 'rgba(255,160,40,0.88)' : 'rgba(220,190,80,0.88)';
        const markerBg = amber ? 'rgba(12,8,3,0.84)' : optic ? 'rgba(243,248,251,0.96)' : red ? 'rgba(20,6,7,0.90)' : 'rgba(6,6,10,0.72)';
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();
        for (const mk of mks) {
          if (mk.time < start - 0.001 || mk.time > end + 0.001) continue;
          const mx = Math.round(timeToX(mk.time, start, end, rect)) + 0.5;
          ctx.strokeStyle = markerColor;
          ctx.lineWidth = 1.5 * dpr;
          ctx.setLineDash([3 * dpr, 2 * dpr]);
          ctx.beginPath();
          ctx.moveTo(mx, rect.y);
          ctx.lineTo(mx, rect.y + rect.h);
          ctx.stroke();
          ctx.setLineDash([]);
          // Label badge
          ctx.font = `${6.5 * dpr}px ${FONTS.mono}`;
          const tw = ctx.measureText(mk.label).width;
          const bPad = 2 * dpr;
          const bW = tw + bPad * 2;
          const bH = 8.5 * dpr;
          const bX = Math.min(mx + 1.5 * dpr, rect.x + rect.w - bW - 1 * dpr);
          const bY = rect.y + 1.5 * dpr;
          ctx.fillStyle = markerBg;
          ctx.fillRect(bX, bY, bW, bH);
          ctx.fillStyle = markerColor;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(mk.label, bX + bPad, bY + 1 * dpr);
        }
        ctx.restore();
      };

      const drawDetailDecorations = (
        rect: TimelineRect,
        start: number,
        end: number,
        fillPlayback: boolean,
      ): void => {
        drawRangeOverlays(rect, start, end);
        drawLoopOverlay(rect, start, end);
        drawMarkers(rect, start, end);
        drawPlayCursor(rect, start, end, fillPlayback);
      };

      const drawStreamedSessionMap = (
        rect: TimelineRect,
        start: number,
        end: number,
        source: {
          readonly level: WaveformLevel | null;
          readonly peakNormalizer: number;
        },
      ): number => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();

        ctx.fillStyle = backgroundFill;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = unknownFill;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

        const midY = rect.y + rect.h / 2;
        const ampH = Math.max(4 * dpr, rect.h * 0.44);
        ctx.fillStyle = unknownLine;
        ctx.fillRect(rect.x, midY - Math.max(1, dpr / 2), rect.w, Math.max(1, dpr));

        let coveredColumns = 0;
        const { level, peakNormalizer } = source;
        if (level) {
          const envLen = level.binCount;
          const columnCount = Math.max(72, Math.min(320, Math.round(rect.w / Math.max(1.75, 1.9 * dpr))));
          const peakColumns = new Float32Array(columnCount);
          const rmsColumns = new Float32Array(columnCount);
          const coverageColumns = new Float32Array(columnCount);
          const confidenceColumns = new Float32Array(columnCount);
          const rangeStart = (start / duration) * envLen;
          const rangeEnd = (end / duration) * envLen;
          const rangeSpan = Math.max(0.001, rangeEnd - rangeStart);

          for (let column = 0; column < columnCount; column++) {
            const t0 = column / columnCount;
            const t1 = (column + 1) / columnCount;
            const envStart = rangeStart + rangeSpan * t0;
            const envEnd = rangeStart + rangeSpan * t1;
            const binStart = Math.max(0, Math.floor(envStart));
            const binEnd = Math.min(envLen - 1, Math.max(binStart, Math.ceil(envEnd)));
            const totalBins = Math.max(1, binEnd - binStart + 1);
            let coveredBins = 0;
            let maxPeak = 0;
            let sumPeak = 0;
            let sumRms = 0;
            let maxConfidence = 0;

            for (let index = binStart; index <= binEnd; index++) {
              const confidence = level.confidence[index];
              const covered = confidence !== 0;
              if (!covered) continue;
              coveredBins++;
              const peak = peakAt(level, index);
              const rms = level.rms[index];
              if (peak > maxPeak) maxPeak = peak;
              sumPeak += peak;
              sumRms += rms;
              maxConfidence = Math.max(maxConfidence, confidence);
            }

            if (coveredBins <= 0) continue;
            const avgPeak = sumPeak / coveredBins;
            const avgRms = sumRms / coveredBins;
            // Apply soft power-curve compression so cinema audio's wide dynamic
            // range (−24 LUFS dialog against 0 dBFS action peaks) stays visible.
            // Raw linear 0.03 (dialog) → 0.24 display height; 1.0 → 1.0.
            const rawPeak = clampNumber((avgPeak * 0.62 + maxPeak * 0.38) * peakNormalizer, 0, 1);
            const rawRms  = clampNumber(avgRms * peakNormalizer, 0, rawPeak);
            peakColumns[column] = Math.pow(rawPeak, 0.45);
            rmsColumns[column]  = Math.min(
              peakColumns[column],
              Math.pow(rawRms, 0.45),
            );
            coverageColumns[column] = coveredBins / totalBins;
            confidenceColumns[column] = maxConfidence > 0 ? maxConfidence : 2;
            coveredColumns++;
          }

          if (isStreamedOverview) {
            // Allow bridging across large gaps so bisection-order scouts give a
            // plausible full-timeline waveform even before every region is sampled.
            // Linear interpolation between known endpoints; rendered at reduced
            // confidence opacity so the user can see it is estimated.
            const bridgeGapColumns = Math.floor(columnCount / 2);
            const findCoveredIndex = (from: number, step: 1 | -1, limit: number): number => {
              let travelled = 0;
              for (let index = from; index >= 0 && index < columnCount; index += step) {
                if (coverageColumns[index] > 0) return index;
                travelled++;
                if (travelled > limit) break;
              }
              return -1;
            };

            for (let column = 0; column < columnCount; column++) {
              if (coverageColumns[column] > 0) continue;

              const left = findCoveredIndex(column - 1, -1, bridgeGapColumns);
              const right = findCoveredIndex(column + 1, 1, bridgeGapColumns);
              if (left < 0 || right < 0) continue;

              const span = right - left;
              if (span <= 1 || span - 1 > bridgeGapColumns) continue;

              const ratio = (column - left) / span;
              peakColumns[column] = peakColumns[left] + (peakColumns[right] - peakColumns[left]) * ratio;
              rmsColumns[column] = rmsColumns[left] + (rmsColumns[right] - rmsColumns[left]) * ratio;
              coverageColumns[column] = Math.min(coverageColumns[left], coverageColumns[right]) * 0.35;
              confidenceColumns[column] = Math.min(confidenceColumns[left], confidenceColumns[right]) * 0.6;
            }
          }

          const smoothColumns = (values: Float32Array, radius: number): Float32Array => {
            const next = new Float32Array(columnCount);
            for (let column = 0; column < columnCount; column++) {
              if (coverageColumns[column] <= 0) continue;
              let weightedSum = 0;
              let weightTotal = 0;
              for (let offset = -radius; offset <= radius; offset++) {
                const index = column + offset;
                if (index < 0 || index >= columnCount || coverageColumns[index] <= 0) continue;
                const distance = Math.abs(offset);
                const closeness = 1 / (1 + distance);
                const confidence = Math.max(0.2, Math.min(1, confidenceColumns[index] / 2));
                const coverage = Math.max(0.15, coverageColumns[index]);
                const weight = closeness * confidence * coverage;
                weightedSum += values[index] * weight;
                weightTotal += weight;
              }
              next[column] = weightTotal > 0 ? weightedSum / weightTotal : values[column];
            }
            return next;
          };

          peakColumns.set(smoothColumns(peakColumns, 5));
          rmsColumns.set(smoothColumns(rmsColumns, 7));

          const bodyHalfColumns = new Float32Array(columnCount);
          const peakHalfColumns = new Float32Array(columnCount);
          for (let column = 0; column < columnCount; column++) {
            if (coverageColumns[column] <= 0) continue;
            const peak = peakColumns[column];
            const rms = Math.min(peak, rmsColumns[column]);
            const scoutColumn = confidenceColumns[column] < 1.5;
            const bodyFloor = scoutColumn ? 0.13 : 0.1;
            const body = Math.max(ampH * bodyFloor, rms * ampH * (scoutColumn ? 0.95 : 1));
            const crest = Math.max(body, peak * ampH * (scoutColumn ? 0.93 : 0.98));
            bodyHalfColumns[column] = body;
            peakHalfColumns[column] = crest;
          }

          const traceEnvelopeHalf = (
            from: number,
            to: number,
            values: Float32Array,
            direction: 1 | -1,
          ): void => {
            let first = true;
            if (direction > 0) {
              for (let index = from; index <= to; index++) {
                const x = rect.x + ((index + 0.5) / columnCount) * rect.w;
                const y = midY - values[index];
                if (first) {
                  ctx.moveTo(x, y);
                  first = false;
                  continue;
                }
                const prevX = rect.x + (((index - 1) + 0.5) / columnCount) * rect.w;
                const prevY = midY - values[index - 1];
                const midX = (prevX + x) / 2;
                const midYLocal = (prevY + y) / 2;
                ctx.quadraticCurveTo(prevX, prevY, midX, midYLocal);
              }
              const endX = rect.x + ((to + 0.5) / columnCount) * rect.w;
              ctx.lineTo(endX, midY - values[to]);
              return;
            }

            for (let index = to; index >= from; index--) {
              const x = rect.x + ((index + 0.5) / columnCount) * rect.w;
              const y = midY + values[index];
              if (first) {
                ctx.lineTo(x, y);
                first = false;
                continue;
              }
              const prevX = rect.x + (((index + 1) + 0.5) / columnCount) * rect.w;
              const prevY = midY + values[index + 1];
              const midX = (prevX + x) / 2;
              const midYLocal = (prevY + y) / 2;
              ctx.quadraticCurveTo(prevX, prevY, midX, midYLocal);
            }
            const endX = rect.x + ((from + 0.5) / columnCount) * rect.w;
            ctx.lineTo(endX, midY + values[from]);
          };

          const strokeEnvelopeHalf = (
            from: number,
            to: number,
            values: Float32Array,
            direction: 1 | -1,
          ): void => {
            let first = true;
            if (direction > 0) {
              for (let index = from; index <= to; index++) {
                const x = rect.x + ((index + 0.5) / columnCount) * rect.w;
                const y = midY - values[index];
                if (first) {
                  ctx.moveTo(x, y);
                  first = false;
                  continue;
                }
                const prevX = rect.x + (((index - 1) + 0.5) / columnCount) * rect.w;
                const prevY = midY - values[index - 1];
                const midX = (prevX + x) / 2;
                const midYLocal = (prevY + y) / 2;
                ctx.quadraticCurveTo(prevX, prevY, midX, midYLocal);
              }
              const endX = rect.x + ((to + 0.5) / columnCount) * rect.w;
              ctx.lineTo(endX, midY - values[to]);
              return;
            }

            for (let index = from; index <= to; index++) {
              const x = rect.x + ((index + 0.5) / columnCount) * rect.w;
              const y = midY + values[index];
              if (first) {
                ctx.moveTo(x, y);
                first = false;
                continue;
              }
              const prevX = rect.x + (((index - 1) + 0.5) / columnCount) * rect.w;
              const prevY = midY + values[index - 1];
              const midX = (prevX + x) / 2;
              const midYLocal = (prevY + y) / 2;
              ctx.quadraticCurveTo(prevX, prevY, midX, midYLocal);
            }
            const endX = rect.x + ((to + 0.5) / columnCount) * rect.w;
            ctx.lineTo(endX, midY + values[to]);
          };

          for (let column = 0; column < columnCount; column++) {
            const coverage = coverageColumns[column];
            if (coverage <= 0) {
              ctx.fillStyle = learnedWaveHint;
              const x1 = rect.x + (column / columnCount) * rect.w;
              const x2 = rect.x + ((column + 1) / columnCount) * rect.w;
              ctx.fillRect(x1, midY - Math.max(1, dpr / 2), Math.max(1, x2 - x1), Math.max(1, dpr));
            }
          }

          let segmentStart = -1;
          for (let column = 0; column <= columnCount; column++) {
            const active = column < columnCount && coverageColumns[column] > 0;
            if (active && segmentStart < 0) {
              segmentStart = column;
              continue;
            }
            if (active || segmentStart < 0) continue;

            const segmentEnd = column - 1;
            let coverageSum = 0;
            let confidenceSum = 0;
            for (let index = segmentStart; index <= segmentEnd; index++) {
              coverageSum += coverageColumns[index];
              confidenceSum += confidenceColumns[index];
            }

            const averageCoverage = coverageSum / Math.max(1, segmentEnd - segmentStart + 1);
            const averageConfidence = confidenceSum / Math.max(1, segmentEnd - segmentStart + 1);
            const scoutOnly = averageConfidence < 1.5;

            ctx.save();
            ctx.globalAlpha *= scoutOnly
              ? 0.46 + averageCoverage * 0.16
              : 0.62 + averageCoverage * 0.2;
            ctx.fillStyle = waveformFill;
            ctx.beginPath();
            traceEnvelopeHalf(segmentStart, segmentEnd, bodyHalfColumns, 1);
            traceEnvelopeHalf(segmentStart, segmentEnd, bodyHalfColumns, -1);
            ctx.closePath();
            ctx.fill();

            ctx.globalAlpha *= scoutOnly ? 0.82 : 1;
            ctx.strokeStyle = waveformStroke;
            ctx.lineWidth = scoutOnly ? Math.max(0.95, dpr * 0.95) : Math.max(1.1, dpr);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            strokeEnvelopeHalf(segmentStart, segmentEnd, peakHalfColumns, 1);
            ctx.stroke();
            ctx.beginPath();
            strokeEnvelopeHalf(segmentStart, segmentEnd, peakHalfColumns, -1);
            ctx.stroke();

            ctx.globalAlpha *= scoutOnly ? 0.42 : 0.55;
            ctx.strokeStyle = learnedWaveLine;
            ctx.lineWidth = Math.max(1, dpr * 0.75);
            ctx.beginPath();
            const startX = rect.x + ((segmentStart + 0.5) / columnCount) * rect.w;
            const endX = rect.x + ((segmentEnd + 0.5) / columnCount) * rect.w;
            ctx.moveTo(startX, midY);
            ctx.lineTo(endX, midY);
            ctx.stroke();
            ctx.restore();

            segmentStart = -1;
          }
        }

        drawRangeOverlays(rect, start, end);
        drawLoopOverlay(rect, start, end);
        drawMarkers(rect, start, end);
        drawPlayCursor(rect, start, end, true);
        ctx.restore();
        return coveredColumns;
      };

      const drawEnvelopeWindow = (
        rect: TimelineRect,
        start: number,
        end: number,
        options: {
          readonly emphasizeCoverage?: boolean;
          readonly showClipMap?: boolean;
          readonly fillPlayback?: boolean;
          readonly confidenceProfile?: 'session' | 'detail';
          readonly clearBackground?: boolean;
          readonly overlayDecorations?: boolean;
          readonly layerAlpha?: number;
        },
        source: {
          readonly level: WaveformLevel | null;
          readonly peakNormalizer: number;
        },
      ): number => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();

        const midY = rect.y + rect.h / 2;
        const ampH = Math.max(4 * dpr, rect.h * 0.42);
        if (options.clearBackground ?? true) {
          ctx.fillStyle = backgroundFill;
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          ctx.fillStyle = unknownFill;
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          ctx.fillStyle = unknownLine;
          ctx.fillRect(rect.x, midY - Math.max(1, dpr / 2), rect.w, Math.max(1, dpr));
        }

        const layerAlpha = options.layerAlpha ?? 1;
        ctx.save();
        ctx.globalAlpha *= layerAlpha;

        let coveredColumns = 0;
        const { level, peakNormalizer } = source;
        if (level) {
          const envLen = level.binCount;
          const columnCount = Math.max(48, Math.min(720, Math.round(rect.w / Math.max(1.25, 1.15 * dpr))));
          const peakColumns = new Float32Array(columnCount);
          const rmsColumns = new Float32Array(columnCount);
          const coverageColumns = new Float32Array(columnCount);
          const confidenceColumns = new Float32Array(columnCount);
          const clipColumns = new Float32Array(columnCount);
          const rangeStart = (start / duration) * envLen;
          const rangeEnd = (end / duration) * envLen;
          const rangeSpan = Math.max(0.001, rangeEnd - rangeStart);
          const bridgeGapColumns = isStreamedOverview
            ? Math.max(1, Math.min(8, Math.round(columnCount / 120)))
            : 0;

          const findCoveredIndex = (from: number, step: -1 | 1, limit: number): number => {
            let travelled = 0;
            for (let index = from; index >= 0 && index < columnCount; index += step) {
              if (coverageColumns[index] > 0) return index;
              travelled++;
              if (travelled > limit) break;
            }
            return -1;
          };

          const traceEnvelopeHalf = (
            from: number,
            to: number,
            values: Float32Array,
            direction: 1 | -1,
          ): void => {
            let first = true;
            if (direction > 0) {
              for (let index = from; index <= to; index++) {
                const x = rect.x + ((index + 0.5) / columnCount) * rect.w;
                const y = midY - values[index];
                if (first) {
                  ctx.moveTo(x, y);
                  first = false;
                  continue;
                }
                const prevX = rect.x + (((index - 1) + 0.5) / columnCount) * rect.w;
                const prevY = midY - values[index - 1];
                const midX = (prevX + x) / 2;
                const midYLocal = (prevY + y) / 2;
                ctx.quadraticCurveTo(prevX, prevY, midX, midYLocal);
              }
              const endX = rect.x + ((to + 0.5) / columnCount) * rect.w;
              ctx.lineTo(endX, midY - values[to]);
              return;
            }

            for (let index = to; index >= from; index--) {
              const x = rect.x + ((index + 0.5) / columnCount) * rect.w;
              const y = midY + values[index];
              if (first) {
                ctx.lineTo(x, y);
                first = false;
                continue;
              }
              const prevX = rect.x + (((index + 1) + 0.5) / columnCount) * rect.w;
              const prevY = midY + values[index + 1];
              const midX = (prevX + x) / 2;
              const midYLocal = (prevY + y) / 2;
              ctx.quadraticCurveTo(prevX, prevY, midX, midYLocal);
            }
            const endX = rect.x + ((from + 0.5) / columnCount) * rect.w;
            ctx.lineTo(endX, midY + values[from]);
          };

          const strokeEnvelopeHalf = (
            from: number,
            to: number,
            values: Float32Array,
            direction: 1 | -1,
          ): void => {
            let first = true;
            if (direction > 0) {
              for (let index = from; index <= to; index++) {
                const x = rect.x + ((index + 0.5) / columnCount) * rect.w;
                const y = midY - values[index];
                if (first) {
                  ctx.moveTo(x, y);
                  first = false;
                  continue;
                }
                const prevX = rect.x + (((index - 1) + 0.5) / columnCount) * rect.w;
                const prevY = midY - values[index - 1];
                const midX = (prevX + x) / 2;
                const midYLocal = (prevY + y) / 2;
                ctx.quadraticCurveTo(prevX, prevY, midX, midYLocal);
              }
              const endX = rect.x + ((to + 0.5) / columnCount) * rect.w;
              ctx.lineTo(endX, midY - values[to]);
              return;
            }

            for (let index = from; index <= to; index++) {
              const x = rect.x + ((index + 0.5) / columnCount) * rect.w;
              const y = midY + values[index];
              if (first) {
                ctx.moveTo(x, y);
                first = false;
                continue;
              }
              const prevX = rect.x + (((index - 1) + 0.5) / columnCount) * rect.w;
              const prevY = midY + values[index - 1];
              const midX = (prevX + x) / 2;
              const midYLocal = (prevY + y) / 2;
              ctx.quadraticCurveTo(prevX, prevY, midX, midYLocal);
            }
            const endX = rect.x + ((to + 0.5) / columnCount) * rect.w;
            ctx.lineTo(endX, midY + values[to]);
          };

          for (let column = 0; column < columnCount; column++) {
            const t0 = column / columnCount;
            const t1 = (column + 1) / columnCount;
            const envStart = rangeStart + rangeSpan * t0;
            const envEnd = rangeStart + rangeSpan * t1;
            const binStart = Math.max(0, Math.floor(envStart));
            const binEnd = Math.min(envLen - 1, Math.max(binStart, Math.ceil(envEnd)));
            const totalBins = Math.max(1, binEnd - binStart + 1);
            let coveredBins = 0;
            let maxPeak = 0;
            let maxRms = 0;
            let maxConfidence = 0;
            let maxClipDensity = 0;

            for (let index = binStart; index <= binEnd; index++) {
              const confidence = level.confidence[index];
              const covered = confidence !== 0;
              if (!covered) continue;
              coveredBins++;
              maxPeak = Math.max(maxPeak, peakAt(level, index));
              maxRms = Math.max(maxRms, level.rms[index]);
              maxConfidence = Math.max(maxConfidence, confidence);
              maxClipDensity = Math.max(maxClipDensity, level.clipDensity[index]);
            }

            if (coveredBins > 0) {
              peakColumns[column] = clampNumber(maxPeak * peakNormalizer, 0, 1);
              rmsColumns[column] = clampNumber(maxRms * peakNormalizer, 0, peakColumns[column]);
              coverageColumns[column] = coveredBins / totalBins;
              confidenceColumns[column] = maxConfidence > 0 ? maxConfidence : 2;
              clipColumns[column] = maxClipDensity;
              coveredColumns++;
            }
          }

          if (isStreamedOverview) {
            for (let column = 0; column < columnCount; column++) {
              if (coverageColumns[column] > 0) continue;

              const left = findCoveredIndex(column - 1, -1, bridgeGapColumns);
              const right = findCoveredIndex(column + 1, 1, bridgeGapColumns);
              if (left < 0 || right < 0) continue;

              const span = right - left;
              if (span <= 1 || span - 1 > bridgeGapColumns) continue;

              const ratio = (column - left) / span;
              peakColumns[column] = peakColumns[left] + (peakColumns[right] - peakColumns[left]) * ratio;
              rmsColumns[column] = rmsColumns[left] + (rmsColumns[right] - rmsColumns[left]) * ratio;
              coverageColumns[column] = Math.min(coverageColumns[left], coverageColumns[right]) * 0.3;
              confidenceColumns[column] = Math.min(confidenceColumns[left], confidenceColumns[right]) * 0.5;
            }
          }

          if (isStreamedOverview) {
            const scoutSmoothRadius = options.confidenceProfile === 'detail' ? 2 : 4;
            const smoothColumns = (sourceValues: Float32Array): Float32Array => {
              const next = new Float32Array(columnCount);
              for (let column = 0; column < columnCount; column++) {
                if (coverageColumns[column] <= 0) continue;
                if (confidenceColumns[column] >= 1.5) {
                  next[column] = sourceValues[column];
                  continue;
                }

                let weightedSum = 0;
                let weightTotal = 0;
                for (let offset = -scoutSmoothRadius; offset <= scoutSmoothRadius; offset++) {
                  const index = column + offset;
                  if (index < 0 || index >= columnCount || coverageColumns[index] <= 0) continue;
                  const distance = Math.abs(offset);
                  const closeness = 1 / (1 + distance);
                  const confidence = Math.max(0.15, Math.min(1, confidenceColumns[index]));
                  const coverageWeight = Math.max(0.15, coverageColumns[index]);
                  const weight = closeness * confidence * coverageWeight;
                  weightedSum += sourceValues[index] * weight;
                  weightTotal += weight;
                }
                if (weightTotal <= 0) {
                  next[column] = sourceValues[column];
                  continue;
                }
                const smoothed = weightedSum / weightTotal;
                next[column] = Math.max(sourceValues[column] * 0.72, smoothed);
              }
              return next;
            };

            peakColumns.set(smoothColumns(peakColumns));
            rmsColumns.set(smoothColumns(rmsColumns));
          }

          const peakHalfColumns = new Float32Array(columnCount);
          const rmsHalfColumns = new Float32Array(columnCount);
          for (let column = 0; column < columnCount; column++) {
            const peak = peakColumns[column];
            const rms = Math.min(peak, rmsColumns[column]);
            const coverage = coverageColumns[column];
            if (coverage <= 0) continue;
            const scoutColumn = confidenceColumns[column] < 1.5;
            const scoutPeakScale = scoutColumn
              ? (options.confidenceProfile === 'detail' ? 0.96 : 0.9)
              : 1;
            const scoutBodyFloor = scoutColumn
              ? (options.confidenceProfile === 'detail' ? 0.24 : 0.18)
              : 0.14;
            peakHalfColumns[column] = peak * ampH * scoutPeakScale;
            rmsHalfColumns[column] = Math.max(peakHalfColumns[column] * scoutBodyFloor, rms * ampH);
          }

          for (let column = 0; column < columnCount; column++) {
            if (coverageColumns[column] <= 0 && options.emphasizeCoverage) {
              const x1 = rect.x + (column / columnCount) * rect.w;
              const x2 = rect.x + ((column + 1) / columnCount) * rect.w;
              ctx.fillStyle = learnedWaveHint;
              ctx.fillRect(x1, midY - Math.max(1, dpr / 2), Math.max(1, x2 - x1), Math.max(1, dpr));
            }
          }

          let segmentStart = -1;
          for (let column = 0; column <= columnCount; column++) {
            const active = column < columnCount && coverageColumns[column] > 0;
            if (active && segmentStart < 0) {
              segmentStart = column;
              continue;
            }
            if (active || segmentStart < 0) continue;

            const segmentEnd = column - 1;
            let coverageSum = 0;
            let confidenceSum = 0;
            let maxClipDensity = 0;
            for (let index = segmentStart; index <= segmentEnd; index++) {
              coverageSum += coverageColumns[index];
              confidenceSum += confidenceColumns[index];
              maxClipDensity = Math.max(maxClipDensity, clipColumns[index]);
            }

            const averageCoverage = coverageSum / Math.max(1, segmentEnd - segmentStart + 1);
            const averageConfidence = confidenceSum / Math.max(1, segmentEnd - segmentStart + 1);
            const scoutOnly = averageConfidence < 1.5;
            const alpha = scoutOnly
              ? 0.72 + averageCoverage * 0.2
              : 0.5 + averageCoverage * 0.42;

            ctx.save();
            ctx.globalAlpha *= alpha;
            ctx.fillStyle = scoutOnly ? waveformShadow : waveformFill;
            ctx.beginPath();
            traceEnvelopeHalf(segmentStart, segmentEnd, rmsHalfColumns, 1);
            traceEnvelopeHalf(segmentStart, segmentEnd, rmsHalfColumns, -1);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = scoutOnly ? waveformStroke : waveformStroke;
            ctx.lineWidth = scoutOnly ? Math.max(0.9, dpr * 0.9) : Math.max(1, dpr);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            strokeEnvelopeHalf(segmentStart, segmentEnd, peakHalfColumns, 1);
            ctx.stroke();

            ctx.globalAlpha *= scoutOnly ? 0.55 : 1;
            ctx.strokeStyle = waveformShadow;
            ctx.beginPath();
            strokeEnvelopeHalf(segmentStart, segmentEnd, peakHalfColumns, -1);
            ctx.stroke();
            ctx.restore();

            if (averageCoverage <= 0.18) {
              const x1 = rect.x + (segmentStart / columnCount) * rect.w;
              const x2 = rect.x + ((segmentEnd + 1) / columnCount) * rect.w;
              ctx.fillStyle = learnedWaveLine;
              ctx.fillRect(x1, midY - Math.max(1, dpr / 2), Math.max(1, x2 - x1), Math.max(1, dpr));
            }

            if (options.showClipMap && maxClipDensity > 0) {
              for (let index = segmentStart; index <= segmentEnd; index++) {
                const clipDensity = clipColumns[index];
                if (clipDensity <= 0) continue;
                const x1 = rect.x + (index / columnCount) * rect.w;
                const x2 = rect.x + ((index + 1) / columnCount) * rect.w;
                const colW = Math.max(1, x2 - x1);
                const markerH = Math.max(2 * dpr, rect.h * 0.06);
                const alpha = 0.28 + clipDensity * 0.44;
                ctx.save();
                ctx.globalAlpha *= alpha;
                ctx.fillStyle = 'rgba(214, 70, 70, 0.9)';
                ctx.fillRect(x1, rect.y, colW, markerH);
                ctx.fillRect(x1, rect.y + rect.h - markerH, colW, markerH);
                ctx.restore();
              }
            }

            segmentStart = -1;
          }
        }

        ctx.restore();
        if (options.overlayDecorations ?? true) {
          drawDetailDecorations(rect, start, end, options.fillPlayback ?? false);
        }
        ctx.restore();
        return coveredColumns;
      };

      const drawEventWindow = (
        rect: TimelineRect,
        start: number,
        end: number,
        options: {
          readonly clearBackground?: boolean;
          readonly overlayDecorations?: boolean;
          readonly layerAlpha?: number;
          readonly forceScaffoldPresentation?: boolean;
          readonly fillPlayback?: boolean;
        },
        source: {
          readonly level: WaveformLevel | null;
        },
      ): number => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();

        const midY = rect.y + rect.h * 0.48;
        const ampH = Math.max(4 * dpr, rect.h * 0.32);
        const ribbonHeight = Math.max(3 * dpr, rect.h * 0.13);
        const ribbonY = rect.y + rect.h - ribbonHeight - 2 * dpr;
        if (options.clearBackground ?? true) {
          ctx.fillStyle = backgroundFill;
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          ctx.fillStyle = unknownFill;
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          ctx.fillStyle = unknownLine;
          ctx.fillRect(rect.x, midY - Math.max(1, dpr / 2), rect.w, Math.max(1, dpr));
        }

        const layerAlpha = options.layerAlpha ?? 1;
        const forceScaffoldPresentation = options.forceScaffoldPresentation ?? false;
        ctx.save();
        ctx.globalAlpha *= layerAlpha;

        let coveredColumns = 0;
        const { level } = source;
        if (level) {
          const envLen = level.binCount;
          const columnCount = Math.max(56, Math.min(768, Math.round(rect.w / Math.max(1.1, dpr * 1.05))));
          const peakColumns = new Float32Array(columnCount);
          const rmsColumns = new Float32Array(columnCount);
          const activityColumns = new Float32Array(columnCount);
          const coverageColumns = new Float32Array(columnCount);
          const confidenceColumns = new Float32Array(columnCount);
          const clipColumns = new Float32Array(columnCount);
          const contrastColumns = new Float32Array(columnCount);
          const rangeStart = (start / duration) * envLen;
          const rangeEnd = (end / duration) * envLen;
          const rangeSpan = Math.max(0.001, rangeEnd - rangeStart);
          const bridgeGapColumns = isStreamedOverview
            ? Math.max(1, Math.min(10, Math.round(columnCount / 90)))
            : 0;

          const findCoveredIndex = (from: number, step: -1 | 1, limit: number): number => {
            let travelled = 0;
            for (let index = from; index >= 0 && index < columnCount; index += step) {
              if (coverageColumns[index] > 0) return index;
              travelled++;
              if (travelled > limit) break;
            }
            return -1;
          };

          const traceEnvelopeHalf = (
            from: number,
            to: number,
            values: Float32Array,
            direction: 1 | -1,
          ): void => {
            let first = true;
            if (direction > 0) {
              for (let index = from; index <= to; index++) {
                const x = rect.x + ((index + 0.5) / columnCount) * rect.w;
                const y = midY - values[index];
                if (first) {
                  ctx.moveTo(x, y);
                  first = false;
                  continue;
                }
                const prevX = rect.x + (((index - 1) + 0.5) / columnCount) * rect.w;
                const prevY = midY - values[index - 1];
                const midX = (prevX + x) / 2;
                const midYLocal = (prevY + y) / 2;
                ctx.quadraticCurveTo(prevX, prevY, midX, midYLocal);
              }
              const endX = rect.x + ((to + 0.5) / columnCount) * rect.w;
              ctx.lineTo(endX, midY - values[to]);
              return;
            }

            for (let index = to; index >= from; index--) {
              const x = rect.x + ((index + 0.5) / columnCount) * rect.w;
              const y = midY + values[index];
              if (first) {
                ctx.lineTo(x, y);
                first = false;
                continue;
              }
              const prevX = rect.x + (((index + 1) + 0.5) / columnCount) * rect.w;
              const prevY = midY + values[index + 1];
              const midX = (prevX + x) / 2;
              const midYLocal = (prevY + y) / 2;
              ctx.quadraticCurveTo(prevX, prevY, midX, midYLocal);
            }
            const endX = rect.x + ((from + 0.5) / columnCount) * rect.w;
            ctx.lineTo(endX, midY + values[from]);
          };

          const strokeEnvelopeHalf = (
            from: number,
            to: number,
            values: Float32Array,
            direction: 1 | -1,
          ): void => {
            let first = true;
            if (direction > 0) {
              for (let index = from; index <= to; index++) {
                const x = rect.x + ((index + 0.5) / columnCount) * rect.w;
                const y = midY - values[index];
                if (first) {
                  ctx.moveTo(x, y);
                  first = false;
                  continue;
                }
                const prevX = rect.x + (((index - 1) + 0.5) / columnCount) * rect.w;
                const prevY = midY - values[index - 1];
                const midX = (prevX + x) / 2;
                const midYLocal = (prevY + y) / 2;
                ctx.quadraticCurveTo(prevX, prevY, midX, midYLocal);
              }
              const endX = rect.x + ((to + 0.5) / columnCount) * rect.w;
              ctx.lineTo(endX, midY - values[to]);
              return;
            }

            for (let index = from; index <= to; index++) {
              const x = rect.x + ((index + 0.5) / columnCount) * rect.w;
              const y = midY + values[index];
              if (first) {
                ctx.moveTo(x, y);
                first = false;
                continue;
              }
              const prevX = rect.x + (((index - 1) + 0.5) / columnCount) * rect.w;
              const prevY = midY + values[index - 1];
              const midX = (prevX + x) / 2;
              const midYLocal = (prevY + y) / 2;
              ctx.quadraticCurveTo(prevX, prevY, midX, midYLocal);
            }
            const endX = rect.x + ((to + 0.5) / columnCount) * rect.w;
            ctx.lineTo(endX, midY + values[to]);
          };

          for (let column = 0; column < columnCount; column++) {
            const t0 = column / columnCount;
            const t1 = (column + 1) / columnCount;
            const envStart = rangeStart + rangeSpan * t0;
            const envEnd = rangeStart + rangeSpan * t1;
            const binStart = Math.max(0, Math.floor(envStart));
            const binEnd = Math.min(envLen - 1, Math.max(binStart, Math.ceil(envEnd)));
            const totalBins = Math.max(1, binEnd - binStart + 1);
            let coveredBins = 0;
            let maxPeak = 0;
            let maxRms = 0;
            let sumPeak = 0;
            let sumRms = 0;
            let activeBins = 0;
            let maxConfidence = 0;
            let maxClipDensity = 0;

            for (let index = binStart; index <= binEnd; index++) {
              const confidence = level.confidence[index];
              if (confidence === 0) continue;
              coveredBins++;
              const peak = peakAt(level, index);
              const rms = level.rms[index];
              maxPeak = Math.max(maxPeak, peak);
              maxRms = Math.max(maxRms, rms);
              sumPeak += peak;
              sumRms += rms;
              if (peak >= 0.014 || rms >= 0.008) activeBins++;
              maxConfidence = Math.max(maxConfidence, confidence);
              maxClipDensity = Math.max(maxClipDensity, level.clipDensity[index]);
            }

            if (coveredBins <= 0) continue;
            const avgPeak = sumPeak / coveredBins;
            const avgRms = sumRms / coveredBins;
            const activityRatio = activeBins / coveredBins;
            const shapedPeak = avgPeak * 0.62 + maxPeak * 0.38;
            const shapedRms = Math.min(
              shapedPeak,
              avgRms * (0.86 + activityRatio * 0.14) + maxRms * 0.14,
            );
            peakColumns[column] = amplitudeToEventHeight(shapedPeak);
            rmsColumns[column] = Math.min(peakColumns[column], amplitudeToEventHeight(shapedRms));
            activityColumns[column] = activityRatio;
            coverageColumns[column] = coveredBins / totalBins;
            const baseConfidence = maxConfidence > 0 ? maxConfidence : 2;
            confidenceColumns[column] = forceScaffoldPresentation ? Math.min(baseConfidence, 1.25) : baseConfidence;
            clipColumns[column] = maxClipDensity;
            coveredColumns++;
          }

          if (isStreamedOverview) {
            for (let column = 0; column < columnCount; column++) {
              if (coverageColumns[column] > 0) continue;

              const left = findCoveredIndex(column - 1, -1, bridgeGapColumns);
              const right = findCoveredIndex(column + 1, 1, bridgeGapColumns);
              if (left < 0 || right < 0) continue;

              const span = right - left;
              if (span <= 1 || span - 1 > bridgeGapColumns) continue;

              const ratio = (column - left) / span;
              peakColumns[column] = peakColumns[left] + (peakColumns[right] - peakColumns[left]) * ratio;
              rmsColumns[column] = rmsColumns[left] + (rmsColumns[right] - rmsColumns[left]) * ratio;
              activityColumns[column] = activityColumns[left] + (activityColumns[right] - activityColumns[left]) * ratio;
              coverageColumns[column] = Math.min(coverageColumns[left], coverageColumns[right]) * 0.32;
              const bridgedConfidence = Math.min(confidenceColumns[left], confidenceColumns[right]) * 0.5;
              confidenceColumns[column] = forceScaffoldPresentation ? Math.min(bridgedConfidence, 1.1) : bridgedConfidence;
              clipColumns[column] = Math.max(clipColumns[left], clipColumns[right]) * 0.55;
            }
          }

          const smoothColumns = (sourceValues: Float32Array, radius: number, preserveFloor: number): Float32Array => {
            const next = new Float32Array(columnCount);
            for (let column = 0; column < columnCount; column++) {
              if (coverageColumns[column] <= 0) continue;
              let weightedSum = 0;
              let weightTotal = 0;
              for (let offset = -radius; offset <= radius; offset++) {
                const index = column + offset;
                if (index < 0 || index >= columnCount || coverageColumns[index] <= 0) continue;
                const distance = Math.abs(offset);
                const closeness = 1 / (1 + distance);
                const confidenceWeight = Math.max(0.2, Math.min(1, confidenceColumns[index] / 2));
                const coverageWeight = Math.max(0.15, coverageColumns[index]);
                const weight = closeness * confidenceWeight * coverageWeight;
                weightedSum += sourceValues[index] * weight;
                weightTotal += weight;
              }
              if (weightTotal <= 0) {
                next[column] = sourceValues[column];
                continue;
              }
              const smoothed = weightedSum / weightTotal;
              next[column] = Math.max(sourceValues[column] * preserveFloor, smoothed);
            }
            return next;
          };

          peakColumns.set(smoothColumns(peakColumns, 2, 0.72));
          rmsColumns.set(smoothColumns(rmsColumns, 4, 0.78));
          activityColumns.set(smoothColumns(activityColumns, 3, 0.7));

          for (let column = 0; column < columnCount; column++) {
            if (coverageColumns[column] <= 0) continue;
            const prev = column > 0 ? rmsColumns[column - 1] : rmsColumns[column];
            const next = column < columnCount - 1 ? rmsColumns[column + 1] : rmsColumns[column];
            const peakPrev = column > 0 ? peakColumns[column - 1] : peakColumns[column];
            const peakNext = column < columnCount - 1 ? peakColumns[column + 1] : peakColumns[column];
            contrastColumns[column] = Math.min(
              1,
              (Math.abs(rmsColumns[column] - prev) + Math.abs(rmsColumns[column] - next)) * 0.95
                + (Math.abs(peakColumns[column] - peakPrev) + Math.abs(peakColumns[column] - peakNext)) * 0.4,
            );
          }

          const bodyHalfColumns = new Float32Array(columnCount);
          const peakHalfColumns = new Float32Array(columnCount);
          const ribbonColumns = new Float32Array(columnCount);
          for (let column = 0; column < columnCount; column++) {
            if (coverageColumns[column] <= 0) continue;
            const confidence = confidenceColumns[column];
            const scaffoldColumn = confidence < 1.5;
            const peak = peakColumns[column];
            const rms = Math.min(peak, rmsColumns[column]);
            const activity = activityColumns[column];
            const bodyFloor = scaffoldColumn ? 0.035 : 0.025;
            bodyHalfColumns[column] = Math.max(ampH * bodyFloor, rms * ampH * (0.82 + activity * 0.18));
            peakHalfColumns[column] = Math.max(bodyHalfColumns[column] + 0.5 * dpr, peak * ampH * (0.9 + activity * 0.1));
            ribbonColumns[column] = computeTransientIntensity(
              peakColumns[column],
              rmsColumns[column],
              clipColumns[column],
              contrastColumns[column],
            ) * ribbonHeight * (0.65 + activity * 0.35) * (scaffoldColumn ? 0.88 : 1);
          }

          for (let column = 0; column < columnCount; column++) {
            const x1 = rect.x + (column / columnCount) * rect.w;
            const x2 = rect.x + ((column + 1) / columnCount) * rect.w;
            const colW = Math.max(1, x2 - x1);
            const confidence = confidenceColumns[column];
            if (coverageColumns[column] <= 0) {
              ctx.fillStyle = learnedWaveHint;
              ctx.fillRect(x1, midY - Math.max(1, dpr / 2), colW, Math.max(1, dpr));
              continue;
            }

            ctx.save();
            ctx.globalAlpha *= confidence >= 1.5 ? 0.06 + coverageColumns[column] * 0.05 : 0.03 + coverageColumns[column] * 0.03;
            ctx.fillStyle = confidence >= 1.5 ? waveformFill : learnedWaveHint;
            ctx.fillRect(x1, rect.y, colW, rect.h);
            ctx.restore();
          }

          let segmentStart = -1;
          for (let column = 0; column <= columnCount; column++) {
            const active = column < columnCount && coverageColumns[column] > 0;
            if (active && segmentStart < 0) {
              segmentStart = column;
              continue;
            }
            if (active || segmentStart < 0) continue;

            const segmentEnd = column - 1;
            let coverageSum = 0;
            let confidenceSum = 0;
            for (let index = segmentStart; index <= segmentEnd; index++) {
              coverageSum += coverageColumns[index];
              confidenceSum += confidenceColumns[index];
            }

            const averageCoverage = coverageSum / Math.max(1, segmentEnd - segmentStart + 1);
            const averageConfidence = confidenceSum / Math.max(1, segmentEnd - segmentStart + 1);
            const scaffoldSegment = averageConfidence < 1.5;

            ctx.save();
            ctx.globalAlpha *= scaffoldSegment
              ? 0.36 + averageCoverage * 0.16
              : 0.52 + averageCoverage * 0.24;
            ctx.fillStyle = scaffoldSegment ? learnedWaveHint : waveformFill;
            ctx.beginPath();
            traceEnvelopeHalf(segmentStart, segmentEnd, bodyHalfColumns, 1);
            traceEnvelopeHalf(segmentStart, segmentEnd, bodyHalfColumns, -1);
            ctx.closePath();
            ctx.fill();

            ctx.globalAlpha *= scaffoldSegment ? 0.85 : 1;
            ctx.strokeStyle = waveformStroke;
            ctx.lineWidth = scaffoldSegment ? Math.max(0.9, dpr * 0.9) : Math.max(1.05, dpr);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            strokeEnvelopeHalf(segmentStart, segmentEnd, peakHalfColumns, 1);
            ctx.stroke();
            ctx.beginPath();
            strokeEnvelopeHalf(segmentStart, segmentEnd, peakHalfColumns, -1);
            ctx.stroke();
            ctx.restore();

            segmentStart = -1;
          }

          for (let column = 0; column < columnCount; column++) {
            if (coverageColumns[column] <= 0) continue;
            const x1 = rect.x + (column / columnCount) * rect.w;
            const x2 = rect.x + ((column + 1) / columnCount) * rect.w;
            const colW = Math.max(1, x2 - x1);
            const ribbonSignal = ribbonColumns[column];
            if (ribbonSignal > 0) {
              ctx.save();
              ctx.globalAlpha *= 0.22 + (ribbonSignal / Math.max(ribbonHeight, 1)) * 0.5;
              ctx.fillStyle = waveformStroke;
              ctx.fillRect(x1, ribbonY + (ribbonHeight - ribbonSignal), colW, ribbonSignal);
              ctx.restore();
            }

            if (clipColumns[column] > 0) {
              const clipSignal = Math.max(1.5 * dpr, ribbonHeight * clipColumns[column]);
              ctx.save();
              ctx.globalAlpha *= 0.18 + clipColumns[column] * 0.42;
              ctx.fillStyle = 'rgba(214, 70, 70, 0.9)';
              ctx.fillRect(x1, ribbonY + ribbonHeight - clipSignal, colW, clipSignal);
              ctx.restore();
            }
          }
        }

        ctx.restore();
        if (options.overlayDecorations ?? true) {
          drawDetailDecorations(rect, start, end, options.fillPlayback ?? true);
        }
        ctx.restore();
        return coveredColumns;
      };

      const drawSampleWindow = (
        rect: TimelineRect,
        start: number,
        end: number,
      ): number => {
        const buffer = audioEngine.audioBuffer;
        if (!buffer || end <= start) {
          return 0;
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();

        ctx.fillStyle = backgroundFill;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = unknownFill;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

        const midY = rect.y + rect.h / 2;
        const ampH = Math.max(4 * dpr, rect.h * 0.42);
        ctx.fillStyle = unknownLine;
        ctx.fillRect(rect.x, midY - Math.max(1, dpr / 2), rect.w, Math.max(1, dpr));

        const channelCount = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const startSample = Math.max(0, Math.floor(start * sampleRate));
        const endSample = Math.min(buffer.length, Math.ceil(end * sampleRate));
        const sampleSpan = Math.max(1, endSample - startSample);
        const maxPoints = Math.max(32, Math.floor(rect.w / Math.max(1, dpr * 0.75)));
        const step = Math.max(1, Math.floor(sampleSpan / maxPoints));

        ctx.save();
        ctx.globalAlpha *= 0.55;
        ctx.fillStyle = waveformFill;
        ctx.beginPath();
        for (let sample = startSample; sample <= endSample; sample += step) {
          const ratio = (sample - startSample) / sampleSpan;
          const x = rect.x + ratio * rect.w;
          let min = 1;
          let max = -1;
          for (let channel = 0; channel < channelCount; channel++) {
            const value = buffer.getChannelData(channel)[Math.min(buffer.length - 1, sample)];
            if (value < min) min = value;
            if (value > max) max = value;
          }
          const peak = Math.max(Math.abs(min), Math.abs(max));
          const topY = midY - peak * peakNormalizer * ampH;
          if (sample === startSample) {
            ctx.moveTo(x, topY);
          } else {
            ctx.lineTo(x, topY);
          }
        }
        for (let sample = endSample; sample >= startSample; sample -= step) {
          const ratio = (sample - startSample) / sampleSpan;
          const x = rect.x + ratio * rect.w;
          let min = 1;
          let max = -1;
          for (let channel = 0; channel < channelCount; channel++) {
            const value = buffer.getChannelData(channel)[Math.min(buffer.length - 1, sample)];
            if (value < min) min = value;
            if (value > max) max = value;
          }
          const peak = Math.max(Math.abs(min), Math.abs(max));
          const bottomY = midY + peak * peakNormalizer * ampH;
          ctx.lineTo(x, bottomY);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        const traceWaveform = (channelIndex: number, alpha: number) => {
          const samples = buffer.getChannelData(Math.min(channelIndex, channelCount - 1));
          ctx.save();
          ctx.globalAlpha *= alpha;
          ctx.strokeStyle = waveformStroke;
          ctx.lineWidth = Math.max(dpr * 0.95, 1);
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.beginPath();
          let first = true;
          for (let sample = startSample; sample <= endSample; sample += step) {
            const ratio = (sample - startSample) / sampleSpan;
            const x = rect.x + ratio * rect.w;
            const value = samples[Math.min(buffer.length - 1, sample)];
            const y = midY - value * peakNormalizer * ampH;
            if (first) {
              ctx.moveTo(x, y);
              first = false;
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
          ctx.restore();
        };

        traceWaveform(0, 1);
        if (channelCount > 1) {
          traceWaveform(1, 0.42);
        }

        drawRangeOverlays(rect, start, end);
        drawLoopOverlay(rect, start, end);
        drawMarkers(rect, start, end);
        drawPlayCursor(rect, start, end, true);
        ctx.restore();
        return Math.max(1, Math.floor(rect.w));
      };

      ctx.strokeStyle = hyper ? 'rgba(32,52,110,0.92)' : eva ? 'rgba(74,26,144,0.92)' : COLORS.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, layout.view.y - 0.5);
      ctx.lineTo(width, layout.view.y - 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, layout.loop.y - 0.5);
      ctx.lineTo(width, layout.loop.y - 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, layout.detail.y - 0.5);
      ctx.lineTo(width, layout.detail.y - 0.5);
      ctx.stroke();

      const viewportStartX = timeToX(viewRange.start, 0, duration, layout.session);
      const viewportEndX = timeToX(viewRange.end, 0, duration, layout.session);
      ctx.fillStyle = viewWindowFill;
      ctx.fillRect(viewportStartX, layout.session.y, Math.max(1, viewportEndX - viewportStartX), layout.session.h);
      drawTimeGrid(layout.session, 0, duration, true);
      if (isStreamedOverview) {
        drawStreamedSessionMap(
          layout.session,
          0,
          duration,
          {
            level: overviewLevel,
            peakNormalizer,
          },
        );
      } else {
        drawEnvelopeWindow(
          layout.session,
          0,
          duration,
          { emphasizeCoverage: true, fillPlayback: true, confidenceProfile: 'session' },
          {
            level: overviewLevel,
            peakNormalizer,
          },
        );
        drawRangeOverlays(layout.session, 0, duration);
      }
      ctx.strokeStyle = viewWindowStroke;
      ctx.lineWidth = 1.2 * dpr;
      ctx.strokeRect(viewportStartX, layout.session.y + 0.5 * dpr, Math.max(1, viewportEndX - viewportStartX), Math.max(1, layout.session.h - dpr));

      ctx.fillStyle = controlFill;
      ctx.fillRect(layout.view.x, layout.view.y, layout.view.w, layout.view.h);
      ctx.fillRect(layout.loop.x, layout.loop.y, layout.loop.w, layout.loop.h);
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = dpr;
      ctx.strokeRect(layout.view.x + 0.5 * dpr, layout.view.y + 0.5 * dpr, Math.max(1, layout.view.w - dpr), Math.max(1, layout.view.h - dpr));
      ctx.strokeRect(layout.loop.x + 0.5 * dpr, layout.loop.y + 0.5 * dpr, Math.max(1, layout.loop.w - dpr), Math.max(1, layout.loop.h - dpr));
      drawTimeGrid(layout.view, 0, duration, false);
      drawTimeGrid(layout.loop, 0, duration, false);

      const viewTrackY = layout.view.y + Math.max(1, Math.round(layout.view.h * 0.28));
      const viewTrackH = Math.max(2 * dpr, layout.view.h - Math.round(layout.view.h * 0.52));
      const viewBrushX1 = timeToX(viewRange.start, 0, duration, layout.view);
      const viewBrushX2 = timeToX(viewRange.end, 0, duration, layout.view);
      ctx.fillStyle = controlTrack;
      ctx.fillRect(layout.view.x, viewTrackY, layout.view.w, viewTrackH);
      ctx.fillStyle = viewWindowFill;
      ctx.fillRect(viewBrushX1, viewTrackY, Math.max(1, viewBrushX2 - viewBrushX1), viewTrackH);
      ctx.strokeStyle = viewWindowStroke;
      ctx.lineWidth = dpr;
      ctx.strokeRect(viewBrushX1, viewTrackY - 0.5 * dpr, Math.max(1, viewBrushX2 - viewBrushX1), Math.max(1, viewTrackH + dpr));
      drawControlHandle(layout.view, viewBrushX1, viewWindowFill, viewWindowStroke);
      drawControlHandle(layout.view, viewBrushX2, viewWindowFill, viewWindowStroke);
      drawPlayCursor(layout.view, 0, duration, false);

      const loopTrackY = layout.loop.y + Math.max(1, Math.round(layout.loop.h * 0.28));
      const loopTrackH = Math.max(2 * dpr, layout.loop.h - Math.round(layout.loop.h * 0.52));
      ctx.fillStyle = controlTrack;
      ctx.fillRect(layout.loop.x, loopTrackY, layout.loop.w, loopTrackH);
      if (loopStart !== null && loopEnd !== null) {
        const loopX1 = timeToX(loopStart, 0, duration, layout.loop);
        const loopX2 = timeToX(loopEnd, 0, duration, layout.loop);
        ctx.fillStyle = loopFill;
        ctx.fillRect(loopX1, loopTrackY, Math.max(1, loopX2 - loopX1), loopTrackH);
        ctx.strokeStyle = loopStroke;
        ctx.lineWidth = dpr;
        ctx.strokeRect(loopX1, loopTrackY - 0.5 * dpr, Math.max(1, loopX2 - loopX1), Math.max(1, loopTrackH + dpr));
        drawControlHandle(layout.loop, loopX1, loopFill, loopStroke);
        drawControlHandle(layout.loop, loopX2, loopFill, loopStroke);
      }
      drawPlayCursor(layout.loop, 0, duration, false);

      drawTimeGrid(layout.detail, viewRange.start, viewRange.end, false);
      const coveredDetailColumns = detailRenderMode === 'sample'
        ? drawSampleWindow(
            layout.detail,
            viewRange.start,
            viewRange.end,
          )
        : (() => {
            const envelopeBlend = Math.max(0, 1 - eventBlend);
            const eventLayerBlend = eventBlend;
            let covered = 0;

            if (envelopeBlend > 0.001) {
              covered = drawEnvelopeWindow(
                layout.detail,
                viewRange.start,
                viewRange.end,
                {
                  emphasizeCoverage: true,
                  showClipMap: !isStreamedOverview,
                  fillPlayback: true,
                  confidenceProfile: 'detail',
                  clearBackground: true,
                  overlayDecorations: false,
                  layerAlpha: Math.max(0.3, envelopeBlend),
                },
                {
                  level: detailLevel,
                  peakNormalizer,
                },
              );
            }

            if (eventLayerBlend > 0.001) {
              covered = Math.max(
                covered,
                drawEventWindow(
                  layout.detail,
                  viewRange.start,
                  viewRange.end,
                  {
                    clearBackground: envelopeBlend <= 0.001,
                    overlayDecorations: false,
                    layerAlpha: eventLayerBlend,
                    forceScaffoldPresentation: eventSourceLevel !== detailLevel,
                    fillPlayback: true,
                  },
                  {
                    level: eventSourceLevel,
                  },
                ),
              );
            }

            drawDetailDecorations(layout.detail, viewRange.start, viewRange.end, true);
            return covered;
          })();

      ctx.font = `${laneLabelFontPx * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(isStreamedOverview ? 'SESSION MAP / COARSE' : 'SESSION MAP', SPACING.sm * dpr, layout.session.y + laneLabelTopInset);
      ctx.fillText('VIEW WINDOW', SPACING.sm * dpr, layout.view.y + Math.max(dpr, laneLabelTopInset - 3 * dpr));
      ctx.fillText(loopStart !== null && loopEnd !== null ? 'LOOP REGION' : 'LOOP DRAG TO SET', SPACING.sm * dpr, layout.loop.y + Math.max(dpr, laneLabelTopInset - 3 * dpr));
      const detailModeLabel = detailRenderMode === 'sample'
        ? 'DETAIL SAMPLE'
        : detailRenderMode === 'event'
        ? 'DETAIL EVENT / DB'
        : 'DETAIL ENVELOPE';
      ctx.fillText(
        `${detailModeLabel} ${formatSpan(viewRange.end - viewRange.start)}`,
        SPACING.sm * dpr,
        layout.detail.y + laneLabelTopInset,
      );

      ctx.textAlign = 'left';
      ctx.fillText(fmtTime(viewRange.start), SPACING.sm * dpr, layout.detail.y + detailTimeInset);
      ctx.textAlign = 'right';
      ctx.fillText(fmtTime(viewRange.end), width - SPACING.sm * dpr, layout.detail.y + detailTimeInset);

      if (analysis) {
        const dr = analysis.crestFactorDb;
        const drColor =
          dr >= 12 ? COLORS.statusOk :
          dr >= 8 ? COLORS.statusWarn :
          COLORS.statusErr;
        const clipText = analysis.clipCount > 0 ? `${analysis.clipCount} CLIPS` : 'CLEAN';
        const clipColor = analysis.clipCount > 0 ? COLORS.statusErr : COLORS.statusOk;
        drawBadge(ctx, `DR ${dr.toFixed(1)} dB`, drColor, badgeX, layout.session.y + 4 * dpr, dpr, badgeBackground);
        drawBadge(ctx, clipText, clipColor, badgeX, layout.session.y + 19 * dpr, dpr, badgeBackground);
      } else if (isStreamedOverview) {
        const liveColor = amber ? CANVAS.amber.trace : hyper ? CANVAS.hyper.trace : optic ? CANVAS.optic.trace : red ? CANVAS.red.trace : eva ? CANVAS.eva.trace : COLORS.borderHighlight;
        drawBadge(ctx, 'COARSE MAP', liveColor, badgeX, layout.session.y + 4 * dpr, dpr, badgeBackground);
        drawBadge(ctx, `${Math.round(learnedRatio * 100)}% MAPPED`, amber ? CANVAS.amber.text : optic ? CANVAS.optic.text : red ? CANVAS.red.text : COLORS.textTitle, badgeX, layout.session.y + 19 * dpr, dpr, badgeBackground);
      }

      drawBadge(ctx, `VIEW ${formatSpan(viewRange.end - viewRange.start)}`, amber ? CANVAS.amber.category : optic ? CANVAS.optic.category : red ? CANVAS.red.category : COLORS.textSecondary, badgeX, layout.view.y + 1 * dpr, dpr, badgeBackground);
      if (loopStart !== null && loopEnd !== null) {
        drawBadge(ctx, `LOOP ${formatSpan(loopEnd - loopStart)}`, loopStroke, badgeX, layout.loop.y + 1 * dpr, dpr, badgeBackground);
      } else {
        drawBadge(ctx, 'DBL-CLICK CLEAR / DRAG TO SET', amber ? CANVAS.amber.label : optic ? CANVAS.optic.label : red ? CANVAS.red.label : COLORS.textDim, badgeX, layout.loop.y + 1 * dpr, dpr, badgeBackground);
      }
      if (rangeMarksRef.current.length > 0) {
        drawBadge(ctx, `RANGES ${rangeMarksRef.current.length}`, amber ? CANVAS.amber.trace : optic ? CANVAS.optic.trace : red ? CANVAS.red.trace : COLORS.borderActive, badgeX, layout.detail.y + 4 * dpr, dpr, badgeBackground);
      } else if (pendingRangeStartRef.current !== null) {
        drawBadge(ctx, `IN ${formatTransportTime(pendingRangeStartRef.current)}`, amber ? CANVAS.amber.trace : optic ? CANVAS.optic.trace : red ? CANVAS.red.trace : COLORS.borderActive, badgeX, layout.detail.y + 4 * dpr, dpr, badgeBackground);
      }

      const centroid = centroidRef.current;
      if (centroid > 0) {
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`CENT ${Math.round(centroid)} Hz`, width - SPACING.sm * dpr, layout.detail.y + layout.detail.h - 4 * dpr);
      }

      if (isStreamedOverview && coveredDetailColumns === 0) {
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DETAIL MAP REFINES AROUND PLAYBACK AND SEEK TARGETS', width / 2, layout.detail.y + layout.detail.h / 2);
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [audioEngine, displayMode, theaterMode, waveformPyramid]);

  return (
    <div style={{ ...panelStyle, background: amber ? CANVAS.amber.bg2 : optic ? CANVAS.optic.bg2 : red ? CANVAS.red.bg2 : panelStyle.background }}>
      <div
        style={{
          ...scrubToolbarStyle,
          borderBottom: amber ? '1px solid rgba(102,70,20,0.68)' : optic ? '1px solid rgba(109,146,165,0.68)' : red ? '1px solid rgba(124,40,39,0.68)' : scrubToolbarStyle.borderBottom,
          background: amber ? 'linear-gradient(180deg, rgba(18,12,4,0.99), rgba(30,20,6,0.99))' : optic ? 'linear-gradient(180deg, rgba(246,250,252,0.99), rgba(235,242,247,0.99))' : red ? 'linear-gradient(180deg, rgba(18,6,7,0.99), rgba(30,10,11,0.99))' : scrubToolbarStyle.background,
        }}
      >
        <div style={scrubToolbarHeaderStyle}>
          <span style={{ ...scrubToolbarLabelStyle, color: amber ? CANVAS.amber.category : optic ? CANVAS.optic.category : red ? CANVAS.red.category : scrubToolbarLabelStyle.color }}>SCRUB</span>
          <span style={{ ...scrubToolbarValueStyle, color: amber ? 'rgba(255,194,108,0.80)' : optic ? 'rgba(63,95,114,0.84)' : red ? 'rgba(255,186,172,0.80)' : scrubToolbarValueStyle.color }}>
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
                ...(optic
                  ? {
                      color: 'rgba(51,84,102,0.88)',
                      background: 'rgba(247,250,252,0.96)',
                      borderColor: 'rgba(109,146,165,0.70)',
                    }
                  : amber
                    ? {
                        color: 'rgba(255,214,132,0.88)',
                        background: 'rgba(18,12,4,0.96)',
                        borderColor: 'rgba(102,70,20,0.70)',
                      }
                  : red
                    ? {
                        color: 'rgba(255,186,172,0.88)',
                        background: 'rgba(18,6,7,0.96)',
                        borderColor: 'rgba(124,40,39,0.70)',
                      }
                  : {}),
                ...(scrubStyle === option.value
                  ? (optic
                      ? {
                          color: CANVAS.optic.text,
                          background: 'linear-gradient(135deg, rgba(252,254,255,0.99), rgba(228,237,243,0.99))',
                          borderColor: CANVAS.optic.chromeBorderActive,
                          boxShadow: '0 0 0 1px rgba(79,134,163,0.12)',
                        }
                      : amber
                        ? {
                            color: CANVAS.amber.text,
                            background: 'linear-gradient(135deg, rgba(42,24,6,0.99), rgba(68,36,8,0.99))',
                            borderColor: CANVAS.amber.chromeBorderActive,
                            boxShadow: '0 0 0 1px rgba(255,176,48,0.14)',
                          }
                      : red
                        ? {
                            color: CANVAS.red.text,
                            background: 'linear-gradient(135deg, rgba(34,10,11,0.99), rgba(52,14,16,0.99))',
                            borderColor: CANVAS.red.chromeBorderActive,
                            boxShadow: '0 0 0 1px rgba(124,40,39,0.16)',
                          }
                      : scrubButtonActiveStyle)
                  : {}),
              }}
              onClick={() => onScrubStyleChange(option.value)}
              title={`Scrub feel: ${option.detail}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {markers.length > 0 && onClearMarkersRef.current && (
          <button
            type="button"
            style={{
              ...clearMarkersButtonStyle,
              color: amber ? 'rgba(255,194,108,0.84)' : optic ? 'rgba(50,84,102,0.84)' : red ? 'rgba(255,186,172,0.84)' : clearMarkersButtonStyle.color,
            }}
            onClick={() => onClearMarkersRef.current?.()}
            data-shell-interactive="true"
            title={`Clear all ${markers.length} marker(s)`}
          >
            CLEAR {markers.length} MARKER{markers.length !== 1 ? 'S' : ''}
          </button>
        )}
        {rangeMarks.length > 0 && onClearRangesRef.current && (
          <button
            type="button"
            style={{
              ...clearMarkersButtonStyle,
              color: amber ? 'rgba(255,214,132,0.84)' : optic ? 'rgba(50,84,102,0.84)' : red ? 'rgba(186,208,255,0.84)' : clearMarkersButtonStyle.color,
            }}
            onClick={() => onClearRangesRef.current?.()}
            data-shell-interactive="true"
            title={`Clear all ${rangeMarks.length} editorial range(s)`}
          >
            CLEAR {rangeMarks.length} RANGE{rangeMarks.length !== 1 ? 'S' : ''}
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        onPointerDown={(event) => {
          const canvas = canvasRef.current;
          if (!canvas) return;

          const rect = canvas.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;

          const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
          const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
          const duration = Math.max(0, transportRef.current.duration || audioEngine.duration);
          if (duration <= 0) return;

          const dprVal = Math.min(devicePixelRatio, PANEL_DPR_MAX);
          const layout = buildTimelineLayout(canvas.width, canvas.height, dprVal);
          const currentView = normalizeViewRange(
            viewRangeRef.current.start,
            viewRangeRef.current.end || pickDefaultViewSpan(duration),
            duration,
            Math.min(MIN_VIEWPORT_SECONDS, duration),
          );

          const selectedRangeHit = onUpdateRangeRef.current
            ? hitTestRange(x, y, layout, duration, true)
            : null;
          if (selectedRangeHit && selectedRangeHit.isSelected) {
            event.currentTarget.setPointerCapture(event.pointerId);
            const gestureTime = selectedRangeHit.timeSpace === 'detail'
              ? xToTime(x, currentView.start, currentView.end, layout.detail)
              : xToTime(x, 0, duration, layout.session);
            gestureRef.current = {
              kind: selectedRangeHit.region === 'body'
                ? 'range-pan'
                : selectedRangeHit.region === 'start'
                  ? 'range-resize-start'
                  : 'range-resize-end',
              pointerId: event.pointerId,
              anchorTime: gestureTime,
              anchorX: x,
              initialView: currentView,
              initialLoopStart: transportRef.current.loopStart,
              initialLoopEnd: transportRef.current.loopEnd,
              initialRangeStart: selectedRangeHit.rangeMark.startS,
              initialRangeEnd: selectedRangeHit.rangeMark.endS,
              rangeId: selectedRangeHit.rangeMark.id,
              timeSpace: selectedRangeHit.timeSpace,
            };
            setCanvasCursor(selectedRangeHit.region === 'body' ? 'grabbing' : 'ew-resize');
            return;
          }

          if (onSelectRangeRef.current) {
            const rangeHit = hitTestRange(x, y, layout, duration);
            if (rangeHit) {
              onSelectRangeRef.current(rangeHit.rangeMark.id);
              return;
            }
          }

          // Marker click-to-delete: check session strip before entering gesture logic
          if (onDeleteMarkerRef.current && y >= layout.session.y && y <= layout.session.y + layout.session.h) {
            const HIT_PX = 8 * dprVal;
            for (const mk of markersRef.current) {
              const mx = Math.round(timeToX(mk.time, 0, duration, layout.session));
              if (Math.abs(x - mx) <= HIT_PX) {
                onDeleteMarkerRef.current(mk.id);
                return;
              }
            }
          }
          const hit = hitTestTimeline(x, y, layout, duration);

          event.currentTarget.setPointerCapture(event.pointerId);

          switch (hit.region) {
            case 'session':
              gestureRef.current = {
                kind: 'scrub-session',
                pointerId: event.pointerId,
                anchorTime: hit.time,
                anchorX: x,
                initialView: currentView,
                initialLoopStart: transportRef.current.loopStart,
                initialLoopEnd: transportRef.current.loopEnd,
              };
              setCanvasCursor('crosshair');
              audioEngine.beginScrub();
              audioEngine.scrubTo(hit.time);
              break;
            case 'detail':
              gestureRef.current = {
                kind: 'scrub-detail',
                pointerId: event.pointerId,
                anchorTime: hit.time,
                anchorX: x,
                initialView: currentView,
                initialLoopStart: transportRef.current.loopStart,
                initialLoopEnd: transportRef.current.loopEnd,
              };
              setCanvasCursor('crosshair');
              audioEngine.beginScrub();
              audioEngine.scrubTo(hit.time);
              break;
            case 'view-start':
              gestureRef.current = {
                kind: 'view-resize-start',
                pointerId: event.pointerId,
                anchorTime: hit.time,
                anchorX: x,
                initialView: currentView,
                initialLoopStart: transportRef.current.loopStart,
                initialLoopEnd: transportRef.current.loopEnd,
              };
              setCanvasCursor('ew-resize');
              break;
            case 'view-end':
              gestureRef.current = {
                kind: 'view-resize-end',
                pointerId: event.pointerId,
                anchorTime: hit.time,
                anchorX: x,
                initialView: currentView,
                initialLoopStart: transportRef.current.loopStart,
                initialLoopEnd: transportRef.current.loopEnd,
              };
              setCanvasCursor('ew-resize');
              break;
            case 'view-body':
              gestureRef.current = {
                kind: 'view-pan',
                pointerId: event.pointerId,
                anchorTime: hit.time,
                anchorX: x,
                initialView: currentView,
                initialLoopStart: transportRef.current.loopStart,
                initialLoopEnd: transportRef.current.loopEnd,
              };
              setCanvasCursor('grabbing');
              break;
            case 'view-track': {
              const span = currentView.end - currentView.start;
              const centered = centerViewRange(hit.time, span, duration);
              setViewRange(centered, { manual: true });
              gestureRef.current = {
                kind: 'view-pan',
                pointerId: event.pointerId,
                anchorTime: hit.time,
                anchorX: x,
                initialView: centered,
                initialLoopStart: transportRef.current.loopStart,
                initialLoopEnd: transportRef.current.loopEnd,
              };
              setCanvasCursor('grabbing');
              break;
            }
            case 'loop-start':
              gestureRef.current = {
                kind: 'loop-resize-start',
                pointerId: event.pointerId,
                anchorTime: hit.time,
                anchorX: x,
                initialView: currentView,
                initialLoopStart: transportRef.current.loopStart,
                initialLoopEnd: transportRef.current.loopEnd,
              };
              setCanvasCursor('ew-resize');
              break;
            case 'loop-end':
              gestureRef.current = {
                kind: 'loop-resize-end',
                pointerId: event.pointerId,
                anchorTime: hit.time,
                anchorX: x,
                initialView: currentView,
                initialLoopStart: transportRef.current.loopStart,
                initialLoopEnd: transportRef.current.loopEnd,
              };
              setCanvasCursor('ew-resize');
              break;
            case 'detail-loop-start':
              gestureRef.current = {
                kind: 'detail-loop-resize-start',
                pointerId: event.pointerId,
                anchorTime: hit.time,
                anchorX: x,
                initialView: currentView,
                initialLoopStart: transportRef.current.loopStart,
                initialLoopEnd: transportRef.current.loopEnd,
              };
              setCanvasCursor('ew-resize');
              break;
            case 'detail-loop-end':
              gestureRef.current = {
                kind: 'detail-loop-resize-end',
                pointerId: event.pointerId,
                anchorTime: hit.time,
                anchorX: x,
                initialView: currentView,
                initialLoopStart: transportRef.current.loopStart,
                initialLoopEnd: transportRef.current.loopEnd,
              };
              setCanvasCursor('ew-resize');
              break;
            case 'loop-body':
              gestureRef.current = {
                kind: 'loop-pan',
                pointerId: event.pointerId,
                anchorTime: hit.time,
                anchorX: x,
                initialView: currentView,
                initialLoopStart: transportRef.current.loopStart,
                initialLoopEnd: transportRef.current.loopEnd,
              };
              setCanvasCursor('grabbing');
              break;
            case 'loop-track':
              gestureRef.current = {
                kind: 'loop-create',
                pointerId: event.pointerId,
                anchorTime: hit.time,
                anchorX: x,
                initialView: currentView,
                initialLoopStart: transportRef.current.loopStart,
                initialLoopEnd: transportRef.current.loopEnd,
              };
              setCanvasCursor('crosshair');
              break;
            default:
              break;
          }
        }}
        onPointerMove={(event) => {
          if (gestureRef.current) {
            updateGestureFromPointer(event);
            return;
          }
          updatePointerCursor(event);
        }}
        onPointerUp={(event) => finishPointerGesture(event)}
        onPointerCancel={() => finishPointerGesture()}
        onLostPointerCapture={() => finishPointerGesture()}
        onPointerLeave={() => {
          if (!gestureRef.current) setCanvasCursor('crosshair');
        }}
        onDoubleClick={(event) => {
          const canvas = canvasRef.current;
          if (!canvas) return;

          const rect = canvas.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;

          const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
          const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
          const duration = Math.max(0, transportRef.current.duration || audioEngine.duration);
          if (duration <= 0) return;

          const layout = buildTimelineLayout(canvas.width, canvas.height, Math.min(devicePixelRatio, PANEL_DPR_MAX));
          const hit = hitTestTimeline(x, y, layout, duration);
          if (hit.region.startsWith('view-')) {
            resetViewRange(duration);
          }
          if (hit.region.startsWith('loop-') || hit.region.startsWith('detail-loop-')) {
            audioEngine.clearLoop();
          }
        }}
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
  padding: `4px ${SPACING.sm}px`,
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
  padding: '1px 6px',
  cursor: 'pointer',
  letterSpacing: '0.08em',
  lineHeight: 1.2,
};

const scrubButtonActiveStyle: React.CSSProperties = {
  color: COLORS.textPrimary,
  background: COLORS.accentDim,
  borderColor: COLORS.borderHighlight,
};

const clearMarkersButtonStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  background: 'none',
  border: 'none',
  padding: '1px 4px',
  cursor: 'pointer',
  letterSpacing: '0.08em',
  lineHeight: 1.2,
  flexShrink: 0,
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  minHeight: 0,
  flex: 1,
  cursor: 'crosshair',
};
