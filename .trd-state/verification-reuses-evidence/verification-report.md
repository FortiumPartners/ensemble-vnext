# Functional Verification Report: verification-reuses-evidence

**Source PRD**: docs/TRD/verification-reuses-evidence.md#Intended Change
**Success definition**: .trd-state/verification-reuses-evidence/success-definition.md
**Outcome**: Stalled (no full-environment run declared)
**Reason**: iteration closed no gaps — remediation is not converging. 25 of 26 criteria met; FS-25 (Judge prompt states the reused/stale rules) remains open because its evidence locator is not found verbatim in the captured artifact.
**Criteria**: 26 total — 25 met, 1 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 25 of 26 proven — uncovered: FS-25
**Diagnosis**: 1 open — 1 locator not found
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `live-evidence.js record` appends exactly one line to `.trd-state/<feature>/evidence/live-manifest.jsonl`, a JSON object carrying `task`, `artifact`, `shows`, `environment`, `covers: [{path, sha256}]` and `ts`; the line is under 2048 bytes; each `covers` path is absolute and its `sha256` equals the covered file's hash at record time | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-2 | `record` rejects an entry that names no artifact, and appends nothing | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-3 | `record` rejects an entry whose artifact is not a file (e.g. a directory or a missing path), and appends nothing | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-4 | `record` rejects an entry with an empty `covers`, and appends nothing | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-5 | `record` rejects an entry whose covered path does not exist, and appends nothing | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-6 | A covered path given as a relative path or through a symlink is stored as the absolute, symlink-resolved path of the real file | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-7 | `live-evidence.js read` skips malformed manifest lines and returns only the last entry for each artifact | .trd-state/verification-reuses-evidence/evidence/live-evidence-transcript.txt | 1 |
| FS-8 | When `/implement-trd` assembles the prompt for a `[LIVE]` task, the prompt tells the task to bring the environment to the current code first (the `verification.md` §2 fast refresh, when declared), save each artifact under `.trd-state/<feature>/evidence/live/<task-id>/`, and record it with `node .claude/lib/live-evidence.js record`, with the task (not the exerciser) declaring `covers` | .trd-state/verification-reuses-evidence/evidence/fs8-live-branch.txt | 1 |
| FS-9 | An artifact older than `since` passes tier 1, marked `reused: true`, when its covers (from the live-evidence manifest) name files that are absolute, exist, and still hash to the recorded `sha256` | .trd-state/verification-reuses-evidence/evidence/fs9-14-transcript.txt | 1 |
| FS-10 | The same old artifact is `stale` once a covered file has been edited | .trd-state/verification-reuses-evidence/evidence/fs9-14-transcript.txt | 1 |
| FS-11 | Restoring the covered file to its recorded bytes makes the old artifact pass again, `reused: true` | .trd-state/verification-reuses-evidence/evidence/fs9-14-transcript.txt | 1 |
| FS-12 | An old artifact whose claim carries `covers: []` is `stale` | .trd-state/verification-reuses-evidence/evidence/fs12-13-transcript.txt | 1 |
| FS-13 | An old artifact whose `covers` names a relative path is `stale`, even if that path resolves to an unchanged file | .trd-state/verification-reuses-evidence/evidence/fs12-13-transcript.txt | 1 |
| FS-14 | An old artifact whose `covers` names an absolute path that no longer exists (or is not a file) is `stale` | .trd-state/verification-reuses-evidence/evidence/fs9-14-transcript.txt | 1 |
| FS-15 | An artifact newer than `since` passes exactly as before this change — with or without `covers`, and not marked `reused: true` | .trd-state/verification-reuses-evidence/evidence/fs15-20-checker-transcript.txt | 1 |
| FS-16 | A judge-only claim on an old artifact whose covered file has been edited still returns `tier1: 'skipped'` and additionally reports `stale: true` | .trd-state/verification-reuses-evidence/evidence/fs15-20-checker-transcript.txt | 1 |
| FS-17 | A judge-only claim on an old artifact whose covered files are unchanged returns `tier1: 'skipped'` with `stale: false` and reports `reused` | .trd-state/verification-reuses-evidence/evidence/fs15-20-checker-transcript.txt | 1 |
| FS-18 | Given a `liveEvidence` manifest entry, the Exercise prompt lists that entry's artifact path and instructs the exerciser to check whether a listed artifact already proves a criterion before capturing, and if so to claim it (with a locator seen in it, or none for a judge-only row) without capturing again | .trd-state/verification-reuses-evidence/evidence/fs18-19-21-source-excerpts.txt | 1 |
| FS-19 | Each claim's `covers` is attached from the manifest entry whose artifact matches the claim's, by the checker at check time (`check-evidence --state-dir`), and any `covers` sent by the exerciser or in the claims payload is discarded (restated after amendment AMEND-001 moved this from `reconcileClaims` into the checker) | .trd-state/verification-reuses-evidence/evidence/fs15-20-checker-transcript.txt | 1 |
| FS-20 | An old artifact that is not in the manifest gets no `covers` and is therefore `stale` — even if the exerciser sent `covers` for it | .trd-state/verification-reuses-evidence/evidence/fs15-20-checker-transcript.txt | 1 |
| FS-21 | A `liveEvidence` value that is not an array throws before any agent is dispatched | .trd-state/verification-reuses-evidence/evidence/fs18-19-21-source-excerpts.txt | 1 |
| FS-22 | A `liveEvidence` entry with no `artifact` throws before any agent is dispatched, and the error names that entry's index | .trd-state/verification-reuses-evidence/evidence/fs22-23-transcript.txt | 1 |
| FS-23 | A `liveEvidence` entry with no `covers` throws before any agent is dispatched, and the error names that entry's index | .trd-state/verification-reuses-evidence/evidence/fs22-23-transcript.txt | 1 |
| FS-24 | `/implement-trd` (at its §8.3 verification step) and `/verify-build` both pass `liveEvidence` to `verify-functional`, read via `node .claude/lib/live-evidence.js read`, and `[]` when the manifest is absent | .trd-state/verification-reuses-evidence/evidence/fs24-grep.txt | 1 |
| FS-26 | The TRD authoring rule states that a `[LIVE]` task records its artifacts for the verification loop, which reuses them so the run does not prove the same thing twice — in `trd-authoring.md` §4.1.1, in the end-to-end paragraph of its §5, and in the copy in `create-trd.md` | .trd-state/verification-reuses-evidence/evidence/fs26-grep.txt | 1 |

## Not Met

| ID | Statement | Tier 1 | Reason | Blocker | Attempts |
|----|-----------|--------|--------|---------|----------|
| FS-25 | The Judge prompt states that a `reused` pass predates this run and proves the criterion only if its `shows` and content match the criterion, and that a judge-only claim reported `stale: true` is `not_met` with cause `evidence-stale` |  | Tier-1 evidence check failed with locator-not-found: the claimed locator sentence is not present contiguously in fs25-judge-prompt-grep.txt. In packages/core/workflows/verify-functional.js the sentence is split across concatenated string literals (lines 501-502: '...only if its content (and, for a live-check ` + `artifact, what it shows) actually matches that criterion'), so a grep/sed capture of the source never contains it as one line. The artifact needs a locator that appears verbatim in it (e.g. a single source line), or a capture of the assembled prompt text. | locator-not-found: locator sentence is split across concatenated string literals in the source, so it never appears verbatim in a grep capture | iter 1: not_met; iter 2: not_met (locator-not-found) |

## Not Verifiable

_None._

