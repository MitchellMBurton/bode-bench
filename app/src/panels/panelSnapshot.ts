// ============================================================
// panelSnapshot — capture any analysis panel as annotated PNG
// or export tabular data as CSV.
//
// Composites the main canvas + optional cursor overlay canvas,
// appends a 28px metadata strip with session context, and
// triggers a browser download.
// ============================================================

import type { PanelSnapshotMetadata } from '../types';
import type { VisualMode } from '../audio/displayMode';
import { MODES } from '../theme';
import { hexToRgba } from '../utils/canvas';

const STRIP_H = 28;
const STRIP_FONT = '10px "JetBrains Mono", monospace';
const STRIP_PAD = 8;

// ── Helpers ──────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

function timestampString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function modeDisplayName(mode: VisualMode): string {
  const names: Record<VisualMode, string> = {
    default: 'DEFAULT',
    amber: 'AMBER',
    nge: 'NGE',
    hyper: 'HYPER',
    eva: 'EVA',
    optic: 'OPTIC',
    red: 'RED',
  };
  return names[mode];
}

function resolveColor(color: string, alpha: number): string {
  if (color.startsWith('#')) return hexToRgba(color, alpha);
  return color;
}

// ── Internal ─────────────────────────────────────────────────

function drawMetadataStrip(
  ctx: CanvasRenderingContext2D,
  y: number,
  w: number,
  metadata: PanelSnapshotMetadata,
  visualMode: VisualMode,
): void {
  const mode = MODES[visualMode];

  // Background
  ctx.fillStyle = resolveColor(mode.bg, 0.95);
  ctx.fillRect(0, y, w, STRIP_H);

  // Separator line
  ctx.fillStyle = resolveColor(mode.chromeBorder, 1);
  ctx.fillRect(0, y, w, 1);

  // Text
  ctx.font = STRIP_FONT;
  ctx.fillStyle = resolveColor(mode.text, 1);
  ctx.textBaseline = 'middle';
  const textY = y + STRIP_H / 2;

  const parts: string[] = [metadata.panelLabel];
  if (metadata.filename) parts.push(metadata.filename);
  parts.push(`${formatTime(metadata.currentTime)} / ${formatTime(metadata.duration)}`);
  parts.push(timestampString());
  parts.push(modeDisplayName(visualMode));

  ctx.textAlign = 'left';
  ctx.fillText(parts.join('  |  '), STRIP_PAD, textY);
}

// ── Public API ───────────────────────────────────────────────

/**
 * Composite the main canvas (+ optional overlay) and a metadata
 * strip into a single PNG data URL.
 */
export function capturePanel(
  canvas: HTMLCanvasElement,
  overlayCanvas: HTMLCanvasElement | null,
  metadata: PanelSnapshotMetadata,
  visualMode: VisualMode,
): string {
  const w = canvas.width;
  const h = canvas.height;

  const snap = document.createElement('canvas');
  snap.width = w;
  snap.height = h + STRIP_H;
  const ctx = snap.getContext('2d')!;

  ctx.drawImage(canvas, 0, 0);
  if (overlayCanvas && overlayCanvas.width > 0 && overlayCanvas.height > 0) {
    ctx.drawImage(overlayCanvas, 0, 0);
  }

  drawMetadataStrip(ctx, h, w, metadata, visualMode);
  return snap.toDataURL('image/png');
}

/**
 * Capture all canvases in a quadrant container (stacked vertically)
 * and composite them into a single annotated PNG data URL.
 */
export function captureQuadrant(
  container: HTMLElement,
  metadata: PanelSnapshotMetadata,
  visualMode: VisualMode,
): string | null {
  const mainCanvases = Array.from(
    container.querySelectorAll<HTMLCanvasElement>('canvas:not(.panel-cursor-overlay)'),
  );
  if (mainCanvases.length === 0) return null;

  // Sort by vertical position in the container
  mainCanvases.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

  // Pair each main canvas with its sibling overlay (if any)
  const pairs = mainCanvases.map((main) => ({
    main,
    overlay: main.parentElement?.querySelector<HTMLCanvasElement>('canvas.panel-cursor-overlay') ?? null,
  }));

  // Composite dimensions
  const maxW = Math.max(...pairs.map((p) => p.main.width));
  let totalH = 0;
  for (const p of pairs) totalH += p.main.height;

  const snap = document.createElement('canvas');
  snap.width = maxW;
  snap.height = totalH + STRIP_H;
  const ctx = snap.getContext('2d')!;

  // Stack each panel's canvas vertically
  let y = 0;
  for (const { main, overlay } of pairs) {
    ctx.drawImage(main, 0, y);
    if (overlay && overlay.width > 0 && overlay.height > 0) {
      ctx.drawImage(overlay, 0, y);
    }
    y += main.height;
  }

  drawMetadataStrip(ctx, totalH, maxW, metadata, visualMode);
  return snap.toDataURL('image/png');
}

/**
 * Trigger a browser download of a data URL as PNG.
 */
export function downloadPng(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Trigger a browser download of CSV data.
 */
export function downloadCsv(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
): void {
  const lines: string[] = [headers.join(',')];
  for (const row of rows) {
    lines.push(row.map((cell) => {
      const s = String(cell);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
