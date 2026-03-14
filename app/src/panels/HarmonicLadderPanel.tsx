// ============================================================
// HarmonicLadderPanel — harmonic partial series.
// Bars normalized relative to the strongest partial so the
// display is meaningful at any signal level — not absolute dBFS.
// ============================================================

import { useEffect, useRef } from 'react';
import { useAudioEngine, useFrameBus, useTheaterMode } from '../core/session';
import { COLORS, FONTS, SPACING, CANVAS } from '../theme';
import type { AudioFrame } from '../types';

const PANEL_DPR_MAX = 1.5;
const NUM_PARTIALS = 10;
// Exponential smoothing — faster attack, slow decay
const SMOOTH_ATTACK = 0.4;
const SMOOTH_DECAY  = 0.12;
// Dynamic range window: anything >40 dB below the peak is shown as zero
const DISPLAY_RANGE_DB = 40;

// Amber (fundamental) → desaturated steel (overtones)
const PARTIAL_COLORS = [
  '#c8922a',
  '#b08832',
  '#8a7a3c',
  '#6a6e4a',
  '#4e6458',
  '#3a5c68',
  '#2c5478',
  '#224a84',
  '#1a408e',
  '#143896',
];

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const smoothedRef = useRef<Float32Array>(new Float32Array(NUM_PARTIALS).fill(Number(CANVAS.dbMin)));
  const rafRef = useRef<number | null>(null);

  useEffect(() => frameBus.subscribe((frame) => { frameRef.current = frame; }), [frameBus]);

  useEffect(() => audioEngine.onReset(() => {
    frameRef.current = null;
    smoothedRef.current.fill(Number(CANVAS.dbMin));
  }), [audioEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
        canvas.width = Math.round(e.contentRect.width * dpr);
        canvas.height = Math.round(e.contentRect.height * dpr);
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

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = COLORS.bg2;
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
        ctx.fillStyle = COLORS.levelTrack;
        ctx.fillRect(x, topPad, barW, drawH);

        // Bar — brighter at top (peak)
        if (barH > 0) {
          const grad = ctx.createLinearGradient(0, y, 0, y + barH);
          const col = PARTIAL_COLORS[i] ?? COLORS.waveform;
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
        ctx.fillStyle = i === 0 ? COLORS.textSecondary : COLORS.textDim;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), x + barW / 2, topPad + drawH + labelH / 2);
      }

      // Bottom separator line above labels
      ctx.fillStyle = COLORS.bg3;
      ctx.fillRect(0, topPad + drawH, W, 1);

      // F0 readout top-left
      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      if (hasPitch && frame?.f0Hz) {
        ctx.fillStyle = COLORS.waveform;
        ctx.fillText(`${Math.round(frame.f0Hz)} Hz`, SPACING.sm * dpr, 1 * dpr);
      } else {
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText('PARTIALS', SPACING.sm * dpr, 1 * dpr);
      }

      // Panel label top-right
      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('HARMONICS', W - SPACING.sm * dpr, 1 * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [theaterMode]);

  return (
    <div style={panelStyle}>
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
