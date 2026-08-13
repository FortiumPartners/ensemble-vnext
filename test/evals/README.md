# Eval harness — DORMANT, not abandoned

**Status: deliberately deferred. Do not delete. Do not treat any result in `results/` or
`analysis-archive/` as current.**

This framework answers *"is A better than B?"* — A/B comparison across variants with an Opus judge
and Welch's t-test. It last ran on **2026-01-16**. Everything under `framework/`, `specs/`, and
`rubrics/` is preserved intact and is expected to come back.

## Why it is dormant

The question that blocks day-to-day work is *"did I just break something?"* — deterministic, cheap,
and answered by the behavioral smoke harness (item 4 of
`docs/modernization/2026-08-improvement-plan.md`). Repairing the statistical harness would have
consumed most of the first month of the modernization run to answer a question nothing was waiting
on.

That is a judgment about **timing**, not value.

## Why it was not deleted

The runner rots; the judgment does not. `specs/` and `rubrics/` encode what good output actually
looks like for this framework — 30 spec directories and 6 rubrics of accumulated calibration. That
is the expensive half, and rebuilding it from scratch later would cost far more than the runner did.

Item 8 also needs quality comparison by name: its done-condition is a five-scenario comparison of
the dynamic-workflow path against the prose path. Five hand-scored scenarios beat a statistical
framework nobody trusts *for that one decision*, but the direction of travel is back toward this
harness once the loop it measures has stopped moving.

## Before reviving it

The runner has drifted from the platform in at least these ways — check each before trusting a run:

- `run-session.sh` uses `--remote`, which has since changed (no `--plugin-dir`, no `--session-id`,
  requires a TTY, runs at repo root)
- `judge.js` pins `claude-opus-4-5-20251101`; verify the current model against live docs rather than
  assuming
- The specs reference agents and skills by name — several have changed since January
  (`agent-implementer` added, `permitter`/`learning.sh`/`save-remote-logs.js` retired)
- Nothing here has run against the manifest-driven runtime introduced in 4.1.x

## Not in CI

Deliberately excluded, so a dormant harness cannot fail noisily. `.github/workflows/ci.yml`'s jest
job ignores `test/evals/analysis-archive/` and `test/evals/results/`, and two framework suites
(`judge.test.js`, `run-eval.test.js`) are in the known-failing list there.

Revisit deliberately — most likely after item 8's keep-or-revert call, when there is a stable loop
worth measuring.
