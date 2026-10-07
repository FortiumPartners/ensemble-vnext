VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this defect has no PRD, so the fix was checked against its TRD only); no test proves that a failed `git log --follow` sends the TRD to review instead of stopping the run (the code does it, but nothing exercises it)

# Audit report: audit-docs-moved-trd-skip

- Date: 2026-10-06
- Audited commit: 1f17223
- TRD: docs/TRD/audit-docs-moved-trd-skip.md
- PRD: none
- Findings: 2 · applied: 1 · rejected: 0 · still unverified: 1 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/audit-docs-moved-trd-skip.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this defect has no PRD, so the fix was checked against its TRD only); no test proves that a failed `git log --follow` sends the TRD to review instead of stopping the run (the code does it, but nothing exercises it)

Coverage: all 5 verifiers reported; 3 objectives and 1 task (FIX-001) indexed. Product-requirement validation was UNCHECKED because no PRD exists. I also re-ran `docs-audit-assemble.test.js`: 67 of 67 pass. The library is byte-identical to its vendored copy in `.claude/lib/`.

TRACEABILITY GAPS
- O2, "a git failure means review, never skip and never fatal", is half proven. A test covers the case where git rejects a Touches path (`:(bogus)src/thing.js` gives skip null). The other half is built: `followHistory` calls git with `allowFail: true`, and `trdSkip` returns null when `!history.ok`. No test makes the `--follow` call itself fail, because doc paths are always valid pathspecs and the test would need to stub git or break the repo. FIX-001 covers O2, so this goes to /implement-trd --reconcile.

NO ACTION
- O1 (a moved TRD is matched to its implement.json by any path it has had) and O3 (out-of-repo Touches entries are dropped before git) are implemented and tested. The tests are in `packages/core/lib/docs-audit-assemble.test.js`, under "history-aware skip test": the old-path match, the out-of-repo path tolerated, the out-of-repo path dropped, and the copied-TRD tests.

Unresolved, not a gap
- The validation verifier's "no PRD" finding is correct, and no reconcile pass can fix it, because this defect has no PRD by design. It is recorded as the only entry in the TRD's Could Not Verify section.

Could Not Verify, rewritten in `docs/TRD/audit-docs-moved-trd-skip.md`: the old entry ("the `--follow` failure was never reproduced; its fix is checked by reading the code") is gone. The audit confirmed the fix is in the code and found the missing test, so that is now the gap above rather than an open entry. The section now holds one entry: product-requirement validation was not checked.
