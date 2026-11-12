> **Superseded — do not rely on this outcome (2026-11-12).** This run reported `satisfied`, but its debug stage reached it by rewriting correct code to match criteria that contradict the TRD: FS-5 (an `Off-host proof` column in the success definition) and FS-17's third part (settling a preclassified criterion off-host) describe the design the TRD rejected in D1, NG10 and NG11. Those edits were reverted, so the evidence below was gathered against code that no longer exists. Fix the definition with `/refine-verification`, then re-run `/verify-build`.

# Functional Verification Report: accepted-gaps-for-not-checkable-must-pass-criteria

**Source PRD**: docs/plan/accepted-gaps-for-not-checkable-must-pass-criteria.investigation.md
**Success definition**: .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 32 total — 32 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 32 of 32 proven — uncovered: none
**Must pass**: 21 of 21 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Given a success definition whose table has an `Off-host proof` column after `Must pass`, the deterministic reader in `functional-verification.js` returns one declaration per must-pass row that carries a cell, keyed by criterion id, with the cell `<workflow file>#<job name>` split into its workflow file (e.g. `.github/workflows/ci.yml`) and job name (e.g. `read-aloud`) | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/it2-fs1-lib.txt | 2 |
| FS-2 | An `Off-host proof` cell on a row whose `Must pass` cell is blank (or names no must-pass objective) produces no declaration; the reader returns it under `ignored` with a reason, and nothing downstream acts on it | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/lib-driver2-transcript.txt | iteration 2 (regression pass 1) |
| FS-3 | A malformed `Off-host proof` cell on a must-pass row (for example one with no `#<job name>`) produces no declaration and is returned under `ignored` with a reason | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/lib-driver2-transcript.txt | iteration 2 (regression pass 1) |
| FS-4 | A success definition with no `Off-host proof` column yields no declarations and no ignored entries, and the verification run behaves exactly as it did before this change | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/lib-driver2-transcript.txt | iteration 2 (regression pass 1) |
| FS-5 | The TRD-authoring contract documents an optional `Off-host proof` column on the TRD's `## Objectives` table, declared on a must-pass objective at plan time, and the functional-verification contract documents the success-definition column after `Must pass` and instructs the deriver to copy an objective's cell onto every criterion row whose `Must pass` cell names that objective | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/fs5-contracts-excerpt.txt | iteration 2 (regression pass 1) |
| FS-6 | The CI lookup lib CLI, given a declaration and the HEAD commit, with stub gh reporting a completed run on that commit whose named job concluded `success`, returns `green` for that criterion with the run id, the run URL and the commit | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/lib-driver2-transcript.txt | iteration 2 (regression pass 1) |
| FS-7 | With stub gh reporting the named job completed with a conclusion other than `success` (`failure`, and separately `cancelled`), the CLI returns `red` for that criterion | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/lib-driver2-transcript.txt | iteration 2 (regression pass 1) |
| FS-8 | With stub gh reporting the latest run for the commit as not completed, the CLI returns `pending` and does not wait for the run to finish | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/lib-driver2-transcript.txt | iteration 2 (regression pass 1) |
| FS-9 | The CLI returns `missing` when stub gh reports no run of the workflow for the commit, and also when the run exists but holds no job with the declared name | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/lib-driver2-transcript.txt | iteration 2 (regression pass 1) |
| FS-10 | When the working tree has uncommitted changes to a path the criterion covers (per `criterionCovers`), or to any shipped path when the criterion has no covers record, the CLI returns `dirty` even though stub gh reports a green job | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/lib-driver2-transcript.txt | iteration 2 (regression pass 1) |
| FS-11 | When `gh` itself fails (non-zero exit), the CLI returns `error` for that criterion and never `green` | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/lib-driver2-transcript.txt | iteration 2 (regression pass 1) |
| FS-12 | The CI lookup passes the workflow file, commit and job to `gh` as separate arguments with no shell: a job name containing shell metacharacters reaches the stub gh as one literal argument and nothing in it is executed | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/fs12-argv-transcript.txt | iteration 2 (regression pass 1) |
| FS-13 | `/implement-trd` and `/verify-build` run the declaration reader and the CI lookup before dispatching the verification workflow and pass the result as the workflow arg `offHostProofs` (entries `{id, workflow, job, status, runId, url, commit}`), passing `[]` when nothing is declared | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/it2-fs13-text.txt | 2 |
| FS-14 | A `--criteria` subset run, and a sweep-file run, pass `offHostProofs: []` | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/it2-fs14-text.txt | 2 |
| FS-15 | The workflow rejects an `offHostProofs` entry whose id is not a must-pass criterion of this run, the same way it validates `preclassified`, and never settles that criterion from it | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/offhost-workflow-jest-names.txt | iteration 2 (regression pass 1) |
| FS-16 | When a must-pass criterion is re-statused `not_verifiable` with kind `not-checkable-here` in the fold, has a `green` entry in `offHostProofs`, and no Debug pass in the invocation touched its covered files, the script settles it `met` with `proof: {kind: 'off-host', workflow, job, runId, url, commit}`, `artifact` set to the run URL, and a reason naming the job and the run | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/offhost-workflow-jest-names.txt | iteration 2 (regression pass 1) |
| FS-17 | The green-proof settling of FS-16 happens on each of the 3 paths that produce a not-checkable `not_verifiable` must-pass criterion: the fold, a regression round, and preclassification | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/it2-fs17-paths.txt | 2 |
| FS-18 | For each of the 5 non-green results (`red`, `pending`, `missing`, `dirty`, `error`), the must-pass not-checkable criterion stays `not_verifiable` with a reason naming the declared job and why it did not prove the criterion | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/offhost-workflow-jest-names.txt | iteration 2 (regression pass 1) |
| FS-19 | A green proof is voided when a Debug pass in the same invocation changed one of the criterion's covered files, when that pass's `filesChanged` is unknown, or when the criterion has no covers record and any Debug change was made; the criterion then stays `not_verifiable` with a reason saying it was changed by Debug in this run | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/offhost-workflow-jest-names.txt | iteration 2 (regression pass 1) |
| FS-20 | A must-pass criterion the Judge rules `not_met` with kind `build-defect` or kind `evidence-gap` is never settled `met` by an off-host proof, even with a `green` `offHostProofs` entry; its status, cause and kind are left as ruled | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/offhost-workflow-jest-names.txt | iteration 2 (regression pass 1) |
| FS-21 | A must-pass criterion triaged `not-checkable-here` with no declared off-host proof still ends the run `must-pass-unproven`, exactly as before this change | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/offhost-workflow-jest-names.txt | iteration 2 (regression pass 1) |
| FS-22 | When the off-host settling turns the last unproven must-pass criterion `met` on an `exit-must-pass-unproven` action, the run exits `satisfied`: the state file and report record `satisfied` and the must-pass recheck does not block | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/offhost-workflow-jest-names.txt | iteration 2 (regression pass 1) |
| FS-23 | A run whose must-pass not-checkable criterion has a non-green off-host result ends `must-pass-unproven`, with the criterion named in the reason | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/offhost-workflow-jest-names.txt | iteration 2 (regression pass 1) |
| FS-24 | No exit action other than `exit-must-pass-unproven` is upgraded by an off-host proof: a run that exits `insufficient-coverage` keeps that outcome even when a green proof would lift it over the coverage floor | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/offhost-workflow-jest-names.txt | iteration 2 (regression pass 1) |
| FS-25 | The rendered verification report prints a `**Proven off-host**:` line naming each criterion proven off-host, its job and its CI run (URL) | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/render-report-fs25-26.txt | iteration 2 (regression pass 1) |
| FS-26 | A report input with no off-host-proven criterion renders byte-identical to its rendering before this change (no `**Proven off-host**:` line) | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/render-report-fs25-26.txt | iteration 2 (regression pass 1) |
| FS-27 | `/ship-build`'s STATE readout names each criterion proven off-host and by which CI run, read from `verification-state.json` by one lib call | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/fs27-lib-call.txt | iteration 2 (regression pass 1) |
| FS-28 | Custody reuses the proof of a CI-proven `met` criterion when none of its covered files changed, the same as any other `met` criterion | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/jest-custody-names.txt | iteration 2 (regression pass 1) |
| FS-29 | Custody re-proves a CI-proven `met` criterion when one of its covered files changed, the same as any other `met` criterion | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/jest-custody-names.txt | iteration 2 (regression pass 1) |
| FS-30 | `/refine-verification` keeps a must-pass not-checkable criterion out of "Accepted as not verifiable" (D16 stands) and its Owner ruling names a third way out, "declare an off-host proof (a CI workflow and job) in the TRD's Objectives table and the success definition", which only the owner may choose, interactively | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/fs30-31-excerpt.txt | iteration 2 (regression pass 1) |
| FS-31 | Under `/refine-verification --auto`, the must-pass not-checkable ruling is recorded as an `OWNER-CALL` and the command never writes, edits or removes an `Off-host proof` cell in the TRD or the success definition | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/fs30-31-jest-names.txt | iteration 2 (regression pass 1) |
| FS-32 | A headless fixture run with one host-only must-pass criterion and a stubbed green CI result settles that criterion `met` with the CI run id cited | .trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/evidence/regression-1/FS-32-live-state.json | iteration 2 (regression pass 1) |

## Not Met

_None._

## Causes

| Cause | Representative | Members | Status |
|-------|----------------|---------|--------|
| offhost-column-on-trd-not-definition | FS-1 | 2 (FS-1, FS-5) | closed at iteration 2 |
| criteria-subset-looks-up-offhost-proofs | FS-14 | 1 (FS-14) | closed at iteration 2 |
| preclassified-path-not-settled-offhost | FS-17 | 1 (FS-17) | closed at iteration 2 |

## Not Verifiable

_None._

## Regression pass

After the loop exited, the criteria whose covered files changed (or whose coverage was unknown) were re-checked against the finished build.

### Round 1 (iteration 2)

| ID | Why re-checked | Changed files |
|----|----------------|---------------|
| FS-2 | no-covers |  |
| FS-3 | no-covers |  |
| FS-4 | no-covers |  |
| FS-5 | cause-member |  |
| FS-6 | no-covers |  |
| FS-7 | no-covers |  |
| FS-8 | no-covers |  |
| FS-9 | no-covers |  |
| FS-10 | no-covers |  |
| FS-11 | no-covers |  |
| FS-12 | no-covers |  |
| FS-15 | no-covers |  |
| FS-16 | no-covers |  |
| FS-18 | no-covers |  |
| FS-19 | no-covers |  |
| FS-20 | no-covers |  |
| FS-21 | no-covers |  |
| FS-22 | no-covers |  |
| FS-23 | no-covers |  |
| FS-24 | no-covers |  |
| FS-25 | no-covers |  |
| FS-26 | no-covers |  |
| FS-27 | no-covers |  |
| FS-28 | no-covers |  |
| FS-29 | no-covers |  |
| FS-30 | no-covers |  |
| FS-31 | no-covers |  |
| FS-32 | no-covers |  |

Caught: _none._

Not re-walked (covered files unchanged): FS-1, FS-13, FS-14, FS-17

Changed files no criterion covers: .claude/commands/implement-trd.md, .claude/commands/verify-build.md, .claude/contracts/functional-verification.md, .claude/contracts/trd-authoring.md, .claude/lib/functional-verification.js, .claude/lib/spec-scope.js, .claude/workflows/verify-functional.js, docs/reference/verification.md, packages/core/commands/implement-trd.md, packages/core/commands/verify-build.md, packages/core/commands/verify-command-surface.test.js, packages/core/contracts/functional-verification.md, packages/core/contracts/trd-authoring.md, packages/core/lib/functional-verification.js, packages/core/lib/functional-verification.test.js, packages/core/lib/spec-scope.js, packages/core/lib/spec-scope.test.js, packages/core/workflows/verify-functional.js, packages/core/workflows/verify-functional.test.js

