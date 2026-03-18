// ============================================================
// HotkeyOverlay — full-screen keyboard shortcut reference card.
// Toggle with the ? key; closes on Escape or backdrop click.
// ============================================================

import { useEffect } from 'react';
import type { VisualMode } from '../audio/displayMode';
import { CANVAS, COLORS, FONTS } from '../theme';

interface Props {
  open: boolean;
  onClose: () => void;
  visualMode?: VisualMode;
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
  const nge = visualMode === 'nge';
  const hyper = visualMode === 'hyper';
  const eva = visualMode === 'eva';

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

  const cardBorder = nge
    ? CANVAS.nge.chromeBorderActive
    : hyper
      ? CANVAS.hyper.chromeBorderActive
      : eva
        ? CANVAS.eva.chromeBorderActive
        : COLORS.borderHighlight;
  const headerColor = nge
    ? CANVAS.nge.category
    : hyper
      ? CANVAS.hyper.category
      : eva
        ? CANVAS.eva.category
        : COLORS.textCategory;
  const keyColor = nge
    ? CANVAS.nge.trace
    : hyper
      ? CANVAS.hyper.trace
      : eva
        ? CANVAS.eva.trace
        : COLORS.textPrimary;

  return (
    <div
      style={backdropStyle}
      data-shell-overlay="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ ...cardStyle, borderColor: cardBorder }}>
        {/* Header */}
        <div style={headerRowStyle}>
          <span style={{ ...headerLabelStyle, color: headerColor }}>KEYBOARD SHORTCUTS</span>
          <button style={closeBtnStyle} onClick={onClose} aria-label="Close">✕</button>
        </div>
        {/* Divider */}
        <div style={dividerStyle} />
        {/* Shortcut table */}
        <table style={tableStyle}>
          <tbody>
            {HOTKEY_TABLE.map(({ key, description }) => (
              <tr key={key}>
                <td style={{ ...keyColStyle, color: keyColor }}>{key}</td>
                <td style={descColStyle}>{description}</td>
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
