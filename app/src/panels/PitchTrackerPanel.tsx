// ============================================================
// PitchTrackerPanel — rolling F0 history.
// Newest data always at right edge. Sub-frame time interpolation
// gives smooth 60fps scrolling from 20fps analysis data.
// Scroll speed matches CANVAS.timelineScrollPx × scrollSpeed.value
// ============================================================

import { useCallback, useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useScrollSpeed, useTheaterMode } from '../core/session';
import { COLORS, FONTS, SPACING, CANVAS } from '../theme';
import { shouldSkipFrame } from '../utils/rafGuard';
import { useMeasurementCursor, type CursorMapFn } from './useMeasurementCursor';

const PANEL_DPR_MAX = 1.5;
const HISTORY_MAX = 1200;
const BASE_PX_PER_FRAME = CANVAS.timelineScrollPx;
const PAD_V_PX = 8;
const MS_PER_DATA_FRAME = 1000 / 20; // 20 FPS analysis rate
const NGE_TRACE = '#a0d840';
const NGE_TRACE_SOFT = 'rgba(160,216,64,0.82)';
const NGE_GLOW = 'rgba(140,210,40,0.36)';
const NGE_LABEL = 'rgba(140,210,40,0.5)';
const HYPER_TRACE = CANVAS.hyper.trace;
const HYPER_TRACE_SOFT = 'rgba(98,232,255,0.84)';
const HYPER_GLOW = 'rgba(98,232,255,0.34)';
const HYPER_LABEL = CANVAS.hyper.label;
const HYPER_TEXT = CANVAS.hyper.text;
const RED_TRACE = CANVAS.red.trace;
const RED_TRACE_SOFT = 'rgba(255,110,92,0.84)';
const RED_GLOW = 'rgba(255,90,74,0.30)';
const RED_LABEL = CANVAS.red.label;
const RED_TEXT = CANVAS.red.text;
const OPTIC_TRACE = CANVAS.optic.trace;
const OPTIC_TRACE_SOFT = 'rgba(21,151,212,0.84)';
const OPTIC_GLOW = 'rgba(74,192,255,0.30)';
const OPTIC_LABEL = CANVAS.optic.label;
const OPTIC_TEXT = CANVAS.optic.text;
const EVA_TRACE = CANVAS.eva.trace;
const EVA_TRACE_SOFT = 'rgba(255,123,0,0.84)';
const EVA_GLOW = 'rgba(255,120,0,0.34)';
const EVA_LABEL = CANVAS.eva.label;
const EVA_TEXT = CANVAS.eva.text;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const F0_MIN = 60;
const F0_MAX = 900;
const LOG_MIN = Math.log2(F0_MIN);
const LOG_MAX = Math.log2(F0_MAX);

// Interval names by semitone distance (0–12)
const INTERVAL_NAMES = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', '8va'];

function getIntervalLabel(fromMidi: number, toMidi: number): string {
  const diff = toMidi - fromMidi;
  const semitones = ((diff % 12) + 12) % 12;
  const dir = diff > 0 ? '↑' : diff < 0 ? '↓' : '';
  return `${dir} ${INTERVAL_NAMES[semitones]}`;
}

const STABLE_FRAMES_NEEDED = 3; // frames before a note is considered stable

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

export function PitchTrackerPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const scrollSpeed = useScrollSpeed();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Circular buffer — parallel typed arrays (NaN = no pitch)
  const histF0Ref = useRef(new Float64Array(HISTORY_MAX));
  const histConfRef = useRef(new Float64Array(HISTORY_MAX));
  const histPtrRef = useRef(0);
  const histLenRef = useRef(0);
  const liveF0Ref = useRef<number | null>(null);
  const liveConfRef = useRef(0);
  const lastFileIdRef = useRef(-1);
  const rafRef = useRef<number | null>(null);
  const lastDataTimeRef = useRef(0);
  const hoverReadoutRef = useRef<HTMLDivElement>(null);
  const drawDimRef = useRef({ H: 0, padV: 0 });

  // Interval tracking
  const lastStableMidiRef = useRef<number | null>(null); // MIDI of last confirmed stable note
  const currentRunMidiRef = useRef<number | null>(null); // MIDI of current run (rounded)
  const stableRunCountRef = useRef(0);
  const intervalLabelRef = useRef<string | null>(null);

  const mapToValues: CursorMapFn = useCallback((devX: number, devY: number) => {
    const { H, padV } = drawDimRef.current;
    if (H === 0) return null;
    if (devY < padV || devY > H - padV) return null;
    const t = 1 - (devY - padV) / (H - padV * 2);
    const hz = Math.pow(2, LOG_MIN + t * (LOG_MAX - LOG_MIN));
    const { name, tuning } = f0ToLabel(hz);
    return {
      devX, devY,
      primary: hz,
      primaryLabel: `${name}  ${Math.round(hz)} Hz`,
      secondary: 0,
      secondaryLabel: tuning,
    };
  }, []);

  const { overlayRef, handleMouseMove, handleMouseLeave, handleClick } = useMeasurementCursor({
    canvasRef, readoutRef: hoverReadoutRef, mapToValues, visualMode: displayMode.mode,
  });

  useEffect(() => frameBus.subscribe((frame) => {
    if (frame.fileId !== lastFileIdRef.current) {
      lastFileIdRef.current = frame.fileId;
      histF0Ref.current.fill(NaN);
      histConfRef.current.fill(0);
      histPtrRef.current = 0;
      histLenRef.current = 0;
      lastStableMidiRef.current = null;
      currentRunMidiRef.current = null;
      stableRunCountRef.current = 0;
      intervalLabelRef.current = null;
    }
    const slot = histPtrRef.current % HISTORY_MAX;
    histF0Ref.current[slot] = frame.f0Hz ?? NaN;
    histConfRef.current[slot] = frame.f0Confidence;
    histPtrRef.current++;
    histLenRef.current = Math.min(histLenRef.current + 1, HISTORY_MAX);
    liveF0Ref.current = frame.f0Hz;
    liveConfRef.current = frame.f0Confidence;
    lastDataTimeRef.current = performance.now();

    // Interval tracking: detect when a stable note begins
    if (frame.f0Hz !== null && frame.f0Confidence > 0.55) {
      const midi = Math.round(69 + 12 * Math.log2(frame.f0Hz / 440));
      if (currentRunMidiRef.current === midi) {
        stableRunCountRef.current++;
        if (stableRunCountRef.current === STABLE_FRAMES_NEEDED) {
          // This note has become stable
          const prev = lastStableMidiRef.current;
          if (prev !== null && prev !== midi) {
            intervalLabelRef.current = getIntervalLabel(prev, midi);
          } else {
            intervalLabelRef.current = null;
          }
          lastStableMidiRef.current = midi;
        }
      } else {
        currentRunMidiRef.current = midi;
        stableRunCountRef.current = 1;
      }
    } else {
      currentRunMidiRef.current = null;
      stableRunCountRef.current = 0;
    }
  }), [frameBus]);

  useEffect(() => audioEngine.onReset(() => {
    histF0Ref.current.fill(NaN);
    histConfRef.current.fill(0);
    histPtrRef.current = 0;
    histLenRef.current = 0;
    liveF0Ref.current = null;
    liveConfRef.current = 0;
    lastFileIdRef.current = -1;
    lastDataTimeRef.current = performance.now();
    lastStableMidiRef.current = null;
    currentRunMidiRef.current = null;
    stableRunCountRef.current = 0;
    intervalLabelRef.current = null;
  }), [audioEngine]);

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
    if (!canvas || theaterMode) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (shouldSkipFrame(canvas)) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.mode === 'nge';
      const hyper = displayMode.mode === 'hyper';
      const optic = displayMode.mode === 'optic';
      const red = displayMode.mode === 'red';
      const eva = displayMode.mode === 'eva';
      const padV = PAD_V_PX * dpr;
      drawDimRef.current = { H, padV };
      const traceColor = nge ? NGE_TRACE : hyper ? HYPER_TRACE : optic ? OPTIC_TRACE : red ? RED_TRACE : eva ? EVA_TRACE : COLORS.waveform;
      const traceStroke = nge ? NGE_TRACE_SOFT : hyper ? HYPER_TRACE_SOFT : optic ? OPTIC_TRACE_SOFT : red ? RED_TRACE_SOFT : eva ? EVA_TRACE_SOFT : 'rgba(200,146,42,0.80)';
      const glowColor = nge ? NGE_GLOW : hyper ? HYPER_GLOW : optic ? OPTIC_GLOW : red ? RED_GLOW : eva ? EVA_GLOW : 'rgba(200,146,42,0.30)';
      const labelColor = nge ? NGE_LABEL : hyper ? HYPER_LABEL : optic ? OPTIC_LABEL : red ? RED_LABEL : eva ? EVA_LABEL : COLORS.textDim;
      const noteTextColor = hyper ? HYPER_TEXT : optic ? OPTIC_TEXT : red ? RED_TEXT : eva ? EVA_TEXT : COLORS.textSecondary;

      ctx.fillStyle = hyper ? CANVAS.hyper.bg2 : optic ? CANVAS.optic.bg2 : red ? CANVAS.red.bg2 : eva ? CANVAS.eva.bg : COLORS.bg1;
      ctx.fillRect(0, 0, W, H);

      // Top border
      ctx.fillStyle = hyper ? 'rgba(32,52,110,0.92)' : optic ? 'rgba(159,199,223,0.84)' : red ? 'rgba(124,40,39,0.84)' : eva ? 'rgba(74,26,144,0.92)' : COLORS.border;
      ctx.fillRect(0, 0, W, 1);

      // Grid lines — labels on right
      const grid: [number, string, boolean][] = [
        [65.41,  'C2', true], [130.81, 'C3', true], [261.63, 'C4', true], [523.25, 'C5', true],
        [98.00,  'G2', false],[196.00, 'G3', false],[392.00, 'G4', false],[783.99, 'G5', false],
      ];
      for (const [hz, label, isC] of grid) {
        const y = Math.round(f0ToY(hz, H, padV)) + 0.5;
        ctx.strokeStyle = hyper
          ? (isC ? 'rgba(88,124,255,0.78)' : 'rgba(24,34,70,0.92)')
          : optic
            ? (isC ? 'rgba(123,182,212,0.78)' : 'rgba(191,218,233,0.92)')
          : red
            ? (isC ? 'rgba(156,52,46,0.78)' : 'rgba(64,16,18,0.92)')
          : eva
            ? (isC ? 'rgba(120,50,200,0.78)' : 'rgba(40,16,80,0.92)')
            : (isC ? 'rgba(50,50,72,1)' : 'rgba(32,32,48,1)');
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.font = `${6.5 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = hyper
          ? (isC ? HYPER_TEXT : HYPER_LABEL)
          : optic
            ? (isC ? OPTIC_TEXT : OPTIC_LABEL)
          : red
            ? (isC ? RED_TEXT : RED_LABEL)
          : eva
            ? (isC ? EVA_TEXT : EVA_LABEL)
            : (isC ? COLORS.textSecondary : COLORS.textDim);
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
      const hF0 = histF0Ref.current;
      const hConf = histConfRef.current;
      const hLen = histLenRef.current;
      const hPtr = histPtrRef.current;

      if (hLen > 1) {
        ctx.lineWidth = 1.5 * dpr;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        let prevX = -1;
        let prevY = -1;
        ctx.beginPath();
        let penDown = false;

        for (let i = 0; i < hLen; i++) {
          const x = W - (hLen - 1 - i) * pxPerFrame + subOffset;
          if (x < 0) { penDown = false; continue; }
          if (x > W + pxPerFrame) continue;

          const slot = (hPtr - hLen + i + HISTORY_MAX) % HISTORY_MAX;
          const f0 = hF0[slot];
          const conf = hConf[slot];
          if (isNaN(f0) || conf < 0.45) { penDown = false; prevX = x; prevY = -1; continue; }
          const y = f0ToY(f0, H, padV);

          if (!penDown || prevX < 0) {
            ctx.moveTo(x, y);
            penDown = true;
          } else {
            ctx.lineTo(x, y);
          }
          prevX = x;
          prevY = y;
        }
        ctx.strokeStyle = traceStroke;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 3 * dpr;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Head dot at newest valid point
        if (prevY > 0) {
          ctx.beginPath();
          ctx.arc(prevX, prevY, 3 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = traceColor;
          ctx.shadowColor = nge
            ? 'rgba(140,210,40,0.5)'
            : hyper
              ? 'rgba(255,92,188,0.5)'
              : red
                ? 'rgba(255,90,74,0.46)'
              : eva
                ? 'rgba(255,120,0,0.5)'
                : 'rgba(200,146,42,0.5)';
          ctx.shadowBlur = 5 * dpr;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Live note readout — left side
      const curF0 = liveF0Ref.current;
      const curConf = liveConfRef.current;
      const hasNote = curF0 !== null && curConf > 0.45;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      if (hasNote && curF0) {
        const { name, hz, tuning } = f0ToLabel(curF0);
        ctx.font = `${11 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = traceColor;
        ctx.fillText(name, SPACING.sm * dpr, SPACING.xs * dpr);
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = noteTextColor;
        ctx.fillText(hz, SPACING.sm * dpr, (SPACING.xs + 13) * dpr);
        ctx.font = `${7.5 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = labelColor;
        ctx.fillText(tuning, SPACING.sm * dpr, (SPACING.xs + 23) * dpr);

        // Interval from previous stable note
        const intervalLabel = intervalLabelRef.current;
        if (intervalLabel) {
          ctx.font = `${7 * dpr}px ${FONTS.mono}`;
          ctx.fillStyle = nge ? 'rgba(160,216,64,0.55)' : hyper ? 'rgba(98,232,255,0.55)' : optic ? 'rgba(29,169,199,0.58)' : red ? 'rgba(255,136,120,0.58)' : eva ? 'rgba(255,140,40,0.55)' : 'rgba(200,175,100,0.55)';
          ctx.fillText(intervalLabel, SPACING.sm * dpr, (SPACING.xs + 35) * dpr);
        }

        // ── Tuning bar ──────────────────────────────────────────────────
        // Draw at bottom of panel, above the F0 TRACK label
        const midi = 69 + 12 * Math.log2(curF0 / 440);
        const cents = Math.round((midi - Math.round(midi)) * 100);
        const barW = Math.min(W * 0.55, 80 * dpr);
        const barH2 = 6 * dpr;
        const barX = W * 0.5 - barW * 0.5;
        const barY = H - (SPACING.xs + 9) * dpr;

        // Background zones
        const zoneW = barW / 2; // half = 50 cents
        ctx.fillStyle = nge ? 'rgba(80,40,10,0.45)' : optic ? 'rgba(228,124,103,0.22)' : red ? 'rgba(92,18,18,0.45)' : eva ? 'rgba(80,20,60,0.45)' : 'rgba(70,18,18,0.45)';
        ctx.fillRect(barX, barY, barW, barH2);
        ctx.fillStyle = nge ? 'rgba(90,90,10,0.40)' : optic ? 'rgba(255,208,130,0.24)' : red ? 'rgba(124,40,24,0.40)' : eva ? 'rgba(90,30,80,0.40)' : 'rgba(90,70,10,0.40)';
        ctx.fillRect(barX + zoneW * 0.5, barY, zoneW, barH2);
        ctx.fillStyle = nge ? 'rgba(20,80,10,0.45)' : optic ? 'rgba(122,223,206,0.28)' : red ? 'rgba(150,52,26,0.45)' : eva ? 'rgba(40,10,100,0.45)' : 'rgba(14,80,28,0.45)';
        ctx.fillRect(barX + zoneW * 0.8, barY, zoneW * 0.4, barH2);

        // Centre tick
        ctx.fillStyle = labelColor;
        ctx.fillRect(barX + zoneW - 0.5 * dpr, barY - 2 * dpr, 1 * dpr, barH2 + 4 * dpr);

        // Needle — clamp to ±50 ct
        const needleX = barX + zoneW + (Math.max(-50, Math.min(50, cents)) / 50) * zoneW;
        const needleColor = Math.abs(cents) <= 10
          ? (nge ? '#a0d840' : optic ? '#1da9c7' : red ? '#ff8e7a' : eva ? '#ff7b00' : 'rgba(60,220,90,1)')
          : Math.abs(cents) <= 25
            ? (nge ? '#d0c040' : optic ? '#c99b4f' : red ? '#ffb067' : eva ? '#ffa020' : 'rgba(210,180,40,1)')
            : COLORS.statusErr;
        ctx.fillStyle = needleColor;
        ctx.fillRect(Math.round(needleX) - dpr, barY - 2 * dpr, dpr * 2.5, barH2 + 4 * dpr);
      } else {
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = labelColor;
        ctx.fillText('NO PITCH', SPACING.sm * dpr, SPACING.xs * dpr);
      }

      // Panel label
      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('F0 TRACK', SPACING.sm * dpr, H - SPACING.xs * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [displayMode, scrollSpeed, theaterMode]);

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

const panelStyle: React.CSSProperties = {
  position: 'relative',
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

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
};



