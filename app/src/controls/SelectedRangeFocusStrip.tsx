import type React from 'react';

import type { VisualMode } from '../audio/displayMode';
import {
  useRangeIntelligenceSnapshot,
  useRangeIntelligenceStore,
} from '../core/session';
import {
  buildReviewReportRangeMeasurement,
  formatReviewReportRangeMeasurement,
} from '../runtime/reviewReport';
import { COLORS, FONTS, MODES, SPACING } from '../theme';
import { formatTransportTime } from '../utils/format';
import { RangeChip } from './reviewChrome';
import { useReviewControlModel } from './useReviewControlModel';
import { quietDisabledControlStyle } from './controlVisualStates';

interface Props {
  readonly visualMode: VisualMode;
}

function unavailableTime(): string {
  return '--:--.-';
}

export function SelectedRangeFocusStrip({ visualMode }: Props): React.ReactElement {
  const review = useReviewControlModel();
  const rangeIntelligence = useRangeIntelligenceStore();
  const rangeIntelligenceVersion = useRangeIntelligenceSnapshot();
  const mode = MODES[visualMode];
  const selectedRange = review.selectedRange;
  const isAuditioning = selectedRange !== null && review.auditionActiveRangeId === selectedRange.id;
  void rangeIntelligenceVersion;

  const measurement = selectedRange
    ? buildReviewReportRangeMeasurement(selectedRange.id, rangeIntelligence.summarizeRange(selectedRange))
    : null;
  const formatted = formatReviewReportRangeMeasurement(measurement);

  return (
    <section style={{ ...wrapStyle, borderColor: mode.chromeBorder, background: mode.bg }}>
      <div style={headerStyle}>
        <span style={{ ...eyebrowStyle, color: mode.category }}>REVIEW RANGE</span>
        <span style={{ ...metaStyle, color: mode.category }}>{review.rangeMarks.length} TOTAL</span>
      </div>

      <div style={metricGridStyle}>
        <div style={metricBlockStyle}>
          <span style={{ ...metricLabelStyle, color: mode.category }}>CLIP</span>
          <span style={{ ...metricValueStyle, color: selectedRange ? mode.text : COLORS.textDim }}>
            {selectedRange ? <RangeChip label={selectedRange.label} visualMode={visualMode} selected /> : 'NO RANGE'}
          </span>
        </div>
        <div style={metricBlockStyle}>
          <span style={{ ...metricLabelStyle, color: mode.category }}>START</span>
          <span style={{ ...metricValueStyle, color: selectedRange ? mode.text : COLORS.textDim }}>
            {selectedRange ? formatTransportTime(selectedRange.startS) : unavailableTime()}
          </span>
        </div>
        <div style={metricBlockStyle}>
          <span style={{ ...metricLabelStyle, color: mode.category }}>END</span>
          <span style={{ ...metricValueStyle, color: selectedRange ? mode.text : COLORS.textDim }}>
            {selectedRange ? formatTransportTime(selectedRange.endS) : unavailableTime()}
          </span>
        </div>
        <div style={metricBlockStyle}>
          <span style={{ ...metricLabelStyle, color: mode.category }}>LEN</span>
          <span style={{ ...metricValueStyle, color: selectedRange ? mode.stat : COLORS.textDim }}>
            {selectedRange ? formatTransportTime(selectedRange.endS - selectedRange.startS) : unavailableTime()}
          </span>
        </div>
      </div>

      {selectedRange ? (
        <>
          <div style={measurementGridStyle}>
            <MeasurementChip label="MEASURE" value={formatted.measure} tone={mode.text} labelColor={mode.category} />
            <MeasurementChip label="PEAK" value={formatted.peak} tone={mode.text} labelColor={mode.category} />
            <MeasurementChip label="F0" value={formatted.f0} tone={mode.text} labelColor={mode.category} />
            <MeasurementChip label="CORR" value={formatted.corr} tone={mode.text} labelColor={mode.category} />
            <MeasurementChip
              label="COVER"
              value={formatted.coverage}
              tone={formatted.coverage.startsWith('Partial') ? COLORS.statusWarn : mode.text}
              labelColor={mode.category}
            />
            <MeasurementChip
              label="NOTE"
              value={selectedRange.note ? 'YES' : 'NONE'}
              tone={selectedRange.note ? mode.text : COLORS.textDim}
              labelColor={mode.category}
            />
          </div>
          <div style={actionRowStyle}>
            <button
              type="button"
              style={{
                ...actionButtonStyle,
                color: mode.text,
                borderColor: isAuditioning ? mode.chromeBorderActive : mode.chromeBorder,
                background: isAuditioning ? mode.bg2 : 'transparent',
              }}
              onClick={() => review.toggleAudition(selectedRange)}
              title={isAuditioning ? 'Stop loop-auditioning the selected range' : 'Loop-audition the selected range'}
            >
              {isAuditioning ? 'STOP AUDITION' : 'AUDITION'}
            </button>
          </div>
        </>
      ) : (
        <div style={{ ...emptyStyle, color: COLORS.textDim }}>
          Commit a range in REVIEW, then audition and export it here.
        </div>
      )}
    </section>
  );
}

function MeasurementChip({
  label,
  value,
  tone,
  labelColor,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: string;
  readonly labelColor: string;
}): React.ReactElement {
  return (
    <div style={measurementChipStyle}>
      <span style={{ ...measurementLabelStyle, color: labelColor }}>{label}</span>
      <span style={{ ...measurementValueStyle, color: tone }} title={value}>{value}</span>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  padding: `${SPACING.xs + 1}px ${SPACING.sm}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  minWidth: 0,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: SPACING.xs,
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.12em',
  lineHeight: 1,
};

const metaStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
};

const metricGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(72px, 1.2fr) repeat(3, minmax(58px, 0.8fr))',
  gap: 5,
  minWidth: 0,
};

const metricBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
};

const metricLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 8,
  letterSpacing: '0.08em',
  lineHeight: 1,
};

const metricValueStyle: React.CSSProperties = {
  minHeight: 14,
  fontFamily: FONTS.mono,
  fontSize: 10,
  letterSpacing: '0.04em',
  lineHeight: 1.2,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const measurementGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 4,
  minWidth: 0,
};

const measurementChipStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 5,
  minWidth: 0,
  padding: '2px 0',
};

const measurementLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 8,
  letterSpacing: '0.07em',
  lineHeight: 1,
  flexShrink: 0,
};

const measurementValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.03em',
  lineHeight: 1.1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const actionButtonStyle: React.CSSProperties = {
  height: 22,
  padding: `0 ${SPACING.sm}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.07em',
  cursor: 'pointer',
  outline: 'none',
  ...quietDisabledControlStyle(false),
};

const emptyStyle: React.CSSProperties = {
  minHeight: 20,
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.04em',
  lineHeight: 1.45,
};
