# Functional Success Definition: fix-plan-sizing-delta-and-claims

**Source**: docs/TRD/fix-plan-sizing-delta-and-claims.md §Intended Change
**Source kind**: intended-change
**Derived**: 2026-11-17T17:57:07Z
**Criteria**: 9

Line numbers in `Cites` refer to the extracted §Intended Change text as handed to the deriver
(line 2 opens "Before:", line 7 is "After:", lines 8-13 are the first After bullet, line 14 the
Step 4 bullet, line 15 the Readout bullet). FS-1 and FS-8 are text checks on the prompt alone;
FS-2 to FS-6 are behaviour checks, which need a live `/plan` session (the `fixtures`
environment in `verification.md` §1); FS-7 and FS-9 need both, a prompt check and the FS-6
run's output. No criterion carries a `Parts`
count: the source states none. A criterion carrying a `Parts` count could not pass
incrementally; that limit does not arise here.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | `packages/core/commands/plan.md` has a sub-step 2e.1 placed directly after 2e's grounding and before any task-writing step (2f onward) | §Intended Change lines 8-9 ("a new sub-step **2e.1**, directly after 2e's grounding") | `grep -nE '2e\b\|2e\.1\|2f' packages/core/commands/plan.md` output showing the 2e heading, then 2e.1, then 2f, in that line order | [read] | locator | | |
| FS-2 | A `/plan` run states the change's size as `size: <n> files touched` before any task is written, and the prompt's 2e.1 instructs it | §Intended Change lines 8-9 ("states `size: <n> files touched` before any task is written"); line 2-3 (before: "no size statement") | Transcript of a headless `/plan` session in a fixture repo, showing the `files touched` line ahead of the first written task (and ahead of the TRD's task list); plus `grep -n 'files touched' packages/core/commands/plan.md` | [read] | locator | | O2 |
| FS-3 | When the base branch's `git log` over the touched files shows a recent predecessor, `/plan` lists what that predecessor `already provides` | §Intended Change lines 10-11 ("finds a recent predecessor with `git log` on the base branch over the touched files, lists what it `already provides`") | Transcript of a fixture `/plan` run in a repo whose base branch carries a just-merged commit over the files the described change touches, showing an `already provides` list naming that commit's contribution | [read] | locator | | O1 |
| FS-4 | In that same predecessor case, each planned task that rebuilds or re-tests what the predecessor provides is flagged as such | §Intended Change lines 11-12 ("flags tasks that rebuild or re-test it") | The FS-3 transcript (or the TRD it wrote), with a flag line attached to the task that duplicates the predecessor's work, the task named | [read] | locator | | O1 |
| FS-5 | When no recent predecessor is found on the base branch over the touched files, no task is flagged as rebuilding or re-testing one | domain-derived: the flag in lines 11-12 is conditional on a predecessor being found; a delta step that flags tasks with no predecessor would invent duplicated work and push the plan to cut real tasks | Transcript of a fixture `/plan` run in a repo with no recent commit over the touched files, showing the predecessor search came back empty and no rebuild/re-test flag appears | domain-derived | locator | | O1 |
| FS-6 | When the description's own acceptance criteria ask for machinery beyond the change, `/plan` writes one `the description asks for <X> beyond the change; kept / cut` line per such item, holding the description to 2f's suspicion | §Intended Change lines 12-13 ("holds the description's own criteria to 2f's suspicion, writing one `the description asks for <X> beyond the change; kept / cut` line per item"); lines 4-5 (before: 2f "names blockers and audit findings, not the description") | Transcript of a fixture `/plan` run whose description carries criteria well beyond its small change, showing one `beyond the change;` line per inflated item, each ending `kept` or `cut` | [read] | locator | | O2 |
| FS-7 | A description criterion that is must-pass is never cut by that step: its line reads `kept`, and the prompt says so | §Intended Change line 13 ("never cutting a must-pass criterion") | `grep -n -i 'must-pass' packages/core/commands/plan.md` showing the never-cut rule inside 2e.1; where the FS-6 run's description marks a criterion must-pass, its `beyond the change` line ending `kept` | [read] | locator | | |
| FS-8 | Step 4 of `plan.md` carries a paragraph telling the planner to weigh the §2e.1 size and delta, not the description's list | §Intended Change line 14 ("Step 4 gains a paragraph: weigh the §2e.1 size and delta, not the description's list"); line 3-4 (before: "Step 4 weighs from the investigation alone") | The Step 4 section of `packages/core/commands/plan.md`, quoted, containing a reference to `2e.1` and the instruction not to weigh from the description's list | [read] | locator | | |
| FS-9 | The Readout section of `plan.md` says DECISIONS carries the `kept / cut` lines, and a run's readout DECISIONS section shows them, recording the decision | §Intended Change line 15 ("the Readout section says DECISIONS carries those lines") | `grep -n` of the Readout section of `packages/core/commands/plan.md` naming DECISIONS and the `beyond the change` lines; plus the FS-6 run's closing readout with the line under its DECISIONS heading | [read] | locator | | O2 |

The before-state measurement in line 2-4 (`grep -ciE "beyond the change|already provides"
packages/core/commands/plan.md` prints `0`) is the baseline FS-3, FS-6 and FS-9 move off; it is
not a separate criterion because each of those rows already requires the phrases to appear.
