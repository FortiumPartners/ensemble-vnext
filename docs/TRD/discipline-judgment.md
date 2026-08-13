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
| D5 | Ship with a rollback lever | Operational rollback, not indecision: one env var restores the previous behavior. **Revised 2026-08-13** — a true runtime kill switch is impossible for a prompt hook (§3.4), so this is a regenerate-and-refresh lever, not an instant switch. |
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
| U1 | When several hooks are registered on one event, do **all** run, and does any single `block` win? | **ANSWERED 2026-08-13 (DISC-B007, by source tracing): YES to both.** Every matched hook becomes an independent async generator, all merged and run to completion with no early exit; the outcome is OR-composed, so any block wins and nothing cancels another hook's result. **One hook cannot suppress another** — so no command-type gate can ever short-circuit a model call, and Shape B was impossible, not merely unnecessary. |
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

### 2.2.1 DECIDED: Shape A (DISC-D001, 2026-08-13)

**Shape A is selected.** Phase 1 resolved every question it depended on, and the two that
mattered both came back favourable.

**U2 — the evaluator sees the full payload.** A prompt-type hook's evaluating model receives
the identical field set to a command hook, including `background_tasks`, `session_crons`,
`stop_hook_active` and (on `SubagentStop`) `agent_id`/`agent_type`/`agent_transcript_path`.
Nothing is withheld. So the structural escape valves live in the prompt text, and no
command-type tier is required for them. Shape B is unnecessary and is **withdrawn**.

**U3 — the loop is bounded, two ways.** R2 was materialised and is now closed:

1. **A hard platform cap exists and is undocumented.** The query-loop driver reads
   `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` (default **8**) and force-terminates the turn on the
   `cap + 1`-th consecutive block. Verified in the v2.1.229 binary (the env var and its
   override warning are both present as literals) and live-confirmed at `cap=2`, giving
   exactly 3 blocks before override. Identical on `Stop` and `SubagentStop`. This needs no
   hook-author action.
2. **`stop_hook_active` is the tighter, intended bound.** It is `false` on first entry and
   `true` on every re-entry after a block, and the platform's own override warning tells hook
   authors to check it. A prompt instructed to allow once `stop_hook_active` is true yields
   **exactly one** extra turn — no state file, no companion hook, one line of prompt.

**The loop guard is therefore a prompt instruction, not infrastructure.** `DISC-B006` reduces
to adding that line and testing it.

**Shape C (agent-type hook with a file counter) — proven but rejected.** It works: a
`type: "agent"` hook demonstrably read and wrote a counter file keyed by the real `agent_id`
across invocations, fully restoring the old per-`agent_id` cap. It is rejected because it buys
nothing here — `stop_hook_active` achieves the same bound with no infrastructure, while agent
hooks default to Haiku with a 60s timeout and a 50-turn cap, i.e. materially more cost per
call. Shape C is the right answer only for a judgment needing genuine cross-turn memory for
some *other* reason. Recorded so it is not re-derived.

**Do not rely on the hard cap as the primary mechanism.** When it fires under `--print`,
stdout is **empty** and the transcript JSONL carries **no trace** of the override — the warning
is terminal-UI-only and not persisted. A wedged hook that reaches the cap is indistinguishable
from "no output" to any caller, including this project's own smoke harness, which runs
`--print` throughout. The `stop_hook_active` self-check exists so the cap is never reached.

**U1's status.** `DISC-P001` (hook composition) had not reported when this decision was made.
It is no longer gating: its decisive question — whether a command-type gate can short-circuit
a later hook — only mattered for Shape B, which is withdrawn. Its answer remains useful for
the §6.1 A5 latency question (whether clean turns could ever skip the model call) and is
recorded when it lands, but Phase 2 does not wait on it.

**Left unresolved, deliberately.** `model` pinning is schema-confirmed but untimed, and
`timeout`-exceeded behaviour was never triggered in ~10 live probes — it is genuinely unknown
whether it resolves to allow, block, or error. Neither blocks Shape A. Both become load-bearing
only if A5's p95 ≤ 2000 ms budget forces model selection, and `DISC-T002` will say whether it
does.

### 2.3 What the judge is asked

The prompt encodes the rule's **reasoning**, never its vocabulary — the vocabulary is what
failed. It must:

1. State the structural fact for subagents: `ScheduleWakeup` is removed from every subagent by
   the platform's tool filter, so a subagent's claim to "come back later" is false **by
   construction**.
2. Ask the direct question, not the proxy: **"Did this return a usable result, or defer work
   it cannot perform?"**

   **Corrected 2026-08-13 — the justification originally given here was wrong.** This TRD
   claimed the motivating failure (an agent burning ~240k tokens and returning nothing usable)
   demonstrated a class of violation carrying *no deferral vocabulary at all*. Re-reading the
   actual incident: those subagents ended with *"I'll wait for the monitor notifications to
   arrive"* and *"Waiting for background scenario completions"*. They had deferral vocabulary.
   I mis-classified them.

   DISC-B002 then tested the hypothesis against data and it did not survive. Across **1,274**
   confirmed `end_turn` finals, exactly **one** vocabulary-free no-result case exists, and three
   independent mining strategies (intent-narration prefixes; sub-100-char finals; 100–300-char
   finals lacking outcome words) returned **zero** new ones.

   There is a structural reason and it is convincing: an agent genuinely mid-task continues with
   a tool call in the same round, so its record terminates `tool_use`, not `end_turn`. "Ended a
   turn having produced nothing usable, with no deferral vocabulary" is close to a contradiction
   — the turn does not end there.

   The question above remains the right one to ask, because it is the honest framing of what the
   rule is *for*. What is withdrawn is the claim that it unlocks a large class the regexes miss.
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

| Class | Label | Floor | Real supply | Purpose |
|---|---|---|---|---|
| `deferral-explicit` | violation | 8 | **1** | Base case. Synthetic-dominated — see caveat A. |
| `deferral-novel-phrasing` | violation | 6 | 6 | Must include the 4.1.8 live miss **verbatim**. |
| `no-result-returned` | violation | **1** | 1 | Real ceiling, not a target — caveat D. Not an acceptance gate (A4). |
| `autonomy-hedge` | violation | 5 | **0** | Hedged mid-loop pause offers. Synthetic-only — caveat A. |
| `clean-completion` | clean | 15 | abundant | Ordinary successful returns. |
| `self-documentation` | clean | 10 | 5 (+6 verbatim repo text) | **Hard negatives** — rule files, meta-discussion. |
| `incidental-vocabulary` | clean | 8 | abundant | "waiting for a response"; "waiting rooms are implemented". |

**Revised 2026-08-13 (DISC-B002).** Original floors assumed real transcripts would supply
25 violations. They do not, and the reason is structural rather than a sampling failure:
these guards have been running for months, so the transcript history is overwhelmingly
*compliant* text. Across ~1,500 candidates there is exactly **one** real
`deferral-explicit` case and **zero** real `autonomy-hedge` cases. Floors now track what
the data actually supports — raised where real supply is rich, lowered where it is not.

**Caveat A — synthetic-dominated classes.** `deferral-explicit` (1 real : 7 synthetic) and
`autonomy-hedge` (0 real) validate the judge's grasp of the *concept*, not its measured
performance against observed reality. A regression in these classes is weaker evidence
than one in a real-backed class, and they should be re-mined as the corpus grows.

**Caveat B — synthetic independence is imperfect.** Synthetic cases were written from
situations rather than from our pattern list, and the generating agent did not read
`async-claim-detector.js` or `subagent-discipline.js`. But `async-discipline.md`'s prose
is force-loaded into every session via `CLAUDE.md`, so zero exposure to the rule's
vocabulary cannot be claimed. Treat synthetic-class scores as indicative, not decisive.

**Caveat D — `no-result-returned` has a real ceiling of 1.** Not a sampling failure. Six of the
original seven were confirmed extraction artifacts (a `tool_use` record on the very next line of
the same transcript — the turn continued, so no hook ever fired on that text). Re-mining 1,274
confirmed finals with three independent strategies produced zero new cases. The floor IS the
ceiling. Do not backfill it with synthetic cases to make the number look healthier.

**Caveat C — provenance, now measured (revised 2026-08-13).** Every real case was
re-checked against its source transcript's terminal `stop_reason`. Of 45 real cases, 30
are `end_turn`-confirmed, 9 are `null`, 6 are `tool_use`.

`tool_use` is **disqualifying**: the record ended by calling a tool, so the captured text
was a mid-turn preamble and the turn continued — no hook fired on it. `null` is doubtful:
across a 400-transcript sample 80% of subagent finals are `end_turn` and `null` is a ~16%
minority consistent with interrupted generation.

`no-result-returned` is worst hit at **1/7 confirmed**, and it is the class §6.1 A4 depends
on. Until repaired, it measures a failure *shape*, not observed terminal behavior. Repair
requires re-mining that class from `end_turn` records only and adding a `stop_reason`
filter to `extract.js`.

Only **two** real cases are both `end_turn`-confirmed and missed by the regex. The case
for switching rests on the structural argument — a matcher finds only what someone thought
to pattern for — far more than on that count, and should be stated that way.

### 3.1.1 Payload context (added 2026-08-13)

A case MAY carry an optional `payload` object — `{background_tasks, session_crons,
stop_hook_active}` — and the harness MUST pass it to detectors that accept it.

This closes a gap that would have invalidated the comparison. §2.2 Shape A puts the
structural escape valves *inside the judge prompt*, resolved from `background_tasks`.
A text-only corpus cannot exercise that logic at all, so the judge would be scored on
strictly less information than it has in production — and cases whose correct label
*depends* on the payload (an agent claiming "I dispatched a background wait" is a
violation if it did not and legitimate if it did) are unlabelable from text alone.

Such cases carry `"class": "payload-dependent"` and are excluded from text-only detector
scoring rather than being guessed at.

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

### 3.4 Rollback lever (revised 2026-08-13 — the original spec was not implementable)

`ENSEMBLE_DISCIPLINE_JUDGE_DISABLE=1` causes every `hookType: "prompt"` entry to generate as
`hookType: "command"` instead, restoring the previous behavior. It is read by
**`generate-hooks-artifacts.sh`**, not by the hook.

**Why it cannot be what was originally specified.** §3.4 first required a call-time env read
inside the hook. That assumed the architecture this TRD is moving *away from*: a command hook can
read `process.env` because it **is** a process we control, whereas a prompt hook is evaluated by
the platform and our code never runs. DISC-B007 confirmed there is no channel — the evaluator
query carries `tools: []` and a fixed payload containing no environment.

Two other mechanisms were investigated and disproven:

- **The `if` field is not a conditional.** Its schema description is *"Permission rule syntax to
  filter when this hook runs (e.g. `Bash(git *)`)"* — a tool-call matcher with no env-var syntax.
  Worse, it is an active footgun on these events: `Stop`/`SubagentStop` have no associated tool
  call for `if` to match, so **any non-empty `if` there disables the hook unconditionally**,
  silently. Never set `if` on a Stop or SubagentStop hook.
- **Cross-gating a command hook against the prompt hook is impossible.** All hooks matched to an
  event run as independent async generators, merged and run to completion with no early exit, and
  the outcome is OR-composed — any hook's block wins and nothing cancels another's result. One
  hook cannot suppress another. (This also answers U1; see §2.1.)

**What "never latched" means here.** The generator is a script that runs once and exits, so it
re-reads the variable on every invocation. There is no long-lived process to hold a stale value —
the build-time equivalent of the call-time discipline 4.1.8's kill-switch bug violated.

**The honest limitation, stated plainly.** This is a *regenerate-and-refresh* lever, not an
instantaneous switch. Setting the variable alone changes nothing until
`generate-hooks-artifacts.sh` runs — and `--check` will correctly report DRIFT if the variable is
set without regenerating. Rollback is: set the variable, regenerate, refresh the vendored runtime.

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
| DISC-B009 | ~~Delete the regex apparatus~~ | **DEFERRED 2026-08-13 — contradicts D5. See §4.4.1.** | DISC-B008 | code-simplifier |
| DISC-T005 | Full regression | CI-scoped jest, BATS, smoke; corpus score must not regress | DISC-B008 | verify-app |
| DISC-D002 | Amend constitution principle 4 | Record that hooks may now use model judgment, and why the deterministic-layer framing changed (user-approved 2026-08-13) | DISC-B008 | backend-implementer |
| DISC-D003 | Update the rules | `async-discipline.md`, `autonomy.md`, improvement-plan 5b, `CLAUDE.md` hooks reference | DISC-B008 | backend-implementer |

---

#### 4.4.1 DISC-B009 deferred — it contradicts D5

**Two requirements in this TRD are mutually exclusive, and neither author noticed.**

- **D5 / §3.4** ships a rollback lever: `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE=1` regenerates every
  prompt-type entry as `command`-type, pointing at `.claude/hooks/<hook>.js`.
- **DISC-B009** deletes the pattern battery, the code-span/quote stripping, the meta-markers and
  `SELF_DOC_MARKERS` — which is the entire detection logic inside those same `.js` files.

Run B009 and the lever still emits perfectly valid `command` hooks that **allow everything**. It
would present as a safety mechanism while silently having none. That is worse than shipping no
lever at all, because the failure is invisible at exactly the moment it is being relied on.

**Deferred, not cancelled.** The judge has zero days of production use. Deleting its only fallback
on the day it ships trades a working safety net for a tidier diff. Keeping the regex hooks costs
nothing at runtime — they are not registered while the prompt-type entries are active — and only a
small amount of delivery weight.

**Trigger for revisiting:** once the judge has run in real sessions long enough that the lever is
demonstrably unnecessary, B009 and D5 are deleted **together**, in one change. They are the same
artifact viewed from two directions, and removing either alone leaves the codebase lying about
its own capabilities.

**This is the sixth requirement in this TRD to need amendment against evidence** (§3.1 floors,
§2.3 premise, §3.4 kill switch, A5 withdrawn, A2/A3 restated, now B009-vs-D5) — and the first
found by asking what a task would actually *do* rather than by measuring its output. Recorded as
input to improvement-plan item 10: a derived-requirements readout would not have caught this one,
since both requirements were legitimately derived. Mutual consistency between requirements is a
separate check from provenance.

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
| A2 | False positives on `self-documentation` | **Zero in each of 3 consecutive full runs** (revised 2026-08-13 — the judge is non-deterministic; a single run measures luck). A judge that blocks this repo's own rule files makes the project unmaintainable |
| A3 | False positives on `incidental-vocabulary` | ≤ 1 per run, **median over 3 consecutive runs** (revised 2026-08-13 — same reason) |
| A4 | Recall on `no-result-returned` | **Reported, not gated** (revised 2026-08-13) — n=1; see note below |
| A5 | ~~Added latency at turn end~~ | **WITHDRAWN 2026-08-13 — not an acceptance criterion.** Measured and reported in §6.1.1; gates nothing. |
| A6 | Loop safety | DISC-T003 demonstrates a live block loop that terminates |

**A4 was downgraded from an acceptance gate to a reported observation.** It originally demanded
recall > 0 on `no-result-returned`, on the premise that this was the capability justifying the
switch; §2.3 records why that premise was wrong. The operative fact is that the class has exactly
**one** confirmed real case in 1,274 `end_turn` finals, and one case cannot gate anything — a
judge would pass or fail it on a coin flip. Its score is still recorded, and synthetic cases may
probe the capability, but neither decides whether the conversion lands.

**What the switch rests on, now that A4 does not.** Regex **precision is perfect** — zero false
positives across 39 clean cases, including 11 hard self-documentation negatives. **Recall is
structurally bounded by vocabulary**, and four independent misses are now confirmed on real
text: "waiting **on**" (the 4.1.8 live miss), "completion**s**" defeating `\bcompletion\b`,
"go-ahead" absent from the object list, and `when` preceding rather than following "report back".
Each is fixable with one more pattern, and each pattern widens the false-positive surface that
the code-span/quote/meta-marker apparatus exists to contain. That is the argument, and it does
not need a class that barely exists.

### 6.1.1 A5 WITHDRAWN — latency is not a criterion for this product

**A5 was invented, not required.** No user requirement, no data — a "p95 ≤ 2000 ms" row was
written into the acceptance table because the table looked incomplete without one. It was then
measured, reported incorrectly twice (first by differencing percentiles, which is not the
percentile of a difference), and split into three sub-criteria to rescue a threshold nothing
depended on.

**Why it does not matter here.** The hook fires *after* the assistant's text has streamed. In
interactive use the cost lands inside the seconds a human spends reading the message that already
arrived — it is invisible. In autonomous use, ~2.6 s per turn end is ~3–4 minutes across an
84-dispatch `/implement-trd` run measured in hours, with nobody watching. There is no interactive
case where the user waits on this and no autonomous case where it changes an outcome.

On the block path the added time is the feature working: the user finishes reading while the
agent is already producing a corrective turn, instead of discovering twenty minutes later that a
promised background task never existed.

**Retained as observation, not gate** (DISC-T002, 100 interleaved samples, paired within-round):

| Condition | mean Δ | 95% CI |
|---|---|---|
| full ~8KB prompt | +2619 ms | [+1971, +3267] |
| minimal prompt | +1680 ms | [+1070, +2291] |
| model pinned | +2446 ms | [+1682, +3210] |

Two facts worth keeping if latency ever becomes a real constraint: **model pinning gives no
benefit** (marginally worse than the default), and **prompt size is worth ~900 ms of mean**, so
trimming is the only demonstrated lever. Tail figures from this run are not interpretable —
turn wall-clock conflates evaluator cost, the extra generation a block causes, and generation
variance (baseline sd ≈ 1400 ms).

### 6.1.1b The judge is non-deterministic — criteria must be stated over runs

`incidental-vocabulary` scored **0 false positives in a scoped run and 1 in a full run** — same
10 cases, same prompt, same detector, nothing different but the run.

This is intrinsic to replacing a deterministic matcher with a model: recall is bought at the cost
of reproducibility. §6.1 was originally written as though each criterion had a fixed value, which
is an error in the criteria rather than in the judge. **A zero-tolerance threshold verified once
is measuring luck.**

A2 and A3 are therefore restated over 3 consecutive full runs. Three is chosen as the cheapest
number that can distinguish "clean" from "usually clean" at roughly 20 minutes per run — not as a
statistically motivated figure, and it is stated that way rather than dressed up as one.

The same caution applies to any future criterion over this judge: state the run count, or do not
state a threshold.

### 6.1.2 What the latency work actually surfaced — a correctness gate, not a speed one

**RESOLVED 2026-08-13 (DISC-P001, U6): a timeout resolves to ALLOW, on both events.** The gate
is cleared.

Why it mattered: at ~2.6 s mean evaluation, a slow or briefly unavailable evaluator is routine
rather than exotic. Had a timeout resolved to **block**, ordinary API latency would have made turn
ends wedgeable — strictly worse than anything this TRD fixes, and it would have mattered
identically if evaluation took 50 ms. This was never a latency concern.

**Observed:** timeouts forced by setting `timeout` below a real API round trip (1 s on `Stop`,
0.3 s on `SubagentStop`). 4/4 runs aborted the evaluator request precisely at the deadline
(306–307 ms against 300 ms, three times) and the session proceeded normally — `exitPath=completed`
1 ms after the abort, no block feedback, no retry loop, exit 0. A 1 s run that happened to finish
in 0.83 s resolved normally, serving as a negative control.

Distinguishing "allowed cleanly" from "timed out then allowed" is not possible from `--print`
stdout, so the probe used `claude --debug --debug-file` to read internal hook processing. That
methodological point is worth keeping: **the timeout path is silent.** No `Hooks: Prompt hook
error:` line fires on abort — that log belongs to a different outer catch — so a timing-out hook
is invisible in normal output, the same observability hole U3 found on the hard-cap path.

**Source-confirmed** (verified independently in the v2.1.229 binary):
`catch(S){if(v(),y.aborted)return{hook:e,outcome:"cancelled"};throw S}` — an abort yields a
distinct `outcome:"cancelled"`, never `outcome:"blocking"`.

**Also established:** the default `timeout` when omitted is **30 s** for `type:"prompt"`
(`e.timeout?e.timeout*1000:30000`) and 60 s for `type:"agent"`, read from source rather than
inferred.

**Two limits, labelled rather than glossed:** the non-timeout error path (a genuine evaluator API
error rather than an abort) routes through a different branch and was **not** tested live; and the
downstream consumer of `outcome:"cancelled"` was not traced, so "cancelled → allow" rests on 4/4
observed behaviour plus the structural separation of the branches — INFERRED at that layer, not
OBSERVED.

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
