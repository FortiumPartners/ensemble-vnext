---
primitive: wait-ci
params:
results: passed, failed, no-checks
stops-on: failed
outward: no
needs: head
section: ship
---

# Primitive: wait-ci

Waits for the CI checks on the current head and reports whether they passed (D16, D20).

## Input

`head` and, when the work has one, `pr` from `context`.

**The current head** is the head last published: the PR's `headRefOid` when the work has a PR,
otherwise the `commit` of the latest `pushed` result in `context`. It is never local `HEAD`,
which a state commit can leave one ahead.

**After a merge (`context.merged` is true),** the current head is the PR's merge commit:
`gh pr view <pr> --json mergeCommit --jq .mergeCommit.oid`. The PR's `headRefOid` is no longer
what runs on the base branch.

## Do

1. Find the checks on the current head: `gh pr checks <pr> --json name,bucket,state,link`, or
   `gh run list --commit <sha> --json databaseId,status,conclusion,name` when there is no PR
   or when `context.merged` is true (read with the merge commit as `<sha>`). None configured
   returns `no-checks`; do not trust an exit code for this. Right after a merge the run list is
   often still empty, so poll it for up to 120s before returning `no-checks`.
2. Wait (Waiting, below).
3. If a check failed, re-run the failed jobs once (`gh run rerun <run-id> --failed`) and wait
   again. For each job that then passes, take its name from `gh run view <run-id> --json jobs`
   (never the workflow name `gh run list` returns) and record the flake:
   `node .claude/lib/flaky-ci.js record --state-dir <work.stateDir> --job <name> --run-id <id>`.
   It prints one JSON line with `count` and `capped`. Not capped: list the job in `data.flaky`.
   Capped (the job has flaked 3 or more times across every feature's history, this flake
   included): put it in `data.failed` with `capped: true` and return `failed`. A job still
   failing after the rerun goes in `data.failed` too, with its name and run id. `wait-ci` never
   files anything and never fixes anything; `collect-findings` reads the logs.

## Result

`passed`, `failed` or `no-checks`, with `data`: `{ failed: [...], flaky: [...] }`; a `failed` entry carries `capped: true` when the job is capped.

## Waiting

`Monitor`, armed with `timeout_ms: 1800000`, over a loop that prints each check's terminal state
and exits when none is pending (the `gh pr checks <n> --json name,bucket` loop; after a merge,
the `gh run list --commit <merge-sha>` run list instead, since `gh pr checks` reads the
pre-merge head). **Re-arm only
while a check reports pending:** the CI system's own job timeout ends a pending check, so the
re-arming ends.
