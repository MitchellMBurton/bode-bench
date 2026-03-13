import { useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useScrollSpeed } from '../core/session';
import type { VisualMode } from '../audio/displayMode';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import { hexToRgb, remapMonochromeCanvas } from '../utils/canvas';
import type { AudioFrame } from '../types';

const PAD = SPACING.panelPad;
const BASE_SCROLL_PX = CANVAS.timelineScrollPx;
const PANEL_DPR_MAX = 1.25;
const NGE_BG = '#131a13';
const NGE_PERSISTENCE_FILL = 'rgba(19,26,19,0.85)';
const NGE_TRACE = '#a0d840';
const NGE_GRID = 'rgba(144,200,64,0.22)';
const NGE_LABEL = 'rgba(140,210,40,0.5)';
const HYPER_BG = CANVAS.hyper.bg2;
const HYPER_PERSISTENCE_FILL = CANVAS.hyper.persistenceFill;
const HYPER_TRACE = CANVAS.hyper.trace;
const HYPER_GRID = CANVAS.hyper.grid;
const HYPER_LABEL = CANVAS.hyper.label;
const BG_RGB = hexToRgb(COLORS.bg2);
const TRACE_RGB = hexToRgb(COLORS.waveform);
const NGE_BG_RGB = hexToRgb(NGE_BG);
const NGE_TRACE_RGB = hexToRgb(NGE_TRACE);
const HYPER_BG_RGB = hexToRgb(HYPER_BG);
const HYPER_TRACE_RGB = hexToRgb(HYPER_TRACE);

function getVisualPalette(mode: VisualMode): {
  backgroundFill: string;
  persistenceFill: string;
  traceColor: string;
  gridColor: string;
  labelColor: string;
  backgroundFillRgb: readonly [number, number, number];
  traceColorRgb: readonly [number, number, number];
} {
  if (mode === 'nge') {
    return {
      backgroundFill: NGE_BG,
      persistenceFill: NGE_PERSISTENCE_FILL,
      traceColor: NGE_TRACE,
      gridColor: NGE_GRID,
      labelColor: NGE_LABEL,
      backgroundFillRgb: NGE_BG_RGB,
      traceColorRgb: NGE_TRACE_RGB,
    };
  }

  if (mode === 'hyper') {
    return {
      backgroundFill: HYPER_BG,
      persistenceFill: HYPER_PERSISTENCE_FILL,
      traceColor: HYPER_TRACE,
      gridColor: HYPER_GRID,
      labelColor: HYPER_LABEL,
      backgroundFillRgb: HYPER_BG_RGB,
      traceColorRgb: HYPER_TRACE_RGB,
    };
  }

  return {
    backgroundFill: COLORS.bg2,
    persistenceFill: COLORS.bg2,
    traceColor: COLORS.waveform,
    gridColor: COLORS.waveformGrid,
    labelColor: COLORS.textDim,
    backgroundFillRgb: BG_RGB,
    traceColorRgb: TRACE_RGB,
  };
}

export function WaveformScrollPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const scrollSpeed = useScrollSpeed();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFileIdRef = useRef(-1);
  const scrollCarryRef = useRef(0);
  const lastModeRef = useRef<VisualMode>(displayMode.mode);
  const lastRafTimeRef = useRef(0); // performance.now() of last RAF tick

  useEffect(() => {
    return frameBus.subscribe((frame) => {
      frameRef.current = frame;
    });
  }, [frameBus]);

  useEffect(() => {
    return audioEngine.onReset(() => {
      frameRef.current = null;
      lastRafTimeRef.current = 0;
      scrollCarryRef.current = 0;
      const offscreen = offscreenRef.current;
      if (!offscreen) return;
      const octx = offscreen.getContext('2d');
      if (octx) {
        octx.fillStyle = getVisualPalette(displayMode.mode).backgroundFill;
        octx.fillRect(0, 0, offscreen.width, offscreen.height);
      }
    });
  }, [audioEngine, displayMode]);

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

        // Snapshot existing content before resize clears it, then blit back
        // right-aligned so the newest (right-edge) history is always preserved.
        const prevW = offscreen.width;
        const prevH = offscreen.height;
        let snapshot: HTMLCanvasElement | null = null;
        if (prevW > 0 && prevH > 0) {
          snapshot = document.createElement('canvas');
          snapshot.width = prevW;
          snapshot.height = prevH;
          snapshot.getContext('2d')?.drawImage(offscreen, 0, 0);
        }

        canvas.width = w;
        canvas.height = h;
        offscreen.width = w;
        offscreen.height = h;
        scrollCarryRef.current = 0;

        const octx = offscreen.getContext('2d');
        if (octx) {
          octx.fillStyle = getVisualPalette(displayMode.mode).backgroundFill;
          octx.fillRect(0, 0, w, h);
          if (snapshot) {
            octx.drawImage(snapshot, w - prevW, Math.round((h - prevH) / 2));
          }
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
      const mode = displayMode.mode;
      const padX = PAD * dpr;
      const padY = PAD * dpr;
      const drawW = W - padX * 2;
      const drawH = H - padY * 2;
      const midY = padY + drawH / 2;
      const halfH = drawH / 2;
      const {
        backgroundFill,
        persistenceFill,
        traceColor,
        gridColor,
        labelColor,
        backgroundFillRgb,
        traceColorRgb,
      } = getVisualPalette(mode);

      if (mode !== lastModeRef.current) {
        const previousPalette = getVisualPalette(lastModeRef.current);
        remapMonochromeCanvas(
          octx,
          W,
          H,
          previousPalette.backgroundFillRgb,
          previousPalette.traceColorRgb,
          backgroundFillRgb,
          traceColorRgb,
        );
        lastModeRef.current = mode;
      }

      if (frame && frame.fileId !== lastFileIdRef.current) {
        lastFileIdRef.current = frame.fileId;
        scrollCarryRef.current = 0;
        lastRafTimeRef.current = 0;
        octx.fillStyle = backgroundFill;
        octx.fillRect(0, 0, W, H);
      }

      // RAF-rate scroll: advance every frame based on real elapsed time rather than
      // waiting for the 20fps frame bus. This eliminates the "jump then freeze" stutter
      // visible at higher scroll speeds. dt is capped at 100ms to handle tab-unfocus.
      const now = performance.now();
      const dtSec = lastRafTimeRef.current > 0
        ? Math.min((now - lastRafTimeRef.current) / 1000, 0.1)
        : 0;
      lastRafTimeRef.current = now;

      if (audioEngine.isPlaying && dtSec > 0) {
        // px/sec = BASE_SCROLL_PX × ANALYSIS_FPS × multipliers
        // (matches the old per-frame rate of BASE_SCROLL_PX × playbackRate × scrollSpeed)
        const pxPerSec = BASE_SCROLL_PX * 20 * scrollSpeed.value * audioEngine.playbackRate;
        scrollCarryRef.current += pxPerSec * dtSec;
        const scrollPx = Math.max(0, Math.floor(scrollCarryRef.current));

        if (scrollPx > 0) {
          scrollCarryRef.current -= scrollPx;

          octx.drawImage(offscreen, -scrollPx, 0);
          octx.fillStyle = persistenceFill;
          octx.fillRect(W - scrollPx, 0, scrollPx, H);

          const peaks = audioEngine.waveformPeaks;
          const binSamples = audioEngine.waveformBinSamples;
          const gain = frame?.displayGain ?? audioEngine.displayGain;
          const currentTime = audioEngine.currentTime;
          const sampleRate = audioEngine.sampleRate;

          if (peaks) {
            const currentBin = Math.floor((currentTime * sampleRate) / binSamples);

            octx.fillStyle = traceColor;
            for (let col = 0; col < scrollPx; col++) {
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
  }, [audioEngine, displayMode, scrollSpeed]);

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
