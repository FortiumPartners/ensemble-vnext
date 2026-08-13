# Behavioral Smoke Harness

Answers **"did I just break something?"** with deterministic checks over *observable side
effects*. Not a quality evaluator — `test/evals/` does that, and it's deliberately dormant
(see `test/evals/README.md`; do not touch it as part of this harness).

The value of this harness is that it's fast enough to actually run before a commit.
`npm run smoke` runs it end to end. Guard that property when adding scenarios — a harness
nobody runs is worth nothing.

## What it checks

| Scenario | LLM? | Checks |
|---|---|---|
| `hooks-health` | No | Every hook registered in `.claude/settings.json` (+ `notify-complete.sh`) loads and exits 0 on a minimal valid payload; stdout is empty or valid JSON. |
| `prd-run` | Yes | `/create-prd` in a throwaway project: exit 0, last output line is a `COMMAND COMPLETE`/`STUCK` banner, `docs/PRD/*.md` created and non-empty, `product-manager` appears in the session log. |
| `implement-one-task` | Yes | `/implement-trd` against a fixture TRD with exactly one trivial task: banner, `src/greet.js` created, `implement.json` shows the task at `status: success` / `cycle_position: complete`, an implementer + `verify-app` appear in the log, git is on a feature branch. |
| `debug-path` | Yes | Same shape, but the task's test is pre-written to fail — exercises VERIFY → DEBUG. A `STUCK` banner is a **pass** here (the point is entering the debug path, not fixing an intentionally-unfixable bug). Asserts `app-debugger` appears in the log and `retry_count` incremented. |

## What it deliberately does NOT check

- **Output quality.** No judging what the model wrote, how good the PRD's prose is, or
  whether the implementation is idiomatic. That's `test/evals/`'s job (dormant, but not
  deleted — see the modernization plan, item 4's preface).
- **Coverage percentages, lint cleanliness, or anything requiring a judge.**
- **This repository's own state.** Scenarios 2-4 always run inside a throwaway `mktemp -d`
  project; nothing here ever mutates `ensemble-vnext` itself. Scenario 1 runs every hook
  with `cwd` pointed at an isolated temp directory (no `.claude/`, `.trd-state/`, or `.git/`
  marker) precisely so hooks that walk up looking for project state (`resolve-project-root.js`,
  `precompact.js`'s session-log append, `status.js`'s `.trd-state` walk) take their
  documented no-op path instead of writing into this repo.

## Running it

```bash
npm run smoke                                  # everything
./test/smoke/run-smoke.sh                      # same thing, directly
./test/smoke/run-smoke.sh hooks-health          # one scenario
./test/smoke/run-smoke.sh hooks-health prd-run  # a subset
```

Scenarios 2-4 skip (not fail) when the `claude` CLI isn't on `PATH` — this is the expected
CI situation. A skip is never reported as a pass; the summary table marks it `SKIP`
distinctly from `PASS`/`FAIL`, and `run-smoke.sh` exits 0 when everything present passed or
was skipped, non-zero when anything actually failed.

`hooks-health` alone runs in well under 15 seconds with no network/LLM cost — run it on its
own for a fast sanity check, or as part of `npm run smoke` for the full pass.

## Structure

```
test/smoke/
  run-smoke.sh        # runner: executes scenarios, prints the results table, sets exit code
  lib/
    assert.sh          # shared assertion vocabulary + smoke_finish/smoke_skip + smoke_timeout
    project.sh          # throwaway-project scaffold + claude-CLI invocation helpers (scenarios 2-4)
  scenarios/
    hooks-health.sh
    prd-run.sh
    implement-one-task.sh
    debug-path.sh
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
5. Register the scenario's timeout budget in `run-smoke.sh`'s `SCENARIO_TIMEOUT` map, and
   add its name to `ALL_SCENARIOS`.
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

### Scenarios run concurrently, and that is load-bearing

`hooks-health` runs first and alone — it needs no LLM, finishes in about a second, and if a
registered hook cannot even load then every behavioral assertion downstream is noise. Fail fast
and cheap.

The three LLM scenarios then run **concurrently**. This is not an optimisation; it is what makes
the harness viable. Measured serially they cost 352s + 297s + 291s ≈ **16 minutes**, well past the
ten-minute constraint that is the entire point of this thing. Run concurrently the total is the
slowest one: **353 seconds**. They are independent by construction — each builds its own throwaway
project in its own temp dir — so the only shared resource is the API.

If you add a scenario, add it to the concurrent set unless it genuinely cannot share the machine.

### The model is overridden by default

`CLAUDE_CODE_SUBAGENT_MODEL` defaults to Haiku here. Smoke runs assert **observable side effects**,
never output quality, so the strongest model buys nothing and costs minutes.

It also bought correctness: `prd-run` on the default models took 483s, hit its own cap, and failed
two assertions purely because it ran out of time. On Haiku it finished in 315s and passed all six.
A harness that fails on timeout teaches you to ignore it.

Export `CLAUDE_CODE_SUBAGENT_MODEL` yourself to override.

### Skipped is not passed

Scenarios 2–4 need the `claude` CLI. Where it is absent — CI, a fresh clone — they **skip**, and a
skip is reported distinctly and never counted as a pass. A harness that silently degrades to "all
green, nothing ran" is worse than no harness. `hooks-health` needs no CLI and still runs everywhere.

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
