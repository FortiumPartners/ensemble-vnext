# A/B artifacts — preservation and the implement extension

## Status: frozen evidence

The four artifacts in `old/` and `new/` are **experimental evidence, not project TRDs.**
They were produced by two pipelines from one spec (`spec.md`) to answer item 8's
keep-or-revert question, and their value depends on nobody editing them after the fact.

**Do not `/refine-trd` these. Do not implement from them in place.** A later reader must be
able to see exactly what each pipeline produced, unaltered.

| File | Produced by |
|---|---|
| `spec.md` | Hand-written. 38 lines, 5 MUSTs, 2 non-goals, **zero numbers**. |
| `old/PRD.md` | `create-prd.md` + `product-manager.md` at `a17316c~1`, single agent |
| `old/TRD.md` | `create-trd.md` + `technical-architect.md` at `a17316c~1`, single agent |
| `new/PRD.md` | `.claude/workflows/create-prd.js` — 5 agents, 13 findings, 11 applied |
| `new/TRD.md` | `.claude/workflows/create-trd.js` — 9 agents |

Reproduction commands and contamination checks are in `README.md` alongside them.

---

## Why implementing from these is the test worth running

The sizing question — *are tasks the right size?* — cannot be settled by counting them.
The old arm produced **36 tasks (180 implement-loop agent invocations)**; the new arm's
count is whatever it is. Neither number means anything without knowing whether a task can
actually be picked up and finished.

**The only honest test is to implement and watch what breaks:**

- A task too **large** blows its context window, or comes back with a partial result the
  VERIFY stage cannot judge as pass or fail.
- A task too **small** costs five agent invocations to change one line.
- A task that is not **independently implementable** stalls waiting for another task's
  output that its `Dependencies` column never declared.
- A task that is not **independently verifiable** has no check that passes or fails on it
  alone, so VERIFY either rubber-stamps it or re-tests the whole feature.

Those four are observable in a real run and invisible in a document review.

## The feature is real, which is what makes this affordable

This is not a throwaway. The new PRD established that `/rebase-project --dry-run` already
satisfies requirement 1 (`rebase-project.md:169-421`, report-only at `:451`/`:949`), so the
genuinely novel work is:

- **F2** — a *content-based* customization test. The existing check is existence-based.
- **F3** — a degraded mode when no plugin is installed. `/rebase-project` aborts at
  `rebase-project.md:97-99`.

Both are things this repository actually wants. `runtime-refresh.sh` runs on SessionStart in
every scaffolded project and overwrites present components **with no backup** — so the harm
the spec describes is already automated and unattended.

## How to run it without destroying the evidence

1. **Copy, never move.** Promote a TRD to a real path:
   ```
   cp docs/modernization/runs/ab-test/new/TRD.md docs/TRD/runtime-drift-detection.md
   ```
   The `ab-test/` originals stay untouched and committed.

2. **Do not repoint `current.json` yet.** It currently targets
   `docs/TRD/discipline-judgment.md` (20/21 tasks, 1 blocked). Repointing abandons that
   feature's tracking. Decide what happens to item 5b first — that is a real open question,
   not a formality.

3. **Run one phase, not the whole TRD.** `/implement-trd --phase 1` against each arm is
   enough to observe all four sizing failures. Implementing 36 tasks to prove a point about
   task size is the same over-spend the experiment exists to detect.

4. **Record per-task cost.** Tokens and wall-clock per task is the measurement that turns
   "sized appropriately" from a judgment into a number. Nothing in the framework captures
   this today; `.trd-state/<feature>/implement.json` tracks status, not cost.

## What a fair implement comparison requires

Both arms plan the same feature, so this is genuinely like-for-like — unlike the earlier
stop-hook comparison, which set a greenfield plan against a brownfield delta plan and was
not comparable at all.

**Run the same phase from both arms**, on separate branches, from the same starting commit.
The old arm's 36 tasks and the new arm's task set overlap in scope, so the comparison is
cost-and-outcome for equivalent delivered functionality — not tasks completed, which
rewards whichever arm chopped the work finer.

**Expect the old arm to implement invented requirements.** Its PRD added six functional
requirements with no source in the spec, and carried `95%`/`85%` classification-accuracy
targets and `< 3 s` / `< 5 ms/file` / `< 100 MB` performance budgets that nobody asked for.
Watch specifically for implementation effort spent on those — that is the cost of PRD
invention made concrete, and it is the strongest possible evidence for or against item 10.
