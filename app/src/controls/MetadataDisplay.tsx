// ============================================================
// Metadata Display — shows loaded file title + optional score metadata.
// ============================================================

import { COLORS, FONTS, MODES, SPACING } from '../theme';
import type { VisualMode } from '../audio/displayMode';
import type { MovementMetadata } from '../types';

interface Props {
  filename: string | null;
  metadata: MovementMetadata | null;
  visualMode: VisualMode;
}

export function MetadataDisplay({ filename, metadata, visualMode }: Props): React.ReactElement {
  // Derive a display title from the filename: strip extension, truncate
  const fileTitle = filename ? stripExtension(filename) : null;
  const metadataTitle = metadata ? formatMetadataTitle(metadata) : null;
  const m = MODES[visualMode];
  const optic = visualMode === 'optic';
  const red = visualMode === 'red';
  const categoryColor = m.category;
  const titleColor = m.text;
  const subtitleColor = optic ? 'rgba(58,89,108,0.82)' : red ? 'rgba(255,186,172,0.78)' : COLORS.textDim;
  const dividerColor = optic ? 'rgba(109,146,165,0.64)' : red ? 'rgba(124,40,39,0.56)' : COLORS.border;
  const metaLabelColor = optic ? 'rgba(78,110,128,0.78)' : red ? 'rgba(214,108,96,0.74)' : COLORS.textDim;
  const metaValueColor = optic ? 'rgba(29,56,72,0.92)' : red ? 'rgba(255,208,200,0.90)' : COLORS.textLabel;

  return (
    <div style={wrapStyle}>
      <div style={titleBlockStyle}>
        {metadata ? (
          <>
            <div style={{ ...composerStyle, color: categoryColor }}>{metadata.composer}</div>
            <div style={{ ...titleStyle, color: titleColor }}>{metadataTitle}</div>
            <div style={{ ...subtitleStyle, color: subtitleColor }}>{metadata.instrument}</div>
          </>
        ) : fileTitle ? (
          <>
            <div style={{ ...composerStyle, color: categoryColor }}>AUDIO</div>
            <div style={{ ...titleStyle, color: titleColor }}>{fileTitle}</div>
          </>
        ) : (
          <>
            <div style={{ ...composerStyle, color: categoryColor }}>NO SESSION</div>
            <div style={{ ...titleStyle, color: optic ? 'rgba(87,118,136,0.86)' : red ? 'rgba(214,108,96,0.74)' : COLORS.textDim, fontSize: FONTS.sizeMd }}>
              No file loaded
            </div>
          </>
        )}
      </div>

      {metadata && (
        <>
          <div style={{ ...dividerStyle, background: dividerColor }} />
          <div style={metaGridStyle}>
            <MetaRow label="KEY"   value={metadata.key} labelColor={metaLabelColor} valueColor={metaValueColor} />
            <MetaRow label="TEMPO" value={metadata.tempoMarking} labelColor={metaLabelColor} valueColor={metaValueColor} />
            <MetaRow label="METER" value={metadata.timeSignature} labelColor={metaLabelColor} valueColor={metaValueColor} />
            <MetaRow label="DUR."  value={formatDuration(metadata.estimatedDurationS)} labelColor={metaLabelColor} valueColor={metaValueColor} />
          </div>
        </>
      )}
    </div>
  );
}

function MetaRow({ label, value, labelColor, valueColor }: { label: string; value: string; labelColor: string; valueColor: string }): React.ReactElement {
  return (
    <div style={metaRowStyle}>
      <span style={{ ...metaLabelStyle, color: labelColor }}>{label}</span>
      <span style={{ ...metaValueStyle, color: valueColor }}>{value}</span>
    </div>
  );
}

function formatMetadataTitle(metadata: MovementMetadata): string {
  if (metadata.collectionTitle) return `${metadata.collectionTitle} — ${metadata.movement}`;
  if (typeof metadata.suite === 'number') return `Suite No. ${metadata.suite} — ${metadata.movement}`;
  return metadata.movement;
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
