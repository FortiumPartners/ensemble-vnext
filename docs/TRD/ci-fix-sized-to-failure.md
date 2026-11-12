# TRD: ci-fix-sized-to-failure

**Source PRD**: None — small change decided by the owner's plan (`docs/plans/ship-cost-reduction/roadmap.md` item 4, "A CI fix sized to the failure")

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | In `fix-findings`, a blocking CI row whose files are all test files or CI config is fixed directly: one scoped edit, the affected tests or the workflow lint run, a pathspec commit, and neither `/implement-trd` nor a whole-branch `/code-review` runs for it | roadmap item 4 brief, 2026-11-11 | yes |
| O2 | A blocking row that points at product code, docs or dependencies, or that the classification cannot place (no files, an unsafe path, a `[lint]` row), keeps today's reconcile path through `/implement-trd --reconcile --chained --shipping` | roadmap item 4 brief, 2026-11-11 | yes |
| O3 | Sweep work (no TRD) keeps step 4 of the contract unchanged | roadmap item 4 brief, 2026-11-11 | |
| O4 | The row classifier is a deterministic library with its own unit test, using custody's own test-file classification so the two never disagree on what a test file is | roadmap item 4 "How it will be checked", 2026-11-11 | |

## Intended Change

Today (`packages/core/contracts/ship-primitive-fix-findings.md` step 3) every blocking row that is
not a `[lint]` row goes to `Skill({ skill: "implement-trd", args: "<trd> --reconcile --chained
--shipping" })`: gate agents, the full battery, and a whole-branch `/code-review` that applies its
fixes, even for a one-line test fix. The review's edits then trigger another re-proof.

After this change:

1. `collect-findings` records, for each CI-failure row, the repo-relative files the failure log
   points at (`files`), as the judge returns them.
2. `fix-findings` (TRD work only; sweep work goes to step 4 first) asks a new library,
   `node .claude/lib/ci-fix-route.js route --state-dir <dir> --trd <trd>`, to route every open
   blocking row: `direct` when every file it points at is a test file (custody's `classifyPath` →
   `test-only`) or CI config (the pattern list in Decision), otherwise `reconcile` with a reason.
3. Direct rows are fixed first, one at a time, with the four checks in Decision: clean tree, a
   scoped agent that may refuse, a deterministic diff check, a diff-only judge. Then the affected
   tests or `actionlint` run; a pass is committed by pathspec and the row resolved `fixed directly
   at <sha>`; any failure undoes all of that row's edits and the row goes to reconcile.
4. Only when reconcile rows remain does `/implement-trd --reconcile --chained --shipping` run, as
   today. With none, it is not called and no whole-branch `/code-review` runs.

Checkable: `npx jest packages/core/contracts/ship-primitives.test.js` asserts the contract text
routes a test-only and a CI-config row to the direct path (whose text names no `implement-trd` and
no `/code-review`) and a product-code row to the reconcile path; `npx jest
packages/core/lib/ci-fix-route.test.js` asserts the classifier's routing on concrete rows.

## Decision

A new library `packages/core/lib/ci-fix-route.js` (mirrored to `.claude/lib/`, symlinked from
`packages/full/lib/`) owns the classification; the contract only calls it. Test files and record
files come from `custody.classifyPath` (`test-only`, `ignored`), so "test file" means one thing in
custody and here. CI config is a fixed local pattern list: `.github/workflows/*.yml|yaml`,
`.gitlab-ci.yml`, `.circleci/config.yml`, `azure-pipelines.yml`, `bitbucket-pipelines.yml`,
`Jenkinsfile`. Everything else is `other` (product code, docs, dependencies). NOT added to
`custody.js`: the sibling item "Re-prove only what a change can affect" (to come) owns that file's
classes, and nothing here depends on it.

Routing is fail-closed: `direct` only when the row names files (`files`, or the singular `file`)
AND every file is a test file or CI config (record files are ignored, but at least one test/CI file
must remain) AND the row is not a `[lint]` row. Otherwise `reconcile`, with a reason. The CLI output
carries each row's `ts` and `summary`, because `discovered.resolve` finds a row by those two.

The direct path is bounded by four checks, because it drops the whole-branch review and custody
ignores test files (so nothing downstream looks at a test-only commit):
1. **Clean tree.** It runs only when `git status --porcelain` shows nothing outside `.trd-state/`;
   otherwise every row takes the reconcile path. This makes "undo" exact: restore every path the
   agent changed to `HEAD` and delete the files it created — all of the row's edits, never some.
2. **A scoped agent that may refuse.** One foreground `app-debugger` agent (a red test needs a
   root-cause call: is the test wrong, or the product?) edits only test/CI files and must never
   weaken what a test asserts to make it pass; when the fix belongs in product code it returns
   `needs-product` and edits nothing.
3. **Deterministic re-check of the diff** (`ci-fix-route.js check-diff`): every changed path must
   still be test/CI config, and no added or removed line of a CI-config file may touch
   `permissions`, `secrets`, `pull_request_target`, `uses:` or the `on:` triggers (a supply-chain
   surface the owner keeps). A failure undoes the edits and the row takes the reconcile path.
4. **A diff-only judge.** One foreground `code-reviewer` agent reads only that diff and answers one
   question: does it weaken or delete an assertion, skip a test, or loosen CI? Yes (or no answer)
   undoes the edits and the row takes the reconcile path. This is not the whole-branch review the
   brief removes; it reads one diff.

Then the affected tests run (the command the agent names, run again by the primitive) or, for CI
config, `actionlint <files>`; with `actionlint` not installed the row takes the reconcile path
(fail-closed: an unlinted workflow edit is not shipped unreviewed). A pass is committed by pathspec
and the row resolved `fixed directly at <sha>`.

Sweep work (`work.kind: sweep`) is checked first and goes straight to step 4, before any routing.

absorbed:     `collect-findings` recording the files a CI failure points at — without `files` on a row every row is unplaced and the direct path never fires  [BLOCKS]
not absorbed: adding a `ci-config` class to `custody.classifyPath` — the sibling item's scope; until it lands, a CI-config direct commit still counts as shipped code at the merge gate's re-proof (the review is saved, the re-proof is not)
not absorbed: a custody `--reason` for a direct commit — the merge gate already judges the commit

## Non-Goals

- No change to custody's re-proof decision, `custody.js`, or `record-files.js` (sibling item).
- No change to step 4 (sweep work), the `[lint]` formatter path, or `/implement-trd`.
- No change to the merge primitive's CI-failure stop (item 5).
- No edit to `.claude/rules/ship.md` or any owner-governed file.

## Verification Artifacts

None apply — the change is a library and contract prose with no screen, data view, design or flow; Jest covers it.

## Verification Environment
**Environment**: local
**Refresh**: none declared — tests read the working tree
**Cannot be checked there**: a live ship on `github-live-test` with a failing test fixed by the direct path (deferred by the plan; waits on this build)

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `packages/core/lib/ci-fix-route.js` (classifyFile, routeRow, checkDiff; CLI `route` and `check-diff`), its unit test, the `.claude/lib/` copy and the `packages/full/lib/` symlink | O1, O2, O4 | None | `npx jest packages/core/lib/ci-fix-route.test.js` passes; a row with `files: ["src/foo.test.js"]` routes `direct`, `file: ".github/workflows/ci.yml"` routes `direct`, `["src/foo.js"]` routes `reconcile`, no files routes `reconcile` with reason naming no files, a `[lint]` row routes `reconcile`, a `../x.test.js` path routes `reconcile`, a record-file-only row routes `reconcile`; the route output carries `ts` and `summary`; `checkDiff` refuses a changed product path and a workflow diff adding a `permissions:`/`secrets.`/`uses:`/`on:` line, and accepts a test-only diff; `.claude/lib/ci-fix-route.js` is byte-identical |
| FIX-002 | Rewrite step 3 of `ship-primitive-fix-findings.md` into: sweep first to step 4; size each row; a `**Direct path.**` paragraph; a `**Reconcile path.**` paragraph (run only when reconcile rows remain); step 4 unchanged; `## Result` names a direct fix; mirror to `.claude/contracts/` | O1, O2, O3 | FIX-001 | The contract calls `ci-fix-route.js route` and `check-diff`; the text between `**Direct path.**` and `**Reconcile path.**` names no `implement-trd` and no `/code-review`, and names the clean-tree rule, `needs-product`, the diff-only judge, `actionlint`, a pathspec commit and `fixed directly at <sha>`; the reconcile path keeps `--reconcile --chained --shipping`; step 4's sentence is unchanged; the mirror is byte-identical |
| FIX-003 | In `ship-primitive-collect-findings.md`, the judge returns for a CI failure the repo-relative files its log points at, and step 4 records them as `files`; mirror to `.claude/contracts/` | O1 | None | The contract names `files` on CI-failure rows and says the files are what `fix-findings` sizes the fix by; mirror byte-identical |
| FIX-004 | Add cases to `packages/core/contracts/ship-primitives.test.js` asserting the routing (test-only and CI-config row → direct path, no `implement-trd`/`/code-review` in it; product-code row → reconcile path); keep the existing fix-findings case passing; add one line to `docs/guides/ship-build.md`'s `fix-findings` row | O1, O2, O3 | FIX-001, FIX-002, FIX-003 | `npx jest packages/core/contracts/ship-primitives.test.js` passes; the new cases fail against the old contract text |
| AMEND-001 | [test-gap] ship-primitives.test.js must assert, for the fix-findings contract (FIX-002): sweep work goes to step 4 before any routing (text: "Sweep work (`work.kind` is `sweep`) goes to step 4 first, before any routing"); the **Direct path.** section names the clean-tree rule (`git status --porcelain`) and the diff-only `code-reviewer` judge ("reads only that diff"); and ## Result names a direct f — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: packages/core/contracts/ship-primitives.test.js:414-458; packages/core/contracts/ship-primitive-fix-findings.md step 3 and ## Result) | amendment — no objective recorded | None | [test-gap] ship-primitives.test.js must assert, for the fix-findings contract (FIX-002): sweep work goes to step 4 before any routing (text: "Sweep work (`work.kind` is `sweep`) goes to step 4 first, before any routing"); the **Direct path.** section names the clean-tree rule (`git status --porcelain`) and the diff-only `code-reviewer` judge ("reads only that diff"); and ## Result names a direct f no longer holds |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/ci-fix-route.js`, `packages/core/lib/ci-fix-route.test.js`, `.claude/lib/ci-fix-route.js`, `packages/full/lib/ci-fix-route.js`
- **Reuse:** `custody.classifyPath(p, trdRel)` returns `'ignored'|'test-only'|'shipped'` (`packages/core/lib/custody.js:101-109`) [read]; `discovered.readAll(stateDir, { open: true })` (`packages/core/lib/discovered.js:603`) returns rows with optional `file` and `files` (`discovered.js:512-517`) [read]
- **Replaces:** nothing — new module [read]
- **Follow:** `packages/core/lib/flaky-ci.js` shape: header comment explaining WHY, CLI printing ONE JSON line, exit 0 / exit 1 with `{ok:false,error}`; `packages/full/lib/<name>.js` is a symlink `../../core/lib/<name>.js` and `.claude/lib/<name>.js` a byte copy (commit adding flaky-ci.js) [read]
- **Careful:** `custody.js` requires `record-files.js`; require it lazily or at top — it has no side effects at load [inferred]. The sibling item will add classes to `classifyPath`; defer to any value other than `shipped` that it returns.

### FIX-002
- **Touches:** `packages/core/contracts/ship-primitive-fix-findings.md`, `.claude/contracts/ship-primitive-fix-findings.md`
- **Reuse:** step 3's snapshot-and-compare and pathspec-commit wording, and step 2's ordering rule (a row must be resolved before the chained build, whose first act promotes open rows into TRD tasks) [read]
- **Replaces:** step 3's unconditional `implement-trd` call [read]
- **Follow:** contract prose style: numbered steps, bold lead, no `AskUserQuestion`, no "forge" (enforced by `ship-primitives.test.js`) [read]
- **Careful:** the existing test asserts `formatted <sha>` precedes `--reconcile --chained --shipping`, and the strings `fixed by reconcile at <sha>`, `not built`, `/plan <the findings>`, `custody gate before the merge re-verifies` — keep all of them [read]

### FIX-003
- **Touches:** `packages/core/contracts/ship-primitive-collect-findings.md`, `.claude/contracts/ship-primitive-collect-findings.md`
- **Reuse:** step 3's judge return list and step 4's record list [read]
- **Follow:** keep the existing tested strings (label table, `One judge per pass`, `Fail closed`, `Final pass`, `[below-critical]`, `[lint]`, the capped-flake text) [read]
- **Careful:** `discovered.record` caps `files` at 20 entries of 200 chars (`discovered.js:515-517`) [read]

### FIX-004
- **Touches:** `packages/core/contracts/ship-primitives.test.js`, `docs/guides/ship-build.md`
- **Reuse:** the `flat(name)` helper and the `describe('collect-findings and fix-findings')` block (`ship-primitives.test.js:394-428`) [read]
- **Follow:** behaviour assertions sit beside the primitive's own describe block (file header) [read]

### AMEND-001

- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is written here — the file-conflict guard in `task-graph.js` cannot protect this task from a concurrent one until an owner fills in `Touches` by hand. Until then this task has no inferred conflict edges and may be scheduled alongside anything.

## Could Not Verify

State after `/audit-build` (2026-11-11). The library routing, the contract text, the
collect-findings `files` field and the mirrors were checked against the code and the two Jest
files (180 tests passing); they are no longer listed here. One proof gap the audit found (the
contract test does not assert the clean-tree rule or the diff-only judge) is reported in the
audit readout and tracked as task AMEND-001 for `/implement-trd --reconcile`, not here.

- **No PRD — product validation unchecked.** This TRD's source is a roadmap item, not a PRD, and
  none was supplied to the audit. It checked the delivered code against this TRD only; whether
  the TRD captured everything roadmap item 4 asked for was not checked.
- **Model behaviour on the direct path — out of scope for a code audit.** Whether a model
  following the contract keeps the direct agent inside test/CI files, and whether the diff-only
  judge catches every weakened assertion, is prose and judgment, not a guarantee; `check-diff`
  bounds the paths and the CI-security keys deterministically. Only a live run shows it.
- **End-to-end ship — deferred by the plan.** CI-config direct fixes save the review but not the
  merge gate's re-proof until the sibling item adds a CI-config class to custody. A live ship on
  `github-live-test` with a failing test fixed by the direct path is what proves the path end to
  end; the verification environment for this build is `local` only.
