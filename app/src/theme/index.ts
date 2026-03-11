// ============================================================
// Theme constants - colour, typography, spacing, canvas drawing
// ============================================================

export const COLORS = {
  // Background layers
  bg0: '#08080b',      // deepest background
  bg1: '#0e0e13',      // panel background
  bg2: '#13131a',      // panel inner surface
  bg3: '#1c1c26',      // subtle divider / inactive

  // Borders and chrome
  border: '#252535',
  borderActive: '#3a3a55',
  borderHighlight: '#5050a0',

  // Text
  textPrimary: '#c8c8d8',
  textSecondary: '#606080',
  textDim: '#363648',
  textLabel: '#808098',

  // Category labels (panel section headings)
  textCategory: '#4a4a70',
  textTitle: '#a0a0c0',

  // Accent / signal (used for seek bar, focus)
  accent: '#5060c0',
  accentDim: '#28305a',
  accentGlow: 'rgba(80, 96, 192, 0.12)',

  // Oscilloscope - amber / instrument gold
  waveform: '#c8922a',
  waveformGlow: 'rgba(200, 146, 42, 0.18)',
  waveformGrid: '#1e1a10',
  waveformZero: '#2a2218',

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
  levelTrack: '#181820',

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
  headerBg: '#08080b',
  headerBorder: '#1e1e2a',

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
  globalHeaderH: 38,   // px - global header bar height
} as const;

export const CANVAS = {
  oscLineWidth: 1.5,
  oscTriggerThreshold: 0.01,

  spectroScrollSpeed: 1,
  timelineScrollPx: 3.0,  // px/frame shared by all scrolling panels; tuned for 20 FPS analysis
  spectroFreqAxisWidth: 48,

  levelBarWidth: 28,
  levelPeakHoldMs: 1500,

  dbMin: -80,
  dbMax: 0,
  dbClipThreshold: -3,

  fftSize: 4096,
  smoothingTimeConstant: 0.8,

  // Per-band bar colors - indexed parallel to frequencyBands
  bandColors: ['#1a2870', '#1a5070', '#1a7060', '#706020', '#a07020', '#c8922a'],

  // Cello-meaningful frequency bands
  frequencyBands: [
    { label: 'Sub', range: '20-80 Hz', centerHz: 40, lowHz: 20, highHz: 80 },
    { label: 'Body', range: '80-240 Hz', centerHz: 150, lowHz: 80, highHz: 240 },
    { label: 'Wood', range: '240-900 Hz', centerHz: 500, lowHz: 240, highHz: 900 },
    { label: 'Bow', range: '900-2800 Hz', centerHz: 1800, lowHz: 900, highHz: 2800 },
    { label: 'Air', range: '2.8-8k Hz', centerHz: 4000, lowHz: 2800, highHz: 8000 },
    { label: 'Shimmer', range: '8-20k Hz', centerHz: 12000, lowHz: 8000, highHz: 20000 },
  ],
} as const;
