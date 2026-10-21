VERDICT: proceed with these caveats: the CI gate script ignores the `--root <dir>` flag the TRD specifies and passes silently when it is given (AVAIL-P001); no test proves the chat route hides a stale or missing availability board (AC-F1.4, AVAIL-B005); eval Tier B has not been run against the changed decider prompt, and no task in the TRD owns that run (AC-F6.4 / NFR-5); seven claims in Could Not Verify depend on production data, captured Disney responses, or code outside this TRD's files.

# Audit report: availability-consolidation

- Date: 2026-10-20
- Audited commit: 5d28b174c
- TRD: docs/TRD/availability-consolidation.md
- PRD: docs/PRD/availability-consolidation.md
- Findings: 9 · applied: 1 · rejected: 2 · still unverified: 8 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/availability-consolidation.md    PRD: docs/PRD/availability-consolidation.md

VERDICT: proceed with these caveats: the CI gate script ignores the `--root <dir>` flag the TRD specifies and passes silently when it is given (AVAIL-P001); no test proves the chat route hides a stale or missing availability board (AC-F1.4, AVAIL-B005); eval Tier B has not been run against the changed decider prompt, and no task in the TRD owns that run (AC-F6.4 / NFR-5); seven claims in Could Not Verify depend on production data, captured Disney responses, or code outside this TRD's files.

Audit coverage: all 5 checkers reported. 30 requirements and 10 tasks were indexed against docs/PRD/availability-consolidation.md v1.2.1.

TRACEABILITY GAPS
- AC-F1.4, the chat route (task AVAIL-B005). `resolveLlTipboardExperiences` correctly drops any board that is not fresh (`apps/web/app/api/agent/chat/route.ts:464`). The function is private, though, and no test drives it. The only related test, `llTipboard.test.ts`, checks how the block renders when it is handed `undefined`. It does not check that the route passes `undefined`. AVAIL-B005 covers this, so it is /implement-trd --reconcile work. It was not handed off on this run.
- AC-F6.4 / NFR-5 / AC-N5: eval Tier B passes before merge. The golden runner was updated (`deciderRunner.ts` emits `tipboardBoards`), but nothing shows a run. AVAIL-T002 still appears in the TRD's session plan (§5.2:572) and its test table (§6.1:623), but the replay removed it from the task list and `implement.json` has no T-tasks. No task covers it, so it is recorded here and not closed. Deciding how to cover it is a design decision for the owner. Per process.md it is a CI-required check on the `main` PR anyway.

MISMATCH
- AVAIL-P001, the CI gate. TRD §3.5 says `scripts/check-tipboard-reader.ts` accepts `--root <dir>`. The delivered script reads only a bare positional argument (`process.argv[2]`, :122), and it skips any root that does not exist. I reproduced the result: `--root scripts/__tests__/fixtures/tipboard-gate/violating` prints OK and exits 0. The same tree passed positionally exits 1. CI calls the script with no argument, so the CI gate itself is correct today. The risk is that a mistyped root or a spec-style invocation fails open. This is /implement-trd --reconcile work, not handed off on this run.

UNTESTED-IN-PRACTICE
- AVAIL-B007, the eval mock adapter. It does emit the new response shape (`board`, `availability`, no `partyEligibility` / `cachedAt`; `mockAdapter.ts:323-337`). `mockAdapterAvailability.test.ts` tests only the catalog helpers and asserts nothing about that shape. This is minor and covered by AVAIL-B007, so it is /implement-trd --reconcile work, not handed off on this run.

CITATIONS NOT FIXED (they are outside the Could Not Verify section, so this step does not edit them)
- TRD §3.5:493 names fixture `violating/packages/workers/src/decisioning/planted.ts`. The real file is `violating/packages/workers/src/rawRead.ts`.
- TRD AVAIL-B005 grounding (:812) cites "NG-5/D15". The PRD's NG5 is about modifying the mock, not stale data, so the reference is wrong in content as well as format. D15 alone is the intended reference.

REJECTED THESE FINDINGS
- NG9, the guard added around the history writers' call. The finding says the PRD does not authorise it. It does not need to: the owner ruled on exactly this as OQ-3 on 2026-09-24, and the TRD records that ruling in the Open Questions table (line 703, "skip the call on an unknown board; the writer bodies stay untouched") and in D14. The writer bodies are unchanged (`DecisioningPipeline.ts:2684`).

NO ACTION
- AVAIL-B009: `AvailabilityStore.ts`, its test and `STSR_B004_avint_fidelity.test.ts` are missing because the task deleted them, as required.
- None of the other indexed requirements raised a finding.

COULD NOT VERIFY (rewritten in the TRD)
- Removed the `computeWakeHash` row. Its premise ("needs no change") turned out false: the delivered fix changed the hash. The test the row asked for exists and passes (`wakeHash.test.ts:737`, 50/50).
- Kept seven rows: four production data checks (tier, llType, parkId, disneyGuestId), the completeness of Disney's bundle response, the absent-from-fresh rate from production logs, and the in-trip screen trace.
- Added the PRD's sweep-cadence row, which this audit did not re-measure. Each kept row now says why it was out of scope.

NEXT
1. Close the CI gate flag mismatch and the two test gaps:
```
/implement-trd docs/TRD/availability-consolidation.md --reconcile
```
2. Decide who owns eval Tier B before merge: run it on the PR per `docs/runbooks/eval-gates.md`, or add a task for it.
