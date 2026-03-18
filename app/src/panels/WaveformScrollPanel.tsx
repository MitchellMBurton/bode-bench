import { useCallback, useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useScrollSpeed, useTheaterMode } from '../core/session';
import type { VisualMode } from '../audio/displayMode';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import { hexToRgb, remapMonochromeCanvas } from '../utils/canvas';
import { shouldSkipFrame } from '../utils/rafGuard';
import type { AudioFrame } from '../types';

const PAD = SPACING.panelPad;
const BASE_SCROLL_PX = CANVAS.timelineScrollPx;
const PANEL_DPR_MAX = 1.25;
const LIVE_SAMPLES_PER_PX = 256;
const LIVE_HISTORY_BACKWARD_CLEAR_S = 0.35;
const LIVE_HISTORY_FORWARD_CLEAR_S = 1.5;
const LIVE_GAIN_PEAK_FLOOR = 0.02;
const LIVE_GAIN_ATTACK = 0.18;
const LIVE_GAIN_RELEASE = 0.05;
const LIVE_GAIN_MAX = 28; // cinema audio peaks at −24 LUFS needs up to ~29 dB of visual gain
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
const EVA_BG = CANVAS.eva.bg2;
const EVA_PERSISTENCE_FILL = CANVAS.eva.persistenceFill;
const EVA_TRACE = CANVAS.eva.trace;
const EVA_GRID = CANVAS.eva.grid;
const EVA_LABEL = CANVAS.eva.label;
const BG_RGB = hexToRgb(COLORS.bg2);
const TRACE_RGB = hexToRgb(COLORS.waveform);
const NGE_BG_RGB = hexToRgb(NGE_BG);
const NGE_TRACE_RGB = hexToRgb(NGE_TRACE);
const HYPER_BG_RGB = hexToRgb(HYPER_BG);
const HYPER_TRACE_RGB = hexToRgb(HYPER_TRACE);
const EVA_BG_RGB = hexToRgb(EVA_BG);
const EVA_TRACE_RGB = hexToRgb(EVA_TRACE);
const TD_BUF = new Float32Array(CANVAS.fftSize);

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

  if (mode === 'eva') {
    return {
      backgroundFill: EVA_BG,
      persistenceFill: EVA_PERSISTENCE_FILL,
      traceColor: EVA_TRACE,
      gridColor: EVA_GRID,
      labelColor: EVA_LABEL,
      backgroundFillRgb: EVA_BG_RGB,
      traceColorRgb: EVA_TRACE_RGB,
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

function clearWaveformHistory(offscreen: HTMLCanvasElement | null, mode: VisualMode): void {
  if (!offscreen) return;
  const octx = offscreen.getContext('2d');
  if (!octx) return;
  const palette = getVisualPalette(mode);
  octx.fillStyle = palette.backgroundFill;
  octx.fillRect(0, 0, offscreen.width, offscreen.height);
}

function rebuildWaveformHistory(
  offscreen: HTMLCanvasElement | null,
  mode: VisualMode,
  audioEngine: ReturnType<typeof useAudioEngine>,
  scrollSpeedValue: number,
): void {
  if (!offscreen || offscreen.width === 0 || offscreen.height === 0) return;

  const octx = offscreen.getContext('2d');
  if (!octx) return;

  const peaks = audioEngine.waveformPeaks;
  const sampleRate = audioEngine.sampleRate;
  const binSamples = audioEngine.waveformBinSamples;
  const palette = getVisualPalette(mode);
  const width = offscreen.width;
  const height = offscreen.height;
  const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
  const padX = PAD * dpr;
  const padY = PAD * dpr;
  const drawW = width - padX * 2;
  const drawH = height - padY * 2;
  const midY = padY + drawH / 2;
  const halfH = drawH / 2;
  const pxPerSec = BASE_SCROLL_PX * 20 * scrollSpeedValue * audioEngine.playbackRate;

  octx.fillStyle = palette.backgroundFill;
  octx.fillRect(0, 0, width, height);

  if (!peaks || drawW <= 0 || drawH <= 0 || pxPerSec <= 0) {
    return;
  }

  const gain = audioEngine.displayGain;
  const startX = Math.max(0, Math.floor(padX));
  const endX = Math.min(width, Math.ceil(padX + drawW));
  const rightmostX = endX - 1;
  const secondsPerPixel = 1 / pxPerSec;

  octx.fillStyle = palette.traceColor;
  for (let x = startX; x < endX; x++) {
    const agePx = rightmostX - x;
    const time = audioEngine.currentTime - agePx * secondsPerPixel;
    if (time < 0) continue;

    const bin = Math.floor((time * sampleRate) / binSamples);
    if (bin < 0 || bin * 2 + 1 >= peaks.length) continue;

    const mn = peaks[bin * 2] * gain;
    const mx = peaks[bin * 2 + 1] * gain;
    const y1 = Math.round(midY - mx * halfH);
    const y2 = Math.round(midY - mn * halfH);
    octx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }
}

function paintLiveWaveformColumns(
  octx: CanvasRenderingContext2D,
  width: number,
  scrollPx: number,
  midY: number,
  halfH: number,
  gain: number,
  traceColor: string,
): void {
  if (scrollPx <= 0) return;

  octx.fillStyle = traceColor;
  const sampleCount = TD_BUF.length;
  for (let col = 0; col < scrollPx; col++) {
    const end = sampleCount - (scrollPx - 1 - col) * LIVE_SAMPLES_PER_PX;
    const start = Math.max(0, end - LIVE_SAMPLES_PER_PX);
    let mn = 0;
    let mx = 0;
    for (let sample = start; sample < end; sample++) {
      const value = TD_BUF[sample];
      if (value < mn) mn = value;
      if (value > mx) mx = value;
    }
    const y1 = Math.round(midY - mx * gain * halfH);
    const y2 = Math.round(midY - mn * gain * halfH);
    octx.fillRect(width - scrollPx + col, y1, 1, Math.max(1, y2 - y1));
  }
}

function createSnapshot(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  if (canvas.width <= 0 || canvas.height <= 0) return null;
  const snapshot = document.createElement('canvas');
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  const sctx = snapshot.getContext('2d');
  if (!sctx) return null;
  sctx.drawImage(canvas, 0, 0);
  return snapshot;
}

function isLiveHistoryDiscontinuity(currentTime: number, previousTime: number | null): boolean {
  if (previousTime === null) return false;
  const actualAdvance = currentTime - previousTime;
  if (actualAdvance <= -LIVE_HISTORY_BACKWARD_CLEAR_S) return true;
  return actualAdvance >= LIVE_HISTORY_FORWARD_CLEAR_S;
}

function nextLiveDisplayGain(previous: number, peak: number): number {
  const normalizedPeak = Math.max(LIVE_GAIN_PEAK_FLOOR, peak);
  const target = Math.max(1, Math.min(LIVE_GAIN_MAX, 0.9 / normalizedPeak));
  const blend = target > previous ? LIVE_GAIN_ATTACK : LIVE_GAIN_RELEASE;
  return previous + (target - previous) * blend;
}

export function WaveformScrollPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const scrollSpeed = useScrollSpeed();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverReadoutRef = useRef<HTMLDivElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  const handleWaveScrollMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const readout = hoverReadoutRef.current;
    const canvas = canvasRef.current;
    if (!readout || !canvas) return;
    const H = canvas.offsetHeight;
    if (H === 0) return;
    const amp = 1 - 2 * (e.nativeEvent.offsetY / H);
    const absAmp = Math.abs(amp);
    const db = absAmp > 0.0001 ? (20 * Math.log10(absAmp)).toFixed(1) : '< −80';
    const sign = amp >= 0 ? '+' : '−';
    readout.style.display = 'block';
    readout.textContent = `${sign}${absAmp.toFixed(3)}   ${db} dBFS`;
  }, []);

  const handleWaveScrollMouseLeave = useCallback(() => {
    const readout = hoverReadoutRef.current;
    if (readout) readout.style.display = 'none';
  }, []);
  const frameRef = useRef<AudioFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFileIdRef = useRef(-1);
  const scrollCarryRef = useRef(0);
  const lastModeRef = useRef<VisualMode>(displayMode.mode);
  const lastRafTimeRef = useRef(0);
  const lastCurrentTimeRef = useRef<number | null>(null);
  const lastHistorySourceRef = useRef<'peaks' | 'live' | null>(null);
  const liveDisplayGainRef = useRef(1);

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
      lastCurrentTimeRef.current = null;
      lastHistorySourceRef.current = null;
      liveDisplayGainRef.current = 1;
      clearWaveformHistory(offscreenRef.current, displayMode.mode);
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
        const nextWidth = Math.round(width * dpr);
        const nextHeight = Math.round(height * dpr);
        const peaks = audioEngine.waveformPeaks;
        const snapshot = peaks ? null : createSnapshot(offscreen);
        const prevWidth = offscreen.width;
        const prevHeight = offscreen.height;

        canvas.width = nextWidth;
        canvas.height = nextHeight;
        offscreen.width = nextWidth;
        offscreen.height = nextHeight;
        scrollCarryRef.current = 0;
        lastRafTimeRef.current = 0;
        lastCurrentTimeRef.current = audioEngine.currentTime;
        liveDisplayGainRef.current = 1;

        if (audioEngine.duration > 0 && peaks) {
          rebuildWaveformHistory(offscreen, displayMode.mode, audioEngine, scrollSpeed.value);
          lastHistorySourceRef.current = 'peaks';
        } else {
          clearWaveformHistory(offscreen, displayMode.mode);
          if (snapshot) {
            const octx = offscreen.getContext('2d');
            if (octx) {
              octx.drawImage(snapshot, nextWidth - prevWidth, Math.round((nextHeight - prevHeight) / 2));
            }
          }
          lastHistorySourceRef.current = 'live';
        }
      }
    });
    ro.observe(canvas);

    if (audioEngine.duration > 0 && audioEngine.waveformPeaks) {
      rebuildWaveformHistory(offscreen, displayMode.mode, audioEngine, scrollSpeed.value);
      lastHistorySourceRef.current = 'peaks';
    } else {
      clearWaveformHistory(offscreen, displayMode.mode);
      lastHistorySourceRef.current = 'live';
    }
    lastCurrentTimeRef.current = audioEngine.currentTime;
    liveDisplayGainRef.current = 1;

    if (theaterMode) {
      return () => {
        ro.disconnect();
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (shouldSkipFrame()) return;
      const frame = frameRef.current;
      const ctx = canvas.getContext('2d');
      const octx = offscreen.getContext('2d');
      if (!ctx || !octx) return;

      const width = canvas.width;
      const height = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const mode = displayMode.mode;
      const padX = PAD * dpr;
      const padY = PAD * dpr;
      const drawW = width - padX * 2;
      const drawH = height - padY * 2;
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
          width,
          height,
          previousPalette.backgroundFillRgb,
          previousPalette.traceColorRgb,
          backgroundFillRgb,
          traceColorRgb,
        );
        lastModeRef.current = mode;
      }

      const peaks = audioEngine.waveformPeaks;
      const historySource: 'peaks' | 'live' = peaks ? 'peaks' : 'live';
      if (historySource !== lastHistorySourceRef.current) {
        scrollCarryRef.current = 0;
        lastRafTimeRef.current = 0;
        lastCurrentTimeRef.current = audioEngine.currentTime;
        liveDisplayGainRef.current = 1;
        if (historySource === 'peaks') {
          rebuildWaveformHistory(offscreen, mode, audioEngine, scrollSpeed.value);
        } else {
          clearWaveformHistory(offscreen, mode);
        }
        lastHistorySourceRef.current = historySource;
      }

      if (frame && frame.fileId !== lastFileIdRef.current) {
        lastFileIdRef.current = frame.fileId;
        scrollCarryRef.current = 0;
        lastRafTimeRef.current = 0;
        lastCurrentTimeRef.current = audioEngine.currentTime;
        liveDisplayGainRef.current = 1;
        clearWaveformHistory(offscreen, mode);
      }

      const now = performance.now();
      const dtSec = lastRafTimeRef.current > 0
        ? Math.min((now - lastRafTimeRef.current) / 1000, 0.1)
        : 0;
      lastRafTimeRef.current = now;

      if (audioEngine.isPlaying && dtSec > 0) {
        const pxPerSec = BASE_SCROLL_PX * 20 * scrollSpeed.value * audioEngine.playbackRate;
        const currentTime = audioEngine.currentTime;

        if (historySource === 'live') {
          if (isLiveHistoryDiscontinuity(currentTime, lastCurrentTimeRef.current)) {
            clearWaveformHistory(offscreen, mode);
            scrollCarryRef.current = 0;
            liveDisplayGainRef.current = 1;
          }

          scrollCarryRef.current += dtSec * audioEngine.sampleRate * audioEngine.playbackRate * scrollSpeed.value;
          const scrollPx = Math.min(
            Math.max(0, Math.floor(scrollCarryRef.current / LIVE_SAMPLES_PER_PX)),
            Math.floor(TD_BUF.length / LIVE_SAMPLES_PER_PX),
          );

          if (scrollPx > 0) {
            scrollCarryRef.current -= scrollPx * LIVE_SAMPLES_PER_PX;
            octx.drawImage(offscreen, -scrollPx, 0);
            octx.fillStyle = persistenceFill;
            octx.fillRect(width - scrollPx, 0, scrollPx, height);
            audioEngine.getTimeDomainData(TD_BUF);
            const livePeak = frame ? Math.max(frame.peakLeft, frame.peakRight) : LIVE_GAIN_PEAK_FLOOR;
            liveDisplayGainRef.current = nextLiveDisplayGain(liveDisplayGainRef.current, livePeak);
            const gain = Math.max(frame?.displayGain ?? audioEngine.displayGain, liveDisplayGainRef.current);
            paintLiveWaveformColumns(octx, width, scrollPx, midY, halfH, gain, traceColor);
          }
        } else {
          scrollCarryRef.current += pxPerSec * dtSec;
          const scrollPx = Math.max(0, Math.floor(scrollCarryRef.current));

          if (scrollPx > 0 && peaks) {
            scrollCarryRef.current -= scrollPx;
            octx.drawImage(offscreen, -scrollPx, 0);
            octx.fillStyle = persistenceFill;
            octx.fillRect(width - scrollPx, 0, scrollPx, height);

            const binSamples = audioEngine.waveformBinSamples;
            const gain = frame?.displayGain ?? audioEngine.displayGain;
            const sampleRate = audioEngine.sampleRate;
            const currentBin = Math.floor((currentTime * sampleRate) / binSamples);

            octx.fillStyle = traceColor;
            for (let col = 0; col < scrollPx; col++) {
              const bin = currentBin - (scrollPx - 1 - col);
              if (bin < 0 || bin * 2 + 1 >= peaks.length) continue;
              const mn = peaks[bin * 2] * gain;
              const mx = peaks[bin * 2 + 1] * gain;
              const y1 = Math.round(midY - mx * halfH);
              const y2 = Math.round(midY - mn * halfH);
              octx.fillRect(width - scrollPx + col, y1, 1, Math.max(1, y2 - y1));
            }
          }
        }

        lastCurrentTimeRef.current = currentTime;
      } else {
        lastCurrentTimeRef.current = audioEngine.currentTime;
      }

      ctx.fillStyle = backgroundFill;
      ctx.fillRect(0, 0, width, height);

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
      ctx.fillText(historySource === 'live' ? 'WAVEFORM / LIVE' : 'WAVEFORM', width - 8 * dpr, 6 * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [audioEngine, displayMode, scrollSpeed, theaterMode]);

  return (
    <div style={panelStyle}>
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        onMouseMove={handleWaveScrollMouseMove}
        onMouseLeave={handleWaveScrollMouseLeave}
      />
      <div ref={hoverReadoutRef} className="panel-hover-readout" />
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
