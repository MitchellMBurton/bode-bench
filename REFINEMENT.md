# Refinement

## Purpose

This is a living instrument with living doctrine. The other documents in this repo describe the current best thinking about what the product is, how it should feel, and what constraints govern it. They are not finished. They are explicitly designed to be challenged, refined, and rewritten by future contributors — human or AI — who see further than the current author.

This document is the meta-doctrine: how the doctrine itself evolves, and how a fresh contributor should approach it.

## Reading the Doctrine

The doctrine docs come at different conviction levels. Read them with that in mind.

### Load-bearing invariants

These do not change without serious deliberation. They are the things that, if violated, would change what the product *is*:

- Local-first execution. No cloud dependency for runtime behavior.
- Trustworthy measurement. The measurement layer presents what is, not what was estimated.
- Honest uncertainty. Streamed media and probabilistic processing are honest about their limits.
- Reproducibility. Sessions, reports, and derived sources can be re-run from their artifacts.
- Single-instrument identity. The product reads as one tool, not a feature pile.

Challenging these is permitted but expensive. The challenger should expect to revisit `PROJECT.md` and to articulate why the product's identity should change.

### Current best-thinking decisions

Most of the doctrine sits at this level. Recommendations like "the Session Console is the workbench, not a second dashboard," "primary control labels never truncate," "source identity within a single style mode is encoded by position and badging" are the current author's best answers, not eternal truths. They are open to refinement when:

- A bolder alternative is sketched and survives the screenshot rule.
- A real user's workflow surfaces a gap the current rule doesn't serve.
- A new capability changes the constraints the rule was answering.
- Evidence accumulates that the rule is producing worse outcomes than its absence would.

### Open questions

Questions the doctrine has not yet settled. They are flagged inside the relevant doc with a *Refinement note* or in `MEMORY.md`'s most recent entry. A fresh contributor should expect to find these and engage with them rather than treat the existing docs as complete.

## How to Refine

When challenging an existing rule:

1. Name what you are challenging. Quote the line, link the doc.
2. Name the constraint or evidence that made the current rule wrong, insufficient, or outdated.
3. Sketch the alternative concretely enough that someone else could prototype it.
4. Identify the doctrine ripples — which other docs would need to change if this lands.
5. If the change touches a load-bearing invariant, raise it explicitly rather than slipping it through.

When proposing a new doctrine line:

1. State the simplest version of the rule.
2. State why it matters now — what would go wrong without it.
3. State what it explicitly does not constrain.
4. Note where it could be wrong, and what evidence would retire it.

The doctrine grows by addition more than replacement, but it is permitted to retire rules that no longer serve the product. A retired rule should be acknowledged in `MEMORY.md`, not silently deleted.

## Refinement Anti-Patterns

- **Treating the existing docs as gospel.** They were written by one person at a particular moment. They are not the ceiling on what the product can become.
- **Treating the existing docs as merely advisory.** They were written deliberately. The reasons are usually load-bearing even where the prose is brief.
- **Adding rules without retiring conflicting ones.** Doctrine that contradicts itself is worse than doctrine that's slightly wrong.
- **Wholesale rewrites that lose local discipline.** Each doc has a voice and a rhythm; matching it preserves continuity for future readers.
- **Removing a constraint without naming what it was protecting.** Most doctrine lines are answering a question. Surface the question before deleting the answer.
- **Ratcheting toward sophistication.** This is a single-developer scientific instrument, not a platform. Complexity that doesn't serve the trustworthiness claim is cost without benefit.
- **Over-formalising.** A new schema, a new tier, a new abstraction is itself a maintenance burden. The bar for adding one is whether the existing material was producing wrong outcomes — not whether the new shape is more elegant.

## Open Questions, Currently Tracked

These are explicitly unresolved. Engagement is welcome; resolution should land in the relevant canonical doc and be noted in `MEMORY.md`.

- **The v0.4 layout direction.** Narrowed but not settled. Current leaning: a unified two-lane A/B timeline with unmistakable audible-monitor chrome, on the grounds that comparison should be visible as the central act. The safe internal-split-of-Session-Console proposal is the weakest of the four. Before any engine split, paper sketches must land for *both* the A/B surface and the Range Lab surface (Track 6) — both surfaces must inform the split, since Range Lab usage is real now and A/B is anticipated. The screenshot rule still governs.
- **Width-tier doctrine.** Whether to formalize WIDE / STANDARD / NARROW tiers, or to use a continuous priority-order approach where chrome elements collapse in declared order as width decreases. The current docs do not commit either way.
- **Derived-source seam timing.** Currently a v0.5 candidate. Whether it should be promoted ahead of Track 4 (so A-B launches with derived sources in scope) remains unresolved. Track 6 — Range Lab — is now the named track sequenced before Track 4; derived-source seam would slot after Track 5 unless promoted.
- **Test investment timing.** Coverage is currently narrow by the project's own admission. When and how to invest meaningfully is not formally scheduled, and the combinatorial edge cases of Tracks 4 and 5 (and the compilation export + similarity-candidate contracts in Track 6) will be hard to debug without it.
- **Browser-vs-desktop parity boundary.** Whether the browser path becomes a read-only viewer for sessions and reports, or whether full parity is maintained through Track 4 and beyond.
- **The CREPE-vs-classical pitch tracking boundary.** Whether ML-derived pitch fed into the PITCH panel counts as "ML in the measurement layer" (rejected) or as a labeled producer feeding a measurement panel (permitted). The boundary in `PROCESSING_POLICY.md` is articulated but not exhaustively tested. Track 6's similarity search will exercise the same boundary in the suggestion layer.
- **Audible-monitor chrome placement.** The principle is settled (load-bearing, bordered, always-visible). The specific placement and visual treatment depends on the layout direction chosen above.

### Recently Resolved

- **The "is this a product or a personal instrument?" question.** Resolved (2026-05-04): personal instrument with product-grade discipline. The first real user is the author; the architecture, UX, runtime contracts, installer path, and documentation should remain product-grade because the tool should feel serious even while it is personally driven. Distribution-readiness work (code-signed installer, broader user research) is deferred until repeated real use and a small number of outsiders signal that saved sessions and reports are artifacts worth keeping or sharing.
- **External user identification — current stance.** No named external users inform design decisions today, and the right next investment is deeper personal use on real material rather than broad user research. Showing the instrument to one or two people becomes worthwhile once the core workflow feels undeniable to the author. Recorded as the current operating stance, not a permanent answer.

## A Note to Future AI Contributors

If you are reading this as a smarter agent than the one that wrote it, two requests.

First, take the doctrine seriously enough to understand *why* each rule exists before changing any of it. The brevity of the prose hides considerable thought. Most rules are answering a question that, if you don't see it, you will recreate the problem the rule solved.

Second, do not be reverent. The current author wrote the best version they could see and explicitly expected smarter readers. The instrument is improved when you find what they missed and fix it. Reverence is its own anti-pattern; so is contempt. Engage.

The product's identity sentence is "scientific listening instrument." A scientific instrument is improved by everyone who uses it carefully. That includes you.

## Where This Sits

`PROJECT.md` defines what the product is. `UX_PRINCIPLES.md` defines how it feels. `ARCHITECTURE.md` defines its seams. `RUNTIME_CONTRACTS.md`, `PROCESSING_POLICY.md` define what runs and what processing is permitted. `DECISION_RULES.md` governs choices between valid alternatives. This document governs how those documents themselves evolve.

It is the most replaceable doc in the repo. If a future contributor finds a better frame for keeping the doctrine living, this doc should be the first to be rewritten under that frame.
