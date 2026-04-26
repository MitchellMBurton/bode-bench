# Review Brief — v0.3.0 Baseline

Post-review note: this brief remains useful as the v0.3.0 baseline prompt, but the current working tree has already resolved several questions it raises. `ReviewRangesPanel` was removed, session restore ownership was centralized in `App.tsx`, the pending-session restore no longer uses an eslint suppression, and the active test count is now higher than the baseline listed below.

This document is the entry point for a code-review pass on the v0.3.0 baseline.
It is written for a capable agent who will read code directly. It does not
re-explain doctrine; it tells you where to look and what specifically I want a
second opinion on.

If you are not here to review v0.3.0 specifically, read `AGENT_BRIEF.md`
instead — that document is for ideation, this one is for review.

## Repo orientation in 60 seconds

- Active repo: `bode-bench`. Branch: `main`. Baseline tag: `v0.3.0`.
- Forked from `bach-cello-console` at tag `v0.2-final`. The old repo is frozen
  reference; do not look there for current truth.
- Doctrine lives in `PROJECT.md`, `ARCHITECTURE.md`, `UX_PRINCIPLES.md`,
  `DECISION_RULES.md`. Treat these as load-bearing.
- Live work order: `TASKS.md`. Phase map: `ROADMAP.md`. Idea pool:
  `FUTURE_PLANS_AND_IDEAS.md`.
- The plan that v0.3.0 implements: `PLAN_NOTES_AND_SESSIONS.md`.

## What v0.3.0 actually shipped

Two tracks bundled into one phase, validated end-to-end with a real audio
file, two saved ranges with notes, a downloaded markdown report, and a
save/refresh/load round trip producing a "Session restored." status.

### New files (the substantive surface)

- `app/src/runtime/reviewSession.ts` — versioned `ReviewSessionV1` schema,
  `parseReviewSession` with runtime validation, `buildReviewSession`,
  `matchReviewSessionSource` (three-state: match / no-current-source /
  mismatch), browser save + read helpers.
- `app/src/runtime/reviewReport.ts` — pure markdown report generator with
  filename sanitization and browser download helper.
- `app/src/controls/RangeNoteEditor.tsx` — shared inline note editor with
  primitive-colour theming so it mounts cleanly under either chrome or panel
  themes.
- `app/src/controls/SessionDeck.tsx` — SAVE / LOAD / GENERATE REPORT row
  rendered inside the Session Console TOP CONTROL DECK.
- `app/src/layout/splitPanePersistence.ts` — externalised pane-fraction
  persistence Map and helpers (was private to SplitPane).
- `app/src/layout/consoleLayoutWorkspace.ts` — runtime tray height + canonical
  pane keys + workspace snapshot/restore.
- `app/src/runtime/reviewSession.test.ts`,
  `app/src/runtime/reviewReport.test.ts`, `app/src/layout/SplitPane.test.ts`
  — new test coverage for the shipped modules.

### Changed files worth opening

- `app/src/types/index.ts` — added `note?: string` to `RangeMark` plus
  `RANGE_NOTE_MAX_LENGTH = 120`.
- `app/src/runtime/derivedMedia.ts` — added `restore()` method and
  `updateRangeNote()`. `restore()` recomputes id counters from
  `max(existing) + 1`.
- `app/src/audio/analysisConfig.ts` — exported `normalizeAnalysisConfig`
  (single-line change to support session parse).
- `app/src/layout/SplitPane.tsx` — switched from internal Map to the
  externalised persistence module.
- `app/src/controls/OverviewTransportStrip.tsx` — saved-range rows are now
  two-line (chip + time + actions, then `RangeNoteEditor` below).
  `SAVED_RANGE_ROW_HEIGHT_PX` bumped 32 → 48.
- `app/src/controls/TransportControls.tsx` — accepts `sessionDeckSlot` and
  `sessionStatusSlot` props; renders them inside the deck. Otherwise
  unchanged. The 2873-line file did not grow further.
- `app/src/App.tsx` — pending-session state, source-identity wiring,
  apply-on-relink effect, status display.
- `app/src/index.css` — placeholder colour rule for the note input
  (browser default was invisible on dark themes).

## What I want from this review

In rough priority order. Drop anything that doesn't earn its space.

### 1. The `ReviewSessionV1` schema shape

Open `app/src/runtime/reviewSession.ts`.

I want a second opinion on:
- **Field organization.** Should `attachments` be a top-level field or live
  inside `source`? It's currently top-level and empty in v0.3.0 (deferred
  polish — Step 6 in the plan). The reasoning was that source identity is
  about *what we're listening to* and attachments are *what's wired to it*.
- **`runtimeTrayHeight` placement.** Currently in `workspace`. Defensible but
  feels weird — the runtime tray is a chrome geometry concern, not analytical
  state. Should `workspace` be split into `appearance` (visualMode, grayscale)
  and `geometry` (layout, runtimeTrayHeight) for v2?
- **Schema id `bode-bench.review-session`.** Project-name-as-namespace.
  Defensible. The alternative (a more abstract id like `slc.review-session.v1`)
  would survive a future repo rename.
- **The migration seam.** `migrateSession()` doesn't exist yet — it'll be
  written when v2 lands. The schema id + version field carry the migration
  hook. Acceptable, or premature defer?

### 2. The pending-session apply effect in `App.tsx`

Open `app/src/App.tsx`, search for "Apply a pending session". This effect runs
when `pendingSession` is set and matching media arrives. It calls four store
methods and four `setState`s. The `react-hooks/set-state-in-effect` rule fires
on the first non-functional setState (`setGrayscale`); the others are
acceptably-functional updates.

I added an eslint-disable with a reason. Is there a cleaner pattern for
"react to external state transition AND update local state"? React docs
recommend `useSyncExternalStore` for purely-external state, but the audio
engine's transport state is already exposed that way and the issue is
specifically the *combination* of external + local state changes.

### 3. The "no global File Bar" decision

Original Codex draft (described in PLAN history) added a global File Bar
chrome strip with `OPEN MEDIA / SAVE SESSION / LOAD SESSION / SESSION REPORT`
plus four disabled placeholder buttons (`NATIVE SAVE`, `SESSION NOTES`,
`BATCH EXPORT`, `A/B COMPARE`). I rejected both moves and put session controls
inside the existing TOP CONTROL DECK (`SessionDeck.tsx`).

Justification: `UX_PRINCIPLES.md` says "Global chrome should stay sparse and
operational" and `DECISION_RULES.md` says "Don't design for hypothetical
future requirements."

Was I right? Is there a real case where a global File Bar would be the better
choice — for example, once Track 4 (A-B) ships, will a single chrome surface
that handles BOTH source slots' file menus be cleaner than per-source-slot
buttons in the deck? If so, the right move might be to refactor the deck into
a global file menu *now*, before Track 4 makes the decision more expensive.

### 4. The dead `ReviewRangesPanel`

`app/src/panels/ReviewRangesPanel.tsx` is registered in `panels/registry.ts`
but explicitly filtered out by `App.tsx` (`id !== 'review'`). It still imports
the shared `RangeNoteEditor` and would render correctly if mounted.

I left it in place rather than deleting it because it might be re-enabled in
a future layout. Reasonable, or should it be deleted under the YAGNI rule?

### 5. The 2873-line `TransportControls.tsx`

This file was already large in v0.2. v0.3.0 added two new optional props
(`sessionDeckSlot`, `sessionStatusSlot`) and one render call. No other change.
The file did not grow further — but it did not shrink either.

I have flagged splitting this file as a future move (it's noted in
`HANDOFF.md` lineage). Track 3's worker boundary work might be the right
moment to do the split — it touches the engine boundary anyway. Is there an
argument for splitting *before* Track 3, or is a "split when next touched"
discipline genuinely good enough?

### 6. The "+ add note" affordance discoverability

The first commit of the inline editor was invisible: I shipped it to a
component (`ReviewRangesPanel`) that wasn't mounted. The user caught it via
manual screenshot. The fix: extract to shared component, mount in the actual
visible surface (`OverviewTransportStrip`).

Open question: how systematic should the discoverability check be? Possible
moves:
- A `panels/registry.ts` lint rule that warns when a registered panel is
  filtered out of the layout
- A "dead component" sweep in CI
- A doctrine note in `CLAUDE.md` saying "before adding UI to a component,
  grep the layout for that component's actual mount point"

I lean toward the last — lightweight, doctrine-aligned. But a stronger
reviewer might disagree.

## Things you do NOT need to review

- The v0.2 codebase as a whole. It's stable, frozen at `v0.2-final` for
  reference, and not changing.
- The doctrine docs. They are deliberately the slow-moving layer.
- `desktop/src-tauri/`. v0.3.0 did not touch the Rust side. Track 3 might.
- The CI workflow. Lint, typecheck, tests, build, and Rust `cargo test` are
  all green; the workflow itself is small and unchanged.

## How to verify the build is real

From the repo root:

```bash
cd app
npm install
npm run lint        # zero errors expected
npx tsc --noEmit    # zero errors expected
npm test            # 126 tests passing
npm run build       # builds, with one pre-existing chunk-size warning
```

Then run `npm run dev` and exercise:
1. Open any local audio file
2. Mark two ranges (SET IN / SET OUT in the LIVE DIAGNOSTIC chrome)
3. Add a note to each range (click the "+ add note" line under each)
4. SESSION row → GENERATE REPORT → markdown downloads
5. SESSION row → SAVE SESSION → `.review-session.json` downloads
6. Hard-refresh the page (loses everything)
7. Re-open the same media file
8. SESSION row → LOAD SESSION → pick the saved file
9. "Session restored." status appears; both ranges + notes return

If any of those steps fail, that's a real bug worth surfacing.

## Final ask

Treat this brief as a list of questions, not as the conclusion. Push back on
anything that reads as overconfident. The most useful feedback is the kind
that calls out a decision I made on autopilot rather than deliberately.
