// ============================================================
// Frequency Bands Panel — bottom-left quadrant (lower half)
// Aggregates FFT bins into coarse bands. Bar display with Hz labels.
// ============================================================

import { useEffect, useRef } from 'react';
import { frameBus } from '../audio/frameBus';
import { audioEngine } from '../audio/engine';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import type { AudioFrame, FrequencyBand } from '../types';

export function FrequencyBandsPanel(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedRef = useRef<number[]>(CANVAS.frequencyBands.map(() => 0));

  useEffect(() => {
    const unsub = frameBus.subscribe((f) => { frameRef.current = f; });
    return unsub;
  }, []);

  useEffect(() => {
    return audioEngine.onReset(() => {
      frameRef.current = null;
      smoothedRef.current = CANVAS.frequencyBands.map(() => 0);
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
      const labelH = 16 * dpr;
      const barAreaH = H - padY * 2 - labelH;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = COLORS.bg2;
      ctx.fillRect(0, 0, W, H);

      const bands = CANVAS.frequencyBands;
      const n = bands.length;
      const availW = W - padX * 2;
      const barW = (availW / n) - 3 * dpr;
      const gap = 3 * dpr;

      if (frame) {
        const freqData = frame.frequencyDb;
        const binCount = freqData.length;
        const sampleRate = frame.sampleRate;
        const smoothed = smoothedRef.current;

        for (let i = 0; i < n; i++) {
          const band = bands[i];
          const lowBin = Math.floor((band.lowHz / (sampleRate / 2)) * binCount);
          const highBin = Math.min(Math.ceil((band.highHz / (sampleRate / 2)) * binCount), binCount - 1);

          // Average dB in band
          let sum = 0;
          let count = 0;
          for (let b = lowBin; b <= highBin; b++) {
            sum += freqData[b];
            count++;
          }
          const avgDb = count > 0 ? sum / count : CANVAS.dbMin;

          // Normalise to 0–1
          const fraction = Math.max(0, Math.min(1, (avgDb - CANVAS.dbMin) / (CANVAS.dbMax - CANVAS.dbMin)));

          // Smooth
          smoothed[i] = smoothed[i] * 0.7 + fraction * 0.3;

          const x = padX + i * (barW + gap);
          const barH = smoothed[i] * barAreaH;
          const y = padY + barAreaH - barH;

          // Bar track
          ctx.fillStyle = COLORS.levelTrack;
          ctx.fillRect(x, padY, barW, barAreaH);

          // Bar fill — base color by frequency register, brightness by level
          const level = smoothed[i];
          const baseColor = CANVAS.bandColors[i] ?? '#404040';
          // Parse hex to RGB and brighten proportionally to level
          const r = parseInt(baseColor.slice(1, 3), 16);
          const g = parseInt(baseColor.slice(3, 5), 16);
          const b = parseInt(baseColor.slice(5, 7), 16);
          const bright = 0.4 + level * 0.6;
          ctx.fillStyle = `rgb(${Math.round(r * bright)},${Math.round(g * bright)},${Math.round(b * bright)})`;
          ctx.fillRect(x, y, barW, barH);

          // Peak dot — brighter version of band color
          const peakBright = Math.min(1, bright + 0.3);
          ctx.fillStyle = `rgb(${Math.round(r * peakBright)},${Math.round(g * peakBright)},${Math.round(b * peakBright)})`;
          ctx.fillRect(x, y - 1, barW, 1);

          // Label
          ctx.font = `${8 * dpr}px ${FONTS.mono}`;
          ctx.fillStyle = COLORS.textDim;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(band.label, x + barW / 2, padY + barAreaH + 4 * dpr);
        }
      } else {
        // Idle state — draw empty tracks
        for (let i = 0; i < n; i++) {
          const band = bands[i];
          const x = padX + i * (barW + gap);
          ctx.fillStyle = COLORS.levelTrack;
          ctx.fillRect(x, padY, barW, barAreaH);
          ctx.font = `${8 * dpr}px ${FONTS.mono}`;
          ctx.fillStyle = COLORS.textDim;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(band.label, x + barW / 2, padY + barAreaH + 4 * dpr);
        }
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
  ctx.fillText('FREQ BANDS', W - 8 * dpr, 6 * dpr);
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

// Export type for external use
export type { FrequencyBand };
