---
name: task
version: 1.0.0
description: A job whose output is findings or a report, not merged code — run once, recorded, closed, without a TRD
argument-hint: "<prompt | path-to-brief.md> | --resume"
---

> **Usage:** `/task <prompt>`, `/task <path-to-brief.md>` or `/task --resume`
>
> **Examples:**
> `/task re-capture the 176 screen pairs, grade them, publish a report listing regressions`
> `/task docs/tasks/checkpoint-2.md`

## What this is for

**A job whose output is findings or an artifact, not a merged change.** Reports, checkpoints,
spikes, audits, data captures, dry-runs, one-off operational runs. Forced through `/plan`, these
write a TRD nobody needs and leave no clean end state: no `implement.json`, no `closed.json`,
no artifact entry, so tooling reading `.trd-state/` sees an unfinished feature.

`/task` wraps the prompt in the framework's standard structure and end state: a step list in
`implement.json`, each step run once, outputs recorded, a `closed.json`, the readout and the
banner. **The prompt is the whole spec, and its own acceptance is the bar.** `/task` adds no
requirements of its own.

| Situation | Use instead |
|---|---|
| The job produces code that ships | `/plan`, `/amend` or `/sweep` |
| The job needs a PRD or a TRD | `/create-prd` then `/create-trd` |
| Closing a feature you built | `/close-feature` |

## User Input

```text
$ARGUMENTS
```

1. `--resume` alone: go to "Resume" below.
2. An argument naming an existing file (ending `.md`) is the **brief**; its text is the spec.
   Anything else is the spec verbatim. Pass the owner's words through unedited.
3. No spec and no `--resume`: end `COMMAND STUCK` with the reason "no prompt or brief given".

## Rules

- **Report-only by default.** No product-code change, branch push or PR unless the prompt
  explicitly asks for it. Apart from the framework's own bookkeeping files
  (`.trd-state/current.json`, `.trd-state/_command-runs/`, the shared session log and dispatch
  ledger), modify nothing outside `.trd-state/task-<slug>/` and the output paths the prompt
  declares.
- **No TRD, no `/audit-build`, no verification loop, no orchestrator.** Read and write only
  Ensemble's own state files.
- **Honour `.claude/rules/verification.md`**: environment permissions, resource capacity
  (simulator pools, memory floors), and the repo's shared-machine rules. Never `pkill`.
- **Never act on `followups`.** Record them; acting on them, or filing them as issues, is the
  owner's decision.
- **Do not chain.** It calls no other command.

## Step 1: Create the task directory

**The slug and the spec text go through a heredoc, never into a shell string** (the O-INJECT
rule from `/plan`): a slug derived from free text, interpolated into a single-quoted `node -e`,
lets one apostrophe close the quote and hand the rest to the shell.

The slug is the brief's basename without extension, or the first few words of the prompt;
lower-case, `[a-z0-9-]`, at most 40 characters. The directory name is `task-<slug>`, so the
clash check is on that name: an existing `.trd-state/task-<slug>/` directory, or a
`docs/TRD/task-<slug>.md` or `docs/TRD/<slug>.md` (a TRD named `task-<slug>.md` would own
`.trd-state/task-<slug>/` as its state directory), gets a `-2`, `-3` suffix. Create
`.trd-state/task-<slug>/` (call it `<dir>`).

Break the spec into a short step list, 2 to 8 steps, each one checkable. Seed
`<dir>/implement.json` through `implement-state.js` `save(`:

```bash
node -e '
  const { save } = require("./.claude/lib/implement-state");
  const spec = JSON.parse(process.argv[1]);
  require("fs").mkdirSync(spec.dir, { recursive: true });
  const now = new Date().toISOString();
  const tasks = {};
  spec.steps.forEach((d, i) => {
    tasks["STEP-" + String(i + 1).padStart(3, "0")] = {
      description: d, status: "pending", started_at: null, completed_at: null,
      cycle_position: "implement", retry_count: 0,
    };
  });
  save(spec.dir + "/implement.json", {
    version: 1, kind: "task", trd_file: null, brief: spec.brief,
    phase_cursor: 1, tasks, checkpoints: [], created_at: now,
  });
' "$(cat <<'JSON'
{ "dir": ".trd-state/task-<slug>", "brief": "<brief path or null>", "steps": ["<step 1>", "<step 2>"] }
JSON
)"
```

`trd_file` is null and `"kind": "task"` together are what identify a task directory. Never
identify one by the `task-` name prefix: a real TRD can start with `task-`.

**Point `.trd-state/current.json` at the task only when no feature is in flight** (`trd` and
`prd` both null or absent; a PRD awaiting `/create-trd` is a feature in flight, and clearing the
pointer at the end would lose it): set `trd` to null and `status` to
`.trd-state/task-<slug>/implement.json`. **When a
feature is in flight, leave `current.json` alone** and say so in the readout. Never save and
restore it: an interrupted task would strand the owner's feature, and `/amend` and
`/close-feature` both stop on a null `trd`. `--resume` finds tasks by scanning, so the pointer
is only a convenience for the session banner.

## Step 2: Run each step once

For each step in order: set its `status` to `in_progress` and `started_at`, do the work, then
attest the result through `recordResult(`, followed by `save(`:

```bash
node -e '
  const { load, save, recordResult } = require("./.claude/lib/implement-state");
  const p = ".trd-state/task-<slug>/implement.json";
  const s = load(p);
  const r = JSON.parse(process.argv[1]);
  recordResult(s, r.id, r);
  save(p, s);
  console.log(r.id, s.tasks[r.id].status, s.tasks[r.id].current_problem || "");
' "$(cat <<'JSON'
{ "id": "STEP-001", "status": "success", "filesChanged": ["<output paths that now exist>"] }
JSON
)"
```

**A step that cannot be done is recorded `deferred` with its reason and is not retried:**
`{ "id": "STEP-002", "status": "deferred", "error": "<why it could not be done>" }`. A harness
limit (no simulator free, a service down, a permission the environment denies) is "could not do
this", not a defect to loop on. Each step runs once. Do not re-run a step, and do not dispatch
a debugger for it. `recordResult(` with `"success"` and `filesChanged` fails the claim when none
of the files exist; read the printed status back and believe it. A step the check turns
`failed` is recorded again as `deferred` with that reason.

Do the work yourself, inline, or dispatch an implementer with an explicit `agentType` when a
step is genuinely implementation-shaped; never leave `agentType` unset. Fan out only for
independent steps. Record the step's result as soon as it ends, so a crash leaves a true file.

When all steps have ended (`success` or `deferred`), record one checkpoint with
`checkpoint(` (`commit` stays null for a no-code job):

```bash
node -e '
  const { load, save, checkpoint } = require("./.claude/lib/implement-state");
  const p = ".trd-state/task-<slug>/implement.json";
  const s = load(p);
  checkpoint(s, 1, {});
  save(p, s);
'
```

## Step 3: Record the outputs

Each output file the task produced is recorded with `artifacts.js`. `record` keeps one entry per
kind, so the first output uses kind `report` and further ones `report-2`, `report-3`:

```bash
node .claude/lib/artifacts.js record --state-dir .trd-state/task-<slug> --kind report \
  --path "<output path>" --command /task
```

Unless `.claude/settings.json` sets `ensemble.publishArtifacts: false`, publish the file with
the `Artifact` tool and pass the returned URL back with `--url`. With publishing off, still
`record` the path. **A failed publish is never fatal**: one line in ISSUES, carry on. Never
publish a document that holds a credential.

An output path comes from the prompt, so it is free text: quote it, and if it contains a quote
character, a `$` or a backtick, list it only in `closed.json`'s `outputs` rather than putting it
on a command line. An output `record` rejects (a directory, a path outside the project) is
listed only in `closed.json`'s `outputs`.

## Step 4: Write closed.json

Write `<dir>/closed.json`, with `closedAt` from `date -u +%Y-%m-%dT%H:%M:%SZ`:

```json
{
  "feature": "task-<slug>",
  "trd": null,
  "closedAt": "<ISO-8601 UTC>",
  "closedBy": "task",
  "note": null,
  "audit": null,
  "reason": "task-complete",
  "outputs": ["<every output path>"],
  "followups": [{ "summary": "<what the findings say needs doing>", "evidence": "<how you know>" }]
}
```

`reason` is `task-complete` when at least one step ended `success`, and `task-stuck` when none
did. **Zero completed steps ends `COMMAND STUCK`**; a task with some `success` and some
`deferred` steps ends `COMMAND COMPLETE`, with the deferred ones named in ISSUES. `followups`
may be empty. Check the file parses (`node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' <path>`);
a write that does not parse is rewritten once, then reported in ISSUES. Do not commit or push
anything.

## Resume

`/task --resume` scans `.trd-state/*/implement.json` for the most recent file with `"kind":
"task"` and no `closed.json` beside it. It never needs `current.json`. With none found, end
`COMMAND STUCK` with the reason "no unfinished task to resume". Otherwise load it, continue from
the first step whose status is neither `success` nor `deferred` (a step left `in_progress` is
run once, as pending), and carry on from Step 2. A step left `failed` already ran: record it
`deferred` with its `current_problem` as the reason, never re-run it. When every step has
already ended, go straight to the checkpoint and Step 3. Do not touch `current.json` on a resume.

## Readout

The four-section readout from `.claude/rules/command-status.md`, one screen, written for
someone who was not in the session:

- **STATE** — `task-<slug>`: steps done and deferred (n of n), the outputs and their links, the
  `closed.json` path, and whether `current.json` was pointed at the task or left alone because a
  feature is in flight.
- **DECISIONS** — defaults applied that the prompt did not specify.
- **ISSUES** — each deferred step with its reason, and any failed publish or unparsed write.
- **NEXT** — the follow-ups, in words, for the owner to decide. "Nothing — this is done" when
  there are none. Never a menu.

## Completion signal

**Run it before clearing the pointer, and name the task in the summary.** `notify-complete.sh`
derives `NOTIFY_FEATURE` from `current.json`'s `trd`, which is null during a task, so
`NOTIFY_FEATURE` is empty and the summary is the only place the task's name reaches a listener:

```bash
.claude/hooks/notify-complete.sh "task" "<complete or stuck>" "task-<slug>: <n> done, <n> deferred"
```

Then send a `PushNotification` (this can be a long-running command; `command-status.md` Path
A): `PushNotification({ status: "proactive", message: "task-<slug> done: <n> steps, <n>
deferred, <n> follow-ups" })`, under 200 characters, one line. Send one for STUCK too, with the
reason.

**Only after that, clear `current.json`**, and only if its `status` still points at this task's
`implement.json`: set its four keys (`prd`, `trd`, `status`, `branch`) to `null` and keep the
file. When it names anything else, or this task never took it over, leave it alone.

The artifact link, if any, goes above the banner. The banner is the last line:

```
═══ COMMAND COMPLETE: /task ═══
task-<slug>: <n> steps done, <n> deferred, <n> follow-ups — nothing committed
```

or, when no step could be done:

```
═══ COMMAND STUCK: /task ═══
Reason: <one line>
Next:   <what would unblock it>
```

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

This command runs **autonomously** from invocation to its final banner. Do NOT pause to ask the
user to confirm decisions, review artifacts, or verify checkpoints.

`AskUserQuestion` is permitted ONLY for: genuine requirement ambiguity with no default;
information that cannot be derived; a truly irreversible destructive operation; or a STUCK
condition after retries. A step that cannot be done is not one of them: defer it with a reason.

Forbidden:
- "Should I proceed?" / "Please review before I continue." → no. Decide and continue.
- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- **The declarative forms are the same move and are the ones that slip past**: "I can
  also fix the regressions if you want", "say the word and I'll file these", "that's available
  whenever". None is a question; each hands the decision back identically.

The pull is strong here, because a task always ends with a follow-up list sitting right there.
Report it and stop.

## What this command must not do

- **Retry.** A step runs once. Deferred is an outcome, not a failure to repair.
- **Act on followups, or file them as issues.**
- **Change product code, push or open a PR** unless the prompt explicitly asks.
- **Save and restore `current.json`**, or take it over while a feature is in flight.
- **Commit.** The owner decides what lands.
