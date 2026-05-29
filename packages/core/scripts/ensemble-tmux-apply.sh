#!/usr/bin/env bash
#
# ensemble-tmux-apply.sh — apply ensemble tmux mitigations to a LIVE tmux server
#
# What it does (idempotent — safe to re-run):
#   1. Verifies tmux is running and reports current sessions/panes
#   2. Backs up ~/.tmux.conf to ~/.tmux.conf.ensemble-bak-<timestamp> (only if existing)
#   3. Idempotently appends an `# ENSEMBLE … END ENSEMBLE` block with the
#      focus-events / history-limit / aggressive-resize / mouse settings
#      (replaces the block if already present so re-runs update cleanly)
#   4. Reloads the config into ALL running sessions via `tmux source-file`
#      → NO restart needed; existing panes and Claude processes keep running
#   5. Verifies key settings took effect by re-reading them from tmux
#   6. Starts the heartbeat daemon in a NEW dedicated tmux window named
#      "ensemble-heartbeat" (or restarts it if already running)
#
# Safe to abort at any step — no destructive operations beyond the appended
# ~/.tmux.conf block (and that has a backup).

set -euo pipefail

CONF="${HOME}/.tmux.conf"
HEARTBEAT_SCRIPT="${HOME}/.local/bin/ensemble-claude-tmux-heartbeat.sh"
BACKUP="${CONF}.ensemble-bak-$(date +%Y%m%d-%H%M%S)"

c_grn() { printf '\033[32m%s\033[0m\n' "$*"; }
c_ylw() { printf '\033[33m%s\033[0m\n' "$*"; }
c_red() { printf '\033[31m%s\033[0m\n' "$*"; }
c_dim() { printf '\033[2m%s\033[0m\n' "$*"; }

# ============================================================================
# Step 1 — verify tmux is running, report state
# ============================================================================
echo "=== Step 1/6 — Verify tmux server + report sessions ==="
if ! command -v tmux >/dev/null 2>&1; then
    c_red "tmux not installed. Aborting."
    exit 1
fi
if ! tmux info >/dev/null 2>&1; then
    c_ylw "No running tmux server. The config will still be written; nothing to reload."
    LIVE_SERVER=false
else
    LIVE_SERVER=true
    SESSION_COUNT=$(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')
    PANE_COUNT=$(tmux list-panes -a 2>/dev/null | wc -l | tr -d ' ')
    CLAUDE_PANES=$(tmux list-panes -a -F '#{pane_current_command}' 2>/dev/null \
                    | awk '$1 ~ /claude|node/' | wc -l | tr -d ' ')
    c_grn "Live tmux server detected."
    echo "  Sessions: $SESSION_COUNT"
    echo "  Total panes: $PANE_COUNT"
    echo "  Panes running claude/node: $CLAUDE_PANES"
fi
echo

# ============================================================================
# Step 2 — backup existing ~/.tmux.conf
# ============================================================================
echo "=== Step 2/6 — Backup existing ~/.tmux.conf ==="
if [[ -f "$CONF" ]]; then
    cp "$CONF" "$BACKUP"
    c_grn "Backed up: $BACKUP"
else
    c_dim "No existing ~/.tmux.conf — creating fresh."
    touch "$CONF"
fi
echo

# ============================================================================
# Step 3 — idempotently apply the ensemble block
# ============================================================================
echo "=== Step 3/6 — Apply ensemble tmux settings ==="
BEGIN_MARKER="# >>> ENSEMBLE TMUX MITIGATIONS — managed by ensemble-tmux-apply.sh >>>"
END_MARKER="# <<< ENSEMBLE TMUX MITIGATIONS — END <<<"

BLOCK="$BEGIN_MARKER
# Generated $(date -Iseconds 2>/dev/null || date)
# Mitigations for Claude Code TTY-backpressure / unfocused-pane hangs.
# See: https://github.com/anthropics/claude-code/issues/57103
# Remove this block by deleting from the BEGIN to END marker.

# Propagate focus-in/out so streaming I/O stays reactive in unfocused panes
set -g focus-events on

# Massive scrollback — much higher per-pane buffer pressure before stall
set -g history-limit 1000000

# Don't pause output in panes whose window isn't active
setw -g aggressive-resize off

# Larger inter-process buffer cap inside the tmux server
set -g buffer-limit 100

# Mouse activity counts as a wake signal in some setups
set -g mouse on

# Don't suppress output on activity/bell monitoring — those can throttle panes
setw -g monitor-activity off
setw -g monitor-bell off

$END_MARKER"

# Remove old block if present (using awk for portability)
if grep -qF "$BEGIN_MARKER" "$CONF"; then
    awk -v b="$BEGIN_MARKER" -v e="$END_MARKER" '
        $0 == b { skip=1; next }
        $0 == e { skip=0; next }
        !skip
    ' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"
    c_dim "Removed old ENSEMBLE block (replacing with current version)"
fi

# Append the new block
{ echo; echo "$BLOCK"; } >> "$CONF"
c_grn "Applied ensemble tmux mitigations block to $CONF"
echo

# ============================================================================
# Step 4 — reload config into all live sessions (NO RESTART)
# ============================================================================
echo "=== Step 4/6 — Reload config into running sessions ==="
if [[ "$LIVE_SERVER" == "true" ]]; then
    if tmux source-file "$CONF" 2>&1; then
        c_grn "Reloaded $CONF into running tmux server."
        c_dim "All existing panes + Claude sessions continue uninterrupted."
    else
        c_red "tmux source-file failed (config syntax error?). Backup is at $BACKUP."
        exit 2
    fi
else
    c_dim "No live server; settings will apply on next 'tmux' startup."
fi
echo

# ============================================================================
# Step 5 — verify settings took effect
# ============================================================================
echo "=== Step 5/6 — Verify key settings ==="
if [[ "$LIVE_SERVER" == "true" ]]; then
    fe=$(tmux show-options -g focus-events 2>/dev/null | awk '{print $2}')
    hl=$(tmux show-options -g history-limit 2>/dev/null | awk '{print $2}')
    bl=$(tmux show-options -g buffer-limit 2>/dev/null | awk '{print $2}')
    ms=$(tmux show-options -g mouse 2>/dev/null | awk '{print $2}')
    printf '  %-22s = %s\n' "focus-events"  "${fe:-?}"
    printf '  %-22s = %s\n' "history-limit" "${hl:-?}"
    printf '  %-22s = %s\n' "buffer-limit"  "${bl:-?}"
    printf '  %-22s = %s\n' "mouse"         "${ms:-?}"
    if [[ "$fe" == "on" && "$hl" == "1000000" ]]; then
        c_grn "  ✓ Settings active in live server"
    else
        c_ylw "  Some settings didn't reflect — re-run or check ~/.tmux.conf"
    fi
fi
echo

# ============================================================================
# Step 6 — install + start the heartbeat daemon
# ============================================================================
echo "=== Step 6/6 — Install + start the Claude-pane heartbeat ==="
mkdir -p "$(dirname "$HEARTBEAT_SCRIPT")"

cat > "$HEARTBEAT_SCRIPT" <<'HEARTBEAT'
#!/usr/bin/env bash
# Periodically force-drain every tmux pane running `claude` (or `node`).
# Mitigates the Claude Code TTY-backpressure / unfocused-pane hang
# documented at https://github.com/anthropics/claude-code/issues/57103
#
# Run via: tmux new-window -n ensemble-heartbeat 'bash ~/.local/bin/ensemble-claude-tmux-heartbeat.sh'
INTERVAL="${ENSEMBLE_HEARTBEAT_INTERVAL:-60}"  # seconds; override via env
trap 'echo "[heartbeat] exiting"; exit 0' INT TERM
echo "[heartbeat] starting — interval=${INTERVAL}s"
while true; do
    drained=0
    while IFS= read -r line; do
        pane="${line%% *}"
        cmd="${line#* }"
        tmux pipe-pane -t "$pane" -O 'cat >/dev/null' 2>/dev/null || true
        sleep 0.1
        tmux pipe-pane -t "$pane" 2>/dev/null || true
        drained=$((drained + 1))
    done < <(tmux list-panes -a -F '#{pane_id} #{pane_current_command}' 2>/dev/null \
              | awk '$2 ~ /claude|node/')
    echo "[heartbeat $(date +%H:%M:%S)] drained $drained Claude/node pane(s)"
    sleep "$INTERVAL"
done
HEARTBEAT
chmod +x "$HEARTBEAT_SCRIPT"
c_grn "Installed: $HEARTBEAT_SCRIPT"

if [[ "$LIVE_SERVER" == "true" ]]; then
    # Kill any existing heartbeat window so re-runs don't stack
    EXISTING_WIN=$(tmux list-windows -a -F '#{session_name}:#{window_index} #{window_name}' 2>/dev/null \
                    | awk '$2 == "ensemble-heartbeat" {print $1}' | head -1 || true)
    if [[ -n "$EXISTING_WIN" ]]; then
        tmux kill-window -t "$EXISTING_WIN" 2>/dev/null || true
        c_dim "Killed previous heartbeat window: $EXISTING_WIN"
    fi

    # Pick a target session (first one) to host the heartbeat window
    FIRST_SESSION=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | head -1)
    if [[ -n "$FIRST_SESSION" ]]; then
        tmux new-window -d -t "${FIRST_SESSION}:" -n "ensemble-heartbeat" \
            "bash '$HEARTBEAT_SCRIPT'"
        c_grn "Started heartbeat in tmux: ${FIRST_SESSION}:ensemble-heartbeat"
        c_dim "  View with: tmux select-window -t ${FIRST_SESSION}:ensemble-heartbeat"
        c_dim "  Stop with: tmux kill-window  -t ${FIRST_SESSION}:ensemble-heartbeat"
    fi
else
    c_dim "No live server — start heartbeat manually with:"
    c_dim "  tmux new-window -n ensemble-heartbeat 'bash $HEARTBEAT_SCRIPT'"
fi
echo

c_grn "=== Done ==="
echo
echo "Summary:"
echo "  • Config:         $CONF (backup: $BACKUP)"
echo "  • Heartbeat:      $HEARTBEAT_SCRIPT (every ${ENSEMBLE_HEARTBEAT_INTERVAL:-60}s)"
echo "  • Tmux sessions:  ${SESSION_COUNT:-0} (untouched — no restart needed)"
echo "  • Claude panes:   ${CLAUDE_PANES:-0} (continuing in place)"
echo
echo "Revert anytime:"
echo "  cp '$BACKUP' '$CONF' && tmux source-file '$CONF'"
echo "  tmux kill-window -t '${FIRST_SESSION:-<session>}:ensemble-heartbeat'"
