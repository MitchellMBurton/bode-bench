import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  useAudioEngine,
  useDiagnosticsLog,
  usePerformanceDiagnosticsStore,
  usePerformanceProfile,
  usePerformanceProfileStore,
} from '../core/session';
import type { PerformanceProfilePreference } from '../runtime/performanceProfile';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import type { FileAnalysis, TransportState } from '../types';
import type { DiagnosticsEntry, PerformanceDiagnosticsSnapshot, PerformanceEvent, PerformanceTraceSample } from '../diagnostics/logStore';

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
const PERFORMANCE_PROFILE_OPTIONS: ReadonlyArray<{
  readonly value: PerformanceProfilePreference;
  readonly label: string;
  readonly detail: string;
}> = [
  { value: 'auto', label: 'AUTO', detail: 'runtime decides' },
  { value: 'web-safe', label: 'WEB SAFE', detail: 'browser budget' },
  { value: 'desktop-high', label: 'DESKTOP HIGH', detail: 'installed headroom' },
];

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
          if (state.playbackBackend === 'streamed') {
            diagnosticsLog.push('streamed large-media mode active', 'warn', 'transport');
          }
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
        if (state.filename && state.playbackBackend === 'streamed') {
          diagnosticsLog.push('streamed large-media mode active', 'warn', 'transport');
        }
      }

      if (state.playbackBackend !== prev.playbackBackend && state.filename) {
        diagnosticsLog.push(
          state.playbackBackend === 'streamed'
            ? 'streamed large-media mode active'
            : 'decoded studio mode active',
          state.playbackBackend === 'streamed' ? 'warn' : 'info',
          'transport',
        );
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


function formatPerfMs(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(digits)} ms`;
}

function formatPerfSignedMs(value: number): string {
  if (!Number.isFinite(value)) return '--';
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded} ms`;
}

function clampMeter(value: number, max: number): number {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function formatTraceSpan(samples: readonly PerformanceTraceSample[]): string {
  if (samples.length < 2) return 'LIVE';
  const durationMs = Math.max(0, samples[samples.length - 1].atMs - samples[0].atMs);
  if (durationMs < 1000) return '<1s';
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function inferPerformanceHealth(snapshot: PerformanceDiagnosticsSnapshot): {
  readonly title: string;
  readonly detail: string;
  readonly tone: 'dim' | 'info' | 'warn';
} {
  if (snapshot.videoRecoveryCount > 0 || snapshot.videoStallCount > 0) {
    return {
      title: 'VIDEO DECODE PRESSURE',
      detail: 'The preview has needed recovery or stalled events. Focus on video waiting, ready state, and drift correction churn.',
      tone: 'warn',
    };
  }
  if (snapshot.uiJankPercent >= 14 || snapshot.uiFrameP95Ms >= 24) {
    return {
      title: 'UI THREAD SATURATION',
      detail: 'Frame pacing is inconsistent. Look for expensive React work, layout churn, or heavy canvas redraws during interaction.',
      tone: 'warn',
    };
  }
  if (snapshot.lastLongTaskMs !== null && snapshot.lastLongTaskMs >= 40) {
    return {
      title: 'MAIN THREAD SPIKE',
      detail: 'A long task was captured. That usually points to decode, heavy JS, or a layout/paint spike blocking input and video.',
      tone: 'warn',
    };
  }
  if (snapshot.lastLoad && snapshot.lastLoad.totalMs >= 1200) {
    return {
      title: 'LOAD PIPELINE HEAVY',
      detail: 'File ingest is taking a while. Decode or stretch preparation may be the biggest cost for the current media.',
      tone: 'info',
    };
  }
  if (Math.abs(snapshot.videoDriftMs) >= 70 || snapshot.videoCatchupActive) {
    return {
      title: 'SYNC CORRECTION ACTIVE',
      detail: 'The preview is still catching back up after a transport or settings change. Watch drift, wait events, and hard sync counts.',
      tone: 'info',
    };
  }
  return {
    title: 'NO DOMINANT BOTTLENECK',
    detail: 'The runtime looks steady right now. If stutter appears, leave this panel open and reproduce it to capture the culprit.',
    tone: 'dim',
  };
}

function buildPerformanceExport(snapshot: PerformanceDiagnosticsSnapshot): string {
  const health = inferPerformanceHealth(snapshot);
  const lines = [
    'Bach Cello Console Performance Snapshot',
    `${health.title} :: ${health.detail}`,
    '',
    `Session      ${snapshot.filename ?? 'NO SESSION'}`,
    `UI FPS       ${snapshot.uiFps.toFixed(1)}`,
    `UI AVG       ${formatPerfMs(snapshot.uiFrameAvgMs)}`,
    `UI P95       ${formatPerfMs(snapshot.uiFrameP95Ms)}`,
    `Jank         ${snapshot.uiJankPercent.toFixed(1)}%`,
    `Long Tasks   ${snapshot.longTaskCount}${snapshot.lastLongTaskMs !== null ? ` / last ${formatPerfMs(snapshot.lastLongTaskMs, 0)}` : ''}`,
    `Video State  ${snapshot.videoState.toUpperCase()}`,
    `Video Drift  ${formatPerfSignedMs(snapshot.videoDriftMs)}`,
    `Video Rate   ${snapshot.videoPreviewRate.toFixed(2)}x`,
    `Ready State  ${snapshot.videoReadyState}`,
    `Catchup      ${snapshot.videoCatchupActive ? 'ACTIVE' : 'IDLE'}`,
    `Hard Syncs   ${snapshot.videoHardSyncCount}`,
    `Recoveries   ${snapshot.videoRecoveryCount}`,
    `Wait/Stall   ${snapshot.videoWaitCount} / ${snapshot.videoStallCount}`,
    `Transport    ${snapshot.transportRate.toFixed(2)}x / ${snapshot.pitchSemitones.toFixed(0)} st`,
    `Trace Span   ${formatTraceSpan(snapshot.trace)}`,
  ];

  if (snapshot.lastLoad) {
    lines.push(`Load         ${snapshot.lastLoad.totalMs.toFixed(0)} ms total / ${snapshot.lastLoad.decodeMs.toFixed(0)} ms decode / ${snapshot.lastLoad.stretchMs.toFixed(0)} ms stretch / ${snapshot.lastLoad.channels}ch`);
  }

  lines.push('', 'Recent Signals');
  for (const event of snapshot.recentEvents.slice(-16)) {
    lines.push(`${event.clock}  [${event.source.toUpperCase()}]  ${event.text}`);
  }
  return lines.join('\n');
}

export function PerformanceDiagnostics(): React.ReactElement {
  const performanceDiagnostics = usePerformanceDiagnosticsStore();
  const performanceProfileStore = usePerformanceProfileStore();
  const performanceProfile = usePerformanceProfile();
  const snapshot = useSyncExternalStore(
    performanceDiagnostics.subscribe,
    performanceDiagnostics.getSnapshot,
    performanceDiagnostics.getSnapshot,
  );
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const health = useMemo(() => inferPerformanceHealth(snapshot), [snapshot]);
  const traceSamples = useMemo(() => snapshot.trace, [snapshot.trace]);
  const recentEvents = useMemo(() => [...snapshot.recentEvents].slice(-12).reverse(), [snapshot.recentEvents]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const setCopyStateWithReset = useCallback((next: 'copied' | 'failed') => {
    setCopyState(next);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopyState('idle');
      copyTimerRef.current = null;
    }, 1600);
  }, []);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildPerformanceExport(snapshot));
      setCopyStateWithReset('copied');
    } catch {
      setCopyStateWithReset('failed');
    }
  }, [setCopyStateWithReset, snapshot]);

  const onClear = useCallback(() => {
    performanceDiagnostics.clearEvents();
  }, [performanceDiagnostics]);

  const onSetProfilePreference = useCallback((next: PerformanceProfilePreference) => {
    performanceProfileStore.setPreference(next);
  }, [performanceProfileStore]);

  const healthColor =
    health.tone === 'warn'
      ? COLORS.statusWarn
      : health.tone === 'info'
        ? COLORS.textPrimary
        : COLORS.textSecondary;

  return (
    <div style={perfWrapStyle}>
      <div style={perfHeaderStyle}>
        <div style={perfHeaderTextStyle}>
          <div style={perfEyebrowStyle}>PERF LAB / INTERNAL TELEMETRY</div>
          <div style={{ ...perfHealthTitleStyle, color: healthColor }}>{health.title}</div>
          <div style={perfHealthDetailStyle}>{health.detail}</div>
        </div>
        <div style={perfActionsStyle}>
          <button style={actionButtonStyle} onClick={onCopy}>
            {copyState === 'copied' ? 'COPIED' : copyState === 'failed' ? 'COPY FAIL' : 'COPY SNAPSHOT'}
          </button>
          <button style={actionButtonStyle} onClick={onClear}>CLEAR TRACE</button>
        </div>
      </div>

      <div style={perfProfileRailStyle}>
        <div style={perfProfileSummaryStyle}>
          <div style={perfSectionTitleStyle}>PERFORMANCE PROFILE</div>
          <div style={perfProfileActiveStyle}>
            {performanceProfile.label}
            <span style={perfProfileMetaStyle}>
              {performanceProfile.runtimeKind.toUpperCase()} / {performanceProfile.preference.toUpperCase()}
            </span>
          </div>
          <div style={perfProfileDetailStyle}>{performanceProfile.summary}</div>
        </div>
        <div style={perfProfileButtonGroupStyle}>
          {PERFORMANCE_PROFILE_OPTIONS.map((option) => (
            <button
              key={option.value}
              style={{
                ...actionButtonStyle,
                ...(performanceProfile.preference === option.value ? actionButtonActiveStyle : {}),
              }}
              onClick={() => onSetProfilePreference(option.value)}
              title={option.detail}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div style={perfCardGridStyle}>
        <PerformanceStatCard
          label="UI PACE"
          value={`${snapshot.uiFps.toFixed(0)} FPS`}
          detail={`avg ${formatPerfMs(snapshot.uiFrameAvgMs)} / p95 ${formatPerfMs(snapshot.uiFrameP95Ms)}`}
          tone={snapshot.uiFrameP95Ms >= 24 || snapshot.uiJankPercent >= 14 ? 'warn' : 'dim'}
        />
        <PerformanceStatCard
          label="VIDEO SYNC"
          value={formatPerfSignedMs(snapshot.videoDriftMs)}
          detail={`${snapshot.videoState.toUpperCase()} / preview ${snapshot.videoPreviewRate.toFixed(2)}x`}
          tone={snapshot.videoState === 'waiting' || snapshot.videoState === 'stalled' ? 'warn' : snapshot.videoCatchupActive ? 'info' : 'dim'}
        />
        <PerformanceStatCard
          label="TRANSPORT"
          value={`${snapshot.transportRate.toFixed(2)}x / ${snapshot.pitchSemitones.toFixed(0)} st`}
          detail={snapshot.transportPlaying ? 'playing' : 'paused'}
          tone="dim"
        />
        <PerformanceStatCard
          label="LOAD"
          value={snapshot.lastLoad ? `${snapshot.lastLoad.totalMs.toFixed(0)} ms` : '--'}
          detail={snapshot.lastLoad ? `${snapshot.lastLoad.decodeMs.toFixed(0)} ms decode / ${snapshot.lastLoad.stretchMs.toFixed(0)} ms stretch` : 'Awaiting media load'}
          tone={snapshot.lastLoad && snapshot.lastLoad.totalMs >= 1200 ? 'warn' : snapshot.lastLoad && snapshot.lastLoad.totalMs >= 900 ? 'info' : 'dim'}
        />
        <PerformanceStatCard
          label="PROFILE"
          value={performanceProfile.label}
          detail={`${performanceProfile.runtimeKind.toUpperCase()} / ${performanceProfile.preference.toUpperCase()}`}
          tone={performanceProfile.activeProfile === 'desktop-high' ? 'info' : 'dim'}
        />
        <PerformanceStatCard
          label="RECOVERY"
          value={`${snapshot.videoHardSyncCount} HS / ${snapshot.videoRecoveryCount} RC`}
          detail={`${snapshot.videoWaitCount} waits / ${snapshot.videoStallCount} stalls / ready ${snapshot.videoReadyState}`}
          tone={snapshot.videoRecoveryCount > 0 || snapshot.videoStallCount > 0 ? 'warn' : snapshot.videoHardSyncCount > 0 ? 'info' : 'dim'}
        />
      </div>

      <PerformanceTracePanel samples={traceSamples} events={snapshot.recentEvents} />

      <div style={perfBodyStyle}>
        <div style={perfPanelStyle}>
          <div style={perfSectionTitleStyle}>PRESSURE MAP</div>
          <PerformanceMeter label="UI P95" value={snapshot.uiFrameP95Ms} max={40} detail={formatPerfMs(snapshot.uiFrameP95Ms)} tone={snapshot.uiFrameP95Ms >= 24 ? 'warn' : 'dim'} />
          <PerformanceMeter label="JANK" value={snapshot.uiJankPercent} max={30} detail={`${snapshot.uiJankPercent.toFixed(1)}%`} tone={snapshot.uiJankPercent >= 14 ? 'warn' : 'dim'} />
          <PerformanceMeter label="DRIFT" value={Math.abs(snapshot.videoDriftMs)} max={240} detail={formatPerfSignedMs(snapshot.videoDriftMs)} tone={Math.abs(snapshot.videoDriftMs) >= 90 ? 'warn' : snapshot.videoCatchupActive ? 'info' : 'dim'} />
          <PerformanceMeter label="LONG TASK" value={snapshot.lastLongTaskMs ?? 0} max={120} detail={snapshot.lastLongTaskMs !== null ? formatPerfMs(snapshot.lastLongTaskMs, 0) : '--'} tone={(snapshot.lastLongTaskMs ?? 0) >= 40 ? 'warn' : 'dim'} />
          <PerformanceMeter label="LOAD" value={snapshot.lastLoad?.totalMs ?? 0} max={2400} detail={snapshot.lastLoad ? `${snapshot.lastLoad.totalMs.toFixed(0)} ms` : '--'} tone={snapshot.lastLoad && snapshot.lastLoad.totalMs >= 1200 ? 'warn' : snapshot.lastLoad && snapshot.lastLoad.totalMs >= 900 ? 'info' : 'dim'} />
        </div>

        <div style={perfPanelStyle}>
          <div style={perfSectionTitleStyle}>RECENT SIGNALS</div>
          <div style={perfEventsStyle}>
            {recentEvents.length === 0 ? (
              <div style={perfEmptyStyle}>Open this panel, reproduce the stutter, and the runtime trace will collect the last few important signals here.</div>
            ) : (
              recentEvents.map((event) => <PerformanceEventLine key={event.id} event={event} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PerformanceStatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'dim' | 'info' | 'warn';
}): React.ReactElement {
  const accent =
    tone === 'warn'
      ? COLORS.statusWarn
      : tone === 'info'
        ? COLORS.borderHighlight
        : COLORS.border;

  return (
    <div style={{ ...perfCardStyle, borderColor: accent }}>
      <div style={perfCardLabelStyle}>{label}</div>
      <div style={{ ...perfCardValueStyle, color: tone === 'warn' ? COLORS.textPrimary : COLORS.textTitle }}>{value}</div>
      <div style={perfCardDetailStyle}>{detail}</div>
    </div>
  );
}

function PerformanceMeter({
  label,
  value,
  max,
  detail,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  detail: string;
  tone: 'dim' | 'info' | 'warn';
}): React.ReactElement {
  const fill = clampMeter(value, max);
  const fillColor =
    tone === 'warn'
      ? 'linear-gradient(90deg, rgba(176,144,48,0.85), rgba(200,146,42,0.92))'
      : tone === 'info'
        ? 'linear-gradient(90deg, rgba(80,96,192,0.8), rgba(120,154,255,0.88))'
        : 'linear-gradient(90deg, rgba(64,64,88,0.72), rgba(96,96,120,0.8))';

  return (
    <div style={perfMeterWrapStyle}>
      <div style={perfMeterHeaderStyle}>
        <span style={perfMeterLabelStyle}>{label}</span>
        <span style={perfMeterValueStyle}>{detail}</span>
      </div>
      <div style={perfMeterTrackStyle}>
        <div style={{ ...perfMeterFillStyle, width: `${fill}%`, background: fillColor }} />
      </div>
    </div>
  );
}

function classifyTraceEvent(event: PerformanceEvent): {
  readonly label: string;
  readonly laneIndex: number;
  readonly tone: 'dim' | 'info' | 'warn';
} | null {
  const text = event.text.toLowerCase();
  if (event.source === 'load') {
    return { label: 'LOAD', laneIndex: 3, tone: event.tone };
  }
  if (event.source === 'ui' && text.includes('long task')) {
    return { label: 'TASK', laneIndex: 2, tone: event.tone };
  }
  if (text.includes('hard resync') || text.includes('drift reset')) {
    return { label: 'LOCK', laneIndex: 1, tone: event.tone };
  }
  if (text.includes('refreshed after') || text.includes('retuning')) {
    return { label: 'RTN', laneIndex: 1, tone: event.tone };
  }
  if (text.includes('waiting')) {
    return { label: 'WAIT', laneIndex: 1, tone: event.tone };
  }
  if (text.includes('stalled')) {
    return { label: 'STALL', laneIndex: 1, tone: event.tone };
  }
  return null;
}

function PerformanceTracePanel({
  samples,
  events,
}: {
  samples: readonly PerformanceTraceSample[];
  events: readonly PerformanceEvent[];
}): React.ReactElement {
  const width = 1280;
  const height = 256;
  const leftRailWidth = 178;
  const rightRailWidth = 108;
  const plotLeft = leftRailWidth + 12;
  const plotRight = rightRailWidth + 12;
  const headerTop = 12;
  const eventBandHeight = 22;
  const plotTop = headerTop + eventBandHeight + 14;
  const laneHeight = 36;
  const laneGap = 8;
  const plotWidth = width - plotLeft - plotRight;
  const latest = samples[samples.length - 1] ?? null;
  const spanLabel = formatTraceSpan(samples);

  if (samples.length < 2 || !latest) {
    return (
      <div style={perfPanelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: SPACING.sm, alignItems: 'baseline' }}>
          <div style={perfSectionTitleStyle}>PERFORMANCE TRACE</div>
          <div style={{ ...perfMeterValueStyle, color: COLORS.textDim }}>LAST {spanLabel}</div>
        </div>
        <div style={perfEmptyStyle}>Keep Perf Lab open while you play, scrub, or retune. This surface will accumulate a rolling performance history over time.</div>
      </div>
    );
  }

  const traceStartAt = samples[0].atMs;
  const traceEndAt = latest.atMs;
  const traceDurationMs = Math.max(1, traceEndAt - traceStartAt);
  const laneTopAt = (laneIndex: number): number => plotTop + laneIndex * (laneHeight + laneGap);
  const plotBottom = laneTopAt(3) + laneHeight;
  const plotHeight = plotBottom - headerTop + 10;
  const xForTime = (atMs: number): number => plotLeft + ((atMs - traceStartAt) / traceDurationMs) * plotWidth;
  const positiveY = (value: number, max: number, top: number): number => {
    const ratio = Math.max(0, Math.min(1, value / max));
    return top + laneHeight - ratio * (laneHeight - 6) - 3;
  };
  const centeredY = (value: number, max: number, top: number): number => {
    const ratio = Math.max(-1, Math.min(1, value / max));
    return top + laneHeight / 2 - ratio * ((laneHeight - 8) * 0.5);
  };
  const buildLinePath = (
    selector: (sample: PerformanceTraceSample) => number,
    max: number,
    laneIndex: number,
    centered = false,
  ): string => {
    const top = laneTopAt(laneIndex);
    return samples
      .map((sample, index) => {
        const x = xForTime(sample.atMs);
        const y = centered ? centeredY(selector(sample), max, top) : positiveY(selector(sample), max, top);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  };
  const buildAreaPath = (
    selector: (sample: PerformanceTraceSample) => number,
    max: number,
    laneIndex: number,
  ): string => {
    const top = laneTopAt(laneIndex);
    const baseline = top + laneHeight - 2;
    const points = samples.map((sample) => `${xForTime(sample.atMs).toFixed(2)} ${positiveY(selector(sample), max, top).toFixed(2)}`);
    if (points.length === 0) return '';
    return `M${plotLeft} ${baseline.toFixed(2)} L${points.join(' L ')} L${xForTime(traceEndAt).toFixed(2)} ${baseline.toFixed(2)} Z`;
  };
  const formatRelativeTick = (fraction: number): string => {
    const remainingMs = Math.max(0, Math.round((1 - fraction) * traceDurationMs));
    if (remainingMs < 1000) return `${remainingMs}ms`;
    const seconds = Math.round(remainingMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remSeconds = seconds % 60;
    return remSeconds === 0 ? `${minutes}m` : `${minutes}m ${String(remSeconds).padStart(2, '0')}s`;
  };

  const lanes = [
    {
      code: 'UI P95',
      subtitle: 'FRAME P95',
      scale: '0..40 ms',
      detail: formatPerfMs(latest.uiFrameP95Ms),
      status: latest.uiFrameP95Ms >= 24 ? 'HOT' : latest.uiFrameP95Ms >= 16 ? 'WATCH' : 'NOMINAL',
      color: '#a8bada',
      fill: 'rgba(74, 96, 140, 0.12)',
      glow: 'rgba(168, 186, 218, 0.14)',
      max: 40,
      selector: (sample: PerformanceTraceSample) => sample.uiFrameP95Ms,
      centered: false,
      threshold: 24,
      statusColor: latest.uiFrameP95Ms >= 24 ? COLORS.waveform : latest.uiFrameP95Ms >= 16 ? COLORS.textTitle : COLORS.textSecondary,
    },
    {
      code: 'SYNC DT',
      subtitle: 'PREVIEW DRIFT',
      scale: '+/-240 ms',
      detail: formatPerfSignedMs(latest.videoDriftMs),
      status: latest.videoCatchupActive ? 'TRIM' : Math.abs(latest.videoDriftMs) >= 90 ? 'OFFSET' : 'LOCKED',
      color: '#8f87c6',
      fill: 'rgba(80, 96, 192, 0.1)',
      glow: 'rgba(143, 135, 198, 0.14)',
      max: 240,
      selector: (sample: PerformanceTraceSample) => sample.videoDriftMs,
      centered: true,
      threshold: 90,
      statusColor: latest.videoCatchupActive ? COLORS.borderHighlight : Math.abs(latest.videoDriftMs) >= 90 ? COLORS.waveform : COLORS.textSecondary,
    },
    {
      code: 'LONG',
      subtitle: 'MAIN THREAD',
      scale: '0..180 ms',
      detail: latest.longTaskPulseMs > 0 ? formatPerfMs(latest.longTaskPulseMs, 0) : '--',
      status: latest.longTaskPulseMs >= 120 ? 'SEVERE' : latest.longTaskPulseMs > 0 ? 'SPIKE' : 'QUIET',
      color: COLORS.waveform,
      fill: 'rgba(200, 146, 42, 0.12)',
      glow: 'rgba(200, 146, 42, 0.14)',
      max: 180,
      selector: (sample: PerformanceTraceSample) => sample.longTaskPulseMs,
      centered: false,
      threshold: 40,
      statusColor: latest.longTaskPulseMs >= 120 ? COLORS.waveform : latest.longTaskPulseMs > 0 ? COLORS.textTitle : COLORS.textSecondary,
    },
    {
      code: 'LOAD',
      subtitle: 'MEDIA LOAD',
      scale: '0..2400 ms',
      detail: latest.loadPulseMs > 0 ? formatPerfMs(latest.loadPulseMs, 0) : '--',
      status: latest.loadPulseMs >= 1200 ? 'HEAVY' : latest.loadPulseMs > 0 ? 'ACTIVE' : 'IDLE',
      color: '#78a888',
      fill: 'rgba(56, 120, 86, 0.12)',
      glow: 'rgba(120, 168, 136, 0.14)',
      max: 2400,
      selector: (sample: PerformanceTraceSample) => sample.loadPulseMs,
      centered: false,
      threshold: 900,
      statusColor: latest.loadPulseMs >= 1200 ? COLORS.waveform : latest.loadPulseMs > 0 ? COLORS.textTitle : COLORS.textSecondary,
    },
  ] as const;

  const contactMarkers = events
    .filter((event) => event.atMs >= traceStartAt)
    .map((event) => {
      const classification = classifyTraceEvent(event);
      if (!classification) return null;
      return {
        ...classification,
        atMs: event.atMs,
      };
    })
    .filter((event): event is { readonly atMs: number; readonly label: string; readonly laneIndex: number; readonly tone: 'dim' | 'info' | 'warn' } => event !== null)
    .slice(-10);

  const tickFractions = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const contactColor = (tone: 'dim' | 'info' | 'warn'): string =>
    tone === 'warn' ? COLORS.waveform : tone === 'info' ? COLORS.borderHighlight : COLORS.textLabel;
  const catchupBandWidth = Math.max(5, plotWidth / Math.max(40, samples.length * 0.92));

  return (
    <div style={perfPanelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: SPACING.sm, alignItems: 'baseline' }}>
        <div style={perfSectionTitleStyle}>PERFORMANCE TRACE</div>
        <div style={{ ...perfMeterValueStyle, color: COLORS.textDim }}>WINDOW {spanLabel} / {samples.length} SAMPLES</div>
      </div>
      <div
        style={{
          border: `1px solid ${COLORS.border}`,
          background: COLORS.bg2,
          padding: `${SPACING.xs}px ${SPACING.xs}px ${SPACING.sm}px`,
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 236 }}>
          <defs>
            <linearGradient id="perfTraceSweepModern" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(80, 96, 192, 0)" />
              <stop offset="72%" stopColor="rgba(80, 96, 192, 0.02)" />
              <stop offset="100%" stopColor="rgba(80, 96, 192, 0.08)" />
            </linearGradient>
            <linearGradient id="perfTraceHeaderModern" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(12, 15, 22, 0.96)" />
              <stop offset="100%" stopColor="rgba(16, 20, 29, 0.92)" />
            </linearGradient>
          </defs>

          <rect x={8} y={headerTop} width={leftRailWidth - 2} height={plotHeight + eventBandHeight + 8} fill="rgba(10, 14, 20, 0.72)" stroke={COLORS.border} strokeOpacity={0.22} />
          <rect x={width - rightRailWidth - 6} y={headerTop} width={rightRailWidth - 2} height={plotHeight + eventBandHeight + 8} fill="rgba(10, 14, 20, 0.72)" stroke={COLORS.border} strokeOpacity={0.22} />
          <rect x={plotLeft} y={headerTop} width={plotWidth} height={plotHeight + eventBandHeight + 8} fill="rgba(8, 12, 18, 0.66)" stroke={COLORS.border} strokeOpacity={0.3} />
          <rect x={plotLeft} y={headerTop} width={plotWidth} height={eventBandHeight} fill="url(#perfTraceHeaderModern)" stroke={COLORS.border} strokeOpacity={0.1} />
          <rect x={width - plotRight - 128} y={headerTop} width={128} height={plotHeight + eventBandHeight + 8} fill="url(#perfTraceSweepModern)" />

          {tickFractions.map((fraction, index) => {
            const x = plotLeft + plotWidth * fraction;
            return (
              <g key={`tick-${fraction}`}>
                <line
                  x1={x}
                  y1={headerTop}
                  x2={x}
                  y2={plotBottom + 8}
                  stroke={COLORS.border}
                  strokeOpacity={index === tickFractions.length - 1 ? 0.34 : 0.1}
                  strokeDasharray={index === tickFractions.length - 1 ? undefined : '2 8'}
                />
                <text
                  x={x}
                  y={plotBottom + 20}
                  fill={COLORS.textDim}
                  fontFamily={FONTS.mono}
                  fontSize={9}
                  textAnchor={index === 0 ? 'start' : index === tickFractions.length - 1 ? 'end' : 'middle'}
                  letterSpacing="0.8"
                >
                  {index === tickFractions.length - 1 ? 'NOW' : `-${formatRelativeTick(fraction)}`}
                </text>
              </g>
            );
          })}

          <text x={24} y={headerTop + 12} fill={COLORS.textCategory} fontFamily={FONTS.mono} fontSize={9} letterSpacing="1.15">SIGNAL LANES</text>
          <text x={plotLeft + 12} y={headerTop + 12} fill={COLORS.textCategory} fontFamily={FONTS.mono} fontSize={9} letterSpacing="1.15">ROLLING WINDOW</text>
          <text x={width - 18} y={headerTop + 12} fill={COLORS.textCategory} fontFamily={FONTS.mono} fontSize={9} textAnchor="end" letterSpacing="1.15">CURRENT STATE</text>

          {samples.map((sample) => sample.videoCatchupActive ? (
            <rect
              key={`catchup-${sample.atMs}`}
              x={xForTime(sample.atMs) - catchupBandWidth * 0.5}
              y={laneTopAt(1) - 2}
              width={catchupBandWidth}
              height={laneHeight + 4}
              fill="rgba(80, 96, 192, 0.08)"
            />
          ) : null)}

          {contactMarkers.map((marker, index) => {
            const x = xForTime(marker.atMs);
            const laneTop = laneTopAt(marker.laneIndex);
            const laneMid = laneTop + laneHeight / 2;
            const markerY = headerTop + 18 + (index % 2 === 0 ? 0 : 10);
            const color = contactColor(marker.tone);
            return (
              <g key={`contact-${marker.atMs}-${index}`}>
                <line x1={x} y1={markerY + 4} x2={x} y2={laneMid} stroke={color} strokeOpacity={0.22} strokeDasharray="2 5" />
                <rect x={x - 15} y={markerY - 8} width={30} height={12} rx={2} fill="rgba(11, 14, 20, 0.96)" stroke={color} strokeOpacity={0.56} />
                <text x={x} y={markerY + 0.4} fill={color} fontFamily={FONTS.mono} fontSize={8} textAnchor="middle" letterSpacing="0.5">{marker.label}</text>
                <circle cx={x} cy={laneMid} r={2.2} fill={color} />
              </g>
            );
          })}

          {lanes.map((lane, index) => {
            const top = laneTopAt(index);
            const baseline = lane.centered ? top + laneHeight / 2 : top + laneHeight - 3;
            const linePath = buildLinePath(lane.selector, lane.max, index, lane.centered);
            const areaPath = lane.centered ? '' : buildAreaPath(lane.selector, lane.max, index);
            const thresholdY = lane.centered
              ? top + 3 + ((lane.max - lane.threshold) / (lane.max * 2)) * (laneHeight - 8)
              : positiveY(lane.threshold, lane.max, top);
            return (
              <g key={lane.code}>
                <rect x={16} y={top} width={leftRailWidth - 16} height={laneHeight} rx={2} fill="rgba(12, 16, 23, 0.96)" stroke={COLORS.border} strokeOpacity={0.18} />
                <rect x={plotLeft} y={top} width={plotWidth} height={laneHeight} fill="rgba(10, 14, 20, 0.74)" stroke={COLORS.border} strokeOpacity={0.12} />
                <rect x={width - rightRailWidth} y={top} width={rightRailWidth - 10} height={laneHeight} rx={2} fill="rgba(12, 16, 23, 0.96)" stroke={COLORS.border} strokeOpacity={0.18} />
                {!lane.centered ? (
                  <rect x={plotLeft} y={top + 3} width={plotWidth} height={Math.max(0, thresholdY - top - 3)} fill="rgba(200, 146, 42, 0.035)" />
                ) : null}
                <line x1={plotLeft} y1={baseline} x2={width - plotRight} y2={baseline} stroke={lane.centered ? lane.color : COLORS.border} strokeOpacity={lane.centered ? 0.46 : 0.18} />
                <line x1={plotLeft} y1={top + 2} x2={width - plotRight} y2={top + 2} stroke={COLORS.border} strokeOpacity={0.06} />
                <line x1={plotLeft} y1={top + laneHeight - 2} x2={width - plotRight} y2={top + laneHeight - 2} stroke={COLORS.border} strokeOpacity={0.06} />
                {areaPath ? <path d={areaPath} fill={lane.fill} /> : null}
                <path d={linePath} fill="none" stroke={lane.glow} strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round" />
                <path d={linePath} fill="none" stroke={lane.color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                <text x={26} y={top + 14} fill={COLORS.textTitle} fontFamily={FONTS.mono} fontSize={10.2} letterSpacing="1.15">{lane.code}</text>
                <text x={26} y={top + 26} fill={COLORS.textCategory} fontFamily={FONTS.mono} fontSize={8} letterSpacing="0.7">{lane.subtitle}</text>
                <text x={leftRailWidth - 4} y={top + 14} fill={COLORS.textDim} fontFamily={FONTS.mono} fontSize={8.2} textAnchor="end" letterSpacing="0.6">{lane.scale}</text>
                <text x={width - 24} y={top + 14} fill={COLORS.textTitle} fontFamily={FONTS.mono} fontSize={10.4} textAnchor="end" letterSpacing="0.5">{lane.detail}</text>
                <text x={width - 24} y={top + 26} fill={lane.statusColor} fontFamily={FONTS.mono} fontSize={8} textAnchor="end" letterSpacing="0.8">{lane.status}</text>
                {lane.centered ? (
                  <text x={plotLeft - 8} y={baseline + 3} fill={COLORS.textDim} fontFamily={FONTS.mono} fontSize={8.2} textAnchor="end">0</text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}


function PerformanceEventLine({ event }: { event: PerformanceEvent }): React.ReactElement {
  const color =
    event.tone === 'warn'
      ? COLORS.statusWarn
      : event.tone === 'info'
        ? COLORS.textPrimary
        : COLORS.textSecondary;

  return (
    <div style={perfEventLineStyle}>
      <span style={clockStyle}>{event.clock}</span>
      <span style={sourceStyle}>{event.source.toUpperCase()}</span>
      <span style={{ ...messageStyle, color }}>{event.text}</span>
    </div>
  );
}

const perfWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.sm,
  height: '100%',
  minHeight: 0,
  overflowY: 'auto',
  padding: `${SPACING.md}px ${SPACING.lg}px ${SPACING.sm}px`,
  boxSizing: 'border-box',
  background: COLORS.bg0,
};

const perfHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: SPACING.lg,
  alignItems: 'flex-start',
  paddingBottom: SPACING.sm,
  borderBottom: `1px solid ${COLORS.border}`,
};

const perfHeaderTextStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
};

const perfEyebrowStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  letterSpacing: '0.16em',
};

const perfHealthTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeLg,
  letterSpacing: '0.08em',
  color: COLORS.textPrimary,
  lineHeight: 1.15,
};

const perfHealthDetailStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  letterSpacing: '0.04em',
  maxWidth: 760,
  lineHeight: 1.5,
};

const perfActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: SPACING.xs,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  flexShrink: 0,
};

const perfProfileRailStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: SPACING.lg,
  alignItems: 'flex-start',
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.bg1,
  borderRadius: 2,
};

const perfProfileSummaryStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
};

const perfProfileActiveStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: SPACING.sm,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeMd,
  color: COLORS.textPrimary,
  letterSpacing: '0.08em',
  flexWrap: 'wrap',
};

const perfProfileMetaStyle: React.CSSProperties = {
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  letterSpacing: '0.12em',
};

const perfProfileDetailStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  letterSpacing: '0.03em',
  lineHeight: 1.45,
  maxWidth: 700,
};

const perfProfileButtonGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: SPACING.xs,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  flexShrink: 0,
};

const perfCardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(164px, 1fr))',
  gap: SPACING.sm,
  flexShrink: 0,
};

const perfCardStyle: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: COLORS.border,
  background: COLORS.bg2,
  padding: `${SPACING.xs + 1}px ${SPACING.md}px`,
  borderRadius: 2,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
};

const perfCardLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  letterSpacing: '0.12em',
};

const perfCardValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeLg,
  letterSpacing: '0.06em',
};

const perfCardDetailStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  letterSpacing: '0.03em',
  lineHeight: 1.4,
};

const perfBodyStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(280px, 0.92fr) minmax(360px, 1.08fr)',
  gap: SPACING.sm,
  flexShrink: 0,
  minHeight: 180,
};

const perfPanelStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.sm,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.bg1,
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  borderRadius: 2,
  overflow: 'hidden',
};

const perfSectionTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  letterSpacing: '0.14em',
};

const perfMeterWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const perfMeterHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: SPACING.sm,
  alignItems: 'baseline',
};

const perfMeterLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textPrimary,
  letterSpacing: '0.08em',
};

const perfMeterValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  letterSpacing: '0.03em',
};

const perfMeterTrackStyle: React.CSSProperties = {
  position: 'relative',
  height: 7,
  borderRadius: 2,
  background: COLORS.levelTrack,
  overflow: 'hidden',
};

const perfMeterFillStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  borderRadius: 2,
};

const perfEventsStyle: React.CSSProperties = {
  minHeight: 0,
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: `${SPACING.xs}px ${SPACING.sm}px`,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.bg2,
  boxSizing: 'border-box',
};

const perfEventLineStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '60px 54px minmax(0, 1fr)',
  gap: SPACING.sm,
  alignItems: 'start',
};

const perfEmptyStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textDim,
  lineHeight: 1.6,
  letterSpacing: '0.03em',
};
