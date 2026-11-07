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

## Do

1. Find the checks on the current head: `gh pr checks <pr> --json name,bucket,state,link`, or
   `gh run list --commit <sha> --json databaseId,status,conclusion,name` when there is no PR.
   None configured returns `no-checks`; do not trust an exit code for this.
2. Wait (Waiting, below).
3. If a check failed, re-run the failed jobs once (`gh run rerun <run-id> --failed`) and wait
   again. A job that then passes was flaky: list it in `data.flaky`. Still failing: return
   `failed` with `data.failed` listing each check's name and run id. Never fix anything here;
   `collect-findings` reads the logs.

## Result

`passed`, `failed` or `no-checks`, with `data`: `{ failed: [...], flaky: [...] }`.

## Waiting

`Monitor`, armed with `timeout_ms: 1800000`, over a loop that prints each check's terminal state
and exits when none is pending (the `gh pr checks <n> --json name,bucket` loop). **Re-arm only
while a check reports pending:** the CI system's own job timeout ends a pending check, so the
re-arming ends.
