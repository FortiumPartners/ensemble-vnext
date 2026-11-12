VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; a live /ship-build filing against a real tracker was not exercised (the seam test stubs the tracker); the issue #113 class split (about 12 product / 9 host or tooling / 7 paperwork / 9 not-verifiable) traces to an unread issue #105 in the product repo

# Audit report: rank-follow-ups-product-first

- Date: 2026-11-11
- Audited commit: 77aecb7ef2c59f82d3f42bc81267504fcec512e4
- TRD: docs/TRD/rank-follow-ups-product-first.md
- PRD: none
- Findings: 4 · applied: 4 · rejected: 0 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/rank-follow-ups-product-first.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; a live /ship-build filing against a real tracker was not exercised (the seam test stubs the tracker); the issue #113 class split (about 12 product / 9 host or tooling / 7 paperwork / 9 not-verifiable) traces to an unread issue #105 in the product repo

Scope of this audit: all 5 verifiers reported. 12 requirements and 3 tasks were checked against the delivered code and tests. No PRD was supplied, so the check against product requirements did not run. The audit only checked that the code matches this TRD (docs/TRD/rank-follow-ups-product-first.md).

FIXED THE CITATION
- FIX-001's grounding cited the line where `discovered.readAll` is defined as discovered.js:603. That line is the start of its doc comment; the definition is at line 609. Corrected to :609.
- FIX-001's grounding cited the `record` status-validation pattern (`VERIFICATION_STATUSES.includes(entry.status)`) at discovered.js:525. It is at line 520. Corrected to :520.
- FIX-002's grounding cited the `describe('the after-shipping primitives')` block at ship-primitives.test.js:546. It is at line 544. Corrected to :544.
I re-opened packages/core/lib/discovered.js and packages/core/contracts/ship-primitives.test.js and confirmed each line before editing. Only the line numbers changed; no objective, acceptance criterion or task text was touched.

NO ACTION
- 12 of 12 requirements are implemented and tested against the TRD, with no gaps, mismatches or weak tests found. That covers the five rank classes with a fallback from the summary prefix for legacy rows (O1), filing in rank order (O2) and the readout order (O3).

Could Not Verify, rewritten in the TRD. It now holds three entries: no PRD supplied; the issue #113 class split traced to unread issue #105 (I confirmed in the code that nothing in this repo sets `rankClass` yet, so `host` rows appear only when a recorded rankClass sets them); and no live run against a real tracker.

REJECTED THESE FINDINGS
- none
