# Functional Verification Report: command-run-liveness

**Source PRD**: docs/TRD/command-run-liveness.md#Intended Change
**Success definition**: .trd-state/command-run-liveness/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 15 total — 15 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 15 of 15 proven — uncovered: none
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | A framework command opened 45 minutes ago whose agents are still starting and stopping reads active | .trd-state/command-run-liveness/evidence/FS-1.txt | 1 |
| FS-2 | The same framework command, 31 minutes after its last agent stopped and none open, reads unknown | .trd-state/command-run-liveness/evidence/FS-2.txt | 1 |
| FS-3 | A /code-review run reads unknown past 30 minutes however many subagents the session dispatched afterwards | .trd-state/command-run-liveness/evidence/FS-3.txt | 1 |
| FS-4 | A command whose file exists but does not call notify-complete.sh is not treated as framework-owned | .trd-state/command-run-liveness/evidence/FS-4.txt | 1 |
| FS-5 | Ledger rows from a different session do not keep a run alive | .trd-state/command-run-liveness/evidence/FS-5.txt | 1 |
| FS-6 | An agent started before the record's ts and never stopped is not a sign of life | .trd-state/command-run-liveness/evidence/FS-6.txt | 1 |
| FS-7 | An agent started at or after ts, still open, under 4 hours old, keeps the run active | .trd-state/command-run-liveness/evidence/FS-7.txt | 1 |
| FS-8 | An agent left open 4 hours or more no longer counts; the run reads unknown | .trd-state/command-run-liveness/evidence/FS-8.txt | 1 |
| FS-9 | Rows in the shared _dispatch.jsonl count even when current.json names a feature | .trd-state/command-run-liveness/evidence/FS-9.txt | 1 |
| FS-10 | With no current.json the router finds signs of life in _dispatch.jsonl | .trd-state/command-run-liveness/evidence/FS-10.txt | 1 |
| FS-11 | A current.json TRD name resolving outside .trd-state/ is rejected; no ledger is read through it | .trd-state/command-run-liveness/evidence/FS-11.txt | 2 |
| FS-12 | A ledger over 64 KB is handled: active from a fresh last row, exit 0, well-formed output | .trd-state/command-run-liveness/evidence/FS-12.txt | 1 |
| FS-13 | An unreadable ledger degrades to unknown, never an error or crash | .trd-state/command-run-liveness/evidence/FS-13.txt | 1 |
| FS-14 | Reading never rewrites the run record: ts unchanged after a read that resolves active through the ledger | .trd-state/command-run-liveness/evidence/FS-14.txt | 1 |
| FS-15 | A framework run younger than 30 minutes reads active with no ledger at all | .trd-state/command-run-liveness/evidence/FS-15.txt | 2 |

## Not Met

_None._

## Not Verifiable

_None._

