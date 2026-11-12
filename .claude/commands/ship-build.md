---
name: ship-build
version: 1.0.0
description: Ship the work a closed feature (or a sweep) left on this branch - runs the steps your ship.md lists, in order, each one a shipping primitive
argument-hint: "[trd-path] [--resume]"
---

> **Usage:** `/ship-build [trd-path] [--resume]`
>
> **Examples:**
> `/ship-build docs/TRD/feature-close-out.md`
> `/ship-build --resume`

## What this is for

`/audit-build` stops at an optional pull request. This command is what comes after: it takes
finished, audited work and ships it by running the steps **you** wrote in
`.claude/rules/ship.md` (the file `/ship-setup` fills in) — push, open a PR, wait for CI,
fix what review and CI find, merge, release, then close the issue and file the follow-ups.

It is deliberately a thin loop. The order of the steps, what a repeat block does, where a run
parks and whether a step is authorized all belong to `ship-sequencer.js`; what each step does
is written in its own contract file under `.claude/contracts/ship-primitive-<name>.md`. This
command carries a step from one to the other and reports the result. `/audit-build` never runs
this (it must not ship), and nothing here chains after it.

## User Input

```text
$ARGUMENTS
```

1. The first argument ending in `.md` that names an existing file is `<trd-path>`.
2. `--resume` continues a run that parked (waiting for a review, an approval or a person) or
   stopped. It changes nothing else: a run with a state file is always continued from that
   file, never restarted, and `ship.md` is never read a second time.

## Step 1: Resolve the work

Stop at the first hit. `<feature>` is the TRD's basename without its extension.

1. **An explicit TRD path.** It wins over everything else.
2. **The branch-derived slug.** Read `git branch --show-current`, parse it against the two
   patterns in `.claude/rules/process.md` ("Branch Naming": `<issue-id>-<session>` and
   `feature/<trd-name>/<session>`), and match the slug against `docs/TRD/*.md` filenames and
   `.trd-state/*/` directory names.
3. **Exactly one state directory for this branch.** The one `.trd-state/*/` whose
   `implement.json` `branch`, or whose `shipped.json` `work.branch`, equals the current branch.
   Skip any directory whose name starts with `_` and any whose `implement.json` has
   `"kind": "task"`. A branch value is shared between features, so more than one match is not a
   hit: list them and go to step 5. This step deliberately does **not** skip a feature that has
   a `closed.json`; a closed feature is exactly what ships.
4. **Sweep work.** No TRD work, and `git status --porcelain` lists changes outside
   `.trd-state/`: the work is a `/sweep`'s. Its id is `sweep-<YYYYMMDD-HHMMSS>` (from
   `date +%Y%m%d-%H%M%S`), its state directory `.trd-state/ship-<id>/`, and it has no TRD. The
   changes in the working tree are the only record of what the sweep changed.
5. **Nothing resolves.**

   ```
   ═══ COMMAND STUCK: /ship-build ═══
   Reason: no work to ship found for branch <branch> (candidates: <each state directory and TRD
           considered, or "none">)
   Next:   /ship-build docs/TRD/<feature>.md
   ```

For work with a TRD, the state directory is `.trd-state/<feature>/`.

## Step 2: The gate

Read the TRD's `**Source PRD**:` line. A line naming an existing file under `docs/PRD/` means a
**full feature**; a line naming anything else (`None — …`, a `docs/plan/` investigation) means
`/plan` work; **no such line means a full feature**. Sweep work has no gate.

A full feature with no `.trd-state/<feature>/closed.json` has not passed its audit, so nothing
runs:

```
═══ COMMAND STUCK: /ship-build ═══
Reason: <feature> has no closed.json - it has not passed /audit-build or been closed
Next:   /audit-build docs/TRD/<feature>.md
```

Run `notify-complete.sh` and `PushNotification` as for any STUCK (see "Completion signal"). A
`/plan` TRD is shipped without the gate.

## Step 2b: Resolve the owner's rule files

```bash
node .claude/lib/owner-rules.js resolve
```

It prints one JSON line with `notices`. Print each notice and carry each into the readout's
ISSUES; a notice never stops the run. Every contract's read of an owner-governed rule file
(`ship.md`, `verification.md`, `stack.md`, ...) uses the path form
`$(node .claude/lib/owner-rules.js path <file>)`, never `.claude/rules/<file>`.

## Step 3: Start the run

```bash
node .claude/lib/ship-sequencer.js start --state-dir <state-dir> \
  --policy "$(node .claude/lib/owner-rules.js path ship.md)" --fallback "1. push" \
  --kind <feature|plan|sweep> --id <feature or sweep id> \
  [--trd <trd-path>] --branch <work branch> [--resume]
```

`<work branch>` is the current branch, except under `--resume`: then it is the work's own branch,
the `branch` in `.trd-state/<feature>/implement.json` (the field Step 1 reads), falling back to
the current branch when there is none. After a merge the current branch is often `main`, not the
work's. A kept record is continued only when its kind, id and branch all match.

Pass `--resume` when the owner did. It prints one JSON line `{ok, status, errors, policy}`. With
a state file already there it loads it (`resumed: true`) and ignores `ship.md`. Under `--resume`
with no tracked `shipped.json` (the branch or worktree is gone after a merge), it continues the
run's record kept under the git directory instead of starting a fresh run.

- `ok: false`: the errors name the lines of `ship.md` that do not parse. `COMMAND STUCK`,
  reason naming each line, Next `/ship-setup`.
- `ok: false` with an error reading `<trd>: step <id> (<primitive>) needs a TRD /implement-trd
  can read: …` (not a `ship.md` parse failure, so not the bullet above): a step whose
  contract says `requires: trd` (fix-findings) needs a TRD `/implement-trd` can read, and none
  was written (no state file). `COMMAND STUCK`, reason quoting the error (a missing file or a
  Master Task List problem), Next: fix the TRD, then rerun.
- `policy: "none"` (no `ship.md`, or no step under `## Ship`): the run is the single step
  `push`, and the readout says so (see Step 6).
- `status: "done"`: the work already shipped. `COMMAND COMPLETE` with nothing run.

## Step 4: The loop

Repeat until `next` returns anything but `run`:

```bash
node .claude/lib/ship-sequencer.js next --state-dir <state-dir>
```

- **`{action: "run", step}`**: read the contract file `step.contract` names and do exactly what
  its `## Do` says with `step.input` (the step's parameters, `work`, `final`, `laterNeeds` and
  `context`). The contract says how to wait, what to call and what result to report. Then
  record what happened:

  ```bash
  node .claude/lib/ship-sequencer.js record --state-dir <state-dir> --step <step.id> \
    --result <word the contract declares, or wait, or stop> \
    [--data '<json>'] [--reason "<text>"]
  ```

  A result the contract does not declare is refused; read the reason and record the right
  one. Pass any line a step wants shown to the owner in `data.issues`.

  **End the loop on what `record` returns, not only on what `next` returns.** `next` never
  answers `wait`: it hands a parked or stopped step out again (that is how `--resume` works), so
  a loop that called it right after recording `wait` or `stop` would re-run the step and clear
  the parked state. When `record` returns `status: "waiting"` or `status: "stuck"`, stop looping
  and go to Step 5.

  A result the contract lists under `stops-on` (for example `wait-ci`'s `failed`) outside a
  `repeat` returns `status: "stuck"` and leaves the cursor on that step; the next step is never
  handed out. Go to Step 5.

  The exception is a result the contract also lists under `loop-on` (`merge`'s `red`) on a step
  whose loop the sequencer built from the owner's listed steps: `record` then returns
  `status: "running"`, not `stuck`, and the next `next` hands out the loop's steps and then the
  same step again. Keep looping. When the loop's rounds are spent, `record` returns `stuck`
  with the bound named.
- **`{action: "wait"}`**: the run is parked. Go to Step 5.
- **`{action: "stop", reason}`**: the run is stuck. A step the sequencer refused as not
  authorized is recorded `stop` by the sequencer itself (`not authorized: <primitive>`); keep
  it for ISSUES. Go to Step 5.
- **`{action: "done", shipped}`**: go to Step 5.

If a step's work cannot be finished, record `stop` with a reason naming the step and what
failed. Do not retry past what the contract says, and do not fix a failure the contract says
to leave.

**Never** write `shipped.json` or `custody.json` (the sequencer and `custody.js` are their
only writers), never edit code yourself (a step that fixes code does it through the build its
contract names), and never call `AskUserQuestion`: a step prompt is not one of the four cases
`.claude/rules/autonomy.md` allows. A step that is not authorized is reported, not asked about.
Never probe a service by acting on it: no test issue, PR, comment or release to see whether a
tracker or remote answers. Check read-only (`gh auth status`, `gh repo view`) or let the step's
own call fail and record why.

## Step 5: Commit the record

Commit the state directory by pathspec so the record travels with the branch:

```bash
git add -- <state-dir>
git commit -m "chore(<work id>): ship-build record" -- <state-dir>
```

Skip this when the branch's PR is already merged. Read that from the PR itself —
`gh pr list --head <branch> --state merged --json number --jq length` — not from whether a
step called `merge` ran, because a PR merged outside this run counts too. A merged branch gets
no state commit, and nothing is committed on the default branch either. After the merge the
sequencer writes the record to an untracked file under the git common directory, so it needs
no commit; `ship-sequencer.js status` reports its path as `recordPath`, and STATE names it.

A failed commit is one line in ISSUES, never STUCK.

**Push the state directory only at a `wait` whose recorded `data` carries `remoteResume:
true`** (the `await-approval` contract sets it, and only when the trigger's workflow file is on
the remote default branch). A remote resume needs the record on the branch. A `wait` without
it is not pushed here, and this command claims no trigger for it.

## Step 6: Readout and banner

Run `node .claude/lib/ship-sequencer.js status --state-dir <state-dir>`, then write the
four-section readout from `.claude/rules/command-status.md`, one screen, written for someone
who was not in the session:

- **STATE** — shipped or not; which steps ran and with what result; the custody anchor and any
  moves (read from the file at `status`'s `custodyPath`, read-only); the PR number and URL if there is one. Name what proves a
  claim of "shipped". After a merge, name the record's path from `status`'s `recordPath`
  (a file under the git common directory, untracked, nothing to commit). When the merge step
  recorded `data.custody`, say which proofs were reused (`reused` ids) and which paths were
  excused (they came from the base).
  - **Filed follow-ups are listed one by one, with their issue (AC-F5.8).** Each entry of the
    `file-followups` step's `data.filed` (as recorded; on a resumed run, the `data` of that
    step's last result in `<state-dir>/shipped.json`) gets its own line: the row's summary,
    e.g. `[below-critical] <finding>`, and its issue URL. A count ("7 of 9 filed") may precede
    them, never replace them.
- **DECISIONS** — a default applied (the push-only fallback when there is no policy, a branch
  created for a sweep), one line each with the reason; otherwise none.
- **ISSUES** — every line any step put in `data.issues` (unfiled findings and review gaps come
  from the `file-followups` step), every step the sequencer recorded as `not authorized`
  (name the primitive and say the owner's authorization for it is missing), each owner-rules
  notice Step 2b printed ("owner-rules notice: <notice>. The owner acts: push or merge the rule
  change, or rebase the branch."), and every uncommitted change outside the state directory from
  `git status --porcelain` (a late review's edits stay uncommitted and are named here).
  Otherwise none.
  - **Unfiled follow-ups are listed one by one, never as a count.** Each `file-followups`
    `data.issues` line keeps its own line: the row's summary, its ledger path and why it was
    not filed. A summary line ("five could not be filed") may precede them, never replace them.
  - **Recorded, not yet filed (D27, AC-F5.8).** When no `file-followups` step has the result
    `filed` in `status`'s `steps` (the run parked or stopped before it, or `ship.md` lists
    none), list every finding a `collect-findings` step recorded and nothing has filed yet, one
    line each as "recorded, not yet filed", with the ledger path:

    ```bash
    node -e 'const d=require("./.claude/lib/discovered");for(const r of d.readAll(process.argv[1],{open:true}))if(!r.blocksFeature&&/^\[(below-critical|not-this-feature|below-bar)\]/.test(r.summary))console.log(r.summary)' "<state-dir>"
    ```

    Say the next run that reaches `file-followups` files them (a `[below-bar]` one only with
    `below-bar=yes`).
- **NEXT** — numbered, in order, one fenced block per slash command and no shell command.
  - Policy `none`: say the run only pushed the branch, point at `/ship-setup` to set up what
    shipping means here, and name an open PR if `gh pr list --head <branch> --state open`
    finds one, or say the branch is ready for one.
  - A `wait`: `/ship-build --resume` (say what it is waiting for, from the recorded reason).
  - A stop: the step that stopped and the single thing that unblocks it, then `/ship-build
    --resume`.
  - Boards a `sync-design` step could not capture: `/sync-design <slug> --trd <trd-path>`.
  - Shipped with nothing else: "nothing — this is done".

Then the banner as the **last line of the turn**. A `done` run, and a run **parked at a
`wait`**, both end `COMMAND COMPLETE` (a wait is a successful stop; the NEXT line carries
`--resume`):

```
═══ COMMAND COMPLETE: /ship-build ═══
<work id>: <shipped | parked at <primitive>, waiting for <what>> - <n> of <m> steps
```

A stopped run, or a gate/parse failure, ends:

```
═══ COMMAND STUCK: /ship-build ═══
Reason: <one line>
Next:   <what would unblock it>
```

## Completion signal

On COMPLETE or STUCK, in the same final turn, call:

```bash
.claude/hooks/notify-complete.sh "ship-build" "<complete or stuck>" "<work id>: <shipped | parked | stopped at <primitive>>"
```

The summary **names the work itself**: a passing audit has set `current.json` to nothing, so
the helper's own `NOTIFY_FEATURE` would read empty. Then send one `PushNotification` (under 200
characters, one line, no markdown, leading with what the owner would act on). Both fire only on
the final turn, never while parked work is still being waited on inside a loop.

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

Runs from invocation to banner without asking. Invoking it is the decision to run the steps
`ship.md` lists, and only those: a step that publishes outward runs only when `ship.md` lists
it and `autonomy.md` carries the standing-authorization sentence (or the step's own `unless`
setting holds), which `next` checks before it hands the step out. Never calls
`AskUserQuestion`. Names the next command; never runs it.
