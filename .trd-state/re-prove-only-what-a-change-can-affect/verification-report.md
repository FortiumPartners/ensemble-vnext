# Functional Verification Report: re-prove-only-what-a-change-can-affect

**Source PRD**: docs/TRD/re-prove-only-what-a-change-can-affect.md § Intended Change
**Success definition**: .trd-state/re-prove-only-what-a-change-can-affect/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 21 total — 21 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 21 of 21 proven — uncovered: none
**Must pass**: 16 of 16 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `classifyPath` returns `docs` for a path whose first segment is `docs` or `doc` (including `docs/TRD/other.md`) and for a `README`/`CHANGELOG`/`LICENSE`/`CONTRIBUTING`/`CODE_OF_CONDUCT`/`AUTHORS`/`NOTICE` basename (optionally `.md`/`.markdown`/`.txt`/`.rst`/`.adoc`, any case), while a `.md` under `packages/core/commands/` stays `shipped` | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-2 | `classifyPath` returns `ci-config` for `.github/workflows/**`, `.github/actions/**`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `bitbucket-pipelines.yml`, `Jenkinsfile`, `.circleci/**` and `.buildkite/**` | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-3 | `classifyPath` returns `deps` only for the listed lockfile basenames at any depth (e.g. `package-lock.json`, `yarn.lock`, `poetry.lock`, `go.sum`, `Cargo.lock`), and a dependency manifest (`package.json`, `pyproject.toml`, `Gemfile`, `mix.exs`) stays `shipped` | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-4 | `isRecordFile` matches the exact root-level repo-relative path `OWNER-CALLS.md` (not a nested one), so `classifyPath` returns `ignored` for it and a merge-up clash in it is union-resolved | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-record-files-tests.txt | 1 |
| FS-5 | `compare()` / `check` are unchanged in meaning: a commit pair differing only on a `docs`, `deps` or `ci-config` path still makes the pr-head, merge and deploy links and the `--head` guard fail, and `check` reads no `ensemble.reproof` setting | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it2-fs5-probe.txt | 2 |
| FS-6 | Under default rules, a change since the anchor touching only docs returns `moved` (move rule `tier-none`) from `custody.js reconcile`, not `reverify`, even for a must-pass criterion with no covers record | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-7 | Under default rules, a change touching only a lockfile, only a CI workflow file, or only test files returns `moved` with rule `tier-ci` and a reason naming the classes (e.g. `moved: only docs, ci-config changed (left to CI)`), never `reverify`; no new top-level result field appears | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-8 | A change touching only `OWNER-CALLS.md` asks for no re-proof from `reconcile` (it is `ignored`), even for a no-covers must-pass criterion | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-9 | When `ensemble.reproof` sets a non-shipped class to `reprove` (e.g. `docs: "reprove"`), a changed path of that class is promoted and puts every must-pass criterion in doubt, and the base excuse does not soften a promoted path | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-10 | A lockfile change is promoted (every must-pass criterion in doubt) when a package name listed in `depsReprove` appears whole-word on an added or removed line of the lockfile's `git diff --no-renames -U0`, and is not promoted when the name appears only as part of another word or not at all | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-11 | `format: "reprove"` disables the `--reason format` shortcut, which is honoured under the default `none` | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-12 | An invalid `ensemble.reproof` — a value outside a key's allowed set, a non-array or non-string-element `depsReprove`, or a `.claude/settings.json` that is not valid JSON — makes `reconcile` return `refused` with a reason naming the setting (e.g. `ensemble.reproof.docs must be one of none, ci, reprove (got "skip")`) | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-13 | An absent `ensemble.reproof` key (or absent settings file) gives the default tiers, unknown keys are ignored, and `reconcile --set-only` reads no setting | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-14 | With `shipped: covers` (the default), a shipped-code change re-proves only the must-pass criteria whose recorded covers include a changed path; with `shipped: all`, every must-pass criterion is affected | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-15 | Unclaimed-path guard: a changed, non-excused `shipped`-class path that no must-pass criterion's record names puts every must-pass criterion in doubt | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-16 | `affectedIds` looks up a criterion's covers in order — live-evidence artifact covers, then the criterion-covers record, then no record — and only a criterion with no record of either kind falls back to "in doubt on any shipped change" | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-custody-tests.txt | 1 |
| FS-17 | `deriveCriterionCovers` maps a criterion id to TRD tasks through the objective ids its definition row names (its `Must pass` cell or anywhere in the row) and any task id the row names, and returns the union of those tasks' grounding Touches; a task with no Touches contributes the backticked repo paths in its Master Task List row that exist on disk; paths are repo-relative and forward-slash, absolute and `..` paths dropped; no task or no path yields no record | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-live-evidence-tests.txt | 1 |
| FS-18 | `recordCriterionCovers` writes one file `<stateDir>/evidence/criterion-covers.json` shaped `{version: 1, criteria: {<id>: {covers, source, ts}}}`, whole and atomically, merged with existing entries; `readCriterionCovers` returns a Map id → covers, and an empty map for an absent or unreadable file | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-live-evidence-tests.txt | 1 |
| FS-19 | `node .claude/lib/live-evidence.js record-criteria --state-dir D --trd T --definition P [--state S]` records every `met` id in the state file (default `<D>/verification-state.json`), prints one JSON line `{recorded: [...], none: [...]}`, and exits 0, non-zero only on a usage error | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-fs19-cli.txt | 1 |
| FS-20 | `/implement-trd` (Step 8.4) and `/verify-build` (outcome step) run `record-criteria` once after the verification workflow returns, a failure becoming one ISSUES line rather than STUCK; `ship-custody-gate.md` step 4 names the setting and `docs/guides/ship-build.md` documents `ensemble.reproof` | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it2-fs20-grep.txt | 2 |
| FS-21 | `scaffold-project.sh --refresh` never writes `ensemble.reproof`: a project whose `.claude/settings.json` sets `ensemble.reproof.docs` to `reprove` still has exactly that value after a refresh | .trd-state/re-prove-only-what-a-change-can-affect/evidence/it1-scaffold-bats.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

