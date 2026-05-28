#!/usr/bin/env bash
#
# scaffold-project.sh - Create directory structure for Ensemble vNext
#
# Creates the vendored runtime directory structure for AI-augmented development.
# This script is extracted from init-project.md Step 3.
#
# Usage:
#   ./scaffold-project.sh [--plugin-dir DIR] [--copy-skills] [--force] [project-directory]
#
# Options:
#   --plugin-dir DIR   Plugin directory containing agents, skills, hooks
#   --copy-skills      Copy skills listed in .claude/selected-skills.txt
#   --force            Overwrite existing files (for "Replace All" scenarios)
#
# If project-directory is not provided, uses current directory.
#
# TRD Reference: TRD-TEST-016
#

set -euo pipefail

# Script directory (for finding templates)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="${SCRIPT_DIR}/../templates"

# Default values
PLUGIN_DIR=""
COPY_SKILLS=false
FORCE=false
PROJECT_DIR=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --plugin-dir)
            PLUGIN_DIR="$2"
            shift 2
            ;;
        --copy-skills)
            COPY_SKILLS=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        -*)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
        *)
            if [[ -z "$PROJECT_DIR" ]]; then
                PROJECT_DIR="$1"
            fi
            shift
            ;;
    esac
done

# Default project directory to current directory if not specified
PROJECT_DIR="${PROJECT_DIR:-.}"

# Colors for output (disabled if not a terminal)
if [[ -t 1 ]]; then
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    RED='\033[0;31m'
    NC='\033[0m'
else
    GREEN=''
    YELLOW=''
    RED=''
    NC=''
fi

# Output functions
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Create directory if it doesn't exist
create_dir() {
    local dir="$1"
    if [[ -d "$dir" ]]; then
        info "Directory exists: $dir"
    else
        mkdir -p "$dir"
        info "Created: $dir"
    fi
}

# Copy template file (overwrites if --force)
copy_template() {
    local template="$1"
    local dest="$2"
    local template_path="${TEMPLATES_DIR}/${template}"

    if [[ -f "$dest" && "$FORCE" != "true" ]]; then
        info "File exists: $dest"
    elif [[ -f "$template_path" ]]; then
        cp "$template_path" "$dest"
        if [[ "$FORCE" == "true" ]]; then
            info "Replaced from template: $dest"
        else
            info "Created from template: $dest"
        fi
    else
        warn "Template not found: $template_path"
    fi
}

# Copy agents from plugin directory
copy_agents() {
    local src="$PLUGIN_DIR/agents"
    local dest="$1/.claude/agents"

    if [[ -z "$PLUGIN_DIR" ]]; then
        warn "No plugin directory specified, skipping agents"
        return 0
    fi

    if [[ ! -d "$src" ]]; then
        warn "Agents directory not found: $src"
        return 0
    fi

    local count=0
    for agent in "$src"/*.md; do
        [[ -f "$agent" ]] || continue
        local basename
        basename="$(basename "$agent")"
        if [[ -f "$dest/$basename" && "$FORCE" != "true" ]]; then
            info "Agent exists: $basename"
        else
            cp "$agent" "$dest/"
            if [[ "$FORCE" == "true" && -f "$dest/$basename" ]]; then
                info "Replaced agent: $basename"
            else
                info "Copied agent: $basename"
            fi
            ((count++)) || true
        fi
    done
    info "Copied $count agents"
}

# Copy workflow commands from plugin directory
copy_commands() {
    local dest="$1/.claude/commands"

    if [[ -z "$PLUGIN_DIR" ]]; then
        warn "No plugin directory specified, skipping commands"
        return 0
    fi

    # Try plugin cache structure first, then monorepo structure
    local src=""
    if [[ -d "$PLUGIN_DIR/commands/core" ]]; then
        src="$PLUGIN_DIR/commands/core"
    elif [[ -d "$PLUGIN_DIR/../core/commands" ]]; then
        src="$PLUGIN_DIR/../core/commands"
    fi

    if [[ -z "$src" || ! -d "$src" ]]; then
        warn "Commands directory not found (tried plugin cache and monorepo paths)"
        return 0
    fi

    info "Commands source: $src"

    # Plugin-only commands that should NOT be vendored into projects
    local exclude_commands=(
        "init-project.md"
        "rebase-project.md"
    )

    # Dynamically discover all .md commands in plugin source
    local count=0
    for cmd_path in "$src"/*.md; do
        [[ -f "$cmd_path" ]] || continue
        local cmd
        cmd="$(basename "$cmd_path")"

        # Skip excluded plugin-only commands
        local excluded=false
        for excl in "${exclude_commands[@]}"; do
            if [[ "$cmd" == "$excl" ]]; then
                excluded=true
                break
            fi
        done
        if [[ "$excluded" == "true" ]]; then
            info "Skipped plugin-only command: $cmd"
            continue
        fi

        if [[ -f "$dest/$cmd" && "$FORCE" != "true" ]]; then
            info "Command exists: $cmd"
        else
            cp "$cmd_path" "$dest/"
            if [[ "$FORCE" == "true" ]]; then
                info "Replaced command: $cmd"
            else
                info "Copied command: $cmd"
            fi
            ((count++)) || true
        fi
    done
    info "Copied $count commands"
}

# Copy global router rules to vendored lib directory
# Ensure all hook files have executable permissions
ensure_hooks_executable() {
    local hooks_dir="$1"

    info "Ensuring hooks are executable..."

    # List of hook files that need to be executable
    local hook_files=(
        "$hooks_dir/router.py"
        "$hooks_dir/formatter.sh"
        "$hooks_dir/learning.sh"
        "$hooks_dir/status.js"
        "$hooks_dir/wiggum.js"
        "$hooks_dir/save-remote-logs.js"
        "$hooks_dir/permitter/permitter.js"
    )

    local count=0
    for hook in "${hook_files[@]}"; do
        if [[ -f "$hook" ]]; then
            if [[ ! -x "$hook" ]]; then
                chmod +x "$hook"
                info "Made executable: $(basename "$hook")"
                ((count++)) || true
            fi
        fi
    done

    if [[ $count -gt 0 ]]; then
        info "Made $count hooks executable"
    else
        info "All hooks already executable"
    fi
}

# Copy hooks from plugin directory
copy_hooks() {
    local dest="$1/.claude/hooks"

    if [[ -z "$PLUGIN_DIR" ]]; then
        warn "No plugin directory specified, skipping hooks"
        return 0
    fi

    local count=0

    # Plugin cache structure: hooks are symlinks directly in $PLUGIN_DIR/hooks/
    # Monorepo structure: hooks are in sibling packages
    
    # Standard hooks to copy (these may be symlinks in plugin cache)
    local hooks_to_copy=(
        "router.py"
        "formatter.sh"
        "learning.sh"
        "status.js"
        "wiggum.js"
        "save-remote-logs.js"
        "notify.sh"
    )

    # Try plugin cache structure first (hooks at root of $PLUGIN_DIR/hooks/)
    if [[ -d "$PLUGIN_DIR/hooks" ]]; then
        for hook in "${hooks_to_copy[@]}"; do
            local src="$PLUGIN_DIR/hooks/$hook"
            if [[ -f "$src" || -L "$src" ]]; then
                if [[ ! -f "$dest/$hook" || "$FORCE" == "true" ]]; then
                    # Dereference symlinks when copying
                    cp -L "$src" "$dest/"
                    chmod +x "$dest/$hook" 2>/dev/null || true
                    info "Copied hook: $hook"
                    ((count++)) || true
                else
                    info "Hook exists: $hook"
                fi
            fi
        done

        # Copy hooks/lib/ directory (shared utilities)
        if [[ -d "$PLUGIN_DIR/hooks/lib" ]]; then
            mkdir -p "$dest/lib"
            for lib_file in "$PLUGIN_DIR/hooks/lib"/*.js; do
                [[ -f "$lib_file" || -L "$lib_file" ]] || continue
                local lib_basename
                lib_basename="$(basename "$lib_file")"
                if [[ ! -f "$dest/lib/$lib_basename" || "$FORCE" == "true" ]]; then
                    cp -L "$lib_file" "$dest/lib/"
                    info "Copied hook lib: lib/$lib_basename"
                fi
            done
        fi
        
        # Handle permitter separately (it has a lib directory)
        if [[ -f "$PLUGIN_DIR/hooks/permitter.js" || -L "$PLUGIN_DIR/hooks/permitter.js" ]]; then
            mkdir -p "$dest/permitter/lib"
            if [[ ! -f "$dest/permitter/permitter.js" || "$FORCE" == "true" ]]; then
                cp -L "$PLUGIN_DIR/hooks/permitter.js" "$dest/permitter/"
                chmod +x "$dest/permitter/permitter.js" 2>/dev/null || true
                info "Copied hook: permitter/permitter.js"
                ((count++)) || true
            fi
            # Copy permitter lib from monorepo if accessible via symlink target.
            # NOTE: readlink returns a RELATIVE path; anchor it to the symlink's directory
            # via `cd && pwd` so [[ -d ]] works regardless of the caller's CWD (the scaffold
            # runs from the target project dir, not the plugin dir).
            local permitter_link="$PLUGIN_DIR/hooks/permitter.js"
            local permitter_target
            permitter_target=$(readlink "$permitter_link" 2>/dev/null || echo "")
            if [[ -n "$permitter_target" ]]; then
                local lib_dir=""
                if [[ "$permitter_target" = /* ]]; then
                    lib_dir="$(dirname "$permitter_target")/../lib"
                else
                    lib_dir="$(cd "$(dirname "$permitter_link")" 2>/dev/null && cd "$(dirname "$permitter_target")" 2>/dev/null && pwd)/../lib" || lib_dir=""
                fi
                if [[ -n "$lib_dir" && -d "$lib_dir" ]]; then
                    for lib in "$lib_dir"/*.js; do
                        [[ -f "$lib" ]] || continue
                        local basename
                        basename="$(basename "$lib")"
                        if [[ ! -f "$dest/permitter/lib/$basename" || "$FORCE" == "true" ]]; then
                            cp "$lib" "$dest/permitter/lib/"
                            info "Copied lib: permitter/lib/$basename"
                        fi
                    done
                fi
            fi
        fi
    else
        # Fall back to monorepo structure
        local base_path="$PLUGIN_DIR/.."
        
        # Router hook
        if [[ -f "$base_path/router/hooks/router.py" ]]; then
            if [[ ! -f "$dest/router.py" || "$FORCE" == "true" ]]; then
                cp "$base_path/router/hooks/router.py" "$dest/"
                info "Copied hook: router.py"
                ((count++)) || true
            fi
        fi
        
        # Core hooks
        for hook in formatter.sh learning.sh status.js wiggum.js save-remote-logs.js notify.sh; do
            if [[ -f "$base_path/core/hooks/$hook" ]]; then
                if [[ ! -f "$dest/$hook" || "$FORCE" == "true" ]]; then
                    cp "$base_path/core/hooks/$hook" "$dest/"
                    info "Copied hook: $hook"
                    ((count++)) || true
                fi
            fi
        done

        # Core hooks lib directory (shared utilities)
        if [[ -d "$base_path/core/hooks/lib" ]]; then
            mkdir -p "$dest/lib"
            for lib_file in "$base_path/core/hooks/lib"/*.js; do
                [[ -f "$lib_file" ]] || continue
                local lib_basename
                lib_basename="$(basename "$lib_file")"
                if [[ ! -f "$dest/lib/$lib_basename" || "$FORCE" == "true" ]]; then
                    cp "$lib_file" "$dest/lib/"
                    info "Copied hook lib: lib/$lib_basename"
                fi
            done
        fi
        
        # Permitter hook
        if [[ -d "$base_path/permitter" ]]; then
            mkdir -p "$dest/permitter/lib"
            if [[ -f "$base_path/permitter/hooks/permitter.js" ]]; then
                if [[ ! -f "$dest/permitter/permitter.js" || "$FORCE" == "true" ]]; then
                    cp "$base_path/permitter/hooks/permitter.js" "$dest/permitter/"
                    info "Copied hook: permitter/permitter.js"
                    ((count++)) || true
                fi
            fi
            for lib in "$base_path/permitter/lib"/*.js; do
                [[ -f "$lib" ]] || continue
                local basename
                basename="$(basename "$lib")"
                if [[ ! -f "$dest/permitter/lib/$basename" || "$FORCE" == "true" ]]; then
                    cp "$lib" "$dest/permitter/lib/"
                    info "Copied lib: permitter/lib/$basename"
                fi
            done
        fi
    fi

    info "Copied $count hooks"

    # Ensure all hooks are executable
    ensure_hooks_executable "$dest"
}

# Copy skills from plugin directory based on selection file
copy_skills() {
    local target_dir="$1"
    local selection_file="$target_dir/.claude/selected-skills.txt"
    local src="$PLUGIN_DIR/skills"
    local dest="$target_dir/.claude/skills"

    if [[ -z "$PLUGIN_DIR" ]]; then
        warn "No plugin directory specified, skipping skills"
        return 0
    fi

    if [[ ! -f "$selection_file" ]]; then
        info "No skill selection file found: $selection_file"
        return 0
    fi

    if [[ ! -d "$src" ]]; then
        warn "Skills directory not found: $src"
        return 0
    fi

    local count=0
    while IFS= read -r skill || [[ -n "$skill" ]]; do
        # Skip empty lines and comments
        [[ -z "$skill" || "$skill" =~ ^[[:space:]]*# ]] && continue
        # Trim whitespace
        skill="${skill// /}"

        if [[ -d "$src/$skill" ]]; then
            if [[ -d "$dest/$skill" && "$FORCE" != "true" ]]; then
                info "Skill exists: $skill"
            else
                if [[ "$FORCE" == "true" && -d "$dest/$skill" ]]; then
                    rm -rf "$dest/$skill"
                fi
                cp -r "$src/$skill" "$dest/"
                if [[ "$FORCE" == "true" ]]; then
                    info "Replaced skill: $skill"
                else
                    info "Copied skill: $skill"
                fi
                ((count++)) || true
            fi
        else
            warn "Skill not found: $skill"
        fi
    done < "$selection_file"

    info "Copied $count skills"
}

# Main scaffolding function
scaffold_project() {
    local target_dir="$1"

    # Ensure target directory exists and is accessible
    if [[ ! -d "$target_dir" ]]; then
        error "Target directory does not exist: $target_dir"
        return 1
    fi

    # Store original directory and change to target
    local original_dir
    original_dir="$(pwd)"
    cd "$target_dir" || {
        error "Cannot access target directory: $target_dir"
        return 1
    }

    echo "========================================"
    echo " Scaffolding Ensemble Runtime"
    echo "========================================"
    echo ""
    echo "Target Directory: $(pwd)"
    if [[ "$FORCE" == "true" ]]; then
        echo "Mode: FORCE (overwriting existing files)"
    else
        echo "Mode: Safe (preserving existing files)"
    fi
    echo ""

    # Create .claude/ directory structure
    echo "--- .claude/ Directory Structure ---"
    create_dir ".claude/agents"
    create_dir ".claude/rules"
    create_dir ".claude/skills"
    create_dir ".claude/commands"
    create_dir ".claude/hooks"
    create_dir ".claude/lib"
    echo ""

    # Create docs structure
    echo "--- docs/ Directory Structure ---"
    create_dir "docs/PRD"
    create_dir "docs/TRD/completed"
    create_dir "docs/TRD/cancelled"
    create_dir "docs/standards"
    echo ""

    # Create .trd-state structure
    echo "--- .trd-state/ Directory Structure ---"
    create_dir ".trd-state"
    echo ""

    # Copy template files
    echo "--- Template Files ---"
    copy_template "CLAUDE.md.template" "CLAUDE.md"
    copy_template "claude-directory/settings.json" ".claude/settings.json"
    copy_template "trd-state/current.json.template" ".trd-state/current.json"
    echo ""

    # Copy framework-shipped rule files (distinct from user-owned governance:
    # constitution.md / stack.md / process.md — those are generated at init and
    # never modified by rebase. Framework rules are copied-if-missing on both
    # init AND rebase so behavioral guarantees enforced by hooks have their
    # accompanying explanation in the project.)
    echo "--- Framework-Shipped Rules ---"
    local rules_src_dir
    rules_src_dir="$TEMPLATES_DIR/claude-directory/rules"
    if [[ -d "$rules_src_dir" ]]; then
        local copied_count=0
        for rule_file in "$rules_src_dir"/*.md; do
            [[ -f "$rule_file" ]] || continue
            local rule_basename
            rule_basename="$(basename "$rule_file")"
            local target=".claude/rules/$rule_basename"
            # Script has cd'd into the target dir; paths are relative from here.
            if [[ -f "$target" ]]; then
                echo "  - $target (already exists — preserved)"
            else
                cp "$rule_file" "$target"
                echo "  ✓ Copied $rule_basename → $target"
                ((copied_count++)) || true
            fi
        done
        echo "  ($copied_count framework rule(s) installed)"
    else
        echo "  (no framework rules template directory — skipping)"
    fi
    echo ""

    # Copy plugin content if plugin directory specified
    if [[ -n "$PLUGIN_DIR" ]]; then
        echo "--- Copying Plugin Content ---"
        echo "Plugin directory: $PLUGIN_DIR"
        echo ""

        echo "--- Agents ---"
        copy_agents "$(pwd)"
        echo ""

        echo "--- Commands ---"
        copy_commands "$(pwd)"
        echo ""

        echo "--- Hooks ---"
        copy_hooks "$(pwd)"
        echo ""

        # Copy skills only if --copy-skills flag was set
        if [[ "$COPY_SKILLS" == "true" ]]; then
            echo "--- Skills ---"
            copy_skills "$(pwd)"
            echo ""
        fi
    fi

    # Return to original directory
    cd "$original_dir"

    echo "========================================"
    echo " Scaffolding Complete"
    echo "========================================"
    echo ""
    echo "Created directories:"
    echo "  .claude/agents/"
    echo "  .claude/rules/"
    echo "  .claude/skills/"
    echo "  .claude/commands/"
    echo "  .claude/hooks/"
    echo "  .claude/lib/"
    echo "  docs/PRD/"
    echo "  docs/TRD/"
    echo "  docs/TRD/completed/"
    echo "  docs/TRD/cancelled/"
    echo "  docs/standards/"
    echo "  .trd-state/"
    echo ""
    echo "Created files from templates:"
    echo "  CLAUDE.md"
    echo "  .claude/settings.json"
    echo "  .trd-state/current.json"
    echo ""

    if [[ -n "$PLUGIN_DIR" ]]; then
        echo "Copied from plugin:"
        echo "  Agents: $(ls -1 "$target_dir/.claude/agents/"*.md 2>/dev/null | wc -l) files"
        echo "  Commands: $(ls -1 "$target_dir/.claude/commands/"*.md 2>/dev/null | wc -l) files"
        echo "  Hooks: $(ls -1 "$target_dir/.claude/hooks/" 2>/dev/null | wc -l) files/dirs"
        if [[ "$COPY_SKILLS" == "true" ]]; then
            echo "  Skills: $(ls -1d "$target_dir/.claude/skills/"*/ 2>/dev/null | wc -l) skills"
        fi
        echo ""
    fi

    return 0
}

# Run if executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    scaffold_project "$PROJECT_DIR"
fi
