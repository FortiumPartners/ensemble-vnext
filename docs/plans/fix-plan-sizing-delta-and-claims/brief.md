# Brief: /plan over-sizes work that builds on a recent feature, and builds machinery the change does not need

Reported by Storybook's PM (Storybook is a customer of Ensemble). A prompt-only change (cover art direction plus model-lettered title, built on a feature merged the same morning) came out of /plan with the implement flag as an 18-task TRD with adversarial review and audit. After the owner's cut, the same /plan rewrote it as 4 tasks reusing the predecessor's tests. Most of the cause was an over-specified description: it listed mechanisms and test suites as acceptance criteria and /plan took them as requirements.

## Steps

1. Read Step 4 of packages/core/commands/plan.md ("Decide the weight", about lines 489-526): the weight is a judgment from the investigation, with no size figure stated before tasks are written.
2. Read 2f (about lines 250-284): "If absorbing scope pushes the weight up, suspect the inputs before the work" covers scope absorbed from a blocker or an audit. Nothing in plan.md applies the same suspicion to the description's own acceptance criteria, and nothing asks what a feature merged in the last day or two already provides.
3. `grep -ciE "beyond the change|already provides" packages/core/commands/plan.md` prints 0 today.

## Expected

1. When the work builds on a feature merged in the last day or two, the investigation sizes the delta against it: it lists what the predecessor already provides (tests, fallbacks, judges) and flags any planned task that rebuilds or re-tests it. "Last day or two" is read from the predecessor's merge date in git history; where none is found, nothing is flagged.
2. Before tasks are written, /plan states a size as a count of files the change touches. When the description's acceptance criteria ask for much more machinery than that size supports, the readout says so in plain words ("the description asks for X beyond the change; kept / cut") and records the kept or cut decision, instead of building the extra machinery silently.
3. The weight decision (Step 4) uses the stated size and the delta, so criteria the description over-specified do not raise the weight by themselves. A criterion the owner marked must-pass is never cut by this rule.

## Actual

- Step 4 has no size statement and no delta step; weight comes from the investigation alone, so over-specified criteria carry straight into the task list and the weight.
- The only inflated-input guard in plan.md is the absorbed-scope rule in 2f, which names blockers and audit findings, not the description.
- Seen on Storybook's cover-art change: 18 tasks, then 4 after the owner's cut.

## Where

- packages/core/commands/plan.md: Step 2 (a delta sub-step beside 2e/2f, about line 210) and Step 4 (about lines 489-526); the vendored copy .claude/commands/plan.md must match.
- A prose test beside packages/core/commands/plan-design-prose.test.js pins the new wording.

## How to check

- Jest prose test (new file, same pattern as plan-design-prose.test.js): plan.md contains a delta-against-a-recent-predecessor step, the stated files-touched size before tasks, and the "the description asks for ... beyond the change; kept / cut" readout line; the vendored .claude/commands/plan.md matches the package copy. Fails now: the step 3 grep above prints 0.
- Live check (waits on the owner): a /plan run on a description that lists extra test suites as acceptance criteria reports the "beyond the change" line. No such fixture run was made here.

## Open questions

- "Much more machinery than the size supports" has no number. Assumption: judged by the model, like the weight decision, with no formula; the test pins the wording only.
- Reading the predecessor's merge date from git history needs a rule for features merged elsewhere. Assumption: look at git log on the base branch for the feature's files; no fixed day count beyond "a day or two".

Decisions: the judgement threshold, the predecessor lookup and that must-pass criteria are never cut: the engineer's call, recorded as OWNER-CALLs (owner's call, default taken, 2026-11-17).
