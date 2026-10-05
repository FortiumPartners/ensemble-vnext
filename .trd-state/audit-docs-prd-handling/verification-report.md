# Functional Verification Report: audit-docs-prd-handling

**Source PRD**: docs/TRD/audit-docs-prd-handling.md ## Intended Change
**Success definition**: .trd-state/audit-docs-prd-handling/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 18 total — 18 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 18 of 18 proven — uncovered: none
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | When a TRD is skipped `in-flight` (an unclosed `implement.json` with a development task not yet done) and the PRD's path appears in that TRD's first 40 lines, the PRD is skipped with reason `in-flight` and is absent from every batch | .trd-state/audit-docs-prd-handling/evidence/FS1-summary.json | 1 |
| FS-2 | When an `in-flight` TRD shares the PRD's basename but does not mention the PRD's path, the PRD is still skipped `in-flight` | .trd-state/audit-docs-prd-handling/evidence/FS2-summary.json | 1 |
| FS-3 | A PRD whose path appears in an `in-flight` TRD only after that TRD's line 40, and whose basename differs, is not skipped and is batched for review | .trd-state/audit-docs-prd-handling/evidence/FS3-summary.json | 1 |
| FS-4 | `.trd-state/current.json` does not decide a PRD skip: a PRD named as current in `current.json`, with no `in-flight` TRD citing it, is still batched for review | .trd-state/audit-docs-prd-handling/evidence/FS4-summary.json | 1 |
| FS-5 | A PRD whose citing TRD was skipped `no-implementation` (not `in-flight`) is still batched and reviewed | .trd-state/audit-docs-prd-handling/evidence/FS5-summary.json | 1 |
| FS-6 | A PRD skipped `in-flight` appears in the change set's `## Documents` table with outcome `skipped (in-flight)` | .trd-state/audit-docs-prd-handling/evidence/changeset.md | 1 |
| FS-7 | The PRD review's return shape accepts, and the batch record carries forward, a `behaviourChanges` list of `{ id, was, now }` and a `brokenNonGoals` list of `{ id, statement, evidence }`, so neither is dropped between the review agent and the batch result | .trd-state/audit-docs-prd-handling/evidence/jest-docs-audit.txt | 1 |
| FS-8 | The PRD procedure the review agent follows splits "Built differently" into a mechanism correction (name, path, internal ordering, registration detail; nothing a user or the owner would observe change), returned in `corrections`, and a behaviour correction (what the product does as a user would see it), returned in `behaviourChanges` and not also in `corrections` | .trd-state/audit-docs-prd-handling/evidence/prd-procedure.txt | 1 |
| FS-9 | For each behaviour correction, the review agent adds one row to the PRD's existing changelog table (`## Changelog` or `## Version History`), filling that table's own columns: run date in its date column, `/audit-docs` in its author column when it has one, the requirement id and what changed in its changes column | .trd-state/audit-docs-prd-handling/evidence/prd-procedure.txt | 1 |
| FS-10 | Only when a PRD has no changelog does the review agent add a `## Changelog` section with a Date / Change two-column table for the behaviour-correction row | .trd-state/audit-docs-prd-handling/evidence/prd-procedure.txt | 1 |
| FS-11 | A non-goal the code contradicts is left exactly as written and returned in `brokenNonGoals` `{ id, statement, evidence }` instead of being corrected | .trd-state/audit-docs-prd-handling/evidence/prd-procedure.txt | 1 |
| FS-12 | The change set has a section `## Requirements changed to match the code — confirm` listing every behaviour correction of an edited PRD as `<prd>: <id> — was: <was>; now: <now>` | .trd-state/audit-docs-prd-handling/evidence/changeset.md | 1 |
| FS-13 | A behaviour correction on a PRD that is not in an apply result's `edited` list (reverted for a banner or a stray edit) is not listed in the confirm section | .trd-state/audit-docs-prd-handling/evidence/changeset.md | 1 |
| FS-14 | The batch commit message counts behaviour changes together with corrections, so an edited PRD with 2 corrections and 1 behaviour change contributes 3 to the "corrected" count | .trd-state/audit-docs-prd-handling/evidence/FS14-single.txt | 1 |
| FS-15 | Broken non-goals and changelog defects are listed under the change set's `## Surfaced for the owner` section | .trd-state/audit-docs-prd-handling/evidence/changeset.md | 1 |
| FS-16 | `docs-audit-apply.js` reports a changelog defect for a PRD record carrying `behaviourChanges` whose diff adds no line containing both that requirement id and the run date — and does not revert that PRD | .trd-state/audit-docs-prd-handling/evidence/apply-out.json | 1 |
| FS-17 | When the PRD's diff does add a line containing both the requirement id and the run date, no changelog defect is reported for it | .trd-state/audit-docs-prd-handling/evidence/apply-out.json | 1 |
| FS-18 | The `/audit-docs` readout instructions put skipped PRDs and the confirm list in STATE, and broken non-goals and changelog defects in ISSUES | .trd-state/audit-docs-prd-handling/evidence/FS18-readout.txt | 2 |

## Not Met

_None._

## Not Verifiable

_None._

