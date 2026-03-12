import { useEffect, useRef } from 'react';
import { frameBus } from '../audio/frameBus';
import { displayMode } from '../audio/displayMode';
import { audioEngine } from '../audio/engine';
import { scrollSpeed } from '../audio/scrollSpeed';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import { spectroColor } from '../utils/canvas';
import type { AudioFrame } from '../types';

const FREQ_AXIS_W = CANVAS.spectroFreqAxisWidth;
const PAD_Y = SPACING.panelPad;
const BASE_SCROLL_PX = CANVAS.timelineScrollPx;
const DIVIDER_H = 3;
const CHAN_LABEL_W = 14;
// Major frequency grid lines — labeled on the axis
const GRID_HZ =      [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const AXIS_HZ =      [50, 100, 200, 500, '1k', '2k', '5k', '10k', '20k'] as const;
const AXIS_HZ_VALUES = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
// Minor frequency hairlines — unlabeled, drawn dimmer
const MINOR_GRID_HZ = [30, 40, 70, 80, 150, 300, 700, 800, 1500, 3000, 7000, 8000, 15000];
const PANEL_DPR_MAX = 1.5;
const NGE_BG = '#030a03';
const NGE_DIVIDER = '#071107';
const NGE_LABEL = 'rgba(140,210,40,0.5)';
const NGE_AXIS = '#1a4a10';
const NGE_SPECTRO_PALETTE = ['#030a03', '#0a2a0a', '#1a6010', '#60c020', '#c8f040'] as const;
const SPECTRO_SAMPLE_COUNT = 48;
const SPECTRO_BG_RGB = colorToRgb(COLORS.bg2);
const NGE_BG_RGB = colorToRgb(NGE_BG);
const NORMAL_SPECTRO_SAMPLES = buildSpectroSamples(false);
const NGE_SPECTRO_SAMPLES = buildSpectroSamples(true);

function hzToT(hz: number): number {
  return Math.log10(hz / 20) / Math.log10(1000);
}

function bandAverageDb(data: Float32Array, lowHz: number, highHz: number, sampleRate: number): number {
  const lowBin = Math.max(0, Math.floor((lowHz * data.length * 2) / sampleRate));
  const highBin = Math.min(data.length - 1, Math.ceil((highHz * data.length * 2) / sampleRate));
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

function colorToRgb(value: string): [number, number, number] {
  if (value.startsWith('#')) {
    const hex = value.replace('#', '');
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  const match = value.match(/\d+/g);
  if (!match || match.length < 3) return [0, 0, 0];
  return [Number(match[0]), Number(match[1]), Number(match[2])];
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function lerpColor(startHex: string, endHex: string, t: number): string {
  const [sr, sg, sb] = hexToRgb(startHex);
  const [er, eg, eb] = hexToRgb(endHex);
  const lerp = (start: number, end: number): number => Math.round(start + (end - start) * t);
  return `rgb(${lerp(sr, er)},${lerp(sg, eg)},${lerp(sb, eb)})`;
}

function spectroColorForMode(db: number, nge: boolean): string {
  if (!nge) return spectroColor(db);

  const t = Math.max(0, Math.min(1, (db - CANVAS.dbMin) / (CANVAS.dbMax - CANVAS.dbMin)));
  const segmentCount = NGE_SPECTRO_PALETTE.length - 1;
  const scaled = t * segmentCount;
  const index = Math.min(segmentCount - 1, Math.floor(scaled));
  const localT = scaled - index;
  return lerpColor(NGE_SPECTRO_PALETTE[index], NGE_SPECTRO_PALETTE[index + 1], localT);
}

function buildSpectroSamples(nge: boolean): [number, number, number][] {
  return Array.from({ length: SPECTRO_SAMPLE_COUNT }, (_, i) => {
    const t = i / Math.max(1, SPECTRO_SAMPLE_COUNT - 1);
    const db = CANVAS.dbMin + (CANVAS.dbMax - CANVAS.dbMin) * t;
    return colorToRgb(spectroColorForMode(db, nge));
  });
}

function colorDistanceSq(
  r: number,
  g: number,
  b: number,
  target: readonly [number, number, number],
): number {
  const dr = r - target[0];
  const dg = g - target[1];
  const db = b - target[2];
  return dr * dr + dg * dg + db * db;
}

function remapSpectroCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fromBg: readonly [number, number, number],
  toBg: readonly [number, number, number],
  fromSamples: readonly [readonly [number, number, number], ...readonly [number, number, number][]] | readonly [number, number, number][],
  toSamples: readonly [readonly [number, number, number], ...readonly [number, number, number][]] | readonly [number, number, number][],
): void {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (colorDistanceSq(r, g, b, fromBg) <= 144) {
      data[i] = toBg[0];
      data[i + 1] = toBg[1];
      data[i + 2] = toBg[2];
      continue;
    }

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let s = 0; s < fromSamples.length; s++) {
      const dist = colorDistanceSq(r, g, b, fromSamples[s]);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = s;
      }
    }

    data[i] = toSamples[bestIndex][0];
    data[i + 1] = toSamples[bestIndex][1];
    data[i + 2] = toSamples[bestIndex][2];
  }

  ctx.putImageData(image, 0, 0);
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
  const scrollCarryRef = useRef(0);
  const lastNgeRef = useRef(displayMode.nge);

  useEffect(() => {
    return frameBus.subscribe((frame) => {
      frameRef.current = frame;
    });
  }, []);

  useEffect(() => {
    return audioEngine.onReset(() => {
      frameRef.current = null;
      lastFrameRef.current = null;
      scrollCarryRef.current = 0;
      const offL = offLRef.current;
      const offR = offRRef.current;
      if (offL) {
        const ctx = offL.getContext('2d');
        if (ctx) {
          ctx.fillStyle = displayMode.nge ? NGE_BG : COLORS.bg2;
          ctx.fillRect(0, 0, offL.width, offL.height);
        }
      }
      if (offR) {
        const ctx = offR.getContext('2d');
        if (ctx) {
          ctx.fillStyle = displayMode.nge ? NGE_BG : COLORS.bg2;
          ctx.fillRect(0, 0, offR.width, offR.height);
        }
      }
    });
  }, []);

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
        const spectroW = W - axisW - Math.round(CHAN_LABEL_W * dpr);
        const padY = Math.round(PAD_Y * dpr);
        const divH = Math.round(DIVIDER_H * dpr);
        const totalSpectroH = H - padY * 2 - divH;
        const halfH = Math.floor(totalSpectroH / 2);

        dimRef.current = { W, H, axisW, spectroW, halfH, padY };

        const makeOff = (w: number, h: number) => {
          const off = document.createElement('canvas');
          off.width = w;
          off.height = h;
          const ctx = off.getContext('2d');
          if (ctx) {
            ctx.fillStyle = displayMode.nge ? NGE_BG : COLORS.bg2;
            ctx.fillRect(0, 0, w, h);
          }
          return off;
        };

        offLRef.current = makeOff(spectroW, halfH);
        offRRef.current = makeOff(spectroW, halfH);
        scrollCarryRef.current = 0;
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

      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.nge;
      const divH = Math.round(DIVIDER_H * dpr);
      const chanLabelW = Math.round(CHAN_LABEL_W * dpr);
      const spectroX = axisW + chanLabelW;
      const backgroundFill = nge ? NGE_BG : COLORS.bg2;
      const dividerFill = nge ? NGE_DIVIDER : COLORS.bg0;
      const axisColor = nge ? NGE_AXIS : COLORS.border;
      const labelColor = nge ? NGE_LABEL : COLORS.textDim;

      const offLCtx = offL.getContext('2d');
      const offRCtx = offR.getContext('2d');
      if (!offLCtx || !offRCtx) return;

      if (nge !== lastNgeRef.current) {
        remapSpectroCanvas(
          offLCtx,
          offL.width,
          offL.height,
          lastNgeRef.current ? NGE_BG_RGB : SPECTRO_BG_RGB,
          nge ? NGE_BG_RGB : SPECTRO_BG_RGB,
          lastNgeRef.current ? NGE_SPECTRO_SAMPLES : NORMAL_SPECTRO_SAMPLES,
          nge ? NGE_SPECTRO_SAMPLES : NORMAL_SPECTRO_SAMPLES,
        );
        remapSpectroCanvas(
          offRCtx,
          offR.width,
          offR.height,
          lastNgeRef.current ? NGE_BG_RGB : SPECTRO_BG_RGB,
          nge ? NGE_BG_RGB : SPECTRO_BG_RGB,
          lastNgeRef.current ? NGE_SPECTRO_SAMPLES : NORMAL_SPECTRO_SAMPLES,
          nge ? NGE_SPECTRO_SAMPLES : NORMAL_SPECTRO_SAMPLES,
        );
        lastNgeRef.current = nge;
      }

      if (frame && frame.fileId !== lastFileIdRef.current) {
        lastFileIdRef.current = frame.fileId;
        scrollCarryRef.current = 0;
        offLCtx.fillStyle = backgroundFill;
        offLCtx.fillRect(0, 0, offL.width, offL.height);
        offRCtx.fillStyle = backgroundFill;
        offRCtx.fillRect(0, 0, offR.width, offR.height);
      }

      const isNewFrame = frame !== null && frame !== lastFrameRef.current;
      lastFrameRef.current = frame;

      if (isNewFrame && frame) {
        scrollCarryRef.current += BASE_SCROLL_PX * audioEngine.playbackRate * scrollSpeed.value;
        const scrollPx = Math.max(0, Math.floor(scrollCarryRef.current));

        if (scrollPx > 0) {
          scrollCarryRef.current -= scrollPx;

          offLCtx.drawImage(offL, -scrollPx, 0);
          offLCtx.fillStyle = backgroundFill;
          offLCtx.fillRect(spectroW - scrollPx, 0, scrollPx, halfH);

          offRCtx.drawImage(offR, -scrollPx, 0);
          offRCtx.fillStyle = backgroundFill;
          offRCtx.fillRect(spectroW - scrollPx, 0, scrollPx, halfH);

          const freqL = frame.frequencyDb;
          const freqR = frame.frequencyDbRight;
          const sampleRate = frame.sampleRate;

          for (let y = 0; y < halfH; y++) {
            const topT = 1 - y / halfH;
            const bottomT = 1 - (y + 1) / halfH;
            const highHz = 20 * Math.pow(1000, topT);
            const lowHz = 20 * Math.pow(1000, Math.max(0, bottomT));
            const avgL = bandAverageDb(freqL, lowHz, highHz, sampleRate);
            const avgR = bandAverageDb(freqR, lowHz, highHz, sampleRate);

            offLCtx.fillStyle = spectroColorForMode(avgL, nge);
            offLCtx.fillRect(spectroW - scrollPx, y, scrollPx, 1);

            offRCtx.fillStyle = spectroColorForMode(avgR, nge);
            offRCtx.fillRect(spectroW - scrollPx, y, scrollPx, 1);
          }
        }
      }

      ctx.fillStyle = backgroundFill;
      ctx.fillRect(0, 0, W, H);

      const yL = padY;
      ctx.drawImage(offL, spectroX, yL);

      const yDiv = padY + halfH;
      ctx.fillStyle = dividerFill;
      ctx.fillRect(spectroX, yDiv, spectroW, divH);

      const yR = yDiv + divH;
      ctx.drawImage(offR, spectroX, yR);

      // Vertical time-grid (subtle dark columns)
      const cellPx = Math.round(8 * dpr);
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      for (let gx = spectroX; gx < spectroX + spectroW; gx += cellPx) {
        ctx.fillRect(gx, yL, 1, halfH * 2 + divH);
      }

      // Minor frequency hairlines — unlabeled, very dim
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      for (const hz of MINOR_GRID_HZ) {
        const t = hzToT(hz);
        const yGridL = yL + halfH - t * halfH;
        const yGridR = yR + halfH - t * halfH;
        ctx.fillRect(spectroX, yGridL, spectroW, 1);
        ctx.fillRect(spectroX, yGridR, spectroW, 1);
      }

      // Major frequency lines — same as before
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      for (const hz of GRID_HZ) {
        const t = hzToT(hz);
        const yGridL = yL + halfH - t * halfH;
        const yGridR = yR + halfH - t * halfH;
        ctx.fillRect(spectroX, yGridL, spectroW, 1);
        ctx.fillRect(spectroX, yGridR, spectroW, 1);
      }

      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < AXIS_HZ_VALUES.length; i++) {
        const hz = AXIS_HZ_VALUES[i];
        const label = String(AXIS_HZ[i]);
        const t = hzToT(hz);
        const yTickL = yL + halfH - t * halfH;
        const yTickR = yR + halfH - t * halfH;

        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(axisW - 3 * dpr, yTickL);
        ctx.lineTo(axisW, yTickL);
        ctx.stroke();
        ctx.fillText(label, axisW - 4 * dpr, yTickL);

        ctx.beginPath();
        ctx.moveTo(axisW - 3 * dpr, yTickR);
        ctx.lineTo(axisW, yTickR);
        ctx.stroke();
      }

      ctx.save();
      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const midXLabel = axisW + chanLabelW / 2;
      ctx.fillText('L', midXLabel, yL + halfH / 2);
      ctx.fillText('R', midXLabel, yR + halfH / 2);
      ctx.restore();

      ctx.font = `${9 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
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
