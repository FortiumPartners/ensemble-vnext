# Functional Verification Report: writers-move-to-the-ref

**Source PRD**: docs/TRD/writers-move-to-the-ref.md § Intended Change
**Success definition**: .trd-state/writers-move-to-the-ref/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: All 22 criteria met on iteration 1, including all 16 must-pass; no gaps remain.
**Criteria**: 22 total — 22 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 22 of 22 proven — uncovered: none
**Must pass**: 16 of 16 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | No command or contract prose tells an agent to `git add` or `git commit` a run-records path | .trd-state/writers-move-to-the-ref/evidence/fs1-grep.txt | 1 |
| FS-2 | `/plan` §7a.5's commit list (the sweep chain's commit) names no `.trd-state/` path | .trd-state/writers-move-to-the-ref/evidence/fs2-plan-7a5.txt | 1 |
| FS-3 | Each of the 11 named files names `record-ref.js write` | .trd-state/writers-move-to-the-ref/evidence/fs3-counts.txt | 1 |
| FS-4 | A Jest prose test pins both FS-1 and FS-3, and it passes | .trd-state/writers-move-to-the-ref/evidence/fs4-names.txt | 1 |
| FS-5 | In a scaffolded repo, `git check-ignore --no-index` reports the 5 record paths as ignored | .trd-state/writers-move-to-the-ref/evidence/fs5-6-8-ignore.txt | 1 |
| FS-6 | In the same scaffolded repo, the 3 kept paths are not ignored | .trd-state/writers-move-to-the-ref/evidence/fs5-6-8-ignore.txt | 1 |
| FS-7 | Scaffold and `--git-files` leave already-tracked records tracked while scratch is still untracked | .trd-state/writers-move-to-the-ref/evidence/fs7-8-transcript.txt | 1 |
| FS-8 | After scaffolding, `ensemble.records == "ref"`, and an owner value survives `--refresh` | .trd-state/writers-move-to-the-ref/evidence/fs7-8-transcript.txt | 1 |
| FS-9 | `/implement-trd` Step 5 commits, then records the checkpoint with that commit id, then calls `record-ref.js write` | .trd-state/writers-move-to-the-ref/evidence/fs9-implement-trd-step5.txt | 1 |
| FS-10 | In a fixture run, the checkpoint in `implement.json` names the code commit the phase checkpoint made | .trd-state/writers-move-to-the-ref/evidence/live/work/fs10-fs11-evidence.txt | 1 |
| FS-11 | In a fixture run, the branch gains no records-only commit and the finished implement.json is on the records ref | .trd-state/writers-move-to-the-ref/evidence/live/work/fs10-fs11-evidence.txt | 1 |
| FS-12 | On the default branch, a write whose push fails returns ref/push failed, makes no branch commit and untracks nothing | .trd-state/writers-move-to-the-ref/evidence/fs12-19-transcript.txt | 1 |
| FS-13 | On the default branch, a write that cannot write the ref returns failed/default-branch and leaves records in place | .trd-state/writers-move-to-the-ref/evidence/fs12-19-transcript.txt | 1 |
| FS-14 | On the default branch, a write to a ref owned by another feature is refused for identity and leaves it untouched | .trd-state/writers-move-to-the-ref/evidence/fs12-19-transcript.txt | 1 |
| FS-15 | On a detached HEAD, the write behaves as on the default branch | .trd-state/writers-move-to-the-ref/evidence/fs12-19-transcript.txt | 1 |
| FS-16 | With `--no-fallback`, a feature-branch write that cannot reach the ref makes no branch commit | .trd-state/writers-move-to-the-ref/evidence/fs12-19-transcript.txt | 1 |
| FS-17 | A `--shared` write never untracks anything | .trd-state/writers-move-to-the-ref/evidence/fs17-18-transcript.txt | 1 |
| FS-18 | On a feature branch, moving tracked records to the ref commits their removal by pathspec, and merge-base-in then succeeds | .trd-state/writers-move-to-the-ref/evidence/fs17-18-transcript.txt | 1 |
| FS-19 | On a feature branch without `--no-fallback`, a failed ref push still falls back to a branch commit | .trd-state/writers-move-to-the-ref/evidence/fs12-19-transcript.txt | 1 |
| FS-20 | With no feature active, `precompact.js` appends to the shared log and writes `refs/ensemble/records/_shared` locally without network | .trd-state/writers-move-to-the-ref/evidence/fs20-precompact.txt | 1 |
| FS-21 | `/sweep` writes the shared records ref at its end | .trd-state/writers-move-to-the-ref/evidence/fs21-sweep.txt | 1 |
| FS-22 | A write keeps the ref's further-along post-merge shipped.json/custody.json and writes the worktree copies when they are further along | .trd-state/writers-move-to-the-ref/evidence/fs22-transcript.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

