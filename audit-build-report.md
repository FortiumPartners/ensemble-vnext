VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this is a defect fix with no PRD, so the audit only checked the code against the TRD); the CI flake going away on GitHub Actions can only be shown by later CI runs; the audit did not re-run the 40-runs-in-a-row loop itself.

# Audit report: custody-test-all-digit-hash-flake

- Date: 2026-11-12
- Audited commit: 5d7c01e75dd46ac28c89be0162ab611a93c66fbe
- TRD: docs/TRD/custody-test-all-digit-hash-flake.md
- PRD: none
- Findings: 4 · applied: 4 · rejected: 0 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/custody-test-all-digit-hash-flake.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this is a defect fix with no PRD, so the audit only checked the code against the TRD); the CI flake going away on GitHub Actions can only be shown by later CI runs; the audit did not re-run the 40-runs-in-a-row loop itself.

Coverage: all 5 verifiers reported. No PRD, so the check against product requirements was skipped. 7 requirements and 2 tasks were indexed.

FIXED THE CITATION
- Non-Goals and FIX-001 "Careful": the two `slice` calls that must stay untouched are now cited at lines 176 and 232 of `custody.test.js` (were 152 and 208). Adding the `tokenOf` helper and its tests moved them down 24 lines.
- Decision and Master Task List (FIX-001): the six deploy-link token sites are now cited at lines 938, 941, 1119, 1126, 1128 and 1135 (were 914, 917, 1095, 1102, 1104 and 1111). Root cause gives both sets, marked pre-fix and now.
- FIX-001 grounding: the deliberate all-digit literals are now cited at lines 1107 and 1135 (were 1083 and 1111). The helper is at line 53 and `setup()` at line 73 (was "around line 48").
- All three resolve in packages/core/lib/custody.test.js. Only descriptive text changed; no objective, criterion or task did.

NO ACTION
- 2 of 2 tasks were built and checked.
- The token-flake fix (FIX-001): the `tokenOf` helper is at line 53, with its own tests at lines 58-70 covering the cases criterion (1) names. No `.slice(0, 8)` or `.slice(0, 9)` remains in the file. The all-digit rule in `custody.js:831` is unchanged, as the Non-Goals require.
- The CLAUDE.md known-open line (FIX-002): `grep -c "flakes on all-digit" CLAUDE.md` prints 0.

REJECTED THESE FINDINGS
- none. All three citation findings were confirmed against packages/core/lib/custody.test.js.

The TRD's Could Not Verify section now lists what is still unproven: the CI-runner outcome, the missing PRD, and the 40-run loop that this audit did not re-run.
