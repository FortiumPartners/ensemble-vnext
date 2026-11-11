# TRD: flaky-ci-jobs-filed-and-capped

**Source PRD**: None — small change decided by the owner's plan ship-churn-fixes (feature F-4, `docs/plans/ship-churn-fixes/roadmap.md` item 4)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A CI job that fails and then passes on rerun is filed as a follow-up through `file-followups` the first time any feature sees it flake, and is never filed a second time | your instruction, 2026-11-11 (roadmap item 4) | yes |
| O2 | Once a job has flaked 3 times (counted across every feature), a pass on rerun no longer counts: `wait-ci` returns `failed` for it | your instruction, 2026-11-11 (roadmap item 4) | yes |
| O3 | Flake history is written only under `.trd-state/<feature>/` and counted by reading every feature's history; no shared mutable file is added | your instruction, 2026-11-11 (roadmap item 4; Related: per-feature framework writes) | yes |

## Intended Change

Before (read, `packages/core/contracts/ship-primitive-wait-ci.md` step 3): a failed check is
re-run once; a job that then passes is listed in `data.flaky` and the result is `passed`.
Nothing reads `data.flaky`, and `file-followups` step 1 imports only `not_verifiable` criteria
and `/task` follow-ups.

After:
- `wait-ci` step 3 records each rerun-pass with a new library,
  `node .claude/lib/flaky-ci.js record --state-dir <work.stateDir> --job <name> --run-id <id>`,
  which appends to `<work.stateDir>/flaky.jsonl` and returns the job's flake count across every
  `.trd-state/*/flaky.jsonl`. A count of 3 or more puts the job in `data.failed` (with
  `capped: true`) and the result is `failed`; below 3 it stays in `data.flaky` and may pass.
  Recording the same job and run id twice (a resumed step) counts once. The job name is always
  the job's own name from `gh run view <run-id> --json jobs` (the same name `gh pr checks`
  shows), never the workflow name `gh run list` returns, so a flake before and after a merge
  counts under one name.
- `collect-findings` step 1 treats a `context.failed` entry with `capped: true` as a known
  flake, not a failure to read logs for (its latest attempt passed, so it has none): it records
  one non-blocking `[flaky-capped] <job>` row with `ref: "flaky-capped:<job>"` (once), sends
  nothing about it to the judge, and returns `stop` naming the row, like a not-this-feature
  failure — the job needs an owner's fix or quarantine, which this work's own fix loop cannot do.
- `file-followups` step 1 gains a third import source,
  for each distinct job in `<work.stateDir>/flaky.jsonl`,
  `node .claude/lib/flaky-ci.js import --state-dir <work.stateDir> --job <job> --run-id <runId>`,
  which records one non-blocking `[flaky-ci]` row with `ref: "flaky:<job>"` in the
  work's own ledger, unless a row with that ref already exists in any feature's
  `discovered.jsonl`. Steps 3–5 then file it like any other row.

Checkable: Jest tests where (a) one rerun-pass then `import` yields exactly one `flaky:<job>`
row, and a second flake (same or another feature) then `import` yields none; (b) the third
flake of a job across two feature directories returns `capped: true`; (c) after these runs the
only files written are `.trd-state/<feature>/flaky.jsonl` and `.trd-state/<feature>/discovered.jsonl`.

## Decision

Review corrections applied (2026-11-11, adversarial pass): collect-findings handles a capped job, and the job name comes from the run's job list. Both change how the fix is written; neither is new scope.

A new library `packages/core/lib/flaky-ci.js` (CLI `record` / `import` / `count`) owns the
history, the count and the import; the two contracts only call it. The cap is 3, a constant in
the library. A job is identified by its check name. History is one append-only
`flaky.jsonl` per state directory; counting reads every `.trd-state/*/flaky.jsonl`, skipping
directories whose name starts with `_` (framework-internal, e.g. the sweep ledger `_sweep`,
which `file-followups` must not read). "First time" is decided at import, by looking for an
existing `flaky:<job>` row in any feature's ledger — so wait-ci itself never files (only
`file-followups` files, per its contract). Rejected: a shared `.trd-state/_flaky.jsonl`
counter — it is the shared mutable file the per-feature rule forbids, and two branches would
clash on it at merge. Rejected: filing from wait-ci directly — `file-followups` is the only
primitive that files, and wait-ci runs before the merge.

## Non-Goals

- No change to how many times wait-ci re-runs a failed job (still once).
- No automatic quarantine, retry tuning or CI configuration edits.
- No change to `packages/core/lib/ship-sequencer.js`, the `.trd-state/<feature>/shipped.json` run record, `packages/core/lib/custody.js` or `.claude/rules/ship.md`.
- No new `.claude/rules/ship.md` step: a project without a `file-followups` step gets the cap but no filing.

## Verification Artifacts

None apply — no UI, no design frames, no data-rendering screen, no screen-to-screen journey; Jest is the proof.

## Verification Environment

**Environment**: local
**Refresh**: nothing — tests read the working tree
**Cannot be checked there**: a real GitHub Actions rerun of a flaky job

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `flaky-ci.js` library + CLI (`record`, `import`, `count`) with Jest tests; vendor it to `.claude/lib/` and link it from `packages/full/lib/` | O1, O2, O3 | None | `npx jest packages/core/lib/flaky-ci.test.js` passes and shows: first rerun-pass → `import` records one `flaky:<job>` row; a later flake in the same or another feature → `import` records none; the 3rd flake across two feature dirs → `capped: true`, the 2nd → `capped: false`; the same run id recorded twice counts once; `_`-prefixed dirs are not counted; only `<feature>/flaky.jsonl` and `<feature>/discovered.jsonl` are written. `.claude/lib/flaky-ci.js` is byte-identical to the core file and `packages/full/lib/flaky-ci.js` is a symlink to it |
| FIX-002 | Wire the library into `ship-primitive-wait-ci.md` (step 3 + Result, job name from `gh run view --json jobs`), `ship-primitive-file-followups.md` (step 1 third source, step 5 list) and `ship-primitive-collect-findings.md` (a `capped: true` failure is recorded as `[flaky-capped]`, not judged, and returns `stop`); mirror all three to `.claude/contracts/`; add contract assertions to `ship-primitives.test.js` | O1, O2 | FIX-001 | `npx jest packages/core/contracts/ship-primitives.test.js` passes, including new assertions that wait-ci names `flaky-ci.js record`, the cap of 3, `capped` and `--json jobs`; that file-followups names `flaky-ci.js import` and `flaky:<job>`; and that collect-findings names `capped: true`, `[flaky-capped]` and returns `stop` for it; `.claude/contracts` stays identical to the core files |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/flaky-ci.js`, `packages/core/lib/flaky-ci.test.js`, `.claude/lib/flaky-ci.js`, `packages/full/lib/flaky-ci.js`
- **Reuse:** `packages/core/lib/discovered.js` `record(stateDir, entry)` and `readAll(stateDir)` for the ledger row (`kind: "gap"`, `foundBy: "wait-ci"`, `blocksFeature: false`, `ref: "flaky:<job>"`, summary `[flaky-ci] <job> failed then passed on rerun (<n> flake(s) recorded)`) [read]; the CLI shape of `packages/core/lib/record-files.js` (`flag()`, `main(argv)`, one JSON line, `require.main === module`) [read]
- **Replaces:** nothing — no code reads `data.flaky` today [read]
- **Follow:** append-only JSONL with malformed lines skipped, as `discovered.readAll` does; errors swallowed on write the way `discovered.record` does; a `root` option (default `.trd-state`, resolved against cwd) so tests run in a temp dir; `.claude/lib/` copies are byte-identical and `packages/full/lib/` holds per-file symlinks `../../core/lib/<file>` (see `design-render.test.js:457`) [read]
- **Careful:** keep each appended line small (job names are capped, like `discovered`'s `MAX_LINE_BYTES` reasoning); skip `_`-prefixed directories when scanning; tests must use a temp dir, never the repo's real `.trd-state/` [inferred]

### FIX-002
- **Touches:** `packages/core/contracts/ship-primitive-wait-ci.md`, `packages/core/contracts/ship-primitive-file-followups.md`, `packages/core/contracts/ship-primitive-collect-findings.md`, `.claude/contracts/ship-primitive-wait-ci.md`, `.claude/contracts/ship-primitive-file-followups.md`, `.claude/contracts/ship-primitive-collect-findings.md`, `packages/core/contracts/ship-primitives.test.js`
- **Reuse:** existing contract-text assertions in `ship-primitives.test.js` (`flat(name)` + `toMatch`) [read]
- **Replaces:** wait-ci step 3's rule that every rerun-pass is merely listed in `data.flaky` [read]
- **Follow:** keep existing phrases the current tests match (`gh run rerun <run-id> --failed`, `once`, `Import what has no row yet`, `criterion:<id>`, `followup:<index>`, `reads no row of the sweep ledger`); `wait-ci`'s front matter `results: passed, failed, no-checks` is unchanged [read]
- **Careful:** wait-ci's `data` gains no new top-level key beyond `failed` entries carrying `capped: true`, so the sequencer's result handling is untouched [inferred]; inside a `repeat`, `failed` does not stop the run and `collect-findings` reads `context.failed` next (`gh run view <run-id> --log-failed`), so without the collect-findings edit a capped job has no failure log, falls to the judge, fails closed as critical and sends `fix-findings` after a failure that is not there [read]; keep collect-findings' existing tested phrases (label table, `Fail closed`, final-pass sort)

## Could Not Verify

Rewritten by `/audit-build` on 2026-11-11. The audit confirmed FIX-001 and FIX-002 built and
tested (`npx jest packages/core/lib/flaky-ci.test.js packages/core/contracts/ship-primitives.test.js`:
143 of 143 pass; vendored copies identical, `packages/full/lib/flaky-ci.js` a symlink). What it
did not or could not check:

- **No PRD was supplied.** This TRD's source is roadmap item 4 of `docs/plans/ship-churn-fixes/roadmap.md`
  (feature F-4 in `docs/plans/ship-churn-fixes/workplan-input.json`), not a PRD, so the delivered
  code was checked against this TRD only; whether the TRD faithfully and completely carries that
  request was not checked by this audit.
- A real GitHub Actions rerun-pass: out of scope here — wait-ci's prose drives `gh`, and no live
  CI is exercised from this machine (`.claude/rules/verification.md` §5); the library is proven
  by Jest only.
- A flake recorded by wait-ci after a merge (`context.merged`) is written to the state directory
  but `/ship-build` does not commit the record of a merged branch, so that flake is counted only
  on the machine that saw it. A stated design limit, not exercised by this audit.
- Two features that see a job's first flake on parallel branches can each file it before either
  ledger reaches the other; "once per job" holds across the history each branch can read. A
  stated design limit, not exercised by this audit (it needs two live branches and CI).
