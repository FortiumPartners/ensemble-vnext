# Brief: the Stop judge blocks a finished turn because the platform armed a monitor by itself

The Stop judge (`discipline-stop`, the model-judged hook that blocks a final message promising
work nothing will do, "case A") blocked a correct, finished turn because the payload's
`background_tasks` held a monitor the platform had started on its own, not one the agent started.
Measured once, live, on 2026-11-20 in the Code Mode assessment (test 4, Code Mode on).

## Steps

1. Run an Ensemble command that publishes an artifact and ends with a COMMAND COMPLETE readout,
   in a session where publishing arms a live-updates monitor. In the measured case: `/plan` with
   the implement option chained into `/implement-trd`, with Code Mode on. Publishing the TRD left a
   `background_tasks` entry of type monitor, status running, described as "live updates for
   artifact ... (auto-armed on publish)".
2. Let the command finish. Its final message is the four-section readout and the
   `═══ COMMAND COMPLETE: /implement-trd ═══` banner. It promises nothing.
3. The Stop judge (`packages/core/hooks/prompts/discipline-stop.source.md`, model
   `claude-sonnet-5`) evaluates that final message.

Evidence: `.trd-state/code-mode-assessment/report.md`, "Test 4" and "What broke" item 1, on the
branch `feature/10-code-mode-assessment` (worktree
`/private/tmp/ensemble-vnext-feature-10-code-mode-assessment`, records ref
`refs/ensemble/records/task-code-mode-assessment`). The block text is in
`evidence/live/logs/cm-s5-pane.txt` lines 40-47 and `cm-s5-watch.txt` lines 210-214 there. The
full transcript is `evidence/live/logs/cm-s5-transcript.jsonl` there.

## Expected

A `background_tasks` entry the message never mentions, and in particular a monitor the platform
arms by itself (for example an artifact live-updates monitor marked "auto-armed on publish"), is
not a promise the agent made. Its presence alone never makes a final message case A. Case A
judges what the message says: a final message that promises nothing is allowed whatever is
running. A real unbacked promise is still blocked, including one whose only "backing" is an
auto-armed monitor that cannot be what the message waits on.

## Actual

The judge blocked with case A:

> Case A: the final message reports a background task still running - background_tasks lists a
> 'monitor' with status 'running' for 'live updates for artifact ... (auto-armed on publish)' -
> but the message says nothing about this ongoing watcher; more importantly, the COMMAND
> COMPLETE banner and the whole readout present the run as fully finished ('feature closed',
> 'nothing pushed (no remote)') while a live monitor task is still active and unaccounted for.

The session had to spend one extra turn replying "My answer stands — the running monitor was
started automatically when the TRD was published…". The Code Mode-off run of the same test had no
auto-armed monitor in its payload (0 mentions, against 2 with Code Mode on) and was not blocked.
So the trigger is the monitor's presence, which can also happen without Code Mode.

The block invents a rule the prompt does not state ("a running task the message does not account
for"). The prompt only uses `background_tasks` as something that keeps an after-an-event promise
(`discipline-stop.source.md:30`). Nothing in it says the reverse: a running task the message
never mentions is not evidence of a promise.

## Where

- `packages/core/hooks/prompts/discipline-stop.source.md:27-40`: case A's "After an event"
  paragraph, its list of what keeps a promise (line 30, `background_tasks`), and the "Not case A"
  paragraph (line 40). The fix is a short clause here, for example in "Not case A": a running task
  is never a promise by itself; case A is about what the message says, and a task the platform
  armed on its own ("auto-armed on publish") is not the agent's. The prompt must stay under the
  6,000-character limit that `packages/core/hooks/prompts/build-judge-prompts.test.js:296`
  enforces (built prompt is 4,650 characters today). Add one general sentence, not a correction
  for each incident (`docs/reference/hooks.md` §6.5).
- Rebuild: `node packages/core/hooks/prompts/build-judge-prompts.js` (writes
  `discipline-stop.prompt.md`), then `packages/core/scripts/generate-hooks-artifacts.sh` (puts it
  into the Stop hook in `.claude/settings.json` and the plugin's copy).
- Corpus: `test/discipline-corpus/`. The replay tools are `replay/score.py` (needs cases with
  `id`, `context`, `payload`) and `replay/report.py` (also needs `gold` and `live_verdict` per
  case). The 153-case replay gold set behind `FINDINGS.md` was never committed, so this fix
  commits its own small replay case file, for example
  `test/discipline-corpus/replay/cases/auto-armed-monitor.jsonl`.

## How to check

Build a replay case file with at least these three cases (`gold` and `live_verdict` set):

1. **allow**: final message is a COMMAND COMPLETE readout that promises nothing;
   `background_tasks` holds only a running monitor described as "live updates for artifact
   <url> (auto-armed on publish)"; `stop_hook_active` false. `live_verdict: block`.
2. **block**: the existing true case-A text from `s-payload-escape-async-no-bg` in
   `test/discipline-corpus/fixtures/stop-judge-2026-09-23.jsonl` ("Three background tasks are
   still running … I will report the aggregated results once they all finish."), with empty
   `background_tasks`.
3. **block**: the same promise, with `background_tasks` holding only the auto-armed artifact
   monitor (it cannot be what the message waits on).

Then, after rebuilding:

run `test/discipline-corpus/replay/score.py` with its cases option set to the case file, its
prompt option set to `packages/core/hooks/prompts/discipline-stop.prompt.md`, model
`claude-sonnet-5`, runs 5, and an output file (its usage line, `score.py:18`, names each option).
Then run `python3 test/discipline-corpus/replay/report.py <case file> <output file>`.

Pass, over 5 runs per case: case 1 is allowed in 5 of 5 runs; cases 2 and 3 are each blocked in
at least 4 of 5 runs (and by majority). Also re-run the same three cases against the old prompt
for comparison, and `npx jest packages/core/hooks/prompts` must pass (size limit included).

**Known gap in this check: it does not fail today.** On 2026-11-20, while writing this brief,
those three cases were replayed through today's live prompt (taken from `.claude/settings.json`,
Sonnet, the real stop-condition framing). The allow case was allowed in 8 of 8 runs: 3 with a
short conversation, 5 with a fuller made-up one that included the publish result and the DISPATCHED
and RESUMED banners. Both block cases were blocked in 3 of 3. So the authored case is a guard
against regressions, not a reproduction. The only measured failure is the single live block. The
way to reproduce it offline is the real conversation. Run `replay/extract.py` (or extract by
hand) on `cm-s5-transcript.jsonl` to get the real `context` for the final stop, and add it as a
fourth case with expected allow. It should block on the old prompt in some runs and on the fixed
prompt in none. That file is owned by OS user `dart` with mode 600, so this session (user `james`)
could not read it. A session running as `dart` can.

## Open questions

- **Exact payload shape of the monitor entry**: owner's call, default taken. The field names
  (`type: "monitor"`, `status: "running"`, `description`) are inferred from the judge's quoted
  reason. The real payload is not stored in the transcript. Default: use those names. The clause
  in the prompt must not depend on exact field names or on the literal "auto-armed" wording.
- **Getting the real transcript**: owner's call, default taken. Default: the implementing
  session tries to read `cm-s5-transcript.jsonl`. If it can't, it ships on the authored cases,
  states the gap in its report, and leaves the live recheck to the owner.
- **Live confirmation**: waiting on the owner. A live Code Mode session that publishes an
  artifact and ends with COMMAND COMPLETE should not be blocked. Code Mode is interactive only
  (the assessment says it must stay off in headless and fixture sessions), so the loop cannot run
  it. Default: deferred, recorded in the report as not checked live.

Decisions: ship path: `main` via PR, CI `.github/workflows/ci.yml` exists and references no
secrets, no migrations; check passed (owner's call not needed, 2026-11-20). Payload shape:
inferred field names, prompt clause independent of them (owner's call, default taken under
unattended planning, 2026-11-20). Real transcript: try to read it as user `dart`; otherwise ship
on authored cases with the gap stated (owner's call, default taken, 2026-11-20). Live Code Mode
recheck: left to the owner after merge (owner's call, default taken, 2026-11-20).
