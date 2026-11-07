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

1. Read `gh pr view <pr> --json reviewDecision,headRefOid,latestReviews`. `reviewDecision` of
   `APPROVED` on the current head returns `approved`. `reviewDecision` is empty when the repository
   requires no review, so an empty one counts too when a `latestReviews` entry is `APPROVED` and
   no entry is `CHANGES_REQUESTED`.
2. Otherwise return `wait`; do not poll in-session.
3. Compare the PR's author with the account this run uses, read-only: `gh pr view <pr> --json author`
   against `gh api user --jq .login`. When they are equal, the wait reason and `data.issues` say
   PR #N was opened by <login>, the account this run uses, GitHub does not let an author approve
   their own PR, so someone else must approve; `data` gains `selfAuthored: true`. If `gh api user`
   fails the author is unknown: skip the message.
4. With `trigger=github-actions`, check two things, both read-only. First, whether
   `.github/workflows/ensemble-ship-resume.yml` exists on the remote default branch
   (`git ls-tree origin/<default> -- .github/workflows/ensemble-ship-resume.yml`). Second, whether
   the `ANTHROPIC_API_KEY` secret the workflow uses is listed by `gh secret list --json name`.
   Only if the file exists and the secret is listed, put `remoteResume: true` in the wait's `data`.
   Otherwise `remoteResume: false`; when the secret is not listed, or the call is refused (it needs
   admin), add an ISSUES line: ANTHROPIC_API_KEY could not be confirmed (an organization-level
   secret is not visible to this check), so the run must be resumed by hand. The result is still
   `wait`. This is the one place a workflow file is checked; `/ship-build` claims a trigger only
   for a `wait` carrying it.

## Result

`approved`, with `data`: `{ decision, head }`. Else `wait` with a reason and `data`:
`{ remoteResume: true|false, selfAuthored?: true }`.

## Waiting

Nothing in-session. The run parks; `/ship-build --resume` (or the trigger workflow, when
`remoteResume` is true) continues it and this step is handed out again.
