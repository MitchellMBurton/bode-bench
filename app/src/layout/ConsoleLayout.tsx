// ============================================================
// Four-quadrant console layout with global header and section chrome.
// ============================================================

import { COLORS, FONTS, SPACING } from '../theme';

const GAP = SPACING.panelGap;
const CHROME_H = SPACING.chromeHeaderH;
const GLOBAL_H = SPACING.globalHeaderH;

interface PanelDef {
  category: string;
  title: string;
  stat?: string;
  content: React.ReactNode;
}

interface Props {
  topLeft: PanelDef;
  topRight: PanelDef;
  bottomLeft: PanelDef;
  bottomRight: PanelDef;
  grayscale?: boolean;
}

export function ConsoleLayout({ topLeft, topRight, bottomLeft, bottomRight, grayscale }: Props): React.ReactElement {
  return (
    <div style={shellStyle}>
      {/* Global header */}
      <div style={globalHeaderStyle}>
        <div style={headerLeftStyle}>
          <span style={headerSuperStyle}>BACH CELLO SUITES VISUAL CONSOLE</span>
          <span style={headerTitleStyle}>SCIENTIFIC LISTENING INSTRUMENT</span>
        </div>
        <div style={headerRightStyle}>
          <span style={headerTagStyle}>DESKTOP-FIRST / SESSION-BASED</span>
          <span style={headerTagStyle}>SUITE NO. 1 PRELUDE MILESTONE</span>
        </div>
      </div>

      {/* Four-quadrant grid */}
      <div style={{ ...gridStyle, filter: grayscale ? 'grayscale(1) contrast(1.05)' : 'none' }}>
        {[topLeft, topRight, bottomLeft, bottomRight].map((panel, i) => (
          <div
            key={i}
            style={{
              ...cellStyle,
              gridColumn: i % 2 === 0 ? '1' : '2',
              gridRow: i < 2 ? '1' : '2',
            }}
          >
            <div style={chromeStyle}>
              <div style={chromHeaderStyle}>
                <div style={chromeLabelGroupStyle}>
                  <span style={chromeCategoryStyle}>{panel.category}</span>
                  <span style={chromeTitleStyle}>{panel.title}</span>
                </div>
                {panel.stat && <span style={chromeStatStyle}>{panel.stat}</span>}
              </div>
              <div style={chromeContentStyle}>
                {panel.content}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Styles
// ----------------------------------------------------------------

const shellStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  background: COLORS.bg0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const globalHeaderStyle: React.CSSProperties = {
  height: GLOBAL_H,
  flexShrink: 0,
  background: COLORS.headerBg,
  borderBottom: `1px solid ${COLORS.headerBorder}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `0 ${SPACING.lg}px`,
  boxSizing: 'border-box',
};

const headerLeftStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
};

const headerSuperStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
};

const headerTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeLg,
  color: COLORS.textTitle,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  fontWeight: FONTS.weightMedium,
};

const headerRightStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 1,
};

const headerTagStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  letterSpacing: '0.10em',
};

const gridStyle: React.CSSProperties = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: '340px 1fr',
  gridTemplateRows: '50% 1fr',
  gap: GAP,
  padding: GAP,
  boxSizing: 'border-box',
  minHeight: 0,
};

const cellStyle: React.CSSProperties = {
  overflow: 'hidden',
  minWidth: 0,
  minHeight: 0,
};

const chromeStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: COLORS.bg1,
  border: `1px solid ${COLORS.border}`,
  overflow: 'hidden',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
};

const chromHeaderStyle: React.CSSProperties = {
  height: CHROME_H,
  flexShrink: 0,
  borderBottom: `1px solid ${COLORS.border}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `0 ${SPACING.md}px`,
  boxSizing: 'border-box',
};

const chromeLabelGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: SPACING.sm,
};

const chromeCategoryStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

const chromeTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeMd,
  color: COLORS.textTitle,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const chromeStatStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.waveform,
  letterSpacing: '0.08em',
};

const chromeContentStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  position: 'relative',
};
