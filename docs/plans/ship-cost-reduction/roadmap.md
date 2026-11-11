# Roadmap: Ship cost reduction (Ensemble's part)

Plan: ship-cost-reduction | Command: /plan-feature | Version: 1 | Date: 2026-11-11

## Source spec

- Make `/ship-build` cheaper; owner approved 2026-11-11 -- source: conversation: "Ship cost: Ensemble's part. Make /ship-build cheaper. ... Owner approved 2026-11-11."
- Take the custody anchor after `/audit-build`'s own fixes, so a ship does not start by re-proving -- source: conversation: "(1) Custody anchor ... Take the anchor after the audit's own fixes."; document: forge-vnext `docs/reports/ship-cost-strategy-2026-11.md` (branch feature/0-ship-cost-strategy-review), section 1 "Ensemble's point of view", "Ship starts in debt".
- Today the anchor is the audit report's `- Audited commit:` (written before the chained `/implement-trd --reconcile` fix run), copied into `closed.json` `audit.auditedCommit` and read by custody when no anchor is set -- source: probe: `packages/core/commands/audit-build.md` lines 251, 307-325 (report header, chain, close fields); `packages/core/lib/custody.js` `reconcile`, "if (!custody) { const audited = auditedCommitOf(closedPath) ..." (lines ~372-386).
- Every success criterion records the files it covers; a criterion with no record today re-proves on any shipped change, docs and lockfiles included -- source: conversation: "(2) ... every success criterion records the files it covers (today only some tasks do ...)"; probe: `packages/core/lib/custody.js` `affectedIds` ("No covers record ... shipped.length > 0"); covers come only from `live-evidence.js` records (`--covers`, declared by `[LIVE]` tasks, `live-evidence.js` lines 12-15, 98-99).
- Add docs, dependency and CI-config change classes to custody's path classification -- source: conversation: "(2) ... add docs, dependency and CI-config change classes"; probe: `custody.js` `classifyPath` knows only `ignored`, `test-only`, `shipped`.
- Treat `OWNER-CALLS.md` as a record file -- source: conversation: "(2) ... treat OWNER-CALLS.md as a record file"; probe: `packages/core/lib/record-files.js` `isRecordFile` lists only `.claude/verification-notes.md` and `.trd-state/**`.
- Make the tier rules (which change class re-proves what) a per-product setting with careful defaults -- source: conversation: "(2) ... make the tier rules a per-product setting with careful defaults"; document: strategy report section 5, "The ship process (Ensemble)", tier table.
- Build on 4.17.4's #101, which already re-proves only criteria whose recorded files changed after a merge-up -- source: conversation: "4.17.4 (#101) already re-proves only criteria whose recorded files changed; build on it"; probe: `custody.js` header "BASE EXCUSE" and `affectedIds`.
- Give a re-proof one retry or debug pass, so one unmet or flaky criterion does not end STUCK (10 of 28 Storybook re-proof runs ended STUCK) -- source: conversation: "(3) ... Give it one retry or debug pass."; probe: `packages/core/commands/verify-build.md` "`--criteria <ids>`" section, "`cap: 1`: one iteration, so the loop never reaches its in-place Debug stage".
- Size a CI fix in `fix-findings` to the failure instead of always running `/implement-trd --reconcile` plus a whole-branch `/code-review --fix` -- source: conversation: "(4) A CI fix in fix-findings runs /implement-trd --reconcile plus a whole-branch /code-review --fix even for a one-line test fix; size it to the failure."; probe: `packages/core/contracts/ship-primitive-fix-findings.md` step 3 ("The rest is TRD work ... implement-trd ... --reconcile --chained --shipping").
- Fewer STUCK endings: let a ship run wait and loop where it can, for example CI on a red merge-up head inside the merge step -- source: conversation: "(5) Fewer STUCK endings ... (57 ship-stage escalations in 14 days for Storybook)"; probe: `packages/core/contracts/ship-primitive-merge.md` lines 53-55 ("A CI failure on the new head is a `stop`") and line 82 ("One rule for every stop").
- Report re-proof results (runs, criteria, outcome) in the ship block of `shipped.json` so Forge's ship record can carry them -- source: conversation: "(7) Report re-proof results ..."; document: strategy report section 6 table, "Re-proof" row; probe: `packages/core/lib/ship-sequencer.js` writes `shipped.json` and has no re-proof field (grep for `reverif` finds only custody detach lines 36-45, 815-825).

## Out-of-scope fence

- Moving run records off the product branch (strategy report item 6 / follow-up 12) -- reason: a joint design with Forge, later; source: conversation: "Out of scope: item 6, moving run records off the product branch".
- Anything only Storybook needs (its flaky spec, its integration isolation fault, its CI shape, its `/rebase-project`) -- reason: product work, not framework; source: conversation: "anything only Storybook needs"; strategy report section 4.
- Forge's side: ship queue scope, session reuse, the `ship_records` table and review loop -- reason: Forge's own changes; this plan only hands it the re-proof data; source: strategy report section 5 "Ownership" table.
- CI design guidance in `/ship-setup` and the CI agent, and a `merge_group`-aware merge primitive (follow-up 14, first and second parts) -- reason: not among the six items the request lists; source: conversation lists items 1-5 and 7 only.
- The owner-governed files `constitution.md`, `stack.md`, `.claude/rules/verification.md` and `.claude/rules/ship.md` of this repository -- reason: change only with the owner's approval; source: `CLAUDE.md` "Approval Requirements"; header of `ship.md`.
- Bypassing branch protection, or merging without the custody proof -- reason: the merge contract forbids it; source: probe: `ship-primitive-merge.md` ("Never bypass protection").

## Items

### 1. Custody anchor after the audit's fixes

- Brief: Make a ship start from the commit the audit actually finished on, not the one it first audited. Today `/audit-build` writes `- Audited commit:` into its report header before it chains `/implement-trd` in its chained reconcile mode (which edits code and runs a whole-branch review); that commit becomes `closed.json` `audit.auditedCommit`, and `custody.js reconcile` takes it as the anchor when none is set, so the first custody check of every ship finds changed code and re-proves (`packages/core/commands/audit-build.md` lines 251 and 307-325; `packages/core/lib/custody.js` `reconcile`). Change the close so the anchor custody reads is the branch head after the chained fix run has committed, and only when that fix run ended without a STUCK return and the re-audit (if any) passed; keep the report's audited commit as a separate, truthful field. A feature closed with no chained fix keeps today's behaviour. Cover it with Jest tests in `packages/core/lib/custody.test.js` and the audit-build contract tests.
- Dependencies: none
- How it will be checked: `npx jest packages/core/lib/custody.test.js packages/core/commands` passes, including a new test where `closed.json` carries an audited commit followed by fix-run commits and `custody.js reconcile` sets the anchor at the post-fix head and returns `action: none` (no re-proof) on the next check.
- Route: plan
- Route rigor: solo
- Deferred checks: a live `/audit-build` then `/ship-build` on the `github-live-test` environment showing the first custody check returns no re-proof; waits on the build of this item.
- Dates: none

### 2. Re-prove only what a change can affect

- Brief: Make custody's re-proof decision depend on the kind of change, building on 4.17.4's #101 (a merge-up already re-proves only criteria whose recorded files changed; `packages/core/lib/custody.js` header "BASE EXCUSE" and `affectedIds`). Four parts. (a) Every success criterion records the files it covers, not only `[LIVE]` tasks through `live-evidence.js` covers records: record covers for every criterion when it is proven (from the proving task's grounding Touches, falling back to the TRD task's file list), so the "no covers record re-proves on any shipped change" fallback in `affectedIds` stops applying to nearly everything; keep the fallback for a criterion that truly has no record. (b) Add `docs`, `deps` (dependency manifests and lockfiles) and `ci-config` (CI workflow files) change classes to `classifyPath` beside `ignored`, `test-only` and `shipped`. (c) Treat `OWNER-CALLS.md` as a record file in `packages/core/lib/record-files.js` `isRecordFile`, which stays the one definition. (d) Make the tier rules a per-product setting in `.claude/settings.json` under `ensemble.*` (the pattern `ensemble.docsAudit.thresholds` uses), with defaults from the strategy report's tier table: record files, docs only or a formatter commit re-prove nothing; test files or CI config only are left to CI; a dependency or lockfile change is left to CI unless the package is on an owner-named list (empty by default); a shipped change re-proves only the criteria whose covered files changed. An invalid setting stops with a reason naming it; an absent one uses the defaults. `scaffold-project.sh` must not overwrite an owner's value on refresh.
- Dependencies: Custody anchor after the audit's fixes (related)
- How it will be checked: `npx jest packages/core/lib/custody.test.js packages/core/lib/record-files.test.js packages/core/lib/live-evidence.test.js` passes with new cases: a docs-only change, a lockfile change, a CI-workflow change and an `OWNER-CALLS.md` change each return no re-proof under the defaults; a shipped change re-proves only criteria whose covers include it; a setting override changes the outcome; an invalid setting is refused. `bats` for any `scaffold-project.sh` change.
- Route: plan
- Route rigor: standard
- Deferred checks: none
- Dates: none

### 3. One retry for a re-proof

- Brief: A re-proof (`/verify-build` in its chained criteria-subset mode, called by the custody gate in `packages/core/contracts/ship-custody-gate.md`) runs with `cap: 1` and no Debug stage (`packages/core/commands/verify-build.md`, the criteria-subset section), so one unmet or flaky criterion ends the ship STUCK (10 of 28 Storybook re-proof runs). Give it exactly one retry: when the first iteration leaves criteria unmet, re-run only those criteria once more, with no code edit, and take the second result. A criterion met on the retry is recorded as met with a `retried` flag (so a flake is visible, not hidden); one still unmet ends as today. No Debug pass inside a ship: it would edit code outside the recorded path and need its own review and re-proof. Keep the subset paths under `.trd-state/<feature>/reverify/` and the existing RETURN line.
- Dependencies: none
- How it will be checked: `npx jest packages/core/commands/verify-build-criteria.test.js packages/core/contracts` passes with a case asserting the criteria-subset section of `verify-build.md` specifies one retry of only the unmet criteria and the `retried` flag; plus a unit test of whatever library computes the retry set.
- Route: plan
- Route rigor: solo
- Decisions: retry or debug pass: one re-run of the unmet criteria, no debug pass (owner's call, default taken unattended, 2026-11-11).
- Deferred checks: a live re-proof with one deliberately flaky criterion in a fixture slot, showing met-on-retry; waits on the build of this item.
- Dates: none

### 4. A CI fix sized to the failure

- Brief: In `fix-findings` (`packages/core/contracts/ship-primitive-fix-findings.md` step 3), every non-lint row goes through `/implement-trd` in its chained shipping reconcile mode, with gate agents, the full battery and a whole-branch `/code-review` that applies its fixes, even for a one-line test fix; the review's edits then trigger another re-proof. Size the fix to the failure: classify each blocking CI row by the files the failure points at (the same classes custody uses: test-only, CI config, docs, product code). A failure whose fix lies only in test files or CI config is fixed directly, the affected tests or the workflow lint are run, the change is committed by pathspec, and no whole-branch review runs. A failure that needs a product-code change keeps today's reconcile path. A row the classification cannot place takes today's path. Sweep work (no TRD) keeps step 4 unchanged.
- Dependencies: Re-prove only what a change can affect (related)
- How it will be checked: `npx jest packages/core/contracts/ship-primitives.test.js` passes with cases asserting the fix-findings contract routes a test-only and a CI-config row to the direct path (no `implement-trd`, no `/code-review`) and a product-code row to the reconcile path; plus a unit test for the row classifier if one is added.
- Route: plan
- Route rigor: solo
- Deferred checks: a live ship on `github-live-test` with a failing test fixed by the direct path; waits on the build of this item.
- Dates: none

### 5. Fewer STUCK endings in a ship run

- Brief: Every stop in `/ship-build` ends STUCK, then a Forge escalation and a new session (57 ship-stage escalations in 14 days for Storybook). Let the run wait and loop where the next step is mechanical. The named case: inside the merge step (`packages/core/contracts/ship-primitive-merge.md` lines 53-55), CI failing on the new head after a merge-up is a `stop`; instead route it through the same fix-findings and wait-ci loop the `repeat` uses, bounded by a new `rounds=` parameter on `merge` (it has only `method=` today) defaulting to 2, the `repeat` default (`DEFAULT_ROUNDS` in `packages/core/lib/ship-sequencer.js`), and stop only when that bound is spent. Then go through the merge contract's "One rule for every stop" list and the sequencer's `stuck` paths (`packages/core/lib/ship-sequencer.js`) and, for each, decide whether it is a wait (a later check can clear it with no decision: CI still running, GitHub mergeability `UNKNOWN`), a bounded loop, or a real stop that needs a person; convert the first two and keep the third. Never bypass protection or merge without the custody proof. List each stop and its new classification in the TRD.
- Dependencies: A CI fix sized to the failure (code_or_schema)
- How it will be checked: `npx jest packages/core/lib/ship-sequencer.test.js packages/core/contracts packages/core/lib/ship-build.seam.test.js` passes with a case where a red head after a merge-up loops through fix-findings and wait-ci and merges green within the bound, and one where the bound is spent and the run stops.
- Route: plan
- Route rigor: standard
- Deferred checks: a live merge-up with red CI on `github-live-test` that the run fixes and merges without ending STUCK; waits on the build of this item.
- Dates: none

### 6. Re-proof results in the ship record

- Brief: Forge plans a per-PR ship record and reads the ship block of `shipped.json`; Ensemble records nothing about re-proofs there today (`packages/core/lib/ship-sequencer.js`). Add a `reproof` block to the ship record: the number of re-proof runs, and for each run the criteria named, the criteria met (with the retry flag from the re-proof retry), the outcome string the run returned, the custody action and change classes that triggered it, and the time it took. The custody gate (`packages/core/contracts/ship-custody-gate.md`) writes each run through the sequencer, never by hand-editing `shipped.json`. Document the fields in the ship-build guide (`docs/guides/ship-build.md`) so Forge can read them.
- Dependencies: One retry for a re-proof (code_or_schema), Fewer STUCK endings in a ship run (related)
- How it will be checked: `npx jest packages/core/lib/ship-sequencer.test.js` passes with a case that records two re-proof runs and reads them back from `shipped.json` with the fields above; the guide names each field.
- Route: plan
- Route rigor: solo
- Deferred checks: none
- Dates: none

## Open questions

- Item 3: a retry or a debug pass? -- assumption: one re-run of the unmet criteria, no debug pass, because a debug pass edits code inside the ship and would need its own review and re-proof; asked of: owner's call (default taken under --auto).
- Item 2: the default tier rules -- assumption: the strategy report's tier table, with the owner-named dependency list empty; asked of: owner's call (default taken under --auto).
- Item 5: how long the merge step may loop on a red merge-up head -- assumption: a new `rounds=` parameter on `merge`, default 2 (the `repeat` default, `DEFAULT_ROUNDS` in `ship-sequencer.js`), then stop; asked of: owner's call (default taken under --auto).
- Ship path for this plan -- settled by source: `CLAUDE.md` "## Forge" names `.github/workflows/ci.yml` on the push to `main`; the file exists and references no `secrets.*`; no item touches migrations. asked of: none.
