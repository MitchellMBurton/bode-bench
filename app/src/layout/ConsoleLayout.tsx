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
import { COLORS, FONTS, SPACING, CANVAS, MODES } from '../theme';

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
  titleMode?: 'plain' | 'segmented';
  headerAccessoryPlacement?: 'stacked' | 'inline';
  stat?: string;
  headerAccessory?: React.ReactNode;
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
  runtimeDock: RuntimeDockDef | null;
  optionRow: React.ReactNode;
  grayscale: boolean;
  visualMode: VisualMode;
  layoutResetToken: number;
  onResetLayout: () => void;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getRuntimeTrayMaxHeight(): number {
  return clampValue(Math.round(window.innerHeight * 0.52), RUNTIME_TRAY_MIN_H, RUNTIME_TRAY_MAX_H);
}

function getDefaultRuntimeTrayHeight(): number {
  return clampValue(RUNTIME_TRAY_DEFAULT_H, RUNTIME_TRAY_MIN_H, getRuntimeTrayMaxHeight());
}

function readRuntimeTrayHeight(): number {
  const raw = window.localStorage.getItem(RUNTIME_TRAY_STORAGE_KEY);
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(parsed)) return getDefaultRuntimeTrayHeight();
  return clampValue(parsed, RUNTIME_TRAY_MIN_H, getRuntimeTrayMaxHeight());
}

// ── ChromePanel ───────────────────────────────────────────────────────────────
// Renders a single panel with category/title header chrome.

interface ChromePanelProps extends PanelDef {
  visualMode: VisualMode;
  onFullscreen: () => void;
}

const CHROME_BG: Record<VisualMode, string> = {
  default: COLORS.bg1,
  nge:     COLORS.bg1,
  hyper:   COLORS.bg1,
  eva:     COLORS.bg1,
  optic:   'linear-gradient(180deg, rgba(248,251,253,0.98), rgba(236,243,247,0.99))',
  red:     'linear-gradient(180deg, rgba(16,5,6,0.99), rgba(24,8,9,0.99))',
};
const CHROME_HEADER_BG: Record<VisualMode, string | undefined> = {
  default: undefined, nge: undefined, hyper: undefined, eva: undefined,
  optic:   'linear-gradient(90deg, rgba(251,253,255,0.99), rgba(234,241,246,0.99))',
  red:     'linear-gradient(90deg, rgba(20,8,9,0.98), rgba(34,10,11,0.98))',
};

function ChromePanel({ category, title, titleMode = 'plain', headerAccessoryPlacement = 'stacked', stat, headerAccessory, help, content, visualMode, onFullscreen }: ChromePanelProps): React.ReactElement {
  const m = MODES[visualMode];
  const trimmedTitle = title.trim();
  const segmentedTitle = titleMode === 'segmented'
    ? trimmedTitle.split('/').map((segment) => segment.trim()).filter((segment) => segment.length > 0)
    : null;
  const hasTitle = segmentedTitle ? segmentedTitle.length > 0 : trimmedTitle.length > 0;
  const usesStackedPlainTitle = titleMode === 'plain' && trimmedTitle.length > 28;
  const labelGroup = (
    <div style={usesStackedPlainTitle ? chromeLabelGroupStackedStyle : chromeLabelGroupStyle}>
      <span style={{ ...(usesStackedPlainTitle ? chromeCategoryStackedStyle : chromeCategoryStyle), color: m.category }}>{category}</span>
      {hasTitle && segmentedTitle ? (
        <div style={chromeSegmentedTitleStyle}>
          {segmentedTitle.map((segment, index) => (
            <span key={`${segment}:${index}`} style={chromeTitleSegmentStyle}>
              {index > 0 ? <span style={{ ...chromeTitleSlashStyle, color: m.category }}>/</span> : null}
              <span style={{ ...chromeTitleSegmentTextStyle, color: m.text }}>{segment}</span>
            </span>
          ))}
        </div>
      ) : hasTitle ? (
        <span style={{ ...(usesStackedPlainTitle ? chromeTitleStackedStyle : chromeTitleStyle), color: m.text }}>{trimmedTitle}</span>
      ) : null}
    </div>
  );
  const chromeActions = (
    <div style={chromeHeaderActionsStyle}>
      {stat && <span style={{ ...chromeStatStyle, color: m.stat }}>{stat}</span>}
      {help && <PanelHelp text={help} visualMode={visualMode} />}
      <button
        onClick={onFullscreen}
        style={{ ...fullscreenBtnStyle, color: m.category }}
        title="Expand quadrant to fullscreen"
        aria-label="Fullscreen"
      >
        FULL
      </button>
      </div>
  );
  const headerStyle = headerAccessory
    ? headerAccessoryPlacement === 'inline'
      ? chromeHeaderInlineAccessoryStyle
      : chromeHeaderWithAccessoryStyle
    : usesStackedPlainTitle
      ? chromeHeaderPlainTitleStyle
    : chromeHeaderStyle;

  return (
    <div style={{ ...chromeStyle, background: CHROME_BG[visualMode], border: `1px solid ${m.chromeBorder}` }}>
      <div
        style={{
          ...headerStyle,
          background: CHROME_HEADER_BG[visualMode],
          borderBottom: `1px solid ${m.chromeBorderActive}`,
        }}
      >
        {headerAccessory ? (
          headerAccessoryPlacement === 'inline' ? (
            <>
              <div style={chromeHeaderInlineLabelGroupStyle}>{labelGroup}</div>
              <div style={chromeHeaderInlineAccessoryRowStyle}>{headerAccessory}</div>
              {chromeActions}
            </>
          ) : (
            <>
              <div style={chromeHeaderTopRowStyle}>
                {labelGroup}
                {chromeActions}
              </div>
              <div style={chromeHeaderAccessoryRowStyle}>{headerAccessory}</div>
            </>
          )
        ) : (
          <>
            {labelGroup}
            {chromeActions}
          </>
        )}
        <button
          onClick={onFullscreen}
          style={{ ...fullscreenBtnStyle, color: m.category, display: 'none' }}
          title="Expand quadrant to fullscreen"
          aria-label="Fullscreen"
        >
          ⛶
        </button>
      </div>
      <div style={chromeContentStyle}>
        {content}
      </div>
    </div>
  );
}

// ── Layout theme — all mode-specific derived colors in one place ──────────────

interface LayoutTheme {
  readonly shellBg: string;
  readonly headerBg: string;
  readonly toolbarBg: string;
  readonly toolbarText: string;
  readonly toolbarButtonText: string;
  readonly toolbarButtonBorder: string;
  readonly toolbarButtonBg: string;
  readonly dividerBg: string;
  readonly runtimeHint: string;
  readonly runtimeTrayBg: string;
  readonly runtimeResizeBg: string;
  readonly runtimeResizeGrip: string;
}

const LAYOUT_THEME: Record<VisualMode, LayoutTheme> = {
  default: {
    shellBg:              COLORS.bg0,
    headerBg:             COLORS.headerBg,
    toolbarBg:            COLORS.bg0,
    toolbarText:          COLORS.textCategory,
    toolbarButtonText:    COLORS.textPrimary,
    toolbarButtonBorder:  COLORS.borderActive,
    toolbarButtonBg:      COLORS.bg1,
    dividerBg:            COLORS.border,
    runtimeHint:          COLORS.textDim,
    runtimeTrayBg:        COLORS.bg0,
    runtimeResizeBg:      'linear-gradient(180deg, rgba(12,14,20,0.98), rgba(9,10,16,1))',
    runtimeResizeGrip:    'linear-gradient(90deg, rgba(102,114,168,0.18), rgba(148,154,206,0.82), rgba(102,114,168,0.18))',
  },
  nge: {
    shellBg:              CANVAS.nge.bg,
    headerBg:             CANVAS.nge.bg,
    toolbarBg:            CANVAS.nge.bg,
    toolbarText:          'rgba(80,160,50,0.5)',
    toolbarButtonText:    'rgba(160,230,60,0.92)',
    toolbarButtonBorder:  '#2c6b18',
    toolbarButtonBg:      'rgba(8,18,8,0.9)',
    dividerBg:            CANVAS.nge.chromeBorder,
    runtimeHint:          'rgba(80,160,50,0.4)',
    runtimeTrayBg:        CANVAS.nge.bg,
    runtimeResizeBg:      'linear-gradient(180deg, rgba(5,14,5,0.98), rgba(3,10,3,1))',
    runtimeResizeGrip:    'linear-gradient(90deg, rgba(60,130,30,0.18), rgba(120,200,60,0.82), rgba(60,130,30,0.18))',
  },
  hyper: {
    shellBg:              CANVAS.hyper.bg,
    headerBg:             CANVAS.hyper.bg,
    toolbarBg:            CANVAS.hyper.bg,
    toolbarText:          'rgba(112,180,255,0.62)',
    toolbarButtonText:    'rgba(222,238,255,0.96)',
    toolbarButtonBorder:  'rgba(112,180,255,0.72)',
    toolbarButtonBg:      'rgba(8,14,32,0.92)',
    dividerBg:            CANVAS.hyper.chromeBorder,
    runtimeHint:          'rgba(112,180,255,0.5)',
    runtimeTrayBg:        CANVAS.hyper.bg,
    runtimeResizeBg:      'linear-gradient(180deg, rgba(4,8,20,0.98), rgba(2,5,12,1))',
    runtimeResizeGrip:    'linear-gradient(90deg, rgba(40,70,180,0.18), rgba(98,200,255,0.82), rgba(40,70,180,0.18))',
  },
  eva: {
    shellBg:              CANVAS.eva.bg,
    headerBg:             CANVAS.eva.bg,
    toolbarBg:            CANVAS.eva.bg,
    toolbarText:          'rgba(170,90,255,0.55)',
    toolbarButtonText:    'rgba(255,180,80,0.96)',
    toolbarButtonBorder:  CANVAS.eva.chromeBorderActive,
    toolbarButtonBg:      'rgba(15,10,36,0.92)',
    dividerBg:            CANVAS.eva.chromeBorder,
    runtimeHint:          'rgba(170,90,255,0.45)',
    runtimeTrayBg:        CANVAS.eva.bg,
    runtimeResizeBg:      'linear-gradient(180deg, rgba(12,6,30,0.98), rgba(8,4,20,1))',
    runtimeResizeGrip:    'linear-gradient(90deg, rgba(120,50,200,0.18), rgba(255,123,0,0.82), rgba(120,50,200,0.18))',
  },
  optic: {
    shellBg:              'linear-gradient(180deg, #f3f7fa 0%, #e9f0f4 52%, #e1e9ee 100%)',
    headerBg:             'linear-gradient(90deg, rgba(249,252,253,0.99), rgba(233,241,246,0.98))',
    toolbarBg:            'rgba(232,239,244,0.94)',
    toolbarText:          CANVAS.optic.category,
    toolbarButtonText:    CANVAS.optic.text,
    toolbarButtonBorder:  CANVAS.optic.chromeBorderActive,
    toolbarButtonBg:      'rgba(247,250,252,0.94)',
    dividerBg:            'rgba(91,131,154,0.44)',
    runtimeHint:          'rgba(57,90,109,0.82)',
    runtimeTrayBg:        'rgba(240,246,250,0.99)',
    runtimeResizeBg:      'linear-gradient(180deg, rgba(244,248,251,0.99), rgba(228,237,243,1))',
    runtimeResizeGrip:    'linear-gradient(90deg, rgba(117,151,170,0.16), rgba(79,134,163,0.82), rgba(117,151,170,0.16))',
  },
  red: {
    shellBg:              'linear-gradient(180deg, #0a0203 0%, #120405 48%, #180708 100%)',
    headerBg:             'linear-gradient(90deg, rgba(20,7,8,0.98), rgba(42,12,14,0.98))',
    toolbarBg:            'rgba(16,5,6,0.94)',
    toolbarText:          CANVAS.red.category,
    toolbarButtonText:    CANVAS.red.text,
    toolbarButtonBorder:  CANVAS.red.chromeBorderActive,
    toolbarButtonBg:      'rgba(14,4,5,0.92)',
    dividerBg:            'rgba(124,40,39,0.44)',
    runtimeHint:          'rgba(214,108,96,0.78)',
    runtimeTrayBg:        'rgba(12,4,5,0.99)',
    runtimeResizeBg:      'linear-gradient(180deg, rgba(18,6,7,0.99), rgba(36,10,11,1))',
    runtimeResizeGrip:    'linear-gradient(90deg, rgba(124,40,39,0.16), rgba(255,90,74,0.82), rgba(124,40,39,0.16))',
  },
};

// ── ConsoleLayout ─────────────────────────────────────────────────────────────

export function ConsoleLayout({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  runtimeDock,
  optionRow,
  grayscale,
  visualMode,
  layoutResetToken,
  onResetLayout,
}: Props): React.ReactElement {
  const [runtimeTrayHeight, setRuntimeTrayHeight] = useState(readRuntimeTrayHeight);
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

  const m = MODES[visualMode];
  const lt = LAYOUT_THEME[visualMode];

  useEffect(() => {
    const onResize = () => {
      setRuntimeTrayHeight((current) =>
        clampValue(current, RUNTIME_TRAY_MIN_H, getRuntimeTrayMaxHeight()),
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(RUNTIME_TRAY_STORAGE_KEY, String(runtimeTrayHeight));
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
      <div style={{ ...shellStyle, background: lt.shellBg, filter: grayscale ? 'grayscale(1) contrast(1.05)' : 'none' }}>
      {/* Global header */}
      <div style={{ ...globalHeaderStyle, background: lt.headerBg, borderBottom: `1px solid ${m.chromeBorderActive}` }}>
        <div style={headerLeftStyle}>
          <span style={{ ...headerSuperStyle, color: m.category }}>SCIENTIFIC LISTENING INSTRUMENT</span>
          <span style={{ ...headerDividerStyle, color: m.category }}>|</span>
          <span style={{ ...headerTitleStyle, color: m.text }}>MEDIA ANALYSIS CONSOLE</span>
        </div>
        <div style={headerRightStyle}>
          <span style={{ ...headerTagStyle, color: m.category }}>DESKTOP-FIRST / SESSION-BASED</span>
          <span style={{ ...headerDividerStyle, color: m.category }}>|</span>
          <span style={{ ...headerTagStyle, color: m.category }}>v0.1 ALPHA</span>
        </div>
      </div>

      {runtimeDock !== null && (
        <>
          <div style={{ ...toolbarStyle, ...runtimeToolbarStyle, background: lt.toolbarBg, borderBottom: `1px solid ${m.chromeBorder}` }}>
            <div style={runtimeToolbarMetaStyle}>
              <span style={{ ...toolbarLabelStyle, color: lt.toolbarText }}>{runtimeDock.label}</span>
              <span style={{ ...toolbarValueStyle, color: lt.toolbarText }}>{runtimeDock.value}</span>
              <div style={{ ...toolbarDividerStyle, background: lt.dividerBg }} />
            </div>
            <div style={runtimeSummaryStyle}>{runtimeDock.summary}</div>
            <div style={runtimeToolbarActionsStyle}>
              {runtimeDock.open && (
                <span style={{ ...runtimeToolbarHintStyle, color: lt.runtimeHint }}>DRAG PERF LAB EDGE TO RESIZE</span>
              )}
            </div>
            <button
              style={{
                ...toolbarButtonStyle,
                color: lt.toolbarButtonText,
                borderColor: lt.toolbarButtonBorder,
                background: runtimeDock.open ? lt.toolbarButtonBorder : lt.toolbarButtonBg,
              }}
              onClick={runtimeDock.onToggle}
              title="Open the internal performance diagnostics tray"
            >
              {runtimeDock.open ? `HIDE ${runtimeDock.actionLabel}` : runtimeDock.actionLabel}
            </button>
          </div>
          {runtimeDock.open && (
            <div
              style={{
                ...runtimeTrayStyle,
                height: runtimeTrayHeight,
                background: lt.runtimeTrayBg,
                borderBottom: `1px solid ${m.chromeBorder}`,
              }}
            >
              <div style={runtimeTrayContentStyle}>
                {runtimeDock.content}
              </div>
              <div
                style={{ ...runtimeResizeHandleStyle, background: lt.runtimeResizeBg, borderTop: `1px solid ${m.chromeBorder}` }}
                onPointerDown={onRuntimeTrayResizePointerDown}
                onPointerMove={onRuntimeTrayResizePointerMove}
                onPointerUp={onRuntimeTrayResizePointerUp}
                onPointerCancel={onRuntimeTrayResizePointerCancel}
                onLostPointerCapture={onRuntimeTrayResizePointerCancel}
                onDoubleClick={resetRuntimeTrayHeight}
                title="Drag to resize the Perf Lab tray. Double click to reset the default height."
              >
                <div style={{ ...runtimeResizeGripStyle, background: lt.runtimeResizeGrip }} />
                <span style={{ ...runtimeResizeLabelStyle, color: m.text }}>DRAG TO RESIZE PERF LAB</span>
                <span style={{ ...runtimeResizeHintStyle, color: lt.runtimeHint }}>DBL-CLICK RESET</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Layout toolbar */}
      <div style={{ ...toolbarStyle, ...layoutToolbarStyle, background: lt.toolbarBg, borderBottom: `1px solid ${m.chromeBorder}` }}>
        <span style={{ ...toolbarLabelStyle, color: lt.toolbarText }}>LAYOUT PROFILE</span>
        <span style={{ ...toolbarValueStyle, color: lt.toolbarText }}>DEFAULT</span>
        <div style={{ ...toolbarDividerStyle, background: lt.dividerBg }} />
        <button
          style={{
            ...toolbarButtonStyle,
            color: lt.toolbarButtonText,
            borderColor: lt.toolbarButtonBorder,
            background: lt.toolbarButtonBg,
          }}
          onClick={onResetLayout}
          title="Reset panel sizes to the default layout"
        >
          RESET LAYOUT
        </button>
        <div style={{ ...toolbarDividerStyle, background: lt.dividerBg }} />
        {optionRow}
        <div style={{ flex: 1 }} />
        <span style={{ ...toolbarLabelStyle, color: lt.toolbarText }}>DRAG DIVIDERS TO RESIZE</span>
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
          initialSizes={[69, 31]}
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
        return (
          <div style={{ ...fullscreenOverlayStyle, background: lt.shellBg }} data-shell-overlay="true">
            <div style={{ ...fullscreenHeaderStyle, borderBottom: `1px solid ${m.chromeBorderActive}` }}>
              <span style={{ ...fullscreenHeaderCategoryStyle, color: m.category }}>{def.category}</span>
              <span style={{ ...fullscreenHeaderTitleStyle, color: m.text }}>{def.title}</span>
              <button style={{ ...fullscreenCloseBtnStyle, color: m.text }} onClick={() => setFullscreenQuadrant(null)} title="Exit fullscreen (Escape)" aria-label="Exit fullscreen">✕</button>
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
  alignItems: 'baseline',
  gap: 8,
  minWidth: 0,
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
  fontSize: FONTS.sizeSm,
  color: COLORS.textTitle,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: FONTS.weightMedium,
  lineHeight: 1,
};

const headerRightStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'flex-end',
  gap: 8,
  minWidth: 0,
};

const headerTagStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  letterSpacing: '0.10em',
  lineHeight: 1,
};

const headerDividerStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.12em',
  lineHeight: 1,
};

const toolbarStyle: React.CSSProperties = {
  minHeight: TOOLBAR_H,
  height: 'auto',
  flexShrink: 0,
  background: COLORS.bg0,
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.sm,
  padding: `0 ${SPACING.md}px`,
  boxSizing: 'border-box',
};

const layoutToolbarStyle: React.CSSProperties = {
  minHeight: TOOLBAR_H,
  height: 'auto',
  paddingTop: 4,
  paddingBottom: 4,
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
  gap: SPACING.sm,
  padding: `0 ${SPACING.md}px`,
  boxSizing: 'border-box',
};

const chromeHeaderPlainTitleStyle: React.CSSProperties = {
  ...chromeHeaderStyle,
  height: 'auto',
  minHeight: CHROME_H,
  alignItems: 'flex-start',
  paddingTop: 4,
  paddingBottom: 4,
};

const chromeHeaderWithAccessoryStyle: React.CSSProperties = {
  ...chromeHeaderStyle,
  height: 'auto',
  minHeight: CHROME_H,
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 4,
  paddingTop: 3,
  paddingBottom: 9,
};

const chromeHeaderInlineAccessoryStyle: React.CSSProperties = {
  ...chromeHeaderStyle,
  height: 'auto',
  minHeight: CHROME_H,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  gap: SPACING.sm,
  paddingTop: 4,
  paddingBottom: 4,
};

const chromeHeaderTopRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: SPACING.sm,
  minWidth: 0,
  width: '100%',
};

const chromeLabelGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden',
};

const chromeLabelGroupStackedStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden',
};

const chromeHeaderInlineLabelGroupStyle: React.CSSProperties = {
  ...chromeLabelGroupStyle,
  flex: '0 1 auto',
  maxWidth: '100%',
};

const chromeHeaderAccessoryRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  width: '100%',
  minWidth: 0,
};

const chromeHeaderInlineAccessoryRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  flex: '1 1 520px',
  minWidth: 280,
};

const chromeHeaderActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginLeft: 'auto',
  flexShrink: 0,
};

const chromeCategoryStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  lineHeight: 1,
  flexShrink: 0,
};

const chromeCategoryStackedStyle: React.CSSProperties = {
  ...chromeCategoryStyle,
  lineHeight: 1.1,
};

const chromeTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  color: COLORS.textTitle,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  lineHeight: 1.05,
  minWidth: 0,
};

const chromeTitleStackedStyle: React.CSSProperties = {
  ...chromeTitleStyle,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  whiteSpace: 'normal',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
  lineHeight: 1.2,
};

const chromeSegmentedTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'nowrap',
  minWidth: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
};

const chromeTitleSegmentStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  minWidth: 'fit-content',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const chromeTitleSlashStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.12em',
  lineHeight: 1,
  flexShrink: 0,
};

const chromeTitleSegmentTextStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  lineHeight: 1.05,
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
