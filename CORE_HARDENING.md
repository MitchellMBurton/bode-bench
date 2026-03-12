# Core Hardening

## Goal

Prepare the codebase for two future distribution paths without overbuilding now:

- local desktop app (`.exe`) that runs reliably for one user
- hosted web app with queued analysis work

This is not a request for full production infrastructure yet. It is a request for a production-grade core:

- clear runtime boundaries
- stable contracts
- green build
- testable services
- platform seams that let us add desktop and hosted modes without rewriting the app

## Current Reality

The current app is a strong prototype, but the core is still tightly coupled around browser-local execution:

- audio runtime is concentrated in one mutable singleton
- panels subscribe to a global frame bus
- UI components call engine methods directly
- ingest is browser `File` / object-URL based
- score loading exists, but runtime validation is minimal and the score path is not a first-class app service
- build health is not currently clean
- there is no automated test or packaging path

That is normal for the current stage. It is not the right base for desktop packaging and queued web processing.

## Target Core

The core should converge on five stable layers.

### 1. Contracts

Shared types and runtime-validated schemas for:

- session state
- transport commands
- analysis frame snapshots
- score data
- offline analysis artifacts
- future job status / queue payloads

### 2. Session Core

A session-scoped controller that owns:

- ingest lifecycle
- transport lifecycle
- active runtime mode
- file metadata and derived analysis metadata
- subscriptions for UI read models

No global mutable singleton state for active sessions.

### 3. Runtime Adapters

A narrow interface for how analysis happens.

Initial adapter:

- `WebAudioRuntime` for local browser/desktop realtime analysis

Future adapters:

- desktop shell adapter for file dialogs / packaging concerns
- remote analysis client for queued hosted jobs

### 4. Read Models

Panels should render from stable, derived panel models rather than pulling directly from transport/runtime globals.

This keeps panels portable across:

- live realtime playback
- replayed stored analysis artifacts
- queued hosted results

### 5. Platform Shells

Thin shells around the same core:

- browser shell
- desktop shell
- hosted shell

The shell should supply file access, environment config, and deployment-specific integrations only.

## Immediate Priorities

### P0. Green Baseline

Before any deeper refactor:

- restore passing `npm run build`
- add a CI path for typecheck, lint, and tests
- keep `master` shippable

### P1. Remove Hidden Global Runtime State

Refactor these globals behind explicit session services:

- audio engine singleton
- frame bus singleton
- display mode singleton

The app should support at least one explicit `AppSession` object even if only one is active in v1.

### P2. Separate Core From UI

Move business/runtime logic out of React components:

- ingest orchestration
- transport commands
- playback sync rules
- mode switching

React should mostly bind controls to session commands and subscribe to session state.

### P3. Define Analysis Artifact Format

Create a durable artifact contract for:

- file analysis summary
- waveform peaks
- spectrogram/history snapshots or compressed bins
- pitch/loudness history

This is the bridge between:

- local realtime execution
- desktop persistence/export
- future queued hosted analysis

### P4. Introduce Runtime Validation

Add runtime schemas for:

- score JSON
- transport state
- offline artifact manifests
- queue job payloads

TypeScript alone is not enough once data crosses process or deployment boundaries.

### P5. Move Heavy Work Off The UI Thread

Prepare analysis for workers where useful:

- file-level scans
- artifact generation
- future non-realtime batch analysis

Realtime playback can remain local for now, but background work must become worker-friendly.

## Desktop Path

Desktop packaging should be thin.

- keep the frontend as the main app
- add a lightweight wrapper for windowing, file dialogs, and packaging
- avoid desktop-only business logic in the core

The desktop app should consume the same session core as the browser build.

## Hosted Queue Path

Queued hosting should not try to reuse the live frame bus model as-is.

Instead:

1. upload media
2. create job
3. run analysis offline
4. store artifact bundle
5. let the frontend render from artifact data

This means the local realtime model and the hosted queued model meet at shared contracts, not at shared mutable runtime state.

## Non-Goals Right Now

Do not build these yet:

- auth
- billing
- multi-tenant job orchestration
- distributed workers
- persistent media library
- full cloud architecture

The next step is a clean single-machine core with good seams, not a full SaaS backend.

## Acceptance Bar

We can say the core is ready for expansion when:

- build, lint, and tests are green in CI
- session/runtime state is explicit and not hidden in globals
- UI does not own transport or ingest business logic
- contracts are runtime-validated at boundaries
- local desktop packaging can wrap the app without special forks
- hosted analysis can target an artifact format without rewriting panel logic
