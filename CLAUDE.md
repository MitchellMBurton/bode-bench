# CLAUDE.md

## What This Is

A local-first, desktop-grade scientific listening instrument and media analysis console. Real-time diagnostics, disciplined transport control, and optional structural overlays live together in a four-quadrant workspace.

**This repo is active.** It is no longer a preserved v0.1 alpha artifact or a Bach-specific console. The current work is v0.3/v0.4 refinement toward a trustworthy desktop-first comparative media instrument for arbitrary local audio and video.

Legacy Bach-specific sample data and repository history still exist, but they do not define the product. Treat structural overlays as optional, not as the main runtime identity.

Read the full project definition in `PROJECT.md`. Read UX doctrine in `UX_PRINCIPLES.md`. Read runtime contracts in `RUNTIME_CONTRACTS.md`. Read technical structure in `ARCHITECTURE.md`. Read processing policy in `PROCESSING_POLICY.md`. Read decision logic in `DECISION_RULES.md`. Read current work in `TASKS.md`.

Before refining any of the above, read `REFINEMENT.md`. The doctrine is living and explicitly designed to be challenged by smarter readers; that doc explains how, what's settled, and what's still open.

## Stack

- **Frontend:** React + TypeScript + Vite
- **Desktop wrapper:** Tauri
- **Live analysis:** Web Audio API, HTML media elements, Canvas 2D
- **Preprocessing:** Python, music21, FFmpeg
- **Package manager:** npm or pnpm
- **Linting:** ESLint

## Repo Structure

```text
bode-bench/
  CLAUDE.md
  README.md
  PROJECT.md
  UX_PRINCIPLES.md
  ARCHITECTURE.md
  RUNTIME_CONTRACTS.md
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

### Check the mounted surface before adding UI

Before adding a visible control, confirm which component is actually mounted in the live layout. Registry membership or a plausible component name is not enough. For transport, review, and tuning controls, check the Session Console and Live Diagnostic chrome paths directly.

### Keep key controls reachable

Primary transport, review, volume, rate, and tuning controls should remain available in the Live Diagnostic command surface as viewport geometry changes. Popovers can supplement the rail, but they should not become the only access path for high-frequency controls.

### Preprocessing stays outside runtime

Scripts in `scripts/` generate optional artifacts. They do not belong in the live UI path.

### Preserve browser / desktop parity

Prefer fixes in the shared frontend. Keep the Tauri wrapper thin unless there is a clear desktop-only need.

## Current Milestone

**v0.3/v0.4 Direction.** Forked from `bach-cello-console` at tag `v0.2-final`. Tracks 1 and 2 shipped reproducible review artifacts and reports. Track 3 (worker core) is at minimal closure. Track 6 — Range Lab — is next, sequenced before Track 4. Tracks 4 and 5 turn the instrument into a two-source comparative bench with defensible null testing. See `ROADMAP.md` for phases, `TASKS.md` for the live work order, `HANDOFF.md` for continuation context.

## Style Notes

- No generic consumer media-player styling
- No nightclub visualizer aesthetics
- No decorative features without measurement purpose
- Severe, technical, presentation-safe defaults are good
- Beauty emerges from precision, not ornament
