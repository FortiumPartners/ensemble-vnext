---
primitive: push
params:
results: pushed
outward: no
needs:
provides: head
section: ship
---

# Primitive: push

Publishes the work's `HEAD` and sets the custody anchor when none exists (TRD ship-build D12,
D42). `/ship-build` performs it from the sequencer's `next` output;
this file is the whole instruction set.

## Input

`work` (kind, id, trd, branch, stateDir), `final`, `laterNeeds` (the `needs:` keys of the steps
still to come) and `context` (every earlier result's `data`). No parameters.

## Do

1. **Sweep work only (D31, D39).** When `work.kind` is `sweep`:
   - If the current branch is the default branch and `laterNeeds` contains `pr`, create **and
     switch to** `ship/<work.id>` at `HEAD` with `git switch -c ship/<work.id>`; the uncommitted
     sweep changes carry over. Otherwise stay on the current branch.
   - On the first push of the run, take the pathspec: every path `git status --porcelain` lists
     now, except the state directory. Keep it in this result's `data.paths`; a later `push` in a
     `repeat` reads it back from `context.paths`.
   - Commit exactly that pathspec (`git add -- <paths>`, never `git add -A`) with a message that
     names the sweep and each path. List each path in the readout line for this step.
2. **Set the anchor if none exists** (never compares or moves one; the custody gate before a
   merge or release does that):
   ```bash
   node .claude/lib/custody.js reconcile --set-only --state-dir <work.stateDir> \
     --trd <work.trd|none> --closed <work.stateDir>/closed.json
   ```
3. `git push -u origin <branch>` (the branch the work is on now). The push itself is not gated by
   custody.

Never fix a failure here and never amend or force-push.

## Result

`pushed`, with `data`: `{ branch, commit, head }` (`head` is the full id of the commit pushed;
it is the key later steps `need`), and `paths` for sweep work. Any line for ISSUES goes in
`data.issues`.

## Waiting

Nothing. The step is synchronous.
