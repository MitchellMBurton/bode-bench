// ============================================================
// RangeNoteEditor - inline one-line note attached to a saved
// range. Empty state shows a compact add-note affordance; editing
// state shows a tinted input. Enter commits, Esc cancels.
//
// Theming is intentionally primitive (raw colour strings) so
// the same editor reads correctly inside both the
// OverviewTransportStrip chrome and any future panel mount.
// ============================================================

import { useRef, useState } from 'react';

import { FONTS, SPACING } from '../theme';
import { RANGE_NOTE_MAX_LENGTH } from '../types';

export interface RangeNoteEditorProps {
  readonly rangeId: number;
  readonly noteValue: string | undefined;
  readonly selected: boolean;
  readonly textColor: string;
  readonly dimColor: string;
  readonly accentBg: string;
  readonly onCommit: (rangeId: number, note: string) => void;
}

export function RangeNoteEditor({
  rangeId,
  noteValue,
  selected,
  textColor,
  dimColor,
  accentBg,
  onCommit,
}: RangeNoteEditorProps): React.ReactElement {
  const [draft, setDraft] = useState<string>(noteValue ?? '');
  const [editing, setEditing] = useState(false);
  const [lastSyncedNote, setLastSyncedNote] = useState<string | undefined>(noteValue);
  const cancellingRef = useRef(false);

  // Sync local draft with external value (e.g. session restore) when the user
  // is not actively editing. Render-time state-based pattern per React docs.
  if (!editing && noteValue !== lastSyncedNote) {
    setLastSyncedNote(noteValue);
    setDraft(noteValue ?? '');
  }

  const commit = (): void => {
    setEditing(false);
    if (cancellingRef.current) {
      cancellingRef.current = false;
      return;
    }
    if (draft !== (noteValue ?? '')) {
      onCommit(rangeId, draft);
    }
  };

  const hasContent = draft.length > 0 || (noteValue ?? '').length > 0;
  const placeholder = editing ? 'note' : 'add note';
  const valueColor = hasContent ? (selected ? textColor : dimColor) : dimColor;

  return (
    <div
      style={{
        ...rowStyle,
        background: editing ? accentBg : 'transparent',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          ...glyphStyle,
          color: valueColor,
          opacity: hasContent ? 0.85 : 0.55,
        }}
      >
        {hasContent ? '-' : '+'}
      </span>
      <input
        type="text"
        className="range-note-input"
        value={draft}
        placeholder={placeholder}
        maxLength={RANGE_NOTE_MAX_LENGTH}
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancellingRef.current = true;
            setDraft(noteValue ?? '');
            event.currentTarget.blur();
          }
        }}
        data-shell-interactive="true"
        style={{
          ...inputStyle,
          color: valueColor,
        }}
      />
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  marginTop: 2,
  paddingLeft: SPACING.xs,
  paddingRight: SPACING.xs,
  borderRadius: 2,
};

const glyphStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 10,
  lineHeight: 1,
  letterSpacing: 0,
  flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.04em',
  lineHeight: 1.4,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: '2px 0',
  width: '100%',
  minWidth: 0,
};
