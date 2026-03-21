import { useCallback, useEffect, useState } from 'react';

import { useAudioEngine, useDiagnosticsLog, useRangeMarks, useVisualMode } from '../core/session';
import { COLORS, FONTS, MODES, SPACING } from '../theme';
import type { TransportState } from '../types';
import { formatTransportTime } from '../utils/format';
import { SessionControls } from './SessionControls';

const SEEK_STEP_S = 5;

const EMPTY_TRANSPORT: TransportState = {
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
};

interface Props {
  readonly title: string;
}

export function OverviewTransportStrip({ title }: Props): React.ReactElement {
  const audioEngine = useAudioEngine();
  const diagnosticsLog = useDiagnosticsLog();
  const visualMode = useVisualMode();
  const rangeMarks = useRangeMarks();
  const [transport, setTransport] = useState<TransportState>(EMPTY_TRANSPORT);

  useEffect(() => {
    return audioEngine.onTransport(setTransport);
  }, [audioEngine]);

  const m = MODES[visualMode];
  const hasFile = transport.filename !== null;
  const hasLoop = transport.loopStart !== null && transport.loopEnd !== null;
  const timeLabel = hasFile
    ? `${formatTransportTime(transport.currentTime)} / ${formatTransportTime(transport.duration)}`
    : 'NO FILE';
  const loopLabel = hasLoop ? 'LOOP ON' : 'LOOP';

  const seekBy = useCallback((deltaS: number) => {
    if (!hasFile) return;
    const nextTime = Math.max(0, Math.min(transport.duration, transport.currentTime + deltaS));
    audioEngine.seek(nextTime);
  }, [audioEngine, hasFile, transport.currentTime, transport.duration]);

  const toggleLoop = useCallback(() => {
    if (transport.duration <= 0) return;
    if (hasLoop) {
      audioEngine.clearLoop();
      diagnosticsLog.push('loop cleared', 'info', 'transport');
      return;
    }
    audioEngine.setLoop(0, transport.duration);
    diagnosticsLog.push(`loop file 00:00.0 -> ${formatTransportTime(transport.duration)}`, 'info', 'transport');
  }, [audioEngine, diagnosticsLog, hasLoop, transport.duration]);

  return (
    <div style={{ ...wrapStyle, borderColor: m.chromeBorder, background: m.bg }}>
      <div style={{ ...titleBarStyle, borderBottomColor: m.chromeBorder }}>
        <span style={{ ...titleTextStyle, color: m.text }}>{title}</span>
      </div>

      <div style={controlsRowStyle}>
        <div style={{ ...transportBoxStyle, borderColor: m.chromeBorder, background: m.bg2 }}>
          <div style={buttonRowStyle}>
            <button
              style={{ ...buttonStyle, background: m.bg2, borderColor: m.chromeBorder, color: m.text }}
              onClick={() => audioEngine.stop()}
              disabled={!hasFile}
              title="Stop and return to start"
            >
              STOP
            </button>
            <button
              style={{
                ...buttonStyle,
                background: transport.isPlaying ? m.bg2 : m.bg,
                borderColor: transport.isPlaying ? m.chromeBorderActive : m.chromeBorder,
                color: m.text,
              }}
              onClick={() => transport.isPlaying ? audioEngine.pause() : audioEngine.play()}
              disabled={!hasFile}
              title={transport.isPlaying ? 'Pause playback' : 'Play'}
            >
              {transport.isPlaying ? 'PAUSE' : 'PLAY'}
            </button>
            <button
              style={{
                ...buttonStyle,
                background: hasLoop ? m.bg2 : m.bg,
                borderColor: hasLoop ? m.chromeBorderActive : m.chromeBorder,
                color: m.text,
              }}
              onClick={toggleLoop}
              disabled={!hasFile}
              title={hasLoop ? 'Clear the current loop region' : 'Loop the full file'}
            >
              LOOP
            </button>
            <button
              style={{ ...buttonStyle, background: m.bg, borderColor: m.chromeBorder, color: m.text }}
              onClick={() => seekBy(-SEEK_STEP_S)}
              disabled={!hasFile}
              title="Seek backward 5 seconds"
            >
              -5S
            </button>
            <button
              style={{ ...buttonStyle, background: m.bg, borderColor: m.chromeBorder, color: m.text }}
              onClick={() => seekBy(SEEK_STEP_S)}
              disabled={!hasFile}
              title="Seek forward 5 seconds"
            >
              +5S
            </button>
          </div>

          <div style={{ ...statusClusterStyle, borderColor: m.chromeBorder, background: m.bg }}>
            <span style={{ ...timeStyle, color: hasFile ? m.text : COLORS.textDim }}>{timeLabel}</span>
            <div style={metaRowStyle}>
              <span style={{ ...pillStyle, color: m.category, borderColor: m.chromeBorder }}>{loopLabel}</span>
              <span style={{ ...pillStyle, color: m.category, borderColor: m.chromeBorder }}>R {rangeMarks.length}</span>
            </div>
          </div>
        </div>
        <div style={{ ...tuningBoxStyle, borderColor: m.chromeBorder, background: m.bg2 }}>
          <span style={{ ...rowLabelStyle, color: m.category }}>PLAYBACK TUNING</span>
          <SessionControls />
        </div>
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: SPACING.xs,
  minWidth: 0,
  width: '100%',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  boxSizing: 'border-box',
};

const titleBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minHeight: 26,
  padding: '0 10px',
  borderBottomWidth: 1,
  borderBottomStyle: 'solid',
  boxSizing: 'border-box',
};

const titleTextStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 10,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  lineHeight: 1.2,
};

const controlsRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'flex-start',
  gap: SPACING.sm,
  minWidth: 0,
  width: '100%',
  padding: 8,
  boxSizing: 'border-box',
};

const transportBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.sm,
  minWidth: 360,
  padding: 8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  boxSizing: 'border-box',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.xs,
  flexShrink: 0,
  flexWrap: 'wrap',
  justifyContent: 'flex-start',
};

const tuningBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 252,
  padding: 8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  boxSizing: 'border-box',
};

const rowLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  flexShrink: 0,
};

const buttonStyle: React.CSSProperties = {
  minWidth: 36,
  height: 20,
  padding: '0 6px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  outline: 'none',
  boxSizing: 'border-box',
};

const statusClusterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: SPACING.sm,
  minWidth: 0,
  padding: '2px 6px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
};

const timeStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.06em',
  lineHeight: 1.1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.xs,
  flexWrap: 'wrap',
  justifyContent: 'flex-start',
};

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 18,
  padding: '0 5px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.08em',
  whiteSpace: 'nowrap',
};
