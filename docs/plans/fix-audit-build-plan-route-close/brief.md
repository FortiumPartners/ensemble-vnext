# Brief: /audit-build never closes a /plan-routed feature (a missing PRD counts as an uncovered item)

GitHub issue: FortiumPartners/ensemble-vnext#83.

## Steps
1. Take a feature built through `/plan` (a light TRD, no PRD by design) whose delivered code is clean.
2. Run `/audit-build docs/TRD/<feature>.md` with no PRD supplied.
3. Read the result: 0 defects, 0 test gaps, one uncovered item whose only content is "no source supplied, fidelity and omission unchecked", verdict "proceed with these caveats".
4. `.trd-state/<feature>/closed.json` is not written. The feature stays open until a person runs `/close-feature`. A third audit round cannot change it, so the audit loop also burns its round cap.

Forge saw this on at least eight features on 2026-11-07 (ship-orchestrator-path, init-product-ship-awareness, init-product-autonomous, done-check-merged-branch-tip, design-canvas-viewer and three more).

## Expected
For a plan-route TRD the TRD's own objectives are the source of truth. A missing PRD is a caveat in the verdict, not an uncovered requirement. The audit closes the feature when every TRD objective is covered, and the readout still says validation against product requirements did not run.
A feature that DOES have a PRD, and has an uncovered item, stays open exactly as today.

## Actual
`decide()` in `audit-rounds.js` returns `close: false` whenever `uncovered > 0`. The `validation-audit` verifier, given no PRD, is told to "report that as your single finding and stop", and that finding reaches `tally()` as a `covered: false` item, so `uncovered` is 1 for every PRD-less audit.

## Where
- `packages/core/workflows/audit-build.js:241` (the validation-audit prompt when `PRD` is empty: its single "no PRD supplied" finding becomes an uncovered handoff item).
- `packages/core/workflows/audit-build.js:566-585` (the verdict and CAVEAT line already say "no source supplied"; keep them).
- `packages/core/lib/audit-rounds.js:99-100` (`tally` counts any `covered === false` item as uncovered) and `:166` (`decide` stops on `uncovered > 0`).
- `.claude/lib/audit-rounds.js` is a byte-identical vendored copy of the lib and must be updated with it.
- Tests: `packages/core/lib/audit-rounds.test.js`, `packages/core/workflows/audit-build.test.js`.

## How to check
`npx jest packages/core/lib/audit-rounds.test.js packages/core/workflows/audit-build.test.js` with these new tests, which fail before the fix and pass after:
1. A plan-route audit with no PRD, 0 defects, 0 test gaps, and only the "no PRD supplied" item: `decide()` returns `close: true`, and the verdict keeps the "no source supplied" caveat.
2. A feature WITH a PRD and one genuinely uncovered requirement: `decide()` returns `close: false` (unchanged).
3. A plan-route audit with no PRD and one real uncovered TRD objective: stays open.
4. A plan-route audit with no PRD and a real defect: still chains a fix run.
The vendored `.claude/lib/audit-rounds.js` and `packages/core/lib/audit-rounds.js` stay identical.

## Open questions
None. Decision taken (a routine engineering choice, recorded as the owner's call by Forge): mark the "no PRD supplied" finding as a caveat (not `covered: false`) at its source or in `tally`, rather than adding a special case to `decide()`; the implementer picks the smaller change and keeps the rest of the audit unchanged.

Scope: this fix only. Do not change how a feature with a PRD is audited.
