## Reproduction

### Steps

1. Read `packages/core/commands/implement-trd.md` §8.1 (lines 1793-1838) [read]: the two
   `not run` exits (`prd_resolved: false`, and a resolved source with no
   `success-definition.md`) render `verification-report.md` through `render-report` and record
   `not-run-no-source` / `not-run-no-definition` for Step 9 only. The blocking-policy exit at
   §8.1a step 6 (line 2109) does the same.
2. Search the library and workflow for any writer of `verification-state.json` with a `not-run`
   outcome [ran: `grep -n "not-run" packages/core/lib/functional-verification.js` — only the
   label map and the report's outcome enum]. The only state writers are inside
   `verify-functional.js` (`STEP 4` of the Judge, the Record agent, the state-sync agent), all
   reached only after the `Workflow` call that these exits skip.
3. Read §3.6 step 2-3 (lines 890-926) [read]: the derive agent is `run_in_background: true`,
   its prompt is `<contract text> + <the source> + ...`, nothing records that the dispatch
   happened, and Step 8 treats an absent definition as final.
4. Read `verify-functional.js` `runSetupCheck` (lines 2543-2597) [read]: a first setup verdict
   of `setup-failure` returns its problems at once; only a `refresh` verdict gets a second look.
   The Exercise prompt (lines 654-776) gives no instruction to retry a failing request before
   reporting the environment as the blocker.
5. Search `plan.md` and `implement-trd.md` for a rule against substituting another check for the
   loop [ran: no match for "substitute", "scripted", "instead of the loop"].

### Actual

- After a not-run exit, `.trd-state/<slug>/verification-state.json` does not exist (or holds an
  earlier run's verdicts), so a reader cannot tell "loop skipped, here is why" from "loop never
  reached". Measured by the reporter on dart's plan 2138ce70: 6 of 13 separate `/verify-build`
  runs, 6.2 h of 9.3 h, were spent re-verifying runs whose loop had been skipped.
- A derive agent that was never dispatched (cause A) and one that died read the same at Step 8:
  `not run: no definition produced`, with no second attempt.
- A source of about 740 KB (cause C) could not be dispatched at all.
- One wrong environment diagnosis (cause D: a 401 and schema lag) ended the loop.
- Nothing forbids a session from running a scripted Playwright check plus unit tests in the
  loop's place (cause B).

### Expected

1. The functional-verification loop runs whenever `verification.md` allows it. A scripted
   check (a Playwright script, curl) plus unit tests is never accepted in its place, by
   `/implement-trd` or by `/plan --implement`, and a run that did not run the loop cannot close
   the feature as verified.
2. A loop that does not run says why in the final readout and leaves
   `.trd-state/<slug>/verification-state.json` holding `outcome: "not-run"` and a `reason`
   string; `verification-report.md` names the same reason. An interrupted run's state file
   (`outcome: null`) is never overwritten by such a record.
3. The derive agent's source is passed by file path, never pasted into its prompt, so a source
   of any size (740 KB included) can be dispatched; and a derive pass that never ran, or ran
   and wrote nothing, is retried once before verification is recorded as not run.
4. An environment problem reported by the setup check, or by the Exercise stage, is re-checked
   once — the check run again and the diagnosis re-derived from the actual response — before
   the loop gives up on it.

Root cause [read]: the not-run exits are rendered as report text only, by prose, never as state;
the derive dispatch is fire-and-forget with no record and no size rule; the setup check treats
its first `setup-failure` verdict as final; and no rule states the loop is not substitutable.

