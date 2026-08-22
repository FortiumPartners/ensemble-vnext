#!/usr/bin/env bash
#
# notify-complete.sh — Programmatic completion notification dispatcher
#
# Invoked by every workflow command on its FINAL turn (the turn that emits the
# COMMAND COMPLETE banner) to deliver a programmatic completion signal to the
# user's $NOTIFY_ON_COMPLETE shell command. Discovers session identity from
# the environment + working tree, exports it, then dispatches.
#
# NOT a Claude Code hook in the hook-event sense — this is a utility script
# that lives alongside notify.sh and is called explicitly by commands. It's
# placed in the hooks/ directory only because the existing scaffold + rebase
# machinery already vendors *.sh files from that directory; conceptually it
# belongs alongside the Stop-hook notify.sh as a sibling notification path
# (NOTIFY_ON_COMPLETE = atomic-with-COMMAND-COMPLETE; NOTIFY_ON_STOP = per-Stop).
#
# Usage:
#   .claude/hooks/notify-complete.sh <cmd-name> <status> <summary>
#
# Args:
#   $1  cmd-name  — the slash command without leading slash (e.g. verify-build)
#   $2  status    — "complete" or "stuck"
#   $3  summary   — one-line human-readable summary (under 200 chars recommended)
#
# Environment vars EXPORTED to the user's NOTIFY_ON_COMPLETE command:
#   NOTIFY_CMD            — $1
#   NOTIFY_STATUS         — $2
#   NOTIFY_SUMMARY        — $3
#   NOTIFY_PROJECT        — basename of $PWD (project directory name)
#   NOTIFY_CWD            — full $PWD
#   NOTIFY_BRANCH         — current git branch (empty if no git / detached)
#   NOTIFY_FEATURE        — feature name from .trd-state/current.json (basename of TRD, empty if none)
#   NOTIFY_SESSION_ID     — Claude Code session ID (from CLAUDE_SESSION_ID set by SessionStart hook;
#                           "unknown" if SessionStart didn't capture it)
#   NOTIFY_TMUX_SESSION   — tmux session name from `tmux display-message -p '#S'` (empty if not in tmux)
#   NOTIFY_TMUX_PANE      — tmux pane id from $TMUX_PANE (e.g. %0; empty if not in tmux)
#
# Behavior:
#   - If $NOTIFY_ON_COMPLETE is unset/empty: silent no-op, exit 0.
#   - Otherwise: discover identity, export all NOTIFY_* vars, invoke
#     `/bin/sh -c "$NOTIFY_ON_COMPLETE"` and exit with that command's status.
#   - Discovery failures (no git, no .trd-state, no tmux, no jq) fall back to
#     empty strings — never block the dispatch.
#   - Discovery is best-effort; do not time out the user's command from here
#     (the user owns its own timeout discipline).
#
# Override:
#   ENSEMBLE_NOTIFY_COMPLETE_DEBUG=1  — emit diagnostic lines to stderr
#

set -uo pipefail

debug() {
    [[ "${ENSEMBLE_NOTIFY_COMPLETE_DEBUG:-0}" == "1" ]] && \
        echo "[notify-complete $(date -Iseconds 2>/dev/null || date +%FT%T)] $*" >&2 || true
}

if [[ $# -lt 3 ]]; then
    debug "usage: $0 <cmd> <status> <summary> (got $# args)"
    exit 64  # EX_USAGE
fi

cmd="$1"
status="$2"
summary="$3"

# Silent no-op if env var is unset/empty (the common case)
if [[ -z "${NOTIFY_ON_COMPLETE:-}" ]]; then
    debug "NOTIFY_ON_COMPLETE unset; silent no-op"
    exit 0
fi

# ---------- Discovery (all best-effort; failures → empty strings) ------------

export NOTIFY_CMD="$cmd"
export NOTIFY_STATUS="$status"
export NOTIFY_SUMMARY="$summary"

export NOTIFY_CWD="$PWD"
export NOTIFY_PROJECT="$(basename "$PWD" 2>/dev/null || echo '')"

# Git branch (current); empty if not a repo or in detached HEAD
NOTIFY_BRANCH=""
if command -v git >/dev/null 2>&1; then
    NOTIFY_BRANCH="$(git branch --show-current 2>/dev/null || true)"
fi
export NOTIFY_BRANCH

# In-flight feature from .trd-state/current.json (basename of TRD path)
NOTIFY_FEATURE=""
if [[ -f ".trd-state/current.json" ]]; then
    if command -v jq >/dev/null 2>&1; then
        trd_path="$(jq -r '.trd // empty' .trd-state/current.json 2>/dev/null || true)"
        if [[ -n "$trd_path" ]]; then
            NOTIFY_FEATURE="$(basename "$trd_path" .md 2>/dev/null || true)"
        fi
    else
        # jq-less fallback: grep the trd field
        trd_path="$(grep -oE '"trd"[[:space:]]*:[[:space:]]*"[^"]*"' .trd-state/current.json 2>/dev/null \
                    | sed -E 's/.*"([^"]*)"$/\1/' | head -1 || true)"
        [[ -n "$trd_path" ]] && NOTIFY_FEATURE="$(basename "$trd_path" .md 2>/dev/null || true)"
    fi
fi
export NOTIFY_FEATURE

# Claude Code session ID (captured by session-context.js into CLAUDE_ENV_FILE on SessionStart)
export NOTIFY_SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"

# tmux identity (empty if not running inside tmux)
NOTIFY_TMUX_SESSION=""
NOTIFY_TMUX_PANE="${TMUX_PANE:-}"
if [[ -n "${TMUX:-}" ]] && command -v tmux >/dev/null 2>&1; then
    NOTIFY_TMUX_SESSION="$(tmux display-message -p '#S' 2>/dev/null || true)"
fi
export NOTIFY_TMUX_SESSION
export NOTIFY_TMUX_PANE

debug "dispatching: cmd=$NOTIFY_CMD status=$NOTIFY_STATUS project=$NOTIFY_PROJECT branch=$NOTIFY_BRANCH feature=$NOTIFY_FEATURE session=$NOTIFY_SESSION_ID tmux=$NOTIFY_TMUX_SESSION/$NOTIFY_TMUX_PANE"

# ---------- Dispatch ----------------------------------------------------------

# Run the user's command. We do NOT impose a timeout — the user's command owns
# its own timeout discipline. Exit with the user command's status so callers
# can detect failure if they care.
/bin/sh -c "$NOTIFY_ON_COMPLETE"
exit $?
