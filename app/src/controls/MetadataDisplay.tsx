// ============================================================
// Metadata Display — shows loaded file title + optional score metadata.
// ============================================================

import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import type { VisualMode } from '../audio/displayMode';
import type { MovementMetadata } from '../types';

interface Props {
  filename?: string | null;
  metadata?: MovementMetadata | null;
  visualMode?: VisualMode;
}

export function MetadataDisplay({ filename, metadata, visualMode }: Props): React.ReactElement {
  // Derive a display title from the filename: strip extension, truncate
  const fileTitle = filename ? stripExtension(filename) : null;
  const eva = visualMode === 'eva';
  const categoryColor = visualMode === 'nge'
    ? CANVAS.nge.category
    : visualMode === 'hyper'
      ? CANVAS.hyper.category
      : eva
        ? CANVAS.eva.category
        : COLORS.textCategory;

  return (
    <div style={wrapStyle}>
      <div style={titleBlockStyle}>
        {metadata ? (
          <>
            <div style={{ ...composerStyle, color: categoryColor }}>{metadata.composer}</div>
            <div style={titleStyle}>
              Cello Suite No.{metadata.suite} — {metadata.movement}
            </div>
            <div style={subtitleStyle}>{metadata.instrument}</div>
          </>
        ) : fileTitle ? (
          <>
            <div style={{ ...composerStyle, color: categoryColor }}>AUDIO</div>
            <div style={titleStyle}>{fileTitle}</div>
          </>
        ) : (
          <>
            <div style={{ ...composerStyle, color: categoryColor }}>NO SESSION</div>
            <div style={{ ...titleStyle, color: COLORS.textDim, fontSize: FONTS.sizeMd }}>
              No file loaded
            </div>
          </>
        )}
      </div>

      {metadata && (
        <>
          <div style={dividerStyle} />
          <div style={metaGridStyle}>
            <MetaRow label="KEY"   value={metadata.key} />
            <MetaRow label="TEMPO" value={metadata.tempoMarking} />
            <MetaRow label="METER" value={metadata.timeSignature} />
            <MetaRow label="DUR."  value={formatDuration(metadata.estimatedDurationS)} />
          </div>
        </>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={metaRowStyle}>
      <span style={metaLabelStyle}>{label}</span>
      <span style={metaValueStyle}>{value}</span>
    </div>
  );
}

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `~${m}:${String(sec).padStart(2, '0')}`;
}

const wrapStyle: React.CSSProperties = {
  padding: SPACING.md,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.sm,
};

const titleBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const composerStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

const titleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeMd,
  color: COLORS.textPrimary,
  fontWeight: FONTS.weightMedium,
  letterSpacing: '0.04em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textDim,
  letterSpacing: '0.08em',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: COLORS.border,
};

const metaGridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: SPACING.sm,
  alignItems: 'baseline',
};

const metaLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textDim,
  letterSpacing: '0.1em',
  width: 44,
  flexShrink: 0,
};

const metaValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  color: COLORS.textLabel,
  letterSpacing: '0.04em',
};
