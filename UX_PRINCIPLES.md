# UX Principles

## Core Position

The interface is scientific first. Beauty emerges from measurement fidelity, disciplined composition, stable typography, coherent motion, and trust in instruments. The user should feel they are operating a serious analysis console for living signal structure.

## Hero Principle

The hero is the harmony of interfaces.

Waveform, spectrogram, levels, pitch, loudness, response, metadata, diagnostics, and optional overlays should reinforce one another. No panel is ornamental.

## Measurement-First Rule

Always prefer accurate scales, defensible smoothing, stable timing, explicit labeling, and disciplined layout over vague dramatic presentation. If a design choice improves appearance but weakens interpretability, reject it.

## Screenshot Rule

Every normal operating state must be capable of producing a strong screenshot:

- balanced panel proportions
- stable typographic hierarchy
- no throwaway debug styling in the main layout
- graph surfaces that look complete during active playback
- negative space used deliberately
- visible telemetry that enhances credibility rather than cluttering the frame

## Presentation Rule

The default layout is already authoritative. No separate presentation skin. Transitions should feel stable and deliberate. Controls should remain understandable under observation.

## Layout

The current four-quadrant desktop interface remains the baseline, with transport and context on the left and the denser analysis surfaces on the right.

## Timeline Doctrine

The top timeline system must separate whole-session navigation from local inspection.

- The session map may be coarse on streamed large media, but it must always feel honest and useful.
- The detail window is where focused waveform reading, looping, and precise scrubbing happen.
- Zoom and loop controls should be explicit, compact, and readable at a glance.
- A streamed large-media timeline must not pretend to have decoded certainty it does not actually possess.
- Coarse learned regions and high-confidence played/decoded regions should be visually related, but not indistinguishable.

## Overlays

Structural overlays may add meaning, segmentation, or annotation. They must never reduce clarity of the diagnostic layer beneath.

## Anti-Patterns

- glossy media-player styling
- nightclub visualizer aesthetics
- giant decorative upload zones
- gimmick animations without measurement purpose
- hidden scales or ambiguous surfaces
- fake drama added to compensate for weak composition
