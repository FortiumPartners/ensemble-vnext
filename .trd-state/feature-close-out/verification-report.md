# Functional Verification Report: feature-close-out

**Source PRD**: docs/plan/feature-close-out.investigation.md
**Success definition**: .trd-state/feature-close-out/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 34 total — 34 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 34 of 34 proven — uncovered: none

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | After `/audit-build` runs on a TRD, `.trd-state/<feature>/audit-build-report.md` exists and its first line is the same VERDICT line the run's readout printed | .trd-state/feature-close-out/evidence/FS-1-report-iter3.md | 3 |
| FS-2 | The audit report holds the five counts — findings, applied, rejected, still unverified, verifiers reporting — and the readout the run printed | .trd-state/feature-close-out/evidence/FS-2.txt | 1 |
| FS-3 | The audit report names the date of the audit and the commit it audited, and that commit is the one checked out when the audit ran | .trd-state/feature-close-out/evidence/FS-3.txt | 1 |
| FS-5 | With artifact publishing on, the audit report is published as an artifact and its URL is stored under the key `audit-build-report` in `.trd-state/<feature>/artifacts.json` | .trd-state/feature-close-out/evidence/FS-5.txt | 1 |
| FS-6 | A second `/audit-build` run on the same feature republishes to the stored URL instead of creating a new artifact | .trd-state/feature-close-out/evidence/FS-6.txt | 1 |
| FS-7 | In both of the two failure conditions — publishing turned off (`ensemble.publishArtifacts: false`) and a publish that fails — `/audit-build` still writes the report file, says so in at most one line, and still ends `COMMAND COMPLETE`, not `COMMAND STUCK` | .trd-state/feature-close-out/evidence/FS-7.txt | 1 |
| FS-8 | `/audit-build` given no TRD path when no current feature is set ends `COMMAND STUCK`, asks for a path, and writes no report | .trd-state/feature-close-out/evidence/FS-8.txt | 1 |
| FS-9 | `/close-feature` treats an absent audit report and a stale one (a file the TRD touches changed after the audited commit) the same way: it names the condition in its output and still reaches a judgement — neither blocks closing | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-10 | A `/close-feature` command exists and can be invoked in both of 2 places: this repository's own runtime and a freshly scaffolded project | .trd-state/feature-close-out/evidence/FS-10-both-places.txt | 1 |
| FS-11 | On the default branch, `/close-feature` on a finished feature — every task `success`, verification satisfied, audit report present and current — judges it `done`, writes `.trd-state/<feature>/closed.json`, and prints a readout with the four sections STATE, DECISIONS, ISSUES, NEXT in that order followed by exactly one banner, `COMMAND COMPLETE`, as the last line | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-12 | `closed.json` records: when it was closed, the commit, whether that commit is on the default branch, the task tally, the audit-build verdict and report path, the verification outcome and report path, and the judgement | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-13 | A feature whose only unfinished task is a deferred live-verification task, where the criteria that task would have proven were met another way, is judged `done-with-gaps`, and the record names that task as a gap, with the TRD's stated reason for deferring it and why it does not undermine an objective | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-14 | A feature whose deferred live-verification task was the only evidence the behaviour works is judged `not-done`; without `--accept`, `/close-feature` writes no `closed.json` and ends `COMMAND STUCK`, naming what is missing and which objective it leaves unproven | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-15 | On a `not-done` feature, `/close-feature --accept "<reason>"` writes `closed.json` recording the reason as an override, verbatim, kept in a separate place from any owner evidence, and lists each unfinished task with its status and that reason | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-16 | An owner's free-text evidence note (for example "deployed live and I tested it") is weighed in the judgement and recorded verbatim in `closed.json` as owner-attested, separate from any `--accept` reason | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-17 | A feature with no `implement.json` can be closed only with `--accept`: without it `/close-feature` writes nothing; with it the record says the feature was abandoned | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-18 | On any branch other than the default branch, `/close-feature` ends `COMMAND STUCK` and writes nothing | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-19 | A successful close does not commit: `HEAD` is unchanged, `closed.json` is left as an uncommitted file, and the readout tells the owner to commit it | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-20 | When `.trd-state/current.json` points at the feature being closed, closing sets its fields to null and keeps the file, and `validate-init.sh` still passes afterwards | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-21 | When `.trd-state/current.json` points at a different feature, closing leaves it unchanged | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-22 | When no merge commit for the feature can be found on the default branch, the record says the commit could not be found instead of naming a guessed one | .trd-state/feature-close-out/evidence/close-feature-smoke-full.log | 1 |
| FS-23 | A closed feature stops showing as in flight in the router's hint, in both of 2 states that previously kept it alive: a task left `deferred`, and a task left `in_progress` | .trd-state/feature-close-out/evidence/FS-23-router-fixture.txt | 1 |
| FS-24 | The router treats the close record as a terminator alongside `docs/TRD/completed/`, so a feature needs no folder move to stop presenting as in flight | .trd-state/feature-close-out/evidence/FS-24-router-fixture.txt | 1 |
| FS-25 | The SessionStart banner, for a feature that has `closed.json`, says the feature is closed instead of "N/N tasks complete" | .trd-state/feature-close-out/evidence/FS-25-session-context.txt | 1 |
| FS-26 | Every other reader of `current.json` keeps working when its fields are null: `dispatch-ledger.js`, `notify-complete.sh`, `precompact.js` and `router.py` each run without error and do not treat a null field as a feature path | .trd-state/feature-close-out/evidence/FS-26-four-readers.txt | 1 |
| FS-27 | The three stale features of this repository — judge-prompt-generative-rule, discipline-judgment and testing-phase — can each be closed with `--accept`, their unfinished rows (including testing-phase's legacy `completed` values) recorded with the owner's reason and not rewritten to `success` | .trd-state/feature-close-out/evidence/FS-27-FS-28-closed-records.txt | 1 |
| FS-28 | Closing never changes `implement.json`: no task status is rewritten by `/close-feature`, with or without `--accept` | .trd-state/feature-close-out/evidence/FS-27-FS-28-closed-records.txt | 1 |
| FS-30 | `/amend` refuses a closed feature and says how to reopen it | .trd-state/feature-close-out/evidence/FS-30-guard-source.txt | 1 |
| FS-32 | No command closes a feature on its own: after `/implement-trd` and `/audit-build` each finish, the feature has no `closed.json` | .trd-state/feature-close-out/evidence/FS-32-no-close-writes.txt | 1 |
| FS-33 | The change adds no new library: no new file appears under `packages/core/lib/` on this branch | .trd-state/feature-close-out/evidence/FS-33-lib-diff.txt | 1 |
| FS-34 | The docs-as-built TRD carries a note that `closed.json` is the better signal for its parked "finished" definition (D19), without building it | .trd-state/feature-close-out/evidence/FS-34-docs-as-built.txt | 1 |
| FS-4 | An `/audit-build` run whose verifiers report no findings still leaves the report file, with its VERDICT line first | .trd-state/feature-close-out/evidence/FS-4-report.md | 2 |
| FS-29 | `/implement-trd` refuses a closed feature in each of 4 modes — an explicit TRD path, its automatic TRD lookup with no path, `--resume`, and `--reconcile` — dispatching no work, and says how to reopen the feature | .trd-state/feature-close-out/evidence/FS-29-guard-current.txt | 2 |
| FS-31 | `/audit-build`'s readout names `/close-feature` as the step after the PR merges, and `/implement-trd`'s final readout (Step 9) does not (owner decision 2026-09-28, TRD feature-close-out.md changelog 2.0.0 and D3: Step 9 names one next step; closing is two steps away) | .trd-state/feature-close-out/evidence/FS-31-audit-build-next.txt | 2 |

## Not Met

_None._

## Not Verifiable

_None._

