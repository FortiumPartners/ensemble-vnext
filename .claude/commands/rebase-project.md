---
name: rebase-project
description: Upgrade vendored runtime to the latest plugin version — non-interactive, requires a clean git tree; one deterministic engine call does the update, and the model only resolves the conflicts it reports
version: 3.0.0
category: generator
argument-hint: "[--dry-run] [--preserve-all] [--force]"
# Expensive, and its description matches how a user would phrase the task —
# so it must not be picked up by description match. Scope authorization is autonomy.md's job, not this flag's.
disable-model-invocation: true
---

> **Usage:** Invoke `/rebase-project` from the project root to upgrade the vendored runtime.
>
> **Options:**
> - `--dry-run` - Preview changes without applying anything
> - `--preserve-all` - Conservative mode: add new agents and skills only; leave every existing agent, skill and framework rule as it is, and leave retired files in place. Commands, hooks, workflows, libs and contracts are still updated, and the ensemble-owned `hooks` block of `settings.json` is still regenerated (escape hatch for projects with heavy customization)
> - `--force` - Proceed even when `.claude/` has uncommitted changes or the project is not a git repository. Means "I accept that anything uncommitted is discarded with no way back." It is not passed to the engine; it only overrides the clean-tree stop in Step 0.
>
> **Default behavior (no flags) — applied automatically, no prompts:**
> - **One deterministic engine call does the whole update.** A framework file (agent, skill, command, hook, workflow, lib, contract, framework rule) is replaced only when it differs from the plugin's current version **and** matches a version the framework has shipped. A file that matches no shipped version is an owner edit: the engine leaves it alone and reports it as a conflict, and this command resolves it (Step 2). Files the plugin no longer ships are removed only when they are on the framework's retired-file list; anything else the plugin does not ship is preserved as a user customization.
> - **Git is the undo.** `.claude/` is committed (the constitution requires it), so every
>   replacement is already recoverable with `git diff` and `git restore`. This command writes
>   NO backup copies — see "Recovery is git" below.
> - **User governance files** (`constitution.md`, `stack.md`, `process.md`, `verification.md`, `design.md`, `ship.md`) are NEVER modified.
> - **Framework-shipped rules** (`async-discipline.md`, `autonomy.md`, `command-status.md`) are replaced when they match a shipped version; an owner-edited one is a conflict.

---

## User Input

```text
$ARGUMENTS
```

Examples:
- (no args) - Apply all updates, no prompts
- "--dry-run" - Show what would change without writing anything; conflicts are listed, none resolved
- "--preserve-all" - Add new agents and skills only; update commands/hooks/workflows/libs/contracts; leave the rest
- "--force" - Skip the clean-git-tree precondition (uncommitted work under .claude/ is discarded)

---

## Goals

- Upgrade vendored runtime in `.claude/` to match the current plugin version, with one engine call
- Replace a framework file only when it differs from the plugin's version and matches a version the framework shipped; report any other difference as a conflict
- Resolve each reported conflict without discarding an owner change
- Leave recovery to git — never write parallel backup copies
- Preserve user governance files (constitution.md, stack.md, process.md, verification.md, design.md, ship.md)
- Preserve user-created files (agents/skills/commands not shipped by the plugin)
- Keep installed skills current and their selection in step (the engine does this; it does not read `stack.md`). A skill the project wants is added by copying its folder from the plugin's `skills-lib/` into `.claude/skills/`
- Report the result as a four-section readout

---

## Pre-Flight Checks

### Step 0: Validate Installation

**Check for existing ensemble installation:**

1. If `.claude/` directory does NOT exist:
   - Report: "No ensemble installation found. Run /init-project first to initialize."
   - Abort rebase

2. Check for required files:
   ```
   .claude/settings.json       - Required for version detection
   .claude/rules/constitution.md - Governance file (preserve)
   ```

3. If missing required files:
   - List missing files
   - Offer: "Run /init-project to create missing files, or continue with partial rebase?"

4. **Check the working tree. Do this BEFORE anything else writes.**

   ```bash
   git rev-parse --git-dir >/dev/null 2>&1 || echo "NOT-A-REPO"
   git status --porcelain -- .claude/
   ```

   Apply the table in "Recovery is git" below: proceed on a clean tree inside a repo; abort
   and report otherwise, unless `--force`. This command creates no backups, so a clean tree
   is the ONLY thing standing between an uncommitted local edit and its permanent loss.

   Run it here — at Step 0, before the engine call — so the abort costs nothing
   and leaves nothing half-applied.

5. **Record the starting point** (skip nothing; the readout compares against it):
   - the vendored version: `ensemble.version` in `.claude/settings.json` (read the one key; never print the `env` values);
   - the records refs that exist now: `git for-each-ref refs/ensemble/records/` (the readout reports refs that appear during the rebase).

### Path Resolution

**Plugin source paths** use the `@` prefix notation in this document:

| Notation | Resolves To |
|----------|-------------|
| `@packages/` | Plugin installation directory packages/ |
| `@packages/core/commands/` | Core package commands |
| `@packages/router/hooks/` | Router package hooks |

**Resolution mechanism:**

1. **Installed Plugin Path:**
   - Check environment variable `CLAUDE_PLUGIN_ROOT`
   - Fallback: `~/.claude/plugins/cache/ensemble-vnext/full/<version>/`

2. **Translate `@packages/...` to the PLUGIN layout — they are not the same tree.**

   Every `@packages/...` reference in this document names a path in the **development
   repository**. The installed plugin is a FLATTENED tree with no `packages/` directory at
   all, so joining them directly onto `${CLAUDE_PLUGIN_ROOT}` yields a path that exists in no
   installation. Use this table:

   | `@packages/...` reference | Path under `${CLAUDE_PLUGIN_ROOT}` |
   |---|---|
   | `@packages/core/commands/` | `commands/core/` |
   | `@packages/core/hooks/` | `hooks/` |
   | `@packages/core/hooks/lib/` | `hooks/lib/` |
   | `@packages/core/hooks/prompts/` | `hooks/prompts/` |
   | `@packages/router/hooks/router.py` | `hooks/router.py` |
   | `@packages/core/lib/` | `lib/` |
   | `@packages/core/contracts/` | `contracts/` |
   | `@packages/core/workflows/` | `workflows/` |
   | `@packages/core/templates/` | `templates/` |
   | `@packages/skills/` | `skills-lib/` |
   | `@packages/full/agents-lib/` | `agents-lib/` |
   | `@packages/core/scripts/` | `scripts/` |

   Example: to read `@packages/core/commands/create-prd.md`, resolve
   `${CLAUDE_PLUGIN_ROOT}/commands/core/create-prd.md`.

   **When running from a development checkout** (`--plugin-dir <repo>/packages/full`) the same
   table applies — `packages/full` has that identical flattened shape, which is the point of
   its symlinks.

   **Verify before trusting this table.** If `${CLAUDE_PLUGIN_ROOT}/commands/core/` does not
   exist, list `${CLAUDE_PLUGIN_ROOT}` and map by inspection rather than proceeding on a path
   that does not resolve. A rebase that silently reads nothing reports success having copied
   nothing — the exact silent-absence failure this command exists to repair.

3. **If plugin path unavailable:**
   - Report error: "Cannot resolve plugin source path. Ensure ensemble-vnext plugin is installed."
   - Abort rebase

**What the table is for here.** It gives the plugin root for the engine call, and it locates the shipped version of a conflicted file (Step 2): the render the engine compared against is gone when it exits. The `@` notation is for documentation clarity only; use absolute resolved paths.

### Recovery is git. Check the working tree BEFORE touching anything.

**This command writes no backups, and that is deliberate.** `.claude/` is committed —
`constitution.md`'s Architecture Invariants require it ("Runtime is committed to git for
reproducibility"), and `.gitignore` excludes `*.local.*`, the framework-written working files that differ on every branch (`.trd-state/current.json`, the dispatch logs; the engine adds these ignore rules) and the run records under `.trd-state/` (they live on the records ref; the engine's records cutover untracks them, staged). So git already holds every
byte this command is about to replace, with better tooling than a copied directory: `git
diff` shows exactly what the rebase changed, which a timestamped parallel tree cannot.

Backups were removed on 2026-08-21. They duplicated git, cluttered `.claude/` with four
parallel `<dir>.backup.<timestamp>/` trees, needed their own cleanup step, and made the
rollback procedure *more* dangerous than git — the documented restore was
`rm -rf .claude/skills && mv .claude/skills.backup.<ts> .claude/skills`, which silently
destroys any skill added since the backup was taken.

**Git covers everything except one case: edits that were never committed.** So check for
that case up front, which this command previously never did:

```bash
git rev-parse --git-dir >/dev/null 2>&1 || echo "NOT-A-REPO"
git status --porcelain -- .claude/
```

| Result | Action |
|---|---|
| Clean tree, inside a repo | **Proceed.** Git holds the current state; everything is recoverable. |
| Uncommitted changes under `.claude/` | **STOP.** Report the exact files and stop. Those edits exist nowhere else, and this command is about to overwrite them. The user commits or stashes, then re-runs. |
| Not a git repository | **STOP.** Report that the runtime is unversioned, so a rebase is unrecoverable. `git init && git add .claude && git commit` is the fix. |

`--force` overrides both stops. It means "I accept that anything uncommitted is gone" —
say that plainly in the report rather than proceeding quietly.

**Stopping is correct here, and is not the defensive-checkpointing anti-pattern**
(`.claude/rules/autonomy.md`): this is case 3, an irreversible destructive operation on
user-authored work that no mechanism can recover. It is a precondition failure reported
once at the start, not a mid-loop request for permission to continue.

---


## Execution Steps

### Step 1: One engine call

Run the engine once. It plans every change, applies them, and prints one result. Pass `--dry-run` and/or `--preserve-all` through when the user gave them; never `--force`, which the engine rejects.

```bash
bash "<plugin-root>/scripts/scaffold-project.sh" --rebase --plugin-dir "<plugin-root>" [--dry-run] [--preserve-all] "<project-root>"
```

`<plugin-root>` is the root resolved in "Path Resolution" (the engine's own script directory is `scripts/` under it); `<project-root>` is the project directory.

**Read only the last line of standard output.** It is `REBASE_RESULT <json>`; the lines before it are a render banner on stderr and progress text and carry nothing you need. The JSON has:

- `mode`, `preserveAll`, `pluginVersion`;
- `categories.<name>` for `commands`, `agents`, `hooks`, `hook-libs`, `hook-prompts`, `workflows`, `libs`, `contracts`, `skills`, `rules`: lists `added`, `replaced`, `removed`, `preserved` (paths relative to `.claude/`), a count `unchanged`, and `conflicts` (each `{path, reason}`);
- `settings`: `added`, `replaced`, `removed`, `preserved`, `unchanged`, `conflicts`, `counts`, `written`, `refused`;
- `steps`: `modes`, `selection`, `preloads`, `gitFiles`, `recordsCutover`, `stamp`, each `ok`, `skipped: <why>`, `failed: <why>` or `not run` (every step is `not run` under `--dry-run`);
- `error`, present only when the run failed.

**`error` present: COMMAND STUCK.**

- An error from the planning stage wrote nothing: say the tree is unchanged.
- An error from the apply stage (a failed copy, delete or settings write) can leave a partly applied tree with no version stamp: say so, and point at `git status --short .claude/` to see what changed and `git restore .claude/` to undo it (see Rollback).

The Reason line carries the engine's `error` text; Next says to fix the cause and re-run.

### Step 2: Resolve reported conflicts

**Under `--dry-run`, list every conflict (file and settings) in the readout and resolve none; skip the rest of this step.**

Otherwise resolve what the engine could not decide. Never discard an owner change.

**File conflict** (an entry in `categories.<name>.conflicts`, `reason: "owner edit"`; `path` is relative to `.claude/`). Find the owner's change from the project's own history:

```bash
git log --format='%h %ad %s' --date=short -- .claude/<path>
git log -p -- .claude/<path>
```

1. **No change after the commit that installed it.** The file came from an untagged plugin build, so it is not an owner edit and a merge would only reintroduce old framework text. Replace it with the shipped version, and say so in DECISIONS, naming the file.
2. **An owner change exists.** Read the shipped version (locate it through the Path Resolution table; an agent is `agents-lib/<name>.md`, compared ignoring its generated skill-preload content) and diff the owner's change against it. Then either:
   - **Merge**: the shipped version plus the owner's change, when the change applies cleanly and nothing of either side is lost; or
   - **Keep the owner's copy**: when the change overlaps lines the framework changed. List the file in ISSUES as needing a manual merge.

   Say which you did, per file, in DECISIONS.
3. A merged hook keeps its file mode. A merged or kept agent keeps the project copy's `skills:` list and its `ENSEMBLE:SKILLS` block (the engine leaves a conflicted agent out of the preload step), and the readout says that agent's preloads were not refreshed.

**Settings conflict** (an entry in `settings.conflicts`). Resolve it only when the local value can be put into the shape the engine understands without losing any of it; otherwise leave it. The shipped shape is `templates/claude-directory/settings.json` under the plugin root (Path Resolution table), and the hook set a current install carries is this generated list:

<!-- ENSEMBLE:HOOKS-TABLE:BEGIN — generated by packages/core/scripts/generate-hooks-artifacts.sh; edits are overwritten -->

Check these hooks in `.claude/hooks/` (9 files, 10 event registrations):
1. **Router Hook** (`UserPromptSubmit`) — `.claude/hooks/router.py` (framework-orientation reminder plus the ENSEMBLE_COMMAND run-state marker the Stop judge reads; opens the run-state record on slash commands)
2. **Formatter Hook** (`PostToolUse`) — `.claude/hooks/formatter.sh` (auto-formats files touched by Edit/Write/MultiEdit using project-detected formatters)
3. **Dispatch-Ledger Hook** (`SubagentStart`) — `.claude/hooks/dispatch-ledger.js` (records subagent dispatch to an append-only ledger at `.trd-state/<feature>/dispatch.jsonl` so an orchestrator can enumerate in-flight agents after compaction; also runnable as `--open` to report the still-running set)
4. **Status Hook** (`SubagentStop`) — `.claude/hooks/status.js` (best-effort safety net: advances cycle_position in `implement.json` as subagents complete, so the durable marker keeps moving even if the session dies mid-loop)
5. **Dispatch-Ledger Hook** (`SubagentStop`) — `.claude/hooks/dispatch-ledger.js` (records subagent completion to the dispatch ledger)
6. **Discipline-Stop Hook** (`Stop`) — `.claude/hooks/prompts/discipline-stop.prompt.md` (model-judged, two independent judgments in one Stop-hook prompt (FIX-002, docs/TRD/judge-prompt-generative-rule.md): (a) blocks fire-and-forget async claims made without real async machinery in flight (pairs with `.claude/rules/async-discipline.md`); (b) blocks hedged mid-loop pause offers that violate autonomous-execution discipline (pairs with `.claude/rules/autonomy.md`))
7. **Notify Hook** (`Stop`) — `.claude/hooks/notify.sh` (optional outbound notification (`NOTIFY_ON_STOP`) fired every time a session stops)
8. **Session-Context Hook** (`SessionStart`) — `.claude/hooks/session-context.js` (auto-loads in-flight TRD/PRD state from `.trd-state/current.json` into session context)
9. **Runtime-Refresh Hook** (`SessionStart`) — `.claude/hooks/runtime-refresh.sh` (refreshes vendored `.claude/` components already present from a newer installed plugin (present-only, monotonic version gate); see `docs/TRD/runtime-refresh.md`)
10. **PreCompact Hook** (`PreCompact`) — `.claude/hooks/precompact.js` (archives a decision-trail checkpoint to `.trd-state/<feature>/session-log.md` before context compaction)

Plus `.claude/hooks/notify-complete.sh` (not event-registered — invoked directly by commands (not by an event) on their COMMAND COMPLETE turn to fire `NOTIFY_ON_COMPLETE` exactly once; see `.claude/rules/command-status.md` Path B) and `.claude/hooks/lib/` (shared helpers).

<!-- ENSEMBLE:HOOKS-TABLE:END -->

**The list above is generated from `hooks.manifest.json`.** It is the authority for the current hook set, never a hand-maintained list. A registration pointing at a hook file that no longer ships fails on every event.

Say in DECISIONS which settings conflicts you resolved and which you left. **Do not call the engine a second time.** A settings conflict (resolved or left) and a guard refusal (`settings.refused`, which also shows as `stamp: skipped: settings write refused by the guard`) go in ISSUES, and NEXT says to commit and run `/rebase-project` again: the engine may have stamped the new version while the old `hooks` block is still in force.

### Step 3: Readout

Build the four-section readout (see "Readout") from the result and from git. Say nothing the engine and git do not show; in particular the engine does not report why a feature was not seeded to a records ref.

- **Version**: before (Step 0's value) and after (`ensemble.version` as now stamped; `pluginVersion` under `--dry-run`).
- **Per category**: added, replaced, removed, preserved, from `categories`; name the framework rules (`async-discipline.md`, `autonomy.md`, `command-status.md`) that changed.
- **Governance files preserved**: `constitution.md`, `stack.md`, `process.md`, `verification.md`, `design.md`, `ship.md`, untouched.
- **ISSUES**: every `steps` entry that is `failed: <why>`, and every `skipped: <why>` that is not an expected skip (no remote is expected). A `stamp` that failed or was skipped means the version is not recorded: re-run.
- **Git files and records cutover** (not under `--dry-run`), read from git:
  - files untracked: `git diff --cached --name-only --diff-filter=D -- .trd-state`, named by feature folder;
  - refs seeded: records refs present now that Step 0 did not list (`git for-each-ref refs/ensemble/records/`);
  - pushed or kept local: `git ls-remote origin 'refs/ensemble/records/*'` (no remote means local only);
  - NEXT includes: commit the untracking on the base branch.
- Never print `settings.json` `env` values.

Then emit the notify call and the banner (see "Output discipline").

---

## Rollback

The working tree was clean before this ran (the precondition in "Recovery is git" enforces
it), so everything the rebase did is an uncommitted change:

```bash
git restore .claude/          # undo everything this command wrote
git restore --staged .claude/ # if you already staged it
git restore --staged .trd-state # undo the engine's records cutover untracking; files never left disk
```

The cutover's seeded refs (`refs/ensemble/records/<slug>`) are not part of the working tree, so
**`git restore` does not undo a seeded ref, and it never undoes a ref that was pushed**: the copy on
`origin` stays there whatever you restore locally. The refs are additive, so leaving them is
harmless. To remove one anyway, delete it on both sides:

```bash
git update-ref -d refs/ensemble/records/<slug>              # the local ref
git push origin --delete refs/ensemble/records/<slug>       # only if `git ls-remote origin` lists it
```

Undo one component by narrowing the path — `git restore .claude/skills/`. Inspect before
undoing with `git diff .claude/`.

**If the rebase failed part-way through**, the same command applies: partial changes are
still just uncommitted modifications. There is no partial-restore ordering to get right.

**Reinstalling from scratch** (if `.claude/` is beyond repair): `/init-project --force`
regenerates the whole vendored runtime.

---

## Error Handling

| Condition | Action |
|-----------|--------|
| `.claude/` doesn't exist | Report error, suggest /init-project |
| Plugin source not accessible | Report error, abort |
| `error` in the engine result, planning stage | COMMAND STUCK; nothing was written |
| `error` in the engine result, apply stage | COMMAND STUCK; the tree may be partly applied and unstamped; point at `git status --short .claude/` and `git restore .claude/` |
| A `steps` entry is `failed` or an unexpected `skipped` | One ISSUES line each; a failed or skipped `stamp` means re-run |
| `settings.refused` set | ISSUES line; NEXT: commit, then run `/rebase-project` again |
| Uncommitted changes under `.claude/` | **Abort before writing anything**, list the files, tell the user to commit or stash (or pass `--force` to discard them) |
| Not a git repository | **Abort before writing anything** — the rebase would be unrecoverable. Suggest `git init && git add .claude && git commit` |

---

## Flag Behavior Summary

`Rules` splits in two: **governance** (`constitution.md`, `stack.md`, `process.md`, `verification.md`, `design.md`, `ship.md`)
is never touched by any flag; **framework-shipped**
(`async-discipline.md`, `autonomy.md`, `command-status.md`) behaves like commands.

| Flag | What the engine does | Conflicts |
|------|----------------------|-----------|
| (default)        | Replaces framework files that match a shipped version, adds new ones, removes retired ones, merges settings, refreshes skill selection and preloads, untracks run records, stamps the version | Resolved in Step 2 |
| `--dry-run`      | Writes nothing; every `steps` entry is `not run` | Listed, none resolved |
| `--preserve-all` | Adds new agents and skills only; replaces commands, hooks, workflows, libs and contracts; leaves framework rules and retired files; still regenerates the ensemble-owned `hooks` block | Resolved in Step 2 |
| `--force`        | Not passed to the engine; it only skips the clean-tree precondition | Resolved in Step 2 |

---

## Readout

**Format: the four-section readout in `.claude/rules/command-status.md`** — STATE, DECISIONS,
ISSUES, NEXT, in that order, one screen, written for someone who was not in the session. Any
section may be "none". No section for what was dispatched or which stages ran: that is in the
transcript and does not change what the owner does next.

## Notes

- This command is safe to run multiple times
- Destructive operations are recoverable from git (clean tree enforced up front)
- Governance files (constitution.md, stack.md, process.md, verification.md, design.md, ship.md) are NEVER modified
- Custom agents/commands/hooks (not from plugin) are NEVER removed
- The engine, not this prompt, decides what is replaced, added or removed; its tests carry those guarantees
- Use `--dry-run` first to preview changes before applying
- If unsure, use `--preserve-all` for minimal changes

---

*This command implements TRD tasks: TRD-C601 through TRD-C605*



---

## Output discipline (see `.claude/rules/command-status.md`)

**End your final turn with the banner — last line of output, nothing after it:**

```
═══ COMMAND COMPLETE: /rebase-project ═══
<one-line summary of what was produced>
```

On unrecoverable failure, use `═══ COMMAND STUCK: /rebase-project ═══` followed by `Reason:` and `Next:` lines.

**Programmatic completion notify** — on the same final turn, invoke the user's `NOTIFY_ON_COMPLETE` shell command (if set) for webhook/queue/shell-pipeline integration:

```bash
.claude/hooks/notify-complete.sh "rebase-project" "complete" "<one-line summary>"
```

For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"`. The bracket-guard makes this a no-op when not configured.


---

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

This command runs **autonomously** from this invocation to the COMMAND COMPLETE banner.
**Do NOT pause mid-flow to ask the user to confirm decisions, review artifacts, verify
checkpoints, or defer to stakeholders.** The user already authorized the run by invoking
the command; do not ask them to authorize it again, in pieces.

`AskUserQuestion` is permitted ONLY in these four cases:

1. **Genuine requirement ambiguity** — the PRD/TRD/stack.md is silent on a decision
   that MUST be made, AND no reasonable default exists from documented constraints.
   *Try a default first; ask only if none fits.*
2. **Missing information that cannot be derived** — a value not in the codebase, env,
   config, or anywhere derivable (a user-specific URL, API key not in env, etc.).
3. **Truly irreversible destructive operations** — `--reset-state` with progress,
   `git push --force`, deleting user-authored files. Routine state mutations do NOT
   qualify.
4. **STUCK conditions** — retry exhaustion after the documented mitigations have run.

Outside these four cases: **decide based on documented constraints, document the
rationale in the artifact, and proceed.** The user iterates via `/refine-prd`,
`/refine-trd`, or `/implement-trd --resume` — not via mid-loop confirmation prompts.

Forbidden patterns:
- "Should I proceed to phase N+1?" → no — emit PHASE banner, proceed.
- "Please review this artifact before I continue." → no — finish the artifact, emit
  COMMAND COMPLETE.
- "Multiple approaches possible; which do you prefer?" → pick the best fit, document
  why, mention alternatives in the artifact if useful.
- "Should I check with product/legal/stakeholders?" → no — decide based on documented
  goals; the user can correct via /refine-*.
- "Checkpoint reached. Continue?" → continue. Always.
- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- "Given the previous step went cleanly, do you want me to pause and review?" → self-defeating: you just acknowledged there's nothing to address. PROCEED.

### Autonomy is the default, not a mode

The COMMAND COMPLETE banner is the first and only return of control. A STUCK condition after
retry exhaustion is the one thing that stops a run early. Everything in the table above is
forbidden unconditionally — there is no flag that turns this on, and none that turns it off.
