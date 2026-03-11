import { useEffect, useRef } from 'react';
import { frameBus } from '../audio/frameBus';
import { audioEngine } from '../audio/engine';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import type { AudioFrame } from '../types';

const PAD = SPACING.panelPad;
const BASE_SCROLL_PX = CANVAS.timelineScrollPx;
const WINDOW = 128;

export function WaveformScrollPanel(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFileIdRef = useRef(-1);
  const lastFrameRef = useRef<AudioFrame | null>(null);
  const scrollCarryRef = useRef(0);

  useEffect(() => {
    return frameBus.subscribe((frame) => {
      frameRef.current = frame;
    });
  }, []);

  useEffect(() => {
    return audioEngine.onReset(() => {
      frameRef.current = null;
      lastFrameRef.current = null;
      scrollCarryRef.current = 0;
      const offscreen = offscreenRef.current;
      if (!offscreen) return;
      const octx = offscreen.getContext('2d');
      if (octx) {
        octx.fillStyle = COLORS.bg2;
        octx.fillRect(0, 0, offscreen.width, offscreen.height);
      }
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
        scrollCarryRef.current = 0;
        const octx = offscreen.getContext('2d');
        if (octx) {
          octx.fillStyle = COLORS.bg2;
          octx.fillRect(0, 0, w, h);
        }
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

      if (frame && frame.fileId !== lastFileIdRef.current) {
        lastFileIdRef.current = frame.fileId;
        scrollCarryRef.current = 0;
        octx.fillStyle = COLORS.bg2;
        octx.fillRect(0, 0, W, H);
      }

      const isNewFrame = frame !== null && frame !== lastFrameRef.current;
      lastFrameRef.current = frame;

      if (isNewFrame && frame) {
        scrollCarryRef.current += BASE_SCROLL_PX * audioEngine.playbackRate;
        const scrollPx = Math.max(0, Math.floor(scrollCarryRef.current));

        if (scrollPx > 0) {
          scrollCarryRef.current -= scrollPx;

          octx.drawImage(offscreen, -scrollPx, 0);
          octx.fillStyle = COLORS.bg2;
          octx.fillRect(W - scrollPx, 0, scrollPx, H);

          const td = frame.timeDomain;
          const center = Math.floor(td.length / 2);
          const start = Math.max(0, center - WINDOW / 2);
          const end = Math.min(td.length, center + WINDOW / 2);

          let min = 0;
          let max = 0;
          for (let i = start; i < end; i++) {
            if (td[i] < min) min = td[i];
            if (td[i] > max) max = td[i];
          }

          const amp = Math.max(Math.abs(min), Math.abs(max)) * frame.displayGain;
          const h = Math.max(1, Math.min(amp * halfH, halfH));

          octx.fillStyle = COLORS.waveform;
          octx.fillRect(W - scrollPx, midY - h, scrollPx, h * 2);
        }
      }

      ctx.fillStyle = COLORS.bg2;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = COLORS.waveformGrid;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(padX, midY);
      ctx.lineTo(padX + drawW, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.beginPath();
      ctx.rect(padX, padY, drawW, drawH);
      ctx.clip();
      ctx.drawImage(offscreen, 0, 0);
      ctx.restore();

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
