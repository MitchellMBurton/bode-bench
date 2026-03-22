import type { VisualMode } from '../audio/displayMode';
import { FONTS } from '../theme';
import { getRangeChipPalette, type ReviewGlyphName } from './reviewChromeShared';

export function RangeChip({
  label,
  visualMode,
  selected = false,
}: {
  readonly label: string;
  readonly visualMode: VisualMode;
  readonly selected?: boolean;
}): React.ReactElement {
  const palette = getRangeChipPalette(visualMode, selected);
  return (
    <span
      style={{
        ...rangeChipStyle,
        background: palette.background,
        borderColor: palette.border,
        color: palette.text,
      }}
    >
      {label}
    </span>
  );
}

export function ReviewGlyph({
  name,
  color,
  size = 12,
}: {
  readonly name: ReviewGlyphName;
  readonly color: string;
  readonly size?: number;
}): React.ReactElement {
  const stroke = {
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  const fill = { fill: color };

  let content: React.ReactNode;
  switch (name) {
    case 'play':
      content = <polygon points="5,3.5 12.5,8 5,12.5" {...fill} />;
      break;
    case 'pause':
      content = (
        <>
          <rect x="4" y="3.5" width="3" height="9" rx="0.8" {...fill} />
          <rect x="9" y="3.5" width="3" height="9" rx="0.8" {...fill} />
        </>
      );
      break;
    case 'stop':
      content = <rect x="4" y="4" width="8" height="8" rx="1" {...fill} />;
      break;
    case 'loop':
      content = (
        <>
          <path d="M4 5.5h6.5l-1.7-1.8" {...stroke} />
          <path d="M12 10.5H5.5l1.7 1.8" {...stroke} />
          <path d="M11 5.5A2.5 2.5 0 0 1 12.5 8" {...stroke} />
          <path d="M5 10.5A2.5 2.5 0 0 1 3.5 8" {...stroke} />
        </>
      );
      break;
    case 'seek-back':
      content = (
        <>
          <polygon points="7.5,4 3.5,8 7.5,12" {...fill} />
          <polygon points="12.5,4 8.5,8 12.5,12" {...fill} />
        </>
      );
      break;
    case 'seek-forward':
      content = (
        <>
          <polygon points="3.5,4 7.5,8 3.5,12" {...fill} />
          <polygon points="8.5,4 12.5,8 8.5,12" {...fill} />
        </>
      );
      break;
    case 'set-in':
      content = (
        <>
          <path d="M4 3v10" {...stroke} />
          <polygon points="6.2,4.2 11.6,8 6.2,11.8" {...fill} />
        </>
      );
      break;
    case 'set-out':
      content = (
        <>
          <path d="M12 3v10" {...stroke} />
          <polygon points="9.8,4.2 4.4,8 9.8,11.8" {...fill} />
        </>
      );
      break;
    case 'from-loop':
      content = (
        <>
          <path d="M3.8 5.2h6.4l-1.5-1.6" {...stroke} />
          <path d="M12.2 10.8H5.8l1.5 1.6" {...stroke} />
          <path d="M10.9 5.2A2.3 2.3 0 0 1 12.2 8" {...stroke} />
          <path d="M5.1 10.8A2.3 2.3 0 0 1 3.8 8" {...stroke} />
          <path d="M8 4.6v6.2" {...stroke} />
          <path d="M6.3 9.2 8 10.9l1.7-1.7" {...stroke} />
        </>
      );
      break;
    case 'clear-in':
      content = (
        <>
          <path d="M4 3v10" {...stroke} />
          <polygon points="6,4.2 10.4,8 6,11.8" {...fill} />
          <path d="M10.8 5.2 13 7.4" {...stroke} />
          <path d="M13 5.2 10.8 7.4" {...stroke} />
        </>
      );
      break;
    case 'clear-ranges':
      content = (
        <>
          <rect x="3.5" y="4" width="5.8" height="7.2" rx="1" {...stroke} />
          <rect x="6.7" y="5.3" width="5.8" height="7.2" rx="1" {...stroke} />
          <path d="M9.9 5.2 13 8.3" {...stroke} />
          <path d="M13 5.2 9.9 8.3" {...stroke} />
        </>
      );
      break;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {content}
    </svg>
  );
}

const rangeChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 18,
  padding: '0 7px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 999,
  boxSizing: 'border-box',
  fontFamily: FONTS.mono,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  lineHeight: 1,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};
