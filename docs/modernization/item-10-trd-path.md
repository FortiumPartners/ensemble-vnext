# Item 10 — the TRD path

**Status:** SHIPPED 2026-08-14. Scope was `/create-trd`, `/create-trd-team`, `/refine-trd`.
Deviations from this design as written are recorded in §10.
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

## 3. The checks

The PRD path has one check (provenance). The TRD needs **six** — C0, C1, C3, C4, C5, C6 —
because three of its failures were not provenance failures at all. C2 was dropped here and
then **restored** on re-scoping; see §3.2 and §10.

(This section was headed "the five checks" while enumerating six; the count is corrected.)

| # | Check | Applies to | Question | Measured hits (8 TRDs, 81 objectives) |
|---|---|---|---|---|
| C1 | **Provenance** | objectives | Does it trace to PRD, a named constraint, a measurement, or the user? | **4** |
| **C5** | **Threshold sourcing** | objectives | Is the *severity* sourced, not just the requirement's existence? | **6 — the dominant check** |
| C0 | **Omission** (NEW) | source→artifact | Which source objectives never appear in the artifact at all? | **1, and structurally invisible to C1–C6** |
| C4 | **Consistency** | pairs, incl. superseding docs | Does it contradict a sibling, or a document that supersedes it? | 1 |
| C3 | **Mechanism** | decisions | Can this be built as specified? | 0 unremediated — **users already run it by hand** |
| **C2** | **Derivation** (restored, re-scoped) | **tasks + delivery machinery** | Does it name the objective it serves? | 0 measured *on decisions* — but the population measured was wrong; see §3.2 |
| C6 | **Grounding completeness** | tasks | Does every task carry grounding? | 0 on coverage — largely satisfied already |

**Measured, not assumed (2026-08-13, 8 of 97 real TRDs, hand-classified by nature per §2.1).**
Unsourced objectives: **10 / 81 = 12.3%** (63 sourced, 8 domain-derived). Two of the eight TRDs
scored **zero**. An earlier regex estimate of 54% was an artifact of counting Redis TTLs and
descriptive percentages as objectives — the typing rule in §2 is what makes the number meaningful,
and is retroactively the most load-bearing decision in this document.

### 3.1 C5 dominates, and half of it is one repeated pattern

**5 of the 10 unsourced objectives are the same failure**: a coverage target above the
constitution's `unit ≥60% / integration ≥50%` floor, stated with no reason — 85/90/80/100/70, ≥80%,
≥80%, ≥80%+≥70%, ≥90%+≥80%. No PRD in the sample mentions coverage at all.

**The requirement traces to the constitution; the strictness traces to — the template.**

**Root cause corrected 2026-08-14.** This section originally said the strictness "traces to
nothing," inferring author behaviour from output. It traces to
`packages/core/commands/create-trd.md`, which hardcoded `Unit Tests ≥80%` /
`Integration Tests ≥70%` against a constitution floor of 60%/50%. The template contradicted
the governing document, and authors were following the template.

The corroborating evidence was already in this section and unexplained: *"the one TRD that
used the constitution's numbers verbatim is one of the two with zero unsourced objectives"*
— that is the one author who ignored the template. `implement-trd.md`'s delegation template
carried the same `or 80` / `or 70` fallback, making three coverage numbers in circulation.

This changes the fix. The narrow rule — *an objective exceeding a constitution floor must
state why* — still catches half of everything found, and shipped. But **the first-order fix
was deleting the hardcoded numbers**, which no amount of downstream verification would have
compensated for: a verifier would have flagged, every single run, a value the framework
itself injected.

Corroborating: the one TRD that used the constitution's numbers verbatim is one of the two with
zero unsourced objectives. And two latency budgets in the sample are labelled *"targets, not
enforced thresholds"* — the author declassifying severity by hand, which is C5 performed manually.

### 3.2 C2 is RESTORED and re-scoped; C3 is automating what users already do

**Corrected 2026-08-14.** C2 was dropped on a measurement error and has been restored.

The original finding — *"every Key Technical Decisions table sampled already ties its choice
to a named objective in a populated Rationale column"* — is true and irrelevant. The KTD
table is the **curated** part of a TRD, where authors write rationales because the column
exists. C2 was measured on the population least likely to fail.

**Invented delivery machinery does not live in the KTD table.** Feature flags, rollout
phases, migration paths, guard infrastructure and eval gates live in the Master Task List
and the phase plan. And §9.1 ranks that category **first, at ~55 hits** — more than four
times requirement invention.

The rule C2 enforces was already in §2's typing table — **"Task: must serve a named
objective or decision"** — and nothing enforced it, because the only check that would have
was removed. C6 checks grounding blocks, not objective-linkage.

**Re-scoped C2 applies to tasks and delivery structure**, and asks: *which objective does
this feature flag serve?* When the answer is "none — it's how we'd normally ship," that is
a finding, and it is the largest category on the list. Shipped as a mandatory `Serves`
column on the task tables and on the KTD table, plus a `derivation-audit` verifier.

C3 found nothing *unremediated*, which is different and does not justify dropping it — the users
are **already performing it manually**, and leaving evidence: *"terra efforts VERIFIED live =
{none,low,medium,high,xhigh}"*, and a TR flagged as *"requires explicit alignment with the GWR
owner"*. C3 automates an existing practice rather than introducing one.

**C4 and C5 are the ones a provenance readout alone cannot catch, and both bit hard.** B009 and D5
were *each* legitimately derived and only wrong together. A2 traced honestly to "don't break the
repo" — what was invented was *how strict it had to be*, and an unexamined severity is
un-negotiable in the wrong direction. "Zero tolerance" and "≤1 per run" are different
requirements; the gap between them is where unexamined strictness hides.

C4 is pairwise and therefore the expensive one. Scope it to declared dependencies plus objectives
that share a subject, rather than the full cross product.

---

### 3.3 C0 — the omission pass, and why the readout reorder was not enough

**The failure the six checks cannot see.** `poi-graph-transportation`'s TRD §7.2 is titled
*"Performance Budgets (PRD §5.1)"* and reproduces seven of the PRD's eight metrics verbatim and
correctly. The eighth — `Concurrent tool calls ≥50 RPS` — **is simply absent.** Nothing marks it
dropped, it is not in Non-Goals, and the section header claims the PRD as its source and looks
complete.

**C1–C6 all ask "does this line justify itself?" — a traversal that runs artifact→source. A
per-line audit cannot find a line that is not there.** Omission is only visible source→artifact,
and no amount of reordering the readout changes that.

This is the hole in §9.2. That section correctly established that *dropping* requirements (~20
instances) is commoner than *inventing* them (~12), and responded by moving "Missing / rescoped"
above "Unsourced" in the readout. **But nothing populates that heading.** As designed, item 10
would ship a prominent heading over a permanently empty section, for the failure class it names as
the larger one.

**C0 is the reverse pass:** enumerate the source's objectives, and assert each one either appears
in the artifact or is explicitly listed as a non-goal. Deterministic, findable-only, cheap, and the
same shape as the citation verifier in §3.5.

Frequency is exactly why it must be automated: **once in 81 objectives.** A rate that low is
invisible to review and catastrophic when it lands on the objective that mattered.

### 3.4 Supersession is scoped in headers and nowhere in the body

The same TRD opens with a well-written ⚠️ SUPERSEDED banner, correctly scoped to one dimension and
naming its authority. But its coverage table, performance budgets and entire Master Task List
remain in imperative voice with no per-line status. **A verifier run on that document alone
certifies roughly a dozen objectives for a retired design as faithfully sourced.**

C4 catches this only if the superseding document is in scope. Run per-artifact, it finds nothing.
24/61 PRDs carry supersession markers, so this is corpus-wide, not one document's quirk.
**C4's scope therefore includes any document that supersedes or is superseded by the one under
audit.**

### 3.5 Citation verifier (from §9.4)

For every cross-artifact citation, grep the referenced ID in the live target and fail on a miss.
The authors reached this independently — one PRD changelog records *"All cross-PRD AC citations
grep-verified."* Spot-checked on the most citation-dense TRD in the sample: **all citations
resolve**, including version-tracked ones.

### 3.6 Brownfield grounding — the TRD must land in the code that exists

Everything above governs whether a requirement is *legitimate*. This governs whether the plan is
*implementable in this repository* — a separate failure, and one `/create-trd` does not mention:
it contains **no** reference to reuse, deprecation, removal, or existing implementation.

**But the authors already do this, and pitching it as new capability would be wrong.** Audited
TRDs carry `Appendix A — Key files`, `Appendix B — Redis Key Reference`, inline
`responses.ts:1419` citations, ten regression test files named by path, explicit
*"Do NOT re-implement `needsGuestIdReconcile` — it's already correct"*, and — decisively — a
**§2.5 "Reuse Map (codebase reuse audit)"**, which is §3.6(b) already shipped by hand.

An implementer would **not** rediscover everything. What is missing is not the content but the
**keying by task ID** and the consumption point in the implementer's prompt. **Scope this as
restructuring existing practice, not introducing a capability.**

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

#### 3.6.1 Where it goes — additive, format-preserving

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

#### 3.6.2 Who produces it

**One `grounding` subagent, sequential after authoring** — not part of the parallel verify wave.
It is *generative* (it writes task context), and the rule that fan-out is for verification only
applies to it: a fanned-out grounding stage would produce four opinions about which code to reuse.

It runs after decisions exist, because grounding a decision that has not been made is meaningless.

#### 3.6.3 The check

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
     what becomes unreachable, and per-task context (§3.6).
     Emits the Task Grounding section. Existing TRD format untouched.

3. VERIFY                    6 subagents, parallel, read-only, none may invent
     conformance      does it violate stack.md / constitution.md?
     objective-audit  C1 + C5 — provenance and SEVERITY of every objective, against SOURCE.
                      C5 dominates: any objective exceeding a constitution floor must state why.
                      C5 also applies to the verifiers' OWN findings (§9.3).
     derivation-audit C2 (restored, §3.2) — does every task and every piece of delivery
                      machinery name the objective it serves?
     design-audit     C3 + C4 + C6 — buildability, consistency (incl. superseding docs), grounding
     omission-audit   C0 — enumerate SOURCE objectives, assert each appears or is non-goaled
     citations        every cross-artifact ID grep-verified in the live target

4. RECONCILE + READOUT       main agent
```

**There is no separate `grounding` verifier.** An earlier draft listed one asking "does this
already exist / contradict the codebase?" — that is stage 2's job (axis (a), consistency),
and stage 2 reads the codebase properly to answer it. `design-audit` carries the residual
half, C6: does every task have a grounding block, and is anything superseded left unnamed?
Running a verifier that re-asks stage 2's question would pay twice for one answer.

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

**Corrected 2026-08-14 — this section contradicted §9.5.** The sketch below previously used
headings like "Unsourced severities", "Decisions without a named objective" and
"domain-derived": pure classification register, in a document whose own §9.5 records that
readouts were rejected five separate times for exactly that, with *"I DO NOT UNDERSTAND what
action you expect me to take on these?"*

**Every heading names the action.**

```
TRD: docs/TRD/<feature>.md    SOURCE: docs/PRD/<feature>.md + stack.md + constitution.md

  DELETE — nothing in the source asks for these (2)
    A5     latency p95 <= 2000ms       no PRD line, no measurement, no user instruction
    NFR-9  99.9% uptime                no source

  LOWER TO THE CONSTITUTION FLOOR, or say why it's higher (1)
    Q-1    unit coverage >=90%         constitution floor is 60%; no reason given

  ADD BACK — in the PRD, missing from this TRD (1)
    PRD 5.1 concurrent tool calls >=50 RPS — not in the TRD, not in Non-Goals

  CANNOT BE BUILT AS WRITTEN (1)
    D5     runtime kill switch         a prompt hook runs no code that can read an env var

  PICK ONE — these contradict (1)
    B009 deletes the code D5's rollback path depends on

  CONFIRM THESE ARE WANTED — invented machinery, no objective named (1)
    T-12   staged rollout behind a flag  serves no stated objective

  CHECK THE REASONING — derived from the domain, not from a document (1)
    SEC-2  no PII across tenants        reasoning: multi-tenant by design

  NO ACTION — sourced, listed for completeness (6)
    ...
```

Ordered by how expensive the failure is to discover later. If a TRD produces 40 sourced
objectives, the *count* is the finding — print it as one line, not forty.

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
- The six checks run as verifier subagents — `objective-audit` (C1+C5), `design-audit`
  (C3+C4+C6), `derivation-audit` (C2), `omission-audit` (C0), `citations` — alongside
  grounding and conformance.
- C3 (buildability) runs on every decision — the cheapest check that was never performed.
- `/create-trd` emits the readout, unsourced objectives first, severities called out separately
  from requirements.
- `/create-trd-team` retired.
- Every task carries a grounding block; anything the plan replaces is named in a `Replaces` line.
- The existing Master Task List format is unchanged — grounding is additive, in its own section.
- Re-running against `docs/TRD/discipline-judgment.md` flags **7 of its 8** known
  fabrications. That TRD is the regression fixture — its failures are documented with
  receipts, which makes it the only honest test of whether this design works.

  **The permitted miss is named, so "passing" is unambiguous: B009's deferral premise.**
  Mapping §1's eight against the checks: A5 → C1/C5, §2.3 premise → C1, §3.1 floors → C5,
  A2/A3 framing → C5, A2 severity → C5, kill switch → C3, B009-vs-D5 → C4. That is seven.
  "B009 deferral premise — unverified premise" falls between C3 (buildability) and C4
  (contradiction) and is caught by neither. Do not treat 8/8 as the target; an
  implementation reporting 8/8 is more likely miscounting than exceeding the design.

- **Add a second fixture for the largest category.** The eight fabrications in
  `discipline-judgment.md` are all objective-shaped, which is why this design drifted toward
  the smallest category in §9.1's ranking — it optimised against the fixture it had. Take a
  corpus TRD carrying invented delivery machinery and confirm re-scoped C2 flags it.

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
into *decisions and delivery machinery* rather than requirement lines. C2/C3 and §3.6 target
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

- **§3.6(b) reuse is the most-repeated instruction in the corpus** — ≥8 times across three
  sessions: *"THE EXACT SAME BullMQ mechanism… DO NOT create another path"*, *"not reinventing
  anything!"*, *"We BUILT TOOLING"*.
- **§3.6(c) removal** — *"Don't disable it, delete the code so we don't have dead code lying
  around"*, *"get rid of dead code — and if it isn't dead, trace down why not"*.
- **C3 mechanism** — performed by the user because nothing else does: *"STOP. A 'real browser' is
  not how we access data in production. This exercise is useless if you cannot prove that you can
  hit that API using the infrastructure we have in place."*
- **C5 thresholds** — pre-empted by the user: *"Ensure we note that 10s is aspirational not
  absolute."*
- **§3.6(d) grounding-into-the-prompt is the strongest half.** The most emphatic re-litigation
  instance is a decision *in context, minutes old*, re-proposed anyway: *"You keep missing the
  point… I've stated repeatedly — WE'RE GOING TO REBUILD IT."* A Decisions section fixes
  information with nowhere to land; this is information that landed and was overridden.

**The strongest single validation:** three weeks before this design, the user hand-wrote its verify
wave as a command runner —

> `/refine-trd` Verify TRD creation remained true to functional requirements — **did not create new requirements nor drop any**… complete but not overengineered
> `/refine-trd` … **maximum code reuse, conformance with existing code patterns, deletion/deprecation of code no longer used, guard against overengineering**

That is C1 + C6 + §3.6(b) + §3.6(c), authored by the user, because the framework did not do it.

### 9.8 Out of scope, and it is the largest class

Category 1 — invented delivery machinery — mostly appears **during implementation, after the TRD
exists**. Item 10 types and audits the document; nothing types what an implementer adds:

> *"You — Claude — keep introducing these artificial gates and protections, and the result is we have built and ostensibly deployed features sitting dark."*

Recorded as the natural successor to item 10, not folded into it.


---

## 10. Deviations from this design, as shipped (2026-08-14)

Recorded so the document matches the code rather than the intent.

| # | Deviation | Why |
|---|---|---|
| 1 | **C2 restored**, re-scoped from decisions to tasks + delivery machinery | §3.2 — dropped on a measurement error. Targets §9.1's largest category |
| 2 | **Root cause of C5 corrected** — the template, not author judgment | §3.1. Fixed by deleting the hardcoded 80/70 from `create-trd.md` and the `or 80`/`or 70` fallback from `implement-trd.md` |
| 3 | **§3.6(d) shipped now, not deferred** | The design deferred grounding-into-the-prompt pending the item 7/8 implement-loop rework. Deferring it left the strongest half unbuilt behind items weeks away; the delegation-template change was hours. Accept doing it twice |
| 4 | **Typing lives in structured position** — mandatory `Serves` column on task tables and the KTD table | Item 7's parser can consume it. Typing in prose would have been re-derived |
| 5 | **Readout rewritten in action register** | §5 contradicted §9.5 |
| 6 | **Template surgery added ahead of the verifier wave** | Both designs proposed additive machinery against a failure whose largest component was deletable template text: an example `< 200ms`, a pre-filled WCAG line, required Performance/Risk tables, "all sections required", and diagram quotas |
| 7 | **Section numbering repaired**; the check count now says six | §3 was headed "five checks" over six rows; §3.3 was missing and §3.5 appeared twice |
| 8 | **The fixture's permitted miss is named** (B009's deferral premise) | §8 said "at least 7 of 8" without saying which, making "passing" ambiguous |
| 9 | **Verifiers write findings to disk and return one line; reconcile is its own subagent** | §10.1 |

**Not shipped, deliberately:** the Master Task List format is otherwise unchanged (§3.6.1),
since `/implement-trd` parses it today and item 7 reworks that consumption. Grounding is
additive, in its own section, keyed by task ID.


### 10.1 Where the orchestrator's context actually goes

Raised 2026-08-14: should the source package move to a fork, so review work does not clutter
main context?

**No — the source package is the one stage that belongs in the main agent.** Its input is
already there: a source document is one file read, and a session-derived brief involves no
tool calls at all, because the conversation *is* the input. There is nothing to offload.
Forking it would inherit **post-compaction** context and silently drop the oldest decisions —
P6's objection, applying with more force here than to the verifier, because the brief is the
only carrier for session-derived requirements. Forks also depend on the
`CLAUDE_CODE_FORK_SUBAGENT` feature flag, which P6 counted dropping as a benefit.

**The cost is at the other end**, in two places: six verifiers returning findings lists, and
reconcile re-reading and editing the draft to apply them.

Both are addressed without forks and without nesting:

- **Verifiers write findings to `.trd-state/<feature>/findings/<name>.json` and return one
  line.** The orchestrator holds six receipts instead of six findings lists.
- **Reconcile is its own subagent**, reading the findings files and the draft. It spawns
  nothing.

**Rejected: one agent doing the whole review wave.** That requires the agent to spawn the
verifiers, which `constitution.md` §1 forbids by default (revised 2026-08-14 against an
observed ~567k-token self-delegation chain). It remains available — the constitution provides
for a named fan-out rationale, and a six-verifier dispatch is close to its own canonical
example — but it is a deliberate governance act, not a default, and the cost it names is
exactly wrong for this command: *"a wrong conclusion several layers down arrives as a
confident summary with its reasoning discarded."* Item 10 exists to make manufactured
requirements visible. Findings on disk stay inspectable, diffable and citable by ID;
findings summarised through an intermediate agent do not.
