// ============================================================
// LoudnessHistoryPanel — rolling short-term RMS history.
// Newest data at right, sub-frame interpolation for smooth
// 60fps scroll from 20fps analysis data. Matches spectrogram
// scroll speed at CANVAS.timelineScrollPx × scrollSpeed.value.
// ============================================================

import { useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useScrollSpeed, useTheaterMode } from '../core/session';
import { COLORS, FONTS, SPACING, CANVAS } from '../theme';
import type { AudioFrame } from '../types';

const PANEL_DPR_MAX = 1.5;
const HISTORY_MAX = 1200;
const BASE_PX_PER_FRAME = CANVAS.timelineScrollPx;
const PAD_V_PX = 8;
const DB_MIN = -54;
const DB_MAX = 0;
const MS_PER_DATA_FRAME = 1000 / 20; // 20 FPS analysis rate
const NGE_TRACE = '#a0d840';
const NGE_LABEL = 'rgba(140,210,40,0.5)';
const NGE_TEXT = 'rgba(140,210,40,0.72)';
const HYPER_TRACE = CANVAS.hyper.trace;
const HYPER_LABEL = CANVAS.hyper.label;
const HYPER_TEXT = CANVAS.hyper.text;

const REF_LINES: [number, string][] = [[-6, '-6'], [-18, '-18'], [-36, '-36']];

function rmsToDb(rms: number): number {
  return rms > 0 ? Math.max(DB_MIN, 20 * Math.log10(rms)) : DB_MIN;
}

function dbToY(db: number, H: number, padV: number): number {
  const t = (db - DB_MAX) / (DB_MIN - DB_MAX);
  return padV + (H - padV * 2) * t;
}

export function LoudnessHistoryPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const scrollSpeed = useScrollSpeed();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);
  const currentRef = useRef<AudioFrame | null>(null);
  const lastFileIdRef = useRef(-1);
  const rafRef = useRef<number | null>(null);
  const lastDataTimeRef = useRef(0);

  useEffect(() => frameBus.subscribe((frame) => {
    if (frame.fileId !== lastFileIdRef.current) {
      lastFileIdRef.current = frame.fileId;
      historyRef.current = [];
    }
    const rms = Math.max(frame.rmsLeft, frame.rmsRight);
    historyRef.current.push(rmsToDb(rms));
    if (historyRef.current.length > HISTORY_MAX) historyRef.current.shift();
    currentRef.current = frame;
    lastDataTimeRef.current = performance.now();
  }), [frameBus]);

  useEffect(() => audioEngine.onReset(() => {
    historyRef.current = [];
    currentRef.current = null;
    lastFileIdRef.current = -1;
    lastDataTimeRef.current = performance.now();
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
    if (!canvas || theaterMode) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.nge;
      const hyper = displayMode.hyper;
      const padV = PAD_V_PX * dpr;
      const baseY = H - padV;
      const traceColor = nge ? NGE_TRACE : hyper ? HYPER_TRACE : COLORS.waveform;
      const labelColor = nge ? NGE_LABEL : hyper ? HYPER_LABEL : COLORS.textDim;
      const textColor = nge ? NGE_TEXT : hyper ? HYPER_TEXT : COLORS.textSecondary;

      ctx.fillStyle = hyper ? CANVAS.hyper.bg2 : COLORS.bg1;
      ctx.fillRect(0, 0, W, H);

      // Top border
      ctx.fillStyle = hyper ? 'rgba(32,52,110,0.92)' : COLORS.border;
      ctx.fillRect(0, 0, W, 1);

      // Reference lines — labels on right
      ctx.setLineDash([3 * dpr, 4 * dpr]);
      for (const [db, label] of REF_LINES) {
        const y = Math.round(dbToY(db, H, padV)) + 0.5;
        ctx.strokeStyle = db === -6
          ? (hyper ? 'rgba(88,124,255,0.72)' : 'rgba(50,50,72,1)')
          : (hyper ? 'rgba(28,42,88,0.92)' : 'rgba(32,32,48,1)');
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.font = `${6.5 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = hyper ? HYPER_LABEL : 'rgba(80,80,110,1)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, W - SPACING.xs * dpr, y - 1 * dpr);
      }
      ctx.setLineDash([]);

      // Sub-frame interpolation: continuously scroll left between data frames
      const pxPerFrame = BASE_PX_PER_FRAME * scrollSpeed.value * dpr;
      const elapsed = performance.now() - lastDataTimeRef.current;
      const subProg = Math.min(1, elapsed / MS_PER_DATA_FRAME);
      const subOffset = -subProg * pxPerFrame;

      // History — newest at right, scrolling left smoothly
      const history = historyRef.current;

      if (history.length > 1) {
        // Collect visible points
        const points: [number, number][] = [];
        for (let i = 0; i < history.length; i++) {
          const x = W - (history.length - 1 - i) * pxPerFrame + subOffset;
          if (x < -pxPerFrame) continue;
          if (x > W + pxPerFrame) continue;
          const y = dbToY(history[i], H, padV);
          points.push([Math.max(0, Math.min(W, x)), y]);
        }

        if (points.length > 1) {
          // Filled area under curve
          ctx.beginPath();
          ctx.moveTo(points[0][0], baseY);
          for (const [x, y] of points) ctx.lineTo(x, y);
          ctx.lineTo(points[points.length - 1][0], baseY);
          ctx.closePath();
          const fillGrad = ctx.createLinearGradient(0, padV, 0, H);
          fillGrad.addColorStop(0, nge ? 'rgba(160,216,64,0.24)' : hyper ? 'rgba(98,232,255,0.24)' : 'rgba(200,146,42,0.28)');
          fillGrad.addColorStop(1, nge ? 'rgba(96,192,32,0.04)' : hyper ? 'rgba(255,92,188,0.06)' : 'rgba(200,146,42,0.04)');
          ctx.fillStyle = fillGrad;
          ctx.fill();

          // Line on top
          ctx.beginPath();
          ctx.moveTo(points[0][0], points[0][1]);
          for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
          ctx.strokeStyle = nge ? 'rgba(160,216,64,0.78)' : hyper ? 'rgba(98,232,255,0.84)' : 'rgba(200,146,42,0.75)';
          ctx.lineWidth = 1.5 * dpr;
          ctx.lineJoin = 'round';
          ctx.stroke();

          // Head dot
          const last = points[points.length - 1];
          ctx.beginPath();
          ctx.arc(last[0], last[1], 2.5 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = traceColor;
          ctx.fill();
        }
      } else if (history.length === 0) {
        // Empty state: flat dim line
        const y = Math.round(dbToY(-40, H, padV)) + 0.5;
        ctx.strokeStyle = hyper ? 'rgba(24,34,70,1)' : COLORS.bg3;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Current level readout
      const db = history.length > 0 ? history[history.length - 1] : DB_MIN;
      const hasSignal = db > DB_MIN + 2;
      if (hasSignal) {
        const col = db > -6 ? COLORS.statusErr : db > -18 ? traceColor : textColor;
        ctx.font = `${10 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = col;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${db.toFixed(1)} dB`, SPACING.sm * dpr, SPACING.xs * dpr);
      }

      // Panel label
      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('RMS LEVEL', SPACING.sm * dpr, H - SPACING.xs * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [displayMode, scrollSpeed, theaterMode]);

  return (
    <div style={panelStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: COLORS.bg1,
  overflow: 'hidden',
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};





