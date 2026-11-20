#!/usr/bin/env bash
# How to check for fix-token-usage-double-count. Run from the repository root.
# Copies the newest real transcript into a throwaway HOME, runs token-usage.js over it, and
# compares its output-token total and message count with a reference that keeps one usage
# block per message id. FAIL before the fix (about 2x), PASS after.
set -euo pipefail
T=$(ls -t ~/.claude/projects/*/*.jsonl 2>/dev/null | sed -n 1p || true)
[ -n "$T" ] || { echo "no transcript under ~/.claude/projects"; exit 2; }
H=$(mktemp -d); trap 'rm -rf "$H"' EXIT
mkdir -p "$H/.claude/projects/-fixture"; cp "$T" "$H/.claude/projects/-fixture/t.jsonl"
GOT=$(HOME="$H" node packages/core/scripts/token-usage.js --json --days 3650 \
  | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const t=JSON.parse(s).total;console.log(t.output,t.msgs)})')
WANT=$(node -e 'const m=new Map();for(const l of require("fs").readFileSync(process.argv[1],"utf8").split("\n")){if(!l.includes("\"usage\""))continue;let d;try{d=JSON.parse(l)}catch{continue}const g=d.message||{};if(g.usage)m.set(g.id,g.usage)}let o=0;for(const u of m.values())o+=u.output_tokens||0;console.log(o,m.size)' "$H/.claude/projects/-fixture/t.jsonl")
echo "token-usage.js (output, messages): $GOT   once per message id: $WANT"
[ "$GOT" = "$WANT" ] && echo PASS || { echo FAIL; exit 1; }
