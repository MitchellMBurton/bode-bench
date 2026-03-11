// ============================================================
// Spectrogram Panel — bottom-right quadrant
// Scrolling frequency-vs-time display with L/R channel split.
// Top half = left channel, bottom half = right channel.
// Fine frequency grid overlaid on both halves.
// ============================================================

import { useEffect, useRef } from 'react';
import { frameBus } from '../audio/frameBus';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import { spectroColor } from '../utils/canvas';
import type { AudioFrame } from '../types';

const FREQ_AXIS_W = CANVAS.spectroFreqAxisWidth;
const PAD_Y = SPACING.panelPad;
const SCROLL_PX = CANVAS.timelineScrollPx;  // synced with WaveformScrollPanel
const DIVIDER_H = 3; // px between L and R halves (device pixels)
const CHAN_LABEL_W = 14; // px reserved for L / R channel label

// Frequencies where horizontal grid lines are drawn
const GRID_HZ = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
// Frequencies where axis labels are printed
const AXIS_HZ = [50, 100, 200, 500, '1k', '2k', '5k', '10k', '20k'] as const;
const AXIS_HZ_VALUES = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

function hzToT(hz: number): number {
  // log scale: 20 Hz → 0, 20 kHz → 1
  return Math.log10(hz / 20) / Math.log10(1000);
}

export function SpectrogramPanel(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offLRef = useRef<HTMLCanvasElement | null>(null);
  const offRRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const dimRef = useRef({ W: 0, H: 0, axisW: 0, spectroW: 0, halfH: 0, padY: 0 });
  const lastFileIdRef = useRef(-1);
  const lastFrameRef = useRef<AudioFrame | null>(null);

  useEffect(() => {
    const unsub = frameBus.subscribe((f) => { frameRef.current = f; });
    return unsub;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = devicePixelRatio;
        const W = Math.round(width * dpr);
        const H = Math.round(height * dpr);
        canvas.width = W;
        canvas.height = H;

        const axisW = Math.round(FREQ_AXIS_W * dpr);
        const spectroW = W - axisW - Math.round(CHAN_LABEL_W * dpr);
        const padY = Math.round(PAD_Y * dpr);
        const divH = Math.round(DIVIDER_H * dpr);
        const totalSpectroH = H - padY * 2 - divH;
        const halfH = Math.floor(totalSpectroH / 2);

        dimRef.current = { W, H, axisW, spectroW, halfH, padY };

        // Recreate offscreen buffers (history clears on resize — acceptable)
        const makeOff = (w: number, h: number) => {
          const off = document.createElement('canvas');
          off.width = w;
          off.height = h;
          const ctx = off.getContext('2d');
          if (ctx) { ctx.fillStyle = COLORS.bg2; ctx.fillRect(0, 0, w, h); }
          return off;
        };
        offLRef.current = makeOff(spectroW, halfH);
        offRRef.current = makeOff(spectroW, halfH);
      }
    });
    ro.observe(canvas);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const frame = frameRef.current;
      const ctx = canvas.getContext('2d');
      const offL = offLRef.current;
      const offR = offRRef.current;
      if (!ctx || !offL || !offR) return;

      const { W, H, axisW, spectroW, halfH, padY } = dimRef.current;
      if (W === 0 || H === 0 || spectroW <= 0 || halfH <= 0) return;

      const dpr = devicePixelRatio;
      const divH = Math.round(DIVIDER_H * dpr);
      const chanLabelW = Math.round(CHAN_LABEL_W * dpr);
      const spectroX = axisW + chanLabelW;

      const offLCtx = offL.getContext('2d');
      const offRCtx = offR.getContext('2d');
      if (!offLCtx || !offRCtx) return;

      // Clear history only when a new file is loaded
      if (frame && frame.fileId !== lastFileIdRef.current) {
        lastFileIdRef.current = frame.fileId;
        offLCtx.fillStyle = COLORS.bg2;
        offLCtx.fillRect(0, 0, offL.width, offL.height);
        offRCtx.fillStyle = COLORS.bg2;
        offRCtx.fillRect(0, 0, offR.width, offR.height);
      }

      // Only scroll and append when a genuinely new frame arrived (freeze on pause)
      const isNewFrame = frame !== null && frame !== lastFrameRef.current;
      lastFrameRef.current = frame;

      if (isNewFrame && frame) {
        // Scroll both offscreen buffers left — rate synced with WaveformScrollPanel
        offLCtx.drawImage(offL, -SCROLL_PX, 0);
        offLCtx.fillStyle = COLORS.bg2;
        offLCtx.fillRect(spectroW - SCROLL_PX, 0, SCROLL_PX, halfH);

        offRCtx.drawImage(offR, -SCROLL_PX, 0);
        offRCtx.fillStyle = COLORS.bg2;
        offRCtx.fillRect(spectroW - SCROLL_PX, 0, SCROLL_PX, halfH);

        // Write new rightmost column for L and R
        const freqL = frame.frequencyDb;
        const freqR = frame.frequencyDbRight;
        const binCount = freqL.length;
        const sampleRate = frame.sampleRate;

        for (let y = 0; y < halfH; y++) {
          const t = 1 - y / halfH;
          const hz = 20 * Math.pow(1000, t);
          const bin = Math.min(
            Math.round((hz * frame.fftBinCount * 2) / sampleRate),
            binCount - 1,
          );

          offLCtx.fillStyle = spectroColor(freqL[Math.max(0, bin)]);
          offLCtx.fillRect(spectroW - SCROLL_PX, y, SCROLL_PX, 1);

          offRCtx.fillStyle = spectroColor(freqR[Math.max(0, bin)]);
          offRCtx.fillRect(spectroW - SCROLL_PX, y, SCROLL_PX, 1);
        }
      }

      // ---- Composite to main canvas ----
      ctx.fillStyle = COLORS.bg2;
      ctx.fillRect(0, 0, W, H);

      // Blit L half
      const yL = padY;
      ctx.drawImage(offL, spectroX, yL);

      // Divider
      const yDiv = padY + halfH;
      ctx.fillStyle = COLORS.bg0;
      ctx.fillRect(spectroX, yDiv, spectroW, divH);

      // Blit R half
      const yR = yDiv + divH;
      ctx.drawImage(offR, spectroX, yR);

      // ---- Cell grid mesh (drawn over spectro data) ----
      // Dark separator lines at regular pixel intervals create the mosaic texture.
      const cellPx = Math.round(8 * dpr);
      const gridColor = 'rgba(0,0,0,0.45)';

      ctx.fillStyle = gridColor;
      // Horizontal cell lines across both halves
      for (let gy = yL; gy < yR + halfH; gy += cellPx) {
        ctx.fillRect(spectroX, gy, spectroW, 1);
      }
      // Vertical time cell lines
      for (let gx = spectroX; gx < spectroX + spectroW; gx += cellPx) {
        ctx.fillRect(gx, yL, 1, halfH * 2 + divH);
      }

      // Prominent frequency reference lines at musical boundaries (brighter)
      for (const hz of GRID_HZ) {
        const t = hzToT(hz);
        const yGridL = yL + halfH - t * halfH;
        const yGridR = yR + halfH - t * halfH;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(spectroX, yGridL, spectroW, 1);
        ctx.fillRect(spectroX, yGridR, spectroW, 1);
      }

      // ---- Freq axis ----
      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < AXIS_HZ_VALUES.length; i++) {
        const hz = AXIS_HZ_VALUES[i];
        const label = String(AXIS_HZ[i]);
        const t = hzToT(hz);

        const yTickL = yL + halfH - t * halfH;
        const yTickR = yR + halfH - t * halfH;

        // Tick marks
        ctx.strokeStyle = COLORS.border;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(axisW - 3 * dpr, yTickL);
        ctx.lineTo(axisW, yTickL);
        ctx.stroke();

        ctx.fillStyle = COLORS.textDim;
        ctx.fillText(label, axisW - 4 * dpr, yTickL);

        // R half ticks (no duplicate labels — just ticks)
        ctx.strokeStyle = COLORS.border;
        ctx.beginPath();
        ctx.moveTo(axisW - 3 * dpr, yTickR);
        ctx.lineTo(axisW, yTickR);
        ctx.stroke();
      }

      // ---- Channel labels ----
      ctx.save();
      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const midXLabel = axisW + chanLabelW / 2;
      ctx.fillText('L', midXLabel, yL + halfH / 2);
      ctx.fillText('R', midXLabel, yR + halfH / 2);
      ctx.restore();

      // ---- Panel label ----
      ctx.font = `${9 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('SPECTROGRAM', W - 8 * dpr, 6 * dpr);
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
