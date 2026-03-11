// ============================================================
// Waveform Overview Panel — full-file amplitude navigator.
// Pre-computed peak envelope + per-column clip map from AudioBuffer.
// Clip zone strip at bottom shows exactly where clipping occurs.
// Quality badges: DR (colour-coded), CLEAN / CLIPS count.
// Real-time spectral centroid readout.
// ============================================================

import { useEffect, useRef, useCallback } from 'react';
import { frameBus } from '../audio/frameBus';
import { audioEngine } from '../audio/engine';
import { COLORS, FONTS, SPACING } from '../theme';
import type { FileAnalysis } from '../types';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

interface EnvelopeData {
  peakEnv: Float32Array; // peak per column, normalised 0–1 — used for edge line
  rmsEnv: Float32Array;  // RMS per column, same normalisation — used for fill body
  clipMap: Uint8Array;   // 1 = any sample clipped in that column, 0 = clean
}

// Columns whose peak is within this fraction of the file maximum are flagged as near-peak.
// Catches consistently loud/blown-out regions even if they never hit absolute 0.9999 ceiling.
const NEAR_PEAK_THRESHOLD = 0.95;

function computeEnvelopeAndClipMap(buffer: AudioBuffer, cols: number): EnvelopeData {
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const samplesPerCol = L.length / cols;
  const peakEnv = new Float32Array(cols);
  const rmsEnv = new Float32Array(cols);
  const clipMap = new Uint8Array(cols);
  let envPeak = 0;

  // Pass 1 — compute per-column peak, RMS; find file maximum
  for (let c = 0; c < cols; c++) {
    const start = Math.floor(c * samplesPerCol);
    const end = Math.min(Math.floor((c + 1) * samplesPerCol), L.length);
    let colPeak = 0;
    let rmsSum = 0;
    const n = end - start;
    for (let i = start; i < end; i++) {
      const vL = Math.abs(L[i]);
      if (vL > colPeak) colPeak = vL;
      rmsSum += L[i] * L[i];
      if (R) {
        const vR = Math.abs(R[i]);
        if (vR > colPeak) colPeak = vR;
      }
    }
    peakEnv[c] = colPeak;
    rmsEnv[c] = n > 0 ? Math.sqrt(rmsSum / n) : 0;
    if (colPeak > envPeak) envPeak = colPeak;
  }

  // Pass 2 — normalise and set clip flags relative to file maximum
  const clipCeiling = envPeak * NEAR_PEAK_THRESHOLD;
  if (envPeak > 0) {
    for (let c = 0; c < cols; c++) {
      clipMap[c] = peakEnv[c] >= clipCeiling ? 1 : 0;
      peakEnv[c] /= envPeak;
      rmsEnv[c] /= envPeak;
    }
  }
  return { peakEnv, rmsEnv, clipMap };
}

function pickGridInterval(duration: number): number {
  for (const g of [5, 10, 15, 20, 30, 60, 90, 120, 180, 300, 600]) {
    const lines = duration / g;
    if (lines >= 3 && lines <= 12) return g;
  }
  return Math.max(1, Math.round(duration / 6));
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
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
  const tw = ctx.measureText(text).width;
  const padX = 4 * dpr;
  const padY = 2 * dpr;
  const bh = 11 * dpr;
  ctx.fillStyle = 'rgba(8,8,11,0.78)';
  ctx.fillRect(rightX - tw - padX * 2, topY, tw + padX * 2, bh + padY * 2);
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(text, rightX - padX, topY + padY);
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function WaveformOverviewPanel(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peakEnvRef = useRef<Float32Array | null>(null);
  const rmsEnvRef = useRef<Float32Array | null>(null);
  const clipMapRef = useRef<Uint8Array | null>(null);
  const analysisRef = useRef<FileAnalysis | null>(null);
  const centroidRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const isDragging = useRef(false);

  // Frame bus → spectral centroid
  useEffect(() => {
    return frameBus.subscribe((f) => { centroidRef.current = f.spectralCentroid; });
  }, []);

  // File ready → compute envelope + clip map
  useEffect(() => {
    return audioEngine.onFileReady((analysis) => {
      analysisRef.current = analysis;
      const buf = audioEngine.audioBuffer;
      const canvas = canvasRef.current;
      if (!buf || !canvas) return;
      const cols = canvas.width > 0 ? canvas.width : 1024;
      const data = computeEnvelopeAndClipMap(buf, cols);
      peakEnvRef.current = data.peakEnv;
      rmsEnvRef.current = data.rmsEnv;
      clipMapRef.current = data.clipMap;
    });
  }, []);

  // Reset → clear
  useEffect(() => {
    return audioEngine.onReset(() => {
      peakEnvRef.current = null;
      rmsEnvRef.current = null;
      clipMapRef.current = null;
      analysisRef.current = null;
      centroidRef.current = 0;
    });
  }, []);

  // Seek on pointer
  const seekFromPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = audioEngine.duration;
    if (dur > 0) audioEngine.seek(frac * dur);
  }, []);

  // ResizeObserver — recompute at new pixel resolution
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = Math.round(width * devicePixelRatio);
        canvas.height = Math.round(height * devicePixelRatio);
        const buf = audioEngine.audioBuffer;
        if (buf && canvas.width > 0) {
          const data = computeEnvelopeAndClipMap(buf, canvas.width);
          peakEnvRef.current = data.peakEnv;
          rmsEnvRef.current = data.rmsEnv;
          clipMapRef.current = data.clipMap;
        }
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // RAF draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = devicePixelRatio;

      // Clip zone occupies the bottom strip; waveform lives above it
      const CLIP_H = Math.round(18 * dpr);
      const SEP = 1;             // 1px separator between waveform and clip zone
      const waveH = H - CLIP_H - SEP;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = COLORS.bg2;
      ctx.fillRect(0, 0, W, H);

      const peakEnv = peakEnvRef.current;
      const rmsEnv = rmsEnvRef.current;
      const clipMap = clipMapRef.current;
      const analysis = analysisRef.current;
      const duration = audioEngine.duration;
      const ct = audioEngine.currentTime;

      // ── Clip zone (always rendered when data present) ──────────
      if (clipMap && duration > 0) {
        const envLen = clipMap.length;
        const scaleX = W / envLen;
        const czY = waveH + SEP;

        // Base — dark track
        ctx.fillStyle = COLORS.bg3;
        ctx.fillRect(0, czY, W, CLIP_H);

        // Per-column clip indicator
        for (let i = 0; i < envLen; i++) {
          const x = i * scaleX;
          const w = Math.max(1, scaleX);
          ctx.fillStyle = clipMap[i]
            ? 'rgba(200, 40, 40, 1.00)'       // red — clipped
            : 'rgba(56, 168, 80, 0.10)';      // dim green — clean
          ctx.fillRect(x, czY, w, CLIP_H);
        }

        // Bright top-edge accent for clipped columns
        ctx.fillStyle = 'rgba(255, 60, 60, 0.90)';
        for (let i = 0; i < envLen; i++) {
          if (clipMap[i]) ctx.fillRect(i * scaleX, czY, Math.max(1, scaleX), 2 * dpr);
        }

        // Played-region tint over clip zone
        const playX = (ct / duration) * W;
        ctx.fillStyle = 'rgba(80, 96, 192, 0.10)';
        ctx.fillRect(0, czY, playX, CLIP_H);

        // Separator line
        ctx.fillStyle = COLORS.border;
        ctx.fillRect(0, waveH, W, SEP);
      }

      if (peakEnv && rmsEnv && duration > 0) {
        const midY = waveH / 2;
        const ampH = midY - 3 * dpr;
        const envLen = peakEnv.length;
        const scaleX = W / envLen;

        // Time grid
        const interval = pickGridInterval(duration);
        ctx.lineWidth = 1;
        for (let t = interval; t < duration; t += interval) {
          const x = Math.round((t / duration) * W) + 0.5;
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

        // RMS fill — sustained energy body
        ctx.beginPath();
        ctx.moveTo(0, midY);
        for (let i = 0; i < envLen; i++) ctx.lineTo(i * scaleX, midY - rmsEnv[i] * ampH);
        for (let i = envLen - 1; i >= 0; i--) ctx.lineTo(i * scaleX, midY + rmsEnv[i] * ampH);
        ctx.closePath();
        ctx.fillStyle = 'rgba(200, 146, 42, 0.22)';
        ctx.fill();

        // Peak edge top — transient envelope
        ctx.beginPath();
        ctx.moveTo(0, midY);
        for (let i = 0; i < envLen; i++) ctx.lineTo(i * scaleX, midY - peakEnv[i] * ampH);
        ctx.strokeStyle = COLORS.waveform;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Peak edge bottom — dimmer
        ctx.beginPath();
        ctx.moveTo(0, midY);
        for (let i = 0; i < envLen; i++) ctx.lineTo(i * scaleX, midY + peakEnv[i] * ampH);
        ctx.strokeStyle = 'rgba(200, 146, 42, 0.35)';
        ctx.stroke();

        // Clip highlight — full-height red bands where any sample clips
        if (clipMap) {
          const cmLen = clipMap.length;
          const cmScaleX = W / cmLen;
          ctx.fillStyle = 'rgba(200, 40, 40, 0.55)';
          for (let i = 0; i < cmLen; i++) {
            if (clipMap[i]) ctx.fillRect(i * cmScaleX, 0, Math.max(1, cmScaleX), waveH);
          }
        }

        // Played-region tint
        const playX = (ct / duration) * W;
        ctx.fillStyle = 'rgba(80, 96, 192, 0.07)';
        ctx.fillRect(0, 0, playX, waveH);

        // Playhead
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(playX, 0);
        ctx.lineTo(playX, waveH);
        ctx.stroke();

        // ── Quality badges (top-right) ────────────────────────────
        if (analysis) {
          const dr = analysis.crestFactorDb;
          const drColor =
            dr >= 12 ? COLORS.statusOk :
            dr >= 8  ? COLORS.statusWarn :
                       COLORS.statusErr;
          const clipText = analysis.clipCount > 0
            ? `▲ ${analysis.clipCount} CLIPS`
            : '◆ CLEAN';
          const clipColor = analysis.clipCount > 0 ? COLORS.statusErr : COLORS.statusOk;

          drawBadge(ctx, `DR ${dr.toFixed(1)} dB`, drColor, W - SPACING.sm * dpr, 4 * dpr, dpr);
          drawBadge(ctx, clipText, clipColor, W - SPACING.sm * dpr, 19 * dpr, dpr);
        }

        // ── Spectral centroid (bottom-right, real-time) ────────────
        const cent = centroidRef.current;
        if (cent > 0) {
          ctx.font = `${8 * dpr}px ${FONTS.mono}`;
          ctx.fillStyle = COLORS.textDim;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`CENT  ${Math.round(cent)} Hz`, W - SPACING.sm * dpr, waveH - 4 * dpr);
        }

      } else {
        // Idle — centre line
        ctx.strokeStyle = COLORS.bg3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, waveH / 2);
        ctx.lineTo(W, waveH / 2);
        ctx.stroke();
      }

      // Panel label
      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('OVERVIEW', SPACING.sm * dpr, 4 * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div style={panelStyle}>
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        onPointerDown={(e) => {
          isDragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e);
        }}
        onPointerMove={(e) => { if (isDragging.current) seekFromPointer(e); }}
        onPointerUp={() => { isDragging.current = false; }}
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
