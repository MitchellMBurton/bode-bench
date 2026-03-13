// ============================================================
// Session Controls - volume, playback rate, pitch, and display
// toggles. Compact utility controls that sit above diagnostics.
// ============================================================

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';

import { useAudioEngine, useDisplayMode, useScrollSpeed } from '../core/session';
import { COLORS, FONTS, SPACING } from '../theme';
import {
  RATE_MIN, RATE_MAX, RATE_DEFAULT,
  PITCH_MIN, PITCH_MAX, PITCH_DEFAULT,
  SCROLL_MIN, SCROLL_MAX, SCROLL_DEFAULT,
  VOLUME_DEFAULT,
} from '../constants';

interface Props {
  grayscale: boolean;
  onGrayscale: (v: boolean) => void;
  nge: boolean;
  onNge: (v: boolean) => void;
  /** Increment this value to externally trigger a full settings reset. */
  resetKey?: number;
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

export function SessionControls({ grayscale, onGrayscale, nge, onNge, resetKey }: Props): React.ReactElement {
  const audioEngine = useAudioEngine();
  const scrollSpeed = useScrollSpeed();
  const displayMode = useDisplayMode();

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
    displayMode.set(false);
    onGrayscale(false);
    onNge(false);

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
  }, [audioEngine, displayMode, onGrayscale, onNge, scrollSpeed]);

  // External reset trigger — fires when parent increments resetKey.
  const handleExternalReset = useEffectEvent(onResetSettings);
  useEffect(() => {
    if (!resetKey) return;
    handleExternalReset();
  }, [resetKey]);

  const volPct = Math.round(volume * 100);
  const rateLabel = formatMultiplier(rate);
  const pitchLabel = formatPitch(pitch);
  const scrollLabel = formatMultiplier(scroll);

  return (
    <div style={wrapStyle}>
      <div style={separatorStyle} />

      <div style={utilityRowStyle}>
        <button
          style={utilityButtonStyle}
          onClick={onResetSettings}
          title="Reset session controls to defaults"
        >
          RESET SETTINGS
        </button>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>VOL</span>
        <div style={trackStyle}>
          <div ref={volFillRef} style={{ ...fillStyle, width: `${volume * 100}%` }} />
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
        <span style={valueStyle}>{volPct}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>RATE</span>
        <div style={trackStyle}>
          <div ref={rateFillRef} style={{ ...fillStyle, width: fillWidth(rate, RATE_MIN, RATE_MAX) }} />
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
        <span style={valueStyle}>{rateLabel}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>PITCH</span>
        <div style={trackStyle}>
          <div
            ref={pitchFillRef}
            style={{
              ...fillStyle,
              width: fillWidth(pitch, PITCH_MIN, PITCH_MAX),
              background: pitchAvailable ? COLORS.accent : COLORS.border,
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
        <span style={valueStyle}>{pitchAvailable ? pitchLabel : 'N/A'}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>SCRL</span>
        <div style={trackStyle}>
          <div ref={scrollFillRef} style={{ ...fillStyle, width: fillWidth(scroll, SCROLL_MIN, SCROLL_MAX) }} />
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
        <span style={valueStyle}>{scrollLabel}</span>
      </div>

      <div style={separatorStyle} />

      <div style={toggleRowStyle}>
        <button
          style={{ ...toggleStyle, ...(grayscale ? toggleActiveStyle : {}) }}
          onClick={() => onGrayscale(!grayscale)}
          title="Toggle greyscale display mode"
        >
          MONO
        </button>

        <button
          style={{ ...toggleStyle, ...(nge ? ngeActiveStyle : {}) }}
          onClick={() => {
            const nextNge = !nge;
            displayMode.set(nextNge);
            onNge(nextNge);
          }}
          title="NGE phosphor mode"
        >
          NGE
        </button>
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
  border: `1px solid ${COLORS.border}`,
  color: COLORS.textSecondary,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.10em',
  padding: `${SPACING.xs}px ${SPACING.sm}px`,
  cursor: 'pointer',
  borderRadius: 2,
  alignSelf: 'flex-start',
  outline: 'none',
  transition: 'background 0.1s, border-color 0.1s, color 0.1s',
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

const ngeActiveStyle: React.CSSProperties = {
  background: 'rgba(30,60,10,1)',
  borderColor: 'rgba(140,210,40,0.7)',
  color: 'rgba(160,230,60,1)',
};
