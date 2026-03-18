// ============================================================
// TheaterPanelShell — wraps a panel group with a theater-mode
// standby overlay while video priority mode is active.
// ============================================================

import { COLORS, FONTS, SPACING } from '../theme';

export function TheaterPanelShell({
  active,
  title,
  detail,
  children,
}: {
  active: boolean;
  title: string;
  detail: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={shellStyle}>
      <div style={contentStyle}>{children}</div>
      {active ? (
        <div style={overlayStyle}>
          <div style={overlayTitleStyle}>{title}</div>
          <div style={overlayDetailStyle}>{detail}</div>
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
