// ============================================================
// Frequency Bands Panel — bottom-left quadrant (lower half)
// Aggregates FFT bins into coarse bands. Bar display with Hz labels.
// ============================================================

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useTheaterMode } from '../core/session';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import { shouldSkipFrame } from '../utils/rafGuard';
import type { AudioFrame, FrequencyBand } from '../types';
import type { VisualMode } from '../audio/displayMode';

const PANEL_DPR_MAX = 1.25;

// sub → body → wood → bow → air → shimmer (low register to high)
const BAND_COLORS_DEFAULT = CANVAS.bandColors;
const BAND_COLORS_NGE = ['#0d2a0a', '#0f4a0e', '#1a6a18', '#2a8a20', '#50aa20', '#80d028'] as const;
const BAND_COLORS_HYPER = ['#0c1460', '#0a2272', '#0a3888', '#0c529a', '#1068a8', '#1888b8'] as const;

function getBandColors(mode: VisualMode): readonly string[] {
  if (mode === 'nge') return BAND_COLORS_NGE;
  if (mode === 'hyper') return BAND_COLORS_HYPER;
  return BAND_COLORS_DEFAULT;
}

interface BandsColors {
  bg: string;
  track: string;
  label: string;
}

function buildBandsColors(mode: VisualMode): BandsColors {
  if (mode === 'nge') return { bg: CANVAS.nge.bg2, track: '#030a03', label: 'rgba(80,160,50,0.5)' };
  if (mode === 'hyper') return { bg: CANVAS.hyper.bg2, track: '#030918', label: 'rgba(84,132,255,0.5)' };
  return { bg: COLORS.bg2, track: COLORS.levelTrack, label: COLORS.textDim };
}

export function FrequencyBandsPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const theaterMode = useTheaterMode();
  const displayMode = useDisplayMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedRef = useRef<number[]>(CANVAS.frequencyBands.map(() => 0));
  const currentColors = buildBandsColors(displayMode.mode);
  const currentBandColors = getBandColors(displayMode.mode);
  const colorsRef = useRef(currentColors);
  const bandColorsRef = useRef(currentBandColors);
  useLayoutEffect(() => {
    colorsRef.current = currentColors;
    bandColorsRef.current = currentBandColors;
  });

  useEffect(() => {
    const unsub = frameBus.subscribe((f) => { frameRef.current = f; });
    return unsub;
  }, [frameBus]);

  useEffect(() => {
    return audioEngine.onReset(() => {
      frameRef.current = null;
      smoothedRef.current = CANVAS.frequencyBands.map(() => 0);
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
      if (shouldSkipFrame()) return;
      const frame = frameRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const padX = SPACING.panelPad * dpr;
      const padY = SPACING.panelPad * dpr;
      const labelH = 16 * dpr;
      const barAreaH = H - padY * 2 - labelH;

      const c = colorsRef.current;
      const bandColors = bandColorsRef.current;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = c.bg;
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
          ctx.fillStyle = c.track;
          ctx.fillRect(x, padY, barW, barAreaH);

          // Bar fill — base color by frequency register, brightness by level
          const level = smoothed[i];
          const baseColor = bandColors[i] ?? '#404040';
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
          ctx.fillStyle = c.label;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(band.label, x + barW / 2, padY + barAreaH + 4 * dpr);
        }
      } else {
        // Idle state — draw empty tracks
        for (let i = 0; i < n; i++) {
          const band = bands[i];
          const x = padX + i * (barW + gap);
          ctx.fillStyle = c.track;
          ctx.fillRect(x, padY, barW, barAreaH);
          ctx.font = `${8 * dpr}px ${FONTS.mono}`;
          ctx.fillStyle = c.label;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(band.label, x + barW / 2, padY + barAreaH + 4 * dpr);
        }
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
  ctx.fillText('FREQ BANDS', W - 8 * dpr, 6 * dpr);
}

const panelStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  overflow: 'hidden',
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};

// Export type for external use
export type { FrequencyBand };
