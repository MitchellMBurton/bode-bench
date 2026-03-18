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

const PANEL_DPR_MAX = 1.5;
const CORR_BAR_H_CSS = 24; // px (CSS), fixed height for correlation bar
const DOT_ALPHA = 0.76;     // current frame dot opacity
const DECAY_FACTOR = 0.13;  // per-frame fade (semi-persistent trail)
const MAX_TRAIL_FRAMES = 6; // trail depth

// ── Component ─────────────────────────────────────────────────────────────────
export function GoniometerPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(true);
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

    // Smooth the pre-computed correlation here (20fps) instead of in the 60fps draw loop
    corrSmoothRef.current = corrSmoothRef.current * 0.7 + frame.phaseCorrelation * 0.3;
    dirtyRef.current = true;
  }), [frameBus]);

  useEffect(() => audioEngine.onReset(() => {
    lastFileIdRef.current = -1;
    trailRef.current = Array(MAX_TRAIL_FRAMES).fill(null);
    trailPtrRef.current = 0;
    corrSmoothRef.current = 0;
    dirtyRef.current = true;
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
        dirtyRef.current = true;
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── RAF draw loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || theaterMode) return;

    dirtyRef.current = true;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!dirtyRef.current || shouldSkipFrame(canvas)) return;
      dirtyRef.current = false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.nge;
      const hyper = displayMode.hyper;
      const eva = displayMode.eva;

      const traceColor = nge ? '#a0d840' : hyper ? CANVAS.hyper.trace : eva ? CANVAS.eva.trace : COLORS.waveform;
      const labelColor = nge ? 'rgba(140,210,40,0.5)' : hyper ? CANVAS.hyper.label : eva ? CANVAS.eva.label : COLORS.textDim;
      const textColor = nge ? 'rgba(140,210,40,0.72)' : hyper ? CANVAS.hyper.text : eva ? CANVAS.eva.text : COLORS.textSecondary;
      const gridColor = nge ? CANVAS.nge.grid : hyper ? CANVAS.hyper.grid : eva ? CANVAS.eva.grid : COLORS.border;

      // Background
      ctx.fillStyle = hyper ? CANVAS.hyper.bg2 : eva ? CANVAS.eva.bg : COLORS.bg1;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = hyper ? 'rgba(32,52,110,0.92)' : eva ? 'rgba(74,26,144,0.92)' : COLORS.border;
      ctx.fillRect(0, 0, W, 1);

      // ── Correlation bar ────────────────────────────────────────────────
      const corrH = Math.round(CORR_BAR_H_CSS * dpr);
      const corrY = H - corrH;

      // Divider line above bar
      ctx.fillStyle = hyper ? 'rgba(28,42,88,0.92)' : eva ? 'rgba(22,12,48,1)' : 'rgba(32,32,48,1)';
      ctx.fillRect(0, corrY, W, 1);

      // Read smoothed phase correlation (updated in frame callback at 20fps)
      const corrVal = corrSmoothRef.current;

      const corrZeroX = W * 0.5;
      const corrNeedleX = corrZeroX + corrVal * corrZeroX;
      const corrColor = corrVal > 0.5
        ? (nge ? 'rgba(100,200,40,0.8)' : hyper ? 'rgba(80,200,100,0.8)' : eva ? 'rgba(255,123,0,0.8)' : 'rgba(60,180,80,0.8)')
        : corrVal > 0
          ? (nge ? 'rgba(180,200,40,0.8)' : eva ? 'rgba(255,160,32,0.8)' : 'rgba(200,180,50,0.8)')
          : 'rgba(200,60,40,0.8)';

      // Background bar
      ctx.fillStyle = hyper ? 'rgba(14,22,50,1)' : eva ? 'rgba(8,4,26,1)' : 'rgba(16,16,24,1)';
      ctx.fillRect(0, corrY + 1, W, corrH - 1);

      // Fill from centre to needle
      ctx.fillStyle = corrColor;
      ctx.globalAlpha = 0.22;
      if (corrVal >= 0) {
        ctx.fillRect(corrZeroX, corrY + 2, corrNeedleX - corrZeroX, corrH - 4);
      } else {
        ctx.fillRect(corrNeedleX, corrY + 2, corrZeroX - corrNeedleX, corrH - 4);
      }
      ctx.globalAlpha = 1;

      // Needle
      ctx.strokeStyle = corrColor;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(Math.round(corrNeedleX) + 0.5, corrY + 2);
      ctx.lineTo(Math.round(corrNeedleX) + 0.5, H - 2);
      ctx.stroke();

      // Scale tick marks: centre (0) and ±0.5
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.55;
      for (const tx of [corrZeroX, corrZeroX - corrZeroX * 0.5, corrZeroX + corrZeroX * 0.5]) {
        ctx.beginPath();
        ctx.moveTo(tx + 0.5, corrY + 2);
        ctx.lineTo(tx + 0.5, H - 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Labels: extremes + live value
      ctx.font = `${6.5 * dpr}px ${FONTS.mono}`;
      ctx.textBaseline = 'middle';
      const corrMidY = corrY + corrH * 0.5;
      ctx.fillStyle = labelColor;
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

      // Square plot area centred in available space
      const gSize = Math.min(W, gH);
      const gX0 = Math.round((W - gSize) * 0.5);
      const gY0 = Math.round((gH - gSize) * 0.5);
      const cx = gX0 + gSize * 0.5;
      const cy = gY0 + gSize * 0.5;
      const halfR = gSize * 0.43; // pulled in slightly from edge to leave room for circle border
      const d45 = halfR * 0.707;  // halfR × cos(45°) — diagonal axis arm length

      // Circular clip — all grid and signal stays within the circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, halfR + 1.5 * dpr, 0, Math.PI * 2);
      ctx.clip();

      // Subtle 50% amplitude ring
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(cx, cy, halfR * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Diamond boundary — ±1 amplitude envelope
      ctx.setLineDash([2 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.moveTo(cx,         cy - halfR); // top  (M+)
      ctx.lineTo(cx + halfR, cy);         // right (S+)
      ctx.lineTo(cx,         cy + halfR); // bottom (M−)
      ctx.lineTo(cx - halfR, cy);         // left  (S−)
      ctx.closePath();
      ctx.stroke();

      // L/R diagonal guide lines — dashed, dimmer
      // Pure L (R=0): s = L/2 > 0, m = L/2 > 0  → plots upper-right
      // Pure R (L=0): s = −R/2 < 0, m = R/2 > 0 → plots upper-left
      ctx.globalAlpha = 0.38;
      ctx.beginPath();
      ctx.moveTo(cx - d45, cy + d45); ctx.lineTo(cx + d45, cy - d45); // L: upper-right
      ctx.moveTo(cx + d45, cy + d45); ctx.lineTo(cx - d45, cy - d45); // R: upper-left
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      // M/S crosshairs (solid)
      ctx.beginPath();
      ctx.moveTo(cx, cy - halfR); ctx.lineTo(cx, cy + halfR); // M axis (vertical)
      ctx.moveTo(cx - halfR, cy); ctx.lineTo(cx + halfR, cy); // S axis (horizontal)
      ctx.stroke();

      // Axis labels: M at top, L upper-right (pure-L direction), R upper-left (pure-R direction)
      ctx.font = `${6 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('M', cx, cy - halfR + 3 * dpr);
      ctx.textBaseline = 'middle';
      ctx.fillText('L', cx + d45 * 0.68, cy - d45 * 0.68);
      ctx.fillText('R', cx - d45 * 0.68, cy - d45 * 0.68);

      // ── Trail rendering (oldest first, newest on top) ──────────────────
      const ptr = trailPtrRef.current;
      const trail = trailRef.current;

      for (let age = MAX_TRAIL_FRAMES - 1; age >= 0; age--) {
        const trailIdx = ((ptr - 1 - age) % MAX_TRAIL_FRAMES + MAX_TRAIL_FRAMES) % MAX_TRAIL_FRAMES;
        const buf = trail[trailIdx];
        if (!buf) continue;

        const alpha = DOT_ALPHA * Math.pow(1 - DECAY_FACTOR, age);
        if (alpha < 0.01) continue;

        const step = Math.max(1, Math.floor(buf.length / 2 / 512));
        const rCore = age === 0 ? 1.5 * dpr : 1 * dpr;

        // Glow pass — current frame only, wider and faint
        if (age === 0) {
          const rGlow = rCore * 2.0;
          ctx.globalAlpha = alpha * 0.12;
          ctx.fillStyle = traceColor;
          for (let i = 0; i < buf.length; i += step * 2) {
            const s = (buf[i] - buf[i + 1]) * 0.5;
            const m = (buf[i] + buf[i + 1]) * 0.5;
            const px = cx + s * halfR;
            const py = cy - m * halfR;
            ctx.fillRect(px - rGlow, py - rGlow, rGlow * 2, rGlow * 2);
          }
        }

        // Core pass
        ctx.globalAlpha = alpha;
        ctx.fillStyle = traceColor;
        for (let i = 0; i < buf.length; i += step * 2) {
          const s = (buf[i] - buf[i + 1]) * 0.5;
          const m = (buf[i] + buf[i + 1]) * 0.5;
          const px = cx + s * halfR;
          const py = cy - m * halfR;
          ctx.fillRect(px - rCore, py - rCore, rCore * 2, rCore * 2);
        }
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // Circle border — drawn after restore so it sits cleanly on top of the plot
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, halfR + 1.5 * dpr, 0, Math.PI * 2);
      ctx.stroke();

      // Panel label
      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('GONIOMETER', SPACING.sm * dpr, corrY - SPACING.xs * dpr);
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
