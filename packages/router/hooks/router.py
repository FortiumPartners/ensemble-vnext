#!/usr/bin/env python3
"""
UserPromptSubmit Router Hook for Claude Code.

Injects a framework-orientation reminder on qualifying user prompts.

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
import sys
import time
from dataclasses import dataclass


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

* FLOW. Something broken, or a small scoped change? -> /fix <what>: it
  investigates, root-causes, writes a light TRD, audits it, then implements and
  verifies when the fix is demonstrably safe. PROPOSE /fix instead of patching
  inline - an unplanned edit is the commonest source of bad code here.
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


def should_skip(prompt: str, cwd: str) -> str:
    """Return a reason string when the reminder should be suppressed, else "".

    Three deterministic conditions. Deliberately no keyword matching - that is
    what misfired before and got the original routing removed.

    1. Empty prompt (resumed or blank submission) - nothing to orient.
    2. Slash-command prompt - the command carries its own instructions, often
       hundreds of lines of them. Injecting "prefer the framework's machinery"
       alongside /implement-trd is pure redundancy on exactly the turns where
       the framework is already driving.
    3. No ensemble scaffolding in the project - nothing to drift away from, so
       the reminder would describe a workflow that does not exist here.
    """
    if not prompt.strip():
        return "empty prompt"

    if prompt.lstrip().startswith("/"):
        return "slash command carries its own instructions"

    if cwd:
        root = os.path.abspath(cwd)
        markers = (
            os.path.join(root, ".claude", "rules"),
            os.path.join(root, ".trd-state"),
        )
        if not any(os.path.isdir(m) for m in markers):
            return "no ensemble scaffolding in project"

    return ""


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

        skip_reason = should_skip(prompt, cwd)
        hint = "" if skip_reason else FRAMEWORK_HINT
        log_debug(
            config,
            f"prompt={len(prompt)} chars; "
            + (f"skipped ({skip_reason})" if skip_reason else "injecting hint"),
        )
        write_output(build_output(hint))
    except Exception as e:  # never block the prompt
        log_error(f"Unexpected error: {type(e).__name__}: {e}")
        write_output(build_output(""))

    sys.exit(0)


if __name__ == "__main__":
    main()
