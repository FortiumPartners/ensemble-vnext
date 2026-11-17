# Functional Verification Report: fix-implement-skips-verification-loop

**Source PRD**: docs/TRD/fix-implement-skips-verification-loop.md ## Reproduction
**Success definition**: .trd-state/fix-implement-skips-verification-loop/success-definition.md
**Outcome**: Must-Pass Unproven (no full-environment run declared)
**Reason**: must-pass criteria not proven: FS-4 — the core was not shown to work
**Criteria**: 11 total — 8 met, 3 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 8 of 11 proven — uncovered: FS-4, FS-9, FS-11
**Must pass**: 2 of 3 proven — unproven: FS-4 (not met)
**Diagnosis**: 3 open — 3 evidence gaps — 3 evidence missing
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | When `verification.md` allows functional verification, a `/implement-trd` run reaches and runs the functional-verification loop rather than ending before it | .trd-state/fix-implement-skips-verification-loop/evidence/fs1-live-implement-trd-run.txt | 2 |
| FS-2 | Neither `/implement-trd` nor `/plan --implement` accepts a scripted check (a Playwright script, curl) plus unit tests in place of the functional-verification loop | .trd-state/fix-implement-skips-verification-loop/evidence/iter1-command-text-excerpts.txt | 1 |
| FS-3 | A run that did not run the functional-verification loop cannot close the feature as verified | .trd-state/fix-implement-skips-verification-loop/evidence/iter1-not-run-exits-live.txt | 1 |
| FS-5 | Each of the 3 not-run exits (no resolved source, a resolved source with no `success-definition.md`, and the blocking-policy exit) leaves `.trd-state/<slug>/verification-state.json` holding `outcome: "not-run"` and a non-empty `reason` string | .trd-state/fix-implement-skips-verification-loop/evidence/iter1-not-run-exits-live.txt | 1 |
| FS-6 | After a not-run exit, `verification-report.md` names the same reason the state file's `reason` holds | .trd-state/fix-implement-skips-verification-loop/evidence/iter1-not-run-exits-live.txt | 1 |
| FS-7 | An interrupted run's state file (`outcome: null`) is never overwritten by a not-run record | .trd-state/fix-implement-skips-verification-loop/evidence/iter1-not-run-exits-live.txt | 1 |
| FS-8 | The derive agent receives its source by file path, never pasted into its prompt, so a source of any size, including one of about 740 KB, can be dispatched | .trd-state/fix-implement-skips-verification-loop/evidence/iter2-fs8-derive-prompt.txt | 2 |
| FS-10 | An environment problem reported by the setup check is re-checked once (the check run again and the diagnosis re-derived from the actual response) before the loop gives up on it | .trd-state/fix-implement-skips-verification-loop/evidence/iter1-jest-fv.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

## Evidence gaps (definition problems)

The criterion asks for evidence the build does not produce — change the criterion or the build's outputs.

| ID | Statement | Reason |
|----|-----------|--------|
| FS-4 | When the loop does not run, the final readout states why it did not run | No captured final readout from a run that took a not-run exit; no model run producing one was performed. State-file and report halves are proven by FS-5/FS-6. Re-captured once already: evidence gap. |
| FS-9 | A derive pass that never ran, or ran and wrote nothing, is retried once before verification is recorded as not run | No run output showing an empty first derive pass, a second dispatch, then a not-run record; no such model run was performed. Nothing shows the build misbehaving. Re-captured once already: evidence gap. |
| FS-11 | An environment problem reported by the Exercise stage is re-checked once (the request run again and the diagnosis re-derived from the actual response) before the loop gives up on it | Artifact shows the repeat-once instruction is in the Exercise prompt and a test asserting it, but no Exercise-stage output of a failing request actually repeated; the stub tests cover the setup re-check (FS-10). Behaviour never observed, nothing shows it wrong. Re-captured once already: evidence gap. |

