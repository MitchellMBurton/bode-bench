# bode-bench — Scientific Listening Instrument

Local-first, desktop-grade media analysis console for close listening, technical review, clip export, and presentation-safe diagnostics.

This repo is the active continuation of the Scientific Listening Instrument. It opened at the v0.2-final state (forked from `bach-cello-console`, tagged for reference) and now moves through the v0.3/v0.4 path toward a comparative measurement bench. See `ROADMAP.md` for phase boundaries, `TASKS.md` for the live work order, and `FUTURE_PLANS_AND_IDEAS.md` for the broader idea pool.

Legacy Bach naming still appears in sample data and installer compatibility hooks; the product itself is general-purpose.

## Current Product Shape

- Desktop-first, session-based workflow
- Shared browser and desktop frontend
- Four-quadrant analysis workspace with persistent pane geometry
- Session Console on the left for media routing, preview, transport, clip export, and diagnostics
- Live Diagnostic quadrant on the right for review, overview, waveform, pitch, oscilloscope, and response work
- Alternate audio and subtitle attachment for playback
- Desktop clip export workflow with source-aware `FAST COPY`, `FAST REVIEW`, and `EXACT MASTER` modes
- Diagnostics log designed for support, review, and reproducible bug reports

## What It Is For

- close waveform and spectral inspection
- transport-heavy review with seeking, looping, and scrubbing
- audio and video clip extraction
- presentation-safe technical playback
- optional structural overlays and preprocessing when a project needs them

## What It Is Not

- not a consumer media player
- not a decorative visualizer
- not a persistent media library
- not a collaborative cloud product

## Current Strengths

- decoded and streamed playback backends
- large-media fallback path with honest coarse session maps
- reproducible `.review-session.json` artifacts with source-mismatch protection
- worker-backed live analysis frame path with retained dispatch snapshots
- docked, windowed, theater, and in-console fullscreen video modes
- routed session controls with cleaner command hierarchy
- current desktop export seam with bundled ffmpeg support
- screenshot-safe interface direction across multiple visual modes

## Current Rough Edges

- fullscreen overview detail-waveform behavior on short streamed media still needs final hardening
- chunk splitting in the frontend build is still larger than ideal
- legacy naming remains only where it preserves upgrade compatibility or documents sample-data lineage
- export and review UX are strong but still being refined toward a more clinical, less mixed-control feel

## Quality Bar

The product should feel like a lightweight fusion of:

- VLC for pragmatic local media handling
- Audacity for trustworthy inspection and clip thinking
- HandBrake for deliberate export intent

But it must still read as one coherent scientific instrument, not three borrowed interfaces glued together.

## Quick Start

### Frontend dev

```bash
cd app
npm install
npm run dev
```

Default dev URL:

- `http://127.0.0.1:5173/`

### Frontend verification

```bash
cd app
npx tsc --noEmit
npm run lint
npm test
npm run build
```

### Desktop dev

```bash
cd desktop
npm install
npm run dev
```

### Shareable local build

```bash
cd desktop
npm run release:share
```

This refreshes:

- `desktop/share/ScientificListeningInstrument-Setup.exe`
- `desktop/share/webapp.html`
- `desktop/share/latest.json`
- `desktop/share/ScientificListeningInstrument-Setup.exe.sha256.txt`

## Using the Console

1. Open any local audio or video file.
2. Use the Session Console to route media, attach alternate audio or subtitles, preview video, and inspect transport position.
3. Use the Live Diagnostic quadrant for review, waveform reading, range work, and spectral inspection.
4. Create review ranges and export clips from the desktop build.
5. Use the diagnostics drawer when you need a reproducible trace.

## Export Notes

- Clip export is desktop-first.
- Audio `FAST COPY` keeps the source container and avoids re-encode when no processing is required.
- Video `FAST REVIEW` is the quick accurate MP4 path for iteration and review.
- `EXACT MASTER` performs the higher-quality accurate export path.
- `Include current tuning` can bake `VOL`, `RATE`, and `PITCH` into exports. `SCRL` remains preview-only.
- Export may still need the original source file path if the session was loaded without a durable desktop path.

## Optional Annotation Workflow

The repo still includes a Bach and MusicXML pipeline as a worked example of structural overlays.

Use it when aligned note or annotation data is helpful, but treat it as an optional domain-specific layer rather than the product definition.

Example scripts:

```bash
cd scripts
python parse_scores.py
python export_events.py <offset_seconds>
python probe_audio.py path/to/file
```

## Project Layout

```text
bode-bench/
  app/                        # React + Vite frontend
  desktop/                    # Tauri desktop wrapper and share scripts
  scripts/                    # Optional preprocessing and probing tools
  data/processed/             # Example processed overlay data
  README.md
  PROJECT.md
  ARCHITECTURE.md
  RUNTIME_CONTRACTS.md
  TASKS.md
  HANDOFF.md
  MEMORY.md
  UX_PRINCIPLES.md
  POWER_USER_UX.md
  DECISION_RULES.md
  CLAUDE.md
```

## Project Documents

Use the docs in layers. Canonical doctrine changes slowly; live work docs move with the project; reference docs preserve useful history without owning current truth.

### Canonical Doctrine

| Document | Purpose |
|---|---|
| `PROJECT.md` | Product definition, scope, and quality bar |
| `ARCHITECTURE.md` | Current technical seams and system structure |
| `RUNTIME_CONTRACTS.md` | Runtime, session, worker, dispatch, and export contracts |
| `UX_PRINCIPLES.md` | Interface doctrine |
| `POWER_USER_UX.md` | Expert workflow and workspace direction |
| `DECISION_RULES.md` | How to choose between valid alternatives |

### Live Work Docs

| Document | Purpose |
|---|---|
| `TASKS.md` | Active work order and milestone status |
| `HANDOFF.md` | Practical continuation notes for the next work session |
| `ROADMAP.md` | Phase boundaries and graduation criteria |
| `STARTUP_RUNBOOK.md` | Daily startup, build, share, and verification procedure |
| `MEMORY.md` | Durable accepted decisions and recent context |

### Agent and Reference Docs

| Document | Purpose |
|---|---|
| `AGENT_BRIEF.md` | Ideation brief for external agents |
| `CLAUDE.md` | Compact contributor instructions for Claude-style agents |
| `CORE_HARDENING.md` | Earlier hardening thesis; still useful as architecture pressure map |
| `PLAN_NOTES_AND_SESSIONS.md` | Historical plan for shipped Tracks 1 and 2 |
| `REVIEW_BRIEF.md` | Historical v0.3.0 review brief |
| `FUTURE_PLANS_AND_IDEAS.md` | Raw idea pool that has not necessarily graduated |

## Current Reality

- The runtime is general-purpose.
- The desktop shell matters.
- Export is now a real product seam, not just an idea.
- The current work is about refinement, trust, and operational excellence, not invention for its own sake.
