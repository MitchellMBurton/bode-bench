# Handoff

## Repo State

Repo: `bode-bench`
Branch: `main`
Forked from: `bach-cello-console` at tag `v0.2-final`
Direction: v0.3 — comparative measurement bench

This repo opens at the trustworthy review-and-export console delivered by v0.2 and now turns toward two-source comparison, reproducible session state, and a worker-based analysis core. The v0.2 codebase carries over intact; the work below is additive.

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
- `app/src/core/session.tsx` — shared session wiring (extended in Track 2 for `.sli` support)
- `app/src/audio/frameBus.ts` — frame dispatch (producer changes in Track 3, consumers stable)
- `app/src/runtime/waveformPyramid.ts` — shared waveform confidence and refinement
- `app/src/layout/ConsoleLayout.tsx` — shell/chrome structure (left pane reshapes in Track 4)
- `app/src/panels/WaveformOverviewPanel.tsx` — overview timeline system
- `desktop/src-tauri/src/lib.rs` — desktop export and file-system seams

### CI

- Frontend lint, typecheck, test, build (ubuntu-latest, Node 22)
- Desktop Rust `cargo test --locked` (ubuntu-latest, Tauri system deps)

## Best Next Work Order

1. **Track 1 — Notes on ranges + session report.** Independent, two-week scope, immediate user value. Establishes the "ranges as artifact" pattern that everything downstream extends.
2. **Track 2 — Reproducible session artifact (`.sli`).** Lands the schema. Forces CORE_HARDENING P3 and P4 to land with a real consumer driving design.
3. **Track 3 — Worker-based analysis core.** Boring infrastructure. Best done before A-B so two-source pipelines ride a solid base. Closes the focus-throttle story structurally.
4. **Track 4 — A-B comparison workspace.** The defining v0.3 feature. Builds on Tracks 2 and 3.
5. **Track 5 — Differential null test.** Builds directly on Track 4's alignment machinery.

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
- worker boundaries must use transferable buffers, not copies
- alignment confidence must be visible before any null result is presented as meaningful

## Known Rough Edges

Carried from v0.2 — real but should not distort direction:

- fullscreen short-streamed-media overview detail behavior still needs final hardening
- frontend chunk size larger than ideal (visualizer in place; act during Track 3)
- legacy `bach-cello-console` naming may surface in some packaged artifacts

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
