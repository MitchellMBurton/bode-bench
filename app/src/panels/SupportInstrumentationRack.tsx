import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { VisualMode } from '../audio/displayMode';
import {
  useAudioEngine,
  useFrameBus,
  useTheaterMode,
  useVisualMode,
} from '../core/session';
import { CANVAS, COLORS, FONTS, MODES, SPACING } from '../theme';
import type { AudioFrame } from '../types';
import { dbToFraction, hexToRgba, levelToDb } from '../utils/canvas';
import { FrequencyBandsPanel } from './FrequencyBandsPanel';
import { GoniometerPanel } from './GoniometerPanel';
import { HarmonicLadderPanel } from './HarmonicLadderPanel';
import { LevelsPanel } from './LevelsPanel';

type SupportInstrumentId = 'levels' | 'gonio' | 'bands' | 'partials';
type DensityTier = 'full' | 'balanced' | 'focus';

interface SupportInstrumentDef {
  readonly id: SupportInstrumentId;
  readonly label: string;
  readonly shortLabel: string;
  readonly FocusComponent: (props: SupportVariantProps) => React.ReactElement;
  readonly CompactComponent: (props: SupportVariantProps) => React.ReactElement;
  readonly FullComponent: () => React.ReactElement;
}

interface SupportVariantProps {
  readonly visualMode: VisualMode;
}

interface SupportTheme {
  readonly bg: string;
  readonly track: string;
  readonly label: string;
  readonly category: string;
  readonly dim: string;
  readonly accent: string;
  readonly ok: string;
  readonly warn: string;
  readonly hot: string;
  readonly peakHold: string;
  readonly bandColors: readonly string[];
  readonly partialColors: readonly string[];
}

const BAND_COLORS_HYPER = ['#0c1460', '#0a2272', '#0a3888', '#0c529a', '#1068a8', '#1888b8'] as const;
const BAND_COLORS_EVA = ['#200840', '#3a0860', '#580030', '#8a1800', '#cc4a00', '#ff7b00'] as const;
const BAND_COLORS_NGE = ['#0d2a0a', '#0f4a0e', '#1a6a18', '#2a8a20', '#50aa20', '#80d028'] as const;

const PARTIAL_COLORS_DEFAULT = [
  '#d0a038', '#b88e36', '#8f803f', '#707650', '#5d7063',
  '#486a78', '#386188', '#2a5696', '#214999', '#1a3d94',
] as const;
const PARTIAL_COLORS_HYPER = [
  '#62e8ff', '#4ac8e8', '#32a8d0', '#1e88b8', '#106aa0',
  '#085088', '#043870', '#022458', '#011040', '#000828',
] as const;
const PARTIAL_COLORS_OPTIC = [
  '#1da9c7', '#57c0ed', '#7adcd8', '#b3e0ff', '#ffd08a',
  '#f2b5ff', '#d0c3ff', '#b6d9ff', '#95d9ff', '#dceefe',
] as const;
const PARTIAL_COLORS_NGE = [
  '#9ed828', '#84c020', '#6aaa16', '#528e0e', '#3c7208',
  '#2c5e04', '#204a02', '#163802', '#0e2800', '#081800',
] as const;
const PARTIAL_COLORS_AMBER = [
  '#ffb020', '#eb9e1c', '#d18a18', '#b77616', '#9d6214',
  '#835013', '#6a4013', '#523214', '#3e2613', '#28180f',
] as const;
const PARTIAL_COLORS_RED = [
  '#ff5a4a', '#f04d3f', '#d94134', '#b93429', '#96261f',
  '#741a16', '#56110f', '#3d0a0a', '#2a0606', '#140202',
] as const;
const PARTIAL_COLORS_EVA = [
  '#ff7b00', '#e06800', '#c05400', '#a04000', '#803000',
  '#602060', '#481880', '#301090', '#200860', '#100440',
] as const;

const NUM_PARTIALS = 10;
const PARTIAL_DISPLAY_RANGE_DB = 40;
const PANEL_DPR_MAX = 1.25;

const SUPPORT_INSTRUMENTS: readonly SupportInstrumentDef[] = [
  {
    id: 'levels',
    label: 'LEVELS',
    shortLabel: 'LVL',
    FocusComponent: LevelsFocusPanel,
    CompactComponent: MiniLevelsPanel,
    FullComponent: LevelsPanel,
  },
  {
    id: 'gonio',
    label: 'GONIOMETER',
    shortLabel: 'GONIO',
    FocusComponent: GoniometerPanel,
    CompactComponent: MiniGoniometerPanel,
    FullComponent: GoniometerPanel,
  },
  {
    id: 'bands',
    label: 'BANDS',
    shortLabel: 'BANDS',
    FocusComponent: FrequencyBandsPanel,
    CompactComponent: MiniBandsPanel,
    FullComponent: FrequencyBandsPanel,
  },
  {
    id: 'partials',
    label: 'PARTIALS',
    shortLabel: 'PART',
    FocusComponent: HarmonicLadderPanel,
    CompactComponent: MiniPartialsPanel,
    FullComponent: HarmonicLadderPanel,
  },
];

const INSTRUMENT_BY_ID = new Map(SUPPORT_INSTRUMENTS.map((instrument) => [instrument.id, instrument]));

function densityForHeight(height: number): DensityTier {
  if (height >= 440) return 'full';
  if (height >= 300) return 'balanced';
  return 'focus';
}

function getInstrument(id: SupportInstrumentId): SupportInstrumentDef {
  return INSTRUMENT_BY_ID.get(id) ?? SUPPORT_INSTRUMENTS[1];
}

function nextSummaryIds(active: SupportInstrumentId, count: number): readonly SupportInstrumentId[] {
  return SUPPORT_INSTRUMENTS
    .map((instrument) => instrument.id)
    .filter((id) => id !== active)
    .slice(0, count);
}

function buildSupportTheme(visualMode: VisualMode): SupportTheme {
  switch (visualMode) {
    case 'amber':
      return {
        bg: CANVAS.amber.bg2,
        track: '#140d03',
        label: CANVAS.amber.label,
        category: CANVAS.amber.category,
        dim: 'rgba(176,126,44,0.48)',
        accent: CANVAS.amber.trace,
        ok: '#ffb020',
        warn: '#ffd064',
        hot: '#ff8a3d',
        peakHold: 'rgba(255,194,108,0.62)',
        bandColors: CANVAS.amber.bandColors,
        partialColors: PARTIAL_COLORS_AMBER,
      };
    case 'nge':
      return {
        bg: CANVAS.nge.bg2,
        track: '#030a03',
        label: CANVAS.nge.label,
        category: CANVAS.nge.category,
        dim: 'rgba(80,160,50,0.44)',
        accent: CANVAS.nge.trace,
        ok: '#70c018',
        warn: COLORS.levelYellow,
        hot: COLORS.levelRed,
        peakHold: 'rgba(120,200,60,0.62)',
        bandColors: BAND_COLORS_NGE,
        partialColors: PARTIAL_COLORS_NGE,
      };
    case 'hyper':
      return {
        bg: CANVAS.hyper.bg2,
        track: '#030918',
        label: 'rgba(178,222,255,0.94)',
        category: 'rgba(150,200,245,0.88)',
        dim: 'rgba(140,178,225,0.74)',
        accent: CANVAS.hyper.trace,
        ok: '#28b0c8',
        warn: COLORS.levelYellow,
        hot: COLORS.levelRed,
        peakHold: 'rgba(78,200,255,0.62)',
        bandColors: BAND_COLORS_HYPER,
        partialColors: PARTIAL_COLORS_HYPER,
      };
    case 'eva':
      return {
        bg: CANVAS.eva.bg2,
        track: '#08041a',
        label: CANVAS.eva.label,
        category: CANVAS.eva.category,
        dim: 'rgba(170,90,255,0.42)',
        accent: CANVAS.eva.trace,
        ok: '#ff7b00',
        warn: '#ffa020',
        hot: '#ff2020',
        peakHold: 'rgba(255,140,40,0.62)',
        bandColors: BAND_COLORS_EVA,
        partialColors: PARTIAL_COLORS_EVA,
      };
    case 'red':
      return {
        bg: CANVAS.red.bg2,
        track: '#120405',
        label: CANVAS.red.label,
        category: CANVAS.red.category,
        dim: 'rgba(214,92,82,0.44)',
        accent: CANVAS.red.trace,
        ok: '#ff6e5c',
        warn: '#ffb067',
        hot: '#ff2e2a',
        peakHold: 'rgba(255,132,116,0.62)',
        bandColors: CANVAS.red.bandColors,
        partialColors: PARTIAL_COLORS_RED,
      };
    case 'optic':
      return {
        bg: CANVAS.optic.bg2,
        track: '#d8e6ef',
        label: CANVAS.optic.label,
        category: CANVAS.optic.category,
        dim: 'rgba(92,132,156,0.50)',
        accent: CANVAS.optic.trace,
        ok: '#47b4cf',
        warn: '#f0c66d',
        hot: '#e47f6e',
        peakHold: 'rgba(21,151,212,0.62)',
        bandColors: CANVAS.optic.bandColors,
        partialColors: PARTIAL_COLORS_OPTIC,
      };
    default:
      return {
        bg: COLORS.bg2,
        track: COLORS.levelTrack,
        label: COLORS.textSecondary,
        category: COLORS.textCategory,
        dim: COLORS.textDim,
        accent: COLORS.waveform,
        ok: COLORS.levelGreen,
        warn: COLORS.levelYellow,
        hot: COLORS.levelRed,
        peakHold: COLORS.textSecondary,
        bandColors: CANVAS.bandColors,
        partialColors: PARTIAL_COLORS_DEFAULT,
      };
  }
}

function levelColor(fraction: number, theme: SupportTheme): string {
  if (fraction > dbToFraction(-3)) return theme.hot;
  if (fraction > dbToFraction(-12)) return theme.warn;
  return theme.ok;
}

function frequencyBandLevels(frame: AudioFrame | null): readonly number[] {
  if (!frame) return CANVAS.frequencyBands.map(() => 0);
  const binCount = frame.frequencyDb.length;
  const smoothed = CANVAS.frequencyBands.map((band) => {
    const lowBin = Math.floor((band.lowHz / (frame.sampleRate / 2)) * binCount);
    const highBin = Math.min(Math.ceil((band.highHz / (frame.sampleRate / 2)) * binCount), binCount - 1);
    let sum = 0;
    let count = 0;
    for (let bin = lowBin; bin <= highBin; bin++) {
      sum += frame.frequencyDb[bin];
      count++;
    }
    const avgDb = count > 0 ? sum / count : CANVAS.dbMin;
    return Math.max(0, Math.min(1, (avgDb - CANVAS.dbMin) / (CANVAS.dbMax - CANVAS.dbMin)));
  });
  return smoothed;
}

function partialDb(frequencyDb: Float32Array, f0Hz: number, partial: number, sampleRate: number): number {
  const binHz = sampleRate / (frequencyDb.length * 2);
  const binIndex = Math.round((f0Hz * partial) / binHz);
  if (binIndex < 0 || binIndex >= frequencyDb.length) return CANVAS.dbMin;
  let best: number = CANVAS.dbMin;
  for (let offset = -3; offset <= 3; offset++) {
    const index = binIndex + offset;
    if (index >= 0 && index < frequencyDb.length && frequencyDb[index] > best) {
      best = frequencyDb[index];
    }
  }
  return best;
}

function drawCanvasBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, theme: SupportTheme): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);
}

export function SupportInstrumentationRack(): React.ReactElement {
  const visualMode = useVisualMode();
  const mode = MODES[visualMode];
  const theme = useMemo(() => buildSupportTheme(visualMode), [visualMode]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [activeId, setActiveId] = useState<SupportInstrumentId>('gonio');

  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (!node) return;

    const read = () => setHeight(node.getBoundingClientRect().height);
    read();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const density = densityForHeight(height);
  const active = getInstrument(activeId);
  const summaryIds = useMemo(() => nextSummaryIds(activeId, density === 'balanced' ? 3 : 2), [activeId, density]);
  const ActivePanel = active.FocusComponent;

  if (density === 'full') {
    return (
      <div ref={wrapRef} style={{ ...rackStyle, background: mode.bg }}>
        <div style={fullGridStyle}>
          <InstrumentBay visualMode={visualMode} label="LEVELS" compact>
            <LevelsPanel />
          </InstrumentBay>
          <InstrumentBay visualMode={visualMode} label="GONIOMETER">
            <GoniometerPanel />
          </InstrumentBay>
          <InstrumentBay visualMode={visualMode} label="BANDS" compact>
            <FrequencyBandsPanel />
          </InstrumentBay>
          <InstrumentBay visualMode={visualMode} label="PARTIALS" compact>
            <HarmonicLadderPanel />
          </InstrumentBay>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ ...rackStyle, background: mode.bg }}>
      <div style={{ ...focusRailStyle, borderColor: mode.chromeBorder }}>
        <span style={{ ...focusLabelStyle, color: theme.category }}>FOCUS</span>
        <div style={tabRowStyle}>
          {SUPPORT_INSTRUMENTS.map((instrument) => {
            const activeTab = instrument.id === activeId;
            return (
              <button
                key={instrument.id}
                type="button"
                onClick={() => setActiveId(instrument.id)}
                style={{
                  ...tabButtonStyle,
                  color: activeTab ? mode.text : theme.category,
                  borderColor: activeTab ? mode.chromeBorderActive : mode.chromeBorder,
                  background: activeTab ? mode.bg2 : 'transparent',
                }}
                title={`Focus ${instrument.label.toLowerCase()}`}
              >
                {instrument.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      <div style={density === 'balanced' ? balancedGridStyle : focusGridStyle}>
        <div style={summaryRailStyle}>
          {summaryIds.slice(0, 2).map((id) => {
            const instrument = getInstrument(id);
            const Panel = instrument.CompactComponent;
            return (
              <InstrumentBay key={id} visualMode={visualMode} label={instrument.label} compact>
                <Panel visualMode={visualMode} />
              </InstrumentBay>
            );
          })}
        </div>

        <InstrumentBay visualMode={visualMode} label={active.label}>
          <ActivePanel visualMode={visualMode} />
        </InstrumentBay>

        {density === 'balanced' ? (
          <div style={tailRailStyle}>
            {summaryIds.slice(2).map((id) => {
              const instrument = getInstrument(id);
              const Panel = instrument.CompactComponent;
              return (
                <InstrumentBay key={id} visualMode={visualMode} label={instrument.label} compact>
                  <Panel visualMode={visualMode} />
                </InstrumentBay>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LevelsFocusPanel({ visualMode }: SupportVariantProps): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const dirtyRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const peakHoldRef = useRef({ left: 0, right: 0, heldAtLeft: 0, heldAtRight: 0 });
  const themeRef = useRef(buildSupportTheme(visualMode));

  useLayoutEffect(() => {
    themeRef.current = buildSupportTheme(visualMode);
    dirtyRef.current = true;
  }, [visualMode]);

  useEffect(() => frameBus.subscribe((frame) => {
    frameRef.current = frame;
    dirtyRef.current = true;
  }), [frameBus]);

  useEffect(() => audioEngine.onReset(() => {
    frameRef.current = null;
    peakHoldRef.current = { left: 0, right: 0, heldAtLeft: 0, heldAtRight: 0 };
    dirtyRef.current = true;
  }), [audioEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      canvas.width = Math.round(entry.contentRect.width * dpr);
      canvas.height = Math.round(entry.contentRect.height * dpr);
      dirtyRef.current = true;
    });
    resizeObserver.observe(canvas);

    if (theaterMode) {
      return () => {
        resizeObserver.disconnect();
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const width = canvas.width;
      const height = canvas.height;
      const theme = themeRef.current;
      const frame = frameRef.current;
      drawCanvasBackdrop(ctx, width, height, theme);

      const marginX = Math.max(26 * dpr, width * 0.12);
      const laneW = Math.max(40 * dpr, width - marginX * 2);
      const labelW = 22 * dpr;
      const meterX = marginX + labelW;
      const meterW = Math.max(20 * dpr, laneW - labelW);
      const laneH = Math.max(16 * dpr, Math.min(30 * dpr, height * 0.18));
      const gap = Math.max(10 * dpr, height * 0.10);
      const firstY = Math.max(28 * dpr, (height - laneH * 2 - gap) / 2);
      const ticks = [-60, -40, -20, -12, -6, -3, 0];

      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = theme.dim;
      for (const tick of ticks) {
        const x = meterX + dbToFraction(tick) * meterW;
        ctx.fillRect(x, firstY - 10 * dpr, Math.max(1, 0.75 * dpr), laneH * 2 + gap + 16 * dpr);
        if (height >= 112 * dpr) ctx.fillText(String(tick), x, firstY + laneH * 2 + gap + 7 * dpr);
      }

      drawMeterLane(ctx, {
        dpr,
        label: 'L',
        x: meterX,
        y: firstY,
        width: meterW,
        height: laneH,
        peak: dbToFraction(levelToDb(frame?.peakLeft ?? 0)),
        rms: dbToFraction(levelToDb(frame?.rmsLeft ?? 0)),
        hold: peakHoldRef.current.left,
        theme,
      });
      drawMeterLane(ctx, {
        dpr,
        label: 'R',
        x: meterX,
        y: firstY + laneH + gap,
        width: meterW,
        height: laneH,
        peak: dbToFraction(levelToDb(frame?.peakRight ?? 0)),
        rms: dbToFraction(levelToDb(frame?.rmsRight ?? 0)),
        hold: peakHoldRef.current.right,
        theme,
      });

      const now = performance.now();
      const leftPeak = dbToFraction(levelToDb(frame?.peakLeft ?? 0));
      const rightPeak = dbToFraction(levelToDb(frame?.peakRight ?? 0));
      if (leftPeak >= peakHoldRef.current.left) {
        peakHoldRef.current.left = leftPeak;
        peakHoldRef.current.heldAtLeft = now;
      } else if (now - peakHoldRef.current.heldAtLeft > CANVAS.levelPeakHoldMs) {
        peakHoldRef.current.left = Math.max(0, peakHoldRef.current.left - 0.005);
      }
      if (rightPeak >= peakHoldRef.current.right) {
        peakHoldRef.current.right = rightPeak;
        peakHoldRef.current.heldAtRight = now;
      } else if (now - peakHoldRef.current.heldAtRight > CANVAS.levelPeakHoldMs) {
        peakHoldRef.current.right = Math.max(0, peakHoldRef.current.right - 0.005);
      }

      ctx.font = `${9 * dpr}px ${FONTS.mono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = theme.label;
      ctx.fillText('LEVELS', width - 8 * dpr, 6 * dpr);
      dirtyRef.current = true;
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      resizeObserver.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [theaterMode]);

  return <canvas ref={canvasRef} style={canvasStyle} />;
}

function MiniLevelsPanel({ visualMode }: SupportVariantProps): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const dirtyRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const peakHoldRef = useRef({ left: 0, right: 0, heldAtLeft: 0, heldAtRight: 0 });
  const themeRef = useRef(buildSupportTheme(visualMode));

  useLayoutEffect(() => {
    themeRef.current = buildSupportTheme(visualMode);
    dirtyRef.current = true;
  }, [visualMode]);

  useEffect(() => frameBus.subscribe((frame) => {
    frameRef.current = frame;
    dirtyRef.current = true;
  }), [frameBus]);

  useEffect(() => audioEngine.onReset(() => {
    frameRef.current = null;
    peakHoldRef.current = { left: 0, right: 0, heldAtLeft: 0, heldAtRight: 0 };
    dirtyRef.current = true;
  }), [audioEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      canvas.width = Math.round(entry.contentRect.width * dpr);
      canvas.height = Math.round(entry.contentRect.height * dpr);
      dirtyRef.current = true;
    });
    resizeObserver.observe(canvas);

    if (theaterMode) {
      return () => {
        resizeObserver.disconnect();
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const width = canvas.width;
      const height = canvas.height;
      const theme = themeRef.current;
      const frame = frameRef.current;
      drawCanvasBackdrop(ctx, width, height, theme);

      const now = performance.now();
      const leftPeak = dbToFraction(levelToDb(frame?.peakLeft ?? 0));
      const rightPeak = dbToFraction(levelToDb(frame?.peakRight ?? 0));
      updatePeakHold(peakHoldRef.current, leftPeak, rightPeak, now);

      const pad = 8 * dpr;
      const labelW = 12 * dpr;
      const meterX = pad + labelW;
      const meterW = width - meterX - pad;
      const laneH = Math.max(7 * dpr, Math.min(10 * dpr, height * 0.22));
      const gap = Math.max(4 * dpr, height * 0.10);
      const top = Math.max(7 * dpr, (height - laneH * 2 - gap) / 2);

      drawMeterLane(ctx, {
        dpr,
        label: 'L',
        x: meterX,
        y: top,
        width: meterW,
        height: laneH,
        peak: leftPeak,
        rms: dbToFraction(levelToDb(frame?.rmsLeft ?? 0)),
        hold: peakHoldRef.current.left,
        theme,
      });
      drawMeterLane(ctx, {
        dpr,
        label: 'R',
        x: meterX,
        y: top + laneH + gap,
        width: meterW,
        height: laneH,
        peak: rightPeak,
        rms: dbToFraction(levelToDb(frame?.rmsRight ?? 0)),
        hold: peakHoldRef.current.right,
        theme,
      });

      dirtyRef.current = true;
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      resizeObserver.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [theaterMode]);

  return <canvas ref={canvasRef} style={canvasStyle} />;
}

function MiniBandsPanel({ visualMode }: SupportVariantProps): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const smoothedRef = useRef(CANVAS.frequencyBands.map(() => 0));
  const dirtyRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const themeRef = useRef(buildSupportTheme(visualMode));

  useLayoutEffect(() => {
    themeRef.current = buildSupportTheme(visualMode);
    dirtyRef.current = true;
  }, [visualMode]);

  useEffect(() => frameBus.subscribe((frame) => {
    frameRef.current = frame;
    dirtyRef.current = true;
  }), [frameBus]);

  useEffect(() => audioEngine.onReset(() => {
    frameRef.current = null;
    smoothedRef.current = CANVAS.frequencyBands.map(() => 0);
    dirtyRef.current = true;
  }), [audioEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      canvas.width = Math.round(entry.contentRect.width * dpr);
      canvas.height = Math.round(entry.contentRect.height * dpr);
      dirtyRef.current = true;
    });
    resizeObserver.observe(canvas);

    if (theaterMode) {
      return () => {
        resizeObserver.disconnect();
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const width = canvas.width;
      const height = canvas.height;
      const theme = themeRef.current;
      drawCanvasBackdrop(ctx, width, height, theme);

      const levels = frequencyBandLevels(frameRef.current);
      const smoothed = smoothedRef.current;
      for (let i = 0; i < smoothed.length; i++) {
        smoothed[i] = smoothed[i] * 0.72 + levels[i] * 0.28;
      }

      const n = CANVAS.frequencyBands.length;
      const padX = 9 * dpr;
      const padY = 10 * dpr;
      const labelH = height >= 68 * dpr ? 9 * dpr : 0;
      const barH = Math.max(7 * dpr, height - padY * 2 - labelH);
      const gap = 3 * dpr;
      const barW = Math.max(3 * dpr, (width - padX * 2 - gap * (n - 1)) / n);

      for (let i = 0; i < n; i++) {
        const x = padX + i * (barW + gap);
        const color = theme.bandColors[i] ?? theme.accent;
        ctx.fillStyle = theme.track;
        ctx.fillRect(x, padY, barW, barH);
        ctx.fillStyle = hexToRgba(color, 0.30 + smoothed[i] * 0.70);
        ctx.fillRect(x, padY + barH * (1 - smoothed[i]), barW, barH * smoothed[i]);
        ctx.fillStyle = color;
        ctx.fillRect(x, padY + barH * (1 - smoothed[i]), barW, Math.max(1, 1.2 * dpr));
        if (labelH > 0 && barW >= 34 * dpr) {
          ctx.font = `${6.5 * dpr}px ${FONTS.mono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = i === 0 || i === n - 1 ? theme.label : theme.dim;
          ctx.fillText(CANVAS.frequencyBands[i].label, x + barW / 2, padY + barH + 2 * dpr);
        }
      }

      dirtyRef.current = true;
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      resizeObserver.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [theaterMode]);

  return <canvas ref={canvasRef} style={canvasStyle} />;
}

function MiniGoniometerPanel({ visualMode }: SupportVariantProps): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const dirtyRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const themeRef = useRef(buildSupportTheme(visualMode));

  useLayoutEffect(() => {
    themeRef.current = buildSupportTheme(visualMode);
    dirtyRef.current = true;
  }, [visualMode]);

  useEffect(() => frameBus.subscribe((frame) => {
    frameRef.current = frame;
    dirtyRef.current = true;
  }), [frameBus]);

  useEffect(() => audioEngine.onReset(() => {
    frameRef.current = null;
    dirtyRef.current = true;
  }), [audioEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      canvas.width = Math.round(entry.contentRect.width * dpr);
      canvas.height = Math.round(entry.contentRect.height * dpr);
      dirtyRef.current = true;
    });
    resizeObserver.observe(canvas);

    if (theaterMode) {
      return () => {
        resizeObserver.disconnect();
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const width = canvas.width;
      const height = canvas.height;
      const theme = themeRef.current;
      const corr = Math.max(-1, Math.min(1, frameRef.current?.phaseCorrelation ?? 0));
      drawCanvasBackdrop(ctx, width, height, theme);

      const barX = 28 * dpr;
      const barY = Math.max(16 * dpr, height * 0.50);
      const barW = width - barX - 12 * dpr;
      const barH = Math.max(6 * dpr, height * 0.16);
      ctx.fillStyle = theme.track;
      ctx.fillRect(barX, barY, barW, barH);
      const zeroX = barX + barW * 0.5;
      const corrX = barX + ((corr + 1) / 2) * barW;
      ctx.fillStyle = hexToRgba(theme.ok, 0.20);
      ctx.fillRect(zeroX, barY, barW * 0.5, barH);
      ctx.fillStyle = corr < 0 ? theme.hot : theme.ok;
      ctx.fillRect(corrX - 1.5 * dpr, barY - 3 * dpr, 3 * dpr, barH + 6 * dpr);
      ctx.strokeStyle = theme.dim;
      ctx.lineWidth = Math.max(1, 0.75 * dpr);
      ctx.beginPath();
      ctx.moveTo(zeroX, barY - 3 * dpr);
      ctx.lineTo(zeroX, barY + barH + 3 * dpr);
      ctx.stroke();

      const phaseR = Math.max(5 * dpr, Math.min(10 * dpr, height * 0.22));
      ctx.strokeStyle = theme.dim;
      ctx.beginPath();
      ctx.arc(15 * dpr, barY + barH * 0.5, phaseR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = corr < 0 ? theme.hot : theme.accent;
      ctx.beginPath();
      ctx.arc(15 * dpr, barY + barH * 0.5 - corr * phaseR * 0.72, Math.max(2 * dpr, phaseR * 0.35), 0, Math.PI * 2);
      ctx.fill();

      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = theme.label;
      ctx.fillText(corr.toFixed(2), width - 8 * dpr, 4 * dpr);

      dirtyRef.current = true;
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      resizeObserver.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [theaterMode]);

  return <canvas ref={canvasRef} style={canvasStyle} />;
}

function MiniPartialsPanel({ visualMode }: SupportVariantProps): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const smoothedRef = useRef(new Float32Array(NUM_PARTIALS).fill(Number(CANVAS.dbMin)));
  const dirtyRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const themeRef = useRef(buildSupportTheme(visualMode));

  useLayoutEffect(() => {
    themeRef.current = buildSupportTheme(visualMode);
    dirtyRef.current = true;
  }, [visualMode]);

  useEffect(() => frameBus.subscribe((frame) => {
    frameRef.current = frame;
    dirtyRef.current = true;
  }), [frameBus]);

  useEffect(() => audioEngine.onReset(() => {
    frameRef.current = null;
    smoothedRef.current.fill(Number(CANVAS.dbMin));
    dirtyRef.current = true;
  }), [audioEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      canvas.width = Math.round(entry.contentRect.width * dpr);
      canvas.height = Math.round(entry.contentRect.height * dpr);
      dirtyRef.current = true;
    });
    resizeObserver.observe(canvas);

    if (theaterMode) {
      return () => {
        resizeObserver.disconnect();
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const width = canvas.width;
      const height = canvas.height;
      const theme = themeRef.current;
      const frame = frameRef.current;
      const smoothed = smoothedRef.current;
      drawCanvasBackdrop(ctx, width, height, theme);

      if (frame?.f0Hz && frame.f0Confidence > 0.45) {
        for (let partial = 1; partial <= NUM_PARTIALS; partial++) {
          const raw = partialDb(frame.frequencyDb, frame.f0Hz, partial, frame.sampleRate);
          const i = partial - 1;
          const alpha = raw > smoothed[i] ? 0.4 : 0.12;
          smoothed[i] = smoothed[i] + alpha * (raw - smoothed[i]);
        }
      } else {
        for (let i = 0; i < NUM_PARTIALS; i++) {
          smoothed[i] = smoothed[i] + 0.12 * (CANVAS.dbMin - smoothed[i]);
        }
      }

      let peakDb: number = CANVAS.dbMin;
      for (let i = 0; i < NUM_PARTIALS; i++) if (smoothed[i] > peakDb) peakDb = smoothed[i];
      const floorDb = peakDb - PARTIAL_DISPLAY_RANGE_DB;
      const padX = 3 * dpr;
      const padY = 6 * dpr;
      const labelH = 9 * dpr;
      const gap = 2 * dpr;
      const barHMax = Math.max(8 * dpr, height - padY * 2 - labelH);
      const barW = Math.max(2 * dpr, (width - padX * 2 - gap * (NUM_PARTIALS - 1)) / NUM_PARTIALS);

      for (let i = 0; i < NUM_PARTIALS; i++) {
        const x = padX + i * (barW + gap);
        const fraction = peakDb > CANVAS.dbMin + 5
          ? Math.max(0, (smoothed[i] - floorDb) / PARTIAL_DISPLAY_RANGE_DB)
          : 0;
        const barH = fraction * barHMax;
        const y = padY + barHMax - barH;
        const color = theme.partialColors[i] ?? theme.accent;
        ctx.fillStyle = theme.track;
        ctx.fillRect(x, padY, barW, barHMax);
        ctx.fillStyle = hexToRgba(color, 0.30 + fraction * 0.70);
        ctx.fillRect(x, y, barW, barH);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, barW, Math.max(1, 1.2 * dpr));
        ctx.font = `${6.5 * dpr}px ${FONTS.mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = i === 0 ? theme.label : theme.dim;
        ctx.fillText(String(i + 1), x + barW / 2, padY + barHMax + 2 * dpr);
      }

      dirtyRef.current = true;
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      resizeObserver.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [theaterMode]);

  return <canvas ref={canvasRef} style={canvasStyle} />;
}

function updatePeakHold(
  holder: { left: number; right: number; heldAtLeft: number; heldAtRight: number },
  leftPeak: number,
  rightPeak: number,
  now: number,
): void {
  if (leftPeak >= holder.left) {
    holder.left = leftPeak;
    holder.heldAtLeft = now;
  } else if (now - holder.heldAtLeft > CANVAS.levelPeakHoldMs) {
    holder.left = Math.max(0, holder.left - 0.005);
  }
  if (rightPeak >= holder.right) {
    holder.right = rightPeak;
    holder.heldAtRight = now;
  } else if (now - holder.heldAtRight > CANVAS.levelPeakHoldMs) {
    holder.right = Math.max(0, holder.right - 0.005);
  }
}

function drawMeterLane(
  ctx: CanvasRenderingContext2D,
  props: {
    readonly dpr: number;
    readonly label: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly peak: number;
    readonly rms: number;
    readonly hold: number;
    readonly theme: SupportTheme;
  },
): void {
  const { dpr, label, x, y, width, height, peak, rms, hold, theme } = props;
  ctx.fillStyle = theme.track;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = hexToRgba(levelColor(rms, theme), 0.46);
  ctx.fillRect(x, y + height * 0.22, width * rms, height * 0.56);
  ctx.fillStyle = levelColor(peak, theme);
  ctx.fillRect(x, y, width * peak, height);
  ctx.fillStyle = theme.peakHold;
  ctx.fillRect(x + width * hold - 1 * dpr, y - 2 * dpr, 2 * dpr, height + 4 * dpr);
  ctx.font = `${8 * dpr}px ${FONTS.mono}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.label;
  ctx.fillText(label, x - 7 * dpr, y + height / 2);
}

function InstrumentBay({
  children,
  compact = false,
  label,
  visualMode,
}: {
  readonly children: React.ReactNode;
  readonly compact?: boolean;
  readonly label: string;
  readonly visualMode: VisualMode;
}): React.ReactElement {
  const mode = MODES[visualMode];
  const theme = buildSupportTheme(visualMode);
  return (
    <div
      style={{
        ...bayStyle,
        borderColor: mode.chromeBorder,
        background: visualMode === 'optic' ? 'rgba(232,240,246,0.72)' : 'rgba(0,0,0,0.08)',
      }}
    >
      {compact ? <span style={{ ...bayLabelStyle, color: theme.category }}>{label}</span> : null}
      <div style={bayContentStyle}>{children}</div>
    </div>
  );
}

const rackStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.panelGap,
};

const fullGridStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: '54px minmax(120px, 1fr) minmax(58px, 0.32fr) minmax(58px, 0.32fr)',
  gap: SPACING.panelGap,
};

const focusRailStyle: React.CSSProperties = {
  flexShrink: 0,
  minHeight: 23,
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.sm,
  padding: `2px ${SPACING.sm}px`,
  borderBottomWidth: 1,
  borderBottomStyle: 'solid',
  boxSizing: 'border-box',
};

const focusLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.12em',
  flexShrink: 0,
};

const tabRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  minWidth: 0,
  overflow: 'hidden',
};

const tabButtonStyle: React.CSSProperties = {
  height: 17,
  padding: '0 6px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: 8,
  letterSpacing: '0.08em',
  cursor: 'pointer',
  outline: 'none',
  flexShrink: 0,
};

const balancedGridStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: '60px minmax(118px, 1fr) 60px',
  gap: SPACING.panelGap,
};

const focusGridStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: '56px minmax(92px, 1fr)',
  gap: SPACING.panelGap,
};

const summaryRailStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: SPACING.panelGap,
};

const tailRailStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: SPACING.panelGap,
};

const bayStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: 0,
  overflow: 'hidden',
  borderWidth: 1,
  borderStyle: 'solid',
};

const bayContentStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 0,
};

const bayLabelStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 2,
  top: 3,
  right: 6,
  fontFamily: FONTS.mono,
  fontSize: 8,
  letterSpacing: '0.08em',
  pointerEvents: 'none',
  textShadow: `0 1px 2px ${COLORS.bg0}`,
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};
