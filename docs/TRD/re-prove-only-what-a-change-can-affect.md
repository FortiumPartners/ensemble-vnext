# TRD: re-prove-only-what-a-change-can-affect

**Source PRD**: None — small change decided by the owner's plan (`docs/plans/ship-cost-reduction/roadmap.md` item 2, owner-approved 2026-11-11)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Under the default rules, a change since the custody anchor that touches only docs, only a dependency manifest or lockfile, only a CI workflow file, or only `OWNER-CALLS.md` asks for no re-proof (`custody.js reconcile` returns `none` or `moved`, never `reverify`) | roadmap item 2 brief, parts (b), (c), (d); acceptance line | yes |
| O2 | A shipped-code change re-proves only the must-pass criteria whose recorded covered files include a changed path; every proven criterion that maps to a TRD task carries such a record, so the "no record → re-prove on any shipped change" fallback applies only to a criterion with truly no record | roadmap item 2 brief, part (a) and (d) "a shipped change re-proves only the criteria whose covered files changed" | yes |
| O3 | The tier rules are a per-product setting, `ensemble.reproof` in `.claude/settings.json`: absent means the defaults, a valid override changes the outcome, an invalid value stops custody with a reason naming the setting, and `scaffold-project.sh --refresh` never overwrites an owner's value | roadmap item 2 brief, part (d) | yes |
| O4 | Covers are recorded at the moment criteria are proven: `/implement-trd` and `/verify-build` record them for every `met` criterion after the verification loop returns | roadmap item 2 brief, part (a) "record covers for every criterion when it is proven" | |

## Intended Change

**Before** (read 2026-11-11, `packages/core/lib/custody.js`):

- `classifyPath` knows three classes: `ignored` (record files and the work's TRD), `test-only`, `shipped`. A doc, a lockfile or `.github/workflows/ci.yml` is `shipped`.
- `isRecordFile` (`record-files.js`) matches only `.claude/verification-notes.md` and `.trd-state/**`; `OWNER-CALLS.md` is `shipped`.
- `affectedIds` finds a criterion's covered files only through the live-evidence manifest (artifact → `covers`), which only `[LIVE]` tasks write. Every other must-pass criterion has no record, so `if (!covers) return ... || shipped.length > 0` puts it in doubt on any shipped change — a docs edit re-proves almost everything.
- No setting governs any of this.

**After:**

1. `classifyPath(p, trdRel)` returns one of `ignored`, `test-only`, `ci-config`, `deps`, `docs`, `shipped`, checked in that order:
   - `ci-config`: `.github/workflows/**`, `.github/actions/**`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `bitbucket-pipelines.yml`, `Jenkinsfile`, `.circleci/**`, `.buildkite/**`.
   - `deps` — **lockfiles only** (exact basename, any depth): `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `bun.lockb`, `Pipfile.lock`, `poetry.lock`, `uv.lock`, `Gemfile.lock`, `go.sum`, `Cargo.lock`, `composer.lock`, `mix.lock`, `pubspec.lock`, `Podfile.lock`, `packages.lock.json`. Manifests (`package.json`, `pyproject.toml`, `Gemfile`, `mix.exs`, ...) stay `shipped`: they carry entry points, scripts and config (OQ-3).
   - `docs`: first path segment `docs` or `doc`, or a basename matching `/^(README|CHANGELOG|LICENSE|CONTRIBUTING|CODE_OF_CONDUCT|AUTHORS|NOTICE)(\.(md|markdown|txt|rst|adoc))?$/i`. **Not** every `*.md`: in this framework a `.md` under `packages/core/commands/` is shipped product. Consequence: the existing `classifyPath` table row `['docs/TRD/other.md', 'shipped']` (`custody.test.js:85`) becomes `docs` — change that expectation; do not special-case `docs/TRD/`.
2. **`compare()` keeps its meaning**: two commits differ on any path that is not `ignored` or `test-only` — so `docs`, `deps` and `ci-config` paths still make the pr-head, merge and deploy links and the `--head` local-HEAD guard fail, exactly as today. `check` reads no setting. The tiers act only inside `reconcile`, on what to re-prove.
3. `isRecordFile` also matches the root-level path `OWNER-CALLS.md` (exact, repo-relative). It stays the one definition; `classifyPath` and `mergeBase` both read it, so the merge-up step also union-resolves a clash in it. Being `ignored`, it never makes the links differ.
4. Tier setting, read by `reconcile` (not with `--set-only`, which compares nothing) from `<git toplevel>/.claude/settings.json` key `ensemble.reproof`:

   | Key | Allowed | Default | Meaning |
   |-----|---------|---------|---------|
   | `docs` | `none` \| `ci` \| `reprove` | `none` | docs-only change re-proves nothing |
   | `testOnly` | same | `ci` | left to CI |
   | `ciConfig` | same | `ci` | left to CI |
   | `deps` | same | `ci` | left to CI ... |
   | `depsReprove` | array of non-empty strings | `[]` | ... unless a listed package name appears, whole-word, on an added or removed line of `git diff --no-renames -U0 <anchor> <head> -- <lockfile>` |
   | `format` | `none` \| `reprove` | `none` | `--reason format` shortcut honoured; `reprove` disables it |
   | `shipped` | `covers` \| `all` | `covers` | `covers`: only criteria whose covers include a changed path (with the guards in 6); `all`: every must-pass criterion |

   Absent key → default. A value outside the allowed set, a non-array or non-string-element `depsReprove`, or `.claude/settings.json` that is not valid JSON → `reconcile` returns `refused` with a reason naming the setting (e.g. `ensemble.reproof.docs must be one of none, ci, reprove (got "skip")`). Unknown keys are ignored, as `readThresholds` (`docs-audit-assemble.js`) ignores them. Record files and the TRD are not configurable.
5. `reconcile` partitions the changed paths since the anchor (from its own `diffNames` of anchor..head, test-only included) by class. A path of a non-shipped class whose tier is `reprove`, or a lockfile hitting `depsReprove`, is **promoted** and puts **every** must-pass criterion in doubt; the base excuse does **not** soften a promoted path (promotion wins). When every differing and excused path is of a non-shipped class at tier `none` or `ci`, the anchor moves with no re-proof and the move rule says which: `tier-none` (all paths at `none`) or `tier-ci` (any at `ci`), and the reason names the classes (e.g. `moved: only docs, ci-config changed (left to CI)`). No new top-level result field.
6. Covers for every proven criterion, recorded by `live-evidence.js` into **one JSON file** `<stateDir>/evidence/criterion-covers.json` (`{version: 1, criteria: {<id>: {covers: [...], source: 'touches'|'task-row', ts}}}`), written whole and atomically (temp file + rename, merged with existing entries), so no line cap applies:
   - `deriveCriterionCovers({ trdPath, definitionPath, ids, cwd })` maps each criterion id to TRD tasks: the objective ids its definition row names (its `Must pass` cell, plus any declared objective id anywhere in the row) → tasks whose `Serves` includes one, plus any task id the row names. Covers = the union of those tasks' grounding **Touches**; a task with no Touches contributes the repo paths backticked in its Master Task List row that exist on disk. Repo-relative, forward-slash; absolute paths and `..` segments are dropped. No task or no path → no record.
   - `recordCriterionCovers(stateDir, map)` / `readCriterionCovers(stateDir)` (a `Map` id → covers; absent or unreadable file → empty map).
   - CLI: `node .claude/lib/live-evidence.js record-criteria --state-dir D --trd T --definition P [--state <verification-state.json>]` records every `met` id in the state file (default `<D>/verification-state.json`), prints one JSON line `{recorded: [...], none: [...]}`, exits 0 (non-zero only on a usage error).
7. `affectedIds` looks up covers per id: live-evidence artifact covers (unchanged) → criterion-covers record → no record (today's fallback, unchanged). Two guards, both conservative:
   - `shipped: 'all'` or any promoted path → every id is affected.
   - **Unclaimed-path guard:** a changed `shipped`-class path (not excused) that no record of any must-pass criterion names puts every must-pass criterion in doubt. Touches lists the files a task planned to edit, not everything a criterion depends on; a change to a file nobody claimed is the case where a record could under-cover.
8. `/implement-trd` (Step 8.4) and `/verify-build` (its outcome step) run `record-criteria` once after the verification workflow returns; a failure is one ISSUES line, never STUCK. `ship-custody-gate.md` step 4 names the setting. `docs/guides/ship-build.md` documents `ensemble.reproof`.

Checkable outcome: `npx jest packages/core/lib/custody.test.js packages/core/lib/record-files.test.js packages/core/lib/live-evidence.test.js` passes with the new cases in each task below; `bats packages/core/scripts/scaffold-project.test.sh` passes with the new refresh case. Before this change, the docs-only, lockfile, CI-workflow and `OWNER-CALLS.md` cases each return `reverify` for a no-covers must-pass criterion.

## Decision

- **Tiers act in `reconcile`, never in `compare()`.** `compare()` also decides the pr-head, merge and deploy links and the local-HEAD guard; a lockfile or build workflow does change the built artifact, so those links must keep failing on it. Reconcile decides only whether a change needs re-proof, and moves the anchor when it does not — so by the time a link is checked, the anchor already includes the change. NOT "make the new classes non-differing in `compare()`" (plan review finding: weakens the deploy and merge checks).
- **A promoted path puts every must-pass criterion in doubt, and the base excuse does not soften it.** No covers record names a lockfile or a workflow, so matching would make `reprove` a no-op for exactly the files an owner promotes.
- **Unclaimed shipped paths fall back to all-criteria.** Covers come from planned Touches; the saving holds for changes inside the feature's own files (the common case: review fixes, merge-ups) and is safely withheld for anything else.
- **`depsReprove` matches package names on the lockfile diff's `+`/`-` lines**, whole-word. NOT "parse every lockfile format": seventeen formats for one boolean.
- **Covers are derived from the TRD at proof time and recorded, never re-derived inside custody.** #101 rejected TRD parsing in custody (`docs/TRD/merge-up-reproves-only-changed.md` Decision); recording at proof time keeps that.
- **Criterion covers live in one JSON file written atomically, not the append-only manifest.** One writer, no interleaving risk, and no 2048-byte cap that would reject exactly the multi-task criteria where the saving is largest. Paths, not hashes: custody compares changed paths between commits.
- **No `scaffold-project.sh` change.** Absent means defaults (the `ensemble.docsAudit.thresholds` pattern, which scaffold does not backfill either), so a refresh never writes the key. A BATS case guards that an owner's value survives `--refresh` (a regression guard, not proof of new code). NOT "backfill with setdefault": that freezes today's defaults into every project.
- **Lazy require for the derivation.** `functional-verification.js` requires `live-evidence.js` at load; `deriveCriterionCovers` requires `trd-parser.js` and the table helpers inside the function.
- **Weight stays small after the review.** The review's findings changed how the four parts are written, not their count; with them applied, an audit would re-read the same files for the same questions.

absorbed: none.
not absorbed: `.claude/settings.json` classifies as `shipped` — correct (it changes hooks and behaviour), not in this fix's path.
known cost: a criterion that now has a record is re-proved on a merge-up that changes a file on its list, where today a no-record criterion keeps its proof across base-only changes. Safe; rarer than the saving.

## Non-Goals

- Retrying a failed re-proof (roadmap item 3), sizing CI fixes (item 4), merge-step loops (item 5), re-proof results in `shipped.json` (item 6), the custody anchor timing (item 1).
- Changing what a re-proof does once asked for; changing `.claude/settings.json` of this repository.
- Owner-extensible path patterns for the new classes.
- Moving run records off the product branch; anything only Storybook needs; Forge's side.

## Verification Artifacts

None apply — library and command-prose change with no screen, data view or design; Jest and BATS cases are the evidence.

## Verification Environment
**Environment**: local
**Refresh**: none declared — tests read the working tree
**Cannot be checked there**: nothing known

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Default tier rules | The strategy report's tier table as the roadmap states it, `depsReprove` empty (roadmap open question, default taken under `--auto`) | owner-only |
| OQ-2 | Which files count as docs | `docs/`, `doc/` and exact README/CHANGELOG/LICENSE-style basenames, never every `*.md` (prompts are product here); an owner who serves `docs/` sets `docs: reprove` | owner-only |
| OQ-3 | Do dependency manifests count as `deps`? The roadmap says "manifests and lockfiles" | Lockfiles only; manifests stay `shipped` (still narrowed by covers), because `package.json`, `pyproject.toml`, `mix.exs`, `Gemfile` carry scripts, entry points or code (plan review finding; default taken unattended, 2026-11-11) | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | `isRecordFile` matches root `OWNER-CALLS.md` | O1 | None | `record-files.test.js`: `OWNER-CALLS.md` is a record file, `docs/OWNER-CALLS.md` and `OWNER-CALLS.md.bak` are not; `classifyClash(['OWNER-CALLS.md'])` is record-only. `custody.test.js`: a change of only `OWNER-CALLS.md` since the anchor, with a no-covers met must-pass criterion, returns `none` (fails today: `reverify`) |
| FIX-002 | Criterion covers: derive, record (one atomic JSON file), read, CLI `record-criteria` in `live-evidence.js` | O2, O4 | None | `live-evidence.test.js`: derivation from Touches via `Serves`; from a task id named in the row; task-row fallback when a task has no Touches; no record when nothing maps; `..`/absolute paths dropped; a second record merges with the first (both ids readable) and a re-record of one id replaces it; a criterion with 60 covered files is recorded intact; unreadable file reads as empty; CLI records only `met` ids and prints `{recorded, none}`; **real-data case**: `deriveCriterionCovers` on `docs/TRD/ci-baseline-check.md` + `.trd-state/ci-baseline-check/success-definition.md` returns a non-empty record for every criterion whose `Must pass` cell names an objective |
| FIX-003 | New change classes, `ensemble.reproof` setting, tier-aware `reconcile` and `affectedIds` in `custody.js`; `compare()`/`check` unchanged in meaning | O1, O2, O3 | FIX-001, FIX-002 | `custody.test.js`, each in a temp repo with a no-record met must-pass criterion B and a recorded one A: docs-only, lockfile-only, `.github/workflows/ci.yml`-only each return `moved` (never `reverify`) under defaults (each fails today), docs-only with move rule `tier-none` and the workflow case `tier-ci`; a shipped change to a file in A's record re-proves A only — B is not affected only because the unclaimed-path guard is not triggered, so the case asserts `ids` equals `['A']` with B's record naming a different file; a shipped change to a file no record names re-proves A and B; `docs: reprove` makes docs-only return `reverify` with every must-pass id; `depsReprove: ["left-pad"]` with `left-pad` on a changed lockfile line returns `reverify`, a lockfile change not naming it does not; a promoted lockfile that came in from the base (excused) still returns `reverify`; `shipped: all` re-proves B when only A's file changed; `format: reprove` disables the formatter shortcut; `docs: "skip"`, `depsReprove: "x"` and unparseable settings each return `refused` naming the setting, an unknown key is ignored, `--set-only` succeeds with an invalid setting; `check --link merge` still fails on a docs-only difference from the anchor; `classifyPath` table covers every new class, `docs/TRD/other.md` is `docs`, `package.json` and `packages/core/commands/x.md` stay `shipped`, `README.tpl` stays `shipped` |
| FIX-004 | Record covers when proven; document the setting; guard that scaffold keeps an owner value | O3, O4 | FIX-002, FIX-003 | `implement-trd.md` Step 8.4 and `verify-build.md`'s outcome step each carry the `record-criteria` call with "a failure is an ISSUES line, never STUCK" (asserted by a Jest prose test); running that exact CLI line against `.trd-state/ci-baseline-check` in a temp copy writes `evidence/criterion-covers.json` with a record for every must-pass criterion (Jest); `ship-custody-gate.md` step 4 and `docs/guides/ship-build.md` name `ensemble.reproof`, its defaults and the `tier-none`/`tier-ci` move rules; `scaffold-project.test.sh` case: a project whose `.claude/settings.json` has `ensemble.reproof.docs = "reprove"` keeps it after `--refresh` (regression guard) |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/record-files.js`, `packages/core/lib/record-files.test.js`, `.claude/lib/record-files.js`, `packages/core/lib/custody.test.js`
- **Reuse:** `NOTES_FILE` constant pattern in `record-files.js`; add `OWNER_CALLS_FILE = 'OWNER-CALLS.md'` beside it [read]
- **Replaces:** nothing; widens `isRecordFile` and its header comment ("RECORD FILES: ...") [read]
- **Follow:** `.claude/lib/record-files.js` is a byte copy of `packages/core/lib/record-files.js` (`packages/full/lib/*` are symlinks to `packages/core/lib`); copy after editing [ran: `cmp`, `ls -la`]
- **Careful:** `isRecordFile` also drives `mergeBase`'s union resolution and `dirtyTracked` refusal — `OWNER-CALLS.md` is an append-only log, so union is right; keep the match exact (root path only), the roadmap names one file [read]

### FIX-002
- **Touches:** `packages/core/lib/live-evidence.js`, `packages/core/lib/live-evidence.test.js`, `.claude/lib/live-evidence.js`
- **Reuse:** `implement-state.js` `save` (atomic write, as `custody.json` uses) — require it lazily or directly (it requires only `fs`/`path`, no cycle); `parseTrd` from `trd-parser.js` (`tasks[].serves`, grounding `touches`); `objectiveRows`, `findTables`, `maskFencedLines` as `mustPassCoverageFromFiles` uses them in `functional-verification.js` (lines ~753-772) for the definition's `ID` / `Must pass` columns [read]
- **Replaces:** nothing; the artifact manifest and its CLI verbs are unchanged [read]
- **Follow:** whole-file JSON written atomically, merged with existing entries; CLI `main` returns an exit code and writes one JSON line; repo-relative forward-slash paths (custody compares in that form) [read]
- **Careful:** `functional-verification.js` requires `live-evidence.js` at line 41 — require `trd-parser`/`functional-verification` inside `deriveCriterionCovers`, never at module top, or the load cycle returns a half-built module [read]. Reject absolute paths and `..` segments in a covers path. A TRD with an unparseable grounding block yields task-row fallback, not a throw.

### FIX-003
- **Touches:** `packages/core/lib/custody.js`, `packages/core/lib/custody.test.js`, `.claude/lib/custody.js`
- **Reuse:** `readThresholds` in `docs-audit-assemble.js` (lines 81-115) as the read/validate/name-the-setting pattern; `compare`, `diffNames`, `run` in `custody.js`; `readCriterionCovers` from FIX-002; the existing temp-repo helpers in `custody.test.js` [read]
- **Replaces:** the three-class `classifyPath` return type and its header comment block "CODE EQUALITY (D9, D10)"; `compare()`'s filter `=== 'shipped'` becomes "not `ignored` and not `test-only`" (same meaning, new class names); the single covers lookup in `affectedIds` (line ~296-306) [read]
- **Follow:** every expected failure is `{action: 'refused', reason}` (reconcile) or `{ok: false, reason}` (check), never a throw; settings read from `git rev-parse --show-toplevel` + `.claude/settings.json`; header comment documents the classes, the tier table and promotion [read]
- **Careful:** a promoted path is never softened by the BASE EXCUSE (promotion wins); keep `reason === 'format'` behaviour identical under the default; `check` and `--set-only` read no setting; tier classification in `reconcile` must include test-only paths, which `compare()` drops. The no-success-definition branch (`custody.js:461`) keeps moving the anchor before any tier logic matters. Existing tests assert exact result objects in places — add no new top-level result field. Commit the test repo's `.claude/settings.json` in the base commit, or it shows up as a `shipped` diff [inferred]

### FIX-004
- **Touches:** `packages/core/commands/implement-trd.md`, `packages/core/commands/verify-build.md`, `packages/core/contracts/ship-custody-gate.md`, `.claude/commands/implement-trd.md`, `.claude/commands/verify-build.md`, `.claude/contracts/ship-custody-gate.md`, `docs/guides/ship-build.md`, `packages/core/scripts/scaffold-project.test.sh`, `packages/core/commands/record-criteria-prose.test.js`
- **Reuse:** Step 8.4 "Render the outcome" in `implement-trd.md` (line ~1940); `ship-custody-gate.md` step 4 "Report"; existing `--refresh` cases in `scaffold-project.test.sh` (search `openPullRequest`/`publishArtifacts` setdefault cases) [read]
- **Replaces:** nothing [read]
- **Follow:** command prose writes `.claude/lib/...` paths; prose tests read the command file and assert on a quoted sentence, as other `packages/core/commands/*.test.js` do [inferred]
- **Careful:** `.claude/commands/*` and `.claude/contracts/*` are byte mirrors of `packages/core/commands/*` and `packages/core/contracts/*` [ran: `cmp`] — copy after editing; do not touch `stamp_ensemble_version` in `scaffold-project.sh` [inferred]

## Could Not Verify

- That every real success definition names objective ids in a way `deriveCriterionCovers` can map; older definitions without a `Must pass` column and with no objective or task id in a row get no record and keep today's fallback (by design).
- The share of criteria that end up with a record on a real feature — measurable only on the next live `/implement-trd` run.
