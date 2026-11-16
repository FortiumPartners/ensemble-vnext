# Functional Verification Report: narrow-reproof-scope

**Source PRD**: docs/plan/narrow-reproof-scope.investigation.md
**Success definition**: .trd-state/narrow-reproof-scope/success-definition.md
**Outcome**: exit-satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 30 total — 30 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 30 of 30 proven — uncovered: none
**Must pass**: 13 of 13 proven

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Each of the 5 paths `.claude/commands/plan.md`, `.claude/workflows/x.js`, `CLAUDE.md`, `.gitattributes` and `.gitignore` is classified `docs` by custody's `classifyPath`, not `shipped`; a nested basename match (`sub/CLAUDE.md`) is also `docs` | .trd-state/narrow-reproof-scope/evidence/custody-scenarios.txt | 1 |
| FS-2 | `.claude/rules/constitution.md` and application source such as `src/app.ts` are still classified `shipped` | .trd-state/narrow-reproof-scope/evidence/custody-scenarios.txt | 1 |
| FS-3 | When the only changes since the custody anchor are framework or housekeeping files (for example `.claude/commands/x.md` and `CLAUDE.md`), `custody.js reconcile` moves the anchor and puts no criterion in doubt | .trd-state/narrow-reproof-scope/evidence/custody-scenarios.txt | 1 |
| FS-4 | A merge-up that adds a shipped file named by no covers record (`src/a/new.ts`), with must-pass criterion A covering `src/a/x.ts` and must-pass criterion B covering `src/b/y.ts`, puts only A in doubt; B is reused | .trd-state/narrow-reproof-scope/evidence/custody-fs4-exact.txt | 1 |
| FS-5 | When a shipped changed path named by no covers record shares its directory with no cover of any criterion, every must-pass criterion is in doubt and the scope is `full` | .trd-state/narrow-reproof-scope/evidence/custody-scenarios-mergeup.txt | 1 |
| FS-6 | A must-pass criterion with no covers record is handled exactly as before this change: the narrowing never marks it reused when it would have been in doubt before | .trd-state/narrow-reproof-scope/evidence/custody-scenarios-mergeup.txt | 1 |
| FS-7 | A merge-up that changes a file inside a criterion's directory cover, or the covered file itself, still puts that criterion in doubt (narrowing never drops a criterion whose covers match) | .trd-state/narrow-reproof-scope/evidence/custody-scenarios-mergeup.txt | 1 |
| FS-8 | With `ensemble.reproof.shipped: all` set, a merge-up that would otherwise narrow (the FS-4 case) re-proves every must-pass criterion | .trd-state/narrow-reproof-scope/evidence/regression-1/rg1-custody-scenarios.txt | iteration 2 (regression pass 1) |
| FS-9 | The custody result carries `scope` (`none` when no id is in doubt, `targeted` when some are, `full` when all must-pass ids are) and a one-line `scopeReason` | .trd-state/narrow-reproof-scope/evidence/regression-1/rg1-custody-scenarios.txt | iteration 2 (regression pass 1) |
| FS-10 | `custody.js reconcile` output includes the changed paths since the anchor alongside `scope` and `scopeReason` | .trd-state/narrow-reproof-scope/evidence/custody-fs4-exact.txt | 1 |
| FS-11 | The custody gate contract states that before re-proving, custody reports what changed since the anchor and the scope chosen (`none`, `targeted` or `full`) with its reason | .trd-state/narrow-reproof-scope/evidence/fs11-custody-gate-grep.txt | 1 |
| FS-12 | For a board whose route and every named component resolve, the `ST-<board id>` criterion gets covers consisting of the page file serving the board's route and the file of each component the board names | .trd-state/narrow-reproof-scope/evidence/design-covers-scenarios.txt | 1 |
| FS-13 | A `DC-<frame stem>` criterion whose stem equals a board id gets that board's covers; a `DC-` row whose stem matches no board id gets no covers | .trd-state/narrow-reproof-scope/evidence/design-covers-scenarios.txt | 1 |
| FS-14 | Each of the 4 route-list forms in `design.md` §3 resolves a route to its page file: `/trips -> path`, `/trips: path`, a table row pairing route and path, and a route-list cell naming an existing file whose lines contain the route as a quoted literal | .trd-state/narrow-reproof-scope/evidence/design-covers-scenarios.txt | 1 |
| FS-15 | A route-list path given without extension resolves by probing `.tsx .ts .jsx .js .vue .svelte` in that order, then `<path>/index.*` | .trd-state/narrow-reproof-scope/evidence/design-covers-scenarios.txt | 1 |
| FS-16 | Each of the 3 component layouts under a §2 component library path resolves a namespaced board component (`FixtureWeb.Card`, prefix through the first `.` stripped): `<lib>/Card.<ext>`, `<lib>/Card/index.<ext>`, and a `<lib>/Card/` directory | .trd-state/narrow-reproof-scope/evidence/design-covers-scenarios.txt | 1 |
| FS-17 | A board whose route does not resolve, or any one of whose components does not resolve, gets no covers at all (never a partial set) and is listed under `unresolved` with the reason | .trd-state/narrow-reproof-scope/evidence/design-covers-scenarios.txt | 1 |
| FS-18 | With an unfilled `.claude/rules/design.md` (this repo's template), design-map covers resolve nothing and the result reports that | .trd-state/narrow-reproof-scope/evidence/design-covers-scenarios.txt | 1 |
| FS-19 | Design covers derived for `ST-`/`DC-` rows survive recording: after `live-evidence.js record-criteria` for a met design criterion, reading the state back returns those covers with source `design-map` | .trd-state/narrow-reproof-scope/evidence/design-covers-scenarios.txt | 1 |
| FS-20 | A merge-up adding a new sibling file in the directory of a component named by a board puts that board's `ST-` criterion in doubt in custody, and leaves reused a criterion whose covers are in an unrelated directory | .trd-state/narrow-reproof-scope/evidence/custody-fs20-design-sibling.txt | 1 |
| FS-21 | In the verification regression pass, a met criterion with no covers record is not re-checked when the Debug edit changed only framework, housekeeping, doc, test, CI-config or lockfile paths | .trd-state/narrow-reproof-scope/evidence/regression-1/rg1-fs21-22-probe.txt | iteration 2 (regression pass 1) |
| FS-22 | A met criterion with no covers record is re-checked with reason `no-covers` when a counting change record names a code-class file that shares a directory with some recorded cover in the run | .trd-state/narrow-reproof-scope/evidence/regression-1/rg1-fs21-22-probe.txt | iteration 2 (regression pass 1) |
| FS-23 | A code-class change sharing a directory with no recorded cover does not re-check a no-covers criterion, while a run with no covers record at all still re-checks it on any counting code change | .trd-state/narrow-reproof-scope/evidence/fs23-it2-jest.txt | 2 |
| FS-24 | The regression pass returns how many criteria it re-checked per reason, and the verification report prints those counts together with a scope word (`none`, `targeted`, `full`) | .trd-state/narrow-reproof-scope/evidence/regression-1/rg1-fs24-render-report.txt | iteration 2 (regression pass 1) |
| FS-25 | `lookupOffHostProofs`, given a base ref, returns status `baseline` and the job id when the named job concluded unsuccessfully on both HEAD and the base branch head | .trd-state/narrow-reproof-scope/evidence/regression-1/rg1-fs25-27-jest-excerpt.txt | iteration 2 (regression pass 1) |
| FS-26 | A job red on HEAD and green on the base head is `red`, not `baseline`; a base run that is missing or unfinished also leaves `red` | .trd-state/narrow-reproof-scope/evidence/regression-1/rg1-fs25-27-jest-excerpt.txt | iteration 2 (regression pass 1) |
| FS-27 | The base ref comes from `--base <ref>` on the CLI, otherwise from `git symbolic-ref --short refs/remotes/origin/HEAD`; when neither yields a ref, no baseline check is made and a red job stays `red` | .trd-state/narrow-reproof-scope/evidence/regression-1/rg1-fs25-27-jest-excerpt.txt | iteration 2 (regression pass 1) |
| FS-28 | The verification loop's reason for a voided or red off-host proof names `gh run rerun <run-id> --job <job-id>` (or `--failed`), says never `gh workflow run`, says to push and wait for the run CI starts when a Debug edit voided the proof, and says baseline for a baseline job | .trd-state/narrow-reproof-scope/evidence/regression-1/rg1-fs28-jest-excerpt.txt | iteration 2 (regression pass 1) |
| FS-29 | Each of the 3 documents `packages/core/commands/verify-build.md`, `packages/core/commands/implement-trd.md` and the TRD authoring contract `trd-authoring.md` contains `gh run rerun` and forbids a whole-workflow manual dispatch | .trd-state/narrow-reproof-scope/evidence/fs29-grep.txt | 1 |
| FS-30 | The TRD authoring contract says a criterion whose only proof is a full manual CI run is not declared, and that a local or single-job proof is preferred | .trd-state/narrow-reproof-scope/evidence/fs30-grep.txt | 1 |

## Not Met

_None._

## Causes

| Cause | Representative | Members | Status |
|-------|----------------|---------|--------|
| regression-no-covers-ignores-cover-dirs | FS-23 | 1 (FS-23) | closed at iteration 2 |

## Not Verifiable

_None._

## Regression pass

After the loop exited, the criteria whose covered files changed (or whose coverage was unknown) were re-checked against the finished build.

### Round 1 (iteration 2)

Scope: targeted — re-checked 9: no-covers 4, covers-changed 5

| ID | Why re-checked | Changed files |
|----|----------------|---------------|
| FS-8 | no-covers |  |
| FS-9 | no-covers |  |
| FS-21 | covers-changed | .claude/workflows/verify-functional.js, packages/core/workflows/verify-functional.js, packages/core/workflows/verify-functional.test.js |
| FS-22 | covers-changed | .claude/workflows/verify-functional.js, packages/core/workflows/verify-functional.js, packages/core/workflows/verify-functional.test.js |
| FS-24 | covers-changed | .claude/workflows/verify-functional.js, packages/core/workflows/verify-functional.js, packages/core/workflows/verify-functional.test.js |
| FS-25 | covers-changed | .claude/workflows/verify-functional.js, packages/core/workflows/verify-functional.js, packages/core/workflows/verify-functional.test.js |
| FS-26 | no-covers |  |
| FS-27 | no-covers |  |
| FS-28 | covers-changed | .claude/workflows/verify-functional.js, packages/core/workflows/verify-functional.js, packages/core/workflows/verify-functional.test.js |

Caught: _none._

Not re-walked (covered files unchanged): FS-1, FS-2, FS-3, FS-4, FS-5, FS-6, FS-7, FS-10, FS-11, FS-12, FS-13, FS-14, FS-15, FS-16, FS-17, FS-18, FS-19, FS-20, FS-23, FS-29, FS-30

Changed files no criterion covers: .claude/verification-notes.md

