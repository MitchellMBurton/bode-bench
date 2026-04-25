// ============================================================
// HarmonicLadderPanel — harmonic partial series.
// Bars normalized relative to the strongest partial so the
// display is meaningful at any signal level — not absolute dBFS.
// ============================================================

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useTheaterMode } from '../core/session';
import { COLORS, FONTS, SPACING, CANVAS } from '../theme';
import { shouldSkipFrame } from '../utils/rafGuard';
import type { AudioFrame } from '../types';
import type { VisualMode } from '../audio/displayMode';

const PANEL_DPR_MAX = 1.25;
const NUM_PARTIALS = 10;
// Exponential smoothing — faster attack, slow decay
const SMOOTH_ATTACK = 0.4;
const SMOOTH_DECAY  = 0.12;
// Dynamic range window: anything >40 dB below the peak is shown as zero
const DISPLAY_RANGE_DB = 40;

// Default: amber (fundamental) → desaturated steel (overtones)
const PARTIAL_COLORS_DEFAULT = [
  '#c8922a', '#b08832', '#8a7a3c', '#6a6e4a', '#4e6458',
  '#3a5c68', '#2c5478', '#224a84', '#1a408e', '#143896',
];

// NGE: bright lime (fundamental) → deep dark green (overtones)
const PARTIAL_COLORS_NGE = [
  '#9ed828', '#84c020', '#6aaa16', '#528e0e', '#3c7208',
  '#2c5e04', '#204a02', '#163802', '#0e2800', '#081800',
];

// HYPER: bright cyan (fundamental) → deep indigo (overtones)
const PARTIAL_COLORS_HYPER = [
  '#62e8ff', '#4ac8e8', '#32a8d0', '#1e88b8', '#106aa0',
  '#085088', '#043870', '#022458', '#011040', '#000828',
];
const PARTIAL_COLORS_AMBER = [
  '#ffb020', '#eb9e1c', '#d18a18', '#b77616', '#9d6214',
  '#835013', '#6a4013', '#523214', '#3e2613', '#28180f',
];

// EVA: NERV orange (fundamental) → deep purple (overtones)
const PARTIAL_COLORS_EVA = [
  '#ff7b00', '#e06800', '#c05400', '#a04000', '#803000',
  '#602060', '#481880', '#301090', '#200860', '#100440',
];
const PARTIAL_COLORS_RED = [
  '#ff5a4a', '#f04d3f', '#d94134', '#b93429', '#96261f',
  '#741a16', '#56110f', '#3d0a0a', '#2a0606', '#140202',
];
const PARTIAL_COLORS_OPTIC = [
  '#1da9c7', '#57c0ed', '#7adcd8', '#b3e0ff', '#ffd08a',
  '#f2b5ff', '#d0c3ff', '#b6d9ff', '#95d9ff', '#dceefe',
];

function getPartialColors(mode: VisualMode): readonly string[] {
  if (mode === 'amber') return PARTIAL_COLORS_AMBER;
  if (mode === 'nge') return PARTIAL_COLORS_NGE;
  if (mode === 'hyper') return PARTIAL_COLORS_HYPER;
  if (mode === 'eva') return PARTIAL_COLORS_EVA;
  if (mode === 'red') return PARTIAL_COLORS_RED;
  if (mode === 'optic') return PARTIAL_COLORS_OPTIC;
  return PARTIAL_COLORS_DEFAULT;
}

interface LadderColors {
  bg: string;
  track: string;
  separator: string;
  f0Color: string;
  labelColor: string;
  dimColor: string;
}

function buildLadderColors(mode: VisualMode): LadderColors {
  if (mode === 'amber') return {
    bg: CANVAS.amber.bg2,
    track: '#140d03',
    separator: '#221605',
    f0Color: CANVAS.amber.trace,
    labelColor: CANVAS.amber.label,
    dimColor: 'rgba(176,126,44,0.45)',
  };
  if (mode === 'nge') return {
    bg: CANVAS.nge.bg2,
    track: '#030a03',
    separator: '#040e04',
    f0Color: '#90d820',
    labelColor: CANVAS.nge.label,
    dimColor: 'rgba(80,160,50,0.45)',
  };
  if (mode === 'hyper') return {
    bg: CANVAS.hyper.bg2,
    track: '#030918',
    separator: '#04091c',
    f0Color: CANVAS.hyper.trace,
    labelColor: CANVAS.hyper.label,
    dimColor: 'rgba(84,132,255,0.45)',
  };
  if (mode === 'eva') return {
    bg: CANVAS.eva.bg2,
    track: '#08041a',
    separator: '#160c30',
    f0Color: CANVAS.eva.trace,
    labelColor: CANVAS.eva.label,
    dimColor: 'rgba(170,90,255,0.45)',
  };
  if (mode === 'red') return {
    bg: CANVAS.red.bg2,
    track: '#120405',
    separator: '#1b0708',
    f0Color: CANVAS.red.trace,
    labelColor: CANVAS.red.label,
    dimColor: 'rgba(214,92,82,0.44)',
  };
  if (mode === 'optic') return {
    bg: CANVAS.optic.bg2,
    track: '#dde9f1',
    separator: '#e8f1f7',
    f0Color: CANVAS.optic.trace,
    labelColor: CANVAS.optic.label,
    dimColor: 'rgba(92,132,156,0.48)',
  };
  return {
    bg: COLORS.bg2,
    track: COLORS.levelTrack,
    separator: COLORS.bg3,
    f0Color: COLORS.waveform,
    labelColor: COLORS.textSecondary,
    dimColor: COLORS.textDim,
  };
}

function getPartialDb(
  frequencyDb: Float32Array,
  f0: number,
  partial: number,
  sampleRate: number,
): number {
  const targetHz = f0 * partial;
  const binHz = sampleRate / (frequencyDb.length * 2);
  const binIndex = Math.round(targetHz / binHz);
  if (binIndex < 0 || binIndex >= frequencyDb.length) return CANVAS.dbMin;
  // Average ±3 bins around the peak bin
  let best: number = CANVAS.dbMin;
  for (let d = -3; d <= 3; d++) {
    const idx = binIndex + d;
    if (idx >= 0 && idx < frequencyDb.length && frequencyDb[idx] > best) {
      best = frequencyDb[idx];
    }
  }
  return best;
}

export function HarmonicLadderPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const theaterMode = useTheaterMode();
  const displayMode = useDisplayMode();
  const currentMode = displayMode.mode;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const dirtyRef = useRef(true);
  const smoothedRef = useRef<Float32Array>(new Float32Array(NUM_PARTIALS).fill(Number(CANVAS.dbMin)));
  const rafRef = useRef<number | null>(null);
  const currentLadderColors = buildLadderColors(currentMode);
  const currentPartialColors = getPartialColors(currentMode);
  const ladderColorsRef = useRef(currentLadderColors);
  const partialColorsRef = useRef(currentPartialColors);
  useLayoutEffect(() => {
    ladderColorsRef.current = buildLadderColors(currentMode);
    partialColorsRef.current = getPartialColors(currentMode);
    dirtyRef.current = true;
  }, [currentMode]);

  useEffect(() => frameBus.subscribe((frame) => { frameRef.current = frame; dirtyRef.current = true; }), [frameBus]);

  useEffect(() => audioEngine.onReset(() => {
    frameRef.current = null;
    smoothedRef.current.fill(Number(CANVAS.dbMin));
    dirtyRef.current = true;
  }), [audioEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
        canvas.width = Math.round(e.contentRect.width * dpr);
        canvas.height = Math.round(e.contentRect.height * dpr);
        dirtyRef.current = true;
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (theaterMode) {
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    dirtyRef.current = true;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!dirtyRef.current || shouldSkipFrame(canvas)) return;
      dirtyRef.current = false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);

      const lc = ladderColorsRef.current;
      const partialColors = partialColorsRef.current;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = lc.bg;
      ctx.fillRect(0, 0, W, H);

      const frame = frameRef.current;
      const smoothed = smoothedRef.current;
      const hasPitch = !!(frame?.f0Hz && frame.f0Confidence > 0.45);

      // Update smoothed levels — different attack/decay rates
      if (hasPitch && frame) {
        for (let p = 1; p <= NUM_PARTIALS; p++) {
          const raw = getPartialDb(frame.frequencyDb, frame.f0Hz!, p, frame.sampleRate);
          const i = p - 1;
          const alpha = raw > smoothed[i] ? SMOOTH_ATTACK : SMOOTH_DECAY;
          smoothed[i] = smoothed[i] + alpha * (raw - smoothed[i]);
        }
      } else {
        for (let i = 0; i < NUM_PARTIALS; i++) {
          smoothed[i] = smoothed[i] + SMOOTH_DECAY * (CANVAS.dbMin - smoothed[i]);
        }
      }

      // Normalize relative to the strongest partial
      let peakDb: number = CANVAS.dbMin;
      for (let i = 0; i < NUM_PARTIALS; i++) {
        if (smoothed[i] > peakDb) peakDb = smoothed[i];
      }
      const floorDb = peakDb - DISPLAY_RANGE_DB;

      // Layout
      const labelH = 16 * dpr;
      const topPad = 6 * dpr;
      const drawH = H - labelH - topPad;
      const totalBarW = W - SPACING.panelGap * (NUM_PARTIALS + 1);
      const barW = Math.max(2, totalBarW / NUM_PARTIALS);

      for (let i = 0; i < NUM_PARTIALS; i++) {
        const x = SPACING.panelGap + i * (barW + SPACING.panelGap);
        const db = smoothed[i];
        const fraction = peakDb > CANVAS.dbMin + 5
          ? Math.max(0, (db - floorDb) / DISPLAY_RANGE_DB)
          : 0;
        const barH = fraction * drawH;
        const y = topPad + drawH - barH;

        // Track
        ctx.fillStyle = lc.track;
        ctx.fillRect(x, topPad, barW, drawH);

        // Bar — brighter at top (peak)
        if (barH > 0) {
          const grad = ctx.createLinearGradient(0, y, 0, y + barH);
          const col = partialColors[i] ?? lc.f0Color;
          grad.addColorStop(0, col);
          grad.addColorStop(1, col + '66'); // 40% opacity at bottom
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, barW, barH);

          // Top cap — bright 1px line
          ctx.fillStyle = col;
          ctx.fillRect(x, y, barW, 1.5 * dpr);
        }

        // Partial number label
        ctx.font = `${7 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = i === 0 ? lc.labelColor : lc.dimColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), x + barW / 2, topPad + drawH + labelH / 2);
      }

      // Bottom separator line above labels
      ctx.fillStyle = lc.separator;
      ctx.fillRect(0, topPad + drawH, W, 1);

      // F0 readout top-left
      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      if (hasPitch && frame?.f0Hz) {
        ctx.fillStyle = lc.f0Color;
        ctx.fillText(`${Math.round(frame.f0Hz)} Hz`, SPACING.sm * dpr, 1 * dpr);
      } else {
        ctx.fillStyle = lc.dimColor;
        ctx.fillText('PARTIALS', SPACING.sm * dpr, 1 * dpr);
      }

      // Panel label top-right
      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = lc.dimColor;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('HARMONICS', W - SPACING.sm * dpr, 1 * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [theaterMode]);

  return (
    <div style={{ ...panelStyle, background: currentLadderColors.bg }}>
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: COLORS.bg2,
  overflow: 'hidden',
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};
