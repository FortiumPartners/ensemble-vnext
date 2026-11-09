VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this defect fix has no PRD, so the code was checked only against its TRD, docs/TRD/fix-design-render-copy-and-state-names.md); the exact EPERM error cannot be reproduced on the Linux CI runner, so CI proves only the mechanism behind it (the setgid bit is no longer copied).

# Audit report: fix-design-render-copy-and-state-names

- Date: 2026-11-08
- Audited commit: b669a2997760cfd84770dd5e051478b3359a7dce
- TRD: docs/TRD/fix-design-render-copy-and-state-names.md
- PRD: none
- Findings: 8 · applied: 8 · rejected: 0 · still unverified: 0 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/fix-design-render-copy-and-state-names.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this defect fix has no PRD, so the code was checked only against its TRD, docs/TRD/fix-design-render-copy-and-state-names.md); the exact EPERM error cannot be reproduced on the Linux CI runner, so CI proves only the mechanism behind it (the setgid bit is no longer copied).

Coverage: all 5 verifiers reported. They checked 6 requirements and 3 tasks against the TRD. Checking against a PRD was skipped because none exists.

FIXED THE CITATION (8 findings, all applied in the TRD's Task Grounding)
- The setgid copy fix (FIX-001): the location of `buildRoot()` and its two `cpSync` lines now reads as main's 326-338/328/331 and the delivered 401-413. `copyTree` is cited at line 373, with its calls at 404 and 407. The test helper `tmp()` moved from line 29 to 31.
- The question-mark state-name fix (FIX-002): the state loop now reads as main's 756/758 and the delivered 830-839. The test-helper range is now 32-50. The "state comes from the target" comment is now 766 on main and 846 delivered. The iframe `src` line in the host page (`HOST_HTML`) moved from 103 to 102.
- One more correction: FIX-002's grounding said the slug strips spaces. The delivered code, the TRD's Decision and test (b) all keep spaces (`is it ok?` becomes `is it ok`). The sentence now says the slug strips `?`, `#`, `%`, `/`, `\` and control characters.

REJECTED THESE FINDINGS
- none. packages/core/lib/design-render.js and design-render.test.js were re-opened, and every citation finding was correct.

NO ACTION
- All 6 requirements are implemented and tested. The copy fix (`copyTree`) has its tests at design-render.test.js:650 and later. The state-name fix (`stateSlug`/`stateSlugs`, plus the encoded iframe `src`) has its tests at :609-643. The vendored copy in .claude/lib/ is byte-identical to the edited library (`diff` is empty).
- The design-render suite was re-run: 60 of 60 tests pass.

Could Not Verify, now rewritten in the TRD:
- The missing PRD, added as a new entry.
- The Linux EPERM limit, kept because this audit did not re-run the macOS reproduction.

STATE
- Round 1 of at most 3. No defects, no test gaps, no uncovered requirements — only 8 citation corrections in the TRD, so nothing chained to a fix run and the feature closes.
- The feature is closed (.trd-state/fix-design-render-copy-and-state-names/closed.json, closed by the audit).

DECISIONS
- none

ISSUES
- none

NEXT
1. Ship it:
   /ship-build docs/TRD/fix-design-render-copy-and-state-names.md
