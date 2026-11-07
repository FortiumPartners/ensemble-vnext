---
primitive: fix-findings
params: format=
results: fixed, nothing
outward: no
needs: findings
requires: trd
section: ship
---

# Primitive: fix-findings

Turns the open blocking findings into code through the recorded path (D14, D15, D19, D40). It
never pushes (the next `push` does) and never edits code itself.

## Input

`format` (default none: a command that formats and lints the project; with none, a `[lint]`
row stops the step rather than becoming a model edit), `work`, `context`.

## Do

1. Read the open blocking rows: `discovered.readAll(<work.stateDir>, { open: true })` filtered to
   `blocksFeature: true`. None: return `nothing`.
2. **`[lint]` rows: the project's formatter, never a model edit (AC-F5.2).**
   - **No `format=` set:** a `[lint]` row is never handed to the build below, because that
     would make a lint fix a model edit. Return `stop` before running anything, naming each
     `[lint]` row and saying the step needs `format=<the project's format/lint command>` (the
     owner sets it with `/ship-setup`), then `/ship-build --resume`. The rows stay open, and the
     other blocking rows wait for the resumed pass.
   - **`format=` set:** run the command and look at what it changed (`git status --porcelain`).
     It changed files: commit only those files (pathspec), then `node .claude/lib/custody.js
     reconcile --state-dir <work.stateDir> --trd <work.trd|none> --reason format` (a formatter
     commit needs no re-verification), then `discovered.resolve(<work.stateDir>, row, "formatted
     <sha>")` for each `[lint]` row handled, **before** the chained build below: its first act
     promotes open rows into TRD tasks, and only a resolved row is skipped. It changed nothing:
     the lint failure needs a hand edit, so its row stays open and goes to the build below as
     the recorded path, like any other blocking row.
3. **The rest is TRD work.** First snapshot the tree outside `.trd-state/`:
   `git status --porcelain --untracked-files=all` plus `git hash-object <path>` for each path it
   lists that still exists (a deleted path has no content to hash; its status line alone is its
   snapshot) (the pattern of `/plan`'s Step 7a). Then run `Skill({ skill: "implement-trd", args: "<work.trd>
   --reconcile --chained --shipping" })` (synchronous). Read its RETURN line. A STUCK return
   returns `stop` with its reason. Then snapshot again and compare: a path whose
   status line is new or different, or whose `git hash-object` differs, is the build's own edit
   (a path dirty before the build with an unchanged hash is not). Commit those paths by pathspec
   (`git add -- <paths>`, `git commit -m "fix: <rows> build edits" -- <paths>`, never `git add -A`)
   before recording any result; name them in `data.issues` only if that commit fails. This is
   prose the model follows, not a deterministic guarantee. Otherwise `discovered.resolve` each row you handed over
   (`fixed by reconcile at <sha>`), except one whose promoted task the line lists under `not
   built`, which stays open so the next pass holds only new findings and unbuilt ones.
4. **Sweep work has no TRD** (`work.kind` is `sweep`): return `stop` naming `/plan <the
   findings>` and then `/ship-build --resume`, and resolve the rows handed over as `handed to
   /plan` so the resumed pass does not rebuild them. Flaky re-runs and formatter runs still apply.

## Result

`fixed` (a formatter commit or a build ran) or `nothing`. `data`: `{ fixed: <count>, issues }`
with any row left open named in `issues`.

## Waiting

The chained build is a synchronous Skill call; there is nothing to arm.
