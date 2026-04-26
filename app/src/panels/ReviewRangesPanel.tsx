import type { VisualMode } from '../audio/displayMode';
import { useVisualMode } from '../core/session';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import type { RangeMark } from '../types';
import { formatTransportTime } from '../utils/format';
import { RangeNoteEditor } from '../controls/RangeNoteEditor';
import { useReviewControlModel } from '../controls/useReviewControlModel';
import { RangeChip } from '../controls/reviewChrome';

interface ReviewTheme {
  readonly panelBg: string;
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
    buttonActiveBg: COLORS.bg2,
    border: COLORS.border,
    accentBorder: COLORS.borderActive,
    text: COLORS.textPrimary,
    label: COLORS.textCategory,
    dim: COLORS.textDim,
    accent: COLORS.accent,
  },
  amber: {
    panelBg: 'linear-gradient(180deg, rgba(12,8,3,0.99), rgba(20,13,4,0.99))',
    buttonActiveBg: 'linear-gradient(135deg, rgba(42,24,6,0.98), rgba(68,36,8,0.96))',
    border: 'rgba(102,70,20,0.76)',
    accentBorder: CANVAS.amber.chromeBorderActive,
    text: CANVAS.amber.text,
    label: CANVAS.amber.category,
    dim: 'rgba(212,170,86,0.64)',
    accent: 'rgba(255,176,48,0.96)',
  },
  optic: {
    panelBg: 'linear-gradient(180deg, rgba(248,251,253,0.99), rgba(238,245,249,0.99))',
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
    buttonActiveBg: 'rgba(28,10,54,0.96)',
    border: 'rgba(120,50,200,0.42)',
    accentBorder: 'rgba(255,123,0,0.76)',
    text: 'rgba(255,210,140,0.92)',
    label: 'rgba(170,90,255,0.7)',
    dim: 'rgba(170,90,255,0.56)',
    accent: 'rgba(255,123,0,0.96)',
  },
};

export function ReviewRangesPanel(): React.ReactElement {
  const visualMode = useVisualMode();
  const review = useReviewControlModel();
  const theme = REVIEW_THEMES[visualMode];
  return (
    <div style={{ ...wrapStyle, background: theme.panelBg, borderColor: theme.border }}>
      <div style={rangeListStyle}>
        <div style={rangeListHeaderStyle}>
          <span style={{ ...metricLabelStyle, color: theme.label }}>SAVED RANGES</span>
          <div style={rangeListMetaStyle}>
            <span style={{ ...listHintStyle, color: theme.dim }}>{review.rangeMarks.length} TOTAL</span>
            <span style={{ ...listHintStyle, color: theme.dim }}>CLICK TO SELECT</span>
          </div>
        </div>
        {review.rangeMarks.length > 0 ? (
          review.rangeMarks.slice().reverse().map((rangeMark: RangeMark) => {
            const selected = review.selectedRangeId === rangeMark.id;
            return (
              <div
                key={rangeMark.id}
                style={{
                  ...rangeRowStyle,
                  borderColor: selected ? theme.accentBorder : theme.border,
                  background: selected ? theme.buttonActiveBg : 'transparent',
                }}
              >
                <div style={rangeTopLineStyle}>
                  <button
                    type="button"
                    style={rangeSelectButtonStyle}
                    onClick={() => review.selectRange(rangeMark.id)}
                    title={`Select ${rangeMark.label} for audition and export`}
                    data-shell-interactive="true"
                  >
                    <RangeChip label={rangeMark.label} visualMode={visualMode} selected={selected} />
                    <span style={{ ...rangeDetailStyle, color: selected ? theme.text : theme.dim }}>
                      {formatTransportTime(rangeMark.startS)} {'->'} {formatTransportTime(rangeMark.endS)}
                    </span>
                  </button>
                  <div style={rangeButtonRowStyle}>
                    <button
                      type="button"
                      style={{ ...miniButtonStyle, color: theme.text, borderColor: theme.border }}
                      onClick={() => review.auditionRange(rangeMark)}
                      title="Loop-audition this saved range"
                      data-shell-interactive="true"
                    >
                      AUDITION
                    </button>
                    <button
                      type="button"
                      style={{ ...miniButtonStyle, color: theme.dim, borderColor: theme.border }}
                      onClick={() => review.deleteRange(rangeMark.id)}
                      title="Delete this saved range"
                      data-shell-interactive="true"
                    >
                      X
                    </button>
                  </div>
                </div>
                <RangeNoteEditor
                  rangeId={rangeMark.id}
                  noteValue={rangeMark.note}
                  selected={selected}
                  textColor={theme.text}
                  dimColor={theme.dim}
                  accentBg={theme.buttonActiveBg}
                  onCommit={review.updateRangeNote}
                />
              </div>
            );
          })
        ) : (
          <div style={emptyStateStyle}>
            <span style={{ ...emptyStateTextStyle, color: theme.dim }}>
              Use the review rack above OVERVIEW to commit a range.
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
  gap: 2,
  height: '100%',
  padding: `2px ${SPACING.sm}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  boxSizing: 'border-box',
};

const metricLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.12em',
};

const rangeListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minHeight: 0,
  flex: 1,
  overflowY: 'auto',
  paddingRight: 2,
};

const rangeListHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  minHeight: 18,
  flexShrink: 0,
};

const rangeListMetaStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

const listHintStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const rangeRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  padding: '3px 6px',
  flexShrink: 0,
};

const rangeTopLineStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 20,
};

const rangeSelectButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'transparent',
  padding: 0,
  textAlign: 'left',
  cursor: 'pointer',
};

const rangeDetailStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.05em',
  lineHeight: 1.2,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const rangeButtonRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  alignItems: 'center',
  flexShrink: 0,
};

const miniButtonStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.08em',
  background: 'transparent',
  borderWidth: 1,
  borderStyle: 'solid',
  padding: '2px 5px',
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

