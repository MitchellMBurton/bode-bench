// Panel contextual help button and popover.
// Appears as a dim '?' in the panel header chrome; click to show a brief
// description of what the panel shows and how to read it.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VisualMode } from '../audio/displayMode';
import { FONTS, MODES } from '../theme';

interface Props {
  text: string;
  visualMode: VisualMode;
}

const BTN_COLORS: Record<VisualMode, { idle: string; hover: string }> = {
  default: { idle: 'rgba(160,140,80,0.30)',  hover: 'rgba(200,175,100,0.70)' },
  amber:   { idle: 'rgba(255,176,48,0.34)',  hover: 'rgba(255,198,102,0.78)' },
  nge:     { idle: 'rgba(140,210,40,0.32)',   hover: 'rgba(140,210,40,0.70)' },
  optic:   { idle: 'rgba(73,109,129,0.60)',   hover: 'rgba(22,71,98,0.92)' },
  red:     { idle: 'rgba(214,92,82,0.40)',    hover: 'rgba(255,160,148,0.82)' },
  hyper:   { idle: 'rgba(98,232,255,0.32)',   hover: 'rgba(98,232,255,0.70)' },
  eva:     { idle: 'rgba(255,123,0,0.32)',    hover: 'rgba(255,123,0,0.70)' },
};

export function PanelHelp({ text, visualMode }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const m = MODES[visualMode];
  const optic = visualMode === 'optic';
  const red = visualMode === 'red';
  const amber = visualMode === 'amber';

  const { idle: btnColor, hover: btnHoverColor } = BTN_COLORS[visualMode];

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    // Delay so the toggle click doesn't immediately close
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={containerStyle}>
      <button
        onClick={toggle}
        style={{ ...btnStyle, color: open ? btnHoverColor : btnColor }}
        title="What does this panel show?"
        aria-label="Panel help"
      >
        ?
      </button>
      {open && (
        <div
          style={{
            ...popoverStyle,
            borderColor: m.chromeBorderActive,
            background: optic ? 'rgba(247,250,252,0.98)' : popoverStyle.background,
            color: optic ? 'rgba(30,63,81,0.90)' : red ? 'rgba(255,208,200,0.88)' : amber ? 'rgba(255,220,136,0.92)' : popoverStyle.color,
            boxShadow: optic ? '0 8px 22px rgba(79, 134, 163, 0.16)' : red ? '0 8px 22px rgba(120, 16, 10, 0.28)' : amber ? '0 8px 24px rgba(255, 160, 26, 0.18)' : popoverStyle.boxShadow,
            ...(red ? { background: 'rgba(18,5,6,0.98)' } : amber ? { background: 'rgba(14,9,3,0.98)' } : {}),
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
};

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0 4px',
  cursor: 'pointer',
  fontFamily: FONTS.mono,
  fontSize: 10,
  lineHeight: 1,
  letterSpacing: '0.04em',
  transition: 'none',
  userSelect: 'none',
};

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  zIndex: 200,
  width: 280,
  padding: '10px 12px',
  background: 'rgba(6, 6, 14, 0.97)',
  border: '1px solid',
  borderRadius: 2,
  fontFamily: FONTS.mono,
  fontSize: 10,
  lineHeight: 1.65,
  color: 'rgba(190, 175, 120, 0.88)',
  letterSpacing: '0.025em',
  whiteSpace: 'pre-wrap',
  boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
  marginTop: 4,
};
