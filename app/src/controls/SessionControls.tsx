import { useCallback, useEffect, useState } from 'react';

import { useAudioEngine, useScrollSpeed, useVisualMode } from '../core/session';
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

type TuningGroupId = 'playback' | 'monitor' | 'view';

interface TuningRow {
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

interface TuningGroup {
  readonly id: TuningGroupId;
  readonly label: string;
  readonly rows: readonly TuningRow[];
}

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

export function SessionControls(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const scrollSpeed = useScrollSpeed();
  const visualMode = useVisualMode();
  const t = SESSION_THEMES[visualMode];
  const [volume, setVolume] = useState(VOLUME_DEFAULT);
  const [rate, setRate] = useState(audioEngine.playbackRate);
  const [pitch, setPitch] = useState(audioEngine.pitchSemitones);
  const [scroll, setScroll] = useState(scrollSpeed.value);
  const [pitchAvailable, setPitchAvailable] = useState(true);

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      setRate(state.playbackRate);
      setPitch(state.pitchSemitones);
      setPitchAvailable(state.pitchShiftAvailable);
    });
  }, [audioEngine]);

  const onReset = useCallback(() => {
    setVolume(VOLUME_DEFAULT);
    setRate(RATE_DEFAULT);
    setPitch(PITCH_DEFAULT);
    setScroll(SCROLL_DEFAULT);
    audioEngine.setVolume(VOLUME_DEFAULT);
    audioEngine.setPlaybackRate(RATE_DEFAULT);
    audioEngine.setPitchSemitones(PITCH_DEFAULT);
    scrollSpeed.set(SCROLL_DEFAULT);
  }, [audioEngine, scrollSpeed]);

  const playbackRows: readonly TuningRow[] = [
    {
      label: 'VOL',
      value: volume,
      valueLabel: `${Math.round(volume * 100)}`,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (nextValue: number) => {
        setVolume(nextValue);
        audioEngine.setVolume(nextValue);
      },
      fill: t.fill,
      disabled: false,
      title: 'Master output level',
    },
    {
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
      fill: t.fill,
      disabled: false,
      title: 'Playback rate multiplier',
    },
    {
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
      fill: pitchAvailable ? t.pitchFill : t.border,
      disabled: !pitchAvailable,
      title: pitchAvailable ? 'Pitch transpose in semitones with tempo preserved.' : 'Studio pitch shift is unavailable in this runtime.',
    },
    {
      label: 'SCRL',
      value: scroll,
      valueLabel: formatMultiplier(scroll),
      min: SCROLL_MIN,
      max: SCROLL_MAX,
      step: 0.25,
      onChange: (nextValue: number) => {
        setScroll(nextValue);
        scrollSpeed.set(nextValue);
      },
      fill: t.fill,
      disabled: false,
      title: 'Visual scroll speed multiplier',
    },
  ];

  const groups: readonly TuningGroup[] = [
    {
      id: 'playback',
      label: 'PLAYBACK TUNING',
      rows: playbackRows,
    },
  ];

  return (
    <div style={wrapStyle}>
      <div style={headerRowStyle}>
        <span style={{ ...sectionLabelStyle, color: t.label }}>{groups[0].label}</span>
        <button
          style={{ ...resetButtonStyle, background: t.buttonBg, borderColor: t.border, color: t.label }}
          onClick={onReset}
          title="Reset playback and scroll controls"
        >
          RESET
        </button>
      </div>
      <div style={groupWrapStyle}>
        {groups.map((group) => (
          <div key={group.id} style={groupStyle}>
            <div style={rowWrapStyle}>
              {group.rows.map((row) => {
                const width = fillWidth(row.value, row.min, row.max);
                return (
                  <div key={row.label} style={controlRowStyle}>
                    <span style={{ ...chipLabelStyle, color: t.label }}>{row.label}</span>
                    <div style={trackShellStyle}>
                      <div style={{ ...trackRailStyle, background: t.track }} />
                      <div
                        style={{
                          ...fillStyle,
                          width,
                          background: row.fill,
                        }}
                      />
                      <div
                        style={{
                          ...thumbStyle,
                          left: width,
                          background: row.fill,
                          borderColor: t.clusterBg,
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
                    <span style={{ ...chipValueStyle, color: t.text }}>{row.valueLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 6,
  minWidth: 0,
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: SPACING.xs,
  minWidth: 0,
};

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  lineHeight: 1,
};

const rowWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
};

const groupWrapStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 8,
  minWidth: 0,
};

const groupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
};

const controlRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '36px minmax(180px, 1fr) 48px',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
};

const chipLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.08em',
  flexShrink: 0,
};

const trackShellStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 16,
  minWidth: 180,
};

const trackRailStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: '50%',
  height: 6,
  transform: 'translateY(-50%)',
  borderRadius: 999,
  pointerEvents: 'none',
};

const fillStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: '50%',
  height: 6,
  transform: 'translateY(-50%)',
  borderRadius: 999,
  pointerEvents: 'none',
};

const thumbStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  width: 10,
  height: 10,
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

const chipValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.05em',
  width: 48,
  textAlign: 'right',
  flexShrink: 0,
};

const resetButtonStyle: React.CSSProperties = {
  height: 18,
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
