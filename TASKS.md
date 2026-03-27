# Tasks

## Status: Active v0.2 Integration

This repo is under active refinement.

The current phase is no longer "alpha complete." The work now is to harden the product into a trustworthy desktop-first instrument with a cleaner session console, better export confidence, and stronger analysis UX.

## Current Milestone

Deliver a review-and-export console that feels coherent, trustworthy, and demonstration-ready for arbitrary local audio and video.

## Recently Completed

- [x] Session Console reworked toward a preview/workbench model
- [x] Live Diagnostic command deck promoted into chrome
- [x] Alternate audio and subtitle attachment for playback
- [x] Desktop clip export flow with fast and exact master modes
- [x] Optional tuned clip export for `VOL`, `RATE`, and `PITCH`
- [x] ffmpeg bundled/desktop seam work
- [x] Diagnostics log drawer and copy/save flows
- [x] Control hierarchy refinement across top chrome and left workbench
- [x] Documentation refresh to match the current product direction

## Active Refinement Tracks

### A. Session Console

- [x] Routing-first top control deck
- [x] Preview-local transport controls above video
- [x] Compact transport position summary
- [ ] Final density pass for left-pane vertical rhythm
- [ ] Stronger empty-state and no-file states

### B. Live Diagnostic UX

- [x] Chrome-mounted transport and review actions
- [x] Compact playback tuning in the command rack
- [x] Review panel reduced to summary plus saved ranges
- [x] Detailed waveform given more height in default layout
- [ ] Final fullscreen polish for short streamed media overview behavior

### C. Export Workflow

- [x] Selected-range clip export
- [x] Fast copy and exact master modes
- [x] Desktop source relink fallback
- [x] Desktop Save As flow and reveal-in-folder path
- [ ] Sharpen the final source-path and capability messaging
- [ ] Add clearer completion/history affordances

### D. Large-Media Honesty

- [x] Coarse session map plus detail window model
- [x] Distinct coarse vs detail coverage helpers
- [ ] Final reliability pass for fullscreen short-media detail waveform
- [ ] Longer soak around streamed media seeking and fullscreen transitions

### E. Release Quality

- [x] Lint, tests, and build green on current branch
- [ ] Reduce frontend chunk size
- [ ] Formal screenshot audit across style modes
- [ ] Repeatable desktop verification checklist

## Near-Term Next Steps

1. Finish the fullscreen overview hardening for short streamed media.
2. Tighten export trust and completion feedback.
3. Run a full screenshot and layout audit across visual modes and common aspect ratios.
4. Reduce chunk size and improve release ergonomics.
5. Continue cleaning legacy naming where it no longer earns its keep.

## Done Criteria

A refinement is done when:

- the behavior is trustworthy in the real desktop workflow
- the browser path still behaves coherently where applicable
- the UI reads as one instrument, not stacked experiments
- diagnostics stay useful and honest
- screenshots of normal use look intentional
- no unrelated regressions are introduced
