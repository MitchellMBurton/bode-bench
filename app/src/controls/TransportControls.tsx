// ============================================================
// Transport Controls - ingest, play/pause/stop, seek, time readout.
// When a video file is loaded, shows a small muted preview frame.
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAudioEngine, useDiagnosticsLog, useDisplayMode, usePerformanceDiagnosticsStore, useTheaterModeStore, useVideoSyncController } from '../core/session';
import { ClipExportStrip } from './ClipExportStrip';
import { DiagnosticsLog } from './DiagnosticsLog';
import {
  decideVideoSyncDecision,
  getAdaptiveVideoSyncProfile,
  getVideoCanPlayResyncDrift,
  getPausedVideoResyncDrift,
  getVideoHardSyncMinStep,
  getVideoResumeSettleMs,
  getVideoTransportRetuneTiming,
  type VideoSyncProfile,
  VIDEO_SYNC_GRACE_MS,
  VIDEO_TRANSPORT_RECOVERY_COOLDOWN_MS,
} from '../runtime/videoSyncPolicy';
import {
  decideVideoBufferingDecision,
  decideVideoEndedDecision,
  type VideoBufferingEventKind,
} from '../runtime/videoSyncEvents';
import { parseSubtitleFile, type SubtitleCue, type SubtitleFormat } from '../runtime/subtitles';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import type { VisualMode } from '../audio/displayMode';
import type { TransportState } from '../types';
import { ReviewGlyph } from './reviewChrome';
import { getReviewButtonTone, type ReviewButtonIntent, type ReviewGlyphName } from './reviewChromeShared';

interface TransportTheme {
  btnBg: string;
  btnBorder: string;
  btnColor: string;
  btnActiveBg: string;
  btnActiveBorder: string;
  btnResetBorder: string;
  btnResetBg: string;
  panelBg: string;
  panelLabel: string;
  mutedText: string;
  secondaryText: string;
  loopBg: string;
  loopBorder: string;
  loopLabel: string;
  loopTime: string;
  loopClear: string;
  seekTrackBg: string;
  seekFillColor: string;
}

const TRANSPORT_THEMES: Record<VisualMode, TransportTheme> = {
  default: {
    btnBg: COLORS.bg3,
    btnBorder: COLORS.border,
    btnColor: COLORS.textPrimary,
    btnActiveBg: COLORS.accentDim,
    btnActiveBorder: COLORS.accent,
    btnResetBorder: COLORS.borderActive,
    btnResetBg: COLORS.bg1,
    panelBg: COLORS.bg1,
    panelLabel: COLORS.textCategory,
    mutedText: COLORS.textDim,
    secondaryText: COLORS.textSecondary,
    loopBg: 'rgba(40,120,60,0.15)',
    loopBorder: 'rgba(80,200,120,0.25)',
    loopLabel: 'rgba(80,200,120,0.80)',
    loopTime: COLORS.textSecondary,
    loopClear: 'rgba(80,200,120,0.60)',
    seekTrackBg: COLORS.bg3,
    seekFillColor: COLORS.accent,
  },
  optic: {
    btnBg: 'rgba(247,250,252,0.94)',
    btnBorder: 'rgba(109,146,165,0.76)',
    btnColor: CANVAS.optic.text,
    btnActiveBg: 'linear-gradient(135deg, rgba(252,254,255,0.99), rgba(231,239,245,0.99))',
    btnActiveBorder: '#4f86a3',
    btnResetBorder: CANVAS.optic.chromeBorderActive,
    btnResetBg: 'rgba(239,246,250,0.98)',
    panelBg: 'rgba(231,239,245,0.96)',
    panelLabel: CANVAS.optic.category,
    mutedText: 'rgba(58,82,100,0.74)',
    secondaryText: 'rgba(35,67,88,0.86)',
    loopBg: 'rgba(57,126,158,0.10)',
    loopBorder: 'rgba(79,134,163,0.42)',
    loopLabel: '#0d7e9e',
    loopTime: 'rgba(35,67,88,0.86)',
    loopClear: 'rgba(24,96,132,0.84)',
    seekTrackBg: '#d0dce3',
    seekFillColor: '#117aa5',
  },
  red: {
    btnBg: 'rgba(12,3,4,0.92)',
    btnBorder: 'rgba(124,40,39,0.62)',
    btnColor: CANVAS.red.text,
    btnActiveBg: 'rgba(34,10,11,0.96)',
    btnActiveBorder: CANVAS.red.chromeBorderActive,
    btnResetBorder: CANVAS.red.chromeBorder,
    btnResetBg: 'rgba(12,3,4,0.92)',
    panelBg: CANVAS.red.bg2,
    panelLabel: CANVAS.red.category,
    mutedText: CANVAS.red.label,
    secondaryText: 'rgba(255,186,172,0.78)',
    loopBg: 'rgba(120,24,22,0.22)',
    loopBorder: 'rgba(255,90,74,0.36)',
    loopLabel: CANVAS.red.trace,
    loopTime: 'rgba(255,186,172,0.78)',
    loopClear: 'rgba(255,132,116,0.72)',
    seekTrackBg: '#1d090a',
    seekFillColor: '#ff5a4a',
  },
  nge: {
    btnBg: 'rgba(4,10,4,0.9)',
    btnBorder: 'rgba(60,130,30,0.4)',
    btnColor: 'rgba(160,230,60,0.9)',
    btnActiveBg: 'rgba(20,50,8,0.95)',
    btnActiveBorder: 'rgba(120,200,60,0.75)',
    btnResetBorder: 'rgba(80,160,40,0.5)',
    btnResetBg: 'rgba(4,10,4,0.9)',
    panelBg: CANVAS.nge.bg2,
    panelLabel: CANVAS.nge.category,
    mutedText: CANVAS.nge.label,
    secondaryText: 'rgba(120,200,60,0.7)',
    loopBg: 'rgba(20,60,10,0.3)',
    loopBorder: 'rgba(80,200,60,0.3)',
    loopLabel: 'rgba(140,230,60,0.9)',
    loopTime: 'rgba(120,200,60,0.7)',
    loopClear: 'rgba(120,200,60,0.65)',
    seekTrackBg: 'rgba(4,12,4,0.9)',
    seekFillColor: 'rgba(100,190,30,0.88)',
  },
  hyper: {
    btnBg: 'rgba(2,5,18,0.9)',
    btnBorder: 'rgba(40,70,180,0.4)',
    btnColor: 'rgba(210,236,255,0.9)',
    btnActiveBg: 'rgba(8,18,52,0.95)',
    btnActiveBorder: 'rgba(98,200,255,0.75)',
    btnResetBorder: CANVAS.hyper.chromeBorder,
    btnResetBg: 'rgba(2,5,18,0.9)',
    panelBg: CANVAS.hyper.bg2,
    panelLabel: CANVAS.hyper.category,
    mutedText: CANVAS.hyper.label,
    secondaryText: 'rgba(112,180,255,0.75)',
    loopBg: 'rgba(10,20,60,0.3)',
    loopBorder: 'rgba(80,160,255,0.3)',
    loopLabel: CANVAS.hyper.trace,
    loopTime: 'rgba(112,180,255,0.75)',
    loopClear: 'rgba(98,200,255,0.65)',
    seekTrackBg: 'rgba(4,8,28,0.9)',
    seekFillColor: 'rgba(78,200,255,0.85)',
  },
  eva: {
    btnBg: '#0f0a24',
    btnBorder: '#2a1050',
    btnColor: 'rgba(255,180,80,0.82)',
    btnActiveBg: '#3a1070',
    btnActiveBorder: '#4a1a90',
    btnResetBorder: CANVAS.eva.chromeBorder,
    btnResetBg: '#0f0a24',
    panelBg: CANVAS.eva.bg2,
    panelLabel: CANVAS.eva.category,
    mutedText: CANVAS.eva.label,
    secondaryText: 'rgba(255,140,40,0.75)',
    loopBg: 'rgba(60,20,100,0.3)',
    loopBorder: 'rgba(170,90,255,0.3)',
    loopLabel: CANVAS.eva.trace,
    loopTime: 'rgba(255,140,40,0.75)',
    loopClear: 'rgba(255,123,0,0.65)',
    seekTrackBg: '#1a0c30',
    seekFillColor: '#ff7b00',
  },
};

const INGEST_DRAG_BACKGROUNDS: Record<VisualMode, string> = {
  default: COLORS.accentGlow,
  nge: COLORS.accentGlow,
  hyper: COLORS.accentGlow,
  eva: COLORS.accentGlow,
  optic: 'rgba(97,176,214,0.18)',
  red: 'rgba(255,90,74,0.16)',
};

const VIDEO_HEIGHT_MIN = 72;
const VIDEO_HEIGHT_DEFAULT = 220;
const VIDEO_TIME_DISPLAY_MS = 100;
const VIDEO_RATE_RAMP_STEP = 0.02;
const VIDEO_RATE_UPDATE_MIN_MS = 70;
const VIDEO_TRANSPORT_RECOVERY_DELAY_MS = 140;
const VIDEO_TRANSPORT_RECOVERY_DRIFT_S = 0.14;
const WINDOWED_VIDEO_SETTLE_MS = 900;
const WINDOWED_TRANSPORT_SETTLE_MS = 420;
const VIDEO_PLAYING_LOG_INTERVAL_MS = 6000;
const VIDEO_SETTLE_LOG_INTERVAL_MS = 7000;
const VIDEO_SCRUB_PREVIEW_INTERVAL_MS = 90;
const VIDEO_SCRUB_PREVIEW_STEP_S = 0.14;
const VIDEO_END_TAIL_S = 0.25;
const VIDEO_LARGE_DRIFT_LOG_MS = 10000;
const APP_FULLSCREEN_MARGIN_PX = 14;
const APP_FULLSCREEN_TOP_PX = 38;
const WINDOWED_MARGIN_PX = 12;
const WINDOWED_TOP_PX = 72;
const WINDOWED_MIN_WIDTH_PX = 320;
const WINDOWED_MIN_HEIGHT_PX = 180;

let _sessionVideoUrl: string | null = null;

type VideoBaseMode = 'inline' | 'window';
type VideoOverlayMode = 'theater' | 'full' | null;
type VideoViewMode = VideoBaseMode | Exclude<VideoOverlayMode, null>;
type VideoSyncIndicator = 'sync' | 'wait' | null;
type VideoRecoveryReason = 'waiting' | 'stalled' | 'drift';

interface VideoWindowRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type LoadNotice =
  | {
      readonly kind: 'compact';
      readonly tone: 'warn' | 'info';
      readonly title: string;
      readonly detail: string;
    }
  | {
      readonly kind: 'banner';
      readonly tone: 'warn';
      readonly message: string;
    };

interface SessionMediaIdentity {
  readonly filename: string | null;
  readonly mediaKey: string | null;
  readonly kind: 'audio' | 'video' | null;
}

type LoadedLayoutMode = 'empty' | 'audio' | 'video';

interface PrimaryMedia {
  readonly kind: 'audio' | 'video';
  readonly file: File;
  readonly filename: string;
  readonly sourcePath: string | null;
  readonly durationS: number;
  readonly mediaKey: string;
}

interface ExternalAudioTrack {
  readonly file: File;
  readonly filename: string;
  readonly durationS: number;
}

interface ExternalSubtitleTrack {
  readonly file: File;
  readonly filename: string;
  readonly format: SubtitleFormat;
  readonly cues: readonly SubtitleCue[];
}

type DesktopFile = File & { path?: string };

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${ms}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getDesktopSourcePath(file: File): string | null {
  const desktopFile = file as DesktopFile;
  return typeof desktopFile.path === 'string' && desktopFile.path.trim()
    ? desktopFile.path
    : null;
}

function buildPrimaryMediaKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

function getPrimaryKind(file: File): 'audio' | 'video' {
  return isVideoFile(file) ? 'video' : 'audio';
}

function getActiveSubtitleCue(track: ExternalSubtitleTrack | null, timeS: number): SubtitleCue | null {
  if (!track) return null;
  return track.cues.find((cue) => timeS >= cue.startS && timeS <= cue.endS) ?? null;
}

function describeLoadError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'EncodingError') {
      return 'The browser could not decode this media file.';
    }
    if (error.name === 'NotSupportedError') {
      return 'This media format is not supported in the current runtime.';
    }
    if (error.name === 'AbortError') {
      return 'File loading was interrupted before decode completed.';
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return 'This file could not be opened.';
}

function createCompactNotice(tone: 'warn' | 'info', title: string, detail: string): LoadNotice {
  return { kind: 'compact', tone, title, detail };
}

function createBannerNotice(message: string): LoadNotice {
  return { kind: 'banner', tone: 'warn', message };
}

function isPlaybackInterruptedError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return error.name === 'AbortError';
}

function isNearVideoEnd(video: HTMLVideoElement | null, transport: TransportState): boolean {
  if (!video) return false;
  const duration = Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : transport.duration;
  if (!Number.isFinite(duration) || duration <= 0) return false;
  return duration - Math.max(video.currentTime, transport.currentTime) <= VIDEO_END_TAIL_S;
}

function isFullFileLoopActive(transport: TransportState): boolean {
  return (
    transport.loopStart !== null &&
    transport.loopEnd !== null &&
    transport.duration > 0 &&
    transport.loopStart <= VIDEO_END_TAIL_S &&
    transport.duration - transport.loopEnd <= VIDEO_END_TAIL_S
  );
}

interface Props {
  onFileLoaded?: () => void;
  onSessionMediaChange?: (identity: SessionMediaIdentity) => void;
}

interface VideoSourceSize {
  readonly width: number;
  readonly height: number;
}

function isHighResVideo(size: VideoSourceSize | null): boolean {
  if (!size) return false;
  return size.width >= 1600 || size.height >= 900;
}

function getViewportBounds(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 720 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function getVideoAspect(size: VideoSourceSize | null): number {
  if (!size || size.width <= 0 || size.height <= 0) return 16 / 9;
  return size.width / size.height;
}

function clampWindowRect(rect: VideoWindowRect): VideoWindowRect {
  const viewport = getViewportBounds();
  const maxWidth = Math.max(WINDOWED_MIN_WIDTH_PX, viewport.width - WINDOWED_MARGIN_PX * 2);
  const maxHeight = Math.max(WINDOWED_MIN_HEIGHT_PX, viewport.height - WINDOWED_TOP_PX - WINDOWED_MARGIN_PX);
  const width = clamp(rect.width, WINDOWED_MIN_WIDTH_PX, maxWidth);
  const height = clamp(rect.height, WINDOWED_MIN_HEIGHT_PX, maxHeight);
  const x = clamp(rect.x, WINDOWED_MARGIN_PX, viewport.width - width - WINDOWED_MARGIN_PX);
  const y = clamp(rect.y, WINDOWED_TOP_PX, viewport.height - height - WINDOWED_MARGIN_PX);
  return { x, y, width, height };
}

function createDefaultWindowRect(size: VideoSourceSize | null): VideoWindowRect {
  const viewport = getViewportBounds();
  const aspect = getVideoAspect(size);
  let width = Math.min(720, Math.round(viewport.width * 0.42));
  width = clamp(width, WINDOWED_MIN_WIDTH_PX, Math.max(WINDOWED_MIN_WIDTH_PX, viewport.width - WINDOWED_MARGIN_PX * 2));
  let height = Math.round(width / aspect);
  const maxHeight = Math.max(WINDOWED_MIN_HEIGHT_PX, viewport.height - WINDOWED_TOP_PX - WINDOWED_MARGIN_PX * 2);
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.max(WINDOWED_MIN_WIDTH_PX, Math.round(height * aspect));
  }

  return clampWindowRect({
    x: Math.max(WINDOWED_MARGIN_PX, viewport.width - width - 20),
    y: WINDOWED_TOP_PX,
    width,
    height,
  });
}

function getTheaterVideoWrapStyle(size: VideoSourceSize | null): React.CSSProperties {
  const highRes = isHighResVideo(size);
  const widthCap = highRes ? 'min(76vw, 960px)' : 'min(84vw, 1180px)';
  const heightCap = highRes ? 'min(54vh, 540px)' : 'min(64vh, 664px)';

  return {
    ...videoWrapStyle,
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: widthCap,
    height: heightCap,
    zIndex: 10001,
    border: `1px solid ${COLORS.borderActive}`,
    boxShadow: '0 28px 90px rgba(0, 0, 0, 0.55)',
  };
}

function getAppFullscreenVideoWrapStyle(): React.CSSProperties {
  return {
    ...videoWrapStyle,
    position: 'fixed',
    top: APP_FULLSCREEN_TOP_PX,
    left: APP_FULLSCREEN_MARGIN_PX,
    right: APP_FULLSCREEN_MARGIN_PX,
    bottom: APP_FULLSCREEN_MARGIN_PX,
    width: `calc(100vw - ${APP_FULLSCREEN_MARGIN_PX * 2}px)`,
    height: `calc(100vh - ${APP_FULLSCREEN_TOP_PX + APP_FULLSCREEN_MARGIN_PX}px)`,
    zIndex: 10001,
    border: `1px solid ${COLORS.borderActive}`,
    boxShadow: '0 28px 90px rgba(0, 0, 0, 0.62)',
  };
}

function getWindowedVideoWrapStyle(rect: VideoWindowRect): React.CSSProperties {
  return {
    ...videoWrapStyle,
    position: 'fixed',
    top: rect.y,
    left: rect.x,
    width: rect.width,
    height: rect.height,
    zIndex: 9000,
    border: `1px solid ${COLORS.borderActive}`,
    boxShadow: '0 18px 56px rgba(0, 0, 0, 0.48)',
  };
}

function resizeWindowRectFromDrag(
  startRect: VideoWindowRect,
  pointerDeltaX: number,
  pointerDeltaY: number,
  size: VideoSourceSize | null,
): VideoWindowRect {
  const viewport = getViewportBounds();
  const aspect = getVideoAspect(size);
  const maxWidth = Math.max(
    WINDOWED_MIN_WIDTH_PX,
    viewport.width - startRect.x - WINDOWED_MARGIN_PX,
  );
  const maxHeight = Math.max(
    WINDOWED_MIN_HEIGHT_PX,
    viewport.height - startRect.y - WINDOWED_MARGIN_PX,
  );
  const minWidth = Math.max(WINDOWED_MIN_WIDTH_PX, Math.ceil(WINDOWED_MIN_HEIGHT_PX * aspect));
  const maxWidthByHeight = Math.max(WINDOWED_MIN_WIDTH_PX, Math.floor(maxHeight * aspect));
  const widthCap = Math.max(minWidth, Math.min(maxWidth, maxWidthByHeight));

  const widthFromX = startRect.width + pointerDeltaX;
  const widthFromY = startRect.width + pointerDeltaY * aspect;
  let width = Math.abs(pointerDeltaX) >= Math.abs(pointerDeltaY * aspect) ? widthFromX : widthFromY;
  width = clamp(width, minWidth, widthCap);

  let height = Math.round(width / aspect);
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * aspect);
  }
  if (height < WINDOWED_MIN_HEIGHT_PX) {
    height = WINDOWED_MIN_HEIGHT_PX;
    width = Math.round(height * aspect);
  }

  return clampWindowRect({
    x: startRect.x,
    y: startRect.y,
    width,
    height,
  });
}

export function TransportControls({
  onFileLoaded,
  onSessionMediaChange,
}: Props): React.ReactElement {
  const audioEngine = useAudioEngine();
  const diagnosticsLog = useDiagnosticsLog();
  const performanceDiagnostics = usePerformanceDiagnosticsStore();
  const theaterModeStore = useTheaterModeStore();
  const videoSyncController = useVideoSyncController();
  const displayMode = useDisplayMode();
  const visualMode = displayMode.mode;
  const tt = TRANSPORT_THEMES[visualMode];
  const renderTransportButtonLabel = (
    glyph: ReviewGlyphName,
    label: string,
    intent: ReviewButtonIntent,
  ): React.ReactElement => {
    const tone = getReviewButtonTone(visualMode, intent);
    return (
      <span style={previewTransportButtonContentStyle}>
        <ReviewGlyph name={glyph} color={tone.icon} size={11} />
        <span>{label}</span>
      </span>
    );
  };
  const [transport, setTransport] = useState<TransportState>({
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
  const transportStatusLabel = !transport.filename
    ? 'LOAD A FILE'
    : transport.isPlaying
      ? 'PLAYING'
      : transport.currentTime > 0
        ? 'PAUSED'
        : 'READY';
  const [displayCurrentTime, setDisplayCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(() => _sessionVideoUrl);
  const [videoHeight, setVideoHeight] = useState(VIDEO_HEIGHT_DEFAULT);
  const [videoResolution, setVideoResolution] = useState<string | null>(null);
  const [videoSourceSize, setVideoSourceSize] = useState<VideoSourceSize | null>(null);
  const [videoBaseMode, setVideoBaseMode] = useState<VideoBaseMode>('inline');
  const [videoOverlayMode, setVideoOverlayMode] = useState<VideoOverlayMode>(null);
  const [videoWindowRect, setVideoWindowRect] = useState<VideoWindowRect>(() => createDefaultWindowRect(null));
  const [videoSyncIndicator, setVideoSyncIndicator] = useState<VideoSyncIndicator>(null);
  const [loadNotice, setLoadNotice] = useState<LoadNotice | null>(null);
  const [loadNoticeExpanded, setLoadNoticeExpanded] = useState(false);
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [primaryMedia, setPrimaryMedia] = useState<PrimaryMedia | null>(null);
  const [externalAudio, setExternalAudio] = useState<ExternalAudioTrack | null>(null);
  const [subtitleTrack, setSubtitleTrack] = useState<ExternalSubtitleTrack | null>(null);

  const seekInputRef = useRef<HTMLInputElement>(null);
  const seekFillRef = useRef<HTMLDivElement>(null);
  const isSeekingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const alternateAudioInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const videoUrlRef = useRef<string | null>(null);
  const transportRef = useRef(transport);
  transportRef.current = transport;

  const showLoadNotice = useCallback((nextNotice: LoadNotice | null) => {
    setLoadNoticeExpanded(false);
    setLoadNotice(nextNotice);
  }, []);
  const videoResizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const lastVideoRateRef = useRef(1);
  const lastVideoRateSetAtRef = useRef(0);
  const videoEventTimesRef = useRef<Record<string, number>>({});
  const videoBaseModeRef = useRef<VideoBaseMode>('inline');
  videoBaseModeRef.current = videoBaseMode;
  const videoOverlayModeRef = useRef<VideoOverlayMode>(null);
  videoOverlayModeRef.current = videoOverlayMode;
  const videoWindowRectRef = useRef<VideoWindowRect>(videoWindowRect);
  videoWindowRectRef.current = videoWindowRect;
  const videoWindowDragRef = useRef<{ startX: number; startY: number; startRect: VideoWindowRect } | null>(null);
  const videoWindowResizeRef = useRef<{
    startX: number;
    startY: number;
    startRect: VideoWindowRect;
  } | null>(null);
  const videoWindowInteractionActiveRef = useRef(false);
  const videoWindowInteractionGraceUntilRef = useRef(0);
  const lastTransportRateRef = useRef(1);
  const lastTransportPitchRef = useRef(0);
  const videoScrubPreviewAtRef = useRef(0);
  const lastVideoTransportStateRef = useRef<TransportState | null>(null);

  const videoViewMode: VideoViewMode = videoOverlayMode ?? videoBaseMode;
  const activeSubtitleCue = getActiveSubtitleCue(subtitleTrack, displayCurrentTime);

  useEffect(() => {
    if (_sessionVideoUrl && !videoUrlRef.current) {
      videoUrlRef.current = _sessionVideoUrl;
    }
  }, []);

  const setVideoOverlayPresentation = useCallback((nextOverlay: VideoOverlayMode, shouldLog = true) => {
    const prevOverlay = videoOverlayModeRef.current;
    if (prevOverlay === nextOverlay) return;

    const wasOverlay = prevOverlay !== null;
    const isOverlay = nextOverlay !== null;
    if (isOverlay && !wasOverlay && videoBaseModeRef.current === 'inline') {
      videoBaseModeRef.current = 'window';
      setVideoBaseMode('window');
      setVideoWindowRect((prevRect) => clampWindowRect(prevRect));
    }
    videoOverlayModeRef.current = nextOverlay;
    setVideoOverlayMode(nextOverlay);
    theaterModeStore.setActive(isOverlay);

    if (!shouldLog) return;

    if (prevOverlay === 'theater') diagnosticsLog.push('theater mode off', 'info', 'video');
    if (prevOverlay === 'full') diagnosticsLog.push('in-app full screen off', 'info', 'video');
    if (!wasOverlay && isOverlay) diagnosticsLog.push('analysis surfaces suspended for video priority', 'info', 'video');
    if (wasOverlay && !isOverlay) diagnosticsLog.push('analysis surfaces restored', 'info', 'video');
    if (nextOverlay === 'theater') diagnosticsLog.push('theater mode on', 'info', 'video');
    if (nextOverlay === 'full') diagnosticsLog.push('in-app full screen on', 'info', 'video');
    if (nextOverlay === 'theater' && isHighResVideo(videoSourceSize)) {
      diagnosticsLog.push('high-res theater playback active - preview render capped for smoother decode', 'warn', 'video');
    }
    if (nextOverlay === 'full' && isHighResVideo(videoSourceSize)) {
      diagnosticsLog.push('high-res in-app full screen active - video priority mode engaged', 'warn', 'video');
    }
  }, [diagnosticsLog, theaterModeStore, videoSourceSize]);

  const setVideoBasePresentation = useCallback((nextBaseMode: VideoBaseMode, shouldLog = true) => {
    const prevBaseMode = videoBaseModeRef.current;
    const prevOverlayMode = videoOverlayModeRef.current;

    if (prevOverlayMode !== null) {
      setVideoOverlayPresentation(null, shouldLog);
    }

    if (prevBaseMode === nextBaseMode) return;

    videoBaseModeRef.current = nextBaseMode;
    setVideoBaseMode(nextBaseMode);

    if (nextBaseMode === 'window') {
      setVideoWindowRect((prevRect) => clampWindowRect(prevRect));
    }

    if (!shouldLog) return;
    if (prevBaseMode === 'window') diagnosticsLog.push('windowed mode off', 'info', 'video');
    if (nextBaseMode === 'window') diagnosticsLog.push('windowed mode on', 'info', 'video');
  }, [diagnosticsLog, setVideoOverlayPresentation]);

  const resetVideoPresentationState = useCallback(() => {
    videoOverlayModeRef.current = null;
    videoBaseModeRef.current = 'inline';
    theaterModeStore.setActive(false);
    setVideoOverlayMode(null);
    setVideoBaseMode('inline');
  }, [theaterModeStore]);

  useEffect(() => {
    if (videoOverlayMode === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setVideoOverlayPresentation(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [setVideoOverlayPresentation, videoOverlayMode]);

  const setVideoUrlSession = useCallback((url: string | null) => {
    _sessionVideoUrl = url;
    setVideoUrl(url);
  }, []);

  const setVideoHeightSession = useCallback((h: number) => {
    setVideoHeight(h);
  }, []);

  const logVideoEvent = useCallback((key: string, text: string, tone: 'dim' | 'info' | 'warn' = 'dim', minIntervalMs = 1200) => {
    const now = performance.now();
    const lastAt = videoEventTimesRef.current[key] ?? 0;
    if (now - lastAt < minIntervalMs) return;
    videoEventTimesRef.current[key] = now;
    diagnosticsLog.push(text, tone, 'video');
  }, [diagnosticsLog]);

  const getCurrentVideoSyncProfile = useCallback((highLoadVideoMode = false): VideoSyncProfile => {
    return getAdaptiveVideoSyncProfile(
      transportRef.current.playbackRate,
      transportRef.current.pitchSemitones,
      highLoadVideoMode,
    );
  }, []);

  const markVideoSyncGrace = useCallback((durationMs = VIDEO_SYNC_GRACE_MS) => {
    videoSyncController.markSyncGrace(performance.now(), durationMs);
  }, [videoSyncController]);

  const markWindowedVideoSettle = useCallback((durationMs = WINDOWED_VIDEO_SETTLE_MS) => {
    videoWindowInteractionGraceUntilRef.current = Math.max(
      videoWindowInteractionGraceUntilRef.current,
      performance.now() + durationMs,
    );
    markVideoSyncGrace(durationMs);
  }, [markVideoSyncGrace]);

  const clearVideoRecoveryTimer = useCallback(() => {
    videoSyncController.clearRecoveryTimer();
  }, [videoSyncController]);

  const resetVideoTransportSync = useCallback((preserveIndicator = false) => {
    videoSyncController.resetTransportSync();
    if (!preserveIndicator && videoSyncController.canClearIndicator(performance.now())) {
      setVideoSyncIndicator(null);
    }
  }, [videoSyncController]);

  const setVideoPlaybackRate = useCallback((rate: number, immediate = false) => {
    const video = videoRef.current;
    if (!video) return;
    const now = performance.now();
    const targetRate = Math.max(0.1, rate);
    const delta = targetRate - lastVideoRateRef.current;
    if (!immediate && Math.abs(delta) < 0.025 && now - lastVideoRateSetAtRef.current < VIDEO_RATE_UPDATE_MIN_MS) {
      return;
    }
    const nextRate = immediate || Math.abs(delta) <= VIDEO_RATE_RAMP_STEP
      ? targetRate
      : lastVideoRateRef.current + Math.sign(delta) * VIDEO_RATE_RAMP_STEP;
    if (Math.abs(lastVideoRateRef.current - nextRate) < 0.005) return;
    video.playbackRate = nextRate;
    lastVideoRateRef.current = nextRate;
    lastVideoRateSetAtRef.current = now;
  }, []);

  const hardSyncVideo = useCallback((targetTime: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(targetTime)) return;

    const nextTime = Math.max(0, targetTime);
    const highLoadVideoMode = videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null;
    const syncProfile = getCurrentVideoSyncProfile(highLoadVideoMode);
    const minHardSyncStep = getVideoHardSyncMinStep(highLoadVideoMode, syncProfile);
    if (Math.abs(video.currentTime - nextTime) <= minHardSyncStep) return;

    videoSyncController.noteHardSync(
      performance.now(),
      syncProfile.settleMs,
      transportRef.current.isPlaying,
    );
    setVideoSyncIndicator('sync');
    performanceDiagnostics.setVideoState('sync');
    video.currentTime = nextTime;
  }, [getCurrentVideoSyncProfile, performanceDiagnostics, videoSyncController]);

  const syncPausedVideoFrame = useCallback((targetTime: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(targetTime)) return;

    const highLoadVideoMode = videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null;
    const syncProfile = getCurrentVideoSyncProfile(highLoadVideoMode);
    const pausedResyncDrift = getPausedVideoResyncDrift(highLoadVideoMode, syncProfile);

    videoSyncController.setPendingPlay(false);
    video.pause();
    setVideoPlaybackRate(transportRef.current.playbackRate, true);
    resetVideoTransportSync(true);

    if (Math.abs(video.currentTime - targetTime) >= pausedResyncDrift) {
      hardSyncVideo(targetTime);
      return;
    }

    performanceDiagnostics.setVideoState('idle');
    if (videoSyncController.canClearIndicator(performance.now())) {
      setVideoSyncIndicator(null);
    }
  }, [getCurrentVideoSyncProfile, hardSyncVideo, performanceDiagnostics, resetVideoTransportSync, setVideoPlaybackRate, videoSyncController]);

  const playVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const syncProfile = getCurrentVideoSyncProfile(videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null);

    if (video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      videoSyncController.setPendingPlay(true);
      markVideoSyncGrace(syncProfile.settleMs);
      return;
    }

    videoSyncController.setPendingPlay(false);
    void video.play().catch((error: unknown) => {
      if (
        isPlaybackInterruptedError(error) ||
        video.seeking ||
        videoSyncController.shouldHoldSync(performance.now())
      ) {
        videoSyncController.setPendingPlay(transportRef.current.isPlaying);
        markVideoSyncGrace(Math.max(250, Math.round(syncProfile.settleMs * 0.5)));
        logVideoEvent('play-interrupted', 'video play deferred while seek settles', 'dim', 2500);
        return;
      }
      logVideoEvent('play-reject', 'video play request was blocked by the runtime', 'warn', 4000);
    });
  }, [getCurrentVideoSyncProfile, logVideoEvent, markVideoSyncGrace, videoSyncController]);

  const recoverVideoPlayback = useCallback((reason: VideoRecoveryReason) => {
    const video = videoRef.current;
    if (!video || !transportRef.current.isPlaying) return;
    const now = performance.now();
    if (!videoSyncController.canRecover(now, VIDEO_TRANSPORT_RECOVERY_COOLDOWN_MS)) return;
    if (videoSyncController.isSeekPending() || video.seeking || videoWindowInteractionActiveRef.current) return;

    setVideoSyncIndicator('sync');
    const targetTime = audioEngine.currentTime;
    const syncProfile = getCurrentVideoSyncProfile(videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null);
    videoSyncController.noteRecovery(now, syncProfile.settleMs);
    video.pause();
    if (Math.abs(video.currentTime - targetTime) >= VIDEO_TRANSPORT_RECOVERY_DRIFT_S) {
      videoSyncController.setSeekPending(true);
      video.currentTime = Math.max(0, targetTime);
    }
    setVideoPlaybackRate(transportRef.current.playbackRate, true);
    requestAnimationFrame(() => {
      if (!videoRef.current || !transportRef.current.isPlaying) return;
      playVideo();
    });
    const reasonLabel = reason === 'drift' ? 'drift pressure' : reason;
    performanceDiagnostics.noteVideoEvent('recover', `video preview refreshed after ${reasonLabel}`, 'info', 1600);
    logVideoEvent(`recover-${reason}`, `video preview refreshed after ${reasonLabel}`, 'dim', 2500);
  }, [audioEngine, getCurrentVideoSyncProfile, logVideoEvent, performanceDiagnostics, playVideo, setVideoPlaybackRate, videoSyncController]);

  const scheduleVideoRecovery = useCallback((reason: 'waiting' | 'stalled') => {
    videoSyncController.scheduleRecovery(VIDEO_TRANSPORT_RECOVERY_DELAY_MS, () => {
      recoverVideoPlayback(reason);
    });
  }, [recoverVideoPlayback, videoSyncController]);

  const onToggleTheater = useCallback(() => {
    setVideoOverlayPresentation(videoOverlayModeRef.current === 'theater' ? null : 'theater');
  }, [setVideoOverlayPresentation]);

  const onToggleFullscreen = useCallback(() => {
    setVideoOverlayPresentation(videoOverlayModeRef.current === 'full' ? null : 'full');
  }, [setVideoOverlayPresentation]);

  const onToggleWindowed = useCallback(() => {
    setVideoBasePresentation(videoBaseModeRef.current === 'window' ? 'inline' : 'window');
  }, [setVideoBasePresentation]);

  const clearVideoPreview = useCallback(() => {
    resetVideoPresentationState();
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    setVideoUrlSession(null);
  }, [resetVideoPresentationState, setVideoUrlSession]);

  const clearFileInput = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const clearAttachmentInputs = useCallback(() => {
    if (alternateAudioInputRef.current) alternateAudioInputRef.current.value = '';
    if (subtitleInputRef.current) subtitleInputRef.current.value = '';
  }, []);

  const publishSessionMedia = useCallback((nextMedia: PrimaryMedia | null) => {
    onSessionMediaChange?.({
      filename: nextMedia?.filename ?? null,
      mediaKey: nextMedia?.mediaKey ?? null,
      kind: nextMedia?.kind ?? null,
    });
  }, [onSessionMediaChange]);

  const onVideoMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) {
      setVideoResolution(null);
      return;
    }
    setVideoSourceSize({ width, height });
    setVideoWindowRect((prevRect) => {
      const prevAspect = prevRect.width / Math.max(prevRect.height, 1);
      const nextAspect = getVideoAspect({ width, height });
      if (Math.abs(prevAspect - nextAspect) < 0.02) {
        return clampWindowRect(prevRect);
      }
      return createDefaultWindowRect({ width, height });
    });
    const label = width >= 7680 ? '8K' : width >= 3840 ? '4K' : width >= 2560 ? '2.5K' : width >= 1920 ? '1080p' : width >= 1280 ? '720p' : `${height}p`;
    setVideoResolution(label);
    diagnosticsLog.push(`preview ${width}x${height} / ${label}`, 'info', 'video');
    if (width >= 1920 || height >= 1080) {
      diagnosticsLog.push('high-res source detected - theater preview render is capped for stability', 'warn', 'video');
    }
  }, [diagnosticsLog]);

  const onVideoResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    videoResizeRef.current = { startY: e.clientY, startH: videoHeight };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const ref = videoResizeRef.current;
      if (!ref) return;
      const next = Math.max(VIDEO_HEIGHT_MIN, ref.startH + (ev.clientY - ref.startY));
      if (videoWrapRef.current) videoWrapRef.current.style.height = `${next}px`;
    };
    const onUp = (ev: MouseEvent) => {
      const ref = videoResizeRef.current;
      videoResizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (ref) {
        const final = Math.max(VIDEO_HEIGHT_MIN, ref.startH + (ev.clientY - ref.startY));
        setVideoHeightSession(final);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [setVideoHeightSession, videoHeight]);

  const onWindowDragMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startRect = videoWindowRectRef.current;
    videoWindowInteractionActiveRef.current = true;
    markWindowedVideoSettle();
    videoWindowDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startRect,
    };
    document.body.style.cursor = 'move';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const drag = videoWindowDragRef.current;
      const wrap = videoWrapRef.current;
      if (!drag || !wrap) return;
      const nextRect = clampWindowRect({
        ...drag.startRect,
        x: drag.startRect.x + (ev.clientX - drag.startX),
        y: drag.startRect.y + (ev.clientY - drag.startY),
      });
      videoWindowInteractionGraceUntilRef.current = performance.now() + WINDOWED_VIDEO_SETTLE_MS;
      wrap.style.left = `${nextRect.x}px`;
      wrap.style.top = `${nextRect.y}px`;
    };

    const onUp = (ev: MouseEvent) => {
      const drag = videoWindowDragRef.current;
      videoWindowDragRef.current = null;
      videoWindowInteractionActiveRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!drag) return;
      const nextRect = clampWindowRect({
        ...drag.startRect,
        x: drag.startRect.x + (ev.clientX - drag.startX),
        y: drag.startRect.y + (ev.clientY - drag.startY),
      });
      setVideoWindowRect(nextRect);
      markWindowedVideoSettle();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [markWindowedVideoSettle]);

  const onWindowResizeMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startRect = videoWindowRectRef.current;
    videoWindowInteractionActiveRef.current = true;
    markWindowedVideoSettle();
    videoWindowResizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startRect,
    };
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const resize = videoWindowResizeRef.current;
      const wrap = videoWrapRef.current;
      if (!resize || !wrap) return;
      const nextRect = resizeWindowRectFromDrag(
        resize.startRect,
        ev.clientX - resize.startX,
        ev.clientY - resize.startY,
        videoSourceSize,
      );
      videoWindowInteractionGraceUntilRef.current = performance.now() + WINDOWED_VIDEO_SETTLE_MS;
      wrap.style.width = `${nextRect.width}px`;
      wrap.style.height = `${nextRect.height}px`;
    };

    const onUp = (ev: MouseEvent) => {
      const resize = videoWindowResizeRef.current;
      videoWindowResizeRef.current = null;
      videoWindowInteractionActiveRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!resize) return;
      const nextRect = resizeWindowRectFromDrag(
        resize.startRect,
        ev.clientX - resize.startX,
        ev.clientY - resize.startY,
        videoSourceSize,
      );
      setVideoWindowRect(nextRect);
      markWindowedVideoSettle();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [markWindowedVideoSettle, videoSourceSize]);

  useEffect(() => {
    return () => {
      videoWindowDragRef.current = null;
      videoWindowResizeRef.current = null;
      videoWindowInteractionActiveRef.current = false;
      clearVideoRecoveryTimer();
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [clearVideoRecoveryTimer]);

  useEffect(() => {
    if (videoBaseMode !== 'window') return;
    const onResize = () => {
      setVideoWindowRect((prevRect) => clampWindowRect(prevRect));
      markWindowedVideoSettle(600);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [markWindowedVideoSettle, videoBaseMode]);

  useEffect(() => {
    const rateChanged = Math.abs(lastTransportRateRef.current - transport.playbackRate) > 0.0001;
    const pitchChanged = Math.abs(lastTransportPitchRef.current - transport.pitchSemitones) > 0.0001;
    lastTransportRateRef.current = transport.playbackRate;
    lastTransportPitchRef.current = transport.pitchSemitones;
    if (!rateChanged && !pitchChanged) return;

    const retuneTiming = getVideoTransportRetuneTiming(transport.playbackRate, transport.pitchSemitones);
    if (videoBaseModeRef.current === 'window') {
      markWindowedVideoSettle(Math.round(WINDOWED_TRANSPORT_SETTLE_MS * retuneTiming.stressFactor));
    }
    videoSyncController.markTransportCatchup(performance.now(), retuneTiming.catchupMs);
    markVideoSyncGrace(retuneTiming.settleMs);
    if (transport.isPlaying) {
      setVideoSyncIndicator('sync');
      performanceDiagnostics.noteVideoEvent('retune', 'video retuning after transport change', 'dim', 1400);
      logVideoEvent('transport-retune', 'video preview retuning to transport change', 'dim', 1800);
    }
  }, [logVideoEvent, markVideoSyncGrace, markWindowedVideoSettle, performanceDiagnostics, transport.isPlaying, transport.pitchSemitones, transport.playbackRate, videoSyncController]);

  const onVideoCanPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const now = performance.now();
    const highLoadVideoMode = videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null;
    const syncProfile = getCurrentVideoSyncProfile(highLoadVideoMode);
    const resumeSettleMs = getVideoResumeSettleMs(syncProfile);
    videoSyncController.noteCanPlay(now, resumeSettleMs);
    const drift = audioEngine.currentTime - video.currentTime;
    const minCanPlayResyncDrift = getVideoCanPlayResyncDrift(highLoadVideoMode, syncProfile);
    const recentlyHardSynced = videoSyncController.wasHardSyncedRecently(now, 180);
    if (!recentlyHardSynced && Math.abs(drift) >= minCanPlayResyncDrift) {
      hardSyncVideo(audioEngine.currentTime);
    }
    setVideoPlaybackRate(transportRef.current.playbackRate, true);
    if (transportRef.current.isPlaying || videoSyncController.hasPendingPlay()) {
      playVideo();
    }
  }, [audioEngine, getCurrentVideoSyncProfile, hardSyncVideo, playVideo, setVideoPlaybackRate, videoSyncController]);

  const onVideoSeeking = useCallback(() => {
    setVideoSyncIndicator('sync');
    performanceDiagnostics.setVideoState('sync');
    const syncProfile = getCurrentVideoSyncProfile(videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null);
    videoSyncController.noteSeeking(performance.now(), syncProfile.settleMs);
  }, [getCurrentVideoSyncProfile, performanceDiagnostics, videoSyncController]);

  const onVideoSeeked = useCallback(() => {
    const syncProfile = getCurrentVideoSyncProfile(videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null);
    videoSyncController.noteSeeked(performance.now(), getVideoResumeSettleMs(syncProfile));
    setVideoPlaybackRate(transportRef.current.playbackRate, true);
    if (transportRef.current.isPlaying || videoSyncController.hasPendingPlay()) {
      playVideo();
    } else {
      videoSyncController.setPendingPlay(false);
      performanceDiagnostics.setVideoState('idle');
      setVideoSyncIndicator(null);
    }
  }, [getCurrentVideoSyncProfile, performanceDiagnostics, playVideo, setVideoPlaybackRate, videoSyncController]);

  const onVideoPlaying = useCallback(() => {
    if (videoSyncController.notePlaying(performance.now())) {
      setVideoSyncIndicator(null);
    }
    performanceDiagnostics.noteVideoEvent('playing', 'video preview running', 'dim', 2200);
    logVideoEvent('playing', 'video preview playing', 'info', VIDEO_PLAYING_LOG_INTERVAL_MS);
  }, [logVideoEvent, performanceDiagnostics, videoSyncController]);

  const handleVideoBufferingEvent = useCallback((kind: VideoBufferingEventKind) => {
    const video = videoRef.current;
    const now = performance.now();
    const decision = decideVideoBufferingDecision({
      shouldHoldSync: videoSyncController.shouldHoldSync(now),
      nearEnd: isNearVideoEnd(video, transportRef.current) || video?.ended === true,
      loopActive: isFullFileLoopActive(transportRef.current),
      catchupActive: videoSyncController.isCatchupActive(now),
    });

    switch (decision.kind) {
      case 'settling':
        setVideoSyncIndicator('sync');
        logVideoEvent(`${kind}-settle`, `video ${kind === 'waiting' ? 'seek settling' : 'still settling after seek'}`, 'dim', VIDEO_SETTLE_LOG_INTERVAL_MS);
        return;
      case 'loop-wrap':
        logVideoEvent('loop-wrap', 'video loop wrap', 'dim', 2000);
        return;
      case 'ended':
        logVideoEvent(`${kind}-end`, 'video preview reached end', 'dim', 2500);
        return;
      case 'wait':
        if (decision.shouldScheduleRecovery) {
          scheduleVideoRecovery(kind);
        }
        setVideoSyncIndicator('wait');
        performanceDiagnostics.noteVideoEvent(kind, `video ${kind === 'waiting' ? 'waiting for decode / buffer' : 'stalled'}`, 'warn', 1200);
        logVideoEvent(kind, `video ${kind === 'waiting' ? 'waiting for decode / buffer' : 'stalled'}`, 'warn');
        return;
      default: {
        const _exhaustive: never = decision;
        throw new Error(`unhandled video buffering decision: ${_exhaustive}`);
      }
    }
  }, [logVideoEvent, performanceDiagnostics, scheduleVideoRecovery, videoSyncController]);

  const onVideoWaiting = useCallback(() => {
    handleVideoBufferingEvent('waiting');
  }, [handleVideoBufferingEvent]);

  const onVideoStalled = useCallback(() => {
    handleVideoBufferingEvent('stalled');
  }, [handleVideoBufferingEvent]);

  const onVideoEnded = useCallback(() => {
    videoSyncController.noteEnded();
    performanceDiagnostics.setVideoState('idle');
    setVideoSyncIndicator(null);
    const endedDecision = decideVideoEndedDecision(isFullFileLoopActive(transportRef.current));
    switch (endedDecision) {
      case 'loop-wrap':
        logVideoEvent('loop-wrap', 'video loop wrap', 'dim', 2000);
        return;
      case 'ended':
        logVideoEvent('ended', 'video preview reached end', 'dim', 2500);
        return;
      default: {
        const _exhaustive: never = endedDecision;
        throw new Error(`unhandled video ended decision: ${_exhaustive}`);
      }
    }
  }, [logVideoEvent, performanceDiagnostics, videoSyncController]);

  const onVideoError = useCallback(() => {
    const code = videoRef.current?.error?.code;
    setVideoSyncIndicator('wait');
    performanceDiagnostics.noteVideoEvent('stalled', `video error${code ? ` code ${code}` : ''}`, 'warn', 1800);
    logVideoEvent('error', `video error${code ? ` code ${code}` : ''}`, 'warn', 4000);
  }, [logVideoEvent, performanceDiagnostics]);

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      setTransport(state);
      setDisplayCurrentTime(state.currentTime);
      if (!isSeekingRef.current && seekInputRef.current) {
        const input = seekInputRef.current;
        if (state.duration > 0) {
          input.max = String(state.duration);
          input.value = String(state.currentTime);
        } else {
          input.value = '0';
        }
      }
    });
  }, [audioEngine]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    const prevTransportState = lastVideoTransportStateRef.current;
    const overlayOrWindowMode = videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null;
    const syncProfile = getCurrentVideoSyncProfile(overlayOrWindowMode);

    setVideoPlaybackRate(transport.playbackRate, true);

    if (transport.scrubActive) {
      videoSyncController.setPendingPlay(false);
      performanceDiagnostics.setVideoState('scrub');
      setVideoSyncIndicator('sync');
      resetVideoTransportSync(true);
      video.pause();
      const now = performance.now();
      const shouldSyncScrubPreview =
        now - videoScrubPreviewAtRef.current >= VIDEO_SCRUB_PREVIEW_INTERVAL_MS ||
        Math.abs(video.currentTime - transport.currentTime) >= VIDEO_SCRUB_PREVIEW_STEP_S;
      if (shouldSyncScrubPreview) {
        videoScrubPreviewAtRef.current = now;
        hardSyncVideo(transport.currentTime);
      }
      lastVideoTransportStateRef.current = transport;
      return;
    }

    videoScrubPreviewAtRef.current = 0;

    if (transport.isPlaying) {
      const playStateChanged = prevTransportState?.isPlaying !== transport.isPlaying;
      const scrubStateChanged = prevTransportState?.scrubActive !== transport.scrubActive;
      const jumped = !prevTransportState || Math.abs(transport.currentTime - prevTransportState.currentTime) > 0.35;
      const rateChanged = !prevTransportState || Math.abs(transport.playbackRate - prevTransportState.playbackRate) > 0.001;
      const pitchChanged = !prevTransportState || Math.abs(transport.pitchSemitones - prevTransportState.pitchSemitones) > 0.001;

      if (playStateChanged || scrubStateChanged || jumped) {
        resetVideoTransportSync(true);
        hardSyncVideo(audioEngine.currentTime);
      } else if (rateChanged || pitchChanged) {
        markVideoSyncGrace(Math.max(220, Math.round(syncProfile.settleMs * 0.35)));
        setVideoSyncIndicator('sync');
      }
      playVideo();
    } else {
      syncPausedVideoFrame(transport.currentTime);
    }
    lastVideoTransportStateRef.current = transport;
  }, [audioEngine, getCurrentVideoSyncProfile, hardSyncVideo, markVideoSyncGrace, performanceDiagnostics, playVideo, resetVideoTransportSync, setVideoPlaybackRate, syncPausedVideoFrame, transport, videoSyncController, videoUrl]);

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      if (isSeekingRef.current) return;

      const currentTime = audioEngine.currentTime;
      const duration = audioEngine.duration;
      if (seekInputRef.current && duration > 0) {
        seekInputRef.current.value = String(currentTime);
      }
      if (seekFillRef.current && duration > 0) {
        seekFillRef.current.style.width = `${(currentTime / duration) * 100}%`;
      }

      const video = videoRef.current;
      if (!video || !videoUrl || !transportRef.current.isPlaying) return;

      const baseRate = audioEngine.playbackRate;
      const drift = currentTime - video.currentTime;
      const now = performance.now();
      const windowedVideoMode =
        videoOverlayModeRef.current === null &&
        videoBaseModeRef.current === 'window';
      const highLoadVideoMode =
        (videoOverlayModeRef.current !== null && isHighResVideo(videoSourceSize)) ||
        windowedVideoMode;
      const syncState = videoSyncController.getDecisionState(now);
      performanceDiagnostics.noteVideoTelemetry({
        driftMs: drift * 1000,
        previewRate: video.playbackRate,
        readyState: video.readyState,
        catchupActive: syncState.transportCatchupActive,
      });

      if (
        video.seeking ||
        videoSyncController.isSeekPending() ||
        videoWindowInteractionActiveRef.current ||
        now < videoWindowInteractionGraceUntilRef.current ||
        videoSyncController.isSyncGraceActive(now) ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        videoSyncController.clearPersistentDrift();
        setVideoPlaybackRate(baseRate);
        return;
      }

      if (video.ended && currentTime <= VIDEO_END_TAIL_S) {
        videoSyncController.clearPersistentDrift();
        setVideoPlaybackRate(baseRate, true);
        return;
      }

      const decision = decideVideoSyncDecision({
        drift,
        currentTime,
        baseRate,
        nowMs: now,
        playbackRate: transportRef.current.playbackRate,
        pitchSemitones: transportRef.current.pitchSemitones,
        highLoadVideoMode,
        transportCatchupActive: syncState.transportCatchupActive,
        lastHardSyncAtMs: syncState.lastHardSyncAtMs,
        lastRecoveryAtMs: syncState.lastRecoveryAtMs,
        persistentDriftSinceMs: syncState.persistentDriftSinceMs,
      });
      videoSyncController.setPersistentDriftSinceMs(decision.nextPersistentDriftSinceMs);

      switch (decision.kind) {
        case 'recover':
          recoverVideoPlayback('drift');
          return;
        case 'hard-sync':
          hardSyncVideo(decision.targetTime);
          performanceDiagnostics.noteVideoEvent('hard-sync', `hard video resync ${decision.driftMs} ms`, 'warn', 1200);
          setVideoPlaybackRate(decision.nextPlaybackRate);
          logVideoEvent(
            'hard-sync',
            Math.abs(decision.driftMs) >= VIDEO_LARGE_DRIFT_LOG_MS
              ? 'large video drift reset'
              : `hard resync ${decision.driftMs} ms`,
            'warn',
            1500,
          );
          return;
        case 'rate-trim':
          setVideoPlaybackRate(decision.nextPlaybackRate);
          return;
        case 'stable':
          if (decision.shouldClearCatchup) {
            resetVideoTransportSync();
          }
          setVideoPlaybackRate(decision.nextPlaybackRate);
          return;
        default: {
          const _exhaustive: never = decision;
          throw new Error(`unhandled video sync decision: ${_exhaustive}`);
        }
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [audioEngine, hardSyncVideo, logVideoEvent, performanceDiagnostics, recoverVideoPlayback, resetVideoTransportSync, setVideoPlaybackRate, videoSourceSize, videoSyncController, videoUrl]);

  useEffect(() => {
    if (!transport.isPlaying) return;
    const id = setInterval(() => {
      if (!isSeekingRef.current) {
        setDisplayCurrentTime(audioEngine.currentTime);
      }
    }, VIDEO_TIME_DISPLAY_MS);
    return () => clearInterval(id);
  }, [audioEngine, transport.isPlaying]);

  useEffect(() => {
    return () => {
      const url = videoUrlRef.current;
      if (url && url !== _sessionVideoUrl) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  useEffect(() => {
    return audioEngine.onReset(() => {
      clearVideoPreview();
      clearFileInput();
      clearAttachmentInputs();
      showLoadNotice(null);
      setVideoResolution(null);
      setVideoSourceSize(null);
      setDisplayCurrentTime(0);
      setSourcePath(null);
      setPrimaryMedia(null);
      setExternalAudio(null);
      setSubtitleTrack(null);
      publishSessionMedia(null);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        videoRef.current.playbackRate = 1;
      }
      lastVideoRateRef.current = 1;
      lastVideoRateSetAtRef.current = 0;
      videoEventTimesRef.current = {};
      videoSyncController.reset();
      performanceDiagnostics.setVideoState('idle');
      setVideoSyncIndicator(null);
    });
  }, [audioEngine, clearAttachmentInputs, clearFileInput, clearVideoPreview, performanceDiagnostics, publishSessionMedia, showLoadNotice, videoSyncController]);

  const loadPrimaryMedia = useCallback(async (file: File) => {
    const nextSourcePath = getDesktopSourcePath(file);
    clearVideoPreview();
    setVideoResolution(null);
    setVideoSourceSize(null);
    showLoadNotice(null);
    setSourcePath(null);
    clearAttachmentInputs();
    setPrimaryMedia(null);
    setExternalAudio(null);
    setSubtitleTrack(null);
    publishSessionMedia(null);
    videoEventTimesRef.current = {};
    lastVideoRateRef.current = 1;
    lastVideoRateSetAtRef.current = 0;
    videoSyncController.reset();
    performanceDiagnostics.setVideoState('idle');
    setVideoSyncIndicator(null);

    if (isVideoFile(file)) {
      const url = URL.createObjectURL(file);
      videoUrlRef.current = url;
      setVideoUrlSession(url);
      diagnosticsLog.push(`preview source attached for ${file.name}`, 'info', 'video');
    }

    setIsLoading(true);
    try {
      await audioEngine.load(file);
      const nextPrimaryMedia: PrimaryMedia = {
        kind: getPrimaryKind(file),
        file,
        filename: file.name,
        sourcePath: nextSourcePath,
        durationS: audioEngine.duration,
        mediaKey: buildPrimaryMediaKey(file),
      };
      setPrimaryMedia(nextPrimaryMedia);
      publishSessionMedia(nextPrimaryMedia);
      setSourcePath(nextSourcePath);
      if (audioEngine.backendMode === 'streamed') {
        showLoadNotice(createCompactNotice(
          'info',
          'LARGE MEDIA MODE ACTIVE',
          'Streamed playback is enabled for stability. Pitch shift stays live, the session map fills at low resolution, and the detail waveform plus waveform history learn as you play and seek.',
        ));
      } else {
        showLoadNotice(null);
      }
      onFileLoaded?.();
    } catch (error) {
      const message = describeLoadError(error);
      clearVideoPreview();
      setSourcePath(null);
      setPrimaryMedia(null);
      setExternalAudio(null);
      setSubtitleTrack(null);
      publishSessionMedia(null);
      showLoadNotice(createBannerNotice(message));
      diagnosticsLog.push(`load failed for ${file.name} - ${message}`, 'warn', 'transport');
      console.error('media load failed', error);
    } finally {
      clearFileInput();
      setIsLoading(false);
    }
  }, [audioEngine, clearAttachmentInputs, clearFileInput, clearVideoPreview, diagnosticsLog, onFileLoaded, performanceDiagnostics, publishSessionMedia, setVideoUrlSession, showLoadNotice, videoSyncController]);

  const loadAlternateAudio = useCallback(async (file: File) => {
    if (!primaryMedia || primaryMedia.kind !== 'video') {
      return;
    }

    setIsLoading(true);
    showLoadNotice(null);
    setDisplayCurrentTime(0);
    videoEventTimesRef.current = {};
    lastVideoRateRef.current = 1;
    lastVideoRateSetAtRef.current = 0;
    videoSyncController.reset();
    performanceDiagnostics.setVideoState('idle');
    setVideoSyncIndicator(null);

    try {
      await audioEngine.load(file, primaryMedia.filename);
      const nextAudio: ExternalAudioTrack = {
        file,
        filename: file.name,
        durationS: audioEngine.duration,
      };
      setExternalAudio(nextAudio);
      setSourcePath(primaryMedia.sourcePath);
      if (Math.abs(nextAudio.durationS - primaryMedia.durationS) > 0.75) {
        showLoadNotice(createCompactNotice(
          'warn',
          'EXTERNAL AUDIO ATTACHED',
          'Duration differs from the original media. Playback now follows the attached audio track, while export still uses the original media file.',
        ));
      } else {
        showLoadNotice(createCompactNotice(
          'info',
          'EXTERNAL AUDIO ATTACHED',
          'Playback now follows the attached track while export still uses the original media file.',
        ));
      }
      diagnosticsLog.push(`external audio attached ${file.name}`, 'info', 'transport');
      onFileLoaded?.();
    } catch (error) {
      const message = describeLoadError(error);
      showLoadNotice(createBannerNotice(message));
      diagnosticsLog.push(`external audio failed ${file.name} - ${message}`, 'warn', 'transport');
      console.error('external audio failed', error);
    } finally {
      if (alternateAudioInputRef.current) alternateAudioInputRef.current.value = '';
      setIsLoading(false);
    }
  }, [audioEngine, diagnosticsLog, onFileLoaded, performanceDiagnostics, primaryMedia, showLoadNotice, videoSyncController]);

  const restorePrimaryAudio = useCallback(async () => {
    if (!primaryMedia) {
      return;
    }

    setIsLoading(true);
    showLoadNotice(null);
    setDisplayCurrentTime(0);
    videoEventTimesRef.current = {};
    lastVideoRateRef.current = 1;
    lastVideoRateSetAtRef.current = 0;
    videoSyncController.reset();
    performanceDiagnostics.setVideoState('idle');
    setVideoSyncIndicator(null);

    try {
      await audioEngine.load(primaryMedia.file, primaryMedia.filename);
      const restoredPrimaryMedia: PrimaryMedia = {
        ...primaryMedia,
        durationS: audioEngine.duration,
      };
      setPrimaryMedia(restoredPrimaryMedia);
      publishSessionMedia(restoredPrimaryMedia);
      setExternalAudio(null);
      setSourcePath(primaryMedia.sourcePath);
      if (audioEngine.backendMode === 'streamed') {
        showLoadNotice(createCompactNotice(
          'info',
          'ORIGINAL AUDIO RESTORED',
          'Large media mode stays active. Playback is stable and the session map continues to fill as you play.',
        ));
      } else {
        showLoadNotice(createCompactNotice(
          'info',
          'ORIGINAL AUDIO RESTORED',
          'Playback is back on the source media track.',
        ));
      }
      diagnosticsLog.push('external audio cleared', 'info', 'transport');
      onFileLoaded?.();
    } catch (error) {
      const message = describeLoadError(error);
      showLoadNotice(createBannerNotice(message));
      diagnosticsLog.push(`restore original audio failed - ${message}`, 'warn', 'transport');
      console.error('restore original audio failed', error);
    } finally {
      if (alternateAudioInputRef.current) alternateAudioInputRef.current.value = '';
      setIsLoading(false);
    }
  }, [audioEngine, diagnosticsLog, onFileLoaded, performanceDiagnostics, primaryMedia, publishSessionMedia, showLoadNotice, videoSyncController]);

  const loadSubtitleTrack = useCallback(async (file: File) => {
    if (!primaryMedia || primaryMedia.kind !== 'video') {
      return;
    }

    try {
      const parsed = parseSubtitleFile(file.name, await file.text());
      setSubtitleTrack({
        file,
        filename: file.name,
        format: parsed.format,
        cues: parsed.cues,
      });
      showLoadNotice(createCompactNotice(
        parsed.cues.length > 0 ? 'info' : 'warn',
        parsed.cues.length > 0 ? 'SUBTITLES ATTACHED' : 'SUBTITLE FILE HAS NO CUES',
        parsed.cues.length > 0
          ? 'External subtitles are active for playback.'
          : 'The file loaded successfully, but it did not contain any usable subtitle cues.',
      ));
      diagnosticsLog.push(`subtitles attached ${file.name}`, 'info', 'video');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Subtitles could not be loaded.';
      showLoadNotice(createBannerNotice(message));
      diagnosticsLog.push(`subtitle load failed ${file.name} - ${message}`, 'warn', 'video');
      console.error('subtitle load failed', error);
    } finally {
      if (subtitleInputRef.current) subtitleInputRef.current.value = '';
    }
  }, [diagnosticsLog, primaryMedia, showLoadNotice]);

  const clearSubtitleTrack = useCallback(() => {
    setSubtitleTrack(null);
    if (subtitleInputRef.current) subtitleInputRef.current.value = '';
    diagnosticsLog.push('subtitles cleared', 'dim', 'video');
  }, [diagnosticsLog]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void loadPrimaryMedia(file);
  }, [loadPrimaryMedia]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void loadPrimaryMedia(file);
  }, [loadPrimaryMedia]);

  const onAlternateAudioInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void loadAlternateAudio(file);
  }, [loadAlternateAudio]);

  const onSubtitleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void loadSubtitleTrack(file);
  }, [loadSubtitleTrack]);

  const onSeekPointerDown = useCallback(() => {
    isSeekingRef.current = true;
    if (transportRef.current.duration === 0) return;
    audioEngine.beginScrub();
  }, [audioEngine]);

  const onSeekPointerUp = useCallback(() => {
    if (!isSeekingRef.current) return;
    isSeekingRef.current = false;
    const input = seekInputRef.current;
    if (!input || transportRef.current.duration === 0) return;
    const seekTo = parseFloat(input.value);
    setDisplayCurrentTime(seekTo);
    audioEngine.scrubTo(seekTo);
    audioEngine.endScrub();
    hardSyncVideo(seekTo);
    setVideoPlaybackRate(audioEngine.playbackRate, true);
  }, [audioEngine, hardSyncVideo, setVideoPlaybackRate]);

  const onSeekInput = useCallback(() => {
    const input = seekInputRef.current;
    const fill = seekFillRef.current;
    if (!input || !fill || transportRef.current.duration === 0) return;
    const seekTo = parseFloat(input.value);
    const fraction = seekTo / transportRef.current.duration;
    fill.style.width = `${fraction * 100}%`;
    setDisplayCurrentTime(seekTo);
    if (isSeekingRef.current) {
      audioEngine.scrubTo(seekTo);
    } else {
      audioEngine.seek(seekTo);
      hardSyncVideo(seekTo);
    }
  }, [audioEngine, hardSyncVideo]);

  const seekFraction = transport.duration > 0 ? displayCurrentTime / transport.duration : 0;
  const videoOverlayActive = videoOverlayMode !== null;
  const showTheaterHint = videoOverlayMode === 'theater';
  const showFullscreenHint = videoOverlayMode === 'full';
  const showWindowHint = videoViewMode === 'window';
  const sessionFilename = primaryMedia?.filename ?? transport.filename;
  const sessionDurationS = primaryMedia?.durationS ?? transport.duration;
  const loadedLayoutMode: LoadedLayoutMode = primaryMedia?.kind ?? (transport.filename ? 'audio' : 'empty');
  const clipSourceKind = loadedLayoutMode === 'video' ? 'video' : 'audio';
  const canAttachLinkedTracks = loadedLayoutMode === 'video';
  const openMediaHint = sessionFilename ? 'REPLACE' : 'PRIMARY';
  const audioRouteHint = externalAudio ? 'RESTORE' : canAttachLinkedTracks ? 'ATTACH' : 'VIDEO ONLY';
  const subtitleRouteHint = subtitleTrack ? 'REMOVE' : canAttachLinkedTracks ? 'ATTACH' : 'VIDEO ONLY';
  const videoWindowHint = videoUrl ? (videoViewMode === 'inline' ? 'DOCKED' : 'WINDOWED') : loadedLayoutMode === 'audio' ? 'AUDIO ONLY' : 'NONE';
  const audioStatusText = externalAudio ? 'ATTACHED' : primaryMedia ? 'ORIGINAL' : 'NONE';
  const subtitleStatusText = subtitleTrack ? 'ACTIVE' : canAttachLinkedTracks ? 'NONE' : 'N/A';
  const viewStatusText = videoUrl ? (videoViewMode === 'inline' ? 'DOCKED' : 'WINDOWED') : loadedLayoutMode === 'audio' ? 'AUDIO ONLY' : 'NONE';
  const ingestLabel = isLoading
    ? 'DECODING...'
    : sessionFilename
      ? 'DROP TO REPLACE / CLICK TO OPEN'
      : 'DROP AUDIO / VIDEO - OR CLICK TO OPEN';

  return (
    <div style={wrapStyle}>
      <div style={{ ...deckStyle, borderColor: tt.btnBorder, background: tt.panelBg }}>
        <div style={deckHeaderStyle}>
          <span style={{ ...deckEyebrowStyle, color: tt.panelLabel }}>TOP CONTROL DECK</span>
          <div style={deckHeaderActionsStyle}>
            <span style={{ ...deckMetaStyle, color: sessionFilename ? tt.btnColor : tt.mutedText }}>
              {transportStatusLabel}
            </span>
            <button
              style={{
                ...topControlResetButtonStyle,
                background: tt.btnResetBg,
                borderColor: tt.btnResetBorder,
                color: tt.btnColor,
              }}
              onClick={() => audioEngine.reset()}
              disabled={isLoading || !transport.filename}
              title="Reset - clear file and all visuals"
            >
              RESET
            </button>
          </div>
        </div>

        <div style={topControlGridStyle}>
          <button
            style={{
              ...topControlButtonStyle,
              ...topControlPrimaryButtonStyle,
              background: tt.panelBg,
              borderColor: tt.btnActiveBorder,
              color: tt.btnColor,
            }}
            onClick={() => {
              clearFileInput();
              fileInputRef.current?.click();
            }}
            disabled={isLoading}
            title="Open or replace the main media file"
          >
            <span style={topControlLabelStyle}>OPEN MEDIA</span>
            <span style={{ ...topControlHintStyle, color: tt.mutedText }}>{openMediaHint}</span>
          </button>
          <button
            style={{
              ...topControlButtonStyle,
              background: externalAudio ? tt.btnActiveBg : tt.btnBg,
              borderColor: externalAudio ? tt.btnActiveBorder : tt.btnBorder,
              color: tt.btnColor,
            }}
            onClick={() => {
              if (externalAudio) {
                void restorePrimaryAudio();
                return;
              }
              if (!canAttachLinkedTracks) {
                return;
              }
              if (alternateAudioInputRef.current) alternateAudioInputRef.current.value = '';
              alternateAudioInputRef.current?.click();
            }}
            disabled={isLoading || (!externalAudio && !canAttachLinkedTracks)}
            title={externalAudio ? 'Restore the original media audio track' : 'Attach an alternate audio file for playback'}
          >
            <span style={topControlLabelStyle}>ALT AUDIO</span>
            <span style={{ ...topControlHintStyle, color: tt.mutedText }}>{audioRouteHint}</span>
          </button>
          <button
            style={{
              ...topControlButtonStyle,
              background: subtitleTrack ? tt.btnActiveBg : tt.btnBg,
              borderColor: subtitleTrack ? tt.btnActiveBorder : tt.btnBorder,
              color: tt.btnColor,
            }}
            onClick={() => {
              if (subtitleTrack) {
                clearSubtitleTrack();
                return;
              }
              if (!canAttachLinkedTracks) {
                return;
              }
              if (subtitleInputRef.current) subtitleInputRef.current.value = '';
              subtitleInputRef.current?.click();
            }}
            disabled={isLoading || (!subtitleTrack && !canAttachLinkedTracks)}
            title={subtitleTrack ? 'Clear the current subtitle file' : 'Attach a subtitle file'}
          >
            <span style={topControlLabelStyle}>SUBTITLES</span>
            <span style={{ ...topControlHintStyle, color: tt.mutedText }}>{subtitleRouteHint}</span>
          </button>
          <button
            style={{
              ...topControlButtonStyle,
              background: videoViewMode !== 'inline' ? tt.btnActiveBg : tt.btnBg,
              borderColor: videoViewMode !== 'inline' ? tt.btnActiveBorder : tt.btnBorder,
              color: tt.btnColor,
            }}
            onClick={onToggleWindowed}
            disabled={isLoading || !videoUrl}
            title={videoViewMode === 'inline' ? 'Open the video in a movable window' : 'Dock the video back into the session console'}
          >
            <span style={topControlLabelStyle}>VIDEO WINDOW</span>
            <span style={{ ...topControlHintStyle, color: tt.mutedText }}>{videoWindowHint}</span>
          </button>
        </div>

        <div style={topStatusGridStyle}>
          <div style={{ ...topStatusCellStyle, alignItems: 'center', borderColor: tt.btnBorder, background: tt.panelBg, flex: '1 1 188px' }}>
            <span style={{ ...topStatusValueStyle, color: sessionFilename ? tt.btnColor : tt.mutedText }}>
              {sessionFilename ?? 'NONE'}
            </span>
          </div>
          <div style={{ ...topStatusCellStyle, borderColor: tt.btnBorder, background: tt.panelBg }}>
            <span style={{ ...topStatusLabelStyle, color: tt.panelLabel }}>AUDIO</span>
            <span style={{ ...topStatusValueStyle, color: primaryMedia ? tt.btnColor : tt.mutedText }}>
              {audioStatusText}
            </span>
          </div>
          <div style={{ ...topStatusCellStyle, borderColor: tt.btnBorder, background: tt.panelBg }}>
            <span style={{ ...topStatusLabelStyle, color: tt.panelLabel }}>SUBS</span>
            <span style={{ ...topStatusValueStyle, color: subtitleTrack || canAttachLinkedTracks ? tt.btnColor : tt.mutedText }}>
              {subtitleStatusText}
            </span>
          </div>
          <div style={{ ...topStatusCellStyle, borderColor: tt.btnBorder, background: tt.panelBg }}>
            <span style={{ ...topStatusLabelStyle, color: tt.panelLabel }}>VIEW</span>
            <span style={{ ...topStatusValueStyle, color: videoUrl || loadedLayoutMode === 'audio' ? tt.btnColor : tt.mutedText }}>
              {viewStatusText}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          ...ingestStyle,
          ...(sessionFilename ? loadedIngestStyle : null),
          borderColor: isDragging ? tt.seekFillColor : tt.btnBorder,
          background: isDragging ? INGEST_DRAG_BACKGROUNDS[visualMode] : tt.btnBg,
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => {
          clearFileInput();
          fileInputRef.current?.click();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*"
          style={{ display: 'none' }}
          onChange={onFileInput}
        />
        <input
          ref={alternateAudioInputRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={onAlternateAudioInput}
        />
        <input
          ref={subtitleInputRef}
          type="file"
          accept=".srt,.vtt,text/vtt,application/x-subrip"
          style={{ display: 'none' }}
          onChange={onSubtitleInput}
        />
        <span style={{ ...ingestTextStyle, color: tt.btnColor }} title={sessionFilename ?? undefined}>
          {ingestLabel}
        </span>
      </div>

      {loadNotice ? (
        loadNotice.kind === 'compact' ? (
          <div
            style={{
              ...compactNoticeStyle,
              ...COMPACT_NOTICE_THEMES[loadNotice.tone][visualMode],
            }}
          >
            <div style={compactNoticeHeaderStyle}>
              <span style={{ ...compactNoticeTitleStyle, color: tt.btnColor }}>{loadNotice.title}</span>
              <div style={compactNoticeActionsStyle}>
                <button
                  style={{ ...compactNoticeButtonStyle, borderColor: tt.btnBorder, color: tt.btnColor }}
                  onClick={() => setLoadNoticeExpanded((open) => !open)}
                  title={loadNoticeExpanded ? 'Hide details' : 'Show details'}
                >
                  {loadNoticeExpanded ? 'HIDE' : 'DETAILS'}
                </button>
                <button
                  style={{ ...compactNoticeButtonStyle, borderColor: tt.btnBorder, color: tt.btnColor }}
                  onClick={() => showLoadNotice(null)}
                  title="Dismiss status"
                >
                  X
                </button>
              </div>
            </div>
            {loadNoticeExpanded ? (
              <div style={{ ...compactNoticeDetailStyle, color: tt.secondaryText }}>{loadNotice.detail}</div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              ...loadNoticeStyle,
              ...LOAD_NOTICE_THEMES[loadNotice.tone][visualMode],
            }}
          >
            <span style={{ ...loadNoticeMessageStyle, color: tt.btnColor }}>{loadNotice.message}</span>
            <button
              style={{ ...loadNoticeDismissStyle, borderColor: tt.btnBorder, color: tt.btnColor }}
              onClick={() => showLoadNotice(null)}
              title="Dismiss message"
            >
              X
            </button>
          </div>
        )
      ) : null}

      {videoUrl && (
        <div
          style={videoOverlayActive ? theaterBackdropStyle : hiddenTheaterBackdropStyle}
          onClick={videoOverlayActive ? () => setVideoOverlayPresentation(null) : undefined}
        />
      )}

      <div style={videoUrl ? sessionStageWithPreviewStyle : sessionStageSingleStyle}>
        <div style={{ ...deckStyle, borderColor: tt.btnBorder, background: tt.panelBg }}>
          <div style={deckHeaderStyle}>
            <span style={{ ...deckEyebrowStyle, color: tt.panelLabel }}>TRANSPORT POSITION</span>
            <span style={{ ...deckMetaStyle, color: transport.filename ? tt.btnColor : tt.mutedText }}>
              {transportStatusLabel}
            </span>
          </div>

          <div style={timeRowStyle}>
            <span style={{ ...timeStyle, color: tt.btnColor }}>{formatTime(displayCurrentTime)}</span>
            <span style={timeSepStyle}>/</span>
            <span style={{ ...timeStyle, color: tt.secondaryText }}>{formatTime(transport.duration)}</span>
          </div>

          <div style={{ ...seekTrackStyle, background: tt.seekTrackBg }}>
            <div
              ref={seekFillRef}
              style={{ ...seekFillStyle, width: `${seekFraction * 100}%`, background: tt.seekFillColor }}
            />
            <input
              ref={seekInputRef}
              type="range"
              min={0}
              defaultValue={0}
              step={0.01}
              style={seekInputStyle}
              disabled={isLoading || transport.duration === 0}
              onPointerDown={onSeekPointerDown}
              onPointerUp={onSeekPointerUp}
              onPointerCancel={onSeekPointerUp}
              onLostPointerCapture={onSeekPointerUp}
              onInput={onSeekInput}
            />
          </div>

          {transport.loopStart !== null && transport.loopEnd !== null ? (
            <div style={{ ...loopRowStyle, background: tt.loopBg, borderColor: tt.loopBorder }}>
              <span style={{ ...loopLabelStyle, color: tt.loopLabel }}>LOOP</span>
              <span style={{ ...loopTimeStyle, color: tt.loopTime }}>
                {formatTime(transport.loopStart)} {'->'} {formatTime(transport.loopEnd)}
              </span>
              <button
                style={{ ...loopClearStyle, color: tt.loopClear }}
                onClick={() => audioEngine.clearLoop()}
                title="Clear loop region"
              >
                X
              </button>
            </div>
          ) : (
            <div style={{ ...transportHintStyle, color: tt.mutedText }}>
              Set a loop or saved range for quick preview and export work.
            </div>
          )}
        </div>

        {videoUrl ? (
          <div style={sessionPreviewColumnStyle}>
            <div
              style={{
                ...previewTransportBarStyle,
                borderColor: tt.btnBorder,
                background: tt.panelBg,
              }}
            >
              <button
                style={{
                  ...previewTransportButtonStyle,
                  background: tt.btnBg,
                  borderColor: tt.btnBorder,
                  color: tt.btnColor,
                }}
                onClick={() => audioEngine.stop()}
                title="Stop and return to start"
              >
                {renderTransportButtonLabel('stop', 'STOP', 'stop')}
              </button>
              <button
                style={{
                  ...previewTransportButtonStyle,
                  background: transport.isPlaying ? getReviewButtonTone(visualMode, 'pause').activeBackground : tt.btnBg,
                  borderColor: transport.isPlaying ? getReviewButtonTone(visualMode, 'pause').activeBorder : tt.btnBorder,
                  color: tt.btnColor,
                }}
                onClick={() => {
                  if (transport.isPlaying) {
                    audioEngine.pause();
                    return;
                  }
                  audioEngine.play();
                }}
                title={transport.isPlaying ? 'Pause playback' : 'Play'}
              >
                {transport.isPlaying
                  ? renderTransportButtonLabel('pause', 'PAUSE', 'pause')
                  : renderTransportButtonLabel('play', 'PLAY', 'play')}
              </button>
              <button
                style={{
                  ...previewTransportButtonStyle,
                  background: transport.loopStart !== null && transport.loopEnd !== null ? getReviewButtonTone(visualMode, 'loop').activeBackground : tt.btnBg,
                  borderColor: transport.loopStart !== null && transport.loopEnd !== null ? getReviewButtonTone(visualMode, 'loop').activeBorder : tt.btnBorder,
                  color: tt.btnColor,
                }}
                onClick={() => {
                  if (transport.loopStart !== null && transport.loopEnd !== null) {
                    audioEngine.clearLoop();
                    return;
                  }
                  if (transport.duration <= 0) {
                    return;
                  }
                  audioEngine.setLoop(0, transport.duration);
                }}
                title={
                  transport.loopStart !== null && transport.loopEnd !== null
                    ? 'Clear the current loop region'
                    : 'Loop the full file'
                }
              >
                {renderTransportButtonLabel('loop', 'LOOP', 'loop')}
              </button>
            </div>
            <div
              ref={videoWrapRef}
              style={
                videoViewMode === 'theater'
                  ? getTheaterVideoWrapStyle(videoSourceSize)
                  : videoViewMode === 'full'
                    ? getAppFullscreenVideoWrapStyle()
                    : videoViewMode === 'window'
                      ? getWindowedVideoWrapStyle(videoWindowRect)
                      : { ...videoWrapStyle, height: videoHeight }
              }
            >
              <video
                ref={videoRef}
                src={videoUrl}
                muted
                preload="auto"
                playsInline
                disablePictureInPicture
                style={videoStyle}
                onLoadedMetadata={onVideoMetadata}
                onCanPlay={onVideoCanPlay}
                onSeeking={onVideoSeeking}
                onSeeked={onVideoSeeked}
                onPlaying={onVideoPlaying}
                onWaiting={onVideoWaiting}
                onStalled={onVideoStalled}
                onEnded={onVideoEnded}
                onError={onVideoError}
              />
              {activeSubtitleCue ? (
                <div style={subtitleOverlayWrapStyle}>
                  <div style={subtitleOverlayCardStyle}>
                    {activeSubtitleCue.lines.map((line, index) => (
                      <div key={`${activeSubtitleCue.startS}:${index}`} style={subtitleOverlayLineStyle}>{line}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div style={videoOverlayStyle}>
                {videoResolution && (
                  <span style={videoBadgeStyle}>{videoResolution}</span>
                )}
                {videoSyncIndicator && (
                  <span
                    style={{
                      ...videoBadgeStyle,
                      ...(videoSyncIndicator === 'wait' ? videoBadgeWarnStyle : videoBadgeSyncStyle),
                    }}
                  >
                    {videoSyncIndicator === 'wait' ? 'WAIT' : 'SYNC'}
                  </span>
                )}
                <button
                  style={{ ...videoFsButtonStyle, ...(videoViewMode === 'window' ? videoFsButtonActiveStyle : {}) }}
                  onClick={onToggleWindowed}
                  title={videoViewMode === 'window' ? 'Dock video back into the session controls' : 'Open a movable window inside the app'}
                >
                  WND
                </button>
                <button
                  style={{ ...videoFsButtonStyle, ...(videoOverlayMode === 'theater' ? videoFsButtonActiveStyle : {}) }}
                  onClick={onToggleTheater}
                  title={videoOverlayMode === 'theater' ? 'Return to the previous video layout' : 'Open theater mode'}
                >
                  THR
                </button>
                <button
                  style={{ ...videoFsButtonStyle, ...(videoOverlayMode === 'full' ? videoFsButtonActiveStyle : {}) }}
                  onClick={onToggleFullscreen}
                  title={videoOverlayMode === 'full' ? 'Return to the previous video layout' : 'Open full screen within the app window'}
                >
                  FULL
                </button>
              </div>
              {showWindowHint && (
                <div style={videoWindowDragHandleStyle} onMouseDown={onWindowDragMouseDown}>
                  <span style={videoWindowDragLabelStyle}>WINDOWED VIDEO</span>
                </div>
              )}
              {showTheaterHint && (
                <div style={theaterHintStyle}>
                  ESC OR CLICK OUTSIDE TO CLOSE
                  {isHighResVideo(videoSourceSize) ? '  /  VIDEO PRIORITY MODE ACTIVE' : ''}
                </div>
              )}
              {showFullscreenHint && (
                <div style={theaterHintStyle}>
                  IN-APP FULL SCREEN  /  ESC OR CLICK OUTSIDE TO CLOSE
                  {isHighResVideo(videoSourceSize) ? '  /  VIDEO PRIORITY MODE ACTIVE' : ''}
                </div>
              )}
              {showWindowHint && (
                <div style={windowHintStyle}>
                  DRAG TOP EDGE TO MOVE  /  DRAG CORNER TO RESIZE  /  CLICK WND TO DOCK BACK
                </div>
              )}
              {showWindowHint && (
                <div
                  style={videoWindowResizeHandleStyle}
                  onMouseDown={onWindowResizeMouseDown}
                  title="Drag to resize"
                />
              )}
              {videoViewMode === 'inline' && (
                <div
                  style={videoResizeHandleStyle}
                  onMouseDown={onVideoResizeMouseDown}
                  title="Drag to resize"
                />
              )}
            </div>
          </div>
        ) : null}
      </div>

      {sessionFilename ? (
        <ClipExportStrip
          key={`${clipSourceKind}:${sessionFilename}:${sessionDurationS}`}
          sessionFilename={sessionFilename}
          sessionDurationS={sessionDurationS}
          sourceKind={clipSourceKind}
          sourcePath={sourcePath}
          visualMode={visualMode}
        />
      ) : null}

      <DiagnosticsLog collapsible collapsedByDefault bodyMaxHeightPx={220} />
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.sm,
  padding: SPACING.sm,
  flexShrink: 0,
  boxSizing: 'border-box',
};

const ingestStyle: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: COLORS.border,
  borderRadius: 2,
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
  userSelect: 'none',
  minHeight: 36,
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
};

const loadedIngestStyle: React.CSSProperties = {
  minHeight: 28,
  padding: `5px ${SPACING.sm}px`,
};

const ingestTextStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  color: COLORS.textSecondary,
  letterSpacing: '0.05em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const compactNoticeStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: `4px ${SPACING.sm}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  flexShrink: 0,
};

const compactNoticeHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: SPACING.sm,
};

const compactNoticeTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.10em',
  lineHeight: 1.2,
  minWidth: 0,
};

const compactNoticeActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.xs,
  flexShrink: 0,
};

const compactNoticeButtonStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  background: 'transparent',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  padding: '1px 5px',
  cursor: 'pointer',
  lineHeight: 1.2,
};

const compactNoticeDetailStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.04em',
  lineHeight: 1.4,
};

const loadNoticeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: SPACING.sm,
  minHeight: 28,
  padding: `4px ${SPACING.sm}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  background: COLORS.bg1,
  flexShrink: 0,
};

const sessionStageWithPreviewStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.sm,
};

const sessionStageSingleStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.sm,
};

const sessionPreviewColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.xs,
  minWidth: 0,
};

const previewTransportBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: SPACING.xs,
  padding: '4px 6px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  boxSizing: 'border-box',
  flexShrink: 0,
};

const previewTransportButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 42,
  height: 20,
  padding: '0 6px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.08em',
  cursor: 'pointer',
  outline: 'none',
  boxSizing: 'border-box',
  whiteSpace: 'nowrap',
};

const previewTransportButtonContentStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  whiteSpace: 'nowrap',
};

const loadNoticeWarnStyle: React.CSSProperties = {
  borderColor: COLORS.statusWarn,
  background: 'rgba(42, 34, 0, 0.3)',
};

const loadNoticeInfoStyle: React.CSSProperties = {
  borderColor: COLORS.borderHighlight,
  background: 'rgba(18, 26, 60, 0.28)',
};

const LOAD_NOTICE_THEMES: Record<LoadNotice['tone'], Record<VisualMode, React.CSSProperties>> = {
  warn: {
    default: loadNoticeWarnStyle,
    nge: { borderColor: 'rgba(160,200,40,0.55)', background: 'rgba(10,24,4,0.55)' },
    hyper: { borderColor: 'rgba(98,200,255,0.45)', background: 'rgba(4,10,32,0.55)' },
    eva: loadNoticeWarnStyle,
    optic: { borderColor: 'rgba(79,134,163,0.58)', background: 'rgba(231,240,246,0.90)' },
    red: { borderColor: 'rgba(156,52,46,0.58)', background: 'rgba(36,8,9,0.90)' },
  },
  info: {
    default: loadNoticeInfoStyle,
    nge: { borderColor: 'rgba(80,160,30,0.35)', background: 'rgba(6,16,4,0.50)' },
    hyper: { borderColor: 'rgba(60,100,220,0.35)', background: 'rgba(4,8,28,0.50)' },
    eva: loadNoticeInfoStyle,
    optic: { borderColor: 'rgba(109,146,165,0.60)', background: 'rgba(243,248,251,0.92)' },
    red: { borderColor: 'rgba(124,40,39,0.60)', background: 'rgba(22,6,7,0.92)' },
  },
};

const COMPACT_NOTICE_THEMES: Record<'warn' | 'info', Record<VisualMode, React.CSSProperties>> = {
  warn: LOAD_NOTICE_THEMES.warn,
  info: LOAD_NOTICE_THEMES.info,
};

const loadNoticeMessageStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textPrimary,
  letterSpacing: '0.05em',
  lineHeight: 1.45,
  flex: 1,
  minWidth: 0,
};

const loadNoticeDismissStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  background: 'transparent',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: COLORS.border,
  borderRadius: 2,
  padding: '1px 4px',
  cursor: 'pointer',
  lineHeight: 1.2,
  flexShrink: 0,
};

const videoWrapStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 2,
  overflow: 'hidden',
  flexShrink: 0,
  background: '#000',
  position: 'relative',
  contain: 'layout paint',
};

const theaterBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(4, 6, 12, 0.78)',
  zIndex: 10000,
};

const hiddenTheaterBackdropStyle: React.CSSProperties = {
  ...theaterBackdropStyle,
  opacity: 0,
  pointerEvents: 'none',
};

const videoStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden',
};

const videoOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  pointerEvents: 'none',
  zIndex: 3,
};

const subtitleOverlayWrapStyle: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  right: 12,
  bottom: 14,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
  zIndex: 2,
};

const subtitleOverlayCardStyle: React.CSSProperties = {
  maxWidth: '100%',
  padding: '6px 10px',
  borderRadius: 2,
  border: `1px solid ${COLORS.border}`,
  background: 'rgba(0, 0, 0, 0.72)',
  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.34)',
};

const subtitleOverlayLineStyle: React.CSSProperties = {
  fontFamily: FONTS.sans,
  fontSize: 14,
  lineHeight: 1.3,
  color: '#f7f2dc',
  textAlign: 'center',
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.85)',
};

const videoBadgeStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textPrimary,
  background: 'rgba(0,0,0,0.62)',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 2,
  padding: '1px 4px',
  letterSpacing: '0.06em',
  pointerEvents: 'none',
};

const videoBadgeSyncStyle: React.CSSProperties = {
  borderColor: COLORS.borderHighlight,
  background: 'rgba(18, 26, 60, 0.88)',
  color: '#d6defc',
};

const videoBadgeWarnStyle: React.CSSProperties = {
  borderColor: COLORS.statusWarn,
  background: 'rgba(42, 34, 0, 0.88)',
  color: '#f0df8a',
};

const videoFsButtonStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  background: 'rgba(0,0,0,0.62)',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: COLORS.border,
  borderRadius: 2,
  padding: '1px 4px',
  cursor: 'pointer',
  lineHeight: 1,
  outline: 'none',
  pointerEvents: 'auto',
};

const videoFsButtonActiveStyle: React.CSSProperties = {
  color: COLORS.textPrimary,
  borderColor: COLORS.borderActive,
  background: 'rgba(18, 24, 44, 0.88)',
};

const videoWindowDragHandleStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 96,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  paddingLeft: 8,
  background: 'linear-gradient(180deg, rgba(0,0,0,0.38), rgba(0,0,0,0.06))',
  cursor: 'move',
  pointerEvents: 'auto',
  zIndex: 2,
};

const videoWindowDragLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textDim,
  letterSpacing: '0.08em',
  lineHeight: 1,
};

const theaterHintStyle: React.CSSProperties = {
  position: 'absolute',
  left: 10,
  bottom: 10,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.08em',
  color: COLORS.textDim,
  background: 'rgba(0, 0, 0, 0.58)',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 2,
  padding: '4px 6px',
  pointerEvents: 'none',
};

const windowHintStyle: React.CSSProperties = {
  ...theaterHintStyle,
  bottom: 10,
  left: 10,
};

const videoResizeHandleStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: 6,
  cursor: 'row-resize',
  background: 'transparent',
  zIndex: 10,
};

const videoWindowResizeHandleStyle: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  bottom: 0,
  width: 18,
  height: 18,
  cursor: 'nwse-resize',
  pointerEvents: 'auto',
  zIndex: 3,
  background: 'linear-gradient(135deg, transparent 38%, rgba(110, 180, 255, 0.45) 38%, rgba(110, 180, 255, 0.45) 48%, transparent 48%, transparent 56%, rgba(110, 180, 255, 0.65) 56%, rgba(110, 180, 255, 0.65) 66%, transparent 66%)',
};

const timeRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: SPACING.xs,
  flexShrink: 0,
};

const timeStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXl,
  color: COLORS.textPrimary,
  letterSpacing: '0.08em',
};

const timeSepStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeMd,
  color: COLORS.textDim,
};

const seekTrackStyle: React.CSSProperties = {
  position: 'relative',
  height: 6,
  background: COLORS.bg3,
  borderRadius: 2,
  flexShrink: 0,
};

const seekFillStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  height: '100%',
  background: COLORS.accent,
  pointerEvents: 'none',
  borderRadius: 2,
};

const seekInputStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  cursor: 'pointer',
  margin: 0,
  padding: 0,
};

const deckStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.xs,
  padding: `${SPACING.xs + 1}px ${SPACING.sm}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  background: COLORS.bg1,
  boxSizing: 'border-box',
  minWidth: 0,
};

const deckHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: SPACING.xs,
};

const deckEyebrowStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.12em',
  lineHeight: 1,
};

const deckMetaStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.06em',
  lineHeight: 1,
};

const deckHeaderActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
};

const topControlGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 4,
};

const topControlButtonStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 1,
  minHeight: 34,
  padding: `4px ${SPACING.xs}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  cursor: 'pointer',
  outline: 'none',
  transition: 'background 0.1s, border-color 0.1s',
  boxSizing: 'border-box',
  textAlign: 'left',
  minWidth: 0,
};

const topControlPrimaryButtonStyle: React.CSSProperties = {
  boxShadow: 'inset 0 0 0 1px rgba(120, 140, 220, 0.08)',
};

const topControlResetButtonStyle: React.CSSProperties = {
  height: 18,
  padding: '0 7px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  outline: 'none',
  transition: 'background 0.1s, border-color 0.1s',
};

const topControlLabelStyle: React.CSSProperties = {
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.05em',
  lineHeight: 1.05,
  maxWidth: '100%',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
};

const topControlHintStyle: React.CSSProperties = {
  fontSize: 8,
  letterSpacing: '0.05em',
  lineHeight: 1.05,
};

const topStatusGridStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 4,
};

const topStatusCellStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 4,
  minWidth: 0,
  padding: `3px ${SPACING.xs}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  background: COLORS.bg1,
};

const topStatusLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 8,
  letterSpacing: '0.06em',
  lineHeight: 1,
  flexShrink: 0,
};

const topStatusValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.03em',
  lineHeight: 1.05,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const transportHintStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.04em',
  lineHeight: 1.45,
  minHeight: 20,
};

const loopRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.xs,
  padding: `2px ${SPACING.xs}px`,
  background: 'rgba(40, 120, 60, 0.15)',
  border: '1px solid rgba(80, 200, 120, 0.25)',
  borderRadius: 2,
  flexShrink: 0,
};

const loopLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: 'rgba(80, 200, 120, 0.80)',
  letterSpacing: '0.08em',
  flexShrink: 0,
};

const loopTimeStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  flex: 1,
};

const loopClearStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(80, 200, 120, 0.60)',
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  cursor: 'pointer',
  padding: '0 2px',
  lineHeight: 1,
  outline: 'none',
  flexShrink: 0,
};
