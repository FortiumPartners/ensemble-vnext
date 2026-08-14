# Item 10 — the PRD path

**Status:** SHIPPED 2026-08-14. Scope was `/create-prd`, `/create-prd-team`, `/refine-prd`.
Deviations are recorded in §9.
The TRD path is deliberately separate — see §7.

Parent: `docs/modernization/2026-08-improvement-plan.md` item 10.

---

## 1. What this fixes

Requirements that nobody asked for. Not a hypothetical: `docs/TRD/discipline-judgment.md` carried
**eight** of them, and each was caught only after work had been spent proving it.

Once a requirement is written down, nothing downstream challenges it. `spec-planner`,
`/implement-trd` and `verify-app` all treat an artifact line as legitimate by construction. So a
fabricated requirement is *executed*, not examined.

The failure has a mirror image that is worse, and it is why this design does not simply add a
critic. A challenger agent manufactures **objections** the same way an analyst agent manufactures
requirements — by filling the role it was handed. In practice that means striking valid
requirements and proposing "simplifications" that contradict the spec. Deleting a real requirement
is harder to detect than adding a fake one.

**Both failures share one cause: an agent asked an open-ended question produces output to fill the
role.** Every mandate in this design is therefore *findable* — each finding names a source and is
verifiable in seconds — and no stage may invent or strike on judgment.

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| P1 | **Retire `/create-prd-team`.** One command. | Two of its three teammates are briefed additively — a `tech-feasibility` agent asked for "performance/security implications" will produce performance requirements for a login page whether or not any were asked for. Its synthesis rule (*"where teammates disagree, pick the more conservative recommendation"*) is a ratchet: conservative means more. There is no path in that command by which a requirement is dropped. |
| P2 | **Subagents, not teammates.** | These are short, independent, read-only analyses returning findings to one caller. No task-list mutation, no coordination. The team model would add the `SendMessage` plumbing that `create-prd-team.md` spends a third of its length warning about, for nothing. |
| P3 | **Authoring is one specialist subagent, fresh context.** | Fresh context plus expertise. A PRD is synthesis and needs one voice; three merged reports produce a stitched document. |
| P4 | **Fan-out for verification only, never generation.** | This is the load-bearing rule. Independent agents demonstrably outperform a single one when *verifying and challenging* and manufacture when *generating*. The current `-team` command has this exactly backwards. |
| P5 | **Verify against SOURCE, never against the brief.** | The brief is derived. Verifying the PRD against it only proves the PRD is faithful to the lead's summary — a dropped or invented requirement in the brief gets *certified*. Circular. |
| P6 | **Source-fidelity reads the transcript file, not a fork.** *(Qualified — see below.)* | A fork inherits *post-compaction* context. Long design conversations are exactly where rejected paths are numerous **and** the session has compacted, so a fork systematically loses the oldest decisions. The transcript JSONL is the complete record. Also drops the `CLAUDE_CODE_FORK_SUBAGENT` feature-flag dependency. |
| P7 | **The challenger's mandate is provenance, not opinion.** | *"REQ-4 traces to nothing in the source"* is checkable. *"I think REQ-4 is unnecessary"* is manufactured. Only the first is permitted. This makes striking a valid requirement structurally impossible. |

### 2.1 P6 qualified — a single transcript is not the whole source

**Corrected 2026-08-14**, against `item-10-trd-path.md` §9.6, which was written after this
table and contradicts it.

P6 assumes one session produced the requirements. **This user runs concurrent sessions on
one product**, and the corpus contains a live instance of the resulting failure — a finding
from a different session leaking in as fact, corrected with *"the invariant IS NOT INVERTED.
that's for a different session."*

So a single transcript path is both **incomplete** (decisions reached elsewhere are absent)
and a **contamination vector** (material from an unrelated effort reads as authoritative).

P6's core claim stands — read the transcript file, not a fork, because a fork inherits
post-compaction context and systematically loses the oldest decisions. What does not stand
is treating one transcript as the complete record:

- Record the transcript path(s) in the PRD header, plural where applicable.
- Where a requirement traces only to session material, cite **which** session.
- On refinement, source = original source ∪ the rulings cited in the changelog
  (`item-10-trd-path.md` §9.6).
- A finding that cannot be located in the named source is not a finding. A verifier must
  not import context from elsewhere on the strength of recognising it.

---

## 3. Workflow

```
0. RESOLVE SOURCE              main agent
     document / spec / ticket path  → source = that artifact
     session-derived                → source = transcript JSONL, path recorded in the PRD

1. SOURCE PACKAGE              main agent
     Distillation is a LOSSY transform. Apply it only where there is no
     alternative — paraphrasing a faithful source manufactures drift.

     a) A source document exists (user story, spec, ticket, design doc)
        → pass it through VERBATIM and UNALTERED to the author and to every
          verifier. Do NOT summarise, restate, or "clean up". No brief.
          The document IS the source package.

     b) Defined in session (discussion, spikes, decisions reached live)
        → distil a brief, because nothing else can carry it.
          docs/PRD/<feature>.brief.md — an authoring input and a checkable
          claim about the transcript, NOT the baseline.

     c) BOTH — the common case: a ticket, then refined in conversation
        → verbatim document PLUS a brief covering ONLY the in-session delta,
          clearly separated. The brief must not restate the document.

2. AUTHOR                      1 subagent (product-manager, fresh context)
     Sees the SOURCE PACKAGE verbatim + repo.
     Where a source document exists it reads the real thing, not a summary of it.
     Writes the draft including the new Decisions section (§4).

3. VERIFY                      3 subagents, parallel, read-only
     grounding        does this already exist / contradict the codebase or docs?
     conformance      does it violate stack.md / constitution.md?
     source-fidelity  BOTH directions, against SOURCE:
                        source → PRD : which decisions, rejections and requirements are missing?
                        PRD → source : which requirements trace to nothing?

4. RECONCILE + READOUT         main agent
     Apply findings, emit the readout (§5), then COMMAND COMPLETE.
```

**Placement and why:**

| Stage | Where | Why there |
|---|---|---|
| Resolve, Brief | main agent | Only thing holding the conversation |
| Author | one subagent, fresh | P3 |
| grounding, conformance | subagents, fresh | Fresh context is a *feature* — they cannot be primed by the discussion that produced the draft |
| source-fidelity | subagent, fresh + transcript read | P6 |
| Reconcile | main agent | Orchestrator owns the artifact (`constitution.md` §1) |

**Stage 3 runs on every invocation.** No complexity threshold — a threshold rule is itself an
unsourced requirement, and it would skip verification exactly when a one-line prompt got
elaborated into something large. Verifiers are instructed to return empty quickly on a small draft.

---

### 3.1 Why the source package is split this way

The two classes of requirement carry different risk, and separating them makes that visible:

| Provenance | Risk | Scrutiny |
|---|---|---|
| Verbatim from a source document | Low — someone wrote it down deliberately, outside this session | Light. Drift is the only failure, and passing it through unaltered eliminates that. |
| Distilled from session discussion | **High** — this is where requirements get invented, and where an aside becomes an acceptance criterion | This is what the source-fidelity verifier is actually for. |

So a requirement in the finished PRD traces to exactly one of three things: **the source document**
(cite it), **the session brief** (cite the section), or **nothing** (delete it). The middle class is
the one needing review, and splitting the package makes it identifiable at a glance rather than by
inference.

**Verifiers receive the same verbatim package.** Source-fidelity comparing a PRD against a
paraphrase would certify faithfulness to the paraphrase — the same circularity that made verifying
against the brief wrong in the first place (P5). Where a source document exists, that document is
what the check runs against.

## 4. Standardise the existing convention — the "structural gap" claim was false

**Corrected 2026-08-13 against 61 real PRDs.** This section previously claimed a PRD "structurally
cannot record 'we considered X and rejected it because Y'". That is **empirically wrong**, and it
would have cost credibility with the authors who solved it months ago.

**13 of 15 sampled PRDs record decisions and rejected alternatives.** The other 2 use the
changelog. **Zero had nowhere to put it.**

| Convention | Corpus |
|---|---|
| `Appendix A — Team Analysis Notes` (disagreements & resolutions) | 31/61 |
| Explicit disagreement section (`§8.2`, `Appendix C — Disagreements and How They Were Resolved`) | 28/61 |
| Dedicated rejections heading (`Devils-advocate challenges rejected`, `4.3 Explicitly Considered and Rejected`, `9.2 Rejected / Deferred`) | 8/61 |
| Changelog with supersession markers | 60/61 (24/61 with supersession) |

Their format is **better than what was proposed here** — challenge, verdict, rationale, and a
**revisit condition**:

> | "Promote geofence triggers to P0" | …adds significant scope; LLM can infer from raw coords. **Revisit in v2 with eval data showing where the LLM struggles.** |

A rejection without a revisit condition reads as permanent and gets re-litigated the moment
conditions change — the exact failure this section exists to prevent. Three PRDs also invented an
anti-relitigation marker (`Appendix C: Confirmed grounding (do not re-litigate)`), and 7/61
hand-roll provenance with a `*Source: …*` footer.

**So: standardise theirs, do not invent a section.** Adopt the container name, the revisit-condition
column, the `DO NOT relitigate` marker, and the source footer. A fresh `## Decisions` section would
orphan 31 PRDs of working convention.

### 4.1 Replace the NFR quintet — do not delete it

Manufactured NFRs are **concentrated, not endemic**: 26 of 31 quantified NFRs across 15 sampled
PRDs are unsourced, but **all 26 come from 6 files**, and 9 of 15 PRDs have none. They track a
single template structure — §5's `Performance / Security / Accessibility / Scalability /
Integration` quintet.

**The categories are the problem, not the section.** Five named subsections are five prompts to
fill, and an author facing "5.1 Performance Requirements" above an empty table will produce a
latency figure. The template makes it worse by supplying the anchor itself —
`| [e.g., Response time] | [e.g., < 200ms] |` — and by pre-filling
`WCAG 2.1 AA compliance (if applicable)`. That is not a container for requirements; it is a
generator of them. The authors sensed this and marked two subsections `(optional)`, but "optional"
is weak against a heading that exists.

The worst instance is `poi-graph-transportation.md` §5.1: **"Concurrent tool calls ≥ 50 RPS without
OSRM degradation | Staging load test"** — an RPS target *and* a load test, for a product the same
corpus repeatedly documents as *"pre-beta, one real party"*.

**Deleting the section outright would be the mirror-image failure this design exists to prevent.**
A real non-functional requirement — *"must handle 10k concurrent users"*, *"must not lose a
payment"* — needs somewhere to land. Suppressing it is as damaging as inventing one, and §9.2
established that dropping requirements is the commoner failure.

**Replace it with:**

- **One section, no category scaffolding.** The five named subsections go; non-functional
  requirements are listed as they arise.
- **No example values.** Never `< 200ms`. An example number is an anchor, and anchors get adopted.
- **A source per entry** — the PRD text it came from, `stack.md`, `constitution.md`, or a
  measurement. Same rule as every other objective.
- **Empty is a legitimate, expected outcome**, stated in the template so an author does not read
  emptiness as incompleteness. Most features have no non-functional requirements anyone asked for.

A sourced NFR passes through unchanged. An invented one has nothing prompting it into existence and
no source to cite if it appears anyway.

Counter-evidence worth preserving: several authors already refuse to invent numbers —
*"The generalist agent turn floor is 12.9–17.3s measured; do not set responsiveness SLAs that
include a fresh turn at the client tail"* — and one labels an unverified claim **"Belief, not
fact"** pending a named spike. Promote that marker into the template; it is a cheaper, always-on
version of the source-fidelity stage.

## 5. The derived-requirements readout

Emitted at `COMMAND COMPLETE`. One screen. Length is load-bearing: a three-page readout is not
read, and an unread guard is worse than none because it looks like coverage.

```
SOURCE: <transcript path | document path>

  Missing / rescoped (1)   ← FIRST: dropping a real requirement is commoner than inventing one
    Source records an LLM rewrite of descriptions; PRD does not carry it.

  Unsourced (2)   ← default is removal
    REQ-7   Latency p95 <= 2000ms          traces to nothing in source
    NFR-3   99.9% uptime target            traces to nothing in source

  Derived (5)
    NFR-2   Postgres for persistence       <- stack.md
    B-4     Idempotency on the webhook     <- existing pattern, packages/api/webhooks/
    ...

  Missing from PRD (1)
    Source records rejecting a queue-based design (cost); PRD does not say so.
```

Unsourced items are listed **first and as deletion candidates**. Stated is not printed — it needs
no review. If a PRD produces 40 derived requirements, the count itself is the finding.

---

## 6. Interactive and non-interactive modes

`/refine-prd` is unconditionally interactive today (*"User Interview (REQUIRED)"*), and
`autonomy.md` exempts it wholesale on that basis. That exemption is why the challenge cannot run
where it is most needed — a fabricated requirement is *most* dangerous unattended, because nobody
is there to ask "what's the impact of this?"

| Mode | Behaviour |
|---|---|
| **Interactive** (default when a human invoked it) | Run the checks, present findings, ask, apply. **Deletion becomes a first-class outcome**, which it is not today. |
| **Non-interactive** | Same checks, deterministic resolution: unsourced requirements **removed** and listed; contradictions raised as STUCK; mechanism failures reported with evidence. One readout, no questions. |

**The autonomy exemption must become conditional on mode, not command name.** A non-interactive
`/refine-prd` that stops to ask is the defensive-checkpointing anti-pattern `autonomy.md` forbids,
and today's blanket exemption would permit it. In non-interactive mode "this requirement has no
source" is explicitly *not* grounds to ask — the deterministic resolution is to remove it and say so.

---

## 7. Not in scope

- **The TRD path.** Same disease, worse prognosis, and it needs checks this design does not have.
  A PRD *records*; a TRD *derives* — one PRD line becomes N technical requirements and every
  derivation is an invention opportunity. All eight of `discipline-judgment.md`'s bad requirements
  were TRD requirements. It also needs the mechanism, consistency and threshold checks (a
  provenance readout alone would have passed B009-vs-D5, since both were legitimately derived, and
  A2's "zero tolerance", where the requirement was real and the *severity* was invented).
- `/create-trd-team` consolidation — same analysis, separate change.
- Item 11's learning loop beyond the Decisions section.

---

## 8. Done when

- One `/create-prd`; `/create-prd-team` retired.
- Authoring runs in a single fresh `product-manager` subagent.
- Three verifier subagents run in parallel, each with a findable-only mandate.
- Source-fidelity verifies against source material — transcript or document — never the brief.
- The PRD template has a Decisions section with rejected alternatives.
- `/create-prd` emits the readout with unsourced items first.
- `/refine-prd` has both modes; the `autonomy.md` exemption is conditional on mode.
- Re-running the current commands on an existing PRD identifies which of its requirements would
  not survive the source test.


---

## 9. Deviations from this design, as shipped (2026-08-14)

| # | Deviation | Why |
|---|---|---|
| 1 | **P6 qualified** for concurrent sessions | §2.1 — `item-10-trd-path.md` §9.6 contradicted it and was written later |
| 2 | **Template surgery ahead of the verifier wave** | The NFR quintet was not merely a bad container: `create-prd.md` shipped `\| [e.g., Response time] \| [e.g., < 200ms] \|` as an anchor and pre-filled `WCAG 2.1 AA compliance`. §4.1 identified the categories; the example values were doing comparable damage |
| 3 | **Readout in action register** | `item-10-trd-path.md` §9.5 — classification headings were rejected five times |
| 4 | **"Belief, not fact" promoted into the template**, as §4.1 recommended | Cheapest always-on version of the source-fidelity check |
| 5 | **Verifiers write findings to disk and return one line; reconcile is its own subagent** | See `item-10-trd-path.md` §10.1. The source package stays in the main agent — forking it would inherit post-compaction context and drop exactly what the brief exists to carry |
| 6 | **Decisions section named "Decisions and Rejected Alternatives"** rather than adopting `Appendix A — Team Analysis Notes` verbatim | §4 recommended standardising the corpus convention, but the container name referenced a team that P1 retires. The *format* — challenge / verdict / rationale / **revisit condition** — is adopted exactly, along with the do-not-re-litigate marker |

**Confirmed by shipping:** §4's correction was right and worth the credibility it saved.
The convention existed; the format the authors converged on — especially the revisit
condition — is better than a bare verdict, and is what got standardised.
