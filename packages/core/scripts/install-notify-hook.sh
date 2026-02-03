#!/usr/bin/env bash
#
# install-notify-hook.sh - Install the notify hook into a Claude Code project
#
# Installs the stop hook that optionally notifies on session completion.
# This enables orchestration patterns where external systems need to know
# when a Claude Code session has finished.
#
# =============================================================================
# USAGE
# =============================================================================
#
#   ./install-notify-hook.sh [target_directory]
#
#   target_directory  - Path to the project (defaults to current directory)
#
# Examples:
#   ./install-notify-hook.sh                    # Install in current directory
#   ./install-notify-hook.sh /path/to/project   # Install in specified project
#   ./install-notify-hook.sh ~/my-project       # Install in home directory project
#
# =============================================================================
# REQUIREMENTS
# =============================================================================
#
#   - Target directory must contain a .claude/ directory
#   - Requires read access to ensemble-vnext package source
#   - Optionally configures user's global Claude settings
#
# =============================================================================
# WHAT IT DOES
# =============================================================================
#
#   1. Verifies target has .claude/ directory (exits with error if not)
#   2. Creates .claude/hooks/ directory if it doesn't exist
#   3. Copies notify.sh from ensemble to target .claude/hooks/
#   4. Updates target .claude/settings.json to register the hook in Stop array
#   5. Offers to configure user's global ~/.claude/settings.json with NOTIFY_ON_STOP
#   6. Makes the copied hook executable
#

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

# Determine script location to find source hook
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The source hook is in the parent package at packages/core/hooks/notify.sh
# or in the vendored location at .claude/hooks/notify.sh
SOURCE_HOOK_CANDIDATES=(
    "${SCRIPT_DIR}/../hooks/notify.sh"
    "${SCRIPT_DIR}/../../full/hooks/notify.sh"
    "${SCRIPT_DIR}/../../../.claude/hooks/notify.sh"
)

# Hook registration entry for settings.json
HOOK_ENTRY='{
        "type": "command",
        "command": ".claude/hooks/notify.sh",
        "timeout": 60
      }'

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1" >&2
}

log_success() {
    echo "[SUCCESS] $1"
}

#######################################
# Find the source hook file
# Searches known locations for notify.sh
# Arguments:
#   None
# Outputs:
#   Writes path to source hook on stdout
# Returns:
#   0 if found, 1 if not found
#######################################
find_source_hook() {
    for candidate in "${SOURCE_HOOK_CANDIDATES[@]}"; do
        if [[ -f "$candidate" ]]; then
            echo "$(cd "$(dirname "$candidate")" && pwd)/$(basename "$candidate")"
            return 0
        fi
    done
    return 1
}

#######################################
# Check if a JSON array contains a specific command
# Arguments:
#   $1 - JSON file path
#   $2 - Hook type (e.g., "Stop")
#   $3 - Command to check for
# Returns:
#   0 if command found, 1 if not found
#######################################
hook_already_registered() {
    local settings_file="$1"
    local hook_type="$2"
    local command="$3"

    if ! command -v jq &>/dev/null; then
        # Without jq, use grep as fallback
        grep -q "\"command\"[[:space:]]*:[[:space:]]*\"${command}\"" "$settings_file" 2>/dev/null
        return $?
    fi

    jq -e ".hooks.${hook_type}[]? | select(.command == \"${command}\")" "$settings_file" >/dev/null 2>&1
}

#######################################
# Add a hook to the Stop array in settings.json
# Creates the hooks.Stop array if it doesn't exist
# Arguments:
#   $1 - Path to settings.json
# Returns:
#   0 on success, 1 on failure
#######################################
add_hook_to_settings() {
    local settings_file="$1"
    local temp_file

    if ! command -v jq &>/dev/null; then
        log_error "jq is required to update settings.json. Please install jq."
        log_info "On macOS: brew install jq"
        log_info "On Ubuntu: apt-get install jq"
        return 1
    fi

    temp_file=$(mktemp)

    # Add hook to Stop array, creating the structure if needed
    jq --argjson hook "$HOOK_ENTRY" '
        .hooks = (.hooks // {}) |
        .hooks.Stop = ((.hooks.Stop // []) + [$hook])
    ' "$settings_file" > "$temp_file"

    if [[ $? -eq 0 && -s "$temp_file" ]]; then
        mv "$temp_file" "$settings_file"
        return 0
    else
        rm -f "$temp_file"
        return 1
    fi
}

#######################################
# Prompt user for yes/no input
# Arguments:
#   $1 - Prompt message
# Returns:
#   0 for yes, 1 for no
#######################################
prompt_yes_no() {
    local prompt="$1"
    local response

    # Check if we're in a terminal
    if [[ ! -t 0 ]]; then
        log_info "Not running interactively, skipping prompt: $prompt"
        return 1
    fi

    while true; do
        read -r -p "$prompt [y/N]: " response
        case "${response,,}" in
            y|yes)
                return 0
                ;;
            n|no|"")
                return 1
                ;;
            *)
                echo "Please answer y or n."
                ;;
        esac
    done
}

#######################################
# Configure global NOTIFY_ON_STOP in user settings
# Prompts user and adds env configuration to ~/.claude/settings.json
# Arguments:
#   None
# Returns:
#   0 on success or skip, 1 on failure
#######################################
configure_global_notify() {
    local global_settings="$HOME/.claude/settings.json"

    if ! prompt_yes_no "Configure NOTIFY_ON_STOP in your global Claude settings?"; then
        log_info "Skipping global configuration."
        return 0
    fi

    # Create ~/.claude if it doesn't exist
    if [[ ! -d "$HOME/.claude" ]]; then
        mkdir -p "$HOME/.claude"
        log_info "Created $HOME/.claude directory"
    fi

    # Create settings.json if it doesn't exist
    if [[ ! -f "$global_settings" ]]; then
        echo '{}' > "$global_settings"
        log_info "Created $global_settings"
    fi

    echo ""
    echo "Enter the command to run when a session stops."
    echo "This command will have access to these environment variables:"
    echo "  - NOTIFY_SESSION_ID: The session ID"
    echo "  - NOTIFY_CWD: The working directory"
    echo "  - NOTIFY_TRANSCRIPT_PATH: Path to the session transcript"
    echo ""
    echo "Example commands:"
    echo "  touch /tmp/session-done"
    echo '  echo "Session $NOTIFY_SESSION_ID completed" >> /tmp/claude-sessions.log'
    echo "  openclaw gateway wake --session-id \"\$NOTIFY_SESSION_ID\" --mode now"
    echo ""

    read -r -p "NOTIFY_ON_STOP command (or press Enter to skip): " notify_command

    if [[ -z "$notify_command" ]]; then
        log_info "No command entered, skipping."
        return 0
    fi

    if ! command -v jq &>/dev/null; then
        log_error "jq is required to update settings.json. Please install jq."
        log_info "You can manually add to ~/.claude/settings.json:"
        log_info '  "env": { "NOTIFY_ON_STOP": "your-command" }'
        return 1
    fi

    local temp_file
    temp_file=$(mktemp)

    # Add NOTIFY_ON_STOP to env section
    jq --arg cmd "$notify_command" '
        .env = (.env // {}) |
        .env.NOTIFY_ON_STOP = $cmd
    ' "$global_settings" > "$temp_file"

    if [[ $? -eq 0 && -s "$temp_file" ]]; then
        mv "$temp_file" "$global_settings"
        log_success "Added NOTIFY_ON_STOP to $global_settings"
        return 0
    else
        rm -f "$temp_file"
        log_error "Failed to update $global_settings"
        return 1
    fi
}

# =============================================================================
# Main Installation Logic
# =============================================================================

main() {
    local target_dir="${1:-.}"

    # Resolve to absolute path
    target_dir="$(cd "$target_dir" 2>/dev/null && pwd)" || {
        log_error "Target directory does not exist: $1"
        exit 1
    }

    log_info "Installing notify hook to: $target_dir"

    # 1. Verify target has .claude/ directory
    if [[ ! -d "$target_dir/.claude" ]]; then
        log_error "Target directory does not have a .claude/ directory."
        log_error "This script is intended for existing Claude Code projects."
        log_error "Run 'claude init' or '/init-project' first to set up the project."
        exit 1
    fi

    # 2. Find source hook
    local source_hook
    if ! source_hook=$(find_source_hook); then
        log_error "Could not find source notify.sh hook."
        log_error "Searched in:"
        for candidate in "${SOURCE_HOOK_CANDIDATES[@]}"; do
            log_error "  - $candidate"
        done
        exit 1
    fi
    log_info "Found source hook: $source_hook"

    # 3. Create .claude/hooks/ if needed
    local hooks_dir="$target_dir/.claude/hooks"
    if [[ ! -d "$hooks_dir" ]]; then
        mkdir -p "$hooks_dir"
        log_info "Created $hooks_dir"
    fi

    # 4. Copy notify.sh to target
    local target_hook="$hooks_dir/notify.sh"
    cp "$source_hook" "$target_hook"
    chmod +x "$target_hook"
    log_success "Installed $target_hook"

    # 5. Update target settings.json
    local settings_file="$target_dir/.claude/settings.json"
    if [[ ! -f "$settings_file" ]]; then
        log_error "No settings.json found at $settings_file"
        log_info "Please create the file or run 'claude init' first."
        exit 1
    fi

    if hook_already_registered "$settings_file" "Stop" ".claude/hooks/notify.sh"; then
        log_info "Hook already registered in settings.json"
    else
        if add_hook_to_settings "$settings_file"; then
            log_success "Registered hook in $settings_file"
        else
            log_error "Failed to register hook in settings.json"
            log_info "Please manually add to .claude/settings.json hooks.Stop array:"
            echo "$HOOK_ENTRY"
            exit 1
        fi
    fi

    # 6. Offer to configure global NOTIFY_ON_STOP
    echo ""
    configure_global_notify

    echo ""
    log_success "Notify hook installation complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Set NOTIFY_ON_STOP environment variable before running claude"
    echo "     export NOTIFY_ON_STOP='your-notification-command'"
    echo ""
    echo "  2. Or configure it in your shell profile (~/.bashrc or ~/.zshrc):"
    echo "     export NOTIFY_ON_STOP='touch /tmp/claude-session-done'"
    echo ""
    echo "  3. Or use the global settings (already configured if you chose yes above)"
    echo ""
    echo "Available context variables in your notification command:"
    echo "  - \$NOTIFY_SESSION_ID: The session ID"
    echo "  - \$NOTIFY_CWD: The working directory"
    echo "  - \$NOTIFY_TRANSCRIPT_PATH: Path to the session transcript"
}

# Run main with all arguments
main "$@"
