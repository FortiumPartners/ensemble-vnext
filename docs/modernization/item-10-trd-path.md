# Item 10 — the TRD path

**Status:** design, 2026-08-13. Scope is `/create-trd`, `/create-trd-team`, `/refine-trd`.
Companion to `docs/modernization/item-10-prd-path.md`, which it depends on but does not repeat.

---

## 1. Why the TRD is worse, and how

A PRD **records** what was asked for. A TRD **derives** — one PRD line becomes N technical
requirements, and every derivation is an invention opportunity. Its inputs are feature
specifications, and filling in technical detail is *literally its job*.

So the PRD path's rule — *every requirement traces to source* — cannot simply be transplanted.
Applied to a TRD it would forbid the TRD from doing its work, and force users to specify
architecture they hired the tool to design.

**The resolution is that a TRD's lines are not all the same kind of thing, and the two kinds fail
differently.** All eight fabrications in `docs/TRD/discipline-judgment.md`, classified:

| Fabrication | Kind | How it failed |
|---|---|---|
| A5 — latency p95 ≤ 2000 ms | objective | fabricated outright |
| A4 / §2.3 no-result premise | objective + its justification | misread premise |
| §3.1 corpus floors | thresholds | aspirational, unsupportable by data |
| A2/A3 single-run framing | thresholds | assumed determinism that wasn't there |
| A2 "zero tolerance" | **severity** of a real objective | invented strictness |
| §3.4 kill switch (D5) | design decision | impossible mechanism |
| B009 vs D5 | two decisions | individually sound, mutually exclusive |
| B009 deferral premise | design decision | unverified premise |

**Five of eight were objectives, thresholds, or an invented severity — they failed by
MANUFACTURE.** Three were design decisions, and **none of those was an invented objective**; they
failed by being *wrong* — unbuildable, contradictory, or resting on something unchecked.

Two diseases. Two checks. The whole design follows from that.

---

## 2. The rule: invent the HOW, never the HOW WELL

Every line in a TRD is one of three types, and the type determines what it owes:

| Type | What it is | What it must satisfy |
|---|---|---|
| **Objective** | what must be true, and how well — acceptance criteria, NFRs, thresholds, quality gates | **Provenance.** Traces to the PRD, `stack.md`/`constitution.md`, a measurement, or an explicit user instruction. **May not be invented.** |
| **Decision** | how it will be built — architecture, technology, structure, sequencing | **Derivation + buildability + consistency.** Must serve a named objective, be constructible, not contradict a sibling, and be recorded with its alternatives. **Free to be invented** — that is the TRD's job. |
| **Task** | the work to do | Must serve a named objective or decision. |

This is the balance stated precisely. A TRD may decide Postgres, a queue, a three-phase rollout,
a particular module boundary — none of that needs user provenance, only an upward link and a
conformance check. What it may **not** do is decide that the thing must respond in under two
seconds, or sustain 99.9% uptime, or hit 80% coverage, unless someone asked.

### 2.1 The smuggling case, and the detection rule

The failure mode that hides between the types is a **decision that quietly implies an objective**.
"Use Redis for caching" is a decision. "Cache hit rate must exceed 90%" is an objective wearing a
decision's clothes.

**Detection rule: a measurable threshold is an objective wherever it appears.** Type by nature,
never by section. This matters concretely — A5 lived in an acceptance table, but §3.1's corpus
floors lived in a *specification* section, and both were manufactured thresholds. A
section-based rule would have caught one and missed the other.

### 2.2 Domain-derived objectives

Some objectives genuinely follow from the domain rather than from a document — "must not lose a
payment", "must not leak PII across tenants". Banning these would be wrong.

They are permitted, and **must be labelled `domain-derived` with the reasoning stated**, which
lands them in the readout as their own class. Not blocked; visible. The distinction being enforced
is between an objective someone can point at and one that appeared because an acceptance table
looked empty.

---

## 3. The five checks

The PRD path has one check (provenance). The TRD needs five, because three of its failures were
not provenance failures at all.

| # | Check | Applies to | Question | Would have caught |
|---|---|---|---|---|
| C1 | **Provenance** | objectives | Does it trace to PRD, a named constraint, a measurement, or the user? | A5, §3.1 floors, §2.3's premise |
| C2 | **Derivation** | decisions | Does it serve a *named* objective? | decisions existing for their own sake |
| C3 | **Mechanism** | decisions | Can this actually be built as specified? | §3.4's kill switch |
| C4 | **Consistency** | all pairs | Does it contradict a sibling requirement or decision? | B009 vs D5 |
| C5 | **Threshold sourcing** | objectives | Is the *severity* sourced, not just the requirement's existence? | A2's "zero tolerance" |

**C4 and C5 are the ones a provenance readout alone cannot catch, and both bit hard.** B009 and D5
were *each* legitimately derived and only wrong together. A2 traced honestly to "don't break the
repo" — what was invented was *how strict it had to be*, and an unexamined severity is
un-negotiable in the wrong direction. "Zero tolerance" and "≤1 per run" are different
requirements; the gap between them is where unexamined strictness hides.

C4 is pairwise and therefore the expensive one. Scope it to declared dependencies plus objectives
that share a subject, rather than the full cross product.

---

## 4. Workflow

Same skeleton as the PRD path — one authoring subagent, fan-out for verification only, verify
against source — with the verifier set widened.

```
0. RESOLVE SOURCE            main agent
     PRD path (normal) + stack.md + constitution.md + codebase
     Session-derived additions → transcript JSONL, path recorded

1. AUTHOR                    1 subagent (technical-architect, fresh context)
     Sees PRD + constraints + repo.
     MUST type every line it writes: objective | decision | task,
     and record decisions in §1.2's existing Key Technical Decisions table
     WITH alternatives — that table exists today and is not enforced.

2. VERIFY                    4 subagents, parallel, read-only, none may invent
     grounding        does this already exist / contradict the codebase?
     conformance      does it violate stack.md / constitution.md?     (C2 lateral half)
     objective-audit  C1 + C5 — provenance and severity of every objective, against SOURCE
     design-audit     C2 + C3 + C4 — derivation, buildability, sibling consistency

3. RECONCILE + READOUT       main agent
```

**`design-audit` is the new capability**, and it is the one that would have paid for itself
soonest. C3 in particular is cheap and was never performed: §3.4's kill switch was specified,
built against, deferred *around*, and only disproven when a subagent was finally asked whether the
mechanism existed. The question "can this be built as written?" costs one agent and would have
saved a task plus a wrong deferral.

Same as the PRD path: every mandate is *findable*. Each finding names a source or a contradiction
and is verifiable in seconds. No verifier may propose an objective or strike one on judgment —
that is the manufactured-objection failure, and in a TRD it deletes real acceptance criteria.

---

## 5. Readout

```
SOURCE: docs/PRD/<feature>.md  +  stack.md  +  constitution.md

  Unsourced objectives (2)     ← review first; default is removal
    A5    latency p95 <= 2000ms          traces to nothing
    NFR-9 99.9% uptime                   traces to nothing

  Unsourced severities (1)     ← the requirement is real; the strictness is not
    A2    "zero tolerance"               requirement traces to constitution;
                                         the threshold traces to nothing

  Domain-derived objectives (1)          ← permitted, shown for review
    SEC-2 no PII across tenants          reasoning: multi-tenant by design

  Decisions without a named objective (1)
    D7    adopt event sourcing           serves no stated objective

  Unbuildable (1)
    D5    runtime kill switch            a prompt hook runs no code that can read an env var

  Contradictions (1)
    B009 deletes the code D5's rollback path depends on

  Derived objectives (6)                 ← sourced; listed for completeness
    ...
```

Ordered by how expensive the failure is to discover later. Unsourced objectives first, because
they are the ones that consume whole tasks.

---

## 6. `/create-trd-team`

Same verdict as the PRD path, and for a stronger reason. A TRD team fans out *domain experts* —
each briefed to contribute technical depth in its area. That is generation-by-committee applied to
the artifact where manufacture is already worst, and each expert's contribution arrives with the
authority of a specialist perspective.

**Retire it.** Fan-out moves to verification, where the same specialists are far more valuable
asking "can this be built?" than "what else should we add?"

---

## 7. Not in scope

- `/implement-trd` consuming the typing. Once lines are typed, a lot becomes possible — an
  unsourced objective could block a task, `verify-app` could distinguish an objective from a
  decision. Deliberately deferred: type the artifact first, exploit it later.
- Item 11's learning loop beyond the decisions/alternatives record.

---

## 8. Done when

- Every TRD line is typed **objective | decision | task**, with type determined by nature not
  section.
- Objectives carry provenance; decisions carry a named objective and recorded alternatives.
- The five checks run as two verifier subagents (`objective-audit`, `design-audit`) alongside
  grounding and conformance.
- C3 (buildability) runs on every decision — the cheapest check that was never performed.
- `/create-trd` emits the readout, unsourced objectives first, severities called out separately
  from requirements.
- `/create-trd-team` retired.
- Re-running against `docs/TRD/discipline-judgment.md` flags **at least 7 of its 8** known
  fabrications. That TRD is the regression fixture — its failures are documented with receipts,
  which makes it the only honest test of whether this design works.
