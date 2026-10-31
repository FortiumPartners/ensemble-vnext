# TRD: task-command

**Source PRD**: None — small change decided in GitHub FortiumPartners/ensemble-vnext#52 (the issue's proposal, rules and acceptance are the source)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | `/task "<prompt>"` and `/task <brief.md>` both run to `COMMAND COMPLETE`, leaving `.trd-state/<task-dir>/implement.json` with every step `success` or `deferred`, a `closed.json` holding `outputs` and `followups`, and a `report` entry in `artifacts.json` when an artifact was published | #52 Acceptance 1 | yes |
| O2 | A step that cannot be done ends `deferred` with its reason and is never retried in a loop; the run still closes. A task where no step could be done ends `COMMAND STUCK` | #52 Acceptance 2, Proposal 3 | yes |
| O3 | Existing readers of `implement.json` and `artifacts.json` (session banner, status hook, `/implement-trd`'s TRD resolution) work on a task directory without breaking or mistaking it for an unfinished feature | #52 Acceptance 3; Problem (tooling "saw an unfinished feature") | |
| O4 | Apart from the framework's own bookkeeping files (`.trd-state/current.json`, `_command-runs/`, the shared session log and dispatch ledger), `/task` modifies nothing outside its own state directory and the output paths the prompt declares. It changes product code, pushes or opens PRs only when the prompt explicitly asks | #52 Acceptance 4, Rules | |
| O5 | `/task` is discoverable like every other workflow command: delivered by scaffolding, named in the command lists and the router's orientation hint | #52 Name; this repo's command conventions | |

## Intended Change

From #52 (2026-10-31). Today a job whose output is findings or an artifact, not merged code, is
forced through `/plan`. That writes an unneeded TRD and leaves no clean end state. On the dart
repo, 2026-10-30, a 176-pair visual re-check ran through `/plan`, published its report, and left
no `implement.json`, no `closed.json` and no artifact entry, so tooling saw an unfinished
feature. Current behaviour confirmed: no `/task` exists, and no command in
`packages/core/commands/` writes a close record without a TRD `[read]`.

After this change, `/task <prompt | path-to-brief>`:

1. Creates `.trd-state/task-<slug>/`. The slug comes from the brief's basename or the prompt's
   first words. A clash with an existing `.trd-state/*/` directory or `docs/TRD/<slug>.md` gets a
   `-2`, `-3` suffix. When `.trd-state/current.json` names no feature in flight (`trd` null or
   absent), it points `current.json` at the task (`trd: null`, `status:
   .trd-state/task-<slug>/implement.json`). When a feature *is* in flight, it leaves
   `current.json` alone and says so in the readout.
2. Breaks the prompt into a short step list and writes it as `implement.json` in the existing
   shape: `tasks` with `description`/`status`/`started_at`/`completed_at`, `phase_cursor`,
   `checkpoints[]` (`commit` may be null), `trd_file` set to null, `brief` set to the brief path
   or null, and `"kind": "task"` as a positive marker.
3. Runs each step once. A step that cannot be done is recorded as `deferred` with its reason and
   is never retried. A harness limit is "could not do this", not a defect to loop on. It honours
   `.claude/rules/verification.md`'s environment permissions and resource capacity, and the
   repo's shared-machine rules, like any other command.
4. Records each output file with `artifacts.js record`: the first under kind `report`, any
   further ones as `report-2`, `report-3` and so on, because `record` keeps one entry per kind.
   It publishes them when publishing is on. An output that `record` rejects (a directory, a path
   outside the project) is listed only in `closed.json`'s `outputs`.
5. Writes `closed.json`: `{feature: "task-<slug>", trd: null, closedAt, closedBy: "task", note:
   null, audit: null, reason: "task-complete" | "task-stuck", outputs: [...], followups:
   [...]}`. `followups[]` lists what the findings say needs doing, each item with its evidence;
   the task never acts on them.
6. Ends: prints the four-section readout and runs `notify-complete.sh "task" ...` with
   `task-<slug>` named in the summary, then sends a `PushNotification` (a long-running command,
   per `command-status.md` Path A). Only after that does it clear `current.json`'s four keys,
   and only if they still point at this task. The last line is `═══ COMMAND COMPLETE: /task ═══`,
   or `COMMAND STUCK` when no step could be done.

`/task --resume` scans for the most recent `.trd-state/*/implement.json` with `"kind": "task"` and
no `closed.json`. It continues from the first step that is neither `success` nor `deferred`, and
never needs `current.json`.

## Decision

**One command prompt, no workflow script and no new library.** `/task` runs its steps inline,
the way `/amend` does (it has no file in `packages/core/workflows/`). It writes state through the
existing libraries:
- `implement-state.js`: `save()` the state object after setting fields, `recordResult()` per
  step, and `checkpoint()`. `recordResult` already stores any status other than success/failed
  as given, so `deferred` needs no code change `[read: implement-state.js:285-289]`.
- `artifacts.js`: `record`.

**`closed.json` extends the existing shape; it does not replace it.** It keeps `feature`,
`closedAt` and `closedBy`, which the existing readers use — `session-context.js` reads `closedAt`
and `closedBy` (`session-context.js:112-125`), `audit-rounds.js` reads `closedAt`
(`audit-rounds.js:130-132`), and `implement-trd.md` checks the file exists and quotes `closedAt`
(`implement-trd.md:172-180`) — and adds `reason`, `outputs` and `followups`. No reader rejects
unknown keys `[read]`.

**Point `current.json` at the task only when no feature is in flight — never save and restore
it.** This narrows #52 Proposal 1, deliberately. The adversarial review showed that saving and
restoring the pointer fails three ways:
1. An interrupted task strands the owner's in-flight feature, so `/amend` and `/close-feature`
   both stop on `trd: null`.
2. A `--resume` would overwrite the saved pointer.
3. The saved copy would land in a git-tracked directory, while `current.json` is deliberately
   untracked (`.gitignore:15-21`).

`--resume` finds the task by scanning for `"kind": "task"`, so the pointer is only a convenience
for the session banner.

**Identify a task by `trd_file === null` plus `"kind": "task"`, never by the `task-` name
prefix.** A real TRD can start with `task-`; this very TRD, `task-command.md`, has the state
directory `.trd-state/task-command/`. Every existing `implement.json` has a non-null
`trd_file` `[read by reviewer]`.

**Notify before clearing the pointer.** `notify-complete.sh` derives `NOTIFY_FEATURE` from
`current.json` (`notify-complete.sh:156-167`). The summary names `task-<slug>` explicitly, the
way `close-feature.md` names its feature.

**`report` joins `artifacts.js`'s documented `KINDS`.** The kind set is open (`record`
validates only the kind's format), but `KINDS` is the documented list, so `report` is added
there and to `command-status.md`'s prose list. Further outputs use `report-<n>`.

absorbed:     `/implement-trd`'s TRD resolution (branch-derived and "single in-progress") reads any unclosed `.trd-state/*/implement.json`; an interrupted task (trd_file null) would be resolved as a TRD and fail — O3 cannot hold without skipping it  [BLOCKS]
not absorbed: `precompact.js`, `dispatch-ledger.js`, `router.py` `derive_feature()` and `notify-complete.sh` derive the feature from `current.trd`; during a task they fall back to the shared session log / ledger and an empty `feature=` marker — still recorded, not per-task; separate change to every feature-derivation reader
not absorbed: `session-context.js` counts `deferred` steps as neither done nor failed, so a task with deferred steps shows e.g. "3/5 tasks complete" — cosmetic; the closed task is no longer pointed at once it ends
not absorbed: `session-context.js` shows `closedBy` values other than "audit" as "by owner" — never reached for a task, because the banner reads `closed.json` only when `current.trd` is set

## Non-Goals

- No TRD, no `/audit-build`, no verification loop for a task: the prompt's own acceptance is the
  bar (#52 Rules).
- No orchestrator awareness: `/task` reads and writes only Ensemble's own state files.
- No change to how `/plan`, `/sweep` or `/amend` work.
- No per-task feature derivation in the router, precompact, dispatch-ledger or notify hooks (see
  Decision, "not absorbed").
- `/task` never acts on its own `followups`, and never files them as issues.

## Verification Artifacts

None apply — the deliverable is a command prompt plus small library and documentation edits. No
UI, journey or data view exists to compare against.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should `/task` file its `followups` as issues in the project's tracker? | No. #52 says the task never acts on them. Filing belongs to the `/ship-build` design (#53), which files leftovers by default. | owner-only |
| OQ-2 | #52 says `/task` points `current.json` at itself. This plan does so only when no feature is in flight, and finds tasks for `--resume` by scanning instead. Acceptable? | Yes: it is the narrowing the adversarial review justified (see Decision). | owner-only |
| OQ-3 | Should a task write its session log and dispatch ledger into its own directory? | Not in this change. They fall back to the shared files, which still record everything. | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| TASK-001 | Write the `/task` command, `packages/core/commands/task.md`, implementing every numbered behaviour in `## Intended Change`, `--resume`, the `## Decision` rules (pointer only when no feature is in flight; identify a task by `trd_file` null plus `"kind": "task"`; notify before clearing the pointer) and `## Non-Goals`. Include the four-section readout, the COMPLETE/STUCK banner and the autonomy block. Byte-identical mirror at `.claude/commands/task.md`. | O1, O2, O4 | TASK-002 | (1) `test -f` passes for both `packages/core/commands/task.md` and `.claude/commands/task.md`, and the two are byte-identical. (2) The file names each state write by the library call that performs it: `implement-state.js` `save(`, `recordResult(` with status `"deferred"`, `checkpoint(`, and `artifacts.js record --kind report`. (3) It states the `closed.json` keys `closedBy: "task"`, `reason`, `outputs` and `followups`. (4) It says a failed step is recorded `deferred` with a reason and not retried, and that zero completed steps ends `COMMAND STUCK`. (5) It says `current.json` is written only when no feature is in flight, and is cleared after `notify-complete.sh` and only if it still points at this task. (6) It states the report-only default: no product-code change, push or PR unless the prompt asks. (7) It contains `notify-complete.sh "task"`, `PushNotification`, and `═══ COMMAND COMPLETE: /task ═══`. (8) `notify-on-complete.test.sh` passes. |
| TASK-002 | Add `report` to `artifacts.js`'s documented `KINDS` (core and `.claude/lib/` copies), update `artifacts.test.js`'s pinned list, and add `report` to the kinds listed in `command-status.md` (`.claude/rules/` and `packages/core/templates/claude-directory/rules/` copies) within that file's size ceiling. | O1 | None | (1) `require("./packages/core/lib/artifacts").KINDS` includes `report`. (2) `artifacts.test.js` passes and pins `report`. (3) A new test runs `record` with kind `report` on a fixture file and reads it back with `get`. (4) Both `command-status.md` copies contain `` `report` `` and stay under 13,000 bytes; `runtime-integrity.test.sh` passes. |
| TASK-003 | In `/implement-trd`'s TRD selection (step 1.2, both "Branch-derived" and "Single in-progress"), skip any `.trd-state/*/implement.json` whose `trd_file` is null or whose `kind` is `"task"`, so an interrupted `/task` is never resolved as a TRD. Mirror to `.claude/commands/implement-trd.md`. | O3 | None | (1) `packages/core/commands/implement-trd.md` step 1.2 contains the skip rule naming `trd_file` null and `"kind": "task"`, and the TRD-name-prefix rule appears nowhere. (2) A new assertion in `verify-command-surface.test.js` pins that text, so the test fails if the rule is removed. (3) The `.claude/commands/` copy is byte-identical. |
| TASK-004 | Register `/task` in the docs and the router: change "21 commands" to "22 commands" in `CLAUDE.md`; add the workflow-overview line and a command-reference entry in `.claude/rules/process.md` and `packages/core/templates/process.md.template`; add `docs/reference/README.md` command rows; add a `/task` section in `docs/reference/other-commands.md`; add one line to `FRAMEWORK_HINT`'s FLOW bullet (job producing findings, not code → `/task`) in `packages/router/hooks/router.py` and `.claude/hooks/router.py`. | O5 | TASK-001 | (1) `CLAUDE.md` contains "22 commands" and no longer contains "21 commands"; it stays under 15,500 bytes and `runtime-integrity.test.sh` passes. (2) Each of `.claude/rules/process.md`, `packages/core/templates/process.md.template`, `docs/reference/README.md` and `docs/reference/other-commands.md` contains `/task`. (3) Both `router.py` copies are byte-identical, `FRAMEWORK_HINT` contains `/task`, and `pytest packages/router` passes, including a new assertion that the hint names `/task`. |
| TASK-005 | Pin `task.md`'s contract and the readers' handling of a task directory. (a) In `packages/core/commands/verify-command-surface.test.js`, add a describe block asserting TASK-001 criteria (2)–(7) against the file text, and add `task` to the mirror-parity list. (b) A fixture test: build a temporary task directory (`implement.json` with `trd_file` null, `"kind": "task"`, one `success` and one `deferred` step written via `recordResult`, plus a `closed.json`). Assert that `recordResult` persisted `deferred`, that `session-context.js`'s banner summary renders without error, and that `status.js`'s scan leaves the directory unchanged. | O1, O2, O3, O4 | TASK-001 | (1) The new tests pass. (2) The tests fail when the asserted text is removed: shown by running the describe block once against a copy of `task.md` with criterion (5)'s sentence deleted and reporting the failure. (3) The fixture test fails if `recordResult` stops persisting `deferred`. (4) The full `packages/core` Jest suite passes, apart from the known `status.test.js` load failure (`mock-fs` on Node 26). |

## Task Grounding

### TASK-001
- **Touches:** `packages/core/commands/task.md`, `.claude/commands/task.md`
- **Reuse:**
  - `implement-state.js` `save()` (needs no prior file), `recordResult()` (stores any status other than success/failed verbatim, so `deferred` works; throws only on an unknown task id) and `checkpoint()` (stores `commit: commit || null`) `[read: packages/core/lib/implement-state.js:70-96, 207-289, 315-325]`.
  - `artifacts.js record|get` CLI. `record` requires `--command` and a relative existing file inside the project, rejects directories, and keeps ONE entry per kind (`data[kind] = next`) `[read: packages/core/lib/artifacts.js:111-159]`.
- **Follow:**
  - `amend.md`'s shape: a command with no workflow script that runs inline and seeds `implement.json` itself `[read: amend.md:164-166]`.
  - `close-feature.md`'s close step for writing `closed.json`, checking it parses, and clearing `current.json`'s four keys `[read: close-feature.md:58-75]`.
  - `/plan`'s rule that a slug derived from free text goes through a heredoc, never interpolated into a shell string `[read: plan.md, Step 3 "O-INJECT"]`.
  - `.claude/rules/command-status.md`: the four-section readout, the banner, and Path A `PushNotification` for long-running commands.
- **Careful:**
  - `router.py` treats a command as framework-owned when `.claude/commands/<name>.md` exists and contains `notify-complete.sh`. That is what keeps the autonomy judge's run state active, so the call must be present `[read: router.py:341-367]`.
  - `notify-on-complete.test.sh:313-355` requires every command to call `notify-complete.sh` with its own name as the first argument `[read by grounding agent]`.
  - `notify-complete.sh` derives `NOTIFY_FEATURE` from `current.json`, so call it before clearing the pointer, and name `task-<slug>` in the summary `[read by reviewer: notify-complete.sh:156-167]`.
  - `/amend` (`amend.md:48-49`) and `/close-feature` (`close-feature.md:35-43`) stop when `current.trd` is null. That is why the pointer is never taken over while a feature is in flight.

### TASK-002
- **Touches:** `packages/core/lib/artifacts.js`, `.claude/lib/artifacts.js`, `packages/core/lib/artifacts.test.js`, `.claude/rules/command-status.md`, `packages/core/templates/claude-directory/rules/command-status.md`
- **Reuse:** the existing `KINDS` array, which is documentation only; `record()` validates the kind's format, not membership `[read: artifacts.js:35-42, 139-141]`.
- **Careful:**
  - `artifacts.test.js:28-34` uses `toEqual` on the exact array, so update it in the same change.
  - `command-status.md` is about 53 bytes under its 13,000-byte ceiling (`runtime-integrity.test.sh:538-541`). Add `report` by editing the existing list at `:190-193`, e.g. appending ``, `report` ``, not with a new sentence.
  - `verify-command-surface.test.js:415-445` pins nearby wording in both copies.

### TASK-003
- **Touches:** `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** the existing "Branch-derived" and "Single in-progress" step text `[read: implement-trd.md:148-153]`.
- **Careful:**
  - Never key the skip on the `task-` directory prefix: `docs/TRD/task-command.md`, this very TRD, has the state directory `.trd-state/task-command/` `[read by reviewer]`.
  - The `implement-trd.md` mirror must stay byte-identical; `verify-command-surface.test.js:47-63` checks it.

### TASK-004
- **Touches:** `CLAUDE.md`, `.claude/rules/process.md`, `packages/core/templates/process.md.template`, `docs/reference/README.md`, `docs/reference/other-commands.md`, `packages/router/hooks/router.py`, `.claude/hooks/router.py`, `packages/router/tests/test_router.py`
- **Careful:**
  - `CLAUDE.md` is about 64 bytes under its 15,500-byte ceiling (`runtime-integrity.test.sh:545-549`). Change only the count, in place.
  - `process.md` and its template already differ; only `process-doc-audit-docs.test.js` pins specific text.
  - `test_router.py:1069-1076` pins `/audit-build` appearing before `/close-feature` in `FRAMEWORK_HINT`; add the `/task` line without reordering those.

### TASK-005
- **Touches:** `packages/core/commands/verify-command-surface.test.js`, `packages/core/lib/task-dir.fixture.test.js`
- **Reuse:**
  - `implement-state.js` `save`/`recordResult` to build the fixture.
  - `session-context.js`'s exported helpers, if it exports them; otherwise run it as a script against a temporary root, the way `session-context.test.js` does `[inferred — check its exports]`.
  - `status.js`'s scan entry point the same way.
- **Follow:** the existing per-command describe blocks and the mirror-parity block at `verify-command-surface.test.js:47-63`; the temporary-root pattern in `packages/core/hooks/session-context.test.js`.

## Could Not Verify

- No live `/task` run. The command is a prompt, so whether a model following it really runs each
  step once and writes every record is checked only by the functional-verification pass and the
  owner's first use. O1 and O2 are pinned by text and by library behaviour, not by a live run.
- The dart-repo observation in #52 is quoted from the issue, not re-checked; it is background to
  the design, not something the delivered code can show.
- Fidelity to product requirements (audit-build, 2026-10-31). No PRD was supplied to the
  audit, so the delivered command was checked only against this TRD's own objectives and tasks
  (all 24 requirements and 5 tasks traced), never against a source of product intent. Whether
  this TRD dropped or narrowed anything the owner asked for in #52 is unchecked.
