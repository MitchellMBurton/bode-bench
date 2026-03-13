import { useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useScrollSpeed } from '../core/session';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import { spectroColor } from '../utils/canvas';
import type { AudioFrame } from '../types';

const FREQ_AXIS_W = CANVAS.spectroFreqAxisWidth;
const PAD_Y = SPACING.panelPad;
const BASE_SCROLL_PX = CANVAS.timelineScrollPx;

// Major frequency grid lines — labeled on the axis
const GRID_HZ =      [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const AXIS_HZ =      [50, 100, 200, 500, '1k', '2k', '5k', '10k', '20k'] as const;
const AXIS_HZ_VALUES = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
// Minor frequency hairlines — unlabeled, drawn dimmer
const MINOR_GRID_HZ = [30, 40, 70, 80, 150, 300, 700, 800, 1500, 3000, 7000, 8000, 15000];
const PANEL_DPR_MAX = 1.5;
const SPECTRO_BG = '#000000'; // pure black — cleaner contrast than bg2 for spectral content
const NGE_BG = '#030a03';
const NGE_LABEL = 'rgba(140,210,40,0.5)';
const NGE_AXIS = '#1a4a10';
const NGE_SPECTRO_PALETTE = ['#030a03', '#0a2a0a', '#1a6010', '#60c020', '#c8f040'] as const;

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

export function SpectrogramPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const displayMode = useDisplayMode();
  const audioEngine = useAudioEngine();
  const scrollSpeed = useScrollSpeed();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offLRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const dimRef = useRef({ W: 0, H: 0, axisW: 0, spectroW: 0, spectroH: 0, padY: 0 });
  const lastFileIdRef = useRef(-1);
  const lastFrameRef = useRef<AudioFrame | null>(null);
  const scrollCarryRef = useRef(0);
  const lastNgeRef = useRef(displayMode.nge);

  useEffect(() => {
    return frameBus.subscribe((frame) => {
      frameRef.current = frame;
    });
  }, [frameBus]);

  useEffect(() => {
    return audioEngine.onReset(() => {
      frameRef.current = null;
      lastFrameRef.current = null;
      scrollCarryRef.current = 0;
      const offL = offLRef.current;
      if (offL) {
        const ctx = offL.getContext('2d');
        if (ctx) {
          ctx.fillStyle = displayMode.nge ? NGE_BG : SPECTRO_BG;
          ctx.fillRect(0, 0, offL.width, offL.height);
        }
      }
    });
  }, [audioEngine, displayMode]);

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
        const spectroW = W - axisW;
        const padY = Math.round(PAD_Y * dpr);
        const spectroH = H - padY * 2;

        dimRef.current = { W, H, axisW, spectroW, spectroH, padY };

        // Snapshot old spectro content before replacing the offscreen canvas
        const prevOff = offLRef.current;
        let snapshot: HTMLCanvasElement | null = null;
        if (prevOff && prevOff.width > 0 && prevOff.height > 0) {
          snapshot = document.createElement('canvas');
          snapshot.width = prevOff.width;
          snapshot.height = prevOff.height;
          snapshot.getContext('2d')?.drawImage(prevOff, 0, 0);
        }

        const makeOff = (w: number, h: number) => {
          const off = document.createElement('canvas');
          off.width = w;
          off.height = h;
          const ctx = off.getContext('2d');
          if (ctx) {
            ctx.fillStyle = displayMode.nge ? NGE_BG : SPECTRO_BG;
            ctx.fillRect(0, 0, w, h);
            if (snapshot) {
              ctx.drawImage(snapshot, w - snapshot.width, Math.round((h - snapshot.height) / 2));
            }
          }
          return off;
        };

        offLRef.current = makeOff(spectroW, spectroH);
        scrollCarryRef.current = 0;
      }
    });
    ro.observe(canvas);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const frame = frameRef.current;
      const ctx = canvas.getContext('2d');
      const offL = offLRef.current;
      if (!ctx || !offL) return;

      const { W, H, axisW, spectroW, spectroH, padY } = dimRef.current;
      if (W === 0 || H === 0 || spectroW <= 0 || spectroH <= 0) return;

      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.nge;
      const spectroX = axisW;
      const backgroundFill = nge ? NGE_BG : SPECTRO_BG;
      const axisColor = nge ? NGE_AXIS : COLORS.border;
      const labelColor = nge ? NGE_LABEL : COLORS.textDim;

      const offLCtx = offL.getContext('2d');
      if (!offLCtx) return;

      if (nge !== lastNgeRef.current) {
        // Clear on palette switch rather than remap: the NGE spectro palette shares its
        // darkest color (#030a03) with the background, making pixel-level remapping
        // unreliable — low-energy spectral content is indistinguishable from background
        // and would be converted to the wrong color. A clean slate is the correct result.
        lastNgeRef.current = nge;
        offLCtx.fillStyle = backgroundFill;
        offLCtx.fillRect(0, 0, offL.width, offL.height);
      }

      if (frame && frame.fileId !== lastFileIdRef.current) {
        lastFileIdRef.current = frame.fileId;
        scrollCarryRef.current = 0;
        offLCtx.fillStyle = backgroundFill;
        offLCtx.fillRect(0, 0, offL.width, offL.height);
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
          offLCtx.fillRect(spectroW - scrollPx, 0, scrollPx, spectroH);

          // Average L+R channels for a mono summary
          const freqL = frame.frequencyDb;
          const freqR = frame.frequencyDbRight;
          const sampleRate = frame.sampleRate;

          for (let y = 0; y < spectroH; y++) {
            const topT = 1 - y / spectroH;
            const bottomT = 1 - (y + 1) / spectroH;
            const highHz = 20 * Math.pow(1000, topT);
            const lowHz = 20 * Math.pow(1000, Math.max(0, bottomT));
            const avgL = bandAverageDb(freqL, lowHz, highHz, sampleRate);
            const avgR = bandAverageDb(freqR, lowHz, highHz, sampleRate);
            // Average L+R in linear domain then back to dB for mono mix
            const linL = Math.pow(10, avgL / 20);
            const linR = Math.pow(10, avgR / 20);
            const mono = 20 * Math.log10((linL + linR) / 2);

            offLCtx.fillStyle = spectroColorForMode(mono, nge);
            offLCtx.fillRect(spectroW - scrollPx, y, scrollPx, 1);
          }
        }
      }

      ctx.fillStyle = backgroundFill;
      ctx.fillRect(0, 0, W, H);

      ctx.drawImage(offL, spectroX, padY);

      // Vertical time-grid (subtle dark columns)
      const cellPx = Math.round(8 * dpr);
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      for (let gx = spectroX; gx < spectroX + spectroW; gx += cellPx) {
        ctx.fillRect(gx, padY, 1, spectroH);
      }

      // Minor frequency hairlines
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      for (const hz of MINOR_GRID_HZ) {
        const t = hzToT(hz);
        ctx.fillRect(spectroX, padY + spectroH - t * spectroH, spectroW, 1);
      }

      // Major frequency lines
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      for (const hz of GRID_HZ) {
        const t = hzToT(hz);
        ctx.fillRect(spectroX, padY + spectroH - t * spectroH, spectroW, 1);
      }

      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < AXIS_HZ_VALUES.length; i++) {
        const hz = AXIS_HZ_VALUES[i];
        const label = String(AXIS_HZ[i]);
        const t = hzToT(hz);
        const yTick = padY + spectroH - t * spectroH;

        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(axisW - 3 * dpr, yTick);
        ctx.lineTo(axisW, yTick);
        ctx.stroke();
        ctx.fillText(label, axisW - 4 * dpr, yTick);
      }

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
  }, [audioEngine, displayMode, scrollSpeed]);

  return (
    <div style={panelStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: SPECTRO_BG,
  overflow: 'hidden',
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};
