# Decision Rules

## Purpose

How to choose between valid alternatives. For both human and AI contributors.

## Decision Hierarchy

When layers conflict, higher layers win:

1. Product truth (what the product is).
2. UX truth (how it feels and reads).
3. Data contracts (typed boundaries between domains).
4. Architecture boundaries (domain separation).
5. Implementation choices (specific tools and code).

Lower layers may change freely without violating the project if higher layers are preserved.

## Primary Preferences

1. Truth over spectacle.
2. Explicit typed contracts over implicit behaviour.
3. Interface harmony over isolated panel optimisation.
4. Measurement credibility over visual drama.
5. Replaceable implementations over rigid lock-in.
6. Local power now without sacrificing web portability later.
7. Explicit state over hidden side effects.
8. Modularity over convenience-driven entanglement.
9. Screenshot-safe composition over temporary debug shortcuts.
10. Session simplicity over premature asset management.

## UX Preferences

- Readable motion over dramatic motion.
- Stable layouts over visually restless layouts.
- Concise telemetry over decorative labels.
- Strong defaults over mode proliferation.
- One credible interface over "debug mode vs pretty mode."

## Architecture Preferences

- Clean domain separation.
- Preprocessing outside the UI runtime.
- Typed boundaries.
- Thin desktop integration surfaces.
- Replaceable tools behind stable abstractions.

## Data Preferences

- Versioned schemas.
- Explicit units (seconds, Hz, dB, normalised 0–1).
- Required vs optional field clarity.
- Reproducible caches.
- Stable naming conventions.

## Reject

- Leaking desktop-specific logic throughout the UI.
- Mixing ingest, rendering, and analysis in one component.
- Shape guessing or silent field fallbacks.
- Mixing seconds and beats without explicit mapping.
- Encoding theme or view concerns inside musical data.
- Arbitrary ornament or consumer-media-app tropes.

## Tooling

Current tools are recommended baselines. Replace any tool if the replacement preserves invariants, improves real outcomes, reduces unnecessary complexity, and keeps the system understandable.

## Final Rule

If a change increases flash but decreases trust, reject it.
If a change increases power while preserving clarity, accept it.

## Refining These Rules

The rules above are current best thinking, not eternal truths. They are written to be challenged by future contributors — human or AI — when evidence, alternative framings, or new capabilities make them wrong, insufficient, or outdated. See `REFINEMENT.md` for how to challenge a rule, propose a new one, or retire one that no longer serves the product.

The doctrine grows by addition more than by replacement. But it is permitted to retire any rule on this page that no longer earns its keep. A retired rule should be acknowledged in `MEMORY.md`, not silently deleted.
