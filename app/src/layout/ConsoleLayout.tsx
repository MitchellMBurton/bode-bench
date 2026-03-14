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
import type { VisualMode } from '../audio/displayMode';
import { LayoutInteractionProvider } from './LayoutInteraction';
import { SplitPane } from './SplitPane';
import { COLORS, FONTS, SPACING, CANVAS } from '../theme';

const GAP = SPACING.panelGap;
const CHROME_H = SPACING.chromeHeaderH;
const GLOBAL_H = SPACING.globalHeaderH;
const TOOLBAR_H = 26; // px — single-line layout toolbar
const LEFT_COLUMN_DEFAULT = [24, 76] as const;

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
  visualMode?: VisualMode;
}

// ── ChromePanel ───────────────────────────────────────────────────────────────
// Renders a single panel with category/title header chrome.

interface ChromePanelProps extends PanelDef {
  visualMode?: VisualMode;
}

function ChromePanel({ category, title, stat, content, visualMode }: ChromePanelProps): React.ReactElement {
  const nge = visualMode === 'nge';
  const hyper = visualMode === 'hyper';
  const chromeBorder = nge
    ? CANVAS.nge.chromeBorder
    : hyper
      ? CANVAS.hyper.chromeBorder
      : COLORS.border;
  const chromeBorderInner = nge
    ? CANVAS.nge.chromeBorderActive
    : hyper
      ? CANVAS.hyper.chromeBorderActive
      : COLORS.border;
  const chromeCategory = nge
    ? CANVAS.nge.category
    : hyper
      ? CANVAS.hyper.category
      : COLORS.textCategory;
  const chromeStat = nge
    ? CANVAS.nge.stat
    : hyper
      ? CANVAS.hyper.stat
      : COLORS.waveform;

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

export function ConsoleLayout({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  grayscale,
  visualMode = 'default',
}: Props): React.ReactElement {
  // Incrementing layoutKey forces all SplitPanes to remount, resetting their
  // fracs to initialSizes. This is the reset-layout mechanism.
  const [layoutKey, setLayoutKey] = useState(0);

  const nge = visualMode === 'nge';
  const hyper = visualMode === 'hyper';
  const headerBorder = nge
    ? CANVAS.nge.chromeBorderActive
    : hyper
      ? CANVAS.hyper.chromeBorderActive
      : COLORS.headerBorder;
  const chromeCategory = nge
    ? CANVAS.nge.category
    : hyper
      ? CANVAS.hyper.category
      : COLORS.textCategory;
  const toolbarBorder = nge
    ? CANVAS.nge.chromeBorder
    : hyper
      ? CANVAS.hyper.chromeBorder
      : COLORS.border;
  const toolbarText = nge
    ? 'rgba(80,160,50,0.5)'
    : hyper
      ? 'rgba(112,180,255,0.62)'
      : COLORS.textCategory;
  const toolbarButtonText = nge
    ? 'rgba(160,230,60,0.92)'
    : hyper
      ? 'rgba(222,238,255,0.96)'
      : COLORS.textPrimary;
  const toolbarButtonBorder = nge
    ? '#2c6b18'
    : hyper
      ? 'rgba(112,180,255,0.72)'
      : COLORS.borderActive;
  const toolbarButtonBg = nge
    ? 'rgba(8,18,8,0.9)'
    : hyper
      ? 'rgba(8,14,32,0.92)'
      : COLORS.bg1;

  function handleResetLayout(): void {
    setLayoutKey(k => k + 1);
  }

  return (
    <LayoutInteractionProvider>
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
          onClick={handleResetLayout}
          title="Reset panel sizes to the default layout"
        >
          RESET LAYOUT
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
          initialSizes={[64, 36]}
          minSizePx={[200, 200]}
        >
          {[
            /* Top row */
            <SplitPane
              key="top"
              direction="row"
              initialSizes={[...LEFT_COLUMN_DEFAULT]}
              minSizePx={[240, 320]}
            >
              {[
                <ChromePanel key="tl" {...topLeft} visualMode={visualMode} />,
                <ChromePanel key="tr" {...topRight} visualMode={visualMode} />,
              ]}
            </SplitPane>,

            /* Bottom row */
            <SplitPane
              key="bottom"
              direction="row"
              initialSizes={[...LEFT_COLUMN_DEFAULT]}
              minSizePx={[240, 320]}
            >
              {[
                <ChromePanel key="bl" {...bottomLeft} visualMode={visualMode} />,
                <ChromePanel key="br" {...bottomRight} visualMode={visualMode} />,
              ]}
            </SplitPane>,
          ]}
        </SplitPane>
      </div>
      </div>
    </LayoutInteractionProvider>
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
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'transparent',
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
