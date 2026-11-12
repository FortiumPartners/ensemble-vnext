# TRD: every-waived-failure-filed-as-a-defect-issue

**Source PRD**: None — small change decided by the owner, 2026-11-12 (workplan verification-targeted-loop, feature F-7)
**Related**: FortiumPartners/ensemble-vnext#113 (design); #126 (priority/tolerance, out of scope)
**Builds on**: Block only on material failures (PR #125, merged to `main` as `dd0764bb`)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A feature cannot close (by `/audit-build` or `/close-feature`) while any failure waived under `Blocking: must-pass only` has no defect issue in the project's tracker: the close files each missing one, labelled `defect`, records its URL on the ledger row, and refuses to close, naming the rows, when one cannot be filed | owner ruling 2026-11-12 ("ANY such requirements must be captured as issues … someone must consciously decide NOT to fix it later"); the /plan instruction (1) | yes |
| O2 | When the project declares no reachable tracker in `stack.md` `## Issue Tracker`, `Blocking: must-pass only` waives nothing: verification runs as `all criteria`, and the verification report says why | /plan instruction (2) | yes |
| O3 | A waived failure is filed at most once: `file-followups`, a resumed run and a fix round never file or re-record a row whose issue URL is already recorded | /plan instruction (3) | yes |
| O4 | No step of the framework closes a waived-failure defect issue; only a person does | /plan instruction (4) | |
| O5 | The owner-facing text (`verification.md` §5c template, `/verification-setup`, `docs/reference/`, the TRD-authoring guidance on the `Must pass` column) says waived failures are filed as defect issues | /plan instruction, "Update …" | |

## Intended Change

Today (after PR #125), under `Blocking: must-pass only`, a non-must-pass criterion still failing
after the fix loop is returned as `nonBlocking` and written to `discovered.jsonl` as a
`[non-blocking] <id>: <reason>` row (`recordNonBlockingFollowups`,
`packages/core/lib/functional-verification.js:1621`). It reaches a tracker only if `ship.md` lists
the outward `file-followups` step, so a waived failure can end as a ledger row nobody sees.

After this change:

1. **Close gate.** Before writing `closed.json`, both `/audit-build` (its close step) and
   `/close-feature` run `node .claude/lib/waived-defects.js gate --state-dir .trd-state/<feature> --stack "$(node .claude/lib/owner-rules.js path stack.md)"`.
   It reads the ledger FIRST and looks at the tracker only when an unfiled waived row exists, so a
   project with `Tracker: none` and no waived rows closes exactly as today. A waived row is a
   criterion whose latest row (by `latestPerRef` over ALL rows, resolved included) is a
   `[non-blocking]` row; a criterion a later pass retired with a `met` row is not filed. For each
   unfiled one it files one issue in the declared tracker, labelled `defect`, titled with the
   criterion id and statement, whose body carries the criterion statement, the failure, its
   evidence, the feature/TRD/branch/ledger row, and the line "Shipped waived under `Blocking:
   must-pass only` (verification.md §5c). This issue stays open until someone decides not to fix
   it; no Ensemble step closes it." (`--closed-by owner`, the `/close-feature` path, words it
   "Waived under … when the feature was closed by its owner", since an abandoned feature shipped
   nothing.) It then records the URL on the row (an append-only `filed <url>` resolve marker,
   `file-followups`' own convention). "Never twice" is per criterion: a criterion with any
   recorded URL is never filed again; a newer waived row for it is marked with that same URL.
   It prints `{ ok, filed, already, failed }`; `ok: false` means **no close record is written** (on
   a re-audit of an already-closed feature, the existing `closed.json` is removed — deleting it is
   the documented way to reopen — so the feature is not left closed with an unfiled row), no PR is
   opened, and the command ends `COMMAND STUCK`, naming each row (its criterion and summary) and why
   it could not be filed. The records-ref write still runs on a refusal, in both commands, so the
   `filed <url>` markers of rows that WERE filed survive a temporary worktree. An issue created
   whose marker could not be written is `failed` with its URL printed, so the refusal names it.
   **The way out of a refusal**, named in the STUCK `Next:`: fix the tracker, or file the issue by
   hand and run `node .claude/lib/waived-defects.js record-filed --state-dir <dir> --ref <ref> --url <url>`
   (any tracker), then re-run the same command — `/audit-build` after an audit refusal, never
   `/close-feature`, which would write `audit: null` and drop the `anchorCommit` custody needs.
2. **No tracker, no waiver.** `read-blocking-policy` takes `--stack <stack.md>`. When the declared
   policy is `must-pass` and the tracker is absent, `none`, unparseable, or (GitHub) not reachable
   by a read-only `gh repo view`, it returns `policy: 'all'` with `declared: 'must-pass'` and a
   `waiverRefused` reason. Both `/implement-trd` §8.1a and `/verify-build` pass `--stack` and hand
   `waiverRefused` to the workflow as a new arg `blockingNote` (string or null) beside `blocking`.
   The workflow carries it into every report input the way it carries `nonBlocking`, and
   `renderReport` renders one `**Blocking**:` header line from `input.blockingNote` ("must-pass only
   is declared but not applied: <reason>; every failing criterion blocks"), gated on its presence so
   every other report stays byte-identical. Because it is rendered, not patched, every re-render
   (fix rounds, the re-proof retry) keeps it. The readout's DECISIONS says the same.
3. **Never twice.** `recordNonBlockingFollowups` treats a `[non-blocking]` row whose issue is
   already filed as recorded (it reads resolved rows too), so no new open row appears for it.
   `file-followups` files a `[non-blocking]` row only through `waived-defects.js gate`, which skips a
   row with a recorded URL. (For a feature the close gate has already filed every waived row by the
   time `/ship-build` runs, so this is a guard, not a second path.)
4. **Never closed by a step.** `waived-defects.js` runs no close, edit or comment command (its
   runner is only ever handed `issue create`, `label list`, `label create` and `repo view`, which a
   test asserts by recording every call). `close-issue` already closes only the one issue a work's
   PRD/TRD header or branch cites; a waived-defect issue is created at close time, so the feature
   that waived it can never cite it. A LATER feature written to fix it may cite it and close it on
   ship — that is a person deciding to fix it, which the owner's rule allows. The contract gains
   one sentence saying so.
5. **Readout.** Filed waived rows drop out of the DISCOVERED summary (resolved rows are hidden),
   so both close commands list each filed issue's URL with its criterion in STATE.

## Decision

Put tracker parsing, reachability and filing in one new deterministic library,
`packages/core/lib/waived-defects.js` (mirrored to `.claude/lib/`), and have the commands call it.
It and `functional-verification.js` need each other (`readDefinitionRows` one way, the tracker
check the other): each requires the other lazily, inside the function or CLI branch that needs
it, never at the top level, so neither sees a half-filled exports object.
Rejected: describing the filing in each command's prose (as `file-followups` does today) — the
owner's rule is a hard gate on closing, and a gate written only as prose is exactly the "ledger
row nobody sees" failure in a different place. The library is unit-tested with an injected
command runner (stubbed `gh`), so the gate's refusal is code, not convention.

GitHub is filed directly with `gh` (spawnSync, array args — never a shell string). Linear and Jira
are filed by the command through their skills (`managing-linear-issues` / `managing-jira-issues`),
then recorded with `waived-defects.js record-filed --state-dir <dir> --ref <ref> --url <url>`; until
recorded, `gate` reports such a row as `failed` with reason `file via the <tracker> skill`, so the
close still refuses. For the downgrade, a declared Linear or Jira tracker counts as reachable (no
read-only probe exists without the skill) — see Could Not Verify.

The `defect` label: `gate` checks it with `gh label list` (read-only) and creates it once with
`gh label create defect` when missing, because `gh issue create --label` fails on a missing label.
**Never create an issue to probe the tracker** (`file-followups`' existing rule); every
`gh issue create` files one waived row.

The URL is recorded as an append-only resolve marker `filed <url>` via `discovered.resolve` —
`file-followups` already writes exactly this after filing, so the two paths agree and the ledger
format does not change.

Weight `small`, not `medium`: the owner's instruction fixes the behaviour and the acceptance
cases; there is one obvious approach and the grounding below is complete. The adversarial pass
argued for `medium` on file count; its eleven findings were corrections to how the tasks are
written (applied here: rows-before-tracker, records write on refusal, a manual escape, per-criterion
"never twice", lazy requires, a rendered report line instead of a patch, reopening on a refused
re-audit, non-atomic filing), not new scope, so the weight stands. One finding was rejected:
sweeps cannot waive anything, because the workflow's waiver is active only with at least one
must-pass criterion (`BLOCKING_ACTIVE`, `verify-functional.js:168`) and a sweep declares none.

absorbed:     `recordNonBlockingFollowups` re-records a row once it is resolved — the "never twice" objective cannot hold without it  [BLOCKS]
not absorbed: #126, giving a criterion a priority or tolerance — owner queued it for later

## Non-Goals

- No priority or tolerance per criterion (#126).
- No change to which failures are waived (`decideNext` step 3b and `applyBlockingPolicy` are untouched).
- No new `ship.md` primitive, and no change to what `file-followups` files for any row other than `[non-blocking]`.
- No closing, editing or commenting on an issue after it is filed.
- No reachability probe for Linear or Jira.

## Verification Artifacts

None apply — this is library, command-prose and template work with no UI, no rendered data view and no design.

## Verification Environment

**Environment**: local (unit tests); fixtures (the headless close-feature run in FIX-007)
**Refresh**: fixtures: `packages/core/scripts/scaffold-project.sh --refresh --plugin-dir packages/full <slot folder>`
**Cannot be checked there**: a real GitHub issue in a real tracker — the fixture uses a local stub `gh` on PATH; `github-live-test` is authorized only for `/ship-build` merge-order behaviour, so it is not used here

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Is creating the `defect` label in the project's repo, when missing, acceptable as part of the owner-authorized filing? | Yes — it is the minimum needed for "labelled as a defect" and is idempotent; recorded as an OWNER-CALL | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | New library `waived-defects.js`: parse `## Issue Tracker`, check reachability, list waived rows with their recorded URL, build the defect issue, file missing ones, record URLs, CLI `tracker` / `gate` / `record-filed` | O1, O3, O4 | None | `npx jest packages/core/lib/waived-defects.test.js` passes, with cases: (a) a waived row with no URL and a stubbed `gh` that returns a URL → `gate` prints `ok: true`, the stub saw one `issue create` with `--label defect`, a title containing the criterion id, a body containing the statement, failure, evidence and the "stays open until someone decides not to fix it" line, and a second `gate` run calls `issue create` zero times; (b) a stubbed `gh` that fails `issue create` → `ok: false`, `failed` names that row's ref and summary and the error, and no `filed` marker is written; (c) `Tracker: none` WITH an unfiled waived row → `ok: false` with reason `no tracker declared in stack.md`; (d) a row with a recorded URL lands in `already`, not `filed`; (e) every runner call across all cases is one of `issue create`, `label list`, `label create`, `repo view`; (f) `Tracker: none` and no waived rows → `ok: true` and the runner is never called; (g) a waived row followed by a `met` row for the same criterion is not filed; (h) a second waived row for a criterion that already has a URL is marked with that URL and `issue create` is not called; (i) `issue create` succeeds but the marker write fails → `ok: false`, `failed` carries the URL; (j) `record-filed` writes a marker that a following `gate` reads as `already` |
| FIX-002 | `functional-verification.js`: `recordNonBlockingFollowups` skips a ref whose latest `[non-blocking]` row is filed (resolved); `read-blocking-policy` takes `--stack` and refuses the waiver with no reachable tracker; `renderReport` renders a `**Blocking**:` line from `input.blockingNote`; the report's "Not blocking" line says the failures are filed as defect issues | O2, O3 | FIX-001 | `npx jest packages/core/lib/functional-verification.test.js` passes, with new cases: a row resolved `filed <url>` is not re-recorded on a second `record-nonblocking` call; `read-blocking-policy <v.md with must-pass only> --stack <stack.md with Tracker: none>` prints `policy: 'all'`, `declared: 'must-pass'` and a `waiverRefused` naming the missing tracker, while the same with a declared reachable (stubbed) GitHub tracker prints `policy: 'must-pass'`; without `--stack` the output is unchanged from today; `renderReport` with `blockingNote` emits exactly one `**Blocking**:` line naming the reason, and without it the output is byte-identical to today's for the existing report fixtures |
| FIX-003 | `/implement-trd` §8.1a and `/verify-build` pass `--stack` to `read-blocking-policy` and `blockingNote` (from `waiverRefused`, else null) to the workflow; `verify-functional.js` validates `blockingNote` and carries it into every report input; DECISIONS says the waiver was refused and why; readout "Not blocking" wording says filed as defect issues when the feature closes | O2 | FIX-002 | `npx jest packages/core/commands/verify-command-surface.test.js packages/core/workflows/verify-functional.test.js` passes, with the POLICY_CMD assertion updated to the `--stack "$(node .claude/lib/owner-rules.js path stack.md)"` form, the field-list assertion updated for `blockingNote` after `blocking`, and new workflow cases: a non-string non-null `blockingNote` throws; a supplied one appears in the report-input instructions every time a report is rendered |
| FIX-004 | `/audit-build` close step and `/close-feature` close step run `waived-defects.js gate` (`--closed-by audit` / `owner`) before writing `closed.json`; on `ok: false` write no close record (remove an existing one on a re-audit), open no PR, still write the records ref, end `COMMAND STUCK` naming each row with `Next:` naming the tracker fix or `record-filed`, then the same command; Linear/Jira rows filed through their skill then `record-filed`, then `gate` re-run; STATE lists each filed issue URL with its criterion; close-feature's "decides nothing and checks nothing" framing gains the one exception | O1 | FIX-001 | New `packages/core/commands/waived-defects-close-prose.test.js` passes: in both commands the gate command appears before the `closed.json` write; the refusal text names no close record, the records-ref write, `record-filed`, and (audit-build) never `/close-feature` as the next step; the filing is said to need no `ship.md` step; `.claude/` mirrors are byte-identical to `packages/core/` |
| FIX-005 | `file-followups` files a `[non-blocking]` row only through `waived-defects.js gate` and never refiles a row with a recorded URL; `close-issue` gains the sentence that a waived-defect issue is never closed by the feature that waived it, only when a later feature cites it as its source | O3, O4 | FIX-001 | `npx jest packages/core/contracts/ship-primitives.test.js packages/core/contracts/ship-tracker.test.js` passes, with new cases asserting both sentences in the contracts |
| FIX-006 | Owner-facing text: `verification.md` §5c template (both copies), `/verification-setup` SKILL.md question sentence, `docs/reference/verification.md`, `contracts/functional-verification.md`, and the `Must pass` guidance in `plan.md`, `create-trd.md`, `trd-authoring.md` say a waived failure is filed as a defect issue and that `must-pass only` needs a declared tracker | O5 | FIX-002 | `npx jest packages/skills/verification-setup/__tests__/skill-md.test.js packages/core/commands` passes; `grep -rn "listed and filed as" packages/core .claude` returns nothing AND `grep -rln "defect issue" ` finds every one of the FIX-006 Touches files; the §5c template says `must-pass only` needs a declared tracker; `.claude/` mirrors byte-identical |
| FIX-007 | [LIVE] Headless fixture run: a scaffolded fixture slot with `Blocking: must-pass only`, a `## Issue Tracker` naming a GitHub project, a local stub `gh` on PATH that logs calls, and a feature ledger with one `[non-blocking]` row; run `/close-feature` headless and capture that the issue was filed before `closed.json` was written | O1 | FIX-004 | Evidence under `.trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/live/`: the stub's call log shows one `issue create --label defect` for the row; the ledger row carries a `filed <url>` marker; `closed.json` exists and its mtime is after the stub's log entry; a second run, on a FRESH feature with its own fresh waived row and the stub set to fail `issue create`, shows no `closed.json` and a STUCK banner naming the row |
| AMEND-001 | [test-gap] Both close commands say STATE lists each filed waived-defect issue URL with its criterion; no test asserts it — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: packages/core/commands/close-feature.md:74 and packages/core/commands/audit-build.md:337 carry the sentence; waived-defects-close-prose.test.js has no STATE assertion) | amendment — no objective recorded | None | [test-gap] Both close commands say STATE lists each filed waived-defect issue URL with its criterion; no test asserts it no longer holds |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/waived-defects.js`, `packages/core/lib/waived-defects.test.js`, `.claude/lib/waived-defects.js`
- **Reuse:** `discovered.readAll`, `discovered.latestPerRef`, `discovered.resolve` (`packages/core/lib/discovered.js:86,585,609`) [read]; `readDefinitionRows` (`functional-verification.js:847`, export it if not exported) for the criterion statement from `<stateDir>/success-definition.md`; `<stateDir>/verification-state.json` `criteria[]` (`id`, `status`, `reason`, `artifact`) for failure and evidence [ran]; `## Issue Tracker` format: `Tracker:` (`github`|`linear`|`jira`|`none`) and `Project:` lines (`packages/core/templates/stack.md.template`) [read]
- **Replaces:** nothing — no library parses `## Issue Tracker` today (only contract prose) [ran]
- **Follow:** spawnSync with array args (CLAUDE.md "Command Injection Prevention"); the body goes through `--body-file` (a temp file), never `--body` inline; the CLI prints one JSON line and exits 0 on a refusal (the caller reads `ok`), non-zero only on bad usage; a waived row is one whose summary starts `[non-blocking] ` (`functional-verification.js:1643,1657`); a recorded URL is the `filed <url>` summary of the resolve marker naming it — read the raw ledger lines to get the marker summary, since `readAll` returns only `resolvedAt`
- **Careful:** never `gh issue create` to probe (`ship-primitive-file-followups.md` "Never create an issue to find out whether the tracker works"); reachability is `gh repo view <project> --json name` only; tests inject the runner and never touch the network

### FIX-002
- **Touches:** `packages/core/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`, `.claude/lib/functional-verification.js`
- **Reuse:** `recordNonBlockingFollowups` (`:1621`) [read]; `read-blocking-policy` CLI (`:3248`) [read]; `waived-defects.js` `parseTracker` / `readTracker` from FIX-001 (reachability is the `gh repo view` probe inside `gate`, `waived-defects.js:236`, and `applyTrackerGate`, `functional-verification.js:1197`); report line `**Not blocking**` (`:1833`) [read]
- **Replaces:** `recordNonBlockingFollowups`'s `readAll(stateDir, { open: true })` read — the open-only read is what re-records a filed row [read]
- **Follow:** `readBlockingPolicy` stays pure (content in, result out); the downgrade lives in the CLI branch so the pure function's existing tests are unchanged; existing output keys keep their meaning, new keys (`declared`, `waiverRefused`) appear only on a downgrade
- **Careful:** the existing `readBlockingPolicy` / CLI / FIX-003 tests (`functional-verification.test.js:2475,2535,5366`) must still pass unchanged except for the "Not blocking" wording

### FIX-003
- **Touches:** `packages/core/commands/implement-trd.md`, `packages/core/commands/verify-build.md`, `packages/core/commands/verify-command-surface.test.js`, `.claude/commands/implement-trd.md`, `.claude/commands/verify-build.md`, `packages/core/workflows/verify-functional.js`, `packages/core/workflows/verify-functional.test.js`, `.claude/workflows/verify-functional.js`
- **Reuse:** the existing §8.1a "Read the owner's blocking policy" step (`implement-trd.md:1860`) and verify-build step 3c (`verify-build.md:293`); the `blocking` arg validation (`verify-functional.js:92`) and the way `nonBlocking` reaches the report input (`verify-functional.js:2190-2293`) [read]
- **Replaces:** the bare `read-blocking-policy "$(… path verification.md)"` command line in both files [read]
- **Follow:** validate `blockingNote` like `blocking` (absent → null; wrong type throws); never put it in the Judge's decide-next payload
- **Careful:** `verify-command-surface.test.js:2589` pins the exact command string and `:264` pins the args field list; update them, don't delete them

### FIX-004
- **Touches:** `packages/core/commands/audit-build.md`, `packages/core/commands/close-feature.md`, `packages/core/commands/waived-defects-close-prose.test.js`, `.claude/commands/audit-build.md`, `.claude/commands/close-feature.md`
- **Reuse:** close-feature "The close step" (`close-feature.md:61`) which audit-build step 4 performs by reference (`audit-build.md:331`) [read]; `notify-complete.sh` stuck form [read]
- **Replaces:** nothing — a new step 0 in the close step, before `closed.json`
- **Follow:** state the authority in one sentence: the owner's 2026-11-12 rule plus the project's opt-in to `must-pass only`; no `ship.md` step and no `autonomy.md` sentence is needed; audit-build's STUCK keeps the report, round record and records-ref write it does today (no close, no PR)
- **Careful:** close-feature's "Already closed" path stays unchanged

### FIX-005
- **Touches:** `packages/core/contracts/ship-primitive-file-followups.md`, `packages/core/contracts/ship-primitive-close-issue.md`, `packages/core/contracts/ship-primitives.test.js`, `.claude/contracts/ship-primitive-file-followups.md`, `.claude/contracts/ship-primitive-close-issue.md`
- **Reuse:** file-followups step 4 `discovered.resolve(dir, row, "filed <url>")` [read]
- **Replaces:** filing a `[non-blocking]` row with a plain `gh issue create` [read]
- **Follow:** contract prose style; one sentence each
- **Careful:** the contracts' frontmatter is parsed by `ship-primitives.test.js` — do not touch it

### FIX-006
- **Touches:** `packages/core/templates/claude-directory/rules/verification.md`, `packages/skills/verification-setup/template.md`, `packages/skills/verification-setup/SKILL.md`, `.claude/skills/verification-setup/template.md`, `.claude/skills/verification-setup/SKILL.md`, `docs/reference/verification.md`, `packages/core/contracts/functional-verification.md`, `.claude/contracts/functional-verification.md`, `packages/core/commands/plan.md`, `packages/core/commands/create-trd.md`, `packages/core/contracts/trd-authoring.md`, `.claude/commands/plan.md`, `.claude/commands/create-trd.md`, `.claude/contracts/trd-authoring.md`
- **Reuse:** the existing §5c text and the SKILL.md "Blocking policy" question sentence (`SKILL.md:127`) [read]
- **Replaces:** "recorded as a non-blocking follow-up" / "listed and filed as a follow-up" wording [ran]
- **Follow:** CLAUDE.md "How to talk to the owner" — plain words; this repo's own `.claude/rules/verification.md` is owner-governed and is NOT edited
- **Careful:** `skill-md.test.js` may pin the question sentence; update its expectation with the text

### FIX-007
- **Touches:** `.trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/live/`
- **Reuse:** `packages/core/scripts/scaffold-project.sh --plugin-dir packages/full <slot>`; `test/smoke/lib/project.sh` (`smoke_claude`) [read]
- **Replaces:** nothing
- **Follow:** `verification.md` §1 `fixtures` row and §1a (one slot, `slot-1`); destroy the slot after capture
- **Careful:** the stub `gh` must be first on PATH inside the headless session; nothing may reach real GitHub

### AMEND-001

- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is written here — the file-conflict guard in `task-graph.js` cannot protect this task from a concurrent one until an owner fills in `Touches` by hand. Until then this task has no inferred conflict edges and may be scheduled alongside anything.

## Could Not Verify

After `/audit-build` on 2026-11-12. Items this audit confirmed as built and tested are removed;
its findings are in the audit readout, not here.

- **No PRD was checked.** This TRD has no source PRD (it comes from an owner ruling and a `/plan`
  instruction), so the audit checked only TRD-to-code traceability. Whether the objectives
  faithfully capture the owner's ruling, and whether anything in it was left out, was not checked.
- **Linear and Jira reachability is assumed from the declaration alone.** No read-only probe
  exists without their skills (Non-Goals). A declared but unreachable Linear or Jira tracker is
  caught only when the close tries to file the issue, and then the close refuses (the safe
  direction). Out of scope: no test or fixture exercises a Linear or Jira tracker.
- **No real GitHub issue was filed.** The unit tests and the headless fixture run (FIX-007,
  `evidence/live/FIX-007/`) use a stub `gh`. The `gh issue create` and `gh label` argument shapes
  were checked against `gh --help`, not against a live repo. Out of scope: `github-live-test` is
  authorized only for `/ship-build` merge-order behaviour (`verification.md` §1).
