// ============================================================
// Levels Panel — bottom-left quadrant (upper half)
// Peak and RMS bars with labelled dB scale.
// ============================================================

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useTheaterMode } from '../core/session';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import { levelToDb, dbToFraction, drawDbScale } from '../utils/canvas';
import { shouldSkipFrame } from '../utils/rafGuard';
import type { AudioFrame } from '../types';
import type { VisualMode } from '../audio/displayMode';

interface LevelsColors {
  bg: string;
  track: string;
  levelGreen: string;
  levelYellow: string;
  levelRed: string;
  peakHold: string;
  label: string;
}

function buildLevelsColors(mode: VisualMode): LevelsColors {
  if (mode === 'nge') return {
    bg: CANVAS.nge.bg2,
    track: '#030a03',
    levelGreen: '#70c018',
    levelYellow: COLORS.levelYellow,
    levelRed: COLORS.levelRed,
    peakHold: 'rgba(120,200,60,0.6)',
    label: 'rgba(80,160,50,0.5)',
  };
  if (mode === 'hyper') return {
    bg: CANVAS.hyper.bg2,
    track: '#030918',
    levelGreen: '#28b0c8',
    levelYellow: COLORS.levelYellow,
    levelRed: COLORS.levelRed,
    peakHold: 'rgba(78,200,255,0.55)',
    label: 'rgba(84,132,255,0.5)',
  };
  if (mode === 'eva') return {
    bg: CANVAS.eva.bg2,
    track: '#08041a',
    levelGreen: '#ff7b00',
    levelYellow: '#ffa020',
    levelRed: '#ff2020',
    peakHold: 'rgba(255,140,40,0.55)',
    label: CANVAS.eva.label,
  };
  if (mode === 'optic') return {
    bg: CANVAS.optic.bg2,
    track: '#d8e6ef',
    levelGreen: '#47b4cf',
    levelYellow: '#f0c66d',
    levelRed: '#e47f6e',
    peakHold: 'rgba(21,151,212,0.55)',
    label: CANVAS.optic.label,
  };
  return {
    bg: COLORS.bg2,
    track: COLORS.levelTrack,
    levelGreen: COLORS.levelGreen,
    levelYellow: COLORS.levelYellow,
    levelRed: COLORS.levelRed,
    peakHold: COLORS.textSecondary,
    label: COLORS.textDim,
  };
}

const HOLD_MS = CANVAS.levelPeakHoldMs;
const BAR_W = CANVAS.levelBarWidth;
const DB_SCALE_W = 40;
const PANEL_DPR_MAX = 1.25;

interface PeakHolder {
  fraction: number;
  heldAt: number;
}

export function LevelsPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const theaterMode = useTheaterMode();
  const displayMode = useDisplayMode();
  const currentMode = displayMode.mode;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const dirtyRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const peakL = useRef<PeakHolder>({ fraction: 0, heldAt: 0 });
  const peakR = useRef<PeakHolder>({ fraction: 0, heldAt: 0 });
  const currentColors = buildLevelsColors(currentMode);
  const colorsRef = useRef(currentColors);
  useLayoutEffect(() => {
    colorsRef.current = buildLevelsColors(currentMode);
    dirtyRef.current = true;
  }, [currentMode]);

  useEffect(() => {
    const unsub = frameBus.subscribe((f) => { frameRef.current = f; dirtyRef.current = true; });
    return unsub;
  }, [frameBus]);

  useEffect(() => {
    return audioEngine.onReset(() => {
      frameRef.current = null;
      peakL.current = { fraction: 0, heldAt: 0 };
      peakR.current = { fraction: 0, heldAt: 0 };
      dirtyRef.current = true;
    });
  }, [audioEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
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

    dirtyRef.current = true;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!dirtyRef.current || shouldSkipFrame(canvas)) return;
      dirtyRef.current = false;
      const frame = frameRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const padX = SPACING.panelPad * dpr;
      const padY = SPACING.panelPad * dpr;
      const scaleW = DB_SCALE_W * dpr;
      const barW = BAR_W * dpr;
      const barH = H - padY * 2;

      const c = colorsRef.current;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, W, H);

      if (!frame) {
        drawDbScale(ctx, scaleW, padY, barH, [-60, -40, -20, -12, -6, -3, 0], c.label, c.label);
        drawLabel(ctx, W, dpr, c.label);
        return;
      }

      const now = performance.now();

      // Update peak holders
      const lpFrac = dbToFraction(levelToDb(frame.peakLeft));
      const rpFrac = dbToFraction(levelToDb(frame.peakRight));

      if (lpFrac >= peakL.current.fraction) {
        peakL.current = { fraction: lpFrac, heldAt: now };
      } else if (now - peakL.current.heldAt > HOLD_MS) {
        peakL.current.fraction = Math.max(0, peakL.current.fraction - 0.005);
      }
      if (rpFrac >= peakR.current.fraction) {
        peakR.current = { fraction: rpFrac, heldAt: now };
      } else if (now - peakR.current.heldAt > HOLD_MS) {
        peakR.current.fraction = Math.max(0, peakR.current.fraction - 0.005);
      }

      const rmsFracL = dbToFraction(levelToDb(frame.rmsLeft));
      const rmsFracR = dbToFraction(levelToDb(frame.rmsRight));

      // DB scale
      drawDbScale(ctx, scaleW, padY, barH, [-60, -40, -20, -12, -6, -3, 0], c.label, c.label);

      // Channel bars: L then R side by side
      const barStartX = scaleW + padX;
      for (let ch = 0; ch < 2; ch++) {
        const pkFrac = ch === 0 ? lpFrac : rpFrac;
        const rmsFrac = ch === 0 ? rmsFracL : rmsFracR;
        const holdFrac = ch === 0 ? peakL.current.fraction : peakR.current.fraction;
        const x = barStartX + ch * (barW + 4 * dpr);

        // Track
        ctx.fillStyle = c.track;
        ctx.fillRect(x, padY, barW, barH);

        // RMS bar (dimmer, slightly narrower)
        const rmsH = rmsFrac * barH;
        const rmsColor = rmsFrac > dbToFraction(-3) ? c.levelRed
          : rmsFrac > dbToFraction(-12) ? c.levelYellow
          : c.levelGreen;
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = rmsColor;
        ctx.fillRect(x, padY + (barH - rmsH), barW, rmsH);
        ctx.globalAlpha = 1;

        // Peak bar
        const pkH = pkFrac * barH;
        const pkColor = pkFrac > dbToFraction(-3) ? c.levelRed
          : pkFrac > dbToFraction(-12) ? c.levelYellow
          : c.levelGreen;
        ctx.fillStyle = pkColor;
        ctx.fillRect(x, padY + (barH - pkH), barW, pkH);

        // Peak hold tick
        const holdY = padY + barH - holdFrac * barH;
        ctx.fillStyle = c.peakHold;
        ctx.fillRect(x, holdY - dpr, barW, 2 * dpr);

        // Channel label
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = c.label;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(ch === 0 ? 'L' : 'R', x + barW / 2, padY + barH + 2 * dpr);
      }

      drawLabel(ctx, W, dpr, c.label);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [theaterMode]);

  return (
    <div style={{ ...panelStyle, background: currentColors.bg }}>
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
}

function drawLabel(ctx: CanvasRenderingContext2D, W: number, dpr: number, color: string): void {
  ctx.font = `${9 * dpr}px ${FONTS.mono}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('LEVELS', W - 8 * dpr, 6 * dpr);
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
