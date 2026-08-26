#!/usr/bin/env python3
"""
UserPromptSubmit Router Hook for Claude Code.

Injects a framework-orientation reminder on qualifying user prompts, and — as of
AJCS-B003 — an `ENSEMBLE_COMMAND` command-state marker ahead of it. The marker
carries the session's command-run state (`active` / `none` / `unknown`) across
to the `Stop` judge via `additionalContext`, so the autonomy-discipline judgment
can be scoped to turns where a workflow command is actually running
(`docs/TRD/autonomy-judge-command-scope.md`).

This hook used to perform keyword matching against router-rules.json to suggest
specific subagents/skills per prompt. That approach predates Claude Code's native
description-based skill/agent selection, and it misfired on analysis/planning turns
(e.g. recommending an implementer + test skill for a pure research question).

It is now a lightweight, deterministic focus nudge: it reminds the model to prefer
the ensemble framework's machinery (subagents, skills, commands, rules) and to use
judgment about when that applies. Native selection — driven by agent/skill
`description` + `when_to_use` frontmatter — does the actual routing.

Zero dependencies - uses only Python stdlib.

Environment Variables:
    ROUTER_DEBUG:   Enable debug logging to stderr (default: 0)
    ROUTER_DISABLE: Set to 1/true to suppress the reminder entirely (default: 0)

Exit Codes:
    Always exits with 0 to never block user prompts.
"""

import json
import os
import re
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone


# === The reminder injected on qualifying prompts ===
#
# Purpose, re-confirmed from the original design: turn a raw request like
# "build me a login page" into guidance down the framework's core path, without
# the user having to remember the flow or re-state it every session.
#
# What this deliberately does NOT do: name specific agents or skills by keyword.
# That was the original behaviour and it misfired — recommending an implementer
# and a test skill for a pure research question. Native description-based
# selection routes better than any keyword table. This names the CHOICE to make,
# not the answer.
FRAMEWORK_HINT = """ENSEMBLE — orient before answering:

* FLOW. Bug, minor enhancement, or refactor - anything where the full PRD/TRD
  pipeline is overkill for the risk? -> /investigate <what>: it investigates,
  writes a light TRD, audits it, then implements and verifies when it is
  demonstrably safe, and only with --implement. PROPOSE /investigate instead of
  prompting-and-editing - an unplanned edit is the commonest source of bad code
  here.
  New feature -> /create-prd -> /create-trd -> /implement-trd (review, hardening
  and verification run INSIDE it; --verify adds the functional loop) ->
  /audit-build. /verify-build re-runs verification alone; /refine-prd and
  /refine-trd iterate an artifact. Check .trd-state/current.json first.

* SKILLS + SUBAGENTS. Scan the available skills for one that fits this task and
  invoke it rather than reasoning from memory. Then decide deliberately whether this
  is subagent work - the orchestrator holds the plan, subagents do the work and
  return results - or small enough to do inline.

* GOVERNANCE. Check project memory and .claude/rules/ (constitution.md, stack.md,
  process.md). Assess the request against them, and say so plainly if it conflicts
  rather than quietly proceeding.

* PROPORTION. This is orientation, not ceremony. Conversational, informational and
  trivial turns need none of it - answer directly and move on.

* CLOSE THE TURN. End with clear, actionable next steps - unless there genuinely
  aren't any, in which case say so rather than inventing work to look thorough.

* DECIDE, DON'T DEFER. Do not dress an obvious, low-risk next step up as a question.
  If you can make the call from what is in front of you, make it, state what you did
  and why, and move on. Ask only when you genuinely need something only the user has:
  a real ambiguity, missing information you cannot derive, or an irreversible action."""


@dataclass
class Config:
    debug: bool = False
    disabled: bool = False


def _is_truthy(value: str) -> bool:
    return value.strip().lower() in ("1", "true", "yes", "on")


def load_config() -> Config:
    """Read configuration from environment variables."""
    return Config(
        debug=_is_truthy(os.environ.get("ROUTER_DEBUG", "0")),
        disabled=_is_truthy(os.environ.get("ROUTER_DISABLE", "0")),
    )


def log_debug(config: Config, message: str) -> None:
    if config.debug:
        timestamp = time.strftime("%H:%M:%S")
        print(f"[ROUTER DEBUG {timestamp}] {message}", file=sys.stderr)


def log_error(message: str) -> None:
    timestamp = time.strftime("%H:%M:%S")
    print(f"[ROUTER ERROR {timestamp}] {message}", file=sys.stderr)


def read_input() -> dict:
    """Read and parse the hook's JSON input from stdin. Returns {} on any problem."""
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return {}
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, ValueError):
        return {}


def write_output(output: dict) -> None:
    """Emit the hook's JSON output on stdout."""
    print(json.dumps(output))


def build_output(additional_context: str) -> dict:
    """Wrap context in the UserPromptSubmit hook output envelope."""
    return {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": additional_context,
        }
    }


def is_empty_prompt(prompt: str) -> bool:
    """True when the prompt is blank (resumed or empty submission)."""
    return not prompt.strip()


def is_slash_command(prompt: str) -> bool:
    """True when the prompt is a slash-command invocation."""
    return prompt.lstrip().startswith("/")


def is_scaffolded(cwd: str) -> bool:
    """True when `cwd` looks like an ensemble-scaffolded project.

    A falsy `cwd` can't be checked, so it's treated as scaffolded — this
    matches the historical `should_skip` behaviour of skipping the check
    entirely when `cwd` is absent.
    """
    if not cwd:
        return True
    root = os.path.abspath(cwd)
    markers = (
        os.path.join(root, ".claude", "rules"),
        os.path.join(root, ".trd-state"),
    )
    return any(os.path.isdir(m) for m in markers)


def should_skip(prompt: str, cwd: str) -> str:
    """Return a reason string when the FRAMEWORK_HINT should be suppressed, else "".

    Three deterministic conditions, checked via the helpers above. Deliberately
    no keyword matching - that is what misfired before and got the original
    routing removed.

    1. Empty prompt (resumed or blank submission) - nothing to orient.
    2. Slash-command prompt - the command carries its own instructions, often
       hundreds of lines of them. Injecting "prefer the framework's machinery"
       alongside /implement-trd is pure redundancy on exactly the turns where
       the framework is already driving.
    3. No ensemble scaffolding in the project - nothing to drift away from, so
       the reminder would describe a workflow that does not exist here.

    NOTE: this function's short-circuit (condition 2 returns before condition 3
    is ever evaluated) is correct for the HINT decision, but must NOT be reused
    to decide whether the ENSEMBLE_COMMAND marker is suppressed — see
    `main()`, which evaluates `is_empty_prompt` / `is_scaffolded` independently
    of `is_slash_command` for that reason.
    """
    if is_empty_prompt(prompt):
        return "empty prompt"

    if is_slash_command(prompt):
        return "slash command carries its own instructions"

    if not is_scaffolded(cwd):
        return "no ensemble scaffolding in project"

    return ""


# === Command-state marker (AJCS-B003) ===
#
# `.trd-state/_command-runs/<session-id>.json` is the only signal that
# distinguishes "a workflow command is running now" from "this feature is
# current" (`current.json` and `phase_cursor` are persistent pointers that
# can name completed work). router.py is one of its two writers: it records
# a run OPENING when the submitted prompt is a slash command.
# `notify-complete.sh` (AJCS-B004) is the other writer; it records the run
# CLOSING on the command's COMPLETE/STUCK turn. Neither writer reads the
# other's history — the file holds current state, not a log.

_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")


def sanitize_session_id(session_id: object) -> str:
    """Return `session_id` if it is a safe path component, else "".

    Mirrors the sanitisation `session-context.js` already applies before
    exporting `CLAUDE_SESSION_ID` (`/^[A-Za-z0-9_.\\-]+$/`) — session ids
    reach the filesystem as part of a path, so anything else is rejected
    rather than used.
    """
    if isinstance(session_id, str) and _SESSION_ID_RE.match(session_id):
        return session_id
    return ""


def command_run_state_path(cwd: str, session_id: str) -> str:
    """Path to the per-session command-run state file."""
    root = os.path.abspath(cwd) if cwd else os.getcwd()
    return os.path.join(root, ".trd-state", "_command-runs", f"{session_id}.json")


def read_command_run_state(path: str) -> tuple:
    """Read the run-state file at `path`.

    Returns a (state, command, feature) tuple:
    - Missing file -> ("none", None, None): no run has ever been recorded for
      this session, which reads the same as "nothing is running".
    - Unreadable or malformed content -> ("unknown", None, None): degrade
      toward the guard being ON rather than silently disabling it (D12).
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
    except FileNotFoundError:
        return "none", None, None
    except OSError:
        return "unknown", None, None

    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return "unknown", None, None

    if not isinstance(data, dict) or data.get("state") not in ("active", "none"):
        return "unknown", None, None

    if data.get("state") == "active":
        return "active", data.get("command"), data.get("feature")
    return "none", None, None


def write_command_run_state(path: str, state: dict) -> bool:
    """Atomically write `state` to `path` (temp file + rename).

    Returns True on success, False on any failure — the caller degrades to
    `state=unknown` rather than propagating the exception (NFR-1 keeps the
    single exception handler in `main()` reserved for the truly unexpected).
    """
    try:
        directory = os.path.dirname(path)
        os.makedirs(directory, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=".tmp-", suffix=".json")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(state, f)
            os.replace(tmp_path, path)
        except Exception:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
        return True
    except Exception:
        return False


def derive_feature(cwd: str) -> str:
    """Return the in-flight feature name from `.trd-state/current.json`, or "".

    Matches the convention already used by `notify-complete.sh`'s
    `NOTIFY_FEATURE`: the basename of the `trd` path, minus its extension.
    """
    try:
        root = os.path.abspath(cwd) if cwd else os.getcwd()
        current_path = os.path.join(root, ".trd-state", "current.json")
        with open(current_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        trd = data.get("trd", "") if isinstance(data, dict) else ""
        if not trd:
            return ""
        name, _ext = os.path.splitext(os.path.basename(trd))
        return name
    except Exception:
        return ""


# A marker value must be a single whitespace-free, `=`-free token, or it stops
# being one `key=value` field and becomes several. `command` is already safe by
# construction (it is `prompt.split()[0]`), but `feature` is the basename of a
# path read from `.trd-state/current.json` — a TRD filename containing a space
# would let a crafted `feature=` value append a second, forged
# `state=... session=...` pair to the line the judge parses. Values that fail
# the check are dropped rather than escaped: the field is optional, so losing
# it degrades the marker's detail, never its structure.
_MARKER_VALUE_RE = re.compile(r"^[^\s=]+$")


def is_safe_marker_value(value: object) -> bool:
    """True when `value` can appear as a marker field value without splitting it."""
    return isinstance(value, str) and bool(_MARKER_VALUE_RE.match(value))


def build_marker(session_marker: str, state: str, command=None, feature=None) -> str:
    """Build the one-line `ENSEMBLE_COMMAND` marker (D2).

    `command=` and `feature=` are included only when `state == "active"`, the
    respective value is known, and it is a safe single token.
    """
    parts = [f"ENSEMBLE_COMMAND state={state}", f"session={session_marker}"]
    if state == "active":
        if command and is_safe_marker_value(command):
            parts.append(f"command={command}")
        if feature and is_safe_marker_value(feature):
            parts.append(f"feature={feature}")
    return " ".join(parts)


def resolve_marker_fields(prompt: str, cwd: str, raw_session_id: object) -> tuple:
    """Compute (state, command, feature, session_marker) for this prompt.

    On a slash-command prompt with a usable session id, this WRITES the
    `active` run-state record (the router is the state's opening writer) and
    reflects that write back in the returned state. A write failure degrades
    to "unknown" rather than reporting a stale/incorrect "active".

    Never raises: an invalid or missing session id degrades to
    `session_marker="unknown"` / `state="unknown"`, which the Stop judge
    treats as "cannot match this session" (D5) — the session id simply never
    reaches the filesystem (OBJ-SEC1).
    """
    session_id = sanitize_session_id(raw_session_id)
    session_marker = session_id if session_id else "unknown"

    if not session_id:
        return "unknown", None, None, session_marker

    if is_slash_command(prompt):
        command = prompt.strip().split()[0]
        feature = derive_feature(cwd) or None
        state_record = {
            "state": "active",
            "command": command,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        if feature:
            state_record["feature"] = feature
        path = command_run_state_path(cwd, session_id)
        if write_command_run_state(path, state_record):
            return "active", command, feature, session_marker
        return "unknown", None, None, session_marker

    path = command_run_state_path(cwd, session_id)
    state, command, feature = read_command_run_state(path)
    return state, command, feature, session_marker


def main() -> None:
    """Main entry point for the router hook."""
    config = load_config()
    try:
        if config.disabled:
            log_debug(config, "ROUTER_DISABLE set; emitting empty context")
            write_output(build_output(""))
            sys.exit(0)

        input_data = read_input()
        prompt = input_data.get("prompt", "") if isinstance(input_data, dict) else ""
        cwd = input_data.get("cwd", "") if isinstance(input_data, dict) else ""
        raw_session_id = (
            input_data.get("session_id", "") if isinstance(input_data, dict) else ""
        )

        # The marker's own suppression conditions (empty prompt / unscaffolded
        # project) are evaluated independently of `should_skip()`'s slash-command
        # short-circuit — see the ordering note on `should_skip()`. A slash
        # prompt in an unscaffolded project must still emit nothing at all,
        # not a marker with no hint.
        if is_empty_prompt(prompt) or not is_scaffolded(cwd):
            log_debug(config, f"prompt={len(prompt)} chars; skipped (no marker)")
            write_output(build_output(""))
            sys.exit(0)

        state, command, feature, session_marker = resolve_marker_fields(
            prompt, cwd, raw_session_id
        )
        marker = build_marker(session_marker, state, command, feature)

        # D11: FRAMEWORK_HINT stays suppressed on slash prompts; only the
        # marker is newly emitted there. The hint decision stays delegated to
        # `should_skip()` so that function remains the single source of truth
        # for it — the two suppression conditions already handled above are
        # simply re-checked there and cannot change the outcome.
        skip_reason = should_skip(prompt, cwd)
        context = marker if skip_reason else f"{marker}\n\n{FRAMEWORK_HINT}"
        log_debug(
            config,
            f"prompt={len(prompt)} chars; state={state}; "
            + (f"hint skipped ({skip_reason})" if skip_reason else "injecting hint"),
        )
        write_output(build_output(context))
    except Exception as e:  # never block the prompt
        log_error(f"Unexpected error: {type(e).__name__}: {e}")
        write_output(build_output(""))

    sys.exit(0)


if __name__ == "__main__":
    main()
