// ============================================================
// Session Controls — volume, playback rate, greyscale toggle.
// Compact utility controls that sit above the diagnostics log.
// ============================================================

import { useRef, useState, useCallback } from 'react';
import { useAudioEngine, useDisplayMode, useScrollSpeed } from '../core/session';
import { COLORS, FONTS, SPACING } from '../theme';

interface Props {
  grayscale: boolean;
  onGrayscale: (v: boolean) => void;
  nge: boolean;
  onNge: (v: boolean) => void;
}

export function SessionControls({ grayscale, onGrayscale, nge, onNge }: Props): React.ReactElement {
  const audioEngine = useAudioEngine();
  const scrollSpeed = useScrollSpeed();
  const displayMode = useDisplayMode();
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [scroll, setScroll] = useState(1);
  const volFillRef = useRef<HTMLDivElement>(null);
  const rateFillRef = useRef<HTMLDivElement>(null);
  const scrollFillRef = useRef<HTMLDivElement>(null);

  const onVolChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    audioEngine.setVolume(v);
    if (volFillRef.current) volFillRef.current.style.width = `${v * 100}%`;
  }, [audioEngine]);

  const onRateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const r = parseFloat(e.target.value);
    setRate(r);
    audioEngine.setPlaybackRate(r);
    if (rateFillRef.current) rateFillRef.current.style.width = `${((r - 0.25) / 1.75) * 100}%`;
  }, [audioEngine]);

  const onScrollChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const s = parseFloat(e.target.value);
    setScroll(s);
    scrollSpeed.set(s);
    if (scrollFillRef.current) scrollFillRef.current.style.width = `${((s - 0.25) / 3.75) * 100}%`;
  }, [scrollSpeed]);

  const volPct = Math.round(volume * 100);
  const rateLabel = rate === 1 ? '1.00×' : `${rate.toFixed(2)}×`;
  const scrollLabel = scroll === 1 ? '1.00×' : `${scroll.toFixed(2)}×`;

  return (
    <div style={wrapStyle}>
      <div style={separatorStyle} />

      {/* Volume */}
      <div style={rowStyle}>
        <span style={labelStyle}>VOL</span>
        <div style={trackStyle}>
          <div ref={volFillRef} style={{ ...fillStyle, width: `${volume * 100}%` }} />
          <input
            type="range" min={0} max={1} step={0.01}
            defaultValue={1}
            onChange={onVolChange}
            style={rangeStyle}
          />
        </div>
        <span style={valueStyle}>{volPct}</span>
      </div>

      {/* Playback rate */}
      <div style={rowStyle}>
        <span style={labelStyle}>RATE</span>
        <div style={trackStyle}>
          <div ref={rateFillRef} style={{ ...fillStyle, width: '42.9%' /* default 1.0 of 0.25–2.0 */ }} />
          <input
            type="range" min={0.25} max={2} step={0.05}
            defaultValue={1}
            onChange={onRateChange}
            style={rangeStyle}
          />
        </div>
        <span style={valueStyle}>{rateLabel}</span>
      </div>

      {/* Scroll speed */}
      <div style={rowStyle}>
        <span style={labelStyle}>SCRL</span>
        <div style={trackStyle}>
          <div ref={scrollFillRef} style={{ ...fillStyle, width: '20%' /* default 1.0 of 0.25–4.0 */ }} />
          <input
            type="range" min={0.25} max={4} step={0.25}
            defaultValue={1}
            onChange={onScrollChange}
            style={rangeStyle}
          />
        </div>
        <span style={valueStyle}>{scrollLabel}</span>
      </div>

      <div style={separatorStyle} />

      <div style={toggleRowStyle}>
        {/* Greyscale toggle */}
        <button
          style={{ ...toggleStyle, ...(grayscale ? toggleActiveStyle : {}) }}
          onClick={() => onGrayscale(!grayscale)}
          title="Toggle greyscale display mode"
        >
          ◧ MONO
        </button>

        {/* NGE mode toggle */}
        <button
          style={{ ...toggleStyle, ...(nge ? ngeActiveStyle : {}) }}
          onClick={() => { const v = !nge; displayMode.set(v); onNge(v); }}
          title="NGE phosphor mode — CRT persistence on oscilloscope, scan-line overlay"
        >
          ◉ NGE
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

const labelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textSecondary,
  letterSpacing: '0.10em',
  width: 28,
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
  width: 36,
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
