import { useCallback, useEffect, useRef } from 'react';
import { frameBus } from '../audio/frameBus';
import { audioEngine } from '../audio/engine';
import { COLORS, FONTS, SPACING } from '../theme';
import type { FileAnalysis } from '../types';

interface EnvelopeData {
  peakEnv: Float32Array;
  rmsEnv: Float32Array;
  clipMap: Uint8Array;
}

const CLIP_THRESHOLD = 0.9999;
const PANEL_DPR_MAX = 1.25;

function computeEnvelopeAndClipMap(buffer: AudioBuffer, cols: number): EnvelopeData {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const samplesPerCol = left.length / cols;
  const peakEnv = new Float32Array(cols);
  const rmsEnv = new Float32Array(cols);
  const clipMap = new Uint8Array(cols);
  let envPeak = 0;

  for (let c = 0; c < cols; c++) {
    const start = Math.floor(c * samplesPerCol);
    const end = Math.min(Math.floor((c + 1) * samplesPerCol), left.length);
    let colPeak = 0;
    let rmsSum = 0;
    let sampleCount = 0;

    for (let i = start; i < end; i++) {
      const leftValue = left[i];
      const leftAbs = Math.abs(leftValue);
      if (leftAbs > colPeak) colPeak = leftAbs;
      rmsSum += leftValue * leftValue;
      sampleCount++;
      if (leftAbs >= CLIP_THRESHOLD) clipMap[c] = 1;

      if (right) {
        const rightValue = right[i];
        const rightAbs = Math.abs(rightValue);
        if (rightAbs > colPeak) colPeak = rightAbs;
        rmsSum += rightValue * rightValue;
        sampleCount++;
        if (rightAbs >= CLIP_THRESHOLD) clipMap[c] = 1;
      }
    }

    peakEnv[c] = colPeak;
    rmsEnv[c] = sampleCount > 0 ? Math.sqrt(rmsSum / sampleCount) : 0;
    if (colPeak > envPeak) envPeak = colPeak;
  }

  if (envPeak > 0) {
    for (let c = 0; c < cols; c++) {
      peakEnv[c] /= envPeak;
      rmsEnv[c] /= envPeak;
    }
  }

  return { peakEnv, rmsEnv, clipMap };
}

function pickGridInterval(duration: number): number {
  for (const interval of [5, 10, 15, 20, 30, 60, 90, 120, 180, 300, 600]) {
    const lines = duration / interval;
    if (lines >= 3 && lines <= 12) return interval;
  }
  return Math.max(1, Math.round(duration / 6));
}

function fmtTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return minutes > 0 ? `${minutes}:${String(secs).padStart(2, '0')}` : `${secs}s`;
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  color: string,
  rightX: number,
  topY: number,
  dpr: number,
): void {
  ctx.font = `${9 * dpr}px ${FONTS.mono}`;
  const textWidth = ctx.measureText(text).width;
  const padX = 4 * dpr;
  const padY = 2 * dpr;
  const badgeH = 11 * dpr;
  ctx.fillStyle = 'rgba(8,8,11,0.78)';
  ctx.fillRect(rightX - textWidth - padX * 2, topY, textWidth + padX * 2, badgeH + padY * 2);
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(text, rightX - padX, topY + padY);
}

export function WaveformOverviewPanel(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peakEnvRef = useRef<Float32Array | null>(null);
  const rmsEnvRef = useRef<Float32Array | null>(null);
  const clipMapRef = useRef<Uint8Array | null>(null);
  const analysisRef = useRef<FileAnalysis | null>(null);
  const centroidRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const isShiftDragRef = useRef(false);
  const loopDragStartRef = useRef<number | null>(null);

  useEffect(() => frameBus.subscribe((frame) => {
    centroidRef.current = frame.spectralCentroid;
  }), []);

  useEffect(() => audioEngine.onFileReady((analysis) => {
    analysisRef.current = analysis;
    const buffer = audioEngine.audioBuffer;
    const canvas = canvasRef.current;
    if (!buffer || !canvas) return;
    const cols = canvas.width > 0 ? canvas.width : 1024;
    const data = computeEnvelopeAndClipMap(buffer, cols);
    peakEnvRef.current = data.peakEnv;
    rmsEnvRef.current = data.rmsEnv;
    clipMapRef.current = data.clipMap;
  }), []);

  useEffect(() => audioEngine.onReset(() => {
    peakEnvRef.current = null;
    rmsEnvRef.current = null;
    clipMapRef.current = null;
    analysisRef.current = null;
    centroidRef.current = 0;
  }), []);

  const fractionFromPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  }, []);

  const seekFromPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const duration = audioEngine.duration;
    if (duration > 0) audioEngine.seek(fractionFromPointer(event) * duration);
  }, [fractionFromPointer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        const buffer = audioEngine.audioBuffer;
        if (buffer && canvas.width > 0) {
          const data = computeEnvelopeAndClipMap(buffer, canvas.width);
          peakEnvRef.current = data.peakEnv;
          rmsEnvRef.current = data.rmsEnv;
          clipMapRef.current = data.clipMap;
        }
      }
    });

    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const clipZoneH = Math.round(18 * dpr);
      const separatorH = 1;
      const waveH = height - clipZoneH - separatorH;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = COLORS.bg2;
      ctx.fillRect(0, 0, width, height);

      const peakEnv = peakEnvRef.current;
      const rmsEnv = rmsEnvRef.current;
      const clipMap = clipMapRef.current;
      const analysis = analysisRef.current;
      const duration = audioEngine.duration;
      const currentTime = audioEngine.currentTime;

      if (clipMap && duration > 0) {
        const envLen = clipMap.length;
        const scaleX = width / envLen;
        const clipZoneY = waveH + separatorH;

        ctx.fillStyle = COLORS.bg3;
        ctx.fillRect(0, clipZoneY, width, clipZoneH);

        for (let i = 0; i < envLen; i++) {
          const x = i * scaleX;
          const columnW = Math.max(1, scaleX);
          ctx.fillStyle = clipMap[i] ? 'rgba(200, 40, 40, 1)' : 'rgba(56, 168, 80, 0.10)';
          ctx.fillRect(x, clipZoneY, columnW, clipZoneH);
        }

        ctx.fillStyle = 'rgba(255, 60, 60, 0.90)';
        for (let i = 0; i < envLen; i++) {
          if (clipMap[i]) ctx.fillRect(i * scaleX, clipZoneY, Math.max(1, scaleX), 2 * dpr);
        }

        const playX = (currentTime / duration) * width;
        ctx.fillStyle = 'rgba(80, 96, 192, 0.10)';
        ctx.fillRect(0, clipZoneY, playX, clipZoneH);

        ctx.fillStyle = COLORS.border;
        ctx.fillRect(0, waveH, width, separatorH);
      }

      if (peakEnv && rmsEnv && duration > 0) {
        const midY = waveH / 2;
        const ampH = midY - 3 * dpr;
        const envLen = peakEnv.length;
        const scaleX = width / envLen;

        const interval = pickGridInterval(duration);
        ctx.lineWidth = 1;
        for (let t = interval; t < duration; t += interval) {
          const x = Math.round((t / duration) * width) + 0.5;
          ctx.strokeStyle = COLORS.bg3;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, waveH);
          ctx.stroke();
          ctx.font = `${7 * dpr}px ${FONTS.mono}`;
          ctx.fillStyle = COLORS.textDim;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(fmtTime(t), x, 2 * dpr);
        }

        ctx.beginPath();
        ctx.moveTo(0, midY);
        for (let i = 0; i < envLen; i++) ctx.lineTo(i * scaleX, midY - rmsEnv[i] * ampH);
        for (let i = envLen - 1; i >= 0; i--) ctx.lineTo(i * scaleX, midY + rmsEnv[i] * ampH);
        ctx.closePath();
        ctx.fillStyle = 'rgba(200, 146, 42, 0.22)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, midY);
        for (let i = 0; i < envLen; i++) ctx.lineTo(i * scaleX, midY - peakEnv[i] * ampH);
        ctx.strokeStyle = COLORS.waveform;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, midY);
        for (let i = 0; i < envLen; i++) ctx.lineTo(i * scaleX, midY + peakEnv[i] * ampH);
        ctx.strokeStyle = 'rgba(200, 146, 42, 0.35)';
        ctx.stroke();

        if (clipMap) {
          const cmLen = clipMap.length;
          const cmScaleX = width / cmLen;
          ctx.fillStyle = 'rgba(200, 40, 40, 0.55)';
          for (let i = 0; i < cmLen; i++) {
            if (clipMap[i]) ctx.fillRect(i * cmScaleX, 0, Math.max(1, cmScaleX), waveH);
          }
        }

        const playX = (currentTime / duration) * width;
        ctx.fillStyle = 'rgba(80, 96, 192, 0.07)';
        ctx.fillRect(0, 0, playX, waveH);

        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(playX, 0);
        ctx.lineTo(playX, waveH);
        ctx.stroke();

        // Loop region overlay
        const loopStart = audioEngine.loopStart;
        const loopEnd = audioEngine.loopEnd;
        if (loopStart !== null && loopEnd !== null) {
          const lx1 = (loopStart / duration) * width;
          const lx2 = (loopEnd / duration) * width;
          ctx.fillStyle = 'rgba(80, 200, 120, 0.10)';
          ctx.fillRect(lx1, 0, lx2 - lx1, waveH);
          ctx.strokeStyle = 'rgba(80, 200, 120, 0.60)';
          ctx.lineWidth = 1.5 * dpr;
          ctx.beginPath(); ctx.moveTo(lx1, 0); ctx.lineTo(lx1, waveH); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(lx2, 0); ctx.lineTo(lx2, waveH); ctx.stroke();
          // Loop label
          ctx.font = `${7 * dpr}px ${FONTS.mono}`;
          ctx.fillStyle = 'rgba(80, 200, 120, 0.70)';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText('LOOP', lx1 + 3 * dpr, 3 * dpr);
        }

        if (analysis) {
          const dr = analysis.crestFactorDb;
          const drColor =
            dr >= 12 ? COLORS.statusOk :
            dr >= 8 ? COLORS.statusWarn :
            COLORS.statusErr;
          const clipText = analysis.clipCount > 0 ? `${analysis.clipCount} CLIPS` : 'CLEAN';
          const clipColor = analysis.clipCount > 0 ? COLORS.statusErr : COLORS.statusOk;

          drawBadge(ctx, `DR ${dr.toFixed(1)} dB`, drColor, width - SPACING.sm * dpr, 4 * dpr, dpr);
          drawBadge(ctx, clipText, clipColor, width - SPACING.sm * dpr, 19 * dpr, dpr);
        }

        const centroid = centroidRef.current;
        if (centroid > 0) {
          ctx.font = `${8 * dpr}px ${FONTS.mono}`;
          ctx.fillStyle = COLORS.textDim;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`CENT ${Math.round(centroid)} Hz`, width - SPACING.sm * dpr, waveH - 4 * dpr);
        }
      } else {
        ctx.strokeStyle = COLORS.bg3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, waveH / 2);
        ctx.lineTo(width, waveH / 2);
        ctx.stroke();
      }

      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('OVERVIEW', SPACING.sm * dpr, 4 * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div style={panelStyle}>
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        onPointerDown={(event) => {
          isDraggingRef.current = true;
          isShiftDragRef.current = event.shiftKey;
          event.currentTarget.setPointerCapture(event.pointerId);
          if (event.shiftKey) {
            const t = fractionFromPointer(event) * audioEngine.duration;
            loopDragStartRef.current = t;
          } else {
            loopDragStartRef.current = null;
            seekFromPointer(event);
          }
        }}
        onPointerMove={(event) => {
          if (!isDraggingRef.current) return;
          if (isShiftDragRef.current && loopDragStartRef.current !== null) {
            const t2 = fractionFromPointer(event) * audioEngine.duration;
            const start = Math.min(loopDragStartRef.current, t2);
            const end = Math.max(loopDragStartRef.current, t2);
            if (end - start > 0.1) audioEngine.setLoop(start, end);
          } else {
            seekFromPointer(event);
          }
        }}
        onPointerUp={() => {
          isDraggingRef.current = false;
          isShiftDragRef.current = false;
          loopDragStartRef.current = null;
        }}
      />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: COLORS.bg2,
  overflow: 'hidden',
  cursor: 'crosshair',
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};
