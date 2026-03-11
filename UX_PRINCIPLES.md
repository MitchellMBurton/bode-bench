# UX Principles

## Core Position

The interface is scientific first. Beauty emerges from measurement fidelity, disciplined composition, stable typography, coherent motion, and trust in instruments. The user should feel they are operating a serious analysis console for living musical structure.

## Hero Principle

The hero is the harmony of interfaces.

Waveform, spectrogram, levels, frequency bands, metadata, and symbolic overlays reinforce one another. No panel is ornamental. The UI earns trust through cross-confirmation between measurement surfaces.

## Measurement-First Rule

Always prefer accurate scales, defensible smoothing, stable timing, explicit labelling, and disciplined layout over vague dramatic presentation. If a design choice improves appearance but weakens interpretability, reject it.

## Screenshot Rule

Every normal operating state must be capable of producing a strong screenshot:

- Balanced panel proportions.
- Stable typographic hierarchy.
- No throwaway debug styling in the main layout.
- Graph surfaces that look complete during active playback.
- Negative space used deliberately.
- Visible telemetry that enhances credibility rather than cluttering the frame.

The interface functions as both serious analysis software and wallpaper-grade visual material.

## Presentation Rule

The default layout is already authoritative. No separate presentation skin. Transitions feel stable and deliberate. Controls are understandable under observation.

## Layout

Fixed four-quadrant desktop interface:

- **Top left:** Transport, ingest, metadata, controls. Establishes authority and context.
- **Top right:** Oscilloscope. Live waveform — contour, symmetry, transients, stability. Monitor-like, not decorative.
- **Bottom right:** Spectrogram. Spectral anatomy over time — texture, harmonics, noise, energy movement. Aligns vertically with oscilloscope.
- **Bottom left:** Levels and frequency bands. Immediate amplitude reference and coarse energy distribution.

The combined right-hand region (oscilloscope + spectrogram) is the analytical heart.

## Symbolic Overlays

Add structure, segmentation, and musical meaning. Never reduce clarity of the diagnostic layer beneath.

## Motion

Disciplined, legible, instrument-like, causally grounded. Smoothing improves readability without falsifying behaviour. No arbitrary, ornamental, or music-visualiser-coded motion.

## Typography

Technical, severe, quiet, credible. Establishes hierarchy, not decoration. Labels are concise and informative.

## Colour

Restrained palette. Colour separates layers, indicates state, supports readability, creates hierarchy. Not spectacle. The system must remain strong in near-monochrome.

## Ingest Experience

Loading a signal into an instrument — not uploading content to a consumer app. Compact, deliberate, displays essential metadata after load.

## Visual Influence

Evangelion-adjacent severity is an acceptable influence. Imitation is not. The goal is compositional discipline, tactical seriousness, instrument authority, and high-consequence presentation.

## Evaluation Criteria

A UI change is good if it improves interpretability, preserves screenshot quality, strengthens cross-panel coherence, reduces clutter without removing meaning, or makes the system feel more trustworthy.

A UI change is bad if it adds drama without information, weakens scale legibility, makes panels feel detached, increases clutter, or introduces consumer-app visual language.

## Anti-Patterns

- Glossy media-player styling.
- Nightclub visualiser aesthetics.
- Giant decorative upload zones.
- Debug layouts in the main screen.
- Gimmick animations without measurement purpose.
- Hidden scales or ambiguous measurement surfaces.
- Fake drama added to compensate for weak composition.

## What May Evolve

Typography family, colour details, line weights, smoothing constants, layout refinements, panel chrome, animation implementation, exact overlay treatments — all may change if the principles above are preserved.
