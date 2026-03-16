// Panel contextual help button and popover.
// Appears as a dim '?' in the panel header chrome; click to show a brief
// description of what the panel shows and how to read it.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VisualMode } from '../audio/displayMode';
import { COLORS, FONTS, CANVAS } from '../theme';

interface Props {
  text: string;
  visualMode?: VisualMode;
}

export function PanelHelp({ text, visualMode }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const nge = visualMode === 'nge';
  const hyper = visualMode === 'hyper';

  const btnColor = nge
    ? 'rgba(140,210,40,0.32)'
    : hyper
      ? 'rgba(98,232,255,0.32)'
      : 'rgba(160,140,80,0.30)';
  const btnHoverColor = nge
    ? 'rgba(140,210,40,0.70)'
    : hyper
      ? 'rgba(98,232,255,0.70)'
      : 'rgba(200,175,100,0.70)';
  const popoverBorder = nge
    ? CANVAS.nge.chromeBorderActive
    : hyper
      ? CANVAS.hyper.chromeBorderActive
      : COLORS.border;

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
        <div style={{ ...popoverStyle, borderColor: popoverBorder }}>
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
