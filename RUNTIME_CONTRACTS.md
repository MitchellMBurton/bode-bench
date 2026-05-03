# Runtime Contracts

## Purpose

This document names the contracts that protect trust at runtime. It sits between product doctrine and implementation details: stable enough to guide reviews, concrete enough to catch bugs.

## Frame Dispatch

Live analysis frames are published as retained snapshots.

- A published `AnalysisFrame` must remain readable for async React subscribers and canvas RAF loops after `FrameBus.publish()` returns.
- Worker transfer buffers may be pooled internally, but published frame arrays must not be recycled, detached, or overwritten while subscribers can still hold the frame.
- If a panel needs to retain a frame for later painting, the bus-level retained snapshot is the ownership boundary. Individual panels should not guess worker buffer lifetimes.
- One subscriber failure must not stop dispatch to other subscribers.
- Listener failures should be routed to diagnostics with enough context to identify the subscriber surface.

Core files:

- `app/src/audio/frameBus.ts`
- `app/src/audio/engine.ts`
- `app/src/core/session.tsx`

## Worker Analysis Boundary

The worker path exists to keep analysis honest and the UI responsive.

- Worker messages must be versioned or shape-validated at the boundary.
- Transferable buffers are an implementation optimization, not a public ownership contract.
- Back-pressure should prefer dropping stale work with diagnostics over queuing unbounded frames.
- The main-thread analysis adapter remains the parity fallback.
- PERF LAB should keep worker/main visibility available while Track 3 is active.

Core files:

- `app/src/audio/analysisWorkerProtocol.ts`
- `app/src/audio/analysisWorkerClient.ts`
- `app/src/audio/analysisRuntime.ts`

## Session Source Matching

Review sessions must never apply ranges to the wrong media.

- A matching `mediaKey` is the strongest normal source match.
- If both saved and current media keys exist and differ, treat the source as a mismatch.
- Filename and duration fallback is only for cases where a reliable media key is unavailable.
- Source-kind mismatch is always a mismatch.
- Pending sessions may wait for a matching source; they should not silently restore onto a merely similar source.

Core file:

- `app/src/runtime/reviewSession.ts`

## Review Session Artifacts

`.review-session.json` files are transparent, versioned artifacts.

- Schema version must be explicit from v1 onward.
- Unknown versions must fail closed until a migration exists.
- Units must remain explicit: seconds, Hz, dB, normalized 0-1, bytes, milliseconds.
- Session files reference media; they do not bundle media.
- Source identity should include the browser-safe `mediaKey` plus explicit `size`, `lastModified`, and desktop `sourcePath` when available.
- Layout and analysis config can be restored, but ephemeral playback state should not define the artifact.

### A-B Session V2 Contract

Production save/load still emits and accepts v1 until Track 4 writes two-source sessions.

- v2 keeps `schema: "bode-bench.review-session"` and uses `version: 2`.
- v2 replaces top-level `source` with `sources`.
- `sources.primary` is required and uses the current source identity shape: `filename`, `kind`, `durationS`, `mediaKey`, `size`, `lastModified`, and `sourcePath`.
- `sources.reference` is optional and is either the same source identity shape or `null`.
- v1 migration maps `source` to `sources.primary` and initializes `sources.reference` as `null`.
- Parser behavior must remain fail-closed for unknown versions until the Track 4 writer and reader are implemented together.

Core files:

- `app/src/runtime/reviewSession.ts`
- `app/src/layout/consoleLayoutWorkspace.ts`
- `app/src/layout/splitPanePersistence.ts`

## Export and Report Artifacts

Exported artifacts should be reproducible and inspectable.

- Clip exports should record source identity, range, tuning, preset, and ffmpeg command intent in a manifest sidecar where applicable.
- Report exports should avoid leaking identifying paths when a scrub option is active.
- Browser paths may use downloads; desktop paths should use explicit file-system seams.
- Desktop-specific file and process behavior belongs in the Tauri boundary, not scattered through React.

Core files:

- `app/src/runtime/reviewReport.ts`
- `app/src/runtime/desktopExport.ts`
- `app/src/runtime/exportPresets.ts`
- `desktop/src-tauri/src/lib.rs`

## Command Availability

High-frequency controls must stay reachable under normal desktop resizing.

- Live Diagnostic chrome owns primary transport, review, and compact playback tuning.
- Volume and rate are primary playback tuning, not optional settings.
- A tuning popover may provide additional room, but it should not be the only path to `VOL` and `RATE`.
- Responsive wrapping is preferable to hiding critical controls.

Core file:

- `app/src/controls/OverviewTransportStrip.tsx`
