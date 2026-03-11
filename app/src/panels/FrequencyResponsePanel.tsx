import { useEffect, useRef } from 'react';
import { frameBus } from '../audio/frameBus';
import { audioEngine } from '../audio/engine';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import { freqToX } from '../utils/canvas';
import type { AudioFrame } from '../types';

const PAD = SPACING.panelPad;
const MIN_HZ = 20;
const MAX_HZ = 20000;
const FREQ_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const REL_TICKS = [0, -12, -24, -36, -48];
const CURVE_SMOOTHING = 0.22;
const DISPLAY_DB_SPAN = 54;
const BANDWIDTH_OCTAVES = 1 / 6;
const PANEL_DPR_MAX = 1.25;

function formatFreqLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

function hzAtFraction(fraction: number): number {
  return MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, fraction);
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ensureCurveBuffer(buffer: Float32Array | null, pointCount: number): Float32Array {
  if (buffer && buffer.length === pointCount) return buffer;
  const next = new Float32Array(pointCount);
  next.fill(CANVAS.dbMin);
  return next;
}

function bandAverageDb(
  data: Float32Array,
  centerHz: number,
  sampleRate: number,
  fftBinCount: number,
): number {
  const halfWindow = BANDWIDTH_OCTAVES / 2;
  const lowHz = Math.max(MIN_HZ, centerHz / Math.pow(2, halfWindow));
  const highHz = Math.min(MAX_HZ, centerHz * Math.pow(2, halfWindow));
  const lowBin = Math.max(0, Math.floor((lowHz * fftBinCount * 2) / sampleRate));
  const highBin = Math.min(data.length - 1, Math.ceil((highHz * fftBinCount * 2) / sampleRate));

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

function sampleCurve(
  frame: AudioFrame,
  targetLeft: Float32Array,
  targetRight: Float32Array,
): void {
  const pointCount = targetLeft.length;

  for (let i = 0; i < pointCount; i++) {
    const hz = hzAtFraction(i / (pointCount - 1));
    targetLeft[i] = bandAverageDb(frame.frequencyDb, hz, frame.sampleRate, frame.fftBinCount);
    targetRight[i] = bandAverageDb(frame.frequencyDbRight, hz, frame.sampleRate, frame.fftBinCount);
  }
}

function dbToPanelY(db: number, topDb: number, bottomDb: number, topY: number, height: number): number {
  const fraction = Math.max(0, Math.min(1, (db - bottomDb) / (topDb - bottomDb)));
  return topY + height * (1 - fraction);
}

export function FrequencyResponsePanel(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothLeftRef = useRef<Float32Array | null>(null);
  const smoothRightRef = useRef<Float32Array | null>(null);
  const targetLeftRef = useRef<Float32Array | null>(null);
  const targetRightRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    return frameBus.subscribe((frame) => {
      frameRef.current = frame;
    });
  }, []);

  useEffect(() => {
    return audioEngine.onReset(() => {
      frameRef.current = null;
      smoothLeftRef.current = null;
      smoothRightRef.current = null;
      targetLeftRef.current = null;
      targetRightRef.current = null;
    });
  }, []);

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

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const frame = frameRef.current;
      const width = canvas.width;
      const height = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const padX = PAD * dpr;
      const padY = PAD * dpr;
      const axisH = 16 * dpr;
      const drawW = Math.max(1, width - padX * 2);
      const drawH = Math.max(1, height - padY * 2 - axisH);
      const pointCount = Math.max(112, Math.floor(drawW / Math.max(2, 3 * dpr)));

      const didResizeCurve =
        smoothLeftRef.current === null ||
        smoothLeftRef.current.length !== pointCount ||
        smoothRightRef.current === null ||
        smoothRightRef.current.length !== pointCount;

      const smoothLeft = ensureCurveBuffer(smoothLeftRef.current, pointCount);
      const smoothRight = ensureCurveBuffer(smoothRightRef.current, pointCount);
      const targetLeft = ensureCurveBuffer(targetLeftRef.current, pointCount);
      const targetRight = ensureCurveBuffer(targetRightRef.current, pointCount);
      smoothLeftRef.current = smoothLeft;
      smoothRightRef.current = smoothRight;
      targetLeftRef.current = targetLeft;
      targetRightRef.current = targetRight;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = COLORS.bg2;
      ctx.fillRect(0, 0, width, height);

      const backdrop = ctx.createLinearGradient(0, padY, 0, padY + drawH);
      backdrop.addColorStop(0, 'rgba(7, 8, 14, 0.98)');
      backdrop.addColorStop(0.6, 'rgba(10, 12, 22, 0.94)');
      backdrop.addColorStop(1, 'rgba(15, 10, 6, 0.96)');
      ctx.fillStyle = backdrop;
      ctx.fillRect(padX, padY, drawW, drawH);

      for (let i = 0; i < CANVAS.frequencyBands.length; i++) {
        const band = CANVAS.frequencyBands[i];
        const bandX = padX + freqToX(band.lowHz, drawW, MIN_HZ, MAX_HZ);
        const bandEnd = padX + freqToX(band.highHz, drawW, MIN_HZ, MAX_HZ);
        const gradient = ctx.createLinearGradient(bandX, padY, bandEnd, padY + drawH);
        gradient.addColorStop(0, hexToRgba(CANVAS.bandColors[i] ?? COLORS.waveform, 0.03));
        gradient.addColorStop(0.45, hexToRgba(CANVAS.bandColors[i] ?? COLORS.waveform, 0.11));
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(bandX, padY, bandEnd - bandX, drawH);
      }

      if (frame) {
        sampleCurve(frame, targetLeft, targetRight);
        if (didResizeCurve) {
          smoothLeft.set(targetLeft);
          smoothRight.set(targetRight);
        } else {
          for (let i = 0; i < pointCount; i++) {
            smoothLeft[i] = smoothLeft[i] * (1 - CURVE_SMOOTHING) + targetLeft[i] * CURVE_SMOOTHING;
            smoothRight[i] = smoothRight[i] * (1 - CURVE_SMOOTHING) + targetRight[i] * CURVE_SMOOTHING;
          }
        }
      }

      const averageDb = new Float32Array(pointCount);
      let hottestIndex = 0;
      let hottestDb: number = CANVAS.dbMin;

      for (let i = 0; i < pointCount; i++) {
        averageDb[i] = (smoothLeft[i] + smoothRight[i]) / 2;
        if (averageDb[i] > hottestDb) {
          hottestDb = averageDb[i];
          hottestIndex = i;
        }
      }

      const topDb = Math.min(0, hottestDb + 6);
      const bottomDb = topDb - DISPLAY_DB_SPAN;
      const averageY = new Float32Array(pointCount);
      const leftY = new Float32Array(pointCount);
      const rightY = new Float32Array(pointCount);

      for (let i = 0; i < pointCount; i++) {
        averageY[i] = dbToPanelY(averageDb[i], topDb, bottomDb, padY, drawH);
        leftY[i] = dbToPanelY(smoothLeft[i], topDb, bottomDb, padY, drawH);
        rightY[i] = dbToPanelY(smoothRight[i], topDb, bottomDb, padY, drawH);
      }

      for (const relTick of REL_TICKS) {
        const tickDb = topDb + relTick;
        const y = dbToPanelY(tickDb, topDb, bottomDb, padY, drawH);
        ctx.strokeStyle = relTick === 0 ? COLORS.borderActive : COLORS.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padX, y + 0.5);
        ctx.lineTo(padX + drawW, y + 0.5);
        ctx.stroke();

        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = COLORS.textDim;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${relTick}`, padX + 2 * dpr, y - 2 * dpr);
      }

      for (const tick of FREQ_TICKS) {
        const x = padX + freqToX(tick, drawW, MIN_HZ, MAX_HZ);
        ctx.strokeStyle = COLORS.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, padY);
        ctx.lineTo(x + 0.5, padY + drawH);
        ctx.stroke();

        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = COLORS.textDim;
        ctx.textAlign = tick === MIN_HZ ? 'left' : tick === MAX_HZ ? 'right' : 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(formatFreqLabel(tick), x, padY + drawH + 4 * dpr);
      }

      const ribbonGradient = ctx.createLinearGradient(padX, padY, padX, padY + drawH);
      ribbonGradient.addColorStop(0, 'rgba(80, 96, 192, 0.18)');
      ribbonGradient.addColorStop(1, 'rgba(200, 146, 42, 0.16)');
      ctx.beginPath();
      for (let i = 0; i < pointCount; i++) {
        const x = padX + (i / (pointCount - 1)) * drawW;
        if (i === 0) ctx.moveTo(x, leftY[i]);
        else ctx.lineTo(x, leftY[i]);
      }
      for (let i = pointCount - 1; i >= 0; i--) {
        const x = padX + (i / (pointCount - 1)) * drawW;
        ctx.lineTo(x, rightY[i]);
      }
      ctx.closePath();
      ctx.fillStyle = ribbonGradient;
      ctx.fill();

      const fillGradient = ctx.createLinearGradient(padX, padY, padX, padY + drawH);
      fillGradient.addColorStop(0, 'rgba(232, 176, 40, 0.42)');
      fillGradient.addColorStop(0.55, 'rgba(200, 146, 42, 0.14)');
      fillGradient.addColorStop(1, 'rgba(200, 146, 42, 0.03)');
      ctx.beginPath();
      ctx.moveTo(padX, padY + drawH);
      for (let i = 0; i < pointCount; i++) {
        const x = padX + (i / (pointCount - 1)) * drawW;
        ctx.lineTo(x, averageY[i]);
      }
      ctx.lineTo(padX + drawW, padY + drawH);
      ctx.closePath();
      ctx.fillStyle = fillGradient;
      ctx.fill();

      ctx.save();
      ctx.strokeStyle = 'rgba(232, 176, 40, 0.72)';
      ctx.lineWidth = 3 * dpr;
      ctx.shadowBlur = 20 * dpr;
      ctx.shadowColor = COLORS.waveformGlow;
      ctx.beginPath();
      for (let i = 0; i < pointCount; i++) {
        const x = padX + (i / (pointCount - 1)) * drawW;
        if (i === 0) ctx.moveTo(x, averageY[i]);
        else ctx.lineTo(x, averageY[i]);
      }
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = COLORS.waveform;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      for (let i = 0; i < pointCount; i++) {
        const x = padX + (i / (pointCount - 1)) * drawW;
        if (i === 0) ctx.moveTo(x, averageY[i]);
        else ctx.lineTo(x, averageY[i]);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(80, 96, 192, 0.65)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      for (let i = 0; i < pointCount; i++) {
        const x = padX + (i / (pointCount - 1)) * drawW;
        if (i === 0) ctx.moveTo(x, rightY[i]);
        else ctx.lineTo(x, rightY[i]);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(232, 176, 40, 0.40)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      for (let i = 0; i < pointCount; i++) {
        const x = padX + (i / (pointCount - 1)) * drawW;
        if (i === 0) ctx.moveTo(x, leftY[i]);
        else ctx.lineTo(x, leftY[i]);
      }
      ctx.stroke();

      if (hottestDb > bottomDb + 8) {
        const hotX = padX + (hottestIndex / (pointCount - 1)) * drawW;
        const hotY = averageY[hottestIndex];
        ctx.save();
        ctx.fillStyle = 'rgba(232, 176, 40, 0.85)';
        ctx.shadowBlur = 18 * dpr;
        ctx.shadowColor = 'rgba(232, 176, 40, 0.8)';
        ctx.beginPath();
        ctx.arc(hotX, hotY, 2.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const hottestHz = hzAtFraction(hottestIndex / Math.max(1, pointCount - 1));
      if (frame) {
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = COLORS.textSecondary;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`CENT ${Math.round(frame.spectralCentroid)} Hz`, padX, padY);
        ctx.fillText(`HOT ${formatFreqLabel(Math.round(hottestHz))} / REF ${Math.round(topDb)} dB`, padX, padY + 10 * dpr);
      }

      ctx.font = `${9 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('FREQ RESPONSE', width - 8 * dpr, 6 * dpr);
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
