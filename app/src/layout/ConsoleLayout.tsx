// ============================================================
// Four-quadrant console layout with global header and section chrome.
//
// Structure:
//   globalHeader (fixed height)
//   layoutToolbar (fixed height — profile controls, layout status)
//   SplitPane[column] (flex 1)
//     top row → SplitPane[row] → [topLeft, topRight]
//     bottom row → SplitPane[row] → [bottomLeft, bottomRight]
//
// All four inter-quadrant dividers are now draggable:
//   - The horizontal centre line (outer column SplitPane)
//   - Each row's left/right boundary (inner row SplitPanes, independent)
// ============================================================

import { useState } from 'react';
import { SplitPane } from './SplitPane';
import { COLORS, FONTS, SPACING } from '../theme';

const GAP = SPACING.panelGap;
const CHROME_H = SPACING.chromeHeaderH;
const GLOBAL_H = SPACING.globalHeaderH;
const TOOLBAR_H = 26; // px — single-line layout toolbar

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
  nge?: boolean;
  /** Called when the toolbar "RESET ALL" button is pressed, after layout sizes are reset. */
  onResetAll?: () => void;
}

// ── ChromePanel ───────────────────────────────────────────────────────────────
// Renders a single panel with category/title header chrome.

interface ChromePanelProps extends PanelDef {
  nge?: boolean;
}

function ChromePanel({ category, title, stat, content, nge }: ChromePanelProps): React.ReactElement {
  const chromeBorder      = nge ? '#0d1a0d' : COLORS.border;
  const chromeBorderInner = nge ? '#1a4a10' : COLORS.border;
  const chromeCategory    = nge ? 'rgba(80,160,50,0.6)' : COLORS.textCategory;
  const chromeStat        = nge ? '#78c84a' : COLORS.waveform;

  return (
    <div style={{ ...chromeStyle, border: `1px solid ${chromeBorder}` }}>
      <div style={{ ...chromeHeaderStyle, borderBottom: `1px solid ${chromeBorderInner}` }}>
        <div style={chromeLabelGroupStyle}>
          <span style={{ ...chromeCategoryStyle, color: chromeCategory }}>{category}</span>
          <span style={chromeTitleStyle}>{title}</span>
        </div>
        {stat && <span style={{ ...chromeStatStyle, color: chromeStat }}>{stat}</span>}
      </div>
      <div style={chromeContentStyle}>
        {content}
      </div>
    </div>
  );
}

// ── ConsoleLayout ─────────────────────────────────────────────────────────────

export function ConsoleLayout({ topLeft, topRight, bottomLeft, bottomRight, grayscale, nge, onResetAll }: Props): React.ReactElement {
  // Incrementing layoutKey forces all SplitPanes to remount, resetting their
  // fracs to initialSizes. This is the reset-layout mechanism.
  const [layoutKey, setLayoutKey] = useState(0);

  const headerBorder   = nge ? '#1a4a10' : COLORS.headerBorder;
  const chromeCategory = nge ? 'rgba(80,160,50,0.6)' : COLORS.textCategory;
  const toolbarBorder  = nge ? '#0d1a0d' : COLORS.border;
  const toolbarText    = nge ? 'rgba(80,160,50,0.5)' : COLORS.textCategory;
  const toolbarButtonText = nge ? 'rgba(160,230,60,0.92)' : COLORS.textPrimary;
  const toolbarButtonBorder = nge ? '#2c6b18' : COLORS.borderActive;
  const toolbarButtonBg = nge ? 'rgba(8,18,8,0.9)' : COLORS.bg1;

  function handleResetAll(): void {
    setLayoutKey(k => k + 1);
    onResetAll?.();
  }

  return (
    <div style={shellStyle}>
      {/* Global header */}
      <div style={{ ...globalHeaderStyle, borderBottom: `1px solid ${headerBorder}` }}>
        <div style={headerLeftStyle}>
          <span style={{ ...headerSuperStyle, color: chromeCategory }}>BACH CELLO SUITES VISUAL CONSOLE</span>
          <span style={headerTitleStyle}>SCIENTIFIC LISTENING INSTRUMENT</span>
        </div>
        <div style={headerRightStyle}>
          <span style={{ ...headerTagStyle, color: chromeCategory }}>DESKTOP-FIRST / SESSION-BASED</span>
          <span style={{ ...headerTagStyle, color: chromeCategory }}>SUITE NO. 1 PRELUDE MILESTONE</span>
        </div>
      </div>

      {/* Layout toolbar */}
      <div style={{ ...toolbarStyle, borderBottom: `1px solid ${toolbarBorder}` }}>
        <span style={{ ...toolbarLabelStyle, color: toolbarText }}>LAYOUT PROFILE</span>
        <span style={{ ...toolbarValueStyle, color: toolbarText }}>DEFAULT</span>
        <div style={toolbarDividerStyle} />
        <button
          style={{
            ...toolbarButtonStyle,
            color: toolbarButtonText,
            borderColor: toolbarButtonBorder,
            background: toolbarButtonBg,
          }}
          onClick={handleResetAll}
          title="Reset all panel sizes and session settings to defaults"
        >
          RESET ALL
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ ...toolbarLabelStyle, color: toolbarText }}>DRAG DIVIDERS TO RESIZE</span>
      </div>

      {/* Main panel area — all four dividers are draggable */}
      <div style={{
        flex: 1,
        minHeight: 0,
        padding: GAP,
        boxSizing: 'border-box',
        filter: grayscale ? 'grayscale(1) contrast(1.05)' : 'none',
      }}>
        <SplitPane
          key={layoutKey}
          direction="column"
          initialSizes={[50, 50]}
          minSizePx={[200, 200]}
        >
          {[
            /* Top row */
            <SplitPane
              key="top"
              direction="row"
              initialSizes={[340, 660]}
              minSizePx={[240, 320]}
            >
              {[
                <ChromePanel key="tl" {...topLeft} nge={nge} />,
                <ChromePanel key="tr" {...topRight} nge={nge} />,
              ]}
            </SplitPane>,

            /* Bottom row */
            <SplitPane
              key="bottom"
              direction="row"
              initialSizes={[340, 660]}
              minSizePx={[240, 320]}
            >
              {[
                <ChromePanel key="bl" {...bottomLeft} nge={nge} />,
                <ChromePanel key="br" {...bottomRight} nge={nge} />,
              ]}
            </SplitPane>,
          ]}
        </SplitPane>
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

const toolbarStyle: React.CSSProperties = {
  height: TOOLBAR_H,
  flexShrink: 0,
  background: COLORS.bg0,
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.sm,
  padding: `0 ${SPACING.md}px`,
  boxSizing: 'border-box',
};

const toolbarLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  flexShrink: 0,
};

const toolbarValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  flexShrink: 0,
};

const toolbarDividerStyle: React.CSSProperties = {
  width: 1,
  height: 12,
  background: COLORS.border,
  flexShrink: 0,
};

const toolbarButtonStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  background: 'transparent',
  border: `1px solid ${COLORS.border}`,
  color: COLORS.textCategory,
  padding: `2px ${SPACING.sm}px`,
  cursor: 'pointer',
  outline: 'none',
  flexShrink: 0,
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

const chromeHeaderStyle: React.CSSProperties = {
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
