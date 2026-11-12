# Functional Verification Report: fold-the-detached-ship-record-into-the-ref

**Source PRD**: docs/TRD/fold-the-detached-ship-record-into-the-ref.md (## Intended Change)
**Success definition**: .trd-state/fold-the-detached-ship-record-into-the-ref/success-definition.md
**Outcome**: Satisfied
**Reason**: 17 of 17 criteria met in one pass (coverage 100%, floor 50%); all 10 must-pass criteria met. The source also says an unclosed feature is still refused when closed.json is in neither place; no criterion covers that clause and it is unproven.
**Criteria**: 17 total — 17 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 17 of 17 proven — uncovered: none
**Must pass**: 10 of 10 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | After a `merged` result is recorded for the detaching step in a git repo, `git cat-file -p refs/ensemble/records/f:shipped.json` shows the run record with `detached: true` and the post-merge cursor, and `<common>/ensemble/ship/` does not exist | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-1.txt | 1 |
| FS-2 | Once detached, the run's state names the records ref: `state.recordRef` is `refs/ensemble/records/f` and `state.recordPath` reads `refs/ensemble/records/f:shipped.json`, not a path under `<common>/ensemble/ship/` | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-2.txt | 1 |
| FS-3 | Every save of a detached run after the detach also lands on the ref, one new ref commit per save, so the ref's `shipped.json` follows the run to its end and reaches `done` | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-3.txt | 1 |
| FS-4 | At the detach, custody's anchor is written as `custody.json` on the same ref, stamped with the run's `startedAt`, and no `<startedAt>.custody.json` copy is written beside a detached folder; an anchor move made after the detach updates the ref's `custody.json` | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-4.txt | 1 |
| FS-5 | When the repository has an origin, the ref write at the detach is pushed: the origin's `refs/ensemble/records/f` points at the same commit as the local ref | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-5.txt | 1 |
| FS-6 | When the ref write fails, the run falls back to the old behaviour: the record file and the `current.json` pointer are written under `<common>/ensemble/ship/f/` | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-6.txt | 1 |
| FS-7 | A `start` in a git repo no longer writes a pointer: after `start` (before any detach), `<common>/ensemble/ship/` does not exist | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-7.txt | 1 |
| FS-8 | When a tracked `shipped.json` and the ref's copy of the same run both exist, the run is read from whichever has the later `updatedAt`, in both directions | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-8.txt | 1 |
| FS-9 | The ref's copy is not taken as the run when it is not the same run: a ref record with a different `startedAt`, one not marked detached, or one whose identity does not match the run's `work` is ignored and the tracked `shipped.json` is read, even when the ref copy's `updatedAt` is later | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-9.txt | 1 |
| FS-10 | With no tracked `shipped.json`, the run is read from the ref's detached record and from the pointer, and the one with the later `updatedAt` wins | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-10.txt | 1 |
| FS-11 | A ship run made before this change (a detached folder holding a record and `current.json` pointer, nothing on the ref) is loaded by `status` and continued by `start --resume` from the folder's cursor | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-11.txt | 1 |
| FS-12 | The next `record` of a resumed legacy run lands on the ref: `refs/ensemble/records/f` then exists and its `shipped.json` is that run (same `startedAt`) with the new cursor | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-12.txt | 1 |
| FS-13 | Custody `check --link merge` passes against the ref's anchor when the tracked `custody.json` names a different commit | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-13.txt | 1 |
| FS-14 | Custody `check --link deploy` passes against the ref's anchor when the tracked `custody.json` names a different commit | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-14.txt | 1 |
| FS-15 | Custody takes the ref's `custody.json` only when it is stamped with the run: when the ref's copy carries another run's `startedAt`, the anchor comes from the detached folder's `<startedAt>.custody.json`, and with no such file from the tracked `custody.json` | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-15.txt | 1 |
| FS-16 | On a checkout with no state folder, where `closed.json` (with `audit.auditedCommit` = X) exists only on the ref, a plain `start` (no `--resume`) followed by `custody reconcile --set-only` returns `anchor: X` with `source` `audited`, while HEAD is a later commit | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-16.txt | 1 |
| FS-17 | A plain `start` still begins a fresh run when the ref holds a `shipped.json`: the restored `shipped.json` is removed, and the run that starts has a new `startedAt`, not the restored run's | .trd-state/fold-the-detached-ship-record-into-the-ref/evidence/FS-17.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

