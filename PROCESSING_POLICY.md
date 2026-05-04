# Processing Policy

> **Refinement note.** This is current best thinking, not finished doctrine. The three-layer framing is the working model; alternative framings (e.g. provenance-first rather than layer-first) remain possible. See `REFINEMENT.md` for how to challenge anything below.

## Purpose

This document governs when and how the instrument may transform a source between its original form and its analytical presentation. It is the answer to "can the instrument denoise this?", "can it run loudness normalisation?", "can it use a neural pitch tracker?", "can it call FFmpeg's `silencedetect` to suggest ranges?" — questions the rest of the doctrine implies but did not previously address head-on.

The policy is layered. Each layer has a different latitude. The point of the layering is to preserve the trustworthiness claim where it matters (in measurement) while letting the instrument benefit from genuinely useful processing where the user is consenting to it (preprocessing) or proposing it (suggestion).

## The Three Layers

### Measurement Layer

What the panels show as measurement — waveform, spectrogram, loudness curves, pitch readouts, frequency response, oscilloscope, goniometer, level meters, partials.

This layer must remain deterministic, classical, and inspectable. ML or probabilistic estimators are not permitted as the *displayed* measurement. A panel that says "this is -18.4 LUFS" must mean it as a deterministic measurement of the audio it was given.

If a panel can be fed by either a classical or an ML-derived producer, the producer is labeled in the panel chrome and recorded in the session artifact. The user is never confused about whether a measurement is classical or model-derived.

### Preprocessing / Derived Source Layer

What sits between original sources and the measurement layer.

ML and FFmpeg processing tools are permitted at this layer, provided:

- The processing produces a *derived source* with explicit provenance (recipe sidecar naming model/filter, version, parameters, timestamp).
- The derived source is presented as a separate source slot, never silently substituted for the original.
- The session artifact records the recipe so it can be re-run reproducibly.
- Reports cite the recipe alongside any measurements derived from the processed source.

Examples of permitted preprocessing tools:

- FFmpeg's `arnndn` (RNNoise) and `afftdn` for denoising
- FFmpeg's `loudnorm`, `dynaudnorm`, `compand` for loudness operations
- Demucs / Spleeter for source separation
- Whisper.cpp for speech transcription
- CREPE for high-accuracy pitch tracking
- Any locally-runnable ONNX model meeting the efficiency and provenance constraints

The instrument's role in this layer is to be the trustworthy auditor of these tools' outputs, not to conceal that processing happened.

### Suggestion Layer

Affordances that propose work to the user but never act autonomously.

ML and FFmpeg analysis tools are permitted at this layer, provided every suggestion is presented as a candidate the user must explicitly accept. The user's saved state never contains a model-authored decision the user did not consent to.

Examples of permitted suggestion tools:

- FFmpeg's `silencedetect` proposing range candidates at speech pauses
- FFmpeg's `scenedetect` proposing range candidates at video cuts
- Speaker diarization proposing per-speaker ranges
- Beat / onset detection proposing musical ranges
- Whisper transcript word boundaries proposing dialog-edit cut points

Suggestions render distinctly from authored state — typically as ghost ranges, dim chips, or candidate overlays — until the user accepts.

## Provenance Principle

Every derived source carries a recipe sidecar that names every processing step with model/filter, version, parameters, timestamp. The session artifact records it. Reports cite it. Anyone can re-run the recipe on the same original source and reproduce the derived output.

This is the contract that lets the instrument keep its trustworthiness claim while permitting probabilistic preprocessing. The instrument is honest about what each source is.

## Derived-Source UX Vocabulary

Source slots display their lineage. A derived source's slot reads its recipe in compact form. The user can never mistake a processed source for the original. The same anti-fake-certainty doctrine that governs streamed-media timelines extends to source identity.

Concrete shape (subject to refinement at implementation):

```
SOURCE B
DERIVED · arnndn(strength=12)
FROM: interview_raw.wav
```

## Out of Scope

These remain rejected:

- Cloud-hosted ML inference. The local-first invariant holds.
- Models that require server-class hardware. The instrument runs on one user's desktop.
- ML models in the measurement layer that present as "what is" rather than "what was estimated."
- Fully autonomous editing — the instrument never changes saved state without explicit user action.
- Plugin / scripting hooks for arbitrary third-party processing. The vetted-tools list grows deliberately, not by extension surface.

## Identity Implication

The instrument's identity sharpens with this policy in place. It is not "the deterministic instrument that refuses to acknowledge ML exists." It is "the trustworthy auditor in a world full of probabilistic processors." That is a stronger position both for the user and as a market identity.

## Open Questions

These are explicitly unresolved and deserve engagement rather than working-around.

- **The CREPE-style boundary case.** When a panel can be fed by either a classical estimator or an ML-derived producer, is the rendered output "ML in the measurement layer" (rejected) or "a measurement panel honestly labeling its producer" (permitted)? Current docs say the latter; the boundary deserves stress-testing against real cases.
- **Recipe sidecar schema granularity.** How much detail is enough? Tool + version + parameters is the minimum. Whether to also record library versions, hardware, random seeds (for stochastic models), or upstream environmental state is unresolved and should be answered by real reproducibility cases.
- **Vetted-tools registry governance.** How tools enter the registry, how they age out, who approves a new entry. Currently informal; will need a process before the registry has more than a handful of entries.
- **Suggestion-layer audit trail.** Whether suggestions the user dismissed should be recorded (for "the model proposed X here, the user rejected it") or whether only accepted suggestions enter the artifact. Both have honest arguments.
- **Confidence display.** Many ML producers expose a confidence score. Whether and how the instrument should surface this without falling into "fake certainty about uncertainty" is unresolved.

## Where This Sits

`PROJECT.md` defines the product. `UX_PRINCIPLES.md` defines how it feels. `ARCHITECTURE.md` defines its seams. `RUNTIME_CONTRACTS.md` defines its runtime invariants. This document defines what the instrument is allowed to do *to* a source between ingest and analysis. It is the policy referenced whenever a future feature proposes ML or heavy preprocessing. `REFINEMENT.md` governs how this document itself evolves.
