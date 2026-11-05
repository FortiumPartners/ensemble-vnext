# TRD: cancel-backup-wakeup

**Source PRD**: None — defect, issue #63

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | When a command run prints its final `COMMAND COMPLETE` or `COMMAND STUCK` banner, no fallback wake-up it scheduled is left pending, so the session does not read as busy afterwards and no "nothing to do" turn fires later | issue #63 (measured 22-23 min idle after `/audit-build` closed two features, 2026-11-05) and the reproduction below | yes |
| O2 | The rule is stated once, in `command-status.md`'s banner rules, attached to the final-turn `notify-complete.sh` step every command already runs, with a pointer from `async-discipline.md`'s scheduled-nudge pattern; `/audit-build`, `/implement-trd`, `/verify-build` and `/plan` also name it at each of their final-banner exits | your instruction, 2026-11-05 ("state the rule once in command-status.md or async-discipline.md, reference it from audit-build, implement-trd, plan --implement and verify-build") | |
| O3 | A chained step (`--chained`, ending on a `RETURN` line) does not cancel, because its caller's run is not finished; `/audit-build`'s stale-wake check stays, as the catch for a run that forgot to cancel and for a mid-run wake whose round was already recorded | your instruction, 2026-11-05 ("keep the stale-wake check as a backstop"); `command-status.md` "one banner per RUN" | |

## Reproduction

### Steps
1. Run a long command that dispatches a workflow or background agent. Following
   `command-status.md`'s DISPATCHED banner (`next wake: <ScheduleWakeup ETA …>`) and
   `async-discipline.md`'s scheduled-nudge pattern, the model ends the DISPATCHED turn with a
   fallback `ScheduleWakeup({ delaySeconds: 2400, ... })`. No command text tells it to; the two
   shared rules do. Seen in `/audit-build`, `/implement-trd`, `/verify-build`, `/plan`,
   `/create-trd`, `/audit-trd`, `/create-prd` and `/refine-trd` transcripts.
2. Let the work finish early; the completion notice re-enters the session and the command prints
   its final banner.

### Actual
The fallback wake-up stays armed. The session reads as busy (`waiting_wakeup` under Forge) until
it fires, then spends a turn saying there is nothing to do. Measured in BD4 on 2026-11-05: 23 and
22 minutes idle after `/audit-build` closed (issue #63). Reproduced in this repository the same
day: after `/audit-build docs/TRD/unsynced-boards.md` completed, its fallback fired twice, each
answered "Nothing to do" [ran]. `ScheduleWakeup({ stop: true })` on a later turn reported
"Loop stopped — cancelled 1 pending wakeup(s) … Then write the loop's outcome for the user …
and end the turn" [ran].

### Expected
The final turn cancels the fallback before it prints its readout and banner, so nothing is pending
after the banner.

Root cause [read]: the two shared rules tell the model to schedule a fallback (DISPATCHED banner,
`command-status.md:17-23`; scheduled nudge, `async-discipline.md:117-122`: "schedule a wake …
re-schedule … or proceed") and nothing anywhere tells it to cancel one. `command-status.md` §3
(`:56-59`) lists the final turn's duties without it, and `grep -n "stop: true"` over
`packages/core/commands/*.md` and `.claude/rules/*.md` finds nothing [ran]. `/audit-build` step 0
handles a stale wake only after it fires, by which time the idle time is spent.

## Decision

State the cancel once in `command-status.md` §3 as part of the final turn, **unconditionally**:
the turn that prints a run's final `COMMAND COMPLETE` or `COMMAND STUCK` calls
`ScheduleWakeup({ stop: true })` **before** printing its readout and banner, on the same turn as
`notify-complete.sh`. Unconditional, because "only if this run scheduled one" depends on memory
that compaction drops (`implement-trd.md` warns against rebuilding the in-flight set from memory),
and covering every command through the one step all 27 already run fixes the cause where it lives.
Before the banner, because the tool's result asks for more visible text, which would otherwise
follow the banner and break "nothing after it" (`command-status.md:56`). A one-line pointer goes in
`async-discipline.md`'s scheduled-nudge pattern, where the wake-up is scheduled.

Name the risk plainly in the rule: `stop: true` is the dynamic-loop stop control and appears to
clear every pending wake-up in the session, so it also cancels a reminder the owner scheduled in
the same session and ends a `/loop` the owner is running. That is accepted for a command's final
turn (see OQ-1).

A `--chained` step ends on a `RETURN` line, emits no banner and does not cancel; the caller's final
turn clears anything it scheduled. `/audit-build`, `/implement-trd`, `/verify-build` and `/plan`
also name the step at every final-banner exit, beside `notify-complete.sh`, matching how that
helper is named per command: `/verify-build`'s fix-loop step 6 and its round-STUCK exit,
`/plan`'s sweep-chain `stop` step (7a.6) and its 7a STUCK exits, `/audit-build`'s close and its
early STUCK exits.

`/audit-build`'s `stale-wake` check stays as it is; its stated purpose becomes catching a run that
forgot to cancel and a mid-run wake whose round was already recorded (a dead session is not
claimed: wake-ups are session-scoped and whether a dead session fires one is unverified).

Rejected: cancelling as soon as the completion notice arrives (a later chained fix run or review
schedules its own fallback, and a wake that fires mid-run is a legitimate wait; only one left after
the banner is the defect); naming the step only in the four commands (the scheduling comes from
the shared rules and happens in at least eight commands, so the shared rule is the fix);
a model-judged `discipline-stop` check or a deterministic `Stop` hook flagging a final banner while
`hookData.session_crons` is non-empty (a hook change, and constitution prohibition 4 limits
blocking hooks; possible follow-up).

absorbed: `plan.md`'s "Never on a chained run" paragraph (~line 1258) limits the final-turn helper to paths "that stop without chaining", which contradicts its own sweep-chain step 7a.6 and would make the cancel be skipped exactly on the sweep chain where `/verify-build` scheduled a fallback  [BLOCKS]
not absorbed: Forge-side gate (islayjames/forge-vnext#135) — another repository.

## Non-Goals

- Changing when or how often a command schedules its fallback.
- Changing what `/audit-build`'s `stale-wake` check does (only its stated purpose).
- Changing the `discipline-stop` hook or adding a hook.
- Editing `constitution.md` (owner-governed).

## Verification Artifacts

None apply — the change is command and rule prose; no screens, journeys or data views change.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | `ScheduleWakeup({ stop: true })` also ends a `/loop` dynamic loop and appears to clear every pending wake-up in the session. A command cannot tell reliably that it is running inside an owner's `/loop`. Accept that a command's final turn ends such a loop and cancels the owner's own pending reminders? | Yes: cancel unconditionally on the final turn and state the risk in the rule; a `/loop` user re-arms the loop | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | State the cancel rule in `command-status.md` §3 (final turn: `ScheduleWakeup({ stop: true })` before the readout and banner, unconditional, never under `--chained`, the session-wide and `/loop` risk) and point to it from `async-discipline.md`'s scheduled-nudge pattern, in both the `.claude/rules/` copies and the `packages/core/templates/claude-directory/rules/` templates | O1, O2, O3 | None | `verify-command-surface.test.js` asserts, for both copies of each file: `command-status.md` §3 says the final COMPLETE/STUCK turn calls `ScheduleWakeup({ stop: true })`, that it does so before printing the readout and banner, that a `--chained` step ending on a `RETURN` line does not, and names the `/loop` and other-pending-wake-ups risk; `async-discipline.md`'s scheduled-nudge section says to cancel the wake on the final turn and names `command-status.md`; each `.claude/rules/` file is byte-identical to its template. These assertions fail on today's text, which has no `stop: true` |
| FIX-002 | `/audit-build`, `/implement-trd`, `/verify-build` and `/plan` name the cancel at every final-banner exit; `plan.md`'s "Never on a chained run" paragraph is corrected to match step 7a.6; `/audit-build` step 0 states stale-wake's purpose as the catch for a forgotten cancel and a mid-run stale wake | O1, O2, O3 | FIX-001 | `verify-command-surface.test.js` asserts each of the four command files contains `ScheduleWakeup({ stop: true })` in its output-discipline section and says it comes before the banner and is skipped under `--chained`; `verify-build.md` also has it in the fix loop's step 6 and its round-STUCK exit; `plan.md` also has it at step 7a.6 (`stop`) and the 7a STUCK exits, and its "Never on a chained run" paragraph no longer says the helper runs only on paths that stop without chaining; `audit-build.md` has it at the close and its early STUCK exits, and step 0 still runs `stale-wake`; every `.claude/commands/` copy is byte-identical to its source; the command-structure lint passes |

## Task Grounding

### FIX-001
- **Touches:** `.claude/rules/command-status.md`, `packages/core/templates/claude-directory/rules/command-status.md`, `.claude/rules/async-discipline.md`, `packages/core/templates/claude-directory/rules/async-discipline.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** §3's "Rules for the COMPLETE/STUCK banner" paragraph (command-status.md:56-59), Path B's `notify-complete.sh` final-turn step, and the "Enforcement" section's chaining exception ("one banner per RUN, not one per command name", ~:230-238), which already define the final turn and suppress the helper under `--chained` [read]; async-discipline.md "Orchestration pattern: the scheduled nudge" (line 108 on) [read]
- **Follow:** existing tests in `verify-command-surface.test.js` that read both copies of `command-status.md` (~:423-440, ~:1080-1095) [read]; rule prose carries a short "why" with the measurement, as elsewhere in these files [read]
- **Careful:** both rule files ship to projects as templates and must stay byte-identical to the `.claude/rules/` copies [ran]; keep the addition short (command-status.md is 12,983 bytes, async-discipline.md 8,041) [ran]; do not edit `constitution.md` [read]; whether `stop: true` errors when nothing is pending is unverified — the rule must not depend on its result text [inferred]

### FIX-002
- **Touches:** `packages/core/commands/audit-build.md`, `packages/core/commands/implement-trd.md`, `packages/core/commands/verify-build.md`, `packages/core/commands/plan.md`, `.claude/commands/audit-build.md`, `.claude/commands/implement-trd.md`, `.claude/commands/verify-build.md`, `.claude/commands/plan.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** `implement-trd.md` "Output discipline" items 4-6 (~:2344-2366) and its Step 10.1 STUCK; `verify-build.md` Output discipline (~:600-614), fix-loop step 6 (~:570-573) and round-STUCK (~:525-527); `audit-build.md` "Programmatic completion notify" (~:495-501), close step (~:317-321), early STUCK exits (~:32, ~:235) and step 0 (~:283-288); `plan.md` Output discipline (~:1236-1262), step 7a.6 (~:1199-1201) and the 7a STUCK exits (~:1185, ~:1190-1192) [read]
- **Replaces:** `plan.md`'s "Never on a chained run … Call this only on the paths that genuinely end here" wording, which contradicts step 7a.6 — rewrite it to say the helper (and the cancel) run on the turn that prints this run's banner, never on a handoff to a chained command that prints its own [read]
- **Follow:** the wording FIX-001 puts in `command-status.md` §3; reference it rather than restate its reasons [inferred]
- **Careful:** `/implement-trd --chained`, `/verify-build --chained` and `/sweep --chained` end on a `RETURN` line and must not cancel [read]; `/plan --implement`'s plain path emits no banner (the chained `/implement-trd` does, and cancels) [read]; `implement-trd.md` is very long — edit only the named sections [read]

## Could Not Verify

- Whether a model running these commands actually issues the cancel on its final turn; the tests pin the text, not a session's tool calls.
- Whether `ScheduleWakeup({ stop: true })` clears every pending wake-up in the session or only the latest, and whether it errors when nothing is pending: in this session it reported "cancelled 1 pending wakeup(s)" after several had already fired.
- Whether a dead session fires its pending wake-ups at all (they are session-scoped).
