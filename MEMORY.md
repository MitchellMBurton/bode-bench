# Global Memory

## 2026-05-04

### Accepted Direction — Range Lab Graduates as Track 6, Sequenced Before Track 4

- Real use surfaced a workflow the doctrine had not yet named: *discover-extract-compile* alongside *review-and-export*. Spectrogram-guided range creation, multi-range selection, keep-and-cut compilation export, and similarity-based navigation are the current real workflows.
- Range Lab graduates to `TASKS.md` as Track 6 (v0.3.4), sequenced before Track 4. It rides existing Track 2 / Track 3 substrate and requires no engine split.
- `PROJECT.md` is updated from five to six direction-defining moves; Range Lab is the new #4, between the worker core (#3) and the A-B workspace (#5).
- `ROADMAP.md` adds v0.3.4 as a Range Lab phase under the v0.3 envelope; the dependency chain records that Range Lab informs Track 4 layout sketches before any engine split.
- Keep-and-cut compilation export is doctrine-elevated as a first-class export shape with its own preset and manifest sidecar, not a graft on per-range clip export.
- Range similarity search is the first feature that forces `PROCESSING_POLICY.md`'s suggestion-layer rule to be load-bearing: ranked candidates with named distance metric and visible score, accepted/rejected explicitly, never presented as "matches found."

### Accepted Discipline — Track 3 Minimal Closure

- Track 3 is treated as *closed at minimal viability*: live frame feature analysis is worker-backed, retained-frame contract is in, back-pressure and diagnostics are in. Waveform pyramid, spectrogram history/bins, deeper loudness, and OffscreenCanvas are deferred until concrete usage pressure (Range Lab spectrogram interaction or A-B dual-rendering) earns them.
- Recorded as the operating discipline at ~6–12 focused hours/week: each phase must land as a usable slice; long invisible refactors are dangerous unless they directly unlock the next concrete capability.

### Accepted Strategic Stance — Personal Instrument with Product-Grade Discipline

- The "product or personal instrument" question (previously open in `REFINEMENT.md`) is resolved: personal instrument with product-grade discipline. The first real user is the author; architecture, UX, runtime contracts, installer path, and documentation remain product-grade because the tool should feel serious even while it is personally driven.
- No named external users currently inform design decisions, and the next investment is deeper personal use on real material rather than broad user research. Showing the instrument to one or two outsiders becomes worthwhile once the core workflow feels undeniable to the author. Recorded as the current operating stance, not a permanent answer.
- Distribution-readiness work (code-signed installer, broader user research) is deferred until repeated real use signals that saved sessions and reports are artifacts worth keeping or sharing.
- Doctrine layer is currently strong enough; new doctrine should follow real use, not precede it. The expected refinement to `PROJECT.md` and `UX_PRINCIPLES.md` to acknowledge *discover-extract-compile* as a first-class sibling workflow is deliberately deferred until Track 6 is in the author's hands.

### Layout Direction Narrowed

- The v0.4 layout question is narrowed: leaning toward a unified two-lane A/B timeline with unmistakable audible-monitor chrome. The safe internal-split-of-Session-Console is the weakest of the four candidates.
- Constraint added: paper sketches must land for *both* the A/B surface and the Range Lab surface before any engine split — both surfaces must inform the split, since Range Lab usage is real now and A/B is anticipated.
- Recorded in `REFINEMENT.md` as a narrowed-but-not-settled open question.

### Accepted Doctrine Extension — Processing Policy

- The blanket "AI-assisted intelligent anything" rejection has been narrowed and replaced. ML in the measurement layer remains rejected. ML and FFmpeg processing are permitted in the preprocessing/derived-source layer and in the suggestion layer, governed by the new `PROCESSING_POLICY.md`.
- Derived sources carry explicit provenance (recipe sidecars naming tool/model + version + parameters + timestamp). Reports cite recipes. Session artifacts record them.
- The instrument never silently substitutes a processed source for the original; source-slot lineage is always visible.
- The instrument's identity sharpens to "trustworthy auditor in a world full of probabilistic processors." Local denoise audit, source separation, transcript alignment, and FFmpeg-driven loudness/quality measurements are now in scope as future work.
- A new architectural domain (Source Processing / Derived Sources) is named in `ARCHITECTURE.md` as planned. Currently a v0.5 candidate in `ROADMAP.md`.

### Accepted A-B UX Direction

- Source identity within a single style mode is encoded by position, explicit `A`/`B` badging, and stroke convention (solid vs dashed). Color within a style mode is not repurposed to carry source identity.
- The audible-monitor indicator is load-bearing chrome — its own bordered region, sized larger than telemetry chips, always visible at every viewport width.
- Track 5 (null/diff) covers audio AND video residual analysis. FFmpeg's VMAF / SSIM / PSNR are the natural producers for video-quality curves and reduce the implementation burden of the video residual surface substantially.

### Accepted Layout Discipline

- Primary control labels never truncate. If a label cannot fit at a viewport width, the control changes form (icon + tooltip, or disclosure popover). Only data values may ellipsize.
- Recorded as an Anti-Pattern in `UX_PRINCIPLES.md` and as a Command Availability constraint in `RUNTIME_CONTRACTS.md`.
- The bolder A-B layout alternatives (unified two-lane timeline; single-workbench-with-source-toggle; mode-switching A-B view) remain on the table. The safe internal-split-of-Session-Console proposal is not yet accepted as the path. Layout direction for v0.4 is still an open design question and should be decided via paper sketches against the screenshot rule before Track 4 engine work begins.

### Current Documentation Direction

- New canonical doctrine document: `PROCESSING_POLICY.md`.
- `README.md` document map updated.
- `CLAUDE.md` doctrine pointer updated.
- `FUTURE_PLANS_AND_IDEAS.md` extended with a new "Processing and derived sources" seed category, two new deliverables entries, and two new deep dives (Derived-Source Processing Seam; AI Enhancement Audit Workflow). The blanket AI rejection in "Ideas I'd Skip" reworded to target the measurement layer specifically.
- `ROADMAP.md` Out of Scope line for AI updated to reflect layered policy. Derived-source seam added as a v0.5 candidate.
- `ARCHITECTURE.md` extended with a planned Source Processing / Derived Sources domain.
- `RUNTIME_CONTRACTS.md` extended with a Derived Source Provenance contract and a Command Availability label-truncation constraint.
- `UX_PRINCIPLES.md` extended with a Source Identity section and two new anti-patterns.

### Accepted Meta-Doctrine — Living Doctrine

- The doctrine is explicitly framed as living, not finished. Future contributors (human or AI) are expected to challenge, refine, and rewrite it where evidence or alternative framings warrant.
- New canonical document: `REFINEMENT.md`. Distinguishes load-bearing invariants from current best-thinking decisions, lists currently tracked open questions, names refinement anti-patterns, and includes a direct note to future AI contributors.
- `PROCESSING_POLICY.md` and the new Source Identity section in `UX_PRINCIPLES.md` carry explicit *Refinement note* prefixes flagging them as current direction rather than settled fact.
- `DECISION_RULES.md` gains a "Refining These Rules" section pointing to `REFINEMENT.md`.
- `CLAUDE.md` instructs agent contributors to read `REFINEMENT.md` before refining any doctrine.
- The doctrine grows by addition more than replacement, but rules that no longer earn their keep can be retired with acknowledgment in `MEMORY.md`.
- Currently tracked open questions are listed in `REFINEMENT.md` (v0.4 layout direction, width-tier doctrine, product-vs-instrument framing, derived-source seam timing, test investment timing, browser-vs-desktop parity, CREPE-vs-classical pitch boundary, audible-monitor chrome placement, external user identification).

## 2026-05-03

### Accepted Runtime Hardening

- Track 3 worker-backed live frame analysis remains the active infrastructure path.
- Published analysis frames now have an explicit retained-snapshot contract so async panels can paint safely after worker buffers are recycled internally.
- `FrameBus.publish()` isolates subscriber failures and reports them through diagnostics instead of letting one panel stop the dispatch path.
- Review-session source matching treats conflicting saved/current media keys as a hard mismatch before filename and duration fallback.
- Live Diagnostic chrome keeps `VOL` and `RATE` available under normal desktop resizing; tuning popovers supplement rather than replace primary access.
- `RUNTIME_CONTRACTS.md` is now the contract reference for frame dispatch, worker boundaries, session source matching, export artifacts, and command availability.

### Current Documentation Direction

- `README.md` owns the document map.
- Canonical doctrine remains in `PROJECT.md`, `ARCHITECTURE.md`, `RUNTIME_CONTRACTS.md`, `UX_PRINCIPLES.md`, `POWER_USER_UX.md`, and `DECISION_RULES.md`.
- `TASKS.md` and `HANDOFF.md` own live continuation state.
- `PLAN_NOTES_AND_SESSIONS.md` and `REVIEW_BRIEF.md` are historical references, not current work owners.

## 2026-04-25

### Accepted Baseline

- Current accepted baseline is commit `c3112b9` on `main`.
- The baseline adds shared waveform pyramid ownership, recovered export/source-path storage, explicit app-session teardown, Amber theme coverage, and refreshed tests.
- At that point, the product chrome needed to present the work as an active instrument, not a v0.1 alpha artifact.

## 2026-03-21

### Accepted Baseline

- Previous accepted baseline was commit `da8511e` on `main`.
- The repo is active and no longer described as a frozen alpha handoff.
- The product is now clearly a scientific media instrument for arbitrary local audio and video.

### Current Product Shape

- Left Session Console acts as a session workbench:
  - routing
  - preview
  - transport position
  - clip export
  - diagnostics access
- Right Live Diagnostic quadrant is the primary analytical command surface.
- Desktop clip export is a real workflow with fast and exact master paths.
- Alternate audio and subtitle attachment are part of the intended playback UX.

### Accepted UX Direction

- Controls should live at the highest sensible layer.
- The Session Console should not duplicate the whole app.
- The Live Diagnostic chrome should hold primary transport and review actions.
- The interface should feel denser, calmer, and more clinical over time.

### Known Rough Edge

- Fullscreen short-streamed-media detail waveform behavior is still not fully reliable.
- Treat it as a pragmatic reliability problem, not a reason to destabilize the rest of the product direction.

### Recommended Next Direction

- finish the fullscreen overview hardening
- sharpen export trust and completion affordances
- run a serious screenshot audit across style modes
- reduce build chunk size
- continue retiring stale legacy wording

## 2026-03-15

### Historical Baseline

- Large media now uses a streamed fallback path instead of forcing full in-memory decode.
- Large-media timelines now follow a two-tier model:
  - coarse full-session map
  - zoomed detail window
- Streamed high-quality video pitch was restored through live stretch processing.
- Streamed scrubbing now stays continuous instead of pausing on each movement.

### Historical Notes

- Perf Lab is part of the intended operating experience and should remain available as an expert-facing telemetry surface.
- Public Cloudflare share links are temporary and should not be treated as durable release URLs.

## 2026-03-14

### Historical Direction Change

- The project stopped being defined primarily as a Bach-specific suite console.
- The accepted direction became a general-purpose local media analysis instrument with optional structural overlays.
- Legacy branding remained temporarily in package names, installer names, and sample data.
