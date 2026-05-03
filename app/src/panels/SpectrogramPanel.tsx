import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAnalysisConfig,
  useAnalysisConfigStore,
  useAudioEngine,
  useDisplayMode,
  useSpectralAnatomyStore,
  useTheaterMode,
  useWaveformPyramidSnapshot,
  useWaveformPyramidStore,
} from '../core/session';
import {
  buildDecodedSpectrogramHistory,
  canBuildDecodedSpectrogramOverview,
  pickDecodedSpectrogramColumnCount,
  projectDecodedSpectrogramHistory,
  type SpectrogramRowBand,
} from '../runtime/decodedSpectrogram';
import type { VisualMode } from '../audio/displayMode';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import { formatHz, hexToRgb, spectroColor } from '../utils/canvas';
import { shouldSkipFrame } from '../utils/rafGuard';
import { useMeasurementCursor, type CursorMapFn } from './useMeasurementCursor';
import type { SpectrogramViewMode, TransportState } from '../types';

const FREQ_AXIS_W = CANVAS.spectroFreqAxisWidth;
const PAD_Y = SPACING.panelPad;
const PANEL_DPR_MAX = 1.5;
const SPECTRO_BG = '#000000';
const NGE_BG = '#030a03';
const NGE_LABEL = 'rgba(140,210,40,0.5)';
const NGE_AXIS = '#1a4a10';
const NGE_SPECTRO_PALETTE = ['#030a03', '#0a2a0a', '#1a6010', '#60c020', '#c8f040'] as const;
const AMBER_BG = CANVAS.amber.bg;
const AMBER_LABEL = CANVAS.amber.label;
const AMBER_AXIS = CANVAS.amber.spectroAxis;
const AMBER_SPECTRO_PALETTE = CANVAS.amber.spectroPalette;
const HYPER_BG = CANVAS.hyper.bg;
const HYPER_LABEL = CANVAS.hyper.label;
const HYPER_AXIS = CANVAS.hyper.spectroAxis;
const HYPER_SPECTRO_PALETTE = CANVAS.hyper.spectroPalette;
const RED_BG = CANVAS.red.bg;
const RED_LABEL = CANVAS.red.label;
const RED_AXIS = CANVAS.red.spectroAxis;
const RED_SPECTRO_PALETTE = CANVAS.red.spectroPalette;
const OPTIC_BG = CANVAS.optic.bg;
const OPTIC_LABEL = CANVAS.optic.label;
const OPTIC_AXIS = CANVAS.optic.spectroAxis;
const OPTIC_SPECTRO_PALETTE = CANVAS.optic.spectroPalette;
const EVA_BG = CANVAS.eva.bg;
const EVA_LABEL = CANVAS.eva.label;
const EVA_AXIS = CANVAS.eva.spectroAxis;
const EVA_SPECTRO_PALETTE = CANVAS.eva.spectroPalette;
const HISTORY_EMPTY = -1;
const HISTORY_LEVELS = 256;
const SPECTRO_BG_RGB = hexToRgb(SPECTRO_BG);
const NGE_BG_RGB = hexToRgb(NGE_BG);
const AMBER_BG_RGB = hexToRgb(AMBER_BG);
const HYPER_BG_RGB = hexToRgb(HYPER_BG);
const RED_BG_RGB = hexToRgb(RED_BG);
const OPTIC_BG_RGB = hexToRgb(OPTIC_BG);
const EVA_BG_RGB = hexToRgb(EVA_BG);

const GRID_HZ = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const AXIS_HZ = [50, 100, 200, 500, '1k', '2k', '5k', '10k', '20k'] as const;
const AXIS_HZ_VALUES = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const MINOR_GRID_HZ = [30, 40, 70, 80, 150, 300, 700, 800, 1500, 3000, 7000, 8000, 15000];
const SPECTROGRAM_VIEW_MODES = ['live', 'window', 'full'] as const satisfies readonly SpectrogramViewMode[];
const SPECTROGRAM_VIEW_MODE_LABELS: Record<SpectrogramViewMode, string> = {
  live: 'LIVE',
  window: 'WIN',
  full: 'FULL',
};
const SPECTROGRAM_VIEW_MODE_TITLES: Record<SpectrogramViewMode, string> = {
  live: 'Live scrolling spectrogram',
  window: 'Unavailable: window view needs a decoded browser-safe source',
  full: 'Unavailable: full overview needs a decoded browser-safe source',
};
const DECODED_SPECTROGRAM_VIEW_MODE_TITLES: Record<SpectrogramViewMode, string> = {
  live: 'Live scrolling spectrogram',
  window: 'Decoded source window spectrogram',
  full: 'Decoded source full overview spectrogram',
};

type Rgb = readonly [number, number, number];

interface SpectrogramTheme {
  readonly background: string;
  readonly panelBackground: string;
  readonly label: string;
  readonly axis: string;
  readonly palette: readonly string[] | null;
  readonly bgRgb: Rgb;
  readonly cellGrid: string;
  readonly minorGrid: string;
  readonly majorGrid: string;
}

const DEFAULT_SPECTROGRAM_THEME: SpectrogramTheme = {
  background: SPECTRO_BG,
  panelBackground: SPECTRO_BG,
  label: COLORS.textDim,
  axis: COLORS.border,
  palette: null,
  bgRgb: SPECTRO_BG_RGB,
  cellGrid: 'rgba(0,0,0,0.30)',
  minorGrid: 'rgba(0,0,0,0.38)',
  majorGrid: 'rgba(0,0,0,0.62)',
};

const SPECTROGRAM_THEMES: Record<VisualMode, SpectrogramTheme> = {
  default: DEFAULT_SPECTROGRAM_THEME,
  amber: {
    ...DEFAULT_SPECTROGRAM_THEME,
    background: AMBER_BG,
    panelBackground: AMBER_BG,
    label: AMBER_LABEL,
    axis: AMBER_AXIS,
    palette: AMBER_SPECTRO_PALETTE,
    bgRgb: AMBER_BG_RGB,
    cellGrid: 'rgba(70,42,8,0.18)',
    minorGrid: 'rgba(100,62,12,0.24)',
    majorGrid: 'rgba(160,108,24,0.34)',
  },
  nge: {
    ...DEFAULT_SPECTROGRAM_THEME,
    background: NGE_BG,
    label: NGE_LABEL,
    axis: NGE_AXIS,
    palette: NGE_SPECTRO_PALETTE,
    bgRgb: NGE_BG_RGB,
  },
  hyper: {
    ...DEFAULT_SPECTROGRAM_THEME,
    background: HYPER_BG,
    label: HYPER_LABEL,
    axis: HYPER_AXIS,
    palette: HYPER_SPECTRO_PALETTE,
    bgRgb: HYPER_BG_RGB,
    cellGrid: 'rgba(4,12,32,0.30)',
    minorGrid: 'rgba(10,18,44,0.38)',
    majorGrid: 'rgba(26,44,112,0.52)',
  },
  red: {
    ...DEFAULT_SPECTROGRAM_THEME,
    background: RED_BG,
    panelBackground: RED_BG,
    label: RED_LABEL,
    axis: RED_AXIS,
    palette: RED_SPECTRO_PALETTE,
    bgRgb: RED_BG_RGB,
    cellGrid: 'rgba(74,20,20,0.22)',
    minorGrid: 'rgba(96,28,26,0.24)',
    majorGrid: 'rgba(138,44,38,0.32)',
  },
  optic: {
    ...DEFAULT_SPECTROGRAM_THEME,
    background: OPTIC_BG,
    panelBackground: OPTIC_BG,
    label: OPTIC_LABEL,
    axis: OPTIC_AXIS,
    palette: OPTIC_SPECTRO_PALETTE,
    bgRgb: OPTIC_BG_RGB,
    cellGrid: 'rgba(136,170,188,0.16)',
    minorGrid: 'rgba(142,174,190,0.22)',
    majorGrid: 'rgba(101,133,149,0.34)',
  },
  eva: {
    ...DEFAULT_SPECTROGRAM_THEME,
    background: EVA_BG,
    label: EVA_LABEL,
    axis: EVA_AXIS,
    palette: EVA_SPECTRO_PALETTE,
    bgRgb: EVA_BG_RGB,
    cellGrid: 'rgba(8,4,26,0.30)',
    minorGrid: 'rgba(20,8,40,0.38)',
    majorGrid: 'rgba(74,26,144,0.52)',
  },
};

function hzToT(hz: number): number {
  return Math.log10(hz / 20) / Math.log10(1000);
}

function lerpColor(startHex: string, endHex: string, t: number): string {
  const [sr, sg, sb] = hexToRgb(startHex);
  const [er, eg, eb] = hexToRgb(endHex);
  const lerp = (start: number, end: number): number => Math.round(start + (end - start) * t);
  return `rgb(${lerp(sr, er)},${lerp(sg, eg)},${lerp(sb, eb)})`;
}

function parseRgbString(color: string): [number, number, number] {
  const match = color.match(/^rgb\((\d+),(\d+),(\d+)\)$/);
  if (!match) {
    throw new Error(`Unsupported color format: ${color}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function spectroPaletteColor(db: number, palette: readonly string[]): string {
  const t = Math.max(0, Math.min(1, (db - CANVAS.dbMin) / (CANVAS.dbMax - CANVAS.dbMin)));
  const segmentCount = palette.length - 1;
  const scaled = t * segmentCount;
  const index = Math.min(segmentCount - 1, Math.floor(scaled));
  const localT = scaled - index;
  return lerpColor(palette[index], palette[index + 1], localT);
}

function spectroColorForMode(db: number, mode: VisualMode): string {
  const palette = SPECTROGRAM_THEMES[mode].palette;
  if (!palette) return spectroColor(db);
  return spectroPaletteColor(db, palette);
}

function dbToHistoryLevel(db: number, dbMin: number, dbMax: number): number {
  const t = Math.max(0, Math.min(1, (db - dbMin) / (dbMax - dbMin)));
  return Math.round(t * (HISTORY_LEVELS - 1));
}

function historyLevelToDb(level: number, dbMin: number, dbMax: number): number {
  return dbMin + (level / (HISTORY_LEVELS - 1)) * (dbMax - dbMin);
}

function createPalette(mode: VisualMode): readonly Rgb[] {
  return Array.from(
    { length: HISTORY_LEVELS },
    (_, index) => parseRgbString(spectroColorForMode(historyLevelToDb(index, CANVAS.dbMin, CANVAS.dbMax), mode)),
  );
}

const NORMAL_PALETTE = createPalette('default');
const SPECTROGRAM_PALETTES: Record<VisualMode, readonly Rgb[]> = {
  default: NORMAL_PALETTE,
  amber: createPalette('amber'),
  nge: createPalette('nge'),
  hyper: createPalette('hyper'),
  red: createPalette('red'),
  optic: createPalette('optic'),
  eva: createPalette('eva'),
};

function createHistoryBuffer(width: number, height: number): Int16Array {
  const history = new Int16Array(width * height);
  history.fill(HISTORY_EMPTY);
  return history;
}

function paintHistoryToCanvas(
  ctx: CanvasRenderingContext2D,
  history: Int16Array,
  width: number,
  height: number,
  mode: VisualMode,
): void {
  if (width === 0 || height === 0) return;

  const theme = SPECTROGRAM_THEMES[mode];
  const palette = SPECTROGRAM_PALETTES[mode];
  const [bgR, bgG, bgB] = theme.bgRgb;
  const image = ctx.createImageData(width, height);
  const { data } = image;

  for (let index = 0; index < history.length; index++) {
    const level = history[index];
    const pixelIndex = index * 4;
    const [r, g, b] = level === HISTORY_EMPTY ? [bgR, bgG, bgB] : palette[level];
    data[pixelIndex] = r;
    data[pixelIndex + 1] = g;
    data[pixelIndex + 2] = b;
    data[pixelIndex + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
}

function bandAverageDbByBins(data: Float32Array, lowBin: number, highBin: number): number {
  if (data.length === 0 || highBin < lowBin) return CANVAS.dbMin;

  let powerSum = 0;
  let count = 0;
  for (let bin = lowBin; bin <= highBin; bin++) {
    const amplitude = Math.pow(10, data[bin] / 20);
    powerSum += amplitude * amplitude;
    count++;
  }

  if (count === 0) return CANVAS.dbMin;
  const rms = Math.sqrt(powerSum / count);
  return rms > 0 ? 20 * Math.log10(rms) : CANVAS.dbMin;
}

function monoBandDb(left: Float32Array, right: Float32Array, band: SpectrogramRowBand): number {
  const avgL = bandAverageDbByBins(left, band.lowBin, band.highBin);
  const avgR = bandAverageDbByBins(right, band.lowBin, band.highBin);
  const linL = Math.pow(10, avgL / 20);
  const linR = Math.pow(10, avgR / 20);
  const mono = (linL + linR) * 0.5;
  return mono > 0 ? 20 * Math.log10(mono) : CANVAS.dbMin;
}

function createRowBands(height: number, sampleRate: number, fftBinCount: number): readonly SpectrogramRowBand[] {
  if (height <= 0 || sampleRate <= 0 || fftBinCount <= 0) return [];

  return Array.from({ length: height }, (_, y) => {
    const topT = 1 - y / height;
    const bottomT = 1 - (y + 1) / height;
    const highHz = 20 * Math.pow(1000, topT);
    const lowHz = 20 * Math.pow(1000, Math.max(0, bottomT));
    return {
      lowBin: Math.max(0, Math.floor((lowHz * fftBinCount * 2) / sampleRate)),
      highBin: Math.min(fftBinCount - 1, Math.ceil((highHz * fftBinCount * 2) / sampleRate)),
    };
  });
}

function replaySpectrogramHistory(
  history: Int16Array,
  width: number,
  rowBands: readonly SpectrogramRowBand[],
  dpr: number,
  advances: Float32Array,
  leftSlices: readonly Float32Array[],
  rightSlices: readonly Float32Array[],
  ptr: number,
  len: number,
  capacity: number,
  dbMin: number,
  dbMax: number,
): number {
  history.fill(HISTORY_EMPTY);
  let carry = 0;

  for (let i = 0; i < len; i++) {
    const index = (ptr - len + i + capacity) % capacity;
    carry += Math.max(0, advances[index]) * dpr;
    const scrollPx = Math.min(width, Math.max(0, Math.floor(carry)));
    if (scrollPx <= 0) continue;
    carry -= scrollPx;

    const stripStartX = width - scrollPx;
    const left = leftSlices[index];
    const right = rightSlices[index];
    for (let y = 0; y < rowBands.length; y++) {
      const rowStart = y * width;
      history.copyWithin(rowStart, rowStart + scrollPx, rowStart + width);
      const level = dbToHistoryLevel(monoBandDb(left, right, rowBands[y]), dbMin, dbMax);
      history.fill(level, rowStart + stripStartX, rowStart + width);
    }
  }

  return carry;
}

function appendSpectrogramSlice(
  history: Int16Array,
  offscreen: HTMLCanvasElement,
  width: number,
  height: number,
  scrollPx: number,
  rowBands: readonly SpectrogramRowBand[],
  left: Float32Array,
  right: Float32Array,
  dbMin: number,
  dbMax: number,
  backgroundFill: string,
  palette: readonly Rgb[],
): void {
  if (scrollPx <= 0 || width <= 0 || height <= 0) return;
  const offscreenCtx = offscreen.getContext('2d');
  if (!offscreenCtx) return;

  const stripStartX = width - scrollPx;
  offscreenCtx.drawImage(offscreen, -scrollPx, 0);
  offscreenCtx.fillStyle = backgroundFill;
  offscreenCtx.fillRect(stripStartX, 0, scrollPx, height);

  for (let y = 0; y < rowBands.length; y++) {
    const rowStart = y * width;
    history.copyWithin(rowStart, rowStart + scrollPx, rowStart + width);
    const level = dbToHistoryLevel(monoBandDb(left, right, rowBands[y]), dbMin, dbMax);
    history.fill(level, rowStart + stripStartX, rowStart + width);
    const rgb = palette[Math.max(0, Math.min(HISTORY_LEVELS - 1, level))];
    offscreenCtx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    offscreenCtx.fillRect(stripStartX, y, scrollPx, 1);
  }
}

export function SpectrogramPanel(): React.ReactElement {
  const displayMode = useDisplayMode();
  const analysisConfig = useAnalysisConfig();
  const analysisConfigStore = useAnalysisConfigStore();
  const audioEngine = useAudioEngine();
  const spectralAnatomy = useSpectralAnatomyStore();
  const waveformPyramid = useWaveformPyramidStore();
  const waveformPyramidVersion = useWaveformPyramidSnapshot();
  const theaterMode = useTheaterMode();
  const [transport, setTransport] = useState<TransportState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<Int16Array | null>(null);
  const decodedFullHistoryRef = useRef<{
    key: string;
    width: number;
    height: number;
    history: Int16Array;
  } | null>(null);
  const dirtyRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const dimRef = useRef({ W: 0, H: 0, axisW: 0, spectroW: 0, spectroH: 0, padY: 0 });
  const lastModeRef = useRef<VisualMode>(displayMode.mode);
  const lastDbMinRef = useRef(analysisConfig.spectrogram.dbMin);
  const lastDbMaxRef = useRef(analysisConfig.spectrogram.dbMax);
  const lastRenderedFrameCountRef = useRef(-1);
  const lastRenderedFileIdRef = useRef(-1);
  const lastRenderedSampleRateRef = useRef(0);
  const lastRenderedFftBinCountRef = useRef(0);
  const renderCarryRef = useRef(0);
  const hoverReadoutRef = useRef<HTMLDivElement>(null);
  const dbRangeRef = useRef({ dbMin: analysisConfig.spectrogram.dbMin, dbMax: analysisConfig.spectrogram.dbMax });
  const rowBandsRef = useRef<readonly SpectrogramRowBand[]>([]);
  const rowBandMetaRef = useRef({ height: 0, sampleRate: 0, fftBinCount: 0 });
  const decodedOverviewAvailable = transport?.playbackBackend === 'decoded' && canBuildDecodedSpectrogramOverview(audioEngine.audioBuffer);
  const activeViewMode = decodedOverviewAvailable ? analysisConfig.spectrogram.viewMode : 'live';

  useEffect(() => audioEngine.onTransport(setTransport), [audioEngine]);

  useEffect(() => {
    if (analysisConfig.spectrogram.viewMode !== 'live' && !decodedOverviewAvailable) {
      analysisConfigStore.setSpectrogramViewMode('live');
    }
  }, [analysisConfig.spectrogram.viewMode, analysisConfigStore, decodedOverviewAvailable]);

  useEffect(() => {
    dbRangeRef.current = { dbMin: analysisConfig.spectrogram.dbMin, dbMax: analysisConfig.spectrogram.dbMax };
    dirtyRef.current = true;
  }, [analysisConfig.spectrogram.dbMax, analysisConfig.spectrogram.dbMin]);

  const ensureRowBands = useCallback((spectroH: number, sampleRate: number, fftBinCount: number): readonly SpectrogramRowBand[] => {
    const meta = rowBandMetaRef.current;
    if (meta.height !== spectroH || meta.sampleRate !== sampleRate || meta.fftBinCount !== fftBinCount) {
      rowBandsRef.current = createRowBands(spectroH, sampleRate, fftBinCount);
      rowBandMetaRef.current = { height: spectroH, sampleRate, fftBinCount };
    }
    return rowBandsRef.current;
  }, []);

  const mapToValues: CursorMapFn = useCallback((devX: number, devY: number) => {
    const { axisW, spectroW, spectroH, padY } = dimRef.current;
    if (spectroW <= 0 || spectroH <= 0) return null;
    if (devX < axisW || devY < padY || devY > padY + spectroH) return null;

    const tY = 1 - (devY - padY) / spectroH;
    const hz = 20 * Math.pow(1000, tY);

    let db = NaN;
    const history = historyRef.current;
    if (history) {
      const col = Math.max(0, Math.min(spectroW - 1, Math.floor(devX - axisW)));
      const row = Math.max(0, Math.min(spectroH - 1, Math.floor(devY - padY)));
      const level = history[row * spectroW + col];
      if (level >= 0) {
        const { dbMin, dbMax } = dbRangeRef.current;
        db = dbMin + (level / (HISTORY_LEVELS - 1)) * (dbMax - dbMin);
      }
    }

    return {
      devX,
      devY,
      primary: hz,
      primaryLabel: formatHz(hz),
      secondary: Number.isFinite(db) ? db : 0,
      secondaryLabel: Number.isFinite(db) ? `${db.toFixed(1)} dB` : '',
    };
  }, []);

  const { overlayRef, handleMouseMove, handleMouseLeave, handleClick } = useMeasurementCursor({
    canvasRef,
    readoutRef: hoverReadoutRef,
    mapToValues,
    visualMode: displayMode.mode,
  });

  useEffect(() => {
    return spectralAnatomy.subscribe(() => {
      dirtyRef.current = true;
    });
  }, [spectralAnatomy]);

  useEffect(() => {
    dirtyRef.current = true;
  }, [displayMode.mode]);

  useEffect(() => {
    dirtyRef.current = true;
  }, [activeViewMode, waveformPyramidVersion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
        const W = Math.round(width * dpr);
        const H = Math.round(height * dpr);
        canvas.width = W;
        canvas.height = H;

        const axisW = Math.round(FREQ_AXIS_W * dpr);
        const spectroW = Math.max(0, W - axisW);
        const padY = Math.round(PAD_Y * dpr);
        const spectroH = Math.max(0, H - padY * 2);
        dimRef.current = { W, H, axisW, spectroW, spectroH, padY };

        historyRef.current = createHistoryBuffer(spectroW, spectroH);
        const offscreen = document.createElement('canvas');
        offscreen.width = spectroW;
        offscreen.height = spectroH;
        offscreenRef.current = offscreen;
        rowBandMetaRef.current = { height: 0, sampleRate: 0, fftBinCount: 0 };
        renderCarryRef.current = 0;
        lastRenderedFrameCountRef.current = -1;
        dirtyRef.current = true;
      }
    });
    ro.observe(canvas);

    if (theaterMode) {
      return () => {
        ro.disconnect();
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!dirtyRef.current || shouldSkipFrame(canvas)) return;

      const ctx = canvas.getContext('2d');
      const offscreen = offscreenRef.current;
      const history = historyRef.current;
      if (!ctx || !offscreen || !history) return;

      const { W, H, axisW, spectroW, spectroH, padY } = dimRef.current;
      if (W === 0 || H === 0 || spectroW <= 0 || spectroH <= 0) return;

      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const mode = displayMode.mode;
      const theme = SPECTROGRAM_THEMES[mode];
      const activePalette = SPECTROGRAM_PALETTES[mode];
      const spectroX = axisW;
      const backgroundFill = theme.background;
      const { dbMin, dbMax } = dbRangeRef.current;
      const gridDensity = analysisConfig.spectrogram.gridDensity;
      const buffer = audioEngine.audioBuffer;

      if (activeViewMode !== 'live' && buffer && decodedOverviewAvailable) {
        lastRenderedFrameCountRef.current = -1;
        const sourceWidth = pickDecodedSpectrogramColumnCount(spectroW);
        const fftSize = analysisConfig.general.fftSize;
        const fftBinCount = fftSize / 2;
        const rowBands = ensureRowBands(spectroH, buffer.sampleRate, fftBinCount);
        const cacheKey = [
          transport?.filename ?? 'decoded',
          buffer.length,
          buffer.sampleRate,
          buffer.numberOfChannels,
          fftSize,
          sourceWidth,
          spectroH,
          dbMin,
          dbMax,
        ].join(':');
        let fullHistory = decodedFullHistoryRef.current;
        if (!fullHistory || fullHistory.key !== cacheKey) {
          fullHistory = {
            key: cacheKey,
            width: sourceWidth,
            height: spectroH,
            history: buildDecodedSpectrogramHistory({
              buffer,
              fftSize,
              width: sourceWidth,
              rowBands,
              dbMin,
              dbMax,
            }),
          };
          decodedFullHistoryRef.current = fullHistory;
        }

        const viewRange = waveformPyramid.currentViewRange;
        const duration = Math.max(0.001, buffer.duration);
        const startRatio = activeViewMode === 'window' ? viewRange.start / duration : 0;
        const endRatio = activeViewMode === 'window' ? viewRange.end / duration : 1;
        history.set(projectDecodedSpectrogramHistory(
          fullHistory.history,
          fullHistory.width,
          spectroW,
          spectroH,
          startRatio,
          endRatio,
        ));

        const offscreenCtx = offscreen.getContext('2d');
        if (!offscreenCtx) return;
        paintHistoryToCanvas(offscreenCtx, history, offscreen.width, offscreen.height, mode);
      } else {
        decodedFullHistoryRef.current = null;

        const needsRebuild =
          lastRenderedFrameCountRef.current < 0 ||
          dbMin !== lastDbMinRef.current ||
          dbMax !== lastDbMaxRef.current ||
          spectralAnatomy.currentFileId !== lastRenderedFileIdRef.current ||
          spectralAnatomy.currentSampleRate !== lastRenderedSampleRateRef.current ||
          spectralAnatomy.currentFftBinCount !== lastRenderedFftBinCountRef.current ||
          spectralAnatomy.frameCount < lastRenderedFrameCountRef.current ||
          spectralAnatomy.frameCount - lastRenderedFrameCountRef.current > spectralAnatomy.len;

        const rowBands = ensureRowBands(spectroH, spectralAnatomy.currentSampleRate, spectralAnatomy.currentFftBinCount);

        if (needsRebuild) {
          renderCarryRef.current = replaySpectrogramHistory(
            history,
            spectroW,
            rowBands,
            dpr,
            spectralAnatomy.advanceHistory,
            spectralAnatomy.spectrogramLeftHistory,
            spectralAnatomy.spectrogramRightHistory,
            spectralAnatomy.ptr,
            spectralAnatomy.len,
            spectralAnatomy.capacity,
            dbMin,
            dbMax,
          );
          const offscreenCtx = offscreen.getContext('2d');
          if (!offscreenCtx) return;
          paintHistoryToCanvas(offscreenCtx, history, offscreen.width, offscreen.height, mode);
          lastRenderedFrameCountRef.current = spectralAnatomy.frameCount;
          lastRenderedFileIdRef.current = spectralAnatomy.currentFileId;
          lastRenderedSampleRateRef.current = spectralAnatomy.currentSampleRate;
          lastRenderedFftBinCountRef.current = spectralAnatomy.currentFftBinCount;
          lastDbMinRef.current = dbMin;
          lastDbMaxRef.current = dbMax;
          lastModeRef.current = mode;
        } else {
          const offscreenCtx = offscreen.getContext('2d');
          if (!offscreenCtx) return;

          if (mode !== lastModeRef.current) {
            lastModeRef.current = mode;
            paintHistoryToCanvas(offscreenCtx, history, offscreen.width, offscreen.height, mode);
          }

          const newFrameCount = spectralAnatomy.frameCount - lastRenderedFrameCountRef.current;
          if (newFrameCount > 0) {
            const newestStep = Math.min(newFrameCount, spectralAnatomy.len);
            for (let step = newestStep - 1; step >= 0; step--) {
              const index = (spectralAnatomy.ptr - 1 - step + spectralAnatomy.capacity) % spectralAnatomy.capacity;
              renderCarryRef.current += Math.max(0, spectralAnatomy.advanceHistory[index]) * dpr;
              const scrollPx = Math.min(spectroW, Math.max(0, Math.floor(renderCarryRef.current)));
              if (scrollPx <= 0) continue;
              renderCarryRef.current -= scrollPx;
              appendSpectrogramSlice(
                history,
                offscreen,
                spectroW,
                spectroH,
                scrollPx,
                rowBands,
                spectralAnatomy.spectrogramLeftHistory[index],
                spectralAnatomy.spectrogramRightHistory[index],
                dbMin,
                dbMax,
                backgroundFill,
                activePalette,
              );
            }
            lastRenderedFrameCountRef.current = spectralAnatomy.frameCount;
            lastRenderedFileIdRef.current = spectralAnatomy.currentFileId;
            lastRenderedSampleRateRef.current = spectralAnatomy.currentSampleRate;
            lastRenderedFftBinCountRef.current = spectralAnatomy.currentFftBinCount;
          }
        }
      }

      ctx.fillStyle = backgroundFill;
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(offscreen, spectroX, padY);

      if (gridDensity === 'major+minor') {
        const cellPx = Math.round(8 * dpr);
        ctx.fillStyle = theme.cellGrid;
        for (let gx = spectroX; gx < spectroX + spectroW; gx += cellPx) {
          ctx.fillRect(gx, padY, 1, spectroH);
        }
      }

      if (gridDensity === 'major+minor') {
        ctx.fillStyle = theme.minorGrid;
        for (const hz of MINOR_GRID_HZ) {
          const t = hzToT(hz);
          ctx.fillRect(spectroX, padY + spectroH - t * spectroH, spectroW, 1);
        }
      }

      if (gridDensity !== 'off') {
        ctx.fillStyle = theme.majorGrid;
        for (const hz of GRID_HZ) {
          const t = hzToT(hz);
          ctx.fillRect(spectroX, padY + spectroH - t * spectroH, spectroW, 1);
        }
      }

      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = theme.label;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < AXIS_HZ_VALUES.length; i++) {
        const hz = AXIS_HZ_VALUES[i];
        const label = String(AXIS_HZ[i]);
        const t = hzToT(hz);
        const yTick = padY + spectroH - t * spectroH;

        ctx.strokeStyle = theme.axis;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(axisW - 3 * dpr, yTick);
        ctx.lineTo(axisW, yTick);
        ctx.stroke();
        ctx.fillText(label, axisW - 4 * dpr, yTick);
      }

      dirtyRef.current = false;
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [
    activeViewMode,
    analysisConfig.general.fftSize,
    analysisConfig.spectrogram.dbMax,
    analysisConfig.spectrogram.dbMin,
    analysisConfig.spectrogram.gridDensity,
    audioEngine,
    decodedOverviewAvailable,
    displayMode,
    ensureRowBands,
    spectralAnatomy,
    theaterMode,
    transport?.filename,
    waveformPyramid,
    waveformPyramidVersion,
  ]);

  return (
    <div style={{ ...panelStyle, background: SPECTROGRAM_THEMES[displayMode.mode].panelBackground }}>
      <div style={viewChromeStyle}>
        <div style={viewChipGroupStyle}>
          {SPECTROGRAM_VIEW_MODES.map((viewMode) => {
            const active = analysisConfig.spectrogram.viewMode === viewMode;
            const available = viewMode === 'live' || decodedOverviewAvailable;
            return (
              <button
                key={viewMode}
                type="button"
                aria-disabled={!available}
                tabIndex={available ? 0 : -1}
                onClick={() => {
                  if (available) analysisConfigStore.setSpectrogramViewMode(viewMode);
                }}
                title={
                  available
                    ? DECODED_SPECTROGRAM_VIEW_MODE_TITLES[viewMode]
                    : SPECTROGRAM_VIEW_MODE_TITLES[viewMode]
                }
                style={{
                  ...viewChipStyle,
                  color: active ? SPECTROGRAM_THEMES[displayMode.mode].label : SPECTROGRAM_THEMES[displayMode.mode].axis,
                  borderColor: active ? SPECTROGRAM_THEMES[displayMode.mode].label : SPECTROGRAM_THEMES[displayMode.mode].axis,
                  opacity: available ? 0.9 : 0.42,
                  cursor: available ? 'pointer' : 'not-allowed',
                }}
              >
                {SPECTROGRAM_VIEW_MODE_LABELS[viewMode]}
              </button>
            );
          })}
        </div>
        <span style={{ ...viewTitleStyle, color: SPECTROGRAM_THEMES[displayMode.mode].label }}>SPECTROGRAM</span>
      </div>
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
      <canvas ref={overlayRef} className="panel-cursor-overlay" style={overlayStyle} />
      <div ref={hoverReadoutRef} className="panel-hover-readout" />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  background: SPECTRO_BG,
  overflow: 'hidden',
};

const viewChromeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 5,
  right: 8,
  zIndex: 2,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  pointerEvents: 'auto',
};

const viewChipGroupStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
};

const viewChipStyle: React.CSSProperties = {
  height: 17,
  padding: '0 5px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  background: 'rgba(0,0,0,0.28)',
  fontFamily: FONTS.mono,
  fontSize: 8,
  letterSpacing: '0.08em',
  outline: 'none',
};

const viewTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.06em',
  lineHeight: 1,
  textTransform: 'uppercase',
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
};
