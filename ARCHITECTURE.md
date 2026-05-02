# Architecture

## Goal

Support a local-first scientific media instrument that stays powerful on desktop, remains shareable through the browser frontend, and preserves clear seams between runtime analysis, UI chrome, and offline export work.

## Current System Domains

### 1. Signal Runtime Domain

Runtime: shared frontend, both in browser and inside Tauri.

Owns:

- source decode and playback
- streamed fallback behavior
- seek, loop, scrub, rate, and pitch
- analyzer frame extraction
- waveform, pitch, oscilloscope, loudness, and response data
- transport diagnostics
- video preview state and presentation modes

Core files:

- `app/src/audio/engine.ts`
- `app/src/core/session.ts`
- `app/src/runtime/`

### 2. Session Workbench Domain

Runtime: React UI and layout chrome.

Owns:

- Session Console structure
- media routing controls
- preview and local transport affordances
- clip export entry points
- diagnostics drawer
- quadrant layout and fullscreen behavior

Core files:

- `app/src/controls/TransportControls.tsx`
- `app/src/controls/ClipExportStrip.tsx`
- `app/src/controls/DiagnosticsLog.tsx`
- `app/src/layout/ConsoleLayout.tsx`

### 3. Analysis Surface Domain

Runtime: canvas panels driven by runtime state.

Owns:

- overview timeline
- scrolling waveform
- pitch panels
- oscilloscope surfaces
- loudness surfaces
- spectrogram and frequency response

Panels render. They should not own core transport semantics.

Core files:

- `app/src/panels/`

### 4. Derived Media / Export Domain

Runtime: desktop-first seam plus lightweight frontend state.

Owns:

- review ranges
- selected clip state
- export preset mapping
- clip export manifest sidecars
- source relink behavior
- desktop job lifecycle for clip export

Core files:

- `app/src/runtime/derivedMedia.ts`
- `app/src/runtime/exportPresets.ts`
- `app/src/runtime/desktopExport.ts`
- `desktop/src-tauri/src/lib.rs`

### 5. Structural Annotation and Preprocess Domain

Runtime: optional static data and scripts.

Owns:

- score and overlay loaders
- preprocessing scripts
- metadata generation
- example MusicXML pipeline

Core files:

- `app/src/score/`
- `scripts/`
- `data/processed/`

## Architectural Rule

Signal runtime tells us what is happening.
Structural overlays tell us what it may mean.
Derived media tells us what we intentionally produced.

Do not collapse those into one vague subsystem.

## Current UI Strata

### Global chrome

Owns:

- runtime profile pills
- layout controls
- style options

It should stay sparse and operational.

### Live Diagnostic chrome

Owns:

- primary playback controls
- review actions
- compact playback tuning

It is the authoritative command deck for review and transport in the analytical workspace.

### Session Console

Owns:

- media routing
- preview
- transport position summary
- clip export
- diagnostics access

It should behave like a workbench, not a second dashboard.

## Timeline Model

The top-right overview stack is built around a two-tier timeline:

- coarse session map for whole-duration navigation
- detail window for focused waveform reading

For streamed media, coarse and detail coverage are distinct readiness tracks. The session map may know more than the detail band. The detail band should never pretend it has data it does not actually have.

Core files:

- `app/src/panels/WaveformOverviewPanel.tsx`
- `app/src/runtime/waveformPyramid.ts`
- `app/src/panels/waveformDetailMode.ts`

## Desktop Boundary

The desktop layer should own:

- file dialogs
- ffmpeg and ffprobe access
- temp files
- export process management
- export manifest sidecar writing
- reveal/open-folder behavior

The React frontend should own:

- intent
- state
- affordance
- progress presentation

That seam is deliberate and should stay clean.

## Stable Building Blocks

| Area | Building Block | Status |
|---|---|---|
| session wiring | `app/src/core/session.ts` | stable |
| transport runtime | `app/src/audio/engine.ts` | critical, change carefully |
| layout shell | `app/src/layout/ConsoleLayout.tsx` | active but foundational |
| pane geometry | `app/src/layout/SplitPane.tsx` | reusable and stable |
| panel rendering | `app/src/panels/` | stable surface boundary |
| theme constants | `app/src/theme/index.ts` | stable |
| desktop host | `desktop/src-tauri/src/lib.rs` | active seam |

## Known Architectural Tension

These are the real pressure points right now:

- fullscreen overview behavior on short streamed media still needs final hardening
- the Session Console has improved a lot, but still needs continued density and hierarchy refinement
- export is now functional, but the desktop job and source-path model still need polish
- the repo still carries legacy naming despite broader product reality

## Direction for Excellence

The next best architectural moves are:

1. keep control duplication low
2. keep runtime truth single-sourced
3. keep desktop seams explicit
4. favor honest temporary fallbacks over fake certainty
5. make every panel state strong enough for real screenshots and live demos
