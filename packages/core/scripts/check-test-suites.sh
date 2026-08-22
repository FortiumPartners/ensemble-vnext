#!/usr/bin/env bash
#
# check-test-suites.sh — every BATS file must GATHER and run a non-zero count.
#
# The failure this exists for: a .test.sh whose @test header is deleted but whose
# body is left behind becomes top-level code, bats-gather-tests dies, and the file
# reports ONE failure ("bats-gather-tests") instead of its real tests. It reads as
# a single broken test. It is actually the whole file not running.
#
# Measured 2026-08-21: notify-on-complete.test.sh had been in that state since the
# wiggum cleanup — 40 tests, 0 executing — which is why nothing caught the
# autonomy-judge fix shipping dead in 4.1.19. scaffold-project.test.sh is in the
# same state today. A green-looking `npx bats <file>` is not evidence the file ran.
#
# Usage: check-test-suites.sh [--quiet]
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

QUIET=false
[[ "${1:-}" == "--quiet" ]] && QUIET=true

mapfile -t FILES < <(find test packages -name '*.test.sh' \
    -not -path '*/node_modules/*' -not -path '*/worktrees/*' \
    -not -path '*/analysis-archive/*' -not -path '*/ensemble-vnext-test-fixtures/*' \
    2>/dev/null | sort)

broken=(); empty=(); aborted=(); failing=(); total_ok=0

for f in "${FILES[@]}"; do
    out="$(npx bats "$f" 2>&1)"
    if grep -q 'bats-gather-tests' <<<"$out"; then
        broken+=("$f"); continue
    fi
    ok=$(grep -cE '^ok' <<<"$out"); nok=$(grep -cE '^not ok' <<<"$out")
    total_ok=$((total_ok + ok))
    # THIRD silent-zero mode, found 2026-08-21: a failing setup_file aborts the
    # whole file. bats reports ONE failure and warns "Executed 1 instead of
    # expected 22 tests" — so 21 tests did not run, while the summary line looks
    # like a single ordinary failure. Counting ok/not-ok cannot see it.
    if grep -q 'instead of expected' <<<"$out"; then
        aborted+=("$f — $(grep -o 'Executed [0-9]* instead of expected [0-9]* tests' <<<"$out" | head -1)")
        continue
    fi
    if [[ "$ok" -eq 0 && "$nok" -eq 0 ]]; then empty+=("$f")
    elif [[ "$nok" -gt 0 ]]; then failing+=("$f ($nok failing)")
    fi
    $QUIET || printf '  %-4s ok  %-4s fail  %s\n' "$ok" "$nok" "$f"
done

echo
echo "suites: ${#FILES[@]}   assertions passing: ${total_ok}"

status=0
if [[ ${#broken[@]} -gt 0 ]]; then
    echo
    echo "GATHER FAILURE — these files run ZERO tests (a @test header is missing," >&2
    echo "leaving its body as top-level code). This is not one broken test:" >&2
    printf '  %s\n' "${broken[@]}" >&2
    status=1
fi
if [[ ${#empty[@]} -gt 0 ]]; then
    echo; echo "NO TESTS — file gathers but defines nothing:" >&2
    printf '  %s\n' "${empty[@]}" >&2
    status=1
fi
if [[ ${#aborted[@]} -gt 0 ]]; then
    echo; echo "ABORTED — setup_file failed, so most tests never ran:" >&2
    printf '  %s\n' "${aborted[@]}" >&2
    status=1
fi
if [[ ${#failing[@]} -gt 0 ]]; then
    echo; echo "FAILING:" >&2
    printf '  %s\n' "${failing[@]}" >&2
    status=1
fi
[[ $status -eq 0 ]] && echo "all suites gather and pass"
exit $status
