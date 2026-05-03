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

## Anti-Patterns

- consumer media-player chrome
- decorative upload drama
- glossy visualizer aesthetics
- unclear hierarchy
- control duplication without purpose
- fake certainty in streamed views
