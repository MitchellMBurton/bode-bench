# Global Memory

## 2026-03-21

### Accepted Baseline

- Current accepted baseline is commit `da8511e` on `main`.
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
