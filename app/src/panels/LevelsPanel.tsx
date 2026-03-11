// ============================================================
// Levels Panel — bottom-left quadrant (upper half)
// Peak and RMS bars with labelled dB scale.
// ============================================================

import { useEffect, useRef } from 'react';
import { frameBus } from '../audio/frameBus';
import { audioEngine } from '../audio/engine';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import { levelToDb, dbToFraction, drawDbScale } from '../utils/canvas';
import type { AudioFrame } from '../types';

const HOLD_MS = CANVAS.levelPeakHoldMs;
const BAR_W = CANVAS.levelBarWidth;
const DB_SCALE_W = 40;

interface PeakHolder {
  fraction: number;
  heldAt: number;
}

export function LevelsPanel(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const peakL = useRef<PeakHolder>({ fraction: 0, heldAt: 0 });
  const peakR = useRef<PeakHolder>({ fraction: 0, heldAt: 0 });

  useEffect(() => {
    const unsub = frameBus.subscribe((f) => { frameRef.current = f; });
    return unsub;
  }, []);

  useEffect(() => {
    return audioEngine.onReset(() => {
      frameRef.current = null;
      peakL.current = { fraction: 0, heldAt: 0 };
      peakR.current = { fraction: 0, heldAt: 0 };
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = Math.round(width * devicePixelRatio);
        canvas.height = Math.round(height * devicePixelRatio);
      }
    });
    ro.observe(canvas);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const frame = frameRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = devicePixelRatio;
      const padX = SPACING.panelPad * dpr;
      const padY = SPACING.panelPad * dpr;
      const scaleW = DB_SCALE_W * dpr;
      const barW = BAR_W * dpr;
      const barH = H - padY * 2;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = COLORS.bg2;
      ctx.fillRect(0, 0, W, H);

      if (!frame) {
        drawDbScale(ctx, scaleW, padY, barH, [-60, -40, -20, -12, -6, -3, 0]);
        drawLabel(ctx, W, dpr);
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
      drawDbScale(ctx, scaleW, padY, barH, [-60, -40, -20, -12, -6, -3, 0]);

      // Channel bars: L then R side by side
      const barStartX = scaleW + padX;
      for (let ch = 0; ch < 2; ch++) {
        const pkFrac = ch === 0 ? lpFrac : rpFrac;
        const rmsFrac = ch === 0 ? rmsFracL : rmsFracR;
        const holdFrac = ch === 0 ? peakL.current.fraction : peakR.current.fraction;
        const x = barStartX + ch * (barW + 4 * dpr);

        // Track
        ctx.fillStyle = COLORS.levelTrack;
        ctx.fillRect(x, padY, barW, barH);

        // RMS bar (dimmer, slightly narrower)
        const rmsH = rmsFrac * barH;
        const rmsColor = rmsFrac > dbToFraction(-3) ? COLORS.levelRed
          : rmsFrac > dbToFraction(-12) ? COLORS.levelYellow
          : COLORS.levelGreen;
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = rmsColor;
        ctx.fillRect(x, padY + (barH - rmsH), barW, rmsH);
        ctx.globalAlpha = 1;

        // Peak bar
        const pkH = pkFrac * barH;
        const pkColor = pkFrac > dbToFraction(-3) ? COLORS.levelRed
          : pkFrac > dbToFraction(-12) ? COLORS.levelYellow
          : COLORS.levelGreen;
        ctx.fillStyle = pkColor;
        ctx.fillRect(x, padY + (barH - pkH), barW, pkH);

        // Peak hold tick
        const holdY = padY + barH - holdFrac * barH;
        ctx.fillStyle = COLORS.textSecondary;
        ctx.fillRect(x, holdY - dpr, barW, 2 * dpr);

        // Channel label
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = COLORS.textDim;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(ch === 0 ? 'L' : 'R', x + barW / 2, padY + barH + 2 * dpr);
      }

      drawLabel(ctx, W, dpr);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div style={panelStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
}

function drawLabel(ctx: CanvasRenderingContext2D, W: number, dpr: number): void {
  ctx.font = `${9 * dpr}px ${FONTS.mono}`;
  ctx.fillStyle = COLORS.textDim;
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
