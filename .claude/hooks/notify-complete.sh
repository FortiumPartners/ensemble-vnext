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

# ---------- Command-run state close (AJCS-B004) -------------------------------
#
# Write {"state":"none"} to the calling session's run-state file
# UNCONDITIONALLY — for "complete" and "stuck" alike — and BEFORE the
# NOTIFY_ON_COMPLETE early-exit below. router.py (AJCS-B003) is the other
# writer of this file: it records a run OPENING on a slash-command prompt;
# this is the CLOSING write, recorded on the command's completion turn. If
# this ran only after the early-exit, a user with no NOTIFY_ON_COMPLETE set
# would never get their run-state closed, and by D5/D12 an unclosed `active`
# marker is the one state that wrongly keeps the Stop judge's Judgment B
# suppressed. Format and location match router.py exactly:
# `.trd-state/_command-runs/<session-id>.json`, atomic temp-file + rename.
#
# Any failure here (missing dir, unwritable fs, bad session id) degrades to
# "no write happened" — the absent/stale marker then reads as `state=unknown`
# on the judge side (D5), which is the same fail-safe direction router.py
# uses. This function must NEVER change the script's exit status: that
# status is contractually the user's NOTIFY_ON_COMPLETE command's.
close_command_run_state() {
    local session_id="${CLAUDE_SESSION_ID:-unknown}"

    # "unknown" is not a real session id — it's the fallback used when
    # SessionStart never captured one. Writing "unknown.json" would let
    # unrelated concurrent sessions collide on a single shared file, so
    # write nothing instead (mirrors D5: an absent marker is safe).
    if [[ "$session_id" == "unknown" ]]; then
        debug "close_command_run_state: session id is 'unknown'; skipping write"
        return 0
    fi

    # Mirrors router.py's sanitize_session_id() — the session id becomes a
    # path component, so reject anything that isn't a safe one (OBJ-SEC1)
    # rather than let it reach the filesystem.
    if [[ ! "$session_id" =~ ^[A-Za-z0-9_.-]+$ ]]; then
        debug "close_command_run_state: session id fails safety pattern; skipping write"
        return 0
    fi

    local run_dir="${PWD}/.trd-state/_command-runs"
    local target_path="${run_dir}/${session_id}.json"

    mkdir -p "$run_dir" 2>/dev/null || {
        debug "close_command_run_state: could not create $run_dir"
        return 0
    }

    local tmp_path
    tmp_path="$(mktemp "${run_dir}/.tmp-XXXXXX" 2>/dev/null)" || {
        debug "close_command_run_state: mktemp failed in $run_dir"
        return 0
    }

    if printf '{"state":"none"}' > "$tmp_path" 2>/dev/null && \
       mv -f "$tmp_path" "$target_path" 2>/dev/null; then
        debug "close_command_run_state: wrote state=none to $target_path"
    else
        debug "close_command_run_state: write/rename failed for $target_path"
        rm -f "$tmp_path" 2>/dev/null
    fi

    return 0
}

close_command_run_state

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
