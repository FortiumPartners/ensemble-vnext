# TRD: ci-baseline-check

**Source PRD**: None — small change, from workplan ship-churn-fixes item 3 (`docs/plans/ship-churn-fixes/roadmap.md`, "3. CI baseline check in ship-setup"), the owner's instruction via the Forge PM, 2026-11-11

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A library with a CLI reads a project's GitHub Actions workflow files and reports, for each of three properties, whether it holds, is missing (a gap, named), or cannot be told from the file (unclear, named): (a) one always-reporting summary check, (b) heavy jobs skipped on docs-only and on record-only pushes, (c) custody / ship-record commits do not run the full suite | roadmap item 3, Brief and "How it will be checked", 2026-11-11 | yes |
| O2 | The library's unit tests run over fixture workflow files: one with no summary job, one with no path filter, one that runs the full suite on record-only commits, one that passes — each yields exactly the expected gaps | roadmap item 3, "How it will be checked" | yes |
| O3 | The `ship-setup` skill calls the CLI and names each gap (and each unclear property) in its readout's ISSUES, and writes no workflow file beyond the resume trigger it already installs | roadmap item 3, Brief | yes |
| O4 | "Record file" in the check means exactly what `isRecordFile` in `packages/core/lib/record-files.js` defines; the check holds no second definition | roadmap item 3, Brief | |

## Intended Change

Today `ship-setup` reads no CI configuration at all [read: `packages/skills/ship-setup/SKILL.md`; its only workflow is `ensemble-ship-resume.yml`]. After this change:

1. `node .claude/lib/ci-baseline.js check [--dir <workflows dir>]` (default `.github/workflows`) prints one JSON line and exits 0:
   `{ ok, noCi, workflows: [files read], checks: { summary, docsRecordSkip, recordCommitSkip }, gaps: [{check, message}], unclear: [{check, message}] }`
   where each `checks.<name>` is `{ status: "pass" | "gap" | "unclear", detail }` and `ok` is true only when all three are `pass`.
2. Run against **this repository's own** `.github/workflows/` it reports all three as `gap` (its `ci.yml` has no summary job, no path filtering, and a `pull_request` trigger that runs every job on every commit) — a real before/after witness that the check can fail.
3. `ship-setup` gains a CI-baseline step: it runs the CLI, and its readout's ISSUES lists each gap and each unclear property in plain words with how to close it; STATE says the CI check ran and how many of three properties hold. It still writes only `ship.md` and (on the owner's yes) the resume workflow.

### What each property means, concretely (the check's definitions)

**Scope.** The check reads every `.github/workflows/*.yml|yaml` that runs on work-in-progress branches: a workflow triggered by `pull_request` / `pull_request_target`, or by `push` with no `branches:` list or with `branches-ignore:`. A workflow that runs only on pushes to named branches (e.g. `push: branches: [main]`) runs on merge commits, not on PR work, and is out of scope. **Heavy jobs** are every in-scope job except the summary job, the change-detection job (a job whose outputs another job's `if:` reads), and event-scoped jobs (whose `if:` mentions `github.event_name` or `github.ref` — e.g. a deploy that runs only on push).

- **Summary check (a)** passes when some in-scope workflow triggered by `pull_request` has **no trigger-level `paths` / `paths-ignore`** and holds a job that (1) has `if:` containing `always()` or `!cancelled()`, (2) lists every other non-event-scoped job of that workflow in `needs:`, and (3) reads its needs' results — `needs.*.result`, `needs.<job>.result`, `toJSON(needs)`, or a step using `re-actors/alls-green`. Without (3) the job reports success when the tests fail; without (1) a job skipped by `if:` counts as success. A trigger-level path filter on the summary's workflow is a gap: the whole workflow is skipped on a filtered push and a required check sits pending. A `[skip ci]` head commit skips every workflow, the summary's included, so the readout also says record commits must never carry `[skip ci]` — the summary check prevents pending checks on *filtered* pushes, not on `[skip ci]` ones.
- **Docs/record skip (b)** passes when every heavy job in scope is skipped on a docs-only change set and on a record-only change set, **by a job-level condition inside a workflow without a trigger-level path filter**. A trigger-level `paths` / `paths-ignore` on any in-scope workflow holding heavy jobs is a gap (that workflow vanishes on filtered pushes, so its checks pend if required or are never gated by the summary). A heavy job with no `if:` is a gap. Recognised job conditions: the `if:` (with `${{ }}` stripped) is a conjunction (`&&`) of terms, each either `needs.<X>.outputs.<Y>` / `needs.<X>.outputs.<Y> == 'true'` or one of `success()`, `always()`, `!cancelled()`; any other form is `unclear`, naming the job. `<X>.outputs.<Y>` is followed to `steps.<id>.outputs.<f>`; the step `<id>` must use `dorny/paths-filter` with an inline `filters:` block scalar (itself parsed as YAML); a `filters:` given as a file path, `predicate-quantifier: every`, or a `run:` script detector is `unclear`. Dorny semantics, pinned by tests: a file matches filter `<f>` when **any** of its patterns matches it, a `!p` pattern matching when `p` does not (picomatch, `dot: true`, so dotfiles such as `.trd-state/...` match `**`). The job is skipped on a probe when no probe file matches. Probes:
  - docs-only: `README.md`, `docs/guide.md`
  - record-only: `.trd-state/feature/custody.json`, `.trd-state/feature/shipped.json`, `.claude/verification-notes.md` — each asserted `isRecordFile(p) === true` at load time (O4).
- **Record-commit skip (c)** passes when a custody or ship-record commit pushed onto an open PR does not run the heavy jobs. On `pull_request`, `dorny/paths-filter` ignores `base:` and reads the whole PR diff from the API, so a dorny gate on a `pull_request` workflow **is a gap for (c)** unless the step sets `token: ''` and a `base:` reading `github.event.before` (git mode, diffing the pushed commits). A `run:` detector passes when its script references `github.event.before` and names `.trd-state`; references `github.event.before` without `.trd-state` → `unclear`; otherwise `unclear`. On a `push`-triggered in-scope workflow dorny already diffs against `github.event.before`, so (c) follows (b)'s record-only result there. Commit-message conditions are not recognised: `head_commit` is absent on `pull_request`, and on `push` a message gate on the last commit would skip tests for a code commit pushed alongside a record commit.

## Decision

Build `packages/core/lib/ci-baseline.js` as a **dependency-free** Node module (only `fs`, `path`, and `./record-files`), with three pure check functions over parsed workflows, a CLI `check` subcommand, and the same "one JSON line, exit 0" CLI convention as `record-files.js`.

- **YAML: a small built-in reader for the subset GitHub workflow files use** (block maps, block sequences, flow sequences and maps of scalars, `|`/`>` block scalars, quoted scalars, comments). NOT `js-yaml`: it is a devDependency of this repository only, and `.claude/lib/*.js` is copied into consuming projects that have no `node_modules` (`scaffold-project.sh` `copy_libs`). A file the reader cannot parse (anchors, aliases, tags, multi-document) is reported `unclear` for every check, naming the file — never a crash and never a pass. The tests hold the reader to `js-yaml`'s output on every fixture and on this repository's real workflow files, so the subset is checked, not assumed.
- **Report, never edit.** The library writes nothing; the skill gains no new write. Closing a gap is the owner's edit to their own CI (and `.github/workflows/` is not owner-governed in this framework, but the brief is explicit that ship-setup reports).
- **Three-state result, not pass/fail.** A mechanism the check cannot evaluate is `unclear` with the job named, because calling an unreadable condition a pass is the failure the roadmap's churn came from, and calling it a gap would nag owners whose CI is fine.
- **Runs in `ship-setup` only, not `/init-project`** — owner's call, default taken (agent, 2026-11-11).
- Rejected: a regex scan of the workflow text — it cannot tell which job a `needs:` or `if:` belongs to, which all three checks depend on.
- Rejected after review: evaluating trigger-level path globs (any such filter on a workflow with heavy jobs is itself the gap, so no GitHub glob matcher is needed); passing (c) on dorny `base:` alone or on a commit-message `if:` (both are false passes, see (c)).
- `.claude/` vendored copies: the lib, SKILL.md and the skill's test are copied byte-identical (the `.claude/skills/ship-setup/__tests__/skill-md.test.js` copy is already stale and is refreshed with it).

## Non-Goals

- Editing any workflow file, including this repository's own `ci.yml` (its three gaps are a finding for the owner, not this feature's work).
- CI systems other than GitHub Actions (`.gitlab-ci.yml` etc.): reported as `noCi` with a one-line note when no `.github/workflows/*.yml|yaml` exists.
- Running the check from `/init-project`, `/ship-build` or any other command.
- Items 1, 2 and 4 of the ship-churn-fixes plan (per-feature writes, merge-up re-proof, flaky-job capping) — built separately.
- Changing `isRecordFile` or what counts as a record file.

## Verification Artifacts

None apply — the deliverable is a CLI library and a prompt edit; no screen, design, data-rendering view or journey is in scope (trd-authoring.md Section 9a triggers: none).

## Verification Environment
**Environment**: local (this working tree: `npx jest`), and fixtures (a headless session in a scaffolded fixture repo) for the skill's readout
**Refresh**: local — nothing; fixtures — `packages/core/scripts/scaffold-project.sh --refresh --plugin-dir packages/full <slot folder>`
**Cannot be checked there**: whether GitHub itself would leave a required check pending — the check reads files; it does not observe a live GitHub run.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should the check also run from `/init-project`? | No — ship-setup only, per the recorded default (2026-11-11) | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Create `packages/core/lib/ci-baseline.js`: workflow-subset YAML reader, GitHub glob matcher, the three checks as defined in Intended Change (single-shape model: job-level gating in an unfiltered workflow; dorny filter evaluation with `dot: true` any-match semantics), the `check` CLI; add the `packages/full/lib/ci-baseline.js` symlink and the vendored copy `.claude/lib/ci-baseline.js` | O1, O4 | None | `node packages/core/lib/ci-baseline.js check --dir .github/workflows` on this repo prints `ok:false` with all three checks `gap`; on a directory with no workflow files prints `noCi:true`; never throws (bad YAML → `unclear`); requires no module outside Node built-ins and `./record-files`; `.claude/lib/ci-baseline.js` is byte-identical to the source |
| FIX-002 | Jest suite `packages/core/lib/ci-baseline.test.js` over fixtures in `packages/core/lib/__fixtures__/ci-baseline/`: no-summary, no-path-filter, full-suite-on-record-commits, passing, plus: summary under a trigger-level path filter; summary with `always()` but no needs-result read (gap); heavy jobs split into a second trigger-filtered workflow (gap); dorny with `base: github.event.before` but default token on `pull_request` (gap for c); dorny `token: ''` + `base` (pass c); `run:` detector with/without `.trd-state` (pass/unclear); event-scoped deploy job (excluded, not unclear); an unparseable file; a dotfile pin (`**` matches `.trd-state/...`); and a reader-equivalence test against `js-yaml` for every fixture, this repo's `.github/workflows/*.yml`, `ensemble-ship-resume.yml`, and a stress fixture (`${{ }}` in plain scalars, `run: echo a: b`, `'it''s'`, trailing comments, a nested `filters:` block scalar) | O1, O2, O4 | FIX-001 | Each named fixture yields exactly its expected `gaps` / `unclear` set (asserted by check name), the passing fixture yields `ok:true` with no gaps; a test fails if any record-only probe path is not `isRecordFile`; the CLI test spawns the script and parses its one JSON line; `npx jest packages/core/lib/ci-baseline.test.js` passes |
| FIX-003 | Teach `packages/skills/ship-setup/SKILL.md` the CI-baseline step: an Inputs row for the CLI, a section that runs `node .claude/lib/ci-baseline.js check` and turns each gap/unclear into a plain-words ISSUES line with its fix (summary job with `if: always()`, full `needs:` and a step failing on any `failure`/`cancelled` in `needs.*.result`; no `[skip ci]` on record commits; job-level skips for docs and `.trd-state/` instead of trigger-level path filters; for record commits on a PR, change detection that diffs `github.event.before` — e.g. `dorny/paths-filter` with `token: ''` and `base: ${{ github.event.before }}` after a `fetch-depth: 0` checkout), STATE line for the result; Never section keeps "only `ship.md` and the resume workflow". Copy SKILL.md and the test to `.claude/skills/ship-setup/`; extend `packages/skills/ship-setup/__tests__/skill-md.test.js`; one paragraph in `docs/guides/ship-build.md` | O3 | FIX-001 | skill-md test asserts the SKILL.md names `ci-baseline.js check`, names all three properties in its readout guidance, and its Never section still forbids editing files other than `ship.md` and the resume workflow; `npx jest packages/skills/ship-setup` passes; the vendored copy is identical |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/ci-baseline.js`, `packages/full/lib/ci-baseline.js`, `.claude/lib/ci-baseline.js`
- **Reuse:** `isRecordFile` from `packages/core/lib/record-files.js` for the record-only probe; the CLI shape of `record-files.js` `main()` (one JSON line, exit 0, `flag()` helper, `require.main === module` guard) [read]
- **Replaces:** nothing — ship-setup reads no CI today [read]
- **Follow:** `.claude/lib/*.js` are plain copies (runtime-integrity test compares `packages/core/lib` with `.claude/lib`); `packages/full/lib/*.js` are relative symlinks `../../core/lib/<file>` [ran: `ls -la`]; `copy_libs` skips `*.test.js` so fixtures never ship [read]; `ci-baseline.js` itself requires no `child_process` (record-files.js does, harmlessly) and writes nothing
- **Careful:** do not `require('js-yaml')` — absent in consuming projects [read: `package.json` devDependencies, `scaffold-project.sh` `copy_libs`]; `on:` may be a string, a list or a map, and YAML 1.1 parsers read a bare `on` key as boolean `true` (js-yaml does not; GitHub does not) — key it as the string `on`; `needs:` may be a string or a list

### FIX-002
- **Touches:** `packages/core/lib/ci-baseline.test.js`, `packages/core/lib/__fixtures__/ci-baseline/`
- **Reuse:** `js-yaml` (devDependency, already used by `skill-md.test.js`) as the reference parser [read]; spawn pattern from `packages/skills/ship-setup/__tests__/skill-md.test.js` `spawnSync('node', ...)` [read]
- **Replaces:** nothing
- **Follow:** fixtures live under `packages/core/lib/__fixtures__/` beside the existing ones [ran: `ls`]
- **Careful:** this repo's `.github/workflows/ci.yml` will change over time — assert only that it parses identically to `js-yaml`, not its gap set, in the unit test (the live gap set is a verification check, not a unit test)

### FIX-003
- **Touches:** `packages/skills/ship-setup/SKILL.md`, `.claude/skills/ship-setup/SKILL.md`, `packages/skills/ship-setup/__tests__/skill-md.test.js`, `.claude/skills/ship-setup/__tests__/skill-md.test.js`, `docs/guides/ship-build.md`
- **Reuse:** the skill's existing post-write checks pattern ("After writing, re-parse with the sequencer") for how it calls a lib and reports into ISSUES [read]
- **Replaces:** nothing
- **Follow:** `allowed-tools` already includes `Bash`; Never section wording "Edit any file other than `.claude/rules/ship.md` and, on the owner's yes, the workflow file" stays; the readout is the four-section form in `command-status.md`; skill-md tests check structure, not prose [read]
- **Careful:** the check is not a topic — it asks the owner nothing; a gap never stops the skill or changes `ship.md`; the CI check runs even when the owner skips every topic

## Could Not Verify

- The (c) recipe the skill recommends (dorny git mode with `base: github.event.before`) on a PR's first push, where `github.event.before` is absent — the skill's text says to treat that push as changing everything.
- That a required check is actually left pending on GitHub under each gap shape — the check reasons from GitHub's documented trigger and path-filter semantics; no live GitHub run is exercised for this feature.
- The fixtures-environment run named in the roadmap ("a scaffolded fixture repository whose CI lacks a summary job, whose readout names the gap") needs an interactive skill driven through a session; `ship-setup` is `disable-model-invocation: true` and interviews the owner, so that run is the functional-verification loop's to attempt, not a unit test.
