# Brief: /plan with the implement flag often finishes without running its own functional-verification loop

Reported by Forge's PM (Forge is a customer of Ensemble), measured on dart's plan 2138ce70. A run that should have verified itself ends without the loop, so the orchestrator runs a full /verify-build as the first real verification: 6 of that plan's 13 separate /verify-build runs, 6.2 h of 9.3 h. The run records are on refs/ensemble/records/<slug> in /Users/james/dev/lightning-lane (the repository exists and holds those refs).

## Steps

1. In a project whose verification.md allows the loop, run /plan with the implement flag on a small change; the command chains to /implement-trd, which runs the loop by default.
2. Look at .trd-state/<slug>/ and the final readout after the run.
   Causes seen in dart's plan (feature name, then run):

- A. The session never dispatched the step that writes the success definition (implement-trd Step 3.6, the background derive agent), so no verification-state.json exists (Shared component accessibility fixes, run 23068).
- B. The command chose a scripted Playwright check plus unit tests instead of the loop (Dining plan flow, Show flow, Standby attraction flow). Show flow gave no reason.
- C. Inputs of about 740 KB could not be dispatched inline (Travel flow): the derive agent's prompt carries the source text verbatim.
- D. The environment was reported blocked by a 401 and a schema lag that turned out to be a wrong diagnosis; the loop gave up on it (Grouped add menu rows, run 22854).
- E. A simulator crash on any bottom sheet (Native Other plan and Dining, run 24405). Reported as an environment fact; whether the loop should retry or report it is part of ask 4 below.

## Expected

1. The loop runs whenever verification.md allows it. Choosing a scripted check plus unit tests in its place is not an allowed substitute.
2. A loop that does not run says why in the final readout and leaves .trd-state/<slug>/verification-state.json holding that reason (an outcome of not-run and a reason string).
3. A source too large to put inline in a dispatch prompt is passed to the derive agent by file path, not pasted.
4. An environment problem reported by the setup check or the loop is re-checked (the check run again, once, with the diagnosis re-derived from the actual response) before the loop gives up on it.

## Actual

- implement-trd Step 8.1 (.claude/commands/implement-trd.md around lines 1584-1635): when the derive agent produced no success-definition.md, the step renders "not run: no definition produced" through render-report into verification-report.md and records not-run-no-definition for the banner. It writes no verification-state.json, so a later /verify-build or the PM cannot tell a skipped loop from a loop never reached. The same is true of the not-run-no-source exit.
- Step 3.6 (around lines 697-870) dispatches the derive agent fire-and-forget with the source pasted into the prompt; nothing checks later that the dispatch happened, and nothing handles a source too large for a prompt.
- The /plan path passes the implement hand-off no rule that substitutes for the loop (fix-plan.js line 170 passes the TRD path and the verify flag), so choice B comes from the session, not from a configured skip. No text in plan.md or implement-trd.md forbids replacing the loop with a scripted check.
- Cause D and E: the setup check inside the loop reports problems; nothing re-checks a reported block before the loop ends with setup-failure.

## Where

- .claude/commands/implement-trd.md:697 (Step 3.6, the derive dispatch) and :1584 (Step 8.1, the two not-run exits); the matching source under packages/core/commands/implement-trd.md.
- .claude/commands/plan.md:1100-1200 (the chain to /implement-trd) for the rule that the loop is not replaced.
- .claude/lib/functional-verification.js (state writing and render-report) for writing verification-state.json with a not-run reason; its tests sit beside it under packages/core.
- The setup check and its give-up path in the verification workflow (verify-functional) for the single re-check before setup-failure.

## How to check

- Jest: a test of the library function that writes the not-run state: given outcome not-run and a reason, it writes verification-state.json with both, and render-report output names the same reason. Fails now because no such state write exists for the not-run exits.
- BATS or a prose check over implement-trd.md: Step 3.6 names passing the source by file path above a stated size, and Step 8.1 writes the state file on both not-run exits. Fails now (neither text exists).
- Live, in a fixture slot as verification.md section 1 allows: a /plan run with the implement flag on a small change ends with the loop run or with a verification-state.json whose reason says why not.

## Open questions

- What size counts as "too large for inline"? Assumption: pass any source over 100 KB by file path; the number is the implementer's to set and record.
- Cause E (a simulator crash) may be the project's environment, not Ensemble's; assumption: the fix covers only the re-check and the readout, not simulator recovery.
- The records for runs 23068, 22854 and 24405 were not read here; the causes are as Forge's PM reported them.

Decisions: the size threshold for passing a source by file, and the single re-check rule: the engineer's call, recorded as OWNER-CALLs (owner's call, default taken, 2026-11-17).
