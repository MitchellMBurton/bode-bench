# Tasks

## Status: v0.3 Direction Begins

The repo opens at `v0.2-final` (the trustworthy review-and-export console) and now turns toward v0.3 — the comparative measurement bench. The five tracks below are the move from single-source review to two-source analysis with reproducible state.

This file holds the live work order. Phase-level structure lives in `ROADMAP.md`; raw idea pool lives in `FUTURE_PLANS_AND_IDEAS.md`.

## Active Tracks

### Track 1 — Notes on Ranges + Session Report (v0.3.0)

Smallest, most user-visible improvement. Independent — no upstream dependencies. Two-week scope.

- [ ] Add optional `note` field to range schema (backwards-compatible)
- [ ] Inline note editor on range row in the saved-ranges list (one-line cap)
- [ ] "Generate Report" action in the Session Console
- [ ] Markdown report: source metadata, ranges with timestamps and notes, summary loudness
- [ ] Optional per-range panel screenshot embed (opt-in checkbox)
- [ ] Desktop write-to-disk path; browser download path
- [ ] "Scrub identifying paths" toggle for shared reports
- [ ] Tests for range schema migration and report generation

### Track 2 — Reproducible Session Artifact (v0.3.1)

Establishes the session-as-file concept. Foundation for everything downstream.

- [ ] Define schema v1: source identity, ranges + notes, markers, layout split ratios, style mode, analysis config, tuning
- [ ] Implement `.sli` save (file menu)
- [ ] Implement `.sli` load with relink prompt for moved sources
- [ ] Schema migration seam (`migrateSession(raw): SessionV2`)
- [ ] Template support (session with `media: null`)
- [ ] Runtime validation at load boundary (CORE_HARDENING P4 lands here)
- [ ] Cross-platform path tolerance (Windows session opens on Mac)
- [ ] Tests for round-trip integrity and migration

### Track 3 — Worker-based Analysis Core (v0.3.2)

Boring infrastructure with payoff in many directions. Best done before A-B so two-source pipelines ride a solid base.

- [ ] Stand up dedicated Web Worker for analysis loop
- [ ] Move FFT, pitch detection, loudness integration, waveform pyramid, spectrogram bins to worker
- [ ] Frame bus: switch producer to worker postMessage; consumers unchanged
- [ ] Transferable buffer pool to avoid per-frame copies
- [ ] Back-pressure policy (drop with diagnostic counter)
- [ ] PERF LAB toggle: core main / worker for diagnostic comparison
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
- [ ] A-B sessions extend the `.sli` schema (Track 2 already accommodates two-source field)

### Track 5 — Differential Analysis / Null Test (v0.4.1)

Builds directly on Track 4's alignment machinery.

- [ ] Audible monitor gains A−B (null) and B−A (polarity) options
- [ ] Auto-gain-match as part of null setup
- [ ] Alignment confidence chip in chrome (sample offset, gain, coherence)
- [ ] Extended dynamic range mode for residual visualisation
- [ ] Residual clip export
- [ ] Documentation: when nulls are meaningful and when they're not

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

- [ ] Fullscreen short-streamed-media overview detail behavior — timeboxed; if not resolved by end of Track 1, formally document as v0.2.x limitation
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
