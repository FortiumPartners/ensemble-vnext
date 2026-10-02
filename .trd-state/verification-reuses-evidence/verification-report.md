# Functional Verification Report: verification-reuses-evidence

**Source PRD**: docs/TRD/verification-reuses-evidence.md ## Intended Change
**Success definition**: .trd-state/verification-reuses-evidence/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 26 total — 26 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 26 of 26 proven — uncovered: none
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `live-evidence.js record` appends exactly one line to the manifest with task, artifact, shows, environment, covers [{path, sha256}] and ts; under 2048 bytes; covers paths absolute with matching sha256 | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-2 | `record` rejects an entry that names no artifact, and appends nothing | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-3 | `record` rejects an entry whose artifact is not a file, and appends nothing | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-4 | `record` rejects an entry with an empty `covers`, and appends nothing | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-5 | `record` rejects an entry whose covered path does not exist, and appends nothing | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-6 | A covered path given as relative or through a symlink is stored as the absolute, symlink-resolved path | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-7 | `live-evidence.js read` skips malformed lines and returns only the last entry per artifact | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-8 | The [LIVE] task prompt tells the task to refresh first, save under evidence/live/<task-id>/, and record with live-evidence.js record, the task declaring covers | .trd-state/verification-reuses-evidence/evidence/fs8-live-branch.txt | 1 |
| FS-9 | An artifact older than `since` passes tier 1, reused: true, when its manifest covers still hash as recorded | .trd-state/verification-reuses-evidence/evidence/fs9-14-transcript.txt | 1 |
| FS-10 | The same old artifact is `stale` once a covered file has been edited | .trd-state/verification-reuses-evidence/evidence/fs9-14-transcript.txt | 1 |
| FS-11 | Restoring the covered file makes the old artifact pass again, reused: true | .trd-state/verification-reuses-evidence/evidence/fs9-14-transcript.txt | 1 |
| FS-12 | An old artifact whose claim carries `covers: []` is `stale` | .trd-state/verification-reuses-evidence/evidence/fs12-13-transcript.txt | 1 |
| FS-13 | An old artifact whose covers names a relative path is `stale` | .trd-state/verification-reuses-evidence/evidence/fs12-13-transcript.txt | 1 |
| FS-14 | An old artifact whose covered absolute path no longer exists is `stale` | .trd-state/verification-reuses-evidence/evidence/fs9-14-transcript.txt | 1 |
| FS-15 | An artifact newer than `since` passes exactly as before, not marked reused | .trd-state/verification-reuses-evidence/evidence/fs15-20-checker-transcript.txt | 1 |
| FS-16 | A judge-only claim on an old artifact with an edited covered file returns skipped with stale: true | .trd-state/verification-reuses-evidence/evidence/fs15-20-checker-transcript.txt | 1 |
| FS-17 | A judge-only claim on an old artifact with unchanged covered files returns skipped, stale: false, and reports reused | .trd-state/verification-reuses-evidence/evidence/fs15-20-checker-transcript.txt | 1 |
| FS-18 | With a liveEvidence entry, the Exercise prompt lists its artifact path and instructs reuse without re-capture | .trd-state/verification-reuses-evidence/evidence/fs18-19-21-source-excerpts.txt | 1 |
| FS-19 | Each claim's covers is attached from the manifest by the checker at check time (check-evidence --state-dir); any covers in the payload is discarded | .trd-state/verification-reuses-evidence/evidence/fs15-20-checker-transcript.txt | 1 |
| FS-20 | An old artifact not in the manifest gets no covers and is `stale`, even if the exerciser sent covers | .trd-state/verification-reuses-evidence/evidence/fs15-20-checker-transcript.txt | 1 |
| FS-21 | A non-array liveEvidence throws before any agent is dispatched | .trd-state/verification-reuses-evidence/evidence/fs18-19-21-source-excerpts.txt | 1 |
| FS-22 | A liveEvidence entry with no artifact throws, naming the index | .trd-state/verification-reuses-evidence/evidence/fs22-23-transcript.txt | 1 |
| FS-23 | A liveEvidence entry with no covers throws, naming the index | .trd-state/verification-reuses-evidence/evidence/fs22-23-transcript.txt | 1 |
| FS-24 | /implement-trd §8.3 and /verify-build pass liveEvidence read via live-evidence.js read, [] when absent | .trd-state/verification-reuses-evidence/evidence/fs24-grep.txt | 1 |
| FS-25 | The Judge prompt states that a `reused` pass predates this run and proves the criterion only if its `shows` and content match the criterion, and that a judge-only claim reported `stale: true` is `not_met` with cause `evidence-stale` | .trd-state/verification-reuses-evidence/evidence/fs25-assembled-judge-prompt.txt | 1 |
| FS-26 | The TRD authoring rule says [LIVE] tasks record artifacts for the loop, in trd-authoring.md §4.1.1, its §5 end-to-end paragraph, and create-trd.md | .trd-state/verification-reuses-evidence/evidence/fs26-grep.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._


## Fix run

| Round | Tasks promoted | Criteria closed | Still open |
|-------|-----------------|------------------|-------------|
| 1 | 0 | 1 | 0 |

_None still open._

