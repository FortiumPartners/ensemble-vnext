---
name: audit-docs
description: Bring the PRDs, TRDs and loose docs in docs/ back in line with the code as built, on a review branch
version: 1.0.0
argument-hint: "[--comprehensive]"
# Expensive (one model call per document, Opus for the worst drift) and its description
# matches how a user would phrase the task, so it must not be picked up by description match.
# Scope authorization is autonomy.md's job, not this flag's.
disable-model-invocation: true
---

Review every PRD, TRD and loose document under `docs/` against the code as built: correct what
the code shows to be different, cut what describes something that does not exist, and leave
what is still true. All edits land on a new local review branch; nothing is pushed or merged.

## User Input

```text
$ARGUMENTS
```

Only `--comprehensive` is recognised. A **light run** (the default) reviews the PRDs and TRDs
touched by commits since the last run. A **comprehensive run** reviews every PRD and TRD and
every loose doc. With no valid last-run marker the run is comprehensive whatever the flag.

---

## The split: code first, one model call per batch, code again

Everything deterministic is done by three libraries in `.claude/lib/`. This command only calls
them, in order, and makes one `Workflow` call per batch in between. **No model call happens
before assembly finishes.** The procedures the reviewing agents follow live in
`.claude/contracts/docs-audit.md`; do not restate them here.

Run every shell command below from the project root. Every library prints one JSON object on
stdout.

## Steps

### 1. Set up the run

```bash
RUN_DATE="$(date +%Y-%m-%d)"
RUN_ID="${RUN_DATE}-$(git rev-parse HEAD | cut -c1-7)"
WORK=".trd-state/_docs-audit/work/${RUN_ID}"
rm -rf "$WORK" && mkdir -p "$WORK"
```

The run id repeats for a re-run on the same day at the same HEAD (after a STUCK run whose review
branch was deleted, say). Finalize reads every `batch-*.json` and `applied-*.json` in `$WORK`, so
a directory left by the earlier run would fold its stale results into this run's change set;
start from an empty one.

### 2. Prepare the review branch

```bash
node .claude/lib/docs-audit-deliver.js prepare --repo . --run-id "$RUN_ID" --work "$WORK"
```

Exit 2 means tracked files have uncommitted changes (or git failed). **COMMAND STUCK**, with the
library's message as the Reason and "commit or stash your changes, then re-run" as Next. Nothing
has been changed. Edits to the tracked state files under `.trd-state/` that this framework's own
hooks write do not count; the library already ignores them.

### 3. Assemble

```bash
node .claude/lib/docs-audit-assemble.js assemble --repo . --run-date "$RUN_DATE" \
  [--comprehensive] --out "$WORK/assembly.json"
```

Pass `--comprehensive` only when the user did. Exit 2 means a refusal: an invalid
`ensemble.docsAudit.thresholds` setting (non-integer, outside 0-100, or `medium` above `high`),
a detached HEAD, or not a git repository. **COMMAND STUCK** naming the setting or condition from
the message. Since step 2 already created the review branch, Next must also say, in words, how to get back:
switch back to the original branch and delete the empty review branch, naming both (read them
from `$WORK/branch.json`; the owner should not have to). Say it in words, not as a shell command. Absent thresholds are not an error; the library applies its
defaults (high 70, medium 40).

Read `$WORK/assembly.json` for `mode`, `modeReason`, `window`, `skipped`, `warnings` and
`workflowArgs`. When `workflowArgs` is empty (an empty light window, or every doc skipped), skip
step 4 and go straight to finalize.

### 4. Review each batch

For each entry of `workflowArgs`, in order, with `<key>` the batch key (replace `:` with `-`
for the file name) and `<chunk>` its chunk number:

1. Dispatch it, passing the entry as `args` unchanged. In a light run, also add
   `window: { commits: <the assembly's window.commits> }` to the args so an empty window is
   recognised:

   ```
   Workflow({ name: "audit-docs", args: <the entry> })
   ```

2. Write the workflow's return value, as JSON, to `$WORK/batch-<key>-<chunk>.json`.
3. Apply it:

   ```bash
   node .claude/lib/docs-audit-apply.js apply --repo . --assembly "$WORK/assembly.json" \
     --result "$WORK/batch-<key>-<chunk>.json" --out "$WORK/applied-<key>-<chunk>.json"
   ```

4. Commit the batch:

   ```bash
   node .claude/lib/docs-audit-deliver.js commit-batch --repo . \
     --applied "$WORK/applied-<key>-<chunk>.json" --batch <key>
   ```

5. Emit `[STATUS: /audit-docs] PHASE <n>/<total batches> COMPLETE → <key>: <n> corrected, <n> cut, <n> removed`.

**If the workflow is unavailable or returns nothing for a batch**, record that batch as failed in
STATE and carry on with the rest; do not retry and do not review its documents yourself. Those
documents are untouched and are reviewed again on the next run. If `apply` or `commit-batch`
exits non-zero, that is a git failure: **COMMAND STUCK** (see "Stuck cases").

### 5. Finalize

```bash
node .claude/lib/docs-audit-deliver.js finalize --repo . --work "$WORK"
```

This writes the two indexes, the last-run marker and the change set
(`.trd-state/_docs-audit/runs/<run-id>.md`), commits them, switches back to the original
branch, and returns `{changeSet, branch, originalBranch, pushCommand}`. It never pushes. A
non-zero exit is a git failure: **COMMAND STUCK**.

### 6. Publish the change set

Unless `ensemble.publishArtifacts` is `false` in `.claude/settings.json` (see "Artifact links"
in `.claude/rules/command-status.md`), publish the FILE, never a rendering of it. The change
set is a committed file on the review branch, not the checked-out one, so read it from there:
`git show <branch>:<changeSet>` into `$WORK/change-set.md`, then:

```
Artifact({ file_path: "<$WORK>/change-set.md", icon: "document",
           description: "Docs audit change set for <run-id>" })
```

A failed publish is one line in STATE, never STUCK, never retried. The change set contains no
credentials by construction; if you notice one, do not publish.

### 7. Read the outcome

From the assembly, the apply results (`$WORK/applied-*.json`) and the change set, collect what
the readout needs: documents corrected, cut, removed and blocked; skipped TRDs and which skip
reason applied; surfaced items (class disagreements, unbuilt PRD requirements, cross-repo
claims, post-check reverts, map defects, failed agents or batches).

---

## Stuck cases

The only early exits are these. Everything else is reported in the readout and the run carries on.

| Case | Trigger | Next |
|---|---|---|
| Invalid threshold setting (D5) | `assemble` exits 2 naming `ensemble.docsAudit.thresholds` | fix the setting in `.claude/settings.json`, switch back to the original branch, delete the empty review branch, re-run |
| Dirty tracked tree (D15) | `prepare` exits 2 | commit or stash the tracked changes, re-run |
| Git failure (D15) | any `prepare`, `apply`, `commit-batch` or `finalize` exit 2 | the work directory `$WORK` is kept; `$WORK/branch.json` names the original branch to switch back to |

On COMMAND STUCK, keep `$WORK` for diagnosis. On COMMAND COMPLETE, delete it (step "Finish").

## Readout

**Format: the four-section readout in `.claude/rules/command-status.md`**, in that order, one
screen, written for someone who was not in the session. Any section may be "none".

- **STATE**: the mode and why (`modeReason`); counts of documents corrected, cut and removed,
  with a line for removals blocked by a remaining reference; TRDs skipped, with the reason
  (`no-implementation` or `in-flight`); batches that failed; the review branch name, the
  push-and-PR command text exactly as `finalize` printed it, and the change-set path (and its
  link when published). Say what proves it: the branch exists and the
  original branch is checked out again.
- **DECISIONS**: only choices the owner did not make, such as a run made comprehensive because
  the marker was missing or not an ancestor of HEAD.
- **ISSUES**: items needing the owner: unbuilt PRD requirements left in place, class
  disagreements, post-check reverts, map defects, cross-repo claims, failed agents. Name each
  thing, not just its count.
- **NEXT**: the few steps to take now, in order, in words: review the diff on the review branch
  (name it), then push that branch and open a pull request for it. Neither step is a slash
  command, so each is a line of its own with no fenced block, and NEXT never carries shell
  command text. The exact push-and-PR command that `docs-audit-deliver.js finalize` prints
  belongs in **STATE** (the run must print it), not in NEXT. Never run it yourself.

---

## Output discipline (see `.claude/rules/command-status.md`)

**Finish**, in this order, on the final turn: delete the working directory
(`rm -rf "$WORK"`), send a `PushNotification` (one line, under 200 characters, lead with what
the owner acts on, e.g. `audit-docs done: 12 corrected, 3 cut, branch docs-audit/<id> ready to review`),
then invoke the programmatic notify below, then print the readout and the banner.

**End your final turn with the banner, as the last line of output, with nothing after it.** Put
the change-set link, if any, on its own line above the banner:

```
═══ COMMAND COMPLETE: /audit-docs ═══
<one-line summary of what was produced>
```

On unrecoverable failure, use `═══ COMMAND STUCK: /audit-docs ═══` followed by `Reason:` and `Next:` lines.

**Programmatic completion notify** — on the same final turn, invoke the user's `NOTIFY_ON_COMPLETE` shell command (if set) for webhook/queue/shell-pipeline integration:

```bash
.claude/hooks/notify-complete.sh "audit-docs" "complete" "<one-line summary>"
```

For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"`. The bracket-guard makes this a no-op when not configured.

---

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

This command runs **autonomously** from this invocation to the COMMAND COMPLETE banner.
**Do NOT pause mid-flow to ask the user to confirm decisions, review artifacts, verify
checkpoints, or defer to stakeholders.** The user already authorized the run by invoking
the command; do not ask them to authorize it again, in pieces.

This command asks no questions at all. The only thing that stops a run early is a STUCK case
in the table above. Outside those: **decide based on documented constraints, document the
rationale in the change set, and proceed.**

Never push, open a pull request or merge: the printed command is for the owner. Agents never
delete files or run git write commands; the libraries do.

Forbidden patterns:
- "Should I proceed to the next batch?" → no — emit a PHASE banner, proceed.
- "Please review the change set before I continue." → no — finish, emit COMMAND COMPLETE.
- "Checkpoint reached. Continue?" → continue. Always.
- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing.
