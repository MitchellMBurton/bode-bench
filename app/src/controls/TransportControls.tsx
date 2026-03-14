// ============================================================
// Transport Controls - ingest, play/pause/stop, seek, time readout.
// When a video file is loaded, shows a small muted preview frame.
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAudioEngine, useDiagnosticsLog, useTheaterModeStore } from '../core/session';
import { COLORS, FONTS, SPACING } from '../theme';
import type { TransportState } from '../types';

const VIDEO_HEIGHT_MIN = 72;
const VIDEO_HEIGHT_DEFAULT = 160;
const VIDEO_TIME_DISPLAY_MS = 100;
const VIDEO_SOFT_SYNC_DRIFT_S = 0.045;
const VIDEO_HARD_SYNC_DRIFT_S = 0.35;
const VIDEO_RATE_TRIM_GAIN = 0.35;
const VIDEO_RATE_TRIM_MAX = 0.08;
const VIDEO_HARD_SYNC_COOLDOWN_MS = 900;
const HIGH_RES_SOFT_SYNC_DRIFT_S = 0.09;
const HIGH_RES_HARD_SYNC_DRIFT_S = 0.5;
const HIGH_RES_RATE_TRIM_GAIN = 0.18;
const HIGH_RES_RATE_TRIM_MAX = 0.04;
const VIDEO_SYNC_GRACE_MS = 550;
const VIDEO_END_TAIL_S = 0.25;
const VIDEO_LARGE_DRIFT_LOG_MS = 10000;
const APP_FULLSCREEN_MARGIN_PX = 14;
const APP_FULLSCREEN_TOP_PX = 38;

let _sessionVideoUrl: string | null = null;

type VideoViewMode = 'inline' | 'theater' | 'full';

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

export function TransportControls({ onFileLoaded }: Props): React.ReactElement {
  const audioEngine = useAudioEngine();
  const diagnosticsLog = useDiagnosticsLog();
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
  const [videoViewMode, setVideoViewMode] = useState<VideoViewMode>('inline');

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
  const lastVideoHardSyncAtRef = useRef(0);
  const videoEventTimesRef = useRef<Record<string, number>>({});
  const videoSyncGraceUntilRef = useRef(0);
  const videoSeekPendingRef = useRef(false);
  const videoPendingPlayRef = useRef(false);
  const videoViewModeRef = useRef<VideoViewMode>('inline');
  videoViewModeRef.current = videoViewMode;

  useEffect(() => {
    if (_sessionVideoUrl && !videoUrlRef.current) {
      videoUrlRef.current = _sessionVideoUrl;
    }
  }, []);

  const setVideoPresentationMode = useCallback((nextMode: VideoViewMode, shouldLog = true) => {
    const prevMode = videoViewModeRef.current;
    if (prevMode === nextMode) return;

    videoViewModeRef.current = nextMode;
    setVideoViewMode(nextMode);

    const wasOverlay = prevMode !== 'inline';
    const isOverlay = nextMode !== 'inline';
    theaterModeStore.setActive(isOverlay);

    if (!shouldLog) return;

    if (prevMode === 'theater') diagnosticsLog.push('theater mode off', 'info', 'video');
    if (prevMode === 'full') diagnosticsLog.push('in-app full screen off', 'info', 'video');
    if (!wasOverlay && isOverlay) diagnosticsLog.push('analysis surfaces suspended for video priority', 'info', 'video');
    if (wasOverlay && !isOverlay) diagnosticsLog.push('analysis surfaces restored', 'info', 'video');
    if (nextMode === 'theater') diagnosticsLog.push('theater mode on', 'info', 'video');
    if (nextMode === 'full') diagnosticsLog.push('in-app full screen on', 'info', 'video');
    if (nextMode === 'theater' && isHighResVideo(videoSourceSize)) {
      diagnosticsLog.push('high-res theater playback active - preview render capped for smoother decode', 'warn', 'video');
    }
    if (nextMode === 'full' && isHighResVideo(videoSourceSize)) {
      diagnosticsLog.push('high-res in-app full screen active - video priority mode engaged', 'warn', 'video');
    }
  }, [diagnosticsLog, theaterModeStore, videoSourceSize]);

  useEffect(() => {
    if (videoViewMode === 'inline') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setVideoPresentationMode('inline');
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [setVideoPresentationMode, videoViewMode]);

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

  const markVideoSyncGrace = useCallback((durationMs = VIDEO_SYNC_GRACE_MS) => {
    videoSyncGraceUntilRef.current = Math.max(
      videoSyncGraceUntilRef.current,
      performance.now() + durationMs,
    );
  }, []);

  const setVideoPlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    const nextRate = Math.max(0.1, rate);
    if (Math.abs(lastVideoRateRef.current - nextRate) < 0.005) return;
    video.playbackRate = nextRate;
    lastVideoRateRef.current = nextRate;
  }, []);

  const hardSyncVideo = useCallback((targetTime: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(targetTime)) return;

    const nextTime = Math.max(0, targetTime);
    if (Math.abs(video.currentTime - nextTime) <= 0.01) return;

    videoSeekPendingRef.current = true;
    videoPendingPlayRef.current = transportRef.current.isPlaying;
    markVideoSyncGrace();
    video.currentTime = nextTime;
    lastVideoHardSyncAtRef.current = performance.now();
  }, [markVideoSyncGrace]);

  const playVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      videoPendingPlayRef.current = true;
      markVideoSyncGrace();
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
        markVideoSyncGrace(250);
        logVideoEvent('play-interrupted', 'video play deferred while seek settles', 'dim', 2500);
        return;
      }
      logVideoEvent('play-reject', 'video play request was blocked by the runtime', 'warn', 4000);
    });
  }, [logVideoEvent, markVideoSyncGrace]);

  const onToggleTheater = useCallback(() => {
    setVideoPresentationMode(videoViewModeRef.current === 'theater' ? 'inline' : 'theater');
  }, [setVideoPresentationMode]);

  const onToggleFullscreen = useCallback(() => {
    setVideoPresentationMode(videoViewModeRef.current === 'full' ? 'inline' : 'full');
  }, [setVideoPresentationMode]);

  const clearVideoPreview = useCallback(() => {
    setVideoPresentationMode('inline', false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    setVideoUrlSession(null);
  }, [setVideoPresentationMode, setVideoUrlSession]);

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

  const onVideoCanPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    videoSeekPendingRef.current = false;
    markVideoSyncGrace(250);
    hardSyncVideo(audioEngine.currentTime);
    setVideoPlaybackRate(transportRef.current.playbackRate);
    if (transportRef.current.isPlaying || videoPendingPlayRef.current) {
      playVideo();
    }
  }, [audioEngine, hardSyncVideo, markVideoSyncGrace, playVideo, setVideoPlaybackRate]);

  const onVideoSeeking = useCallback(() => {
    videoSeekPendingRef.current = true;
    markVideoSyncGrace();
  }, [markVideoSyncGrace]);

  const onVideoSeeked = useCallback(() => {
    videoSeekPendingRef.current = false;
    markVideoSyncGrace(250);
    setVideoPlaybackRate(transportRef.current.playbackRate);
    if (transportRef.current.isPlaying || videoPendingPlayRef.current) {
      playVideo();
    } else {
      videoPendingPlayRef.current = false;
    }
  }, [markVideoSyncGrace, playVideo, setVideoPlaybackRate]);

  const onVideoPlaying = useCallback(() => {
    logVideoEvent('playing', 'video preview playing', 'info', 2000);
  }, [logVideoEvent]);

  const onVideoWaiting = useCallback(() => {
    const video = videoRef.current;
    const now = performance.now();
    if (videoSeekPendingRef.current || now < videoSyncGraceUntilRef.current) {
      logVideoEvent('waiting-settle', 'video seek settling', 'dim', 2500);
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
    logVideoEvent('waiting', 'video waiting for decode / buffer', 'warn');
  }, [logVideoEvent]);

  const onVideoStalled = useCallback(() => {
    const video = videoRef.current;
    const now = performance.now();
    if (videoSeekPendingRef.current || now < videoSyncGraceUntilRef.current) {
      logVideoEvent('stalled-settle', 'video still settling after seek', 'dim', 2500);
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
    logVideoEvent('stalled', 'video stalled', 'warn');
  }, [logVideoEvent]);

  const onVideoEnded = useCallback(() => {
    videoPendingPlayRef.current = false;
    videoSeekPendingRef.current = false;
    if (isFullFileLoopActive(transportRef.current)) {
      logVideoEvent('loop-wrap', 'video loop wrap', 'dim', 2000);
      return;
    }
    logVideoEvent('ended', 'video preview reached end', 'dim', 2500);
  }, [logVideoEvent]);

  const onVideoError = useCallback(() => {
    const code = videoRef.current?.error?.code;
    logVideoEvent('error', `video error${code ? ` code ${code}` : ''}`, 'warn', 4000);
  }, [logVideoEvent]);

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

    setVideoPlaybackRate(transport.playbackRate);

    if (transport.scrubActive) {
      videoPendingPlayRef.current = false;
      video.pause();
      hardSyncVideo(transport.currentTime);
      return;
    }

    if (transport.isPlaying) {
      hardSyncVideo(audioEngine.currentTime);
      playVideo();
    } else {
      videoPendingPlayRef.current = false;
      video.pause();
      if (audioEngine.currentTime === 0) {
        hardSyncVideo(0);
      }
    }
  }, [audioEngine, hardSyncVideo, playVideo, setVideoPlaybackRate, transport.currentTime, transport.isPlaying, transport.playbackRate, transport.scrubActive, videoUrl]);

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
      const highResExpanded = videoViewModeRef.current !== 'inline' && isHighResVideo(videoSourceSize);
      const softSyncDrift = highResExpanded ? HIGH_RES_SOFT_SYNC_DRIFT_S : VIDEO_SOFT_SYNC_DRIFT_S;
      const hardSyncDrift = highResExpanded ? HIGH_RES_HARD_SYNC_DRIFT_S : VIDEO_HARD_SYNC_DRIFT_S;
      const rateTrimGain = highResExpanded ? HIGH_RES_RATE_TRIM_GAIN : VIDEO_RATE_TRIM_GAIN;
      const rateTrimMax = highResExpanded ? HIGH_RES_RATE_TRIM_MAX : VIDEO_RATE_TRIM_MAX;

      if (
        video.seeking ||
        videoSeekPendingRef.current ||
        now < videoSyncGraceUntilRef.current ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        setVideoPlaybackRate(baseRate);
        return;
      }

      if (video.ended && currentTime <= VIDEO_END_TAIL_S) {
        setVideoPlaybackRate(baseRate);
        return;
      }

      if (
        absDrift >= hardSyncDrift &&
        now - lastVideoHardSyncAtRef.current >= VIDEO_HARD_SYNC_COOLDOWN_MS
      ) {
        hardSyncVideo(currentTime);
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
        setVideoPlaybackRate(baseRate);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [audioEngine, hardSyncVideo, logVideoEvent, setVideoPlaybackRate, videoSourceSize, videoUrl]);

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
      lastVideoHardSyncAtRef.current = 0;
      videoEventTimesRef.current = {};
      videoSyncGraceUntilRef.current = 0;
      videoSeekPendingRef.current = false;
      videoPendingPlayRef.current = false;
    });
  }, [audioEngine, clearFileInput, clearVideoPreview]);

  const handleFile = useCallback(async (file: File) => {
    clearVideoPreview();
    setVideoResolution(null);
    setVideoSourceSize(null);
    videoEventTimesRef.current = {};
    lastVideoRateRef.current = 1;
    lastVideoHardSyncAtRef.current = 0;
    videoSyncGraceUntilRef.current = 0;
    videoSeekPendingRef.current = false;
    videoPendingPlayRef.current = false;

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
  }, [audioEngine, clearFileInput, clearVideoPreview, diagnosticsLog, onFileLoaded, setVideoUrlSession]);

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
    setVideoPlaybackRate(audioEngine.playbackRate);
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
    }
    hardSyncVideo(seekTo);
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
  const videoOverlayActive = videoViewMode !== 'inline';
  const showTheaterHint = videoViewMode === 'theater';
  const showFullscreenHint = videoViewMode === 'full';

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
          onClick={videoOverlayActive ? () => setVideoPresentationMode('inline') : undefined}
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
            <button
              style={{ ...videoFsButtonStyle, ...(videoViewMode === 'theater' ? videoFsButtonActiveStyle : {}) }}
              onClick={onToggleTheater}
              title={videoViewMode === 'theater' ? 'Return to inline preview' : 'Open theater mode'}
            >
              THR
            </button>
            <button
              style={{ ...videoFsButtonStyle, ...(videoViewMode === 'full' ? videoFsButtonActiveStyle : {}) }}
              onClick={onToggleFullscreen}
              title={videoViewMode === 'full' ? 'Return to inline preview' : 'Open full screen within the app window'}
            >
              FULL
            </button>
          </div>
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
          {!videoOverlayActive && (
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
          disabled={transport.duration === 0}
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
          disabled={!transport.filename}
          title="Stop - return to start"
        >
          STOP
        </button>
        <button
          style={{ ...btnStyle, ...(transport.isPlaying ? btnActiveStyle : {}) }}
          onClick={() => transport.isPlaying ? audioEngine.pause() : audioEngine.play()}
          disabled={!transport.filename}
          title={transport.isPlaying ? 'Pause' : 'Play'}
        >
          {transport.isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
        <button
          style={{ ...btnStyle, ...(hasLoop ? btnActiveStyle : {}) }}
          onClick={onToggleLoop}
          disabled={!transport.filename}
          title={hasLoop ? 'Clear current loop region' : 'Loop the full file'}
        >
          LOOP
        </button>
        <button
          style={{ ...btnStyle, ...btnResetStyle }}
          onClick={() => audioEngine.reset()}
          disabled={!transport.filename}
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





















