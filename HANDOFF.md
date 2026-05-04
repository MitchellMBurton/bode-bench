# Handoff

## Repo State

Repo: `bode-bench`
Branch: `main`
Baseline tag: `v0.3.0`
Forked from: `bach-cello-console` at tag `v0.2-final`
Direction: v0.3 — comparative measurement bench

`v0.3.0` ships the comparative-bench foundation: range notes, markdown reports,
versioned session artifacts (`.review-session.json`), and full save/load with
relink + mismatch protection. Both Tracks 1 and 2 from `PLAN_NOTES_AND_SESSIONS.md`
are validated end-to-end.

Track 3 (worker-based analysis core) is underway: live frame feature analysis is worker-backed, and the remaining work moves heavier history/offline analysis behind the same boundary. See `REVIEW_BRIEF.md` for the v0.3.0 baseline context.

Latest hardening added an explicit retained-frame contract for the frame bus, diagnostics-backed listener failure isolation, strict conflicting-media-key mismatch behavior for review sessions, and always-available `VOL` / `RATE` tuning in the Live Diagnostic command surface. See `RUNTIME_CONTRACTS.md`.

## What Already Exists (v0.2 state)

### Product shape

- session-based local audio and video review
- left Session Console used as a preview/workbench
- right Live Diagnostic quadrant used as the primary analytical surface
- alternate audio and subtitle attachment for playback
- desktop-first clip export flow
- optional tuned clip export using current `VOL`, `RATE`, and `PITCH`
- diagnostics drawer for support and reproducibility

### Stable seams

- `app/src/audio/engine.ts` — transport / runtime truth (will be split for two-source work in Track 4)
- `app/src/audio/analysisWorkerProtocol.ts` — Track 3 v1 worker message contract, transferable buffers, boundary validation
- `app/src/audio/analysisWorkerClient.ts` — active worker lifecycle client with request IDs, back-pressure drops, diagnostics, and termination
- `app/src/audio/analysisRuntime.ts` — main-thread-compatible analysis adapter used as the fallback/parity seam
- `app/src/core/session.tsx` — shared session wiring (extended for restore methods in v0.3.0)
- `app/src/audio/frameBus.ts` — frame dispatch (live feature producer is worker-backed; consumers stay stable)
- `RUNTIME_CONTRACTS.md` — retained frame ownership, worker boundary, session matching, export, and command availability contracts
- `app/src/runtime/waveformPyramid.ts` — shared waveform confidence and refinement
- `app/src/runtime/reviewSession.ts` — versioned session schema, parse, build, source-match
- `app/src/runtime/reviewReport.ts` — markdown report generator
- `app/src/runtime/derivedMedia.ts` — derived state store with `restore()` method
- `app/src/layout/ConsoleLayout.tsx` — shell/chrome structure (left pane reshapes in Track 4)
- `app/src/layout/splitPanePersistence.ts` — externalised pane-fraction persistence
- `app/src/layout/consoleLayoutWorkspace.ts` — workspace snapshot/restore + canonical pane keys
- `app/src/panels/WaveformOverviewPanel.tsx` — overview timeline system
- `app/src/controls/RangeNoteEditor.tsx` — shared inline note editor
- `app/src/controls/SessionDeck.tsx` — SAVE / LOAD / REPORT row in the TOP CONTROL DECK
- `desktop/src-tauri/src/lib.rs` — desktop export and file-system seams

### CI

- Frontend lint, typecheck, test, build (ubuntu-latest, Node 22)
- Desktop Rust `cargo test --locked` (ubuntu-latest, Tauri system deps)

## Best Next Work Order

Tracks 1 and 2 are shipped (`v0.3.0`). The remaining order:

1. **Track 3 — Worker-based analysis core (minimal closure).** The live frame feature producer runs through the worker with transferable buffer pooling, one-frame back-pressure, a main-thread fallback, and PERF LAB diagnostics. Treat this track as closed unless Range Lab or A-B work surfaces felt jank.
2. **Track 6 — Range Lab.** Spectrogram-driven range creation, multi-range bulk operations, keep-and-cut compilation export, range similarity search, spectral bookmark navigation. Rides existing substrate; no engine split required.
3. **Track 4 — A-B comparison workspace.** The defining v0.4 feature. Builds on Tracks 2 and 3, informed by Track 6 lived experience.
4. **Track 5 — Differential null test.** Builds directly on Track 4's alignment machinery.

A fresh review of v0.3.0 can usefully precede Track 6. See `REVIEW_BRIEF.md`.

See `TASKS.md` for per-track checklists and `ROADMAP.md` for phase boundaries.

## Non-Negotiables (carried from v0.2)

- keep the desktop shell thin but real
- keep transport truth single-sourced (extends to "single-sourced per source slot" for A-B)
- keep streamed media representations honest
- keep the Session Console as a workbench, not a second dashboard
- keep the Live Diagnostic quadrant as the authoritative analytical command surface
- do not reintroduce control duplication casually

## New Non-Negotiables For v0.3

- the audible-monitor switch (A / B / null) must be unmistakable at all times
- session schema changes must be migration-aware from schema v1
- worker boundaries may use transferable buffers internally, but published frames must be retained snapshots for async subscribers
- frame-bus subscriber failures must not stop the instrument
- conflicting saved/current media keys must be treated as source mismatches
- alignment confidence must be visible before any null result is presented as meaningful
- high-frequency tuning controls (`VOL`, `RATE`) must remain available during normal desktop resizing

## Known Rough Edges

Carried from v0.2 — real but should not distort direction:

- fullscreen short-streamed-media overview detail behavior still needs final hardening
- frontend chunk size larger than ideal (visualizer in place; act during Track 3)
- installer hooks still close the legacy `bach-cello-console.exe` process for upgrade compatibility

## Excellence Standard

Future work should optimize for:

- clarity before cleverness
- dense but readable command surfaces
- stable control placement
- calm, screenshot-safe composition
- honest data representation
- desktop workflows that feel professional rather than experimental
- two-source analysis that feels like one instrument, not a split-screen

## What Not to Do

- do not turn the product into a generic media-player skin
- do not hide useful controls behind oversimplified UX
- do not fake full-resolution certainty for streamed media
- do not move desktop-specific file and export logic into React
- do not present a null result without alignment confidence
- do not let the A-B feature confuse which source is currently audible
- do not keep stale docs that describe an older product
