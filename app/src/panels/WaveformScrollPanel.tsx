// ============================================================
// Waveform Scroll Panel — scrolling amplitude time-history
// Thin 1px strokes with 1px gaps, each showing min/max of a
// short (128-sample) window. Produces the "hair" envelope look.
// ============================================================

import { useEffect, useRef } from 'react';
import { frameBus } from '../audio/frameBus';
import { audioEngine } from '../audio/engine';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import type { AudioFrame } from '../types';

const PAD = SPACING.panelPad;
const SCROLL_PX = CANVAS.timelineScrollPx;  // synced with spectrogram
const COL_W = SCROLL_PX;                    // fill every column (no gaps at 1px/frame)
const WINDOW = 128;     // samples per column — ~3ms at 44.1kHz

export function WaveformScrollPanel(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFileIdRef = useRef(-1);
  const lastFrameRef = useRef<AudioFrame | null>(null);

  useEffect(() => {
    const unsub = frameBus.subscribe((f) => { frameRef.current = f; });
    return unsub;
  }, []);

  useEffect(() => {
    return audioEngine.onReset(() => {
      frameRef.current = null;
      lastFrameRef.current = null;
      const offscreen = offscreenRef.current;
      if (!offscreen) return;
      const octx = offscreen.getContext('2d');
      if (octx) { octx.fillStyle = COLORS.bg2; octx.fillRect(0, 0, offscreen.width, offscreen.height); }
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const offscreen = document.createElement('canvas');
    offscreenRef.current = offscreen;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const w = Math.round(width * devicePixelRatio);
        const h = Math.round(height * devicePixelRatio);
        canvas.width = w;
        canvas.height = h;
        offscreen.width = w;
        offscreen.height = h;
        const octx = offscreen.getContext('2d');
        if (octx) { octx.fillStyle = COLORS.bg2; octx.fillRect(0, 0, w, h); }
      }
    });
    ro.observe(canvas);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const frame = frameRef.current;
      const ctx = canvas.getContext('2d');
      const octx = offscreen.getContext('2d');
      if (!ctx || !octx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = devicePixelRatio;

      const padX = PAD * dpr;
      const padY = PAD * dpr;
      const drawW = W - padX * 2;
      const drawH = H - padY * 2;
      const midY = padY + drawH / 2;
      const halfH = drawH / 2;

      // Clear history only when a new file is loaded
      if (frame && frame.fileId !== lastFileIdRef.current) {
        lastFileIdRef.current = frame.fileId;
        octx.fillStyle = COLORS.bg2;
        octx.fillRect(0, 0, W, H);
      }

      // Only scroll and append when a genuinely new frame arrived (freeze on pause)
      const isNewFrame = frame !== null && frame !== lastFrameRef.current;
      lastFrameRef.current = frame;

      if (isNewFrame && frame) {
        // Scroll left
        octx.drawImage(offscreen, -SCROLL_PX, 0);
        octx.fillStyle = COLORS.bg2;
        octx.fillRect(W - SCROLL_PX, 0, SCROLL_PX, H);

        const td = frame.timeDomain;
        // Sample from center of the buffer — avoids edge artefacts
        const center = Math.floor(td.length / 2);
        const start = Math.max(0, center - WINDOW / 2);
        const end = Math.min(td.length, center + WINDOW / 2);

        let min = 0;
        let max = 0;
        for (let i = start; i < end; i++) {
          if (td[i] < min) min = td[i];
          if (td[i] > max) max = td[i];
        }

        // Symmetric: use the larger of abs(min) / abs(max), scaled by display gain
        const amp = Math.max(Math.abs(min), Math.abs(max)) * frame.displayGain;
        const h = Math.max(COL_W, Math.min(amp * halfH, halfH));

        // Single 1px column at the right edge
        octx.fillStyle = COLORS.waveform;
        octx.fillRect(W - COL_W, midY - h, COL_W, h * 2);
      }

      // Blit to main canvas
      ctx.fillStyle = COLORS.bg2;
      ctx.fillRect(0, 0, W, H);

      // Zero line (behind history)
      ctx.strokeStyle = COLORS.waveformGrid;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(padX, midY);
      ctx.lineTo(padX + drawW, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Clip to draw area and blit
      ctx.save();
      ctx.beginPath();
      ctx.rect(padX, padY, drawW, drawH);
      ctx.clip();
      ctx.drawImage(offscreen, 0, 0);
      ctx.restore();

      // Labels
      ctx.font = `${9 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (const [label, amp] of [['+1', 1], ['0', 0], ['-1', -1]] as const) {
        const y = midY - (amp as number) * halfH;
        ctx.fillText(label, padX + 2, y);
      }

      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('WAVEFORM', W - 8 * dpr, 6 * dpr);
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
  position: 'relative',
  overflow: 'hidden',
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};
