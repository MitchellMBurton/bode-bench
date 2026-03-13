// ============================================================
// SplitPane — generic resizable split-pane container.
//
// Design decisions:
//   - Sizes are stored as fractional flex-grow values (sum = 1.0).
//     This means the layout is always proportional and adapts cleanly
//     to container resize without requiring a ResizeObserver.
//   - Handles are fixed-px (HANDLE_HIT_PX) flex items, so available
//     space for panes = containerSize - (n-1) * HANDLE_HIT_PX.
//   - minSizePx is enforced during drag; it is also set as a CSS
//     minHeight/minWidth fallback so layout never visually breaks
//     even if the window is very small.
//   - Global cursor + userSelect are set on body during drag so the
//     UX stays clean across iframe / iframe-less environments.
//   - Direction-agnostic: works for both column and row splits.
//     All future "move panel" work can extend this by lifting the
//     fracs state to a parent layout store and passing it back down.
// ============================================================

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLayoutInteraction } from './LayoutInteraction';
import { COLORS } from '../theme';

// Pixel height (column) or width (row) of the entire drag hit area.
const HANDLE_HIT_PX = 8;
const PREVIEW_LINE_PX = 2;

const DEFAULT_MIN_PX = 48;
const EMPTY_SIZES: number[] = [];

function normalize(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total === 0) return sizes.map(() => 1 / sizes.length);
  return sizes.map(s => s / total);
}

// ── ResizeHandle ──────────────────────────────────────────────────────────────

interface HandleProps {
  isColumn: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

function ResizeHandle({ isColumn, onMouseDown }: HandleProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0,
        flexGrow: 0,
        flexBasis: HANDLE_HIT_PX,
        [isColumn ? 'width' : 'height']: '100%',
        cursor: isColumn ? 'row-resize' : 'col-resize',
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Visible 1px divider centred in the hit area */}
      <div
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          background: hovered ? COLORS.borderActive : COLORS.border,
          ...(isColumn
            ? { top: '50%', left: 0, right: 0, height: 1, transform: 'translateY(-50%)' }
            : { left: '50%', top: 0, bottom: 0, width: 1, transform: 'translateX(-50%)' }),
        }}
      />
    </div>
  );
}

// ── SplitPane ─────────────────────────────────────────────────────────────────

export interface SplitPaneProps {
  /**
   * 'column' = stack vertically, handles are horizontal bars.
   * 'row'    = stack horizontally, handles are vertical bars.
   */
  direction?: 'column' | 'row';

  /**
   * Initial proportional sizes — values are normalised internally so
   * they don't need to sum to any specific number.
   * e.g. [1, 2, 1] → 25 / 50 / 25 % of available space.
   */
  initialSizes: number[];

  /** Minimum pixel size per pane (indexed parallel to children). Defaults to 48 px. */
  minSizePx?: number[];

  /** Maximum pixel size per pane (optional). */
  maxSizePx?: number[];

  children: React.ReactElement[];
}

export function SplitPane({
  direction = 'column',
  initialSizes,
  minSizePx = EMPTY_SIZES,
  maxSizePx = EMPTY_SIZES,
  children,
}: SplitPaneProps): React.ReactElement {
  const [fracs, setFracs] = useState(() => normalize(initialSizes));
  const containerRef = useRef<HTMLDivElement>(null);
  const previewGuideRef = useRef<HTMLDivElement>(null);
  const pendingFracsRef = useRef<number[] | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const interactionId = useId();
  const { beginResize, endInteraction } = useLayoutInteraction();
  const isColumn = direction === 'column';
  const n = children.length;

  // Stable ref for drag state — avoids stale closures in event listeners.
  const dragRef = useRef<{
    handleIdx: number;
    startCoord: number;
    startFracs: number[];
    availPx: number;
    previewFracs: number[];
  } | null>(null);

  // Compute pixel space available for panes (container minus all handle slices).
  const computeAvailPx = useCallback((): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    return (isColumn ? rect.height : rect.width) - (n - 1) * HANDLE_HIT_PX;
  }, [isColumn, n]);

  const setPreviewVisible = useCallback((visible: boolean): void => {
    const guide = previewGuideRef.current;
    if (!guide) return;
    guide.style.opacity = visible ? '1' : '0';
  }, []);

  const setPreviewPosition = useCallback((handleIdx: number, nextFracs: number[]): void => {
    const guide = previewGuideRef.current;
    const container = containerRef.current;
    if (!guide || !container) return;

    const rect = container.getBoundingClientRect();
    const totalPx = isColumn ? rect.height : rect.width;
    const availPx = totalPx - (n - 1) * HANDLE_HIT_PX;
    const paneFraction = nextFracs.slice(0, handleIdx + 1).reduce((sum, frac) => sum + frac, 0);
    const guidePx = Math.round(paneFraction * availPx + handleIdx * HANDLE_HIT_PX + HANDLE_HIT_PX / 2);

    guide.style.transform = isColumn
      ? `translate3d(0, ${guidePx}px, 0)`
      : `translate3d(${guidePx}px, 0, 0)`;
  }, [isColumn, n]);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent, handleIdx: number) => {
      e.preventDefault();
      const availPx = computeAvailPx();
      const startFracs = [...fracs];
      dragRef.current = {
        handleIdx,
        startCoord: isColumn ? e.clientY : e.clientX,
        startFracs,
        availPx,
        previewFracs: startFracs,
      };
      pendingFracsRef.current = null;
      setPreviewPosition(handleIdx, startFracs);
      setPreviewVisible(true);
      beginResize(interactionId);
      document.body.style.cursor = isColumn ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [beginResize, computeAvailPx, fracs, interactionId, isColumn, setPreviewPosition, setPreviewVisible],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.availPx <= 0) return;

      const coord = isColumn ? e.clientY : e.clientX;
      const deltaPx = coord - drag.startCoord;
      const deltaFrac = deltaPx / drag.availPx;
      const i = drag.handleIdx;
      const combined = drag.startFracs[i] + drag.startFracs[i + 1];

      // Per-pane minimum fractions derived from pixel minimums.
      const minA = (minSizePx[i]     ?? DEFAULT_MIN_PX) / drag.availPx;
      const minB = (minSizePx[i + 1] ?? DEFAULT_MIN_PX) / drag.availPx;

      // Per-pane maximum fractions (optional).
      const maxA = maxSizePx[i]     ? maxSizePx[i]     / drag.availPx : combined - minB;
      const maxB = maxSizePx[i + 1] ? maxSizePx[i + 1] / drag.availPx : combined - minA;
      // Expressed as constraint on A: A must be <= combined - minB
      const maxAFromB = combined - minB;
      const maxAFromMax = Math.min(maxA, combined - (combined - maxB));

      const newA = Math.max(minA, Math.min(Math.min(maxAFromB, maxAFromMax), drag.startFracs[i] + deltaFrac));
      const newB = combined - newA;

      const newFracs = [...drag.startFracs];
      newFracs[i]     = newA;
      newFracs[i + 1] = newB;
      drag.previewFracs = newFracs;
      pendingFracsRef.current = newFracs;

      if (dragFrameRef.current !== null) return;
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const activeDrag = dragRef.current;
        const draftFracs = pendingFracsRef.current ?? activeDrag?.previewFracs;
        if (!activeDrag || !draftFracs) return;
        setPreviewPosition(activeDrag.handleIdx, draftFracs);
      });
    };

    const onMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;

      const finalFracs = pendingFracsRef.current ?? drag.previewFracs;
      pendingFracsRef.current = null;
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      setPreviewVisible(false);
      setFracs(finalFracs);
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      endInteraction();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      dragRef.current = null;
      pendingFracsRef.current = null;
      setPreviewVisible(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      endInteraction();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [endInteraction, isColumn, maxSizePx, minSizePx, setPreviewPosition, setPreviewVisible]);

  // Build interleaved [pane, handle, pane, handle, pane, …] children.
  const items: React.ReactElement[] = [];
  children.forEach((child, i) => {
    const minPx = minSizePx[i] ?? DEFAULT_MIN_PX;
    items.push(
      <div
        key={`pane-${i}`}
        style={{
          // flex shorthand: grow=fracs[i], shrink=1, basis=0.
          // The minHeight/Width ensures the pane never collapses below
          // the minimum even when the window is very small.
          flex: `${fracs[i]} 1 0`,
          [isColumn ? 'minHeight' : 'minWidth']: minPx,
          [isColumn ? 'minWidth' : 'minHeight']: 0,
          overflow: 'hidden',
        }}
      >
        {child}
      </div>,
    );
    if (i < n - 1) {
      items.push(
        <ResizeHandle
          key={`handle-${i}`}
          isColumn={isColumn}
          onMouseDown={(e) => onHandleMouseDown(e, i)}
        />,
      );
    }
  });

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: direction,
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {items}
      <div
        ref={previewGuideRef}
        style={{
          position: 'absolute',
          top: isColumn ? -Math.round(PREVIEW_LINE_PX / 2) : 0,
          left: isColumn ? 0 : -Math.round(PREVIEW_LINE_PX / 2),
          width: isColumn ? '100%' : PREVIEW_LINE_PX,
          height: isColumn ? PREVIEW_LINE_PX : '100%',
          background: COLORS.borderHighlight,
          boxShadow: isColumn
            ? `0 0 0 1px ${COLORS.bg0}, 0 0 12px ${COLORS.borderHighlight}`
            : `0 0 0 1px ${COLORS.bg0}, 0 0 12px ${COLORS.borderHighlight}`,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: 30,
          willChange: 'transform, opacity',
          transition: 'opacity 80ms linear',
        }}
      />
    </div>
  );
}
