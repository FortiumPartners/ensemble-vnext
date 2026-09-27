# Verification sweep — four discrete fixes

**For `/sweep`.** Four items. Each is worth doing on its own merits whether or not the
convergence design in `docs/plan/verification-parallelism.brief.md` ever runs — that is why they
are here and not there. Do not read that brief for these four; everything needed is below.

**Every runtime file in this repo exists twice** — `packages/core/<x>` and the vendored
`.claude/<x>` mirror — and `runtime-integrity.test.sh` asserts they are byte-identical. Edit
both, always. A fix to one copy fails the battery.

**Regions, for triage:**

- Items 1 and 2 both edit `commands/implement-trd.md` and `commands/verify-build.md`. **One
  fixer, both items.** They are related on purpose: item 2 moves the preflight, item 1 adds a
  check that belongs beside it.
- Item 3 is `lib/discovered.js` alone.
- Item 4 is `workflows/implement-phase.js` alone.

**Uncommitted work is already in the tree.** An earlier pass edited §8.3 of both command files
(passing `verification.md` into the loop) and `lib/discovered.js` (a promotion filter). Read the
current file; do not trust the line numbers below.

---

## 1. An unfilled `verification.md` is never detected, though it takes milliseconds

**Where:** a new check, run before anything dispatches. Compare the project's
`.claude/rules/verification.md` against the shipped template at
`packages/core/templates/claude-directory/rules/verification.md`. Call it from
`/implement-trd` §3.6 and `/verify-build` §2 — both already do early `--verify` work.

A project whose copy is byte-identical to the template has declared no environments, no refresh
commands and no credentials, so it **cannot** support functional verification. Every criterion
comes back environmentally blocked — after a full loop has already run. True of 2 of the 4
reference repos checked.

**Fixed:** the check runs before dispatch and says plainly that the file is unfilled, naming it.
It need not block; reporting it up front is the whole value.

## 2. The environment preflight sits hours too late in the run

**Where:** move from `packages/core/commands/implement-trd.md` §8.4a to §3.6. Mirror in
`packages/core/commands/verify-build.md` §2, which delegates to it.

§8.4a runs after the entire phase loop and the end-of-run review, so the single batched question
to the owner — asking for the one thing the environment needs — lands hours into an unattended
run, exactly when nobody is there to answer it. §3.6 already performs early `--verify` work.

**Pure relocation.** No behaviour change beyond when it happens. `[ran]`

## 3. `promoteToTrd` emits a task row that cannot be implemented or verified

**Where:** `packages/core/lib/discovered.js`, `promoteToTrd()`.

Three defects in the generated row: a placeholder `Serves` naming no objective, a `Touches`
carrying one file where the record implicates several, and an acceptance criterion phrased so it
passes whatever happens.

**Fixed:** `Serves` names a real objective; `Touches` carries every file the record implicates;
the acceptance criterion states an outcome that can fail.

**The one judgement call:** what `Serves` holds when the record names no objective. Ground it in
what `--reconcile` does with the row downstream and decide — suppressing the row and emitting a
placeholder are both defensible, and they differ in what `--reconcile` then picks up. State
which you chose and why. Do not leave a placeholder in place because the decision was awkward.

## 4. Nothing checks that new code is actually reachable

**Where:** the phase gate in `packages/core/workflows/implement-phase.js`.

A deterministic check, no agent: does every newly exported symbol have a non-test caller?

**Why it matters:** it would have caught both "built but never wired" production failures behind
this investigation — code written, tested, committed, and called by nothing. It needs no
environment, no owner declarations and no owner input, and it generalises to every repo. It is
also the only item here that touches neither the verification loop nor `verification.md`.

**It is the largest of the four, and that is fine** — it is also the most independent. Scope it
honestly: define "newly exported" against the phase's own diff rather than the whole branch,
and start with the languages this repo actually ships (JavaScript, Python, shell). A check that
covers JavaScript well beats one that covers three languages badly.

**Fixed:** the gate reports any exported symbol whose only callers are test files. Report, do not
block — a false positive that fails a phase gate is worse than one that prints a line.
