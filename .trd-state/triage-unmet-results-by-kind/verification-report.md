# Functional Verification Report: triage-unmet-results-by-kind

**Source PRD**: docs/plan/triage-unmet-results-by-kind.investigation.md
**Success definition**: .trd-state/triage-unmet-results-by-kind/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 30 total — 30 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 30 of 30 proven — uncovered: none
**Must pass**: 16 of 16 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `functional-verification.js` exports `KINDS` as `['build-defect', 'evidence-gap', 'not-checkable-here']`, a `KIND_BY_CAUSE` map sending `judged-failed` and `not-built` to `build-defect`; `evidence-missing`, `evidence-stale`, `locator-not-found` and `never-exercised` to `evidence-gap`; `environment-unreachable` and `capability-absent` to `not-checkable-here`, and a `kindOf(cause)` function returning that kind | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-1.txt | 1 |
| FS-2 | The workflow's own copy of the kind map (which replaces `EVIDENCE_CAUSES`) equals the lib's `KIND_BY_CAUSE`, and a test fails if the two drift apart | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-2.txt | 1 |
| FS-3 | The Judge's per-criterion schema has a `kind` field whose allowed values are the three kinds, null for a `met` criterion, and the Judge prompt's STEP 2 asks for the kind beside the cause and states the cause-to-kind mapping | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-3.txt | 1 |
| FS-4 | When the Judge returns no kind, or a kind that disagrees with `KIND_BY_CAUSE[cause]`, the workflow uses the cause-derived kind and logs the disagreement; routing never rests on the Judge's kind alone | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-4.txt | 1 |
| FS-5 | Every non-`met` entry written to `verification-state.json` and to the report input carries a `kind`, and settled entries carry their `kind` (and the new `settled` and `verificationDigest` keys) unchanged from iteration to iteration rather than dropping them | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-5-it3.txt | 1 |
| FS-6 | The `never-exercised` entries written when a run ends on a setup failure carry a kind (`evidence-gap`, the kind of cause `never-exercised`) | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-6.txt | 1 |
| FS-7 | Only `build-defect` gaps are handed to the Debug stage; the fallback that sent all debug gaps to Debug when there were no build gaps is gone, and an iteration with no build defect dispatches no Debug agent while its renders still run | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-7.txt | 1 |
| FS-8 | A `never-exercised` gap is treated as an evidence gap: it is sent back to Exercise for re-capture and is never handed to Debug | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-8.txt | 1 |
| FS-9 | An `evidence-gap` criterion is re-captured exactly once per run: a Judge that keeps ruling it `evidence-missing` produces exactly two Exercise dispatches for it (the initial capture and one re-capture), and the third iteration has no Exercise slice for it | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-9.txt | 1 |
| FS-10 | The Judge prompt that follows the re-capture names the criteria on their one re-capture; any of them still ruled an evidence gap is settled: status stays `not_met`, `kind: 'evidence-gap'`, `settled: 'definition-problem'`, its reason kept, `provenAt` set to that iteration, and it is not walked again in that run | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-10.txt | 1 |
| FS-11 | `decideNext` requires a `settledEvidenceGaps` input (it throws when the key is absent) and removes those ids from both the current and the previous gaps before computing closures, the stall rule and the cap rule, so settling an evidence gap counts neither as a closure nor as an open gap | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-11.txt | 1 |
| FS-12 | A run whose only remaining non-`met` criteria are settled evidence gaps and not-checkable ones exits through the ordinary satisfied branch, not as stalled, still subject to the coverage floor; when a must-pass criterion is among the settled evidence gaps the run ends `must-pass-unproven` | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-12.txt | 1 |
| FS-13 | A settled evidence gap does not carry over to a later invocation: on resume it re-opens and is captured again | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-13.txt | 1 |
| FS-14 | The report has an `## Evidence gaps (definition problems)` section listing each settled evidence gap with its reason and the sentence "the criterion asks for evidence the build does not produce — change the criterion or the build's outputs" | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-14.txt | 1 |
| FS-15 | `node functional-verification.js verification-digest <path>` prints the sha256 of the `verification.md` content, and `""` when the file is absent | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-15.txt | 1 |
| FS-16 | Every settled `not-checkable-here` entry records the run's `verificationDigest`, and a later invocation given that entry in `resume` with the same non-empty digest carries it as settled and does not exercise or re-judge it | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-16.txt | 1 |
| FS-17 | A resumed `not_verifiable` entry re-opens when its recorded digest differs from the current one, is empty, or its kind is not `not-checkable-here` | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-17.txt | 1 |
| FS-18 | The state file keeps exactly four top-level keys; the digest is stored per entry, not as a new top-level key | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-18.txt | 1 |
| FS-19 | `/verify-build`'s fix loop step 4 and `--resume`, and `/implement-trd` §8.2, carry the settled not-checkable entries in `resume` and pass `verificationDigest` in the workflow dispatch, so a fix round or a resume does not re-walk them | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-19.txt | 1 |
| FS-20 | `preclassifyNotCheckable` (and its `preclassify --file` CLI) returns `{ status: 'not_verifiable', kind: 'not-checkable-here', cause: 'capability-absent' }` with reason "parts board: the structure check does not run" for a `check:verify-design-structure` row whose board has an empty `components` list in `design-map.json` | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-20.txt | 1 |
| FS-21 | A `check:verify-design-structure` row whose resolved environment is a production or minified build is preclassified not-checkable-here with a reason naming minified component names; `readMinifiedEnvironments` reads such environments from `verification.md` §1 as one named `production` or whose row says `production build`, `prod build` or `minified`, case-insensitively | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-21.txt | 1 |
| FS-22 | `/verify-build` step 3c and `/implement-trd` §8.1a pass preclassified results as a `preclassified` workflow arg; the workflow seeds them as settled at `provenAt: 0` with `verificationDigest` before the loop, so they are in no Exercise slice, no setup target's open set and no Judge open set, yet appear in the state file and report like any settled entry | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-22.txt | 1 |
| FS-23 | The setup check's reach probe sends one warm-up request whose result is ignored, then uses a 60-second first-response timeout, retried until about 90 seconds have passed, before recording the target unreachable; `decideSetup` is unchanged | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-23.txt | 1 |
| FS-24 | The report shows each non-`met` criterion's kind in its section rows, and the Diagnosis line leads with counts by kind (e.g. "2 build defects, 1 evidence gap, 1 not checkable here") before the existing cause counts | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-24.txt | 1 |
| FS-25 | The report's not-verifiable section marks rows that were classified at preflight | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-25.txt | 1 |
| FS-26 | A report rendered from an older input in which no criterion carries `kind` is byte-identical to what the pre-change renderer produced | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-26.txt | 1 |
| FS-27 | `/verify-build`'s fix loop records a failing row for `kind: 'build-defect'` (falling back to cause `judged-failed`/`not-built` only when `kind` is absent), composes step 6 stop reasons as "evidence gap — definition problem: <reason>" and "not checkable here: <reason>" by kind, and counts `buildableOpen` from `build-defect` | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-27.txt | 1 |
| FS-28 | `/refine-verification` step 2 sorts Blockers as `build-defect` and Accepted as not verifiable as `not-checkable-here`; a settled evidence gap is never a Blocker and goes under Owner rulings as a definition problem (under `--auto`, an `OWNER-CALL` row) | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-28.txt | 1 |
| FS-29 | Every changed file under `packages/core` that has a `.claude/` mirror (the workflow, the lib, the commands) is byte-identical to its mirror | .trd-state/triage-unmet-results-by-kind/evidence/it1/FS-29.txt | 1 |
| FS-30 | One headless `/verify-build` run in the `fixtures` environment, on a fixture seeded with one defect, one missing capture and one host-only criterion, produces a report showing all three kinds | .trd-state/triage-unmet-results-by-kind/evidence/fs30/verification-report.md | 1 |

## Not Met

_None._

## Not Verifiable

_None._

