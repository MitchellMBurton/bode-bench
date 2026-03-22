// ============================================================
// useMeasurementCursor — shared hook for interactive crosshair
// measurement cursors on canvas analysis panels.
//
// Each panel provides a mapToValues callback that converts
// device-pixel coordinates into domain-specific CursorPoint
// values (Hz, dB, amplitude, LUFS, etc.).
//
// Features:
//   - Crosshair overlay on a transparent second canvas
//   - Text readout in the existing .panel-hover-readout div
//   - Click-to-pin delta mode (pinned + hover with Δ values)
//   - Mode-aware crosshair colours via MODES[visualMode]
// ============================================================

import { useCallback, useEffect, useRef } from 'react';
import type { CursorPoint } from '../types';
import type { VisualMode } from '../audio/displayMode';
import { MODES } from '../theme';
import { hexToRgba } from '../utils/canvas';

// ── Types ────────────────────────────────────────────────────

export type CursorMapFn = (devX: number, devY: number) => CursorPoint | null;

export interface UseMeasurementCursorOptions {
  /** Main panel canvas ref. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Existing .panel-hover-readout div ref. */
  readoutRef: React.RefObject<HTMLDivElement | null>;
  /** Panel-specific coordinate → domain-value mapper. */
  mapToValues: CursorMapFn;
  /** Current visual mode (read each mouse event). */
  visualMode: VisualMode;
}

export interface UseMeasurementCursorReturn {
  /** Ref for the overlay <canvas> element in JSX. */
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
  /** Attach to main canvas onMouseMove. */
  handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** Attach to main canvas onMouseLeave. */
  handleMouseLeave: () => void;
  /** Attach to main canvas onClick for pin/unpin. */
  handleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

// ── Helpers ──────────────────────────────────────────────────

const DASH_PATTERN = [6, 4];

function traceColorAtAlpha(mode: VisualMode, alpha: number): string {
  const hex = MODES[mode].trace;
  // MODES trace is always a hex colour
  if (hex.startsWith('#')) return hexToRgba(hex, alpha);
  return hex;
}

function formatReadout(hover: CursorPoint, pinned: CursorPoint | null): string {
  const primary = hover.primaryLabel;
  const secondary = hover.secondaryLabel;
  let line = secondary ? `${primary}   ${secondary}` : primary;
  if (pinned) {
    const dp = hover.primary - pinned.primary;
    const ds = hover.secondary - pinned.secondary;
    const dpSign = dp >= 0 ? '+' : '';
    const dsSign = ds >= 0 ? '+' : '';
    // Format delta labels in the same style as primary/secondary
    line += `   |   Δ${dpSign}${formatDelta(dp, hover.primaryLabel)}  Δ${dsSign}${formatDelta(ds, hover.secondaryLabel)}`;
  }
  return line;
}

/** Extract the unit from a label like "261 Hz" or "-12.3 dB" and format a delta with it. */
function formatDelta(delta: number, referenceLabel: string): string {
  // Try to extract unit suffix from reference label
  const match = referenceLabel.match(/\s*(Hz|kHz|dB|dBFS|LUFS|s|ms|st|ct)$/i);
  const unit = match ? ` ${match[1]}` : '';
  // Use same decimal places as reference
  const decMatch = referenceLabel.match(/\.(\d+)/);
  const decimals = decMatch ? decMatch[1].length : 0;
  return `${Math.abs(delta).toFixed(decimals)}${unit}`;
}

// ── Hook ─────────────────────────────────────────────────────

export function useMeasurementCursor({
  canvasRef,
  readoutRef,
  mapToValues,
  visualMode,
}: UseMeasurementCursorOptions): UseMeasurementCursorReturn {
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const pinnedRef = useRef<CursorPoint | null>(null);
  const modeRef = useRef(visualMode);
  useEffect(() => { modeRef.current = visualMode; }, [visualMode]);

  // Keep overlay canvas sized to match main canvas via ResizeObserver
  useEffect(() => {
    const main = canvasRef.current;
    const overlay = overlayRef.current;
    if (!main || !overlay) return;

    const syncSize = () => {
      if (overlay.width !== main.width) overlay.width = main.width;
      if (overlay.height !== main.height) overlay.height = main.height;
    };
    syncSize();

    const ro = new ResizeObserver(syncSize);
    ro.observe(main);
    return () => ro.disconnect();
  }, [canvasRef]);

  const drawCrosshair = useCallback((
    ctx: CanvasRenderingContext2D,
    point: CursorPoint,
    w: number,
    h: number,
    mode: VisualMode,
    dashed: boolean,
  ) => {
    ctx.save();
    ctx.strokeStyle = traceColorAtAlpha(mode, dashed ? 0.3 : 0.5);
    ctx.lineWidth = 1;
    if (dashed) ctx.setLineDash(DASH_PATTERN);

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(point.devX, 0);
    ctx.lineTo(point.devX, h);
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, point.devY);
    ctx.lineTo(w, point.devY);
    ctx.stroke();

    ctx.restore();
  }, []);

  const syncOverlaySize = useCallback((main: HTMLCanvasElement): HTMLCanvasElement | null => {
    const overlay = overlayRef.current;
    if (!overlay) return null;
    if (overlay.width !== main.width) overlay.width = main.width;
    if (overlay.height !== main.height) overlay.height = main.height;
    return overlay;
  }, []);

  const getPointerDeviceCoords = useCallback((
    main: HTMLCanvasElement,
    clientX: number,
    clientY: number,
  ): { devX: number; devY: number } | null => {
    const rect = main.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    return {
      devX: cssX * (main.width / rect.width),
      devY: cssY * (main.height / rect.height),
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const main = e.currentTarget;
    const overlay = syncOverlaySize(main);
    const readout = readoutRef.current;
    if (!overlay) return;
    const coords = getPointerDeviceCoords(main, e.clientX, e.clientY);
    if (!coords) return;
    const { devX, devY } = coords;

    const point = mapToValues(devX, devY);
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    const w = overlay.width;
    const h = overlay.height;
    ctx.clearRect(0, 0, w, h);

    if (!point) {
      if (readout) readout.style.display = 'none';
      return;
    }

    const mode = modeRef.current;

    // Draw pinned crosshair (dashed) if present
    if (pinnedRef.current) {
      drawCrosshair(ctx, pinnedRef.current, w, h, mode, true);
    }

    // Draw hover crosshair (solid)
    drawCrosshair(ctx, point, w, h, mode, false);

    // Update readout text
    if (readout) {
      readout.style.display = 'block';
      readout.textContent = formatReadout(point, pinnedRef.current);
    }
  }, [readoutRef, mapToValues, drawCrosshair, getPointerDeviceCoords, syncOverlaySize]);

  const handleMouseLeave = useCallback(() => {
    const overlay = overlayRef.current;
    const readout = readoutRef.current;
    if (overlay) {
      const ctx = overlay.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
    if (readout) readout.style.display = 'none';
  }, [readoutRef]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const main = e.currentTarget;

    if (pinnedRef.current) {
      // Clear pinned cursor
      pinnedRef.current = null;
    } else {
      // Pin current position
      syncOverlaySize(main);
      const coords = getPointerDeviceCoords(main, e.clientX, e.clientY);
      if (!coords) return;
      const { devX, devY } = coords;
      const point = mapToValues(devX, devY);
      if (point) pinnedRef.current = point;
    }
  }, [mapToValues, getPointerDeviceCoords, syncOverlaySize]);

  return { overlayRef, handleMouseMove, handleMouseLeave, handleClick };
}
