# CLAUDE.md

## What This Is

A local-first, desktop-grade scientific listening instrument and media analysis console. Real-time diagnostics, disciplined transport control, and optional structural overlays live together in a four-quadrant workspace.

**This repo is the v0.1 Alpha artifact.** It is preserved at tag `v0.1-alpha`. Legacy Bach Cello naming has been retired from all user-visible surfaces. Continued development happens in the successor repo (see `HANDOFF.md`).

Read the full project definition in `PROJECT.md`. Read UX doctrine in `UX_PRINCIPLES.md`. Read technical structure in `ARCHITECTURE.md`. Read decision logic in `DECISION_RULES.md`. Read current work in `TASKS.md`.

## Stack

- **Frontend:** React + TypeScript + Vite
- **Desktop wrapper:** Tauri
- **Live analysis:** Web Audio API, HTML media elements, Canvas 2D
- **Preprocessing:** Python, music21, FFmpeg
- **Package manager:** npm or pnpm
- **Linting:** ESLint

## Repo Structure

```text
av_project_claude_2/
  CLAUDE.md
  README.md
  PROJECT.md
  UX_PRINCIPLES.md
  ARCHITECTURE.md
  DECISION_RULES.md
  TASKS.md
  MEMORY.md
  app/
    src/
      audio/          # Transport and signal-analysis runtime
      score/          # Structural annotation loaders and overlay support
      panels/         # Analysis surfaces
      layout/         # Shell and resizable pane logic
      controls/       # Transport, metadata, diagnostics, session controls
      diagnostics/    # Log storage and review helpers
      video/          # Video presentation state helpers
      theme/          # Colours, typography, spacing
      types/          # Shared TypeScript contracts
  desktop/
    src-tauri/        # Tauri config and Rust glue
  scripts/            # Optional preprocessing and probing
  data/
    processed/        # Sample or generated overlay outputs
```

## Commands

```bash
# Frontend dev
cd app && npm install && npm run dev

# Frontend lint
cd app && npm run lint

# Frontend build
cd app && npm run build

# Desktop dev
cd desktop && npm install && npm run dev

# Desktop release bundle
cd desktop && npm run release:share
```

## How to Work in This Repo

### Respect domain boundaries

- `audio/` owns playback, transport, and live analysis runtime
- `score/` owns optional structural annotation / overlay data
- `panels/` owns rendering
- `controls/` owns user input surfaces
- `layout/` owns workspace geometry and shell behavior

### Keep the runtime general-purpose

Do not bake repertoire-specific assumptions into transport, panels, or shell behavior. Domain-specific overlays are allowed, but they must remain optional.

### Type boundaries explicitly

All data crossing a subsystem boundary should have explicit TypeScript contracts. No `any`, no shape guessing, no ambiguous units.

### Preprocessing stays outside runtime

Scripts in `scripts/` generate optional artifacts. They do not belong in the live UI path.

### Preserve browser / desktop parity

Prefer fixes in the shared frontend. Keep the Tauri wrapper thin unless there is a clear desktop-only need.

## Current Milestone

**COMPLETE — v0.1 Alpha.** Single-session console for arbitrary local audio/video analysis is stable and feature-complete. See `HANDOFF.md` for what was built and what comes next.

## Style Notes

- No generic consumer media-player styling
- No nightclub visualizer aesthetics
- No decorative features without measurement purpose
- Severe, technical, presentation-safe defaults are good
- Beauty emerges from precision, not ornament
