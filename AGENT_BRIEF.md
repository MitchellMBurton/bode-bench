# Agent Brief

Use this file as the single briefing document for external agents such as GPT-5.4 in the browser.

## Purpose

You are helping shape a desktop-first scientific media instrument.

The goal is not to produce generic media-player ideas. The goal is to help refine a serious local analysis tool so it feels:

- trustworthy
- dense but readable
- clinical rather than decorative
- fast for real review work
- coherent across playback, diagnostics, and export

## Product Identity

This product is best described as:

- a scientific listening instrument
- a media analysis console
- a local-first desktop workbench for audio and video review

The aspiration is roughly:

- VLC for pragmatic local media handling
- Audacity for trustworthy inspection and clip thinking
- HandBrake for deliberate export intent

But it must still feel like one instrument, not three products pasted together.

## Current Product Shape

The product already has:

- desktop-first execution through Tauri
- shared browser frontend for development and sharing
- a four-quadrant workspace
- a left Session Console used as a workbench
- a right Live Diagnostic quadrant used as the main analytical surface
- decoded and streamed playback paths
- waveform, pitch, oscilloscope, loudness, response, and spectrogram surfaces
- local video preview
- alternate audio attachment
- subtitle attachment
- review ranges
- desktop clip export with fast copy and exact master modes
- diagnostics logging for support and bug reports

## Current UX Direction

The interface is being refined toward these roles:

### Left: Session Console

This should behave like a compact workbench, not a second dashboard.

It should prioritize:

- media routing
- preview
- local transport awareness
- clip export
- diagnostics access

It should avoid carrying full duplicate copies of primary global controls unless locality clearly earns that duplication.

### Right: Live Diagnostic

This is the main analytical command surface.

It should hold:

- primary transport
- review actions
- compact playback tuning
- overview and detail waveform as the visual anchor

It should feel dense, stable, and operational.

## Current Design Principles

The product should optimize for:

- clarity before cleverness
- stable control placement
- explicit hierarchy
- screenshot-safe operating states
- honest data representation
- calm typography
- dense but structured control surfaces

Avoid:

- consumer-media-player chrome
- decorative visualizer styling
- floating controls without hierarchy
- repeated dashboards
- fake certainty in streamed views

## Important Product Truths

These are current accepted truths, not open questions:

- The repo is active.
- This is not a frozen alpha artifact anymore.
- Arbitrary local audio and video are first-class.
- The desktop build matters.
- Export is a real product workflow, not a placeholder.
- Optional structural overlays remain supported, but they are not the product identity.

## Current Rough Edges

These are real, but they should not dominate ideation:

- fullscreen short-streamed-media detail waveform behavior still needs hardening
- frontend chunk size is still larger than ideal
- some legacy naming remains in assets and packaging
- export and review UX are good but still being refined toward a more clinical and less mixed-control feel

Please do not spend all your effort re-litigating one small bug.

## Architectural Shape

The system is currently best thought of as five domains:

### 1. Signal Runtime

Owns:

- decode and playback
- seek, loop, scrub, rate, pitch
- analyzer extraction
- video preview state
- transport diagnostics

### 2. Session Workbench

Owns:

- Session Console structure
- routing controls
- preview
- local transport awareness
- clip export entry points
- diagnostics drawer

### 3. Analysis Surface

Owns:

- overview timeline
- scrolling waveform
- pitch surfaces
- oscilloscope surfaces
- loudness surfaces
- response and spectrogram surfaces

### 4. Derived Media / Export

Owns:

- review ranges
- selected clip state
- export presets
- desktop export jobs
- source relink behavior

### 5. Structural Annotation / Preprocess

Owns optional overlays and preprocessing assets.

## Control Hierarchy

Controls should live in the highest sensible layer:

- Global chrome: runtime, layout, style
- Live Diagnostic chrome: transport, review, tuning
- Session Console: routing, preview, local workbench tasks
- Panels: panel-local display and direct manipulation only

If a control can move one layer higher and become clearer, that is usually the right move.

## Timeline Doctrine

The timeline model is intentionally two-tier:

- coarse session map for whole-duration navigation
- detail window for focused waveform reading

For streamed media:

- coarse coverage and detail coverage are not the same thing
- the UI must never pretend detail coverage exists when it does not
- temporary scaffolds are acceptable
- fake certainty is not

## Export Doctrine

Export is desktop-first.

Current model:

- saved review range
- selected clip
- `FAST COPY`
- `EXACT MASTER`

Export should feel:

- explicit
- trustworthy
- non-destructive
- provenance-aware over time

The UI should make it obvious:

- what clip is selected
- what mode is being used
- where the result will go
- whether the source file is linked

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

If you want to reason from the codebase, these are the most important files:

- `README.md`
- `PROJECT.md`
- `ARCHITECTURE.md`
- `TASKS.md`
- `HANDOFF.md`
- `UX_PRINCIPLES.md`
- `POWER_USER_UX.md`
- `app/src/App.tsx`
- `app/src/layout/ConsoleLayout.tsx`
- `app/src/controls/TransportControls.tsx`
- `app/src/controls/OverviewTransportStrip.tsx`
- `app/src/controls/ClipExportStrip.tsx`
- `app/src/panels/WaveformOverviewPanel.tsx`
- `desktop/src-tauri/src/lib.rs`

## Suggested Prompt To Pair With This Brief

Use this brief to help me ideate on the next level of product refinement for a desktop-first scientific media instrument. Prioritize strong control hierarchy, clinical density, trustworthy export/review workflows, and screenshot-safe design. Do not spend most of your attention on one small implementation bug. I want high-signal product, UX, and architecture ideas that push the software toward excellence.
