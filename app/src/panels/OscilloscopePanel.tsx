// ============================================================
// OscilloscopePanel — triggered time-domain waveform.
// Reads time-domain samples DIRECTLY from the engine analyser
// every RAF frame (~60fps) rather than the 20fps frame bus.
// This eliminates the visible frame-rate stepping on the waveform.
//
// NGE mode: phosphor persistence — a semi-transparent fill
// replaces the hard clear, so previous traces fade like a CRT.
// ============================================================

import { useCallback, useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useTheaterMode } from '../core/session';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import { shouldSkipFrame } from '../utils/rafGuard';
import { useMeasurementCursor, type CursorMapFn } from './useMeasurementCursor';

const PAD = SPACING.panelPad;
const TRIGGER_THRESHOLD = CANVAS.oscTriggerThreshold;
const PANEL_DPR_MAX = 1.25;
const NGE_BG = CANVAS.nge.bg2;
const NGE_TRACE = CANVAS.nge.trace;
const NGE_GRID = CANVAS.nge.grid;
const NGE_LABEL = CANVAS.nge.label;
const NGE_PERSISTENCE_FILL = 'rgba(19,19,26,0.22)';
const HYPER_BG = CANVAS.hyper.bg2;
const HYPER_TRACE = CANVAS.hyper.trace;
const HYPER_GRID = CANVAS.hyper.grid;
const HYPER_LABEL = CANVAS.hyper.label;
const HYPER_TEXT = CANVAS.hyper.text;
const HYPER_GLOW = CANVAS.hyper.glow;
const RED_BG = CANVAS.red.bg2;
const RED_TRACE = CANVAS.red.trace;
const RED_GRID = CANVAS.red.grid;
const RED_LABEL = CANVAS.red.label;
const RED_TEXT = CANVAS.red.text;
const RED_GLOW = CANVAS.red.glow;
const RED_PERSISTENCE_FILL = CANVAS.red.persistenceFill;
const OPTIC_BG = CANVAS.optic.bg2;
const OPTIC_TRACE = CANVAS.optic.trace;
const OPTIC_GRID = CANVAS.optic.grid;
const OPTIC_LABEL = CANVAS.optic.label;
const OPTIC_TEXT = CANVAS.optic.text;
const OPTIC_GLOW = CANVAS.optic.glow;
const OPTIC_PERSISTENCE_FILL = CANVAS.optic.persistenceFill;
const EVA_BG = CANVAS.eva.bg2;
const EVA_TRACE = CANVAS.eva.trace;
const EVA_GRID = CANVAS.eva.grid;
const EVA_LABEL = CANVAS.eva.label;
const EVA_TEXT = CANVAS.eva.text;
const EVA_GLOW = CANVAS.eva.glow;
const EVA_PERSISTENCE_FILL = CANVAS.eva.persistenceFill;

// Allocate once at module level at max possible FFT size — reused every frame
const TD_BUF = new Float32Array(16384);

export function OscilloscopePanel(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const hoverReadoutRef = useRef<HTMLDivElement>(null);
  const drawDimRef = useRef({ padY: 0, drawH: 0, midY: 0 });

  const mapToValues: CursorMapFn = useCallback((devX: number, devY: number) => {
    const { padY, drawH, midY } = drawDimRef.current;
    if (drawH === 0) return null;
    if (devY < padY || devY > padY + drawH) return null;
    const amplitude = (midY - devY) / (drawH / 2);
    const clamped = Math.max(-1, Math.min(1, amplitude));
    const absAmp = Math.abs(clamped);
    const dbfs = absAmp > 0 ? 20 * Math.log10(absAmp) : -Infinity;
    const dbLabel = isFinite(dbfs) ? `${dbfs.toFixed(1)} dBFS` : '\u2212\u221E dBFS';
    return {
      devX, devY,
      primary: clamped,
      primaryLabel: `${clamped >= 0 ? '+' : '\u2212'}${Math.abs(clamped).toFixed(3)}`,
      secondary: dbfs,
      secondaryLabel: dbLabel,
    };
  }, []);

  const { overlayRef, handleMouseMove, handleMouseLeave, handleClick } = useMeasurementCursor({
    canvasRef, readoutRef: hoverReadoutRef, mapToValues, visualMode: displayMode.mode,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
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
      if (shouldSkipFrame(canvas)) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.mode === 'nge';
      const amber = displayMode.mode === 'amber';
      const hyper = displayMode.mode === 'hyper';
      const optic = displayMode.mode === 'optic';
      const red = displayMode.mode === 'red';
      const eva = displayMode.mode === 'eva';
      const backgroundFill = nge ? NGE_BG : amber ? CANVAS.amber.bg : hyper ? HYPER_BG : optic ? OPTIC_BG : red ? RED_BG : eva ? EVA_BG : COLORS.bg2;
      const persistenceFill = nge ? NGE_PERSISTENCE_FILL : amber ? CANVAS.amber.persistenceFill : hyper ? CANVAS.hyper.persistenceFill : optic ? OPTIC_PERSISTENCE_FILL : red ? RED_PERSISTENCE_FILL : eva ? EVA_PERSISTENCE_FILL : COLORS.bg2;
      const gridColor = nge ? NGE_GRID : amber ? CANVAS.amber.grid : hyper ? HYPER_GRID : optic ? OPTIC_GRID : red ? RED_GRID : eva ? EVA_GRID : COLORS.waveformGrid;
      const amplitudeTextColor = amber ? CANVAS.amber.text : hyper ? HYPER_TEXT : optic ? OPTIC_TEXT : red ? RED_TEXT : eva ? EVA_TEXT : COLORS.textDim;
      const traceColor = nge ? NGE_TRACE : amber ? CANVAS.amber.trace : hyper ? HYPER_TRACE : optic ? OPTIC_TRACE : red ? RED_TRACE : eva ? EVA_TRACE : COLORS.waveform;

      // Background — hard clear in normal mode, phosphor persistence in NGE/EVA
      if (nge || amber || hyper || optic || red || eva) {
        // Fade previous trace: partially transparent fill lets old traces glow
        ctx.fillStyle = persistenceFill;
      } else {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = backgroundFill;
      }
      ctx.fillRect(0, 0, W, H);

      const padX = PAD * dpr;
      const padY = PAD * dpr;
      const drawW = W - padX * 2;
      const drawH = H - padY * 2;
      const midY = padY + drawH / 2;
      drawDimRef.current = { padY, drawH, midY };

      // Grid lines
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(padX, midY);
      ctx.lineTo(padX + drawW, midY);
      ctx.stroke();
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
      ctx.fillStyle = amplitudeTextColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (const [label, amp] of [['+1', 1], ['+0.5', 0.5], ['0', 0], ['-0.5', -0.5], ['-1', -1]] as const) {
        const y = midY - (amp as number) * (drawH / 2);
        ctx.fillText(label, padX + 2, y);
      }

      // Pull fresh time-domain data directly at RAF rate — no 20fps stepping
      audioEngine.getTimeDomainData(TD_BUF);
      const td = TD_BUF;
      const gain = audioEngine.displayGain;
      const len = td.length;

      // Check for meaningful signal
      let hasSignal = false;
      for (let i = 0; i < len; i++) {
        if (Math.abs(td[i]) > 0.001) { hasSignal = true; break; }
      }

      if (!hasSignal) {
        // Idle: flat line
        ctx.strokeStyle = nge
          ? 'rgba(144,200,64,0.25)'
          : amber
            ? 'rgba(255,176,48,0.24)'
          : hyper
            ? 'rgba(98,232,255,0.25)'
            : optic
              ? 'rgba(123,182,212,0.36)'
              : red
                ? 'rgba(255,132,116,0.28)'
            : eva
              ? 'rgba(255,123,0,0.25)'
              : COLORS.waveformGrid;
        ctx.lineWidth = CANVAS.oscLineWidth * dpr;
        ctx.beginPath();
        ctx.moveTo(padX, midY);
        ctx.lineTo(padX + drawW, midY);
        ctx.stroke();
        drawLabel(ctx, W, dpr, nge ? 'nge' : amber ? 'amber' : hyper ? 'hyper' : optic ? 'optic' : red ? 'red' : eva ? 'eva' : 'default');
        return;
      }

      // Hysteresis trigger with sub-sample precision — Foobar2000-style stable waveform.
      // Strategy: search middle third of the buffer (not from pos 0), require signal to
      // dip below -TRIGGER_THRESHOLD before allowing a positive crossing (hysteresis),
      // then interpolate the exact fractional crossing position to phase-align the
      // drawing with sub-sample accuracy. This eliminates all "swimming" jitter caused
      // by the AnalyserNode buffer advancing a non-integer number of samples per frame.
      const searchStart = Math.floor(len / 6);
      const searchEnd   = Math.floor(len * 2 / 3);
      let triggerIdx = searchStart; // fallback: beginning of search window
      let triggerFrac = 0;          // sub-sample phase offset within [0, 1)
      let primed = false;            // hysteresis: must see negative lobe first
      for (let i = searchStart + 1; i < searchEnd; i++) {
        if (td[i] < -TRIGGER_THRESHOLD) primed = true;
        if (primed && td[i - 1] < TRIGGER_THRESHOLD && td[i] >= TRIGGER_THRESHOLD) {
          const slope = td[i] - td[i - 1];
          triggerFrac = slope > 0 ? (TRIGGER_THRESHOLD - td[i - 1]) / slope : 0;
          triggerIdx = i;
          break;
        }
      }

      const samples = Math.min(len - triggerIdx, Math.floor(drawW));

      // NGE: bright phosphor green-amber; normal: instrument amber
      ctx.strokeStyle = traceColor;
      ctx.lineWidth = nge || amber || hyper || optic || red || eva ? 1.2 * dpr : CANVAS.oscLineWidth * dpr;
      ctx.lineJoin = 'round';

      if (nge || amber || hyper || optic || red || eva) {
        // Glow pass — wide soft stroke underneath
        ctx.save();
        ctx.strokeStyle = nge ? 'rgba(140,210,40,0.18)' : amber ? CANVAS.amber.glow : hyper ? HYPER_GLOW : optic ? OPTIC_GLOW : red ? RED_GLOW : EVA_GLOW;
        ctx.lineWidth = 5 * dpr;
        ctx.beginPath();
        for (let i = 0; i < samples; i++) {
          const x = padX + ((i - triggerFrac) / (samples - 1)) * drawW;
          const y = midY - td[triggerIdx + i] * gain * (drawH / 2);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      ctx.beginPath();
      for (let i = 0; i < samples; i++) {
        const x = padX + ((i - triggerFrac) / (samples - 1)) * drawW;
        const y = midY - td[triggerIdx + i] * gain * (drawH / 2);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      drawLabel(ctx, W, dpr, nge ? 'nge' : amber ? 'amber' : hyper ? 'hyper' : optic ? 'optic' : red ? 'red' : eva ? 'eva' : 'default');
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [audioEngine, displayMode, theaterMode]);

  return (
    <div style={panelStyle}>
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
      <canvas ref={overlayRef} className="panel-cursor-overlay" style={overlayStyle} />
      <div ref={hoverReadoutRef} className="panel-hover-readout" />
    </div>
  );
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  W: number,
  dpr: number,
  mode: 'default' | 'amber' | 'nge' | 'hyper' | 'optic' | 'red' | 'eva' = 'default',
): void {
  ctx.font = `${9 * dpr}px ${FONTS.mono}`;
  ctx.fillStyle = mode === 'nge' ? NGE_LABEL : mode === 'amber' ? CANVAS.amber.label : mode === 'hyper' ? HYPER_LABEL : mode === 'optic' ? OPTIC_LABEL : mode === 'red' ? RED_LABEL : mode === 'eva' ? EVA_LABEL : COLORS.textDim;
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

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
};
