# UX Principles

## Core Position

The interface is scientific first.

Beauty should emerge from:

- measurement fidelity
- disciplined composition
- stable typography
- explicit scales
- trustworthy controls

The user should feel they are operating a serious media instrument, not a polished toy.

## Hero Principle

The hero is the harmony of interfaces.

No single panel is the product. The product is the way waveform, pitch, loudness, response, preview, diagnostics, transport, and export reinforce one another.

## Clinical Density Rule

Density is acceptable when it is structured.

The UI should feel:

- compact
- intentional
- repeatable
- easy to scan

It should never feel random, fluffy, or card-heavy without reason.

## Command Strata

Controls should live in the highest layer that makes sense.

- Global chrome: runtime, layout, style
- Live Diagnostic chrome: transport, review, tuning
- Session Console: routing, preview, local session work
- Panels: display and direct manipulation only when panel-local

If a command can live one layer higher without becoming confusing, it usually should.

## Command Availability

High-frequency controls must stay reachable under normal desktop resizing.

- Primary transport and review controls belong in the Live Diagnostic command surface.
- `VOL` and `RATE` are primary playback tuning controls; they should remain visible or immediately reachable in the command surface.
- Popovers may add depth, but they should not become the only access path for routine tuning.
- Responsive wrapping is preferable to hiding key options.

## Session Console Rule

The left pane is a workbench, not a second dashboard.

It should prioritize:

- media routing
- preview
- position awareness
- export staging
- diagnostics access

It should not carry redundant versions of the same primary controls unless locality clearly justifies them.

## Timeline Doctrine

The timeline system must separate whole-session navigation from local inspection.

- Session map may be coarse for streamed media.
- Detail window is where focused waveform reading happens.
- Review actions must be explicit and compact.
- Streamed large-media timelines must never pretend to have decoded certainty they do not have.

## Screenshot Rule

Every normal operating state must be capable of producing a strong screenshot:

- balanced panel proportions
- stable typographic hierarchy
- complete-looking graph surfaces
- useful telemetry
- controlled negative space

## Typography

Typography should read like instrumentation, not marketing.

- category labels stay subdued
- operational labels stay crisp
- numbers must be legible first
- long strings must truncate cleanly
- wrapped titles should be intentional, not accidental

## Source Identity

> **Refinement note.** The current direction below is current best thinking, settled enough to design against but not so settled that bolder layout proposals (unified two-lane timeline, mode-switching A-B view) should be ruled out. See `REFINEMENT.md` for the open layout questions.

When two sources are present (A-B comparison work), source identity is currently encoded by:

- **Position** — A above, B below in any dual-rendered surface; never mixed.
- **Explicit badging** — every source-specific readout, chip, and panel header carries an `A` or `B` mark in the same rhythm the existing `R1` / `R2` range badges use.
- **Stroke or fill convention** — solid for A, dashed for B (or filled vs outlined) in overlay surfaces.

Source identity is **not** encoded by repurposing the visual style modes. The user runs the instrument in one style mode at a time; A and B coexist within that single palette. Color within a style mode is reserved for state (saved range, active range, audible source highlight), not for source identity.

The audible-source indicator is load-bearing chrome, not an inline panel hint. When two sources are present, it is its own bordered region in the global chrome — sized larger than telemetry chips, always visible at every viewport width — and tells the user unambiguously whether they are hearing A, B, or the residual. The specific placement and visual treatment depends on the v0.4 layout direction, which remains a tracked open question.

Source-slot lineage is always visible. A derived source (per `PROCESSING_POLICY.md`) reads its recipe in compact form so the user can never mistake a processed source for the original.

## Anti-Patterns

- consumer media-player chrome
- decorative upload drama
- glossy visualizer aesthetics
- unclear hierarchy
- control duplication without purpose
- fake certainty in streamed views
- truncated primary control labels (only data values may ellipsize)
- color used to encode source identity within a single style mode
