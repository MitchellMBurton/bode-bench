# Project Definition

## Mission

Build a system that lets one attentive user inspect arbitrary local audio or video through a coherent set of trustworthy interfaces in real time.

The application must feel powerful during local development, hold up under live demonstration, produce screenshot-worthy states during ordinary use, support rigorous testing of panel behavior and transport workflows, and preserve a clean browser path alongside the desktop shell.

## Product Identity

This is a scientific listening instrument and media analysis console.

The core is not a single file type or a single repertoire. The core is disciplined alignment between transport, diagnostics, and interpretation surfaces.

## Invariants

- The product is a scientific listening instrument.
- The hero is the harmony of interfaces, not a single panel.
- Beauty emerges from precision, composition, and trust in tools.
- Signal analysis and optional structural annotation are separate domains.
- No decorative mode should exist only to look impressive.
- The default interface is presentation-safe during ordinary use.
- Version 1 is desktop-first and session-based.
- Media ingest is temporary by default.
- General-purpose media workflows take priority over repertoire-specific assumptions.

## Version 1 Scope

### Included

- Local desktop execution via Tauri
- Browser parity for the shared frontend
- Temporary session audio and video ingest
- Playback transport with timing readout, loop, and scrub
- Windowed, theater, and in-app full-screen video presentation
- Diagnostics log for review and support
- Levels, waveform, pitch, oscilloscope, loudness, response, and spectrogram surfaces
- Optional structural overlays when a project provides them
- Four-quadrant desktop layout with persistent resize behavior

### Excluded from v1

- Persistent media library
- Cloud sync, collaboration, or multi-user workflows
- Mobile-first responsiveness
- Full hosted deployment strategy
- Automated export / report pipeline
- Deep workspace preset system
- Advanced comparison tooling beyond current session review

## Immediate Milestone

Stabilize a robust single-session console for arbitrary local audio/video review, with optional aligned annotation workflows and presentation-safe desktop behavior.

## Audience

One attentive user at a time, primarily the project creator, with enough polish for live demonstration to another viewer without requiring a separate presentation mode.

## Change Policy

- Implementation may change if it improves fidelity, clarity, maintainability, portability, or testability.
- UX doctrine changes only if the user explicitly redefines it.
- Data contracts evolve deliberately with migration awareness.
- Legacy Bach-specific assets may remain temporarily, but they do not define the long-term product mission.
- The mission is stable.
