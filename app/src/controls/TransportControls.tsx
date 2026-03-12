// ============================================================
// Transport Controls — ingest, play/pause/stop, seek, time readout.
// When a video file is loaded, shows a small muted preview frame.
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAudioEngine } from '../core/session';
import { COLORS, FONTS, SPACING } from '../theme';
import type { TransportState } from '../types';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${ms}`;
}

interface Props {
  onFileLoaded?: () => void;
}

export function TransportControls({ onFileLoaded }: Props): React.ReactElement {
  const audioEngine = useAudioEngine();
  const [transport, setTransport] = useState<TransportState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    filename: null,
    playbackRate: 1,
    loopStart: null,
    loopEnd: null,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const seekInputRef = useRef<HTMLInputElement>(null);
  const seekFillRef = useRef<HTMLDivElement>(null);
  const isSeekingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrlRef = useRef<string | null>(null); // tracks current object URL for revocation
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const lastVideoSyncRef = useRef(0);

  const clearVideoPreview = useCallback(() => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    setVideoUrl(null);
  }, []);

  const clearFileInput = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Sync from engine
  useEffect(() => {
    return audioEngine.onTransport((state) => {
      setTransport(state);
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

  // Play/pause the video element in sync with the audio engine
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    video.playbackRate = transport.playbackRate;
    if (transport.isPlaying) {
      video.currentTime = audioEngine.currentTime;
      void video.play();
    } else {
      video.pause();
      if (transport.currentTime === 0) video.currentTime = 0;
    }
  }, [audioEngine, transport.isPlaying, videoUrl, transport.currentTime, transport.playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    video.playbackRate = transport.playbackRate;
  }, [transport.playbackRate, videoUrl]);

  // RAF loop — keeps seek bar and video in sync without React re-renders
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      if (isSeekingRef.current) return;
      const ct = audioEngine.currentTime;
      const dur = audioEngine.duration;
      if (seekInputRef.current && dur > 0) {
        seekInputRef.current.value = String(ct);
      }
      if (seekFillRef.current && dur > 0) {
        seekFillRef.current.style.width = `${(ct / dur) * 100}%`;
      }
      const video = videoRef.current;
      if (video && videoUrl && transportRef.current.isPlaying) {
        video.playbackRate = audioEngine.playbackRate;
        const drift = Math.abs(video.currentTime - ct);
        if (drift > 0.12 && Math.abs(ct - lastVideoSyncRef.current) > 0.05) {
          video.currentTime = ct;
          lastVideoSyncRef.current = ct;
        }
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [audioEngine, videoUrl]);

  // Throttled time display
  useEffect(() => {
    if (!transport.isPlaying) return;
    const id = setInterval(() => {
      setTransport((prev) => ({ ...prev, currentTime: audioEngine.currentTime }));
    }, 100);
    return () => clearInterval(id);
  }, [audioEngine, transport.isPlaying]);

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);

  useEffect(() => {
    return audioEngine.onReset(() => {
      clearVideoPreview();
      clearFileInput();
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        videoRef.current.playbackRate = 1;
      }
      lastVideoSyncRef.current = 0;
    });
  }, [audioEngine, clearFileInput, clearVideoPreview]);

  const handleFile = useCallback(async (file: File) => {
    // Revoke previous object URL
    clearVideoPreview();

    // Create video preview URL for video files
    if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      videoUrlRef.current = url;
      setVideoUrl(url);
      lastVideoSyncRef.current = 0;
    }

    setIsLoading(true);
    try {
      await audioEngine.load(file);
      onFileLoaded?.();
    } finally {
      clearFileInput();
      setIsLoading(false);
    }
  }, [audioEngine, clearFileInput, clearVideoPreview, onFileLoaded]);

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
  }, []);

  const onSeekPointerUp = useCallback(() => {
    isSeekingRef.current = false;
    const input = seekInputRef.current;
    if (!input || transportRef.current.duration === 0) return;
    const seekTo = parseFloat(input.value);
    audioEngine.seek(seekTo);
    if (videoRef.current) videoRef.current.currentTime = seekTo;
    lastVideoSyncRef.current = seekTo;
  }, [audioEngine]);

  const onSeekInput = useCallback(() => {
    const input = seekInputRef.current;
    const fill = seekFillRef.current;
    if (!input || !fill || transportRef.current.duration === 0) return;
    const fraction = parseFloat(input.value) / transportRef.current.duration;
    fill.style.width = `${fraction * 100}%`;
    // Scrub video frame while dragging
    if (videoRef.current) videoRef.current.currentTime = parseFloat(input.value);
    lastVideoSyncRef.current = parseFloat(input.value);
  }, []);

  const seekFraction = transport.duration > 0 ? transport.currentTime / transport.duration : 0;

  return (
    <div style={wrapStyle}>
      {/* Ingest zone */}
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
          <span style={ingestTextStyle}>DROP AUDIO / VIDEO — OR CLICK TO OPEN</span>
        )}
      </div>

      {/* Video preview — shown only for video files */}
      {videoUrl && (
        <div style={videoWrapStyle}>
          <video
            ref={videoRef}
            src={videoUrl}
            muted
            preload="auto"
            playsInline
            style={videoStyle}
          />
        </div>
      )}

      {/* Time display */}
      <div style={timeRowStyle}>
        <span style={timeStyle}>{formatTime(transport.currentTime)}</span>
        <span style={timeSepStyle}>/</span>
        <span style={{ ...timeStyle, color: COLORS.textDim }}>{formatTime(transport.duration)}</span>
      </div>

      {/* Seek bar */}
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
          onInput={onSeekInput}
        />
      </div>

      {/* Loop region indicator */}
      {transport.loopStart !== null && transport.loopEnd !== null && (
        <div style={loopRowStyle}>
          <span style={loopLabelStyle}>LOOP</span>
          <span style={loopTimeStyle}>
            {formatTime(transport.loopStart)} → {formatTime(transport.loopEnd)}
          </span>
          <button
            style={loopClearStyle}
            onClick={() => audioEngine.clearLoop()}
            title="Clear loop region"
          >
            ✕
          </button>
        </div>
      )}

      {/* Transport buttons */}
      <div style={buttonRowStyle}>
        <button
          style={btnStyle}
          onClick={() => audioEngine.stop()}
          disabled={!transport.filename}
          title="Stop — return to start"
        >
          ■
        </button>
        <button
          style={{ ...btnStyle, ...(transport.isPlaying ? btnActiveStyle : {}) }}
          onClick={() => transport.isPlaying ? audioEngine.pause() : audioEngine.play()}
          disabled={!transport.filename}
          title={transport.isPlaying ? 'Pause' : 'Play'}
        >
          {transport.isPlaying ? '⏸' : '▶'}
        </button>
        <button
          style={{ ...btnStyle, ...btnResetStyle }}
          onClick={() => audioEngine.reset()}
          disabled={!transport.filename}
          title="Reset — clear file and all visuals"
        >
          ↺ RESET
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
  border: `1px solid ${COLORS.border}`,
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
  // Fixed height; video letterboxes/pillarboxes inside
  height: 120,
};

const videoStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
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
  border: `1px solid ${COLORS.border}`,
  color: COLORS.textPrimary,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeLg,
  padding: `${SPACING.xs}px ${SPACING.sm}px`,
  cursor: 'pointer',
  borderRadius: 2,
  lineHeight: 1,
  outline: 'none',
  transition: 'background 0.1s, border-color 0.1s',
};

const btnActiveStyle: React.CSSProperties = {
  background: COLORS.accentDim,
  borderColor: COLORS.accent,
};

const btnResetStyle: React.CSSProperties = {
  marginLeft: 'auto',          // push to the right side of the button row
  fontSize: FONTS.sizeSm,
  letterSpacing: '0.06em',
  color: COLORS.textSecondary,
  borderColor: COLORS.border,
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
