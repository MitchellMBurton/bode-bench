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

import { useCallback, useEffect, useRef, useState } from 'react';
import { COLORS } from '../theme';

// Pixel height (column) or width (row) of the entire drag hit area.
const HANDLE_HIT_PX = 8;

const DEFAULT_MIN_PX = 48;

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
  minSizePx = [],
  maxSizePx = [],
  children,
}: SplitPaneProps): React.ReactElement {
  const [fracs, setFracs] = useState(() => normalize(initialSizes));
  const containerRef = useRef<HTMLDivElement>(null);
  const isColumn = direction === 'column';
  const n = children.length;

  // Stable ref for drag state — avoids stale closures in event listeners.
  const dragRef = useRef<{
    handleIdx: number;
    startCoord: number;
    startFracs: number[];
    availPx: number;
  } | null>(null);

  // Compute pixel space available for panes (container minus all handle slices).
  const computeAvailPx = (): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    return (isColumn ? rect.height : rect.width) - (n - 1) * HANDLE_HIT_PX;
  };

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent, handleIdx: number) => {
      e.preventDefault();
      const availPx = computeAvailPx();
      dragRef.current = {
        handleIdx,
        startCoord: isColumn ? e.clientY : e.clientX,
        startFracs: [...fracs],
        availPx,
      };
      document.body.style.cursor = isColumn ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fracs, isColumn],
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
      setFracs(newFracs);
    };

    const onMouseUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isColumn, minSizePx, maxSizePx]);

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
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {items}
    </div>
  );
}
