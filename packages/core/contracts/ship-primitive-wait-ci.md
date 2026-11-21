---
primitive: wait-ci
params:
results: passed, failed, no-checks, conflicted
stops-on: failed
redirect-on: conflicted=merge
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

0. **Read mergeability before waiting.** Skip this step when `context.merged` is true (a merged PR
   reads `UNKNOWN` forever, and its checks are the merge commit's) or when the work has no PR.
   GitHub starts no `pull_request` run for a PR that conflicts with its base, so a wait on one
   never ends (issue #136). Ask:
   ```bash
   node .claude/lib/merge-up.js pre-ci --pr <pr>
   ```
   It prints one JSON line with `ok`, `action` and `reason`. `ok: false` because it could not
   read the PR (a `gh` or API error) is run again, up to 8 times, 15s apart; still unreadable
   returns `stop` with the `reason`. `ok: false` because the PR is closed without being merged
   returns `stop` at once. Otherwise act on `action`:
   - `proceed` (mergeable): go on to step 1.
   - `poll` (GitHub has not computed mergeability yet): run the same command up to 8 times, 15s
     apart, until it answers `proceed` or `conflicted`. Still `poll` after the 8 runs: treat it
     as `proceed`; the wait below has its own bound.
   - `conflicted`: return `conflicted` now, with the `reason`. Wait for nothing, rerun nothing.
     The sequencer sends the run to the `merge` step, whose merge-in handling brings the base
     in and waits for CI on the pushed head. Where the conflict is in more than record files, that
     step stops, naming the files; it does not wait.
1. Find the checks on the current head: `gh pr checks <pr> --json name,bucket,state,link`, or
   `gh run list --commit <sha> --json databaseId,status,conclusion,name` when there is no PR
   or when `context.merged` is true (read with the merge commit as `<sha>`). None configured
   returns `no-checks`; do not trust an exit code for this. Right after a merge the run list is
   often still empty, so poll it for up to 120s before returning `no-checks`.
2. Wait (Waiting, below).
3. If a check failed, re-run the failed jobs once (`gh run rerun <run-id> --failed`) and wait
   again. Failed jobs only: a full rerun needs `.claude/contracts/rerun-scope.md`
   (`rerun-scope`) to have chosen `full` and said why in the readout. For each job that then passes, take its name from `gh run view <run-id> --json jobs`
   (never the workflow name `gh run list` returns) and record the flake:
   `node .claude/lib/flaky-ci.js record --state-dir <work.stateDir> --job <name> --run-id <id>`.
   It prints one JSON line with `count` and `capped`. Not capped: list the job in `data.flaky`.
   Capped (the job has flaked 3 or more times across every feature's history, this flake
   included): put it in `data.failed` with `capped: true` and return `failed`. A job still
   failing after the rerun goes in `data.failed` too, with its name and run id. A job that
   passed only on a later attempt this step did not make (a rerun from before a resume, or a
   manual one: its `attempt` in `gh run view <run-id> --json attempt,jobs` is above 1) is a
   rerun-pass too: record it the same way and apply the same cap (`record` counts a run id
   once), so resuming after a capped stop cannot turn the stop into a pass. `wait-ci` never
   files anything and never fixes anything; `collect-findings` reads the logs.

4. Measure the CI wall time of the run the wait ended on. Once its jobs have finished (after the
   rerun, when there was one), read `gh run view <run-id> --json jobs` and pipe it to
   `node .claude/lib/ci-time.js measure --policy .claude/rules/ship.md`. It prints one JSON line
   with `wallSeconds` (first job start to last job end, not the sum), `budgetSeconds` (the
   `CI budget:` line in `ship.md`, default 600 and never above 900), `over`, and `slowest` (the
   three longest jobs). Put `wallSeconds`, `budgetSeconds`, `over` and `slowest` in `data`. When
   there are several runs for the head, measure the longest. A result with `"ok": false`, or with
   `wallSeconds` null, leaves those fields out and is one note in the readout, never a failure.
   **The budget is a report, not a gate:** `over: true` never changes the result and never stops
   the ship.

## Result

`passed`, `failed`, `no-checks` or `conflicted` (`data` is `{ judgedHead }` and nothing else: no
check was read), with `data`: `{ failed: [...], flaky: [...], judgedHead, wallSeconds, budgetSeconds, over, slowest }` (the last four from Do step 4, omitted when the run could not be timed); a `failed` entry carries `capped: true` when the job is capped. `judgedHead` is the full id of the head the checks were read on (the PR's `headRefOid`, or the `commit` of the latest `pushed` result when there is no PR), recorded on every result so the merge step knows CI has judged that head.

## Waiting

`Monitor`, armed with `timeout_ms: 1800000`, over a loop that prints each check's terminal state
and exits when none is pending (the `gh pr checks <n> --json name,bucket` loop; after a merge,
the `gh run list --commit <merge-sha>` run list instead, since `gh pr checks` reads the
pre-merge head). **Re-arm only
while a check reports pending:** the CI system's own job timeout ends a pending check, so the
re-arming ends.
