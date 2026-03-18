// ============================================================
// Runtime tray metric pill — a labelled value badge
// ============================================================

import type { VisualMode } from '../audio/displayMode';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';

export function RuntimeMetricPill({
  label,
  value,
  tone,
  visualMode = 'default',
}: {
  label: string;
  value: string;
  tone: 'dim' | 'info' | 'warn';
  visualMode?: VisualMode;
}): React.ReactElement {
  const nge = visualMode === 'nge';
  const hyper = visualMode === 'hyper';
  const eva = visualMode === 'eva';

  const pillBg = nge ? 'rgba(4,10,4,0.85)' : hyper ? 'rgba(2,5,18,0.85)' : eva ? 'rgba(8,4,26,0.85)' : COLORS.bg1;
  const labelColor = nge ? 'rgba(80,160,50,0.55)' : hyper ? CANVAS.hyper.category : eva ? CANVAS.eva.category : COLORS.textCategory;

  const borderColor =
    tone === 'warn'
      ? COLORS.statusWarn
      : tone === 'info'
        ? nge ? CANVAS.nge.chromeBorder : hyper ? CANVAS.hyper.chromeBorder : eva ? CANVAS.eva.chromeBorder : COLORS.borderHighlight
        : nge ? 'rgba(60,130,30,0.38)' : hyper ? 'rgba(40,70,180,0.38)' : eva ? 'rgba(120,50,200,0.38)' : COLORS.border;
  const textColor =
    tone === 'warn'
      ? COLORS.textPrimary
      : tone === 'info'
        ? nge ? CANVAS.nge.trace : hyper ? CANVAS.hyper.trace : eva ? CANVAS.eva.trace : COLORS.textPrimary
        : nge ? 'rgba(120,200,60,0.75)' : hyper ? 'rgba(112,180,255,0.65)' : eva ? 'rgba(255,140,40,0.65)' : COLORS.textSecondary;

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
