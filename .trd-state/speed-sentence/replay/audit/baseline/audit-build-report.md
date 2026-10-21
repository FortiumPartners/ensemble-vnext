VERDICT: proceed with these caveats: the eval Tier B run required before merge (AC-F6.4 / NFR-5) has not happened, and no task in the TRD's task list covers it; the live end-to-end check (AVAIL-T001) has not run; 7 production-data claims in Could Not Verify are still unchecked (tier, llType, parkId and guest-id population, bundle completeness, how often a fresh board omits a wanted experience, the mobile in-trip screen trace).

# Audit report: availability-consolidation

- Date: 2026-10-20
- Audited commit: 44a2cd4e1
- TRD: docs/TRD/availability-consolidation.md
- PRD: docs/PRD/availability-consolidation.md
- Findings: 5 · applied: 1 · rejected: 1 · still unverified: 9 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/availability-consolidation.md    PRD: docs/PRD/availability-consolidation.md

VERDICT: proceed with these caveats: the eval Tier B run required before merge (AC-F6.4 / NFR-5) has not happened, and no task in the TRD's task list covers it; the live end-to-end check (AVAIL-T001) has not run; 7 production-data claims in Could Not Verify are still unchecked (tier, llType, parkId and guest-id population, bundle completeness, how often a fresh board omits a wanted experience, the mobile in-trip screen trace).

Coverage: 5 of 5 verifiers reported. PRD docs/PRD/availability-consolidation.md was supplied. 37 requirements and 10 tasks were indexed. All 10 delivered tasks (AVAIL-B001..B009, AVAIL-P001) are `success` in implement.json.

MISSING IMPLEMENTATION
- Eval Tier B for the changed decider context (AC-F6.4, NFR-5, PRD AC-N5). `buildDeciderContext.ts` now renders unavailable and unknown states, and `packages/chat/evals/deciderRunner.ts:328` feeds the evals `tipboardBoards`, but no Tier B result exists anywhere. Its task (AVAIL-T002) appears only in §5.2's session list; the replay removed its task block, so no task in §4 covers it. This is reported here, not closed. It is a paid, owner-gated merge check: the owner decides whether to run it, per docs/runbooks/eval-gates.md §Tier B.

UNTESTED-IN-PRACTICE
- The live end-to-end check (AVAIL-T001) and the eval check (AVAIL-T002) are cited in TRD §5.2, §5.4, §5.5 and §6.1 but have no implement.json entry, because neither was ever dispatched. Both citations resolve to §5.2's session lines, but neither task is in the §4 Master Task List. Nothing was fixed: this step edits only Could Not Verify. Both are now recorded there as rows. Related: TRD objective Q-2 cites `verification_level: live-required`, but `.claude/rules/constitution.md` in this repo says `unit-only`. That mis-citation is outside this step's edit scope.

REJECTED THESE FINDINGS
- AC-F1.2, the raw `tipboard:` read in `scripts/probes/mod-offer-concurrency.mjs:82`. The read exists and the gate skips `scripts/`, but that scope was the owner's choice: TRD OQ-10 (owner, 2026-09-24, "app code only, not scripts or probes") and D7's rejected alternative ("seed/probe tooling is not a product read path"). This is an ops probe, not a product consumer. It also parses the current `{experiences, sweptAt}` shape correctly. No action.

NO ACTION
- The other 34 indexed requirements: implemented, tested and sourced. No verifier raised a gap against them.
- Could Not Verify rewritten in docs/TRD/availability-consolidation.md. Removed the `computeWakeHash` row: `packages/workers/src/decisioning/engine/__tests__/wakeHash.test.ts:455-470` proves the hash changes when a board goes stale, and the file passes (49/49, run today). Added rows for Tier B and the live end-to-end check. Kept 7 rows that need production data, captured Disney bodies or live logs, which this offline sandbox cannot reach.

NEXT
1. Owner decides whether to run eval Tier B before merging (the command is in the TRD's Could Not Verify row).
2. To restore the Phase 4 tasks to the task list, run:
```
/refine-trd docs/TRD/availability-consolidation.md
```
