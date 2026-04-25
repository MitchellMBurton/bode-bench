# Plan: Notes on Ranges + Reproducible Sessions (Tracks 1 + 2)

## Status

Scoped from `TASKS.md` Tracks 1 and 2. Combines them per the rationale in our planning conversation: notes need sessions to survive across days, sessions need notes to make reports meaningful, and the schema cost is paid once whether we add the `note` field in v1 or migrate to it later.

This plan supersedes the Codex draft. Compared to that draft:

- Session controls live in the **Session Console TOP CONTROL DECK**, not a new global File Bar
- No disabled placeholder buttons
- Notes on ranges are included from the start (Codex left this gap)
- Subtitle and alt-audio attachments are recorded as filename references (prevents silent loss)

## Six Landing Points

Each lands a coherent unit of work. The app is deployable after every step.

### 1. Range notes + inline editor (~2 days)

- Add `note?: string` to `RangeMark` in [app/src/types/index.ts](app/src/types/index.ts)
- One-line cap, ~120 chars, soft-truncated in display
- Inline edit on the saved-ranges row in [ReviewRangesPanel.tsx](app/src/panels/ReviewRangesPanel.tsx) — click → text input, Enter commits, Esc cancels
- `DerivedMediaStore.updateRangeNote(id, note)` method
- Persist within the existing snapshot model
- Tests: schema backwards-compatibility (old ranges have undefined note), store update behavior, inline editor commit/cancel

### 2. Markdown report generator, notes-only (~3 days)

- New module: [app/src/runtime/reviewReport.ts](app/src/runtime/reviewReport.ts)
- `buildReviewReportMarkdown(input)` — pure function, takes session-shaped input, returns markdown string
- Output structure:
  - Header: source filename, duration, sample rate, channels, save timestamp
  - Summary loudness: integrated LUFS, true peak, dynamic range (already available from analysis)
  - Ranges table: id, label, start, end, duration, note
  - Markers list: id, time, label
- `GENERATE REPORT` button added to Session Console TOP CONTROL DECK
- Browser path: trigger download of `<filename>-review-<timestamp>.md`
- Desktop path: `tauri::dialog::save` → write file → reveal-in-folder option (mirrors export pattern)
- "Scrub identifying paths" toggle (default: keep paths; toggle replaces with `<source>` placeholder)
- Tests: report generation against fixture sessions, scrubbing behavior, markdown shape stability

### 3. Session schema v1 + restore methods (~5 days)

- New module: [app/src/runtime/reviewSession.ts](app/src/runtime/reviewSession.ts)

```ts
export interface ReviewSessionV1 {
  readonly schemaVersion: 1
  readonly savedAtIso: string                  // ISO 8601 UTC
  readonly app: {
    readonly version: string                    // from package.json
    readonly buildId?: string
  }
  readonly source: {
    readonly filename: string
    readonly kind: 'audio' | 'video'
    readonly durationS: number
    readonly sizeBytes?: number
    readonly lastModifiedMs?: number
    readonly mediaKey?: string                  // existing buildTransportMediaKey output
    readonly desktopPath?: string                // honest "may not be present"
  }
  readonly attachments: {
    readonly altAudio?: { filename: string; sizeBytes?: number }
    readonly subtitles?: { filename: string; sizeBytes?: number }
  }
  readonly review: {
    readonly markers: readonly Marker[]
    readonly pendingRangeStartS: number | null
    readonly rangeMarks: readonly RangeMark[]   // includes note field
    readonly selectedRangeId: number | null
  }
  readonly workspace: {
    readonly visualMode: VisualMode
    readonly grayscale: boolean
    readonly analysisConfig: AnalysisConfig
    readonly splitFractions: Record<string, readonly number[]>  // by persistKey
    readonly runtimeTrayHeight?: number
  }
}
```

- `parseReviewSession(raw: unknown): ReviewSessionV1` — runtime validation (lands CORE_HARDENING P4 with a real consumer)
- `buildReviewSession(stores): ReviewSessionV1` — collects current state from app stores
- `migrateSession(raw): ReviewSessionV1` — stub that throws on unknown versions; real migration logic is written when v2 exists
- `DerivedMediaStore.restore(snapshot, nextIds)` — replaces markers, ranges, selection; recomputes `nextMarkerId`/`nextRangeId`/`nextJobId` to `max(existing)+1`
- `SplitPane` snapshot/restore helpers keyed by `persistKey`
- `AnalysisConfigStore.restore` and `DisplayModeStore.setMode` already exist; reuse
- Tests: round-trip (build → parse → equal), unknown version rejected, malformed shapes rejected with specific errors, store restore recomputes ids correctly, layout fraction restore for known persistKeys

### 4. Save / Load wiring + relink behavior (~3 days)

- `SAVE SESSION` and `LOAD SESSION` buttons added to Session Console TOP CONTROL DECK alongside `GENERATE REPORT`
- Browser save: serialize via `JSON.stringify`, trigger download as `<filename>-session-<timestamp>.sli.json`
- Browser load: hidden file input, accepts `.sli.json` and `.json`
- Desktop save: `tauri::dialog::save`, write file, optional reveal
- Desktop load: `tauri::dialog::open`, read file, parse
- Relink behavior:
  - On load, check current media against session's `source.mediaKey` or `(filename + duration ± 50ms)` fuzzy match
  - **Match** → apply review and workspace state immediately
  - **No media open** → store as pending session, surface status banner: "Session loaded. Open the source media to apply ranges."
  - **Mismatch** → store as pending, show mismatch warning. Do not apply ranges to wrong media. Do not enable export from mismatched session.
- Hotkey: Ctrl+S saves session (browser-friendly; intercepts default save-page behavior)
- Tests: matching media applies, missing media holds pending, mismatched media warns and refuses to apply, hotkey wiring

### 5. Embedded panel screenshots in report (~2 days, optional polish)

- Per-range checkbox in the report-generation step: "include panel screenshots"
- Reuses [panelSnapshot.ts](app/src/panels/panelSnapshot.ts)
- For each opted-in range: capture overview / spectrogram / loudness at the range start time, embed as base64 PNG in markdown
- Defer if scope pressure rises; the report is still valuable without screenshots

### 6. Attachment metadata follow-through (~2 days)

- When session is loaded, if `attachments.altAudio` is recorded but no alt audio is currently attached, show "Alt audio needs re-attaching: `<filename>`" status
- Same for subtitles
- File-picker shortcut: clicking the status opens the alt-audio / subtitles file dialog filtered to the recorded filename
- Doesn't bundle file contents — only references them and helps the user reconnect

## Total: ~17 working days

Three natural ship points: after step 2 (notes + reports working), after step 4 (sessions live), after step 6 (full Track 1 + 2 complete). Steps 5 and 6 are skippable polish.

## Schema Versioning Discipline

- Version field present from v1 (`schemaVersion: 1`)
- `migrateSession` exists as a stub that throws on unknown versions
- No migration code is written until v2 exists. Don't speculate the migration path.
- When v2 lands (likely Track 4 needing two-source field), `migrateSession` gains a real `1 → 2` arm

## Files Touched

| File | Step | Change |
|---|---|---|
| [app/src/types/index.ts](app/src/types/index.ts) | 1 | `note?: string` on `RangeMark` |
| [app/src/runtime/derivedMedia.ts](app/src/runtime/derivedMedia.ts) | 1, 3 | `updateRangeNote`, `restore` |
| [app/src/panels/ReviewRangesPanel.tsx](app/src/panels/ReviewRangesPanel.tsx) | 1 | inline note editor |
| [app/src/runtime/reviewReport.ts](app/src/runtime/reviewReport.ts) | 2 | new — markdown generator |
| [app/src/runtime/reviewSession.ts](app/src/runtime/reviewSession.ts) | 3 | new — schema, parse, build, migrate |
| [app/src/controls/SessionControls.tsx](app/src/controls/SessionControls.tsx) | 2, 4 | report / save / load buttons |
| [app/src/layout/SplitPane.tsx](app/src/layout/SplitPane.tsx) | 3 | snapshot/restore helpers |
| [app/src/core/session.tsx](app/src/core/session.tsx) | 3, 4 | wire restore methods |
| [app/src/App.tsx](app/src/App.tsx) | 4 | pending session state, relink banner |
| [desktop/src-tauri/src/lib.rs](desktop/src-tauri/src/lib.rs) | 2, 4 | tauri commands for save/load/report dialogs |
| [app/src/runtime/reviewReport.test.ts](app/src/runtime/reviewReport.test.ts) | 2 | new — report tests |
| [app/src/runtime/reviewSession.test.ts](app/src/runtime/reviewSession.test.ts) | 3 | new — session tests |

## Test Strategy

- **Unit tests** for pure functions: schema parse/normalize, report generation, scrubbing, migration stub
- **Store tests** for DerivedMediaStore.restore (id recomputation, snapshot replacement)
- **Integration tests** for relink behavior using fixture sessions
- **Manual screenshot pass** after step 1 (notes), step 2 (report), step 4 (save/load) across DEFAULT, OPTIC, NGE modes
- **Regression**: `npm run lint`, `npm run test`, `npm run build`, `cargo test --locked` before each commit

## Out Of Scope For This Work

These belong to later tracks or future ideas:

- Workspace presets / named templates (post-Track 4 idea, but template-shaped data is supported by `media: null` in the schema if we want it later)
- A-B / two-source sessions — Track 4. Schema migration to v2 will add the second-source field at that point
- Panel snapshot bundling inside the session file — too heavy for v1
- Native desktop save/open dialogs are honest first-class citizens; browser download/upload is the v1 implementation path for both, with the desktop-dialog code added when it lands cleanly
- Auto-save on close — manual save only in v1, with an "unsaved changes" indicator

## Decisions Deferred Until Implementation

- Exact placement of buttons in the TOP CONTROL DECK row (one row vs. two; `OPEN MEDIA / SAVE / LOAD / REPORT` vs. nested grouping) — decide while looking at the actual UI in step 2
- File extension: `.sli.json` (transparent JSON) vs. `.sli` (opaque) — go with `.sli.json` for v1 because it's inspectable in any text editor, which matches the "trustworthy and inspectable" doctrine
- Per-range tuning snapshot in the schema — not in v1; revisit when per-range tuning becomes a feature in its own right

## Open Questions That Should Be Answered Before Step 1

1. **Note editing model:** click-to-edit inline vs. always-visible text input on each range row? Inline is denser, always-visible is lower friction. My pick: inline (matches the clinical density doctrine).
2. **Note display when collapsed:** show first ~40 chars truncated, or hide entirely? My pick: show truncated as dim secondary text under the range label.
3. **Markers also get notes?** Markers are point-in-time; ranges are spans. Notes feel more natural on ranges. My pick: ranges only in v1; revisit if there's user demand.
4. **Browser-side `.sli.json` size limits?** Sessions are small (KB, not MB) since they don't bundle media or analysis. Not a concern for v1.
