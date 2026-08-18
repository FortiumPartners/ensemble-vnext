# PRD: Functional Verification of Delivered Software

**Version**: 1.0.0
**Status**: Draft
**Created**: 2026-08-17
**Author**: extracted from `docs/modernization/2026-08-improvement-plan.md` item 9a
**Source**: improvement-plan item 9a, and the owner decisions recorded there 2026-08-16/17

---

## 1. Problem

**Passing tests do not mean working software, and this project has measured the gap.**

The 4.1.16 release recorded **19/19 tasks success**, every TRD acceptance criterion met, and a
clean `/audit-build` traceability verdict. It shipped with four defects that would have broken it
for every user: an empty `.claude/lib/` on install, `--refresh` withholding every new file,
`npm run smoke` hardcoded into the phase gate, and hand-edited generated prompts that regeneration
would silently revert.

None of those was an acceptance-criteria failure. Every AC was satisfied. The implement chain
already verifies its own work three ways — per-task unit tests, the phase gate (`verify-app` plus
a project-resolved battery), and `/audit-build` traceability. **The unverified question is the
PRD's: can a user actually do the thing the PRD says they can do?**

`/verify-trd-team` used to answer this — live verification against a running instance, API and UI
testing, a Completion Promise decomposed into assertions. `ITR-B012` folded it into the implement
loop, where it survives as a single conditional line in the phase-gate prompt
(`implement-trd.md:495`). That is a real capability reduction.

## 2. Goals

1. **G1** — Verify delivered software against the PRD's functional requirements, not against the
   TRD's acceptance criteria.
2. **G2** — Iterate automatically toward satisfying those requirements, bounded and reportable.
3. **G3** — Produce a report stating, per requirement, whether it is met, with the evidence — and
   explicitly flagging what could not be verified in this project at all.

## 3. Non-Goals

- **Replacing any existing verification.** Per-task unit tests, the phase gate, and
  `/audit-build` all stay. This adds the functional layer none of them cover.
- **A universal verification harness.** How to exercise a given system is the project's
  responsibility (`CLAUDE.md`, `stack.md`, project memory, its existing suites). This ships
  hints, not capability.
- **Verifying acceptance criteria.** Already covered three ways.
- **Running by default.** Cost is unmeasured; see AC-6.

## 4. Functional Requirements

### FR-1 — Derive a success definition from the PRD, in parallel with implementation

A subagent reads the PRD during implementation and produces a functional success definition. It
runs in parallel so it costs no wall clock, and it **never sees the TRD** — a definition written
after reading the TRD restates the TRD's interpretation rather than the PRD's intent.

**Every criterion cites the PRD line it derives from.** A criterion that cannot cite one is
dropped, not invented. Domain-derived criteria (a payment flow must not double-charge) are
permitted and must be labelled as such, exactly as `/create-trd` labels domain-derived objectives.

**If the PRD yields no citable criteria, the pass records that and the verification loop does not
run.** An empty success definition is a correct outcome. Inventing criteria is the
manufactured-requirement failure in its most expensive form, because an invented criterion
generates remediation work that is then executed.

### FR-2 — Verify against that definition, at the tail of the implement run

A verification agent exercises the built system against each criterion and returns, per criterion,
`met` / `not met` / `not verifiable here`, with the evidence artifact or the reason none exists.

It runs **after** the end-of-run hardening and full-branch review, so it verifies the code that
exists after review fixes land.

### FR-3 — Evidence, not assertion

A criterion is satisfied by an **artifact** — a screenshot, an HTTP request/response transcript, a
contract diff — not by an agent asserting success. `status: "success"` is settable by an agent; a
PNG that exists, is newer than HEAD, and shows the post-login dashboard is not.

Two tiers: existence and freshness are deterministic and cheap and gate the criterion; content
(does the screenshot show it, does the response match the declared interface) is one agent per
artifact and runs only on artifacts that passed tier 1.

### FR-4 — Bounded remediation loop

Failures drive an automatic loop: judge → remediate → judge, bounded by

- **satisfied** — every criterion met, exit success
- **no progress** — an iteration closes zero gaps, exit stalled
- **3 iterations** — exit STUCK, matching this project's existing retry convention

Remediation is dispatched as a **TRD remediation phase** through the existing phase workflow, not
as a loose agent, so it inherits wave partitioning, file-conflict serialization, agent selection,
and the phase gate.

### FR-5 — Persist what was learned about how to test this project

The verifier maintains its own notes so that a fresh context each iteration does not relearn the
mechanics: how the app starts and how you know it is ready, the health path, setup a cold
environment needs, where the harness config is, known-flaky checks, and what could not be verified
and why.

Notes carry how each was established (`[read]` / `[ran]` / `[inferred]`). **A note that fails is
corrected, not worked around** — a stale note is worse than no note, because the next fresh
context trusts it completely.

This is the verifier's working memory, not governance. Team decisions — which shared instance is
safe to exercise, whether preview deployments exist, where secrets live — remain owner-governed in
`stack.md`; the notes may only record what was observed about them.

### FR-6 — Report

Per criterion: status, evidence (or why none), what remediation attempted across iterations, and
the blocker for anything unmet when the loop ends.

**`not verifiable here` is a first-class outcome.** A project with no browser harness cannot have
its UI criteria verified, and stating that plainly is worth more than a green tick from a check
that never ran — which is precisely the failure that produced the 4.1.16 defects.

## 5. Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-1 | A success definition is produced from the PRD, in parallel with implementation, without reading the TRD |
| AC-2 | Every criterion in it cites a PRD line, or is labelled `domain-derived`; uncitable criteria are absent |
| AC-3 | A PRD yielding no citable criteria produces an empty definition and the loop does not run |
| AC-4 | Each criterion resolves to `met` / `not met` / `not verifiable here`, with an evidence artifact or a stated reason |
| AC-5 | The loop exits on all three conditions: satisfied, zero-progress, and the 3-iteration cap |
| AC-6 | The loop is opt-in behind a flag and does not run by default |
| AC-7 | Remediation is dispatched as a phase through the existing phase workflow, not as a direct agent call |
| AC-8 | The verifier's notes persist across iterations and record derivation markers |
| AC-9 | The report names every criterion, including unverifiable ones |

## 6. Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | The success definition manufactures criteria the PRD does not support | Mandatory PRD-line citation; uncitable dropped, not invented (FR-1) |
| R2 | Remediation for one criterion breaks another | Dispatch as a phase, inheriting file-conflict serialization (FR-4) |
| R3 | Cost per cycle makes it unaffordable | Opt-in by default (AC-6); measure on a real run before changing that |
| R4 | Notes accumulate wrong beliefs with no reviewer | Derivation markers, and correct-on-failure rather than work-around (FR-5) |
| R5 | The verifier reports green for checks that never ran | `not verifiable here` as a distinct status (FR-6) |

## 7. Open Questions

- **Cost per verification cycle.** Unknown whether a full re-verify per iteration is affordable,
  or whether it should re-check failed criteria plus a regression subset. Answerable only by
  running it; this is why AC-6 exists.

## Could Not Verify

- The wall-clock and token cost of a verification cycle — no implementation exists to measure.
