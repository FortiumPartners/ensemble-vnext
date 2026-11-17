# TRD: fix-plan-sizing-delta-and-claims

**Source PRD**: None — small change from the committed brief `docs/plans/fix-plan-sizing-delta-and-claims/brief.md` (reported by Storybook's PM, 2026-11-17)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | When the work builds on a feature merged in the last day or two (read from the base branch's git history), `/plan`'s investigation lists what that predecessor already provides and flags each planned task that rebuilds or re-tests it; with no such predecessor found, nothing is flagged | brief, Expected 1 | yes |
| O2 | Before tasks are written, `/plan` states the change's size as a count of files touched, and when the description's acceptance criteria ask for much more machinery than that size supports, the readout says "the description asks for X beyond the change; kept / cut" and records the decision | brief, Expected 2 | yes |
| O3 | Step 4's weight decision uses the stated size and the delta, so over-specified criteria do not raise the weight by themselves; a criterion the owner marked must-pass is never cut by this rule | brief, Expected 3 | |
| O4 | The vendored `.claude/commands/plan.md` is byte-identical to `packages/core/commands/plan.md` | brief, Where | |

## Intended Change

Before: `packages/core/commands/plan.md` has no size statement and no delta step
(`grep -ciE "beyond the change|already provides" packages/core/commands/plan.md` prints `0`
[ran 2026-11-17]); Step 4 weighs from the investigation alone; the only inflated-input guard is
2f's absorbed-scope rule, which names blockers and audit findings, not the description.

After:
- a new sub-step **2e.1**, directly after 2e's grounding, that (a) states `size: <n> files
  touched` before any task is written, (b) finds a recent predecessor with `git log` on the base
  branch over the touched files, lists what it `already provides`, and flags tasks that rebuild
  or re-test it, and (c) holds the description's own criteria to 2f's suspicion, writing one
  `the description asks for <X> beyond the change; kept / cut` line per item, never cutting a
  must-pass criterion;
- Step 4 gains a paragraph: weigh the §2e.1 size and delta, not the description's list;
- the Readout section says DECISIONS carries those lines.

## Decision

Insert the new step as **2e.1** rather than a new 2h or a renumber: it belongs right after
grounding (the touched-file list it counts comes from 2e), and `§2g` is cited by number in more
than a dozen places that a renumber would break.

The "much more machinery than the size supports" threshold is a model judgment with no formula,
matching Step 4 (OWNER-CALL, brief's open question 1). The stated size is a figure, not a
ceiling: Step 4's "no task-or-file ceiling" sentence stays true. The predecessor is found by
`git log <base branch>` over the touched files; "recent" is a day or two by merge date, no fixed
count (OWNER-CALL, brief's open question 2). A must-pass criterion is never cut by this rule
(OWNER-CALL, brief's Decisions line). The default for a criterion beyond the change is **cut**,
kept only when the change cannot be shown to work without it.

Corrections from the adversarial review, absorbed into how FIX-001 is written (none adds a task):
- "marked must-pass" means the **owner's** marking — the brief or description saying a criterion
  must pass — never the Must pass column `/plan` itself fills in later, so the model cannot
  exempt a criterion by marking it.
- On the spec path (§2g, a source that already lists criteria), scope is locked: a criterion
  beyond the change is reported, never cut.
- The kept/cut lines go in the TRD's `## Decision` (like 2f's per-item lines) as well as the
  readout's DECISIONS.
- 2f can absorb blockers after the size is stated, so Step 4 weighs the size **restated after
  2f**.

Applying the new rule to this TRD itself: size is 3 files touched; no recent predecessor feature
(plan.md's last change, 2026-11-16, was an unrelated feature); the brief's criteria (one prose
test, vendored parity) are within the change, so nothing is beyond it.

## Non-Goals

- No change to `plan-weight.js`, `fix-plan.js` or any library: weight stays a judgment.
- No numeric threshold, no day-count constant.
- No change to 2f's absorbed-scope or audit-finding rules beyond a cross-reference.

## Verification Artifacts

None apply — the change is command prose pinned by a Jest prose test; no screen, data view or flow is involved.

## Open Questions

none — the brief's two open questions were resolved as OWNER-CALLs (see Decision).

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add sub-step 2e.1 (size, predecessor delta, description-criteria check), the Step 4 paragraph and the Readout line to `packages/core/commands/plan.md`; copy it to `.claude/commands/plan.md` | O1, O2, O3, O4 | None | The step-3 grep prints a non-zero count; 2e.1 sits before Step 4 and Step 5; the two files are byte-identical |
| FIX-002 | New Jest prose test `packages/core/commands/plan-sizing-delta-prose.test.js` pinning the new wording and the vendored parity | O1, O2, O3, O4 | FIX-001 | Fails against today's plan.md (no "already provides", no "beyond the change"); passes after FIX-001 |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/commands/plan.md`, `.claude/commands/plan.md`
- **Reuse:** 2f's "suspect the inputs before the work" framing and its per-item counterfactual line format (lines 238-245, 275-280) [read]
- **Replaces:** nothing; Step 4's "no task-or-file ceiling to consult" sentence stays and is qualified, not removed [read]
- **Follow:** the CLAUDE.md prose rules — plain words, name the thing then its id; the vendored copy is a straight `cp` (the two files are identical today) [ran]
- **Careful:** do not renumber 2g (cited as §2g throughout); do not put the example lines in a ```` ```markdown ```` fence starting `# TRD:` (`fix-template.test.js:29` extracts the first such fence), and any ```` ```bash ```` block is syntax-checked by `command-heredocs.test.js`; the `<X>` placeholder in the readout line must survive whitespace normalisation for the test [read]

### FIX-002
- **Touches:** `packages/core/commands/plan-sizing-delta-prose.test.js`
- **Reuse:** `packages/core/commands/plan-design-prose.test.js` (whitespace-normalised `text`, `indexOf` ordering) and `create-design-prose.test.js:16` (byte-identical vendored check) [read]
- **Follow:** `'use strict';`, a one-line header comment naming the TRD [read]; vendored parity is also checked by `verify-command-surface.test.js:65`, kept here as one line because the brief names it [read]
- **Careful:** assert ordering (2e.1 before `## Step 4`), not just presence, so the size is provably stated before tasks [inferred]

## Could Not Verify

- The live check — a `/plan` run on a description that lists extra test suites as criteria reporting the "beyond the change" line — waits on the owner; no fixture run is made here.
