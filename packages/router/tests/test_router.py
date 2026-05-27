#!/usr/bin/env python3
"""
Tests for the slimmed UserPromptSubmit router hook.

The router no longer does keyword matching; it injects a single static
"leverage the framework" reminder. These tests cover the retained helpers and
drive the hook end-to-end as a real hook (subprocess + stdin), so they stay
decoupled from internal implementation details.

Run with: python -m pytest tests/test_router.py -v
"""

import json
import os
import subprocess
import sys

import pytest

HOOKS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "hooks"
)
ROUTER_PATH = os.path.join(HOOKS_DIR, "router.py")
sys.path.insert(0, HOOKS_DIR)

from router import (  # noqa: E402
    Config,
    FRAMEWORK_HINT,
    build_output,
    load_config,
    read_input,
)


def run_hook(stdin: str, env_overrides=None):
    """Invoke router.py as a real hook; return (exit_code, parsed_stdout_json)."""
    env = os.environ.copy()
    # Clear router env so the parent's settings don't leak into the test.
    for key in ("ROUTER_DEBUG", "ROUTER_DISABLE"):
        env.pop(key, None)
    if env_overrides:
        env.update(env_overrides)
    proc = subprocess.run(
        [sys.executable, ROUTER_PATH],
        input=stdin,
        capture_output=True,
        text=True,
        env=env,
    )
    parsed = json.loads(proc.stdout) if proc.stdout.strip() else None
    return proc.returncode, parsed


def context_of(output: dict) -> str:
    return output["hookSpecificOutput"]["additionalContext"]


# === load_config ===
class TestConfig:
    def test_defaults(self, monkeypatch):
        monkeypatch.delenv("ROUTER_DEBUG", raising=False)
        monkeypatch.delenv("ROUTER_DISABLE", raising=False)
        cfg = load_config()
        assert cfg.debug is False
        assert cfg.disabled is False

    @pytest.mark.parametrize("val", ["1", "true", "TRUE", "yes", "on"])
    def test_debug_truthy(self, monkeypatch, val):
        monkeypatch.setenv("ROUTER_DEBUG", val)
        assert load_config().debug is True

    @pytest.mark.parametrize("val", ["0", "false", "", "no"])
    def test_debug_falsy(self, monkeypatch, val):
        monkeypatch.setenv("ROUTER_DEBUG", val)
        assert load_config().debug is False

    def test_disable_truthy(self, monkeypatch):
        monkeypatch.setenv("ROUTER_DISABLE", "1")
        assert load_config().disabled is True


# === read_input ===
class _Stdin:
    def __init__(self, data):
        self._data = data

    def read(self):
        return self._data


class TestReadInput:
    def test_valid_json(self, monkeypatch):
        monkeypatch.setattr("sys.stdin", _Stdin('{"prompt": "hi", "cwd": "/x"}'))
        assert read_input() == {"prompt": "hi", "cwd": "/x"}

    def test_empty(self, monkeypatch):
        monkeypatch.setattr("sys.stdin", _Stdin(""))
        assert read_input() == {}

    def test_invalid_json(self, monkeypatch):
        monkeypatch.setattr("sys.stdin", _Stdin("{not json"))
        assert read_input() == {}

    def test_non_object_json(self, monkeypatch):
        monkeypatch.setattr("sys.stdin", _Stdin("[1, 2, 3]"))
        assert read_input() == {}


# === build_output ===
class TestBuildOutput:
    def test_envelope(self):
        out = build_output("hello")
        assert out == {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": "hello",
            }
        }


# === end-to-end (subprocess) ===
class TestEndToEnd:
    def test_non_empty_prompt_injects_hint(self):
        code, out = run_hook('{"prompt": "implement the login endpoint"}')
        assert code == 0
        assert out["hookSpecificOutput"]["hookEventName"] == "UserPromptSubmit"
        assert context_of(out) == FRAMEWORK_HINT

    def test_empty_prompt_no_hint(self):
        code, out = run_hook('{"prompt": ""}')
        assert code == 0
        assert context_of(out) == ""

    def test_whitespace_prompt_no_hint(self):
        code, out = run_hook('{"prompt": "   \\n  "}')
        assert code == 0
        assert context_of(out) == ""

    def test_missing_prompt_key_no_hint(self):
        code, out = run_hook('{"cwd": "/x"}')
        assert code == 0
        assert context_of(out) == ""

    def test_disable_suppresses_hint(self):
        code, out = run_hook(
            '{"prompt": "do something"}', env_overrides={"ROUTER_DISABLE": "1"}
        )
        assert code == 0
        assert context_of(out) == ""

    def test_invalid_stdin_exits_clean(self):
        code, out = run_hook("{ totally not json")
        assert code == 0
        assert context_of(out) == ""

    def test_empty_stdin_exits_clean(self):
        code, out = run_hook("")
        assert code == 0
        assert context_of(out) == ""

    def test_output_is_valid_json(self):
        proc = subprocess.run(
            [sys.executable, ROUTER_PATH],
            input='{"prompt": "x"}',
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 0
        json.loads(proc.stdout)  # parseable

    def test_hint_mentions_framework_machinery(self):
        # Guard the reminder's intent without pinning exact wording too tightly.
        assert "subagents" in FRAMEWORK_HINT.lower()
        assert "skill" in FRAMEWORK_HINT.lower()
        assert ".claude/rules" in FRAMEWORK_HINT


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
