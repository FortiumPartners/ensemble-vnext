#!/usr/bin/env bash
#
# generate-hooks-artifacts.sh — regenerate the manifest-derived consumers.
#
# packages/core/hooks/hooks.manifest.json (RUNTIME-P2A) is the single
# declaration of the ensemble hook set. Three artifacts must agree with it:
#
#   1. packages/core/templates/claude-directory/settings.json  ("hooks" key)
#   2. packages/core/commands/init-project.md                  (hook table,
#      between the ENSEMBLE:HOOKS-TABLE markers)
#   3. .claude/commands/init-project.md                         (vendored
#      copy of #2 — kept byte-identical)
#
# This is a BUILD-TIME generator, not a scaffold-time one: it runs against
# the monorepo checkout and rewrites the checked-in files directly. Rationale
# (see docs/TRD/runtime-refresh.md RUNTIME-B002):
#   - The template settings.json is shipped to every scaffolded project
#     as-is; scaffold-time generation would mean the template file in this
#     repo is never itself correct, only its scaffolded output is — bad for
#     `git diff` review and for anyone reading the template directly.
#   - init-project.md is a *plugin* command (prompt), not something rewritten
#     per-project; it only makes sense to regenerate it here, once.
#   - Both target files are small and low-churn; re-running this script by
#     hand (or in CI, see RUNTIME §4.2) after any manifest edit is cheap and
#     keeps the diff scoped to the actual hook-set change.
#
# Usage: generate-hooks-artifacts.sh [--check]
#   --check   Exit 1 (without writing) if regeneration would change any file.
#             Intended for CI drift detection.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

CHECK=false
case "${1:-}" in
    "")
        ;;
    --check)
        CHECK=true
        ;;
    *)
        # An unrecognized flag must never fall through to write mode — that
        # would let a typo'd CI arg (e.g. "--check-drift", "--dry-run")
        # silently rewrite checked-in files while still exiting 0.
        echo "ERROR: unknown argument: $1" >&2
        echo "Usage: generate-hooks-artifacts.sh [--check]" >&2
        exit 1
        ;;
esac

MANIFEST="$REPO_ROOT/packages/core/hooks/hooks.manifest.json"
SETTINGS_TEMPLATE="$REPO_ROOT/packages/core/templates/claude-directory/settings.json"
INIT_PROJECT_CORE="$REPO_ROOT/packages/core/commands/init-project.md"
INIT_PROJECT_VENDORED="$REPO_ROOT/.claude/commands/init-project.md"

# packages/full/commands/plugin-only/ holds REAL COPIES, not symlinks.
#
# They were briefly symlinked (4.1.2) to stop them going stale. That broke the
# plugin outright: Claude Code does not load plugin commands through symlinks,
# so `claude plugin details` went from Skills (2) to Skills (0) and
# /init-project became "Unknown command" — the plugin's only two commands, and
# therefore its entire purpose. Reverted in 4.1.5.
#
# Staleness was a real problem though (the shipped copy had drifted two
# releases and still documented a deleted hook), so it is solved here instead:
# the generator syncs them, and --check fails when they diverge.
PLUGIN_ONLY_DIR="$REPO_ROOT/packages/full/commands/plugin-only"

for f in "$MANIFEST" "$SETTINGS_TEMPLATE" "$INIT_PROJECT_CORE"; do
    if [[ ! -f "$f" ]]; then
        echo "ERROR: missing required file: $f" >&2
        exit 1
    fi
done

python3 - "$MANIFEST" "$SETTINGS_TEMPLATE" "$INIT_PROJECT_CORE" "$INIT_PROJECT_VENDORED" "$CHECK" <<'PY'
import collections
import json
import os
import re
import sys
import tempfile

manifest_path, settings_path, init_core_path, init_vendored_path, check_str = sys.argv[1:6]
# The caller passes bash's lowercase "true"/"false". Comparing against "True"
# silently made --check a no-op that always exited 0 — a drift checker that
# never detects drift is worse than none, because CI reports it green.
CHECK = check_str.strip().lower() == "true"

manifest = json.load(open(manifest_path))
hooks = manifest["hooks"]

# ---------------------------------------------------------------------------
# 1. Template settings.json — regenerate the "hooks" key only.
# ---------------------------------------------------------------------------

CD_WRAPPER = 'cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"'

def build_hooks_block():
    # Group event-registered hooks by (event, matcher), preserving the
    # manifest's own array order for group-of-groups ordering, and each
    # hook's "order" field for within-group ordering.
    groups = collections.OrderedDict()  # (event, matcher) -> [hook, ...]
    for h in hooks:
        if h.get("event") is None:
            continue  # model-invoked / not event-registered (e.g. notify-complete.sh)
        key = (h["event"], h.get("matcher") or "")
        groups.setdefault(key, []).append(h)

    # Event display order: first appearance in the manifest array.
    event_order = []
    for (event, _matcher) in groups:
        if event not in event_order:
            event_order.append(event)

    out = collections.OrderedDict()
    for event in event_order:
        entries = []
        for (ev, matcher), group_hooks in groups.items():
            if ev != event:
                continue
            group_hooks = sorted(group_hooks, key=lambda h: h.get("order") or 0)
            hook_cmds = []
            for h in group_hooks:
                command = f"bash -c '{CD_WRAPPER} && .claude/hooks/{h['file']}'"
                hook_cmds.append({
                    "type": "command",
                    "command": command,
                    "timeout": h["timeout"],
                })
            entries.append({"matcher": matcher, "hooks": hook_cmds})
        out[event] = entries
    return out

with open(settings_path) as fh:
    settings = json.load(fh, object_pairs_hook=collections.OrderedDict)

new_hooks_block = build_hooks_block()
if settings.get("hooks") != new_hooks_block:
    if CHECK:
        print(f"DRIFT: {settings_path} hooks block is stale", file=sys.stderr)
        sys.exit(1)
    settings["hooks"] = new_hooks_block
    directory = os.path.dirname(settings_path) or "."
    mode = os.stat(settings_path).st_mode & 0o7777
    fd, tmp = tempfile.mkstemp(dir=directory, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as fh:
            json.dump(settings, fh, indent=2)
            fh.write("\n")
        os.chmod(tmp, mode)
        os.replace(tmp, settings_path)
    except BaseException:
        os.path.exists(tmp) and os.unlink(tmp)
        raise
    print(f"Regenerated: {settings_path}")

# ---------------------------------------------------------------------------
# 2/3. init-project.md hook table (core, then vendored copy).
# ---------------------------------------------------------------------------

BEGIN = "<!-- ENSEMBLE:HOOKS-TABLE:BEGIN — generated by packages/core/scripts/generate-hooks-artifacts.sh; edits are overwritten -->"
END = "<!-- ENSEMBLE:HOOKS-TABLE:END -->"

def title_for(file_field, event):
    stem = file_field.rsplit(".", 1)[0]
    if stem.lower() == (event or "").lower():
        base = event
    else:
        base = "-".join(part.capitalize() for part in stem.split("-"))
    return f"{base} Hook"

def clean_description(desc):
    # First sentence, lowercase first letter, no trailing period. Backticks
    # around file paths / ENV_VAR tokens are authored directly into the
    # manifest's "description" field (not derived via regex here) — a regex
    # over free-form prose can't reliably find token boundaries (e.g. `\b`
    # never matches before a leading "."), so the manifest is the single
    # source of truth for where the backticks go.
    first = desc.split(". ")[0].rstrip(".")
    if first:
        first = first[0].lower() + first[1:]
    return first

event_hooks = [h for h in hooks if h.get("event") is not None]
other_hooks = [h for h in hooks if h.get("event") is None]

lines = [f"Check these hooks in `.claude/hooks/` ({len(event_hooks)} total):"]
for i, h in enumerate(event_hooks, start=1):
    title = title_for(h["file"], h["event"])
    desc = clean_description(h["description"])
    lines.append(
        f"{i}. **{title}** (`{h['event']}`) — `.claude/hooks/{h['file']}` ({desc})"
    )
lines.append("")

if other_hooks:
    parts = []
    for h in other_hooks:
        desc = clean_description(h["description"])
        parts.append(f"`.claude/hooks/{h['file']}` (not event-registered — {desc})")
    plus_line = "Plus " + ", ".join(parts) + " and `.claude/hooks/lib/` (shared helpers)."
    lines.append(plus_line)
    lines.append("")

block_body = "\n".join(lines).rstrip("\n")
new_block = BEGIN + "\n\n" + block_body + "\n\n" + END

pattern = re.compile(re.escape(BEGIN) + r".*?" + re.escape(END), re.DOTALL)

def apply_to_file(path):
    with open(path) as fh:
        text = fh.read()
    if not pattern.search(text):
        print(f"ERROR: markers not found in {path} — run once with markers pre-seeded", file=sys.stderr)
        sys.exit(1)
    new_text = pattern.sub(lambda _m: new_block, text)
    if new_text != text:
        if CHECK:
            print(f"DRIFT: {path} hook table is stale", file=sys.stderr)
            sys.exit(1)
        # Atomic write (mkstemp + chmod + os.replace), matching the pattern
        # used for settings_path above — a failure mid-write must never
        # leave this file truncated while its counterpart (core vs vendored
        # copy) is left untouched, which would diverge the two.
        directory = os.path.dirname(path) or "."
        mode = os.stat(path).st_mode & 0o7777
        fd, tmp = tempfile.mkstemp(dir=directory, suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as fh:
                fh.write(new_text)
            os.chmod(tmp, mode)
            os.replace(tmp, path)
        except BaseException:
            os.path.exists(tmp) and os.unlink(tmp)
            raise
        print(f"Regenerated: {path}")

apply_to_file(init_core_path)
if init_vendored_path and os.path.isfile(init_vendored_path):
    apply_to_file(init_vendored_path)
PY

# --- plugin-only command copies -------------------------------------------
for cmd in init-project rebase-project; do
    src="$REPO_ROOT/packages/core/commands/${cmd}.md"
    dst="$PLUGIN_ONLY_DIR/${cmd}.md"
    [[ -f "$src" ]] || continue

    if [[ -L "$dst" ]]; then
        echo "ERROR: $dst is a SYMLINK. Claude Code will not load plugin commands" >&2
        echo "       through symlinks — the plugin silently exposes zero commands." >&2
        exit 1
    fi

    if [[ ! -f "$dst" ]] || ! cmp -s "$src" "$dst"; then
        if [[ "$CHECK" == "true" ]]; then
            echo "DRIFT: $dst is stale relative to $src" >&2
            exit 1
        fi
        cp "$src" "$dst"
        echo "Synced: $dst"
    fi
done
