---
primitive: open-pr
params: base=
results: opened, reused
outward: unless ensemble.openPullRequest=auto
needs: head
provides: pr
section: ship
---

# Primitive: open-pr

Opens the work's pull request, or reuses the open one (D22, D42).

## Input

`base` (default: the default branch as `pull-request.js` finds it), plus `work` and `context`
(the `pushed` result's `branch` and `head`).

## Do

1. Write a short PR body to a temp file (the work, its TRD, what was verified), then run, as
   `audit-build.md`'s "Open the pull request" recipe does:
   ```bash
   node .claude/lib/pull-request.js ensure --base <base> --listed --title "<work>: <one line>" \
     --body-file <tmp> --expect-branch "<implement.json branch, else context.branch>"
   ```
   `--base` is passed only when the step set `base=`. `--listed` is here because the step being
   in `ship.md` is the authorization; the sequencer has already applied the gate.
2. The line it prints is `{action, url, reason}`. `failed` or `skipped` returns `stop` with the
   reason. An open PR for the branch that targets another base is retargeted by the library and
   comes back `updated`.
3. The PR number is the digits after `/pull/` in the URL.
4. `ensure` re-pushes the branch, so prove the push link again:
   ```bash
   node .claude/lib/custody.js check --state-dir <work.stateDir> --link push --branch <branch> --trd <work.trd|none>
   ```
   A commit made since the last `push` step fails this check; return `stop` with the differing
   files and say a `push` belongs after the step that committed.

## Result

`opened` (the library said `opened`) or `reused` (`updated`), with `data`: `{ pr, url, base,
head }` (`pr` is the key later steps need).

## Waiting

Nothing.
