# Functional Success Definition: cancel-backup-wakeup

**Source**: docs/TRD/cancel-backup-wakeup.md §Reproduction (lines 13-45: Steps, Actual, Expected as amended, Root cause)
**Source kind**: reproduction
**Derived**: 2026-11-06T00:39:43Z
**Criteria**: 5

"Tracked work" below means what the amended Expected (line 36) names: a `Workflow`, a
background `Agent`, or a background `Bash` — work Claude Code itself re-enters the session for
when it finishes. Line numbers are in `docs/TRD/cancel-backup-wakeup.md`.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | When a command dispatches tracked work and ends its DISPATCHED turn, that turn makes no `ScheduleWakeup` call — no fallback wake-up is scheduled for work Claude Code already tracks | §Reproduction Steps lines 16-19 (the fallback `ScheduleWakeup({ delaySeconds: 2400 })` at the end of the DISPATCHED turn is the defect); Expected lines 36-37 | Live headless `claude --print` session (`--plugin-dir packages/full --setting-sources project`) in a scratch project, running a small command that dispatches a background `Agent` (or `Workflow`) and then completes. Artifact: a per-turn tool-call listing extracted from the session transcript JSONL, showing the DISPATCHED turn's calls and a line counting `ScheduleWakeup` calls in that turn as 0 | [read] | locator | | O1 |
| FS-2 | The DISPATCHED banner that ends that turn reads `next wake: auto-deliver on completion` | Expected lines 37-38 | The same session transcript: the DISPATCHED turn's final assistant text, containing the literal line `next wake: auto-deliver on completion` | [read] | locator | | |
| FS-3 | When the tracked work finishes, its completion re-enters the session, the command prints its final `COMMAND COMPLETE` (or `COMMAND STUCK`) banner as the last line, and nothing is pending afterwards: no `ScheduleWakeup` was called anywhere in the run and no further turn (such as a "nothing to do" turn) follows the banner | Steps lines 22-23 (completion re-enters, final banner printed); Expected line 37 ("nothing is pending after the banner"); Actual lines 26-30 (the armed wake-up keeps the session busy, then fires a "Nothing to do" turn — the behaviour that must not recur) | The same session transcript, reduced to an ordered turn list: the completion-notification turn, the banner as the final line of the last assistant turn, a whole-run count of `ScheduleWakeup` calls equal to 0, and no assistant turn after the banner turn (observed after the session has been left running past the point a fallback would have fired, or after the `--print` process exits on its own) | [read] | locator | | O1 |
| FS-4 | Each of the 2 shared rules the reproduction names as the cause — the DISPATCHED banner in `command-status.md` and the scheduled-nudge pattern in `async-discipline.md` — no longer tells the model to schedule a fallback wake-up for tracked work, and keeps `ScheduleWakeup` only for waiting on external state | Steps lines 17-20 ("No command text tells it to; the two shared rules do"); Root cause lines 40-42 (`command-status.md:17-23`, `async-discipline.md:117-122`); Expected line 38 ("`ScheduleWakeup` is kept for external state only") | Text check over the shipped copies (`packages/core/templates/claude-directory/rules/`) and the `.claude/rules/` copies of both files: the DISPATCHED banner template's `next wake:` line offers `auto-deliver on completion` for tracked work, and the scheduled-nudge section limits `ScheduleWakeup` to external state. Artifact: a grep transcript over both files quoting the relevant lines | [read] | locator | 2 | O1 |
| FS-5 | Each of the 8 commands the reproduction names — `/audit-build`, `/implement-trd`, `/verify-build`, `/plan`, `/create-trd`, `/audit-trd`, `/create-prd`, `/refine-trd` — carries no instruction to schedule a fallback `ScheduleWakeup` for the tracked work it dispatches | Steps lines 20-21 (the 8 commands where the fallback was seen); Expected lines 36-37 | Text check over the 8 command files under `packages/core/commands/`: a grep for `ScheduleWakeup` and `next wake` in each, with every hit quoted and shown to be either absent, `auto-deliver on completion`, or scoped to external state. Artifact: the grep transcript, one section per command | [read] | locator | 8 | |

**A criterion carrying a `Parts` count cannot pass incrementally.** FS-4 resolves `met` only
when both rules are shown; FS-5 only when all 8 commands are. 7 of 8 is `not_met` with the
missing command named.

**Considered and not made a criterion:**

- *A final-turn `ScheduleWakeup({ stop: true })` cancellation* — the original Expected, now
  superseded (line 35). The amended expectation is that nothing is scheduled in the first
  place, so requiring a cancel would contradict the source.
- *The session reading as `waiting_wakeup` under Forge* (line 26) — a Forge-specific symptom.
  FS-3's "nothing pending, no turn after the banner" is the same outcome observed without
  Forge, so it is not a separate criterion.
- *`/audit-build` step 0 handling a stale wake after it fires* (line 45) — the root-cause
  paragraph describes it as insufficient; the source asks for nothing about it.
- *The BD4 idle times of 23 and 22 minutes* (line 27) — a measurement of the defect, not a
  target; no figure is set for the fixed behaviour.

**Belief, not fact:** that a headless `claude --print` session stays alive long enough for a
background `Agent`'s completion to re-enter it, so FS-1 to FS-3 can be shown in one run. If
`--print` exits before re-entry, the exerciser states that as the reason and uses an
interactive or `tmux`-driven session instead; either produces the same transcript.
