# Scientific Listening Instrument

Local-first, desktop-grade media analysis console for close listening, technical review, and presentation-safe diagnostics.

The product has evolved beyond its original Bach-specific framing. The repository, installer, and some bundled sample data still carry legacy `Bach Cello Console` naming, but the working direction is now general-purpose: arbitrary local audio and video, optional structural overlays, and a disciplined four-quadrant analysis workspace.

## What This Is

This is not a consumer media player and not a decorative visualiser.

It is a serious local instrument for:

- waveform, spectrum, loudness, pitch, and frequency-response inspection
- transport-heavy review with seeking, looping, and scrubbing
- video-assisted listening with docked, windowed, theater, and in-app full-screen preview modes
- optional structural overlays and preprocessing pipelines when a project benefits from them

## Current Product Shape

- Desktop-first, session-based workflow
- Local ingest for arbitrary audio or video files
- Real-time diagnostic surfaces in a four-quadrant console
- Shared browser and desktop frontend
- Diagnostics log designed for review, export, and debugging
- Optional annotation / score workflow retained as one supported use case, not the core identity

## Requirements

| Dependency | Minimum | Notes |
|---|---|---|
| Node.js | 18+ | v22 confirmed working |
| npm | 9+ | pnpm also works if installed |
| Rust | stable | Only for the Tauri desktop wrapper |
| Python | 3.9+ | Optional preprocessing |
| music21 | any | Optional, for MusicXML-driven overlays |
| FFmpeg | any | Optional, for probing utilities |

No Rust or Tauri is required to run the browser frontend.

## Quick Start

### Frontend dev

```bash
cd app
npm install
npm run dev
```

Default dev URL:

- `http://127.0.0.1:4173/`

### Desktop dev

```bash
cd desktop
npm install
npm run dev
```

### Shareable local builds

```bash
cd desktop
npm run release:share
```

This refreshes:

- `desktop/share/BachCelloConsole-Setup.exe`
- `desktop/share/webapp.html`

## Using the Console

1. Load any local audio or video file with drag-drop or the file picker.
2. Use transport controls to play, pause, stop, seek, loop, and scrub.
3. Inspect the live panels:
   - overview
   - scrolling waveform
   - pitch
   - oscilloscope
   - frequency response
   - levels
   - bands / partials
   - loudness
   - spectrogram
4. Use the diagnostics log to review transport, decode, preview, and mode-transition events.
5. For video sessions, use:
   - `WND` for a draggable, resizable in-app video window
   - `THR` for theater presentation
   - `FULL` for in-app full-screen within the console window

## Optional Annotation Workflow

The repo still includes a Bach / MusicXML pipeline as a worked example of structural overlays.

Use it when you want aligned note or annotation data, but treat it as an optional domain-specific layer rather than the product definition.

Example scripts:

```bash
cd scripts
python parse_scores.py
python export_events.py <offset_seconds>
python probe_audio.py path/to/file
```

Bundled sample data remains in:

- `data/processed/suite1_prelude.json`
- `app/public/data/processed/suite1_prelude.json`

## Project Layout

```text
av_project_claude_2/
  app/                        # React + Vite frontend
  desktop/                    # Tauri desktop wrapper and share scripts
  scripts/                    # Optional preprocessing and probing tools
  data/processed/             # Example processed overlay data
  README.md
  PROJECT.md
  ARCHITECTURE.md
  TASKS.md
  MEMORY.md
  UX_PRINCIPLES.md
  POWER_USER_UX.md
  DECISION_RULES.md
  CLAUDE.md
```

## Development Commands

```bash
# Frontend dev
cd app && npm run dev

# Frontend lint
cd app && npm run lint

# Frontend build
cd app && npm run build

# Desktop dev
cd desktop && npm run dev

# Desktop build
cd desktop && npm run build

# Desktop + browser share bundle
cd desktop && npm run release:share
```

## Project Documents

| Document | Purpose |
|---|---|
| `PROJECT.md` | Product definition and invariants |
| `ARCHITECTURE.md` | Technical structure and domain boundaries |
| `TASKS.md` | Current milestone and work ordering |
| `MEMORY.md` | Durable project context and recent accepted shifts |
| `UX_PRINCIPLES.md` | Interface doctrine |
| `POWER_USER_UX.md` | Workspace and expert-UX direction |
| `DECISION_RULES.md` | How to choose between alternatives |
| `CLAUDE.md` | Contributor / agent repo guidance |

## Current Reality

- The runtime is general-purpose.
- The branding is still partially legacy.
- The annotation pipeline is still Bach-flavored by default.

That is intentional for now: broaden the instrument first, then rename and generalize every artifact once the product direction is fully settled.
