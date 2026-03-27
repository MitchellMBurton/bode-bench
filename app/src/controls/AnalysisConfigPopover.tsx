// ============================================================
// AnalysisConfigPopover — grouped spectral analysis controls
// for shared engine settings plus spectrogram, response, and
// loudness display tuning.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VisualMode } from '../audio/displayMode';
import {
  FFT_SIZE_OPTIONS,
  FREQ_RESPONSE_BANDWIDTH_OPTIONS,
  FREQ_RESPONSE_DB_SPAN_OPTIONS,
  LOUDNESS_REFERENCE_MODE_OPTIONS,
  LOUDNESS_TARGET_PRESET_OPTIONS,
  SPECTROGRAM_GRID_DENSITY_OPTIONS,
} from '../audio/analysisConfig';
import { useAnalysisConfig, useAnalysisConfigStore } from '../core/session';
import { FONTS, MODES, SPACING } from '../theme';
import type {
  FftSizeOption,
  FreqResponseBandwidth,
  FreqResponseDbSpan,
  LoudnessReferenceMode,
  LoudnessTargetPreset,
  SpectrogramGridDensity,
} from '../types';

interface Props {
  readonly visualMode: VisualMode;
  readonly onClose: () => void;
}

const FFT_LABELS: Record<FftSizeOption, string> = { 2048: '2K', 4096: '4K', 8192: '8K', 16384: '16K' };
const BW_LABELS: Record<FreqResponseBandwidth, string> = { '1/12-oct': '1/12', '1/6-oct': '1/6', '1/3-oct': '1/3', '1-oct': '1' };
const DB_SPAN_LABELS: Record<FreqResponseDbSpan, string> = { 36: '36 dB', 54: '54 dB', 72: '72 dB' };
const GRID_DENSITY_LABELS: Record<SpectrogramGridDensity, string> = {
  off: 'OFF',
  'major-only': 'MAJOR',
  'major+minor': 'FULL',
};
const TARGET_PRESET_LABELS: Record<LoudnessTargetPreset, string> = {
  stream: 'STREAM',
  apple: 'APPLE',
  ebu: 'EBU',
  cinema: 'CINEMA',
};
const REFERENCE_MODE_LABELS: Record<LoudnessReferenceMode, string> = {
  all: 'ALL',
  'target-only': 'TARGET',
};

export function AnalysisConfigPopover({ visualMode, onClose }: Props): React.ReactElement {
  const store = useAnalysisConfigStore();
  const config = useAnalysisConfig();
  const m = MODES[visualMode];
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const onSmoothing = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    store.setSmoothing(parseFloat(event.target.value));
  }, [store]);

  const onDbMin = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    if (Number.isFinite(value)) {
      store.setSpectroDbRange(value, config.spectrogram.dbMax);
    }
  }, [config.spectrogram.dbMax, store]);

  const onDbMax = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    if (Number.isFinite(value)) {
      store.setSpectroDbRange(config.spectrogram.dbMin, value);
    }
  }, [config.spectrogram.dbMin, store]);

  const segBtn = (active: boolean): React.CSSProperties => ({
    ...segButtonStyle,
    borderColor: active ? m.chromeBorderActive : m.chromeBorder,
    color: active ? m.text : m.category,
    background: active ? 'rgba(80, 96, 192, 0.18)' : 'transparent',
  });

  const toggleBtn = (active: boolean): React.CSSProperties => ({
    ...segBtn(active),
    minWidth: 42,
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
      <div style={headerStyle}>
        <span style={{ ...headerTitleStyle, color: m.text }}>ANALYSIS CONFIG</span>
      </div>

      <div style={bodyStyle}>
        <ConfigSection title="GENERAL" labelColor={m.category}>
          <ConfigRow label="FFT SIZE" labelColor={m.category}>
            <div style={segGroupStyle}>
              {FFT_SIZE_OPTIONS.map((size) => (
                <button key={size} style={segBtn(config.general.fftSize === size)} onClick={() => store.setFftSize(size)}>
                  {FFT_LABELS[size]}
                </button>
              ))}
            </div>
          </ConfigRow>

          <ConfigRow label="SMOOTH" labelColor={m.category}>
            <SmoothSlider
              value={config.general.smoothing}
              onChange={onSmoothing}
              traceColor={m.trace}
              trackBg={m.chromeBorder}
            />
            <span style={{ ...rowValueStyle, color: m.label }}>{config.general.smoothing.toFixed(2)}</span>
          </ConfigRow>
        </ConfigSection>

        <ConfigSection title="SPECTROGRAM" labelColor={m.category}>
          <ConfigRow label="dB RANGE" labelColor={m.category}>
            <input
              type="number"
              value={config.spectrogram.dbMin}
              onChange={onDbMin}
              style={{ ...numberInputStyle, borderColor: m.chromeBorder, color: m.text, background: m.bg2 }}
              title="Spectrogram minimum dB"
            />
            <span style={{ ...rowValueStyle, color: m.label }}>to</span>
            <input
              type="number"
              value={config.spectrogram.dbMax}
              onChange={onDbMax}
              style={{ ...numberInputStyle, borderColor: m.chromeBorder, color: m.text, background: m.bg2 }}
              title="Spectrogram maximum dB"
            />
          </ConfigRow>

          <ConfigRow label="GRID" labelColor={m.category}>
            <div style={segGroupStyle}>
              {SPECTROGRAM_GRID_DENSITY_OPTIONS.map((gridDensity) => (
                <button
                  key={gridDensity}
                  style={segBtn(config.spectrogram.gridDensity === gridDensity)}
                  onClick={() => store.setSpectrogramGridDensity(gridDensity)}
                >
                  {GRID_DENSITY_LABELS[gridDensity]}
                </button>
              ))}
            </div>
          </ConfigRow>
        </ConfigSection>

        <ConfigSection title="RESPONSE" labelColor={m.category}>
          <ConfigRow label="FR BW" labelColor={m.category}>
            <div style={segGroupStyle}>
              {FREQ_RESPONSE_BANDWIDTH_OPTIONS.map((bandwidth) => (
                <button
                  key={bandwidth}
                  style={segBtn(config.frequencyResponse.bandwidth === bandwidth)}
                  onClick={() => store.setBandwidth(bandwidth)}
                >
                  {BW_LABELS[bandwidth]}
                </button>
              ))}
            </div>
          </ConfigRow>

          <ConfigRow label="SPAN" labelColor={m.category}>
            <div style={segGroupStyle}>
              {FREQ_RESPONSE_DB_SPAN_OPTIONS.map((dbSpan) => (
                <button
                  key={dbSpan}
                  style={segBtn(config.frequencyResponse.dbSpan === dbSpan)}
                  onClick={() => store.setFrequencyResponseDbSpan(dbSpan)}
                >
                  {DB_SPAN_LABELS[dbSpan]}
                </button>
              ))}
            </div>
          </ConfigRow>
        </ConfigSection>

        <ConfigSection title="LOUDNESS" labelColor={m.category}>
          <ConfigRow label="TARGET" labelColor={m.category}>
            <div style={segGroupStyle}>
              {LOUDNESS_TARGET_PRESET_OPTIONS.map((preset) => (
                <button
                  key={preset}
                  style={segBtn(config.loudness.targetPreset === preset)}
                  onClick={() => store.setLoudnessTargetPreset(preset)}
                >
                  {TARGET_PRESET_LABELS[preset]}
                </button>
              ))}
            </div>
          </ConfigRow>

          <ConfigRow label="REF LINES" labelColor={m.category}>
            <div style={segGroupStyle}>
              {LOUDNESS_REFERENCE_MODE_OPTIONS.map((mode) => (
                <button
                  key={mode}
                  style={segBtn(config.loudness.referenceMode === mode)}
                  onClick={() => store.setLoudnessReferenceMode(mode)}
                >
                  {REFERENCE_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </ConfigRow>

          <ConfigRow label="RMS GUIDES" labelColor={m.category}>
            <div style={segGroupStyle}>
              <button style={toggleBtn(!config.loudness.showRmsGuides)} onClick={() => store.setShowRmsGuides(false)}>
                OFF
              </button>
              <button style={toggleBtn(config.loudness.showRmsGuides)} onClick={() => store.setShowRmsGuides(true)}>
                ON
              </button>
            </div>
          </ConfigRow>
        </ConfigSection>
      </div>

      <div style={{ ...footerStyle, borderTopColor: m.chromeBorder }}>
        <button
          style={{ ...footerButtonStyle, borderColor: m.chromeBorder, color: m.text, background: m.bg2 }}
          onClick={() => store.restoreDefaults()}
        >
          RESTORE DEFAULTS
        </button>
      </div>
    </div>
  );
}

function ConfigSection({
  title,
  labelColor,
  children,
}: {
  readonly title: string;
  readonly labelColor: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <section style={sectionStyle}>
      <div style={{ ...sectionTitleStyle, color: labelColor }}>{title}</div>
      <div style={sectionBodyStyle}>{children}</div>
    </section>
  );
}

function ConfigRow({
  label,
  labelColor,
  children,
}: {
  readonly label: string;
  readonly labelColor: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={rowStyle}>
      <span style={{ ...rowLabelStyle, color: labelColor }}>{label}</span>
      <div style={rowControlStyle}>{children}</div>
    </div>
  );
}

function SmoothSlider({
  value,
  onChange,
  traceColor,
  trackBg,
}: {
  readonly value: number;
  readonly onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly traceColor: string;
  readonly trackBg: string;
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

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    commit(event.clientX);
  }, [commit]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    commit(event.clientX);
  }, [commit, dragging]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  }, []);

  const percent = `${(value * 100).toFixed(1)}%`;

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
      <div style={{ ...sliderFillStyle, width: percent, background: traceColor }} />
      <div style={{ ...sliderThumbStyle, left: percent, background: traceColor }} />
    </div>
  );
}

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 4,
  borderRadius: 3,
  zIndex: 200,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 332,
  maxWidth: 360,
  maxHeight: 420,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: `${SPACING.sm}px ${SPACING.md}px ${SPACING.xs}px`,
};

const headerTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.12em',
};

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.sm,
  padding: `0 ${SPACING.md}px ${SPACING.sm}px`,
  overflowY: 'auto',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.xs,
};

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.14em',
};

const sectionBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.xs,
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
  width: 78,
  textAlign: 'right',
};

const rowControlStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.xs,
  flex: 1,
  minWidth: 0,
  flexWrap: 'wrap',
};

const rowValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  flexShrink: 0,
};

const segGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  flexWrap: 'wrap',
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
  background: 'transparent',
};

const sliderTrackStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 120,
  height: 6,
  position: 'relative',
  borderRadius: 999,
  cursor: 'pointer',
};

const sliderFillStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  bottom: 0,
  borderRadius: 999,
};

const sliderThumbStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  width: 10,
  height: 10,
  borderRadius: '50%',
  transform: 'translate(-50%, -50%)',
};

const numberInputStyle: React.CSSProperties = {
  width: 58,
  height: 20,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  padding: '0 4px',
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  outline: 'none',
  boxSizing: 'border-box',
};

const footerStyle: React.CSSProperties = {
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  borderTopWidth: 1,
  borderTopStyle: 'solid',
};

const footerButtonStyle: React.CSSProperties = {
  height: 22,
  padding: '0 8px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.08em',
  cursor: 'pointer',
};
