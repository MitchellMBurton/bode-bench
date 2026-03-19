import { useCallback, useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useTheaterMode } from '../core/session';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import { formatHz, freqToX, hexToRgba } from '../utils/canvas';
import { shouldSkipFrame } from '../utils/rafGuard';
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
const NGE_TRACE = '#a0d840';
const NGE_TRACE_SOFT = 'rgba(160,216,64,0.78)';
const NGE_TRACE_DIM = 'rgba(112,184,48,0.48)';
const NGE_TRACE_FAINT = 'rgba(160,216,64,0.26)';
const NGE_GLOW = 'rgba(140,210,40,0.18)';
const NGE_LABEL = 'rgba(140,210,40,0.5)';
const NGE_TEXT = 'rgba(140,210,40,0.72)';
const HYPER_TRACE = CANVAS.hyper.trace;
const HYPER_TRACE_SOFT = 'rgba(98,232,255,0.82)';
const HYPER_TRACE_DIM = 'rgba(126,136,255,0.56)';
const HYPER_TRACE_FAINT = 'rgba(255,102,196,0.44)';
const HYPER_GLOW = CANVAS.hyper.glow;
const HYPER_LABEL = CANVAS.hyper.label;
const HYPER_TEXT = CANVAS.hyper.text;
const RED_TRACE = CANVAS.red.trace;
const RED_TRACE_SOFT = 'rgba(255,110,92,0.82)';
const RED_TRACE_DIM = 'rgba(198,70,60,0.56)';
const RED_TRACE_FAINT = 'rgba(132,42,38,0.44)';
const RED_GLOW = CANVAS.red.glow;
const RED_LABEL = CANVAS.red.label;
const RED_TEXT = CANVAS.red.text;
const OPTIC_TRACE = CANVAS.optic.trace;
const OPTIC_TRACE_SOFT = 'rgba(18,118,164,0.82)';
const OPTIC_TRACE_DIM = 'rgba(71,121,155,0.64)';
const OPTIC_TRACE_FAINT = 'rgba(117,145,177,0.42)';
const OPTIC_GLOW = CANVAS.optic.glow;
const OPTIC_LABEL = CANVAS.optic.label;
const OPTIC_TEXT = CANVAS.optic.text;
const EVA_TRACE = CANVAS.eva.trace;
const EVA_TRACE_SOFT = 'rgba(255,123,0,0.82)';
const EVA_TRACE_DIM = 'rgba(170,90,255,0.56)';
const EVA_TRACE_FAINT = 'rgba(255,140,40,0.44)';
const EVA_GLOW = CANVAS.eva.glow;
const EVA_LABEL = CANVAS.eva.label;
const EVA_TEXT = CANVAS.eva.text;

function formatFreqLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

function hzAtFraction(fraction: number): number {
  return MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, fraction);
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
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const currentMode = displayMode.mode;
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const dirtyRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const smoothLeftRef = useRef<Float32Array | null>(null);
  const smoothRightRef = useRef<Float32Array | null>(null);
  const targetLeftRef = useRef<Float32Array | null>(null);
  const targetRightRef = useRef<Float32Array | null>(null);
  const hoverReadoutRef = useRef<HTMLDivElement>(null);
  // Layout values written each draw frame, read by hover handler
  const drawLayoutRef = useRef({ padX: 0, padY: 0, drawW: 1, drawH: 1, topDb: 0, bottomDb: -54 });

  const handleFreqMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const readout = hoverReadoutRef.current;
    const canvas = canvasRef.current;
    if (!readout || !canvas) return;

    const { padX, padY, drawW, drawH, topDb, bottomDb } = drawLayoutRef.current;
    if (drawW <= 0 || drawH <= 0) return;

    const scaleX = canvas.width / canvas.offsetWidth;
    const scaleY = canvas.height / canvas.offsetHeight;
    const devX = e.nativeEvent.offsetX * scaleX;
    const devY = e.nativeEvent.offsetY * scaleY;

    if (devX < padX || devX > padX + drawW || devY < padY || devY > padY + drawH) {
      readout.style.display = 'none';
      return;
    }

    const fraction = (devX - padX) / drawW;
    const hz = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, fraction);
    const dbFraction = (devY - padY) / drawH;
    const db = topDb - dbFraction * (topDb - bottomDb);

    readout.style.display = 'block';
    readout.textContent = `${formatHz(hz)}   ${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
  }, []);

  const handleFreqMouseLeave = useCallback(() => {
    const readout = hoverReadoutRef.current;
    if (readout) readout.style.display = 'none';
  }, []);

  useEffect(() => {
    return frameBus.subscribe((frame) => {
      frameRef.current = frame;
      dirtyRef.current = true;
    });
  }, [frameBus]);

  useEffect(() => {
    return audioEngine.onReset(() => {
      frameRef.current = null;
      smoothLeftRef.current = null;
      smoothRightRef.current = null;
      targetLeftRef.current = null;
      targetRightRef.current = null;
      dirtyRef.current = true;
    });
  }, [audioEngine]);

  useEffect(() => {
    dirtyRef.current = true;
  }, [currentMode]);

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
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const frame = frameRef.current;
      const width = canvas.width;
      const height = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.mode === 'nge';
      const hyper = displayMode.mode === 'hyper';
      const optic = displayMode.mode === 'optic';
      const red = displayMode.mode === 'red';
      const eva = displayMode.mode === 'eva';
      const padX = PAD * dpr;
      const padY = PAD * dpr;
      const axisH = 16 * dpr;
      const drawW = Math.max(1, width - padX * 2);
      const drawH = Math.max(1, height - padY * 2 - axisH);
      const pointCount = Math.max(112, Math.floor(drawW / Math.max(2, 3 * dpr)));
      const signalColor = nge ? NGE_TRACE : hyper ? HYPER_TRACE : optic ? OPTIC_TRACE : red ? RED_TRACE : eva ? EVA_TRACE : COLORS.waveform;
      const signalGlow = nge ? NGE_GLOW : hyper ? HYPER_GLOW : optic ? OPTIC_GLOW : red ? RED_GLOW : eva ? EVA_GLOW : COLORS.waveformGlow;
      const labelColor = nge ? NGE_LABEL : hyper ? HYPER_LABEL : optic ? OPTIC_LABEL : red ? RED_LABEL : eva ? EVA_LABEL : COLORS.textDim;
      const textColor = nge ? NGE_TEXT : hyper ? HYPER_TEXT : optic ? OPTIC_TEXT : red ? RED_TEXT : eva ? EVA_TEXT : COLORS.textSecondary;

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
      ctx.fillStyle = hyper ? CANVAS.hyper.bg2 : optic ? CANVAS.optic.bg2 : red ? CANVAS.red.bg2 : eva ? CANVAS.eva.bg2 : COLORS.bg2;
      ctx.fillRect(0, 0, width, height);

      const backdrop = ctx.createLinearGradient(0, padY, 0, padY + drawH);
      if (hyper) {
        backdrop.addColorStop(0, 'rgba(3, 8, 20, 0.98)');
        backdrop.addColorStop(0.55, 'rgba(8, 12, 34, 0.96)');
        backdrop.addColorStop(1, 'rgba(20, 8, 26, 0.96)');
      } else if (red) {
        backdrop.addColorStop(0, 'rgba(16, 4, 5, 0.99)');
        backdrop.addColorStop(0.55, 'rgba(24, 6, 7, 0.97)');
        backdrop.addColorStop(1, 'rgba(42, 10, 11, 0.99)');
      } else if (optic) {
        backdrop.addColorStop(0, 'rgba(250, 252, 253, 0.99)');
        backdrop.addColorStop(0.55, 'rgba(236, 241, 245, 0.98)');
        backdrop.addColorStop(1, 'rgba(225, 232, 238, 0.99)');
      } else if (eva) {
        backdrop.addColorStop(0, 'rgba(8, 4, 26, 0.98)');
        backdrop.addColorStop(0.55, 'rgba(15, 10, 36, 0.96)');
        backdrop.addColorStop(1, 'rgba(32, 8, 18, 0.96)');
      } else {
        backdrop.addColorStop(0, 'rgba(7, 8, 14, 0.98)');
        backdrop.addColorStop(0.6, 'rgba(10, 12, 22, 0.94)');
        backdrop.addColorStop(1, 'rgba(15, 10, 6, 0.96)');
      }
      ctx.fillStyle = backdrop;
      ctx.fillRect(padX, padY, drawW, drawH);

      const bandColors = optic ? CANVAS.optic.bandColors : red ? CANVAS.red.bandColors : CANVAS.bandColors;
      for (let i = 0; i < CANVAS.frequencyBands.length; i++) {
        const band = CANVAS.frequencyBands[i];
        const bandX = padX + freqToX(band.lowHz, drawW, MIN_HZ, MAX_HZ);
        const bandEnd = padX + freqToX(band.highHz, drawW, MIN_HZ, MAX_HZ);
        const bandColor = bandColors[i] ?? COLORS.waveform;
        const gradient = ctx.createLinearGradient(bandX, padY, bandEnd, padY + drawH);
        gradient.addColorStop(0, hexToRgba(bandColor, optic ? 0.015 : 0.03));
        gradient.addColorStop(0.45, hexToRgba(bandColor, optic ? 0.065 : 0.11));
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
      drawLayoutRef.current = { padX, padY, drawW, drawH, topDb, bottomDb };
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
        ctx.strokeStyle = relTick === 0
          ? (hyper ? 'rgba(88,124,255,0.9)' : optic ? 'rgba(95,138,161,0.84)' : red ? 'rgba(156,52,46,0.84)' : eva ? 'rgba(120,50,200,0.9)' : COLORS.borderActive)
          : (hyper ? 'rgba(32,52,110,0.9)' : optic ? 'rgba(183,203,215,0.88)' : red ? 'rgba(64,16,18,0.90)' : eva ? 'rgba(40,16,80,0.9)' : COLORS.border);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padX, y + 0.5);
        ctx.lineTo(padX + drawW, y + 0.5);
        ctx.stroke();

        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = hyper ? HYPER_LABEL : optic ? OPTIC_LABEL : red ? RED_LABEL : eva ? EVA_LABEL : COLORS.textDim;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${relTick}`, padX + 2 * dpr, y - 2 * dpr);
      }

      for (const tick of FREQ_TICKS) {
        const x = padX + freqToX(tick, drawW, MIN_HZ, MAX_HZ);
        ctx.strokeStyle = hyper ? 'rgba(32,52,110,0.9)' : optic ? 'rgba(183,203,215,0.88)' : red ? 'rgba(64,16,18,0.90)' : eva ? 'rgba(40,16,80,0.9)' : COLORS.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, padY);
        ctx.lineTo(x + 0.5, padY + drawH);
        ctx.stroke();

        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = hyper ? HYPER_LABEL : optic ? OPTIC_LABEL : red ? RED_LABEL : eva ? EVA_LABEL : COLORS.textDim;
        ctx.textAlign = tick === MIN_HZ ? 'left' : tick === MAX_HZ ? 'right' : 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(formatFreqLabel(tick), x, padY + drawH + 4 * dpr);
      }

      // Band boundary Hz labels — dim vertical markers at each band edge
      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = hyper ? 'rgba(88,124,255,0.28)' : nge ? 'rgba(120,200,40,0.28)' : optic ? 'rgba(76,108,129,0.48)' : red ? 'rgba(214,92,82,0.34)' : eva ? 'rgba(255,140,40,0.28)' : 'rgba(160,140,80,0.28)';
      for (let i = 1; i < CANVAS.frequencyBands.length; i++) {
        const boundHz = CANVAS.frequencyBands[i].lowHz;
        const bx = padX + freqToX(boundHz, drawW, MIN_HZ, MAX_HZ);
        ctx.fillText(formatFreqLabel(boundHz), bx, padY - 2 * dpr);
      }

      const ribbonGradient = ctx.createLinearGradient(padX, padY, padX, padY + drawH);
      ribbonGradient.addColorStop(
        0,
        nge ? 'rgba(112, 184, 48, 0.18)' : hyper ? 'rgba(98, 232, 255, 0.18)' : optic ? 'rgba(57, 126, 158, 0.12)' : red ? 'rgba(156, 40, 32, 0.16)' : eva ? 'rgba(255, 123, 0, 0.18)' : 'rgba(80, 96, 192, 0.18)',
      );
      ribbonGradient.addColorStop(
        1,
        nge ? 'rgba(48, 104, 20, 0.10)' : hyper ? 'rgba(255, 92, 188, 0.12)' : optic ? 'rgba(103, 141, 166, 0.08)' : red ? 'rgba(110, 32, 28, 0.10)' : eva ? 'rgba(170, 90, 255, 0.12)' : 'rgba(200, 146, 42, 0.16)',
      );
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
      fillGradient.addColorStop(
        0,
        nge ? 'rgba(160, 216, 64, 0.34)' : hyper ? 'rgba(98, 232, 255, 0.40)' : optic ? 'rgba(18, 118, 164, 0.22)' : red ? 'rgba(255, 90, 74, 0.24)' : eva ? 'rgba(255, 123, 0, 0.40)' : 'rgba(232, 176, 40, 0.42)',
      );
      fillGradient.addColorStop(
        0.55,
        nge ? 'rgba(96, 192, 32, 0.12)' : hyper ? 'rgba(110, 96, 255, 0.16)' : optic ? 'rgba(79, 134, 163, 0.10)' : red ? 'rgba(156, 40, 32, 0.10)' : eva ? 'rgba(120, 50, 200, 0.16)' : 'rgba(200, 146, 42, 0.14)',
      );
      fillGradient.addColorStop(
        1,
        nge ? 'rgba(96, 192, 32, 0.03)' : hyper ? 'rgba(255, 92, 188, 0.05)' : optic ? 'rgba(184, 150, 94, 0.04)' : red ? 'rgba(92, 24, 22, 0.04)' : eva ? 'rgba(170, 90, 255, 0.05)' : 'rgba(200, 146, 42, 0.03)',
      );
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
      ctx.strokeStyle = nge ? NGE_TRACE_SOFT : hyper ? HYPER_TRACE_SOFT : optic ? OPTIC_TRACE_SOFT : red ? RED_TRACE_SOFT : eva ? EVA_TRACE_SOFT : 'rgba(232, 176, 40, 0.72)';
      ctx.lineWidth = 3 * dpr;
      ctx.shadowBlur = 20 * dpr;
      ctx.shadowColor = signalGlow;
      ctx.beginPath();
      for (let i = 0; i < pointCount; i++) {
        const x = padX + (i / (pointCount - 1)) * drawW;
        if (i === 0) ctx.moveTo(x, averageY[i]);
        else ctx.lineTo(x, averageY[i]);
      }
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = signalColor;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      for (let i = 0; i < pointCount; i++) {
        const x = padX + (i / (pointCount - 1)) * drawW;
        if (i === 0) ctx.moveTo(x, averageY[i]);
        else ctx.lineTo(x, averageY[i]);
      }
      ctx.stroke();

      ctx.strokeStyle = nge ? NGE_TRACE_DIM : hyper ? HYPER_TRACE_DIM : optic ? OPTIC_TRACE_DIM : red ? RED_TRACE_DIM : eva ? EVA_TRACE_DIM : 'rgba(80, 96, 192, 0.65)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      for (let i = 0; i < pointCount; i++) {
        const x = padX + (i / (pointCount - 1)) * drawW;
        if (i === 0) ctx.moveTo(x, rightY[i]);
        else ctx.lineTo(x, rightY[i]);
      }
      ctx.stroke();

      ctx.strokeStyle = nge ? NGE_TRACE_FAINT : hyper ? HYPER_TRACE_FAINT : optic ? OPTIC_TRACE_FAINT : red ? RED_TRACE_FAINT : eva ? EVA_TRACE_FAINT : 'rgba(232, 176, 40, 0.40)';
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
        ctx.fillStyle = nge ? 'rgba(160, 216, 64, 0.85)' : hyper ? 'rgba(98, 232, 255, 0.9)' : optic ? 'rgba(21, 151, 212, 0.9)' : red ? 'rgba(255, 110, 92, 0.9)' : eva ? 'rgba(255, 123, 0, 0.9)' : 'rgba(232, 176, 40, 0.85)';
        ctx.shadowBlur = 18 * dpr;
        ctx.shadowColor = nge
          ? 'rgba(140, 210, 40, 0.8)'
          : hyper
            ? 'rgba(255, 92, 188, 0.72)'
            : optic
              ? 'rgba(18, 118, 164, 0.34)'
            : red
              ? 'rgba(255, 90, 74, 0.72)'
            : eva
              ? 'rgba(255, 120, 0, 0.72)'
              : 'rgba(232, 176, 40, 0.8)';
        ctx.beginPath();
        ctx.arc(hotX, hotY, 2.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const hottestHz = hzAtFraction(hottestIndex / Math.max(1, pointCount - 1));
      if (frame) {
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`CENT ${Math.round(frame.spectralCentroid)} Hz`, padX, padY);
        ctx.fillText(`HOT ${formatFreqLabel(Math.round(hottestHz))} / REF ${Math.round(topDb)} dB`, padX, padY + 10 * dpr);
      }

      ctx.font = `${9 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('FREQ RESPONSE', width - 8 * dpr, 6 * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [audioEngine, displayMode, theaterMode]);

  return (
    <div style={panelStyle}>
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        onMouseMove={handleFreqMouseMove}
        onMouseLeave={handleFreqMouseLeave}
      />
      <div ref={hoverReadoutRef} className="panel-hover-readout" />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'relative',
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



