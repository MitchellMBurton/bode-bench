// ============================================================
// OscilloscopeScrollPanel — real-time scrolling time-domain tape.
//
// Unlike WaveformScrollPanel (which scrolls pre-computed peak bins
// from the full file), this panel reads the live AnalyserNode
// time-domain buffer at RAF rate and paints new columns as the
// audio advances — creating a high-resolution ECG-style display.
//
// Scroll is RAF-rate (dt-based), not gated on the 20fps frame bus,
// so it is smooth at all SCRL settings.
// ============================================================

import { useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useScrollSpeed, useTheaterMode } from '../core/session';
import type { VisualMode } from '../audio/displayMode';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import { hexToRgb, remapMonochromeCanvas } from '../utils/canvas';
import type { AudioFrame } from '../types';

const PAD = SPACING.panelPad;
const PANEL_DPR_MAX = 1.25;
const NGE_BG    = '#131a13';
const NGE_TRACE = '#a0d840';
const BG_RGB    = hexToRgb(COLORS.bg2);
const TRACE_RGB = hexToRgb(COLORS.waveform);
const NGE_BG_RGB    = hexToRgb(NGE_BG);
const NGE_TRACE_RGB = hexToRgb(NGE_TRACE);
const HYPER_BG = CANVAS.hyper.bg2;
const HYPER_TRACE = CANVAS.hyper.trace;
const HYPER_GRID = CANVAS.hyper.grid;
const HYPER_LABEL = CANVAS.hyper.label;
const HYPER_BG_RGB = hexToRgb(HYPER_BG);
const HYPER_TRACE_RGB = hexToRgb(HYPER_TRACE);

function getVisualPalette(mode: VisualMode): {
  bgFill: string;
  traceColor: string;
  gridColor: string;
  labelColor: string;
  bgRgb: readonly [number, number, number];
  traceRgb: readonly [number, number, number];
} {
  if (mode === 'nge') {
    return {
      bgFill: NGE_BG,
      traceColor: NGE_TRACE,
      gridColor: 'rgba(144,200,64,0.22)',
      labelColor: 'rgba(140,210,40,0.5)',
      bgRgb: NGE_BG_RGB,
      traceRgb: NGE_TRACE_RGB,
    };
  }

  if (mode === 'hyper') {
    return {
      bgFill: HYPER_BG,
      traceColor: HYPER_TRACE,
      gridColor: HYPER_GRID,
      labelColor: HYPER_LABEL,
      bgRgb: HYPER_BG_RGB,
      traceRgb: HYPER_TRACE_RGB,
    };
  }

  return {
    bgFill: COLORS.bg2,
    traceColor: COLORS.waveform,
    gridColor: COLORS.waveformGrid,
    labelColor: COLORS.textDim,
    bgRgb: BG_RGB,
    traceRgb: TRACE_RGB,
  };
}

// How many audio samples each horizontal pixel column represents.
// 256 samples @ 44100 Hz ≈ 5.8 ms/px; a 900-px panel shows ~5.2 s.
const SAMPLES_PER_PX = 256;

// Allocate once — reused every frame.
const TD_BUF = new Float32Array(CANVAS.fftSize);

export function OscilloscopeScrollPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const scrollSpeed = useScrollSpeed();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFileIdRef = useRef(-1);
  const lastModeRef = useRef<VisualMode>(displayMode.mode);
  const sampleCarryRef = useRef(0); // fractional-sample carry across frames
  const lastRafTimeRef = useRef(0);

  // Track latest frame only for fileId / displayGain
  useEffect(() => {
    return frameBus.subscribe((frame) => {
      frameRef.current = frame;
    });
  }, [frameBus]);

  useEffect(() => {
    return audioEngine.onReset(() => {
      frameRef.current = null;
      sampleCarryRef.current = 0;
      lastRafTimeRef.current = 0;
      const offscreen = offscreenRef.current;
      if (!offscreen) return;
      const octx = offscreen.getContext('2d');
      if (octx) {
        octx.fillStyle = getVisualPalette(displayMode.mode).bgFill;
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
        sampleCarryRef.current = 0;

        const octx = offscreen.getContext('2d');
        if (octx) {
          octx.fillStyle = getVisualPalette(displayMode.mode).bgFill;
          octx.fillRect(0, 0, w, h);
          if (snapshot) {
            octx.drawImage(snapshot, w - prevW, Math.round((h - prevH) / 2));
          }
        }
      }
    });
    ro.observe(canvas);

    if (theaterMode) {
      return () => {
        ro.disconnect();
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
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
      const { bgFill, traceColor, gridColor, labelColor, bgRgb, traceRgb } = getVisualPalette(mode);

      // Detect mode toggle — remap offscreen palette so scroll history is preserved
      if (mode !== lastModeRef.current) {
        const previousPalette = getVisualPalette(lastModeRef.current);
        remapMonochromeCanvas(
          octx, W, H,
          previousPalette.bgRgb,
          previousPalette.traceRgb,
          bgRgb,
          traceRgb,
        );
        lastModeRef.current = mode;
      }

      // Detect new file — clear offscreen
      const frame = frameRef.current;
      if (frame && frame.fileId !== lastFileIdRef.current) {
        lastFileIdRef.current = frame.fileId;
        sampleCarryRef.current = 0;
        lastRafTimeRef.current = 0;
        octx.fillStyle = bgFill;
        octx.fillRect(0, 0, W, H);
      }

      // RAF-rate scroll using real elapsed time
      const now = performance.now();
      const dtSec = lastRafTimeRef.current > 0
        ? Math.min((now - lastRafTimeRef.current) / 1000, 0.1)
        : 0;
      lastRafTimeRef.current = now;

      if (audioEngine.isPlaying && dtSec > 0) {
        const sampleRate = audioEngine.sampleRate;
        // Accumulate samples advanced this frame; divide by SAMPLES_PER_PX to get pixels
        sampleCarryRef.current += dtSec * sampleRate * audioEngine.playbackRate * scrollSpeed.value;
        const scrollPx = Math.min(
          Math.max(0, Math.floor(sampleCarryRef.current / SAMPLES_PER_PX)),
          Math.floor(TD_BUF.length / SAMPLES_PER_PX), // cap: can't exceed one buffer
        );

        if (scrollPx > 0) {
          sampleCarryRef.current -= scrollPx * SAMPLES_PER_PX;

          // Pull latest time-domain data from the analyser
          audioEngine.getTimeDomainData(TD_BUF);
          const bufLen = TD_BUF.length;
          const gain = frame?.displayGain ?? audioEngine.displayGain;

          // Shift offscreen left, clear right strip
          octx.drawImage(offscreen, -scrollPx, 0);
          octx.fillStyle = bgFill;
          octx.fillRect(W - scrollPx, 0, scrollPx, H);

          // Paint new columns — each 1px wide, one min/max bar
          octx.fillStyle = traceColor;
          for (let col = 0; col < scrollPx; col++) {
            // col=0 is leftmost (oldest); col=scrollPx-1 is rightmost (newest)
            const end = bufLen - (scrollPx - 1 - col) * SAMPLES_PER_PX;
            const start = Math.max(0, end - SAMPLES_PER_PX);
            let mn = 0;
            let mx = 0;
            for (let s = start; s < end; s++) {
              const v = TD_BUF[s];
              if (v < mn) mn = v;
              if (v > mx) mx = v;
            }
            const y1 = Math.round(midY - mx * gain * halfH);
            const y2 = Math.round(midY - mn * gain * halfH);
            octx.fillRect(W - scrollPx + col, y1, 1, Math.max(1, y2 - y1));
          }
        }
      }

      // Composite to display canvas
      ctx.fillStyle = bgFill;
      ctx.fillRect(0, 0, W, H);

      // Zero/grid lines drawn directly on display canvas (not in offscreen)
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

      // Amplitude labels
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
      ctx.fillText('OSC SCROLL', W - 8 * dpr, 6 * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [audioEngine, displayMode, scrollSpeed, theaterMode]);

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



