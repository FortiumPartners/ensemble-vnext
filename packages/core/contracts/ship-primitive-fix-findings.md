---
primitive: fix-findings
params: format=
results: fixed, nothing
outward: no
needs: findings
section: ship
---

# Primitive: fix-findings

Turns the open blocking findings into code through the recorded path (D14, D15, D19, D40). It
never pushes (the next `push` does) and never edits code itself.

## Input

`format` (default none: a command that formats and lints the project), `work`, `context`.

## Do

1. Read the open blocking rows: `discovered.readAll(<work.stateDir>, { open: true })` filtered to
   `blocksFeature: true`. None: return `nothing`.
2. **`[lint]` rows with `format=` set.** Run the command, commit only the files it changed
   (pathspec), then `node .claude/lib/custody.js reconcile --state-dir <work.stateDir> --trd
   <work.trd|none> --reason format` (a formatter commit needs no re-verification). Then
   `discovered.resolve(<work.stateDir>, row, "formatted <sha>")` for each `[lint]` row handled,
   **before** the chained build below: its first act promotes open rows into TRD tasks, and only
   a resolved row is skipped. With no `format=`, a lint failure is a code fix and its row stays
   open.
3. **The rest is TRD work.** Run `Skill({ skill: "implement-trd", args: "<work.trd>
   --reconcile --chained --shipping" })` (synchronous). Read its RETURN line. A STUCK return
   returns `stop` with its reason. Otherwise `discovered.resolve` each row you handed over
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
