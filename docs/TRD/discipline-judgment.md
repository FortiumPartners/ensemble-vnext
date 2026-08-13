# Technical Requirements Document: Discipline-Hook Judgment

| Field | Value |
|---|---|
| Status | Approved for execution |
| Created | 2026-08-13 |
| Owner | ensemble-vnext |
| Improvement-plan item | 5b (discipline hooks → `type: "prompt"`) |
| Branch | `feature/cc-modernization` |
| Depends on | 4.1.8 (`subagent-discipline.js`, `dispatch-ledger.js` shipped) |

---

## 1. Overview

### 1.1 Decision (settled — not revisited by this TRD)

**The three discipline hooks move from regex matching to model judgment.** Regular expressions
are the wrong tool for a question about intent, and 4.1.8 demonstrated it in production: a live
subagent ended with *"Waiting on the monitor event for completion."* and was not blocked,
because every pattern and all 24 tests had been written with "waiting **for**". The suite shared
the implementation's vocabulary, so it confirmed the blind spot rather than exposing it.

This document specifies **how to build and prove that replacement**. It does not evaluate
whether to do it.

Deleted along with the regexes: the entire apparatus that exists only to protect them —
`lib/async-claim-detector.js`'s code-span stripping, quote stripping, and ~12 meta-markers, plus
`subagent-discipline.js`'s `SELF_DOC_MARKERS`. None of it serves the rule; it exists solely to
stop the patterns firing on text that *discusses* the rule.

### 1.2 Scope

| Hook | Event | Judgment it must make |
|---|---|---|
| `async-discipline.js` | `Stop` | Did the lead claim async work with no async machinery in flight? |
| `subagent-discipline.js` | `SubagentStop` | Did a subagent claim deferred work it is structurally incapable of, or return no usable result? |
| `autonomy-discipline.js` | `Stop` | Did the command offer a mid-loop pause the autonomy rule forbids? |

All three convert. Converting one and leaving two would leave the shared library alive for a
single consumer and make the deletion in §4.4 impossible.

### 1.3 Key Technical Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Probe platform mechanics before writing the hook (Phase 1) | The design branches on facts not in the docs — see §2.1. Building first would mean rebuilding. |
| D2 | Corpus is an **acceptance suite**, not a bake-off | It defines what "working" means for the judge and catches regressions. It does not decide the approach. |
| D3 | Corpus text comes from real transcripts | Authored cases reproduce the author's vocabulary — the exact failure being fixed. |
| D4 | Escape valves expressed wherever the probe says they can be | If a command hook cannot gate a prompt hook, `background_tasks` logic moves into the judge prompt (which receives it in the payload). §2.2. |
| D5 | Ship with a kill switch | Operational rollback, not indecision: one env var restores the previous behavior if the judge misbehaves in the wild. |
| D6 | Constitution principle 4 is amended as a task | Approved by the user 2026-08-13. No longer a risk. |

### 1.4 Platform Facts (verified 2026-08-13)

- `type: "prompt"` and `type: "agent"` hooks are supported on **`Stop` and `SubagentStop` only**.
  All three hooks in scope already sit on those two events.
- Prompt-type Stop hooks are evaluated by a **small fast model** (the changelog references
  *"the small fast model returns `ok:false`"*).
- A prompt-type hook **does not execute project code**, so the per-`agent_id` consecutive-block
  cap in `subagent-discipline.js` has no direct equivalent. Its replacement is determined by
  DISC-P003.

---

## 2. System Architecture

### 2.1 Unknowns that determine the design (Phase 1 resolves; do not guess)

| # | Question | Why the design branches on it |
|---|---|---|
| U1 | When several hooks are registered on one event, do **all** run, and does any single `block` win? | Decides whether a cheap command-type gate can short-circuit the model call at all. |
| U2 | What payload does a prompt-type hook receive — does it include `background_tasks`, `session_crons`, `stop_hook_active`, `agent_id`? | If yes, the escape valves live in the prompt and no command tier is needed. If no, they must stay in a command hook. |
| U3 | Does `stop_hook_active` bound a prompt-type block loop? | This is the loop guard once the per-`agent_id` cap is gone. **Hard requirement:** a bounded loop must be demonstrated before conversion lands. |
| U4 | Does the block `reason` from a prompt-type hook reach the agent on both events? | The whole value of blocking is that the agent corrects course. Verified for command-type on `SubagentStop` in 4.1.7; unverified for prompt-type. |

These are probes against a live CLI, in the manner of the `SubagentStart` payload probe that
produced 4.1.8's design — the hooks reference has been wrong or silent on every payload question
this project has asked of it.

### 2.2 Target shape (branch selected by Phase 1)

**Shape A — judge-only** (if U2 confirms the prompt hook sees the full payload):

```
Stop / SubagentStop
   → prompt hook (small fast model), receives full payload
       → escape valves stated as prompt conditions (background_tasks non-empty → allow)
       → semantic judgment
       → allow | block(reason)
```

**Shape B — command gate + judge** (if U2 is negative and U1 permits short-circuiting):

```
Stop / SubagentStop
   → command hook: escape valves + loop cap  → allow, short-circuit
   → prompt hook: semantic judgment only
```

Shape A is preferred — fewer moving parts, and the escape valves become part of the judgment
rather than a separate code path. Shape B is the fallback. If U1 shows a command hook *cannot*
gate a prompt hook and U2 is negative, Shape A is forced and the loop guard rests entirely on U3.

### 2.3 What the judge is asked

The prompt encodes the rule's **reasoning**, never its vocabulary — the vocabulary is what
failed. It must:

1. State the structural fact for subagents: `ScheduleWakeup` is removed from every subagent by
   the platform's tool filter, so a subagent's claim to "come back later" is false **by
   construction**.
2. Ask the direct question, not the proxy. The failure that motivated this guard was an agent
   burning ~240k tokens and returning nothing usable. **"Did this return a usable result, or
   defer work it cannot perform?"** catches failures that use no deferral vocabulary at all — a
   class the regexes could never reach.
3. Explicitly permit text that *discusses* the rule. This repository is unusually full of it,
   and it is the hard-negative class in §3.1.

---

## 3. Technical Specifications

### 3.1 Acceptance corpus (`test/discipline-corpus/`)

JSONL, one case per line:

```json
{"id": "...", "source": "...", "event": "SubagentStop", "text": "...", "label": "violation|clean", "class": "...", "note": "..."}
```

Extracted from real transcripts under `~/.claude/projects/**/` — lead transcripts and
`subagents/agent-*.jsonl`. Authored text is permitted **only** for hard-negative classes and
must carry `source: "authored"`.

| Class | Label | Floor | Purpose |
|---|---|---|---|
| `deferral-explicit` | violation | 10 | Base case. |
| `deferral-novel-phrasing` | violation | 5 | Must include the 4.1.8 live miss **verbatim**. |
| `no-result-returned` | violation | 5 | The §2.3(2) shape — no deferral vocabulary present. |
| `autonomy-hedge` | violation | 5 | `autonomy-discipline`'s case: hedged mid-loop pause offers. |
| `clean-completion` | clean | 15 | Ordinary successful returns. |
| `self-documentation` | clean | 10 | **Hard negatives** — this repo's rule files and meta-discussion. |
| `incidental-vocabulary` | clean | 5 | "the user is waiting for a response"; "waiting rooms are implemented". |

### 3.2 Scoring harness (`test/discipline-corpus/score.js`)

`node score.js --detector <name> [--json]` → per-class precision/recall, a per-case table for
every miss and false positive, and wall-clock per case. Detector-agnostic: text in, verdict out,
so the judge and the outgoing regexes are scored by identical code. The regex score is recorded
once as a **floor to beat**, not as a candidate.

### 3.3 Manifest schema

`hooks.manifest.json` entries gain `"hookType": "command" | "prompt"` (default `"command"`), and
prompt entries carry their prompt text or a path to it. `generate-hooks-artifacts.sh` currently
hardcodes `"type": "command"` and must emit the declared type. `--check` must detect drift in
the new field.

### 3.4 Kill switch

`ENSEMBLE_DISCIPLINE_JUDGE_DISABLE=1` restores command-type behavior without a redeploy. Read at
**call time**, never latched at module load — 4.1.8 shipped that bug and the test caught it.

---

## 4. Master Task List

### 4.1 Phase 1 — Resolve the mechanics

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| DISC-P001 | Probe hook composition (U1) | Register two hooks on one event; determine whether both run and whether any-block-wins | None | backend-implementer |
| DISC-P002 | Probe prompt-hook payload (U2) | Capture what a prompt-type hook actually receives on `Stop` and `SubagentStop` | None | backend-implementer |
| DISC-P003 | Probe loop bound (U3) | Force repeated prompt-type blocks; confirm `stop_hook_active` (or another mechanism) terminates the loop | DISC-P002 | backend-implementer |
| DISC-P004 | Probe reason delivery (U4) | Confirm a prompt-type block `reason` reaches the agent on both events | DISC-P002 | backend-implementer |
| DISC-D001 | Record the design branch | Append findings to §2.1/§2.2; state Shape A or B and why | DISC-P001..P004 | technical-architect |

### 4.2 Phase 2 — Build

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| DISC-B001 | Corpus extractor | Pull final assistant messages from local transcripts with provenance | None | backend-implementer |
| DISC-B002 | Label the corpus | Meet every floor in §3.1; 4.1.8 live miss verbatim | DISC-B001 | backend-implementer |
| DISC-B003 | Scoring harness | `score.js` per §3.2; record the regex floor | DISC-B001 | backend-implementer |
| DISC-B004 | Author the judge prompt | Per §2.3, for all three hooks' judgments | DISC-D001 | agent-implementer |
| DISC-B005 | Manifest `hookType` + generator | §3.3, including `--check` drift detection | DISC-D001 | backend-implementer |
| DISC-B006 | Loop guard | Implement whatever DISC-P003 showed is required to bound the block loop | DISC-D001 | backend-implementer |
| DISC-B007 | Kill switch | §3.4, call-time read, with a test that exercises it | DISC-B005 | backend-implementer |

### 4.3 Phase 3 — Prove

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| DISC-T001 | Score the judge | Must meet §6.1; iterate the prompt until it does | DISC-B004, DISC-B003 | verify-app |
| DISC-T002 | Latency | Added wall-clock at turn end, p50/p95, ≥20 real turns | DISC-B004 | verify-app |
| DISC-T003 | Live loop-safety | Force a real block loop end-to-end; prove it terminates | DISC-B006 | verify-app |
| DISC-T004 | Live end-to-end | Real session per event: a real violation blocks and the agent corrects; a clean turn is untouched | DISC-B004, DISC-B006 | verify-app |

### 4.4 Phase 4 — Land

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| DISC-B008 | Convert all three hooks | Apply the chosen shape consistently | DISC-T001..T004 | backend-implementer |
| DISC-B009 | Delete the regex apparatus | Remove the pattern battery, code-span/quote stripping, meta-markers, `SELF_DOC_MARKERS`, and their now-dead tests | DISC-B008 | code-simplifier |
| DISC-T005 | Full regression | CI-scoped jest, BATS, smoke; corpus score must not regress | DISC-B008, DISC-B009 | verify-app |
| DISC-D002 | Amend constitution principle 4 | Record that hooks may now use model judgment, and why the deterministic-layer framing changed (user-approved 2026-08-13) | DISC-B008 | backend-implementer |
| DISC-D003 | Update the rules | `async-discipline.md`, `autonomy.md`, improvement-plan 5b, `CLAUDE.md` hooks reference | DISC-B008 | backend-implementer |

---

## 5. Execution Plan

### 5.1 Phase 1 — Mechanics

`DISC-P001`, `P002` in parallel → `P003`, `P004` → `D001`. Probes only; no production change.
Ends by naming Shape A or B, so Phase 2 builds once.

### 5.2 Phase 2 — Build

`DISC-B001` → `B002`, `B003` run independently of `D001` and can start immediately, in parallel
with Phase 1. `B004`, `B005`, `B006` wait on `D001`. `B007` follows `B005`.

### 5.3 Phase 3 — Prove

`DISC-T001` (iterate until §6.1 is met) alongside `T002`; `T003` after `B006`; `T004` last.

### 5.4 Phase 4 — Land

`DISC-B008` → `B009` → `T005`, with `D002`, `D003` alongside.

### 5.5 Critical path

`P002 → P003 → D001 → B004 → T001 → B008 → B009 → T005`

### 5.6 Parallelization

The corpus track (`B001`→`B002`,`B003`) is independent of the probe track and should run
concurrently — it is the long pole and blocks `T001`.

---

## 6. Quality Requirements

### 6.1 Judge acceptance thresholds

The judge must meet all of these to land. Missing one means **iterating the prompt**, not
reverting the approach.

| # | Criterion | Threshold |
|---|---|---|
| A1 | Recall on all violation classes | ≥ the regex floor, **and** must catch every `deferral-novel-phrasing` case including the 4.1.8 live miss |
| A2 | False positives on `self-documentation` | **Zero.** A judge that blocks this repo's own rule files makes the project unmaintainable |
| A3 | False positives on `incidental-vocabulary` | ≤ the regex floor |
| A4 | Recall on `no-result-returned` | > 0 — this class is the point of switching; the regexes score zero by construction |
| A5 | Added latency at turn end | p95 ≤ 2000 ms |
| A6 | Loop safety | DISC-T003 demonstrates a live block loop that terminates |

### 6.2 Standing gates

- CI-scoped jest and BATS at or above 4.1.8 (359 jest; 364 BATS, only the 4 pre-existing failures)
- Smoke `hooks-health`, `scaffold-integrity`, `artifact-contracts` PASS
- `generate-hooks-artifacts.sh --check` exits 0
- No hook may fail a session: allow on every error path, including judge/API failure

---

## 7. Risk Assessment

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Small fast model judges poorly | Trades a brittle detector for an unpredictable one | A1–A4 measured on the corpus; prompt iterated until met; A2 is zero-tolerance |
| R2 | Loop guard weaker without the per-`agent_id` cap | A misfiring judge could wedge a session | DISC-P003 determines the mechanism; DISC-T003 proves it live; A6 gates landing |
| R3 | ~~Erodes the deterministic layer~~ | — | **Accepted by the user 2026-08-13.** Constitution principle 4 is amended by DISC-D002 |
| R4 | Corpus reproduces my own vocabulary | Rebuilds the failure being fixed | Real transcripts only (D3); authored text confined to hard negatives and marked |
| R5 | Per-turn token cost | Ongoing spend on every turn end | Measured in DISC-T002; Shape B short-circuits if U1/U2 allow |
| R6 | Judge unavailable (API error, offline) | Hook must not wedge the session | §6.2 — allow on every error path; DISC-B007 kill switch |

---

## 8. Non-Goals

- **Not** changing what the rules *say*. `async-discipline.md` and `autonomy.md` keep their
  meaning; only the detection mechanism changes.
- **Not** touching `dispatch-ledger.js`, `status.js`, `wiggum.js`, `precompact.js`.
- **Not** fixing the 4 pre-existing BATS failures or the 41 known-failing
  `status.test.js` / `wiggum.test.js` tests.
- **Not** item 5d (`InstructionsLoaded`).
- **Not** reviving `test/evals/`. The corpus is a scoped acceptance suite; the eval harness
  stays dormant per its README.
