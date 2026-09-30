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
from datetime import datetime, timedelta, timezone
import subprocess
import sys

import pytest

HOOKS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "hooks"
)
ROUTER_PATH = os.path.join(HOOKS_DIR, "router.py")
sys.path.insert(0, HOOKS_DIR)

from router import (  # noqa: E402
    ACTIVE_RUN_CEILING_SECONDS,
    Config,
    FRAMEWORK_HINT,
    IN_FLIGHT_HINT,
    build_marker,
    build_output,
    command_run_state_path,
    derive_feature,
    feature_in_flight,
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
                {
                    "state": "active",
                    "command": "/implement-trd",
                    "feature": "auth",
                    "ts": datetime.now(timezone.utc).isoformat(),
                }
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
        ok = write_command_run_state(
            path,
            {
                "state": "active",
                "command": "/x",
                "ts": datetime.now(timezone.utc).isoformat(),
            },
        )
        assert ok is True
        assert read_command_run_state(path) == ("active", "/x", None)

    def test_stale_active_degrades_to_unknown(self, tmp_path):
        """A run older than the ceiling is not believable — guard back ON (D12).

        This is the common case, not an edge one: the router opens a run for ANY
        "/" prompt, but only ensemble commands close it. Without this, one
        /code-review suppresses Judgment B for the rest of the session.
        """
        path = tmp_path / "state.json"
        old = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 60)
        path.write_text(
            json.dumps({"state": "active", "command": "/code-review", "ts": old.isoformat()})
        )
        assert read_command_run_state(str(path)) == ("unknown", None, None)

    def test_fresh_active_is_honoured(self, tmp_path):
        path = tmp_path / "state.json"
        fresh = datetime.now(timezone.utc) - timedelta(seconds=5)
        path.write_text(
            json.dumps({"state": "active", "command": "/implement-trd", "ts": fresh.isoformat()})
        )
        assert read_command_run_state(str(path)) == ("active", "/implement-trd", None)

    def test_active_without_ts_degrades_to_unknown(self, tmp_path):
        """Cannot be shown current, so it is not treated as current."""
        path = tmp_path / "state.json"
        path.write_text(json.dumps({"state": "active", "command": "/x"}))
        assert read_command_run_state(str(path)) == ("unknown", None, None)

    def test_active_with_unparseable_ts_degrades_to_unknown(self, tmp_path):
        path = tmp_path / "state.json"
        path.write_text(json.dumps({"state": "active", "command": "/x", "ts": "not-a-date"}))
        assert read_command_run_state(str(path)) == ("unknown", None, None)

    def test_closed_state_is_unaffected_by_age(self, tmp_path):
        """`none` means closed; age is irrelevant and must not flip it to unknown."""
        path = tmp_path / "state.json"
        old = datetime.now(timezone.utc) - timedelta(days=30)
        path.write_text(json.dumps({"state": "none", "ts": old.isoformat()}))
        assert read_command_run_state(str(path)) == ("none", None, None)

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


# === read_command_run_state: liveness extension (FIX-001) ===
#
# A stale `active` record (older than ACTIVE_RUN_CEILING_SECONDS) is normally
# demoted to "unknown". These tests cover the one exception: a framework-owned
# command (one whose `.claude/commands/<name>.md` calls notify-complete.sh)
# whose session still shows dispatch-ledger activity since the record's `ts`
# stays "active" instead — see docs/TRD/command-run-liveness.md, FIX-001.
class TestReadCommandRunStateLiveness:
    """Nine cases from the FIX-001 acceptance criteria, plus a read-only proof."""

    @staticmethod
    def _make_project(tmp_path, command="/implement-trd", owned=True):
        """A tmp_path scaffolded project with (optionally) a framework-owned command file."""
        (tmp_path / ".claude" / "commands").mkdir(parents=True)
        if owned:
            name = command.lstrip("/")
            (tmp_path / ".claude" / "commands" / f"{name}.md").write_text(
                "... calls .claude/hooks/notify-complete.sh at the end ...\n"
            )
        return tmp_path

    @staticmethod
    def _state_path(tmp_path, session_id="sess-1"):
        return tmp_path / ".trd-state" / "_command-runs" / f"{session_id}.json"

    @staticmethod
    def _write_state(tmp_path, command, ts, session_id="sess-1", state="active"):
        path = TestReadCommandRunStateLiveness._state_path(tmp_path, session_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        record = {"state": state, "command": command, "ts": ts.isoformat()}
        path.write_text(json.dumps(record))
        return path

    @staticmethod
    def _write_ledger_row(tmp_path, ts, session_id="sess-1", event="stop", agent_id="a1"):
        ledger = tmp_path / ".trd-state" / "_dispatch.jsonl"
        ledger.parent.mkdir(parents=True, exist_ok=True)
        row = {
            "ts": ts.isoformat().replace("+00:00", "Z"),
            "event": event,
            "agent_id": agent_id,
            "session_id": session_id,
        }
        with open(ledger, "a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")

    def _snapshot(self, path):
        return path.read_bytes() if path.exists() else None

    def test_1_recent_ledger_row_after_ts_reads_active(self, tmp_path):
        self._make_project(tmp_path)
        stale_ts = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 3600)
        path = self._write_state(tmp_path, "/implement-trd", stale_ts)
        recent = datetime.now(timezone.utc) - timedelta(minutes=5)
        self._write_ledger_row(tmp_path, recent)
        before = self._snapshot(path)

        result = read_command_run_state(str(path), str(tmp_path), "sess-1")

        assert result == ("active", "/implement-trd", None)
        assert self._snapshot(path) == before

    def test_2_ledger_row_older_than_ceiling_reads_unknown(self, tmp_path):
        self._make_project(tmp_path)
        stale_ts = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 3600)
        path = self._write_state(tmp_path, "/implement-trd", stale_ts)
        too_old = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 60)
        self._write_ledger_row(tmp_path, too_old)
        before = self._snapshot(path)

        result = read_command_run_state(str(path), str(tmp_path), "sess-1")

        assert result == ("unknown", None, None)
        assert self._snapshot(path) == before

    def test_3_open_agent_started_after_ts_under_4h_reads_active(self, tmp_path):
        self._make_project(tmp_path)
        stale_ts = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 3600)
        path = self._write_state(tmp_path, "/implement-trd", stale_ts)
        # Started 45 minutes ago (older than the 30-min ceiling) but still
        # running (no stop row) and less than 4 hours old -> counts as alive now.
        started = datetime.now(timezone.utc) - timedelta(minutes=45)
        self._write_ledger_row(tmp_path, started, event="start", agent_id="open-1")
        before = self._snapshot(path)

        result = read_command_run_state(str(path), str(tmp_path), "sess-1")

        assert result == ("active", "/implement-trd", None)
        assert self._snapshot(path) == before

    def test_4_open_agent_started_before_ts_reads_unknown(self, tmp_path):
        self._make_project(tmp_path)
        stale_ts = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 3600)
        path = self._write_state(tmp_path, "/implement-trd", stale_ts)
        # This agent's start predates the run's own ts -- a stranded row from
        # an earlier command, must not revive this run.
        started_before_ts = stale_ts - timedelta(minutes=10)
        self._write_ledger_row(tmp_path, started_before_ts, event="start", agent_id="stale-1")
        before = self._snapshot(path)

        result = read_command_run_state(str(path), str(tmp_path), "sess-1")

        assert result == ("unknown", None, None)
        assert self._snapshot(path) == before

    def test_5_recent_rows_for_a_different_session_read_unknown(self, tmp_path):
        self._make_project(tmp_path)
        stale_ts = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 3600)
        path = self._write_state(tmp_path, "/implement-trd", stale_ts)
        recent = datetime.now(timezone.utc) - timedelta(minutes=5)
        self._write_ledger_row(tmp_path, recent, session_id="sess-OTHER")
        before = self._snapshot(path)

        result = read_command_run_state(str(path), str(tmp_path), "sess-1")

        assert result == ("unknown", None, None)
        assert self._snapshot(path) == before

    def test_6_foreign_command_with_recent_rows_reads_unknown(self, tmp_path):
        self._make_project(tmp_path, command="/code-review", owned=False)
        stale_ts = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 3600)
        path = self._write_state(tmp_path, "/code-review", stale_ts)
        recent = datetime.now(timezone.utc) - timedelta(minutes=5)
        self._write_ledger_row(tmp_path, recent)
        before = self._snapshot(path)

        result = read_command_run_state(str(path), str(tmp_path), "sess-1")

        assert result == ("unknown", None, None)
        assert self._snapshot(path) == before

    def test_7_none_record_with_recent_rows_stays_none(self, tmp_path):
        self._make_project(tmp_path)
        old_ts = datetime.now(timezone.utc) - timedelta(days=1)
        path = self._write_state(tmp_path, "/implement-trd", old_ts, state="none")
        recent = datetime.now(timezone.utc) - timedelta(minutes=5)
        self._write_ledger_row(tmp_path, recent)
        before = self._snapshot(path)

        result = read_command_run_state(str(path), str(tmp_path), "sess-1")

        assert result == ("none", None, None)
        assert self._snapshot(path) == before

    def test_8_no_ledger_file_reads_unknown(self, tmp_path):
        self._make_project(tmp_path)
        stale_ts = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 3600)
        path = self._write_state(tmp_path, "/implement-trd", stale_ts)
        before = self._snapshot(path)

        result = read_command_run_state(str(path), str(tmp_path), "sess-1")

        assert result == ("unknown", None, None)
        assert self._snapshot(path) == before

    def test_9_run_state_file_is_never_written_by_the_read_path(self, tmp_path):
        """Byte-for-byte proof across every case above, run once more here."""
        self._make_project(tmp_path)
        stale_ts = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 3600)
        path = self._write_state(tmp_path, "/implement-trd", stale_ts)
        recent = datetime.now(timezone.utc) - timedelta(minutes=5)
        self._write_ledger_row(tmp_path, recent)
        before_bytes = path.read_bytes()
        before_mtime = path.stat().st_mtime_ns

        read_command_run_state(str(path), str(tmp_path), "sess-1")
        read_command_run_state(str(path), str(tmp_path), "sess-1")

        assert path.read_bytes() == before_bytes
        assert path.stat().st_mtime_ns == before_mtime

    def test_agent_resumed_after_a_stop_counts_as_open(self, tmp_path):
        """Last event wins, as in openAgents(): start, stop, start again = running."""
        self._make_project(tmp_path)
        now = datetime.now(timezone.utc)
        stale_ts = now - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 3600)
        path = self._write_state(tmp_path, "/implement-trd", stale_ts)
        self._write_ledger_row(tmp_path, now - timedelta(minutes=80), event="start", agent_id="r1")
        self._write_ledger_row(tmp_path, now - timedelta(minutes=70), event="stop", agent_id="r1")
        self._write_ledger_row(tmp_path, now - timedelta(minutes=45), event="start", agent_id="r1")

        result = read_command_run_state(str(path), str(tmp_path), "sess-1")

        assert result == ("active", "/implement-trd", None)

    def test_open_agent_in_the_ledger_the_run_opened_under_counts(self, tmp_path):
        """current.json repointed mid-run: the old feature's ledger is still read."""
        self._make_project(tmp_path)
        now = datetime.now(timezone.utc)
        stale_ts = now - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 3600)
        path = self._state_path(tmp_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({
            "state": "active", "command": "/implement-trd",
            "ts": stale_ts.isoformat(), "feature": "old-feature",
        }))
        (tmp_path / ".trd-state" / "current.json").write_text(
            json.dumps({"trd": "docs/TRD/new-feature.md"})
        )
        old_ledger = tmp_path / ".trd-state" / "old-feature" / "dispatch.jsonl"
        old_ledger.parent.mkdir(parents=True)
        old_ledger.write_text(json.dumps({
            "ts": (now - timedelta(minutes=45)).isoformat().replace("+00:00", "Z"),
            "event": "start", "agent_id": "o1", "session_id": "sess-1",
        }) + "\n")

        result = read_command_run_state(str(path), str(tmp_path), "sess-1")

        assert result == ("active", "/implement-trd", "old-feature")

    def test_plugin_namespaced_command_is_framework_owned(self, tmp_path):
        self._make_project(tmp_path)
        stale_ts = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_RUN_CEILING_SECONDS + 3600)
        path = self._write_state(tmp_path, "/ensemble-vnext:implement-trd", stale_ts)
        self._write_ledger_row(tmp_path, datetime.now(timezone.utc) - timedelta(minutes=5))

        result = read_command_run_state(str(path), str(tmp_path), "sess-1")

        assert result == ("active", "/ensemble-vnext:implement-trd", None)


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
    def test_non_empty_prompt_injects_marker_and_hint(self, tmp_path):
        # Isolated cwd: with no "cwd" in the payload, the router falls back to
        # os.getcwd(), which — unpinned — is this repo's own working directory
        # and its real .trd-state/current.json. Whenever a feature is actually
        # in flight there (as it usually is during development), that appends
        # IN_FLIGHT_HINT after FRAMEWORK_HINT and breaks the endswith below.
        # Pin cwd to an empty, scaffolded tmp dir so the test is deterministic.
        (tmp_path / ".claude" / "rules").mkdir(parents=True)
        code, out = run_hook(
            json.dumps(
                {"prompt": "implement the login endpoint", "cwd": str(tmp_path)}
            )
        )
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


class TestInFlightCarveOut:
    """An issue in the path of an IN-FLIGHT TRD is an amendment, not a new /plan.

    FLOW sends every small defect to /plan, which reproduces, root-causes, and writes a
    SEPARATE light TRD (or a phased, audited one, once the scope earns it). Mid-feature
    that is wrong twice: it re-designs
    something already understood, and forks the work into a second TRD. The owner's account:
    "by the time we've finished it we've lost track of what we were actually working on."
    """

    def test_carve_out_names_the_in_flight_feature(self):
        text = IN_FLIGHT_HINT.format(feature="ll-state-authority")
        assert "IN FLIGHT: ll-state-authority" in text

    def test_carve_out_says_amendment_not_plan(self):
        text = IN_FLIGHT_HINT.format(feature="f")
        assert "AMENDMENT" in text
        assert "not a new /plan" in text
        assert "--reconcile" in text

    def test_the_carve_out_is_ACTUALLY_APPENDED_when_a_feature_is_in_flight(self, tmp_path):
        # The tests above only read the constant's TEXT. An ablation proved they still pass
        # with the conditional append disabled -- an assertion that cannot fail. This one
        # runs the router end to end and reads what it emits.
        state = tmp_path / ".trd-state"
        state.mkdir()
        (state / "current.json").write_text(
            json.dumps({"trd": "docs/TRD/ll-state-authority.md"}), encoding="utf-8"
        )
        (tmp_path / ".claude").mkdir()  # make it look scaffolded
        out = subprocess.run(
            [sys.executable, ROUTER_PATH],
            input=json.dumps({"prompt": "why is the total wrong?", "cwd": str(tmp_path)}),
            capture_output=True, text=True,
        )
        assert "IN FLIGHT: ll-state-authority" in out.stdout
        assert "AMENDMENT" in out.stdout

    def test_the_carve_out_is_ABSENT_when_nothing_is_in_flight(self, tmp_path):
        # With no feature there is no amendment to make and /plan is correct.
        (tmp_path / ".claude").mkdir()
        out = subprocess.run(
            [sys.executable, ROUTER_PATH],
            input=json.dumps({"prompt": "why is the total wrong?", "cwd": str(tmp_path)}),
            capture_output=True, text=True,
        )
        assert "IN FLIGHT" not in out.stdout

    def test_carve_out_carries_the_relevance_test(self):
        # Same counterfactual as discovered.blocksFeature and /plan 2f. Without it
        # the carve-out would absorb every unrelated bug into the running feature.
        text = IN_FLIGHT_HINT.format(feature="f")
        assert "objectives be satisfied with" in text
        assert "LATER" in text  # the not-blocking branch has somewhere to go

    def test_base_hint_does_not_mention_in_flight(self):
        # The carve-out must be APPENDED conditionally, never baked into the base hint --
        # with nothing in flight there is no amendment to make and /plan is correct.
        assert "IN FLIGHT" not in FRAMEWORK_HINT


CLOSED_FEATURE_FIXTURE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "test", "integration", "fixtures", "closed-feature.json",
)


class TestFeatureInFlightTerminator:
    """Finding 13, /code-review 2026-09-20: the in-flight hint never stopped firing.

    Originally nothing in the framework cleared current.json when a feature shipped,
    so every conversational turn kept being told an unrelated bug was an amendment to
    a long-archived TRD. `/close-feature` (CLOSE-B001) now nulls current.json AND
    writes `.trd-state/<feature>/closed.json`, which this terminator checks first --
    the working tree that ran `/close-feature` isn't the only one that needs to see
    the feature as closed.
    """

    def _tree(self, tmp_path, trd, tasks=None, closed=False):
        (tmp_path / ".trd-state").mkdir()
        (tmp_path / ".trd-state" / "current.json").write_text(
            json.dumps({"trd": trd})
        )
        feature, _ext = os.path.splitext(os.path.basename(trd))
        feature_dir = tmp_path / ".trd-state" / feature
        if tasks is not None:
            feature_dir.mkdir(exist_ok=True)
            (feature_dir / "implement.json").write_text(json.dumps({"tasks": tasks}))
        if closed:
            feature_dir.mkdir(exist_ok=True)
            with open(CLOSED_FEATURE_FIXTURE, "r", encoding="utf-8") as f:
                record = f.read()
            (feature_dir / "closed.json").write_text(record)
        return str(tmp_path)

    def test_unfinished_work_is_in_flight(self, tmp_path):
        cwd = self._tree(tmp_path, "docs/TRD/feat.md",
                         {"A": {"status": "success"}, "B": {"status": "pending"}})
        assert feature_in_flight(cwd) == "feat"

    def test_all_tasks_success_terminates_the_hint(self, tmp_path):
        cwd = self._tree(tmp_path, "docs/TRD/feat.md",
                         {"A": {"status": "success"}, "B": {"status": "success"}})
        assert feature_in_flight(cwd) == ""

    def test_archived_trd_terminates_the_hint(self, tmp_path):
        cwd = self._tree(tmp_path, "docs/TRD/completed/feat.md", None)
        assert feature_in_flight(cwd) == ""

    def test_no_implement_json_is_still_in_flight(self, tmp_path):
        # PRD/TRD authoring stage — an amendment to the document being written is right.
        cwd = self._tree(tmp_path, "docs/TRD/feat.md", None)
        assert feature_in_flight(cwd) == "feat"

    def test_derive_feature_is_unchanged_by_this(self, tmp_path):
        # The ENSEMBLE_COMMAND marker still reports the feature after completion.
        cwd = self._tree(tmp_path, "docs/TRD/feat.md",
                         {"A": {"status": "success"}})
        assert derive_feature(cwd) == "feat"
        assert feature_in_flight(cwd) == ""

    def test_closed_feature_with_unfinished_tasks_terminates_the_hint(self, tmp_path):
        # closed.json is the third terminator, and it must win even though the
        # implement.json tasks are genuinely unfinished (in_progress + deferred).
        cwd = self._tree(
            tmp_path, "docs/TRD/closed-feature.md",
            {"TASK-A": {"status": "in_progress"}, "TASK-B": {"status": "deferred"}},
            closed=True,
        )
        assert feature_in_flight(cwd) == ""

    def test_closed_feature_with_no_implement_json_terminates_the_hint(self, tmp_path):
        # A feature closed without ever being implemented: a close record, no implement.json.
        cwd = self._tree(tmp_path, "docs/TRD/closed-feature.md", None, closed=True)
        assert feature_in_flight(cwd) == ""

    def test_same_tree_without_closed_json_is_still_in_flight(self, tmp_path):
        # Same task shape as the closed case above, minus closed.json: still in flight.
        cwd = self._tree(
            tmp_path, "docs/TRD/closed-feature.md",
            {"TASK-A": {"status": "in_progress"}, "TASK-B": {"status": "deferred"}},
        )
        assert feature_in_flight(cwd) == "closed-feature"

    def test_same_tree_without_closed_json_and_no_implement_json_is_still_in_flight(self, tmp_path):
        cwd = self._tree(tmp_path, "docs/TRD/closed-feature.md", None)
        assert feature_in_flight(cwd) == "closed-feature"


class TestFrameworkHintNamesCloseFeature:
    """D3 / §3.4: FRAMEWORK_HINT's FLOW bullet names /close-feature after /audit-build
    as the owner's post-merge step -- discoverability for a command nothing else
    surfaces mid-session.
    """

    def test_flow_names_close_feature_after_audit_build(self):
        idx_audit = FRAMEWORK_HINT.index("/audit-build")
        idx_close = FRAMEWORK_HINT.index("/close-feature")
        assert idx_close > idx_audit
