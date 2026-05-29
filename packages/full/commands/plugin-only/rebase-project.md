---
name: rebase-project
description: Upgrade vendored runtime to the latest plugin version — non-interactive, always backs up, updates anything that differs
version: 2.0.0
category: generator
argument-hint: "[--dry-run] [--preserve-all]"
disable-model-invocation: true
---

> **Usage:** Invoke `/rebase-project` from the project root to upgrade the vendored runtime.
>
> **Options:**
> - `--dry-run` - Preview changes without applying anything
> - `--preserve-all` - Conservative mode: update only commands/hooks; keep existing agents/skills/settings as-is (escape hatch for projects with heavy customization)
>
> **Default behavior (no flags) — applied automatically, no prompts:**
> - For agents/skills/commands/hooks: any file that **differs from the plugin's current version** is replaced. Anything not currently in the plugin is preserved as a user customization.
> - **Backups are always created** before any replacement (`.claude/<dir>.backup.<timestamp>/`). Nothing is destroyed without a recoverable copy.
> - **User governance files** (`constitution.md`, `stack.md`, `process.md`) are NEVER modified.
> - **Framework-shipped rules** (`async-discipline.md`, future drop-ins) are copied-if-missing.

---

## User Input

```text
$ARGUMENTS
```

Examples:
- (no args) - Apply all updates with backups, no prompts
- "--dry-run" - Show what would change without writing anything
- "--preserve-all" - Update only commands/hooks; leave agents/skills/settings alone

---

## Goals

- Upgrade vendored runtime in `.claude/` to match the current plugin version
- **Update any file whose content differs from the plugin** (agents, skills, commands, hooks)
- Always create timestamped backups before replacing
- Preserve user governance files (constitution.md, stack.md, process.md)
- Preserve user-created files (agents/skills/commands not shipped by the plugin)
- Copy framework-shipped rules (async-discipline.md, etc.) if missing
- Merge new settings.json defaults while preserving local overrides
- Generate comprehensive rebase report

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
   .claude/rules/stack.md      - Required for skill recomputation
   .claude/rules/constitution.md - Governance file (preserve)
   ```

3. If missing required files:
   - List missing files
   - Offer: "Run /init-project to create missing files, or continue with partial rebase?"

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
   - Fallback: `~/.claude/plugins/ensemble-vnext/`

2. **For LLM execution:**
   - Use file system tools to read from resolved paths
   - Example: To read `@packages/core/commands/create-prd.md`:
     - Resolve: `${CLAUDE_PLUGIN_ROOT}/packages/core/commands/create-prd.md`
     - Read file contents

3. **If plugin path unavailable:**
   - Report error: "Cannot resolve plugin source path. Ensure ensemble-vnext plugin is installed."
   - Abort rebase

**Implementation note:** When copying files, use absolute resolved paths. The `@` notation is for documentation clarity only.

### Timestamp Format

All backup directories use a consistent timestamp format for file system compatibility:

**Format:** `YYYYMMDD-HHmmss` (ISO8601 without special characters)

**Examples:**
- `.claude/skills.backup.20260113-143022/`
- `.claude/commands.backup.20260113-143022/`

**Generation:** Use this pattern to generate timestamps:
```javascript
const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
```

---

## Execution Steps

### Step 1: Version Detection

<version-detection>

**TRD-C602: Implement version detection**

1. **Read current vendored version:**

   Check `.claude/settings.json` for version field:
   ```json
   {
     "ensemble": {
       "version": "1.0.0",
       "rebased_at": "2026-01-12T10:30:00Z"
     }
   }
   ```

   If no version field exists:
   - Treat as "unknown" version (pre-versioning installation)
   - Note: "Version unknown - treating as initial installation"

2. **Detect available plugin version:**

   Read version from plugin manifest. The current plugin version is defined in the plugin package.

   For this comparison, use the version in the command frontmatter or a known plugin version source.

3. **Compare versions:**

   | Current | Available | Action |
   |---------|-----------|--------|
   | Same | Same | Report "Already up to date" (still scan for content drift) |
   | Older | Newer | Proceed with upgrade |
   | Unknown | Any | Proceed with full sync |
   | Newer | Older | Warn "Vendored version is newer than plugin" |

4. **Output version summary:**
   ```
   Version Detection:
   - Current vendored version: [version or "unknown"]
   - Available plugin version: [version]
   - Status: [Up to date / Upgrade available / Version mismatch]
   ```

5. **If `--dry-run`:**
   - Continue to generate full diff report
   - Do NOT apply any changes

</version-detection>

### Step 2: Component Diff

<component-diff>

**TRD-C603: Implement component diff**

Analyze each component category to identify changes.

#### 2.1 Agent Diff

**Behavior:** Agents are UPDATED whenever the plugin's content differs from the vendored
copy. The plugin is the source of truth for any agent it ships; the user's customization
is preserved in a backup. User-created agents (not shipped by the plugin) are never touched.

1. **List plugin agents:**
   Read agent files from plugin source: `@packages/full/agents/`

2. **List vendored agents:**
   Read agent files from `.claude/agents/`

3. **Categorize via content comparison (byte-level diff of the full file):**

   | Category | Condition | Action |
   |----------|-----------|--------|
   | **New** | In plugin, not in vendored | Will be added |
   | **Updated** | In both, content differs | Will be REPLACED (backup created) |
   | **Unchanged** | In both, content identical | No action |
   | **Custom** | In vendored, not in plugin | Preserved (report only; not removed) |

4. **Generate agent diff:**
   ```
   Agents:
   - New agents to add: [list]
   - Updated agents (will replace, backup created): [list]
   - Unchanged agents: [count]
   - Custom agents (preserved): [list if any]
   ```

#### 2.2 Skill Diff

**Behavior, two phases:**
  - **(a) Stack recompute** — determine which skills SHOULD be installed based on
    `stack.md`. Skills no longer matching the stack are removed; new stack-relevant skills
    are added.
  - **(b) Content diff** — for skills retained in (a), compare every file
    (`SKILL.md`, `REFERENCE.md`, templates, examples) byte-for-byte against the plugin's
    current version. If ANY file differs, the entire skill folder is replaced (backup
    created). This catches updates to `paths:` globs, `when_to_use`, currency-check
    directives, and any other frontmatter or content change.

1. **Read current stack.md:**
   Parse `.claude/rules/stack.md` to extract technology declarations

2. **Match against skill library:**
   Use skill matching table from skill-selection-instructions.md

   | stack.md Entry | Matching Skill |
   |----------------|----------------|
   | Language: Python | `developing-with-python` |
   | Language: TypeScript | `developing-with-typescript` |
   | Language: PHP | `developing-with-php` |
   | Framework: React | `developing-with-react` |
   | Framework: Laravel | `developing-with-laravel` |
   | Framework: Flutter | `developing-with-flutter` |
   | Framework: NestJS | `nestjs` |
   | Testing: Jest | `jest` |
   | Testing: pytest | `pytest` |
   | Testing: RSpec | `rspec` |
   | Testing: xUnit | `xunit` |
   | Testing: ExUnit | `exunit` |
   | Testing: Playwright | `writing-playwright-tests` |
   | Database: Prisma | `using-prisma` |
   | Infrastructure: Railway | `managing-railway` |
   | Infrastructure: Vercel | `managing-vercel` |
   | Infrastructure: Supabase | `managing-supabase` |
   | AI: Anthropic/Claude | `using-anthropic-platform` |
   | AI: OpenAI | `using-openai-platform` |
   | AI: Perplexity | `using-perplexity-platform` |
   | AI: LangGraph | `building-langgraph-agents` |
   | AI: Langfuse (observability/tracing/evals) | `using-langfuse` |
   | AI: RAG / retrieval-augmented generation | `building-rag-pipelines` |
   | AI: Agent memory / conversation memory / vector recall | `building-agent-memory` |
   | AI: Tool calling / agent loop / Responses API tools | `building-tool-orchestration` |
   | Database: pgvector / Postgres vector | `using-pgvector` |
   | Database: Weaviate | `using-weaviate` |
   | Background Jobs: Celery | `using-celery` |

   **Note on inference:** stack.md doesn't always declare these by name — infer from
   capability mentions. Examples:
   - "Langfuse" / "prompt observability" / "trace LLM calls" → `using-langfuse`
   - "RAG" / "retrieval-augmented" / "embeddings + retrieval" / "vector search + LLM" → `building-rag-pipelines`
   - "agent memory" / "conversation history" / "working/short/long memory" → `building-agent-memory`
   - "tool calling" / "function calling" / "multi-turn agent loop" / "Responses API tools" → `building-tool-orchestration`
   - "pgvector extension" / "Postgres + vector" / "halfvec / HNSW" → `using-pgvector`

   When in doubt, **include the skill**. Skills are lazy — they cost nothing until
   invoked. Missing skills cost the model improvising from scratch.
   | Styling: Tailwind | `styling-with-tailwind` |
   | Issue Tracker: Jira | `managing-jira-issues` |
   | Issue Tracker: Linear | `managing-linear-issues` |

3. **Compare with current skills:**
   ```
   Skills:
   - Skills to add (new in stack):                [list]
   - Skills to update (content differs vs plugin): [list]   ← drives the content sync
   - Skills unchanged (match stack + identical):  [count]
   - Skills to remove (no longer match stack):    [list]
   ```

   The **"to update"** bucket is computed by, for each skill matching the stack and present
   in both plugin and vendored: byte-diffing the folder contents. Any difference → update.

#### 2.3 Command Diff

**Behavior:** Commands are REPLACED (not customized per project). Stale plugin commands are removed.

1. **List plugin commands:**
   Dynamically discover all `.md` files from `@packages/core/commands/` and `@packages/router/commands/`.
   Exclude plugin-only commands: `init-project.md`, `rebase-project.md`.

2. **List vendored commands:**
   Read from `.claude/commands/`

3. **Categorize:**

   | Category | Condition | Action |
   |----------|-----------|--------|
   | **New** | In plugin, not in vendored | Will be added |
   | **Updated** | In both, content differs | Will be replaced |
   | **Unchanged** | In both, content same | No action |
   | **Stale** | In vendored, not in plugin, AND has ensemble frontmatter (`category:` field) | Will be REMOVED (was a plugin command that no longer exists) |
   | **Custom** | In vendored, not in plugin, AND no ensemble frontmatter | Report, preserve |

   **Stale detection:** To distinguish "removed plugin command" from "user-created custom command,"
   check if the file contains YAML frontmatter with a `category:` field matching known ensemble
   categories (`generator`, `implementation`, `verification`, `artifact`, `maintenance`).
   Files with this marker were vendored by the plugin and should be removed when the plugin
   no longer ships them. Files without it are user-created and preserved.

4. **Generate command diff:**
   ```
   Commands:
   - New commands: [list]
   - Updated commands: [list]
   - Unchanged commands: [count]
   - Stale commands (will remove): [list if any]
   - Custom commands (preserved): [list if any]
   ```

#### 2.4 Hook Diff

**Behavior:** Hooks are REPLACED (not customized per project). Stale plugin hooks are removed.

##### Install-time layout transformations (match the scaffold)

The plugin source layout (`packages/full/hooks/`) is FLAT (all symlinks at the hooks
root). The SCAFFOLD applies transformations at install time. The rebase MUST honor the
SAME transformations or it will fight the scaffold:

- **Permitter** — plugin source: flat `permitter.js` symlinked from
  `packages/permitter/hooks/permitter.js`. **Installed as a SUBDIRECTORY**:
  `.claude/hooks/permitter/permitter.js` + `.claude/hooks/permitter/lib/*` (where the
  `lib/*` files are copied from `packages/permitter/lib/` — the sibling-of-`hooks/`
  directory found by following the symlink target).
  - **Diff target:** plugin's `packages/permitter/hooks/permitter.js` ↔ project's
    `.claude/hooks/permitter/permitter.js` (NOT `.claude/hooks/permitter.js`).
  - **Lib files:** plugin's `packages/permitter/lib/*.js` ↔ project's
    `.claude/hooks/permitter/lib/*.js`.
  - **Settings reference:** `settings.json` must point at
    `.claude/hooks/permitter/permitter.js` (subdirectory path). Do NOT propose flattening it.
- **Core lib** — plugin source: `packages/full/hooks/lib` symlinked to
  `packages/core/hooks/lib/`. **Installed as a SUBDIRECTORY**:
  `.claude/hooks/lib/*.js` (shared helpers used by `precompact.js`, `session-context.js`,
  `wiggum.js`, etc. via `require('./lib/resolve-project-root')`).
  - **Diff target:** plugin's `packages/core/hooks/lib/*.js` ↔ project's
    `.claude/hooks/lib/*.js`.

A project that ALREADY has the subdirectory layout (the correct one — installed by any
recent scaffold) must NOT be reported as "stale subdirectory" or "needs flattening". If
your diff produces a row like `permitter/permitter.js → permitter.js`, you're scanning
the wrong path on either side.

1. **List plugin hooks:**
   For the flat hooks (most), dynamically discover hook files (`*.js`, `*.py`, `*.sh`) from:
   - `@packages/router/hooks/`
   - `@packages/core/hooks/` (excluding `lib/` — handled below)

   For the special-layout hooks, look them up by their *installed* paths:
   - `permitter/permitter.js` ← `packages/permitter/hooks/permitter.js`
   - `permitter/lib/*.js`     ← `packages/permitter/lib/*.js`
   - `lib/*.js`               ← `packages/core/hooks/lib/*.js`

2. **List vendored hooks:**
   Walk `.claude/hooks/` recursively, capturing both top-level files and the
   `permitter/`, `permitter/lib/`, and `lib/` subdirectories.

3. **Categorize** (using the *installed* paths from step 1):

   | Category | Condition | Action |
   |----------|-----------|--------|
   | **New** | In plugin, not in vendored | Will be added |
   | **Updated** | In both, content differs | Will be replaced |
   | **Unchanged** | In both, content same | No action |
   | **Stale** | In vendored, not in plugin, AND matches known hook extensions (`*.js`, `*.py`, `*.sh`) in the hooks root | Will be REMOVED with backup |
   | **Custom** | In vendored subdirectory not matching plugin structure | Report, preserve |

   **Do NOT classify the `permitter/` subdirectory, `permitter/lib/`, or `lib/` as
   "stale" or "custom" — they are the correct installed layout.**

4. **Generate hook diff:**
   ```
   Hooks:
   - New hooks: [list]
   - Updated hooks: [list]
   - Unchanged hooks: [count]
   - Stale hooks (will remove): [list if any]
   - Custom hooks (preserved): [list if any]
   ```

#### 2.5 Settings Diff

**Behavior:** Settings are MERGED - new defaults added, local overrides preserved.

1. **Read plugin default settings:**
   Read from `@packages/core/templates/claude-directory/settings.json`

2. **Read vendored settings:**
   Read from `.claude/settings.json`

3. **Identify merge requirements:**
   ```
   Settings:
   - New configuration keys: [list]
   - Modified default values: [list - show old/new]
   - Local overrides preserved: [count]
   ```

#### 2.6 Generate Summary Diff

**Compile full diff report:**

```
## Rebase Diff Summary

Current Version: [version]
Target Version: [version]

### Components to Update

| Component | New | Updated | Stale (remove) | Preserved |
|-----------|-----|---------|----------------|-----------|
| Agents | [n] | 0 | 0 | [n] |
| Skills | [n] | - | [n] | [n] |
| Commands | [n] | [n] | [n] | [n] |
| Hooks | [n] | [n] | [n] | [n] |
| Settings | [n] keys | [n] values | 0 | all |

### Detailed Changes

[Detailed list for each category as generated above]
```

</component-diff>

### Step 3: Display diff summary and proceed

<display-summary>

**Behavior: non-interactive.** Display the diff summary (counts + per-category lists) so
the user can see what's about to change, then proceed automatically. Do NOT call
`AskUserQuestion` — the user invoked `/rebase-project` knowing it would update; asking
"are you sure?" is anti-pattern after that opt-in. Safety comes from always-on backups,
not prompts.

**For ALL modes, print the summary block:**
```
Rebase preview
  Agents     : N add | M update | K unchanged | C custom (preserved)
  Skills     : N add | M update | K unchanged | R remove
  Commands   : N add | M update | K unchanged | S stale-removed | C custom
  Hooks      : N add | M update | K unchanged | S stale-removed | C custom
  Settings   : N new keys | M preserved overrides
  Framework rules: N copied | M existing (preserved)
```

**Branch on flags:**

| Flag | Behavior |
|------|----------|
| (none) | Print summary, then proceed straight to Step 4 (apply with backups). |
| `--dry-run` | Print summary with "DRY RUN — no files written" header, then **skip Step 4**, proceed to Step 5 (report). |
| `--preserve-all` | Print summary, set `agent_preserve=true`, `skill_preserve=true`, `settings_preserve=true` (Step 4 will still update commands and hooks but leave the preserved categories alone), proceed to Step 4. |

</display-summary>

### Step 4: Selective Update

<selective-update>

**TRD-C604: Implement selective update**

#### 4.1 Update Agents (content-diff, always-backup)

**Rule:** Update any agent whose content differs from the plugin's version. Always create
a backup before replacing. Never touch user-created agents.

1. **Create backup of any agents that will be replaced:**
   - For every agent classified **Updated** in §2.1, copy the current vendored file to
     `.claude/agents.backup.<timestamp>/<agent>.md` before replacing.
   - If no agents will be replaced, no backup directory is created (don't clutter).

2. **For each NEW agent in plugin:**
   - Copy from plugin source to `.claude/agents/`
   - Report: "Added new agent: [name]"

3. **For each UPDATED agent (content differs):**
   - Backup created in step 1; overwrite `.claude/agents/<agent>.md` with plugin version
   - Report: "Updated agent: [name] (backup: .claude/agents.backup.<timestamp>/<name>.md)"

4. **For each UNCHANGED agent:**
   - No action; no log line (silent — covered by summary count)

5. **For CUSTOM agents (in vendored, not in plugin):**
   - DO NOT remove
   - Report: "Kept custom agent: [name]"

**If `agent_preserve=true` (set by `--preserve-all`):**
- Skip steps 1-3; only add NEW agents (step 2).
- Report: "Existing agents preserved (preserve-all mode)"

#### 4.2 Update Skills (recompute + content-diff, always-backup)

**Rule:** Two-phase update. (a) Recompute the set of installed skills against the current
`stack.md`. (b) For skills retained, replace folder content whenever any file differs from
the plugin's version. Always create a backup of anything removed or replaced.

1. **Create backup** (only if there's something to remove or replace):
   - For each skill classified **Updated** or **Remove** in §2.2, copy the entire current
     folder to `.claude/skills.backup.<timestamp>/<skill-name>/` before any change.

2. **Remove outdated skills** (no longer match stack.md):
   - Delete `.claude/skills/<skill-name>/` (already backed up in step 1)
   - Report: "Removed skill: [name] (backup: .claude/skills.backup.<timestamp>/<name>/)"

3. **Add new skills** (newly match stack.md):
   - Copy entire folder from `@packages/skills/<skill-name>/` to `.claude/skills/<skill-name>/`
     including SKILL.md, REFERENCE.md, templates/, examples/, paths-globbed files
   - Report: "Added skill: [name]"

4. **Update retained skills whose content differs** (the bucket from §2.2 step 3):
   - For each: remove the existing folder, then re-copy the plugin's current folder
     (mirror behavior — no merge; the plugin is the source of truth for skill content).
     Already backed up in step 1.
   - Report: "Updated skill: [name] (backup: .claude/skills.backup.<timestamp>/<name>/)"

5. **Report:**
   ```
   Skills:
   - Added:    [list]
   - Updated:  [list]
   - Unchanged:[count]
   - Removed:  [list]
   ```

**If `skill_preserve=true` (set by `--preserve-all`):**
- Skip steps 2 and 4 (no removals or content updates)
- Step 3 still runs (newly-required skills are added)
- Report: "Existing skills preserved (preserve-all mode)"

#### 4.3 Update Commands (Replace)

**Preservation Rule:** Safe to replace - not customized per project. Backup created for safety.

1. **Create backup of modified commands:**
   - Compare each vendored command with plugin version
   - If content differs, copy to `.claude/commands.backup.<timestamp>/`
   - Report: "Backed up modified command: [name]"

2. **For each plugin command:**
   - Copy from plugin source to `.claude/commands/`
   - Overwrite existing
   - Report: "Updated command: [name]"

3. **For STALE commands (was plugin, no longer shipped):**
   - Back up to `.claude/commands.backup.<timestamp>/` before removing
   - Remove from `.claude/commands/`
   - Report: "Removed stale command: [name]"

4. **For CUSTOM commands (user-created, not from plugin):**
   - DO NOT remove
   - Report: "Kept custom command: [name]"

5. **Command discovery:**
   - Dynamically discover all `.md` files from `@packages/core/commands/` and `@packages/router/commands/`
   - Exclude plugin-only commands: `init-project.md`, `rebase-project.md`
   - This ensures new commands added to the plugin are automatically picked up without
     needing to update a hardcoded list

#### 4.4 Update Hooks (Replace)

**Preservation Rule:** Safe to replace - not customized per project. Backup created for safety.

1. **Create backup of modified hooks:**
   - Compare each vendored hook with plugin version
   - If content differs, copy to `.claude/hooks.backup.<timestamp>/`
   - Report: "Backed up modified hook: [name]"

2. **For each plugin hook:**
   - Copy from plugin source to `.claude/hooks/`
   - Overwrite existing
   - Ensure execute permission on shell scripts
   - Report: "Updated hook: [name]"

3. **For STALE hooks (was plugin, no longer shipped):**
   - Back up to `.claude/hooks.backup.<timestamp>/` before removing
   - Remove from `.claude/hooks/`
   - Report: "Removed stale hook: [name]"

4. **For CUSTOM hooks (user-created):**
   - DO NOT remove
   - Report: "Kept custom hook: [name]"

5. **Hook discovery — flat hooks (most):**
   - Dynamically scan these plugin directories for hook files:
     - `@packages/router/hooks/` - Routing hooks
     - `@packages/core/hooks/` - Core workflow hooks (excluding `lib/`)
   - Include files matching: `*.js`, `*.py`, `*.sh`
   - Install at `.claude/hooks/<basename>` (flat).
   - This ensures new hooks added to the plugin are automatically picked up.

6. **Hook discovery — special-layout hooks (always handle):**
   These MUST be installed at fixed subdirectory paths per the scaffold convention:

   | Plugin source path | Installed path | Action on content diff |
   |---|---|---|
   | `@packages/permitter/hooks/permitter.js` | `.claude/hooks/permitter/permitter.js` | Replace file + ensure `+x` |
   | `@packages/permitter/lib/*.js` | `.claude/hooks/permitter/lib/*.js` | Replace each file (chmod not needed) |
   | `@packages/core/hooks/lib/*.js` | `.claude/hooks/lib/*.js` | Replace each file |

   Do NOT treat `permitter/permitter.js`, `permitter/lib/`, or `lib/` as candidates for
   removal or flattening. They are part of the canonical installed layout.

7. **Settings.json hook path sanity:**
   After updating hooks, verify the project's `settings.json` references match the
   installed paths. The expected references include
   `.claude/hooks/permitter/permitter.js` (subdirectory), not `.claude/hooks/permitter.js`.
   If a stale flat path is found, fix it in the settings merge step (§4.5) — do not flatten
   the hook layout to match.

#### 4.5 Update Settings (Merge)

**Preservation Rule:** Merge new defaults, preserve local settings

1. **Read plugin default settings**

2. **Read current vendored settings**

3. **Merge strategy:**

   | Key Type | Action |
   |----------|--------|
   | New key in plugin | Add to settings |
   | Existing key, same value | No change |
   | Existing key, different value | **Preserve vendored value** |
   | Key only in vendored | Preserve (local customization) |

4. **Update version metadata:**
   ```json
   {
     "ensemble": {
       "version": "[new plugin version]",
       "rebased_at": "[current timestamp ISO8601]",
       "previous_version": "[old version]"
     }
   }
   ```

5. **Write merged settings.json**

**If settings_preserve=true:**
- Only add new keys
- Do NOT modify any existing values
- Report: "Settings merge minimal (preserve mode)"

#### 4.6 Rules: split user governance from framework-shipped

Rules under `.claude/rules/` come in two categories with opposite update policies:

**User-owned governance (NEVER modified by rebase):**
- `.claude/rules/constitution.md`
- `.claude/rules/stack.md`
- `.claude/rules/process.md`

These are generated/customized at `init-project` and belong to the user. Even with
`--force`, they are preserved.

**Framework-shipped rules (copied-if-missing on rebase):**
- `.claude/rules/async-discipline.md` (and any future `.md` files in
  `@packages/core/templates/claude-directory/rules/`)

These encode behavioral guarantees enforced by hooks (e.g., `async-discipline.js`
relies on `async-discipline.md` documenting the rule it enforces). Without the doc,
agents that hit the guard have no context. Policy:

- For each `.md` file in the framework's `claude-directory/rules/` template directory:
  - If the project already has it (`.claude/rules/<basename>` exists): **preserve as-is**
    (the user may have annotated; never overwrite without explicit `--force-rules` —
    not yet exposed).
  - If missing: **copy from the framework template**.
- Report each copied file under "Framework rules installed".

Report:
- "Governance files preserved (not modified by rebase)"
- "Framework rules: N installed, M preserved (existing)"

</selective-update>

### Step 5: Generate Rebase Report

<rebase-report>

**TRD-C605: Create rebase report**

1. **Generate comprehensive report:**

```markdown
## Rebase Report

**Date:** [timestamp]
**Mode:** [Normal / Dry-Run / Force / Preserve-All]

### Version Information

| | Before | After |
|---|--------|-------|
| Version | [old] | [new] |
| Rebased | [old timestamp] | [new timestamp] |

### Changes Applied

#### Agents
- Added: [list with descriptions]
- Preserved (customized): [list]
- Custom (not in plugin): [list if any]

#### Skills
- Added: [list]
- Removed: [list]
- Retained: [list]

#### Commands
- Updated: [list]
- Added: [list if any]
- Custom (preserved): [list if any]

#### Hooks
- Updated: [list]
- Added: [list if any]
- Custom (preserved): [list if any]

#### Settings
- New keys added: [list]
- Preserved overrides: [list]

### Files Preserved (Not Modified)
- `.claude/rules/constitution.md`
- `.claude/rules/stack.md`
- `.claude/rules/process.md`
- Existing framework-shipped rules under `.claude/rules/` (already-present `.md` files
  matching the framework template — never overwritten without explicit force flag)
- All custom agents
- All local settings overrides

### Framework Rules Installed
- [list of `.md` files newly copied from `templates/claude-directory/rules/` into
  `.claude/rules/`; empty if all were already present]

### Recommended Manual Review

The following files may benefit from manual review:

1. **New agents** - Review and customize for your project:
   [list of new agent files]

2. **Updated commands** - Check for breaking changes:
   [list of updated commands if any major changes]

3. **Skills removed** - Verify these are no longer needed:
   [list of removed skills]

### Backups Created

| Backup | Location |
|--------|----------|
| Skills | `.claude/skills.backup.[timestamp]/` |
| Agents (if any updated) | `.claude/agents.backup.[timestamp]/` |
| Commands (if modified) | `.claude/commands.backup.[timestamp]/` |
| Hooks (if modified) | `.claude/hooks.backup.[timestamp]/` |

### Next Steps

1. Review new agents and customize for your project context
2. Test commands to verify they work with your workflow
3. If skills were removed, verify they're not referenced in agents
```

2. **If `--dry-run`:**

   Add header:
   ```markdown
   ## DRY RUN - No changes applied

   The following changes WOULD be applied:
   [rest of report]

   To apply these changes, run:
   `/rebase-project` (without --dry-run)
   ```

3. **Write report to console output**

4. **Optionally save report:**
   - Save to `.claude/rebase-report-[timestamp].md`
   - Inform user: "Full report saved to [path]"

</rebase-report>

---

## Rollback Procedure

If issues occur after rebase, you can restore from backups:

### Automatic Rollback

If rebase fails mid-execution, partial changes may exist. To restore:

1. **Check for backup directories:**
   ```
   ls -la .claude/*.backup.*
   ```

2. **Restore each component as needed:**

   **Restore Skills:**
   ```bash
   rm -rf .claude/skills
   mv .claude/skills.backup.<timestamp> .claude/skills
   ```

   **Restore Agents (if any were replaced):**
   ```bash
   rm -rf .claude/agents
   mv .claude/agents.backup.<timestamp> .claude/agents
   ```

   **Restore Commands:**
   ```bash
   rm -rf .claude/commands
   mv .claude/commands.backup.<timestamp> .claude/commands
   ```

   **Restore Hooks:**
   ```bash
   rm -rf .claude/hooks
   mv .claude/hooks.backup.<timestamp> .claude/hooks
   ```

3. **Reset version in settings.json:**
   - Edit `.claude/settings.json`
   - Change `ensemble.version` to previous version
   - Change `ensemble.rebased_at` to previous timestamp

### Manual Rollback

If backups are missing, you can reinstall:

1. **Full reset:** Run `/init-project --force` to regenerate all vendored files
2. **Partial reset:** Use `/add-skill` to re-add specific skills

### Cleanup Old Backups

After verifying the rebase is successful:

```bash
# Remove backup directories older than 7 days
find .claude -name "*.backup.*" -type d -mtime +7 -exec rm -rf {} \;
```

---

## Error Handling

| Condition | Action |
|-----------|--------|
| `.claude/` doesn't exist | Report error, suggest /init-project |
| Plugin source not accessible | Report error, abort |
| Permission denied on file write | Report specific file, suggest permissions fix |
| Backup creation fails | Abort update for that component, report |
| JSON parse error in settings | Report error, offer to reset settings |
| Skill copy fails | Log warning, continue with other skills |
| Git conflicts detected | Warn user, suggest committing changes first |

---

## Flag Behavior Summary

| Flag | Agents | Skills | Commands | Hooks | Settings | Rules |
|------|--------|--------|----------|-------|----------|-------|
| (default) | Add new only | Recompute | Replace | Replace | Merge | Preserve |
| (default)        | Update on content-diff | Recompute + update on content-diff | Replace | Replace | Merge | Preserve |
| `--dry-run`      | Report only | Report only | Report only | Report only | Report only | Report only |
| `--preserve-all` | Add new only | Add new only | Replace | Replace | Add new only | Preserve |

---

## Notes

- This command is safe to run multiple times
- Backups are created for destructive operations
- Rules files (constitution.md, stack.md, process.md) are NEVER modified
- Custom agents/commands/hooks (not from plugin) are NEVER removed
- Version tracking enables incremental upgrades
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
