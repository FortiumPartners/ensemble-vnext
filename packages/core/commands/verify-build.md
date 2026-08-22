---
name: verify-build
description: Run the functional verification loop on its own — does the delivered software do what the PRD says, checked with artifacts
version: 1.0.0
argument-hint: "[trd-path] [--resume] [--cap N]"
category: verification
---

Run the bounded functional-verification loop against already-delivered code.

## User Input

```text
$ARGUMENTS
```

If no TRD path is given, resolve from `.trd-state/current.json`'s `trd`.

---

## Why this exists separately from `/implement-trd --verify`

The loop is the same loop — one `Workflow(verify-functional, …)` call, identical arguments,
identical outcomes. This command is `/implement-trd`'s Step 8 with nothing else attached, and
it exists because **the three commonest reasons to want the loop have nothing to do with
running an implementation**:

- The implementation ran **without** `--verify` and you want the check now.
- The loop **crashed, stalled, or was interrupted**, and re-running `/implement-trd` to reach
  it would re-enter the phase loop over already-complete tasks.
- You **fixed something by hand** — a credential, a config, the environment — and want to
  re-verify without touching implementation at all.

Running `/implement-trd --verify --resume` covers the second case, but only because Step 3.6's
composition gate skips the phase loop; that is a subtle path to rely on for the ordinary act
of "verify what is already built."

**This command never implements.** It dispatches no implementer, runs no phase, writes no task
state, and makes no commit beyond the loop's own artifacts. If the definition is missing it
says so and stops — it does not derive one, for the same reason Step 8 does not (that would be
a second production path outside the contract's citation discipline).

---

## Steps

### 1. Resolve the TRD and feature

Explicit path argument wins; otherwise `.trd-state/current.json`'s `trd`. The feature slug is
the TRD basename. No branch derivation — you are verifying what is on disk now.

### 2. Preflight the environment

**Identical to `/implement-trd` §8.4a — read that section and follow it.** Read
`.claude/rules/verification.md` and resolve each criterion as exercisable / `not_verifiable` /
needs-one-thing-from-the-owner, batch that last bucket into ONE question with a stated
default, then run on whatever remains. Partial verification with stated gaps beats none.

### 3. Read the inputs from disk

Exactly the inputs §8.1–§8.3 assemble. **Read those sections rather than restating them here** —
a second copy of an argument list is a second copy to drift.

- `.trd-state/<feature>/success-definition.md` — **absent → report `not run: no definition
  produced` through the lib CLI's `render-report` and STOP.** Do not derive one.
- `.claude/verification-notes.md`, the stack hints, the contract text, `.claude/rules/verification.md`
- `.trd-state/<feature>/verification-state.json` — for `--resume`
- `since` — resolved per §8.3

### 4. Dispatch

One `Workflow({ name: "verify-functional", args: {…} })`. Every field §3.3 of
`docs/TRD/functional-verification.md` names, including `resume`. `--cap N` overrides the
iteration cap; default 3.

### 5. Report

Render the outcome — `satisfied` / `unbuilt` / `stalled` / `stuck`, or either `not run` case —
with the per-criterion counts and the report path.

**§8.5 applies here in full: while the loop is in flight, its gaps are not yours to fix.**
Record them and let it finish.

---

## `--resume`

Re-enters at the next iteration from `verification-state.json`, seeding `previousGaps`. The
state file's `outcome` key decides: `null` means the run stopped mid-loop and is resumable;
any of the four outcome strings means it finished and `--resume` starts a fresh run instead.

---

## Output discipline (see `.claude/rules/command-status.md`)

**The banner is the LAST line of the turn. Nothing after it — not a caveat, not a finding, not
a recommendation.** Anything worth saying goes above it.

```
═══ COMMAND COMPLETE: /verify-build ═══
<outcome, criterion counts, report path>
```

On unrecoverable failure use `═══ COMMAND STUCK: /verify-build ═══` with `Reason:` and `Next:`.

```bash
.claude/hooks/notify-complete.sh "verify-build" "complete" "<one-line summary>"
```

---

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

Runs autonomously from invocation to the banner. `AskUserQuestion` is permitted only for the
four cases in `autonomy.md` — and on this command the realistic one is §2's preflight batch:
information that genuinely cannot be derived, asked ONCE, up front, with a stated default.

Do not pause to report interim findings. Do not offer to fix what the loop surfaces.
