// ============================================================
// Transport Controls - ingest, play/pause/stop, seek, time readout.
// When a video file is loaded, shows a small muted preview frame.
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAudioEngine, useDiagnosticsLog, usePerformanceDiagnosticsStore, useTheaterModeStore } from '../core/session';
import { COLORS, FONTS, SPACING } from '../theme';
import type { TransportState } from '../types';

const VIDEO_HEIGHT_MIN = 72;
const VIDEO_HEIGHT_DEFAULT = 160;
const VIDEO_TIME_DISPLAY_MS = 100;
const VIDEO_SOFT_SYNC_DRIFT_S = 0.045;
const VIDEO_HARD_SYNC_DRIFT_S = 0.35;
const VIDEO_RATE_TRIM_GAIN = 0.24;
const VIDEO_RATE_TRIM_MAX = 0.05;
const VIDEO_RATE_RAMP_STEP = 0.02;
const VIDEO_RATE_UPDATE_MIN_MS = 70;
const VIDEO_HARD_SYNC_COOLDOWN_MS = 900;
const HIGH_RES_SOFT_SYNC_DRIFT_S = 0.09;
const HIGH_RES_HARD_SYNC_DRIFT_S = 0.5;
const HIGH_RES_RATE_TRIM_GAIN = 0.12;
const HIGH_RES_RATE_TRIM_MAX = 0.025;
const VIDEO_SYNC_GRACE_MS = 550;
const VIDEO_TRANSPORT_CATCHUP_MS = 1600;
const VIDEO_TRANSPORT_FORCE_HARD_SYNC_S = 0.9;
const VIDEO_TRANSPORT_RECOVERY_DELAY_MS = 140;
const VIDEO_TRANSPORT_RECOVERY_COOLDOWN_MS = 1400;
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

interface VideoWindowRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface VideoSyncProfile {
  readonly settleMs: number;
  readonly softSyncDrift: number;
  readonly hardSyncDrift: number;
  readonly rateTrimGain: number;
  readonly rateTrimMax: number;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${ms}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
}

interface VideoSourceSize {
  readonly width: number;
  readonly height: number;
}

function isHighResVideo(size: VideoSourceSize | null): boolean {
  if (!size) return false;
  return size.width >= 1600 || size.height >= 900;
}

function getTransportStressFactor(playbackRate: number, pitchSemitones: number): number {
  let factor = 1;
  if (playbackRate < 1) {
    factor += (1 - playbackRate) * 1.4;
  } else if (playbackRate > 1.2) {
    factor += Math.min(0.45, (playbackRate - 1.2) * 0.35);
  }
  factor += Math.min(0.55, (Math.abs(pitchSemitones) / 12) * 0.45);
  return clamp(factor, 1, 2.35);
}

function getAdaptiveVideoSyncProfile(
  playbackRate: number,
  pitchSemitones: number,
  highLoadVideoMode: boolean,
): VideoSyncProfile {
  const stressFactor = getTransportStressFactor(playbackRate, pitchSemitones);
  const baseSoftSyncDrift = highLoadVideoMode ? HIGH_RES_SOFT_SYNC_DRIFT_S : VIDEO_SOFT_SYNC_DRIFT_S;
  const baseHardSyncDrift = highLoadVideoMode ? HIGH_RES_HARD_SYNC_DRIFT_S : VIDEO_HARD_SYNC_DRIFT_S;
  const baseRateTrimGain = highLoadVideoMode ? HIGH_RES_RATE_TRIM_GAIN : VIDEO_RATE_TRIM_GAIN;
  const baseRateTrimMax = highLoadVideoMode ? HIGH_RES_RATE_TRIM_MAX : VIDEO_RATE_TRIM_MAX;

  return {
    settleMs: Math.round(VIDEO_SYNC_GRACE_MS * stressFactor),
    softSyncDrift: baseSoftSyncDrift * stressFactor,
    hardSyncDrift: baseHardSyncDrift * stressFactor,
    rateTrimGain: baseRateTrimGain / stressFactor,
    rateTrimMax: baseRateTrimMax / Math.sqrt(stressFactor),
  };
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

export function TransportControls({ onFileLoaded }: Props): React.ReactElement {
  const audioEngine = useAudioEngine();
  const diagnosticsLog = useDiagnosticsLog();
  const performanceDiagnostics = usePerformanceDiagnosticsStore();
  const theaterModeStore = useTheaterModeStore();
  const [transport, setTransport] = useState<TransportState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    filename: null,
    scrubActive: false,
    playbackRate: 1,
    pitchSemitones: 0,
    pitchShiftAvailable: true,
    loopStart: null,
    loopEnd: null,
  });
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

  const seekInputRef = useRef<HTMLInputElement>(null);
  const seekFillRef = useRef<HTMLDivElement>(null);
  const isSeekingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const videoUrlRef = useRef<string | null>(null);
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const videoResizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const lastVideoRateRef = useRef(1);
  const lastVideoRateSetAtRef = useRef(0);
  const lastVideoHardSyncAtRef = useRef(0);
  const lastVideoRecoveryAtRef = useRef(0);
  const videoEventTimesRef = useRef<Record<string, number>>({});
  const videoSyncGraceUntilRef = useRef(0);
  const videoSeekPendingRef = useRef(false);
  const videoPendingPlayRef = useRef(false);
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
  const videoTransportCatchupUntilRef = useRef(0);
  const videoTransportRecoveryTimerRef = useRef<number | null>(null);
  const lastTransportRateRef = useRef(1);
  const lastTransportPitchRef = useRef(0);
  const videoScrubPreviewAtRef = useRef(0);
  const lastVideoTransportStateRef = useRef<TransportState | null>(null);

  const videoViewMode: VideoViewMode = videoOverlayMode ?? videoBaseMode;

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
    videoSyncGraceUntilRef.current = Math.max(
      videoSyncGraceUntilRef.current,
      performance.now() + durationMs,
    );
  }, []);

  const markWindowedVideoSettle = useCallback((durationMs = WINDOWED_VIDEO_SETTLE_MS) => {
    videoWindowInteractionGraceUntilRef.current = Math.max(
      videoWindowInteractionGraceUntilRef.current,
      performance.now() + durationMs,
    );
    markVideoSyncGrace(durationMs);
  }, [markVideoSyncGrace]);

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
    if (Math.abs(video.currentTime - nextTime) <= 0.01) return;

    videoSeekPendingRef.current = true;
    videoPendingPlayRef.current = transportRef.current.isPlaying;
    setVideoSyncIndicator('sync');
    performanceDiagnostics.setVideoState('sync');
    const syncProfile = getCurrentVideoSyncProfile(videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null);
    markVideoSyncGrace(syncProfile.settleMs);
    video.currentTime = nextTime;
    lastVideoHardSyncAtRef.current = performance.now();
  }, [getCurrentVideoSyncProfile, markVideoSyncGrace, performanceDiagnostics]);

  const playVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const syncProfile = getCurrentVideoSyncProfile(videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null);

    if (video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      videoPendingPlayRef.current = true;
      markVideoSyncGrace(syncProfile.settleMs);
      return;
    }

    videoPendingPlayRef.current = false;
    void video.play().catch((error: unknown) => {
      if (
        isPlaybackInterruptedError(error) ||
        video.seeking ||
        videoSeekPendingRef.current ||
        performance.now() < videoSyncGraceUntilRef.current
      ) {
        videoPendingPlayRef.current = transportRef.current.isPlaying;
        markVideoSyncGrace(Math.max(250, Math.round(syncProfile.settleMs * 0.5)));
        logVideoEvent('play-interrupted', 'video play deferred while seek settles', 'dim', 2500);
        return;
      }
      logVideoEvent('play-reject', 'video play request was blocked by the runtime', 'warn', 4000);
    });
  }, [getCurrentVideoSyncProfile, logVideoEvent, markVideoSyncGrace]);

  const recoverVideoPlayback = useCallback((reason: 'waiting' | 'stalled') => {
    const video = videoRef.current;
    if (!video || !transportRef.current.isPlaying) return;
    const now = performance.now();
    if (now - lastVideoRecoveryAtRef.current < VIDEO_TRANSPORT_RECOVERY_COOLDOWN_MS) return;
    if (videoSeekPendingRef.current || video.seeking || videoWindowInteractionActiveRef.current) return;

    lastVideoRecoveryAtRef.current = now;
    setVideoSyncIndicator('sync');
    const targetTime = audioEngine.currentTime;
    const syncProfile = getCurrentVideoSyncProfile(videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null);
    markVideoSyncGrace(syncProfile.settleMs);
    videoPendingPlayRef.current = true;
    video.pause();
    if (Math.abs(video.currentTime - targetTime) >= VIDEO_TRANSPORT_RECOVERY_DRIFT_S) {
      videoSeekPendingRef.current = true;
      video.currentTime = Math.max(0, targetTime);
    }
    setVideoPlaybackRate(transportRef.current.playbackRate, true);
    requestAnimationFrame(() => {
      if (!videoRef.current || !transportRef.current.isPlaying) return;
      playVideo();
    });
    performanceDiagnostics.noteVideoEvent('recover', `video preview refreshed after ${reason}`, 'info', 1600);
    logVideoEvent(`recover-${reason}`, `video preview refreshed after ${reason}`, 'dim', 2500);
  }, [audioEngine, getCurrentVideoSyncProfile, logVideoEvent, markVideoSyncGrace, performanceDiagnostics, playVideo, setVideoPlaybackRate]);

  const scheduleVideoRecovery = useCallback((reason: 'waiting' | 'stalled') => {
    if (videoTransportRecoveryTimerRef.current !== null) return;
    videoTransportRecoveryTimerRef.current = window.setTimeout(() => {
      videoTransportRecoveryTimerRef.current = null;
      recoverVideoPlayback(reason);
    }, VIDEO_TRANSPORT_RECOVERY_DELAY_MS);
  }, [recoverVideoPlayback]);

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
      if (videoTransportRecoveryTimerRef.current !== null) {
        window.clearTimeout(videoTransportRecoveryTimerRef.current);
        videoTransportRecoveryTimerRef.current = null;
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

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

    const stressFactor = getTransportStressFactor(transport.playbackRate, transport.pitchSemitones);
    if (videoBaseModeRef.current === 'window') {
      markWindowedVideoSettle(Math.round(WINDOWED_TRANSPORT_SETTLE_MS * stressFactor));
    }
    const settleMs = Math.max(220, Math.round(VIDEO_SYNC_GRACE_MS * stressFactor * 0.6));
    const catchupMs = Math.max(950, Math.round(VIDEO_TRANSPORT_CATCHUP_MS * stressFactor));
    videoTransportCatchupUntilRef.current = performance.now() + catchupMs;
    markVideoSyncGrace(settleMs);
    if (transport.isPlaying) {
      setVideoSyncIndicator('sync');
      performanceDiagnostics.noteVideoEvent('retune', 'video retuning after transport change', 'dim', 1400);
      logVideoEvent('transport-retune', 'video preview retuning to transport change', 'dim', 1800);
    }
  }, [logVideoEvent, markVideoSyncGrace, markWindowedVideoSettle, performanceDiagnostics, transport.isPlaying, transport.pitchSemitones, transport.playbackRate]);

  const onVideoCanPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    videoSeekPendingRef.current = false;
    if (videoTransportRecoveryTimerRef.current !== null) {
      window.clearTimeout(videoTransportRecoveryTimerRef.current);
      videoTransportRecoveryTimerRef.current = null;
    }
    const syncProfile = getCurrentVideoSyncProfile(videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null);
    markVideoSyncGrace(Math.max(250, Math.round(syncProfile.settleMs * 0.5)));
    hardSyncVideo(audioEngine.currentTime);
    setVideoPlaybackRate(transportRef.current.playbackRate, true);
    if (transportRef.current.isPlaying || videoPendingPlayRef.current) {
      playVideo();
    }
  }, [audioEngine, getCurrentVideoSyncProfile, hardSyncVideo, markVideoSyncGrace, playVideo, setVideoPlaybackRate]);

  const onVideoSeeking = useCallback(() => {
    videoSeekPendingRef.current = true;
    setVideoSyncIndicator('sync');
    performanceDiagnostics.setVideoState('sync');
    const syncProfile = getCurrentVideoSyncProfile(videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null);
    markVideoSyncGrace(syncProfile.settleMs);
  }, [getCurrentVideoSyncProfile, markVideoSyncGrace, performanceDiagnostics]);

  const onVideoSeeked = useCallback(() => {
    videoSeekPendingRef.current = false;
    if (videoTransportRecoveryTimerRef.current !== null) {
      window.clearTimeout(videoTransportRecoveryTimerRef.current);
      videoTransportRecoveryTimerRef.current = null;
    }
    const syncProfile = getCurrentVideoSyncProfile(videoBaseModeRef.current === 'window' || videoOverlayModeRef.current !== null);
    markVideoSyncGrace(Math.max(250, Math.round(syncProfile.settleMs * 0.5)));
    setVideoPlaybackRate(transportRef.current.playbackRate, true);
    if (transportRef.current.isPlaying || videoPendingPlayRef.current) {
      playVideo();
    } else {
      videoPendingPlayRef.current = false;
      performanceDiagnostics.setVideoState('idle');
      setVideoSyncIndicator(null);
    }
  }, [getCurrentVideoSyncProfile, markVideoSyncGrace, performanceDiagnostics, playVideo, setVideoPlaybackRate]);

  const onVideoPlaying = useCallback(() => {
    if (videoTransportRecoveryTimerRef.current !== null) {
      window.clearTimeout(videoTransportRecoveryTimerRef.current);
      videoTransportRecoveryTimerRef.current = null;
    }
    const now = performance.now();
    if (now >= videoTransportCatchupUntilRef.current && now >= videoSyncGraceUntilRef.current) {
      setVideoSyncIndicator(null);
    }
    performanceDiagnostics.noteVideoEvent('playing', 'video preview running', 'dim', 2200);
    logVideoEvent('playing', 'video preview playing', 'info', VIDEO_PLAYING_LOG_INTERVAL_MS);
  }, [logVideoEvent, performanceDiagnostics]);

  const onVideoWaiting = useCallback(() => {
    const video = videoRef.current;
    const now = performance.now();
    if (videoSeekPendingRef.current || now < videoSyncGraceUntilRef.current) {
      setVideoSyncIndicator('sync');
      logVideoEvent('waiting-settle', 'video seek settling', 'dim', VIDEO_SETTLE_LOG_INTERVAL_MS);
      return;
    }
    if (isNearVideoEnd(video, transportRef.current) || video?.ended) {
      if (isFullFileLoopActive(transportRef.current)) {
        logVideoEvent('loop-wrap', 'video loop wrap', 'dim', 2000);
        return;
      }
      logVideoEvent('waiting-end', 'video preview reached end', 'dim', 2500);
      return;
    }
    if (now < videoTransportCatchupUntilRef.current) {
      scheduleVideoRecovery('waiting');
    }
    setVideoSyncIndicator('wait');
    performanceDiagnostics.noteVideoEvent('waiting', 'video waiting for decode / buffer', 'warn', 1200);
    logVideoEvent('waiting', 'video waiting for decode / buffer', 'warn');
  }, [logVideoEvent, performanceDiagnostics, scheduleVideoRecovery]);

  const onVideoStalled = useCallback(() => {
    const video = videoRef.current;
    const now = performance.now();
    if (videoSeekPendingRef.current || now < videoSyncGraceUntilRef.current) {
      setVideoSyncIndicator('sync');
      logVideoEvent('stalled-settle', 'video still settling after seek', 'dim', VIDEO_SETTLE_LOG_INTERVAL_MS);
      return;
    }
    if (isNearVideoEnd(video, transportRef.current) || video?.ended) {
      if (isFullFileLoopActive(transportRef.current)) {
        logVideoEvent('loop-wrap', 'video loop wrap', 'dim', 2000);
        return;
      }
      logVideoEvent('stalled-end', 'video preview reached end', 'dim', 2500);
      return;
    }
    if (now < videoTransportCatchupUntilRef.current) {
      scheduleVideoRecovery('stalled');
    }
    setVideoSyncIndicator('wait');
    performanceDiagnostics.noteVideoEvent('stalled', 'video stalled', 'warn', 1200);
    logVideoEvent('stalled', 'video stalled', 'warn');
  }, [logVideoEvent, performanceDiagnostics, scheduleVideoRecovery]);

  const onVideoEnded = useCallback(() => {
    videoPendingPlayRef.current = false;
    videoSeekPendingRef.current = false;
    performanceDiagnostics.setVideoState('idle');
    setVideoSyncIndicator(null);
    if (isFullFileLoopActive(transportRef.current)) {
      logVideoEvent('loop-wrap', 'video loop wrap', 'dim', 2000);
      return;
    }
    logVideoEvent('ended', 'video preview reached end', 'dim', 2500);
  }, [logVideoEvent, performanceDiagnostics]);

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
      videoPendingPlayRef.current = false;
      performanceDiagnostics.setVideoState('scrub');
      setVideoSyncIndicator('sync');
      if (videoTransportRecoveryTimerRef.current !== null) {
        window.clearTimeout(videoTransportRecoveryTimerRef.current);
        videoTransportRecoveryTimerRef.current = null;
      }
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
        hardSyncVideo(audioEngine.currentTime);
      } else if (rateChanged || pitchChanged) {
        markVideoSyncGrace(Math.max(220, Math.round(syncProfile.settleMs * 0.35)));
        setVideoSyncIndicator('sync');
      }
      playVideo();
    } else {
      videoPendingPlayRef.current = false;
      videoTransportCatchupUntilRef.current = 0;
      performanceDiagnostics.setVideoState('idle');
      if (videoTransportRecoveryTimerRef.current !== null) {
        window.clearTimeout(videoTransportRecoveryTimerRef.current);
        videoTransportRecoveryTimerRef.current = null;
      }
      setVideoSyncIndicator(null);
      video.pause();
      if (audioEngine.currentTime === 0) {
        hardSyncVideo(0);
      }
    }
    lastVideoTransportStateRef.current = transport;
  }, [audioEngine, getCurrentVideoSyncProfile, hardSyncVideo, markVideoSyncGrace, performanceDiagnostics, playVideo, setVideoPlaybackRate, transport, videoUrl]);

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
      const absDrift = Math.abs(drift);
      const now = performance.now();
      const windowedVideoMode =
        videoOverlayModeRef.current === null &&
        videoBaseModeRef.current === 'window';
      const highLoadVideoMode =
        (videoOverlayModeRef.current !== null && isHighResVideo(videoSourceSize)) ||
        windowedVideoMode;
      const syncProfile = getAdaptiveVideoSyncProfile(
        transportRef.current.playbackRate,
        transportRef.current.pitchSemitones,
        highLoadVideoMode,
      );
      let softSyncDrift = syncProfile.softSyncDrift;
      let hardSyncDrift = syncProfile.hardSyncDrift;
      let rateTrimGain = syncProfile.rateTrimGain;
      let rateTrimMax = syncProfile.rateTrimMax;
      const transportCatchupActive = now < videoTransportCatchupUntilRef.current;
      performanceDiagnostics.noteVideoTelemetry({
        driftMs: drift * 1000,
        previewRate: video.playbackRate,
        readyState: video.readyState,
        catchupActive: transportCatchupActive,
      });

      // After a live rate/pitch change, prefer brief rate nudges before any hard seek.
      if (transportCatchupActive) {
        softSyncDrift = Math.max(0.024, softSyncDrift * 0.75);
        hardSyncDrift = Math.max(
          VIDEO_TRANSPORT_FORCE_HARD_SYNC_S,
          hardSyncDrift * 1.3,
        );
        rateTrimGain *= 1.2;
        rateTrimMax = Math.max(rateTrimMax, highLoadVideoMode ? 0.04 : 0.07);
      }

      if (
        video.seeking ||
        videoSeekPendingRef.current ||
        videoWindowInteractionActiveRef.current ||
        now < videoWindowInteractionGraceUntilRef.current ||
        now < videoSyncGraceUntilRef.current ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        setVideoPlaybackRate(baseRate);
        return;
      }

      if (video.ended && currentTime <= VIDEO_END_TAIL_S) {
        setVideoPlaybackRate(baseRate, true);
        return;
      }

      if (
        absDrift >= hardSyncDrift &&
        now - lastVideoHardSyncAtRef.current >= VIDEO_HARD_SYNC_COOLDOWN_MS
      ) {
        hardSyncVideo(currentTime);
        performanceDiagnostics.noteVideoEvent('hard-sync', `hard video resync ${Math.round(drift * 1000)} ms`, 'warn', 1200);
        setVideoPlaybackRate(baseRate);
        const driftMs = Math.round(drift * 1000);
        logVideoEvent(
          'hard-sync',
          Math.abs(driftMs) >= VIDEO_LARGE_DRIFT_LOG_MS
            ? 'large video drift reset'
            : `hard resync ${driftMs} ms`,
          'warn',
          1500,
        );
        return;
      }

      if (absDrift >= softSyncDrift) {
        const correction = clamp(drift * rateTrimGain, -rateTrimMax, rateTrimMax);
        setVideoPlaybackRate(baseRate + correction);
      } else {
        if (transportCatchupActive) {
          videoTransportCatchupUntilRef.current = 0;
          if (videoTransportRecoveryTimerRef.current !== null) {
            window.clearTimeout(videoTransportRecoveryTimerRef.current);
            videoTransportRecoveryTimerRef.current = null;
          }
          setVideoSyncIndicator(null);
        }
        setVideoPlaybackRate(baseRate);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [audioEngine, hardSyncVideo, logVideoEvent, performanceDiagnostics, setVideoPlaybackRate, videoSourceSize, videoUrl]);

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
      setVideoResolution(null);
      setVideoSourceSize(null);
      setDisplayCurrentTime(0);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        videoRef.current.playbackRate = 1;
      }
      lastVideoRateRef.current = 1;
      lastVideoRateSetAtRef.current = 0;
      lastVideoHardSyncAtRef.current = 0;
      lastVideoRecoveryAtRef.current = 0;
      videoEventTimesRef.current = {};
      videoSyncGraceUntilRef.current = 0;
      videoTransportCatchupUntilRef.current = 0;
      videoSeekPendingRef.current = false;
      videoPendingPlayRef.current = false;
      if (videoTransportRecoveryTimerRef.current !== null) {
        window.clearTimeout(videoTransportRecoveryTimerRef.current);
        videoTransportRecoveryTimerRef.current = null;
      }
      performanceDiagnostics.setVideoState('idle');
      setVideoSyncIndicator(null);
    });
  }, [audioEngine, clearFileInput, clearVideoPreview, performanceDiagnostics]);

  const handleFile = useCallback(async (file: File) => {
    clearVideoPreview();
    setVideoResolution(null);
    setVideoSourceSize(null);
    videoEventTimesRef.current = {};
    lastVideoRateRef.current = 1;
    lastVideoRateSetAtRef.current = 0;
    lastVideoHardSyncAtRef.current = 0;
    lastVideoRecoveryAtRef.current = 0;
    videoSyncGraceUntilRef.current = 0;
    videoTransportCatchupUntilRef.current = 0;
    videoSeekPendingRef.current = false;
    videoPendingPlayRef.current = false;
    if (videoTransportRecoveryTimerRef.current !== null) {
      window.clearTimeout(videoTransportRecoveryTimerRef.current);
      videoTransportRecoveryTimerRef.current = null;
    }
    performanceDiagnostics.setVideoState('idle');
    setVideoSyncIndicator(null);

    if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      videoUrlRef.current = url;
      setVideoUrlSession(url);
      diagnosticsLog.push(`preview source attached for ${file.name}`, 'info', 'video');
    }

    setIsLoading(true);
    try {
      await audioEngine.load(file);
      onFileLoaded?.();
    } finally {
      clearFileInput();
      setIsLoading(false);
    }
  }, [audioEngine, clearFileInput, clearVideoPreview, diagnosticsLog, onFileLoaded, performanceDiagnostics, setVideoUrlSession]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handleFile(file);
  }, [handleFile]);

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

  const onToggleLoop = useCallback(() => {
    const { duration, loopStart, loopEnd } = transportRef.current;
    if (duration <= 0) return;
    if (loopStart !== null && loopEnd !== null) {
      audioEngine.clearLoop();
      diagnosticsLog.push('loop cleared', 'info', 'transport');
      return;
    }
    audioEngine.setLoop(0, duration);
    diagnosticsLog.push(`loop file 00:00.0 -> ${formatTime(duration)}`, 'info', 'transport');
  }, [audioEngine, diagnosticsLog]);

  const seekFraction = transport.duration > 0 ? displayCurrentTime / transport.duration : 0;
  const hasLoop = transport.loopStart !== null && transport.loopEnd !== null;
  const videoOverlayActive = videoOverlayMode !== null;
  const showTheaterHint = videoOverlayMode === 'theater';
  const showFullscreenHint = videoOverlayMode === 'full';
  const showWindowHint = videoViewMode === 'window';

  return (
    <div style={wrapStyle}>
      <div
        style={{
          ...ingestStyle,
          borderColor: isDragging ? COLORS.accent : COLORS.border,
          background: isDragging ? COLORS.accentGlow : COLORS.bg3,
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
        {isLoading ? (
          <span style={ingestTextStyle}>DECODING...</span>
        ) : transport.filename ? (
          <span style={{ ...ingestTextStyle, color: COLORS.textPrimary }}>
            {transport.filename}
          </span>
        ) : (
          <span style={ingestTextStyle}>DROP AUDIO / VIDEO - OR CLICK TO OPEN</span>
        )}
      </div>

      {videoUrl && (
        <div
          style={videoOverlayActive ? theaterBackdropStyle : hiddenTheaterBackdropStyle}
          onClick={videoOverlayActive ? () => setVideoOverlayPresentation(null) : undefined}
        />
      )}

      {videoUrl && (
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
      )}

      <div style={timeRowStyle}>
        <span style={timeStyle}>{formatTime(displayCurrentTime)}</span>
        <span style={timeSepStyle}>/</span>
        <span style={{ ...timeStyle, color: COLORS.textDim }}>{formatTime(transport.duration)}</span>
      </div>

      <div style={seekTrackStyle}>
        <div
          ref={seekFillRef}
          style={{ ...seekFillStyle, width: `${seekFraction * 100}%` }}
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

      {transport.loopStart !== null && transport.loopEnd !== null && (
        <div style={loopRowStyle}>
          <span style={loopLabelStyle}>LOOP</span>
          <span style={loopTimeStyle}>
            {formatTime(transport.loopStart)} {'->'} {formatTime(transport.loopEnd)}
          </span>
          <button
            style={loopClearStyle}
            onClick={() => audioEngine.clearLoop()}
            title="Clear loop region"
          >
            X
          </button>
        </div>
      )}

      <div style={buttonRowStyle}>
        <button
          style={btnStyle}
          onClick={() => audioEngine.stop()}
          disabled={isLoading || !transport.filename}
          title="Stop - return to start"
        >
          STOP
        </button>
        <button
          style={{ ...btnStyle, ...(transport.isPlaying ? btnActiveStyle : {}) }}
          onClick={() => transport.isPlaying ? audioEngine.pause() : audioEngine.play()}
          disabled={isLoading || !transport.filename}
          title={transport.isPlaying ? 'Pause' : 'Play'}
        >
          {transport.isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
        <button
          style={{ ...btnStyle, ...(hasLoop ? btnActiveStyle : {}) }}
          onClick={onToggleLoop}
          disabled={isLoading || !transport.filename}
          title={hasLoop ? 'Clear current loop region' : 'Loop the full file'}
        >
          LOOP
        </button>
        <button
          style={{ ...btnStyle, ...btnResetStyle }}
          onClick={() => audioEngine.reset()}
          disabled={isLoading || !transport.filename}
          title="Reset - clear file and all visuals"
        >
          RESET
        </button>
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.sm,
  padding: SPACING.md,
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

const ingestTextStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  color: COLORS.textSecondary,
  letterSpacing: '0.05em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
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

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: SPACING.xs,
  flexShrink: 0,
};

const btnStyle: React.CSSProperties = {
  background: COLORS.bg3,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: COLORS.border,
  color: COLORS.textPrimary,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  padding: `${SPACING.xs}px ${SPACING.sm}px`,
  cursor: 'pointer',
  borderRadius: 2,
  lineHeight: 1.2,
  outline: 'none',
  transition: 'background 0.1s, border-color 0.1s',
};

const btnActiveStyle: React.CSSProperties = {
  background: COLORS.accentDim,
  borderColor: COLORS.accent,
};

const btnResetStyle: React.CSSProperties = {
  marginLeft: 'auto',
  letterSpacing: '0.06em',
  borderColor: COLORS.borderActive,
  background: COLORS.bg1,
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
