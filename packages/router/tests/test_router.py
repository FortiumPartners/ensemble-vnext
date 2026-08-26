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
    build_marker,
    build_output,
    command_run_state_path,
    derive_feature,
    is_empty_prompt,
    is_scaffolded,
    is_slash_command,
    load_config,
    read_command_run_state,
    read_input,
    resolve_marker_fields,
    sanitize_session_id,
    should_skip,
    write_command_run_state,
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


@pytest.fixture
def scaffolded_project(tmp_path):
    """A tmp_path that satisfies `is_scaffolded()` (has `.claude/rules/`)."""
    (tmp_path / ".claude" / "rules").mkdir(parents=True)
    return tmp_path


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


# === is_empty_prompt / is_slash_command / is_scaffolded ===
class TestPromptPredicates:
    @pytest.mark.parametrize("prompt", ["", "   ", "\n\t  \n"])
    def test_is_empty_prompt_true(self, prompt):
        assert is_empty_prompt(prompt) is True

    @pytest.mark.parametrize("prompt", ["hi", "  /implement-trd  ", "x"])
    def test_is_empty_prompt_false(self, prompt):
        assert is_empty_prompt(prompt) is False

    @pytest.mark.parametrize("prompt", ["/implement-trd", "  /fix now"])
    def test_is_slash_command_true(self, prompt):
        assert is_slash_command(prompt) is True

    @pytest.mark.parametrize("prompt", ["implement the login page", "not / a command"])
    def test_is_slash_command_false(self, prompt):
        assert is_slash_command(prompt) is False

    def test_is_scaffolded_true_with_rules_dir(self, scaffolded_project):
        assert is_scaffolded(str(scaffolded_project)) is True

    def test_is_scaffolded_true_with_trd_state_dir(self, tmp_path):
        (tmp_path / ".trd-state").mkdir()
        assert is_scaffolded(str(tmp_path)) is True

    def test_is_scaffolded_false_when_neither_marker_present(self, tmp_path):
        assert is_scaffolded(str(tmp_path)) is False

    def test_is_scaffolded_true_when_cwd_falsy(self):
        # Historical should_skip behaviour: an absent cwd can't be checked,
        # so it is treated as scaffolded rather than blocking the hint/marker.
        assert is_scaffolded("") is True


# === should_skip (unchanged FRAMEWORK_HINT-suppression contract) ===
class TestShouldSkip:
    def test_empty_prompt_skipped(self):
        assert should_skip("", "/x") == "empty prompt"

    def test_slash_command_skipped(self):
        assert should_skip("/implement-trd", "/x") == (
            "slash command carries its own instructions"
        )

    def test_unscaffolded_skipped(self, tmp_path):
        assert should_skip("hello", str(tmp_path)) == (
            "no ensemble scaffolding in project"
        )

    def test_scaffolded_plain_prompt_not_skipped(self, scaffolded_project):
        assert should_skip("hello", str(scaffolded_project)) == ""


# === sanitize_session_id ===
class TestSanitizeSessionId:
    @pytest.mark.parametrize(
        "session_id",
        ["8f3c1a2b-0000-0000-0000-000000000000", "sess_01.abc-9", "a", "A1_b.2-C"],
    )
    def test_valid_ids_pass_through(self, session_id):
        assert sanitize_session_id(session_id) == session_id

    @pytest.mark.parametrize(
        "session_id",
        [
            "../../etc/passwd",
            "a/b",
            "a b",
            "sess;rm -rf",
            "$(whoami)",
            "",
            None,
            12345,
            ["a"],
        ],
    )
    def test_invalid_ids_rejected(self, session_id):
        assert sanitize_session_id(session_id) == ""


# === command_run_state_path ===
class TestCommandRunStatePath:
    def test_path_shape(self, tmp_path):
        path = command_run_state_path(str(tmp_path), "sess-1")
        assert path == str(
            tmp_path / ".trd-state" / "_command-runs" / "sess-1.json"
        )

    def test_falls_back_to_getcwd_when_cwd_falsy(self, monkeypatch, tmp_path):
        monkeypatch.chdir(tmp_path)
        path = command_run_state_path("", "sess-1")
        assert path == str(
            tmp_path / ".trd-state" / "_command-runs" / "sess-1.json"
        )


# === read_command_run_state ===
class TestReadCommandRunState:
    def test_missing_file_reads_as_none(self, tmp_path):
        path = str(tmp_path / "nope.json")
        assert read_command_run_state(path) == ("none", None, None)

    def test_active_file_reads_back(self, tmp_path):
        path = tmp_path / "state.json"
        path.write_text(
            json.dumps(
                {"state": "active", "command": "/implement-trd", "feature": "auth"}
            )
        )
        assert read_command_run_state(str(path)) == (
            "active",
            "/implement-trd",
            "auth",
        )

    def test_none_file_reads_back(self, tmp_path):
        path = tmp_path / "state.json"
        path.write_text(json.dumps({"state": "none"}))
        assert read_command_run_state(str(path)) == ("none", None, None)

    def test_malformed_json_reads_as_unknown(self, tmp_path):
        path = tmp_path / "state.json"
        path.write_text("{ not json at all")
        assert read_command_run_state(str(path)) == ("unknown", None, None)

    def test_non_object_json_reads_as_unknown(self, tmp_path):
        path = tmp_path / "state.json"
        path.write_text(json.dumps([1, 2, 3]))
        assert read_command_run_state(str(path)) == ("unknown", None, None)

    def test_unrecognised_state_value_reads_as_unknown(self, tmp_path):
        path = tmp_path / "state.json"
        path.write_text(json.dumps({"state": "definitely-not-a-real-state"}))
        assert read_command_run_state(str(path)) == ("unknown", None, None)


# === write_command_run_state ===
class TestWriteCommandRunState:
    def test_writes_and_is_readable(self, tmp_path):
        path = str(tmp_path / "_command-runs" / "sess.json")
        ok = write_command_run_state(path, {"state": "active", "command": "/x"})
        assert ok is True
        assert read_command_run_state(path) == ("active", "/x", None)

    def test_leaves_no_temp_file_behind(self, tmp_path):
        directory = tmp_path / "_command-runs"
        path = str(directory / "sess.json")
        write_command_run_state(path, {"state": "none"})
        assert sorted(os.listdir(directory)) == ["sess.json"]

    def test_failure_to_create_directory_returns_false(self, tmp_path):
        # A FILE sits where a directory needs to be created, so os.makedirs
        # fails deterministically on every platform.
        blocker = tmp_path / "blocked"
        blocker.write_text("not a directory")
        path = str(blocker / "sub" / "sess.json")
        ok = write_command_run_state(path, {"state": "active"})
        assert ok is False


# === derive_feature ===
class TestDeriveFeature:
    def test_reads_feature_from_current_json(self, tmp_path):
        (tmp_path / ".trd-state").mkdir()
        (tmp_path / ".trd-state" / "current.json").write_text(
            json.dumps({"trd": "docs/TRD/user-auth.md"})
        )
        assert derive_feature(str(tmp_path)) == "user-auth"

    def test_missing_current_json_returns_empty(self, tmp_path):
        assert derive_feature(str(tmp_path)) == ""

    def test_current_json_with_no_trd_key_returns_empty(self, tmp_path):
        (tmp_path / ".trd-state").mkdir()
        (tmp_path / ".trd-state" / "current.json").write_text(json.dumps({}))
        assert derive_feature(str(tmp_path)) == ""

    def test_malformed_current_json_returns_empty(self, tmp_path):
        (tmp_path / ".trd-state").mkdir()
        (tmp_path / ".trd-state" / "current.json").write_text("{ nope")
        assert derive_feature(str(tmp_path)) == ""


# === build_marker ===
class TestBuildMarker:
    def test_active_with_command_and_feature(self):
        assert build_marker("sid", "active", "/implement-trd", "auth") == (
            "ENSEMBLE_COMMAND state=active session=sid "
            "command=/implement-trd feature=auth"
        )

    def test_active_without_feature(self):
        assert build_marker("sid", "active", "/implement-trd", None) == (
            "ENSEMBLE_COMMAND state=active session=sid command=/implement-trd"
        )

    def test_none_state_omits_command_and_feature(self):
        assert build_marker("sid", "none", "/implement-trd", "auth") == (
            "ENSEMBLE_COMMAND state=none session=sid"
        )

    def test_unknown_state_omits_command_and_feature(self):
        assert build_marker("unknown", "unknown") == (
            "ENSEMBLE_COMMAND state=unknown session=unknown"
        )

    @pytest.mark.parametrize(
        "feature",
        [
            "auth state=none session=sid",  # forges a second state/session pair
            "auth\nstate=none session=sid",
            "a=b",
        ],
    )
    def test_feature_that_would_split_the_line_is_dropped(self, feature):
        # `feature` is the basename of a path read from current.json, so a
        # crafted TRD filename must not be able to append extra key=value
        # fields to the one line the judge parses (D2/D3).
        marker = build_marker("sid", "active", "/implement-trd", feature)
        assert marker == (
            "ENSEMBLE_COMMAND state=active session=sid command=/implement-trd"
        )
        assert marker.count("state=") == 1
        assert marker.count("session=") == 1


# === resolve_marker_fields ===
class TestResolveMarkerFields:
    def test_invalid_session_id_yields_unknown_and_writes_nothing(self, tmp_path):
        state, command, feature, session_marker = resolve_marker_fields(
            "/implement-trd", str(tmp_path), "../etc/passwd"
        )
        assert (state, command, feature, session_marker) == (
            "unknown",
            None,
            None,
            "unknown",
        )
        assert not (tmp_path / ".trd-state").exists()

    def test_slash_prompt_writes_active_state(self, tmp_path):
        state, command, feature, session_marker = resolve_marker_fields(
            "/implement-trd foo", str(tmp_path), "sess-1"
        )
        assert state == "active"
        assert command == "/implement-trd"
        assert session_marker == "sess-1"
        written = json.loads(
            (tmp_path / ".trd-state" / "_command-runs" / "sess-1.json").read_text()
        )
        assert written["state"] == "active"
        assert written["command"] == "/implement-trd"

    def test_non_slash_prompt_reads_existing_state(self, tmp_path):
        state_dir = tmp_path / ".trd-state" / "_command-runs"
        state_dir.mkdir(parents=True)
        (state_dir / "sess-1.json").write_text(json.dumps({"state": "none"}))
        state, command, feature, session_marker = resolve_marker_fields(
            "what's next?", str(tmp_path), "sess-1"
        )
        assert (state, command, feature, session_marker) == (
            "none",
            None,
            None,
            "sess-1",
        )


# === end-to-end (subprocess) ===
class TestEndToEnd:
    def test_non_empty_prompt_injects_marker_and_hint(self):
        code, out = run_hook('{"prompt": "implement the login endpoint"}')
        assert code == 0
        assert out["hookSpecificOutput"]["hookEventName"] == "UserPromptSubmit"
        ctx = context_of(out)
        assert ctx.startswith("ENSEMBLE_COMMAND state=")
        assert ctx.endswith(FRAMEWORK_HINT)

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


# === end-to-end: command-state marker (AJCS-B003) ===
class TestEndToEndCommandMarker:
    def test_marker_present_on_slash_prompt_with_no_hint(self, scaffolded_project):
        payload = json.dumps(
            {
                "prompt": "/implement-trd feature-x",
                "cwd": str(scaffolded_project),
                "session_id": "sess-slash01",
            }
        )
        code, out = run_hook(payload)
        ctx = context_of(out)
        assert code == 0
        assert ctx == (
            "ENSEMBLE_COMMAND state=active session=sess-slash01 "
            "command=/implement-trd"
        )
        assert "ENSEMBLE — orient" not in ctx

    def test_marker_plus_hint_on_plain_prompt(self, scaffolded_project):
        payload = json.dumps(
            {
                "prompt": "what should I work on next",
                "cwd": str(scaffolded_project),
                "session_id": "sess-plain01",
            }
        )
        code, out = run_hook(payload)
        ctx = context_of(out)
        assert code == 0
        first_line, rest = ctx.split("\n", 1)
        assert first_line == "ENSEMBLE_COMMAND state=none session=sess-plain01"
        assert rest.lstrip("\n") == FRAMEWORK_HINT

    def test_active_state_written_then_read_back(self, scaffolded_project):
        sid = "sess-readback01"
        run_hook(
            json.dumps(
                {
                    "prompt": "/implement-trd",
                    "cwd": str(scaffolded_project),
                    "session_id": sid,
                }
            )
        )
        code, out = run_hook(
            json.dumps(
                {
                    "prompt": "is it done yet",
                    "cwd": str(scaffolded_project),
                    "session_id": sid,
                }
            )
        )
        ctx = context_of(out)
        assert code == 0
        assert ctx.split("\n")[0] == (
            f"ENSEMBLE_COMMAND state=active session={sid} command=/implement-trd"
        )

    def test_state_none_read_from_a_closed_state_file(self, scaffolded_project):
        sid = "sess-closed01"
        state_dir = scaffolded_project / ".trd-state" / "_command-runs"
        state_dir.mkdir(parents=True)
        (state_dir / f"{sid}.json").write_text(json.dumps({"state": "none"}))
        code, out = run_hook(
            json.dumps(
                {
                    "prompt": "any status?",
                    "cwd": str(scaffolded_project),
                    "session_id": sid,
                }
            )
        )
        ctx = context_of(out)
        assert code == 0
        assert ctx.split("\n")[0] == f"ENSEMBLE_COMMAND state=none session={sid}"

    def test_state_unknown_on_unreadable_state_file(self, scaffolded_project):
        sid = "sess-corrupt01"
        state_dir = scaffolded_project / ".trd-state" / "_command-runs"
        state_dir.mkdir(parents=True)
        (state_dir / f"{sid}.json").write_text("{ this is not valid json")
        code, out = run_hook(
            json.dumps(
                {
                    "prompt": "any status?",
                    "cwd": str(scaffolded_project),
                    "session_id": sid,
                }
            )
        )
        ctx = context_of(out)
        assert code == 0
        assert ctx.split("\n")[0] == f"ENSEMBLE_COMMAND state=unknown session={sid}"

    def test_rejected_session_id_does_not_reach_filesystem(self, scaffolded_project):
        code, out = run_hook(
            json.dumps(
                {
                    "prompt": "/implement-trd",
                    "cwd": str(scaffolded_project),
                    "session_id": "../../../etc/passwd",
                }
            )
        )
        ctx = context_of(out)
        assert code == 0
        assert ctx == "ENSEMBLE_COMMAND state=unknown session=unknown"
        assert not (scaffolded_project / ".trd-state" / "_command-runs").exists()

    def test_unscaffolded_project_slash_prompt_emits_nothing(self, tmp_path):
        # Regression guard for the ordering hazard called out in the TRD: the
        # scaffolding check must be evaluated independently of the
        # slash-command hint suppression, or a slash prompt in an
        # unscaffolded project would emit a marker (and create
        # .trd-state/_command-runs/) having never checked for scaffolding.
        code, out = run_hook(
            json.dumps(
                {
                    "prompt": "/implement-trd",
                    "cwd": str(tmp_path),
                    "session_id": "sess-unscaffolded01",
                }
            )
        )
        ctx = context_of(out)
        assert code == 0
        assert ctx == ""
        assert not (tmp_path / ".trd-state").exists()

    def test_missing_session_id_reads_as_unknown(self, scaffolded_project):
        code, out = run_hook(
            json.dumps({"prompt": "hello", "cwd": str(scaffolded_project)})
        )
        ctx = context_of(out)
        assert code == 0
        assert ctx.split("\n")[0] == "ENSEMBLE_COMMAND state=unknown session=unknown"

    def test_non_string_cwd_hits_exception_handler_but_exits_clean(self):
        # cwd=123 makes os.path.abspath() raise inside main()'s try block;
        # the existing top-level exception handler (NFR-1) must still
        # produce a valid envelope and exit 0.
        code, out = run_hook(json.dumps({"prompt": "hello", "cwd": 123}))
        assert code == 0
        assert out["hookSpecificOutput"]["hookEventName"] == "UserPromptSubmit"
        assert context_of(out) == ""

    def test_disable_suppresses_marker_too(self):
        code, out = run_hook(
            json.dumps(
                {"prompt": "/implement-trd", "session_id": "sess-disabled01"}
            ),
            env_overrides={"ROUTER_DISABLE": "1"},
        )
        assert code == 0
        assert context_of(out) == ""


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
