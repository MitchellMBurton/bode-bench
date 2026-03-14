import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAudioEngine, useDiagnosticsLog } from '../core/session';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import type { FileAnalysis, TransportState } from '../types';
import type { DiagnosticsEntry } from '../diagnostics/logStore';

function formatPlaybackTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function formatKhz(hz: number): string {
  return `${(hz / 1000).toFixed(1)} kHz`;
}

function buildExportName(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `bach-cello-console-log-${y}${m}${d}-${hh}${mm}${ss}.txt`;
}

const SCRUB_SETTLE_MS = 500;
const SCROLL_BOTTOM_SLOP_PX = 12;
const TRANSPORT_END_TAIL_S = 0.35;
const TRANSPORT_LOOP_HEAD_S = 0.2;
const TRANSPORT_SLIDER_SETTLE_MS = 180;

export function DiagnosticsLog(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const diagnosticsLog = useDiagnosticsLog();
  const entries = useSyncExternalStore(
    diagnosticsLog.subscribe,
    diagnosticsLog.getSnapshot,
    diagnosticsLog.getSnapshot,
  );

  const [warnOnly, setWarnOnly] = useState(false);
  const [followTail, setFollowTail] = useState(true);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevTransportRef = useRef<TransportState | null>(null);
  const scrubTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubEndStateRef = useRef<TransportState | null>(null);
  const jumpOriginStateRef = useRef<TransportState | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateLogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pitchLogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRateRef = useRef<number | null>(null);
  const pendingPitchRef = useRef<number | null>(null);

  const visibleEntries = useMemo(() => {
    return warnOnly ? entries.filter((entry) => entry.tone === 'warn') : entries;
  }, [entries, warnOnly]);

  const warnCount = useMemo(() => entries.filter((entry) => entry.tone === 'warn').length, [entries]);
  const exportText = useMemo(() => diagnosticsLog.exportText(visibleEntries), [diagnosticsLog, visibleEntries]);

  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  const setCopyStateWithReset = useCallback((next: 'copied' | 'failed') => {
    setCopyState(next);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopyState('idle');
      copyTimerRef.current = null;
    }, 1600);
  }, []);

  useEffect(() => {
    const analysisBanner = `analysis ${audioEngine.analysisFps} fps / fft ${CANVAS.fftSize}`;
    const hasAnalysisBanner = diagnosticsLog.getSnapshot().some((entry) => {
      return entry.source === 'system' && entry.text === analysisBanner;
    });
    if (!hasAnalysisBanner) {
      diagnosticsLog.push(analysisBanner, 'dim', 'system');
    }

    const flushPendingRate = () => {
      if (pendingRateRef.current === null) return;
      diagnosticsLog.push(`rate ${pendingRateRef.current.toFixed(2)}x`, 'dim', 'transport');
      pendingRateRef.current = null;
    };

    const flushPendingPitch = () => {
      if (pendingPitchRef.current === null) return;
      const pitchLabel = pendingPitchRef.current > 0
        ? `+${pendingPitchRef.current.toFixed(0)}`
        : pendingPitchRef.current.toFixed(0);
      diagnosticsLog.push(`pitch ${pitchLabel} st`, 'dim', 'transport');
      pendingPitchRef.current = null;
    };

    const scheduleRateLog = (value: number) => {
      pendingRateRef.current = value;
      if (rateLogTimerRef.current) clearTimeout(rateLogTimerRef.current);
      rateLogTimerRef.current = setTimeout(() => {
        rateLogTimerRef.current = null;
        flushPendingRate();
      }, TRANSPORT_SLIDER_SETTLE_MS);
    };

    const schedulePitchLog = (value: number) => {
      pendingPitchRef.current = value;
      if (pitchLogTimerRef.current) clearTimeout(pitchLogTimerRef.current);
      pitchLogTimerRef.current = setTimeout(() => {
        pitchLogTimerRef.current = null;
        flushPendingPitch();
      }, TRANSPORT_SLIDER_SETTLE_MS);
    };

    const unsubTransport = audioEngine.onTransport((state) => {
      const prev = prevTransportRef.current;

      if (prev === null) {
        prevTransportRef.current = state;
        if (state.filename) {
          diagnosticsLog.push(`session ${state.filename}`, 'info', 'transport');
        }
        return;
      }

      if (state.filename !== prev.filename) {
        if (scrubTimerRef.current) {
          clearTimeout(scrubTimerRef.current);
          scrubTimerRef.current = null;
        }
        scrubEndStateRef.current = null;
        jumpOriginStateRef.current = null;
        if (rateLogTimerRef.current) {
          clearTimeout(rateLogTimerRef.current);
          rateLogTimerRef.current = null;
        }
        if (pitchLogTimerRef.current) {
          clearTimeout(pitchLogTimerRef.current);
          pitchLogTimerRef.current = null;
        }
        flushPendingRate();
        flushPendingPitch();
        if (state.filename) diagnosticsLog.push(`loaded ${state.filename}`, 'info', 'transport');
        else if (prev.filename) diagnosticsLog.push('reset / cleared session', 'warn', 'transport');
      }

      const endedToStart =
        state.filename &&
        prev.filename === state.filename &&
        prev.isPlaying &&
        !state.isPlaying &&
        state.currentTime <= 0.05 &&
        state.duration > 0 &&
        prev.currentTime >= Math.max(0, state.duration - TRANSPORT_END_TAIL_S);

      if (endedToStart) {
        if (scrubTimerRef.current) {
          clearTimeout(scrubTimerRef.current);
          scrubTimerRef.current = null;
        }
        scrubEndStateRef.current = null;
        jumpOriginStateRef.current = null;
        diagnosticsLog.push(`ended -> ${formatPlaybackTime(state.currentTime)}`, 'dim', 'transport');
        prevTransportRef.current = state;
        return;
      }

      const jumped =
        state.filename &&
        prev.filename === state.filename &&
        Math.abs(state.currentTime - prev.currentTime) > 1.5;

      if (jumped) {
        if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
        jumpOriginStateRef.current = prev;
        scrubEndStateRef.current = state;
        scrubTimerRef.current = setTimeout(() => {
          scrubTimerRef.current = null;
          const jumpOrigin = jumpOriginStateRef.current;
          const settledState = scrubEndStateRef.current;
          jumpOriginStateRef.current = null;
          if (!settledState) return;
          const loopWrapped =
            !!jumpOrigin &&
            jumpOrigin.filename === settledState.filename &&
            jumpOrigin.loopStart !== null &&
            jumpOrigin.loopEnd !== null &&
            settledState.loopStart !== null &&
            settledState.loopEnd !== null &&
            Math.abs(jumpOrigin.loopStart - settledState.loopStart) <= 0.05 &&
            Math.abs(jumpOrigin.loopEnd - settledState.loopEnd) <= 0.05 &&
            jumpOrigin.currentTime >= Math.max(jumpOrigin.loopStart, jumpOrigin.loopEnd - TRANSPORT_END_TAIL_S) &&
            Math.abs(settledState.currentTime - settledState.loopStart) <= TRANSPORT_LOOP_HEAD_S;

          if (loopWrapped) {
            diagnosticsLog.push(`loop wrap -> ${formatPlaybackTime(settledState.currentTime)}`, 'dim', 'transport');
            prevTransportRef.current = settledState;
            return;
          }

          diagnosticsLog.push(`seek -> ${formatPlaybackTime(settledState.currentTime)}`, 'dim', 'transport');
          if (settledState.isPlaying && !settledState.scrubActive) {
            diagnosticsLog.push(`play @ ${formatPlaybackTime(settledState.currentTime)}`, 'info', 'transport');
          }
        }, SCRUB_SETTLE_MS);
        prevTransportRef.current = state;
        return;
      }

      if (scrubTimerRef.current !== null) {
        scrubEndStateRef.current = state;
        prevTransportRef.current = state;
        return;
      }

      if (!state.scrubActive && !prev.scrubActive && state.isPlaying !== prev.isPlaying) {
        if (state.isPlaying) diagnosticsLog.push(`play @ ${formatPlaybackTime(state.currentTime)}`, 'info', 'transport');
        else diagnosticsLog.push(`pause @ ${formatPlaybackTime(state.currentTime)}`, 'dim', 'transport');
      }

      if (Math.abs(state.playbackRate - prev.playbackRate) > 0.001) {
        scheduleRateLog(state.playbackRate);
      }

      if (Math.abs(state.pitchSemitones - prev.pitchSemitones) > 0.001) {
        schedulePitchLog(state.pitchSemitones);
      }

      if (state.pitchShiftAvailable !== prev.pitchShiftAvailable) {
        if (rateLogTimerRef.current) {
          clearTimeout(rateLogTimerRef.current);
          rateLogTimerRef.current = null;
        }
        if (pitchLogTimerRef.current) {
          clearTimeout(pitchLogTimerRef.current);
          pitchLogTimerRef.current = null;
        }
        flushPendingRate();
        flushPendingPitch();
        diagnosticsLog.push(
          state.pitchShiftAvailable
            ? 'studio pitch shift online'
            : 'studio pitch shift unavailable, native playback fallback active',
          state.pitchShiftAvailable ? 'info' : 'warn',
          'transport',
        );
      }

      prevTransportRef.current = state;
    });

    const unsubFile = audioEngine.onFileReady((analysis: FileAnalysis) => {
      const rateMismatch = Math.abs(analysis.decodedSampleRate - analysis.contextSampleRate) > 1;
      diagnosticsLog.push(
        `decode ctx ${formatKhz(analysis.contextSampleRate)} / buf ${formatKhz(analysis.decodedSampleRate)} / ch ${analysis.channels} / dur ${formatPlaybackTime(analysis.duration)}`,
        rateMismatch ? 'warn' : 'info',
        'decode',
      );
      if (analysis.channels > 2) {
        diagnosticsLog.push(`multichannel ${analysis.channels}ch -> explicit stereo downmix active`, 'warn', 'decode');
      }
      diagnosticsLog.push(
        `crest ${analysis.crestFactorDb.toFixed(1)} dB / peak ${analysis.peakDb.toFixed(1)} dBFS / rms ${analysis.rmsDb.toFixed(1)} dBFS`,
        'dim',
        'decode',
      );
      if (rateMismatch) {
        diagnosticsLog.push('decoded sample rate differs from audio context rate', 'warn', 'decode');
      }
    });

    const unsubReset = audioEngine.onReset(() => {
      prevTransportRef.current = null;
      if (scrubTimerRef.current) {
        clearTimeout(scrubTimerRef.current);
        scrubTimerRef.current = null;
      }
      scrubEndStateRef.current = null;
      jumpOriginStateRef.current = null;
      if (rateLogTimerRef.current) {
        clearTimeout(rateLogTimerRef.current);
        rateLogTimerRef.current = null;
      }
      if (pitchLogTimerRef.current) {
        clearTimeout(pitchLogTimerRef.current);
        pitchLogTimerRef.current = null;
      }
      pendingRateRef.current = null;
      pendingPitchRef.current = null;
      diagnosticsLog.push('visuals reset', 'warn', 'system');
    });

    return () => {
      unsubTransport();
      unsubFile();
      unsubReset();
      if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
      if (rateLogTimerRef.current) clearTimeout(rateLogTimerRef.current);
      if (pitchLogTimerRef.current) clearTimeout(pitchLogTimerRef.current);
      jumpOriginStateRef.current = null;
    };
  }, [audioEngine, diagnosticsLog]);

  useEffect(() => {
    if (followTail) scrollToBottom();
  }, [followTail, visibleEntries, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (rateLogTimerRef.current) clearTimeout(rateLogTimerRef.current);
      if (pitchLogTimerRef.current) clearTimeout(pitchLogTimerRef.current);
    };
  }, []);

  const onScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    setFollowTail(distanceFromBottom <= SCROLL_BOTTOM_SLOP_PX);
  }, []);

  const onToggleFollow = useCallback(() => {
    setFollowTail((prev) => {
      const next = !prev;
      if (next) requestAnimationFrame(scrollToBottom);
      return next;
    });
  }, [scrollToBottom]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyStateWithReset('copied');
    } catch {
      setCopyStateWithReset('failed');
    }
  }, [exportText, setCopyStateWithReset]);

  const onSave = useCallback(() => {
    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildExportName();
    link.click();
    URL.revokeObjectURL(url);
  }, [exportText]);

  const onClear = useCallback(() => {
    diagnosticsLog.clear();
    prevTransportRef.current = null;
  }, [diagnosticsLog]);

  const emptyText = warnOnly ? 'No warning entries yet.' : 'Awaiting file diagnostics...';

  return (
    <div style={wrapStyle}>
      <div style={headerRowStyle}>
        <div style={titleGroupStyle}>
          <div style={headerStyle}>TRACE / DIAGNOSTICS</div>
          <div style={metaStyle}>{visibleEntries.length}/{entries.length} visible · {warnCount} warn</div>
        </div>
        <div style={actionsStyle}>
          <button style={{ ...actionButtonStyle, ...(warnOnly ? actionButtonActiveStyle : {}) }} onClick={() => setWarnOnly((prev) => !prev)}>
            WARN ONLY
          </button>
          <button style={{ ...actionButtonStyle, ...(followTail ? actionButtonActiveStyle : {}) }} onClick={onToggleFollow}>
            {followTail ? 'FOLLOW' : 'REVIEW'}
          </button>
          <button style={actionButtonStyle} onClick={onCopy}>
            {copyState === 'copied' ? 'COPIED' : copyState === 'failed' ? 'COPY FAIL' : 'COPY'}
          </button>
          <button style={actionButtonStyle} onClick={onSave}>SAVE TXT</button>
          <button style={actionButtonStyle} onClick={onClear}>CLEAR</button>
        </div>
      </div>
      <div ref={scrollRef} style={scrollStyle} onScroll={onScroll}>
        {visibleEntries.length === 0 ? (
          <div style={emptyLineStyle}>{emptyText}</div>
        ) : (
          visibleEntries.map((entry) => (
            <DiagnosticsLine key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}

function DiagnosticsLine({ entry }: { entry: DiagnosticsEntry }): React.ReactElement {
  const toneColor =
    entry.tone === 'warn'
      ? COLORS.statusWarn
      : entry.tone === 'info'
        ? COLORS.textPrimary
        : COLORS.textSecondary;

  return (
    <div style={lineStyle}>
      <span style={clockStyle}>{entry.clock}</span>
      <span style={sourceStyle}>{entry.source.toUpperCase()}</span>
      <span style={{ ...messageStyle, color: toneColor }}>{entry.text}</span>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 160,
  flex: 1,
  borderTop: `1px solid ${COLORS.border}`,
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: SPACING.sm,
  padding: `${SPACING.xs}px ${SPACING.md}px`,
  background: COLORS.bg1,
  borderBottom: `1px solid ${COLORS.border}`,
  flexShrink: 0,
};

const titleGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const headerStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.1em',
  color: COLORS.textCategory,
};

const metaStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textDim,
  letterSpacing: '0.04em',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: SPACING.xs,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

const actionButtonStyle: React.CSSProperties = {
  background: COLORS.bg3,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: COLORS.border,
  color: COLORS.textSecondary,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.08em',
  padding: `${SPACING.xs}px ${SPACING.sm}px`,
  cursor: 'pointer',
  borderRadius: 2,
  outline: 'none',
};

const actionButtonActiveStyle: React.CSSProperties = {
  color: COLORS.textPrimary,
  borderColor: COLORS.borderActive,
  background: COLORS.bg2,
};

const scrollStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  background: COLORS.bg2,
  padding: `${SPACING.sm}px ${SPACING.md}px`,
};

const emptyLineStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  lineHeight: 1.6,
  letterSpacing: '0.03em',
  color: COLORS.textDim,
};

const lineStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '62px 62px minmax(0, 1fr)',
  gap: SPACING.sm,
  alignItems: 'start',
  paddingBottom: 2,
};

const clockStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textDim,
  lineHeight: 1.55,
};

const sourceStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  lineHeight: 1.55,
  letterSpacing: '0.04em',
};

const messageStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  lineHeight: 1.55,
  letterSpacing: '0.03em',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

