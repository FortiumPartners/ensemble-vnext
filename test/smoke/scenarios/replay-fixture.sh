#!/usr/bin/env bash
# =============================================================================
# replay-fixture - ONE run of ONE side of the speed-sentence replay
# =============================================================================
#
# Replays a real, past ten-task TRD (lightning-lane's availability-consolidation,
# fixture in test/smoke/fixtures/speed-replay/) on a scratch clone at its
# pre-feature commit, with `/implement-trd ... --no-verify`, headlessly, using one
# side's copy of the framework (docs/TRD/speed-sentence.md, FIX-006).
#
# Steps, all deterministic until the model call:
#   1. clone the source repo at the fixture's base into a new temp dir; drop `origin`
#   2. install today's runtime from the side's source dir (plain scaffold, then --refresh)
#   3. put the template's `hooks` block into the clone's settings.json (neither mode
#      touches hook wiring); keep the clone's own permissions/env/ensemble
#   4. the four config edits (constitution, stack, CLAUDE.md, PATH shims) - identical on
#      both sides, so they cannot be what differs between them
#   5. copy in the fixture documents, `pnpm install --offline`, commit
#   6. check the result (the prepare-only acceptance checks), battery included
#   7. unless REPLAY_PREPARE_ONLY=1: run the command, keep the clone, copy the ledger,
#      implement.json, final text, session log and subagent transcripts into REPLAY_OUT
#
# Not registered with run-smoke.sh on purpose: a run is hours, and run-smoke.sh would cap
# an unlisted scenario at 300s. Invoke it directly, or through replay-abab.sh.
#
# Inputs (environment):
#   REPLAY_SIDE_DIR       required. A checkout of this repo for the side (from
#                         `replay-abab.sh sides`). Supplies the scaffold script, the runtime
#                         AND `claude --plugin-dir` (<dir>/packages/full).
#   REPLAY_SIDE           label only: before | after (default: the dir's basename)
#   REPLAY_OUT            output dir (default: <run root>/out)
#   REPLAY_WORKDIR        parent for the run root (default: $TMPDIR, else /tmp)
#   REPLAY_PREPARE_ONLY   1 = stop before the model call (no model session is started)
#   REPLAY_RUN_TIMEOUT    seconds, default 10800
#
# NEVER writes to the source repo: it is only cloned (a read), and its remote is removed
# from the CLONE.
#
# Skips (not fail) when the `claude` CLI is unavailable and a model run was requested.
# =============================================================================

set -uo pipefail

SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_DIR="$(cd "${SCENARIO_DIR}/.." && pwd)"
# shellcheck disable=SC2034  # used by lib/project.sh once sourced below
REPO_ROOT="$(cd "${SMOKE_DIR}/../.." && pwd)"

# shellcheck source=../lib/assert.sh
source "${SMOKE_DIR}/lib/assert.sh"
# shellcheck source=../lib/project.sh
source "${SMOKE_DIR}/lib/project.sh"

FIXTURE_DIR="${SMOKE_DIR}/fixtures/speed-replay/availability-consolidation"
FIXTURE_JSON="${FIXTURE_DIR}/fixture.json"
FEATURE="availability-consolidation"
TRD_REL="docs/TRD/${FEATURE}.md"
TASK_COUNT=10
RUN_TIMEOUT="${REPLAY_RUN_TIMEOUT:-10800}"
PREPARE_ONLY="${REPLAY_PREPARE_ONLY:-0}"

command -v jq &>/dev/null || smoke_skip "jq not installed"
command -v pnpm &>/dev/null || smoke_skip "pnpm not installed"
if [[ "$PREPARE_ONLY" != "1" ]] && ! command -v claude &>/dev/null; then
    smoke_skip "claude CLI not found in PATH"
fi

SIDE_DIR="${REPLAY_SIDE_DIR:-}"
if [[ -z "$SIDE_DIR" || ! -d "${SIDE_DIR}/packages/full" ]]; then
    echo "replay-fixture: REPLAY_SIDE_DIR must be a checkout of this repo (no packages/full in '${SIDE_DIR}')" >&2
    exit 1
fi
SIDE_DIR="$(cd "$SIDE_DIR" && pwd)"
SIDE="${REPLAY_SIDE:-$(basename "$SIDE_DIR")}"
PLUGIN="${SIDE_DIR}/packages/full"
SCAFFOLD="${SIDE_DIR}/packages/core/scripts/scaffold-project.sh"
TEMPLATE_SETTINGS="${SIDE_DIR}/packages/core/templates/claude-directory/settings.json"

SOURCE_REPO="$(jq -r '.sourceRepo' "$FIXTURE_JSON")"
SOURCE_REPO="${SOURCE_REPO/#\~/$HOME}"
BASE="$(jq -r '.base' "$FIXTURE_JSON")"
BATTERY="$(jq -r '.battery' "$FIXTURE_JSON")"

# The run root holds the clone and the PATH shims side by side, so the shims are never
# inside the tree the model works on (and never show up in its git status).
RUN_ROOT="$(mktemp -d "${REPLAY_WORKDIR:-${TMPDIR:-/tmp}}/ensemble-replay-${SIDE}.XXXXXX")"
PROJECT_DIR="${RUN_ROOT}/project"
SHIM_DIR="${RUN_ROOT}/shims"
OUT_DIR="${REPLAY_OUT:-${RUN_ROOT}/out}"
mkdir -p "$OUT_DIR" "$SHIM_DIR"
echo "  [run root] $RUN_ROOT"
echo "  [project]  $PROJECT_DIR"

# --- 1. clone at the base, no remote --------------------------------------------------
# --no-checkout: the working tree of the source's current branch is not wanted, and a
# 1.4 GB checkout of it would only be thrown away. `git clone <path>` is a read of the source.
if git clone -q --no-checkout "$SOURCE_REPO" "$PROJECT_DIR" \
    && git -C "$PROJECT_DIR" remote remove origin \
    && git -C "$PROJECT_DIR" checkout -q -b "replay/${FEATURE}-base" "$BASE"; then
    assert_pass_raw "cloned the source at ${BASE:0:9} and removed its remote"
else
    assert_fail_raw "clone the source at the fixture base"
    smoke_finish
fi
git -C "$PROJECT_DIR" config user.email "replay@example.com"
git -C "$PROJECT_DIR" config user.name "Replay Harness"

# --- 2. install the side's runtime ----------------------------------------------------
# Plain mode adds what is missing, --refresh replaces what is present. Never --force: it
# would replace CLAUDE.md and settings.json from the templates.
if "$SCAFFOLD" --plugin-dir "$PLUGIN" "$PROJECT_DIR" >"${OUT_DIR}/scaffold-plain.log" 2>&1 \
    && "$SCAFFOLD" --refresh --plugin-dir "$PLUGIN" "$PROJECT_DIR" >"${OUT_DIR}/scaffold-refresh.log" 2>&1; then
    assert_pass_raw "installed the side's runtime (plain scaffold, then --refresh)"
else
    assert_fail_raw "install the side's runtime (see ${OUT_DIR}/scaffold-*.log)"
    smoke_finish
fi

# --- 3. hook wiring from the template -------------------------------------------------
SETTINGS="${PROJECT_DIR}/.claude/settings.json"
# refreshed_at is pinned: the stamp is wall-clock time, and the two sides must differ in nothing
# but the workflow files, so a timestamp cannot be allowed to.
if jq --slurpfile t "$TEMPLATE_SETTINGS" '.hooks = $t[0].hooks | .ensemble.refreshed_at = "1970-01-01T00:00:00Z"' "$SETTINGS" >"${SETTINGS}.new" \
    && mv "${SETTINGS}.new" "$SETTINGS"; then
    assert_pass_raw "settings hooks replaced from the template (refreshed_at pinned)"
else
    assert_fail_raw "replace settings hooks from the template"
    smoke_finish
fi

# --- 4. the four config edits ---------------------------------------------------------
CONSTITUTION="${PROJECT_DIR}/.claude/rules/constitution.md"
STACK="${PROJECT_DIR}/.claude/rules/stack.md"
CLAUDE_MD="${PROJECT_DIR}/CLAUDE.md"

# (a) constitution: the original run used live-required (its phase-2 gate included a docker
#     build); there is no docker here. Anchored so the level table's backticked row is left alone.
sed -i.bak 's/^verification_level: live-required$/verification_level: unit-only/' "$CONSTITUTION" \
    && rm -f "${CONSTITUTION}.bak"

# (b) stack.md: one battery line under the "### Testing" table, which the phase gate reads.
awk -v battery="$BATTERY" '
    /^### Testing[[:space:]]*$/ { in_testing = 1 }
    in_testing && !done && /^### / && !/^### Testing/ {
        print ""; print "Full suite (phase-gate battery): `" battery "`"; done = 1; in_testing = 0
    }
    { print }
    END { if (in_testing && !done) { print ""; print "Full suite (phase-gate battery): `" battery "`" } }
' "$STACK" >"${STACK}.new" && mv "${STACK}.new" "$STACK"

# (c) CLAUDE.md: a sandbox block at the top.
{
    cat <<'EOF'
> **SANDBOX (replay run).** This is a scratch copy with no running stack, no docker and no
> network. The "Local-First Iteration (MANDATORY)" section below does NOT apply: do not start
> or look for a local stack, and do not run docker or `make localdev*`. Verify with the
> offline test suite only.

EOF
    cat "$CLAUDE_MD"
} >"${CLAUDE_MD}.new" && mv "${CLAUDE_MD}.new" "$CLAUDE_MD"

# (d) PATH shims: `docker` always refuses; `make` refuses localdev* targets, passes the rest.
cat >"${SHIM_DIR}/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker: refused - this is a sandboxed replay with no container runtime (use the offline test suite)" >&2
exit 1
EOF
cat >"${SHIM_DIR}/make" <<'EOF'
#!/usr/bin/env bash
for arg in "$@"; do
    case "$arg" in
        localdev*)
            echo "make: refused - '$arg' needs the local stack, which a sandboxed replay does not have" >&2
            exit 1 ;;
    esac
done
# Find the real make: first one on PATH that is not this shim's directory.
self_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IFS=: read -r -a path_parts <<<"$PATH"
for d in "${path_parts[@]}"; do
    [[ -z "$d" || "$d" == "$self_dir" ]] && continue
    if [[ -x "$d/make" ]]; then exec "$d/make" "$@"; fi
done
echo "make: no real make found on PATH" >&2
exit 127
EOF
chmod +x "${SHIM_DIR}/docker" "${SHIM_DIR}/make"
assert_pass_raw "config edits applied (constitution, stack, CLAUDE.md, PATH shims)"

# --- 5. fixture documents, dependencies, commit ---------------------------------------
docs_ok=true
# Read the list first: a jq failure inside `< <(...)` is invisible and would copy nothing.
DOC_LIST="$(jq -r '.docs | to_entries[] | [.key, .value] | @tsv' "$FIXTURE_JSON")" || docs_ok=false
while IFS=$'\t' read -r src dest; do
    [[ -n "$src" ]] || continue
    mkdir -p "$(dirname "${PROJECT_DIR}/${dest}")"
    cp "${FIXTURE_DIR}/${src}" "${PROJECT_DIR}/${dest}" || docs_ok=false
done <<<"$DOC_LIST"
if [[ "$docs_ok" == "true" && -f "${PROJECT_DIR}/${TRD_REL}" ]]; then
    assert_pass_raw "fixture documents copied in"
else
    assert_fail_raw "copy the fixture documents in"
    smoke_finish
fi

export PATH="${SHIM_DIR}:${PATH}"
export npm_config_offline=true

# node_modules is not cloned. Offline from the local store (~13s); runs `prisma generate` too.
if (cd "$PROJECT_DIR" && CI=1 pnpm install --offline --frozen-lockfile) >"${OUT_DIR}/pnpm-install.log" 2>&1; then
    assert_pass_raw "pnpm install --offline --frozen-lockfile"
else
    assert_fail_raw "pnpm install --offline (see ${OUT_DIR}/pnpm-install.log)"
    smoke_finish
fi

git -C "$PROJECT_DIR" add -A
git -C "$PROJECT_DIR" commit -q -m "replay: ${SIDE} runtime, config edits and fixture documents" --no-verify

# --- 6. checks on the prepared clone --------------------------------------------------
check_prepared() {
    local f remotes version want_version

    remotes="$(git -C "$PROJECT_DIR" remote)"
    if [[ -z "$remotes" ]]; then assert_pass_raw "no git remote"; else assert_fail_raw "no git remote (found: $remotes)"; fi

    # Expected version = what the side's own plugin manifest says.
    want_version="$(jq -r '.version' "${PLUGIN}/.claude-plugin/plugin.json" 2>/dev/null)"
    version="$(jq -r '.ensemble.version' "$SETTINGS")"
    if [[ -n "$want_version" && "$version" == "$want_version" ]]; then
        assert_pass_raw "ensemble.version is ${version}"
    else
        assert_fail_raw "ensemble.version is '${version}', expected '${want_version}'"
    fi

    if [[ "$(jq -cS '.hooks' "$SETTINGS")" == "$(jq -cS '.hooks' "$TEMPLATE_SETTINGS")" ]]; then
        assert_pass_raw "settings hooks equal the template's"
    else
        assert_fail_raw "settings hooks equal the template's"
    fi

    # CLAUDE.md, constitution.md, stack.md: only the sandbox block, the unit-only line and the
    # battery line may differ from the base. Compare added/removed lines against exact expectations.
    local added removed
    added="$(diff <(git -C "$PROJECT_DIR" show "${BASE}:CLAUDE.md") "$CLAUDE_MD" | grep -c '^>' || true)"
    removed="$(diff <(git -C "$PROJECT_DIR" show "${BASE}:CLAUDE.md") "$CLAUDE_MD" | grep -c '^<' || true)"
    if [[ "$removed" == "0" && "$added" == "5" ]]; then
        assert_pass_raw "CLAUDE.md differs from the base only by the sandbox block (5 lines added)"
    else
        assert_fail_raw "CLAUDE.md differs from the base by ${added} added / ${removed} removed lines (expected 5 / 0)"
    fi
    local cdiff
    cdiff="$(diff <(git -C "$PROJECT_DIR" show "${BASE}:.claude/rules/constitution.md") "$CONSTITUTION" | grep '^[<>]' || true)"
    if [[ "$cdiff" == $'< verification_level: live-required\n> verification_level: unit-only' ]]; then
        assert_pass_raw "constitution.md differs from the base only by the unit-only line"
    else
        assert_fail_raw "constitution.md differs from the base beyond the unit-only line: ${cdiff}"
    fi
    local sdiff
    sdiff="$(diff <(git -C "$PROJECT_DIR" show "${BASE}:.claude/rules/stack.md") "$STACK" | grep '^[<>]' || true)"
    if [[ "$(printf '%s\n' "$sdiff" | grep -c '^<' || true)" == "0" \
        && "$(printf '%s\n' "$sdiff" | grep -v '^> *$' | grep -c . || true)" == "1" \
        && "$sdiff" == *"Full suite (phase-gate battery)"* ]]; then
        assert_pass_raw "stack.md differs from the base only by the battery line"
    else
        assert_fail_raw "stack.md differs from the base beyond the battery line: ${sdiff}"
    fi

    for f in .claude/rules/process.md .claude/rules/verification.md .claude/verification-notes.md; do
        if git -C "$PROJECT_DIR" show "${BASE}:${f}" 2>/dev/null | cmp -s - "${PROJECT_DIR}/${f}"; then
            assert_pass_raw "${f} is byte-identical to the base"
        else
            assert_fail_raw "${f} is byte-identical to the base"
        fi
    done

    for f in create-trd implement-phase sweep verify-functional; do
        if cmp -s "${SIDE_DIR}/packages/core/workflows/${f}.js" "${PROJECT_DIR}/.claude/workflows/${f}.js"; then
            assert_pass_raw "workflows/${f}.js is byte-identical to the side's"
        else
            assert_fail_raw "workflows/${f}.js is byte-identical to the side's"
        fi
    done

    local docker_out docker_rc
    docker_out="$(cd "$PROJECT_DIR" && docker ps 2>&1)"; docker_rc=$?
    if [[ "$docker_rc" -ne 0 && "$docker_out" == *"refused"* ]]; then
        assert_pass_raw "docker on PATH prints the shim's refusal and exits non-zero (rc=${docker_rc})"
    else
        assert_fail_raw "docker on PATH is the shim (rc=${docker_rc}, out: ${docker_out})"
    fi
    local make_out
    make_out="$(cd "$PROJECT_DIR" && make localdev-up 2>&1)"
    if [[ "$make_out" == *"refused"* ]]; then
        assert_pass_raw "make localdev* is refused by the shim"
    else
        assert_fail_raw "make localdev* is refused by the shim"
    fi

    # The battery, as the phase gate will run it: offline, shims first on PATH.
    local t0 t1
    t0=$(date +%s)
    if (cd "$PROJECT_DIR" && bash -c "$BATTERY") >"${OUT_DIR}/battery.log" 2>&1; then
        t1=$(date +%s)
        assert_pass_raw "battery exits 0 ($((t1 - t0))s)"
    else
        assert_fail_raw "battery exits 0 (see ${OUT_DIR}/battery.log)"
    fi
    # A battery that leaves the tree dirty would make /implement-trd see changes it did not make.
    if [[ -z "$(git -C "$PROJECT_DIR" status --porcelain)" ]]; then
        assert_pass_raw "tree is clean after the battery"
    else
        assert_fail_raw "tree is dirty after the battery: $(git -C "$PROJECT_DIR" status --porcelain | head -5 | tr '\n' ';')"
    fi
}
check_prepared

printf '%s\n' "$PROJECT_DIR" >"${OUT_DIR}/project.txt"
git -C "$SIDE_DIR" rev-parse HEAD >"${OUT_DIR}/source-commit.txt" 2>/dev/null || true
echo "REPLAY_PROJECT=${PROJECT_DIR}"
echo "REPLAY_OUT=${OUT_DIR}"

if [[ "${ASSERT_FAIL_COUNT:-0}" -gt 0 || "$PREPARE_ONLY" == "1" ]]; then
    smoke_finish
fi

# --- 7. the model run -----------------------------------------------------------------
# Completion rule (a timeout is not necessarily a failure): in the first measurement one run
# hung after its banner and another ended with an empty final message after its task had
# succeeded. So "completed (process hung)" when the banner is in the final text, or when all
# ten tasks are terminal and every ledger start has a stop.
SESSION_FILE="${OUT_DIR}/session.jsonl"
PROMPT="/implement-trd ${TRD_REL} --no-verify"
PLUGIN_DIR="$PLUGIN"
export PLUGIN_DIR

STATE_DIR="${PROJECT_DIR}/.trd-state/${FEATURE}"

smoke_claude_watched "$PROMPT" "$RUN_TIMEOUT" "$PROJECT_DIR" "$SESSION_FILE"
RC=$?

FINAL_TEXT="$(smoke_final_text "$SESSION_FILE")"
printf '%s\n' "$FINAL_TEXT" >"${OUT_DIR}/final_text.txt"

LEDGER="${STATE_DIR}/dispatch.jsonl"
IMPLEMENT_JSON="${STATE_DIR}/implement.json"

all_tasks_terminal() {
    [[ -f "$IMPLEMENT_JSON" ]] || return 1
    jq -e --argjson n "$TASK_COUNT" '
        [.tasks[]?.status] as $s
        | ($s | length) == $n and all($s[]; . == "success" or . == "failed" or . == "blocked" or . == "skipped")
    ' "$IMPLEMENT_JSON" >/dev/null 2>&1
}
every_start_has_stop() {
    [[ -f "$LEDGER" ]] || return 1
    jq -se '
        (map(select(.event=="start") | .agent_id) | unique) as $starts
        | (map(select(.event=="stop") | .agent_id) | unique) as $stops
        | ($starts | length) > 0 and ($starts - $stops | length) == 0
    ' "$LEDGER" >/dev/null 2>&1
}

# A timeout surfaces as 124 (timeout, or the perl fallback) or 143 (TERM reached the subshell).
[[ "$RC" -eq 143 ]] && RC=124
# A clean exit that ended on COMMAND STUCK is not a completed run: its timings would be
# compared as if the command had finished.
if [[ "$RC" -eq 0 ]] && grep -q '═══ COMMAND STUCK' "${OUT_DIR}/final_text.txt"; then
    COMPLETION="stuck"
elif [[ "$RC" -eq 0 ]]; then
    COMPLETION="completed"
elif [[ "$RC" -eq 124 ]] && { grep -q '═══ COMMAND COMPLETE' "${OUT_DIR}/final_text.txt" \
        || { all_tasks_terminal && every_start_has_stop; }; }; then
    COMPLETION="completed (process hung)"
elif [[ "$RC" -eq 124 ]]; then
    COMPLETION="timed out"
else
    COMPLETION="failed (exit ${RC})"
fi

# --- copy the evidence out ------------------------------------------------------------
[[ -f "$LEDGER" ]] && cp "$LEDGER" "${OUT_DIR}/dispatch.jsonl"
[[ -f "$IMPLEMENT_JSON" ]] && cp "$IMPLEMENT_JSON" "${OUT_DIR}/implement.json"
if [[ -f "$LEDGER" ]]; then
    mkdir -p "${OUT_DIR}/transcripts"
    # The stop rows carry each subagent transcript's path; its .meta.json (label, phase) sits beside it.
    jq -r 'select(.event=="stop") | .agent_transcript_path // empty' "$LEDGER" | sort -u | while read -r tp; do
        [[ -f "$tp" ]] && cp "$tp" "${OUT_DIR}/transcripts/"
        meta="${tp%.jsonl}.meta.json"
        [[ -f "$meta" ]] && cp "$meta" "${OUT_DIR}/transcripts/"
    done
fi
printf 'exit_code=%s\ncompletion=%s\n' "$RC" "$COMPLETION" >"${OUT_DIR}/result.env"
echo "REPLAY_EXIT=${RC}"
echo "REPLAY_COMPLETION=${COMPLETION}"

case "$COMPLETION" in
    completed*) assert_pass_raw "run ${COMPLETION}" ;;
    *) assert_fail_raw "run ${COMPLETION}" ;;
esac
assert_file_nonempty "${OUT_DIR}/dispatch.jsonl" "ledger copied out"

# The clone is always kept: the audits and reconcile() read it afterwards.
echo "  [kept] $PROJECT_DIR" >&2
smoke_finish
