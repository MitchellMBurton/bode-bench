import { useEffect, useState } from 'react';
import type { VisualMode } from '../audio/displayMode';
import { useAudioEngine, useDerivedMediaSnapshot, useDerivedMediaStore, useDiagnosticsLog, useVisualMode } from '../core/session';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import type { RangeMark, TransportState } from '../types';
import { formatTransportTime } from '../utils/format';

const INITIAL_TRANSPORT: TransportState = {
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

interface ReviewTheme {
  readonly panelBg: string;
  readonly buttonBg: string;
  readonly buttonActiveBg: string;
  readonly border: string;
  readonly accentBorder: string;
  readonly text: string;
  readonly label: string;
  readonly dim: string;
  readonly accent: string;
}

const REVIEW_THEMES: Record<VisualMode, ReviewTheme> = {
  default: {
    panelBg: COLORS.bg1,
    buttonBg: COLORS.bg3,
    buttonActiveBg: COLORS.bg2,
    border: COLORS.border,
    accentBorder: COLORS.borderActive,
    text: COLORS.textPrimary,
    label: COLORS.textCategory,
    dim: COLORS.textDim,
    accent: COLORS.accent,
  },
  optic: {
    panelBg: 'linear-gradient(180deg, rgba(248,251,253,0.99), rgba(238,245,249,0.99))',
    buttonBg: 'rgba(247,250,252,0.96)',
    buttonActiveBg: 'linear-gradient(135deg, rgba(252,254,255,0.99), rgba(231,239,245,0.99))',
    border: 'rgba(109,146,165,0.72)',
    accentBorder: CANVAS.optic.chromeBorderActive,
    text: CANVAS.optic.text,
    label: CANVAS.optic.category,
    dim: 'rgba(63,95,114,0.72)',
    accent: '#117aa5',
  },
  red: {
    panelBg: 'linear-gradient(180deg, rgba(18,6,7,0.99), rgba(28,9,10,0.99))',
    buttonBg: 'rgba(18,6,7,0.94)',
    buttonActiveBg: 'linear-gradient(135deg, rgba(36,10,11,0.99), rgba(52,14,16,0.99))',
    border: 'rgba(124,40,39,0.72)',
    accentBorder: CANVAS.red.chromeBorderActive,
    text: CANVAS.red.text,
    label: CANVAS.red.category,
    dim: 'rgba(255,186,172,0.72)',
    accent: 'rgba(255,132,116,0.96)',
  },
  nge: {
    panelBg: COLORS.bg1,
    buttonBg: 'rgba(4,10,4,0.9)',
    buttonActiveBg: 'rgba(20,50,8,0.95)',
    border: 'rgba(60,130,30,0.4)',
    accentBorder: 'rgba(120,200,60,0.72)',
    text: 'rgba(160,230,60,0.9)',
    label: 'rgba(100,180,50,0.7)',
    dim: 'rgba(120,200,60,0.54)',
    accent: 'rgba(160,230,60,0.92)',
  },
  hyper: {
    panelBg: COLORS.bg1,
    buttonBg: 'rgba(2,5,18,0.9)',
    buttonActiveBg: 'rgba(8,18,52,0.95)',
    border: 'rgba(40,70,180,0.42)',
    accentBorder: 'rgba(98,200,255,0.75)',
    text: 'rgba(210,236,255,0.9)',
    label: 'rgba(112,180,255,0.72)',
    dim: 'rgba(112,180,255,0.54)',
    accent: 'rgba(98,200,255,0.94)',
  },
  eva: {
    panelBg: COLORS.bg1,
    buttonBg: 'rgba(10,4,20,0.92)',
    buttonActiveBg: 'rgba(28,10,54,0.96)',
    border: 'rgba(120,50,200,0.42)',
    accentBorder: 'rgba(255,123,0,0.76)',
    text: 'rgba(255,210,140,0.92)',
    label: 'rgba(170,90,255,0.7)',
    dim: 'rgba(170,90,255,0.56)',
    accent: 'rgba(255,123,0,0.96)',
  },
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function ReviewRangesPanel(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const visualMode = useVisualMode();
  const derivedMedia = useDerivedMediaStore();
  const snapshot = useDerivedMediaSnapshot();
  const diagnosticsLog = useDiagnosticsLog();
  const [transport, setTransport] = useState<TransportState>(INITIAL_TRANSPORT);

  useEffect(() => {
    return audioEngine.onTransport((nextTransport) => {
      setTransport(nextTransport);
    });
  }, [audioEngine]);

  const theme = REVIEW_THEMES[visualMode];
  const selectedRange = snapshot.selectedRangeId === null
    ? null
    : snapshot.rangeMarks.find((rangeMark) => rangeMark.id === snapshot.selectedRangeId) ?? null;
  if (snapshot.selectedRangeId !== null) {
    assert(selectedRange, 'selected review range is missing');
  }
  const pendingRangeStartS = snapshot.pendingRangeStartS;
  const loopReady = transport.loopStart !== null && transport.loopEnd !== null;
  const canCommitRange = pendingRangeStartS !== null && Math.abs(transport.currentTime - pendingRangeStartS) >= 0.01;

  const onSetIn = (): void => {
    const startS = derivedMedia.setPendingRangeStart(transport.currentTime);
    diagnosticsLog.push(`range in @ ${formatTransportTime(startS)}`, 'info', 'transport');
  };

  const onSetOut = (): void => {
    if (!canCommitRange) return;
    const rangeMark = derivedMedia.commitPendingRange(transport.currentTime);
    diagnosticsLog.push(
      `range ${rangeMark.label} ${formatTransportTime(rangeMark.startS)} -> ${formatTransportTime(rangeMark.endS)}`,
      'info',
      'transport',
    );
  };

  const onCaptureLoop = (): void => {
    if (!loopReady) return;
    const rangeMark = derivedMedia.addRange(transport.loopStart, transport.loopEnd);
    diagnosticsLog.push(
      `range ${rangeMark.label} from loop ${formatTransportTime(rangeMark.startS)} -> ${formatTransportTime(rangeMark.endS)}`,
      'info',
      'transport',
    );
  };

  const onClearIn = (): void => {
    if (pendingRangeStartS === null) return;
    derivedMedia.clearPendingRangeStart();
    diagnosticsLog.push('range in cleared', 'dim', 'transport');
  };

  const onClearRanges = (): void => {
    if (snapshot.rangeMarks.length === 0) return;
    derivedMedia.clearRanges();
    diagnosticsLog.push('ranges cleared', 'info', 'transport');
  };

  const onSelectRange = (rangeId: number): void => {
    derivedMedia.selectRange(rangeId);
  };

  const onAuditionRange = (rangeMark: RangeMark): void => {
    audioEngine.setLoop(rangeMark.startS, rangeMark.endS);
    audioEngine.seek(rangeMark.startS);
    diagnosticsLog.push(
      `loop audition ${rangeMark.label} ${formatTransportTime(rangeMark.startS)} -> ${formatTransportTime(rangeMark.endS)}`,
      'info',
      'transport',
    );
  };

  const onDeleteRange = (rangeId: number): void => {
    const rangeMark = snapshot.rangeMarks.find((entry) => entry.id === rangeId);
    assert(rangeMark, 'range to delete is missing');
    derivedMedia.deleteRange(rangeId);
    diagnosticsLog.push(`range ${rangeMark.label} removed`, 'dim', 'transport');
  };

  return (
    <div style={{ ...wrapStyle, background: theme.panelBg, borderColor: theme.border }}>
      <div style={topRowStyle}>
        <div style={metricClusterStyle}>
          <div style={metricBlockStyle}>
            <span style={{ ...metricLabelStyle, color: theme.label }}>NOW</span>
            <span style={{ ...metricValueStyle, color: theme.text }}>{formatTransportTime(transport.currentTime)}</span>
          </div>
          <div style={metricBlockStyle}>
            <span style={{ ...metricLabelStyle, color: theme.label }}>IN</span>
            <span style={{ ...metricValueStyle, color: pendingRangeStartS !== null ? theme.accent : theme.dim }}>
              {pendingRangeStartS !== null ? formatTransportTime(pendingRangeStartS) : '--:--.-'}
            </span>
          </div>
          <div style={{ ...metricBlockStyle, minWidth: 184 }}>
            <span style={{ ...metricLabelStyle, color: theme.label }}>ACTIVE</span>
            <span style={{ ...metricValueStyle, color: selectedRange ? theme.text : theme.dim }}>
              {selectedRange
                ? `${selectedRange.label} ${formatTransportTime(selectedRange.startS)} -> ${formatTransportTime(selectedRange.endS)}`
                : 'NO RANGE'}
            </span>
          </div>
        </div>
        <div style={badgeRowStyle}>
          <span style={{ ...badgeStyle, borderColor: theme.border, color: theme.text }}>MARKERS {snapshot.markers.length}</span>
          <span style={{ ...badgeStyle, borderColor: theme.accentBorder, color: theme.accent }}>RANGES {snapshot.rangeMarks.length}</span>
        </div>
      </div>
      <div style={bottomRowStyle}>
        <div style={buttonRowStyle}>
          <button type="button" style={{ ...actionButtonStyle, color: theme.text, borderColor: theme.border, background: theme.buttonBg }} onClick={onSetIn} title="Set the review in-point from the playhead" data-shell-interactive="true">
            SET IN
          </button>
          <button type="button" style={{ ...actionButtonStyle, color: canCommitRange ? theme.text : theme.dim, borderColor: canCommitRange ? theme.accentBorder : theme.border, background: canCommitRange ? theme.buttonActiveBg : theme.buttonBg }} onClick={onSetOut} disabled={!canCommitRange} title="Commit a persistent range from IN to the current playhead" data-shell-interactive="true">
            SET OUT
          </button>
          <button type="button" style={{ ...actionButtonStyle, color: loopReady ? theme.text : theme.dim, borderColor: loopReady ? theme.accentBorder : theme.border, background: loopReady ? theme.buttonActiveBg : theme.buttonBg }} onClick={onCaptureLoop} disabled={!loopReady} title="Promote the audible loop to a persistent review range" data-shell-interactive="true">
            FROM LOOP
          </button>
          <button type="button" style={{ ...actionButtonStyle, color: pendingRangeStartS !== null ? theme.text : theme.dim, borderColor: theme.border, background: theme.buttonBg }} onClick={onClearIn} disabled={pendingRangeStartS === null} title="Clear the current in-point" data-shell-interactive="true">
            CLEAR IN
          </button>
          <button type="button" style={{ ...actionButtonStyle, color: snapshot.rangeMarks.length > 0 ? theme.text : theme.dim, borderColor: theme.border, background: theme.buttonBg }} onClick={onClearRanges} disabled={snapshot.rangeMarks.length === 0} title="Clear all persistent review ranges" data-shell-interactive="true">
            CLEAR RANGES
          </button>
        </div>
        <span style={{ ...noteStyle, color: theme.dim }}>
          LOOP is audible context. RANGES persist for clip, compare, and repair work.
        </span>
      </div>
      <div style={{ ...rangeListStyle, borderColor: theme.border }}>
        <div style={rangeListHeaderStyle}>
          <span style={{ ...metricLabelStyle, color: theme.label }}>SAVED RANGES</span>
          <span style={{ ...listHintStyle, color: theme.dim }}>CLICK TO SELECT</span>
        </div>
        {snapshot.rangeMarks.length > 0 ? (
          snapshot.rangeMarks.slice().reverse().map((rangeMark) => {
            const selected = selectedRange?.id === rangeMark.id;
            return (
              <div
                key={rangeMark.id}
                style={{
                  ...rangeRowStyle,
                  borderColor: selected ? theme.accentBorder : theme.border,
                  background: selected ? theme.buttonActiveBg : 'transparent',
                }}
              >
                <button
                  type="button"
                  style={rangeSelectButtonStyle}
                  onClick={() => onSelectRange(rangeMark.id)}
                  title={`Select ${rangeMark.label} for audition and export`}
                  data-shell-interactive="true"
                >
                  <span style={{ ...rangeTitleStyle, color: selected ? theme.text : theme.dim }}>{rangeMark.label}</span>
                  <span style={{ ...rangeDetailStyle, color: selected ? theme.text : theme.dim }}>
                    {formatTransportTime(rangeMark.startS)} {'->'} {formatTransportTime(rangeMark.endS)}
                  </span>
                </button>
                <div style={rangeButtonRowStyle}>
                  <button
                    type="button"
                    style={{ ...miniButtonStyle, color: theme.text, borderColor: theme.border }}
                    onClick={() => onAuditionRange(rangeMark)}
                    title="Loop-audition this saved range"
                    data-shell-interactive="true"
                  >
                    AUDITION
                  </button>
                  <button
                    type="button"
                    style={{ ...miniButtonStyle, color: theme.dim, borderColor: theme.border }}
                    onClick={() => onDeleteRange(rangeMark.id)}
                    title="Delete this saved range"
                    data-shell-interactive="true"
                  >
                    X
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div style={emptyStateStyle}>
            <span style={{ ...emptyStateTextStyle, color: theme.dim }}>
              Commit a range with SET IN / SET OUT or promote the loop with FROM LOOP.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  height: '100%',
  padding: `${SPACING.xs}px ${SPACING.sm}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  boxSizing: 'border-box',
};

const topRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: SPACING.sm,
};

const metricClusterStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: `${SPACING.xs}px ${SPACING.sm}px`,
  minWidth: 0,
};

const metricBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 74,
};

const metricLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.12em',
};

const metricValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 11,
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const badgeRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  justifyContent: 'flex-end',
};

const badgeStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.1em',
  padding: '3px 6px',
  borderWidth: 1,
  borderStyle: 'solid',
  whiteSpace: 'nowrap',
};

const bottomRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: SPACING.sm,
  minWidth: 0,
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const actionButtonStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.08em',
  borderWidth: 1,
  borderStyle: 'solid',
  padding: '4px 8px',
  cursor: 'pointer',
};

const noteStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.04em',
  textAlign: 'right',
  flex: 1,
  minWidth: 180,
};

const rangeListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minHeight: 0,
  paddingTop: 6,
  borderTopWidth: 1,
  borderTopStyle: 'solid',
};

const rangeListHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: SPACING.sm,
};

const listHintStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const rangeRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  padding: 6,
};

const rangeSelectButtonStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'transparent',
  padding: 0,
  textAlign: 'left',
  cursor: 'pointer',
};

const rangeTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 10,
  letterSpacing: '0.08em',
};

const rangeDetailStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.05em',
  lineHeight: 1.45,
};

const rangeButtonRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
};

const miniButtonStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.08em',
  background: 'transparent',
  borderWidth: 1,
  borderStyle: 'solid',
  padding: '3px 6px',
  cursor: 'pointer',
};

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minHeight: 54,
};

const emptyStateTextStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.05em',
  lineHeight: 1.5,
};
