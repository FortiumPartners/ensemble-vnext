# Functional Verification Report: fix-ship-merge-record-clash

**Source PRD**: docs/TRD/fix-ship-merge-record-clash.md § Intended Change
**Success definition**: .trd-state/fix-ship-merge-record-clash/success-definition.md
**Outcome**: Stalled (no full-environment run declared)
**Reason**: iteration closed no gaps — remediation is not converging
**Criteria**: 25 total — 24 met, 1 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 24 of 25 proven — uncovered: FS-25
**Must pass**: 10 of 10 proven
**Diagnosis**: 1 open — 1 evidence missing
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | An initial scaffold into a project with no `.gitattributes` creates `<project>/.gitattributes` containing the line `.claude/verification-notes.md merge=union` | .trd-state/fix-ship-merge-record-clash/evidence/fs1-5-scaffold.txt | 1 |
| FS-2 | `scaffold-project.sh --refresh` on a project whose `.gitattributes` is absent, or present without the union line, leaves the file containing `.claude/verification-notes.md merge=union` | .trd-state/fix-ship-merge-record-clash/evidence/fs1-5-scaffold.txt | 1 |
| FS-3 | When the project already has a `.gitattributes` with other lines, scaffold and `--refresh` add the union line without changing, removing or reordering any existing line | .trd-state/fix-ship-merge-record-clash/evidence/fs1-5-scaffold.txt | 1 |
| FS-4 | Running scaffold and then `--refresh` (and `--refresh` again) never duplicates the union line: it appears exactly once | .trd-state/fix-ship-merge-record-clash/evidence/fs1-5-scaffold.txt | 1 |
| FS-5 | A failure while ensuring `.gitattributes` (e.g. the path cannot be written) prints a warning and neither the scaffold nor the refresh aborts: it completes and exits 0 | .trd-state/fix-ship-merge-record-clash/evidence/fs1-5-scaffold.txt | 1 |
| FS-6 | `isRecordFile(path)` returns true for `.claude/verification-notes.md`, for `.trd-state`, and for any path under `.trd-state/`, and false for `.trd-statex/...` and for ordinary source paths | .trd-state/fix-ship-merge-record-clash/evidence/fs6-7-record-files.txt | 1 |
| FS-7 | `classifyClash(paths)` returns `{ recordOnly, notRecord }`, where `notRecord` lists exactly the input paths that are not record files and `recordOnly` says whether every path is a record file | .trd-state/fix-ship-merge-record-clash/evidence/fs6-7-record-files.txt | 1 |
| FS-8 | `record-files.js merge-base-in --base <ref> --branch <name> --pr-head <sha>` prints exactly one JSON line and exits 0, for a success, a refusal and a stop alike | .trd-state/fix-ship-merge-record-clash/evidence/fs8-18-transcript.txt | 1 |
| FS-9 | `mergeBase` refuses with `ok: false` and changes nothing when the current branch is not `<branch>` | .trd-state/fix-ship-merge-record-clash/evidence/fs8-18-transcript.txt | 1 |
| FS-10 | `mergeBase` refuses with `ok: false` and changes nothing when `HEAD` does not contain `<prHead>` | .trd-state/fix-ship-merge-record-clash/evidence/fs8-18-transcript.txt | 1 |
| FS-11 | `mergeBase` refuses with `ok: false` and changes nothing when a tracked file outside the record files has uncommitted changes, and does not refuse for uncommitted changes confined to record files | .trd-state/fix-ship-merge-record-clash/evidence/fs8-18-transcript.txt | 1 |
| FS-12 | When merging the base in produces no unmerged paths, `mergeBase` commits the merge and returns `ok: true`, `outcome: "clean"` | .trd-state/fix-ship-merge-record-clash/evidence/fs8-18-transcript.txt | 1 |
| FS-13 | When every clashing path is a record file, `mergeBase` rewrites each as the union of both sides, commits the merge, and returns `ok: true`, `outcome: "resolved"`; the committed files contain both sides' lines and no conflict markers | .trd-state/fix-ship-merge-record-clash/evidence/fs8-18-transcript.txt | 1 |
| FS-14 | A record file that clashes with no common-ancestor version (both sides added it) is still resolved as the union of both sides | .trd-state/fix-ship-merge-record-clash/evidence/fs8-18-transcript.txt | 1 |
| FS-15 | When a resolved `.json` record file does not parse, `mergeBase` aborts the merge and returns `ok: false`, `outcome: "stopped"`, naming that `.json` file; `HEAD` and the working tree are as they were | .trd-state/fix-ship-merge-record-clash/evidence/fs8-18-transcript.txt | 1 |
| FS-16 | When any clashing path is not a record file, `mergeBase` aborts the merge and returns `ok: false`, `outcome: "stopped"` with `notRecord` listing those paths; `HEAD` and the working tree are as they were | .trd-state/fix-ship-merge-record-clash/evidence/fs8-18-transcript.txt | 1 |
| FS-17 | A record path that one side modified and the other deleted is not unioned: `mergeBase` stops with `ok: false`, `outcome: "stopped"`, naming the path, and `HEAD` and the working tree are as they were | .trd-state/fix-ship-merge-record-clash/evidence/fs8-18-transcript.txt | 1 |
| FS-18 | The local merge honours the project's own `.gitattributes`: with the union line present, opposing edits to `.claude/verification-notes.md` merge without a clash and both sides' lines are kept | .trd-state/fix-ship-merge-record-clash/evidence/fs8-18-transcript.txt | 1 |
| FS-19 | Custody classifies record files by the shared rule: `.claude/verification-notes.md` and paths under `.trd-state/` classify as record files, `.trd-statex/...` does not, and the work's own TRD still classifies `ignored`; `custody.js` defines no record-file list of its own | .trd-state/fix-ship-merge-record-clash/evidence/fs19-custody-cases.txt | 1 |
| FS-20 | The merge step's contract has a new step 1, before the custody gate, that reads `gh pr view <pr> --json mergeable,state` and skips the step when the state reads `MERGED` | packages/core/contracts/ship-primitive-merge.md | 1 |
| FS-21 | While `mergeable` reads `UNKNOWN`, the merge step polls up to 8 times, 15s apart, and if it is still `UNKNOWN` goes on to the custody gate rather than stopping | packages/core/contracts/ship-primitive-merge.md | 1 |
| FS-22 | On `CONFLICTING`, the merge step fetches the base and runs `record-files.js merge-base-in`; on `ok: true` it pushes the branch, polls until the PR's `headRefOid` equals the pushed commit, waits for CI on that head as `wait-ci` does, stops on a CI failure, and only then runs the custody gate and merges | packages/core/contracts/ship-primitive-merge.md | 1 |
| FS-23 | On `ok: false` from `merge-base-in`, the merge step stops, naming the offending paths, and does not proceed to the gate or the merge | packages/core/contracts/ship-primitive-merge.md | 1 |
| FS-24 | The merge step's "One rule for every stop" list includes the new stops, and the rule to commit and push nothing between the custody gate and `gh pr merge` is still stated, with the new push placed before the gate | packages/core/contracts/ship-primitive-merge.md | 1 |

## Not Met

| ID | Statement | Tier 1 | Reason | Blocker | Attempts |
|----|-----------|--------|--------|---------|----------|
| FS-25 | End to end on a real GitHub PR whose only clashes with its base are record files, `/ship-build`'s merge step merges the base in, pushes, waits for CI on the new head, passes the custody gate and merges the PR instead of stopping | fail | No run log captured again this iteration: the Exercise stage reported no lane reaching the github-live-test environment, so the end-to-end merge step was never run against a PR in islayjames/ship-build-live-test. That environment is declared and authorized in verification.md (section 1, may write/may deploy; section 1a allows 1 PR at a time), so this is missing evidence, not an unreachable environment. | no exercise lane reached the declared github-live-test environment | iter 1: not_met (evidence-missing); iter 2: not_met (evidence-missing) |

## Not Verifiable

_None._

