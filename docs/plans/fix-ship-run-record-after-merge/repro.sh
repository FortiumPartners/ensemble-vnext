#!/usr/bin/env bash
# Reproduces the two /ship-build run-record defects in a throwaway git repo (never live state).
#   Block 1: the merge step records `stop` after the PR merged; the branch and its tracked
#            shipped.json are then deleted; `start --resume` should continue at the merge step, not begin again at step 1.
#   Block 2: a run finishes on old-branch; its record is lost; `start --resume` on new-branch
#            should begin a fresh run, not load old-branch's finished one.
# Exit 0 when both behave as expected, 1 when either defect reproduces.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SEQ="$REPO_ROOT/packages/core/lib/ship-sequencer.js"
CONTRACTS="$REPO_ROOT/packages/core/contracts"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

node -e 'process.stdout.write(require(process.argv[1]).AUTHORIZATION_SENTENCE + "\n")' "$SEQ" > "$WORK/autonomy.md"
printf '## Ship\n1. push\n2. open-pr\n3. merge\n\n## After shipping\n1. close-issue\n' > "$WORK/ship.md"
echo '{}' > "$WORK/settings.json"
GATE=(--contracts "$CONTRACTS" --autonomy "$WORK/autonomy.md" --settings "$WORK/settings.json")

newrepo() {
  local r="$WORK/$1"
  mkdir -p "$r" && cd "$r"
  git init -q -b main && git config user.email t@example.com && git config user.name t
  echo x > README && git add README && git commit -q -m init
  git checkout -q -b "$2"
}
seq() { node "$SEQ" "$@"; }
field() { node -e 'const o=JSON.parse(process.argv[1]);console.log(JSON.stringify(process.argv[2].split(".").reduce((v,k)=>v==null?v:v[k],o)))' "$1" "$2"; }
fail=0

# ---- block 1 -------------------------------------------------------------------------------
newrepo b1 feature
SD=.trd-state/f
seq start --state-dir "$SD" --policy "$WORK/ship.md" --kind feature --id f --branch feature "${GATE[@]}" >/dev/null
seq next --state-dir "$SD" "${GATE[@]}" >/dev/null
seq record --state-dir "$SD" --step 1 --result pushed "${GATE[@]}" >/dev/null
seq next --state-dir "$SD" "${GATE[@]}" >/dev/null
seq record --state-dir "$SD" --step 2 --result opened --data '{"pr":7,"base":"main"}' "${GATE[@]}" >/dev/null
seq next --state-dir "$SD" "${GATE[@]}" >/dev/null
seq record --state-dir "$SD" --step 3 --result stop --data '{"merged":true}' --reason "merge link failed after gh pr merge landed" "${GATE[@]}" >/dev/null
# The PR merged: check out main, delete the branch and the tracked record it carried.
git checkout -q main && git branch -q -D feature
rm -f "$SD/shipped.json"
# /ship-build Step 3 passes the work's own branch on a resume, not the current one.
seq start --state-dir "$SD" --policy "$WORK/ship.md" --kind feature --id f --branch feature --resume "${GATE[@]}" >/dev/null
ST="$(seq status --state-dir "$SD")"
steps="$(node -e 'const o=JSON.parse(process.argv[1]);console.log((o.steps||[]).map(s=>s.primitive+":"+s.result).join(" "))' "$ST")"
cursor="$(field "$ST" cursor.step)"
echo "block 1: steps after resume: $steps; cursor at step $cursor"
if [ "$cursor" = '"3"' ] && [[ "$steps" == "push:pushed open-pr:opened merge:stop"* ]]; then
  echo "block 1: OK - resume continues at the merge step's recorded outcome"
else
  echo "block 1: BUG - resume began a fresh run instead of continuing at the merge step"; fail=1
fi

# ---- block 2 -------------------------------------------------------------------------------
newrepo b2 old-branch
seq start --state-dir "$SD" --policy "$WORK/ship.md" --kind feature --id f --branch old-branch "${GATE[@]}" >/dev/null
for pair in 1:pushed 2:opened 3:merged a1:closed; do
  seq next --state-dir "$SD" "${GATE[@]}" >/dev/null
  seq record --state-dir "$SD" --step "${pair%%:*}" --result "${pair##*:}" "${GATE[@]}" >/dev/null
done
echo "block 2: old-branch run status: $(field "$(seq status --state-dir "$SD")" status)"
rm -f "$SD/shipped.json"
git checkout -q -b new-branch
R="$(seq start --state-dir "$SD" --policy "$WORK/ship.md" --kind feature --id f --branch new-branch --resume "${GATE[@]}")"
echo "block 2: start --resume on new-branch -> $R"
if [ "$(field "$R" resumed)" = "true" ] || [ "$(field "$R" status)" = '"done"' ]; then
  echo "block 2: BUG - resume on new-branch loaded old-branch's finished run"; fail=1
else
  echo "block 2: OK - no matching record, a fresh run began"
fi
exit "$fail"
