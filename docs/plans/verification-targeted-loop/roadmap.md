# Roadmap: Verification loop — targeted fixes, one full run at the end

Plan: verification-targeted-loop | Command: /plan-feature | Version: 1 | Date: 2026-11-11

## Source spec

- Classify every unmet verification result as one of three kinds: a build defect (the app behaves wrongly), an evidence gap (the capture or log is missing; nothing to fix in code) or not checkable on this host (a host or tooling limit). Only build defects enter the fix loop; an evidence gap is re-captured once; a not-checkable result is set aside with its reason and not retried every iteration. -- source: conversation: "(1) triage each unmet result as a build defect, an evidence gap (capture missing, nothing to fix in code) or not checkable on this host. Loop only on build defects; collect evidence gaps once; set aside not-checkable results without retrying them every iteration."; document: issue #113, "Proposed loop" item 1
- Today's loop already splits capture failures from build failures, but retries them every iteration until the cap, and any not-verifiable verdict re-opens on every new invocation. -- source: probe: `packages/core/workflows/verify-functional.js:434` (`EVIDENCE_CAUSES = ['evidence-missing', 'evidence-stale', 'locator-not-found']`), `:1866-1887` (evidence gaps go back to Exercise, no limit), `:1580-1603` (a resume seeds only `met`; `not_verifiable` re-enters the open set)
- After each debug pass, re-exercise and re-judge only the failing criteria, grouped by shared cause, not every open criterion. -- source: conversation: "(2) Inner loop: re-exercise and re-judge only the failing criteria (grouped by shared cause where possible) after each debug pass, not all criteria."; document: issue #113, "Proposed loop" items 2-3
- Today each iteration re-walks every still-open (`not_met`) criterion, whatever Debug touched; criteria already settled within the run are not re-walked, and there is no notion of a shared cause. -- source: probe: `packages/core/workflows/verify-functional.js:1652-1656` (`openCriteria = CRITERIA.filter((c) => !settled.has(c.id))`), `:1587-1588`
- Run one full verification pass at the end as the regression gate, and treat that final run as the proof. -- source: conversation: "(3) Run one full pass at the end as the regression gate, and treat that final run as the proof."; document: issue #113, "Proposed loop" items 4 and 6
- Today a criterion settled `met` in iteration 1 is never re-checked after later Debug edits, so no full regression pass exists; the only end-of-run gate is the declared full-deploy command, which is not a re-judge. -- source: probe: `packages/core/workflows/verify-functional.js:1825-1843` (settled entries are never overwritten), `:1182-1195` (`computeFinalRun` reads `FULL_RUN_COMMAND`)
- Block only on material failures; a non-material failure does not hold the run. -- source: conversation: "(4) Block only on material failures."; document: issue #113, "Owner directive that resulted" (material = a main user flow broken, data lost or corrupted, private data exposed, money or AI spend charged wrongly) and "Proposed loop" item 5
- A must-pass criterion that cannot be checked on this host does not hold a run forever: it is recorded as an accepted gap with its reason, visible in the report, so custody can accept it at ship. -- source: conversation: "A not-checkable-here must-pass criterion does not hold a run forever: record it as an accepted gap with its reason, visible in the report, so custody can accept it at ship."; document: issue #113, evidence §2 (FS-56, read-aloud, provable only on GitHub CI)
- Today a must-pass criterion can never be accepted as not verifiable: the run ends `must-pass-unproven`, and custody re-proves must-pass criteria by id. -- source: probe: `packages/core/commands/refine-verification.md:92` ("Never a must-pass criterion"), `packages/core/lib/refine-verification-must-pass.test.js` (D16), `packages/core/workflows/verify-functional.js:1259-1298` (`applyMustPassRecheck`), `packages/core/lib/custody.js:436-460`
- Rank follow-ups so the few product items show first, ahead of host, tooling and paperwork notes. -- source: conversation: "(5) Rank follow-ups so the few product items show first, ahead of host, tooling and paperwork notes."; document: issue #113, evidence §2 (37 follow-ups, about 12 product items)
- Today `file-followups` files and lists open ledger rows in ledger order, tagged by a summary prefix (`[not-verifiable]`, `[flaky-ci]`, `[review:<label>]`, `[below-critical]` ...), with no product-first ranking. -- source: probe: `packages/core/contracts/ship-primitive-file-followups.md` steps 1-5; `packages/core/commands/ship-build.md:217-244`
- Keep what 4.17.5 shipped (one retry of a failed re-proof, re-prove only what a change can affect, CI fixes sized to the failure) and build on it. -- source: conversation: "Keep what 4.17.5 already shipped (re-proof retry, re-prove only what changed, sized CI fixes) and build on it."
- The work is in Ensemble's own verification code: the verify-functional workflow, `/verify-build` and `/refine-verification`. -- source: conversation: "verify-functional exercises and judges every criterion on every iteration (packages/core/workflows, the verify-functional workflow, plus /verify-build and /refine-verification)"; probe: `packages/core/workflows/verify-functional.js`, `packages/core/commands/verify-build.md`, `packages/core/commands/refine-verification.md`

## Out-of-scope fence

- Anything only Storybook needs (its own criteria, boards, dev server, CI). -- reason: the Storybook numbers are evidence of a framework defect, not scope; source: conversation: "The issue's Storybook numbers are evidence, not scope." and "Out of scope: anything only Storybook needs"
- Forge's side: the per-PR ship record that reads `reproof`, and the merge-only ship lease. -- reason: coordinated by the Forge PM in the Forge product; source: conversation: "Out of scope: ... Forge's side"; issue #113, "Notes"
- Moving run records (`.trd-state/` verification and ship records) off the branch. -- reason: a separate design; source: conversation: "moving run records off the branch (a separate design)"
- Reworking what 4.17.5 shipped: the re-proof retry, re-proof scoped to what a change can affect, CI fixes sized to the failure, the custody anchor after audit fixes. Items build on them, they do not redesign them. -- reason: already shipped and kept; source: conversation: "Keep what 4.17.5 already shipped ... and build on it"
- Setup cold-start tolerance (warming the dev server, a longer setup timeout, not counting a setup failure as a round) and stopping base-branch merges or record-only commits from re-opening custody. -- reason: in the issue (proposed-loop items 6 and 8) but not in the PM's five-point scope; source: conversation (the scope list (1)-(5)); issue #113. See Open questions.
- Moving design-comparison and design-structure checks into `/sync-design` after merge. -- reason: the issue's item 7 proposes it, but the PM's scope keeps the change inside the loop (item 2 targets only failing criteria, which already keeps passing expensive checks out of the inner loop); source: conversation scope (2); issue #113, "Proposed loop" item 7
- Editing `.claude/rules/verification.md`, `constitution.md` or `stack.md`. -- reason: owner-governed files, changed only by the owner's setup skills; source: `CLAUDE.md` "Approval Requirements"; `.claude/rules/verification.md` header

## Items

### 1. Triage unmet results by kind

- Brief: In the verify-functional workflow (`packages/core/workflows/verify-functional.js`) and its decide-next library (`packages/core/lib/functional-verification.js`), give every unmet criterion one kind: `build-defect`, `evidence-gap` or `not-checkable-here`, returned by the Judge, recorded in the verification state file and shown in the report. Only `build-defect` reaches Debug. An `evidence-gap` gets exactly one re-capture in the run (today it is retried every iteration until the cap, `verify-functional.js:434` and `:1866`); if the re-capture still fails it is settled as an evidence gap with its reason and stops counting as an open gap for the stalled and cap rules. A `not-checkable-here` result is settled once with its reason and is not re-opened by a later invocation unless `verification.md` has changed since it was recorded (today a resume re-opens every not-verifiable verdict, `verify-functional.js:1580`). `/verify-build`'s fix rounds and `/refine-verification` read the kind instead of re-deriving it. Who benefits: an owner whose run today loops on captures and host limits no code change can fix.
- Dependencies: none
- How it will be checked: `npx jest packages/core/workflows/verify-functional.test.js packages/core/lib/functional-verification.test.js packages/core/commands/verify-build-criteria.test.js` with new cases: an evidence gap re-captured once then settled; a not-checkable result not re-opened on resume when `verification.md` is unchanged and re-opened when it changed; only build defects in the Debug prompt. Plus one headless fixture run of `/verify-build` (the `fixtures` environment in `verification.md`) on a fixture seeded with one defect, one missing capture and one host-only criterion, showing all three kinds in the report.
- Route: plan
- Route rigor: standard
- Deferred checks: none
- Dates: none

### 2. Targeted inner loop by shared cause

- Brief: After each Debug pass in the verify-functional workflow, re-exercise and re-judge only the build-defect criteria whose cause that pass addressed, not every open criterion (today every `not_met` criterion is re-walked each iteration, `verify-functional.js:1652-1656`). The Judge groups build-defect criteria by shared root cause (one cause key per group, for example "Looks good is a bar, not a button" across many screen states); Debug fixes one cause once, independent causes may be fixed in parallel, and the next pass re-checks that cause's criteria, starting with one representative criterion per group and the rest only once the representative passes. Criteria of an unaddressed cause stay open untouched. Expensive check-derived criteria (`derivation: check:<skill>`, such as design comparison) take part only through their cause group, so a passing or set-aside design check is never re-captured in the inner loop. The stalled rule counts closed causes as well as closed criteria. Builds on the triage kinds from the item "Triage unmet results by kind".
- Dependencies: Triage unmet results by kind (code_or_schema)
- How it will be checked: `npx jest packages/core/workflows/verify-functional.test.js packages/core/lib/functional-verification.test.js` with new cases: an iteration after Debug dispatches Exercise only for the addressed cause's criteria; a 20-criterion cause re-checks one representative first; an unaddressed cause is not re-walked. Plus a headless fixture run (`fixtures` environment) with two seeded causes spread over at least six criteria, whose state file shows the second iteration exercising only the fixed cause's criteria.
- Route: plan
- Route rigor: standard
- Deferred checks: none
- Dates: none

### 3. One full regression pass at the end

- Brief: When the inner loop has no build defect left (or reaches its cap), the verify-functional workflow runs one full pass: every criterion is exercised and judged again, including those settled `met` earlier in the run (today a criterion settled in iteration 1 is never re-checked after later Debug edits, `verify-functional.js:1825-1843`). That pass is the proof: the verdicts recorded in the state file and report, and the `provenAt` that custody anchors on, are the final pass's. If it surfaces new build defects, only those go back to the inner loop, followed by at most one more full pass; no open-ended rounds. Evidence gaps and not-checkable results from the final pass are recorded, not looped. The existing full-deploy gate (`computeFinalRun`, `FULL_RUN_COMMAND`) stays as it is and runs with the final pass. 4.17.5's re-proof retry and scoped re-proof at ship are kept unchanged and read the final pass's verdicts. Builds on the item "Targeted inner loop by shared cause".
- Dependencies: Targeted inner loop by shared cause (code_or_schema)
- How it will be checked: `npx jest packages/core/workflows/verify-functional.test.js packages/core/lib/custody.test.js` with new cases: a criterion `met` in iteration 1 that a later Debug edit breaks is caught by the final pass; a final-pass regression gets one inner-loop round and one more full pass, never a third; custody reads `provenAt` from the final pass. Plus a headless fixture run (`fixtures` environment) where a fix for one cause breaks an earlier-met criterion, and the report shows the final pass catching it.
- Route: plan
- Route rigor: standard
- Deferred checks: none
- Dates: none

### 4. Accepted gaps for not-checkable must-pass criteria

- Brief: A must-pass criterion triaged `not-checkable-here` no longer holds the run at `must-pass-unproven` forever. It is recorded as an accepted gap: its reason and the environment that does prove it (for example "GitHub CI"), written to the verification state file and shown in its own "Accepted gaps" section of the report. `applyMustPassRecheck` (`verify-functional.js:1259`) does not turn a run unproven for an accepted gap alone; `/refine-verification` (today "Never a must-pass criterion" at `refine-verification.md:92`, test `refine-verification-must-pass.test.js`, decision D16) may accept one only for this kind and only with a named proving environment; custody (`packages/core/lib/custody.js`) does not ask to re-prove an accepted gap, and `/ship-build`'s readout names each one so the owner sees what shipped unproven here. A build defect or evidence gap on a must-pass criterion is never accepted. Builds on the triage kinds and on the final pass's recorded verdicts (custody anchors on them), from the item "One full regression pass at the end"; built after it because both change the must-pass recheck and custody in the same files.
- Dependencies: Triage unmet results by kind (code_or_schema), One full regression pass at the end (code_or_schema)
- How it will be checked: `npx jest packages/core/workflows/verify-functional.test.js packages/core/lib/custody.test.js packages/core/lib/refine-verification-must-pass.test.js` with new and updated cases: a must-pass not-checkable criterion with a proving environment ends `satisfied` with an accepted gap listed; one with no proving environment still ends `must-pass-unproven`; a must-pass build defect is never accepted; custody's re-proof list excludes accepted gaps. Plus a headless fixture run (`fixtures` environment) with one host-only must-pass criterion, whose report shows the accepted-gap section.
- Route: plan
- Route rigor: standard
- Deferred checks: none
- Dates: none

### 5. Block only on material failures

- Brief: A build-defect criterion carries a materiality verdict from the Judge: material when it breaks a main user flow, loses or corrupts data, exposes private data, or charges money or AI spend wrongly; otherwise non-material (cosmetic, edge case, flaky, design nit). Only material failures block `satisfied`, the must-pass recheck and custody; a non-material failure is still reported, is not looped on past the inner loop's cap, and is written to the work's follow-up ledger (`discovered.jsonl`) as a product follow-up. A must-pass criterion's build defect is always material. The definition is a framework default stated once in the functional-verification contract (`packages/core/contracts/functional-verification.md`). Builds on the triage kinds and on the must-pass recheck as changed by the item "Accepted gaps for not-checkable must-pass criteria"; built after it because both change `applyMustPassRecheck` and custody.
- Dependencies: Accepted gaps for not-checkable must-pass criteria (code_or_schema)
- How it will be checked: `npx jest packages/core/workflows/verify-functional.test.js packages/core/lib/functional-verification.test.js packages/core/lib/custody.test.js` with new cases: a run whose only open failures are non-material ends `satisfied` and records each as a follow-up row; one material failure blocks; a must-pass build defect is material whatever the Judge says. Plus a headless fixture run (`fixtures` environment) with one material and one cosmetic seeded defect.
- Route: plan
- Route rigor: standard
- Decisions: Materiality definition: the four-part definition from issue #113 (main user flow, data loss or corruption, private data exposure, wrong money or AI spend) as the framework default, with no per-project override in this plan (owner's call, default taken under auto, 2026-11-11)
- Deferred checks: none
- Dates: none

### 6. Rank follow-ups, product items first

- Brief: Give every follow-up row a rank class: `product` (the app does something wrong, including non-material failures), then `host` (a host limit such as audio or a minified build), `tooling` (a check or tool limit, flaky CI), `paperwork` (record or document mismatch) and `not-verifiable` notes last. `file-followups` (`packages/core/contracts/ship-primitive-file-followups.md`) files and lists rows in that order, and `/ship-build`'s readout (`packages/core/commands/ship-build.md:217-244`) lists filed and unfiled follow-ups in the same order with the class shown, so the few product items are read first. Rows recorded before this change get a class from their existing summary prefix (`[not-verifiable]` to not-verifiable, `[flaky-ci]` to tooling, `[review:<label>]` to product, and so on). The classes come from the follow-up list in issue #113 (about 12 product items, 9 host or tooling, 7 paperwork, 9 not-verifiable).
- Dependencies: Block only on material failures (related)
- How it will be checked: `npx jest packages/core/contracts/ship-primitives.test.js packages/core/lib/ship-build.seam.test.js` with new cases: a mixed ledger of product, host, tooling, paperwork and not-verifiable rows is filed and listed product first; a legacy row with only a summary prefix gets its class.
- Route: plan
- Route rigor: solo
- Deferred checks: none
- Dates: none

## Open questions

- Must the PM's statement "verify-functional exercises and judges every criterion on every iteration" be taken literally? -- assumption: no; the probe shows the loop re-walks every still-open criterion each iteration and re-opens not-verifiable verdicts across invocations, which is the defect items 1-3 fix; asked of: none, settled by probe `verify-functional.js:1580-1656`
- Reversing decision D16 (a must-pass criterion is never accepted as not verifiable). -- assumption: reversed only for the `not-checkable-here` kind with a named proving environment, as scope point (4) asks; never for a build defect or evidence gap; asked of: owner's call, default taken under auto
- Materiality definition: framework default or per project? -- assumption: the four-part definition from issue #113 as the framework default, no per-project override in this plan (a project override would need a section in owner-governed `verification.md`); asked of: owner's call, default taken under auto
- When does a not-checkable verdict re-open on a later invocation? -- assumption: only when `verification.md` has changed since it was recorded, so an environment the owner unblocks is still retried; asked of: owner's call, default taken under auto
- How many final-pass rounds? -- assumption: one full pass, then at most one inner-loop round and one more full pass, as the issue proposes; asked of: none, settled by issue #113 "Proposed loop" item 4
- Setup cold-start tolerance and base-merge or record-only commits not re-opening custody (issue items 6 and 8). -- assumption: left out of this plan, since the PM's scope lists five points that do not include them; worth a separate `/plan-fix` if the PM wants them; asked of: owner's call, default taken under auto
- Should the five items that edit `verify-functional.js` run in parallel? -- assumption: no; plan-shape found three running at once on the same 2,000-line file, so items 1-5 are a chain and only item 6 runs alongside; asked of: none, settled by `plan-shape.mjs` shared-file collisions
- Ship path. -- assumption: none needed; `CLAUDE.md` `## Forge` has a Shipped paragraph naming `.github/workflows/ci.yml`, the file exists, it references no secret, and no item touches migrations; asked of: none, settled by probe
