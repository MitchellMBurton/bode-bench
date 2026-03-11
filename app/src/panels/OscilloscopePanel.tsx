// ============================================================
// Oscilloscope Panel — top-right quadrant
// Renders time-domain waveform with stable trigger.
// ============================================================

import { useEffect, useRef } from 'react';
import { frameBus } from '../audio/frameBus';
import { audioEngine } from '../audio/engine';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import type { AudioFrame } from '../types';

const PAD = SPACING.panelPad;
const TRIGGER_THRESHOLD = CANVAS.oscTriggerThreshold;

export function OscilloscopePanel(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = frameBus.subscribe((f) => { frameRef.current = f; });
    return unsub;
  }, []);

  useEffect(() => {
    return audioEngine.onReset(() => { frameRef.current = null; });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = Math.round(width * devicePixelRatio);
        canvas.height = Math.round(height * devicePixelRatio);
      }
    });
    ro.observe(canvas);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const frame = frameRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = devicePixelRatio;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = COLORS.bg2;
      ctx.fillRect(0, 0, W, H);

      const padX = PAD * dpr;
      const padY = PAD * dpr;
      const drawW = W - padX * 2;
      const drawH = H - padY * 2;
      const midY = padY + drawH / 2;

      // Grid lines
      ctx.strokeStyle = COLORS.waveformGrid;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 4]);
      // Zero line
      ctx.beginPath();
      ctx.moveTo(padX, midY);
      ctx.lineTo(padX + drawW, midY);
      ctx.stroke();
      // +0.5 and -0.5 lines
      for (const amp of [0.5, -0.5]) {
        const y = midY - amp * (drawH / 2);
        ctx.beginPath();
        ctx.moveTo(padX, y);
        ctx.lineTo(padX + drawW, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Amplitude labels
      ctx.font = `${9 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (const [label, amp] of [['+1', 1], ['+0.5', 0.5], ['0', 0], ['-0.5', -0.5], ['-1', -1]] as const) {
        const y = midY - (amp as number) * (drawH / 2);
        ctx.fillText(label, padX + 2, y);
      }

      if (!frame) {
        // Idle: flat line
        ctx.strokeStyle = COLORS.waveformGrid;
        ctx.lineWidth = CANVAS.oscLineWidth * dpr;
        ctx.beginPath();
        ctx.moveTo(padX, midY);
        ctx.lineTo(padX + drawW, midY);
        ctx.stroke();
        drawLabel(ctx, W, H, dpr);
        return;
      }

      const td = frame.timeDomain;
      const len = td.length;

      // Find trigger point: first zero crossing going positive
      let triggerIdx = 0;
      for (let i = 1; i < len - 1; i++) {
        if (td[i - 1] < TRIGGER_THRESHOLD && td[i] >= TRIGGER_THRESHOLD) {
          triggerIdx = i;
          break;
        }
      }

      const samples = Math.min(len - triggerIdx, Math.floor(drawW));
      const gain = frame.displayGain;

      ctx.strokeStyle = COLORS.waveform;
      ctx.lineWidth = CANVAS.oscLineWidth * dpr;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < samples; i++) {
        const x = padX + (i / (samples - 1)) * drawW;
        const y = midY - td[triggerIdx + i] * gain * (drawH / 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      drawLabel(ctx, W, H, dpr);
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

function drawLabel(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number): void {
  ctx.font = `${9 * dpr}px ${FONTS.mono}`;
  ctx.fillStyle = COLORS.textDim;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('OSCILLOSCOPE', W - 8 * dpr, 6 * dpr);
}

const panelStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: COLORS.bg2,
  position: 'relative',
  overflow: 'hidden',
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};
