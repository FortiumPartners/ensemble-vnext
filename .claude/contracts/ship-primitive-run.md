---
primitive: run
params: command
results: ran
outward: yes
needs:
section: any
rest: command
---

# Primitive: run

Runs one command exactly as the owner wrote it in `ship.md`. Release and platform steps that
have no primitive of their own (a version bump, a tag, a store submission) are `run` lines.

## Input

`command`: the rest of the step's line, verbatim.

## Do

1. Run the command as written, from the project root. Do not edit, extend or repair it.
2. A non-zero exit returns `stop` with the command's final output lines as the reason.
3. A commit the command makes is reconciled by the next `push` step; a string that commits
   writes `push` after the committing step.

## Result

`ran`, with `data`: `{ command, exit: 0 }`.

## Waiting

The command is synchronous.
