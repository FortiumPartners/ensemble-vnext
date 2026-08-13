#!/usr/bin/env bash
#
# runtime-refresh.sh - SessionStart hook that keeps a project's vendored
# .claude/ runtime current with the installed plugin, automatically, without
# ever un-curating it.
#
# =============================================================================
# PURPOSE
# =============================================================================
#
# packages/ is the source of truth for the ensemble runtime, but a project's
# vendored .claude/ is a point-in-time copy made by /init-project. Left alone,
# it drifts. This hook closes that gap: on every SessionStart, it compares the
# installed plugin's version against the project's vendored ensemble.version
# and, when the plugin is newer, replaces only the components already present
# under .claude/ (never adds, never removes — that stays /rebase-project's
# job) via `scaffold-project.sh --refresh`.
#
# Exit 0 on every path. A hook that blocks session start is worse than a
# stale runtime. Malformed JSON, missing plugin, unreadable files, a failing
# scaffold — all exit 0 with best-effort diagnostics to stderr (debug mode
# only).
#
# =============================================================================
# ENVIRONMENT VARIABLES
# =============================================================================
#
#   ENSEMBLE_RUNTIME_REFRESH_DISABLE - Set to "1" to skip entirely (default: "0")
#   ENSEMBLE_RUNTIME_REFRESH_DEBUG   - Set to "1" to log guard decisions to
#                                      stderr (default: "0")
#
# =============================================================================
# HOOK TYPE: SessionStart
# =============================================================================
#
# Input  (JSON via stdin): {"cwd": "...", "session_id": "...", ...}
# Output (JSON to stdout): {"hookSpecificOutput": {"hookEventName":
#                            "SessionStart", "additionalContext": "..."}}
# Exit:  always 0.
#
# =============================================================================
# THE FOUR GUARDS (all four must pass for a refresh to run)
# =============================================================================
#
# Numbered per docs/TRD/runtime-refresh.md §3.1; EVALUATED as 1, then 4, then
# 2, then 3 — a deliberate reordering from the doc's enumeration order. Guard
# 4 (version) is folded into the same python3 call as guard 1 (plugin
# discovery) and run immediately after it, because on a typical machine three
# separate python3 invocations (discover, read-vendored-version, compare)
# blew the <100ms short-circuit budget (docs/TRD/runtime-refresh.md §6) on
# measurement. Guards 2 and 3 are pure safety checks that only matter once a
# refresh is actually about to happen, so they run after the version
# short-circuit — this changes nothing about the safety property each
# provides (a refresh still cannot proceed without passing both), it just
# avoids paying their filesystem-read cost on the common equal/older-version
# path.
#
#   1. Plugin absent      - no installed_plugins.json, no full@ensemble-vnext
#                            entry, or its installPath missing from disk.
#                            Exit silently (CI / fresh clones hit this always).
#   4. Version             - semver(plugin) > semver(vendored ensemble.version
#                            in .claude/settings.json). Equal, older, or
#                            unparseable -> exit silently. Monotonic: this is
#                            what stops teammates on different plugin versions
#                            ping-ponging committed files.
#   2. Self-repo           - this project IS the plugin's source checkout
#                            (packages/full/.claude-plugin/plugin.json exists
#                            under the project root, or the project root
#                            equals a marketplace's directory source.path).
#                            Load-bearing: without it, this repo's own
#                            marketplace-as-directory-source setup would let
#                            a stale plugin cache silently revert live source
#                            edits mid-session. Exit silently.
#   3. In-flight work      - any .trd-state/*/implement.json has a task with
#                            status "in_progress". A running multi-session
#                            /implement-trd loop should not have its command
#                            text change out from under the *next* session.
#                            Emit a one-line notice and skip.
#
# On a successful refresh, scaffold-project.sh --refresh does the actual
# component replacement and version stamping; this hook only parses its
# REFRESH_SUMMARY tally and emits the additionalContext summary — including
# the mandatory next-session caveat (see docs/TRD/runtime-refresh.md §7,
# "Result: next-session" — Claude Code loads .claude/ BEFORE SessionStart
# hooks run, so a refreshed command's text is not visible until the session
# after this one).
#
# =============================================================================
# TESTING
# =============================================================================
#
# Unit tests: packages/core/hooks/runtime-refresh.test.sh
# Run tests:  npx bats packages/core/hooks/runtime-refresh.test.sh
#
# =============================================================================
# TRD REFERENCE
# =============================================================================
#
# docs/TRD/runtime-refresh.md — RUNTIME-B011, B012, B013, B014, B015
#

# Deliberately NOT `set -e` / `set -u`. This hook must exit 0 on every path,
# including ones bash 3.2 (macOS's /bin/bash) handles awkwardly under -u
# (empty array expansion). Every fallible step below checks its own exit
# status explicitly instead of relying on errexit propagation.
set -o pipefail

#######################################
# Debug logging function.
# Logs to stderr only when ENSEMBLE_RUNTIME_REFRESH_DEBUG=1.
#######################################
debug_log() {
    if [[ "${ENSEMBLE_RUNTIME_REFRESH_DEBUG:-0}" == "1" ]]; then
        echo "[RUNTIME-REFRESH $(date -Iseconds 2>/dev/null || date)] $1" >&2
    fi
}

#######################################
# Emit the SessionStart hook JSON payload to stdout and exit 0.
# Arguments:
#   $1 - additionalContext string (may be empty, may be multi-line)
#######################################
emit() {
    local ctx="${1:-}"
    # Pure-bash JSON string escaping — this must succeed even when python3 or
    # jq are unavailable, since it is the final, mandatory output step on
    # every code path.
    local escaped="$ctx"
    escaped="${escaped//\\/\\\\}"
    escaped="${escaped//\"/\\\"}"
    escaped="${escaped//$'\t'/\\t}"
    escaped="${escaped//$'\r'/}"
    escaped="${escaped//$'\n'/\\n}"
    printf '{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "%s"}}\n' "$escaped"
    exit 0
}

#######################################
# Extract a top-level string field from a small JSON blob (the SessionStart
# hook's stdin payload). jq first, grep/sed fallback — mirrors notify.sh.
# Arguments:
#   $1 - JSON string
#   $2 - field name
#   $3 - default value
#######################################
extract_json_field() {
    local json="$1" field="$2" default="${3:-}"
    local value=""

    if [[ -z "$json" ]]; then
        printf '%s' "$default"
        return
    fi

    if command -v jq >/dev/null 2>&1; then
        value="$(printf '%s' "$json" | jq -r ".${field} // empty" 2>/dev/null)"
        if [[ -n "$value" && "$value" != "null" ]]; then
            printf '%s' "$value"
            return
        fi
    fi

    value="$(printf '%s' "$json" | grep -o "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | \
        sed 's/^"[^"]*"[[:space:]]*:[[:space:]]*"\(.*\)"$/\1/' 2>/dev/null)"

    if [[ -n "$value" ]]; then
        printf '%s' "$value"
    else
        printf '%s' "$default"
    fi
}

#######################################
# Resolve the project root by walking up from a starting directory looking
# for .claude/, .trd-state/, or .git/ — mirrors
# packages/core/hooks/lib/resolve-project-root.js's logic for JS hooks.
# Arguments:
#   $1 - starting directory
# Outputs:
#   Absolute path to the resolved root (falls back to the starting dir).
#######################################
resolve_project_root() {
    local start="$1"
    local dir
    dir="$(cd "$start" 2>/dev/null && pwd -P)" || dir="$start"

    while [[ -n "$dir" && "$dir" != "/" ]]; do
        if [[ -d "$dir/.claude" || -d "$dir/.trd-state" || -d "$dir/.git" ]]; then
            printf '%s' "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done

    printf '%s' "$start"
}

#######################################
# Guards 1 + 4, combined: plugin discovery AND version compare in a single
# python3 invocation.
#
# Performance rationale (docs/TRD/runtime-refresh.md §6: the version-match
# short-circuit must complete in under 100ms): python3 interpreter startup
# on a typical dev machine costs ~20-30ms per invocation. Three separate
# calls (discover plugin, read vendored version, compare semver) blew the
# 100ms budget on measurement (~110-165ms observed). Folding discovery,
# the vendored-version read, and the semver compare into ONE process pays
# the startup cost once instead of three times — this is the change that
# brought the equal-version short-circuit path back under budget. Guards 2
# (self-repo) and 3 (in-flight) stay as separate python3 calls: they only
# run on the rare "plugin is actually newer" path, so their cost is not
# part of the short-circuit budget.
#
# Reads ~/.claude/plugins/installed_plugins.json, selects the
# full@ensemble-vnext entry, preferring the scoped entry whose installPath
# exists on disk (the manifest shape is an ARRAY per plugin key — multiple
# scopes are possible). Then reads $2 (the target's .claude/settings.json)
# for ensemble.version and compares real major.minor.patch semver (no
# string compare — "4.10.0" must correctly order above "4.9.0").
#
# Arguments:
#   $1 - path to installed_plugins.json
#   $2 - path to the target's .claude/settings.json
# Sets globals on a "REFRESH" result: PLUGIN_INSTALL_PATH, PLUGIN_VERSION,
# VENDORED_VERSION.
# Returns:
#   0  plugin is newer than vendored — proceed (globals set)
#   1  guard 1 failed (plugin absent) OR guard 4 failed (short-circuit: equal,
#      older, or unparseable version) — both cases exit silently in main(),
#      so the caller does not need to distinguish them.
#######################################
check_plugin_and_version() {
    local installed_file="$1" settings_file="$2"

    if [[ ! -f "$installed_file" ]]; then
        debug_log "guard 1: no installed_plugins.json at $installed_file"
        return 1
    fi

    if ! command -v python3 >/dev/null 2>&1; then
        debug_log "guard 1: python3 unavailable — cannot parse plugin manifest"
        return 1
    fi

    local result
    result="$(python3 - "$installed_file" "$settings_file" <<'PY' 2>/dev/null
import json, os, re, sys

installed_path, settings_path = sys.argv[1], sys.argv[2]

try:
    with open(installed_path) as fh:
        data = json.load(fh)
except Exception:
    print("ABSENT")
    sys.exit(0)

plugins = data.get("plugins")
entries = plugins.get("full@ensemble-vnext") if isinstance(plugins, dict) else None
if not isinstance(entries, list) or not entries:
    print("ABSENT")
    sys.exit(0)

chosen = None
for entry in entries:
    if not isinstance(entry, dict):
        continue
    install_path = entry.get("installPath")
    if install_path and os.path.isdir(install_path):
        chosen = entry
        break
if chosen is None:
    print("ABSENT")
    sys.exit(0)

plugin_version = chosen.get("version") or ""
install_path = chosen.get("installPath") or ""
if not plugin_version or not install_path:
    print("ABSENT")
    sys.exit(0)

try:
    with open(settings_path) as fh:
        sdata = json.load(fh)
    ensemble = sdata.get("ensemble")
    vendored_version = ensemble.get("version") if isinstance(ensemble, dict) else None
except Exception:
    vendored_version = None

if not vendored_version:
    print(f"SHORT_CIRCUIT\t{plugin_version}\t")
    sys.exit(0)

def parse(v):
    m = re.match(r'^(\d+)\.(\d+)\.(\d+)', v or "")
    return tuple(int(x) for x in m.groups()) if m else None

a, b = parse(plugin_version), parse(vendored_version)
if a is None or b is None or not (a > b):
    print(f"SHORT_CIRCUIT\t{plugin_version}\t{vendored_version}")
    sys.exit(0)

print(f"REFRESH\t{install_path}\t{plugin_version}\t{vendored_version}")
PY
)"

    if [[ -z "$result" ]]; then
        debug_log "guard 1/4: python3 helper produced no output — treating as absent"
        return 1
    fi

    local status
    status="${result%%$'\t'*}"
    case "$status" in
        ABSENT)
            debug_log "guard 1: no matching full@ensemble-vnext entry with an existing installPath"
            return 1
            ;;
        SHORT_CIRCUIT)
            local rest plugin_v vendored_v
            rest="${result#*$'\t'}"
            plugin_v="${rest%%$'\t'*}"
            vendored_v="${rest#*$'\t'}"
            debug_log "guard 4: plugin ($plugin_v) not newer than vendored ($vendored_v) — short-circuit"
            return 1
            ;;
        REFRESH)
            local rest
            rest="${result#*$'\t'}"
            PLUGIN_INSTALL_PATH="${rest%%$'\t'*}"
            rest="${rest#*$'\t'}"
            PLUGIN_VERSION="${rest%%$'\t'*}"
            VENDORED_VERSION="${rest#*$'\t'}"
            debug_log "guards 1+4 passed: installPath=$PLUGIN_INSTALL_PATH plugin=$PLUGIN_VERSION vendored=$VENDORED_VERSION"
            return 0
            ;;
        *)
            debug_log "guard 1/4: unrecognized helper output — treating as absent"
            return 1
            ;;
    esac
}

#######################################
# Guard 2: self-repo detection.
#
# True when the project root IS the plugin's own source checkout — either
# packages/full/.claude-plugin/plugin.json exists under it, or it matches a
# "directory"-source marketplace's source.path in known_marketplaces.json.
# Load-bearing per docs/TRD/runtime-refresh.md §3.1: this repo's marketplace
# is a directory source pointing at itself, so without this guard a stale
# plugin cache would silently overwrite live source edits mid-session.
# Arguments:
#   $1 - project root
# Returns:
#   0 if this IS the plugin's self-repo, 1 otherwise.
#######################################
is_self_repo() {
    local project_root="$1"

    # ANCESTRY, not equality. resolve_project_root() stops at the FIRST ancestor
    # carrying .claude/, .trd-state/ or .git/, so a scaffolded project NESTED
    # inside the plugin checkout resolves to itself and never sees the markers
    # above it. This repo contains exactly that shape — packages/full/.claude/
    # and ~40 eval-fixture projects under ensemble-vnext-test-fixtures/variants/,
    # ~1482 tracked files whose value is being pinned at a runtime version.
    # Testing only `project_root == repo` would refresh every one of them the
    # moment they carry an ensemble.version stamp (which B004 now writes on
    # every scaffold), silently rewriting tracked baselines mid-session.
    local dir="$project_root"
    while :; do
        if [[ -f "$dir/packages/full/.claude-plugin/plugin.json" ]]; then
            debug_log "guard 2: plugin.json found at ancestor '$dir' — project is inside the plugin checkout"
            return 0
        fi
        local parent
        parent="$(dirname "$dir")"
        [[ "$parent" == "$dir" ]] && break
        dir="$parent"
    done

    local marketplaces_file="${HOME:-}/.claude/plugins/known_marketplaces.json"
    if [[ ! -f "$marketplaces_file" ]]; then
        return 1
    fi
    if ! command -v python3 >/dev/null 2>&1; then
        debug_log "guard 2: python3 unavailable — cannot parse known_marketplaces.json"
        return 1
    fi

    if python3 - "$marketplaces_file" "$project_root" <<'PY' 2>/dev/null
import json, os, sys

try:
    with open(sys.argv[1]) as fh:
        data = json.load(fh)
except Exception:
    sys.exit(1)

try:
    target = os.path.realpath(sys.argv[2])
except Exception:
    sys.exit(1)

if not isinstance(data, dict):
    sys.exit(1)

for entry in data.values():
    if not isinstance(entry, dict):
        continue
    source = entry.get("source")
    if not isinstance(source, dict):
        continue
    path = source.get("path")
    if not path:
        continue
    try:
        # Prefix match, not equality — a marketplace directory-source that is an
        # ANCESTOR of the project means the project lives inside the plugin
        # checkout, and refreshing it would overwrite live source. os.sep guard
        # stops "/a/bc" matching source "/a/b".
        real = os.path.realpath(path)
        if target == real or target.startswith(real.rstrip(os.sep) + os.sep):
            sys.exit(0)
    except Exception:
        continue

sys.exit(1)
PY
    then
        debug_log "guard 2: project root matches a directory-source marketplace's source.path"
        return 0
    fi

    return 1
}

#######################################
# Guard 3: in-flight work.
#
# True when any .trd-state/*/implement.json contains a task with status
# "in_progress". Echoes "<task_id> (<feature>)" for the notice message.
# Arguments:
#   $1 - project root
# Outputs:
#   "<task_id> (<feature>)" on stdout when found.
# Returns:
#   0 if in-flight work found, 1 otherwise.
#######################################
find_in_flight_task() {
    local root="$1"
    local state_dir="$root/.trd-state"

    [[ -d "$state_dir" ]] || return 1
    command -v python3 >/dev/null 2>&1 || return 1

    local f
    for f in "$state_dir"/*/implement.json; do
        [[ -f "$f" ]] || continue

        local task_id
        task_id="$(python3 - "$f" <<'PY' 2>/dev/null
import json, sys

try:
    with open(sys.argv[1]) as fh:
        data = json.load(fh)
except Exception:
    sys.exit(1)

tasks = data.get("tasks")
if not isinstance(tasks, dict):
    sys.exit(1)

for task_id, task in tasks.items():
    if isinstance(task, dict) and task.get("status") == "in_progress":
        print(task_id)
        sys.exit(0)

sys.exit(1)
PY
)"
        if [[ -n "$task_id" ]]; then
            local feature
            feature="$(basename "$(dirname "$f")")"
            printf '%s (%s)' "$task_id" "$feature"
            return 0
        fi
    done

    return 1
}

#######################################
# Pluralize a count + noun for the summary message.
# Arguments:
#   $1 - count
#   $2 - singular noun
#   $3 - plural noun (defaults to singular + "s")
#######################################
pluralize() {
    local n="$1" singular="$2" plural="${3:-${2}s}"
    if [[ "$n" == "1" ]]; then
        printf '%s %s' "$n" "$singular"
    else
        printf '%s %s' "$n" "$plural"
    fi
}

#######################################
# Join arguments with a separator. Safe under macOS's bash 3.2 even when
# called with zero elements (avoids the "${arr[@]}" unbound-variable
# footgun some callers hit under `set -u`; this script doesn't set -u, but
# stay defensive since callers may be refactored later).
# Arguments:
#   $1   - separator
#   $2.. - elements
#######################################
join_by() {
    local sep="$1"
    shift
    if [[ $# -eq 0 ]]; then
        printf ''
        return
    fi
    local out="$1"
    shift
    local x
    for x in "$@"; do
        out="${out}${sep}${x}"
    done
    printf '%s' "$out"
}

#######################################
# Main hook logic.
#######################################
main() {
    if [[ "${ENSEMBLE_RUNTIME_REFRESH_DISABLE:-0}" == "1" ]]; then
        debug_log "disabled via ENSEMBLE_RUNTIME_REFRESH_DISABLE=1"
        emit ""
    fi

    local input=""
    if [[ ! -t 0 ]]; then
        input="$(cat 2>/dev/null)"
    fi

    local hook_cwd
    hook_cwd="$(extract_json_field "$input" "cwd" "")"
    [[ -z "$hook_cwd" ]] && hook_cwd="$PWD"

    local project_root
    project_root="$(resolve_project_root "$hook_cwd")"
    debug_log "project root resolved to: $project_root"

    # Guards 1 (plugin absent) + 4 (version) combined into a single python3
    # call for the ~100ms short-circuit budget — see check_plugin_and_version()
    # for the rationale. This is a deliberate reordering relative to the four
    # guards' enumeration in docs/TRD/runtime-refresh.md §3.1 (1, 2, 3, 4):
    # guards 2 (self-repo) and 3 (in-flight) are pure safety checks that only
    # matter when a refresh is actually about to happen, so they are
    # evaluated below, after this short-circuit, instead of before it. The
    # safety property they provide is unaffected — a refresh still cannot
    # proceed without passing both.
    local installed_file="${HOME:-}/.claude/plugins/installed_plugins.json"
    local settings_file="$project_root/.claude/settings.json"
    if ! check_plugin_and_version "$installed_file" "$settings_file"; then
        # Both "absent" (guard 1) and "short-circuit" (guard 4) exit silently.
        emit ""
    fi

    # Guard 2: self-repo.
    if is_self_repo "$project_root"; then
        emit ""
    fi

    # Guard 3: in-flight work.
    local in_flight
    if in_flight="$(find_in_flight_task "$project_root")"; then
        debug_log "guard 3: in-flight task $in_flight — skipping with notice"
        emit "ENSEMBLE runtime refresh deferred — task ${in_flight} is in_progress; refreshing now could change command text mid-loop."
    fi

    local vendored_version="$VENDORED_VERSION"
    debug_log "all guards passed: plugin $PLUGIN_VERSION > vendored $vendored_version — refreshing"

    local scaffold_script="$PLUGIN_INSTALL_PATH/scripts/scaffold-project.sh"
    if [[ ! -f "$scaffold_script" ]]; then
        debug_log "scaffold-project.sh not found at $scaffold_script"
        emit ""
    fi

    local refresh_output refresh_rc
    refresh_output="$(bash "$scaffold_script" --refresh --plugin-dir "$PLUGIN_INSTALL_PATH" "$project_root" 2>&1)"
    refresh_rc=$?
    if [[ $refresh_rc -ne 0 ]]; then
        debug_log "scaffold-project.sh --refresh exited $refresh_rc: ${refresh_output:0:500}"
        # Surface it. An empty additionalContext here means the user is told
        # nothing while the refresh fails identically on every future session —
        # the plugin never advances on its own, so it does not self-heal. That is
        # the same failure TRD §7 rejects for the success path ("a change that
        # appears to have no effect is worse than a lag the user knows about"),
        # except worse, because here the user has a real remedy available.
        # Most common cause: an installed plugin whose scaffold predates --refresh.
        emit "ENSEMBLE runtime refresh unavailable — installed plugin ${PLUGIN_VERSION} could not refresh this project (scaffold exited ${refresh_rc}). Run /rebase-project, or update the plugin. Set ENSEMBLE_RUNTIME_REFRESH_DEBUG=1 for detail."
    fi

    local summary_line
    summary_line="$(printf '%s\n' "$refresh_output" | grep '^REFRESH_SUMMARY' | tail -1)"

    local commands agents hooks skills
    commands="$(printf '%s' "$summary_line" | sed -n 's/.*commands=\([0-9][0-9]*\).*/\1/p')"
    agents="$(printf '%s' "$summary_line" | sed -n 's/.*agents=\([0-9][0-9]*\).*/\1/p')"
    hooks="$(printf '%s' "$summary_line" | sed -n 's/.*hooks=\([0-9][0-9]*\).*/\1/p')"
    skills="$(printf '%s' "$summary_line" | sed -n 's/.*skills=\([0-9][0-9]*\).*/\1/p')"
    commands="${commands:-0}"
    agents="${agents:-0}"
    hooks="${hooks:-0}"
    skills="${skills:-0}"

    local parts=()
    [[ "$commands" -gt 0 ]] && parts+=("$(pluralize "$commands" command commands)")
    [[ "$agents" -gt 0 ]] && parts+=("$(pluralize "$agents" agent agents)")
    [[ "$hooks" -gt 0 ]] && parts+=("$(pluralize "$hooks" hook hooks)")
    [[ "$skills" -gt 0 ]] && parts+=("$(pluralize "$skills" skill skills)")

    local joined=""
    if [[ ${#parts[@]} -gt 0 ]]; then
        joined="$(join_by ', ' "${parts[@]}")"
    fi

    local summary_msg
    if [[ -n "$joined" ]]; then
        summary_msg="ENSEMBLE runtime refreshed ${vendored_version} → ${PLUGIN_VERSION} — ${joined} updated."
    else
        summary_msg="ENSEMBLE runtime refreshed ${vendored_version} → ${PLUGIN_VERSION} — no vendored components required changes."
    fi

    # The next-session caveat is MANDATORY (docs/TRD/runtime-refresh.md §7,
    # "Result: next-session" — empirically verified). Claude Code loads
    # .claude/ before SessionStart hooks run, so a refreshed command's text
    # is not visible until the session after this one. Do not drop this line.
    local caveat="Changes take effect in the NEXT session (this session's components were already loaded)."
    emit "${summary_msg}
${caveat}"
}

main
# Belt-and-suspenders: every path above calls emit(), which exits 0 itself.
# This is a fallback in case main() ever returns without emitting.
exit 0
