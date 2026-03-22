import type { VisualMode } from '../audio/displayMode';
import { CANVAS, COLORS, FONTS } from '../theme';

export type ReviewGlyphName =
  | 'play'
  | 'pause'
  | 'stop'
  | 'loop'
  | 'seek-back'
  | 'seek-forward'
  | 'set-in'
  | 'set-out'
  | 'from-loop'
  | 'clear-in'
  | 'clear-ranges';

export type ReviewButtonIntent = 'play' | 'pause' | 'stop' | 'loop' | 'neutral' | 'danger';

interface RangeChipPalette {
  readonly background: string;
  readonly border: string;
  readonly text: string;
  readonly selectedBackground: string;
  readonly selectedBorder: string;
  readonly selectedText: string;
}

interface CanvasRangeChipOptions {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly dpr: number;
  readonly visualMode: VisualMode;
  readonly selected?: boolean;
  readonly minX?: number;
  readonly maxX?: number;
}

const RANGE_CHIP_THEMES: Record<VisualMode, RangeChipPalette> = {
  default: {
    background: 'rgba(92,126,214,0.18)',
    border: 'rgba(152,196,255,0.74)',
    text: 'rgba(212,226,255,0.94)',
    selectedBackground: 'rgba(112,146,232,0.28)',
    selectedBorder: 'rgba(196,220,255,0.98)',
    selectedText: 'rgba(246,249,255,0.98)',
  },
  optic: {
    background: 'rgba(17,122,165,0.12)',
    border: 'rgba(17,122,165,0.50)',
    text: 'rgba(17,96,130,0.96)',
    selectedBackground: 'rgba(17,122,165,0.19)',
    selectedBorder: 'rgba(11,96,130,0.98)',
    selectedText: 'rgba(10,78,105,0.98)',
  },
  red: {
    background: 'rgba(64,90,170,0.18)',
    border: 'rgba(130,176,255,0.74)',
    text: 'rgba(186,208,255,0.92)',
    selectedBackground: 'rgba(86,112,200,0.30)',
    selectedBorder: 'rgba(206,224,255,0.98)',
    selectedText: 'rgba(240,246,255,0.98)',
  },
  nge: {
    background: 'rgba(80,140,38,0.16)',
    border: 'rgba(160,230,60,0.64)',
    text: 'rgba(190,245,110,0.94)',
    selectedBackground: 'rgba(120,176,56,0.26)',
    selectedBorder: 'rgba(210,255,148,0.92)',
    selectedText: 'rgba(244,255,228,0.98)',
  },
  hyper: {
    background: 'rgba(32,118,167,0.18)',
    border: 'rgba(98,200,255,0.72)',
    text: 'rgba(168,228,255,0.96)',
    selectedBackground: 'rgba(48,138,188,0.28)',
    selectedBorder: 'rgba(170,230,255,0.98)',
    selectedText: 'rgba(238,248,255,0.98)',
  },
  eva: {
    background: 'rgba(160,90,255,0.14)',
    border: 'rgba(255,170,88,0.74)',
    text: 'rgba(255,190,118,0.94)',
    selectedBackground: 'rgba(182,104,255,0.20)',
    selectedBorder: 'rgba(255,192,118,0.98)',
    selectedText: 'rgba(255,234,190,0.98)',
  },
};

function rgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map((char) => `${char}${char}`).join('')
    : value;
  const int = Number.parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function accentForMode(visualMode: VisualMode): string {
  switch (visualMode) {
    case 'optic':
      return CANVAS.optic.trace;
    case 'red':
      return CANVAS.red.trace;
    case 'nge':
      return CANVAS.nge.trace;
    case 'hyper':
      return CANVAS.hyper.trace;
    case 'eva':
      return CANVAS.eva.trace;
    default:
      return COLORS.accent;
  }
}

function semanticAccent(visualMode: VisualMode, intent: Exclude<ReviewButtonIntent, 'loop' | 'neutral' | 'danger'>): string {
  const light = visualMode === 'optic';
  if (intent === 'play') return light ? '#2f8f58' : '#66e090';
  if (intent === 'pause') return light ? '#9a6709' : '#f2bf57';
  return light ? '#b34f48' : '#ff7d73';
}

export function getReviewButtonTone(
  visualMode: VisualMode,
  intent: ReviewButtonIntent,
): {
  readonly icon: string;
  readonly activeBorder: string;
  readonly activeBackground: string;
} {
  const accent = intent === 'neutral'
    ? COLORS.textPrimary
    : intent === 'loop'
      ? accentForMode(visualMode)
      : intent === 'danger'
        ? semanticAccent(visualMode, 'stop')
        : semanticAccent(visualMode, intent);
  const optic = visualMode === 'optic';
  return {
    icon: accent,
    activeBorder: rgba(accent, optic ? 0.64 : 0.76),
    activeBackground: rgba(accent, optic ? 0.10 : 0.14),
  };
}

export function getRangeChipPalette(visualMode: VisualMode, selected = false): {
  readonly background: string;
  readonly border: string;
  readonly text: string;
} {
  const palette = RANGE_CHIP_THEMES[visualMode];
  return selected
    ? {
      background: palette.selectedBackground,
      border: palette.selectedBorder,
      text: palette.selectedText,
    }
    : {
      background: palette.background,
      border: palette.border,
      text: palette.text,
    };
}

export function drawCanvasRangeChip(
  ctx: CanvasRenderingContext2D,
  {
    label,
    x,
    y,
    dpr,
    visualMode,
    selected = false,
    minX,
    maxX,
  }: CanvasRangeChipOptions,
): { readonly width: number; readonly height: number; readonly x: number } {
  const palette = getRangeChipPalette(visualMode, selected);
  const fontPx = 8.5 * dpr;
  const padX = 3 * dpr;
  const height = 12 * dpr;
  ctx.save();
  ctx.font = `600 ${fontPx}px ${FONTS.mono}`;
  const textWidth = ctx.measureText(label).width;
  const width = textWidth + padX * 2;
  let chipX = x;
  if (typeof minX === 'number') chipX = Math.max(minX, chipX);
  if (typeof maxX === 'number') chipX = Math.min(chipX, maxX - width);
  ctx.fillStyle = palette.background;
  ctx.fillRect(chipX, y, width, height);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = Math.max(dpr, 1);
  ctx.strokeRect(chipX + 0.5 * dpr, y + 0.5 * dpr, Math.max(width - dpr, dpr), Math.max(height - dpr, dpr));
  ctx.fillStyle = palette.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, chipX + padX, y + height / 2 + 0.5 * dpr);
  ctx.restore();
  return { width, height, x: chipX };
}
