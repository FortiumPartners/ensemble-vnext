# A/B: old vs new generator pipeline

One hand-written spec, run through both pipelines, chained PRD -> TRD. Four artifacts.
Answers item 8's keep-or-revert question and tests item 10's claims against a live case.

**These are frozen evidence.** See `PLAN.md` before doing anything with them.

## Reproduce

Old arm (pre-rewrite commands + agents from `a17316c~1`, single agent each):
```
git show a17316c~1:packages/core/commands/create-prd.md   # +  .claude/agents/product-manager.md
git show a17316c~1:packages/core/commands/create-trd.md   # +  .claude/agents/technical-architect.md
```
New arm:
```
Workflow({scriptPath: ".claude/workflows/create-prd.js",
          args: {source: "docs/modernization/runs/ab-test/spec.md",
                 prd: "docs/modernization/runs/ab-test/new/PRD.md",
                 feature: "runtime-drift-detection"}})
Workflow({scriptPath: ".claude/workflows/create-trd.js",
          args: {prd: "docs/modernization/runs/ab-test/new/PRD.md",
                 trd: "docs/modernization/runs/ab-test/new/TRD.md",
                 feature: "runtime-drift-detection"}})
```

## Contamination control

Every agent in both arms was barred from reading `docs/modernization/` except its own
input. Verified per agent by extracting `file_path` from its transcript. **Both old-arm
agents were clean**: instruction files, own input, own output, nothing else. Zero reads
under `ab-test/new/`.

## Measured so far

| | old | new |
|---|---|---|
| PRD | 60,071 B / 747 lines | 42,086 B / 544 lines |
| PRD requirements from a 5-MUST spec | 12 (**6 with no source in the spec**) | scoped to what is actually novel |
| TRD | 84,198 B / 1,289 lines | pending |
| TRD tasks | **36** -> 180 implement-loop agent invocations | pending |
| numbers, from a spec containing **zero** | PRD 23, TRD 20 | PRD: coverage floor only, cited to `constitution.md` |
| cost | 1 agent per stage | PRD 476k tok / 14 min / 5 agents |

### Findings that only one arm produced

**New arm — requirement 1 is already built.** `/rebase-project --dry-run` does byte-level
per-file comparison, is report-only, and handles the pre-stamp case
(`rebase-project.md:169-421`, `:451`, `:949`, `:150`). The novel work is F2 and F3 only.
The old arm wrote 12 requirements and never noticed.

**New arm — a live doc-vs-code contradiction**, in exactly the area this feature governs:
`ensemble-vnext.md` PRD `:553-564` and TRD `:588-608` both say *do NOT overwrite customized
agents*; `rebase-project.md:177-184` replaces any differing agent.

**New arm — a mechanism impossibility.** AC-N1's "snapshot, run, diff" cannot hold for an
in-session delivery, because SessionStart's `runtime-refresh.sh` rewrites `.claude/` first.

### Correction against my own earlier claim

The old TRD was given a template hardcoding `>=80%` / `>=70%` and **used 60%/50% from the
constitution instead**, citing it explicitly. Zero occurrences of 80% or 70%.

So the template's hardcoded value is an **influence, not a determinant** — a capable model
can override it. The corpus measurement in `item-10-trd-path.md` §3.1 still stands (5 of 10
unsourced objectives across 8 real TRDs *were* inflated coverage targets), but
"root cause", as stated in commit `a17316c`, was too strong. Deleting the number remains
correct: it removes the influence rather than relying on the author to notice.

**Confirmed instead — the PRD->TRD inflation chain.** `95%` appears twice in the old PRD and
once in the old TRD. An invented accuracy target became a technical requirement one stage
downstream. That is the mechanism behind the task-inflation perception: the TRD is not
inventing, it is faithfully implementing invented PRD content.
