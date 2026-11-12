# Functional Verification Report: stop-run-record-dumps-on-main

**Source PRD**: docs/TRD/stop-run-record-dumps-on-main.md § Intended Change
**Success definition**: .trd-state/stop-run-record-dumps-on-main/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 7 total — 7 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 7 of 7 proven — uncovered: none
**Must pass**: 4 of 4 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | In a temp git repo holding the brief's seventeen files, all tracked, `scaffold-project.sh --git-files .` adds these five lines to `.gitignore`: `.trd-state/**/evidence/`, `.trd-state/**/findings/`, `.trd-state/**/judge-*.json`, `.trd-state/**/record-*.json`, `.trd-state/**/setup-decide-*.json` | .trd-state/stop-run-record-dumps-on-main/evidence/fs1-5-transcript.txt | 1 |
| FS-2 | After the FS-1 run, `git ls-files .trd-state` lists exactly the nine durable files and nothing else | .trd-state/stop-run-record-dumps-on-main/evidence/fs1-5-transcript.txt | 1 |
| FS-3 | After the FS-1 run, the eight evidence, findings and scratch files (including those under `reverify/` and `reverify/retry/`) are staged deletions in the index and still exist on disk | .trd-state/stop-run-record-dumps-on-main/evidence/fs1-5-transcript.txt | 1 |
| FS-4 | Running `scaffold-project.sh --git-files .` a second time on the same repo adds nothing to `.gitignore` | .trd-state/stop-run-record-dumps-on-main/evidence/fs1-5-transcript.txt | 1 |
| FS-5 | `scaffold-project.sh --refresh` on a repo with an existing `.gitignore` adds the five lines and leaves `git diff --cached` empty | .trd-state/stop-run-record-dumps-on-main/evidence/fs1-5-transcript.txt | 1 |
| FS-6 | In Ensemble's own repo, `.gitignore` carries the same five lines, and the previous single-`*` evidence and findings lines are gone | .trd-state/stop-run-record-dumps-on-main/evidence/fs6-7-transcript.txt | 1 |
| FS-7 | In Ensemble's own repo, no tracked file matches the five lines: every file that did is removed from the index as a staged (not committed by the change itself) deletion and is still on disk | .trd-state/stop-run-record-dumps-on-main/evidence/fs6-7-transcript.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

