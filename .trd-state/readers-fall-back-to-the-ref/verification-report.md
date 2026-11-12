# Functional Verification Report: readers-fall-back-to-the-ref

**Source PRD**: docs/TRD/readers-fall-back-to-the-ref.md § Intended Change
**Success definition**: .trd-state/readers-fall-back-to-the-ref/success-definition.md
**Outcome**: Must-Pass Unproven (no full-environment run declared)
**Reason**: must-pass objectives with no criterion: O3 — the core was not shown to work
**Criteria**: 16 total — 16 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 16 of 16 proven — uncovered: none
**Must pass**: 14 of 14 proven — no criterion for: O3
**Diagnosis**: 0 open
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | With the feature folder deleted and the ref holding it, `implement-state.load` returns the ref's `implement.json` rather than throwing ENOENT | .trd-state/readers-fall-back-to-the-ref/evidence/fs-1-implement-state-load.txt | 1 |
| FS-2 | With the folder deleted and the ref holding it, `custody.js check` and `custody.js reconcile` see the ref's anchor and its `closed.json` | .trd-state/readers-fall-back-to-the-ref/evidence/fs-2-custody.txt | 1 |
| FS-3 | With the folder deleted and the ref holding it, `ship-sequencer.js start --resume` loads the ref's run record and reports `resumed: true` | .trd-state/readers-fall-back-to-the-ref/evidence/fs-3-ship-sequencer-resume.txt | 1 |
| FS-4 | With the folder deleted and the ref holding it, `artifacts.js get <kind>` prints the URL stored in the ref's `artifacts.json` | .trd-state/readers-fall-back-to-the-ref/evidence/fs-4-artifacts-get.txt | 1 |
| FS-5 | With the folder deleted and the ref holding it, `artifacts.js record` of one kind keeps every other entry of the ref's manifest instead of starting a fresh one | .trd-state/readers-fall-back-to-the-ref/evidence/fs-5-artifacts-record-keeps-entries.txt | 1 |
| FS-6 | With the folder deleted and the ref holding it, the `session-context.js` hook shows the feature's Closed:/Impl: line | .trd-state/readers-fall-back-to-the-ref/evidence/fs-6-session-context.txt | 1 |
| FS-7 | With the folder deleted and the ref holding it, `router.py` `feature_in_flight` reports the feature closed | .trd-state/readers-fall-back-to-the-ref/evidence/fs-7-router-feature-in-flight.txt | 1 |
| FS-8 | With the folder deleted and the ref holding it, the `precompact.js` hook summarises the ref's task list | .trd-state/readers-fall-back-to-the-ref/evidence/fs-8-precompact.txt | 1 |
| FS-9 | With the folder deleted and the ref holding it, the `status.js` hook neither re-creates `.trd-state/<slug>/` nor runs a fetch | .trd-state/readers-fall-back-to-the-ref/evidence/fs-9-status-hook-no-recreate-no-fetch.txt | 1 |
| FS-10 | With neither the folder nor the ref, `implement-state.load` throws the same ENOENT error it throws today | .trd-state/readers-fall-back-to-the-ref/evidence/fs-10-load-neither.txt | 1 |
| FS-11 | With neither the folder nor the ref, `artifacts.js get` prints nothing | .trd-state/readers-fall-back-to-the-ref/evidence/fs-11-artifacts-get-neither.txt | 1 |
| FS-12 | With neither the folder nor the ref, the hooks `session-context.js`, `status.js`, `precompact.js` and `router.py` emit exactly what they emit today | .trd-state/readers-fall-back-to-the-ref/evidence/fs-12-hooks-neither.txt | 1 |
| FS-13 | With neither the folder nor the ref, `custody.js check`/`reconcile`, `ship-sequencer.js start --resume` and `artifacts.js record` each give exactly today's answer | .trd-state/readers-fall-back-to-the-ref/evidence/fs-13-writers-neither.txt | 1 |
| FS-14 | A hook run in a repo with no local `refs/ensemble/records/<slug>` and an `origin` that holds one does not fetch it: the local ref is still absent after the hook | .trd-state/readers-fall-back-to-the-ref/evidence/fs-14-hooks-no-fetch.txt | 1 |
| FS-15 | A ref whose `record.json` names a different `forge_feature_id` is never used: the reader answers "no record" | .trd-state/readers-fall-back-to-the-ref/evidence/fs-15-16-identity-mismatch.txt | 1 |
| FS-16 | A ref whose `record.json` carries no `forge_feature_id` and names a different branch is never used: the reader answers "no record" | .trd-state/readers-fall-back-to-the-ref/evidence/fs-15-16-identity-mismatch.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

