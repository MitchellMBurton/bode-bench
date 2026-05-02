// ============================================================
// Theme constants - colour, typography, spacing, canvas drawing
// ============================================================

export const COLORS = {
  // Background layers
  bg0: '#07090d',      // deepest background
  bg1: '#0d1118',      // panel background
  bg2: '#141a23',      // panel inner surface
  bg3: '#202735',      // subtle divider / inactive

  // Borders and chrome
  border: '#344055',
  borderActive: '#60759a',
  borderHighlight: '#788ee0',

  // Text
  textPrimary: '#e2e9f5',
  textSecondary: '#8b98b3',
  textDim: '#526077',
  textLabel: '#a9b4c8',

  // Category labels (panel section headings)
  textCategory: '#6d82a8',
  textTitle: '#d6e0f0',

  // Accent / signal (used for seek bar, focus)
  accent: '#6f83d8',
  accentDim: '#27345f',
  accentGlow: 'rgba(111, 131, 216, 0.16)',

  // Oscilloscope - amber / instrument gold
  waveform: '#d0a038',
  waveformGlow: 'rgba(208, 160, 56, 0.20)',
  waveformGrid: '#263044',
  waveformZero: '#3a3f4a',

  // Spectrogram - NGE thermal: void -> indigo -> teal -> amber -> white-gold
  spectroLow: '#03040a',
  spectroMid: '#0a1240',
  spectroHigh: '#0a4860',
  spectroHot: '#a04808',
  spectroPeak: '#e8b028',

  // Levels
  levelGreen: '#38a850',
  levelYellow: '#b09030',
  levelRed: '#a83030',
  levelTrack: '#1a202b',

  // Frequency bands - spectral by register (sub=navy -> shimmer=amber)
  bandSub: '#1a2870',
  bandBody: '#1a5070',
  bandWood: '#1a7060',
  bandBow: '#706020',
  bandAir: '#a07020',
  bandShimmer: '#c8922a',

  // Score overlay
  noteOverlay: 'rgba(200, 160, 80, 0.7)',
  noteOverlayBorder: 'rgba(240, 200, 100, 0.9)',

  // Global header
  headerBg: '#07090d',
  headerBorder: '#263044',

  // Status
  statusOk: '#38a050',
  statusWarn: '#909030',
  statusErr: '#903030',
} as const;

export const FONTS = {
  mono: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  sans: '"Inter", "DM Sans", system-ui, sans-serif',
  sizeXs: '9px',
  sizeSm: '10px',
  sizeMd: '11px',
  sizeLg: '13px',
  sizeXl: '15px',
  weightNormal: '400',
  weightMedium: '500',
  weightBold: '700',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  panelGap: 2,
  panelPad: 12,
  labelPad: 6,
  chromeHeaderH: 28,   // px - height of each panel's section header strip
  globalHeaderH: 28,   // px - global header bar height
} as const;

export const CANVAS = {
  oscLineWidth: 1.5,
  oscTriggerThreshold: 0.01,

  spectroScrollSpeed: 1,
  timelineScrollPx: 1.5,  // px/frame shared by all scrolling panels; tuned for 20 FPS analysis (≈30px/s at 1×)
  spectroFreqAxisWidth: 48,

  levelBarWidth: 28,
  levelPeakHoldMs: 1500,

  dbMin: -80,
  dbMax: 0,
  dbClipThreshold: -3,

  fftSize: 8192,
  smoothingTimeConstant: 0.8,

  // Per-band bar colors — derived from COLORS band constants (indexed parallel to frequencyBands).
  // Update the COLORS.band* values above to change all band-color usages at once.
  get bandColors(): readonly string[] {
    return [COLORS.bandSub, COLORS.bandBody, COLORS.bandWood, COLORS.bandBow, COLORS.bandAir, COLORS.bandShimmer];
  },

  // ── NGE phosphor-mode palette ─────────────────────────────────
  // Single source of truth for the green-phosphor display mode used
  // across all canvas panels. Import NGE from theme instead of
  // redefining these strings locally in each panel file.
  nge: {
    bg:          '#030a03',
    bg2:         '#131a13',
    trace:       '#a0d840',
    grid:        'rgba(144,200,64,0.22)',
    label:       'rgba(140,210,40,0.5)',
    chromeBorder: '#0d1a0d',
    chromeBorderActive: '#1a4a10',
    category:    'rgba(80,160,50,0.6)',
    stat:        '#78c84a',
  },

  amber: {
    bg:              '#0a0702',
    bg2:             '#171004',
    shell:           '#080602',
    header:          '#1c1204',
    trace:           '#ffb020',
    grid:            'rgba(255,170,36,0.18)',
    label:           'rgba(255,188,84,0.58)',
    text:            'rgba(255,221,138,0.92)',
    glow:            'rgba(255,176,48,0.18)',
    chromeBorder:    '#4b320c',
    chromeBorderActive: '#f0a91a',
    category:        'rgba(255,170,52,0.74)',
    stat:            '#ffc34a',
    persistenceFill: 'rgba(8,6,2,0.90)',
    spectroAxis:     '#8a6219',
    spectroPalette: [
      '#050301',
      '#1a1204',
      '#4a2f08',
      '#8e560d',
      '#d98412',
      '#ffb020',
      '#ffd064',
      '#fff4d2',
    ],
    bandColors: [
      '#4a2507',
      '#6a3309',
      '#8a430b',
      '#b05a10',
      '#d67e18',
      '#ffb020',
    ],
  },

  hyper: {
    bg:           '#02050c',
    bg2:          '#091120',
    trace:        '#62e8ff',
    grid:         'rgba(78,126,232,0.20)',
    label:        'rgba(124,214,255,0.66)',
    text:         'rgba(214,241,255,0.90)',
    glow:         'rgba(98,232,255,0.22)',
    chromeBorder: '#122048',
    chromeBorderActive: '#2b67d8',
    category:     'rgba(104,190,255,0.68)',
    stat:         '#6be6ff',
    persistenceFill: 'rgba(9,17,32,0.86)',
    spectroAxis:  '#2f4ec0',
    spectroPalette: [
      '#02050c',
      '#16206f',
      '#0078d6',
      '#19d9ff',
      '#68ff9a',
      '#ffe45a',
      '#ff8d24',
      '#ff4bb8',
    ],
  },

  // ── EVA palette — NERV command centre / Entry Plug aesthetic ───
  // Purple-void backgrounds, bold NERV orange signal, red warnings,
  // purple chrome. The warm-on-dark palette of Tokyo-3's control room.
  eva: {
    bg:              '#08041a',
    bg2:             '#0f0a24',
    trace:           '#ff7b00',
    grid:            'rgba(120,50,200,0.18)',
    label:           'rgba(255,140,40,0.48)',
    text:            'rgba(255,180,80,0.82)',
    glow:            'rgba(255,120,0,0.14)',
    chromeBorder:    '#160c30',
    chromeBorderActive: '#4a1a90',
    category:        'rgba(170,90,255,0.65)',
    stat:            '#ff6a00',
    persistenceFill: 'rgba(8,4,26,0.88)',
    spectroAxis:     '#4a1a90',
    spectroPalette: [
      '#08041a',
      '#200840',
      '#580030',
      '#b82000',
      '#ff6a00',
      '#ffa020',
      '#ffe060',
      '#fffaf0',
    ],
  },

  red: {
    bg:              '#090203',
    bg2:             '#140607',
    shell:           '#0d0304',
    header:          '#140708',
    trace:           '#ff5a4a',
    grid:            'rgba(160,34,32,0.20)',
    label:           'rgba(214,92,82,0.56)',
    text:            'rgba(255,208,200,0.88)',
    glow:            'rgba(255,90,74,0.16)',
    chromeBorder:    '#321012',
    chromeBorderActive: '#7c2827',
    category:        'rgba(198,82,70,0.72)',
    stat:            '#ff6b5c',
    persistenceFill: 'rgba(9,2,3,0.88)',
    spectroAxis:     '#6a201f',
    spectroPalette: [
      '#050102',
      '#180203',
      '#3e0908',
      '#7a1611',
      '#bf2a1d',
      '#ff5940',
      '#ff8d71',
      '#fff0e8',
    ],
    bandColors: [
      '#4a0c13',
      '#70131a',
      '#92201e',
      '#ba3328',
      '#d94d33',
      '#ff7350',
    ],
  },

  // ── OPTIC palette — white-light dispersion / sterile lab chrome ─────────
  // High-key, instrument-clean surfaces with pale cyan structure and
  // prismatic accents. Intended to feel clinical, luminous, and exact.
  optic: {
    bg:              '#e8f0f5',
    bg2:             '#d5e2ea',
    shell:           '#edf3f7',
    header:          '#dfeaf1',
    trace:           '#0f6d98',
    grid:            'rgba(49,82,104,0.46)',
    label:           'rgba(21,48,66,0.98)',
    text:            'rgba(14,31,43,0.98)',
    glow:            'rgba(16,112,154,0.10)',
    chromeBorder:    '#8eacbf',
    chromeBorderActive: '#2f789d',
    category:        'rgba(24,56,76,0.98)',
    stat:            '#087b99',
    persistenceFill: 'rgba(211,223,231,0.90)',
    spectroAxis:     '#486f87',
    spectroPalette: [
      '#edf3f6',
      '#c2d4df',
      '#86a9bf',
      '#4e8eb5',
      '#1f719f',
      '#068692',
      '#b18443',
      '#7058a1',
    ],
    bandColors: [
      '#587bc4',
      '#338cbc',
      '#2d9fa9',
      '#5eb2a2',
      '#c39b57',
      '#9e84be',
    ],
  },

  // Frequency bands — standard audio engineering terminology
  frequencyBands: [
    { label: 'Sub', range: '20-80 Hz', centerHz: 40, lowHz: 20, highHz: 80 },
    { label: 'Lo-Mid', range: '80-240 Hz', centerHz: 150, lowHz: 80, highHz: 240 },
    { label: 'Mid', range: '240-900 Hz', centerHz: 500, lowHz: 240, highHz: 900 },
    { label: 'Hi-Mid', range: '900-2800 Hz', centerHz: 1800, lowHz: 900, highHz: 2800 },
    { label: 'Presence', range: '2.8-8k Hz', centerHz: 4000, lowHz: 2800, highHz: 8000 },
    { label: 'Air', range: '8-20k Hz', centerHz: 12000, lowHz: 8000, highHz: 20000 },
  ],
} as const;

// ── Centralised mode palette ─────────────────────────────────────────────────
// One record lookup replaces every per-component if/else visual-mode chain.
// Canvas panels still read CANVAS sub-objects for specialised rendering;
// this palette covers chrome, controls, and layout surfaces.

import type { VisualMode } from '../audio/displayMode';

export interface ModePalette {
  readonly bg: string;
  readonly bg2: string;
  readonly trace: string;
  readonly grid: string;
  readonly label: string;
  readonly text: string;
  readonly glow: string;
  readonly chromeBorder: string;
  readonly chromeBorderActive: string;
  readonly category: string;
  readonly stat: string;
}

export const MODES: Record<VisualMode, ModePalette> = {
  default: {
    bg:                COLORS.bg1,
    bg2:               COLORS.bg2,
    trace:             COLORS.waveform,
    grid:              COLORS.waveformGrid,
    label:             COLORS.textDim,
    text:              COLORS.textPrimary,
    glow:              COLORS.waveformGlow,
    chromeBorder:      COLORS.border,
    chromeBorderActive: COLORS.borderActive,
    category:          COLORS.textCategory,
    stat:              COLORS.waveform,
  },
  amber: {
    bg:                CANVAS.amber.bg,
    bg2:               CANVAS.amber.bg2,
    trace:             CANVAS.amber.trace,
    grid:              CANVAS.amber.grid,
    label:             CANVAS.amber.label,
    text:              CANVAS.amber.text,
    glow:              CANVAS.amber.glow,
    chromeBorder:      CANVAS.amber.chromeBorder,
    chromeBorderActive: CANVAS.amber.chromeBorderActive,
    category:          CANVAS.amber.category,
    stat:              CANVAS.amber.stat,
  },
  nge: {
    bg:                CANVAS.nge.bg,
    bg2:               CANVAS.nge.bg2,
    trace:             CANVAS.nge.trace,
    grid:              CANVAS.nge.grid,
    label:             CANVAS.nge.label,
    text:              'rgba(180,230,80,0.9)',
    glow:              'rgba(160,216,64,0.14)',
    chromeBorder:      CANVAS.nge.chromeBorder,
    chromeBorderActive: CANVAS.nge.chromeBorderActive,
    category:          CANVAS.nge.category,
    stat:              CANVAS.nge.stat,
  },
  hyper: {
    bg:                CANVAS.hyper.bg,
    bg2:               CANVAS.hyper.bg2,
    trace:             CANVAS.hyper.trace,
    grid:              CANVAS.hyper.grid,
    label:             CANVAS.hyper.label,
    text:              CANVAS.hyper.text,
    glow:              CANVAS.hyper.glow,
    chromeBorder:      CANVAS.hyper.chromeBorder,
    chromeBorderActive: CANVAS.hyper.chromeBorderActive,
    category:          CANVAS.hyper.category,
    stat:              CANVAS.hyper.stat,
  },
  eva: {
    bg:                CANVAS.eva.bg,
    bg2:               CANVAS.eva.bg2,
    trace:             CANVAS.eva.trace,
    grid:              CANVAS.eva.grid,
    label:             CANVAS.eva.label,
    text:              CANVAS.eva.text,
    glow:              CANVAS.eva.glow,
    chromeBorder:      CANVAS.eva.chromeBorder,
    chromeBorderActive: CANVAS.eva.chromeBorderActive,
    category:          CANVAS.eva.category,
    stat:              CANVAS.eva.stat,
  },
  optic: {
    bg:                CANVAS.optic.bg,
    bg2:               CANVAS.optic.bg2,
    trace:             CANVAS.optic.trace,
    grid:              CANVAS.optic.grid,
    label:             CANVAS.optic.label,
    text:              CANVAS.optic.text,
    glow:              CANVAS.optic.glow,
    chromeBorder:      CANVAS.optic.chromeBorder,
    chromeBorderActive: CANVAS.optic.chromeBorderActive,
    category:          CANVAS.optic.category,
    stat:              CANVAS.optic.stat,
  },
  red: {
    bg:                CANVAS.red.bg,
    bg2:               CANVAS.red.bg2,
    trace:             CANVAS.red.trace,
    grid:              CANVAS.red.grid,
    label:             CANVAS.red.label,
    text:              CANVAS.red.text,
    glow:              CANVAS.red.glow,
    chromeBorder:      CANVAS.red.chromeBorder,
    chromeBorderActive: CANVAS.red.chromeBorderActive,
    category:          CANVAS.red.category,
    stat:              CANVAS.red.stat,
  },
};
