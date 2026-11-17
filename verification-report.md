# Functional Verification Report: fix-plan-sizing-delta-and-claims

**Source PRD**: docs/TRD/fix-plan-sizing-delta-and-claims.md § Intended Change
**Success definition**: .trd-state/fix-plan-sizing-delta-and-claims/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 9 total — 9 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 9 of 9 proven — uncovered: none
**Must pass**: 6 of 6 proven
**Next**: close the feature — the command that ran this check closes it when an audit has already passed (its readout says whether it did); otherwise run `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `packages/core/commands/plan.md` has a sub-step 2e.1 placed directly after 2e's grounding and before any task-writing step (2f onward) | .trd-state/fix-plan-sizing-delta-and-claims/evidence/fs1-grep.txt | 1 |
| FS-2 | A `/plan` run states the change's size as `size: <n> files touched` before any task is written, and the prompt's 2e.1 instructs it | .trd-state/fix-plan-sizing-delta-and-claims/evidence/live/run1-trd.md | 1 |
| FS-3 | When the base branch's `git log` over the touched files shows a recent predecessor, `/plan` lists what that predecessor `already provides` | .trd-state/fix-plan-sizing-delta-and-claims/evidence/live/run1-trd.md | 2 |
| FS-4 | In that same predecessor case, each planned task that rebuilds or re-tests what the predecessor provides is flagged as such | .trd-state/fix-plan-sizing-delta-and-claims/evidence/live/run1-trd.md | 1 |
| FS-5 | When no recent predecessor is found on the base branch over the touched files, no task is flagged as rebuilding or re-testing one | .trd-state/fix-plan-sizing-delta-and-claims/evidence/live/run2-trd.md | 1 |
| FS-6 | When the description's own acceptance criteria ask for machinery beyond the change, `/plan` writes one `the description asks for <X> beyond the change; kept / cut` line per such item, holding the description to 2f's suspicion | .trd-state/fix-plan-sizing-delta-and-claims/evidence/live/run1-trd.md | 1 |
| FS-7 | A description criterion that is must-pass is never cut by that step: its line reads `kept`, and the prompt says so | .trd-state/fix-plan-sizing-delta-and-claims/evidence/live/run1-trd.md | 1 |
| FS-8 | Step 4 of `plan.md` carries a paragraph telling the planner to weigh the §2e.1 size and delta, not the description's list | .trd-state/fix-plan-sizing-delta-and-claims/evidence/fs8-step4.txt | 1 |
| FS-9 | The Readout section of `plan.md` says DECISIONS carries the `kept / cut` lines, and a run's readout DECISIONS section shows them, recording the decision | .trd-state/fix-plan-sizing-delta-and-claims/evidence/live/run1-transcript.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

