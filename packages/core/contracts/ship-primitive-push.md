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

Publishes the work's `HEAD` and is the one step that reconciles the custody anchor before it
does (TRD ship-build D12, D42). `/ship-build` performs it from the sequencer's `next` output;
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
2. **Reconcile custody before anything leaves the machine:**
   ```bash
   node .claude/lib/custody.js reconcile --state-dir <work.stateDir> --trd <work.trd|none> \
     --closed <work.stateDir>/closed.json --definition <work.stateDir>/success-definition.md
   ```
   Read the one JSON line it prints.
   - `set`, `none` or `moved`: go on.
   - `reverify` (shipped source changed since the anchor and the listed must-pass criteria need
     proof again): run `/verify-build <work.trd> --criteria <ids> --no-fix --chained` (a
     synchronous Skill call), then repeat the reconcile with `--reverified
     <work.stateDir>/reverify/verification-state.json` (the subset run writes there; the
     feature's own `verification-state.json` is the old full run and would pass stale). `moved`: go on. `refused`: return `stop`, naming
     the criteria that are not `met`.
   - A `differing` list or any failure: return `stop`, naming the step and the differing files.
3. `git push -u origin <branch>` (the branch the work is on now).
4. **Prove the push link:**
   ```bash
   node .claude/lib/custody.js check --state-dir <work.stateDir> --link push --branch <branch> --trd <work.trd|none>
   ```
   `ok: false` returns `stop` with the reason and the differing files.

Never fix a failure here and never amend or force-push.

## Result

`pushed`, with `data`: `{ branch, commit, head }` (`head` is the full id of the commit pushed;
it is the key later steps `need`), and `paths` for sweep work. Any line for ISSUES goes in
`data.issues`.

## Waiting

Nothing. The step is synchronous.
