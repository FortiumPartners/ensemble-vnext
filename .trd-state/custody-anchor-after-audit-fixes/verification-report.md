# Functional Verification Report: custody-anchor-after-audit-fixes

**Source PRD**: docs/TRD/custody-anchor-after-audit-fixes.md § Intended Change
**Success definition**: .trd-state/custody-anchor-after-audit-fixes/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 13 total — 13 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 13 of 13 proven — uncovered: none
**Must pass**: 6 of 6 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | In a repo where `closed.json` carries `auditedCommit = A` and `anchorCommit = F`, where F is A plus fix-run commits touching shipped source followed only by record-file commits (the audit report, `closed.json`), and no `custody.json` exists, the first `custody.js reconcile` returns `action: 'set'` with `anchor: F` | .trd-state/custody-anchor-after-audit-fixes/evidence/probe-transcript.txt | 1 |
| FS-2 | In the FS-1 history, a second `reconcile` after the first returns `action: 'none'` — the first custody check after the audit's fixes asks for no re-proof | .trd-state/custody-anchor-after-audit-fixes/evidence/probe-transcript.txt | 1 |
| FS-3 | With the same history but `anchorCommit` absent from `closed.json`'s `audit` object, the first `reconcile` anchors at A (`source: 'audited'`) and returns neither `none` nor `set` | .trd-state/custody-anchor-after-audit-fixes/evidence/probe-transcript.txt | 1 |
| FS-4 | With the same history but `anchorCommit: null`, the first `reconcile` anchors at A (`source: 'audited'`) and returns neither `none` nor `set` | .trd-state/custody-anchor-after-audit-fixes/evidence/probe-transcript.txt | 1 |
| FS-5 | When `reconcile` anchors at a valid `audit.anchorCommit`, the recorded anchor's source is `'audit-fixed'` | .trd-state/custody-anchor-after-audit-fixes/evidence/probe-transcript.txt | 1 |
| FS-6 | When no anchor is set and `closed.json` carries neither a valid `anchorCommit` nor an `auditedCommit`, `reconcile` anchors at the branch head with `source: 'pushed'` | .trd-state/custody-anchor-after-audit-fixes/evidence/probe-transcript.txt | 1 |
| FS-7 | A present-but-unresolvable `anchorCommit` (an id no commit in the repo resolves to) makes `reconcile` refuse, with a reason that names `anchorCommit`; it does not silently fall back to `auditedCommit` or the head | .trd-state/custody-anchor-after-audit-fixes/evidence/probe-transcript.txt | 1 |
| FS-8 | The `audit.anchorCommit` preference applies only when no anchor is set: a `reconcile` with an existing `custody.json` anchor keeps that anchor rather than moving to `anchorCommit` | .trd-state/custody-anchor-after-audit-fixes/evidence/probe-transcript.txt | 1 |
| FS-9 | `/audit-build`'s close writes `closed.json` `audit.anchorCommit` as the full id of `git rev-parse HEAD` taken once the chained fix run is completely done, and only when (a) step 3 chained a fix run in this round, (b) that run's `[STATUS: /implement-trd] RETURN →` line is not `RETURN → STUCK`, and (c) `decide` returned `close: true` | .trd-state/custody-anchor-after-audit-fixes/evidence/audit-build-excerpt.txt | 1 |
| FS-10 | In every close other than the one FS-9 describes, `/audit-build` writes `audit.anchorCommit` as `null` | .trd-state/custody-anchor-after-audit-fixes/evidence/audit-build-excerpt.txt | 1 |
| FS-11 | Before taking the head for `anchorCommit`, `/audit-build`'s close waits for the fix run's end-of-run whole-branch review result and its edit commit (`fix(<feature>): end-of-run review edits`), which under `--chained` can arrive after the RETURN line | .trd-state/custody-anchor-after-audit-fixes/evidence/audit-build-excerpt.txt | 1 |
| FS-12 | If the fix run's `[review-pending]` row is still unresolved when the close is written, `/audit-build` writes `anchorCommit: null` | .trd-state/custody-anchor-after-audit-fixes/evidence/audit-build-excerpt.txt | 1 |
| FS-13 | The audit report's `- Audited commit:` header remains the `git rev-parse HEAD` taken before step 3 chains the fix run, and `closed.json` `audit.auditedCommit` remains that header's value, unchanged — kept as its own field, distinct from `anchorCommit`, and not overwritten by the post-fix head | .trd-state/custody-anchor-after-audit-fixes/evidence/audit-build-excerpt.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

