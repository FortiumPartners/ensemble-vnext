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


## End-to-end cost — the decisive measurement

Both arms, same accounting (billed = input + output + cache-write; cache reads shown
separately because they are cheap but reveal context duplication):

| | old | new | ratio |
|---|---|---|---|
| billed tokens | 1,016,116 | **4,467,301** | **4.4x** |
| cache reads | 3,277,360 | **49,244,446** | **15x** |
| tool calls | 23 | 299 | 13x |
| wall clock | 13 min | **49 min** | 3.8x |
| agents | 2 | 14 | 7x |
| **TRD tasks** | **36** -> 180 loop invocations | **24** -> 120 | **-33%** |

### Break-even

Planning costs **+3.45M billed** and buys back **60 avoided implement-loop invocations**.
Break-even is therefore **57,500 billed tokens per avoided invocation**.

That bar is probably cleared — the old arm's TRD-authoring agent alone spent 627k billed,
and an implement agent writes code and runs tests — but it is **unmeasured**, and the whole
economic case rests on it.

Not captured by that arithmetic: the new arm found requirement 1 was already built. If the
old arm's 36 tasks include reimplementing `/rebase-project --dry-run`, that is not a
granularity difference but wasted implementation plus later reconciliation.

## DECISION (2026-08-14): the new path is NOT the default  — **REVERSED, see below**

4.4x is not adoptable on a projection. Two conditions, both required:

1. **Context duplication fixed.** The 49.2M cache reads were six verifiers each loading the
   whole TRD and the whole PRD regardless of need. Addressed by per-verifier read discipline
   (`READ_DISCIPLINE` in both scripts) — narrows how each verifier reads, never what it is
   asked to find. **Effect unmeasured until the next run.**
2. **Phase-1 implement measured from both arms**, same starting commit, separate branches.
   That yields the real cost-per-invocation and settles the break-even.

Until both land, the old path stays default and the new path is opt-in.


## Optimisation A/B — PRD stage (2026-08-15)

Same spec, same output shape. `new/` is pre-optimisation, `new-v2/` is post.

| create-prd stage | before | after | delta |
|---|---|---|---|
| cache write | 1,223,282 | **954,749** | **-22%** |
| output | 77,719 | 47,307 | -39% |
| cache read | 11,328,877 | 6,715,844 | **-41%** |
| tool calls | 91 | 58 | -36% |
| **wall clock** | **14.2 min** | **9.3 min** | **-35%** |
| agents | 5 | 5 | — |

Projection was 14%; cache write came in at 22% and wall clock at 35%.

Per-agent cache write, sorted: before `309k 301k 291k 183k 139k`, after
`287k 270k 188k 147k 63k`. The smallest agent fell to near bare startup cost (58.6k
measured), which is the signature of a verifier that stopped opening the artifact and
worked from the inline records instead.

**Quality held.** 3 findings, all applied, none rejected, 3/3 verifiers. It again found
that `/rebase-project` §2.1-2.5 already does per-file byte comparison with `--dry-run`
report-only, so F1 became "reuse it". It also found something the pre-optimisation run
missed: `runtime-refresh.sh` performs the silent overwrite automatically at every
SessionStart on version comparison alone, with four guards that gate *whether* a refresh
runs and none that inspect content. And it isolated the one piece of genuinely new work --
rules are the only component kind with no existing diff, since governance files are never
modified and framework rules are preserved as-is.

Fewer findings than the pre-optimisation run's 13, from a better starting draft: the author
now reads a 2,931-token contract rather than a 6,819-token command file padded with
orchestration detail it never uses.


---

## DECISION REVERSED (2026-08-15): the new path IS the default

The earlier decision optimised the wrong variable. It weighed a 4.5x planning-token premium
against an implement-stage saving and concluded the premium did not repay. Both halves of
that framing were wrong:

1. **The metric understated the premium.** `billed` excluded cache reads entirely; weighted
   properly the premium is larger, not smaller. So the original decision was not even right
   on its own terms.
2. **The variable was wrong.** Token cost is not what a planning stage is for. Across three
   cases the new path produced materially better designs, and the owner's position is that
   better designs and tighter implementations are close to priceless. A 4.5x premium on the
   cheap stage of the pipeline is not a reason to ship worse designs.

### What the three cases actually showed

| | cost | design |
|---|---|---|
| case 1 — in-repo brownfield | v3 worse once weighted | v3 |
| case 2 — greenfield | old, decisively | v3 marginally |
| case 3 — herald, external brownfield | old, decisively (4.5x) | **v3 clearly** |

The case-3 evidence is the load-bearing part, because it is the only comparison of DELIVERED
CODE rather than of self-reports or token counts:

- The old arm shipped `draft_id INTEGER NOT NULL REFERENCES drafts(id)` into a codebase that
  runs `PRAGMA foreign_keys=ON` and whose migrations do `ALTER TABLE drafts RENAME TO
  drafts_backup_f014` then `DROP TABLE drafts_backup_f014`. Reproduced in five lines: SQLite
  silently rewrites the REFERENCES clause on rename, and the insert then fails with
  `no such table: main.drafts_backup_f014`. Latent corruption, invisible to every test.
  The v3 arm's grounding block caught it and omitted the clause with the reason written into
  the schema file.
- On the spec's hard problem, the old arm's design fails toward DUPLICATE PUBLISHING (its
  reconciliation oracle is an exact hash of a body platforms rewrite, and a non-match routes
  to republish). The v3 design refuses to guess, finds a real signature for
  "dispatched, outcome unknown", and routes adjudication through the same ledger everything
  else consults.
- Shape: old added 2,530 lines as a new parallel subsystem; v3 added 1,177 and deleted 243,
  extending what existed.

### Why this matters beyond one feature

`lightning-lane` carries 61 PRDs and 96 TRDs. Its `packages/workers/src/poi/reconcile/`
holds v1 (6 files, 2,264 lines) and v2 (5 files, 2,012 lines) side by side. v2 imports
nothing from v1; v1's only remaining consumers are its own barrel export and its own tests,
and two v2-era code comments reference it as a pattern. ~2,264 lines that pass their tests
and run nowhere, indistinguishable in the tree from live code.

That is precisely what `Replaces` and the corpus index target, and it compounds with every
TRD authored without sight of the others.
