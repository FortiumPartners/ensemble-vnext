#!/usr/bin/env python3
"""
UserPromptSubmit Router Hook for Claude Code.

Injects a single static "leverage the framework" reminder on each user prompt.

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


# === The static reminder injected on each prompt ===
FRAMEWORK_HINT = """ENSEMBLE FRAMEWORK ACTIVE — prefer the framework's own machinery over ad-hoc work:
- Delegate implementation, verification, and review to the specialized subagents
  (frontend-/backend-/mobile-implementer, verify-app, code-simplifier, code-reviewer,
  app-debugger, devops-engineer, cicd-specialist) instead of doing that work inline.
- Invoke relevant Skills via the Skill tool, and follow .claude/rules/
  (constitution.md, stack.md, process.md).
- For feature work use the workflow commands (/create-prd -> /create-trd ->
  /implement-trd); check .trd-state/ for in-flight work before starting something new.
Use judgment — skip this for trivial edits or purely informational replies."""


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

        # No reminder for empty prompts (e.g. resumed/blank submissions).
        hint = FRAMEWORK_HINT if prompt.strip() else ""
        log_debug(config, f"prompt={len(prompt)} chars; injecting hint={bool(hint)}")
        write_output(build_output(hint))
    except Exception as e:  # never block the prompt
        log_error(f"Unexpected error: {type(e).__name__}: {e}")
        write_output(build_output(""))

    sys.exit(0)


if __name__ == "__main__":
    main()
