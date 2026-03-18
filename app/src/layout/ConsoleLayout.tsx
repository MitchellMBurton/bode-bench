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

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VisualMode } from '../audio/displayMode';
import { LayoutInteractionProvider } from './LayoutInteraction';
import { PanelHelp } from './PanelHelp';
import { SplitPane } from './SplitPane';
import { COLORS, FONTS, SPACING, CANVAS } from '../theme';

const GAP = SPACING.panelGap;
const CHROME_H = SPACING.chromeHeaderH;
const GLOBAL_H = SPACING.globalHeaderH;
const TOOLBAR_H = 26; // px — single-line layout toolbar
const LEFT_COLUMN_DEFAULT = [24, 76] as const;
const RUNTIME_TRAY_DEFAULT_H = 340;
const RUNTIME_TRAY_MIN_H = 210;
const RUNTIME_TRAY_MAX_H = 560;
const RUNTIME_TRAY_HANDLE_H = 18;
const RUNTIME_TRAY_STORAGE_KEY = 'console:runtime-tray-height';

interface PanelDef {
  category: string;
  title: string;
  stat?: string;
  help?: string;
  content: React.ReactNode;
}

interface RuntimeDockDef {
  label: string;
  value: string;
  actionLabel: string;
  open: boolean;
  summary: React.ReactNode;
  content: React.ReactNode;
  onToggle: () => void;
}

interface Props {
  topLeft: PanelDef;
  topRight: PanelDef;
  bottomLeft: PanelDef;
  bottomRight: PanelDef;
  runtimeDock?: RuntimeDockDef;
  grayscale?: boolean;
  visualMode?: VisualMode;
  layoutResetToken: number;
  onResetLayout: () => void;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getRuntimeTrayMaxHeight(): number {
  if (typeof window === 'undefined') return RUNTIME_TRAY_MAX_H;
  return clampValue(Math.round(window.innerHeight * 0.52), RUNTIME_TRAY_MIN_H, RUNTIME_TRAY_MAX_H);
}

function getDefaultRuntimeTrayHeight(): number {
  return clampValue(RUNTIME_TRAY_DEFAULT_H, RUNTIME_TRAY_MIN_H, getRuntimeTrayMaxHeight());
}

function readRuntimeTrayHeight(): number {
  if (typeof window === 'undefined') return getDefaultRuntimeTrayHeight();
  try {
    const raw = window.localStorage.getItem(RUNTIME_TRAY_STORAGE_KEY);
    const parsed = raw ? Number.parseFloat(raw) : NaN;
    if (!Number.isFinite(parsed)) return getDefaultRuntimeTrayHeight();
    return clampValue(parsed, RUNTIME_TRAY_MIN_H, getRuntimeTrayMaxHeight());
  } catch {
    return getDefaultRuntimeTrayHeight();
  }
}

// ── ChromePanel ───────────────────────────────────────────────────────────────
// Renders a single panel with category/title header chrome.

interface ChromePanelProps extends PanelDef {
  visualMode?: VisualMode;
  onFullscreen?: () => void;
}

function ChromePanel({ category, title, stat, help, content, visualMode, onFullscreen }: ChromePanelProps): React.ReactElement {
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
        {help && <PanelHelp text={help} visualMode={visualMode} />}
        {onFullscreen && (
          <button
            onClick={onFullscreen}
            style={fullscreenBtnStyle}
            title="Expand quadrant to fullscreen"
            aria-label="Fullscreen"
          >
            ⛶
          </button>
        )}
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
  runtimeDock,
  grayscale,
  visualMode = 'default',
  layoutResetToken,
  onResetLayout,
}: Props): React.ReactElement {
  const [runtimeTrayHeight, setRuntimeTrayHeight] = useState(() => readRuntimeTrayHeight());
  const runtimeTrayResizeRef = useRef<{ startY: number; startHeight: number; pointerId: number } | null>(null);
  const [fullscreenQuadrant, setFullscreenQuadrant] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null);

  useEffect(() => {
    if (!fullscreenQuadrant) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setFullscreenQuadrant(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreenQuadrant]);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      setRuntimeTrayHeight((current) =>
        clampValue(current, RUNTIME_TRAY_MIN_H, getRuntimeTrayMaxHeight()),
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(RUNTIME_TRAY_STORAGE_KEY, String(runtimeTrayHeight));
    } catch {
      // Ignore localStorage failures and keep the session value in memory.
    }
  }, [runtimeTrayHeight]);

  useEffect(() => {
    return () => {
      runtimeTrayResizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const finishRuntimeTrayResize = useCallback(() => {
    runtimeTrayResizeRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const resetRuntimeTrayHeight = useCallback(() => {
    setRuntimeTrayHeight(getDefaultRuntimeTrayHeight());
  }, []);

  const onRuntimeTrayResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    runtimeTrayResizeRef.current = {
      startY: event.clientY,
      startHeight: runtimeTrayHeight,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [runtimeTrayHeight]);

  const onRuntimeTrayResizePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const resize = runtimeTrayResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    const nextHeight = clampValue(
      resize.startHeight + (event.clientY - resize.startY),
      RUNTIME_TRAY_MIN_H,
      getRuntimeTrayMaxHeight(),
    );
    setRuntimeTrayHeight(nextHeight);
  }, []);

  const onRuntimeTrayResizePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const resize = runtimeTrayResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishRuntimeTrayResize();
  }, [finishRuntimeTrayResize]);

  const onRuntimeTrayResizePointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const resize = runtimeTrayResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishRuntimeTrayResize();
  }, [finishRuntimeTrayResize]);

  return (
    <LayoutInteractionProvider>
      <div style={{ ...shellStyle, filter: grayscale ? 'grayscale(1) contrast(1.05)' : 'none' }}>
      {/* Global header */}
      <div style={{ ...globalHeaderStyle, borderBottom: `1px solid ${headerBorder}` }}>
        <div style={headerLeftStyle}>
          <span style={{ ...headerSuperStyle, color: chromeCategory }}>SCIENTIFIC LISTENING INSTRUMENT</span>
          <span style={headerTitleStyle}>MEDIA ANALYSIS CONSOLE</span>
        </div>
        <div style={headerRightStyle}>
          <span style={{ ...headerTagStyle, color: chromeCategory }}>DESKTOP-FIRST / SESSION-BASED</span>
          <span style={{ ...headerTagStyle, color: chromeCategory }}>v0.1 ALPHA</span>
        </div>
      </div>


      {runtimeDock ? (
        <>
          <div style={{ ...toolbarStyle, ...runtimeToolbarStyle, borderBottom: `1px solid ${toolbarBorder}` }}>
            <div style={runtimeToolbarMetaStyle}>
              <span style={{ ...toolbarLabelStyle, color: toolbarText }}>{runtimeDock.label}</span>
              <span style={{ ...toolbarValueStyle, color: toolbarText }}>{runtimeDock.value}</span>
              <div style={toolbarDividerStyle} />
            </div>
            <div style={runtimeSummaryStyle}>{runtimeDock.summary}</div>
            <div style={runtimeToolbarActionsStyle}>
              {runtimeDock.open ? (
                <span style={runtimeToolbarHintStyle}>DRAG PERF LAB EDGE TO RESIZE</span>
              ) : null}
            </div>
            <button
              style={{
                ...toolbarButtonStyle,
                color: toolbarButtonText,
                borderColor: toolbarButtonBorder,
                background: runtimeDock.open ? toolbarButtonBorder : toolbarButtonBg,
              }}
              onClick={runtimeDock.onToggle}
              title="Open the internal performance diagnostics tray"
            >
              {runtimeDock.open ? `HIDE ${runtimeDock.actionLabel}` : runtimeDock.actionLabel}
            </button>
          </div>
          {runtimeDock.open ? (
            <div
              style={{
                ...runtimeTrayStyle,
                height: runtimeTrayHeight,
                borderBottom: `1px solid ${toolbarBorder}`,
              }}
            >
              <div style={runtimeTrayContentStyle}>
                {runtimeDock.content}
              </div>
              <div
                style={runtimeResizeHandleStyle}
                onPointerDown={onRuntimeTrayResizePointerDown}
                onPointerMove={onRuntimeTrayResizePointerMove}
                onPointerUp={onRuntimeTrayResizePointerUp}
                onPointerCancel={onRuntimeTrayResizePointerCancel}
                onLostPointerCapture={onRuntimeTrayResizePointerCancel}
                onDoubleClick={resetRuntimeTrayHeight}
                title="Drag to resize the Perf Lab tray. Double click to reset the default height."
              >
                <div style={runtimeResizeGripStyle} />
                <span style={runtimeResizeLabelStyle}>DRAG TO RESIZE PERF LAB</span>
                <span style={runtimeResizeHintStyle}>DBL-CLICK RESET</span>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

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
          onClick={onResetLayout}
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
      }}>
        <SplitPane
          direction="column"
          initialSizes={[56, 44]}
          minSizePx={[200, 180]}
          resetToken={layoutResetToken}
          persistKey="console:root"
        >
          {[
            /* Top row */
            <SplitPane
              key="top"
              direction="row"
              initialSizes={LEFT_COLUMN_DEFAULT}
              minSizePx={[240, 320]}
              resetToken={layoutResetToken}
              persistKey="console:top-row"
            >
              {[
                <ChromePanel key="tl" {...topLeft} visualMode={visualMode} onFullscreen={() => setFullscreenQuadrant('tl')} />,
                <ChromePanel key="tr" {...topRight} visualMode={visualMode} onFullscreen={() => setFullscreenQuadrant('tr')} />,
              ]}
            </SplitPane>,

            /* Bottom row */
            <SplitPane
              key="bottom"
              direction="row"
              initialSizes={LEFT_COLUMN_DEFAULT}
              minSizePx={[240, 320]}
              resetToken={layoutResetToken}
              persistKey="console:bottom-row"
            >
              {[
                <ChromePanel key="bl" {...bottomLeft} visualMode={visualMode} onFullscreen={() => setFullscreenQuadrant('bl')} />,
                <ChromePanel key="br" {...bottomRight} visualMode={visualMode} onFullscreen={() => setFullscreenQuadrant('br')} />,
              ]}
            </SplitPane>,
          ]}
        </SplitPane>
      </div>

      {/* Quadrant fullscreen overlay */}
      {fullscreenQuadrant !== null && (() => {
        const quadrantMap = { tl: topLeft, tr: topRight, bl: bottomLeft, br: bottomRight } as const;
        const def = quadrantMap[fullscreenQuadrant];
        const ngeFS = visualMode === 'nge';
        const hyperFS = visualMode === 'hyper';
        const fsBorder = ngeFS ? CANVAS.nge.chromeBorderActive : hyperFS ? CANVAS.hyper.chromeBorderActive : COLORS.borderHighlight;
        const fsCategory = ngeFS ? CANVAS.nge.category : hyperFS ? CANVAS.hyper.category : COLORS.textCategory;
        return (
          <div style={fullscreenOverlayStyle} data-shell-overlay="true">
            <div style={{ ...fullscreenHeaderStyle, borderBottom: `1px solid ${fsBorder}` }}>
              <span style={{ ...fullscreenHeaderCategoryStyle, color: fsCategory }}>{def.category}</span>
              <span style={fullscreenHeaderTitleStyle}>{def.title}</span>
              <button style={fullscreenCloseBtnStyle} onClick={() => setFullscreenQuadrant(null)} title="Exit fullscreen (Escape)" aria-label="Exit fullscreen">✕</button>
            </div>
            <div style={fullscreenContentStyle}>{def.content}</div>
          </div>
        );
      })()}
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

const runtimeToolbarStyle: React.CSSProperties = {
  minHeight: TOOLBAR_H,
  height: 'auto',
  paddingTop: 4,
  paddingBottom: 4,
  gap: SPACING.md,
};

const runtimeToolbarMetaStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.sm,
  flexShrink: 0,
};

const runtimeSummaryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.xs,
  minWidth: 0,
  flexWrap: 'wrap',
  flex: 1,
};

const runtimeToolbarActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  minWidth: 0,
};

const runtimeToolbarHintStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textDim,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};

const runtimeTrayStyle: React.CSSProperties = {
  flexShrink: 0,
  minHeight: RUNTIME_TRAY_MIN_H,
  background: COLORS.bg0,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const runtimeTrayContentStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const runtimeResizeHandleStyle: React.CSSProperties = {
  height: RUNTIME_TRAY_HANDLE_H,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.sm,
  padding: `0 ${SPACING.md}px`,
  boxSizing: 'border-box',
  borderTop: `1px solid ${COLORS.border}`,
  background: 'linear-gradient(180deg, rgba(12, 14, 20, 0.98), rgba(9, 10, 16, 1))',
  cursor: 'row-resize',
  userSelect: 'none',
  touchAction: 'none',
};

const runtimeResizeGripStyle: React.CSSProperties = {
  width: 34,
  height: 4,
  borderRadius: 999,
  background: 'linear-gradient(90deg, rgba(102, 114, 168, 0.18), rgba(148, 154, 206, 0.82), rgba(102, 114, 168, 0.18))',
  flexShrink: 0,
};

const runtimeResizeLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  flexShrink: 0,
};

const runtimeResizeHintStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textDim,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  marginLeft: 'auto',
};

const fullscreenOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  background: COLORS.bg0,
  display: 'flex',
  flexDirection: 'column',
};

const fullscreenHeaderStyle: React.CSSProperties = {
  height: CHROME_H,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  padding: `0 ${SPACING.md}px`,
  gap: SPACING.sm,
  boxSizing: 'border-box',
};

const fullscreenHeaderCategoryStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

const fullscreenHeaderTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeMd,
  color: COLORS.textTitle,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const fullscreenCloseBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeMd,
  color: COLORS.textSecondary,
  padding: '0 4px',
  lineHeight: 1,
  flexShrink: 0,
};

const fullscreenContentStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const fullscreenBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0 4px',
  cursor: 'pointer',
  fontFamily: FONTS.mono,
  fontSize: 10,
  color: 'rgba(160,140,80,0.30)',
  lineHeight: 1,
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
