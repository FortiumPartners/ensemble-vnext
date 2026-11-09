---
primitive: merge
params: method=merge
results: merged
outward: yes
needs: pr
provides: merged
detach-on: merged
section: ship
---

# Primitive: merge

Merges the pull request and proves that what merged is what was verified (D11, D21).

## Input

`method` (`merge`, `squash` or `rebase`; default `merge`), plus `pr` and `base` from `context`.

## Do

1. **Run the custody gate first**, as `ship-custody-gate.md` says, with `--head` set to the PR's
   `headRefOid`, before reading the PR's state: a PR merged by hand while the run was parked
   still re-anchors before the merge-link proof. A gate stop returns `stop` before `gh pr merge`,
   so the PR stays unmerged. Commit and push nothing between the gate and `gh pr merge`.
2. Read `gh pr view <pr> --json state`. Already `MERGED` (a merge whose proof failed, or one
   done outside this run): skip to step 3. Otherwise check the open PR's own head first:
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
3. Prove the merge link:
   ```bash
   node .claude/lib/custody.js check --state-dir <work.stateDir> --link merge --pr <pr> \
     --target <base> --trd <work.trd|none>
   ```
   `ok: false` returns `stop` with the reason and the differing files.
4. The merged head is the PR's `headRefOid` read from `gh pr view <pr> --json headRefOid,state`.

## Result

`merged`, with `data`: `{ merged: true, mergedHead, base, method }`. `merged` is the key
`sync-design` needs and `mergedHead` is what it reads. After `merged` the sequencer keeps the run
record outside the tracked tree (`detach-on: merged`), so nothing after the merge dirties the
merged branch. A gate stop leaves the PR unmerged.

## Waiting

Nothing.
