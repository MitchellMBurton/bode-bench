import type React from 'react';

export const QUIET_DISABLED_CONTROL: React.CSSProperties = {
  opacity: 0.32,
  filter: 'saturate(0.48)',
  cursor: 'not-allowed',
};

export function quietDisabledControlStyle(
  disabled: boolean,
  overrides: React.CSSProperties = {},
): React.CSSProperties {
  return disabled
    ? {
        ...QUIET_DISABLED_CONTROL,
        background: 'transparent',
        ...overrides,
      }
    : {};
}
