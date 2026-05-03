# Agent Brief

Single briefing document for external agents helping ideate on the product.

This file used to repeat content from the canonical docs. To stop drift, sections that duplicate canonical material now point at the source of truth. The unique content for an external ideation audience stays here.

## Purpose

You are helping shape a desktop-first scientific media instrument.

The goal is not to produce generic media-player ideas. The goal is to help refine a serious local analysis tool so it feels:

- trustworthy
- dense but readable
- clinical rather than decorative
- fast for real review work
- coherent across playback, diagnostics, and export

## Canonical Doc Pointers

Read these first; do not infer their content from memory.

| Topic | Source of truth |
|---|---|
| Product identity, scope, quality bar | `PROJECT.md` |
| Architectural domains, timeline model, desktop seam | `ARCHITECTURE.md` |
| Runtime ownership, dispatch, session matching, export contracts | `RUNTIME_CONTRACTS.md` |
| Interface doctrine, command strata, anti-patterns | `UX_PRINCIPLES.md` |
| Power-user workspace direction | `POWER_USER_UX.md` |
| Decision hierarchy and trade-offs | `DECISION_RULES.md` |
| Active work order and milestone status | `TASKS.md` |
| Continuation notes and current rough edges | `HANDOFF.md` |
| Daily startup, build, share procedure | `STARTUP_RUNBOOK.md` |

## What Good Ideas Should Optimize For

Please propose ideas that improve one or more of these:

- default layout strength
- control hierarchy
- density without clutter
- export trust
- fullscreen analytical states
- review speed
- screenshot quality
- clarity for power users

## What Not To Suggest

Please avoid proposals that would:

- turn the product into a consumer player
- flatten the UI into a generic dark dashboard
- hide important controls behind simplified wizard flows
- move desktop file/export logic into React
- remove analytical density just to look minimal
- overfocus on collaboration, cloud, or library features

## Current Quality Bar

A good proposal should make the software feel:

- more exact
- more stable
- more intentional
- more demo-ready
- more useful under real review pressure

The right emotional target is:

"This feels like a serious instrument."

## Best Current Ideation Targets

If you need direction, focus on these:

1. How should the Session Console evolve into a stronger left-side workbench?
2. How can Live Diagnostic chrome become denser without becoming crowded?
3. How should export completion, output history, and source linking feel?
4. What is the best fullscreen analytical state for short and large media?
5. What layout, typography, and spacing rules would make the whole app feel more clinical and more premium?

## Files That Currently Matter Most

If you want to reason from the codebase, these are the most important files. See `ARCHITECTURE.md` for the broader stable-building-blocks table.

- `app/src/App.tsx`
- `app/src/layout/ConsoleLayout.tsx`
- `app/src/controls/TransportControls.tsx`
- `app/src/controls/OverviewTransportStrip.tsx`
- `app/src/controls/ClipExportStrip.tsx`
- `app/src/panels/WaveformOverviewPanel.tsx`
- `desktop/src-tauri/src/lib.rs`

## Suggested Prompt To Pair With This Brief

Use this brief to help me ideate on the next level of product refinement for a desktop-first scientific media instrument. Prioritize strong control hierarchy, clinical density, trustworthy export/review workflows, and screenshot-safe design. Do not spend most of your attention on one small implementation bug. I want high-signal product, UX, and architecture ideas that push the software toward excellence.
