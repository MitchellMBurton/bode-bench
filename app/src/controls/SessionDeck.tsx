// ============================================================
// SessionDeck — SAVE SESSION / LOAD SESSION / GENERATE REPORT
// row that lives inside the Session Console TOP CONTROL DECK,
// adjacent to OPEN MEDIA / ALT AUDIO / SUBTITLES / VIDEO WINDOW.
//
// Owns: session save/load wiring, report generation, file input,
// pending-session relink + mismatch protection. Reads stores via
// session hooks; receives transient app-level state (grayscale,
// runtime tray height) and the source identity via props.
// ============================================================

import { useRef, useState } from 'react';

import type { VisualMode } from '../audio/displayMode';
import {
  useAnalysisConfig,
  useDerivedMediaSnapshot,
} from '../core/session';
import {
  CONSOLE_SPLIT_PANE_KEYS,
  readRuntimeTrayHeight,
} from '../layout/consoleLayoutWorkspace';
import { readSplitPaneFractions } from '../layout/splitPanePersistence';
import { buildReviewReportFilename, buildReviewReportMarkdown, downloadReviewReport } from '../runtime/reviewReport';
import {
  buildReviewSession,
  buildReviewSessionFilename,
  downloadReviewSession,
  matchReviewSessionSource,
  readReviewSessionFile,
  type CurrentSessionSourceIdentity,
  type ReviewSessionV1,
} from '../runtime/reviewSession';
import { CANVAS, COLORS, FONTS, MODES, SPACING } from '../theme';
import { quietDisabledControlStyle } from './controlVisualStates';

export type SessionStatusTone = 'dim' | 'info' | 'warn' | 'ok';

export interface SessionStatus {
  readonly text: string;
  readonly tone: SessionStatusTone;
}

interface SessionDeckProps {
  readonly visualMode: VisualMode;
  readonly source: CurrentSessionSourceIdentity;
  readonly currentTimeS: number;
  readonly grayscale: boolean;
  readonly pendingSession: ReviewSessionV1 | null;
  readonly onPendingSessionChange: (next: ReviewSessionV1 | null) => void;
  readonly onSessionRestore: (session: ReviewSessionV1) => void;
  readonly onStatusChange: (status: SessionStatus) => void;
}

function getToneColor(visualMode: VisualMode, tone: SessionStatusTone): string {
  const mode = MODES[visualMode];
  switch (tone) {
    case 'ok':
    case 'info':
      return mode.text;
    case 'warn':
      return mode.trace;
    case 'dim':
      return mode.category;
    default: {
      const exhaustive: never = tone;
      return exhaustive;
    }
  }
}

export function SessionDeck({
  visualMode,
  source,
  currentTimeS,
  grayscale,
  pendingSession,
  onPendingSessionChange,
  onSessionRestore,
  onStatusChange,
}: SessionDeckProps): React.ReactElement {
  const derivedSnapshot = useDerivedMediaSnapshot();
  const analysisConfig = useAnalysisConfig();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const mode = MODES[visualMode];
  const themedBorder = mode.chromeBorderActive;
  const themedSubtle = mode.chromeBorder;
  const canSave = source.filename !== null;
  const canReport = derivedSnapshot.rangeMarks.length > 0;

  const handleSave = (): void => {
    if (!canSave) return;
    const session = buildReviewSession({
      source: {
        filename: source.filename,
        kind: source.kind,
        durationS: source.durationS,
        mediaKey: source.mediaKey,
        size: null,
        lastModified: null,
        sourcePath: null,
      },
      review: {
        markers: derivedSnapshot.markers,
        pendingRangeStartS: derivedSnapshot.pendingRangeStartS,
        rangeMarks: derivedSnapshot.rangeMarks,
        selectedRangeId: derivedSnapshot.selectedRangeId,
      },
      workspace: {
        visualMode,
        grayscale,
        analysisConfig,
        layout: readSplitPaneFractions(CONSOLE_SPLIT_PANE_KEYS),
        runtimeTrayHeight: readRuntimeTrayHeight(),
      },
    });
    downloadReviewSession(session, buildReviewSessionFilename(source.filename));
    onStatusChange({ text: 'Session saved.', tone: 'ok' });
  };

  const handleReport = (): void => {
    if (!canReport) return;
    const markdown = buildReviewReportMarkdown({
      filename: source.filename,
      durationS: source.durationS ?? 0,
      currentTimeS,
      rangeMarks: derivedSnapshot.rangeMarks,
      selectedRangeId: derivedSnapshot.selectedRangeId,
    });
    downloadReviewReport(markdown, buildReviewReportFilename(source.filename));
    onStatusChange({ text: 'Report downloaded.', tone: 'ok' });
  };

  const handleLoadFile = async (file: File): Promise<void> => {
    setBusy(true);
    try {
      const result = await readReviewSessionFile(file);
      if (result.kind === 'error') {
        onPendingSessionChange(null);
        onStatusChange({ text: result.message, tone: 'warn' });
        return;
      }
      const match = matchReviewSessionSource(result.session.source, source);
      if (match.kind === 'match') {
        onSessionRestore(result.session);
        onPendingSessionChange(null);
        onStatusChange({ text: 'Session restored.', tone: 'ok' });
        return;
      }
      if (match.kind === 'no-current-source') {
        onPendingSessionChange(result.session);
        onStatusChange({
          text: `Session loaded — open ${result.session.source.filename ?? 'source media'} to apply.`,
          tone: 'info',
        });
        return;
      }
      onPendingSessionChange(result.session);
      onStatusChange({ text: match.message, tone: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  const renderButton = (
    label: string,
    onClick: () => void,
    disabled: boolean,
    title: string,
  ): React.ReactElement => {
    const isUnavailable = disabled || busy;
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isUnavailable}
        title={title}
        style={{
          ...buttonStyle,
          color: isUnavailable ? mode.category : mode.text,
          borderColor: isUnavailable ? themedSubtle : themedBorder,
          background: isUnavailable ? 'transparent' : sessionDeckBg(visualMode),
          ...quietDisabledControlStyle(isUnavailable),
        }}
      >
        {label}
      </button>
    );
  };

  const pendingLabel = pendingSession
    ? `PENDING: ${pendingSession.source.filename ?? 'unknown source'}`
    : null;

  return (
    <div style={wrapStyle}>
      <input
        ref={inputRef}
        type="file"
        accept=".review-session.json,.json,application/json"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = '';
          if (file) void handleLoadFile(file);
        }}
      />
      <span style={{ ...labelStyle, color: mode.category }}>SESSION</span>
      <div style={buttonsStyle}>
        {renderButton('SAVE SESSION', handleSave, !canSave, 'Download the current review workspace as a portable .review-session.json file')}
        {renderButton('LOAD SESSION', () => inputRef.current?.click(), false, 'Load a previously saved review session')}
        {renderButton('GENERATE REPORT', handleReport, !canReport, 'Download a markdown report of saved review ranges')}
      </div>
      {pendingLabel ? (
        <span style={{ ...pendingStyle, color: getToneColor(visualMode, 'info') }}>{pendingLabel}</span>
      ) : null}
    </div>
  );
}

function sessionDeckBg(visualMode: VisualMode): string {
  switch (visualMode) {
    case 'amber': return CANVAS.amber.bg2;
    case 'optic': return CANVAS.optic.bg2;
    case 'red': return CANVAS.red.bg2;
    default: return COLORS.bg2;
  }
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  paddingTop: 4,
};

const labelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.14em',
  whiteSpace: 'nowrap',
};

const buttonsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 4,
  flex: '1 1 320px',
};

const buttonStyle: React.CSSProperties = {
  height: 24,
  padding: `0 ${SPACING.xs}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  outline: 'none',
  transition: 'background 0.1s, border-color 0.1s',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

const pendingStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
};
