# Handoff

## Repo State

Repo: `av_project_claude_2`
Branch: `main`
Accepted baseline at this handoff: `c3112b9`

This repo is active. It is not a preserved no-change alpha. The handoff below is for continuing refinement work, not for migrating away from a frozen artifact.

## What Exists Today

### Product shape

- session-based local audio and video review
- left Session Console used as a preview/workbench
- right Live Diagnostic quadrant used as the primary analytical surface
- alternate audio and subtitle attachment for playback
- desktop-first clip export flow
- optional tuned clip export using current `VOL`, `RATE`, and `PITCH`
- diagnostics drawer for support and reproducibility

### UX direction already in flight

- routing-first controls on the left
- chrome-mounted command deck on the right
- denser, more clinical control surfaces
- reduced duplication between global, local, and analytical controls

### Technical seams already worth preserving

- `app/src/audio/engine.ts` for transport/runtime truth
- `app/src/core/session.tsx` for shared session wiring
- `app/src/runtime/waveformPyramid.ts` for shared waveform confidence and refinement ownership
- `app/src/layout/ConsoleLayout.tsx` for shell/chrome structure
- `app/src/panels/WaveformOverviewPanel.tsx` for the overview timeline system
- `desktop/src-tauri/src/lib.rs` for desktop export and file-system seams

## Current Known Rough Edge

The most visible open bug is still the fullscreen short-streamed-media overview/detail behavior. It is real, it has already consumed too much iteration time, and it should be treated as a pragmatic reliability fix rather than a design problem.

Do not let that single bug distort the broader product direction.

## Non-Negotiables

- keep the desktop shell thin but real
- keep transport truth single-sourced
- keep streamed media representations honest
- keep the Session Console as a workbench, not a second dashboard
- keep the Live Diagnostic quadrant as the authoritative analytical command surface
- do not reintroduce control duplication casually

## Best Next Work Order

1. Finish the fullscreen overview reliability issue cleanly.
2. Do one more export trust pass:
   - source-path behavior
   - completion feedback
   - output discoverability
3. Run a screenshot audit across all style modes.
4. Reduce bundle size and improve packaging ergonomics.
5. Continue removing stale legacy wording from the codebase and packaged artifacts.

## Excellence Standard

Future work should optimize for:

- clarity before cleverness
- dense but readable command surfaces
- stable control placement
- calm, screenshot-safe composition
- honest data representation
- desktop workflows that feel professional rather than experimental

## What Not to Do

- do not turn the product into a generic media-player skin
- do not hide useful controls behind oversimplified UX
- do not fake full-resolution certainty for streamed media
- do not move desktop-specific file and export logic into React
- do not keep stale docs that describe an older product
