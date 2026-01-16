# Claude Session Logs

This directory stores session logs captured by the `save-remote-logs` SessionEnd hook.

## Purpose

The `save-remote-logs` hook automatically captures and commits session logs (including all subagent logs) when `ENSEMBLE_SAVE_REMOTE_LOGS=1` is set. This works for both local and remote sessions:

- **Remote sessions** (`--remote`): Preserves logs before the VM terminates
- **Local sessions**: Archives transcripts for later analysis
- **Eval testing**: Captures all session data for post-run evaluation

## How It Works

1. Set `ENSEMBLE_SAVE_REMOTE_LOGS=1` environment variable (configured in `test/.env`)
2. Run a Claude session with `--remote`
3. At session end, the hook:
   - Finds all session logs created during the session (including subagent logs)
   - Copies them to `.claude-sessions/logs/`
   - Git adds and commits them

## Directory Structure

```
.claude-sessions/
├── README.md           # This file
└── logs/               # Captured session logs
    ├── .gitkeep
    └── <session-id>.jsonl  # Individual session logs
```

## Log Format

Each `.jsonl` file contains the session transcript in JSON Lines format, with entries for:
- User prompts
- Assistant responses
- Tool invocations and results
- Thinking blocks (if extended thinking enabled)
- Telemetry events (if `CLAUDE_CODE_ENABLE_TELEMETRY=1`)

## Configuration

Environment variables (set in `test/.env` or exported):

| Variable | Description | Default |
|----------|-------------|---------|
| `ENSEMBLE_SAVE_REMOTE_LOGS` | Enable log capture (`1` to enable) | - |
| `ENSEMBLE_LOGS_DEST` | Custom destination path | `.claude-sessions/logs` |
| `DEBUG_SAVE_LOGS` | Enable debug output (`1` to enable) | - |
