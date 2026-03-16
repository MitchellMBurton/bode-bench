// ============================================================
// OscilloscopePanel — triggered time-domain waveform.
// Reads time-domain samples DIRECTLY from the engine analyser
// every RAF frame (~60fps) rather than the 20fps frame bus.
// This eliminates the visible frame-rate stepping on the waveform.
//
// NGE mode: phosphor persistence — a semi-transparent fill
// replaces the hard clear, so previous traces fade like a CRT.
// ============================================================

import { useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useTheaterMode } from '../core/session';
import { COLORS, FONTS, CANVAS, SPACING } from '../theme';
import { shouldSkipFrame } from '../utils/rafGuard';

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

// Allocate once at module level — reused every frame
const TD_BUF = new Float32Array(CANVAS.fftSize);

export function OscilloscopePanel(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

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
      if (shouldSkipFrame()) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.nge;
      const hyper = displayMode.hyper;
      const backgroundFill = nge ? NGE_BG : hyper ? HYPER_BG : COLORS.bg2;
      const persistenceFill = nge ? NGE_PERSISTENCE_FILL : hyper ? CANVAS.hyper.persistenceFill : COLORS.bg2;
      const gridColor = nge ? NGE_GRID : hyper ? HYPER_GRID : COLORS.waveformGrid;
      const amplitudeTextColor = hyper ? HYPER_TEXT : COLORS.textDim;
      const traceColor = nge ? NGE_TRACE : hyper ? HYPER_TRACE : COLORS.waveform;

      // Background — hard clear in normal mode, phosphor persistence in NGE
      if (nge || hyper) {
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
          : hyper
            ? 'rgba(98,232,255,0.25)'
            : COLORS.waveformGrid;
        ctx.lineWidth = CANVAS.oscLineWidth * dpr;
        ctx.beginPath();
        ctx.moveTo(padX, midY);
        ctx.lineTo(padX + drawW, midY);
        ctx.stroke();
        drawLabel(ctx, W, dpr, nge ? 'nge' : hyper ? 'hyper' : 'default');
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
      ctx.lineWidth = nge || hyper ? 1.2 * dpr : CANVAS.oscLineWidth * dpr;
      ctx.lineJoin = 'round';

      if (nge || hyper) {
        // Glow pass — wide soft stroke underneath
        ctx.save();
        ctx.strokeStyle = nge ? 'rgba(140,210,40,0.18)' : HYPER_GLOW;
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

      drawLabel(ctx, W, dpr, nge ? 'nge' : hyper ? 'hyper' : 'default');
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [audioEngine, displayMode, theaterMode]);

  return (
    <div style={panelStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  W: number,
  dpr: number,
  mode: 'default' | 'nge' | 'hyper' = 'default',
): void {
  ctx.font = `${9 * dpr}px ${FONTS.mono}`;
  ctx.fillStyle = mode === 'nge' ? NGE_LABEL : mode === 'hyper' ? HYPER_LABEL : COLORS.textDim;
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



