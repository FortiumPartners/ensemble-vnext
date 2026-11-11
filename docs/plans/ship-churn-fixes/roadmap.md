# Roadmap: Ship-churn fixes

Plan: ship-churn-fixes | Command: /plan-feature | Version: 1 | Date: 2026-11-11

## Source spec

- Two features built in parallel must merge into the base in either order with no conflict on any framework file: every framework write is per feature (`.trd-state/<feature>/...`), a single-pointer file such as `current.json` stays out of git, and any log that must stay shared gets a `.gitattributes` `merge=union` line written by `/init-project` and `/rebase-project` -- source: document: brief.md, "Request, verbatim", change 1.
- Projects scaffolded by Ensemble are told to commit `.trd-state/current.json`: the shipped ignore template lists it under "SHOULD be tracked", and initial scaffolding writes it from a template, while this repository's own `.gitignore` already ignores it with the reason "a merge conflict by construction" -- source: probe: `packages/core/templates/gitignore-additions.txt` lines 26-41; `packages/core/scripts/scaffold-project.sh:1869`; `.gitignore` lines 7-22.
- The ignore template also omits the other per-session files this repository ignores (`.trd-state/_dispatch.jsonl`, `.trd-state/_command-runs/`), and the compaction hook falls back to one shared tracked log, `.trd-state/_session-log.md` -- source: probe: `.gitignore` lines 89 and 96; `packages/core/hooks/precompact.js:55-59`; `git ls-tree origin/main .trd-state/`.
- After a merge-up, re-prove only the criteria whose covered files differ between the old and the new merge base, re-anchor custody, and go on to merge without another full loop -- source: document: brief.md, change 2.
- Today the custody check already narrows re-proof to affected must-pass criteria, but every path the base brought in still counts as "in doubt" for criteria that cover it, and nothing compares the old merge base with the new one -- source: probe: `packages/core/lib/custody.js` header lines 21-27 and `affectedIds` lines 260-297 (origin/main).
- Merge-up only when GitHub reports the PR conflicting, or when branch protection requires an up-to-date branch -- source: document: brief.md, change 2. On main the merge step already merges the base in only on `CONFLICTING` and skips on `MERGEABLE`; the up-to-date-required case is not handled and ends in a `gh pr merge` failure -- source: probe: `packages/core/contracts/ship-primitive-merge.md` lines 23-48 and 64-66 (origin/main).
- `/ship-setup` checks that the project's CI has one always-reporting summary check, skips its heavy jobs on docs-only and record-only pushes, and does not run the full suite on custody or ship-record commits, and reports a CI that lacks these -- source: document: brief.md, change 3. `/ship-setup` reads no CI configuration today -- source: probe: `packages/skills/ship-setup/SKILL.md` (origin/main; its only workflow is the resume trigger it installs).
- wait-ci's flaky list does something: each flaky job is filed as a follow-up the first time, and a job that has flaked 3 times is no longer treated as passing on rerun -- source: document: brief.md, change 3. Today a rerun-pass goes into `data.flaky` and nothing reads it; `file-followups` imports only not-verifiable criteria and `/task` follow-ups -- source: probe: `packages/core/contracts/ship-primitive-wait-ci.md:36`, `ship-primitive-file-followups.md` lines 31-40 (origin/main).

## Out-of-scope fence

- PR #99's work: the `merge=union` line for `.claude/verification-notes.md` written by `ensure_gitattributes()`, and the merge step resolving clashes that touch only record files (`packages/core/lib/record-files.js`) -- reason: already on main; build on it, do not redo it; source: brief.md, "Already on main".
- Forge's side: its conflict brief asking for a full re-proof, its `base_moved` merge-ups, and the health findings that show the churn -- reason: going to a Forge issue; source: brief.md, last paragraph.
- Storybook's own flaky test and its CI path filter -- reason: filed on Storybook as islayjames/storybook#89 and #90; source: brief.md, last paragraph.
- Editing any product repository directly (Storybook included) -- reason: the three changes are Ensemble's baseline; a product picks them up through `/rebase-project`; source: brief.md, "Three changes are Ensemble's".
- The owner-governed files `constitution.md`, `stack.md`, `.claude/rules/verification.md` and `.claude/rules/ship.md` -- reason: they change only with the owner's approval; source: `CLAUDE.md` "Approval Requirements" and the header of `ship.md`.
- Bypassing branch protection or merging without the custody proof -- reason: the merge contract forbids it; source: probe: `packages/core/contracts/ship-primitive-merge.md:66` ("Never bypass protection").

## Items

### 1. Per-feature framework writes

- Brief: Make sure two features built in parallel in a project scaffolded by Ensemble can merge into the base in either order with no conflict on any framework file. Find every file the framework writes that is shared across features and tracked in git, and either move the write under `.trd-state/<feature>/`, keep the file out of git, or (for a log that must stay shared) add a `merge=union` line to the `.gitattributes` template that `ensure_gitattributes()` in `packages/core/scripts/scaffold-project.sh` already writes on both init and refresh. Known cases from a code read: `packages/core/templates/gitignore-additions.txt` tells projects to commit `.trd-state/current.json` and omits `.trd-state/_dispatch.jsonl` and `.trd-state/_command-runs/`, all three of which this repository's own `.gitignore` already ignores; initial scaffolding writes `current.json` from a template (`scaffold-project.sh` line 1869); the compaction hook (`packages/core/hooks/precompact.js` lines 55-59) falls back to one shared `.trd-state/_session-log.md`. The ignore lines must reach both new projects (`/init-project`) and existing ones (`/rebase-project`), and an existing project that already tracks `current.json` must stop tracking it without losing the file. Keep `isRecordFile` in `packages/core/lib/record-files.js` the single definition of a record file.
- Dependencies: none
- How it will be checked: a new BATS test in `packages/core/scripts/` that scaffolds a fixture repository, builds two features on two branches through the framework's own writers, and merges them into the base in both orders, asserting no conflict on any framework file; run with `bats <that file>`, plus `bats packages/core/scripts/scaffold-project.test.sh`.
- Route: plan
- Route rigor: solo
- Deferred checks: none
- Dates: none
- Decisions: `OWNER-CALLS.md` gets a `merge=union` line in the `.gitattributes` template (owner's call, default taken under `--auto`, 2026-11-11). `/rebase-project` untracks `.trd-state/current.json` with `git rm --cached` and stages the change, never commits it (owner's call, default taken, 2026-11-11).

### 2. Merge-up re-proves only what changed

- Brief: Stop a merge of the base into a PR branch from causing a full re-run of the checks, a full re-proof of the success criteria, a custody re-anchor, a merge refusal because the head moved, and another resume. After a merge-up, re-prove only the criteria whose covered files differ between the old merge base and the new one, re-anchor custody on the new head, and go on to merge in the same pass. The pieces exist: `packages/core/lib/custody.js` already returns `reused` criteria whose covered files did not change, and the evidence checker reuses an artifact while its covered files are byte-identical; today base-excused paths still put every criterion that covers them in doubt, and nothing compares the two merge bases. Also merge the base in only when GitHub reports the PR `CONFLICTING` (main already does this in `packages/core/contracts/ship-primitive-merge.md` step 1) or when branch protection on the base requires an up-to-date branch and the PR is behind (not handled today; `gh pr merge` fails). Done when, on a fixture, a merge-up that touches none of a feature's covered files dispatches no Exercise or Judge agents and costs at most one CI run.
- Dependencies: Per-feature framework writes (related)
- How it will be checked: a Jest test beside `packages/core/lib/custody.test.js` and `packages/core/lib/ship-build.seam.test.js` with a fixture repository and stubbed `gh`: a merge-up touching no covered file yields zero re-verified criteria, one custody re-anchor and a merge with no second resume; one touching a covered file re-proves exactly that criterion; run with `npx jest packages/core/lib/custody.test.js packages/core/lib/ship-build.seam.test.js`.
- Route: plan
- Route rigor: solo
- Deferred checks: the live count "at most one CI run" on a real GitHub pull request waits on a GitHub fixture repository being listed in `.claude/rules/verification.md` (none is today; the owner adds one with `/verification-setup`).
- Dates: none
- Decisions: the live GitHub CI-run count is deferred and proved locally with stubbed `gh` meanwhile (owner's call, default taken, 2026-11-11).

### 3. CI baseline check in ship-setup

- Brief: Teach the `ship-setup` skill (`packages/skills/ship-setup/SKILL.md`) to check the project's CI and report each gap: there is one always-reporting summary check (a job that reports on every push, so a required check is never left pending), heavy jobs are skipped on docs-only and record-only pushes (record files as `isRecordFile` in `packages/core/lib/record-files.js` defines them), and custody or ship-record commits do not run the full suite. The check is deterministic, so it lives in a library with a CLI that the skill calls, and it reports rather than edits: the skill names each gap in its readout and writes no workflow file beyond the resume trigger it already installs. Watch the trap that a `[skip ci]` head commit leaves required checks pending forever; the summary check is what prevents it.
- Dependencies: none
- How it will be checked: Jest tests for the new library over fixture workflow files (one with no summary job, one with no path filter, one that runs the full suite on record-only commits, one that passes), run with `npx jest <that test file>`; and a fixtures-environment run of `ship-setup` on a scaffolded fixture repository whose CI lacks a summary job, whose readout names the gap.
- Route: plan
- Route rigor: solo
- Deferred checks: none
- Dates: none
- Decisions: the check runs in `/ship-setup` only, not `/init-project` (owner's call, default taken, 2026-11-11).

### 4. Flaky CI jobs filed and capped

- Brief: Make wait-ci's flaky list do something. Today `packages/core/contracts/ship-primitive-wait-ci.md` reruns a failed job once and lists a rerun-pass in `data.flaky`, and nothing reads it. The first time a job is seen flaking, file it as a follow-up through the existing `file-followups` primitive (`packages/core/contracts/ship-primitive-file-followups.md`, which today imports only not-verifiable criteria and `/task` follow-ups), once per job. Count flakes per job name, and once a job has flaked 3 times, stop treating a pass on rerun as passing: wait-ci returns `failed` for it. Keep the flake history per feature under `.trd-state/<feature>/` and count across features by reading all of them, so the history adds no shared mutable file.
- Dependencies: Per-feature framework writes (related)
- How it will be checked: Jest tests (beside `packages/core/contracts/ship-primitives.test.js` or a new library's test) where a rerun-pass yields one filed follow-up row the first time and none the second, and a third flake of the same job yields `failed`; run with `npx jest <those files>`.
- Route: plan
- Route rigor: solo
- Deferred checks: none
- Dates: none

## Open questions

- Who writes `OWNER-CALLS.md`? No Ensemble command, library or hook writes it (`git grep OWNER-CALLS` over `packages/` finds nothing) -- assumption: it is written outside Ensemble (Forge or the project's sessions) and is an append-only shared log, so item 1 adds a `merge=union` line for it and does not move it; asked of: owner (owner's call, default taken under `--auto`).
- May `/rebase-project` untrack `.trd-state/current.json` in an existing project? -- assumption: yes, with `git rm --cached` so the file stays on disk, staged for the owner's next commit and never committed by the command; asked of: owner (owner's call, default taken).
- How is the change-2 promise "at most one CI run" proved live, when no GitHub fixture repository is listed in `verification.md`? -- assumption: proved locally with stubbed `gh`, and the live count deferred until the owner lists one; asked of: owner (owner's call, default taken).
- `/ship-setup` or `/init-project` for the CI check? -- assumption: `/ship-setup`, which already owns shipping setup; source: brief.md says "/ship-setup (or /init-project)"; asked of: owner (owner's call, default taken).
- Ship path for this repository -- settled by source: `CLAUDE.md` "## Forge", "Shipped" names CI `.github/workflows/ci.yml`, which exists; it references no secrets; no item touches migrations.
