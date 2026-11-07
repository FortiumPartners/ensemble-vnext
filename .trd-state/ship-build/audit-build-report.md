VERDICT: do not proceed until the sequencer stops a run when a step outside a `repeat` block records a non-success result. Today a failed CI wait moves the run straight on to `merge` (AC-F3.2, SHIP-B015). Caveats once that is fixed: four requirements are built but have no test (template has no active step, tracker section, tracker use, no-tracker path); planned, not built yet: SHIP-T002 -- the owner's live proof on a throwaway GitHub repo, which needs the owner, a real remote, CI, a reviewer bot and a release target, so it cannot run unattended; 13 Could Not Verify rows need a live remote, a fixture session or the owner.

# Audit report: ship-build

- Date: 2026-11-07
- Audited commit: dc727fd90804f92eab02dd434b81f039e42d367b
- TRD: docs/TRD/ship-build.md
- PRD: docs/PRD/ship-build.md
- Findings: 11 · applied: 1 · rejected: 3 · still unverified: 13 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/ship-build.md    PRD: docs/PRD/ship-build.md

VERDICT: do not proceed until the sequencer stops a run when a step outside a `repeat` block records a non-success result. Today a failed CI wait moves the run straight on to `merge` (AC-F3.2, SHIP-B015). Caveats once that is fixed: four requirements are built but have no test (template has no active step, tracker section, tracker use, no-tracker path); planned, not built yet: SHIP-T002 -- the owner's live proof on a throwaway GitHub repo, which needs the owner, a real remote, CI, a reviewer bot and a release target, so it cannot run unattended; 13 Could Not Verify rows need a live remote, a fixture session or the owner.

MISMATCH (chains to /implement-trd --reconcile)
- A failed CI wait does not stop the run (AC-F3.2; tasks SHIP-B015 sequencer, SHIP-B013 command). AC-F3.2 says a step starts only after the previous one recorded success. In `packages/core/lib/ship-sequencer.js`, `record()` (about lines 611-655) advances on any result the contract declares whenever the step is outside a `repeat`. I reproduced it with a scratch ship.md of push, open-pr, wait-ci, merge: recording `wait-ci failed` moved the cursor to `merge`. Only the authorization gate then refused it ("not authorized: merge"). In a project that carries the authorization sentence, the PR would merge with CI red. The end-of-run review logged this as blocking in `.trd-state/ship-build/discovered.jsonl` (`[review:high]`, blocksFeature true). No row resolves it. The fix needs a design choice, which belongs to the reconcile pass: either reject at parse a `wait-ci` that sits outside a repeat, or stop on any result that is not a success.

TRACEABILITY GAPS (each has a covering task; chains to /implement-trd --reconcile)
- The ship.md template ships with no active step and the default string comes first. Confirmed: parse returns `policy: none`. No test pins either fact. `ship-primitives.test.js` reads the template only to parse its examples (AC-F1.1, SHIP-B001).
- `stack.md.template`'s `## Issue Tracker` section has no test (AC-F10.1, SHIP-B001).
- No test checks that `close-issue` and `file-followups` read the declared tracker (AC-F10.2, SHIP-B016). Running `grep -i tracker` over the ship tests matches nothing.
- No test checks the no-tracker path: `close-issue` returning `none`, and `file-followups` naming each unfiled row (AC-F10.3, SHIP-B016).

UNTESTED-IN-PRACTICE
- `ship-build-surface.test.js:40-44`: the lint test passes as long as the output does not match /error|fail/i. The lint script does exist, so the early return does not fire. The check is still weak. No defect is hidden by it.

PLANNED, NOT BUILT YET
- SHIP-T002, the owner's live proof. It covers the live halves of AC-F4.2, AC-F7.1, AC-F9.3, AC-F14.3, AC-F17.1 (an approving review resumes the run; the workflow template exists but no run has shown it firing), J-5 and J-7. Its evidence folder, `.trd-state/ship-build/evidence/live/SHIP-T002/`, is missing because the task has not run yet.

REJECTED THESE FINDINGS
- "AMEND-001/AMEND-002 cite another feature". They are not requirement citations. They are the ids a scratch ledger returned when SHIP-B016's grounding recorded the `promoteToTrd` run (`docs/TRD/ship-build.md`, SHIP-B016 Reuse line).
- "`_followups/filed.jsonl` and `followups.js` do not exist". The TRD names them only as removed in 2.0.0 (§4.1 and the 2.0.0 changelog row). That is history, not a live claim.

NO ACTION
- The other requirements the five verifiers checked are implemented and tested. Coverage: 5 of 5 verifiers reported, 70 requirements and 14 tasks were indexed, and the PRD was supplied.

Could Not Verify, rewritten in docs/TRD/ship-build.md: no row removed. All 13 need a live remote, a fixture session, a third-party service or the owner, and this audit ran none of those.
