---
primitive: merge
params: method=merge
results: merged
outward: yes
needs: pr
provides: merged
section: ship
---

# Primitive: merge

Merges the pull request and proves that what merged is what was verified (D11, D21).

## Input

`method` (`merge`, `squash` or `rebase`; default `merge`), plus `pr` and `base` from `context`.

## Do

1. Read `gh pr view <pr> --json state`. Already `MERGED` (a merge whose proof failed, or one
   done outside this run): skip to step 2. Otherwise check the open PR's own head first:
   ```bash
   node .claude/lib/custody.js check --state-dir <work.stateDir> --link pr-head --pr <pr> \
     --trd <work.trd|none>
   ```
   `ok: false` returns `stop` with the reason and the differing files. `ok: true` gives
   `observed`, the full id of the PR's head; run
   `gh pr merge <pr> --<method> --match-head-commit <observed>`. Never use `context.head` as the
   match id: `pr-head` reads the PR's `headRefOid`, the id GitHub compares, where `push` reads
   `git ls-remote`, and the two can disagree for about 80s after a push. The parked record commit
   may move the PR head; that is harmless, because `.trd-state/` differences are ignored. A commit
   pushed to the PR since verification still fails the link or the match, so it is never merged
   unverified. A merge failure, branch protection included, returns `stop` with `gh`'s message.
   Never bypass protection.
2. Prove the merge link:
   ```bash
   node .claude/lib/custody.js check --state-dir <work.stateDir> --link merge --pr <pr> \
     --target <base> --trd <work.trd|none>
   ```
   `ok: false` returns `stop` with the reason and the differing files.
3. The merged head is the PR's `headRefOid` read from `gh pr view <pr> --json headRefOid,state`.

## Result

`merged`, with `data`: `{ merged: true, mergedHead, base, method }`. `merged` is the key
`sync-design` needs and `mergedHead` is what it reads.

## Waiting

Nothing.
