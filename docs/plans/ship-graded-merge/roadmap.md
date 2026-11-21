# Roadmap: Ship graded merge

Plan: ship-graded-merge | Command: /plan-feature | Version: 1 | Date: 2026-11-21

## Source spec

- /ship-build resolves a base-branch conflict in place instead of stopping, graded by what the conflict is -- source: document: /Users/Shared/ensemble-graded-merge-2026-11-21.md, "Wanted: graded by what the conflict is"
- Record-file conflicts stay automatic and unchanged (grade 1) -- source: document: same file, "Wanted" item 1; probe: packages/core/lib/record-files.js (isRecordFile, mergeBase) already settles them
- Mechanical code conflicts (both sides add to a list, schema or barrel; disjoint hunks in one region; a test broken only by the base's changes) are resolved in the same run, keeping both sides' intent, then lint, typecheck and the affected unit tests run, the merge is committed and pushed, and CI on the merged head is the proof -- source: document: "Wanted" item 2
- After such a merge, only criteria whose covered code changed in the merge are re-proved, using custody's existing narrowed scope; add evidence if a cleanly merged base-only file still widens the scope -- source: document: "Wanted" item 2 (#153, #163); probe: the Storybook stop table has 7 custody refusals, one naming a base-only `next.config.ts` change that pulled 4 criteria in (/Users/Shared/storybook-stuck-2026-11-14-to-21.tsv)
- A genuine behavioural clash (same user-visible behaviour specified differently, or checks still failing after two fix attempts) ends in a well-formed STUCK naming the files and the clash, so Forge's delegate resolver takes over -- source: document: "Wanted" item 3
- A conflicted PR is detected before wait-ci and goes to the merge step instead of waiting on CI that never starts (#136) -- source: document: "Wanted" item 4; probe: packages/core/contracts/ship-primitive-wait-ci.md has no mergeability check (no match for CONFLICT or mergeable), while merge-up.js `decide` already reads `mergeable` and `mergeStateStatus`
- Never force-push; never resolve in `.claude/rules/*` or another feature's TRD (those stop) -- source: document: "Limits"
- Every resolution is recorded in the ship record: files, class (mechanical or behavioural), checks run, re-proof scope -- source: document: "Limits"
- Classification and checks run in a tested lib; the model resolves only the hunks -- source: document: "Limits"
- Done when: unit tests cover classification and stop rules; one live proof on islayjames/ship-build-live-test shows a mechanical conflict resolved in place and merged and a behavioural clash stopping cleanly; the ship record shows both; release notes tell Storybook's PM it may turn on Forge's `ship_queue` `merge` scope -- source: document: "Done when"; probe: that repo exists and `.claude/rules/verification.md` section 1 authorizes it (github-live-test row)

## Out-of-scope fence

- Forge's `ship_queue` `merge` scope, Forge's `delegate` resolver session, and Storybook's setting for them -- reason: Forge's rule, and Storybook's PM owns the setting; this plan only tells that PM it may turn it on; source: document: "Done when"
- Record-file conflict handling in `packages/core/lib/record-files.js` -- reason: already automatic and the single definition of a record file; source: document: "Wanted" item 1
- Resolving behavioural clashes in place -- reason: they stay with Forge's delegate resolver as the fallback; source: document: "Wanted" item 3
- `.claude/rules/*` (owner-governed) and another feature's TRD -- reason: conflicts there stop, never resolved; source: document: "Limits"
- Force-pushing, rebasing a published PR branch -- reason: forbidden; source: document: "Limits"
- `FortiumPartners/ensemble-vnext` `main`, its tags and the marketplace as a live-proof target -- reason: the live proof runs only in islayjames/ship-build-live-test; source: probe: `.claude/rules/verification.md` section 1 (production row, github-live-test row)
- Cutting the release itself -- reason: releasing is the owner's `ship.md` / release process; the plan supplies release-note text only; source: probe: `.claude/rules/ship.md` (no steps listed) and CLAUDE.md

## Items

### 1. Conflict classifier and stop rules

- Brief: Add a tested library that decides, for a set of conflicted paths and the two sides' hunks, whether a base-branch conflict is `record` (settled by the existing record-file path), `mechanical` (the model may resolve it), `behavioural` (stop) or `forbidden` (stop at once). Forbidden means any path under `.claude/rules/`, or another feature's TRD (a file under `docs/TRD/` that is not the TRD of the feature being shipped). Mechanical covers both sides adding entries to a list, schema or barrel file, disjoint hunks in the same region, and a test broken only by the base's changes. Anything it cannot place as mechanical is behavioural. It also owns the stop rules: two failed fix attempts after a resolution turns a mechanical conflict into a behavioural one, and the STUCK text it produces names the files and the clash. Keep `isRecordFile` in `packages/core/lib/record-files.js` the single definition of a record file and call it from here. Expose a one-line JSON command line like `merge-up.js` does, so the contract can call it.
- Dependencies: none
- How it will be checked: Jest unit tests for the classifier and the stop rules, run with `npx jest` on the new test file, covering each class, each forbidden path, the two-attempt rule and the STUCK text; plus the existing `packages/core/lib/record-files.test.js` still passing
- Route: plan
- Route rigor: solo
- Deferred checks: none
- Dates: none

### 2. Check mergeability before wait-ci

- Brief: A pull request that has become conflicted after a push gets no `pull_request` CI from GitHub, so `/ship-build` waits at `wait-ci` forever (issue #136, and about 8 of the 32 Storybook STUCK banners). Make `/ship-build` read the PR's mergeability before it waits on CI and, when GitHub reports it `CONFLICTING`, send the run to the merge step's merge-in handling (`node .claude/lib/merge-up.js decide`, which already returns `merge-in` for that case) instead of waiting. Poll while GitHub has not computed mergeability, as the merge step already does. Do this in the `wait-ci` contract and the sequencer so a conflicted PR never enters the wait. Until the in-place resolution item lands, a code-file conflict reached this way still stops, but at the merge step with a clear reason, not after a timeout.
- Dependencies: none
- How it will be checked: Jest tests with a stubbed `gh` that return CONFLICTING, MERGEABLE and UNKNOWN for a PR and assert the run goes to the merge step, goes to the CI wait, or polls, in each case; plus `npx jest packages/core/contracts/ship-primitives.test.js` still passing
- Route: plan
- Route rigor: solo
- Deferred checks: none
- Dates: none

### 3. Resolve mechanical conflicts in place

- Brief: In the `/ship-build` merge step, when `merge-up.js decide` says `merge-in` and the base clashes with the PR head in more than record files, classify each conflicted file with the classifier from the first item. Record files go the existing way. For mechanical files the model resolves only the conflict hunks, keeping both sides' intent; then the run executes lint, typecheck and the affected unit tests through a tested library (not by prompt), commits the merge and pushes it normally, never forcing. CI on the merged head is the proof. If a check still fails after two fix attempts, or any file is behavioural or forbidden, stop with a well-formed STUCK that names the files and the clash so Forge's delegate resolver takes over. Write each resolution into the ship record: files, class, checks run, re-proof scope and the two-attempt count. Keep classification and the check runner deterministic and unit tested; the model's only job is the hunks. Update `packages/core/contracts/ship-primitive-merge.md` and `docs/guides/ship-build.md` to describe the graded behaviour.
- Dependencies: Conflict classifier and stop rules (code_or_schema)
- How it will be checked: Jest tests with a fixture git repository and stubbed `gh` proving a mechanical conflict is resolved, checked, committed and pushed without force; a behavioural, a forbidden and a two-failed-attempts case each end in the specified STUCK with files named; the ship record carries the entry in each case. `npx jest packages/core/lib/ship-build.seam.test.js packages/core/lib/merge-up.test.js` pass with the new cases
- Route: plan
- Route rigor: solo
- Deferred checks: none
- Dates: none

### 4. Narrow re-proof after a merge

- Brief: After a merge of the base into a PR head, `/ship-build`'s custody gate should re-prove only the criteria whose covered code changed in the merge. The scope narrowing exists (issues #153 and #163, `packages/core/lib/custody.js` `affectedIds` and the base excuse in `compare`), but Storybook still saw 3 custody refusals where a cleanly merged base-only file widened the scope; one stop row says develop's `next.config.ts` change pulled 4 video-ending criteria back in. Find from the Storybook stop table (/Users/Shared/storybook-stuck-2026-11-14-to-21.tsv, rows mentioning custody) which kinds of base-only file still widen the scope, reproduce each with a fixture, and fix it so a base-only file no criterion covers re-proves nothing. If a row cannot be reproduced, record the evidence in the test as a skipped case with the reason rather than loosening custody. Do not weaken the check for a file the merge changed on the feature's side.
- Dependencies: none
- How it will be checked: Jest tests in `packages/core/lib/custody.test.js` with fixtures for each reproduced base-only file kind (a framework config file, an unnamed file) asserting an empty re-proof set, and a feature-touched file still re-proving its criteria; `npx jest packages/core/lib/custody.test.js packages/core/lib/narrow-reproof.seam.test.js` pass
- Route: plan
- Route rigor: solo
- Deferred checks: none
- Dates: none

### 5. Live proof on the ship-build test repository

- Brief: Prove the graded merge on real GitHub in islayjames/ship-build-live-test (the `github-live-test` environment in `.claude/rules/verification.md`; one branch and PR at a time, inside that repo only, never this repository's `main`). Run `/ship-build` twice from a scaffolded fixture checkout of that repo: once on a PR whose conflict with the base is mechanical (both sides add to a list or barrel file) and show it is resolved in place, checked, pushed, and merged in the same run; once on a PR with a behavioural clash (the same behaviour specified two ways) and show it stops with the files and the clash named. Also open a PR, push a conflicting base commit, and show the run sends it to the merge step and does not wait on CI. Capture each run's ship record and write a short report under `.trd-state/ship-graded-merge/` with the PR links, the records, and any step that did not behave as specified. This ships no code in this repository; leftover fixture branches and PRs are closed and deleted per the destroy command in `.claude/rules/verification.md` section 1a.
- Dependencies: Resolve mechanical conflicts in place (code_or_schema), Check mergeability before wait-ci (code_or_schema), Narrow re-proof after a merge (related)
- How it will be checked: observation of the running system: the report links the merged mechanical PR, the stopped behavioural PR and the pre-CI conflict run, and each ship record shows its entry (files, class, checks run, re-proof scope); `gh pr view <number> --json state,mergedAt` on the listed PRs matches the report
- Route: task
- Route rigor: solo
- Deferred checks: none
- Dates: none

### 6. Document the graded merge and tell Storybook

- Brief: Write the user-facing description and release-note text for the graded merge: what `/ship-build` now resolves in place, what still stops and why, the limits (no force-push, owner-governed rules files and other features' TRDs stop), and where the resolution is recorded. Update `docs/guides/ship-build.md` and add the entry under `[Unreleased]` in `CHANGELOG.md` closing issues #97 (its graded-merge part) and #136. The entry must include one plain sentence telling Storybook's PM that, now this has shipped, it may turn on Forge's `ship_queue` `merge` scope, and that the setting is Storybook's PM's to make; do not change any Forge or Storybook setting. State the live proof's result only after reading its report from the live-proof item; if that report shows a step that did not behave as specified, say so instead of claiming it works. Do not cut the release.
- Dependencies: Resolve mechanical conflicts in place (code_or_schema), Live proof on the ship-build test repository (related)
- How it will be checked: `grep` of `CHANGELOG.md` and `docs/guides/ship-build.md` for the graded-merge entry, the `ship_queue` sentence and both issue numbers; `npx jest` doc-consistency tests in the repository still pass; owner check on the wording of the Storybook sentence, waiting on the owner
- Route: plan
- Route rigor: solo
- Deferred checks: none
- Dates: none

## Open questions

- Plan rigor and spec-first -- assumption: `solo` with spec-first off, as the sibling ship plans use (ship-churn-fixes), since the owner approved the spec and no PRD is needed; asked of: owner's call, default taken under auto
- Item sizes -- assumption: six items at the balanced size; the in-place resolution item (3) is the largest and `/plan` may size it up; asked of: none, settled by the product's balanced feature size (forge_product_list)
- Whether the live proof should wait on the narrow re-proof item -- assumption: it follows it (related, not a block), so a refusal seen live that item 4 fixes is not reported as a defect in item 3; asked of: owner's call, default taken under auto
- Whether Storybook's real conflict files (`prisma/schema.prisma`, barrel files, `package.json`) classify as mechanical -- assumption: the classifier treats additions to a list, schema or barrel as mechanical and anything else as behavioural; the Storybook examples are the seed fixtures for the unit tests; asked of: none, settled by the input document's examples
