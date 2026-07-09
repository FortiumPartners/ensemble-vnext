# Ensemble Installation Guide

Detailed instructions for installing, configuring, updating, and troubleshooting Ensemble for Claude Code.

---

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Claude Code CLI | Latest | Runtime engine for commands and agents |
| Node.js | 18+ | Hook execution (JavaScript hooks) |
| npm | Included with Node.js | Package management |
| Git | 2.x+ | Version control, vendored runtime |
| Python | 3.x | Router hook |

**Optional:**
- jq -- JSON parsing in shell scripts
- Warp Terminal -- AI-assisted terminal with better formatting

---

## Step 1: Remove Prior Versions

If you have previous installations of Ensemble or its predecessors, remove them first.

### Check for Existing Installations

```bash
# List installed Claude plugins
claude plugins list

# Look for any of these:
# - ensemble-full
# - ai-mesh
# - claude-config
```

### Uninstall via Plugin Manager

```bash
claude plugin uninstall ensemble-full 2>/dev/null
claude plugin uninstall ai-mesh 2>/dev/null
claude plugin uninstall claude-config 2>/dev/null
```

### Manual Cleanup (if needed)

If plugins were installed manually or the uninstall commands don't work:

```bash
# Remove from user-level installation
rm -rf ~/.claude/plugins/cache/ensemble/
rm -rf ~/.claude/plugins/cache/ai-mesh/
rm -rf ~/.claude/plugins/cache/claude-config/

# Check for legacy direct installations
rm -rf ~/.claude/commands/ai-mesh/
rm -rf ~/.claude/agents/ai-mesh-*/
rm -rf ~/.claude/skills/ai-mesh/
```

---

## Step 2: Clone the Repository

```bash
# Choose a location (e.g., ~/dev or ~/utils)
cd ~/dev

# Clone the repository
git clone https://github.com/fortiumPartners/ensemble.git

# Enter the directory and install dependencies
cd ensemble
npm install
```

---

## Step 3: Register as Local Plugin Marketplace

Configure the cloned repository as a local plugin source:

```bash
# From within the ensemble directory
claude plugins add-marketplace ./
```

### Verify Marketplace Registration

```bash
claude plugins list-marketplaces
# You should see your local path listed
```

---

## Step 4: Install the Plugin

Install `ensemble-full` at user scope:

```bash
claude plugin install ensemble-full --scope user
```

### Scope Options

| Scope | Location | Use Case |
|-------|----------|----------|
| `user` | `~/.claude/plugins/` | **Recommended.** Available across all projects. |
| `project` | `./.claude/plugins/` | Per-project installation. |

The plugin doesn't impose requirements on projects that don't use it. If you don't invoke Ensemble commands in a project, they simply won't run.

### Verify Installation

```bash
# List installed plugins
claude plugins list
# Should show: ensemble-full (user) - vX.x.x

# Test a command
claude /help
# Ensemble commands should appear in the list
```

---

## Step 5: Initialize a Project

Open Claude Code in any project and run the initialization command:

```
/init-project
```

### What It Does

1. **Detects your technology stack** -- scans package.json, requirements.txt, Gemfile, etc.
2. **Creates governance files** -- `constitution.md` (project guardrails) and `stack.md` (detected technologies)
3. **Vendors the runtime** -- copies agents, commands, hooks, and skills into `.claude/`
4. **Sets up document structure** -- creates `docs/PRD/` and `docs/TRD/` directories
5. **Configures hooks** -- installs router, permitter, formatter, and lifecycle hooks

### Initialization Modes

```
/init-project           # Interactive mode with prompts
/init-project minimal   # Use detected defaults, minimal prompts
/init-project force     # Overwrite existing configuration
```

### What Gets Created

```
.claude/
  agents/              # 13 specialist subagents
  commands/            # Workflow commands (/create-prd, /implement-trd, etc.)
  hooks/               # Automated guardrails
  skills/              # Domain knowledge matched to your stack
  rules/
    constitution.md    # Project guardrails and quality gates
    stack.md           # Detected technology stack
    process.md         # Workflow documentation
  settings.json        # Hook configuration and permissions

docs/
  PRD/                 # Product Requirements Documents
  TRD/                 # Technical Requirements Documents

.trd-state/            # Implementation tracking (git-tracked)
```

All of this is committed to git, ensuring identical behavior across local CLI and Claude Code Web sessions.

---

## Step 6: Verify and Run

After initialization, verify the key components and run your first feature.

### Commands Available

```
# In Claude Code, type / to see available commands
# You should see:
/create-prd            /create-prd-team
/create-trd            /create-trd-team
/refine-prd            /refine-trd
/implement-trd         /implement-trd-team
/harden-trd-team       /verify-trd-team
/investigate-issue     /fix-issue
/fold-prompt           /update-project
/cleanup-project
```

### Running Implementation

We recommend running implementation passes with `--dangerously-skip-permissions` to allow uninterrupted autonomous execution:

```bash
claude --dangerously-skip-permissions
> /implement-trd-team
```

This skips all permission prompts, allowing the agent team to work autonomously through the full staged execution loop (implement, verify, debug, simplify, review) without pausing for approval. The permitter hook is bypassed in this mode.

See [Concepts: The Three-Pass Approach](./CONCEPTS.md#phase-3-implementation-the-three-pass-approach) for the recommended three-pass workflow.

### Hooks Active

Check `.claude/settings.json` to verify hooks are configured:

| Hook Event | Handler | Purpose |
|------------|---------|---------|
| `SessionStart` | `session-context.js` | Captures session identity for downstream tooling |
| `UserPromptSubmit` | `router.py` | Routes prompts to appropriate agents/skills |
| `PermissionRequest` | `permitter.js` | Validates permissions against allowlist |
| `PostToolUse` | `formatter.sh` | Auto-formats edited files |
| `SubagentStop` | `status.js` | Tracks implementation progress |
| `Stop` | `async-discipline.js` → `autonomy-discipline.js` → `wiggum.js` → `notify.sh` | Async/autonomy guards, session-end processing, notifications |
| `PreCompact` | `precompact.js` | Preserves state before context compaction |

---

## Updating Ensemble

To update to a newer version:

```bash
# Pull latest changes
cd ~/dev/ensemble
git pull

# Reinstall the plugin
claude plugin uninstall ensemble-full
claude plugin install ensemble-full --scope user
```

### Updating an Existing Project

After updating the plugin, update the vendored runtime in your project:

```
/rebase-project
```

This upgrades the vendored runtime while preserving your customizations to `constitution.md`, `stack.md`, and any custom agents or skills.

---

## Optional: MCP Server Configuration

MCP (Model Context Protocol) servers extend Claude Code with additional capabilities.

### Context7 (Documentation Retrieval)

Provides access to up-to-date library documentation.

**Global installation** (available across all projects):

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "context7": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}
```

### Playwright MCP (Browser Automation)

Enables Claude to control a browser for E2E test development.

**Project-level installation** (recommended):

Create or edit `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

### Enable Project MCP Servers

Create `.claude/settings.local.json` (gitignored):

```json
{
  "enableAllProjectMcpServers": true
}
```

Restart Claude Code after configuring MCP servers.

---

## Project-Specific Configuration

### CLAUDE.md

The `CLAUDE.md` file in your project root is automatically loaded by Claude Code at session start. Ensemble uses this as the project's operating manual:

- Architecture decisions and conventions
- File structure reference
- Testing patterns and commands
- Agent delegation preferences
- Key debugging notes

This file is updated by `/fold-prompt` at the end of each development session and by `/update-project` for manual learning capture.

### Constitution and Stack

| File | Purpose | Change Frequency |
|------|---------|-----------------|
| `.claude/rules/constitution.md` | Project absolutes and quality gates | Rare (requires confirmation) |
| `.claude/rules/stack.md` | Technology stack definition | Occasional (requires confirmation) |
| `CLAUDE.md` | Session knowledge and patterns | Frequent (automatic via fold) |

---

## Troubleshooting

### Plugin Not Found

```bash
# Ensure marketplace is registered
claude plugins list-marketplaces

# Re-add if missing
cd ~/dev/ensemble
claude plugins add-marketplace ./
```

### Commands Not Appearing

```bash
# Verify installation
claude plugins list

# Check plugin status
claude plugin info ensemble-full

# Restart Claude Code if commands were recently added
exit
claude
```

### Version Conflicts

```bash
# Full cleanup and reinstall
claude plugin uninstall ensemble-full
rm -rf ~/.claude/plugins/cache/ensemble/
cd ~/dev/ensemble && git pull
claude plugin install ensemble-full --scope user
```

### Hooks Not Firing

Check `.claude/settings.json` exists and contains the `hooks` configuration. Common issues:

| Problem | Solution |
|---------|----------|
| Router not triggering | Verify `router.py` is executable: `chmod +x .claude/hooks/router.py` |
| Formatter errors | Check that `prettier` or your formatter is installed |
| Permission hook blocking | Review `.claude/hooks/permitter/` allowlist configuration |
| Python not found | Ensure Python 3.x is on your PATH |

### Initialization Failures

| Problem | Solution |
|---------|----------|
| `/init-project` not recognized | Plugin not installed -- follow Steps 2-4 |
| "Permission denied" errors | Run `chmod +x .claude/hooks/*.sh .claude/hooks/*.py .claude/hooks/*.js` |
| Stack detection wrong | Edit `.claude/rules/stack.md` manually, then run `/update-project` |
| Existing `.claude/` conflict | Use `/init-project force` to overwrite, or manually merge |

### Context Issues

| Symptom | Solution |
|---------|----------|
| AI output becoming generic | Context is full. Run `/fold-prompt`, exit, restart |
| Agent forgetting earlier decisions | Write decisions into artifacts (PRD/TRD/CLAUDE.md), not just chat |
| Slow response times | Large context. Fold and restart |
| Commands behaving unexpectedly | Restart Claude Code for a fresh context |
