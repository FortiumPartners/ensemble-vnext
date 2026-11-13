---
primitive: merge
params: method=merge, rounds=2
results: merged, red, moved
stops-on: red, moved
loop-on: red, moved
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
head may be fixed and the merge retried; `0` turns the loop off, so `red` stops the run), plus `pr`,
`base`, `judgedHead` (the head a step last judged; absent on a run recorded before it existed) and
`head` from `context`, and `loop` (`{ on, roundsLeft }`, or `null` when no fix loop exists) from the
step's input. `moved` and `red` share the `rounds` bound: a move-and-collect round leaves one fewer
for `red`.

## Do

0. **Catch up with the branch first.** Another session may have pushed to the PR branch while this
   run was parked or between steps, so local `HEAD` can trail the PR. With `<branch>` from
   `gh pr view <pr> --json headRefName`:
   ```bash
   node .claude/lib/merge-up.js sync-head --pr <pr> --branch <branch> --base <base> \
     --judged <context.judgedHead|none> --trd <work.trd|none>
   ```
   It prints one JSON line. `ok: false` because it could not read the PR is run again, up to 8
   times, 15s apart, like `decide`; still failing returns `stop` with its `reason`. Any other
   `ok: false` (a closed PR, local commits that change non-record files and are not on the branch,
   a conflicting merge of record-file commits, a fetch failure) returns `stop` with its `reason`,
   which names the remedy; nothing is repaired. A `MERGED` PR comes back `moved: false` and
   touches nothing. Otherwise it has brought local up to the branch's pushed tip (`sync` is
   `none`, `fast-forward` or `merged`) and returns `head` (that tip), `moved` (`head` is not
   `context.judgedHead`; true when none is recorded, because an unknown head is waited on),
   `baseOnly` (every non-record change since the judged head came from the base) and `changed`.
   Keep `head`, `moved` and `baseOnly` for step 1. When `moved`, poll
   `gh pr view <pr> --json headRefOid` up to 40 times, 15s apart (10 minutes), until it equals
   `head` (still different: `stop`): GitHub's head trails a push by about 80s, and `gh pr checks`
   reads checks on `headRefOid`, so a wait started earlier would judge the old head's checks and
   record the new head as judged with no CI seen on it.
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
   Then, after whichever action ran, **wait for CI on every PR head that is not
   `context.judgedHead`**: a head another session pushed (`moved` from step 0), a merge-in commit
   this step pushed just now, or one pushed by an earlier attempt that stopped (a `--resume`
   included). A head equal to `context.judgedHead` is judged: do not wait on it, or a check the
   owner's bar accepted would turn into `red`; the same holds for a head `wait-ci` or
   `collect-findings` already recorded against. To wait, do steps 1 to 3 of
   `ship-primitive-wait-ci.md` (`gh pr checks <pr>`, `Monitor`, `timeout_ms: 1800000`, one rerun
   of failed jobs, `flaky-ci.js record`). Where `wait-ci` would return `failed` (a check still
   failing after the rerun, or a capped flake): read `gh pr view <pr> --json state` again (see
   "One rule for every stop"). `MERGED` (merged by hand during the wait) goes on to step 2, which
   proves that merge. Otherwise return `red`, before the custody gate, with the failing check
   names in `reason` and `data: { failed, flaky, head, judgedHead }`: `wait-ci`'s `data`
   (`{ failed: [...], flaky: [...] }`, each `failed` entry with its name and run id,
   `capped: true` on a capped flake) plus `head` and `judgedHead`, both the full id of the PR head
   that was waited on (its `headRefOid`). The loop's `collect-findings` reads the failures from
   `context.failed`; without them it would find nothing, return `clean` and hand the merge out
   again on the red head. `head` names that red head, so `context.head` points at the commit the
   loop is fixing, and `judgedHead` records that CI judged it. The sequencer then runs the loop
   (`collect-findings`, `fix-findings`, `push`, `wait-ci`, up to `rounds` times, using the steps
   `ship.md` lists) and hands this step out again; with no loop, `red` stops the run, so the merge
   never runs on red.

   **A green wait on a moved head.** When the wait passed on a head step 0 reported `moved` and not
   `baseOnly`, the new commits came from another writer and nobody has collected findings on
   them. With a round left (`input.loop` is not `null` and its `roundsLeft` is above 0), return
   `moved` with `data: { failed: [], flaky, head, judgedHead }`, `head` and `judgedHead` both the
   head just waited on. The sequencer runs the same loop (`collect-findings` on the new head, and
   `fix-findings`, `push`, `wait-ci` when it finds something) and hands this step out again; it
   then finds `context.judgedHead` equal to the branch tip and does not wait again. With no loop
   round left, go on to the custody gate, which re-proves any must-pass criterion the new commits
   affect, and merge pinned to the new head; add one `data.issues` line saying the merge ran with
   commits no step collected findings on (another session's, or of unknown origin when
   `context.judgedHead` was absent). A moved head that is only the
   base merged in, or a green wait on a head that did not move, goes straight on to step 2.
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

**One rule for every stop.** Before returning any `stop` or `red` from this contract (a `sync-head` failure, a `decide` failure, a `merge-base-in` stop, a failed push, a head wait that times out, a CI failure on the new head,
a custody-gate stop, a pr-head failure, a `gh pr merge` failure, a merge-link failure), read
`gh pr view <pr> --json state` again. When it reads `MERGED`, a `stop` carries
`data: { merged: true, base }`, so the run record can still leave the tracked tree; a `red` is not
returned at all: go on to step 2, which proves the merge done outside this run.

## Result

`red`, with `data`: `{ failed, flaky, head, judgedHead }` (`failed` and `flaky` as `wait-ci` records them,
`head` and `judgedHead` the PR head waited on): step 1's CI wait failed on a head not yet judged; no
merge ran.

`moved`, with `data`: `{ failed: [], flaky, head, judgedHead }`: the branch moved under this run
(another session pushed), CI passed on the new head, and the new commits are more than the base
merged in; no merge ran. The loop collects findings on them, then hands this step out again.

`merged`, with `data`: `{ merged: true, mergedHead, base, method }`. `merged` is the key
`sync-design` needs and `mergedHead` is what it reads. After `merged`, or after any stop carrying `data.merged: true`, the sequencer keeps the run
record outside the tracked tree (`detach-on: merged`, `detach-on-data: merged`), so nothing after
the merge dirties the merged branch. A gate stop on an open PR leaves it unmerged.

## Waiting

Nothing.
