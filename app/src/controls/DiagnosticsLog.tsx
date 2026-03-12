import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAudioEngine } from '../core/session';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import type { FileAnalysis, TransportState } from '../types';

interface LogEntry {
  id: number;
  text: string;
  tone: 'dim' | 'info' | 'warn';
}

const MAX_ENTRIES = 64;

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatPlaybackTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function formatKhz(hz: number): string {
  return `${(hz / 1000).toFixed(1)} kHz`;
}

const SCRUB_SETTLE_MS = 500;

export function DiagnosticsLog(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(1);
  const prevTransportRef = useRef<TransportState | null>(null);
  const scrubTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubEndStateRef = useRef<TransportState | null>(null);

  const pushEntry = useCallback((text: string, tone: LogEntry['tone'] = 'dim') => {
    const stamp = formatClock(new Date());
    setEntries((prev) => {
      const next = [...prev, { id: nextIdRef.current++, text: `${stamp}  ${text}`, tone }];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  }, []);

  useEffect(() => {
    pushEntry(`analysis ${audioEngine.analysisFps} fps / fft ${CANVAS.fftSize}`, 'dim');

    const unsubTransport = audioEngine.onTransport((state) => {
      const prev = prevTransportRef.current;

      if (prev === null) {
        prevTransportRef.current = state;
        if (state.filename) {
          pushEntry(`session ${state.filename}`, 'info');
        }
        return;
      }

      if (state.filename !== prev.filename) {
        if (state.filename) pushEntry(`loaded ${state.filename}`, 'info');
        else if (prev.filename) pushEntry('reset / cleared session', 'warn');
      }

      // Detect seek (large position jump while not playing or between states)
      const jumped =
        state.filename &&
        prev.filename === state.filename &&
        Math.abs(state.currentTime - prev.currentTime) > 1.5;

      if (jumped) {
        // Scrubbing: debounce — suppress intermediate events, log only when settled
        if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
        scrubEndStateRef.current = state;
        scrubTimerRef.current = setTimeout(() => {
          scrubTimerRef.current = null;
          const s = scrubEndStateRef.current!;
          pushEntry(`seek -> ${formatPlaybackTime(s.currentTime)}`, 'dim');
          if (s.isPlaying) pushEntry(`play @ ${formatPlaybackTime(s.currentTime)}`, 'info');
        }, SCRUB_SETTLE_MS);
        prevTransportRef.current = state;
        return;
      }

      // Within an active scrub window: accumulate final state, suppress noise
      if (scrubTimerRef.current !== null) {
        scrubEndStateRef.current = state;
        prevTransportRef.current = state;
        return;
      }

      if (state.isPlaying !== prev.isPlaying) {
        if (state.isPlaying) pushEntry(`play @ ${formatPlaybackTime(state.currentTime)}`, 'info');
        else pushEntry(`pause @ ${formatPlaybackTime(state.currentTime)}`, 'dim');
      }

      if (Math.abs(state.playbackRate - prev.playbackRate) > 0.001) {
        pushEntry(`rate ${state.playbackRate.toFixed(2)}x`, 'dim');
      }

      if (Math.abs(state.pitchSemitones - prev.pitchSemitones) > 0.001) {
        const pitchLabel = state.pitchSemitones > 0
          ? `+${state.pitchSemitones.toFixed(0)}`
          : state.pitchSemitones.toFixed(0);
        pushEntry(`pitch ${pitchLabel} st`, 'dim');
      }

      if (state.pitchShiftAvailable !== prev.pitchShiftAvailable) {
        pushEntry(
          state.pitchShiftAvailable
            ? 'studio pitch shift online'
            : 'studio pitch shift unavailable, native playback fallback active',
          state.pitchShiftAvailable ? 'info' : 'warn',
        );
      }

      prevTransportRef.current = state;
    });

    const unsubFile = audioEngine.onFileReady((analysis: FileAnalysis) => {
      const rateMismatch = Math.abs(analysis.decodedSampleRate - analysis.contextSampleRate) > 1;
      pushEntry(
        `decode ctx ${formatKhz(analysis.contextSampleRate)} / buf ${formatKhz(analysis.decodedSampleRate)} / ch ${analysis.channels} / dur ${formatPlaybackTime(analysis.duration)}`,
        rateMismatch ? 'warn' : 'info',
      );
      if (analysis.channels > 2) {
        pushEntry(`multichannel ${analysis.channels}ch -> explicit stereo downmix active`, 'warn');
      }
      pushEntry(
        `crest ${analysis.crestFactorDb.toFixed(1)} dB / peak ${analysis.peakDb.toFixed(1)} dBFS / rms ${analysis.rmsDb.toFixed(1)} dBFS`,
        'dim',
      );
      if (rateMismatch) {
        pushEntry('decoded sample rate differs from audio context rate', 'warn');
      }
    });

    const unsubReset = audioEngine.onReset(() => {
      prevTransportRef.current = null;
      pushEntry('visuals reset', 'warn');
    });

    return () => {
      unsubTransport();
      unsubFile();
      unsubReset();
      if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
    };
  }, [audioEngine, pushEntry]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [entries]);

  const emptyText = useMemo(
    () => 'Awaiting file diagnostics...',
    [],
  );

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>TRACE / DIAGNOSTICS</div>
      <div ref={scrollRef} style={scrollStyle}>
        {entries.length === 0 ? (
          <div style={{ ...lineStyle, color: COLORS.textDim }}>{emptyText}</div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                ...lineStyle,
                color:
                  entry.tone === 'warn'
                    ? COLORS.statusWarn
                    : entry.tone === 'info'
                      ? COLORS.textPrimary
                      : COLORS.textSecondary,
              }}
            >
              {entry.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 140,
  flex: 1,
  borderTop: `1px solid ${COLORS.border}`,
};

const headerStyle: React.CSSProperties = {
  padding: `${SPACING.xs}px ${SPACING.md}px`,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.1em',
  color: COLORS.textCategory,
  background: COLORS.bg1,
  flexShrink: 0,
};

const scrollStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  background: COLORS.bg2,
  padding: `${SPACING.sm}px ${SPACING.md}px`,
};

const lineStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  lineHeight: 1.6,
  letterSpacing: '0.03em',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
