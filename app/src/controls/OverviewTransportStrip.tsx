import { useCallback } from 'react';

import { useAudioEngine, useDiagnosticsLog, useVisualMode } from '../core/session';
import { COLORS, FONTS, MODES, SPACING } from '../theme';
import type { RangeMark } from '../types';
import { formatTransportTime } from '../utils/format';
import { SessionControls } from './SessionControls';
import { useReviewControlModel } from './useReviewControlModel';

const SEEK_STEP_S = 5;

export function OverviewTransportStrip(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const diagnosticsLog = useDiagnosticsLog();
  const visualMode = useVisualMode();
  const review = useReviewControlModel();
  const transport = review.transport;

  const m = MODES[visualMode];
  const hasFile = transport.filename !== null;
  const hasLoop = transport.loopStart !== null && transport.loopEnd !== null;
  const timeLabel = hasFile
    ? `${formatTransportTime(transport.currentTime)} / ${formatTransportTime(transport.duration)}`
    : 'NO FILE';
  const loopLabel = hasLoop ? 'LOOP ON' : 'LOOP';
  const inLabel = review.pendingRangeStartS !== null ? formatTransportTime(review.pendingRangeStartS) : '--:--.-';
  const activeLabel = review.selectedRange
    ? `${review.selectedRange.label} ${formatTransportTime(review.selectedRange.startS)} -> ${formatTransportTime(review.selectedRange.endS)}`
    : 'NO RANGE';
  const visibleRanges = review.rangeMarks.slice().reverse();

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
    <div style={{ ...wrapStyle, borderColor: m.chromeBorder, background: m.bg2 }}>
      <div style={topRowStyle}>
        <div style={transportClusterStyle}>
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
          <div style={{ ...inlineDividerStyle, background: m.chromeBorder }} />
          <span style={{ ...timeStyle, color: hasFile ? m.text : COLORS.textDim }}>{timeLabel}</span>
          <span style={{ ...pillStyle, color: m.category, borderColor: m.chromeBorder }}>{loopLabel}</span>
          <span style={{ ...pillStyle, color: m.category, borderColor: m.chromeBorder }}>M {review.markersCount}</span>
          <span style={{ ...pillStyle, color: m.category, borderColor: m.chromeBorder }}>R {review.rangeMarks.length}</span>
        </div>

        <div style={{ ...tuningDockStyle, borderColor: m.chromeBorder }}>
          <SessionControls />
        </div>
      </div>

      <div style={{ ...rowDividerStyle, borderColor: m.chromeBorder }} />

      <div style={bottomRowStyle}>
        <div style={reviewActionRowStyle}>
          <button
            style={{ ...buttonStyle, background: m.bg2, borderColor: m.chromeBorder, color: m.text }}
            onClick={review.setIn}
            disabled={!hasFile}
            title="Set the review in-point at the current transport time"
          >
            SET IN
          </button>
          <button
            style={{ ...buttonStyle, background: m.bg, borderColor: m.chromeBorder, color: m.text }}
            onClick={review.setOut}
            disabled={!review.canCommitRange}
            title="Commit a review range from the pending in-point to the current transport time"
          >
            SET OUT
          </button>
          <button
            style={{ ...buttonStyle, background: m.bg, borderColor: m.chromeBorder, color: m.text }}
            onClick={review.captureLoop}
            disabled={!review.loopReady}
            title="Commit the current loop as a saved review range"
          >
            FROM LOOP
          </button>
          <button
            style={{ ...buttonStyle, background: m.bg, borderColor: m.chromeBorder, color: m.text }}
            onClick={review.clearIn}
            disabled={review.pendingRangeStartS === null}
            title="Clear the pending review in-point"
          >
            CLEAR IN
          </button>
          <button
            style={{ ...buttonStyle, background: m.bg, borderColor: m.chromeBorder, color: m.text }}
            onClick={review.clearRanges}
            disabled={review.rangeMarks.length === 0}
            title="Clear all saved review ranges"
          >
            CLEAR RANGES
          </button>
        </div>

        <div style={{ ...metricRowStyle, borderColor: m.chromeBorder }}>
          <div style={metricCellStyle}>
            <span style={{ ...metricLabelStyle, color: m.category }}>NOW</span>
            <span style={{ ...metricValueStyle, color: m.text }}>{formatTransportTime(transport.currentTime)}</span>
          </div>
          <div style={metricCellStyle}>
            <span style={{ ...metricLabelStyle, color: m.category }}>IN</span>
            <span style={{ ...metricValueStyle, color: review.pendingRangeStartS !== null ? m.text : COLORS.textDim }}>{inLabel}</span>
          </div>
          <div style={{ ...metricCellStyle, minWidth: 188 }}>
            <span style={{ ...metricLabelStyle, color: m.category }}>ACTIVE</span>
            <span style={{ ...metricValueStyle, color: review.selectedRange ? m.text : COLORS.textDim }}>{activeLabel}</span>
          </div>
        </div>
      </div>

      <div style={{ ...savedRangesSectionStyle, borderColor: m.chromeBorder }}>
        <div style={savedRangesHeaderStyle}>
          <span style={{ ...savedRangesLabelStyle, color: m.category }}>SAVED RANGES</span>
          <span style={{ ...savedRangesMetaStyle, color: m.category }}>{review.rangeMarks.length} TOTAL</span>
        </div>
        {visibleRanges.length === 0 ? (
          <div style={savedRangesEmptyStyle}>
            <span style={{ ...savedRangesEmptyTextStyle, color: COLORS.textDim }}>
              SAVE A RANGE WITH SET IN / SET OUT OR FROM LOOP.
            </span>
          </div>
        ) : (
          <div style={savedRangesListStyle}>
            {visibleRanges.map((rangeMark: RangeMark) => {
              const selected = review.selectedRangeId === rangeMark.id;
              return (
                <div
                  key={rangeMark.id}
                  style={{
                    ...savedRangeRowStyle,
                    borderColor: selected ? m.chromeBorderActive : m.chromeBorder,
                    background: selected ? m.bg2 : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    style={savedRangeSelectStyle}
                    onClick={() => review.selectRange(rangeMark.id)}
                    title={`Select ${rangeMark.label}`}
                  >
                    <span style={{ ...savedRangeTitleStyle, color: selected ? m.text : m.category }}>{rangeMark.label}</span>
                    <span style={{ ...savedRangeDetailStyle, color: selected ? m.text : COLORS.textDim }}>
                      {formatTransportTime(rangeMark.startS)} {'->'} {formatTransportTime(rangeMark.endS)}
                    </span>
                  </button>
                  <div style={savedRangeActionsStyle}>
                    <button
                      type="button"
                      style={{ ...miniButtonStyle, color: m.text, borderColor: m.chromeBorder }}
                      onClick={() => review.auditionRange(rangeMark)}
                      title="Loop-audition this range"
                    >
                      AUDITION
                    </button>
                    <button
                      type="button"
                      style={{ ...miniButtonStyle, color: m.category, borderColor: m.chromeBorder }}
                      onClick={() => review.deleteRange(rangeMark.id)}
                      title="Delete this range"
                    >
                      X
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  minWidth: 0,
  width: '100%',
  maxWidth: '100%',
  justifySelf: 'stretch',
  padding: '6px 8px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const topRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  gap: 12,
  flexWrap: 'wrap',
  minWidth: 0,
};

const transportClusterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.xs,
  flexWrap: 'wrap',
  justifyContent: 'flex-start',
  minWidth: 0,
  flex: '1 1 560px',
};

const tuningDockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 360,
  paddingLeft: 12,
  borderLeftWidth: 1,
  borderLeftStyle: 'solid',
  boxSizing: 'border-box',
  flex: '0 1 420px',
};

const bottomRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap',
  minWidth: 0,
  paddingTop: 4,
};

const savedRangesSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginTop: 4,
  paddingTop: 4,
  borderTopWidth: 1,
  borderTopStyle: 'solid',
  minWidth: 0,
  minHeight: 0,
};

const savedRangesHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minHeight: 14,
};

const savedRangesLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.12em',
};

const savedRangesMetaStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
};

const savedRangesListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  maxHeight: 94,
  overflowY: 'auto',
  paddingRight: 2,
};

const savedRangeRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  minHeight: 24,
  padding: '2px 5px',
};

const savedRangeSelectStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'transparent',
  padding: 0,
  textAlign: 'left',
  cursor: 'pointer',
};

const savedRangeTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 10,
  letterSpacing: '0.08em',
  flexShrink: 0,
};

const savedRangeDetailStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.05em',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const savedRangeActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
};

const miniButtonStyle: React.CSSProperties = {
  minWidth: 18,
  height: 17,
  padding: '0 4px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.06em',
  background: 'transparent',
  cursor: 'pointer',
  boxSizing: 'border-box',
};

const savedRangesEmptyStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minHeight: 26,
};

const savedRangesEmptyTextStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.05em',
};

const reviewActionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: SPACING.xs,
  flexWrap: 'wrap',
  minWidth: 0,
  flex: '1 1 460px',
};

const metricRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 10,
  flexWrap: 'wrap',
  minWidth: 0,
  paddingLeft: 10,
  borderLeftWidth: 1,
  borderLeftStyle: 'solid',
  flex: '0 1 auto',
};

const metricCellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 68,
};

const metricLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.12em',
};

const metricValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const buttonStyle: React.CSSProperties = {
  minWidth: 34,
  height: 17,
  padding: '0 4px',
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

const rowDividerStyle: React.CSSProperties = {
  width: '100%',
  borderTopWidth: 1,
  borderTopStyle: 'solid',
};

const inlineDividerStyle: React.CSSProperties = {
  width: 1,
  height: 15,
  flex: '0 0 auto',
};

const timeStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.05em',
  lineHeight: 1.1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 17,
  padding: '0 4px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.08em',
  whiteSpace: 'nowrap',
};
