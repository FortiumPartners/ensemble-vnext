# Functional Verification Report: every-waived-failure-filed-as-a-defect-issue

**Source PRD**: docs/TRD/every-waived-failure-filed-as-a-defect-issue.md#Intended Change
**Success definition**: .trd-state/every-waived-failure-filed-as-a-defect-issue/success-definition.md
**Outcome**: exit-satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 25 total — 25 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 25 of 25 proven — uncovered: none
**Must pass**: 18 of 18 proven

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Given a feature state dir whose ledger holds one unfiled waived row and a `stack.md` declaring a reachable tracker, `node .claude/lib/waived-defects.js gate --state-dir <dir> --stack <stack.md>` files exactly one issue, labelled `defect`, whose title carries the criterion id and statement, and prints JSON with keys `ok`, `filed`, `already`, `failed` and `ok: true` | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived-defects/walk.txt | iteration 2 (regression pass 2) |
| FS-2 | The issue body the gate files carries the criterion statement, the failure, its evidence, the feature, TRD, branch and ledger row, and the verbatim line "Shipped waived under `Blocking: must-pass only` (verification.md §5c). This issue stays open until someone decides not to fix it; no Ensemble step closes it." | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/exercise-2/fs-audit-gh-calls.log | 2 |
| FS-3 | Run with `--closed-by owner`, the gate words the body's waiver line "Waived under … when the feature was closed by its owner" instead of "Shipped waived under …" | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/exercise-2/fs-owner-gh-calls.log | 2 |
| FS-4 | After filing, the gate records the issue URL on the waived row as an append-only `filed <url>` resolve marker in the ledger; no existing ledger line is rewritten | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-1/waived-defects/walk.txt | iteration 2 (regression pass 1) |
| FS-5 | A project whose `stack.md` declares `Tracker: none` and whose ledger holds no waived row passes the gate (`ok: true`) and the tracker is never consulted | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived-defects/walk.txt | iteration 2 (regression pass 2) |
| FS-6 | A criterion that had a `[non-blocking]` row but whose latest row is a later `met` row is not filed | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived-defects/walk.txt | iteration 2 (regression pass 2) |
| FS-7 | When an issue cannot be filed (tracker create fails), the gate prints `ok: false` with that row in `failed` and the reason it could not be filed | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-1/waived-defects/walk.txt | iteration 2 (regression pass 1) |
| FS-8 | An issue that was created but whose `filed <url>` marker could not be written is reported in `failed` with its URL printed | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-1/waived-defects/walk.txt | iteration 2 (regression pass 1) |
| FS-9 | `/audit-build`, at its close step, runs the gate with `--state-dir .trd-state/<feature>` and `--stack` before writing `closed.json`; when the gate passes, the feature closes | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived/fa-ok-transcript.txt | iteration 2 (regression pass 2) |
| FS-10 | `/close-feature` runs the gate (with `--closed-by owner`) before writing `closed.json`; when the gate passes, the feature closes | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived/fc-ok-transcript.txt | iteration 2 (regression pass 2) |
| FS-11 | When the gate returns `ok: false`, `/audit-build` writes no `closed.json`, opens no PR, and ends `COMMAND STUCK` naming each unfiled row (criterion and summary) and why it could not be filed; its `Next:` names fixing the tracker, or filing by hand and running `waived-defects.js record-filed`, then re-running `/audit-build` (never `/close-feature`) | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived/fa-fail-transcript.txt | iteration 2 (regression pass 2) |
| FS-12 | When the gate returns `ok: false`, `/close-feature` writes no `closed.json` and ends `COMMAND STUCK` naming each unfiled row and why, with a `Next:` naming the way out | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived/fc-fail-transcript.txt | iteration 2 (regression pass 2) |
| FS-13 | On a re-audit of an already-closed feature whose gate refuses, the existing `closed.json` is removed so the feature is not left closed with an unfiled row | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived/fa-reopen-transcript.txt | iteration 2 (regression pass 2) |
| FS-14 | On a refusal, both `/audit-build` and `/close-feature` still perform the records-ref write, so `filed <url>` markers of rows that were filed in that run survive | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived/fa-fail-records-ref.txt | iteration 2 (regression pass 2) |
| FS-15 | `read-blocking-policy --stack <stack.md>` with `Blocking: must-pass only` declared returns `policy: 'all'`, `declared: 'must-pass'` and a `waiverRefused` reason for each of the 4 tracker states: absent, `none`, unparseable, and a GitHub tracker a read-only `gh repo view` cannot reach | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-1/waived-defects/walk.txt | iteration 2 (regression pass 1) |
| FS-16 | With `must-pass` declared and a reachable GitHub tracker, `read-blocking-policy --stack` keeps `policy: 'must-pass'` and reports no `waiverRefused` | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived-defects/walk.txt | iteration 2 (regression pass 2) |
| FS-17 | `/implement-trd` (its §8.1a policy read) and `/verify-build` both pass `--stack` to `read-blocking-policy` and hand its `waiverRefused` to the verification workflow as `blockingNote` beside `blocking` | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-1/fs-vb/vb-session.jsonl | iteration 2 (regression pass 1) |
| FS-18 | When the waiver is refused, a failing criterion that proves no must-pass objective blocks: the run is not `satisfied` and lists no non-blocking failures | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-1/fs-vb/cap1-verification-report.md | iteration 2 (regression pass 1) |
| FS-19 | The verification report carries one `**Blocking**:` header line reading "must-pass only is declared but not applied: <reason>; every failing criterion blocks" when `blockingNote` is present, and a report rendered without `blockingNote` is byte-identical to one rendered before this change | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/exercise-2/fs19/report-with-note.md | 2 |
| FS-20 | The `**Blocking**:` line survives every re-render of the report — fix rounds and the re-proof retry | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/exercise-2/fs20-final-report.md | 2 |
| FS-21 | The command readout's DECISIONS section states that must-pass only was declared but not applied, and why, when the waiver is refused | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived/vb-transcript.txt | iteration 2 (regression pass 2) |
| FS-22 | A criterion that already has a recorded issue URL is never filed again: a resumed run, a fix round's `recordNonBlockingFollowups`, a repeated gate, and `file-followups` all leave it unfiled, and a newer waived row for it is marked with the same URL rather than producing a new issue or a new open ledger row | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/exercise-2/fs22-summary.txt | 2 |
| FS-23 | After a refusal, filing the issue by hand and running `waived-defects.js record-filed --state-dir <dir> --ref <ref> --url <url>` lets the next gate pass without filing that criterion | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-1/waived-defects/walk.txt | iteration 2 (regression pass 1) |
| FS-24 | `waived-defects.js` never closes, edits or comments on an issue: across every gate run its runner is handed only `issue create`, `label list`, `label create` and `repo view`; and the document governing `close-issue` carries a sentence that a later feature written to fix a waived-defect issue may cite and close it on ship | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived-defects/walk.txt | iteration 2 (regression pass 2) |
| FS-25 | When the close succeeds having filed waived rows, both `/audit-build` and `/close-feature` list each filed issue's URL with its criterion in the readout's STATE section | .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/regression-2/waived/fc-ok-transcript.txt | iteration 2 (regression pass 2) |

## Not Met

_None._

## Causes

| Cause | Representative | Members | Status |
|-------|----------------|---------|--------|
| issue-body-waiver-line | FS-2 | 1 (FS-2) | closed at iteration 2 |
| gate-closed-by-owner-missing | FS-3 | 2 (FS-3, FS-10) | closed at iteration 2 |
| blocking-line-wording | FS-19 | 1 (FS-19) | closed at iteration 2 |
| stuck-next-omits-record-filed | FS-11 | 1 (FS-11) | closed at iteration 2 |

## Not Verifiable

_None._

## Regression pass

After the loop exited, the criteria whose covered files changed (or whose coverage was unknown) were re-checked against the finished build.

### Round 1 (iteration 2)

| ID | Why re-checked | Changed files |
|----|----------------|---------------|
| FS-1 | covers-changed | .claude/commands/audit-build.md, .claude/commands/close-feature.md, .claude/lib/waived-defects.js, packages/core/commands/audit-build.md, packages/core/commands/close-feature.md, packages/core/lib/waived-defects.js, packages/core/lib/waived-defects.test.js |
| FS-4 | covers-changed | .claude/lib/waived-defects.js, packages/core/lib/waived-defects.js, packages/core/lib/waived-defects.test.js |
| FS-5 | no-covers |  |
| FS-6 | no-covers |  |
| FS-7 | covers-changed | .claude/lib/waived-defects.js, packages/core/lib/waived-defects.js, packages/core/lib/waived-defects.test.js |
| FS-8 | covers-changed | .claude/lib/waived-defects.js, packages/core/lib/waived-defects.js, packages/core/lib/waived-defects.test.js |
| FS-9 | covers-changed | .claude/commands/audit-build.md, .claude/lib/waived-defects.js, packages/core/commands/audit-build.md, packages/core/lib/waived-defects.js |
| FS-10 | cause-member |  |
| FS-11 | covers-changed | .claude/commands/audit-build.md, .claude/lib/waived-defects.js, packages/core/commands/audit-build.md, packages/core/lib/waived-defects.js |
| FS-12 | covers-changed | .claude/commands/close-feature.md, .claude/lib/waived-defects.js, packages/core/commands/close-feature.md, packages/core/lib/waived-defects.js |
| FS-13 | covers-changed | .claude/commands/audit-build.md, .claude/lib/waived-defects.js, packages/core/commands/audit-build.md, packages/core/lib/waived-defects.js |
| FS-14 | no-covers |  |
| FS-15 | covers-changed | .claude/lib/functional-verification.js, packages/core/lib/functional-verification.js |
| FS-16 | no-covers |  |
| FS-17 | covers-changed | .claude/lib/functional-verification.js, packages/core/lib/functional-verification.js |
| FS-18 | covers-changed | .claude/lib/functional-verification.js, packages/core/lib/functional-verification.js |
| FS-21 | no-covers |  |
| FS-23 | covers-changed | .claude/lib/waived-defects.js, packages/core/lib/waived-defects.js |
| FS-24 | no-covers |  |
| FS-25 | no-covers |  |

Caught: FS-11
Repair round: causes stuck-next-omits-record-filed; files changed: .claude/commands/audit-build.md, .claude/commands/close-feature.md, packages/core/commands/audit-build.md, packages/core/commands/close-feature.md, packages/core/commands/waived-defects-close-prose.test.js

### Round 2 (iteration 2)

| ID | Why re-checked | Changed files |
|----|----------------|---------------|
| FS-1 | covers-changed | .claude/commands/audit-build.md, .claude/commands/close-feature.md, packages/core/commands/audit-build.md, packages/core/commands/close-feature.md, packages/core/commands/waived-defects-close-prose.test.js |
| FS-5 | no-covers |  |
| FS-6 | no-covers |  |
| FS-9 | covers-changed | .claude/commands/audit-build.md, packages/core/commands/audit-build.md |
| FS-10 | covers-changed | .claude/commands/close-feature.md, packages/core/commands/close-feature.md |
| FS-11 | sent-to-debug |  |
| FS-12 | covers-changed | .claude/commands/close-feature.md, packages/core/commands/close-feature.md |
| FS-13 | covers-changed | .claude/commands/audit-build.md, packages/core/commands/audit-build.md |
| FS-14 | no-covers |  |
| FS-16 | no-covers |  |
| FS-21 | no-covers |  |
| FS-24 | no-covers |  |
| FS-25 | no-covers |  |

Caught: _none._

Not re-walked (covered files unchanged): FS-2, FS-3, FS-19, FS-20, FS-22

Changed files no criterion covers: packages/core/lib/functional-verification.test.js

