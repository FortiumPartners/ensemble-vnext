# TRD: fix-audit-build-plan-route-close

**Source PRD**: None — defect (GitHub issue FortiumPartners/ensemble-vnext#83), feature F-1 of workplan fix-audit-build-plan-route-close

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A plan-route audit with no PRD, 0 defects, 0 test gaps and only the no-PRD item closes the feature, and the verdict keeps the "no source supplied" caveat | issue #83, acceptance (1) | yes |
| O2 | A feature WITH a PRD and an uncovered requirement stays open | acceptance (2) | yes |
| O3 | A no-PRD audit with a real uncovered TRD objective stays open | acceptance (3) | yes |
| O4 | A no-PRD audit with a real defect still chains a fix run | acceptance (4) | yes |
| O5 | `.claude/lib/audit-rounds.js` stays identical to `packages/core/lib/audit-rounds.js` | acceptance (5) | yes |

## Reproduction

### Steps
Tally a handoff holding only the item the validation verifier returns when no PRD is supplied (check `validation`, `covered: false`), then call `decide()` on the counts.
### Actual
`tally` counts it as `uncovered: 1`; `decide()` returns `close: false` while uncovered > 0, so `closed.json` is never written. Root cause `[ran]`: `tally` (`audit-rounds.js`) treats every `covered:false` item as an uncovered requirement; the no-PRD finding has no marker that tells it apart.
### Expected
The no-PRD item is a note; the verdict (capped at "proceed with these caveats: no source supplied") carries the caveat; the audit closes.

## Decision

Mark the finding at its source with a new action `no-source` (the smaller change the owner's call allows) and have `tally`/`classify` treat that action as a note, exactly as `fix-citation` already is. NOT a "no PRD" flag threaded through `tally` and the `/audit-build` command: that needs a new input on every call site. A real uncovered requirement carries a different action, so it still counts as uncovered.

## Non-Goals

No change to the verdict wording, to `decide()`, or to how a PRD-backed audit counts uncovered items.

## Verification Artifacts

None apply — prompt and library change covered by Jest.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `no-source` to the workflow's ACTIONS, the validation no-PRD prompt and the reconcile handoff text; make `classify`/`tally` treat it as a note; sync the vendored copies | O1, O5 | None | `tally([{action:'no-source',check:'validation',covered:false}])` gives `uncovered: 0, notes: 1`; the two `audit-rounds.js` copies are byte-identical |
| FIX-002 | Add tests for the four decision cases and the workflow prompt | O1, O2, O3, O4 | FIX-001 | The new `no-source` describe block and the workflow test pass, and fail if `classify` ignores `no-source` |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/audit-rounds.js`, `packages/core/workflows/audit-build.js`, `.claude/lib/audit-rounds.js`, `.claude/workflows/audit-build.js`
- **Reuse:** the `fix-citation` handling in `classify` and `tally` [read]
- **Replaces:** the single-finding "no PRD" prompt that gave no marker [read]
- **Follow:** the existing ACTIONS list and note-class pattern [read]
- **Careful:** the `.claude` copies must stay identical to `packages/core` [ran]

### FIX-002
- **Touches:** `packages/core/lib/audit-rounds.test.js`, `packages/core/workflows/audit-build.test.js`
- **Reuse:** the `rounds()` helper and `makeAgentStub` [read]
- **Replaces:** nothing
- **Follow:** the existing `tally` and `decide` test style [read]
- **Careful:** each test must be able to fail if `no-source` were not special-cased [ran]

## Could Not Verify

The live reconcile agent's compliance with the new prompt wording (it must return the no-PRD item with action `no-source`) is not exercised here; only the deterministic counting is tested.
