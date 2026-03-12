// ============================================================
// PitchTrackerPanel — rolling F0 history.
// Newest data always at right edge. Sub-frame time interpolation
// gives smooth 60fps scrolling from 20fps analysis data.
// Scroll speed matches CANVAS.timelineScrollPx × scrollSpeed.value
// ============================================================

import { useEffect, useRef } from 'react';
import { frameBus } from '../audio/frameBus';
import { audioEngine } from '../audio/engine';
import { scrollSpeed } from '../audio/scrollSpeed';
import { COLORS, FONTS, SPACING, CANVAS } from '../theme';
import type { AudioFrame } from '../types';

const PANEL_DPR_MAX = 1.5;
const HISTORY_MAX = 1200;
const BASE_PX_PER_FRAME = CANVAS.timelineScrollPx;
const PAD_V_PX = 8;
const MS_PER_DATA_FRAME = 1000 / 20; // 20 FPS analysis rate

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const F0_MIN = 60;
const F0_MAX = 900;
const LOG_MIN = Math.log2(F0_MIN);
const LOG_MAX = Math.log2(F0_MAX);

function f0ToY(f0: number, H: number, padV: number): number {
  const t = (Math.log2(Math.max(F0_MIN, Math.min(F0_MAX, f0))) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return padV + (H - padV * 2) * (1 - t);
}

function f0ToLabel(f0: number): { name: string; hz: string; tuning: string } {
  const midi = 69 + 12 * Math.log2(f0 / 440);
  const r = Math.round(midi);
  const cents = Math.round((midi - r) * 100);
  const name = NOTE_NAMES[((r % 12) + 12) % 12];
  const octave = Math.floor(r / 12) - 1;
  const sign = cents >= 0 ? '+' : '';
  return { name: `${name}${octave}`, hz: `${Math.round(f0)} Hz`, tuning: `${sign}${cents} ct` };
}

interface Entry { f0: number | null; confidence: number }

export function PitchTrackerPanel(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<Entry[]>([]);
  const currentRef = useRef<AudioFrame | null>(null);
  const lastFileIdRef = useRef(-1);
  const rafRef = useRef<number | null>(null);
  const lastDataTimeRef = useRef<number>(performance.now());

  useEffect(() => frameBus.subscribe((frame) => {
    if (frame.fileId !== lastFileIdRef.current) {
      lastFileIdRef.current = frame.fileId;
      historyRef.current = [];
    }
    historyRef.current.push({ f0: frame.f0Hz, confidence: frame.f0Confidence });
    if (historyRef.current.length > HISTORY_MAX) historyRef.current.shift();
    currentRef.current = frame;
    lastDataTimeRef.current = performance.now();
  }), []);

  useEffect(() => audioEngine.onReset(() => {
    historyRef.current = [];
    currentRef.current = null;
    lastFileIdRef.current = -1;
    lastDataTimeRef.current = performance.now();
  }), []);

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
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const padV = PAD_V_PX * dpr;

      ctx.fillStyle = COLORS.bg1;
      ctx.fillRect(0, 0, W, H);

      // Top border
      ctx.fillStyle = COLORS.border;
      ctx.fillRect(0, 0, W, 1);

      // Grid lines — labels on right
      const grid: [number, string, boolean][] = [
        [65.41,  'C2', true], [130.81, 'C3', true], [261.63, 'C4', true], [523.25, 'C5', true],
        [98.00,  'G2', false],[196.00, 'G3', false],[392.00, 'G4', false],[783.99, 'G5', false],
      ];
      for (const [hz, label, isC] of grid) {
        const y = Math.round(f0ToY(hz, H, padV)) + 0.5;
        ctx.strokeStyle = isC ? 'rgba(50,50,72,1)' : 'rgba(32,32,48,1)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.font = `${6.5 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = isC ? COLORS.textSecondary : COLORS.textDim;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, W - SPACING.xs * dpr, y - 1 * dpr);
      }

      // Sub-frame interpolation: continuously scroll left between data frames
      const pxPerFrame = BASE_PX_PER_FRAME * scrollSpeed.value * dpr;
      const elapsed = performance.now() - lastDataTimeRef.current;
      const subProg = Math.min(1, elapsed / MS_PER_DATA_FRAME);
      const subOffset = -subProg * pxPerFrame;

      // F0 trace — newest at right, scrolling left
      const history = historyRef.current;

      if (history.length > 1) {
        ctx.lineWidth = 1.5 * dpr;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        let prevX = -1;
        let prevY = -1;
        ctx.beginPath();
        let penDown = false;

        for (let i = 0; i < history.length; i++) {
          const x = W - (history.length - 1 - i) * pxPerFrame + subOffset;
          if (x < 0) { penDown = false; continue; }
          if (x > W + pxPerFrame) continue;

          const e = history[i];
          if (!e.f0 || e.confidence < 0.45) { penDown = false; prevX = x; prevY = -1; continue; }
          const y = f0ToY(e.f0, H, padV);

          if (!penDown || prevX < 0) {
            ctx.moveTo(x, y);
            penDown = true;
          } else {
            ctx.lineTo(x, y);
          }
          prevX = x;
          prevY = y;
        }
        ctx.strokeStyle = 'rgba(200,146,42,0.80)';
        ctx.shadowColor = 'rgba(200,146,42,0.30)';
        ctx.shadowBlur = 3 * dpr;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Head dot at newest valid point
        if (prevY > 0) {
          ctx.beginPath();
          ctx.arc(prevX, prevY, 3 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.waveform;
          ctx.shadowColor = 'rgba(200,146,42,0.5)';
          ctx.shadowBlur = 5 * dpr;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Live note readout — left side
      const cur = currentRef.current;
      const hasNote = cur?.f0Hz !== null && (cur?.f0Confidence ?? 0) > 0.45;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      if (hasNote && cur?.f0Hz) {
        const { name, hz, tuning } = f0ToLabel(cur.f0Hz);
        ctx.font = `${11 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = COLORS.waveform;
        ctx.fillText(name, SPACING.sm * dpr, SPACING.xs * dpr);
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = COLORS.textSecondary;
        ctx.fillText(hz, SPACING.sm * dpr, (SPACING.xs + 13) * dpr);
        ctx.font = `${7.5 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText(tuning, SPACING.sm * dpr, (SPACING.xs + 23) * dpr);
      } else {
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText('NO PITCH', SPACING.sm * dpr, SPACING.xs * dpr);
      }

      // Panel label
      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('F0 TRACK', SPACING.sm * dpr, H - SPACING.xs * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
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
  background: COLORS.bg1,
  overflow: 'hidden',
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};
