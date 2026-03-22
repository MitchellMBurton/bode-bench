import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAudioEngine, useScrollSpeed, useScrollSpeedValue, useVisualMode } from '../core/session';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import type { VisualMode } from '../audio/displayMode';
import {
  PITCH_DEFAULT,
  PITCH_MAX,
  PITCH_MIN,
  RATE_DEFAULT,
  RATE_MAX,
  RATE_MIN,
  SCROLL_DEFAULT,
  SCROLL_MAX,
  SCROLL_MIN,
  VOLUME_DEFAULT,
} from '../constants';

interface SessionTheme {
  readonly clusterBg: string;
  readonly border: string;
  readonly label: string;
  readonly text: string;
  readonly track: string;
  readonly fill: string;
  readonly pitchFill: string;
  readonly buttonBg: string;
}

export type SessionControlKey = 'volume' | 'rate' | 'pitch' | 'scroll';

interface SessionControlRow {
  readonly key: SessionControlKey;
  readonly label: string;
  readonly value: number;
  readonly valueLabel: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (nextValue: number) => void;
  readonly fill: string;
  readonly disabled: boolean;
  readonly title: string;
}

type ControlLayout = 'overlay' | 'inline';

const INLINE_ROW_KEYS: readonly SessionControlKey[] = ['volume', 'rate'];

const SESSION_THEMES = {
  default: {
    clusterBg: COLORS.bg1,
    border: COLORS.border,
    label: COLORS.textSecondary,
    text: COLORS.textPrimary,
    track: COLORS.bg3,
    fill: COLORS.accent,
    pitchFill: COLORS.accent,
    buttonBg: COLORS.bg3,
  },
  optic: {
    clusterBg: 'rgba(246,250,252,0.94)',
    border: 'rgba(109,146,165,0.72)',
    label: CANVAS.optic.category,
    text: CANVAS.optic.text,
    track: '#ccd7de',
    fill: 'rgba(18,118,164,0.86)',
    pitchFill: 'rgba(76,118,189,0.84)',
    buttonBg: 'rgba(247,250,252,0.94)',
  },
  red: {
    clusterBg: 'rgba(18,6,7,0.96)',
    border: 'rgba(124,40,39,0.62)',
    label: CANVAS.red.label,
    text: CANVAS.red.text,
    track: 'rgba(12,3,4,0.92)',
    fill: 'rgba(255,90,74,0.86)',
    pitchFill: 'rgba(255,132,106,0.82)',
    buttonBg: 'rgba(12,3,4,0.92)',
  },
  nge: {
    clusterBg: COLORS.bg1,
    border: 'rgba(60,130,30,0.4)',
    label: 'rgba(140,210,40,0.6)',
    text: 'rgba(180,230,80,0.9)',
    track: 'rgba(4,12,4,0.9)',
    fill: 'rgba(120,200,60,0.85)',
    pitchFill: 'rgba(120,200,60,0.85)',
    buttonBg: 'rgba(4,10,4,0.9)',
  },
  hyper: {
    clusterBg: COLORS.bg1,
    border: 'rgba(40,70,180,0.42)',
    label: CANVAS.hyper.label,
    text: 'rgba(210,236,255,0.88)',
    track: 'rgba(4,9,28,0.9)',
    fill: 'rgba(98,232,255,0.8)',
    pitchFill: 'rgba(98,232,255,0.8)',
    buttonBg: 'rgba(2,5,18,0.9)',
  },
  eva: {
    clusterBg: COLORS.bg1,
    border: 'rgba(120,50,200,0.42)',
    label: CANVAS.eva.label,
    text: 'rgba(255,180,80,0.88)',
    track: 'rgba(8,4,26,0.9)',
    fill: 'rgba(255,123,0,0.8)',
    pitchFill: 'rgba(255,123,0,0.8)',
    buttonBg: CANVAS.eva.bg,
  },
} satisfies Record<VisualMode, SessionTheme>;

function fillWidth(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`;
}

function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatPitch(semitones: number): string {
  if (Math.abs(semitones) < 0.001) return '0 st';
  return `${semitones > 0 ? '+' : ''}${Math.round(semitones)} st`;
}

function useSessionControlRows(): {
  readonly rows: readonly SessionControlRow[];
  readonly onReset: () => void;
  readonly theme: SessionTheme;
} {
  const audioEngine = useAudioEngine();
  const scrollSpeed = useScrollSpeed();
  const scroll = useScrollSpeedValue();
  const visualMode = useVisualMode();
  const theme = SESSION_THEMES[visualMode];
  const [volume, setVolume] = useState(audioEngine.volume);
  const [rate, setRate] = useState(audioEngine.playbackRate);
  const [pitch, setPitch] = useState(audioEngine.pitchSemitones);
  const [pitchAvailable, setPitchAvailable] = useState(true);

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      setVolume(state.volume);
      setRate(state.playbackRate);
      setPitch(state.pitchSemitones);
      setPitchAvailable(state.pitchShiftAvailable);
    });
  }, [audioEngine]);

  const onReset = useCallback(() => {
    audioEngine.setVolume(VOLUME_DEFAULT);
    audioEngine.setPlaybackRate(RATE_DEFAULT);
    audioEngine.setPitchSemitones(PITCH_DEFAULT);
    scrollSpeed.set(SCROLL_DEFAULT);
  }, [audioEngine, scrollSpeed]);

  const rows = useMemo<readonly SessionControlRow[]>(() => [
    {
      key: 'volume',
      label: 'VOL',
      value: volume,
      valueLabel: `${Math.round(volume * 100)}`,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (nextValue: number) => {
        audioEngine.setVolume(nextValue);
      },
      fill: theme.fill,
      disabled: false,
      title: 'Master output level',
    },
    {
      key: 'rate',
      label: 'RATE',
      value: rate,
      valueLabel: formatMultiplier(rate),
      min: RATE_MIN,
      max: RATE_MAX,
      step: 0.05,
      onChange: (nextValue: number) => {
        setRate(nextValue);
        audioEngine.setPlaybackRate(nextValue);
      },
      fill: theme.fill,
      disabled: false,
      title: 'Playback rate multiplier',
    },
    {
      key: 'pitch',
      label: 'PITCH',
      value: pitch,
      valueLabel: pitchAvailable ? formatPitch(pitch) : 'N/A',
      min: PITCH_MIN,
      max: PITCH_MAX,
      step: 1,
      onChange: (nextValue: number) => {
        setPitch(nextValue);
        audioEngine.setPitchSemitones(nextValue);
      },
      fill: pitchAvailable ? theme.pitchFill : theme.border,
      disabled: !pitchAvailable,
      title: pitchAvailable ? 'Pitch transpose in semitones with tempo preserved.' : 'Studio pitch shift is unavailable in this runtime.',
    },
    {
      key: 'scroll',
      label: 'SCRL',
      value: scroll,
      valueLabel: formatMultiplier(scroll),
      min: SCROLL_MIN,
      max: SCROLL_MAX,
      step: 0.25,
      onChange: (nextValue: number) => {
        scrollSpeed.set(nextValue);
      },
      fill: theme.fill,
      disabled: false,
      title: 'Visual scroll speed multiplier',
    },
  ], [audioEngine, pitch, pitchAvailable, rate, scroll, scrollSpeed, theme.border, theme.fill, theme.pitchFill, volume]);

  return {
    rows,
    onReset,
    theme,
  };
}

function TuningControlRow({
  row,
  theme,
  layout,
}: {
  readonly row: SessionControlRow;
  readonly theme: SessionTheme;
  readonly layout: ControlLayout;
}): React.ReactElement {
  const width = fillWidth(row.value, row.min, row.max);
  const inline = layout === 'inline';

  return (
    <div style={inline ? inlineControlRowStyle : overlayControlRowStyle}>
      <span style={{ ...(inline ? inlineLabelStyle : overlayLabelStyle), color: theme.label }}>{row.label}</span>
      <div style={inline ? inlineTrackShellStyle : overlayTrackShellStyle}>
        <div style={{ ...(inline ? inlineTrackRailStyle : overlayTrackRailStyle), background: theme.track }} />
        <div
          style={{
            ...(inline ? inlineFillStyle : overlayFillStyle),
            width,
            background: row.fill,
          }}
        />
        <div
          style={{
            ...(inline ? inlineThumbStyle : overlayThumbStyle),
            left: width,
            background: row.fill,
            borderColor: theme.clusterBg,
            opacity: row.disabled ? 0.4 : 1,
          }}
        />
        <input
          type="range"
          min={row.min}
          max={row.max}
          step={row.step}
          value={row.value}
          onChange={(event) => row.onChange(Number.parseFloat(event.target.value))}
          style={rangeStyle}
          title={row.title}
          disabled={row.disabled}
        />
      </div>
      <span style={{ ...(inline ? inlineValueStyle : overlayValueStyle), color: theme.text }}>{row.valueLabel}</span>
    </div>
  );
}

export function InlineSessionControls(): React.ReactElement {
  const { rows, theme } = useSessionControlRows();
  const inlineRows = rows.filter((row) => INLINE_ROW_KEYS.includes(row.key));

  return (
    <div style={inlineWrapStyle}>
      {inlineRows.map((row) => (
        <TuningControlRow key={row.key} row={row} theme={theme} layout="inline" />
      ))}
    </div>
  );
}

export function SessionControls(): React.ReactElement {
  const { rows, onReset, theme } = useSessionControlRows();

  return (
    <div style={overlayWrapStyle}>
      <div style={overlayHeaderRowStyle}>
        <span style={{ ...overlaySectionLabelStyle, color: theme.label }}>PLAYBACK TUNING</span>
        <button
          style={{ ...resetButtonStyle, background: theme.buttonBg, borderColor: theme.border, color: theme.label }}
          onClick={onReset}
          title="Reset playback and scroll controls"
        >
          RESET
        </button>
      </div>
      <div style={overlayRowsWrapStyle}>
        {rows.map((row) => (
          <TuningControlRow key={row.key} row={row} theme={theme} layout="overlay" />
        ))}
      </div>
    </div>
  );
}

const overlayWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 10,
  minWidth: 0,
};

const overlayHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: SPACING.sm,
  minWidth: 0,
};

const overlaySectionLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  lineHeight: 1,
};

const overlayRowsWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  minWidth: 0,
};

const overlayControlRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '40px minmax(196px, 1fr) 60px',
  alignItems: 'center',
  gap: 12,
  minWidth: 0,
};

const overlayLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.08em',
  flexShrink: 0,
};

const overlayTrackShellStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 18,
  minWidth: 196,
};

const overlayTrackRailStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: '50%',
  height: 7,
  transform: 'translateY(-50%)',
  borderRadius: 999,
  pointerEvents: 'none',
};

const overlayFillStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: '50%',
  height: 7,
  transform: 'translateY(-50%)',
  borderRadius: 999,
  pointerEvents: 'none',
};

const overlayThumbStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  width: 12,
  height: 12,
  borderRadius: 999,
  borderWidth: 1,
  borderStyle: 'solid',
  transform: 'translate(-50%, -50%)',
  boxSizing: 'border-box',
  pointerEvents: 'none',
};

const rangeStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  opacity: 0,
  cursor: 'pointer',
  margin: 0,
  padding: 0,
};

const overlayValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.05em',
  width: 60,
  textAlign: 'right',
  flexShrink: 0,
};

const inlineWrapStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(152px, 1fr))',
  gap: 8,
  minWidth: 0,
  width: '100%',
};

const inlineControlRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '26px minmax(92px, 1fr) 42px',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
};

const inlineLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 8,
  letterSpacing: '0.10em',
  flexShrink: 0,
};

const inlineTrackShellStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 14,
  minWidth: 92,
};

const inlineTrackRailStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: '50%',
  height: 5,
  transform: 'translateY(-50%)',
  borderRadius: 999,
  pointerEvents: 'none',
};

const inlineFillStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: '50%',
  height: 5,
  transform: 'translateY(-50%)',
  borderRadius: 999,
  pointerEvents: 'none',
};

const inlineThumbStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  width: 9,
  height: 9,
  borderRadius: 999,
  borderWidth: 1,
  borderStyle: 'solid',
  transform: 'translate(-50%, -50%)',
  boxSizing: 'border-box',
  pointerEvents: 'none',
};

const inlineValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 8,
  letterSpacing: '0.04em',
  width: 42,
  textAlign: 'right',
  flexShrink: 0,
};

const resetButtonStyle: React.CSSProperties = {
  height: 20,
  padding: '0 8px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.08em',
  cursor: 'pointer',
  outline: 'none',
};
