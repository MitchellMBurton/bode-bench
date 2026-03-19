// ============================================================
// PianoRollPanel — horizontal scrolling piano roll.
// Reads NoteEvent[] from score JSON; scrolls in sync with playback.
// Current time = vertical line at 20% from left.
// ============================================================

import { useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode } from '../core/session';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import { shouldSkipFrame } from '../utils/rafGuard';
import type { NoteEvent } from '../types';

interface Props {
  noteEvents: NoteEvent[] | null;
}

const PANEL_DPR_MAX = 1.5;

// MIDI pitch display range: C2 (36) to G5 (79) — full cello range
const MIDI_MIN = 36;
const MIDI_MAX = 79;
const MIDI_RANGE = MIDI_MAX - MIDI_MIN + 1;

// How many seconds of score are visible in the full panel width
const VISIBLE_SECONDS = 12;
const CURSOR_X_FRACTION = 0.2; // cursor at 20% from left

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

export function PianoRollPanel({ noteEvents }: Props): React.ReactElement {
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const noteEventsRef = useRef<NoteEvent[] | null>(noteEvents);

  // Keep ref in sync with prop (avoids stale closure in RAF)
  useEffect(() => {
    noteEventsRef.current = noteEvents;
  }, [noteEvents]);

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
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (shouldSkipFrame(canvas)) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const optic = displayMode.mode === 'optic';
      const red = displayMode.mode === 'red';
      const backgroundFill = optic ? CANVAS.optic.bg2 : red ? CANVAS.red.bg2 : COLORS.bg1;
      const blackKeyFill = optic ? 'rgba(225,236,244,0.92)' : red ? 'rgba(24,8,9,0.96)' : COLORS.bg0;
      const whiteKeyFill = optic ? 'rgba(247,251,255,0.98)' : red ? 'rgba(34,12,13,0.94)' : COLORS.bg2;
      const octaveLine = optic ? 'rgba(159,199,223,0.55)' : red ? 'rgba(124,40,39,0.48)' : COLORS.border;
      const octaveLabel = optic ? CANVAS.optic.label : red ? CANVAS.red.label : COLORS.textDim;
      const activeNoteFill = optic ? 'rgba(29,169,199,0.50)' : red ? 'rgba(255,90,74,0.48)' : COLORS.noteOverlay;
      const pastNoteFill = optic ? 'rgba(125,174,205,0.38)' : red ? 'rgba(110,28,24,0.38)' : 'rgba(100, 80, 30, 0.45)';
      const futureNoteFill = optic ? 'rgba(142,214,231,0.52)' : red ? 'rgba(176,52,42,0.48)' : 'rgba(160, 120, 50, 0.55)';
      const activeNoteBorder = optic ? 'rgba(21,151,212,0.88)' : red ? 'rgba(255,140,120,0.88)' : COLORS.noteOverlayBorder;
      const noteBorder = optic ? 'rgba(113,171,204,0.36)' : red ? 'rgba(198,70,60,0.36)' : 'rgba(200, 160, 80, 0.3)';
      const cursorColor = optic ? CANVAS.optic.trace : red ? CANVAS.red.trace : COLORS.accent;
      const tickLineColor = optic ? 'rgba(213,229,238,0.92)' : red ? 'rgba(56,16,18,0.92)' : COLORS.bg3;
      const tickTextColor = optic ? CANVAS.optic.label : red ? CANVAS.red.label : COLORS.textDim;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = backgroundFill;
      ctx.fillRect(0, 0, W, H);

      const currentTime = audioEngine.currentTime;
      const events = noteEventsRef.current;

      // Pixel per second
      const pxPerSec = W / VISIBLE_SECONDS;
      // Time at left edge of canvas
      const timeAtLeft = currentTime - CURSOR_X_FRACTION * VISIBLE_SECONDS;

      const rowH = H / MIDI_RANGE;

      // Row backgrounds (piano roll keys)
      for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
        const rowIndex = MIDI_MAX - m; // top = high pitch
        const y = rowIndex * rowH;
        ctx.fillStyle = isBlackKey(m) ? blackKeyFill : whiteKeyFill;
        ctx.fillRect(0, y, W, rowH);
      }

      // Horizontal grid lines at octave boundaries (C notes)
      for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
        const pc = ((m % 12) + 12) % 12;
        if (pc === 0) {
          const rowIndex = MIDI_MAX - m;
          const y = Math.round(rowIndex * rowH) + 0.5;
          ctx.strokeStyle = octaveLine;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
          // Octave label
          ctx.font = `${7 * dpr}px ${FONTS.mono}`;
          ctx.fillStyle = octaveLabel;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(midiToName(m), 2 * dpr, y + 1);
        }
      }

      // Note blocks
      if (events) {
        const visibleStart = timeAtLeft - 1; // 1s buffer
        const visibleEnd = timeAtLeft + VISIBLE_SECONDS + 1;

        for (const note of events) {
          if (note.onset_s > visibleEnd) continue;
          if (note.onset_s + note.duration_s < visibleStart) continue;
          if (note.pitch < MIDI_MIN || note.pitch > MIDI_MAX) continue;

          const rowIndex = MIDI_MAX - note.pitch;
          const y = rowIndex * rowH;
          const x = (note.onset_s - timeAtLeft) * pxPerSec;
          const noteW = Math.max(2, note.duration_s * pxPerSec - 1);

          // Active note: brighter
          const isPast = note.onset_s + note.duration_s < currentTime;
          const isActive = note.onset_s <= currentTime && note.onset_s + note.duration_s > currentTime;

          if (isActive) {
            ctx.fillStyle = activeNoteFill;
          } else if (isPast) {
            ctx.fillStyle = pastNoteFill;
          } else {
            ctx.fillStyle = futureNoteFill;
          }

          const noteH = Math.max(1, rowH - 1);
          ctx.fillRect(x, y + 0.5, noteW, noteH);

          // Note border
          ctx.strokeStyle = isActive ? activeNoteBorder : noteBorder;
          ctx.lineWidth = isActive ? 1.5 * dpr : 0.5;
          ctx.strokeRect(x, y + 0.5, noteW, noteH);
        }
      }

      // Cursor line
      const cursorX = Math.round(CURSOR_X_FRACTION * W) + 0.5;
      ctx.strokeStyle = cursorColor;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, H);
      ctx.stroke();

      // Time axis ticks
      const firstTick = Math.ceil(timeAtLeft);
      const lastTick = Math.floor(timeAtLeft + VISIBLE_SECONDS);
      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (let t = firstTick; t <= lastTick; t += 2) {
        const x = (t - timeAtLeft) * pxPerSec;
        ctx.strokeStyle = tickLineColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, H);
        ctx.stroke();
        const m = Math.floor(t / 60);
        const s = t % 60;
        const label = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
        ctx.fillStyle = tickTextColor;
        ctx.fillText(label, x, H - 2 * dpr);
      }

      // Panel label
      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = tickTextColor;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('SCORE', W - SPACING.sm * dpr, SPACING.xs * dpr);

      // No-data hint
      if (!events || events.length === 0) {
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = tickTextColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('NO SCORE DATA', W / 2, H / 2);
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [audioEngine, displayMode]);

  return (
    <div style={{ ...panelStyle, background: displayMode.mode === 'optic' ? CANVAS.optic.bg2 : displayMode.mode === 'red' ? CANVAS.red.bg2 : COLORS.bg1 }}>
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
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
