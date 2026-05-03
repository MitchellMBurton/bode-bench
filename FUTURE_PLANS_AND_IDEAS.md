# Future Plans and Ideas

## Purpose

A working surface for thinking about where this product goes next. Not a roadmap. Ideas land here at varying levels of conviction; the canonical work order remains in `TASKS.md` and the operational continuation in `HANDOFF.md`.

This file is allowed to be opinionated. It is not allowed to drift the product identity. Every idea below is filtered against `PROJECT.md`, `UX_PRINCIPLES.md`, and `DECISION_RULES.md`.

## How To Read This

Three sections:

- **Seed Categories** — broad areas where the product could grow without leaving its identity. One-line entries; the goal is recognition, not commitment.
- **Deep Dives** — ideas that remain genuinely interesting and worth exploring further. These are framed with a why, a sketch, and dependencies.
- **Ideas I'd Skip** — proposals that look attractive but would push the product in a direction the doctrine already rejects.

## Seed Categories

### Analytical depth

- Differential analysis — sample-aligned A/B null test for masters, codec comparison, effect-chain audit
- Reference comparison workspace — load two sources, time-align, switch or overlay panels
- Spectrogram peak-hold and delta — pin a moment, compare a later one
- Measurement cursor depth — interval, semitone, dB delta, frequency ratio
- Per-band loudness target overlays beyond LUFS (dialog gate, music wall, transient peak tolerance)

### Review trustworthiness

- Notes attached to saved ranges
- Reproducible review session artifact (load, see the same ranges, markers, notes, layout)
- Exportable review report (markdown or PDF) summarizing the session
- Per-range tuning (`VOL`/`RATE`/`PITCH` snapshotted with the range, baked at export)
- Compare-mode for ranges (diff two saved ranges from the same file)

### Performance and architecture

- Worker-based analysis core (CORE_HARDENING P5)
- OffscreenCanvas for the heavy panels (spectrogram, waveform overview)
- Frame clock decoupled from main-thread RAF (makes focus state irrelevant by construction)
- Artifact format for analysis runs (CORE_HARDENING P3)
- Runtime schema validation at boundaries (CORE_HARDENING P4)

### Surface refinement

- Hover-scrub thumbnail in the coarse session map
- Within-column panel reorder (Phase 5 from prior layout work)
- Canvas history externalisation (Phase 2)
- Workspace presets — named bundles of layout + style + routing + panel settings
- "Analytical" style mode that strips all decoration even further (the `ANALYSIS` button in the chrome already hints at this)

### Export expansion

- Spectrogram-as-PNG export with axes and brightness scale
- Loudness-summary export (text or JSON) for delivery specs
- Batch export of multiple saved ranges as a single workflow

### Distribution and trust

- Code-signed Windows installer
- Auto-update channel for the desktop build
- Crash report / diagnostics bundle that the user can attach to a support ticket

## Deep Dives

### 1. Reference / A-B Comparison Workspace

**Why this excites me.** The product's identity sentence is "a scientific listening instrument." The single biggest analytical task that is currently impossible — and that mastering engineers, dialogue editors, and acoustic researchers do every day — is comparing two sources side by side. Reference vs. master, codec A vs. codec B, mic position 1 vs. mic position 2, take 5 vs. take 7. Today the workflow is "open one, listen, close, open the other, try to remember." A real instrument should answer this directly.

**Sketch.** A second source slot in the Session Console. The user loads source B alongside source A and assigns a time offset (manual, or auto-aligned by cross-correlation peak — that is a real DSP feature that fits the product's identity). Transport remains unified: play/pause/seek apply to both timelines simultaneously. A new chrome control swaps audible monitor between A and B (or null = A−B), with a fast hotkey.

Panels can opt in to dual rendering: the waveform overview shows A and B layered, the spectrogram offers a split or diff mode, the loudness panel shows two LUFS readouts. Panels that can't meaningfully dual-render stay single-source and follow the audible monitor.

**Dependencies.** Touches `audio/engine.ts` heavily (dual playback graph, locked transport). Likely waits behind the engine split that's already in the conversation about CORE_HARDENING. That dependency is also the reason this idea is interesting — it's the kind of feature that justifies the refactor, not just rides on top of it.

**Risk.** The UI for "which source am I monitoring right now?" must be unmistakable at all times. Done badly, this confuses every user every session. Done well, it becomes the feature that defines what the product is for.

### 2. Reproducible Review Session Artifact

**Why this excites me.** It is the cleanest bridge between the product's current shape and its future. Today a "session" is implicit — you open a file, you make ranges, you tune, and when you close, all of that disappears. Externalising the session to a saved artifact (`.session.json`-ish, with the source file referenced by path or hash) does three things at once:

- Makes review work resumable, which is the most-requested feature any review tool gets
- Forces the analysis-artifact format that CORE_HARDENING P3 has been waiting on, with a real consumer driving the design
- Creates the substrate for everything else in this doc — comparison sessions, exported reports, batch operations, scripted analyses

**Sketch.** A session captures: source media identity (path + size + hash + duration), saved ranges with names and notes, markers, current layout and split ratios, current style mode, current analysis config, current tuning. It does not capture: live transport state, panel render state, anything ephemeral.

Save and load are file menu operations. Loading verifies the source file is reachable (otherwise prompts to relink, mirroring the existing source-relink behavior in export). The format is versioned from day one with a migration seam.

**Dependencies.** Needs the runtime validation work in CORE_HARDENING P4 to be honest about loading sessions written by a future build. Otherwise additive — every other feature in this file gets cleaner once sessions exist.

**Risk.** Easy to over-design the schema before knowing what consumers want. The right move is to define the smallest version-1 schema that captures the current observable workspace, and let the schema grow under real usage.

### 3. Differential Analysis (Null Test)

**Why this excites me.** This is the single feature most aligned with the product's stated identity that no current panel actually delivers. A null test — sample-aligned subtraction of A from B, with the residual exposed as audio plus visualised on every analysis surface — is the most rigorous A/B test possible. It is the kind of capability that distinguishes "media app with graphs" from "scientific instrument."

**Sketch.** Builds on the comparison workspace idea. With A and B time-aligned, the audible monitor gains a third option: `A`, `B`, `A−B`. The residual signal is what's left after perfect cancellation. For a lossless duplicate the residual is silence; for an MP3 vs. WAV it is the codec's loss; for a dialog edit vs. its original it is the artifact noise. The waveform, spectrogram, and loudness panels all visualise the residual in residual-mode — a lossless source pair produces a flat black spectrogram, which is itself a strong screenshot.

**Dependencies.** A/B workspace from #1, plus careful attention to gain matching and time alignment (sub-sample alignment matters here — a one-sample offset destroys the null). The DSP is small; the discipline is in making the pre-conditions trustworthy and visible.

**Risk.** Easy to mis-implement and produce "nulls" that are actually misalignment artifacts. The product's "honest about uncertainty" doctrine applies hard here — the UI must show alignment confidence and gain match before claiming a null result is meaningful.

### 4. Worker-based Analysis Core

**Why this excites me.** Boring infrastructurally, but it is the move that pays off in five different directions at once. It fixes the focus-throttle problem at the architecture level rather than the symptom level (the `rafGuard` change just dropped). It opens the door to OffscreenCanvas. It satisfies CORE_HARDENING P5. It de-risks any future hosted/queued path. And it lets the main thread stay responsive during heavy spectrogram redraws or large-file overview generation.

**Sketch.** A dedicated Web Worker owns the analysis loop and a steady-cadence frame clock. Audio decode and playback stay on main thread (Web Audio is main-thread); analysis frames are computed in the worker and posted back as transferable buffers. Panels render on RAF as today, but the data they render is produced at a cadence that does not depend on main-thread responsiveness or window focus.

**Dependencies.** None hard. Every panel currently subscribes to the frame bus, so the migration is "swap the producer" rather than "rewrite consumers." Analysis-config propagation already exists.

**Risk.** Subtle issues around buffer transfer ownership and back-pressure. Solvable, but needs care.

### 5. Notes-on-Ranges + Session Report Export

**Why this excites me.** It is small. It is achievable in a single focused work session. And it converts the existing review-ranges feature from a navigation aid into an artifact a reviewer can hand to someone else. The doctrine already calls export a "real product workflow" — extending that workflow to include the analytical context (not just the audio clip) closes a real loop.

**Sketch.** Each saved range gains an optional one-line note. The Session Console gains a "Generate Report" action that produces a markdown file: source metadata, list of ranges with timestamps and notes, optional embedded screenshots from each panel, summary loudness. The desktop build writes it; the browser build offers a download.

**Dependencies.** None real. Lives entirely inside the existing derivedMedia + export domains.

**Risk.** Minimal. Worst case: the report doesn't get used and stays as an opt-in feature. Best case: it becomes the single most-cited reason mastering reviewers and dialog editors choose this tool.

## Ideas I'd Skip

These look attractive but would pull the product in directions the doctrine already rejects.

- **Persistent media library.** Explicitly out of scope per `PROJECT.md`. Sessions are the right abstraction; a library isn't.
- **Cloud sync of sessions.** Tempting once sessions exist. Tempting and wrong — the local-first invariant is load-bearing.
- **Real-time collaborative review.** Scope creep into a different product.
- **Plugin / scripting hooks.** Interesting in theory, but a maintenance burden that locks public surface area before the internals are stable.
- **AI-assisted "intelligent" anything.** The product's quality is "trustworthy and inspectable." Probabilistic helpers in an analysis instrument undermine both.
- **Mobile-first redesign.** Out of scope and orthogonal to the workflow.
- **Hotkey customization UI.** Power-user catnip, but tiny payoff. Defer until hotkeys are stable enough that customization actually matters.

## Out Of Scope Reaffirmed

The lines drawn in `PROJECT.md` still hold. This doc is permitted to reach toward analytical depth, comparison, reproducibility, and trustworthy export — it is not permitted to migrate the product toward consumer media playback, cloud platform, or library tooling. If a future idea requires crossing one of those lines to be useful, the right answer is usually that it belongs in a different product.

## How Ideas Graduate

An idea on this page becomes real when:

1. It earns a place in `TASKS.md` with a definite scope
2. It identifies its dependencies honestly
3. It clears the "does this make the instrument feel more exact?" question, not just "does this add a feature?"

Until then it lives here, where it is allowed to be wrong and allowed to be revised.
