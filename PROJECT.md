# Project Definition

## Mission

Build a local-first scientific media instrument that lets one attentive user inspect arbitrary audio or video with trustworthy transport, clear diagnostics, and export paths that feel deliberate rather than fragile.

## Product Identity

This product is a scientific listening instrument and media analysis console.

It is not defined by one file type, one repertoire, or one panel. It is defined by disciplined alignment between:

- transport
- review
- diagnostics
- visual analysis
- export

## Current Product Reality

The product has moved beyond its earlier alpha framing.

Current accepted reality:

- the repo is active
- the desktop build matters
- arbitrary local audio and video are first-class
- the left pane is becoming a session workbench
- the right pane is the analytical command surface
- export is a real workflow, not a future placeholder
- optional structural overlays remain supported, but they are not the product identity

## Invariants

- The product is a scientific instrument before it is a media app.
- Beauty must come from precision, hierarchy, and trustworthy behavior.
- Streamed large-media views must be honest about uncertainty.
- Global chrome should stay sparse and operational.
- The default layout must be strong enough for daily use and live demonstration.
- Desktop-first decisions are acceptable when they materially improve the real workflow.
- The browser path should remain viable where it does not weaken the desktop product.

## Current v0.3 Direction

v0.2 (frozen at tag `v0.2-final`) delivered the trustworthy review-and-export console: clinical density, honest streamed-media handling, desktop-first export, multi-mode visual presentation. v0.3 takes the next step — turning the instrument from a single-source review console into a comparative measurement bench.

Five direction-defining moves, in dependency order:

1. **Notes on ranges + session report export** — converts saved ranges from navigation aid into a deliverable artifact a reviewer can hand to someone else.
2. **Reproducible review session artifact** — externalises session state (ranges, notes, layout, tuning, analysis config) as a versioned `.sli` file. Foundation for everything that follows.
3. **Worker-based analysis core** — moves analysis off the main thread. Closes the focus-throttle story structurally, unlocks OffscreenCanvas, satisfies CORE_HARDENING P5, prepares the substrate for two-source pipelines.
4. **Reference / A-B comparison workspace** — second source slot with locked transport, audible-monitor switch, panel opt-in dual rendering. The feature that defines what the instrument is *for*.
5. **Differential analysis (null test)** — sample-aligned A−B residual as audible monitor and visualised on every analysis surface. The capability that hardest-defines the product as a scientific instrument rather than a media app with graphs.

See `ROADMAP.md` for phase boundaries and graduation criteria, `FUTURE_PLANS_AND_IDEAS.md` for the broader idea pool, and `TASKS.md` for live work order.

## Included

- local desktop execution via Tauri
- shared browser frontend
- temporary session ingest for local audio and video
- decoded and streamed playback backends
- seek, loop, scrub, rate, and pitch control
- docked, windowed, theater, and in-console fullscreen video modes
- alternate audio and subtitle attachment for playback
- review ranges and clip export workflow
- diagnostics logging for review and support
- four-quadrant layout with persistent pane resizing

## Explicitly Out of Scope for This Milestone

- persistent media library
- collaborative or cloud workflows
- mobile-first UX
- destructive editing timeline
- multi-track editing
- hosted analysis queue platform
- consumer-media-player simplification

## Quality Standard

The product should feel:

- operationally pragmatic like VLC
- trustworthy and inspectable like Audacity
- deliberate in export intent like HandBrake

But it must still feel like one instrument with one visual and behavioral language.

## Change Policy

- Implementation may change freely when it improves fidelity, clarity, maintainability, or trust.
- Product doctrine changes only deliberately.
- Data contracts evolve with migration awareness.
- Legacy naming can remain temporarily, but it does not define the future product.
- Small bugs should be fixed honestly, but the broader product direction should not be held hostage by them.
