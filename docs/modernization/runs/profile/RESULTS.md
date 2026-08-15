# Final profile: `create → refine --auto → audit`

Rubric and failure conditions were fixed in `README.md` **before** any run started. This file
records what happened against them.

## Cost and time

| Stage | ensemble | herald |
|---|---:|---:|
| `create-prd` | $6.69 / 6.8 min | $19.74 / 10.2 min |
| `refine-prd --auto` | $16.53 | $13.47 |
| `audit-prd` | $14.80 / 7.7 min | $14.68 / 7.6 min |
| `create-trd` | $39.45 / 20.0 min | $58.36 / 22.9 min |
| `refine-trd --auto` | (subagent) | (subagent) |
| `audit-trd` | $28.30 / 13.1 min | $27.85 / 14.7 min |
| **total** | **~$106** | **~$134** |

**Against the pre-split monolith**, where create carried the wave:

| | old | new create | new audit | create+audit |
|---|---:|---:|---:|---:|
| PRD | $32.70 / 12.7 min | $6.69 / 6.8 | $14.80 / 7.7 | **$21.49** (−34%) |
| TRD | $76.25 / 30.3 min | $39.45 / 20.0 | $28.30 / 13.1 | **$67.75** (−11%) |

Task count fell from **43 to 12** on the same feature. At ~5 implement-loop invocations per
task that is 215 agent runs to 60 — a larger saving than the planning delta itself.

Cache reads are 89–94% of raw tokens throughout. Output is 0.4–0.7%. Any cost figure that
drops cache reads is not a cost figure.

## The three pre-registered failure conditions

**1. Split costing more than the monolith — NOT triggered.** Cheaper on both artifact types,
and audit is now deferrable rather than mandatory.

**2. Audit compensating for a weak author — PARTIALLY TRIGGERED.** Herald's `NFR-5` cited
"F016 AC-26/AC-47" as guaranteeing `sanitize_error_detail()`. That function has **0 hits in
`src/` and `tests/`, 5 in `docs/`** — F016 documents it as a code sample. Create's own corpus
rule forbids exactly this ("you may NOT cite a design document as evidence that something is
built"). The rule is stated and was not obeyed.

Refine then missed it in an instructive way: it verified the *quote* against F016 rather than
the *subject* against Herald. The audit named it — *"That is evidence about F016, not about
Herald — and it is precisely how the AC-26 citation survived two passes."*

**3. `--auto` over-answering owner-only questions — NOT triggered.** 4/9, 5/10, 4/12 and 8/N
held open across the four refine passes, without a target being given.

## Findings that justify the pipeline

Every finding below was verified independently against the code before being reported here.

| Finding | Stage | Why it matters |
|---|---|---|
| F1 already shipped as `/rebase-project --dry-run` | audit-prd | A PRD asking for a built capability costs a full implementation cycle |
| Stale-vs-customized classifier already ships, keyed on **presence not content** | audit-prd | Reframed a greenfield design into beat-the-incumbent with a named bar |
| `sanitize_error_detail()` never built; 3 write paths, none fully sanitized | audit-prd | Live credential-exposure gap in production |
| Task ordering leaves a dangling symlink → `cp -L` under `set -euo pipefail` | ground | Would break scaffolding between two tasks landing |
| `refresh_project()` never calls `copy_template` | ground | Classifier returns `customized` when truth is `stale` — the dangerous direction |
| Installed plugin 4.1.14 ships neither `contracts/` nor `workflows/` | ground | Mass false-positive `vendored-only` |
| AC fails against a **correct** stub implementation | ground | `retry_publish` already inserts a success row |
| CHECK constraint rejects 3 values `cmd_post` actually emits | ground | Runtime failure on real payloads |
| `constitution.md:51` mandates port 3100; code serves 3200/3101 | ground | Governance doc stale; refine adopted neither and escalated |
| `atomic_increment_daily_count()` exists, 10 tests, **zero real callers** | audit-trd | The atomicity guarantee the PRD inherited is not on the live path |
| PRD sets unit ≥60% **and** integration ≥50%; only the unit half resolved | audit-trd | Omission — the commonest failure, invisible to per-line review |

## What the stages actually contribute

- **Grounding is the highest-value single stage.** 8 findings per arm, most verified by
  *executing* commands (`15 [ran]` vs `4 [read]` on ensemble). Buildability — *can this be
  built as specified, given how the mechanism actually works* — is the check nobody performs.
- **Refine rejects as well as answers.** It refuted an over-stated severity claim that
  create's grounding raised and that the orchestrator amplified: `--refresh` only replaces
  what already exists, so only scaffolds and `--force` runs were at risk, not every
  SessionStart.
- **Audit is the only stage that rejects findings.** `audit-trd` ensemble: 15 in, 10 applied,
  **5 rejected** from the artifact's own text.
- **Nothing manufactured a deletion to look productive.** Both refine-trd passes reported "no
  unsourced objective found and none removed", with reasons.

## Two defects found in the pipeline by running it

Both invisible to review; both fixed.

1. **`18faa57`** — the haiku index returned `could_not_verify=[]` for a document carrying four
   populated rows. Reconcile avoided deleting them only because the grounding rule told it to
   read the artifact. Reconcile now greps the section itself.
2. **`2d90735`** — reconcile explained rejected findings as belonging to "an external
   provenance index not openable by this pass". No such artifact exists; the index is a script
   variable. Verdicts were right, the explanation invented a document, and it logged a phantom
   open item into the one section that must carry an honest record.

## Known weaknesses

- **Line anchors drift.** Herald's grounding cited `cli.py:2437/2477` where the truth was
  `2444/2473`. `audit-trd` found and corrected seven such anchors — but a reader following a
  wrong one lands on the tail of a different branch. Precision that is not uniformly earned
  stops the implementer checking.
- **Refine outspends create** ($16.53 vs $6.69 on the ensemble PRD). Answering questions means
  reading code; authoring mostly means writing.
- **Per-stage attribution is weak.** Artifacts were not committed between stages, so
  create-vs-refine authorship rests on changelog entries. Commit between stages next time.
- **The corpus stage's cost tracks directory shape, not corpus size.** Ensemble's 6 documents
  cost 52 turns; herald's 14 cost 13. `docs/modernization/runs/` (nested `PRD.md` files from
  prior experiments) is what drove it.

## Incidental finding in this repo

`npx jest` discovers **205 test files under `.claude/worktrees/` against 19 real ones** — 91%
of every run executes stale copies from abandoned agent worktrees. There is no
`coverageThreshold` in the jest config, so `constitution.md`'s ≥60% floor has nothing
computing it, and `packages/core/hooks/package.json` declares jest `^30.2.0` against the
root's `^29.7.0`. Not fixed here: narrowing `testPathIgnorePatterns` changes what the suite
covers and is the owner's call.
