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
| C6 | **Grounding completeness** | tasks | Does every task carry grounding? Does anything replaced appear in a `Replaces` line? | `recordBlockInLedger` left orphaned by the 4.1.9 conversion |

**C4 and C5 are the ones a provenance readout alone cannot catch, and both bit hard.** B009 and D5
were *each* legitimately derived and only wrong together. A2 traced honestly to "don't break the
repo" — what was invented was *how strict it had to be*, and an unexamined severity is
un-negotiable in the wrong direction. "Zero tolerance" and "≤1 per run" are different
requirements; the gap between them is where unexamined strictness hides.

C4 is pairwise and therefore the expensive one. Scope it to declared dependencies plus objectives
that share a subject, rather than the full cross product.

---

## 3.5 Brownfield grounding — the TRD must land in the code that exists

Everything above governs whether a requirement is *legitimate*. This governs whether the plan is
*implementable in this repository*, which is a separate failure and currently unaddressed:
`/create-trd` contains **no** mention of reuse, deprecation, removal, or existing implementation.
It designs as if the codebase were empty.

Once the TRD has decided what to do, it must reconcile that against a brownfield reality on four
axes:

| | Requirement | Failure it prevents |
|---|---|---|
| **(a)** | **Consistent with the existing implementation** | A plan that contradicts how the thing already works, discovered at implement time |
| **(b)** | **Maximises reuse** | Reimplementing what exists — the most common silent waste |
| **(c)** | **Deprecates and removes what it refactors out** | Dead code that still *looks* live |
| **(d)** | **Documented with the task** | Every implementer rediscovering the same context |

**(c) has a worked example in this repository.** The 4.1.9 conversion moved
`subagent-discipline.js` to prompt-type, which silently orphaned `recordBlockInLedger` inside a
`main()` that no longer executes. The dispatch ledger lost its compensating `blocked` row and
nothing noticed, because the file still existed and still looked live. Nothing in `/create-trd`
asked "what does this replace, and what becomes unreachable?" — so nothing surfaced it. It was
found days later by an agent noticing a *documentation* claim had gone false.

**(d) is the one that changes the shape of the design**, because it makes grounding a **producer**,
not a checker. Findings that land only in a readout are wasted: the implementer never reads the
readout. This session paid that cost repeatedly — one subagent rediscovered the manifest
structure, another re-grepped for dependents that a previous agent had already enumerated. Each
rediscovery is a full context window spent on something already known.

### 3.5.1 Where it goes — additive, format-preserving

**The existing TRD output format is unchanged.** The Master Task List keeps its current shape
exactly; this is deliberate, because `/implement-trd` parses it today and that consumption will be
reworked separately. Grounding lands in a **new section keyed by task ID**, so nothing existing
moves:

```markdown
## N. Task Grounding

### AUTH-B003
- **Touches:** `packages/api/auth/session.ts`, `packages/api/auth/session.test.ts`
- **Reuse:** `withRetry()` in `packages/api/lib/retry.ts` — do not reimplement backoff
- **Replaces:** `legacyTokenCheck()` in `session.ts:88` becomes unreachable; delete it and its
  three tests in `session.test.ts:120-190`
- **Follow:** the idempotency-key pattern in `packages/api/webhooks/stripe.ts`
- **Careful:** `session.ts` is imported by the mobile client — signature is a public contract
```

Only `Touches` is mandatory. The others appear when they apply; an empty grounding block is a
legitimate result for genuinely greenfield work and should be stated rather than padded.

`/implement-trd`'s delegation templates become the consumption point — the grounding block for a
task is passed into the implementer's prompt so it starts with what a previous agent already
established. That change is small and deliberately **not** designed here, since the implement loop
is being reworked and designing against its current shape would be work done twice.

### 3.5.2 Who produces it

**One `grounding` subagent, sequential after authoring** — not part of the parallel verify wave.
It is *generative* (it writes task context), and the rule that fan-out is for verification only
applies to it: a fanned-out grounding stage would produce four opinions about which code to reuse.

It runs after decisions exist, because grounding a decision that has not been made is meaningless.

### 3.5.3 The check

| # | Check | Question |
|---|---|---|
| C6 | **Grounding completeness** | Does every task carry a grounding block? Does anything the plan replaces appear in a `Replaces` line, or is it being left orphaned? |

C6 belongs to the `design-audit` verifier. Its most valuable half is the second question — *what
does this make unreachable?* — because that is the one nobody asks, and the one that left
`recordBlockInLedger` stranded.

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

2. GROUND                    1 subagent (brownfield reconciliation) — sequential, generative
     Reconciles the decisions against the codebase: consistency, reuse,
     what becomes unreachable, and per-task context (§3.5).
     Emits the Task Grounding section. Existing TRD format untouched.

3. VERIFY                    4 subagents, parallel, read-only, none may invent
     grounding        does this already exist / contradict the codebase?
     conformance      does it violate stack.md / constitution.md?     (C2 lateral half)
     objective-audit  C1 + C5 — provenance and severity of every objective, against SOURCE
     design-audit     C2 + C3 + C4 + C6 — derivation, buildability, consistency, grounding

4. RECONCILE + READOUT       main agent
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
- Every task carries a grounding block; anything the plan replaces is named in a `Replaces` line.
- The existing Master Task List format is unchanged — grounding is additive, in its own section.
- Re-running against `docs/TRD/discipline-judgment.md` flags **at least 7 of its 8** known
  fabrications. That TRD is the regression fixture — its failures are documented with receipts,
  which makes it the only honest test of whether this design works.

---

## 9. Validation against real artifacts and transcripts (2026-08-13)

Audited: 61 PRDs, 97 TRDs, and 1,374 human-typed turns extracted from five session transcripts
(~110 MB). Findings that **change** this design are recorded first.

### 9.1 The targeting was partly wrong

Ranked user pushback across ~450 corrective turns:

| # | Category | ≈ |
|---|---|---|
| 1 | **Invented delivery machinery** — flags, rollout, migration paths, guard infra, eval gates | 55 |
| 2 | **Reuse violated / existing implementation unknown** | 45 |
| 3 | **Readout unintelligible or unactionable** | 35 |
| 4 | **Model factually wrong about the system** | 30 |
| 5 | Decision re-litigated | 25 |
| 6 | **Requirement dropped / silently rescoped** | 20 |
| 7 | Requirement invented | **12** |
| 8 | Dead code left behind | 10 |
| 9 | Defensive checkpointing | 8 |

**Requirement invention is 7th of 9.** The manufacture is real but **displaced one layer down** —
into *decisions and delivery machinery* rather than requirement lines. C2/C3 and §3.5 target
categories 1, 2, 4 and 8; the PRD path's provenance check targets category 7, the smallest.

**Consequence: if only one half is funded, fund the TRD half.**

### 9.2 Dropping requirements is commoner than inventing them

Category 6 (20) outranks category 7 (12). **Both readouts are reordered so "Missing / rescoped"
precedes "Unsourced."** Silent narrowing has no check at all today:

> *"we were given a UI design and 'decided' not to implement it as provided."*
> *"The absolute intent of the PRD/TRD was clearly to replace those screens… This isn't another effort, this is finishing the effort we're currently working on."*

### 9.3 C5 must apply to VERIFIER findings — P7 fixes the wrong failure

~12 clear challenger reversals in the transcripts. **Essentially none are "the reviewer struck a
valid requirement."** They are all the reviewer **inflating severity**:

> *"you're building infrastructure to stop us (you) from making bad coding decisions? …this is a clear case of overengineering."*
> *"You're over indexing on the fact that there was a bug."*
> *"You've become far too conservative — this is a preproduction beta system; I am currently the only user."*

P7 stops a challenger *striking* a requirement — a failure that does not occur. It does nothing
about a challenger *inflating* one, which is A2's invented-severity failure relocated into the
verifier. **C5 therefore applies to verifier findings themselves:** any finding asserting severity
("this will regress bookings", "this needs a guard") carries the same sourcing burden as an
objective, or the reviewer becomes the manufacture site.

### 9.4 Cross-artifact contradiction — confirmed, severe, and invisible to every check here

The POI-graph transit-node schema **flapped A → B → A → B → A → B** across three PRDs, in the
authors' own words, *"including citing non-existent Phase 5 AC IDs."* **A per-artifact
source-fidelity check would have certified all six flips as faithful to their own sources.**

The authors converged on the fix independently: cross-artifact citations are **grep-verified in the
live target document before citing**, and contracts are anchored in feature signatures rather than
transient AC IDs.

**Add a fourth verifier: for every cross-artifact citation, grep the referenced ID in the live
target and fail on a miss.** Deterministic, findable-only, cheap.

### 9.5 The readout's problem is register, not length

§5 asserts length is load-bearing. The evidence says comprehensibility is:

> *"There is so much jargon… These words make no sense to me, and I built this product!!"*
> *"I read your full response but come away not knowing what ACTUAL action should I be taking next"*
> *"I DO NOT UNDERSTAND what action you expect me to take on these?"*

Rejected five separate times. The example *lines* are fine; the **headings** are the problem —
"Unsourced severities", "Decisions without a named objective", "domain-derived" are exactly that
register. **Every readout line names the action, not the classification.**

### 9.6 Two assumptions that do not hold

- **Artifacts are living documents.** 28/61 PRDs have ≥3 versions; 24/61 carry supersession
  markers. A one-shot readout re-run on v1.5.1 flags legitimately-derived v1.2.0 requirements as
  unsourced. Source on refinement = original source ∪ the changelog's cited rulings.
- **P6 assumes one transcript.** This user runs **concurrent sessions on one product**:
  *"the invariant IS NOT INVERTED. that's for a different session"* — a finding from another session
  leaked in as fact. A single transcript path is both incomplete and a contamination vector.

### 9.7 Where the design is confirmed

- **§3.5(b) reuse is the most-repeated instruction in the corpus** — ≥8 times across three
  sessions: *"THE EXACT SAME BullMQ mechanism… DO NOT create another path"*, *"not reinventing
  anything!"*, *"We BUILT TOOLING"*.
- **§3.5(c) removal** — *"Don't disable it, delete the code so we don't have dead code lying
  around"*, *"get rid of dead code — and if it isn't dead, trace down why not"*.
- **C3 mechanism** — performed by the user because nothing else does: *"STOP. A 'real browser' is
  not how we access data in production. This exercise is useless if you cannot prove that you can
  hit that API using the infrastructure we have in place."*
- **C5 thresholds** — pre-empted by the user: *"Ensure we note that 10s is aspirational not
  absolute."*
- **§3.5(d) grounding-into-the-prompt is the strongest half.** The most emphatic re-litigation
  instance is a decision *in context, minutes old*, re-proposed anyway: *"You keep missing the
  point… I've stated repeatedly — WE'RE GOING TO REBUILD IT."* A Decisions section fixes
  information with nowhere to land; this is information that landed and was overridden.

**The strongest single validation:** three weeks before this design, the user hand-wrote its verify
wave as a command runner —

> `/refine-trd` Verify TRD creation remained true to functional requirements — **did not create new requirements nor drop any**… complete but not overengineered
> `/refine-trd` … **maximum code reuse, conformance with existing code patterns, deletion/deprecation of code no longer used, guard against overengineering**

That is C1 + C6 + §3.5(b) + §3.5(c), authored by the user, because the framework did not do it.

### 9.8 Out of scope, and it is the largest class

Category 1 — invented delivery machinery — mostly appears **during implementation, after the TRD
exists**. Item 10 types and audits the document; nothing types what an implementer adds:

> *"You — Claude — keep introducing these artificial gates and protections, and the result is we have built and ostensibly deployed features sitting dark."*

Recorded as the natural successor to item 10, not folded into it.
