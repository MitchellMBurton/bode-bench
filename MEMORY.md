# Global Memory

## 2026-05-03

### Accepted Runtime Hardening

- Track 3 worker-backed live frame analysis remains the active infrastructure path.
- Published analysis frames now have an explicit retained-snapshot contract so async panels can paint safely after worker buffers are recycled internally.
- `FrameBus.publish()` isolates subscriber failures and reports them through diagnostics instead of letting one panel stop the dispatch path.
- Review-session source matching treats conflicting saved/current media keys as a hard mismatch before filename and duration fallback.
- Live Diagnostic chrome keeps `VOL` and `RATE` available under normal desktop resizing; tuning popovers supplement rather than replace primary access.
- `RUNTIME_CONTRACTS.md` is now the contract reference for frame dispatch, worker boundaries, session source matching, export artifacts, and command availability.

### Current Documentation Direction

- `README.md` owns the document map.
- Canonical doctrine remains in `PROJECT.md`, `ARCHITECTURE.md`, `RUNTIME_CONTRACTS.md`, `UX_PRINCIPLES.md`, `POWER_USER_UX.md`, and `DECISION_RULES.md`.
- `TASKS.md` and `HANDOFF.md` own live continuation state.
- `PLAN_NOTES_AND_SESSIONS.md` and `REVIEW_BRIEF.md` are historical references, not current work owners.

## 2026-04-25

### Accepted Baseline

- Current accepted baseline is commit `c3112b9` on `main`.
- The baseline adds shared waveform pyramid ownership, recovered export/source-path storage, explicit app-session teardown, Amber theme coverage, and refreshed tests.
- At that point, the product chrome needed to present the work as an active instrument, not a v0.1 alpha artifact.

## 2026-03-21

### Accepted Baseline

- Previous accepted baseline was commit `da8511e` on `main`.
- The repo is active and no longer described as a frozen alpha handoff.
- The product is now clearly a scientific media instrument for arbitrary local audio and video.

### Current Product Shape

- Left Session Console acts as a session workbench:
  - routing
  - preview
  - transport position
  - clip export
  - diagnostics access
- Right Live Diagnostic quadrant is the primary analytical command surface.
- Desktop clip export is a real workflow with fast and exact master paths.
- Alternate audio and subtitle attachment are part of the intended playback UX.

### Accepted UX Direction

- Controls should live at the highest sensible layer.
- The Session Console should not duplicate the whole app.
- The Live Diagnostic chrome should hold primary transport and review actions.
- The interface should feel denser, calmer, and more clinical over time.

### Known Rough Edge

- Fullscreen short-streamed-media detail waveform behavior is still not fully reliable.
- Treat it as a pragmatic reliability problem, not a reason to destabilize the rest of the product direction.

### Recommended Next Direction

- finish the fullscreen overview hardening
- sharpen export trust and completion affordances
- run a serious screenshot audit across style modes
- reduce build chunk size
- continue retiring stale legacy wording

## 2026-03-15

### Historical Baseline

- Large media now uses a streamed fallback path instead of forcing full in-memory decode.
- Large-media timelines now follow a two-tier model:
  - coarse full-session map
  - zoomed detail window
- Streamed high-quality video pitch was restored through live stretch processing.
- Streamed scrubbing now stays continuous instead of pausing on each movement.

### Historical Notes

- Perf Lab is part of the intended operating experience and should remain available as an expert-facing telemetry surface.
- Public Cloudflare share links are temporary and should not be treated as durable release URLs.

## 2026-03-14

### Historical Direction Change

- The project stopped being defined primarily as a Bach-specific suite console.
- The accepted direction became a general-purpose local media analysis instrument with optional structural overlays.
- Legacy branding remained temporarily in package names, installer names, and sample data.
