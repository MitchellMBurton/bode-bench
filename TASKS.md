# Tasks

## Status: v0.3 Hardening, Toward v0.4 Comparative Bench

The repo opened at `v0.2-final` (the trustworthy review-and-export console). Tracks 1 and 2 shipped the reproducible review foundation; Track 3 now hardens the worker/runtime substrate before the v0.4 A-B workspace and null-test work.

This file holds the live work order. Phase-level structure lives in `ROADMAP.md`; raw idea pool lives in `FUTURE_PLANS_AND_IDEAS.md`.

## Active Tracks

### Track 1 — Notes on Ranges + Session Report (v0.3.0) — ✅ SHIPPED

Validated end-to-end with two saved ranges and a downloaded markdown report.

- [x] Add optional `note` field to range schema (backwards-compatible)
- [x] Inline note editor on range row in the saved-ranges list (one-line cap)
- [x] "Generate Report" action in the Session Console
- [x] Markdown report: source metadata, ranges with timestamps and notes, summary loudness
- [ ] Optional per-range panel screenshot embed (opt-in checkbox) — deferred polish
- [x] Desktop write-to-disk path; browser download path (browser shipped; desktop dialog deferred)
- [ ] "Scrub identifying paths" toggle for shared reports — deferred polish
- [x] Tests for range schema migration and report generation

### Track 2 — Reproducible Session Artifact (v0.3.0) — ✅ SHIPPED

Validated end-to-end with a save / refresh / load round trip; "Session restored." status confirmed.

- [x] Define schema v1: source identity, ranges + notes, markers, layout split ratios, style mode, analysis config
- [x] Implement save (browser download)
- [x] Implement load with relink prompt for moved sources
- [x] Pending-session relink: applies automatically when matching media arrives
- [x] Mismatch protection: refuses to apply ranges to wrong media
- [x] Schema migration seam (no `migrateSession` body yet — written when v2 exists)
- [ ] Template support (session with `media: null`) — deferred until a real workflow asks for it
- [x] Runtime validation at load boundary (CORE_HARDENING P3 + P4 land here)
- [ ] Cross-platform path tolerance — works in browser (no absolute paths), desktop dialog deferred
- [x] Tests for round-trip integrity and source-match behavior

### Track 3 — Worker-based Analysis Core (v0.3.2) — NEXT

Boring infrastructure with payoff in many directions. Best done before A-B so two-source pipelines ride a solid base.
The live frame feature producer now runs through the worker by default with a main-thread fallback. The live dispatch contract is retained-frame safe. Remaining slices move heavier history/offline analysis work behind the same boundary.

- [x] Define the v1 worker message protocol, transferables helper, and main-thread-compatible analysis adapter
- [x] Add worker lifecycle client with response validation, one-frame back-pressure, and diagnostic counters
- [x] Stand up dedicated Web Worker for live frame feature analysis
- [x] Route live frame feature computation through worker postMessage; consumers unchanged
- [x] Transferable buffer pool to reduce worker-path churn before retained publish
- [x] Back-pressure policy (drop with diagnostic counter)
- [x] PERF LAB toggle: core main / worker for diagnostic comparison
- [x] Retained frame snapshot contract for async panel subscribers
- [x] Per-subscriber frame-bus failure isolation with diagnostics
- [ ] Move waveform pyramid, spectrogram history/bins, and deeper loudness integration to worker
- [ ] OffscreenCanvas for spectrogram (follow-up, optional in this track)

### Track 4 — Reference / A-B Comparison Workspace (v0.4.0)

The defining feature of the comparative bench. Depends on Tracks 2 and 3.

- [ ] Second source slot in Session Console
- [ ] Dual decode + playback graph (sample-rate harmonisation, duration handling)
- [ ] Locked transport across A and B
- [ ] Manual time-offset control on B's timeline
- [ ] Auto-alignment via cross-correlation peak (worker job)
- [ ] Audible-monitor switch in chrome: A / B / off (null mode arrives in Track 5)
- [ ] Panel dual-rendering opt-in: waveform overview, spectrogram, loudness, freq response
- [ ] Persistent visual indicator of current audible source
- [ ] Hotkey for monitor swap
- [ ] A-B sessions extend the `.review-session.json` schema (Track 2 already accommodates two-source field)

### Track 5 — Differential Analysis / Null Test (v0.4.1)

Builds directly on Track 4's alignment machinery.

- [ ] Audible monitor gains A−B (null) and B−A (polarity) options
- [ ] Auto-gain-match as part of null setup
- [ ] Alignment confidence chip in chrome (sample offset, gain, coherence)
- [ ] Extended dynamic range mode for residual visualisation
- [ ] Residual clip export
- [ ] Documentation: when nulls are meaningful and when they're not

## Recently Completed (v0.3.0)

Reference: tag `v0.3.0`. Lands the comparative-bench foundation: session
artifacts, range notes, markdown reports, save/load with relink + mismatch
protection. Detailed plan in `PLAN_NOTES_AND_SESSIONS.md`.

- [x] Tracks 1 + 2 fully shipped and validated end-to-end
- [x] Externalised pane-fraction persistence into `splitPanePersistence.ts`
- [x] Console layout workspace snapshot/restore (`consoleLayoutWorkspace.ts`)
- [x] `DerivedMediaStore.restore()` with id-counter recomputation
- [x] Shared `RangeNoteEditor` mounted in `OverviewTransportStrip`
- [x] `SessionDeck` in the TOP CONTROL DECK (not a global File Bar — see REVIEW_BRIEF)
- [x] Post-review hardening: removed dead `ReviewRangesPanel`, centralized session restore ownership, capped range notes at runtime/session boundaries, escaped report table cells, and tightened source-kind mismatch protection

## Recently Completed (v0.3.2 hardening)

- [x] Worker-published analysis frames are copied into retained snapshots before panel dispatch
- [x] `FrameBus.publish()` isolates subscriber failures and routes them to diagnostics
- [x] Review-session source matching treats conflicting media keys as a hard mismatch
- [x] Live Diagnostic tuning keeps `VOL` and `RATE` available during normal resizing
- [x] Runtime contracts documented in `RUNTIME_CONTRACTS.md`

## Recently Completed (v0.2)

Reference: tag `v0.2-final`. Major v0.2 work:

- [x] Session Console reworked toward preview/workbench model
- [x] Live Diagnostic command deck promoted into chrome
- [x] Alternate audio and subtitle attachment for playback
- [x] Desktop clip export with FAST COPY / FAST REVIEW / EXACT MASTER modes
- [x] Tuned clip export (VOL / RATE / PITCH bake-in)
- [x] Diagnostics drawer and copy/save flows
- [x] Coarse session map + detail window timeline model
- [x] Visual style modes (DEFAULT / MONO / OPTIC / RED / NGE / HYPER / EVA)
- [x] Rust desktop CI job
- [x] Bundle visualizer (`dist/stats.html`)
- [x] Test infra deps (`@testing-library/*`, `jsdom`)
- [x] Doctrine doc deduplication
- [x] Removed focus-based RAF render throttle (split-screen workflows now full-cadence)

## Carried Over From v0.2

These remain real but should not distort the v0.3 direction:

- [ ] Fullscreen short-streamed-media overview detail behavior — still open; defer to a focused fix or document as a v0.2.x limitation
- [ ] Frontend chunk size reduction (visualizer in place; act on findings during Track 3)
- [ ] Final density pass for left-pane vertical rhythm (revisit after Track 4 reshapes the left pane)

## Done Criteria

A track is done when:

- The behavior is trustworthy in the real desktop workflow
- The browser path still behaves coherently where applicable
- The UI reads as one instrument, not a feature pile
- Diagnostics stay useful and honest
- Screenshots of normal use look intentional
- No unrelated regressions are introduced
- Tests cover the critical paths
