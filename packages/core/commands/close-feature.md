---
name: close-feature
version: 2.0.0
description: Mark a feature closed on your say-so - record it and clean up its in-flight state
argument-hint: "[trd-path] [\"<note>\"]"
---

> **Usage:** `/close-feature [trd-path] ["<note>"]`
>
> **Examples:**
> `/close-feature docs/TRD/feature-close-out.md`
> `/close-feature docs/TRD/old-idea.md "superseded by the new design"`

## What this is for

There are two ways a feature gets closed, and this command is one of them:

- **You say it is closed.** Run this command. Your word is the whole decision: shipped and
  tested, superseded, abandoned, or simply finished. The note says why, in your words.
- **An audit shows it is closed.** `/audit-build` closes the feature itself when its verdict is
  `safe to proceed` or `proceed with these caveats` and it hands no work back to
  `/implement-trd`. You don't run anything.

Either way, closing is bookkeeping, not judgement: write the record and clear away the
in-flight state, so the session banner, the prompt hint and `/implement-trd`'s automatic
lookup stop treating the feature as work in progress. This command decides nothing and checks
nothing beyond what it needs to find the feature.

## User Input

```text
$ARGUMENTS
```

1. The first argument ending in `.md` that names an existing file is `<trd-path>`. Otherwise
   use `trd` from `.trd-state/current.json`.
2. Any quoted free text is `<note>`, recorded verbatim. It is optional.

`<feature>` is the TRD's basename without its extension — the same rule `router.py`'s
`derive_feature()` uses: `path.basename(trd, path.extname(trd))`.

**No TRD named** (no argument, and `current.json` names none):

```
═══ COMMAND STUCK: /close-feature ═══
Reason: no TRD named and .trd-state/current.json names none
Next:   /close-feature docs/TRD/<feature>.md
```

**Already closed** (`.trd-state/<feature>/closed.json` exists): change nothing, say when it was
closed and by whom, and end `COMMAND COMPLETE`. To reopen a feature, delete that file.

## The close step

The same four steps `/audit-build` performs when its audit closes a feature; only `closedBy`
and the audit fields differ.

1. **Write `.trd-state/<feature>/closed.json`:**

   ```json
   {
     "feature": "<feature>",
     "trd": "<trd-path>",
     "closedAt": "<ISO-8601 UTC, from `date -u +%Y-%m-%dT%H:%M:%SZ`>",
     "closedBy": "owner",
     "note": "<note, or null>",
     "audit": null
   }
   ```

   Then check it parses (`node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' <path>`);
   a write that does not parse is rewritten once, then reported in ISSUES.
2. **Clear the pointer.** When `.trd-state/current.json`'s `trd` names `<feature>`, set its
   four keys (`prd`, `trd`, `status`, `branch`) to `null` and keep the file —
   `validate-init.sh` needs it to exist. When it names another feature, leave it alone.
3. **Remove the run lock**, `.trd-state/<feature>/implement.lock`, if it exists.
4. **Commit the record** when you are on any branch other than the default one (resolved from
   `git symbolic-ref --quiet refs/remotes/origin/HEAD`, prefix stripped, falling back to
   `main`), so it travels with that branch's PR:

   ```bash
   git add .trd-state/<feature>/closed.json
   git commit -m "chore(<feature>): close feature" -- .trd-state/<feature>/closed.json
   ```

   The pathspec keeps the commit to that one file. **On the default branch, don't commit**:
   what lands there is yours to decide, so NEXT gives you the command. A failed commit is one
   line in ISSUES, never STUCK.

`implement.json`, the TRD and every report are left exactly as they are: they are the history
of the feature, and closing it does not rewrite history.

## Readout

The four-section readout from `.claude/rules/command-status.md`, one screen:

- **STATE** — the record's path and what it says (closed by you, the note), whether it was
  committed and on which branch, and whether `current.json` was cleared.
- **DECISIONS** — none.
- **ISSUES** — a record that would not parse, or a commit that failed. Otherwise none.
- **NEXT** — on a feature branch, open or update the PR. On the default branch:
  `git add .trd-state/<feature>/closed.json && git commit -m "chore(<feature>): close feature"`.

Then the banner, as the last line:

```
═══ COMMAND COMPLETE: /close-feature ═══
<feature>: closed by owner
```

## Completion signal

```bash
.claude/hooks/notify-complete.sh "close-feature" "<complete or stuck>" "<feature>: closed by owner"
```

The summary names the feature itself, because `current.json` has just been cleared and the
helper's own `NOTIFY_FEATURE` would read empty. Silent when `$NOTIFY_ON_COMPLETE` is unset. No
`PushNotification`: you're watching this one.

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

Runs from invocation to banner without asking. Invoking it is the decision; there is nothing
to confirm. `AskUserQuestion` is not used.
