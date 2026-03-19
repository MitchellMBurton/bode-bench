// ============================================================
// Runtime tray metric pill — a labelled value badge
// ============================================================

import type { VisualMode } from '../audio/displayMode';
import { COLORS, FONTS, MODES, SPACING } from '../theme';

export function RuntimeMetricPill({
  label,
  value,
  tone,
  visualMode,
}: {
  label: string;
  value: string;
  tone: 'dim' | 'info' | 'warn';
  visualMode: VisualMode;
}): React.ReactElement {
  const m = MODES[visualMode];
  const optic = visualMode === 'optic';
  const red = visualMode === 'red';

  const pillBg = optic ? 'rgba(247,250,252,0.96)' : red ? 'rgba(14,4,5,0.86)' : m.bg;
  const labelColor = m.category;

  const borderColor =
    tone === 'warn'
      ? COLORS.statusWarn
      : tone === 'info'
        ? m.chromeBorderActive
        : m.chromeBorder;
  const textColor =
    tone === 'warn'
      ? COLORS.textPrimary
      : tone === 'info'
        ? m.trace
        : m.text;

  return (
    <span style={{ ...pillStyle, borderColor, background: pillBg }}>
      <span style={{ ...labelStyle, color: labelColor }}>{label}</span>
      <span style={{ ...valueStyle, color: textColor }}>{value}</span>
    </span>
  );
}

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: SPACING.xs,
  padding: `2px ${SPACING.sm}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: COLORS.border,
  borderRadius: 2,
  background: COLORS.bg1,
  minWidth: 0,
};

const labelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  letterSpacing: '0.12em',
};

const valueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.06em',
  color: COLORS.textSecondary,
};
