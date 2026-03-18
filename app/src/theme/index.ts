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

  hyper: {
    bg:           '#02050c',
    bg2:          '#091120',
    trace:        '#62e8ff',
    grid:         'rgba(84,132,255,0.22)',
    label:        'rgba(112,208,255,0.62)',
    text:         'rgba(228,146,255,0.78)',
    glow:         'rgba(98,232,255,0.22)',
    chromeBorder: '#122048',
    chromeBorderActive: '#3559d8',
    category:     'rgba(112,180,255,0.74)',
    stat:         '#ff68c6',
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

  // ── OPTIC palette — white-light dispersion / sterile lab chrome ─────────
  // High-key, instrument-clean surfaces with pale cyan structure and
  // prismatic accents. Intended to feel clinical, luminous, and exact.
  optic: {
    bg:              '#eaf1f5',
    bg2:             '#dbe5ec',
    shell:           '#eef4f7',
    header:          '#e3edf2',
    trace:           '#126f9d',
    grid:            'rgba(73,106,126,0.34)',
    label:           'rgba(42,69,88,0.96)',
    text:            'rgba(14,31,43,0.98)',
    glow:            'rgba(18,124,173,0.08)',
    chromeBorder:    '#a9c0ce',
    chromeBorderActive: '#4f86a3',
    category:        'rgba(45,78,97,0.96)',
    stat:            '#0d7e9e',
    persistenceFill: 'rgba(223,231,236,0.94)',
    spectroAxis:     '#5b8199',
    spectroPalette: [
      '#eaf0f4',
      '#cfdde6',
      '#a6bfd1',
      '#6f9ec1',
      '#3d7dab',
      '#1f8898',
      '#b89258',
      '#7a62a9',
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
