# Behavioral Smoke Harness

Answers **"did I just break something?"** with deterministic checks over *observable side
effects*. Not a quality evaluator — `test/evals/` does that, and it's deliberately dormant
(see `test/evals/README.md`; do not touch it as part of this harness).

The value of this harness is that it's fast enough to actually run before a commit.
`npm run smoke` runs it end to end. Guard that property when adding scenarios — a harness
nobody runs is worth nothing.

## Why deterministic checks are the default

Every real defect found in this framework recently was **silent absence**, not bad prompt
output: a hook that shipped broken and threw `Cannot find module` on every invocation for
months; five hooks that never shipped; a shipped `/init-project` still telling users to
verify a deleted hook; a manifest that existed in source but never reached the installed
plugin; a drift-checker that always exited 0.

None of those announce themselves in use. Bad *prompt output* does — you see it immediately
when a PRD reads badly or an implementation is sloppy. So the harness's default set leans
hard toward what actually breaks silently: file presence, executability, wiring, and
artifact contracts between shipped copies. **Prompt/output quality is deliberately deferred
to `test/evals/`** (dormant, but not deleted — see the modernization plan, item 4's
preface) — that's a judged, statistical concern, not a pass/fail smoke check.

## What it checks

| Scenario | LLM? | Default? | Checks |
|---|---|---|---|
| `hooks-health` | No | Yes | Every hook registered in **this repo's** `.claude/settings.json` (+ `notify-complete.sh`) loads and exits 0 on a minimal valid payload; stdout is empty or valid JSON. |
| `scaffold-integrity` | No | Yes | Scaffolds a throwaway project with `scaffold-project.sh` and asserts the delivered runtime is coherent: every hook registered in the **scaffolded project's** `settings.json` loads and exits 0 run from inside that project; `validate-init.sh` passes; all 13 agents present with parseable frontmatter, explicit `background:`, and `disallowedTools: Agent` on the three leaf agents; every shippable manifest hook + `lib/` delivered; `settings.json` valid and hook-set-identical to this repo's; `ensemble.version` stamped; commands vendored with `init-project.md`/`rebase-project.md` excluded; `.trd-state/`/`docs/` created; no retired component in the output. This is the check that would have caught the permitter shipping broken — `hooks-health` alone never would have, because it only ever checked this repo's own (always-working) hooks. |
| `artifact-contracts` | No | Yes | Static, no scaffolding: every TRD's Master Task List has machine-findable task IDs in a recognised shape (checkbox or table) and `implement-trd.md`'s documented format matches at least one shape actually in use; `packages/core/commands/` ↔ `.claude/commands/` byte-identical; `packages/full/agents/` ↔ `.claude/agents/` byte-identical; `packages/full/commands/plugin-only/*` resolve as symlinks into `packages/core/commands/`; `generate-hooks-artifacts.sh --check` and `check-version-sync.sh` both exit 0; no retired component referenced in `packages/`, `.claude/`, `docs/guides/`. |
| `implement-one-task` | Yes | Yes | `/implement-trd` against a fixture TRD with exactly one trivial task: banner, `src/greet.js` created, `implement.json` shows the task at `status: success` / `cycle_position: complete`, an implementer + `verify-app` appear in the log, git is on a feature branch. Kept as the **single LLM canary** in the default set — it exercises the most (implement → verify → simplify → review, state advancement, the git branch) for the cost of one scenario. |
| `prd-run` | Yes | Opt-in (`--with-llm`) | `/create-prd` in a throwaway project: exit 0, last output line is a `COMMAND COMPLETE`/`STUCK` banner, `docs/PRD/*.md` created and non-empty, `product-manager` appears in the session log. |
| `trd-run` | Yes | Opt-in (`--with-llm`) | `/create-trd` in a throwaway project: exit 0, banner, `docs/TRD/*.md` created and non-empty. |
| `debug-path` | Yes | Opt-in (`--with-llm`) | Same shape as `implement-one-task`, but the task's test is pre-written to fail — exercises VERIFY → DEBUG. A `STUCK` banner is a **pass** here (the point is entering the debug path, not fixing an intentionally-unfixable bug). Asserts `app-debugger` appears in the log and `retry_count` incremented. |
| `verify-functional` | Yes | Opt-in (`--with-llm`) | `/implement-trd` run TWICE against a one-task TRD + matching one-requirement PRD, in two separate throwaway projects: **without** `--verify-functional` no `.trd-state/*/success-definition.md` may appear (AC-6); **with** it, `success-definition.md` exists and every data row carries a non-empty `Cites` value (`domain-derived` reasoning lives in that same column per the contract), `verification-state.json` carries a numeric `iteration` and a `criteria` array in which every entry has a `status`, and `verification-report.md` names every criterion. Both runs must end with a banner. The most expensive scenario in the set (two live runs, ~40 min cap). |

`prd-run`, `trd-run`, `debug-path`, and `verify-functional` each cost roughly five to six
minutes (`verify-functional` roughly double — it runs `/implement-trd` twice) to assert
things a user would notice within seconds of looking at the output ("a PRD file appeared").
That is not worth paying on every run before a commit — it is exactly the kind of check
worth keeping, but as something you reach for deliberately (`--with-llm`, or by scenario
name), not something that runs by default and makes the harness slow enough that nobody
runs it.

## What it deliberately does NOT check

- **Output quality.** No judging what the model wrote, how good the PRD's prose is, or
  whether the implementation is idiomatic. That's `test/evals/`'s job (dormant, but not
  deleted — see the modernization plan, item 4's preface).
- **Coverage percentages, lint cleanliness, or anything requiring a judge.**
- **This repository's own state.** Every scenario runs inside a throwaway `mktemp -d`
  project or scans the repo read-only; nothing here ever mutates `ensemble-vnext` itself.
  `hooks-health` runs every hook with `cwd` pointed at an isolated temp directory (no
  `.claude/`, `.trd-state/`, or `.git/` marker) precisely so hooks that walk up looking for
  project state (`resolve-project-root.js`, `precompact.js`'s session-log append,
  `status.js`'s `.trd-state` walk) take their documented no-op path instead of writing into
  this repo. `scaffold-integrity` deliberately does the OPPOSITE for the same reason it
  exists — it runs hooks with `cwd` pointed AT a real scaffolded project, so the checks
  exercise the real path-resolution instead of the no-op.

## Running it

```bash
npm run smoke                                        # default: deterministic + 1 LLM canary
./test/smoke/run-smoke.sh                             # same thing, directly
./test/smoke/run-smoke.sh hooks-health                 # one scenario
./test/smoke/run-smoke.sh hooks-health scaffold-integrity   # a subset
npm run smoke:full                                    # default set + all opt-in LLM scenarios
./test/smoke/run-smoke.sh --with-llm                   # same thing, directly
./test/smoke/run-smoke.sh prd-run                       # a single opt-in LLM scenario by name
```

All LLM scenarios (the default's `implement-one-task`, plus the opt-in three) skip (not
fail) when the `claude` CLI isn't on `PATH` — this is the expected CI situation. A skip is
never reported as a pass; the summary table marks it `SKIP` distinctly from `PASS`/`FAIL`,
and `run-smoke.sh` exits 0 when everything present passed or was skipped, non-zero when
anything actually failed.

The three deterministic scenarios (`hooks-health`, `scaffold-integrity`,
`artifact-contracts`) together run in well under 15 seconds with no network/LLM cost, and
run FIRST, serially, before any LLM scenario — if the deterministic layer is broken,
there's no point spending minutes finding out an LLM scenario also failed.

## Structure

```
test/smoke/
  run-smoke.sh        # runner: executes scenarios, prints the results table, sets exit code
  lib/
    assert.sh          # shared assertion vocabulary + smoke_finish/smoke_skip + smoke_timeout
    project.sh          # throwaway-project scaffold + claude-CLI invocation helpers (LLM scenarios)
    hookcheck.sh         # shared hook-payload builder + runner (hooks-health, scaffold-integrity)
  scenarios/
    hooks-health.sh          # deterministic — this repo's hooks
    scaffold-integrity.sh     # deterministic — a scaffolded project's hooks + delivered runtime
    artifact-contracts.sh     # deterministic — static cross-artifact contracts
    implement-one-task.sh     # LLM canary, default
    prd-run.sh                # LLM, opt-in (--with-llm)
    trd-run.sh                 # LLM, opt-in (--with-llm)
    debug-path.sh               # LLM, opt-in (--with-llm)
    verify-functional.sh         # LLM, opt-in (--with-llm) — two live runs
  baseline.json        # captured pass/fail + elapsed + assertion counts (see below)
  README.md            # this file
```

## Adding a scenario

1. Create `scenarios/<name>.sh`. Start with:
   ```bash
   #!/usr/bin/env bash
   set -uo pipefail
   SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
   SMOKE_DIR="$(cd "${SCENARIO_DIR}/.." && pwd)"
   REPO_ROOT="$(cd "${SMOKE_DIR}/.." && cd .. && pwd)"
   source "${SMOKE_DIR}/lib/assert.sh"
   source "${SMOKE_DIR}/lib/project.sh"   # only if you need a throwaway project / claude CLI
   ```
2. If the scenario needs the `claude` CLI, check for it first and `smoke_skip` if absent —
   never let a missing CLI read as a failure.
3. Make your assertions with the `assert_*` helpers in `lib/assert.sh` (file existence, exit
   codes, JSON fields, git branch, last-line-matches-regex, etc.) — they're about
   **observable side effects**, never about judging output quality.
4. Call `smoke_finish` at the end. It prints `ASSERTIONS: N passed, M failed` (which
   `run-smoke.sh` parses for the results table) and exits 0/1 accordingly.
5. Register the scenario's timeout budget in `run-smoke.sh`'s `SCENARIO_TIMEOUT` map. If it's
   deterministic (no LLM), add it to `ALL_SCENARIOS` AND `DETERMINISTIC_SCENARIOS` — the
   latter makes it run serially, fail-fast, before any LLM scenario. If it needs the `claude`
   CLI, think hard before adding it to `ALL_SCENARIOS` (the default set) — the bar is "worth
   paying LLM cost on every pre-commit run"; `implement-one-task` is the one LLM scenario that
   clears it today. Otherwise add it to `LLM_OPT_IN_SCENARIOS` instead, runnable by name or
   via `--with-llm`.
6. Make it independently runnable: `./test/smoke/run-smoke.sh <name>` must work on its own.
7. Run `shellcheck --severity=warning --exclude=SC1091,SC2317` over anything you add.
8. Prove it actually catches a regression once, by hand — break the thing it checks on
   purpose, confirm the scenario goes red, then revert. A scenario that has never been
   observed to fail is unverified.

## Baseline

`baseline.json` is a **deliberately captured, committed snapshot** — scenario name,
pass/fail, elapsed seconds, and assertion counts — from a known-good run. It exists so a
later run can be diffed against it to catch duration regressions ("this used to take 40s,
now it takes 4 minutes") as well as pass/fail regressions.

**Recapture it deliberately, not automatically.** `run-smoke.sh` never overwrites
`baseline.json` on its own — nothing in this harness does. When you want a new baseline
(after a real, intentional change to timing or scenario set), run the harness and hand-copy
the results table into `baseline.json`, then commit that as its own change with a reason in
the commit message. Silently overwriting the baseline on every green run would defeat its
purpose — you'd never notice a slow regression that still happens to pass.

## Known environment gaps found while building this

- **`test/integration/scripts/run-headless.sh` shells out to the bare `timeout` command**,
  which is a GNU coreutils binary not present on stock macOS (confirmed: no `timeout` and no
  `gtimeout` on the machine this harness was built on). `lib/assert.sh`'s `smoke_timeout`
  works around this with a `timeout`/`gtimeout`-if-present, perl-fork/alarm-fallback
  otherwise. This harness does not shell out to `run-headless.sh` for that reason (see next
  point) but if you touch `run-headless.sh` itself, be aware CI (presumably Linux, with
  coreutils) has been silently masking this gap.
- **`run-headless.sh` hardcodes `--setting-sources local`**, which conflicts with this
  repo's own `CLAUDE.md` ("Headless Testing with Claude CLI" section), which documents
  `--setting-sources project` as required so a scaffolded project's committed
  `.claude/settings.json` hooks actually load. `lib/project.sh`'s `smoke_claude` uses
  `--setting-sources project` per the documented (and, empirically, correct) guidance
  instead of reusing `run-headless.sh` unmodified. Neither script was patched as part of
  this work — flagging both gaps here rather than silently fixing them, per this task's
  instructions.
- **Neither `verify-telemetry.sh` nor `verify-skill.sh` actually checks agent
  (`subagent_type`) invocation**, despite the modernization plan's description of item 4
  claiming "`verify-telemetry.sh` already does this." Checked: neither script's source
  greps for `subagent_type` or the `Agent`/`Task` tool name. `lib/project.sh` implements
  `smoke_agent_invoked` directly (a small jq query against `stream-json` tool_use entries,
  with a raw-substring fallback) rather than reinventing telemetry parsing wholesale.

---

## Design decisions worth knowing

### Deterministic first, LLM canary alone, LLM opt-in concurrent

`hooks-health`, `scaffold-integrity`, and `artifact-contracts` run first and serially — none
needs an LLM, together they finish in single-digit seconds, and if a registered hook cannot
even load or an artifact contract has drifted, every downstream behavioral assertion is
noise. Fail fast and cheap.

The default set's one LLM scenario, `implement-one-task`, then runs alone (nothing left to
share the machine with by default). When `--with-llm` pulls in `prd-run`, `trd-run`,
`debug-path`, and `verify-functional`, all five LLM scenarios run **concurrently** — this is not an optimisation, it's
what keeps a full `--with-llm` pass from blowing past ten minutes. Measured serially the LLM
scenarios cost 352s + 297s + 291s + ~380s ≈ over 22 minutes; concurrently the total is the
slowest one, roughly 6 minutes. They are independent by construction — each builds its own
throwaway project in its own temp dir — so the only shared resource is the API.

If you add a deterministic scenario, add it to the serial fail-fast set. If you add an LLM
scenario, decide deliberately whether it belongs in the default set (it should be rare — see
"Why deterministic checks are the default" above) or the opt-in set, and add it to the
concurrent group either way unless it genuinely cannot share the machine.

### No model override — the harness tests what ships

An earlier version of this harness defaulted `CLAUDE_CODE_SUBAGENT_MODEL` to Haiku, because it cut
a scenario from 483s to 315s and made a ten-minute target reachable.

**That was wrong, and the reasoning is worth keeping.** A harness that runs the agents on a model
nobody ships is not testing the product. Every assertion would have been validating a configuration
that never reaches a user, and any regression that manifests only on the shipped models would have
been invisible to precisely the thing whose job is to catch it. The ten-minute figure was a
convenience target; fidelity outranks it.

The agents run on their declared models — Opus for `product-manager`, `spec-planner`,
`technical-architect`, `code-reviewer`, `code-simplifier`, `app-debugger`; Sonnet for the
implementers and `verify-app`. That is what a user gets, so that is what gets tested.

Set `CLAUDE_CODE_SUBAGENT_MODEL` yourself if you want a faster local loop, but **a result produced
that way must never be recorded as a baseline.**

The corollary: per-scenario caps are sized for the real models. `prd-run` takes ~480s on them, and
an earlier 500s cap produced a *false failure* — the command was working, it just ran out of clock.
The fix for slow is a bigger cap, never a smaller model.

Concurrency is the one legitimate speedup, because it does not change what runs.

### Skipped is not passed

Every LLM scenario (`implement-one-task` in the default set; `prd-run`/`trd-run`/`debug-path`
under `--with-llm`) needs the `claude` CLI. Where it is absent — CI, a fresh clone — they
**skip**, and a skip is reported distinctly and never counted as a pass. A harness that
silently degrades to "all green, nothing ran" is worse than no harness. The three
deterministic scenarios need no CLI and still run everywhere.

### bash 4+

The runner uses associative arrays. macOS ships bash 3.2 as `/bin/bash`, where `declare -A` is
unsupported and `[hooks-health]=15` parses as an arithmetic subscript — failing with the
thoroughly unhelpful `hooks: unbound variable`. There is an explicit version guard so the failure
is actionable.

## What this deliberately does NOT do

- **Judge output quality.** Whether the PRD is *good* is `test/evals/`'s question, and it is
  dormant on purpose (see `test/evals/README.md`).
- **Run in CI as a gate.** It needs the `claude` CLI and costs real tokens. It is a pre-commit tool.
- **Assert timing.** Elapsed times in `baseline.json` are indicative; machine, network, and model
  all move them. The assertion **counts** are the meaningful comparison — a count dropping means a
  check silently stopped running.

## Recapturing the baseline

`baseline.json` is committed and should be updated **deliberately**, never silently on every run.
Auto-overwriting is how a regression quietly becomes the new normal. Recapture when you have
consciously changed what the harness covers, and say so in the commit message.
