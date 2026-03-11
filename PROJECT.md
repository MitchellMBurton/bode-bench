# Project Definition

## Mission

Build a system that lets one attentive user listen to Bach's cello suites while observing a coherent set of trustworthy interfaces in real time.

The application must feel powerful during local development, be presentable live to another person, produce screenshot-worthy states during normal use, support rigorous testing of panels and visual mappings, and preserve a clean path to future browser deployment.

## Product Identity

This is a scientific listening instrument.

Audio analysis and symbolic score analysis are separate domains. Their fusion — what is happening aligned with what it means — is the core of the product.

## Invariants

These remain true even as implementation evolves.

- The product is a scientific listening instrument.
- The hero is the harmony of interfaces, not a single panel.
- Beauty emerges from precision, composition, and trust in tools.
- Audio and symbolic score are separate domains.
- No decorative mode should exist whose purpose is only to look impressive.
- The default interface is presentation-safe during ordinary use.
- Version 1 is desktop-first and session-based.
- Audio ingest is temporary by default.

## Version 1 Scope

### Included

- Local desktop execution via Tauri.
- Temporary session audio ingest.
- Playback transport with timing readout.
- Levels (peak and RMS).
- Oscilloscope (live waveform).
- Spectrogram (spectral anatomy over time).
- Frequency bands (coarse energy distribution).
- Movement metadata display.
- Symbolic score overlays (one overlay minimum).
- Fixed four-quadrant desktop layout.

### Excluded from v1

- Persistent media library.
- Cloud sync, collaboration, multi-user workflows.
- Mobile-first responsiveness.
- Polished public deployment.
- Performer comparison workflows.
- Advanced helix / DNA rendering.
- Gesture tracking, export pipeline.

## Immediate Milestone

Build a deep single-movement console for **Suite No. 1 Prelude** with all v1 panel types, transport, metadata, and one symbolic overlay.

## Audience

One attentive user at a time — primarily the project creator. The system must also hold up under live demonstration to another viewer without requiring a special mode.

## Change Policy

- Implementation may change if it improves fidelity, clarity, maintainability, portability, or testability.
- UX doctrine changes only if the user explicitly redefines it.
- Data contracts evolve deliberately with migration awareness.
- The mission is stable.
