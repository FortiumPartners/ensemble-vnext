# Verification sweep — the two fixes still outstanding

**For `/sweep`.** Two items. Both self-contained, both genuinely mechanical.

**Every runtime file in this repo exists twice** — `packages/core/<x>` and the vendored
`.claude/<x>` mirror — and `runtime-integrity.test.sh` asserts they are byte-identical. Edit
both, always. A fix to one copy fails the battery.

**These two touch different files and can run in parallel.**

---

## 1. An unfilled `verification.md` is never detected, though it takes milliseconds

**Where:** a new check, run before anything dispatches. Compare the project's
`.claude/rules/verification.md` against the shipped template at
`packages/core/templates/claude-directory/rules/verification.md`.

A project whose copy is byte-identical to the template has declared no environments, no refresh
commands and no credentials — so it **cannot** support functional verification, and every
criterion comes back environmentally blocked after a full loop has already run. True of 2 of the
4 reference repos checked.

**Fixed:** the check runs before dispatch and reports plainly that the file is unfilled, naming
it. It need not block — reporting it up front is the whole value.

**Where to call it from:** `/implement-trd` §3.6 and `/verify-build` §2 both do early
`--verify` work. Note item 2 below moves the preflight into §3.6, so read that item before
choosing the call site; if both land, they belong together.

## 2. The environment preflight sits hours too late in the run

**Where:** move from `packages/core/commands/implement-trd.md` §8.4a to §3.6. Mirror in
`packages/core/commands/verify-build.md` §2, which delegates to it.

§8.4a runs after the entire phase loop and the end-of-run review. So the single batched question
to the owner — asking for the one thing the environment needs — lands hours into an unattended
run, which is exactly when nobody is there to answer it. §3.6 already performs early `--verify`
work and is where this belongs.

**Pure relocation.** No behaviour change beyond when it happens. `[ran]`

**Heads-up:** an earlier sweep pass already edited §8.3 of both files (passing
`verification.md` into the loop via `stackHints`). Read the current file rather than assuming
the line numbers above; that change is on disk, uncommitted.
