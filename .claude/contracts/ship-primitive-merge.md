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

`method` (`merge`, `squash` or `rebase`; default `merge`), plus `pr`, `base` and `head` from `context`.

## Do

1. Read `gh pr view <pr> --json state`. Already `MERGED` (a merge whose proof failed, or one
   done outside this run): skip to step 2. Otherwise
   `gh pr merge <pr> --<method> --match-head-commit <head>`, where `<head>` is the full id in
   `context.head`, so a commit pushed to the PR since the `push` step is never merged
   unverified. A failure, branch protection included, returns `stop` with `gh`'s message. Never
   bypass protection.
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
