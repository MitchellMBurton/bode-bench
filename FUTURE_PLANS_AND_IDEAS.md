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
- Range similarity search — pick a reference range, surface ranked candidate visually/spectrally similar regions on the same source (graduated to Track 6)
- Spectrogram-driven range creation — commit ranges from the spectrogram surface, not just the timeline (graduated to Track 6)
- Measurement cursor depth — interval, semitone, dB delta, frequency ratio
- Per-band loudness target overlays beyond LUFS (dialog gate, music wall, transient peak tolerance)
- Monitor / room calibration mode with a stored reference response curve
- Single-source differential — loop A vs loop B from the same file (residual visualisation without two-source A-B)
- Stereo image depth — M/S decode, correlation history, stereo-width measurement

### Review trustworthiness

- Notes attached to saved ranges
- Reproducible review session artifact (load, see the same ranges, markers, notes, layout)
- Exportable review report (markdown or PDF) summarizing the session
- Per-range tuning (`VOL`/`RATE`/`PITCH` snapshotted with the range, baked at export)
- Compare-mode for ranges (diff two saved ranges from the same file)
- Lab-notebook mode — chronological log of session activity (ranges created, tuning changed, diagnostics observed)
- Cross-session comparison — two reviewers' findings on the same file, or before/after a master revision
- Scripted playback program — a sequence of ranges with notes presented as a guided listening tour
- Static A-B — open two `.review-session.json` files side by side as a comparative report (intermediate before live A-B)

### Performance and architecture

- Worker-based analysis core (CORE_HARDENING P5)
- OffscreenCanvas for the heavy panels (spectrogram, waveform overview)
- Frame clock decoupled from main-thread RAF (makes focus state irrelevant by construction)
- Artifact format for analysis runs (CORE_HARDENING P3)
- Runtime schema validation at boundaries (CORE_HARDENING P4)
- Deliberate browser-path decision before Track 4 — commit to read-only viewer for sessions/reports vs maintain full parity
- Local headless session runner — runs a session against a media file and writes a report; rejects hosted queue, enables QA pipelines
- Automated screenshot regression harness across the visual style modes

### Surface refinement

- Hover-scrub thumbnail in the coarse session map
- Within-column panel reorder (Phase 5 from prior layout work)
- Canvas history externalisation (Phase 2)
- Workspace presets — named bundles of layout + style + routing + panel settings
- "Analytical" style mode that strips all decoration even further (the `ANALYSIS` button in the chrome already hints at this)
- Documented, stable hotkey vocabulary (no customization — discoverability and stability are the value)
- Second-monitor mode — controls and Session Console on one display, analytical quadrant fullscreen on the other
- Subtitle / transcript alignment overlay — WebVTT cues rendered over waveform for dialog editing

### Export expansion

- Spectrogram-as-PNG export with axes and brightness scale
- Loudness-summary export (text or JSON) for delivery specs
- Batch export of multiple saved ranges as a single workflow
- Keep-and-cut compilation export — single render, multiple kept segments, one output file with its own preset and manifest sidecar (graduated to Track 6)
- ffmpeg analysis filter integration — `silencedetect`, `astats`, `ebur128` measurement pass, scene-change detection — wrapped in the same trustworthy-output doctrine

### Distribution and trust

- Code-signed Windows installer
- Auto-update channel for the desktop build
- Crash report / diagnostics bundle that the user can attach to a support ticket
- Doctrine as a separable open-source artifact — the discipline of `RUNTIME_CONTRACTS.md` + `DECISION_RULES.md` + `UX_PRINCIPLES.md` released as a standalone essay or repo

### Deliverables and reports

- Loudness compliance reports against named delivery specs (EBU R128, Apple Music, Spotify, ATSC A/85, theatrical -27 LKFS)
- Publication-quality figure export — SVG with calibrated axes, scale bars, color modes, and a sidecar JSON describing the data behind the figure
- Test-plan session sub-genre — session with `media: null` plus assertion thresholds, runnable against incoming files
- Diagnostics bundle as a first-class deliverable — media-health report covering stalls, sync drift, decoder pressure, recovery events
- Per-source analysis presets — curated panel/analysis defaults per workflow (music, dialog, SFX, measurement signal)
- AI Enhancement Audit Report — original vs processed, residual measurements, recipe citation
- Video Quality Comparison Report — VMAF / SSIM / PSNR over time, paired with audio loudness report

### Processing and derived sources

Governed by `PROCESSING_POLICY.md`. All entries assume local execution, explicit provenance, and source-slot lineage.

- FFmpeg `arnndn` (RNNoise) and `afftdn` integration — local denoise + audit workflow
- FFmpeg `loudnorm` measurement-only preview, optional apply to derived source
- FFmpeg `dynaudnorm` / `compand` for deterministic dynamics processing
- Demucs / Spleeter source separation as analytical primitive (per-stem analysis)
- Whisper.cpp transcript alignment over waveform (also feeds subtitle overlay)
- CREPE as alternate pitch producer for the existing PITCH panel
- FFmpeg `silencedetect` / `scenedetect` as suggestion-layer range candidate proposers
- Speaker diarization as suggestion-layer range candidate proposer
- VMAF / SSIM / PSNR via FFmpeg as native video-quality producers for the Track 5 video residual surface
- Recipe sidecar schema and source-slot lineage UX
- Tauri-side processing job runner with cancellation and progress

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

### 6. Deliverables-First Product Surface

**Why this excites me.** Looking across the rest of this document, almost every idea worth pursuing shares a property: the existing runtime already half-supports it; what's missing is the *deliverable framing* — a report, a figure, a compliance statement, a test plan, a slideshow. v0.2 and v0.3 built the runtime that produces trustworthy data. The next unlock probably isn't another panel or another DSP feature; it's a small set of deliverables the runtime knows how to render. Scientific instruments are valued for two things — trustworthy measurement and trustworthy outputs. The first is well-handled. The second has more headroom than the roadmap currently shows.

**Sketch.** Treat "deliverable" as a domain peer to "panel" and "session." Each deliverable type — markdown report, PDF figure pack, loudness compliance statement, test-plan run report, diagnostics bundle — has a versioned schema, an explicit unit set, and a writer that can run from either the live UI or (eventually) the headless batch runner. The Session Console gains a Deliverables strip parallel to the existing Clip Export strip.

**Dependencies.** Builds on the report machinery already shipped in Track 1. The shape of each deliverable is independent of the others; they can land in any order.

**Risk.** Scope creep into "everything is a deliverable." The discipline is to ship the smallest version-1 of each one and let real use refine the schema, the same way Track 2 handled session artifacts.

### 7. Calibration Mode (Monitor and Room Response)

**Why this excites me.** This is the missing DSP feature that would deepen the "scientific instrument" identity more than any other available move. Measure your monitor or room with a sweep and a calibration mic, store the response curve as a reference, render any source's frequency response *against* that reference. Small DSP, on-doctrine ("measurement credibility over visual drama"), and it lands the product squarely in the niche it's already reaching toward — mastering engineers, AV calibrators, acoustic researchers.

**Sketch.** A new measurement mode in the Session Console that plays a calibration sweep through the audio output and records simultaneously through a configured input. Compute impulse response and frequency response. Store as a reference curve in a new artifact type (`.calibration.json`). The Frequency Response panel gains an opt-in "render against reference" mode that subtracts the stored curve.

**Dependencies.** The audio input path doesn't exist yet — this adds a small new domain to the engine. Tauri seam needs an input device picker. Otherwise self-contained.

**Risk.** Calibration done badly is misleading. The doctrine of "honest about uncertainty" applies hard — sweep length, mic position, ambient noise, and reference confidence all need to be visible alongside the curve.

### 8. Loudness Compliance Reports Against Named Delivery Specs

**Why this excites me.** Broadcast and streaming work has to hit named loudness targets every day — EBU R128 (-23 LUFS), Apple Music (-16), Spotify (-14), CALM Act, ATSC A/85, theatrical -27 LKFS. A report that says "this asset measured -22.7 integrated, -1.2 dBTP, complies with R128" is a deliverable that gets emailed every day in audio post. The product already has loudness measurement; turning it into a *named compliance check* is a small move with disproportionate reach into a real audience.

**Sketch.** A registry of named compliance specs with thresholds (integrated LUFS, true peak ceiling, optional momentary/short-term constraints). The Session Console gains a "Compliance" check that runs against a chosen spec and produces a small markdown or PDF report with pass/fail per metric, the source identity, the underlying measurements, and the spec version used.

**Dependencies.** Loudness measurement already exists. Slots cleanly into the deliverable surface from #6, but can also stand alone as a one-off reporter.

**Risk.** Spec drift — these targets occasionally change. Versioning the spec registry and showing the spec version in the report keeps the artifact honest over time.

### 9. Local Batch Mode and Test-Plan Sessions

**Why this excites me.** The doctrine correctly rejects "hosted analysis queue." It does *not* have to reject *local* batch. A headless driver that reads a session artifact, runs it against an incoming media file, and writes a report is on-doctrine: single user, local-first, no cloud, no queue. It is also the single feature that would let this product enter audio QA pipelines — broadcast ingest, podcast post, game audio masters — at a fidelity nobody else really serves.

**Sketch.** Two things working together. First, a "test plan" session sub-genre — a session with `media: null` plus assertion thresholds (loudness within X, true peak below Y, no silence longer than Z, optional spectral checks). Second, a small CLI driver that consumes a test-plan session and a media file path, runs the analysis through the existing engine, and writes a report sidecar. Same code path as the live runtime, just headless.

**Dependencies.** Needs Track 3 worker headroom (so analysis can run without UI). Needs the v2 session schema's `media: null` template support deferred from Track 2. Slots into the deliverable surface from #6.

**Risk.** Drift toward "headless service." The discipline is to keep the CLI boring and single-purpose: one session, one file, one report, exit. No daemon, no queue, no orchestration. Pipeline integration is the *user's* job; the CLI is the brick they build with.

### 10. Lab-Notebook Mode

**Why this excites me.** Range notes already capture *what* you noticed at a moment. A lab notebook captures *what you did during the listening pass* — every saved range, every tuning change at a timestamp, every diagnostic event near a noted moment, written chronologically. It is the cheapest possible feature that earns the word "scientific" in a way the user actually feels. For teaching, for handoff, for self-review weeks later, the temporal record matters as much as the spatial one.

**Sketch.** A new section in the session artifact: a chronological event log with a stable schema (timestamp in session-clock seconds, wall-clock ISO time, event kind, event payload). The diagnostics drawer gains a "Notebook" tab that renders the log against the timeline. Report generation gains an opt-in "include notebook" toggle that emits the log as a chronological appendix.

**Dependencies.** Builds on the existing diagnostics log and the session schema. Mostly additive.

**Risk.** The log can become noisy. Discipline is to record only events a reviewer would care to see months later — not every RAF tick, not every hover. The list of recorded event kinds is itself a doctrine surface.

### 11. Derived-Source Processing Seam

**Why this excites me.** This is the architectural enabler that makes everything in the new "Processing and derived sources" seed category possible. The current architecture treats sources as things the user opens; it does not have a first-class concept of a *source the instrument produced from another source*. Adding that concept opens the door to local denoise, source separation, transcript alignment, deterministic loudness normalisation, FFmpeg analysis filters, and the AI-enhancement audit workflow — without any of them violating the trustworthiness doctrine. It is the single piece of infrastructure most leveraged by the new direction.

**Sketch.** A new architectural domain (parallel to Derived Media / Export) that owns derived-source lifecycle. A processing recipe is a small typed structure naming a vetted tool (FFmpeg filter chain, ONNX model, etc.), version, and parameters. A Tauri-side job runner consumes a recipe and an original source, produces a derived source plus a sidecar, and notifies the frontend on completion. The frontend treats derived sources identically to original sources at the runtime layer — they're just sources — but the Session Console source slot displays lineage so the user always knows. Every processing tool is added to a vetted-tools registry with its parameter schema; arbitrary scripting hooks are not in scope.

**Dependencies.** Builds on the Tauri seam (already used for clip export). Wants Track 3 worker headroom for any in-process work. Wants the v2 session schema to be in production so derived-source references can be persisted. Slots cleanly into the deliverable surface from Deep Dive #6.

**Risk.** Vetted-tools sprawl — every new tool added is a maintenance burden. Discipline is the same as for deliverables: ship the smallest version-1 (probably just `arnndn` and `loudnorm`) and let real use justify additions. Also a UX risk: source-slot lineage must be unmistakable, the same way the audible-monitor switch must be unmistakable.

### 12. AI Enhancement Audit Workflow

**Why this excites me.** This is the workflow that gives the instrument a contemporary identity beyond "trustworthy in the abstract." AI audio enhancement is exploding — Adobe Enhance, ElevenLabs, Auphonic, iZotope's ML features, Krisp, Nvidia Broadcast — and there is currently no widely-recognized tool whose explicit purpose is *verifying what those tools did to your file*. The big players are incentivised to make their output look impressive, not to make their failure modes inspectable. An instrument designed to reveal what was added, what was removed, and where alignment between original and enhanced is good or bad is an empty niche on-doctrine, and the existing infrastructure is most of the way there.

**Sketch.** Two natural shapes. First, an audit-only flow: load original as Source A, load externally-enhanced version as Source B, use Track 4 A-B + Track 5 null/diff to see exactly what changed. Second, an integrated flow: load original, run a vetted enhancer (e.g. `arnndn`) through the derived-source seam, instantly A-B against original, residual visible immediately. Both shapes produce an "AI Enhancement Audit Report" deliverable: source identity, recipe, residual energy by time/band, retained-signal estimate, artifact regions called out.

**Dependencies.** Needs Track 4 (A-B), Track 5 (null/diff), and the derived-source seam (Deep Dive #11). The audit-only flow lands as soon as Track 4 + Track 5 ship; the integrated flow needs the seam.

**Risk.** Implying a quality verdict the instrument is not actually equipped to make. The doctrine of "honest about uncertainty" applies hard — a residual is not the same as a verdict on enhancement quality, and the report must not pretend otherwise. Numbers and visualisations, with explicit caveats; no thumbs up or down.

### 13. Range Lab — Single-Source Range-First Discovery and Extraction

**Status: graduated to TASKS.md as Track 6 (v0.3.4).** Retained here for the rationale.

**Why this excites me.** The product was framed around review-and-export. Real use revealed a sibling workflow the runtime already half-supports: *discover-extract-compile*. Identify meaningful moments by spectral signature, commit ranges around them, compile the kept segments into one artifact or navigate between visually-similar regions. Single-source, no A-B, no null test, no engine split — the existing range substrate promoted into the primary surface. Naming it makes the next move concrete.

**Sketch.** See Track 6 in `TASKS.md` for the move list. The shape is: spectrogram becomes a range-creation surface, range selection becomes first-class, a new compilation export shape lands alongside per-range clip export, and similarity search arrives as a `PROCESSING_POLICY.md` suggestion-layer feature rather than a measurement.

**Dependencies.** Rides Track 2's session substrate and Track 3's worker substrate. No engine split. No two-source pressure.

**Risk.** Similarity search done badly drifts into "the tool says these are matches" territory; the suggestion-layer doctrine applies hard. The compilation export is the other risk — if it lands as a per-range export hack, it erodes export trust.

**Why this comes before Track 4.** Two reasons. First, lived experience here sharpens the v0.4 layout decision — sketching A/B without first sketching the Range Lab surface risks splitting the engine for the wrong shape. Second, it serves the instrument's current real workflows, not anticipated ones. Every phase needs to land as a usable slice.

## Ideas I'd Skip

These look attractive but would pull the product in directions the doctrine already rejects.

- **Persistent media library.** Explicitly out of scope per `PROJECT.md`. Sessions are the right abstraction; a library isn't.
- **Cloud sync of sessions.** Tempting once sessions exist. Tempting and wrong — the local-first invariant is load-bearing.
- **Real-time collaborative review.** Scope creep into a different product.
- **Plugin / scripting hooks.** Interesting in theory, but a maintenance burden that locks public surface area before the internals are stable.
- **ML in the measurement layer.** Probabilistic estimators presenting as measurement undermine the trustworthiness claim. ML and FFmpeg processing are permitted in the preprocessing/derived-source and suggestion layers per `PROCESSING_POLICY.md`; what stays rejected is presenting model output as if it were direct measurement.
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
