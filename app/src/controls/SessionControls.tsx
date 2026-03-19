// ============================================================
// Session Controls - volume, playback rate, pitch, and display
// toggles. Compact utility controls that sit above diagnostics.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAudioEngine, useScrollSpeed } from '../core/session';
import type { VisualMode } from '../audio/displayMode';
import { CANVAS, COLORS, FONTS, SPACING, MODES } from '../theme';
import {
  RATE_MIN, RATE_MAX, RATE_DEFAULT,
  PITCH_MIN, PITCH_MAX, PITCH_DEFAULT,
  SCROLL_MIN, SCROLL_MAX, SCROLL_DEFAULT,
  VOLUME_DEFAULT,
} from '../constants';

interface SessionTheme {
  separator: string;
  labelColor: string;
  trackBg: string;
  fillAccent: string;
  fillPitch: string;
  valueColor: string;
  buttonBg: string;
  buttonBorder: string;
  buttonColor: string;
}

const SESSION_THEMES: Record<VisualMode, SessionTheme> = {
  default: {
    separator: COLORS.border, labelColor: COLORS.textSecondary, trackBg: COLORS.bg3,
    fillAccent: COLORS.accent, fillPitch: COLORS.accent, valueColor: COLORS.textSecondary,
    buttonBg: COLORS.bg3, buttonBorder: COLORS.border, buttonColor: COLORS.textSecondary,
  },
  nge: {
    separator: 'rgba(60,140,30,0.28)', labelColor: 'rgba(140,210,40,0.6)', trackBg: 'rgba(4,12,4,0.9)',
    fillAccent: 'rgba(120,200,60,0.85)', fillPitch: 'rgba(120,200,60,0.85)', valueColor: 'rgba(180,230,80,0.9)',
    buttonBg: 'rgba(4,10,4,0.9)', buttonBorder: 'rgba(60,130,30,0.35)', buttonColor: 'rgba(140,210,40,0.5)',
  },
  hyper: {
    separator: 'rgba(60,100,200,0.28)', labelColor: CANVAS.hyper.label, trackBg: 'rgba(4,9,28,0.9)',
    fillAccent: 'rgba(98,232,255,0.8)', fillPitch: 'rgba(98,232,255,0.8)', valueColor: 'rgba(210,236,255,0.88)',
    buttonBg: 'rgba(2,5,18,0.9)', buttonBorder: 'rgba(40,70,180,0.35)', buttonColor: 'rgba(112,180,255,0.5)',
  },
  eva: {
    separator: 'rgba(120,50,200,0.28)', labelColor: CANVAS.eva.label, trackBg: 'rgba(8,4,26,0.9)',
    fillAccent: 'rgba(255,123,0,0.8)', fillPitch: 'rgba(255,123,0,0.8)', valueColor: 'rgba(255,180,80,0.88)',
    buttonBg: CANVAS.eva.bg, buttonBorder: CANVAS.eva.chromeBorderActive, buttonColor: 'rgba(170,90,255,0.5)',
  },
  optic: {
    separator: 'rgba(96,131,150,0.36)', labelColor: CANVAS.optic.category, trackBg: '#ccd7de',
    fillAccent: 'rgba(18,118,164,0.86)', fillPitch: 'rgba(76,118,189,0.84)', valueColor: CANVAS.optic.text,
    buttonBg: 'rgba(247,250,252,0.94)', buttonBorder: 'rgba(109,146,165,0.72)', buttonColor: CANVAS.optic.category,
  },
  red: {
    separator: 'rgba(140,30,28,0.28)', labelColor: CANVAS.red.label, trackBg: 'rgba(12,3,4,0.92)',
    fillAccent: 'rgba(255,90,74,0.86)', fillPitch: 'rgba(255,132,106,0.82)', valueColor: CANVAS.red.text,
    buttonBg: 'rgba(12,3,4,0.92)', buttonBorder: 'rgba(124,40,39,0.62)', buttonColor: CANVAS.red.category,
  },
};

interface Props {
  grayscale: boolean;
  onGrayscale: (v: boolean) => void;
  visualMode: VisualMode;
  onVisualMode: (mode: VisualMode) => void;
}

function fillWidth(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`;
}

function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatPitch(semitones: number): string {
  if (Math.abs(semitones) < 0.001) return '0 st';
  const rounded = Math.abs(semitones - Math.round(semitones)) < 0.001
    ? Math.round(semitones)
    : Number(semitones.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded} st`;
}

export function SessionControls({
  grayscale,
  onGrayscale,
  visualMode,
  onVisualMode,
}: Props): React.ReactElement {
  const audioEngine = useAudioEngine();
  const scrollSpeed = useScrollSpeed();

  const [volume, setVolume] = useState(VOLUME_DEFAULT);
  const [rate, setRate] = useState(audioEngine.playbackRate);
  const [pitch, setPitch] = useState(audioEngine.pitchSemitones);
  const [scroll, setScroll] = useState(scrollSpeed.value);
  const [pitchAvailable, setPitchAvailable] = useState(true);

  const volFillRef = useRef<HTMLDivElement>(null);
  const rateFillRef = useRef<HTMLDivElement>(null);
  const pitchFillRef = useRef<HTMLDivElement>(null);
  const scrollFillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      setRate(state.playbackRate);
      setPitch(state.pitchSemitones);
      setPitchAvailable(state.pitchShiftAvailable);

      if (rateFillRef.current) {
        rateFillRef.current.style.width = fillWidth(state.playbackRate, RATE_MIN, RATE_MAX);
      }
      if (pitchFillRef.current) {
        pitchFillRef.current.style.width = fillWidth(state.pitchSemitones, PITCH_MIN, PITCH_MAX);
      }
    });
  }, [audioEngine]);

  const onVolChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVolume = parseFloat(e.target.value);
    setVolume(nextVolume);
    audioEngine.setVolume(nextVolume);
    if (volFillRef.current) {
      volFillRef.current.style.width = `${nextVolume * 100}%`;
    }
  }, [audioEngine]);

  const onRateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const nextRate = parseFloat(e.target.value);
    setRate(nextRate);
    audioEngine.setPlaybackRate(nextRate);
    if (rateFillRef.current) {
      rateFillRef.current.style.width = fillWidth(nextRate, RATE_MIN, RATE_MAX);
    }
  }, [audioEngine]);

  const onPitchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const nextPitch = parseFloat(e.target.value);
    setPitch(nextPitch);
    audioEngine.setPitchSemitones(nextPitch);
    if (pitchFillRef.current) {
      pitchFillRef.current.style.width = fillWidth(nextPitch, PITCH_MIN, PITCH_MAX);
    }
  }, [audioEngine]);

  const onScrollChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const nextScroll = parseFloat(e.target.value);
    setScroll(nextScroll);
    scrollSpeed.set(nextScroll);
    if (scrollFillRef.current) {
      scrollFillRef.current.style.width = fillWidth(nextScroll, SCROLL_MIN, SCROLL_MAX);
    }
  }, [scrollSpeed]);

  const onResetSettings = useCallback(() => {
    setVolume(VOLUME_DEFAULT);
    setRate(RATE_DEFAULT);
    setPitch(PITCH_DEFAULT);
    setScroll(SCROLL_DEFAULT);

    audioEngine.setVolume(VOLUME_DEFAULT);
    audioEngine.setPlaybackRate(RATE_DEFAULT);
    audioEngine.setPitchSemitones(PITCH_DEFAULT);
    scrollSpeed.set(SCROLL_DEFAULT);
    onGrayscale(false);
    onVisualMode('default');

    if (volFillRef.current) {
      volFillRef.current.style.width = `${VOLUME_DEFAULT * 100}%`;
    }
    if (rateFillRef.current) {
      rateFillRef.current.style.width = fillWidth(RATE_DEFAULT, RATE_MIN, RATE_MAX);
    }
    if (pitchFillRef.current) {
      pitchFillRef.current.style.width = fillWidth(PITCH_DEFAULT, PITCH_MIN, PITCH_MAX);
    }
    if (scrollFillRef.current) {
      scrollFillRef.current.style.width = fillWidth(SCROLL_DEFAULT, SCROLL_MIN, SCROLL_MAX);
    }
  }, [audioEngine, onGrayscale, onVisualMode, scrollSpeed]);

  const volPct = Math.round(volume * 100);
  const rateLabel = formatMultiplier(rate);
  const pitchLabel = formatPitch(pitch);
  const scrollLabel = formatMultiplier(scroll);

  const t = SESSION_THEMES[visualMode];

  const thSeparator: React.CSSProperties = { ...separatorStyle, background: t.separator };
  const thLabel: React.CSSProperties = { ...labelStyle, color: t.labelColor };
  const thTrack: React.CSSProperties = { ...trackStyle, background: t.trackBg };
  const thFill: React.CSSProperties = { ...fillStyle, background: t.fillAccent };
  const thValue: React.CSSProperties = { ...valueStyle, color: t.valueColor };
  const thButton: React.CSSProperties = { ...toggleStyle, background: t.buttonBg, borderColor: t.buttonBorder, color: t.buttonColor };
  const m = MODES[visualMode];
  const thToggleActive: React.CSSProperties = { ...toggleActiveStyle, background: m.bg2, borderColor: m.chromeBorderActive, color: m.text };

  return (
    <div style={wrapStyle}>
      <div style={thSeparator} />

      <div style={utilityRowStyle}>
        <button
          style={{ ...utilityButtonStyle, background: t.buttonBg, borderColor: t.buttonBorder, color: t.buttonColor }}
          onClick={onResetSettings}
          title="Reset session controls to defaults"
        >
          RESET SETTINGS
        </button>
      </div>

      <div style={rowStyle}>
        <span style={thLabel}>VOL</span>
        <div style={thTrack}>
          <div ref={volFillRef} style={{ ...thFill, width: `${volume * 100}%` }} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={onVolChange}
            style={rangeStyle}
            title="Master output level"
          />
        </div>
        <span style={thValue}>{volPct}</span>
      </div>

      <div style={rowStyle}>
        <span style={thLabel}>RATE</span>
        <div style={thTrack}>
          <div ref={rateFillRef} style={{ ...thFill, width: fillWidth(rate, RATE_MIN, RATE_MAX) }} />
          <input
            type="range"
            min={RATE_MIN}
            max={RATE_MAX}
            step={0.05}
            value={rate}
            onChange={onRateChange}
            style={rangeStyle}
            title="Playback rate multiplier"
          />
        </div>
        <span style={thValue}>{rateLabel}</span>
      </div>

      <div style={rowStyle}>
        <span style={thLabel}>PITCH</span>
        <div style={thTrack}>
          <div
            ref={pitchFillRef}
            style={{
              ...thFill,
              width: fillWidth(pitch, PITCH_MIN, PITCH_MAX),
              background: pitchAvailable ? t.fillPitch : COLORS.border,
            }}
          />
          <input
            type="range"
            min={PITCH_MIN}
            max={PITCH_MAX}
            step={1}
            value={pitch}
            onChange={onPitchChange}
            style={rangeStyle}
            title={pitchAvailable ? 'Pitch transpose in semitones with tempo preserved.' : 'Studio pitch shift is unavailable in this runtime.'}
            disabled={!pitchAvailable}
          />
        </div>
        <span style={thValue}>{pitchAvailable ? pitchLabel : 'N/A'}</span>
      </div>

      <div style={rowStyle}>
        <span style={thLabel}>SCRL</span>
        <div style={thTrack}>
          <div ref={scrollFillRef} style={{ ...thFill, width: fillWidth(scroll, SCROLL_MIN, SCROLL_MAX) }} />
          <input
            type="range"
            min={SCROLL_MIN}
            max={SCROLL_MAX}
            step={0.25}
            value={scroll}
            onChange={onScrollChange}
            style={rangeStyle}
            title="Visual scroll speed multiplier"
          />
        </div>
        <span style={thValue}>{scrollLabel}</span>
      </div>

      <div style={thSeparator} />

      <div style={toggleRowStyle}>
        <button
          style={{ ...thButton, ...(grayscale ? thToggleActive : {}) }}
          onClick={() => onGrayscale(!grayscale)}
          title="Toggle greyscale display mode"
        >
          MONO
        </button>
        {(['optic', 'red', 'nge', 'hyper', 'eva'] as const).map((mode) => (
          <button
            key={mode}
            style={{ ...thButton, ...(visualMode === mode ? MODE_TOGGLE_ACTIVE[mode] : {}) }}
            onClick={() => onVisualMode(visualMode === mode ? 'default' : mode)}
            title={MODE_TOGGLE_TITLES[mode]}
          >
            {mode.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.sm,
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  flexShrink: 0,
};

const separatorStyle: React.CSSProperties = {
  height: 1,
  background: COLORS.border,
  flexShrink: 0,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.sm,
  flexShrink: 0,
};

const utilityRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-start',
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  letterSpacing: '0.10em',
  width: 40,
  flexShrink: 0,
};

const trackStyle: React.CSSProperties = {
  position: 'relative',
  flex: 1,
  height: 4,
  background: COLORS.bg3,
  borderRadius: 2,
};

const fillStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  height: '100%',
  background: COLORS.accent,
  borderRadius: 2,
  pointerEvents: 'none',
};

const rangeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  cursor: 'pointer',
  margin: 0,
  padding: 0,
};

const valueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  letterSpacing: '0.06em',
  width: 52,
  textAlign: 'right',
  flexShrink: 0,
};

const toggleStyle: React.CSSProperties = {
  background: COLORS.bg3,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: COLORS.border,
  color: COLORS.textSecondary,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.10em',
  padding: `${SPACING.xs}px ${SPACING.sm}px`,
  cursor: 'pointer',
  borderRadius: 2,
  alignSelf: 'flex-start',
  outline: 'none',
};

const utilityButtonStyle: React.CSSProperties = {
  ...toggleStyle,
  padding: `${SPACING.xs}px ${SPACING.md}px`,
};

const toggleRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: SPACING.sm,
};

const toggleActiveStyle: React.CSSProperties = {
  background: COLORS.accentDim,
  borderColor: COLORS.accent,
  color: COLORS.textPrimary,
};

type ToggleMode = 'optic' | 'red' | 'nge' | 'hyper' | 'eva';

const MODE_TOGGLE_ACTIVE: Record<ToggleMode, React.CSSProperties> = {
  optic: { background: 'linear-gradient(135deg, rgba(252,254,255,0.99), rgba(230,239,245,0.99))', borderColor: '#4f86a3', color: '#13394f', boxShadow: '0 0 0 1px rgba(79,134,163,0.12)' },
  red:   { background: 'rgba(34,10,11,0.98)', borderColor: '#7c2827', color: '#ffd0c8', boxShadow: '0 0 10px rgba(255,90,74,0.18)' },
  nge:   { background: 'rgba(30,60,10,1)', borderColor: 'rgba(140,210,40,0.7)', color: 'rgba(160,230,60,1)' },
  hyper: { background: 'rgba(10,22,56,1)', borderColor: 'rgba(112,208,255,0.72)', color: 'rgba(210,236,255,0.98)', boxShadow: '0 0 10px rgba(98,232,255,0.18)' },
  eva:   { background: '#3a1070', color: '#ff7b00', borderColor: '#4a1a90' },
};

const MODE_TOGGLE_TITLES: Record<ToggleMode, string> = {
  optic: 'White-light optics mode',
  red:   'Dark red instrument mode',
  nge:   'NGE phosphor mode',
  hyper: 'Hyperspectral image mode',
  eva:   'EVA NERV command mode',
};
