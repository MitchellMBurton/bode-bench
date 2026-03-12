import { useEffect, useRef } from 'react';
import { frameBus } from '../audio/frameBus';
import { audioEngine } from '../audio/engine';
import { displayMode } from '../audio/displayMode';
import { scrollSpeed } from '../audio/scrollSpeed';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import type { AudioFrame } from '../types';

const PAD = SPACING.panelPad;
const BASE_SCROLL_PX = CANVAS.timelineScrollPx;
const PANEL_DPR_MAX = 1.25;
const NGE_BG = '#131a13';
const NGE_PERSISTENCE_FILL = 'rgba(19,26,19,0.85)';
const NGE_TRACE = '#a0d840';
const NGE_GRID = 'rgba(144,200,64,0.22)';
const NGE_LABEL = 'rgba(140,210,40,0.5)';
const BG_RGB = hexToRgb(COLORS.bg2);
const TRACE_RGB = hexToRgb(COLORS.waveform);
const NGE_BG_RGB = hexToRgb(NGE_BG);
const NGE_TRACE_RGB = hexToRgb(NGE_TRACE);

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function remapMonochromeCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fromBg: readonly [number, number, number],
  fromFg: readonly [number, number, number],
  toBg: readonly [number, number, number],
  toFg: readonly [number, number, number],
): void {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const srcVec = [
    fromFg[0] - fromBg[0],
    fromFg[1] - fromBg[1],
    fromFg[2] - fromBg[2],
  ] as const;
  const dstVec = [
    toFg[0] - toBg[0],
    toFg[1] - toBg[1],
    toFg[2] - toBg[2],
  ] as const;
  const denom = srcVec[0] * srcVec[0] + srcVec[1] * srcVec[1] + srcVec[2] * srcVec[2] || 1;

  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - fromBg[0];
    const dg = data[i + 1] - fromBg[1];
    const db = data[i + 2] - fromBg[2];
    const t = Math.max(0, Math.min(1, (dr * srcVec[0] + dg * srcVec[1] + db * srcVec[2]) / denom));
    data[i] = Math.round(toBg[0] + dstVec[0] * t);
    data[i + 1] = Math.round(toBg[1] + dstVec[1] * t);
    data[i + 2] = Math.round(toBg[2] + dstVec[2] * t);
  }

  ctx.putImageData(image, 0, 0);
}

export function WaveformScrollPanel(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFileIdRef = useRef(-1);
  const lastFrameRef = useRef<AudioFrame | null>(null);
  const scrollCarryRef = useRef(0);
  const lastNgeRef = useRef(displayMode.nge);

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
        octx.fillStyle = displayMode.nge ? NGE_BG : COLORS.bg2;
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
        const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
        const w = Math.round(width * dpr);
        const h = Math.round(height * dpr);
        canvas.width = w;
        canvas.height = h;
        offscreen.width = w;
        offscreen.height = h;
        scrollCarryRef.current = 0;
        const octx = offscreen.getContext('2d');
        if (octx) {
          octx.fillStyle = displayMode.nge ? NGE_BG : COLORS.bg2;
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
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.nge;
      const padX = PAD * dpr;
      const padY = PAD * dpr;
      const drawW = W - padX * 2;
      const drawH = H - padY * 2;
      const midY = padY + drawH / 2;
      const halfH = drawH / 2;
      const backgroundFill = nge ? NGE_BG : COLORS.bg2;
      const persistenceFill = nge ? NGE_PERSISTENCE_FILL : COLORS.bg2;
      const traceColor = nge ? NGE_TRACE : COLORS.waveform;
      const gridColor = nge ? NGE_GRID : COLORS.waveformGrid;
      const labelColor = nge ? NGE_LABEL : COLORS.textDim;
      const backgroundFillRgb = nge ? NGE_BG_RGB : BG_RGB;
      const traceColorRgb = nge ? NGE_TRACE_RGB : TRACE_RGB;

      if (nge !== lastNgeRef.current) {
        remapMonochromeCanvas(
          octx,
          W,
          H,
          lastNgeRef.current ? NGE_BG_RGB : BG_RGB,
          lastNgeRef.current ? NGE_TRACE_RGB : TRACE_RGB,
          backgroundFillRgb,
          traceColorRgb,
        );
        lastNgeRef.current = nge;
      }

      if (frame && frame.fileId !== lastFileIdRef.current) {
        lastFileIdRef.current = frame.fileId;
        scrollCarryRef.current = 0;
        octx.fillStyle = backgroundFill;
        octx.fillRect(0, 0, W, H);
      }

      const isNewFrame = frame !== null && frame !== lastFrameRef.current;
      lastFrameRef.current = frame;

      if (isNewFrame && frame) {
        scrollCarryRef.current += BASE_SCROLL_PX * audioEngine.playbackRate * scrollSpeed.value;
        const scrollPx = Math.max(0, Math.floor(scrollCarryRef.current));

        if (scrollPx > 0) {
          scrollCarryRef.current -= scrollPx;

          octx.drawImage(offscreen, -scrollPx, 0);
          octx.fillStyle = persistenceFill;
          octx.fillRect(W - scrollPx, 0, scrollPx, H);

          const peaks = audioEngine.waveformPeaks;
          const binSamples = audioEngine.waveformBinSamples;
          const gain = frame.displayGain;

          if (peaks) {
            // Map frame's current audio position to peak bin index.
            // Each bin = binSamples audio samples, so bin index = sample / binSamples.
            const currentBin = Math.floor((frame.currentTime * frame.sampleRate) / binSamples);

            octx.fillStyle = traceColor;
            for (let col = 0; col < scrollPx; col++) {
              // col=0 is the leftmost (oldest) new column; col=scrollPx-1 is newest (rightmost).
              const bin = currentBin - (scrollPx - 1 - col);
              if (bin < 0 || bin * 2 + 1 >= peaks.length) continue;
              const mn = peaks[bin * 2] * gain;
              const mx = peaks[bin * 2 + 1] * gain;
              const y1 = Math.round(midY - mx * halfH);
              const y2 = Math.round(midY - mn * halfH);
              octx.fillRect(W - scrollPx + col, y1, 1, Math.max(1, y2 - y1));
            }
          }
        }
      }

      ctx.fillStyle = backgroundFill;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = gridColor;
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
      ctx.fillStyle = labelColor;
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
