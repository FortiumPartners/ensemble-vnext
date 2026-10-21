#!/usr/bin/env bash
# =============================================================================
# replay-abab.sh - the speed-sentence replay, two sides, alternated (FIX-006)
# =============================================================================
#
#   replay-abab.sh sides [--commit REF] [--out DIR]
#       Builds the two framework checkouts the replay compares, from ONE commit of this repo.
#       before = a clone at REF (default HEAD). after = the same clone plus
#       `cherry-pick 34b7ae7` and `cherry-pick fcb64cb` (the time-matters sentence), where
#       fcb64cb's only expected conflicts, .trd-state/speed-sentence/result.md and
#       test/smoke/ledger-timing.js, are resolved to the tree's copy. Makes NO model call.
#       Both are clones in a temp dir - never a worktree of, or a checkout in, this repo.
#       Checks: after differs from before in exactly nine files (the four workflows under both
#       packages/core/workflows/ and .claude/workflows/, plus speed-sentence.test.js); the
#       after side's speed-sentence.test.js passes; the before side has no "Time matters".
#       Prints BEFORE_DIR=<path> and AFTER_DIR=<path>.
#
#   replay-abab.sh run --sides DIR [--out DIR]
#       LIVE: hours of model time. Performs before-1, after-1, before-2, after-2 sequentially,
#       then the three /audit-build runs (before-1 as the baseline, after-1, after-2), each on
#       the run's kept clone. Saves under <out>/<side>/run-<k>/ and <out>/audit/<label>/,
#       and appends start, end, exit code and completion reason to <out>/runs.tsv.
#       <out> defaults to .trd-state/speed-sentence/replay. DIR is the dir `sides` printed
#       (it holds before/ and after/). With REPLAY_PREPARE_ONLY=1 each run stops before its
#       model call and the audits are skipped.
#
# Never writes to ~/dev/lightning-lane (the scenario clones it, a read).
# =============================================================================

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${HERE}/../.." && pwd)"

# shellcheck source=lib/assert.sh
source "${HERE}/lib/assert.sh"
# shellcheck source=lib/project.sh
source "${HERE}/lib/project.sh"

SENTENCE_COMMITS=(34b7ae7 fcb64cb)
SENTENCE_RESULT_FILE=".trd-state/speed-sentence/result.md"
SENTENCE_TIMING_FILE="test/smoke/ledger-timing.js"
FEATURE="availability-consolidation"
AUDIT_CAP="${REPLAY_AUDIT_TIMEOUT:-2700}"

# The nine files the sentence touches: four workflows in both copies, plus the test.
EXPECTED_DIFF="$(printf '%s\n' \
    .claude/workflows/create-trd.js \
    .claude/workflows/implement-phase.js \
    .claude/workflows/sweep.js \
    .claude/workflows/verify-functional.js \
    packages/core/workflows/create-trd.js \
    packages/core/workflows/implement-phase.js \
    packages/core/workflows/speed-sentence.test.js \
    packages/core/workflows/sweep.js \
    packages/core/workflows/verify-functional.js)"

die() { echo "replay-abab: $*" >&2; exit 1; }

# --- sides ----------------------------------------------------------------------------
cmd_sides() {
    local ref="HEAD" out="" tmp_parent="${TMPDIR:-/tmp}"
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --commit) ref="$2"; shift 2 ;;
            --out) out="$2"; shift 2 ;;
            *) die "sides: unknown argument '$1'" ;;
        esac
    done
    local sha
    sha="$(git -C "$REPO_ROOT" rev-parse --verify "${ref}^{commit}")" || die "sides: unknown commit '$ref'"
    [[ -n "$out" ]] || out="$(mktemp -d "${tmp_parent}/ensemble-replay-sides.XXXXXX")"
    mkdir -p "$out"
    out="$(cd "$out" && pwd)"
    local before="${out}/before" after="${out}/after"

    # `git clone <path>` reads this repo; nothing in it changes. Each side is its own clone.
    local side
    for side in before after; do
        git clone -q --no-checkout "$REPO_ROOT" "${out}/${side}" || die "sides: clone failed"
        git -C "${out}/${side}" remote remove origin
        git -C "${out}/${side}" checkout -q --detach "$sha" || die "sides: checkout $sha failed"
        git -C "${out}/${side}" config user.email "replay@example.com"
        git -C "${out}/${side}" config user.name "Replay Harness"
    done

    local c conflicts
    for c in "${SENTENCE_COMMITS[@]}"; do
        if ! git -C "$after" cherry-pick "$c" >"${out}/cherry-pick-${c}.log" 2>&1; then
            conflicts="$(git -C "$after" diff --name-only --diff-filter=U)"
            # Only files outside the sentence may conflict, and each keeps the tree's copy (the
            # "ours" side of a cherry-pick is HEAD): fcb64cb also fixed result.md and
            # ledger-timing.js, both rewritten since. The nine-file check below catches any drift.
            local f unexpected=""
            for f in $conflicts; do
                [[ "$f" == "$SENTENCE_RESULT_FILE" || "$f" == "$SENTENCE_TIMING_FILE" ]] || unexpected+="$f "
            done
            if [[ -n "$conflicts" && -z "$unexpected" ]]; then
                for f in $conflicts; do
                    git -C "$after" checkout --ours -- "$f" || die "sides: could not take the tree's $f for $c"
                    git -C "$after" add "$f"
                done
                GIT_EDITOR=true git -C "$after" cherry-pick --continue >>"${out}/cherry-pick-${c}.log" 2>&1 \
                    || die "sides: could not finish the cherry-pick of $c after resolving: ${conflicts//$'\n'/ }"
            else
                die "sides: cherry-pick $c failed with unexpected conflicts: ${conflicts:-none} (see ${out}/cherry-pick-${c}.log)"
            fi
        fi
    done

    local fail=0
    # 1. exactly nine files differ (the .git dirs are not part of the comparison)
    # Compared as commits (both trees are clean checkouts), which also avoids `diff -r`
    # walking the symlinked packages/full/* directories in loops.
    local actual
    actual="$(git -C "$after" diff --name-only "$sha" HEAD | sort)"
    if [[ -n "$(git -C "$after" status --porcelain)" || -n "$(git -C "$before" status --porcelain)" ]]; then
        echo "FAIL: a side's working tree is not clean" >&2
        fail=1
    fi
    if [[ "$actual" == "$EXPECTED_DIFF" ]]; then
        echo "PASS: after differs from before in exactly the nine expected files"
    else
        echo "FAIL: after/before differ in an unexpected set of files:" >&2
        diff <(printf '%s\n' "$EXPECTED_DIFF") <(printf '%s\n' "$actual") >&2
        fail=1
    fi

    # 2. the after side's own test passes (jest from this repo; the clones have no node_modules)
    local jest_bin="${REPO_ROOT}/node_modules/.bin/jest"
    if [[ ! -x "$jest_bin" ]]; then
        echo "FAIL: ${jest_bin} not found - run npm install in ${REPO_ROOT}" >&2
        fail=1
    elif (cd "$after" && "$jest_bin" --rootDir "$after" --config '{}' packages/core/workflows/speed-sentence.test.js) \
            >"${out}/after-speed-sentence-test.log" 2>&1; then
        echo "PASS: after side's speed-sentence.test.js passes"
    else
        echo "FAIL: after side's speed-sentence.test.js (see ${out}/after-speed-sentence-test.log)" >&2
        fail=1
    fi

    # 3. the before side carries no sentence
    if [[ -z "$(cd "$before" && grep -rn "Time matters" packages/ .claude/ 2>/dev/null)" ]]; then
        echo "PASS: before side has no \"Time matters\" in packages/ or .claude/"
    else
        echo "FAIL: before side still contains \"Time matters\"" >&2
        fail=1
    fi

    git -C "$before" rev-parse HEAD >"${out}/before.commit"
    git -C "$after" rev-parse HEAD >"${out}/after.commit"
    echo "BASE_COMMIT=${sha}"
    echo "BEFORE_DIR=${before}"
    echo "AFTER_DIR=${after}"
    return $fail
}

# --- run ------------------------------------------------------------------------------
# run_one <side> <k> <sides_dir> <out_dir>: one scenario run; records a runs.tsv row.
run_one() {
    local side="$1" k="$2" sides="$3" out="$4"
    local dest="${out}/${side}/run-${k}" start end rc completion
    mkdir -p "$dest"
    start="$(date -u +%FT%TZ)"
    REPLAY_SIDE="$side" REPLAY_SIDE_DIR="${sides}/${side}" REPLAY_OUT="$dest" \
        bash "${HERE}/scenarios/replay-fixture.sh" >"${dest}/scenario.log" 2>&1
    rc=$?
    end="$(date -u +%FT%TZ)"
    completion="$(sed -n 's/^completion=//p' "${dest}/result.env" 2>/dev/null)"
    [[ -n "$completion" ]] || completion="not run (scenario exit ${rc})"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "${side}-${k}" "run" "$start" "$end" "$rc" "$completion" \
        "$(cat "${dest}/project.txt" 2>/dev/null)" >>"${out}/runs.tsv"
    echo "${side}-${k}: exit ${rc}, ${completion}"
    return $rc
}

# audit_one <label> <project_dir> <out_dir> <plugin_dir>: /audit-build --report-only on a kept clone.
audit_one() {
    local label="$1" project="$2" out="$3" plugin="$4"
    local dest="${out}/audit/${label}" start end rc
    mkdir -p "$dest"
    [[ -d "$project" ]] || { echo "audit ${label}: kept clone ${project} is gone" >&2; return 1; }
    start="$(date -u +%FT%TZ)"
    # Same conditions as the run itself: the side's plugin, the docker/make shims first on PATH, offline.
    (
        export PLUGIN_DIR="$plugin" npm_config_offline=true
        shim_dir="$(dirname "$project")/shims"
        export PATH="${shim_dir}:${PATH}"
        smoke_claude_watched "/audit-build docs/TRD/${FEATURE}.md --prd docs/PRD/${FEATURE}.md --report-only" \
            "$AUDIT_CAP" "$project" "${dest}/session.jsonl"
    )
    rc=$?
    end="$(date -u +%FT%TZ)"
    smoke_final_text "${dest}/session.jsonl" >"${dest}/final_text.txt"
    # The report is the audit command's own file when it wrote one; otherwise its final text.
    local report="${project}/.trd-state/${FEATURE}/audit-build-report.md"
    if [[ -f "$report" ]]; then cp "$report" "${dest}/audit-build-report.md"; else cp "${dest}/final_text.txt" "${dest}/audit-build-report.md"; fi
    printf 'exit_code=%s\n' "$rc" >"${dest}/result.env"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "audit-${label}" "audit" "$start" "$end" "$rc" "-" "$project" >>"${out}/runs.tsv"
    echo "audit ${label}: exit ${rc}"
    return $rc
}

cmd_run() {
    local sides="" out="${REPO_ROOT}/.trd-state/speed-sentence/replay"
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --sides) sides="$2"; shift 2 ;;
            --out) out="$2"; shift 2 ;;
            *) die "run: unknown argument '$1'" ;;
        esac
    done
    [[ -d "${sides}/before" && -d "${sides}/after" ]] || die "run: --sides must hold before/ and after/ (from 'replay-abab.sh sides')"
    sides="$(cd "$sides" && pwd)"
    mkdir -p "$out"
    [[ -f "${out}/runs.tsv" ]] || printf 'label\tkind\tstart\tend\texit_code\tcompletion\tproject\n' >"${out}/runs.tsv"
    cp "${sides}/before.commit" "${out}/before.commit" 2>/dev/null || true
    cp "${sides}/after.commit" "${out}/after.commit" 2>/dev/null || true

    # ABAB, strictly sequential: each run starts when the previous has ended, so no two overlap.
    local step side k
    for step in before:1 after:1 before:2 after:2; do
        side="${step%%:*}"; k="${step##*:}"
        run_one "$side" "$k" "$sides" "$out" || echo "replay-abab: ${side}-${k} did not pass; continuing so the block stays balanced" >&2
        # FIX-008: check extraction on the first run before spending hours on the rest.
        if [[ "$step" == "before:1" && "${REPLAY_PREPARE_ONLY:-0}" != "1" ]]; then
            local pt ntask ngate
            pt="$(node "${HERE}/ledger-timing.js" --per-task "${out}/before/run-1/dispatch.jsonl" 2>&1)"
            printf '%s\n' "$pt" >"${out}/before/run-1/per-task.txt"
            ntask="$(printf '%s\n' "$pt" | awk '$1 ~ /^task:/ {print $1}' | sort -u | wc -l | tr -d ' ')"
            ngate="$(printf '%s\n' "$pt" | awk '$1 ~ /^gate:/ {print $2, $3}' | sort -u | wc -l | tr -d ' ')"
            [[ "$ntask" -ge 10 && "$ngate" -ge 3 ]] \
                || die "run: extraction on before-1 found ${ntask} task keys and ${ngate} gate phases (need 10 and 3); stopping (see ${out}/before/run-1/per-task.txt)"
        fi
    done

    [[ "${REPLAY_PREPARE_ONLY:-0}" == "1" ]] && return 0

    # Audits: before-1 is the single baseline; each after-run gets its own.
    local label dirname completion
    for label in baseline:before/run-1 after-1:after/run-1 after-2:after/run-2; do
        dirname="${label##*:}"
        # An audit of a clone whose run never happened (or failed) measures nothing but the
        # fixture's base, and costs up to AUDIT_CAP. Redo it with `rerun` once the run is good.
        completion="$(sed -n 's/^completion=//p' "${out}/${dirname}/result.env" 2>/dev/null)"
        if [[ "$completion" != completed* ]]; then
            echo "audit ${label%%:*}: skipped - ${dirname} did not complete (${completion:-no result.env})" >&2
            continue
        fi
        audit_one "${label%%:*}" "$(cat "${out}/${dirname}/project.txt" 2>/dev/null)" "$out" \
            "${sides}/${dirname%%/*}/packages/full" || true
    done
}

# rerun <side> <k> --sides DIR [--out DIR]: redo ONE run (after a pre-run failure such as a
# fixture test flake), moving the failed attempt aside, then redo that run's audit when it has
# one (after-k, or the baseline for before-1). The block's order is broken by this; runs.tsv's
# timestamps record by how much.
cmd_rerun() {
    [[ $# -ge 2 ]] || die "rerun: usage: rerun <before|after> <k> --sides DIR [--out DIR]"
    local side="$1" k="$2" sides="" out="${REPO_ROOT}/.trd-state/speed-sentence/replay"
    shift 2
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --sides) sides="$2"; shift 2 ;;
            --out) out="$2"; shift 2 ;;
            *) die "rerun: unknown argument '$1'" ;;
        esac
    done
    [[ "$side" == before || "$side" == after ]] || die "rerun: side must be before or after"
    [[ -d "${sides}/${side}" ]] || die "rerun: --sides must hold ${side}/"
    sides="$(cd "$sides" && pwd)"
    local dest="${out}/${side}/run-${k}" stamp audit_label=""
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    # The run's audit, when it has one: each after-run's own, and before-1's (the baseline).
    if [[ "$side" == after ]]; then audit_label="after-${k}"
    elif [[ "$k" == 1 ]]; then audit_label="baseline"
    fi
    mkdir -p "${out}/aborted"
    if [[ -d "$dest" ]]; then
        mv "$dest" "${out}/aborted/${side}-run-${k}-${stamp}"
    fi
    if [[ -n "$audit_label" && -d "${out}/audit/${audit_label}" ]]; then
        mv "${out}/audit/${audit_label}" "${out}/aborted/audit-${audit_label}-${stamp}"
    fi
    run_one "$side" "$k" "$sides" "$out" || return 1
    if [[ -n "$audit_label" ]]; then
        audit_one "$audit_label" "$(cat "${dest}/project.txt" 2>/dev/null)" "$out" "${sides}/${side}/packages/full"
    fi
}

case "${1:-}" in
    sides) shift; cmd_sides "$@" ;;
    run) shift; cmd_run "$@" ;;
    rerun) shift; cmd_rerun "$@" ;;
    *) sed -n '3,26p' "${BASH_SOURCE[0]}" >&2; exit 2 ;;
esac
