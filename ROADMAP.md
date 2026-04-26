# Roadmap

## Purpose

Phase-level structure for the v0.3+ direction. Tracks live in `TASKS.md`; raw idea pool lives in `FUTURE_PLANS_AND_IDEAS.md`. This doc names the phases, their dependencies, and what success looks like.

## Phase Map

```
v0.2-final ──► v0.3 ──► v0.4 ──► v0.5
              (deliverable     (comparative      (null test
               artifact)        bench)            confidence)
```

### v0.3 — Deliverable Artifact

The phase that turns review work into things you can hand to other people.

- **v0.3.0** — Notes on ranges + markdown session report (Track 1)
- **v0.3.1** — Reproducible session artifact `.review-session.json` (Track 2)
- **v0.3.2** — Worker-based analysis core (Track 3)

**Phase done when:** a reviewer can mark, annotate, save, reopen, and report on a session without anything ephemeral being lost, and analysis runs off the main thread.

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

## Dependency Chain

```
Track 1 (Notes + Report) ─────────────► independent, ships first
                                          │
Track 2 (Session Artifact) ──────────────┤ extends notes to whole session
                                          │
Track 3 (Worker Core) ────────────────────┤ independent, parallel-able with Track 2
                                          │
Track 4 (A-B Workspace) ──────── needs ───┴ Track 2 (session schema for two sources)
                                  needs    Track 3 (perf headroom for two pipelines)
                                          │
Track 5 (Null Test) ────────── needs ─────┘ Track 4's alignment machinery
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
- AI-assisted "intelligent" analysis
- Mobile-first redesign
- Hosted analysis queue (kept as a contract-level future option in CORE_HARDENING, not a roadmap item)

## Cadence

This is a single-developer project. The phase boundaries above are sequencing aids, not delivery dates. A phase is done when its done-criteria pass, not when a calendar says so.
