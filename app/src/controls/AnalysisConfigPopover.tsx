// ============================================================
// AnalysisConfigPopover — compact popover for tuning FFT size,
// smoothing, frequency response bandwidth, and spectrogram dB
// range. Positioned relative to its trigger button.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VisualMode } from '../audio/displayMode';
import type { FftSizeOption, FreqResponseBandwidth } from '../types';
import { useAnalysisConfig, useAnalysisConfigStore } from '../core/session';
import { FONTS, MODES, SPACING } from '../theme';

interface Props {
  readonly visualMode: VisualMode;
  readonly onClose: () => void;
}

const FFT_OPTIONS: readonly FftSizeOption[] = [2048, 4096, 8192, 16384];
const FFT_LABELS: Record<number, string> = { 2048: '2K', 4096: '4K', 8192: '8K', 16384: '16K' };
const BW_OPTIONS: readonly FreqResponseBandwidth[] = ['1/12-oct', '1/6-oct', '1/3-oct', '1-oct'];
const BW_LABELS: Record<FreqResponseBandwidth, string> = { '1/12-oct': '1/12', '1/6-oct': '1/6', '1/3-oct': '1/3', '1-oct': '1' };

export function AnalysisConfigPopover({ visualMode, onClose }: Props): React.ReactElement {
  const store = useAnalysisConfigStore();
  const config = useAnalysisConfig();
  const m = MODES[visualMode];
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const onSmoothing = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    store.setSmoothing(parseFloat(e.target.value));
  }, [store]);

  const onDbMin = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    if (Number.isFinite(v)) store.setSpectroDbRange(v, config.spectroDbMax);
  }, [store, config.spectroDbMax]);

  const onDbMax = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    if (Number.isFinite(v)) store.setSpectroDbRange(config.spectroDbMin, v);
  }, [store, config.spectroDbMin]);

  const segBtn = (active: boolean): React.CSSProperties => ({
    ...segButtonStyle,
    borderColor: active ? m.chromeBorderActive : m.chromeBorder,
    color: active ? m.text : m.category,
    background: active ? 'rgba(80, 96, 192, 0.18)' : 'transparent',
  });

  return (
    <div
      ref={popoverRef}
      style={{
        ...popoverStyle,
        background: m.bg,
        border: `1px solid ${m.chromeBorderActive}`,
        color: m.text,
      }}
    >
      {/* FFT Size */}
      <div style={rowStyle}>
        <span style={{ ...rowLabelStyle, color: m.category }}>FFT SIZE</span>
        <div style={segGroupStyle}>
          {FFT_OPTIONS.map((size) => (
            <button
              key={size}
              style={segBtn(config.fftSize === size)}
              onClick={() => store.setFftSize(size)}
            >
              {FFT_LABELS[size]}
            </button>
          ))}
        </div>
      </div>

      {/* Smoothing */}
      <div style={rowStyle}>
        <span style={{ ...rowLabelStyle, color: m.category }}>SMOOTH</span>
        <SmoothSlider value={config.smoothing} onChange={onSmoothing} traceColor={m.trace} trackBg={m.chromeBorder} />
        <span style={{ ...rowValueStyle, color: m.label }}>{config.smoothing.toFixed(2)}</span>
      </div>

      {/* FR Bandwidth */}
      <div style={rowStyle}>
        <span style={{ ...rowLabelStyle, color: m.category }}>FR BW</span>
        <div style={segGroupStyle}>
          {BW_OPTIONS.map((bw) => (
            <button
              key={bw}
              style={segBtn(config.freqResponseBandwidth === bw)}
              onClick={() => store.setBandwidth(bw)}
            >
              {BW_LABELS[bw]}
            </button>
          ))}
        </div>
      </div>

      {/* Spectro dB Range */}
      <div style={rowStyle}>
        <span style={{ ...rowLabelStyle, color: m.category }}>dB RANGE</span>
        <input
          type="number"
          value={config.spectroDbMin}
          onChange={onDbMin}
          style={{ ...numberInputStyle, borderColor: m.chromeBorder, color: m.text, background: m.bg2 }}
          title="Spectrogram minimum dB"
        />
        <span style={{ ...rowValueStyle, color: m.label }}>to</span>
        <input
          type="number"
          value={config.spectroDbMax}
          onChange={onDbMax}
          style={{ ...numberInputStyle, borderColor: m.chromeBorder, color: m.text, background: m.bg2 }}
          title="Spectrogram maximum dB"
        />
      </div>
    </div>
  );
}

// ── SmoothSlider ─────────────────────────────────────────────

function SmoothSlider({ value, onChange, traceColor, trackBg }: {
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  traceColor: string;
  trackBg: string;
}): React.ReactElement {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const commit = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const stepped = Math.round(ratio * 100) / 100;
    onChange({ target: { value: String(stepped) } } as React.ChangeEvent<HTMLInputElement>);
  }, [onChange]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    commit(e.clientX);
  }, [commit]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    commit(e.clientX);
  }, [dragging, commit]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  }, []);

  const pct = `${(value * 100).toFixed(1)}%`;

  return (
    <div
      ref={trackRef}
      style={{ ...sliderTrackStyle, background: trackBg }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title={`Smoothing: ${value.toFixed(2)}`}
    >
      <div style={{ ...sliderFillStyle, width: pct, background: traceColor }} />
      <div style={{ ...sliderThumbStyle, left: pct, background: traceColor }} />
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 4,
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  borderRadius: 3,
  zIndex: 200,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.sm,
  minWidth: 220,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.sm,
  minHeight: 22,
};

const rowLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.10em',
  flexShrink: 0,
  width: 64,
  textAlign: 'right',
};

const rowValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  flexShrink: 0,
};

const segGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
};

const segButtonStyle: React.CSSProperties = {
  height: 20,
  padding: '0 6px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.08em',
  cursor: 'pointer',
  outline: 'none',
  boxSizing: 'border-box',
};

const sliderTrackStyle: React.CSSProperties = {
  flex: 1,
  height: 6,
  borderRadius: 3,
  cursor: 'pointer',
  position: 'relative',
  touchAction: 'none',
  userSelect: 'none',
};

const sliderFillStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  height: '100%',
  borderRadius: 3,
  opacity: 0.6,
  pointerEvents: 'none',
};

const sliderThumbStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  width: 10,
  height: 10,
  borderRadius: '50%',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
  boxShadow: '0 0 4px rgba(0,0,0,0.4)',
};

const numberInputStyle: React.CSSProperties = {
  width: 48,
  height: 20,
  padding: '0 4px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  outline: 'none',
  boxSizing: 'border-box',
  textAlign: 'center',
};
