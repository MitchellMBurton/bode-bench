# CLAUDE.md

## What This Is
A local-first, desktop-grade scientific listening instrument for J.S. Bach's Six Cello Suites. Real-time audio diagnostics fused with symbolic musical structure in a disciplined four-quadrant console.

Read the full project definition in `PROJECT.md`. Read UX doctrine in `UX_PRINCIPLES.md`. Read technical structure in `ARCHITECTURE.md`. Read decision logic in `DECISION_RULES.md`. Read current work in `TASKS.md`.

## Stack
- **Frontend:** React + TypeScript + Vite
- **Desktop wrapper:** Tauri
- **Live analysis:** Web Audio API, AnalyserNode, Canvas 2D
- **Preprocessing:** Python, music21, FFmpeg
- **Package manager:** pnpm (preferred) or npm
- **Linting:** ESLint + Prettier (configure on scaffold)

## Repo Structure
```
bach-cello-console/
  CLAUDE.md
  README.md
  PROJECT.md
  UX_PRINCIPLES.md
  ARCHITECTURE.md
  DECISION_RULES.md
  TASKS.md
  app/
    src/
      audio/          # Web Audio transport, analyser nodes, frame extraction
      score/          # Symbolic score types, loaders, overlay logic
      panels/         # Oscilloscope, Spectrogram, Levels, FrequencyBands
      layout/         # Four-quadrant shell, panel slots, resize logic
      controls/       # Transport, ingest surface, metadata display
      theme/          # Colours, typography, spacing constants
      types/          # Shared TypeScript interfaces and data contracts
      utils/          # General helpers
      App.tsx
      main.tsx
    public/
    index.html
    package.json
    tsconfig.json
    vite.config.ts
  desktop/
    src-tauri/        # Tauri config and Rust glue
  scripts/
    parse_scores.py
    export_events.py
    probe_audio.py
  data/
    raw/              # MusicXML / other source scores
    processed/        # JSON event exports, metadata
  audio/
    sessions/         # Temporary session audio (gitignored)
```

## Commands
```bash
# Frontend dev
cd app && pnpm install && pnpm dev

# Desktop dev (Tauri)
cd desktop && cargo tauri dev

# Preprocessing
cd scripts && python parse_scores.py

# Lint
cd app && pnpm lint

# Type check
cd app && pnpm tsc --noEmit
```

## How to Work in This Repo

### One subsystem at a time
Each task targets a single domain (audio, score, panel, layout, controls). Do not mix concerns across domains in a single change.

### Domain boundaries are hard
- `audio/` owns playback, transport state, and all real-time analysis frame data.
- `score/` owns parsed musical structure, metadata, and overlay data.
- `panels/` owns rendering. Panels receive typed frame data as props or via a shared frame bus. Panels never call Web Audio directly.
- `controls/` owns user input surfaces (transport, ingest, filters).
- `layout/` owns the four-quadrant shell. It composes panels and controls but contains no analysis logic.

### Data flows one way
Audio domain → frame data → panels (render).
Score domain → structured events → overlay layer → panels (enrich).
Panels do not write back to audio or score domains.

### Type everything at boundaries
All data crossing a domain boundary must have an explicit TypeScript interface in `types/`. No `any`. No shape guessing. Required vs optional fields must be explicit. Units must be declared (seconds, Hz, dB, normalised 0–1).

### Canvas panels follow a common pattern
Each panel (Oscilloscope, Spectrogram, Levels, FrequencyBands) should:
1. Accept a typed frame object.
2. Own a `<canvas>` ref.
3. Run a `requestAnimationFrame` render loop.
4. Draw using Canvas 2D (no DOM-based animation in the hot path).
5. Handle its own resize via `ResizeObserver`.

### Preprocessing stays outside the UI runtime
Python scripts in `scripts/` produce JSON files in `data/processed/`. The frontend reads these as static imports or fetches. No Python runs at UI time.

### Session audio is ephemeral
Files in `audio/sessions/` are gitignored. Ingest loads audio into a Web Audio buffer for the session. No persistent library management in v1.

## Decision Rules (Summary)
When choosing between alternatives:
1. Measurement credibility over visual drama.
2. Interface harmony over isolated panel optimisation.
3. Explicit typed contracts over implicit behaviour.
4. Local power now, web portability later.
5. Replaceable implementations over rigid lock-in.

If a change increases flash but decreases trust, reject it.
Full rules in `DECISION_RULES.md`.

## Current Milestone
Deep single-movement console for **Suite No. 1 Prelude**. See `TASKS.md` for the ordered build sequence.

## Style Notes
- No generic media-player styling.
- No nightclub visualiser aesthetics.
- No decorative features without measurement purpose.
- Evangelion-adjacent severity is an acceptable influence. Imitation is not.
- Every default state must be screenshot-worthy and presentation-safe.
- Beauty emerges from precision, not ornament.
