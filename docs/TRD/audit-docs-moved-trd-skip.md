# TRD: audit-docs-moved-trd-skip

**Source PRD**: None — defect reported in session, 2026-10-06
**Kind**: defect
**Weight**: small

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A TRD that was moved to another folder after its work was recorded is matched to its `implement.json` by any path it has had, so it is reviewed (not skipped as having no implementation) and its task statuses are shown | the reproduction below, 2026-10-06 | yes |
| O2 | When the skip test cannot get an answer from git, the TRD is reviewed, never skipped and never fatal to the run | your instruction, 2026-10-06 ("review rather than skip when git fails") | yes |
| O3 | A Touches entry that points outside the repository is left out of the git check instead of failing it | your instruction, 2026-10-06 ("drop out-of-repo paths before calling git") | |

## Reproduction

### Steps

```
node packages/core/lib/docs-audit-assemble.js assemble --repo "$PWD" --run-date 2026-10-06 --comprehensive --out <scratch>/asm.json
```

then read the entry for `docs/TRD/completed/implement-trd-rework.md` in the output. [ran 2026-10-06; read-only — it writes only `--out`]

### Actual

- `skip: "no-implementation"`. It is one of five skipped docs, and the only one skipped as having no implementation.
- All 19 tasks show `status: null`.
- `.trd-state/implement-trd-rework/implement.json` is committed and records 19 of 19 tasks `success`.

### Expected

- `skip: null`, so the TRD is reviewed and batched.
- All 19 tasks show `status: "success"`.

### Root cause [ran]

Three faults in `packages/core/lib/docs-audit-assemble.js`. Each was confirmed by running it.

1. **Path match.** `trdSkip` (`:359`) and `analyseTrd` (`:423`) both select a TRD's `implement.json` by comparing `trd_file` with the TRD's *current* path only. The record still says `docs/TRD/implement-trd-rework.md`. The file was renamed into `docs/TRD/completed/` in `c1d6901` (R100), so nothing matches, `anySuccess` is false, and the fallback test runs.
   - The handoff described `:423` as "the same match for PRDs". It is not: `:423` is `analyseTrd`, which joins task statuses onto the TRD. That is why the statuses come out `null`.
2. **Out-of-repo paths in the fallback.** The fallback passes every Touches path to `git rev-list` (`:383`) with `allowFail: true`, and then reads only `.out`.
   - The TRD's Touches yield `../core/contracts`, `../core/workflows` and `/verify-trd-team`.
   - Git exits 128 on them (`fatal: ../core/contracts: '../core/contracts' is outside repository`) and prints nothing.
   - Empty output is read as "no Touches file changed", so the TRD is skipped as having no implementation.
3. **The `--follow` call is fatal.** `git log --follow` (`:375`) is called without `allowFail`. Any failure there throws `AssembleError` and stops the whole run, where it should send the one TRD to review. [read; not reproduced]

## Decision

- **One history call per TRD.** Run `git log --follow --name-status`, newest first, and walk it.
  - Collect the doc's paths from its own adds, modifications and renames (`R` entries).
  - **Stop at the first copy (`C`) entry, and take that commit as the doc's first commit.** `--follow` follows copies as well as renames, even when the original file is kept. A TRD started by copying another would otherwise inherit that TRD's old path, and with it that TRD's `implement.json` (the reviewer's finding, confirmed in a scratch repo: status `C083`).
  - Use the same walk's oldest commit as the "first commit" the fallback already uses. Then select the `implement.json` records against the collected set of paths.
  - `analyseTrd` computes the selection once and passes it to `trdSkip`. That removes the duplicated filter, which is how the two copies came to share the bug.
- **Out-of-repo Touches entries are filtered out.** Before any git call, pass each Touches path through `normalizeRepoPath`. That turns an absolute path inside the repo into a repo-relative one, so it stays usable as evidence. Then drop what is still absolute, equal to `..`, or starting with `../`.
  - Rejected alternative: catching git's "outside repository" error. A git failure must already mean "review" (next point), so catching it here would hide every out-of-repo path behind a forced review. Filtering keeps the remaining paths useful as evidence.
- **Any git failure in the skip test means "review".**
  - If the history call fails, or `rev-list` returns `ok: false`, return `null` (review), not `'no-implementation'`.
  - This is D19's existing stance, stated in `trdSkip`'s own header: *"When the evidence cannot be established … the TRD is reviewed."*
- **Known knock-on, accepted.** A moved TRD whose `implement.json` is unclosed and still has an open development task now reads as `in-flight`, and its PRD is skipped with it. This is the existing in-flight rule applied correctly once the record is found. No such TRD exists in this repo today.

absorbed: none
not absorbed: `agent-routing.js` matches "ui" inside "require"/"build" — separate defect; this fix works without it
not absorbed: `/verify-trd-team` and `../core/*` appear as Touches only because `touchedFiles` keeps any token containing "/" — a separate cleanliness issue; O3 makes it harmless here

## Non-Goals

- No change to the in-flight rule, `skipInFlightPrds`, PRD handling, `missingPathsFor`, batching or thresholds.
- No rewrite of historical `implement.json` `trd_file` values. The fix reads them as they are.
- No change to what `touchedFiles` extracts from the grounding. It only filters before git.

## Verification Artifacts

None apply — a pure library change with no UI, API or deploy surface. It is proven by Jest tests in a temporary git repo and by re-running the assembler on this repo.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Match a TRD's implement.json records by every path the doc has had; drop out-of-repo Touches entries before git; treat any git failure in the skip test as "review", not skip and not fatal. Add regression tests and mirror the library into its vendored runtime copy | O1, O2, O3 | None | (1) New test: `implement.json` names the TRD's OLD path with T-1 `success`, the TRD is then moved to `docs/TRD/completed/` and no Touches file was ever committed → `skip` is `null` and T-1 status is `success` (fails on current code: skip is `no-implementation`, status `null`). (2) New test: a Touches list holding `../outside/x` and `src/thing.js`, with `src/thing.js` changed after the TRD → `skip` is `null` (fails on current code: git exits 128, the TRD is skipped). (2b) New test proving the filter itself: Touches `../outside/x` plus an in-repo `src/thing.js` that was NEVER changed → `skip` is `no-implementation`. A fix that only reviews on git failure gives `null` here, so this fails unless out-of-repo paths are dropped. (3) New test: a Touches path git rejects (e.g. `:(bogus)src/thing.js`) and no file changed → `skip` is `null` (fails on current code: `no-implementation`). (3b) New test: a TRD created by COPYING another TRD (original kept) does not inherit the original's `implement.json` statuses → its task statuses are `null`. (4) Every existing test in `docs-audit-assemble.test.js` still passes, including "a root-commit TRD whose Touches files never changed is still skipped" and "an implement.json naming a different TRD does not count". (5) Re-running the reproduction command above lists `docs/TRD/completed/implement-trd-rework.md` as not skipped, with 19 tasks at `success`. (6) `cmp packages/core/lib/docs-audit-assemble.js .claude/lib/docs-audit-assemble.js` reports no difference, and `npx jest` stays fully green |
| AMEND-001 | [test-gap] Nothing tests the case where git log --follow fails (followHistory returns ok:false, then trdSkip returns null for review); only the rev-list failure half of O2 is tested. Add a test in packages/core/lib/docs-audit-assemble.test.js that makes the --follow call fail and asserts skip is null and assemble does not throw. — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: packages/core/lib/docs-audit-assemble.js followHistory (allowFail; if (!r.ok) return { ok: false }) and trdSkip (if (!history.ok) return null); no test makes --follow fail. Functional verification FS-4 made it fail in a scratch repo by setting git config diff.orderFile to a missing file (see .trd-state/audit-docs-moved-trd-skip/evidence/FS-4.txt) — the same technique works in a test repo.) | O2 | None | [test-gap] Nothing tests the case where git log --follow fails (followHistory returns ok:false, then trdSkip returns null for review); only the rev-list failure half of O2 is tested. Add a test in packages/core/lib/docs-audit-assemble.test.js that makes the --follow call fail and asserts skip is null and assemble does not throw. is met |

## Task Grounding

### FIX-001

- **Touches:** `packages/core/lib/docs-audit-assemble.js`, `.claude/lib/docs-audit-assemble.js`, `packages/core/lib/docs-audit-assemble.test.js`
- **Reuse:**
  - `git(repo, args, { allowFail: true })` returns `{ ok, out }`. Branch on `.ok`, which the current `:383` ignores. [read]
  - `normalizeRepoPath` normalises `trd_file`. [read]
  - The test helpers `mkRepo`, `commitFiles`, `sh`, `put`, `run`, `entry`, `implState` and `TRD_BODY` already build temporary git repos. Model the new tests on "a TRD moved to another folder after its code was built is reviewed, not skipped" (`docs-audit-assemble.test.js:422`). [read]
- **Replaces:**
  - The two duplicated `implementStates.filter(... === docPath)` selections at `:359` and `:423`. Make it one selection, computed in `analyseTrd` and passed to `trdSkip`.
  - The un-guarded `git log --follow` at `:375`. [ran]
- **Follow:**
  - Every git call uses `spawnSync` with array arguments (the file's own header and CLAUDE.md).
  - Keep `trdSkip`'s return contract: `'no-implementation' | 'in-flight' | null`.
  - `packages/core/lib/*` must be byte-identical to `.claude/lib/*`; `runtime-integrity.test.sh` checks it.
  - The existing comment at `:372-374` explains why `--reverse` is not used with `--follow`. Keep that reasoning: the oldest commit is the last line.
- **Careful:**
  - `--follow` follows copies, not just renames, even with the original kept and no git config [ran by the reviewer]. That is why the walk stops at the first `C` entry, as set out in the Decision.
  - `git log --follow --name-status --format=...` interleaves commit lines and status lines. Use a format marker that cannot be confused with a path when splitting them.
  - Out-of-repo filtering must not drop in-repo paths that merely contain `..` in the middle, such as `a/../b`. Filter after `path.posix.normalize`, on a leading `../` or an absolute path.

### AMEND-001

- **Touches:** `packages/core/lib/docs-audit-assemble.test.js`, `packages/core/lib/docs-audit-assemble.js`, `.claude/lib/docs-audit-assemble.js`
- **Reuse:** the "history-aware skip test" block's helpers (`mkRepo`, `commitFiles`, `withTouches`, `run`, `entry`) in `docs-audit-assemble.test.js`. [read]
- **Follow:** functional verification made `git log --follow` fail for one TRD by setting `git config diff.orderFile` to a missing file, which leaves `git log -1 -- <path>` working (`.trd-state/audit-docs-moved-trd-skip/evidence/FS-4.txt`). [ran]
- **Careful:** Touches filled in by the orchestrator on promotion (the discovery recorded no file). Only the test file is expected to change; the library is listed so the "every instance" sweep can fix a real gap there if it finds one, mirrored to `.claude/lib/`.

## Could Not Verify

*Rewritten by `/audit-build`, 2026-10-06.*

- **Product-requirement validation was not checked.** This defect has no PRD: its objectives come from the in-session reproduction and the owner's instructions, recorded in the Objectives table. The audit checked the delivered code against this TRD only. Whether the fix is what the product needed was not checked separately.
