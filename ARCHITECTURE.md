# Architecture

## Goal

Local-first desktop instrument that remains web-portable. Maximize local power and fast iteration now while preserving a clean migration path to browser-first deployment later.

## Three Domains

### 1. Signal Analysis Domain

Runtime: browser environment inside the shared frontend, whether opened directly or inside the Tauri webview.

Owns:

- source decode and playback
- transport state
- seek, scrub, loop, rate, and pitch behavior
- analyzer configuration and frame extraction
- waveform, spectrum, pitch, loudness, and response data
- video preview sync policy and presentation modes
- diagnostics emitted from live runtime behavior

All analysis data is extracted from runtime state and pushed into render surfaces through typed state and lightweight stores.

### 2. Structural Annotation Domain

Runtime: static data loaded for a session when available.

Owns:

- session metadata
- note events, regions, markers, or other aligned annotations
- optional score-derived overlays
- domain-specific structural interpretations

This repo still uses `score/` and Bach-derived sample data for one annotation workflow, but the domain itself is broader than score.

### 3. Preprocessing Domain

Runtime: scripts run manually or via CLI.

Owns:

- MusicXML parsing and event export
- metadata generation
- audio probing and format inspection
- future artifact generation for offline analysis

Preprocessing never runs in the live UI path.

## Architectural Rule

Signal runtime tells us what is happening. Structural annotation tells us what it might mean. Do not collapse them into one vague subsystem.

## Data Flow

```text
[Audio/Video File] -> Runtime transport + analysis -> Typed state -> Panels
[Annotation Data]  -> Loader / validation       -> Overlay state -> Panels
[Source Files]     -> Scripts / preprocess      -> JSON/artifacts
```

Panels are renderers. They receive typed state and draw. They do not own core transport logic.

## Recommended Baseline

| Layer | Tool | Replaceable? |
|---|---|---|
| Frontend framework | React + TypeScript | Yes |
| Build tool | Vite | Yes |
| Desktop wrapper | Tauri | Yes |
| Analysis runtime | Web Audio API + HTML media elements | Partially |
| Rendering | Canvas 2D + disciplined DOM chrome | Yes |
| Annotation preprocessing | Python + music21 | Yes |
| Audio probing | FFmpeg | Yes |
| State wiring | React context + focused stores | Yes |

## Key Technical Decisions

### Canvas-first analysis panels

Hot-path panels render through Canvas 2D and controlled animation loops, not DOM-heavy animation.

### Thin desktop integration

Tauri provides the host window and packaging. Core analysis behavior stays in the shared frontend.

### Session-scoped ingest

Loaded files belong to the active session. No persistent indexing or library model in v1.

### Optional annotation pipeline

Annotation support is first-class, but not required for a valid session. The runtime must remain useful on arbitrary media without any structural companion data.

## File Ownership

```text
audio/          -> runtime transport and signal analysis
score/          -> structural annotation loaders and related types
panels/         -> rendering surfaces
controls/       -> user interaction surfaces
layout/         -> workspace shell and pane behavior
theme/          -> visual constants
types/          -> shared contracts
diagnostics/    -> log and review infrastructure
video/          -> video presentation state helpers
scripts/        -> preprocessing tools
data/processed/ -> sample or generated annotation outputs
```
