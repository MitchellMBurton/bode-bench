# Roadmap

## Purpose

Phase-level structure for the v0.3+ direction. Tracks live in `TASKS.md`; runtime contracts live in `RUNTIME_CONTRACTS.md`; raw idea pool lives in `FUTURE_PLANS_AND_IDEAS.md`. This doc names the phases, their dependencies, and what success looks like.

## Phase Map

```text
v0.2-final -> v0.3 -> v0.4 -> v0.5
              deliverable artifact + range lab
                       comparative bench
                                  confidence and polish
```

### v0.3 — Deliverable Artifact and Range Lab

The phase that turns review work into things you can hand to other people, and turns single-source range work from a navigation aid into the primary discovery and extraction surface.

- **v0.3.0** — Notes, markdown reports, and reproducible `.review-session.json` artifacts (Tracks 1 + 2)
- **v0.3.2** — Worker-based analysis core, minimal closure: retained live-frame contracts and dispatch isolation shipped; deeper migrations deferred until Range Lab and A-B usage justify them (Track 3)
- **v0.3.4** — Range Lab: spectrogram-driven range creation, multi-range bulk operations, keep-and-cut compilation export, suggestion-layer range similarity search, spectral bookmark navigation (Track 6)

**Phase done when:** a reviewer can mark, annotate, save, reopen, and report on a session without anything ephemeral being lost; the live analysis path runs through the worker without breaking frame ownership or UI responsiveness; *and* a single-source session supports spectrogram-driven discovery, multi-range curation, compilation export, and similarity-based navigation as first-class workflows.

### v0.4 — Comparative Bench

The phase that turns the instrument from single-source review into two-source measurement.

- **v0.4.0** — A-B comparison workspace with locked transport and audible-monitor switch (Track 4)
- **v0.4.1** — Differential analysis (null test) with alignment confidence (Track 5)

**Phase done when:** an engineer can load two sources, time-align them, switch monitor between A / B / null, and produce a defensible comparative report including the residual analysis.

### v0.5 — Confidence and Polish

Discretionary. The shape depends on what v0.4 reveals about real comparative workflows.

Candidate moves:
- OffscreenCanvas migration for the heavy panels
- Named workspace presets (templates from Track 2 mature into shareable presets)
- Hover-scrub thumbnail in the coarse session map
- Within-column panel reorder (Phase 5 from earlier layout work)
- Per-range tuning (each saved range carries its own VOL/RATE/PITCH snapshot)
- Derived-source processing seam (per `PROCESSING_POLICY.md`) — unlocks local denoise audit, source separation, FFmpeg analysis filters, and the AI-enhancement audit workflow

## Dependency Chain

```text
Track 1 (Notes + Report)
  -> shipped with Track 2 in v0.3.0

Track 2 (Session Artifact)
  -> shipped with Track 1 in v0.3.0
  -> provides the migration-aware session substrate for Tracks 6 and 4

Track 3 (Worker Core, minimal closure)
  -> v0.3.2 substrate; deeper migrations earned on demand from Track 6 / Track 4
  -> provides retained-frame contract and dispatch isolation for everything downstream

Track 6 (Range Lab)
  -> needs Track 2 session substrate (ranges already there; compilation manifest extends it)
  -> rides Track 3 substrate without forcing further worker migration
  -> surfaces lived experience that sharpens the Track 4 layout decision before any engine split

Track 4 (A-B Workspace)
  -> needs Track 2 session schema discipline
  -> needs Track 3 worker/runtime headroom
  -> benefits from Track 6 Range Lab usage informing layout sketches

Track 5 (Null Test)
  -> needs Track 4 alignment machinery
```

## Graduation From `FUTURE_PLANS_AND_IDEAS.md` to `TASKS.md`

An idea graduates when:

1. It earns a place in `TASKS.md` with a definite scope and acceptance criteria
2. It identifies its dependencies honestly
3. It clears the "does this make the instrument feel more exact?" question, not just "does this add a feature?"

## Cross-Phase Invariants

These hold across every phase. If a track conflicts with one of these, the track is wrong.

- **Truth before spectacle.** Every panel must show what is, not what would look good.
- **Local-first.** No cloud, no library, no collaboration substrate.
- **One instrument.** A-B doesn't make this two products.
- **Honest uncertainty.** Streamed media remains honest about coverage. Null results carry alignment confidence.
- **Trustworthy export.** Every artifact (clip, report, session, residual) is reproducible and inspectable.
- **Screenshot-safe.** Default operating states still produce strong screenshots.

## Out of Scope For The Whole Roadmap

These have been considered and rejected. They will resurface; the answer is still no.

- Persistent media library
- Cloud sync of sessions
- Real-time collaborative review
- Plugin / scripting hooks
- Probabilistic ML in the measurement layer (preprocessing and suggestion layers are governed by `PROCESSING_POLICY.md`)
- Mobile-first redesign
- Hosted analysis queue (kept as a contract-level future option in CORE_HARDENING, not a roadmap item)

## Cadence

This is a single-developer project. The phase boundaries above are sequencing aids, not delivery dates. A phase is done when its done-criteria pass, not when a calendar says so.
