# Functional Verification Report: audit-convergence

**Source PRD**: docs/TRD/audit-convergence.md#Intended Change + Owner rulings
**Success definition**: .trd-state/audit-convergence/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 36 total — 36 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 36 of 36 proven — uncovered: none
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | A `mismatch` finding from a check other than citation, consistency or test-quality classifies as `defect`, and a `gap-unbuilt` finding from such a check classifies as `defect` | .trd-state/audit-convergence/evidence/slice-fs1-8.txt | 1 |
| FS-2 | A `mismatch` finding from the citation check, and one from the consistency check, does not classify as `defect` | .trd-state/audit-convergence/evidence/slice-fs1-8.txt | 1 |
| FS-3 | `gap-untested` and `untested` findings classify as `test-gap` | .trd-state/audit-convergence/evidence/slice-fs1-8.txt | 1 |
| FS-4 | Every finding from the test-quality check classifies as `test-gap`, whatever its action — including `mismatch` and `gap-unbuilt` | .trd-state/audit-convergence/evidence/slice-fs1-8.txt | 1 |
| FS-5 | `fix-citation`, `confirm-wanted` and an unrecognised action classify as `other` | .trd-state/audit-convergence/evidence/slice-fs1-8.txt | 1 |
| FS-6 | A report-only audit hands nothing off, closes nothing and does not re-audit, even when defects are present | .trd-state/audit-convergence/evidence/slice-fs1-8.txt | 1 |
| FS-7 | A report-only audit adds no line to the round ledger | .trd-state/audit-convergence/evidence/slice-fs1-8.txt | 1 |
| FS-8 | When a required behaviour has no covering task (uncovered > 0), the feature does not close and those items are not handed off; covered defects or test gaps in the same round are still handed off | .trd-state/audit-convergence/evidence/slice-fs1-8.txt | 1 |
| FS-9 | A "do not proceed" verdict with nothing to hand off leaves the feature open | .trd-state/audit-convergence/evidence/fs9.txt | 1 |
| FS-10 | A round with no defects and no uncovered items (verdict not do not proceed) closes and never re-audits: test gaps are handed off first; test gaps never block the close and never trigger a re-audit, at any round | .trd-state/audit-convergence/evidence/fs10.txt | 1 |
| FS-11 | A round that finds defects before the cap hands off defects and test gaps and re-audits, without closing — at round 1 and at round 2 | .trd-state/audit-convergence/evidence/fs11.txt | 1 |
| FS-12 | A round that still finds defects at the cap (round 3, two re-audits used) still hands the defects to the fix run but does not close and does not re-audit; capReached is true | .trd-state/audit-convergence/evidence/fs12.txt | 1 |
| FS-13 | No combination of inputs with at least one defect yields a close — not at the cap, not with a caveat | .trd-state/audit-convergence/evidence/fs13.txt | 1 |
| FS-14 | Each completed, non-report-only audit appends exactly one small line to .trd-state/<feature>/audit-rounds.jsonl carrying round, runId, auditedCommit, trdHash, verdict, defects, testGaps, uncovered, ts, and no requirement list; a second record appends without rewriting the first | .trd-state/audit-convergence/evidence/fs14.txt | 1 |
| FS-15 | The requirement list is kept in .trd-state/<feature>/audit-index.json, separate from the ledger and overwritten each round | .trd-state/audit-convergence/evidence/iter2-fs15.txt | 2 |
| FS-16 | The round count restarts after a close: rounds recorded before the latest closed.json do not count toward the cap | .trd-state/audit-convergence/evidence/fs16.txt | 1 |
| FS-17 | A wake-up whose run id is already in the ledger is recognised as stale | .trd-state/audit-convergence/evidence/fs17-18-stale-wake.txt | 1 |
| FS-18 | A wake-up with a new run id is not stale, even at an unchanged commit | .trd-state/audit-convergence/evidence/fs17-18-stale-wake.txt | 1 |
| FS-19 | The TRD hash is stable for unchanged TRD content and changes when the content changes | .trd-state/audit-convergence/evidence/fs19-trd-hash.txt | 1 |
| FS-20 | Verifier findings must state their kind of gap: action is required, offers gap-unbuilt and gap-untested, and no longer offers a bare gap | .trd-state/audit-convergence/evidence/fs20-schema.txt | 1 |
| FS-21 | /audit-build records each handed-off item as a discovery with foundBy audit-build, blocksFeature true and its class, so --reconcile promotes it to a task | .trd-state/audit-convergence/evidence/fs21-22-text.txt | 1 |
| FS-22 | /audit-build starts the fix run as /implement-trd <trd> --reconcile --chained, and implement-trd.md §3.7 names /audit-build as a sanctioned caller of --chained | .trd-state/audit-convergence/evidence/fs21-22-text.txt | 1 |
| FS-23 | Under --chained from /audit-build, the fix run skips its own functional verification and banner and returns one RETURN line | .trd-state/audit-convergence/evidence/fs23-chained.txt | 1 |
| FS-24 | A TRD row promoted from a foundBy audit-build discovery tells the implementer to find and fix every instance of that weakness across the feature's touched files and to list each one | .trd-state/audit-convergence/evidence/fs24-promote.txt | 1 |
| FS-25 | implement-trd.md §2.1a tells the implementer the same: fix the class, not the instance, and list each instance fixed | .trd-state/audit-convergence/evidence/fs25-implement-trd-2.1a.txt | 1 |
| FS-26 | When the decision is to close, /audit-build writes the close record, commits it together with the report, opens the PR, and prints the run's single banner; anything the fix run reports as not done becomes a caveat | .trd-state/audit-convergence/evidence/audit-build-md-close-next-cap.txt | 1 |
| FS-27 | NEXT follows the decision: /audit-build when a re-audit is due; merge the PR after a close; the design work for uncovered items when those stopped the close | .trd-state/audit-convergence/evidence/audit-build-md-close-next-cap.txt | 1 |
| FS-28 | At the cap with defects still open, /audit-build does not close the feature and does not name another /audit-build as NEXT; NEXT is the owner's decision, and there is no close-with-caveat | .trd-state/audit-convergence/evidence/audit-build-md-close-next-cap.txt | 1 |
| FS-29 | The readout names the round as round N of at most 3 and says why the run closes, re-audits or stays open | .trd-state/audit-convergence/evidence/audit-build-md-close-next-cap.txt | 1 |
| FS-30 | On a re-audit, /audit-build passes previous { reportPath, auditedCommit, index } to the workflow | .trd-state/audit-convergence/evidence/audit-build-md-close-next-cap.txt | 1 |
| FS-31 | The workflow reuses previous.index and skips the Index stage when the TRD hash matches the previous round's trdHash, and rebuilds when it differs | .trd-state/audit-convergence/evidence/audit-build-js-reaudit.txt | 1 |
| FS-32 | A re-audit checks only the previous round's defects and the files changed since auditedCommit; it takes no fresh sample | .trd-state/audit-convergence/evidence/audit-build-js-reaudit.txt | 1 |
| FS-33 | Anything a re-audit notices outside that scope is recorded as a non-blocking discovery, never raised as a finding, and never counts toward defects | .trd-state/audit-convergence/evidence/iter2-fs33.txt | 2 |
| FS-34 | Both the workflow's clean-path return and its normal return carry handoff and index | .trd-state/audit-convergence/evidence/fs33-34-36-audit-build-js.txt | 1 |
| FS-35 | Every fallback wake-up /audit-build schedules carries the workflow run id in its prompt; on any re-entry it runs stale-wake, and when that is true prints one line saying that audit already ran and stops | .trd-state/audit-convergence/evidence/fs33-35-audit-build-md.txt | 1 |
| FS-36 | The verifiers are told that a weak or missing test matters only if it masks a real defect; a masked defect is reported as that defect by the check that owns the requirement, otherwise the finding is a test gap fixed as secondary work | .trd-state/audit-convergence/evidence/iter2-fs36.txt | 2 |

## Not Met

_None._

## Not Verifiable

_None._

