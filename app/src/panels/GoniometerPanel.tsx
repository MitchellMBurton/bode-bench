// ============================================================
// GoniometerPanel — stereo phase analysis.
//
// Upper section: Goniometer (Lissajous / M-S, rotated 45°)
//   X axis = Side (L − R): horizontal spread = stereo width
//   Y axis = Mid  (L + R): vertical energy = mono signal
//   Mono signal → vertical line. Wide stereo → diamond.
//   Out-of-phase → horizontal line (mono incompatible).
//
// Lower section: Phase Correlation Meter
//   −1 (complete cancellation) to +1 (mono / correlated).
//   r = Σ(L·R) / √(Σ(L²)·Σ(R²))
//   Green > +0.5 (safe), Yellow 0–+0.5 (caution), Red < 0 (problem).
// ============================================================

import { useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useTheaterMode } from '../core/session';
import { COLORS, FONTS, SPACING, CANVAS } from '../theme';
import { shouldSkipFrame } from '../utils/rafGuard';
import type { AudioFrame } from '../types';

const PANEL_DPR_MAX = 1.5;
const CORR_BAR_H_CSS = 20; // px (CSS), fixed height for correlation bar
const DOT_ALPHA = 0.72;     // current frame dot opacity
const DECAY_FACTOR = 0.18;  // per-frame fade (semi-persistent trail)
const MAX_TRAIL_FRAMES = 4; // trail depth

// ── Component ─────────────────────────────────────────────────────────────────
export function GoniometerPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const currentRef = useRef<AudioFrame | null>(null);
  const lastFileIdRef = useRef(-1);

  // Trail: ring buffer of recent frame sample pairs [L, R][]
  const trailRef = useRef<Array<Float32Array | null>>(
    Array(MAX_TRAIL_FRAMES).fill(null),
  );
  const trailPtrRef = useRef(0);

  // Smoothed phase correlation (for stable needle)
  const corrSmoothRef = useRef(0);

  useEffect(() => frameBus.subscribe((frame) => {
    if (frame.fileId !== lastFileIdRef.current) {
      lastFileIdRef.current = frame.fileId;
      trailRef.current = Array(MAX_TRAIL_FRAMES).fill(null);
      trailPtrRef.current = 0;
      corrSmoothRef.current = 0;
    }

    // Interleaved L/R samples for the trail
    const n = Math.min(frame.timeDomain.length, frame.timeDomainRight.length);
    const buf = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      buf[i * 2]     = frame.timeDomain[i];
      buf[i * 2 + 1] = frame.timeDomainRight[i];
    }
    const ptr = trailPtrRef.current % MAX_TRAIL_FRAMES;
    trailRef.current[ptr] = buf;
    trailPtrRef.current++;

    currentRef.current = frame;
  }), [frameBus]);

  useEffect(() => audioEngine.onReset(() => {
    currentRef.current = null;
    lastFileIdRef.current = -1;
    trailRef.current = Array(MAX_TRAIL_FRAMES).fill(null);
    trailPtrRef.current = 0;
    corrSmoothRef.current = 0;
  }), [audioEngine]);

  // ── Resize observer ───────────────────────────────────────────────────────
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

  // ── RAF draw loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || theaterMode) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (shouldSkipFrame()) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.nge;
      const hyper = displayMode.hyper;

      const traceColor = nge ? '#a0d840' : hyper ? CANVAS.hyper.trace : COLORS.waveform;
      const labelColor = nge ? 'rgba(140,210,40,0.5)' : hyper ? CANVAS.hyper.label : COLORS.textDim;
      const textColor = nge ? 'rgba(140,210,40,0.72)' : hyper ? CANVAS.hyper.text : COLORS.textSecondary;
      const gridColor = nge ? CANVAS.nge.grid : hyper ? CANVAS.hyper.grid : COLORS.border;

      // Background
      ctx.fillStyle = hyper ? CANVAS.hyper.bg2 : COLORS.bg1;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = hyper ? 'rgba(32,52,110,0.92)' : COLORS.border;
      ctx.fillRect(0, 0, W, 1);

      // ── Correlation bar ────────────────────────────────────────────────
      const corrH = Math.round(CORR_BAR_H_CSS * dpr);
      const corrY = H - corrH;

      // Label divider line
      ctx.fillStyle = hyper ? 'rgba(28,42,88,0.92)' : 'rgba(32,32,48,1)';
      ctx.fillRect(0, corrY, W, 1);

      // Compute phase correlation from current frame
      const frame = currentRef.current;
      let corrVal = corrSmoothRef.current;
      if (frame) {
        const L = frame.timeDomain;
        const R = frame.timeDomainRight;
        let sumLR = 0, sumL2 = 0, sumR2 = 0;
        const n = Math.min(L.length, R.length);
        for (let i = 0; i < n; i++) {
          sumLR += L[i] * R[i];
          sumL2 += L[i] * L[i];
          sumR2 += R[i] * R[i];
        }
        const denom = Math.sqrt(sumL2 * sumR2);
        const rawCorr = denom > 0 ? sumLR / denom : 0;
        corrVal = corrSmoothRef.current * 0.7 + rawCorr * 0.3;
        corrSmoothRef.current = corrVal;
      }

      // Correlation bar fill: map [-1, 1] → [0, W]
      const corrZeroX = W * 0.5;
      const corrNeedleX = corrZeroX + corrVal * corrZeroX;
      const corrColor = corrVal > 0.5
        ? (nge ? 'rgba(100,200,40,0.8)' : hyper ? 'rgba(80,200,100,0.8)' : 'rgba(60,180,80,0.8)')
        : corrVal > 0
          ? (nge ? 'rgba(180,200,40,0.8)' : 'rgba(200,180,50,0.8)')
          : 'rgba(200,60,40,0.8)';

      // Background bar
      ctx.fillStyle = hyper ? 'rgba(14,22,50,1)' : 'rgba(16,16,24,1)';
      ctx.fillRect(0, corrY + 1, W, corrH - 1);

      // Filled region from centre to needle
      if (corrVal >= 0) {
        ctx.fillStyle = corrColor;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(corrZeroX, corrY + 2, corrNeedleX - corrZeroX, corrH - 4);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = corrColor;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(corrNeedleX, corrY + 2, corrZeroX - corrNeedleX, corrH - 4);
        ctx.globalAlpha = 1;
      }

      // Needle
      ctx.strokeStyle = corrColor;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(Math.round(corrNeedleX) + 0.5, corrY + 2);
      ctx.lineTo(Math.round(corrNeedleX) + 0.5, H - 2);
      ctx.stroke();

      // Centre zero mark
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(corrZeroX + 0.5, corrY + 2);
      ctx.lineTo(corrZeroX + 0.5, H - 2);
      ctx.stroke();

      // Correlation labels
      ctx.font = `${6.5 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textBaseline = 'middle';
      const corrMidY = corrY + corrH * 0.5;
      ctx.textAlign = 'left';
      ctx.fillText('−1', SPACING.xs * dpr, corrMidY);
      ctx.textAlign = 'right';
      ctx.fillText('+1', W - SPACING.xs * dpr, corrMidY);
      ctx.textAlign = 'center';
      ctx.fillStyle = corrVal > 0.5 ? textColor : labelColor;
      ctx.fillText(`${corrVal >= 0 ? '+' : ''}${corrVal.toFixed(2)}`, corrZeroX, corrMidY);

      // ── Goniometer ────────────────────────────────────────────────────
      const gH = corrY - 1;
      if (gH <= 16) return;

      // Square plot area centred
      const gSize = Math.min(W, gH);
      const gX0 = Math.round((W - gSize) * 0.5);
      const gY0 = Math.round((gH - gSize) * 0.5);
      const cx = gX0 + gSize * 0.5;
      const cy = gY0 + gSize * 0.5;
      const halfR = gSize * 0.46; // scale: ±1 amplitude → halfR pixels

      // Clip to goniometer area
      ctx.save();
      ctx.beginPath();
      ctx.rect(gX0, gY0, gSize, gSize);
      ctx.clip();

      // Diamond reference (rotated square = goniometer border)
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([2 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.moveTo(cx, gY0 + 4);         // top
      ctx.lineTo(gX0 + gSize - 4, cy); // right
      ctx.lineTo(cx, gY0 + gSize - 4); // bottom
      ctx.lineTo(gX0 + 4, cy);         // left
      ctx.closePath();
      ctx.stroke();

      // Axis crosshairs (M=vertical, S=horizontal)
      ctx.setLineDash([]);
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, gY0 + 2); ctx.lineTo(cx, gY0 + gSize - 2); // vertical (M axis)
      ctx.moveTo(gX0 + 2, cy); ctx.lineTo(gX0 + gSize - 2, cy); // horizontal (S axis)
      ctx.stroke();

      // Axis labels
      ctx.font = `${6 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('M', cx, gY0 + 2);
      ctx.textBaseline = 'bottom';
      ctx.fillText('S', cx, gY0 + gSize - 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('L', gX0 + 4, cy - 2 * dpr);
      ctx.textAlign = 'left';
      ctx.fillText('R', gX0 + gSize - 4, cy - 2 * dpr);

      // Plot trail frames (oldest first, most faded)
      const ptr = trailPtrRef.current;
      const trail = trailRef.current;

      for (let age = MAX_TRAIL_FRAMES - 1; age >= 0; age--) {
        const trailIdx = ((ptr - 1 - age) % MAX_TRAIL_FRAMES + MAX_TRAIL_FRAMES) % MAX_TRAIL_FRAMES;
        const buf = trail[trailIdx];
        if (!buf) continue;

        const alpha = DOT_ALPHA * Math.pow(1 - DECAY_FACTOR, age);
        if (alpha < 0.01) continue;

        // Parse the raw RGB from traceColor for alpha dots
        // Use simple colored fillRect dots
        const r = age === 0 ? 1.5 * dpr : 1 * dpr; // slightly larger for current frame

        ctx.globalAlpha = alpha;
        ctx.fillStyle = traceColor;

        const step = Math.max(1, Math.floor(buf.length / 2 / 512)); // max 512 dots per frame
        for (let i = 0; i < buf.length; i += step * 2) {
          const lSample = buf[i];
          const rSample = buf[i + 1];
          // M/S goniometer: x = S = L−R (horizontal), y = M = L+R (vertical up)
          const s = (lSample - rSample) * 0.5;
          const m = (lSample + rSample) * 0.5;
          const px = cx + s * halfR;
          const py = cy - m * halfR; // Y up = louder
          ctx.fillRect(px - r, py - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // Panel label
      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('GONIOMT', SPACING.sm * dpr, corrY - SPACING.xs * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [displayMode, theaterMode]);

  return (
    <div style={panelStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'relative',
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
