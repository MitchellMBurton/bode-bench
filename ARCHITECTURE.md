# Architecture

## Goal

Local-first desktop instrument that remains web-portable. Maximise local power and fast iteration now. Preserve a clean migration path to browser-only deployment later.

## Three Domains

### 1. Audio Analysis Domain

Runtime: browser (Web Audio API inside Tauri webview).

Owns:
- Source decode and playback.
- Transport state (play, pause, seek, current time).
- AnalyserNode configuration and frame extraction.
- Levels (peak, RMS).
- Waveform time-domain data (oscilloscope).
- FFT frequency-domain data.
- Spectrogram history buffer.
- Frequency-band aggregation.

All analysis data is extracted per-frame and pushed to panels as typed frame objects.

### 2. Symbolic Score Domain

Runtime: static JSON loaded at session start.

Owns:
- Suite and movement metadata.
- Note events (pitch, onset, duration, measure, beat).
- Phrase and section segmentation.
- Overlay data aligned to time axis.
- Future helix / DNA structural views.

Score data is produced offline by preprocessing scripts and consumed read-only by the frontend.

### 3. Preprocessing Domain

Runtime: Python scripts run manually or via CLI.

Owns:
- MusicXML parsing (music21).
- JSON event export.
- Metadata generation.
- Audio probing and format conversion (FFmpeg).
- Cache generation when useful.

Preprocessing never runs at UI time. Its outputs are committed or gitignored depending on reproducibility needs.

## Architectural Rule

Audio tells us what is happening. Score tells us what it means. Do not collapse them into one vague subsystem.

## Data Flow

```
[Audio File] → Web Audio API → AnalyserNode → Frame Data → Panels
[Score JSON] → Score Loader → Overlay Data → Panels (enrich)
[MusicXML]   → Python Scripts → JSON → data/processed/
```

Panels are pure renderers. They receive typed data and draw. They do not own audio nodes or parse scores.

## Recommended Baseline

| Layer | Tool | Replaceable? |
|---|---|---|
| Frontend framework | React + TypeScript | Yes |
| Build tool | Vite | Yes |
| Desktop wrapper | Tauri | Yes |
| Audio analysis | Web Audio API, AnalyserNode | Partially |
| Rendering | Canvas 2D | Yes |
| Score parsing | Python + music21 | Yes |
| Audio probing | FFmpeg | Yes |
| State management | React context or zustand | Yes |

All tools are recommended defaults, not permanent law. Replace any if the replacement preserves invariants and improves real outcomes.

## Key Technical Decisions

### Canvas 2D for panels
Panels render via Canvas 2D on `requestAnimationFrame`. No DOM-based animation in the hot path. Each panel owns its canvas ref and handles resize via `ResizeObserver`.

### Frame bus pattern
Audio domain produces a typed frame object each animation frame. Panels subscribe to this frame. Options: React context with ref-based updates, a lightweight event emitter, or zustand with transient updates. Choose the simplest that avoids unnecessary React re-renders.

### Tauri integration is thin
Tauri provides the desktop window, file-open dialog, and menu bar. No Rust-side audio processing in v1. All analysis runs in the webview. This keeps the web-portable path clean.

### Ingest is session-scoped
Audio files are loaded into an `AudioBuffer` for the session. No persistent indexing, no database. The original file is never modified.

## File Ownership

```
audio/          → Audio Analysis Domain
score/          → Symbolic Score Domain
panels/         → Rendering (consumes both domains)
controls/       → User input (transport, ingest, filters)
layout/         → Four-quadrant shell (composes panels + controls)
theme/          → Visual constants (colours, fonts, spacing)
types/          → Shared interfaces and data contracts
scripts/        → Preprocessing Domain
data/processed/ → Preprocessing outputs
audio/sessions/ → Ephemeral session audio (gitignored)
```
