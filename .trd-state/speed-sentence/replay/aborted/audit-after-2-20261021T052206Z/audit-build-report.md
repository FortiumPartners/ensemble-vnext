VERDICT: do not proceed until the availability-consolidation work is built — none of its 10 tasks (AVAIL-B001 to B009, AVAIL-P001) exists in the tree, and the eval Tier B gate (AC-F6.4, NFR-5) has no task covering it

# Audit report: availability-consolidation

- Date: 2026-10-20
- Audited commit: fc2b4fb4d
- TRD: docs/TRD/availability-consolidation.md
- PRD: docs/PRD/availability-consolidation.md
- Findings: 59 · applied: 1 · rejected: 5 · still unverified: 8 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/availability-consolidation.md    PRD: docs/PRD/availability-consolidation.md

VERDICT: do not proceed until the availability-consolidation work is built — none of its 10 tasks (AVAIL-B001 to B009, AVAIL-P001) exists in the tree, and the eval Tier B gate (AC-F6.4, NFR-5) has no task covering it

STATE
- This was round 1, a report-only audit at commit fc2b4fb4d. Nothing was recorded as a round and nothing was handed to /implement-trd.
- Nothing from this TRD has been built. `git diff e04cfe0ed HEAD` is empty for packages/, apps/, scripts/ and .github/, and .trd-state/availability-consolidation/ held no implementation state.
- All 5 of 5 checkers reported. 30 PRD requirements (PRD 1.2.1) and 10 TRD tasks were indexed. 59 findings came back: 5 rejected, 1 applied (the Could Not Verify rewrite), and 8 claims still unverified.
- The TRD's `## Could Not Verify` section was rewritten. All 8 rows are still open, and each now gives its reason. That edit is in the working tree and has not been committed.

DECISIONS
- Two requirements the checkers called "mismatch" (AC-F3.1, AC-F3.3) are filed as unbuilt instead. The code they point at is untouched base code, not delivered code.
- The rewrite of Could Not Verify replaced the 2026-09-24 audit paragraph and the "Verified and removed in 1.1.0" history paragraph. The facts in them are still true at HEAD and were restated briefly. To keep the older text, restore it with `git diff`.

ISSUES
  MISSING IMPLEMENTATION (a task in the TRD covers each item; this is work for `/implement-trd --reconcile`, and nothing was handed off on this run)
  - The shared tipboard reader, with fresh, stale and missing states, its 240 s stale constant, and loud logging during park hours (AC-F1.1, AC-F1.4, AC-F1.5; AVAIL-B001). packages/shared/src/availability does not exist.
  - Every raw `tipboard:` reader moved onto that reader (AC-F1.2; B002, B003, B005, B006). The broken raw read at HeldLLReconciler.ts:746-757 is still there.
  - The CI gate against raw reads, with a planted-violation test (AC-F1.3; AVAIL-P001). scripts/check-tipboard-reader.ts does not exist.
  - The engine context changes: `tipboardBoards`, dispatching a want when availability is unknown, and the guard on history writers (NFR-1, NFR-2 via AC-F1.5, NFR-3, AC-F6.2; B002, B003).
  - The availability route rewrite (AC-F3.1-3.3, AC-F4.1-4.4, AC-F5.1-5.2, AC-F7.1-7.3; AVAIL-B004). availability.ts still calls getGuestEligibility (:371) and still uses the availboard: and bundle: caches (:136, :175). preArrivalSelectable still includes the capacity check (:438).
  - The chat booking prefetch handling "unknown", plus a new-shape test that replays the 2026-08-25 pre-arrival case (AC-F4.5, AC-F3.4; AVAIL-B007). The prefetch still sends fresh=true (:304).
  - The decider context listing available, unavailable and unknown separately (AC-F6.1, AC-F6.3; AVAIL-B008). buildDeciderContext.ts:255-257 still prints a bare count.
  - Deleting AvailabilityStore (AC-F7.4; AVAIL-B009). The file is still present.
  TRACEABILITY GAPS (no task covers these. They are recorded here, not closed, and how to cover them is the owner's design call)
  - The eval Tier B pass required before merge (AC-F6.4, NFR-5). Its task, AVAIL-T002, is missing from this copy of the TRD.
  - The live-check half of AC-F1.4. Its task, AVAIL-T001, is also missing.
  REJECTED THESE FINDINGS
  - AC-F1.6 (both copies). The PRD verifies this by reviewing the TRD, and the TRD already sets the 240 s threshold from measured sweep cadence (docs/TRD/availability-consolidation.md D3, line 128).
  - Four findings checked against the wrong feature: the AC-F1.2 WorldModelLoader mismatch, the AC-F1.5a tautological-test finding, the USB-B003 citation, and LSA-B011 cancellationReason. They cite docs/PRD/ll-state-authority.md and docs/TRD/ll-state-authority.md. None of those ids appears in this TRD or PRD.
  - Cause of those four: .trd-state/current.json still points at ll-state-authority, so a checker read that feature's documents.
  NO ACTION
  - NFR-4 (packages/mock left untouched) holds, because no code changed at all.

NEXT
1. Add tasks to the TRD that cover the eval Tier B gate and the live check for AC-F1.4, or restore AVAIL-T001 and AVAIL-T002.
2. Build the feature:
```
/implement-trd docs/TRD/availability-consolidation.md
```
