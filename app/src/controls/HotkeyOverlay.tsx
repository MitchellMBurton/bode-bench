// ============================================================
// HotkeyOverlay — full-screen keyboard shortcut reference card.
// Toggle with the ? key; closes on Escape or backdrop click.
// ============================================================

import { useEffect } from 'react';
import type { VisualMode } from '../audio/displayMode';
import { COLORS, FONTS, MODES } from '../theme';

interface Props {
  open: boolean;
  onClose: () => void;
  visualMode: VisualMode;
}

const HOTKEY_TABLE: readonly { key: string; description: string }[] = [
  { key: 'Space',      description: 'Play / pause' },
  { key: '← →',       description: 'Seek ±5 s' },
  { key: 'Shift ← →', description: 'Seek ±15 s' },
  { key: 'S',          description: 'Stop (return to 0)' },
  { key: 'L',          description: 'Toggle loop (full file)' },
  { key: 'Escape',     description: 'Clear loop region' },
  { key: 'M',          description: 'Place marker at playhead' },
  { key: '?',          description: 'Show / hide this overlay' },
];

export function HotkeyOverlay({ open, onClose, visualMode }: Props): React.ReactElement | null {
  const optic = visualMode === 'optic';
  const red = visualMode === 'red';

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const m = MODES[visualMode];

  return (
    <div
      style={{
        ...backdropStyle,
        background: optic
          ? 'rgba(224, 233, 240, 0.62)'
          : red
            ? 'rgba(18, 4, 5, 0.76)'
            : backdropStyle.background,
      }}
      data-shell-overlay="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          ...cardStyle,
          borderColor: m.chromeBorderActive,
          background: optic
            ? 'rgba(248,251,253,0.98)'
            : red
              ? 'rgba(16,4,5,0.98)'
              : cardStyle.background,
          boxShadow: optic
            ? '0 10px 28px rgba(79, 134, 163, 0.16)'
            : red
              ? '0 10px 28px rgba(120, 16, 10, 0.28)'
              : cardStyle.boxShadow,
        }}
      >
        {/* Header */}
        <div style={headerRowStyle}>
          <span style={{ ...headerLabelStyle, color: m.category }}>KEYBOARD SHORTCUTS</span>
          <button style={{ ...closeBtnStyle, color: optic || red ? m.text : closeBtnStyle.color }} onClick={onClose} aria-label="Close">✕</button>
        </div>
        {/* Divider */}
        <div style={{ ...dividerStyle, background: optic ? 'rgba(109,146,165,0.64)' : red ? 'rgba(124,40,39,0.56)' : dividerStyle.background }} />
        {/* Shortcut table */}
        <table style={tableStyle}>
          <tbody>
            {HOTKEY_TABLE.map(({ key, description }) => (
              <tr key={key}>
                <td style={{ ...keyColStyle, color: m.trace }}>{key}</td>
                <td style={{ ...descColStyle, color: optic ? 'rgba(41,73,92,0.84)' : red ? 'rgba(255,208,200,0.82)' : descColStyle.color }}>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(4,5,12,0.72)',
};

const cardStyle: React.CSSProperties = {
  width: 400,
  padding: '16px 20px 20px',
  background: 'rgba(6,6,14,0.97)',
  border: '1px solid',
  borderRadius: 2,
  boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
};

const headerLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  letterSpacing: '0.14em',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  color: COLORS.textSecondary,
  padding: '0 2px',
  lineHeight: 1,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: COLORS.border,
  marginBottom: 14,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const keyColStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  letterSpacing: '0.08em',
  padding: '4px 16px 4px 0',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
  width: '40%',
};

const descColStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  color: COLORS.textSecondary,
  letterSpacing: '0.04em',
  padding: '4px 0',
  verticalAlign: 'top',
};
