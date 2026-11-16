# Functional Verification Report: cap-verification-runs-per-feature

**Source PRD**: docs/plan/cap-verification-runs-per-feature.investigation.md
**Success definition**: .trd-state/cap-verification-runs-per-feature/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 16 total — 16 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 16 of 16 proven — uncovered: none
**Must pass**: 12 of 12 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | A `/verify-build` invocation that dispatches the `verify-functional` workflow over the feature's own success definition adds exactly one entry to `functional_verification.runs` in `.trd-state/<feature>/implement.json`, carrying `n`, `command`, `started_at`, `scope`, `outcome` and `finished_at`; the entry is written at dispatch and its `outcome` and `finished_at` are filled when the workflow returns | .trd-state/cap-verification-runs-per-feature/evidence/lib/runs-lifecycle.txt | 1 |
| FS-2 | The fix loop's later rounds inside one `/verify-build` invocation add no further entry: an invocation that runs several fix rounds leaves exactly one new entry in `functional_verification.runs` | .trd-state/cap-verification-runs-per-feature/evidence/lib/command-prose.txt | 1 |
| FS-3 | `/implement-trd`'s verification pass adds exactly one entry to `functional_verification.runs` when it dispatches the workflow, written at dispatch and completed when the workflow returns, in the same shape as FS-1 | .trd-state/cap-verification-runs-per-feature/evidence/lib/implement-trd-prose.txt | 1 |
| FS-4 | Re-running `/implement-trd` on a feature that already has entries in `functional_verification.runs` keeps every existing entry; the run neither wipes nor restarts the count (the count is the number of entries, carried across both commands) | .trd-state/cap-verification-runs-per-feature/evidence/lib/implement-trd-prose.txt | 1 |
| FS-5 | The count is shared across commands: a `/verify-build` run on a feature whose earlier run was made by `/implement-trd` (or the reverse) appends the next entry, with `n` one greater than the existing count, rather than starting a fresh count | .trd-state/cap-verification-runs-per-feature/evidence/lib/runs-lifecycle.txt | 1 |
| FS-6 | Resuming an interrupted run adds no entry: a `--resume` of either command, and the automatic resume of a state file whose `outcome` is `null`, continues the entry already recorded and fills its `outcome`/`finished_at` when it finishes, leaving the entry count unchanged | .trd-state/cap-verification-runs-per-feature/evidence/lib/runs-lifecycle.txt | 1 |
| FS-7 | `/refine-verification` does not count as a run and does not reset the count: invoked below the limit, it leaves `functional_verification.runs` exactly as it found it | .trd-state/cap-verification-runs-per-feature/evidence/lib/refine-below-limit.txt | 1 |
| FS-8 | Runs that are not counted add no entry: a `--criteria` subset re-proof (`/ship-build`'s custody re-verification under `reverify/`), a sweep file's verification (its own `<slug>-sweep` feature) and a rerun scope of `none` each leave `functional_verification.runs` unchanged | .trd-state/cap-verification-runs-per-feature/evidence/lib/command-prose.txt | 1 |
| FS-9 | Below the limit the count does not block anything: `/verify-build` dispatches a run and `/refine-verification` writes `verification-plan.md` as before | .trd-state/cap-verification-runs-per-feature/evidence/lib/runs-lifecycle.txt | 1 |
| FS-10 | At the limit, `/verify-build` starts no further run: it dispatches no workflow and adds no entry to `functional_verification.runs`, writes `.trd-state/<feature>/ruling-request.md`, records and publishes it as an artifact the way the verification report is, and ends with `═══ COMMAND STUCK: /verify-build ═══`, `Reason: verification run limit reached (<n> of <limit> runs)` and a `Next:` line pointing at the ruling request | .trd-state/cap-verification-runs-per-feature/evidence/live/fs10-transcript.txt | 1 |
| FS-11 | At the limit, `/implement-trd`'s verification pass starts no further run: it dispatches no workflow, adds no entry to `functional_verification.runs`, and writes `.trd-state/<feature>/ruling-request.md` | .trd-state/cap-verification-runs-per-feature/evidence/lib/implement-trd-prose.txt | 1 |
| FS-12 | The ruling request names every criterion still open for the feature and offers exactly three outcomes, each with the step that carries it out: ship as is (then `/audit-build`), fix one named thing (via `/amend`), and drop it | .trd-state/cap-verification-runs-per-feature/evidence/lib/runs-lifecycle.txt | 1 |
| FS-13 | At the limit, `/refine-verification` writes no `verification-plan.md` (none is created and an existing one is not rewritten); it writes the ruling request and ends with `═══ COMMAND STUCK: /refine-verification ═══`, the same limit Reason and a `Next:` line pointing at the request | .trd-state/cap-verification-runs-per-feature/evidence/live/fs13-transcript.txt | 1 |
| FS-14 | A run that ends not `satisfied` and leaves `runs.length` at the limit writes the ruling request, and its NEXT names that request instead of `/refine-verification` | .trd-state/cap-verification-runs-per-feature/evidence/lib/runs-lifecycle.txt | 1 |
| FS-15 | Recording a "ship as is" ruling records every open criterion as a waived `[non-blocking] ` row through the existing non-blocking follow-up path, so `waived-defects.js gate` files each one as a defect issue before close; recording "drop it" does the same, with the reason "dropped by ruling" | .trd-state/cap-verification-runs-per-feature/evidence/lib/record-ruling.txt | 1 |
| FS-16 | Recording "fix one named thing" sends only the named criterion to `/amend` and records every other open criterion as waived, exactly as "ship as is" does; the framework records the outcome the PM chose (`record-ruling`) and never picks or applies an outcome itself | .trd-state/cap-verification-runs-per-feature/evidence/lib/record-ruling.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

