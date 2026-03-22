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

## Current v0.2 Focus

The active milestone is not "more features at any cost." It is refinement and hardening across four areas:

1. Session Console clarity
2. Live Diagnostic control density and readability
3. Desktop clip export trustworthiness
4. Honest large-media timeline behavior

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
