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

# D5 / ENSEMBLE_DISCIPLINE_JUDGE_DISABLE was dropped in 4.1.11 together with
# the regex hooks it rolled back to (DISC-B009, TRD §4.4.1). The lever
# regenerated every hookType:"prompt" entry as command-type, pointing at
# .claude/hooks/<file> — but those .js files were never delivered to a
# scaffolded project under ANY setting of the variable, because the symlink
# loop below prunes packages/full/hooks/<file> for prompt-type entries and
# scaffold-project.sh copies through that directory. The lever therefore
# emitted command hooks pointing at files that existed only in this
# monorepo checkout. Restoring the regexes is a git revert, not an env var.
#
# ---------------------------------------------------------------------------
# 1. Template settings.json — regenerate the "hooks" key only.
# ---------------------------------------------------------------------------

CD_WRAPPER = 'cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"'

# packages/core/hooks/prompts/ — sibling of the manifest itself. Prompt text
# for hookType:"prompt" entries lives here as its own file (see the
# manifest's own $comment for why: DISC-B004 iterates that text
# independently, and a multi-paragraph prompt as an escaped JSON string is
# unreviewable in a diff).
PROMPTS_DIR = os.path.join(os.path.dirname(manifest_path), "prompts")

def fail(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)

def load_prompt_text(h):
    prompt_file = h.get("promptFile")
    if not prompt_file:
        fail(f"manifest hook {h.get('file')!r} has hookType:\"prompt\" but no 'promptFile'")
    # Same flat-basename discipline scaffold-project.sh applies to "file" —
    # promptFile is resolved under a fixed directory, so a "/", "\\", or ".."
    # component must never reach the join.
    if "/" in prompt_file or "\\" in prompt_file or ".." in prompt_file or prompt_file != os.path.basename(prompt_file):
        fail(f"manifest hook {h.get('file')!r} 'promptFile' must be a flat basename (no '/', '\\\\', or '..'): {prompt_file!r}")
    path = os.path.join(PROMPTS_DIR, prompt_file)
    if not os.path.isfile(path):
        fail(f"manifest hook {h.get('file')!r} 'promptFile' not found: {path}")
    with open(path) as fh:
        return fh.read().rstrip("\n")

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
                hook_type = h.get("hookType", "command")
                if hook_type == "command":
                    command = f"bash -c '{CD_WRAPPER} && .claude/hooks/{h['file']}'"
                    hook_cmds.append({
                        "type": "command",
                        "command": command,
                        "timeout": h["timeout"],
                    })
                elif hook_type == "prompt":
                    # continueOnBlock is deliberately never emitted here — see
                    # the manifest's own $comment: it is a no-op on Stop and
                    # SubagentStop (the only events any hook in this manifest
                    # registers on), verified against the CLI's own source in
                    # docs/modernization/probes/U3-loop-bound.md §1. The loop
                    # bound for a prompt hook is the stop_hook_active
                    # self-check, which belongs in the prompt text itself,
                    # not in this generator.
                    entry = {
                        "type": "prompt",
                        "prompt": load_prompt_text(h),
                        "timeout": h["timeout"],
                    }
                    if h.get("model"):
                        entry["model"] = h["model"]
                    if h.get("if"):
                        entry["if"] = h["if"]
                    hook_cmds.append(entry)
                else:
                    fail(
                        f"manifest hook {h.get('file')!r} has unknown hookType "
                        f"{hook_type!r} — expected \"command\" or \"prompt\""
                    )
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

def delivered_path(h):
    # What a scaffolded project actually receives for this entry. A
    # hookType:"prompt" entry has NO runtime script — its only delivered
    # artifact is .claude/hooks/prompts/<promptFile> (copy_hook_prompts() in
    # scaffold-project.sh). Rendering its "file" here as
    # `.claude/hooks/<file>.js` told the reader to go look at a path that has
    # never existed in a scaffolded project; that was tolerable only while
    # the D5 rollback lever could resurrect the script, and D5 is gone
    # (4.1.11). "file" survives as the manifest's entry IDENTIFIER — it is
    # the dedupe key in three generators, the conflicting-source check's key,
    # and the source of the row title — but it is no longer rendered as a
    # path for prompt-type entries.
    if h.get("hookType") == "prompt":
        return f".claude/hooks/prompts/{h['promptFile']}"
    return f".claude/hooks/{h['file']}"

event_hooks = [h for h in hooks if h.get("event") is not None]
other_hooks = [h for h in hooks if h.get("event") is None]

# A file can register on several events (dispatch-ledger.js), so the number of
# ROWS below is not the number of FILES on disk. Say both rather than print a
# count that contradicts `ls`.
# Count DELIVERED artifacts, not manifest "file" identifiers — for a
# prompt-type entry the delivered artifact is its promptFile. They happen to
# be 1:1 today, but counting what is rendered keeps the header honest by
# construction rather than by coincidence.
distinct_files = len({delivered_path(h) for h in event_hooks})
if distinct_files == len(event_hooks):
    header = f"Check these hooks in `.claude/hooks/` ({distinct_files} total):"
else:
    header = (
        f"Check these hooks in `.claude/hooks/` ({distinct_files} files, "
        f"{len(event_hooks)} event registrations):"
    )
lines = [header]
for i, h in enumerate(event_hooks, start=1):
    title = title_for(h["file"], h["event"])
    desc = clean_description(h["description"])
    lines.append(
        f"{i}. **{title}** (`{h['event']}`) — `{delivered_path(h)}` ({desc})"
    )
lines.append("")

if other_hooks:
    parts = []
    for h in other_hooks:
        desc = clean_description(h["description"])
        parts.append(f"`{delivered_path(h)}` (not event-registered — {desc})")
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

# --- packages/full/hooks/ symlinks -----------------------------------------
#
# The plugin-cache layout resolves hooks from $PLUGIN_DIR/hooks/, so a hook
# that exists in packages/core/hooks/ but has no link here is simply NOT
# DELIVERED to anyone who installed the plugin — while every local test keeps
# passing, because the monorepo layout reads from packages/core/ directly.
#
# That silent-absence failure has now happened repeatedly in this project —
# hooks that were never shipped, a helper library left behind, an affinity
# table that never reached the plugin, and command copies that Claude Code
# refused to load. Deriving these links from the manifest is what stops
# "add a hook, forget the link" from being a thing a human can do at all.
#
# NOTE: symlinks are correct HERE (hooks are executed by path, and
# scaffold-project.sh copies through them), unlike plugin-only commands above,
# which Claude Code refuses to load through a symlink.
FULL_HOOKS_DIR="$REPO_ROOT/packages/full/hooks"
if [[ -d "$FULL_HOOKS_DIR" ]]; then
    while IFS=$'\t' read -r hookfile hooksource; do
        [[ -z "$hookfile" ]] && continue
        dst="$FULL_HOOKS_DIR/$hookfile"
        # Link target is relative to packages/full/hooks/ — e.g.
        # packages/core/hooks/x.js  ->  ../../core/hooks/x.js
        target="../../${hooksource#packages/}"

        if [[ -L "$dst" ]] && [[ "$(readlink "$dst")" == "$target" ]]; then
            continue
        fi
        if [[ "$CHECK" == "true" ]]; then
            # -e follows symlinks, so a DANGLING link is not "missing" —
            # test -L first or the message misreports a broken link as absent.
            if [[ -L "$dst" ]]; then
                echo "DRIFT: $dst points at '$(readlink "$dst")', expected '$target'" >&2
            elif [[ ! -e "$dst" ]]; then
                echo "DRIFT: $dst is missing — shippable hook not delivered to the plugin" >&2
            else
                echo "DRIFT: $dst is a regular file, expected a symlink to $target" >&2
            fi
            exit 1
        fi
        rm -f "$dst"
        ln -s "$target" "$dst"
        echo "Linked: $dst -> $target"
    done < <(python3 -c '
import json, sys
manifest = json.load(open(sys.argv[1]))
seen = set()
for h in manifest.get("hooks", []):
    if not h.get("shippable"):
        continue
    # A hookType:"prompt" entry has no runtime script at .claude/hooks/<file>
    # to link — its shippable artifact is promptFile, handled below, and its
    # "file" is an identifier rather than a path (no such source file exists
    # as of 4.1.11). Linking it would create a dangling symlink.
    if h.get("hookType") == "prompt":
        continue
    f = h["file"]
    if f in seen:
        continue
    seen.add(f)
    print(f + "\t" + (h.get("source") or "packages/core/hooks/" + f))
' "$MANIFEST")

    # --- prune stale packages/full/hooks/ symlinks -------------------------
    #
    # The loop above only ever ADDS or CORRECTS links for entries currently
    # in the expected set — it never notices a link left behind by an entry
    # that used to be in that set and no longer is. DISC-B008 hit this
    # directly: async-discipline.js, autonomy-discipline.js, and
    # subagent-discipline.js flipped from hookType "command" to "prompt",
    # dropping out of the expected set, but their pre-existing symlinks here
    # were never removed by anything — a silent-leftover mirror of the
    # silent-absence failure the rest of this section's comment describes.
    # Only prune symlinks THIS generator manages (pointing back into
    # packages/core/, matching the ../../<pkg>/... shape built above);
    # anything else in the directory (hooks.json, hooks.manifest.json,
    # README.md, lib/, prompts/) is left alone.
    mapfile -t expected_files < <(python3 -c '
import json, sys
manifest = json.load(open(sys.argv[1]))
seen = set()
for h in manifest.get("hooks", []):
    if not h.get("shippable"):
        continue
    if h.get("hookType") == "prompt":
        continue
    if h["file"] not in seen:
        seen.add(h["file"])
        print(h["file"])
' "$MANIFEST")
    for entry in "$FULL_HOOKS_DIR"/*; do
        [[ -e "$entry" || -L "$entry" ]] || continue
        base="$(basename "$entry")"
        # Non-hook infra this loop does not own — same exclude set the T007
        # "no missing, no extra" test uses (hooks.json/hooks.manifest.json/
        # README.md are copied or symlinked by other mechanisms; lib/ and
        # prompts/ are directories, not per-hook entries).
        case "$base" in
            hooks.json|hooks.manifest.json|README.md|lib|prompts) continue ;;
        esac
        [[ -L "$entry" ]] || continue
        case "$(readlink "$entry")" in
            ../../*) ;;   # generator-managed shape; eligible for pruning
            *) continue ;;
        esac
        found=false
        for f in "${expected_files[@]}"; do
            [[ "$f" == "$base" ]] && { found=true; break; }
        done
        [[ "$found" == "true" ]] && continue
        if [[ "$CHECK" == "true" ]]; then
            echo "DRIFT: $entry is a stale symlink (points at '$(readlink "$entry")', no longer a shippable command-type hook)" >&2
            exit 1
        fi
        rm -f "$entry"
        echo "Pruned stale link: $entry"
    done

    # --- packages/full/hooks/prompts/ symlinks -----------------------------
    #
    # Same rationale, one level deeper: a shippable hookType:"prompt" entry's
    # promptFile lives at packages/core/hooks/prompts/<promptFile> and must
    # reach the plugin-cache layout the same way "file" does above, or the
    # prompt hook is silently missing its prompt text for anyone who
    # installed the plugin rather than checked out the monorepo.
    # Do not create packages/full/hooks/prompts/ in --check mode — --check
    # must never mutate the filesystem, even to prepare a directory for a
    # comparison that is about to fail anyway (a missing dir just means
    # every prompt-file symlink below reports DRIFT, which is correct).
    [[ "$CHECK" == "true" ]] || mkdir -p "$FULL_HOOKS_DIR/prompts"
    while IFS=$'\t' read -r promptfile; do
        [[ -z "$promptfile" ]] && continue
        dst="$FULL_HOOKS_DIR/prompts/$promptfile"
        # packages/full/hooks/prompts/X -> packages/core/hooks/prompts/X
        target="../../../core/hooks/prompts/$promptfile"

        if [[ -L "$dst" ]] && [[ "$(readlink "$dst")" == "$target" ]]; then
            continue
        fi
        if [[ "$CHECK" == "true" ]]; then
            if [[ -L "$dst" ]]; then
                echo "DRIFT: $dst points at '$(readlink "$dst")', expected '$target'" >&2
            elif [[ ! -e "$dst" ]]; then
                echo "DRIFT: $dst is missing — shippable prompt file not delivered to the plugin" >&2
            else
                echo "DRIFT: $dst is a regular file, expected a symlink to $target" >&2
            fi
            exit 1
        fi
        rm -f "$dst"
        ln -s "$target" "$dst"
        echo "Linked: $dst -> $target"
    done < <(python3 -c '
import json, sys
manifest = json.load(open(sys.argv[1]))
seen = set()
for h in manifest.get("hooks", []):
    if not h.get("shippable") or h.get("hookType") != "prompt":
        continue
    p = h.get("promptFile")
    if not p or p in seen:
        continue
    seen.add(p)
    print(p)
' "$MANIFEST")
fi
