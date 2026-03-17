# Tasks

## Status: ALPHA COMPLETE — v0.1 (2026-03-17)

This repo is preserved as the v0.1 Alpha artifact (tag: `v0.1-alpha`).
**No further development in this repo.** See `HANDOFF.md` for the continuation plan.

---

## Alpha Milestone

Stable general-purpose session console for local audio and video analysis.

## Completed in Alpha

### Hardening Track

- [x] **H01 - Restore green build.** Fix current TypeScript build failures and keep `main` releasable.
- [ ] **H02 - Add verification gate.** Add a repeatable CI path for typecheck, lint, and tests.
- [x] **H03 - Introduce explicit session core.** Replace hidden global runtime state with a session-scoped application service.
- [ ] **H04 - Define runtime interfaces.** Put core runtime behavior behind narrower adapter contracts.
- [ ] **H05 - Move orchestration out of React.** Transport, ingest, and mode switching should be driven more by session services than component-local wiring.
- [ ] **H06 - Add runtime schemas.** Validate overlay JSON, manifests, and future queued artifact payloads at runtime.
- [ ] **H07 - Define offline analysis artifacts.** Specify durable outputs for waveform, spectrogram, pitch, loudness, and media summaries.
- [ ] **H08 - Worker-ready analysis path.** Move heavy non-UI analysis work toward worker-safe execution.
- [x] **H09 - Desktop shell spike.** Add a thin desktop wrapper without introducing desktop-only core logic.
- [ ] **H10 - Hosted queue seam.** Define request/result contracts so queued analysis can render through the same panel model later.
- [x] **H11 - Fix stretch watchdog spurious fallback.** Re-register `setUpdateInterval` heartbeat after `dropBuffers()` so decoded playback doesn't trigger watchdog after 1.35 s.
- [x] **H12 - Multi-instance RAF throttling.** `rafGuard.ts` — skip draw when hidden, throttle to 4 fps when unfocused. Applied to all canvas panels.
- [x] **H13 - Full visual mode coherence.** DEFAULT / MONO / NGE / HYPER themes applied to every surface: all panels, controls, transport, diagnostics, runtime metric pills.

## Build Order

### Phase 1: Scaffold

- [x] **T01 - Init repo.**
- [ ] **T02 - Tauri shell.** Historical scaffold task; desktop shell is now live, but packaging and release ergonomics still need polishing.
- [x] **T03 - Theme constants.**
- [x] **T04 - Four-quadrant layout.**

### Phase 2: Runtime Domain

- [x] **T05 - Media ingest.** Drag-drop or file-open loads a local session file.
- [x] **T06 - Transport.** Play, pause, stop, seek, loop, scrub, time readout.
- [x] **T07 - Frame bus / runtime updates.**

### Phase 3: Analysis Surfaces

- [x] **T08 - Levels panel.**
- [x] **T09 - Frequency bands panel.**
- [x] **T10 - Oscilloscope panel.**
- [x] **T11 - Spectrogram panel.**
- [x] **T11b - Expanded panel set.** Overview, scrolling waveform, pitch tracker, loudness history, frequency response, harmonic ladder.

### Phase 4: Metadata and Annotation

- [x] **T12 - Session metadata.** Display session identity and decode context in the control region.
- [x] **T13 - Annotation preprocessing example.** Keep the MusicXML-to-JSON pipeline as an optional worked example.
- [x] **T14 - Structural overlay path.** Load processed overlay data and render aligned events where available.

### Phase 5: Playback and Review UX

- [x] **T15 - Diagnostics log.** Reviewable, copyable, savable session log.
- [x] **T16 - Video presentation modes.** Docked, windowed, theater, and in-app full screen.
- [x] **T17 - Playback refinement.** Improve video sync, loop, scrub, and rate/pitch recovery.
- [ ] **T18 - Screenshot audit.** Review every major state for composition and legibility.
- [ ] **T19 - Long-session soak test.** Validate long-running rate, scrub, loop, and video interaction stability.

## Done Criteria

A task is done when:

- it works in `npm run dev`
- it works in the desktop shell where relevant
- types remain explicit at domain boundaries
- the layout remains screenshot-safe
- no unrelated regressions are introduced

## After This Milestone

- persistent workspace presets
- richer annotation systems beyond score
- comparative review workflows
- offline artifact generation
- hosted analysis pipeline
- broader rename / branding pass away from legacy Bach-specific artifacts
