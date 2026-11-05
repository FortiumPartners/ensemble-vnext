# Stop Hook Notification Guide

## Overview

The Stop hook notification runs a shell command you configure every time a Claude Code session
goes idle (every **Stop** event: the end of each turn). It lets a parent process, a CI/CD
pipeline or a monitoring system know a session has stopped, without polling and without relying
on the model to report it.

### Which notification do you want?

Ensemble has three ways to tell you or another system that something finished. This guide
covers the third.

| You want | Use | Fires |
|---|---|---|
| A desktop alert when a long command (`/implement-trd`, `/audit-build`, `/plan --implement`) finishes or gets stuck | Nothing to set up: the command sends a push notification itself | Once, on the command's final turn |
| A webhook, queue or script triggered when a command **completes** | `NOTIFY_ON_COMPLETE` (see `.claude/rules/command-status.md`, "Path B") | Exactly once, on the turn that prints `COMMAND COMPLETE` or `COMMAND STUCK` |
| A signal **every time the session goes idle**, including turns that end while work is still running in the background | `NOTIFY_ON_STOP`, this guide | Every Stop |

If you only care about finished commands but want to use `NOTIFY_ON_STOP`, gate it on the
completion banner appearing in the transcript:

```bash
export NOTIFY_ON_STOP='grep -q "═══ COMMAND COMPLETE" "$NOTIFY_TRANSCRIPT_PATH" && printf "\a"'
```

**Use cases**:
- Coordinating parallel Claude Code sessions from an orchestrator
- Triggering CI/CD pipeline stages after a session completes
- Sending desktop or mobile notifications when long-running sessions finish
- Writing signal files for shell script workflows

---

## Quick Start

1. Make sure the project has the hook. Every project set up with `/init-project` has it,
   registered as the last `Stop` hook in `.claude/settings.json`, after the model-judged
   discipline check.

2. Add to your global Claude settings (`~/.claude/settings.json`):

```json
{
  "env": {
    "NOTIFY_ON_STOP": "touch /tmp/claude-session-done"
  }
}
```

3. Run a Claude Code session. When it stops, `/tmp/claude-session-done` will be created.

---

## How It Works

When a Claude Code session stops, a **Stop** event fires. The hook dispatcher runs `.claude/hooks/notify.sh`, which:

1. Reads JSON context from stdin (session ID, working directory, transcript path)
2. Exports session context as environment variables (`NOTIFY_SESSION_ID`, etc.)
3. Checks whether `NOTIFY_ON_STOP` is set
4. If set, executes the command with a 30-second timeout
5. If the command fails, falls back to `openclaw gateway wake`
6. Always returns `{"continue": true}` -- the hook never blocks session termination

### Split Configuration Model

The notification system separates **where the hook lives** from **what it does**:

| Component | Location | Who manages it |
|-----------|----------|----------------|
| Hook script (`notify.sh`) | Project `.claude/hooks/` | Shipped with Ensemble (per-project) |
| Hook registration | Project `.claude/settings.json` | Shipped with Ensemble (per-project) |
| `NOTIFY_ON_STOP` command | User global `~/.claude/settings.json` | User configures once for all projects |

This means the hook ships inactive. It silently exits until you set `NOTIFY_ON_STOP` in your global settings or environment.

---

## Installation

**In an Ensemble project there is nothing to install:** `/init-project` vendors `notify.sh` and
registers it, and `/rebase-project` keeps it current. The options below are for adding the hook
to a Claude Code project that does not use Ensemble.

### Option A: Using the Installer Script

The installer copies the hook into your project and registers it in settings.json.

```bash
# From the ensemble-vnext repository
./packages/core/scripts/install-notify-hook.sh /path/to/your/project

# Or install in the current directory
./packages/core/scripts/install-notify-hook.sh
```

The installer will:
- Copy `notify.sh` to `.claude/hooks/notify.sh`
- Register the hook in `.claude/settings.json` under `hooks.Stop`
- Optionally configure `NOTIFY_ON_STOP` in your global `~/.claude/settings.json`

**Prerequisite**: The target project must already have a `.claude/` directory. Run `claude init` first if needed.

### Option B: Manual Installation

1. Copy the hook script:

```bash
cp packages/core/hooks/notify.sh /path/to/project/.claude/hooks/notify.sh
chmod +x /path/to/project/.claude/hooks/notify.sh
```

2. Add the hook to `.claude/settings.json` in the `hooks.Stop` array:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/notify.sh",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```


---

## Configuration

### Global Settings (Recommended)

Configure `NOTIFY_ON_STOP` once in `~/.claude/settings.json` and it applies to all projects:

```json
{
  "env": {
    "NOTIFY_ON_STOP": "touch /tmp/claude-session-done"
  }
}
```

If the file does not exist yet, create it:

```bash
mkdir -p ~/.claude
echo '{ "env": { "NOTIFY_ON_STOP": "touch /tmp/claude-session-done" } }' \
  | jq . > ~/.claude/settings.json
```

### Per-Session Override

Export the variable before running Claude to override global settings for a single session:

```bash
export NOTIFY_ON_STOP="curl -s https://webhook.example.com/done"
claude --remote "Implement feature X"
```

This override takes precedence over the value in `~/.claude/settings.json`.

### Context Variables

The hook exports these environment variables before executing your command. Your `NOTIFY_ON_STOP` command can reference them using standard shell syntax:

| Variable | Description | Default |
|----------|-------------|---------|
| `NOTIFY_SESSION_ID` | Claude Code session identifier | `"unknown"` |
| `NOTIFY_CWD` | Working directory of the session | `"unknown"` |
| `NOTIFY_TRANSCRIPT_PATH` | Path to the session transcript file | `"unknown"` |

Example using context variables:

```json
{
  "env": {
    "NOTIFY_ON_STOP": "echo \"Session $NOTIFY_SESSION_ID completed in $NOTIFY_CWD\" >> /tmp/claude-sessions.log"
  }
}
```

---

## Common Patterns

### OpenClaw Gateway Notification

```json
{
  "env": {
    "NOTIFY_ON_STOP": "openclaw gateway wake --session-id \"$NOTIFY_SESSION_ID\" --mode now"
  }
}
```

For more control, use a wrapper script (see [Writing a Custom Notification Script](#writing-a-custom-notification-script)).

### tmux Notification to Orchestrator Pane

Send a keystroke to a named tmux pane so the orchestrator knows the session is done:

```json
{
  "env": {
    "NOTIFY_ON_STOP": "tmux send-keys -t orchestrator 'echo Session complete' Enter"
  }
}
```

### Webhook / curl Notification

Post to a webhook endpoint:

```json
{
  "env": {
    "NOTIFY_ON_STOP": "curl -s -X POST https://webhook.example.com/session-complete -H 'Content-Type: application/json' -d '{\"session_id\": \"'\"$NOTIFY_SESSION_ID\"'\"}'"
  }
}
```

### File-Based Signal

Create a file that a shell script or watcher can detect:

```json
{
  "env": {
    "NOTIFY_ON_STOP": "touch /tmp/session-complete-signal"
  }
}
```

Or write session details into the file:

```json
{
  "env": {
    "NOTIFY_ON_STOP": "echo \"$NOTIFY_SESSION_ID\" > /tmp/claude-done-latest"
  }
}
```

### Desktop Notification (macOS)

```json
{
  "env": {
    "NOTIFY_ON_STOP": "osascript -e 'display notification \"Session completed\" with title \"Claude Code\"'"
  }
}
```

### Logging to File

Append a timestamped entry to a log file:

```json
{
  "env": {
    "NOTIFY_ON_STOP": "echo \"[$(date -Iseconds)] Session ${NOTIFY_SESSION_ID} completed in ${NOTIFY_CWD}\" >> /tmp/claude-sessions.log"
  }
}
```

### Chaining Multiple Commands

Run several commands in sequence:

```json
{
  "env": {
    "NOTIFY_ON_STOP": "touch /tmp/done && curl -s https://api.example.com/notify"
  }
}
```

---

## Writing a Custom Notification Script

For complex notification logic, write a wrapper script and point `NOTIFY_ON_STOP` to it. This is cleaner than embedding long commands in JSON.

1. Copy the template to a permanent location:

```bash
cp packages/core/scripts/openclaw-notify.sh.template ~/.local/bin/claude-notify.sh
chmod +x ~/.local/bin/claude-notify.sh
```

2. Edit `~/.local/bin/claude-notify.sh` to suit your needs:

```bash
#!/bin/bash
#
# claude-notify.sh - Custom notification on session completion
#

# Log the event
echo "[$(date -Iseconds)] Session ${NOTIFY_SESSION_ID:-unknown} completed in ${NOTIFY_CWD:-unknown}" \
  >> /tmp/claude-sessions.log

# Send a webhook with session details
curl -s -X POST "https://your-webhook.example.com/session-complete" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"${NOTIFY_SESSION_ID}\", \"cwd\": \"${NOTIFY_CWD}\"}"

# Desktop notification (macOS)
osascript -e "display notification \"Session completed in ${NOTIFY_CWD}\" with title \"Claude Code\"" 2>/dev/null
```

3. Configure `NOTIFY_ON_STOP` to run your script:

```json
{
  "env": {
    "NOTIFY_ON_STOP": "$HOME/.local/bin/claude-notify.sh"
  }
}
```

The template at `packages/core/scripts/openclaw-notify.sh.template` includes additional examples for OpenClaw, tmux, signal files, and Linux desktop notifications.

---

## Debug Mode

### Enabling Debug Output

Set `NOTIFY_HOOK_DEBUG=1` to see detailed execution logs on stderr:

```json
{
  "env": {
    "NOTIFY_ON_STOP": "touch /tmp/done",
    "NOTIFY_HOOK_DEBUG": "1"
  }
}
```

Or for a single session:

```bash
export NOTIFY_HOOK_DEBUG=1
export NOTIFY_ON_STOP="touch /tmp/done"
claude
```

### What Debug Output Looks Like

```
[NOTIFY 2026-02-03T14:30:00+00:00] Received input: {"cwd": "/home/user/project", "session_id": "abc12...
[NOTIFY 2026-02-03T14:30:00+00:00] Exported context: SESSION_ID=abc123-def456-ghi7..., CWD=/home/user/project
[NOTIFY 2026-02-03T14:30:00+00:00] NOTIFY_ON_STOP is set (value masked for security)
[NOTIFY 2026-02-03T14:30:00+00:00] Executing notification command
[NOTIFY 2026-02-03T14:30:00+00:00] Notification command succeeded
```

### Manual Testing

You can test the hook directly without running a full Claude Code session:

```bash
export NOTIFY_HOOK_DEBUG=1
export NOTIFY_ON_STOP="echo 'Test notification'"
echo '{"cwd": "/tmp", "session_id": "test-123"}' | .claude/hooks/notify.sh
```

### Security Note

Debug mode logs metadata about the hook execution to stderr. The `NOTIFY_ON_STOP` value itself is masked, but command output (first 200 characters) is logged on failure. Do not use debug mode in production if your notification command outputs sensitive data (tokens, keys, etc.).

---

## Troubleshooting

### Hook Not Firing

**Symptom**: No notification when session ends.

**Check**:
1. Verify the hook is registered in `.claude/settings.json`:
   ```bash
   jq '.hooks.Stop' .claude/settings.json
   ```
   You should see an entry with `"command": ".claude/hooks/notify.sh"`.

2. Verify the hook file exists and is executable:
   ```bash
   ls -la .claude/hooks/notify.sh
   ```

3. Confirm the hook is not disabled:
   ```bash
   echo $NOTIFY_HOOK_DISABLE
   ```
   If this returns `1`, the hook is disabled. Unset it: `unset NOTIFY_HOOK_DISABLE`.

### Command Not Executing

**Symptom**: Hook fires but your command does not run.

**Check**:
1. Verify `NOTIFY_ON_STOP` is set:
   ```bash
   echo $NOTIFY_ON_STOP
   ```

2. Check that the value is not empty or whitespace-only. The hook treats these as "not configured" and exits silently.

3. Enable debug mode to confirm the hook sees your variable:
   ```bash
   export NOTIFY_HOOK_DEBUG=1
   ```

4. If using `~/.claude/settings.json`, verify the env section:
   ```bash
   jq '.env.NOTIFY_ON_STOP' ~/.claude/settings.json
   ```

### Timeout Issues

**Symptom**: Notification takes too long or appears to hang.

**Details**:
- Individual command timeout: **30 seconds**
- Fallback command timeout: **30 seconds**
- Total hook timeout (in settings.json): **60 seconds**

If your command needs more than 30 seconds, consider running it in the background within your script:

```bash
# In your notification script
nohup long-running-command &>/dev/null &
```

### Fallback Firing Unexpectedly

**Symptom**: You see `openclaw gateway wake` messages even though your command should work.

This means your primary command is exiting with a non-zero exit code. Enable debug mode to see the exit code and output:

```bash
export NOTIFY_HOOK_DEBUG=1
```

Test your command independently:

```bash
/bin/sh -c "your-notify-command-here"
echo $?   # Should be 0
```

### Disabling the Hook Temporarily

Set `NOTIFY_HOOK_DISABLE=1` to disable the hook without removing it:

```bash
export NOTIFY_HOOK_DISABLE=1
claude
```

Or in `~/.claude/settings.json`:

```json
{
  "env": {
    "NOTIFY_HOOK_DISABLE": "1"
  }
}
```

---

## Environment Variables Reference

### Input Variables (Set by User)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NOTIFY_ON_STOP` | No | (unset) | Shell command to execute when session stops. If unset, empty, or whitespace-only, the hook exits silently. |
| `NOTIFY_HOOK_DEBUG` | No | `"0"` | Set to `"1"` to enable debug logging to stderr. |
| `NOTIFY_HOOK_DISABLE` | No | `"0"` | Set to `"1"` to disable the hook entirely. |

### Output Variables (Exported to Command)

These are exported by the hook before executing `NOTIFY_ON_STOP`. Your command can reference them.

| Variable | Description | Default |
|----------|-------------|---------|
| `NOTIFY_SESSION_ID` | Session ID from the Stop event | `"unknown"` |
| `NOTIFY_CWD` | Working directory of the session | `"unknown"` |
| `NOTIFY_TRANSCRIPT_PATH` | Path to the session transcript JSONL file | `"unknown"` |

---

## Related Files

| File | Description |
|------|-------------|
| `.claude/hooks/notify.sh` | The hook script (vendored in project) |
| `.claude/settings.json` | Hook registration (project-level) |
| `~/.claude/settings.json` | `NOTIFY_ON_STOP` configuration (user-level) |
| `packages/core/hooks/notify.sh` | Source hook in ensemble-vnext |
| `packages/core/hooks/notify.test.sh` | BATS unit tests |
| `packages/core/scripts/install-notify-hook.sh` | Installer script |
| `packages/core/scripts/openclaw-notify.sh.template` | Wrapper script template |
| `test/integration/hooks/notify-hook.test.sh` | Integration tests |
