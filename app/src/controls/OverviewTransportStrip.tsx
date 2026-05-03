import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useAudioEngine,
  useDiagnosticsLog,
  useRangeIntelligenceSnapshot,
  useRangeIntelligenceStore,
  useVisualMode,
} from '../core/session';
import { formatRangeIntelligenceSummary } from '../runtime/rangeIntelligence';
import { COLORS, FONTS, MODES } from '../theme';
import type { RangeMark } from '../types';
import { formatTransportTime } from '../utils/format';
import { RangeChip, ReviewGlyph } from './reviewChrome';
import { getReviewButtonTone, type ReviewButtonIntent, type ReviewGlyphName } from './reviewChromeShared';
import { MeasurementProbeRibbon } from './MeasurementProbeRibbon';
import { RangeNoteEditor } from './RangeNoteEditor';
import { InlineSessionControls, SessionControls } from './SessionControls';
import { useReviewControlModel } from './useReviewControlModel';

const SEEK_STEP_S = 5;
const CONTROL_HEIGHT_PX = 20;
const SINGLE_RAIL_SPLIT_PX = 1500;
const TUNING_POPOVER_RIGHT_SPLIT_PX = 980;
const TUNING_POPOVER_WIDE_PX = 1480;
const TUNING_POPOVER_NORMAL_WIDTH = 360;
const TUNING_POPOVER_WIDE_WIDTH = 420;
const SAVED_RANGE_VISIBLE_ROWS = 3;
// Two-line rows (chip + time + actions on line 1, inline note on line 2).
const SAVED_RANGE_ROW_HEIGHT_PX = 48;
const SAVED_RANGE_ROW_GAP_PX = 6;

export function OverviewTransportStrip(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const diagnosticsLog = useDiagnosticsLog();
  const rangeIntelligence = useRangeIntelligenceStore();
  const rangeIntelligenceVersion = useRangeIntelligenceSnapshot();
  const visualMode = useVisualMode();
  const review = useReviewControlModel();
  const transport = review.transport;
  const stripRef = useRef<HTMLDivElement>(null);
  const tuningOverlayRef = useRef<HTMLDivElement>(null);
  const [stripWidth, setStripWidth] = useState(1120);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [savedRangesOpen, setSavedRangesOpen] = useState(false);

  const m = MODES[visualMode];
  const hasFile = transport.filename !== null;
  const hasLoop = transport.loopStart !== null && transport.loopEnd !== null;
  const timeLabel = hasFile
    ? `${formatTransportTime(transport.currentTime)} / ${formatTransportTime(transport.duration)}`
    : 'NO FILE';
  const loopLabel = hasLoop ? 'LOOP ON' : 'LOOP';
  const inLabel = review.pendingRangeStartS !== null ? formatTransportTime(review.pendingRangeStartS) : '--:--.-';
  const activeLabel = review.selectedRange
    ? `${formatTransportTime(review.selectedRange.startS)} -> ${formatTransportTime(review.selectedRange.endS)}`
    : '--';
  const recentRanges = review.rangeMarks.slice().reverse();
  const timelineRanges = review.rangeMarks.slice().sort((a, b) => a.startS - b.startS || a.endS - b.endS || a.id - b.id);
  const savedRangesEmpty = review.rangeMarks.length === 0;
  const collapsedFeaturedRange = review.selectedRange ?? recentRanges[0] ?? null;
  const singleRail = stripWidth >= SINGLE_RAIL_SPLIT_PX;
  const anchorTuningRight = stripWidth >= TUNING_POPOVER_RIGHT_SPLIT_PX;
  const tuningPopoverWidth = stripWidth >= TUNING_POPOVER_WIDE_PX
    ? TUNING_POPOVER_WIDE_WIDTH
    : TUNING_POPOVER_NORMAL_WIDTH;
  const savedRangesMaxHeight = SAVED_RANGE_VISIBLE_ROWS * SAVED_RANGE_ROW_HEIGHT_PX + (SAVED_RANGE_VISIBLE_ROWS - 1) * SAVED_RANGE_ROW_GAP_PX;
  const compactTuningTrigger = stripWidth < TUNING_POPOVER_WIDE_PX;
  const rangeSummaryById = useMemo(() => {
    void rangeIntelligenceVersion;
    const summaries = new Map<number, { readonly row: string; readonly active: string }>();
    for (const rangeMark of review.rangeMarks) {
      const summary = rangeIntelligence.summarizeRange(rangeMark);
      summaries.set(rangeMark.id, {
        row: formatRangeIntelligenceSummary(summary, 'row'),
        active: formatRangeIntelligenceSummary(summary, 'active'),
      });
    }
    return summaries;
  }, [rangeIntelligence, rangeIntelligenceVersion, review.rangeMarks]);

  useEffect(() => {
    const node = stripRef.current;
    if (!node) return;

    const syncWidth = (): void => {
      setStripWidth(node.getBoundingClientRect().width);
    };

    syncWidth();
    const observer = new ResizeObserver(() => {
      syncWidth();
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!tuningOpen) return;

    const handleMouseDown = (event: MouseEvent): void => {
      const overlay = tuningOverlayRef.current;
      if (!overlay) return;
      if (!overlay.contains(event.target as Node)) {
        setTuningOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setTuningOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [tuningOpen]);

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

  const actionCluster = (
    <div
      style={{
        ...reviewActionClusterStyle,
        borderColor: m.chromeBorder,
        background: m.bg,
      }}
    >
      <div style={setInClusterStyle}>
        <button
          style={{ ...buttonStyle, background: m.bg2, borderColor: m.chromeBorder, color: m.text }}
          onClick={review.setIn}
          disabled={!hasFile}
          title="Set the review in-point at the current transport time"
        >
          {renderButtonLabel('set-in', 'SET IN')}
        </button>
        <div
          style={{
            ...pendingInReadoutStyle,
            borderColor: m.chromeBorder,
            background: m.bg2,
          }}
        >
          <span style={{ ...pendingInLabelStyle, color: m.category }}>IN</span>
          <span style={{ ...pendingInValueStyle, color: review.pendingRangeStartS !== null ? m.text : COLORS.textDim }}>{inLabel}</span>
        </div>
      </div>

      <button
        style={{ ...buttonStyle, background: m.bg, borderColor: m.chromeBorder, color: m.text }}
        onClick={review.setOut}
        disabled={!review.canCommitRange}
        title="Commit a review range from the pending in-point to the current transport time"
      >
        {renderButtonLabel('set-out', 'SET OUT')}
      </button>
      <button
        style={{ ...buttonStyle, background: m.bg, borderColor: m.chromeBorder, color: m.text }}
        onClick={review.captureLoop}
        disabled={!review.loopReady}
        title="Commit the current loop as a saved review range"
      >
        {renderButtonLabel('from-loop', 'FROM LOOP', 'loop')}
      </button>

      <span style={{ ...actionDividerStyle, borderColor: m.chromeBorder }} />

      <button
        style={{ ...buttonStyle, background: m.bg, borderColor: m.chromeBorder, color: m.text }}
        onClick={review.clearIn}
        disabled={review.pendingRangeStartS === null}
        title="Clear the pending review in-point"
      >
        {renderButtonLabel('clear-in', 'CLEAR IN', 'danger')}
      </button>
      <button
        style={{ ...buttonStyle, background: m.bg, borderColor: m.chromeBorder, color: m.text }}
        onClick={review.clearRanges}
        disabled={review.rangeMarks.length === 0}
        title="Clear all saved review ranges"
      >
        {renderButtonLabel('clear-ranges', 'CLEAR RANGES', 'danger')}
      </button>
    </div>
  );

  const activeReadout = (
    <div
      style={{
        ...activeReadoutStyle,
        borderColor: m.chromeBorder,
        background: m.bg,
      }}
    >
      <span style={{ ...metricLabelStyle, color: m.category }}>ACTIVE</span>
      {review.selectedRange ? (
        <>
          <RangeChip label={review.selectedRange.label} visualMode={visualMode} selected />
          <span style={{ ...metricValueStyle, color: m.text }}>
            {rangeSummaryById.get(review.selectedRange.id)?.active ?? activeLabel}
          </span>
        </>
      ) : (
        <span style={{ ...metricValueStyle, color: COLORS.textDim }}>{activeLabel}</span>
      )}
    </div>
  );
  const measurementProbe = (
    <MeasurementProbeRibbon transportTimeS={hasFile ? transport.currentTime : null} />
  );

  function renderButtonLabel(
    glyph: ReviewGlyphName,
    label: string,
    intent: ReviewButtonIntent = 'neutral',
  ): React.ReactElement {
    const tone = getReviewButtonTone(visualMode, intent);
    return (
      <span style={buttonContentStyle}>
        <ReviewGlyph name={glyph} color={tone.icon} size={11} />
        <span>{label}</span>
      </span>
    );
  }

  const renderSavedRangeRow = (rangeMark: RangeMark): React.ReactElement => {
    const selected = review.selectedRangeId === rangeMark.id;
    const isAuditioning = review.auditionActiveRangeId === rangeMark.id;
    const rangeSummary = rangeSummaryById.get(rangeMark.id)?.row ?? '';
    return (
      <div
        key={rangeMark.id}
        style={{
          ...savedRangeRowStyle,
          borderColor: isAuditioning || selected ? m.chromeBorderActive : m.chromeBorder,
          background: isAuditioning ? m.bg2 : selected ? m.bg2 : 'transparent',
          borderLeftWidth: isAuditioning ? 3 : 1,
          borderLeftColor: isAuditioning ? m.trace : (selected ? m.chromeBorderActive : m.chromeBorder),
          paddingLeft: isAuditioning ? 4 : 6,
        }}
      >
        <div style={savedRangeTopLineStyle}>
          <button
            type="button"
            style={savedRangeSelectStyle}
            onClick={() => review.selectRange(rangeMark.id)}
            title={`Select ${rangeMark.label}`}
          >
            <RangeChip label={rangeMark.label} visualMode={visualMode} selected={selected || isAuditioning} />
            <span style={{ ...savedRangeDetailStyle, color: selected || isAuditioning ? m.text : COLORS.textDim }}>
              {formatTransportTime(rangeMark.startS)} {'->'} {formatTransportTime(rangeMark.endS)}
            </span>
            <span style={{ ...savedRangeMeasurementStyle, color: selected || isAuditioning ? m.category : COLORS.textDim }}>
              {rangeSummary}
            </span>
          </button>
          <div style={savedRangeActionsStyle}>
            <button
              type="button"
              style={{
                ...miniButtonStyle,
                color: isAuditioning ? m.text : m.text,
                borderColor: isAuditioning ? m.chromeBorderActive : m.chromeBorder,
                background: isAuditioning ? m.bg2 : 'transparent',
              }}
              onClick={() => review.toggleAudition(rangeMark)}
              title={isAuditioning ? 'Stop auditioning this range' : 'Loop-audition this range'}
            >
              {isAuditioning ? 'STOP' : 'AUDITION'}
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
        <RangeNoteEditor
          rangeId={rangeMark.id}
          noteValue={rangeMark.note}
          selected={selected}
          textColor={m.text}
          dimColor={m.category}
          accentBg={m.bg2}
          onCommit={review.updateRangeNote}
        />
      </div>
    );
  };

  return (
    <div ref={stripRef} style={{ ...wrapStyle, borderColor: m.chromeBorder, background: m.bg2 }}>
      <div style={singleRail ? singleRailWrapStyle : dualRailWrapStyle}>
        <div style={{ ...(singleRail ? singleRailStyle : primaryRailStyle) }}>
          <div style={transportRailStyle}>
            <div
              style={{
                ...controlGroupStyle,
                borderColor: m.chromeBorder,
                background: m.bg,
              }}
            >
              <button
                style={{ ...buttonStyle, background: m.bg2, borderColor: m.chromeBorder, color: m.text }}
                onClick={() => audioEngine.stop()}
                disabled={!hasFile}
                title="Stop and return to start"
              >
                {renderButtonLabel('stop', 'STOP', 'stop')}
              </button>
              <button
                style={{
                  ...buttonStyle,
                  background: transport.isPlaying ? getReviewButtonTone(visualMode, 'pause').activeBackground : m.bg,
                  borderColor: transport.isPlaying ? getReviewButtonTone(visualMode, 'pause').activeBorder : m.chromeBorder,
                  color: m.text,
                }}
                onClick={() => transport.isPlaying ? audioEngine.pause() : audioEngine.play()}
                disabled={!hasFile}
                title={transport.isPlaying ? 'Pause playback' : 'Play'}
              >
                {transport.isPlaying
                  ? renderButtonLabel('pause', 'PAUSE', 'pause')
                  : renderButtonLabel('play', 'PLAY', 'play')}
              </button>
              <button
                style={{
                  ...buttonStyle,
                  background: hasLoop ? getReviewButtonTone(visualMode, 'loop').activeBackground : m.bg,
                  borderColor: hasLoop ? getReviewButtonTone(visualMode, 'loop').activeBorder : m.chromeBorder,
                  color: m.text,
                }}
                onClick={toggleLoop}
                disabled={!hasFile}
                title={hasLoop ? 'Clear the current loop region' : 'Loop the full file'}
              >
                {renderButtonLabel('loop', 'LOOP', 'loop')}
              </button>
              <button
                style={{ ...buttonStyle, background: m.bg, borderColor: m.chromeBorder, color: m.text }}
                onClick={() => seekBy(-SEEK_STEP_S)}
                disabled={!hasFile}
                title="Seek backward 5 seconds"
              >
                {renderButtonLabel('seek-back', '-5S')}
              </button>
              <button
                style={{ ...buttonStyle, background: m.bg, borderColor: m.chromeBorder, color: m.text }}
                onClick={() => seekBy(SEEK_STEP_S)}
                disabled={!hasFile}
                title="Seek forward 5 seconds"
              >
                {renderButtonLabel('seek-forward', '+5S')}
              </button>
            </div>

            <div
              style={{
                ...timeBlockStyle,
                borderColor: m.chromeBorder,
                background: m.bg,
              }}
            >
              <span style={{ ...timeStyle, color: hasFile ? m.text : COLORS.textDim }}>{timeLabel}</span>
            </div>

            <div
              style={{
                ...statusBadgeGroupStyle,
                borderColor: m.chromeBorder,
                background: m.bg,
              }}
            >
              <span style={{ ...pillStyle, color: m.category, borderColor: m.chromeBorder }}>{loopLabel}</span>
              <span style={{ ...pillStyle, color: m.category, borderColor: m.chromeBorder }}>M {review.markersCount}</span>
              <span style={{ ...pillStyle, color: m.category, borderColor: m.chromeBorder }}>R {review.rangeMarks.length}</span>
            </div>
          </div>

          <div
            style={{
              ...inlineTuningRailStyle,
              borderColor: m.chromeBorder,
              background: m.bg,
            }}
          >
            <InlineSessionControls />
          </div>

          <div ref={tuningOverlayRef} style={tuningTriggerWrapStyle}>
            <button
              type="button"
              aria-label="Playback tuning"
              aria-expanded={tuningOpen}
              aria-haspopup="dialog"
              style={{
                ...tuningTriggerButtonStyle,
                borderColor: tuningOpen ? m.chromeBorderActive : m.chromeBorder,
                background: tuningOpen ? m.bg2 : m.bg,
                color: m.category,
              }}
              onClick={() => setTuningOpen((open) => !open)}
              title="Open playback tuning overlay"
            >
              <span style={tuningTriggerLabelStyle}>{compactTuningTrigger ? 'TUNING' : 'PLAYBACK TUNING'}</span>
              <span
                style={{
                  ...tuningTriggerChevronStyle,
                  color: m.text,
                  transform: tuningOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                }}
              >
                &gt;
              </span>
            </button>

            {tuningOpen ? (
              <div
                style={{
                  ...tuningPopoverStyle,
                  width: tuningPopoverWidth,
                  background: m.bg,
                  borderColor: m.chromeBorderActive,
                  right: anchorTuningRight ? 0 : 'auto',
                  left: anchorTuningRight ? 'auto' : 0,
                }}
              >
                <SessionControls />
              </div>
            ) : null}
          </div>

        </div>

        <div style={secondaryRailStyle}>
          {actionCluster}
          {measurementProbe}
          {activeReadout}
        </div>
      </div>

      <div style={{ ...savedRangesSectionStyle, borderColor: m.chromeBorder }}>
        <button
          type="button"
          style={savedRangesHeaderButtonStyle}
          onClick={() => setSavedRangesOpen((open) => !open)}
          title={savedRangesOpen ? 'Collapse saved ranges' : 'Expand saved ranges'}
          aria-expanded={savedRangesOpen}
        >
          <div style={savedRangesHeaderLeftStyle}>
            <span style={{ ...savedRangesLabelStyle, color: m.category }}>SAVED RANGES</span>
          </div>
          <div style={savedRangesHeaderRightStyle}>
            {savedRangesEmpty ? (
              <span style={{ ...savedRangesHintStyle, color: COLORS.textDim }}>SET IN / SET OUT TO SAVE</span>
            ) : null}
            <span style={{ ...savedRangesMetaStyle, color: m.category }}>{review.rangeMarks.length} TOTAL</span>
            <span
              style={{
                ...savedRangesChevronStyle,
                color: m.text,
                transform: savedRangesOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              &gt;
            </span>
          </div>
        </button>

        {!savedRangesOpen && collapsedFeaturedRange ? renderSavedRangeRow(collapsedFeaturedRange) : null}

        {savedRangesOpen ? (
          savedRangesEmpty ? (
            <div style={savedRangesEmptyStyle}>
              <span style={{ ...savedRangesEmptyTextStyle, color: COLORS.textDim }}>
                SET IN / SET OUT commits review ranges here.
              </span>
            </div>
          ) : timelineRanges.length > 0 ? (
            <div style={{ ...savedRangesListStyle, maxHeight: savedRangesMaxHeight }}>
              {timelineRanges.map(renderSavedRangeRow)}
            </div>
          ) : null
        ) : null}
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
  padding: '7px 10px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  boxSizing: 'border-box',
  overflow: 'visible',
};

const dualRailWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
};

const singleRailWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
};

const primaryRailStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  minWidth: 0,
};

const singleRailStyle: React.CSSProperties = {
  ...primaryRailStyle,
  flexWrap: 'nowrap',
};

const secondaryRailStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'nowrap',
  minWidth: 0,
};

const transportRailStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  minWidth: 0,
  flex: '1 1 auto',
};

const inlineTuningRailStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minWidth: 190,
  flex: '1 1 260px',
  padding: '4px 8px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 3,
  boxSizing: 'border-box',
};

const tuningTriggerWrapStyle: React.CSSProperties = {
  position: 'relative',
  flexShrink: 0,
};

const tuningTriggerButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: CONTROL_HEIGHT_PX + 8,
  padding: '0 10px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 3,
  boxSizing: 'border-box',
  cursor: 'pointer',
  outline: 'none',
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.08em',
  whiteSpace: 'nowrap',
};

const tuningTriggerLabelStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
};

const tuningTriggerChevronStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 10,
  transition: 'transform 140ms ease',
};

const tuningPopoverStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  padding: '10px 12px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 3,
  boxShadow: '0 8px 22px rgba(0,0,0,0.34)',
  zIndex: 20,
  boxSizing: 'border-box',
};

const savedRangesSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginTop: 6,
  paddingTop: 6,
  borderTopWidth: 1,
  borderTopStyle: 'solid',
  minWidth: 0,
  minHeight: 0,
};

const savedRangesHeaderButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  width: '100%',
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
  minWidth: 0,
};

const savedRangesHeaderLeftStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
};

const savedRangesHeaderRightStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
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

const savedRangesHintStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
};

const savedRangesChevronStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 10,
  transition: 'transform 140ms ease',
};

const savedRangesListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SAVED_RANGE_ROW_GAP_PX,
  overflowY: 'auto',
  paddingRight: 2,
};

const savedRangeRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  minHeight: SAVED_RANGE_ROW_HEIGHT_PX,
  padding: '4px 6px',
};

const savedRangeTopLineStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 22,
};

const savedRangeSelectStyle: React.CSSProperties = {
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

const savedRangeDetailStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.05em',
  flexShrink: 0,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const savedRangeMeasurementStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.04em',
  flex: '1 1 auto',
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
  minWidth: 20,
  height: CONTROL_HEIGHT_PX,
  padding: '0 6px',
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
  minHeight: 28,
};

const savedRangesEmptyTextStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.05em',
};

const reviewActionClusterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 4,
  flexWrap: 'wrap',
  minWidth: 0,
  flex: '0 1 auto',
  padding: '3px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 3,
};

const actionDividerStyle: React.CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  borderLeftWidth: 1,
  borderLeftStyle: 'solid',
  opacity: 0.7,
};

const setInClusterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  minWidth: 0,
};

const pendingInReadoutStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: CONTROL_HEIGHT_PX,
  padding: '0 7px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  boxSizing: 'border-box',
};

const pendingInLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.12em',
  whiteSpace: 'nowrap',
};

const pendingInValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

const activeReadoutStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 74,
  maxWidth: 220,
  height: 24,
  padding: '0 8px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 3,
  boxSizing: 'border-box',
  flex: '0 0 auto',
};

const metricLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.12em',
  flexShrink: 0,
};

const metricValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
};

const controlGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
  minWidth: 0,
  padding: '3px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 3,
};

const statusBadgeGroupStyle: React.CSSProperties = {
  ...controlGroupStyle,
  gap: 6,
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 34,
  height: CONTROL_HEIGHT_PX,
  padding: '0 7px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  outline: 'none',
  boxSizing: 'border-box',
  whiteSpace: 'nowrap',
};

const buttonContentStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  whiteSpace: 'nowrap',
};

const timeBlockStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minWidth: 132,
  height: CONTROL_HEIGHT_PX + 8,
  padding: '0 10px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 3,
  boxSizing: 'border-box',
};

const timeStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 10,
  letterSpacing: '0.06em',
  lineHeight: 1.1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: CONTROL_HEIGHT_PX,
  padding: '0 6px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.08em',
  whiteSpace: 'nowrap',
};
