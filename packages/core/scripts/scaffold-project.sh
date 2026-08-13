#!/usr/bin/env bash
#
# scaffold-project.sh - Create directory structure for Ensemble vNext
#
# Creates the vendored runtime directory structure for AI-augmented development.
# This script is extracted from init-project.md Step 3.
#
# Usage:
#   ./scaffold-project.sh [--plugin-dir DIR] [--copy-skills] [--force] [project-directory]
#   ./scaffold-project.sh --refresh --plugin-dir DIR [project-directory]
#
# Options:
#   --plugin-dir DIR   Plugin directory containing agents, skills, hooks
#   --copy-skills      Copy skills listed in .claude/selected-skills.txt
#   --force            Overwrite existing files (for "Replace All" scenarios)
#   --refresh          Replace only components already present under the target's
#                       .claude/ (per docs/TRD/runtime-refresh.md §2.2/§3.2). Never
#                       creates a component that is absent, never deletes one the
#                       plugin no longer carries. Mutually exclusive with --force.
#
# If project-directory is not provided, uses current directory.
#
# TRD Reference: TRD-TEST-016, docs/TRD/runtime-refresh.md (RUNTIME-B007..B010)
#

set -euo pipefail

# Script directory (for finding templates)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="${SCRIPT_DIR}/../templates"

# Default values
PLUGIN_DIR=""
COPY_SKILLS=false
FORCE=false
REFRESH=false
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
        --refresh)
            REFRESH=true
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

# --refresh and --force answer different questions ("replace only what's
# already there" vs "overwrite everything, create what's missing") and
# combining them silently would have to pick one meaning. Fail loudly
# instead of guessing.
if [[ "$REFRESH" == "true" && "$FORCE" == "true" ]]; then
    echo "Error: --refresh and --force are mutually exclusive" >&2
    exit 1
fi

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
        if [[ "$REFRESH" == "true" ]]; then
            # Refresh: replace only if this agent already exists in the
            # target. Never create — that stays /rebase-project's job.
            if [[ -f "$dest/$basename" ]]; then
                cp "$agent" "$dest/"
                info "Refreshed agent: $basename"
                ((count++)) || true
            fi
            continue
        fi
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
    if [[ "$REFRESH" == "true" ]]; then
        info "Refreshed $count agents"
    else
        info "Copied $count agents"
    fi
    REFRESH_AGENTS_COUNT=$count
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

        if [[ "$REFRESH" == "true" ]]; then
            # Refresh: replace only if this command already exists in the
            # target. Never create — that stays /rebase-project's job.
            if [[ -f "$dest/$cmd" ]]; then
                cp "$cmd_path" "$dest/"
                info "Refreshed command: $cmd"
                ((count++)) || true
            fi
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
    if [[ "$REFRESH" == "true" ]]; then
        info "Refreshed $count commands"
    else
        info "Copied $count commands"
    fi
    REFRESH_COMMANDS_COUNT=$count
}

# Locate a JSON sidecar that ships alongside a package subdirectory
# (hooks/hooks.manifest.json, agents/skill-affinity.json). Echoes the first
# existing candidate and returns 0; returns 1 if none exist.
#
# Every such sidecar must be reachable from BOTH install layouts, so the
# search order is the same in all cases: plugin-cache layout first (a cache
# install ships only packages/full/, so the file is symlinked into
# packages/full/<subdir>/), then the monorepo layout, then a script-relative
# fallback for when --plugin-dir was not passed.
find_plugin_json() {
    local subdir="$1"
    local filename="$2"
    local candidate
    for candidate in \
        "$PLUGIN_DIR/$subdir/$filename" \
        "$PLUGIN_DIR/../core/$subdir/$filename" \
        "$SCRIPT_DIR/../$subdir/$filename"; do
        [[ -f "$candidate" ]] && { echo "$candidate"; return 0; }
    done
    return 1
}

# Emit "<file>\t<subpath>" for every shippable hook in the manifest, one per
# line. <subpath> is the hook's location relative to the monorepo's
# packages/ directory (e.g. "core/hooks/formatter.sh", "router/hooks/router.py"),
# derived from the manifest's "source" field when present (cross-package
# hooks) or defaulting to "core/hooks/<file>".
#
# SECURITY: "file" and "source" are validated here, at the single point
# every downstream consumer (copy_hooks, ensure_hooks_executable) reads the
# manifest through. "file" must be a flat basename — hook names are flat by
# design, so any "/" or ".." is rejected outright (a manifest entry like
# {"file": "../../../outside/victim.sh"} must never reach a path-join).
# "source" legitimately contains "/" (e.g. "packages/router/hooks/router.py")
# but must never contain a ".." component, an absolute path, or normalize
# outside of a "packages/..." prefix. A bad manifest entry fails loudly here
# instead of being silently skipped or, worse, followed.
manifest_shippable_hooks() {
    local manifest="$1"
    python3 - "$manifest" <<'PY'
import json, os, sys

def fail(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)

def validate_file(file):
    # Hook file names are flat basenames by design. Reject any path
    # separator or traversal component so a manifest entry can never be
    # used to escape the hooks destination directory.
    if not file or "/" in file or "\\" in file or ".." in file:
        fail(f"manifest hook 'file' must be a flat basename (no '/', '\\\\', or '..'): {file!r}")
    if file != os.path.basename(file):
        fail(f"manifest hook 'file' must be a flat basename: {file!r}")

def validate_source(source):
    # "source" legitimately contains "/" (cross-package hooks), but must
    # stay a relative path rooted at "packages/" with no ".." components —
    # anything else could resolve outside the repo/plugin root.
    if not source or os.path.isabs(source) or source.startswith("~"):
        fail(f"manifest hook 'source' must be a relative path: {source!r}")
    parts = source.split("/")
    if ".." in parts or any(p in ("", ".") for p in parts):
        fail(f"manifest hook 'source' must not contain '..' or empty/'.' components: {source!r}")
    normalized = os.path.normpath(source)
    if normalized.startswith("..") or os.path.isabs(normalized) or not normalized.startswith("packages/"):
        fail(f"manifest hook 'source' must resolve under the repo's packages/ root: {source!r}")

manifest = json.load(open(sys.argv[1]))
# A hook file may have MORE THAN ONE manifest entry when it registers on
# several events (dispatch-ledger.js: SubagentStart + SubagentStop). The copy
# list is per-FILE, so dedupe — otherwise the file is copied twice and every
# hook-count assertion downstream is off by the number of extra registrations.
seen = {}
for h in manifest.get("hooks", []):
    if not h.get("shippable"):
        continue
    file = h["file"]
    validate_file(file)
    source = h.get("source") or f"packages/core/hooks/{file}"
    validate_source(source)
    if file in seen:
        # Same file declared twice must resolve to the same source, or the
        # copy would be order-dependent and silently pick one at random.
        if seen[file] != source:
            fail(
                f"manifest declares hook {file!r} with conflicting sources: "
                f"{seen[file]!r} and {source!r}"
            )
        continue
    seen[file] = source
    subpath = source[len("packages/"):] if source.startswith("packages/") else source
    print(f"{file}\t{subpath}")
PY
}

# Copy the shared hook helper library (hooks/lib/*.js) from whichever layout
# copy_hooks resolved. No-op when the source directory is absent.
copy_hook_libs() {
    local src_lib="$1"
    local dest="$2"

    [[ -d "$src_lib" ]] || return 0

    local lib_file lib_basename
    REFRESH_HOOK_LIBS_COUNT=0

    if [[ "$REFRESH" == "true" ]]; then
        # Refresh: never create dest/lib/, and never add a lib file that
        # wasn't already there.
        [[ -d "$dest/lib" ]] || return 0
        local libs_count=0
        for lib_file in "$src_lib"/*.js; do
            [[ -f "$lib_file" || -L "$lib_file" ]] || continue
            lib_basename="$(basename "$lib_file")"
            if [[ -f "$dest/lib/$lib_basename" ]]; then
                cp -L "$lib_file" "$dest/lib/"
                info "Refreshed hook lib: lib/$lib_basename"
                ((libs_count++)) || true
            fi
        done
        REFRESH_HOOK_LIBS_COUNT=$libs_count
        return 0
    fi

    mkdir -p "$dest/lib"
    for lib_file in "$src_lib"/*.js; do
        [[ -f "$lib_file" || -L "$lib_file" ]] || continue
        lib_basename="$(basename "$lib_file")"
        if [[ ! -f "$dest/lib/$lib_basename" || "$FORCE" == "true" ]]; then
            # Dereference symlinks when copying (cache layout symlinks these).
            cp -L "$lib_file" "$dest/lib/"
            info "Copied hook lib: lib/$lib_basename"
        fi
    done
}

# Ensure all copied hook files have executable permissions.
# hook_files: newline-separated list of destination paths (from copy_hooks).
ensure_hooks_executable() {
    local hooks_dir="$1"
    local hook_files="$2"

    info "Ensuring hooks are executable..."

    local count=0
    local hook
    while IFS= read -r hook; do
        [[ -z "$hook" ]] && continue
        local path="$hooks_dir/$hook"
        if [[ -f "$path" && ! -x "$path" ]]; then
            chmod +x "$path"
            info "Made executable: $hook"
            ((count++)) || true
        fi
    done <<< "$hook_files"

    if [[ $count -gt 0 ]]; then
        info "Made $count hooks executable"
    else
        info "All hooks already executable"
    fi
}

# Copy hooks from plugin directory, driven by hooks.manifest.json's
# "shippable" set (packages/core/hooks/hooks.manifest.json — see
# find_hooks_manifest()). This is the single declaration; do not
# reintroduce a hardcoded hook list here (see docs/TRD/runtime-refresh.md
# RUNTIME-B001).
copy_hooks() {
    local dest="$1/.claude/hooks"

    if [[ -z "$PLUGIN_DIR" ]]; then
        warn "No plugin directory specified, skipping hooks"
        return 0
    fi

    local manifest
    if ! manifest="$(find_plugin_json hooks hooks.manifest.json)"; then
        warn "Hooks manifest not found (tried plugin cache, monorepo, and script-relative paths) — skipping hooks"
        return 0
    fi
    info "Hooks manifest: $manifest"

    local hooks_to_copy
    hooks_to_copy="$(manifest_shippable_hooks "$manifest")"

    # Two source layouts, one copy loop:
    #   plugin cache — every hook is a symlink directly in $PLUGIN_DIR/hooks/
    #   monorepo     — hooks live at packages/<subpath> per the manifest
    # Only the src path and the lib/ location differ between them.
    local cache_layout=false
    local libs_src="$PLUGIN_DIR/../core/hooks/lib"
    if [[ -d "$PLUGIN_DIR/hooks" ]]; then
        cache_layout=true
        libs_src="$PLUGIN_DIR/hooks/lib"
    fi

    local count=0
    local hook subpath src
    while IFS=$'\t' read -r hook subpath; do
        [[ -z "$hook" ]] && continue
        if [[ "$cache_layout" == "true" ]]; then
            src="$PLUGIN_DIR/hooks/$hook"
        else
            src="$PLUGIN_DIR/../$subpath"
        fi
        [[ -f "$src" || -L "$src" ]] || continue

        if [[ "$REFRESH" == "true" ]]; then
            # Refresh: replace only if this hook already exists in the
            # target. Never create — that stays /rebase-project's job.
            if [[ -f "$dest/$hook" ]]; then
                cp -L "$src" "$dest/"
                info "Refreshed hook: $hook"
                ((count++)) || true
            fi
            continue
        fi

        if [[ -f "$dest/$hook" && "$FORCE" != "true" ]]; then
            info "Hook exists: $hook"
            continue
        fi
        # Dereference symlinks when copying (cache layout ships symlinks).
        cp -L "$src" "$dest/"
        info "Copied hook: $hook"
        ((count++)) || true
    done <<< "$hooks_to_copy"

    copy_hook_libs "$libs_src" "$dest"

    if [[ "$REFRESH" == "true" ]]; then
        info "Refreshed $count hooks and ${REFRESH_HOOK_LIBS_COUNT:-0} hook libs"
        # Hooks only — shared lib/*.js helpers are reported separately above.
        # Folding them in here made the summary the user actually reads
        # ("3 hooks updated") overstate by the lib count.
        REFRESH_HOOKS_COUNT=$count
    else
        info "Copied $count hooks"
    fi

    # Ensure all manifest-declared hooks are executable (not just the ones
    # copied this run — pre-existing files from an earlier scaffold may
    # still need the bit set).
    local hook_names
    hook_names="$(cut -f1 <<< "$hooks_to_copy")"
    ensure_hooks_executable "$dest" "$hook_names"
}

# Copy skills from plugin directory based on selection file
copy_skills() {
    local target_dir="$1"
    local selection_file="$target_dir/.claude/selected-skills.txt"
    local dest="$target_dir/.claude/skills"

    if [[ -z "$PLUGIN_DIR" ]]; then
        warn "No plugin directory specified, skipping skills"
        return 0
    fi

    # The skill library ships as skills-lib/ and is deliberately NOT registered in
    # plugin.json — registering it would load all 61 skills into every session on the
    # machine (~12.4k tok always-on) and defeat /init-project's per-project curation.
    # Fall back to skills/ so installs predating the rename still scaffold correctly.
    local src="$PLUGIN_DIR/skills-lib"
    if [[ ! -d "$src" && -d "$PLUGIN_DIR/skills" ]]; then
        src="$PLUGIN_DIR/skills"
        info "Using legacy skills/ source (plugin predates skills-lib)"
    fi

    if [[ ! -d "$src" ]]; then
        warn "Skills directory not found: $src"
        return 0
    fi

    if [[ "$REFRESH" == "true" ]]; then
        # Refresh: never create .claude/skills/, and never add a skill
        # directory that wasn't already selected. The directories already
        # present under dest ARE the "already selected" set — adding or
        # removing selections stays /rebase-project's job.
        REFRESH_SKILLS_COUNT=0
        if [[ ! -d "$dest" ]]; then
            info "No existing skills directory — skipping skill refresh"
            return 0
        fi
        local count=0
        local skill_dir skill
        for skill_dir in "$dest"/*/; do
            [[ -d "$skill_dir" ]] || continue
            skill="$(basename "$skill_dir")"
            if [[ -d "$src/$skill" ]]; then
                rm -rf "${dest:?}/${skill:?}"
                cp -r "$src/$skill" "$dest/"
                info "Refreshed skill: $skill"
                ((count++)) || true
            fi
        done
        info "Refreshed $count skills"
        REFRESH_SKILLS_COUNT=$count
        return 0
    fi

    if [[ ! -f "$selection_file" ]]; then
        info "No skill selection file found: $selection_file"
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
                    rm -rf "${dest:?}/${skill:?}"
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

# Inject per-project skill preloads into the vendored agents.
#
# Agents ship WITHOUT a skills: field — a hardcoded list cannot be correct across
# projects, because skills are curated per project. The affinity manifest declares
# which skills are plausibly relevant to each agent (CANDIDATES); this function
# intersects each pool with the project's own selected-skills.txt and writes the
# result as that agent's skills: frontmatter.
#
# This is deliberately a script and not a prompt instruction. Before 4.0.0 the
# intersection happened only because /init-project's model chose to prune the
# shipped pools — nothing instructed it to, so an equally valid run would have
# preserved them verbatim and produced preloads naming skills the project never
# selected. Determinism is the whole point.
#
# Idempotent: any existing skills: block is stripped before the new one is written,
# so re-running (or --refresh) re-derives from the current selection rather than
# accumulating. An agent whose pool shares nothing with the selection gets no
# skills: field at all.
inject_agent_skills() {
    local target_dir="$1"
    local selection_file="$target_dir/.claude/selected-skills.txt"
    local agents_dir="$target_dir/.claude/agents"
    local manifest=""

    manifest="$(find_plugin_json agents skill-affinity.json)" || manifest=""

    if [[ -z "$manifest" ]]; then
        info "No skill-affinity manifest found — skipping agent skill preloads"
        return 0
    fi
    if [[ ! -f "$selection_file" ]]; then
        info "No skill selection file — skipping agent skill preloads"
        return 0
    fi
    if [[ ! -d "$agents_dir" ]]; then
        info "No agents directory — skipping agent skill preloads"
        return 0
    fi

    python3 - "$manifest" "$selection_file" "$agents_dir" "$target_dir/.claude/skills" <<'PY'
import json, os, re, sys, tempfile

manifest_path, selection_path, agents_dir = sys.argv[1:4]
skills_dir = sys.argv[4] if len(sys.argv) > 4 else ""

BEGIN = "<!-- ENSEMBLE:SKILLS:BEGIN — generated by scaffold-project.sh; edits are overwritten -->"
END = "<!-- ENSEMBLE:SKILLS:END -->"

def skill_description(name):
    """First line of the skill's frontmatter description, for the body block."""
    path = os.path.join(skills_dir, name, "SKILL.md")
    if not os.path.isfile(path):
        return ""
    try:
        lines = open(path).read().split("\n")
    except OSError:
        return ""
    if not lines or lines[0].strip() != "---":
        return ""
    close = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if close is None:
        return ""
    for i in range(1, close):
        m = re.match(r'^description:\s*(.*)$', lines[i])
        if not m:
            continue
        val = m.group(1).strip()
        if val in ("|", ">", "|-", ">-"):          # block scalar: take first content line
            for j in range(i + 1, close):
                if lines[j].strip():
                    val = lines[j].strip()
                    break
            else:
                return ""
        val = val.strip('"').strip("'")
        val = val.split(". ")[0].rstrip(".")        # first sentence only
        return val[:180]
    return ""

def strip_body_block(text):
    """Remove a previously generated block so re-runs re-derive rather than stack."""
    pattern = re.compile(
        re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?",
        re.DOTALL,
    )
    return pattern.sub("", text)

def build_body_block(relevant, others):
    out = [BEGIN, "", "## Project Skills", ""]
    if relevant:
        out += [
            "Skills installed in this project that bear most directly on your work.",
            "Invoke one with the Skill tool when it applies — reading the skill first is",
            "normally cheaper and more accurate than re-deriving its conventions.",
            "",
        ]
        for name in relevant:
            desc = skill_description(name)
            out.append(f"- **{name}**" + (f" — {desc}" if desc else ""))
        out.append("")
    else:
        out += [
            "No installed skill maps specifically to this agent's role in this project.",
            "",
        ]
    if others:
        out += [
            "Also installed and available whenever the task calls for them: "
            + ", ".join(f"`{o}`" for o in others)
            + ".",
            "",
        ]
    out += [
        "This list is a starting point, not a restriction — it does not exclude any other",
        "skill in the project, and it is regenerated whenever the skill selection changes.",
        "",
        END,
    ]
    return "\n".join(out)

selected = []
with open(selection_path) as fh:
    for line in fh:
        line = line.strip()
        if line and not line.startswith("#"):
            selected.append(line)
selected_set = set(selected)

pools = json.load(open(manifest_path)).get("agents", {})

def strip_skills(fm_lines):
    out, i = [], 0
    while i < len(fm_lines):
        if re.match(r'^skills:', fm_lines[i]):
            i += 1
            while i < len(fm_lines) and re.match(r'^\s+-\s', fm_lines[i]):
                i += 1
            continue
        out.append(fm_lines[i])
        i += 1
    return out

injected = 0
for fname in sorted(os.listdir(agents_dir)):
    if not fname.endswith(".md"):
        continue
    name = fname[:-3]
    pool = pools.get(name)
    if pool is None:
        continue
    # Preserve the pool's ordering; it encodes rough relevance priority.
    resolved = [s for s in pool if s in selected_set]

    path = os.path.join(agents_dir, fname)
    with open(path) as fh:
        text = fh.read()
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        continue
    close = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if close is None:
        continue

    fm = strip_skills(lines[1:close])
    if resolved:
        fm = fm + ["skills:"] + [f"  - {s}" for s in resolved]

    # Body block. Frontmatter preloads do NOT reach Agent({team_name}) teammates —
    # teammates read skills from the project instead. A body reference is the only
    # channel that reaches both spawn styles, so the guidance is written twice on
    # purpose: as a preload for subagents, and as prose for teammates.
    body = strip_body_block("\n".join(lines[close + 1:])).rstrip("\n")
    others = [s for s in selected if s not in resolved]
    body = body + "\n\n" + build_body_block(resolved, others) + "\n"

    new_text = "\n".join([lines[0]] + fm + [lines[close]]) + "\n" + body
    if new_text != text:
        mode = os.stat(path).st_mode & 0o7777
        fd, tmp = tempfile.mkstemp(dir=agents_dir, suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as fh:
                fh.write(new_text)
            os.chmod(tmp, mode)
            os.replace(tmp, path)
        except BaseException:
            os.path.exists(tmp) and os.unlink(tmp)
            raise
    if resolved:
        injected += 1

print(f"AGENT_SKILLS_INJECTED agents={injected} selected={len(selected)}")
PY
}

# Stamp the plugin version into the target's .claude/settings.json.
#
# /rebase-project's version detection reads settings.json's ensemble.version;
# without the stamp it always falls through to "unknown -> full sync", and the
# runtime-refresh monotonic gate has nothing to compare against. Stamped on
# initial scaffold and on every successful --refresh.
#
# Merges into the "ensemble" key. Permissions, env, and hook registrations are
# user-owned and are never touched here — and neither are the other ensemble
# sub-keys (skills_dir, rules_dir, state_dir, docs_dir, prd_dir, trd_dir shipped
# by the settings template; rebased_at / previous_version written by
# /rebase-project). Only version + refreshed_at are (re)written.
stamp_ensemble_version() {
    local target_dir="$1"
    local settings="$target_dir/.claude/settings.json"

    if [[ ! -f "$settings" ]]; then
        warn "No settings.json to stamp: $settings"
        return 0
    fi

    local plugin_manifest="$PLUGIN_DIR/.claude-plugin/plugin.json"
    if [[ -z "$PLUGIN_DIR" || ! -f "$plugin_manifest" ]]; then
        info "No plugin manifest available — skipping version stamp"
        return 0
    fi

    local version
    version="$(python3 -c "
import json
print(json.load(open('$plugin_manifest')).get('version', ''))
" 2>/dev/null)" || version=""

    if [[ -z "$version" ]]; then
        warn "Could not read plugin version — skipping version stamp"
        return 0
    fi

    # Rewrite atomically: a half-written settings.json breaks every hook.
    if python3 - "$settings" "$version" <<'PY'
import json, os, sys, tempfile, collections
from datetime import datetime, timezone

path, version = sys.argv[1], sys.argv[2]
with open(path) as fh:
    data = json.load(fh, object_pairs_hook=collections.OrderedDict)

# Merge — never replace. The template ships skills_dir/rules_dir/state_dir/
# docs_dir/prd_dir/trd_dir here, and /rebase-project writes rebased_at and
# previous_version; clobbering the object would silently drop all of them.
ensemble = data.get("ensemble")
if not isinstance(ensemble, dict):
    ensemble = collections.OrderedDict()
ensemble["version"] = version
ensemble["refreshed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
ensemble.setdefault("agents_dir", ".claude/agents")
data["ensemble"] = ensemble

directory = os.path.dirname(path) or "."
# Preserve the original mode: mkstemp creates 0600, and os.replace would carry
# that onto settings.json, making it unreadable to anyone but the owner.
mode = os.stat(path).st_mode & 0o7777
fd, tmp = tempfile.mkstemp(dir=directory, suffix=".tmp")
try:
    with os.fdopen(fd, "w") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")
    os.chmod(tmp, mode)
    os.replace(tmp, path)
except BaseException:
    os.path.exists(tmp) and os.unlink(tmp)
    raise
PY
    then
        info "Stamped ensemble.version = $version"
    else
        warn "Failed to stamp version into $settings (left unchanged)"
    fi
}

# Refresh the framework-shipped rule files under .claude/rules/, driven from
# packages/core/templates/claude-directory/rules/ — the same directory
# scaffold_project()'s "Framework-Shipped Rules" step copies-if-missing from.
#
# Project-authored governance (constitution.md, stack.md, process.md) must
# NEVER be touched by refresh (RUNTIME-B009). Rather than hardcoding that
# exclusion list a second time here, this derives it structurally: a rule is
# "framework-shipped" exactly when it exists in rules_src_dir, and the
# authored files never appear there — they are generated once at
# /init-project time and live only in the target. Only rules already present
# in the target are replaced; none are created.
refresh_rules() {
    local target_dir="$1"
    local rules_src_dir="$TEMPLATES_DIR/claude-directory/rules"
    local dest_dir="$target_dir/.claude/rules"

    if [[ ! -d "$rules_src_dir" ]]; then
        info "No framework rules template directory — skipping rules refresh"
        return 0
    fi
    if [[ ! -d "$dest_dir" ]]; then
        info "No existing rules directory — skipping rules refresh"
        return 0
    fi

    # Defence in depth. The structural derivation above (refreshable == exists in
    # the framework rules template dir) is correct today, but its safety rests on
    # an invariant nothing enforces: that nobody ever adds one of these three
    # filenames to that template directory. Shipping a default constitution.md
    # template is an entirely plausible feature request, and it would silently
    # overwrite every project's authored governance on SessionStart. Make the
    # invariant refuse to break rather than break quietly.
    local AUTHORED_RULES=("constitution.md" "stack.md" "process.md")

    local count=0
    local rule_file rule_basename authored skip
    for rule_file in "$rules_src_dir"/*.md; do
        [[ -f "$rule_file" ]] || continue
        rule_basename="$(basename "$rule_file")"
        skip=false
        for authored in "${AUTHORED_RULES[@]}"; do
            if [[ "$rule_basename" == "$authored" ]]; then
                warn "Refusing to refresh project-authored rule: $rule_basename"
                skip=true
                break
            fi
        done
        [[ "$skip" == "true" ]] && continue
        if [[ -f "$dest_dir/$rule_basename" ]]; then
            cp "$rule_file" "$dest_dir/$rule_basename"
            info "Refreshed rule: $rule_basename"
            ((count++)) || true
        fi
    done
    info "Refreshed $count framework rules"
}

# --refresh entry point (RUNTIME-B007..B010).
#
# Replaces only components already present under the target's .claude/,
# sourced from $PLUGIN_DIR. Never creates a component that is absent and
# never deletes one the plugin no longer carries — that property is what
# lets this run unattended from a SessionStart hook without risk of
# un-curating a project or surprising anyone with a new component. Adding or
# removing components stays /rebase-project's job (docs/TRD/runtime-refresh.md
# §2.2).
#
# Consequently this function intentionally skips everything scaffold_project()
# does that creates or that refresh must never touch: no directory creation,
# no CLAUDE.md / current.json templating, no .trd-state/ writes, and no
# constitution.md/stack.md/process.md writes (see refresh_rules() above).
refresh_project() {
    local target_dir="$1"

    if [[ -z "$PLUGIN_DIR" ]]; then
        error "--refresh requires --plugin-dir"
        return 1
    fi

    if [[ ! -d "$target_dir" ]]; then
        error "Target directory does not exist: $target_dir"
        return 1
    fi

    local original_dir
    original_dir="$(pwd)"
    cd "$target_dir" || {
        error "Cannot access target directory: $target_dir"
        return 1
    }

    echo "========================================"
    echo " Refreshing Ensemble Runtime"
    echo "========================================"
    echo ""
    echo "Target Directory: $(pwd)"
    echo "Plugin directory: $PLUGIN_DIR"
    echo "Mode: REFRESH (replace present-only; never create, never delete)"
    echo ""

    REFRESH_COMMANDS_COUNT=0
    REFRESH_AGENTS_COUNT=0
    REFRESH_HOOKS_COUNT=0
    REFRESH_HOOK_LIBS_COUNT=0
    REFRESH_SKILLS_COUNT=0

    echo "--- Commands ---"
    copy_commands "$(pwd)"
    echo ""

    echo "--- Agents ---"
    copy_agents "$(pwd)"
    echo ""

    echo "--- Hooks ---"
    copy_hooks "$(pwd)"
    echo ""

    echo "--- Skills ---"
    copy_skills "$(pwd)"
    echo ""

    # Runs unconditionally, same as scaffold_project(): an agent file that
    # was just replaced from the plugin arrives with no skills: frontmatter
    # and no body block, so skipping this would silently strip a project's
    # preloads. Only agents actually present in agents_dir are touched —
    # copy_agents above never created new ones, so this can't inject into an
    # agent that was absent before the refresh.
    echo "--- Agent Skill Preloads ---"
    inject_agent_skills "$(pwd)"
    echo ""

    echo "--- Framework-Shipped Rules ---"
    refresh_rules "$(pwd)"
    echo ""

    # Stamped only once every copy step above has completed successfully.
    # `set -euo pipefail` already enforces this — any failure above exits
    # the script before this line is reached — but the ordering is
    # deliberate: docs/TRD/runtime-refresh.md §7 flags "partial copy leaves
    # a mixed runtime" as a risk, and stamping first would make a
    # half-applied refresh look complete.
    echo "--- Version Stamp ---"
    stamp_ensemble_version "$(pwd)"
    echo ""

    cd "$original_dir"

    echo "========================================"
    echo " Refresh Complete"
    echo "========================================"
    echo ""

    # Machine-readable tally, parsed by the runtime-refresh.sh SessionStart
    # hook (RUNTIME-B011+). MUST be the final line of stdout — nothing may
    # print after this.
    echo "REFRESH_SUMMARY commands=${REFRESH_COMMANDS_COUNT} agents=${REFRESH_AGENTS_COUNT} hooks=${REFRESH_HOOKS_COUNT} skills=${REFRESH_SKILLS_COUNT}"

    return 0
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

        # Runs unconditionally: the selection file may already exist from an
        # earlier invocation even when --copy-skills was not passed this time.
        echo "--- Agent Skill Preloads ---"
        inject_agent_skills "$(pwd)"
        echo ""

        echo "--- Version Stamp ---"
        stamp_ensemble_version "$(pwd)"
        echo ""
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
    if [[ "$REFRESH" == "true" ]]; then
        refresh_project "$PROJECT_DIR"
    else
        scaffold_project "$PROJECT_DIR"
    fi
fi
