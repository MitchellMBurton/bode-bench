// ============================================================
// TheaterPanelShell — wraps a panel group with a theater-mode
// standby overlay while video priority mode is active.
// ============================================================

import type { VisualMode } from '../audio/displayMode';
import { COLORS, FONTS, MODES, SPACING } from '../theme';

export function TheaterPanelShell({
  active,
  title,
  detail,
  visualMode,
  children,
}: {
  active: boolean;
  title: string;
  detail: string;
  visualMode: VisualMode;
  children: React.ReactNode;
}): React.ReactElement {
  const m = MODES[visualMode];
  const optic = visualMode === 'optic';
  const red = visualMode === 'red';

  return (
    <div style={shellStyle}>
      <div style={contentStyle}>{children}</div>
      {active ? (
        <div
          style={{
            ...overlayStyle,
            background: optic
              ? 'linear-gradient(180deg, rgba(249,252,255,0.92), rgba(233,243,249,0.96))'
              : red
                ? 'linear-gradient(180deg, rgba(22,6,7,0.92), rgba(36,8,9,0.96))'
              : overlayStyle.background,
            border: (optic || red) ? `1px solid ${m.chromeBorderActive}` : undefined,
            backdropFilter: (optic || red) ? 'blur(12px)' : undefined,
          }}
        >
          <div style={{ ...overlayTitleStyle, color: m.text }}>{title}</div>
          <div style={{ ...overlayDetailStyle, color: optic ? 'rgba(48,92,120,0.78)' : red ? 'rgba(255,186,172,0.78)' : overlayDetailStyle.color }}>{detail}</div>
        </div>
      ) : null}
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
};

const contentStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
};

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  gap: SPACING.sm,
  padding: SPACING.lg,
  background: 'linear-gradient(180deg, rgba(10,12,18,0.88), rgba(14,16,22,0.94))',
  textAlign: 'center',
  pointerEvents: 'auto',
};

const overlayTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeMd,
  color: COLORS.textPrimary,
  letterSpacing: '0.14em',
};

const overlayDetailStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  color: COLORS.textSecondary,
  letterSpacing: '0.04em',
  maxWidth: 440,
  lineHeight: 1.6,
};
