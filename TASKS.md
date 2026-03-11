# Tasks

## Current Milestone

Deep single-movement console for **Suite No. 1 Prelude**.

## Build Order

Each task is one unit of work. Complete in order. Each task should result in a working, testable state.

### Phase 1: Scaffold

- [x] **T01 — Init repo.** pnpm init, Vite + React + TypeScript, ESLint, Prettier, tsconfig strict mode. Verify `pnpm dev` serves a blank page.
- [ ] **T02 — Tauri shell.** Add Tauri to `desktop/`. Verify `cargo tauri dev` opens a window rendering the Vite dev page.
- [x] **T03 — Theme constants.** Create `theme/` with colour palette, typography scale, spacing grid, and canvas drawing constants. Export as typed objects.
- [x] **T04 — Four-quadrant layout.** Build the fixed shell in `layout/`. Four resizable-ish slots (top-left, top-right, bottom-right, bottom-left) filling the viewport. Placeholder panels showing slot labels.

### Phase 2: Audio Domain

- [x] **T05 — Audio ingest.** Drag-drop or file-open loads an audio file into a `Web Audio AudioBuffer`. Display filename and duration in the control region. Session-scoped, no persistence.
- [x] **T06 — Transport.** Play, pause, stop, seek. Current time readout. Wire `AudioBufferSourceNode` through an `AnalyserNode`.
- [x] **T07 — Frame bus.** Each `requestAnimationFrame`, extract time-domain and frequency-domain data from the `AnalyserNode`. Publish a typed `AudioFrame` object that panels can consume without causing React re-renders.

### Phase 3: Panels

- [x] **T08 — Levels panel.** Canvas panel in bottom-left slot. Render peak and RMS bars from `AudioFrame`. Labelled dB scale.
- [x] **T09 — Frequency bands panel.** Canvas panel in bottom-left slot (alongside levels). Aggregate FFT bins into ~10 bands. Bar display with Hz labels.
- [x] **T10 — Oscilloscope panel.** Canvas panel in top-right slot. Render time-domain waveform from `AudioFrame`. Stable trigger, amplitude scale.
- [x] **T11 — Spectrogram panel.** Canvas panel in bottom-right slot. Scroll frequency-domain data leftward over time. Colour-mapped intensity. Frequency axis labelled.

### Phase 4: Metadata and Score

- [x] **T12 — Movement metadata.** Display Suite No. 1 Prelude metadata in the control region — title, key, tempo marking, estimated duration.
- [x] **T13 — Score preprocessing.** Python script: parse Suite No. 1 Prelude from MusicXML (music21), export note events as JSON to `data/processed/`. Schema: `{ pitch, onset_s, duration_s, measure, beat }[]`. Stub data generated for development.
- [x] **T14 — Symbolic overlay.** Load processed score JSON. Render note events as an overlay on the spectrogram, aligned to the transport timeline. Visually distinct from the diagnostic layer.

### Phase 5: Polish

- [ ] **T15 — Screenshot audit.** Review every panel in its default playback state. Fix any dead corners, debug styling, or broken composition. Verify the four-quadrant layout holds as a screenshot.
- [ ] **T16 — Presentation test.** Play a full performance of the Prelude while observing all panels. Verify cross-panel coherence, stable motion, readable labels, and no visual glitches.

## Done Criteria

A task is done when:
- The feature works in `npm run dev` (and `cargo tauri dev` where applicable).
- Types are explicit — no `any` at domain boundaries.
- The layout remains screenshot-safe with the new addition.
- No unrelated regressions.

## After This Milestone

- Remaining five suites (metadata + score data).
- Additional symbolic overlays (phrase markers, section segmentation).
- Helix / DNA structural rendering.
- Performer comparison workflows.
- Browser-only deployment without Tauri.
