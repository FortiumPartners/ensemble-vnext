# Investigation: narrow-reproof-scope

**Kind**: change
**Weight**: medium
**Route**: plan

Source: GitHub issues #153, #154, #155 in FortiumPartners/ensemble-vnext, taken as one change by the
owner (2026-11-16). Owner ruling 2026-11-16: keep quality, but no full re-runs that add no new value.
Related issue #157 (one shared rerun-scope rule) is a separate feature: this change depends on none
of its code and reports scope with the same three words, `none`, `targeted`, `full`.

**Source spec**: none (the issue texts are the source; there is no section carrying acceptance criteria).

## Objectives

| ID | Objective | Source | Must pass | Off-host proof |
|----|-----------|--------|-----------|----------------|
| O1 | Custody treats framework and housekeeping files as not shipped code: `.claude/**` except `.claude/rules/**`, `CLAUDE.md`, `.gitattributes`, `.gitignore`. `.claude/rules/**` and application source stay shipped. | issue #153, owner decision 2026-11-16 | | |
| O2 | When a merge-up changes a shipped-class file that no covers record names, custody puts in doubt only the criteria whose covers share that file's directory. A file nothing can be related to still widens to every must-pass criterion. | issue #153 | yes | |
| O3 | Before re-proving, custody states what changed since the anchor and the scope chosen (`none`, `targeted` or `full`) with the reason; the gate contracts say so. | issue #153 | | |
| O4 | Design criteria (`ST-<board id>` rows proved by verify-design-structure, `DC-<frame stem>` rows proved by verify-design-comparison) get covers built from `docs/ui/<slug>/design-map.json`: board route, the page file serving that route, and the files of the components the board names. A board that cannot be fully resolved stays without covers and is reported, never guessed. | issue #154, owner decision 2026-11-16 | yes | |
| O5 | The verification regression pass re-checks a criterion that has no covers record only when a changed file relates to it, not on any Debug edit; the report says how many criteria were re-checked and why, per reason, and names the scope (`none`, `targeted`, `full`). | issue #154 | | |
| O6 | A must-pass criterion proven by a named CI job is re-proved by re-running that job (or the run's failed jobs), never by dispatching the whole workflow; a job also red on the base branch head is reported as baseline, not as a failure of this feature. | issue #155 | | |
| O7 | The TRD authoring contract does not let a TRD declare a criterion whose only proof is a full manual CI run; the commands that handle a voided, missing or red declared proof name the single-job re-run. | issue #155 | | |

**Must pass** is marked on O2 and O4 only. A wrong narrowing there silently lets a changed build
through unverified (the merge gate and the regression pass are what stand between a Debug edit and a
green report); the rest is reporting and wording.

## Intended Change

Current behaviour, `[ran]` for the classification and `[read]` for the rest:

- `classifyPath('.claude/commands/plan.md')`, `('.claude/workflows/x.js')`, `('CLAUDE.md')`,
  `('.gitattributes')`, `('.gitignore')` all return `shipped` `[ran]`.
- `affectedIds` (`packages/core/lib/custody.js:465`) returns every must-pass id when any shipped-class
  changed path is named by no covers record (`custody.js:501`) `[read]`.
- `regressionScope` (`packages/core/workflows/verify-functional.js:3255`) re-checks every criterion with
  no covers record on any Debug edit that changed a file (`:3278`, reason `no-covers`) `[read]`.
  `deriveCriterionCovers` (`packages/core/lib/live-evidence.js:259`) takes covers only from TRD task
  Touches or backticked task-row paths, so `ST-` and `DC-` rows never get a record `[read]`.
- `lookupOffHostProofs` (`packages/core/lib/functional-verification.js:997`) reads the named job on
  HEAD only; `settleOffHost` (`verify-functional.js:1998`) says a voided proof is voided and nothing
  about how to re-prove it. `grep -rn "gh run rerun\|gh workflow run" packages/core` finds the targeted
  re-run only in `ship-primitive-wait-ci.md:35`, which `/ship-build` alone reads `[ran]`.

Intended outcome, in checkable terms:

1. `classifyPath` returns `docs` (a class that is not shipped and whose default tier is `none`) for
   `.claude/**` outside `.claude/rules/`, for any path whose basename is `CLAUDE.md`, `.gitattributes`
   or `.gitignore`. `.claude/rules/constitution.md` and `src/app.ts` stay `shipped`.
2. `affectedIds`, for a shipped changed path no record names: criteria that have covers and one of
   whose covers has the same directory as the path are in doubt; criteria with no record keep today's
   rule; every other criterion is `reused`. When no cover of any criterion shares the directory, the
   result is the full set as today. The result carries `scope` (`none` when no id is in doubt,
   `targeted`, `full`) and a one-line `scopeReason`; `reconcile` puts both, and the changed paths since
   the anchor, in its output.
3. A new library reads each design's `design-map.json`, resolves board route and component names to
   files through `.claude/rules/design.md` sections 2 and 3, and `deriveCriterionCovers` adds covers for
   `ST-<board id>` and `DC-<frame stem>` rows. All-or-nothing per board: an unresolved route or any
   unresolved component leaves that board with no covers, listed under `unresolved` with the reason.
4. `regressionScope`: a met criterion with no covers record is re-checked (`no-covers`) only when a
   counting change record names a code-class file (not a framework, housekeeping, doc, test, CI-config
   or lockfile path) that shares a directory with some recorded cover in the run, or when the run has
   no covers record at all. The pass returns a count per reason and the report prints it with a
   `scope` word.
5. `lookupOffHostProofs` takes an optional base ref, reads the same named job on the base branch head,
   and returns status `baseline` when the job concluded unsuccessfully on both. It also returns the job
   id. `settleOffHost` reasons for a voided or red proof name `gh run rerun <run-id> --job <job-id>`
   (or `--failed`), say "never `gh workflow run`", and say baseline for a baseline job.
6. `verify-build.md`, `implement-trd.md` and `trd-authoring.md` each contain `gh run rerun` and forbid
   a whole-workflow manual dispatch; `trd-authoring.md` says a criterion whose only proof is a full
   manual CI run is not declared, and that a local or single-job proof is preferred.

## Decision

Narrowing is by directory, deterministic, and widens to `full` whenever it cannot relate a change to a
criterion (owner decision 2026-11-16). No model call and no dependency on #157's code.

- **Framework files return `docs`, not a new class.** The `docs` class already means "not shipped code,
  default tier `none`", and `reconcile` moves the anchor with no re-proof for it. A new class would
  need a tier name in the `ensemble.reproof` setting for no gain.
  Rejected: a new `framework` class with its own setting (more surface, same behaviour).
- **Related means the same directory.** For a cover that is a file, its directory is `dirname(cover)`;
  for a directory cover, the directory itself. A changed path is related to a criterion when its
  `dirname` equals one of those. A path under a directory cover is already matched by `coverMatcher`
  today, so the widening rule only matters for paths that are not under any cover.
  The issue's custody example says "A covering `src/a/`", but that is already narrowed today because
  `src/a/new.ts` sits under it. The Jest case uses file covers (`src/a/x.ts`, `src/b/y.ts`), which is
  what fails today.
- **"Rendered at its route" is carried by the design covers, not computed.** Following imports from a
  page file to every file rendered would need a module graph. The design covers name the page file and
  each named component's file, and the directory rule catches a new sibling. A file reached only
  through imports that no cover shares a directory with still widens custody to `full` and, in the
  regression pass, re-checks a no-covers criterion only through the code-class rule in item 4.
- **Route to page file and component to file are resolved through `design.md`** sections 3 and 2
  (owner decision 2026-11-16). Section 3's "Route list" cell is read for lines pairing the route with a
  path (`/trips -> src/pages/Trips.tsx`, `/trips: src/pages/Trips.tsx`, a table row), and, when the
  cell names an existing file, that file's lines containing the route as a quoted literal. A candidate
  path resolves with extension probing (`.tsx .ts .jsx .js .vue .svelte`, then `/index.*`). Section 2's
  "Component library paths" are searched for `<Name>.<ext>`, `<Name>/index.<ext>` or a `<Name>/`
  directory, with the board's namespace prefix (everything up to and including the first `.`) stripped.
  A repo with an unfilled `design.md` resolves nothing and reports it.
  Rejected: a partial record from the pieces that resolved. A criterion covering the page but missing
  a component would read as "unchanged" when that component changed.
- **Frame to board for `DC-` rows**: `DC-<frame stem>` maps to the board whose id equals the stem.
  Any other stem gets no covers.
- **The no-covers rule.** `no-covers` in `regressionScope` becomes: a counting record changed a file
  that is code-class and shares a directory with any recorded cover in this run, or no cover is
  recorded anywhere (nothing can be related, so it widens as today). Code-class here uses the same
  non-shipped paths as custody item 1, plus tests, CI config and lockfiles. The script has no
  `require`, so it carries a small inline copy of that list, the same way it already carries
  `globToRegex`.
- **Baseline needs a base ref.** `lookupOffHostProofs({ base })`: `base` from the CLI `--base <ref>`,
  else `git symbolic-ref --short refs/remotes/origin/HEAD`; none found means no baseline check and
  today's `red`. The base head is `git rev-parse <ref>`; the run list is the same workflow filtered
  by that commit. A base run that is missing or unfinished leaves `red` as is. A job red on HEAD and
  green on base is `red`: that is this feature's failure.
- **A voided proof after a Debug edit** needs a new commit and a new CI run. The new reason text says
  so: push, wait for the run CI starts, and when a run for the head exists with the job red or stale,
  `gh run rerun <run-id> --job <job-id>`; never `gh workflow run`.
- **Scope vocabulary** is `none`, `targeted`, `full` everywhere it is reported, per the owner's note on
  #157. No code is shared with that feature.
- Not rejected but deferred: a `reproof` setting to switch the narrowing off. `ensemble.reproof.shipped:
  all` already forces full custody re-proof, and the regression pass has no setting today.

absorbed: none beyond the issues' own scope.
not absorbed: the ship-build primitive docs mentioning `gh run rerun --failed` (already correct, only the
verify side lacks it); changing `ensemble.reproof` defaults (not asked); a module graph for rendered
files (see Decision, deferred).

## Grounding

- `packages/core/lib/custody.js` `[read]`: `classifyPath` (139), `compare` (210-232, drops `ignored` and
  `test-only` but keeps `docs`, `ci-config`, `deps`), `partitionChanges` (421), `affectedIds` (465-512),
  `reconcile` outputs built with `out()` (671) in `reconcile` (640-730). `coverMatcher` is exported and
  is reused for directory and glob covers. Reuse it; do not write a second matcher.
  Hazard: `.claude/lib/custody.js` is a vendored copy, identical today `[ran: diff -q]`.
- `packages/core/lib/custody.test.js` `[read]`: `describe('classifyPath (D10)')` at 103,
  `describe('shipped changes re-prove by covers')` at 611 and the git-repo helpers that build a real
  repo per case. New cases go in those blocks.
- `packages/core/lib/live-evidence.js` `[read]`: `deriveCriterionCovers` (259-323) returns
  `Map<id, {covers, source}>`; `source` is `'touches'|'task-row'` and `recordCriterionCovers` rewrites
  any other source to `'touches'` (line ~335). A third source `'design-map'` needs both places. The CLI
  `derive-criteria` (line ~368) flattens to `{id: covers}`. `record-criteria` records only met ids.
- `packages/core/lib/design-map.js` `[read]`: `read(dir)` returns the parsed map; a board has `id`,
  `route`, `components` (namespaced, for example `FixtureWeb.Card`), `kind`, `status`, `platform`.
  Fixture with real shape: `test/fixtures/design/walk/boards/trips-refresh/design-map.json` `[read]`.
- `.claude/rules/design.md` `[read]`: section 2 table has a "Component library paths" column; section 3
  table has the "Route list" row. This repo's own file is unfilled; tests build their own.
- `packages/skills/verify-design-structure/SKILL.md` `[read]`: row id `ST-<board id>`;
  `packages/skills/verify-design-comparison/SKILL.md:59`: `DC-<frame stem>`.
- `packages/core/workflows/verify-functional.js` `[read]`: `CRITERION_COVERS` (136), `coverMatches` and
  inline `globToRegex` (3158-3207, "this script has no `require`"), `regressionScope` (3255), the
  caller logs scope at 3504 and builds the `record` at 3536; `settleOffHost` (1998). Hazard: the file
  is large and every other change in it risks the constraint tests at the top of its test file; run
  the whole `verify-functional.test.js`.
- `packages/core/lib/functional-verification.js` `[read]`: `lookupOffHostProofs` (997), `runCmd` (975),
  `renderReport` regression section (2139-2142), exports list at 2812.
- `packages/core/contracts/ship-custody-gate.md` (60: the `ensemble.reproof` paragraph) and
  `ship-primitive-merge.md` (120-135: report step) `[read]`. `packages/core/commands/verify-build.md:326`
  and `implement-trd.md:1994` carry the off-host-proofs lookup text; `trd-authoring.md:155` the column.
- Vendored runtime: `.claude/{lib,workflows,commands,contracts}` mirror `packages/core` and are
  committed; `packages/core/scripts/scaffold-project.sh --refresh --plugin-dir packages/full .` is the
  refresh `[read: verification.md section 2]`.

## Open Questions

none
