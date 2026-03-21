import { useCallback } from 'react';

import type { VisualMode } from '../audio/displayMode';
import { useDisplayMode, useVisualMode } from '../core/session';
import { FONTS, MODES, SPACING } from '../theme';

interface Props {
  readonly grayscale: boolean;
  readonly onGrayscale: (nextValue: boolean) => void;
}

const MODE_OPTIONS: readonly VisualMode[] = ['default', 'optic', 'red', 'nge', 'hyper', 'eva'];

function formatModeLabel(mode: VisualMode): string {
  if (mode === 'default') return 'DEFAULT';
  return mode.toUpperCase();
}

export function DisplayOptionsBar({ grayscale, onGrayscale }: Props): React.ReactElement {
  const displayMode = useDisplayMode();
  const visualMode = useVisualMode();
  const current = MODES[visualMode];

  const onMode = useCallback((mode: VisualMode) => {
    displayMode.setMode(mode);
  }, [displayMode]);

  return (
    <div style={wrapStyle}>
      <div style={sectionStyle}>
        <span style={{ ...labelStyle, color: current.category }}>STYLE OPTIONS</span>
        <div style={buttonRowStyle}>
          <button
            style={{
              ...buttonStyle,
              ...(grayscale ? activeButtonStyle : inactiveButtonStyle),
              borderColor: grayscale ? current.chromeBorderActive : current.chromeBorder,
              color: grayscale ? current.text : current.category,
            }}
            onClick={() => onGrayscale(!grayscale)}
            title="Toggle monochrome overlay"
          >
            MONO
          </button>
          {MODE_OPTIONS.map((mode) => {
            const active = visualMode === mode;
            return (
              <button
                key={mode}
                style={{
                  ...buttonStyle,
                  ...(active ? activeButtonStyle : inactiveButtonStyle),
                  borderColor: active ? current.chromeBorderActive : current.chromeBorder,
                  color: active ? current.text : current.category,
                }}
                onClick={() => onMode(mode)}
                title={`Switch to ${formatModeLabel(mode)} mode`}
              >
                {formatModeLabel(mode)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.sm,
  minWidth: 0,
  flexWrap: 'wrap',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.sm,
  minWidth: 0,
  flexWrap: 'wrap',
};

const labelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  flexShrink: 0,
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.xs,
  flexWrap: 'wrap',
  minWidth: 0,
};

const buttonStyle: React.CSSProperties = {
  height: 20,
  padding: '0 8px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  outline: 'none',
  boxSizing: 'border-box',
};

const inactiveButtonStyle: React.CSSProperties = {
  background: 'transparent',
};

const activeButtonStyle: React.CSSProperties = {
  background: 'rgba(80, 96, 192, 0.18)',
};
