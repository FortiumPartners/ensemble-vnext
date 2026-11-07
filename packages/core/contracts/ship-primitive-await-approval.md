---
primitive: await-approval
params: trigger=
results: approved
outward: no
needs: pr
section: ship
---

# Primitive: await-approval

Parks the run until a human approves the pull request (AC-F6.1, AC-F6.2, AC-F17.1, AC-F17.2).

## Input

`trigger` (default none; `github-actions` is the one value defined), plus `pr` and `head` from
`context`.

**The current head** is the head last published: the PR's `headRefOid` when the work has a PR,
otherwise the `commit` of the latest `pushed` result in `context`. It is never local `HEAD`.

## Do

1. Read `gh pr view <pr> --json reviewDecision,headRefOid`. `reviewDecision` of `APPROVED` on
   the current head returns `approved`.
2. Otherwise return `wait`; do not poll in-session.
3. With `trigger=github-actions`, check whether `.github/workflows/ensemble-ship-resume.yml`
   exists on the remote default branch (`git ls-tree origin/<default> -- .github/workflows/ensemble-ship-resume.yml`).
   Only if it does, put `remoteResume: true` in the wait's `data`. This is the one place a
   workflow file is checked; `/ship-build` claims a trigger only for a `wait` carrying it.

## Result

`approved`, with `data`: `{ decision, head }`. Else `wait` with a reason and `data`:
`{ remoteResume: true|false }`.

## Waiting

Nothing in-session. The run parks; `/ship-build --resume` (or the trigger workflow, when
`remoteResume` is true) continues it and this step is handed out again.
