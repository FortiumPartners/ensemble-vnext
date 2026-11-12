---
primitive: merge
params: method=merge, rounds=2
results: merged, red
stops-on: red
loop-on: red
loop-via: collect-findings, fix-findings, push, wait-ci
loop-rounds: rounds
outward: yes
needs: pr
provides: merged
detach-on: merged
detach-on-data: merged
section: ship
---

# Primitive: merge

Merges the pull request and proves that what merged is what was verified (D11, D21).

## Input

`method` (`merge`, `squash` or `rebase`; default `merge`), `rounds` (default `2`; how many times a red
head may be fixed and the merge retried; `0` turns the loop off, so `red` stops the run), plus `pr` and
`base` from `context`.

## Do

1. **Bring the base in when the PR has clashed with it or the base requires the head to be up
   to date**, before the gate. Ask GitHub's own verdict:
   ```bash
   node .claude/lib/merge-up.js decide --pr <pr>
   ```
   It prints one JSON line with `ok`, `action` and `reason`. `ok: false` because it could not read
   the PR (a `gh` or API error) is run again, up to 8 times, 15s apart; still unreadable returns
   `stop` with the `reason`. `ok: false` because the PR is closed without being merged returns
   `stop` at once. Otherwise act on `action`:
   - `skip` (the PR is `MERGED`, or mergeable and not behind): go straight to step 2. A merged
     PR reads `UNKNOWN` forever, so `decide` checks `MERGED` before anything else.
   - `poll` (GitHub has not computed mergeability yet): run the same command up to 8 times,
     15s apart, until it answers `skip` or `merge-in`. Still `poll` after the 8 runs: treat it
     as `skip`.
   - `merge-in` (`mergeable` reads `CONFLICTING`, or `mergeStateStatus` reads `BEHIND`, GitHub's
     word that a branch rule requires the head to be up to date): run, from the project root,
     with `<branch>` and `<PR head>` read from
     `gh pr view <pr> --json headRefName,headRefOid`. Fetch the base first, so the merge brings
     in the base GitHub compared against, not a stale local copy:
     ```bash
     git fetch origin <base>
     node .claude/lib/record-files.js merge-base-in --base origin/<base> --branch <branch> \
       --pr-head <PR head>
     ```
     It performs a real local `git merge --no-ff --no-commit` of the base, so the project's
     `.gitattributes` applies, and resolves clashes only in record files (the notes file and
     `.trd-state/`), keeping the feature's lines then the base's. `ok: false` returns `stop`
     naming `notRecord` or `invalidJson` (the files it will not resolve) or its `reason`; the
     branch is left as it was. `ok: true` carries `head`: the new merge commit, or the
     unchanged head only when the branch already contained the base. Then, in order:
     `git push origin <branch>`; poll
     `gh pr view <pr> --json headRefOid` up to 40 times, 15s apart (10 minutes), until it equals
     the pushed commit (still different: `stop`).
   Then, after whichever action ran, **wait for CI only on a head no recorded step judged**: the
   latest pushed commit, meaning one this step pushed by `merge-in` just now or on an earlier
   attempt that stopped (a `--resume` included). A head that `wait-ci` or `collect-findings`
   already recorded against, or whose findings the owner's bar accepted, is judged: do not wait
   on it, or a check the bar accepted would turn into `red`. To wait, do steps 1 to 3 of
   `ship-primitive-wait-ci.md` (`gh pr checks <pr>`, `Monitor`, `timeout_ms: 1800000`, one rerun
   of failed jobs, `flaky-ci.js record`). A check that failed after the rerun: read
   `gh pr view <pr> --json state` again (see "One rule for every stop"), then return `red` with
   the failing check names in `reason`, before the custody gate. The sequencer then runs the loop
   (`collect-findings`, `fix-findings`, `push`, `wait-ci`, up to `rounds` times, using the steps
   `ship.md` lists) and hands this step out again; with no loop, `red` stops the run, so the merge
   never runs on red.
2. **Run the custody gate**, as `ship-custody-gate.md` says, with `--head` set to the PR's
   `headRefOid`, before reading the PR's state: a PR merged by hand while the run was parked
   still re-anchors before the merge-link proof. A gate stop returns `stop` before `gh pr merge`,
   so the PR stays unmerged. Commit and push nothing between the gate and `gh pr merge`.
3. Read `gh pr view <pr> --json state`. Already `MERGED` (a merge whose proof failed, or one
   done outside this run): skip to step 4. Otherwise check the open PR's own head first:
   ```bash
   node .claude/lib/custody.js check --state-dir <work.stateDir> --link pr-head --pr <pr> \
     --trd <work.trd|none>
   ```
   `ok: false` returns `stop` with the reason and the differing files. `ok: true` gives
   `observed`, the full id of the PR's head; run
   `gh pr merge <pr> --<method> --match-head-commit <observed>`. Never use `context.head` as the
   match id: `pr-head` reads the PR's `headRefOid`, the id GitHub compares. The parked record
   commit may move the PR head; that is harmless, because `.trd-state/` differences are ignored.
   A commit pushed to the PR since verification still fails the link or the match, so it is never
   merged unverified. A merge failure, branch protection included, returns `stop` with `gh`'s
   message. Never bypass protection.
4. Prove the merge link:
   ```bash
   node .claude/lib/custody.js check --state-dir <work.stateDir> --link merge --pr <pr> \
     --target <base> --trd <work.trd|none>
   ```
   `ok: false` returns `stop` with the reason and the differing files.
5. The merged head is the PR's `headRefOid` read from `gh pr view <pr> --json headRefOid,state`.

**One rule for every stop.** Before returning any `stop` or `red` from this contract (a `decide` failure, a `merge-base-in` stop, a failed push, a head wait that times out, a CI failure on the new head,
a custody-gate stop, a pr-head failure, a `gh pr merge` failure, a merge-link failure), read
`gh pr view <pr> --json state` again. When it reads `MERGED`, return a `stop` (also in place of
`red`) carrying `data: { merged: true, base }`, so the run record can still leave the tracked tree.

## Result

`red`: step 1's CI wait failed on a head nothing judged; no merge ran.

`merged`, with `data`: `{ merged: true, mergedHead, base, method }`. `merged` is the key
`sync-design` needs and `mergedHead` is what it reads. After `merged`, or after any stop carrying `data.merged: true`, the sequencer keeps the run
record outside the tracked tree (`detach-on: merged`, `detach-on-data: merged`), so nothing after
the merge dirties the merged branch. A gate stop on an open PR leaves it unmerged.

## Waiting

Nothing.
