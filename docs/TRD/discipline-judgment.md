# Technical Requirements Document: Discipline-Hook Judgment

| Field | Value |
|---|---|
| Status | Draft |
| Created | 2026-08-13 |
| Owner | ensemble-vnext |
| Improvement-plan item | 5b (discipline hooks → `type: "prompt"`) |
| Branch | `feature/cc-modernization` |
| Depends on | 4.1.8 (`subagent-discipline.js`, `dispatch-ledger.js` shipped) |

---

## 1. Overview

### 1.1 Technical Summary

Three hooks decide whether an agent ended its turn with a claim it cannot honor:

| Hook | Event | Question it answers |
|---|---|---|
| `async-discipline.js` | `Stop` | Did the lead claim async work with no async machinery in flight? |
| `subagent-discipline.js` | `SubagentStop` | Did a subagent claim deferred work it is structurally incapable of? |
| `autonomy-discipline.js` | `Stop` | Did the command offer a mid-loop pause the autonomy rule forbids? |

All three answer it by matching regular expressions against the final assistant message. That
is pattern-matching applied to a question about **intent**, and in 4.1.8 it failed exactly the
way that mismatch predicts: a live subagent ended with *"Waiting on the monitor event for
completion."* and was not blocked, because every pattern and all 24 tests had been written with
"waiting **for**". The suite shared the implementation's vocabulary, so it confirmed the blind
spot rather than exposing it.

This TRD does **not** presuppose the fix. It commits to measuring the current detector and a
prompt-type alternative against one labeled corpus, under decision criteria fixed **before** the
numbers exist (§6.1), and then landing whichever wins — including "keep the regexes."

### 1.2 Problem Evidence

1. **A real miss.** "Waiting on the monitor event for completion." — not blocked, live, 4.1.8.
2. **A maintenance ratchet.** Every miss becomes another regex; every regex widens the
   false-positive surface.
3. **Most of the complexity is self-inflicted.** `lib/async-claim-detector.js` strips fenced
   code blocks, inline code spans, double-quoted strings, and boundary-checked single-quoted
   strings, then consults ~12 meta-markers (`for example`, `the phrase`, `e.g.`).
   `subagent-discipline.js` adds a second bypass list (`SELF_DOC_MARKERS`). **None of that
   machinery serves the rule** — it exists solely to stop the regexes firing on text that
   *discusses* the rule. It is accident, not essence, and a semantic judge would need none of it.

### 1.3 Key Technical Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Evidence before implementation | The current detector has never been measured. Replacing an unmeasured thing with an unmeasured thing is not an improvement. |
| D2 | Decision criteria fixed before results | Prevents the outcome being rationalized after the fact. |
| D3 | Keep a command-type structural pre-gate regardless of outcome | `background_tasks` non-empty is a *fact*, not a judgment; spending a model call on it is waste. |
| D4 | Loop safety is a hard gate, not a metric | A judge that can wedge a session is worse than a detector that misses. |
| D5 | Corpus drawn from real transcripts, not authored examples | Authored cases reproduce the author's vocabulary — the precise failure being fixed. |

### 1.4 Platform Constraints (verified 2026-08-13, not from the hooks reference)

- **`type: "prompt"` and `type: "agent"` hooks are supported on `Stop` and `SubagentStop`
  only.** The CLI changelog records agent-type hooks failing *"for events other than `Stop` or
  `SubagentStop`"*, and a config error directing `SessionStart`/`Setup`/`SubagentStart` to use
  command-type instead. The three hooks in scope sit on exactly the two supported events.
- **Prompt-type Stop hooks are evaluated by a small fast model.** The changelog references
  *"the small fast model returns `ok:false`"* for prompt-type Stop hooks. Judgment quality is a
  small model's, and this is the central risk (§7 R1).
- **A prompt-type hook does not execute project code.** The per-`agent_id` consecutive-block
  cap in `subagent-discipline.js` — the mechanism that makes blocking safe — has no equivalent
  in a pure prompt-type hook. See §7 R2; resolving this is DISC-B003 and gates the whole thing.

### 1.5 Integration Points

- `packages/core/hooks/{async,autonomy,subagent}-discipline.js`
- `packages/core/hooks/lib/async-claim-detector.js` (the shared pattern battery)
- `packages/core/hooks/hooks.manifest.json` → generated `settings.json` (a `type` field per hook
  is a manifest schema change; the generator currently hardcodes `"type": "command"`)
- `.claude/rules/async-discipline.md`, `.claude/rules/autonomy.md`
- `.claude/rules/constitution.md` principle 4 and prohibited-pattern 4 (see §7 R3)

---

## 2. System Architecture

### 2.1 Current

```
Stop / SubagentStop
   → command hook (node)
       → strip code spans / quotes            ┐
       → check meta-markers                   │ exists only to protect the regexes
       → check self-doc markers               ┘
       → match ~17 regexes
       → check background_tasks / session_crons
       → per-agent_id block cap
       → allow | block(reason)
```

### 2.2 Candidate: two-tier

```
Stop / SubagentStop
   → [tier 1] command hook (node, ~5ms, no tokens)
       → escape valve present? (background_tasks non-empty)  → ALLOW, stop here
       → loop cap reached for this agent_id?                 → ALLOW, stop here
       → otherwise: fall through
   → [tier 2] prompt hook (small fast model)
       → "did this message defer work the agent cannot perform?"
       → allow | block(reason)
```

Tier 1 keeps every judgment that is actually a fact, and keeps the loop guard in code we
control. Tier 2 answers only the semantic question. The regex battery and the entire
code-span/quote/meta-marker apparatus are deleted **only if** tier 2 wins (§6.1).

### 2.3 Considered alternative: change the question

For subagents specifically, the current question ("did it claim deferred work?") is a proxy.
The failure that motivated the guard was *an agent burning 240k tokens and returning nothing
usable*. The direct question is **"did this return a usable result?"** — which a judge can
answer and a regex cannot, and which catches failures that use no deferral vocabulary at all.

Recorded as a candidate for the tier-2 prompt (DISC-B001), not a separate work stream. Deciding
between the two phrasings is part of DISC-T002.

---

## 3. Technical Specifications

### 3.1 Corpus (`test/discipline-corpus/`)

JSONL, one case per line:

```json
{"id": "...", "source": "...", "event": "SubagentStop", "text": "...", "label": "violation|clean", "class": "...", "note": "..."}
```

Sourced from real transcripts under `~/.claude/projects/**/` — lead transcripts and
`subagents/agent-*.jsonl`. Authored cases are permitted **only** for the hard-negative classes
below, and must be marked `source: "authored"`.

Required classes, with the count floor each must meet before Phase 1 closes:

| Class | Label | Floor | Why it must be represented |
|---|---|---|---|
| `deferral-explicit` | violation | 10 | The base case ("I'll report back when done"). |
| `deferral-novel-phrasing` | violation | 5 | Must include the live 4.1.8 miss verbatim. |
| `no-result-returned` | violation | 5 | The §2.3 failure shape — no deferral vocabulary. |
| `clean-completion` | clean | 15 | Ordinary successful returns. |
| `self-documentation` | clean | 10 | **The hard negatives.** This project's own rule files and this session's meta-discussion. A judge that blocks these makes the repo unmaintainable. |
| `incidental-vocabulary` | clean | 5 | "the user is waiting for a response", "waiting rooms are implemented". |

### 3.2 Scoring harness (`test/discipline-corpus/score.js`)

`node score.js --detector <regex|prompt> [--json]` → per-class precision/recall, a per-case
table for every miss and false positive, and wall-clock per case. Detector-agnostic: it takes
text in and a verdict out, so both implementations are scored by identical code.

### 3.3 Tier-2 judge

Authored as a prompt with the rule's *reasoning* rather than its vocabulary. Must state the
structural fact that makes subagent deferrals false by construction (`ScheduleWakeup` is removed
from every subagent), and must explicitly permit text that discusses the rule.

### 3.4 Manifest schema change

`hooks.manifest.json` entries gain an optional `"hookType": "command" | "prompt"` (default
`"command"`). `generate-hooks-artifacts.sh` emits it. Required only if tier 2 lands.

---

## 4. Master Task List

### 4.1 Phase 1 — Evidence

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| DISC-P001 | Corpus extractor | Script pulling final assistant messages from local transcripts into candidate cases, with provenance | None | backend-implementer |
| DISC-P002 | Label the corpus | Meet every class floor in §3.1; the 4.1.8 live miss included verbatim | DISC-P001 | backend-implementer |
| DISC-P003 | Scoring harness | `score.js` per §3.2, detector-agnostic | DISC-P001 | backend-implementer |
| DISC-T001 | Baseline the regexes | Score the CURRENT battery; record the table in §8 | DISC-P002, DISC-P003 | verify-app |

### 4.2 Phase 2 — Alternative

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| DISC-B001 | Author the judge prompt | Per §3.3; trial both §2.3 phrasings | DISC-T001 | agent-implementer |
| DISC-B002 | Structural pre-gate | Tier-1 command hook: escape valves + loop cap only, no pattern matching | DISC-T001 | backend-implementer |
| DISC-B003 | **Loop-safety resolution** | Determine EMPIRICALLY whether `stop_hook_active` alone bounds a prompt-type block loop. If not, design and build the compensating mechanism. **Hard gate — §6.1 fails closed if unresolved.** | DISC-B001 | backend-implementer |
| DISC-T002 | Score the judge | Same corpus, same harness; both prompt phrasings | DISC-B001, DISC-P003 | verify-app |
| DISC-T003 | Latency measurement | Added wall-clock at turn end, p50/p95, ≥20 real turns | DISC-B001 | verify-app |

### 4.3 Phase 3 — Decision

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| DISC-P004 | Apply §6.1 criteria | Record verdict + numbers + rationale in §8. A "keep the regexes" verdict is a valid, successful outcome | DISC-T002, DISC-T003, DISC-B003 | technical-architect |

### 4.4 Phase 4 — Land

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| DISC-B004 | Implement the verdict | Apply across all three hooks consistently | DISC-P004 | backend-implementer |
| DISC-B005 | Manifest `hookType` | Schema + generator support | DISC-P004 | backend-implementer |
| DISC-B006 | Delete what died | If tier 2 won: remove the regex battery and the code-span/quote/meta-marker apparatus. If it lost: widen patterns from DISC-T001 misses instead | DISC-B004 | code-simplifier |
| DISC-T004 | Full regression | CI-scoped jest, BATS, smoke; corpus score must not regress | DISC-B004, DISC-B006 | verify-app |
| DISC-D001 | Update the rules | `async-discipline.md`, `autonomy.md`, constitution §7 R3 note, improvement-plan 5b | DISC-P004 | backend-implementer |

---

## 5. Execution Plan

### 5.1 Phase 1 — Evidence

`DISC-P001` → `P002`, `P003` → `T001`. No production behavior changes. Ends with a measured
baseline for a detector that has never been measured.

### 5.2 Phase 2 — Alternative

`DISC-B001`, `B002` in parallel → `B003` → `T002`, `T003`. Behind a flag; default behavior
unchanged.

### 5.3 Phase 3 — Decision

`DISC-P004`. Single gate.

### 5.4 Phase 4 — Land

`DISC-B004` → `B005`, `B006` → `T004`, `D001`.

### 5.5 Critical path

`P001 → P002 → T001 → B001 → B003 → T002 → P004 → B004 → T004`

### 5.6 Parallelization

`P003` runs alongside `P002`. `B001`/`B002` are independent. `T003` runs alongside `T002`.

---

## 6. Quality Requirements

### 6.1 Decision criteria — FIXED BEFORE MEASUREMENT

Tier 2 replaces the regexes **only if all four hold**:

| # | Criterion | Threshold |
|---|---|---|
| C1 | Recall on violations | ≥ regex baseline, and **must** catch `deferral-novel-phrasing` including the 4.1.8 live miss |
| C2 | False positives on `self-documentation` + `incidental-vocabulary` | ≤ regex baseline, **and zero** on `self-documentation` |
| C3 | Added latency at turn end | p95 ≤ 2000 ms |
| C4 | Loop safety | DISC-B003 demonstrates a bounded block loop — **fails closed if unproven** |

C2's zero-tolerance is deliberate: a judge that blocks the repo's own rule documentation makes
this project unmaintainable, and that text is unusually abundant here.

If C1–C4 do not all hold, the verdict is **keep command-type**, widen the battery from DISC-T001
misses, and record why in §8. That is a successful outcome of this TRD, not a failure.

### 6.2 Standing gates

- CI-scoped jest and BATS at or above 4.1.8 (359 jest; 364 BATS with only the 4 pre-existing failures)
- Smoke `hooks-health`, `scaffold-integrity`, `artifact-contracts` PASS
- `generate-hooks-artifacts.sh --check` exits 0
- No hook may fail a session: exit 0 on every path, including a judge/API error

---

## 7. Risk Assessment

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | The small fast model judges poorly | Replaces a known-brittle detector with an unpredictable one | C1/C2 measured on one corpus; zero tolerance on `self-documentation` |
| R2 | **Prompt-type hooks lose the per-`agent_id` block cap** | A misfiring judge could wedge a session — strictly worse than the failure being guarded | DISC-B003 is a hard gate; tier 1 retains the cap in code we control |
| R3 | Erodes the deterministic layer | Constitution principle 4 makes hooks the testable part of a non-deterministic system; a model-judged hook is a real departure | Tier 1 stays deterministic and unit-tested; if tier 2 lands, principle 4 must be amended explicitly (DISC-D001) — **requires user approval per the constitution's own approval rules** |
| R4 | Corpus reproduces my vocabulary | The exact failure being fixed | Real transcripts only, except marked hard negatives (D5) |
| R5 | Latency on every turn end | Tax on all work, not just violations | C3; tier 1 short-circuits the common clean case before any model call |
| R6 | Judge cost per turn | Ongoing token spend | Measured in DISC-T003; tier 1 short-circuit bounds it |

---

## 8. Results

*Populated by DISC-T001, DISC-T002, DISC-T003, DISC-P004. Empty until Phase 1 completes.*

| Detector | Recall | FP (self-doc) | FP (incidental) | p95 latency |
|---|---|---|---|---|
| regex (baseline) | — | — | — | — |
| prompt (judge) | — | — | — | — |

**Verdict:** *pending DISC-P004.*

---

## 9. Non-Goals

- **Not** rewriting what the rules *say*. `async-discipline.md` and `autonomy.md` keep their
  current meaning; only the detection mechanism is in scope.
- **Not** touching `dispatch-ledger.js`, `status.js`, `wiggum.js`, or `precompact.js`.
- **Not** fixing the 4 pre-existing BATS failures or the `status.test.js` / `wiggum.test.js`
  suites (41 known-failing, excluded from CI).
- **Not** item 5d (`InstructionsLoaded`) — separate item, deliberately deferred behind this.
- **Not** a general eval framework. The corpus is scoped to this one decision; `test/evals/`
  stays dormant per its README.
