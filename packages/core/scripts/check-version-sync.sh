#!/usr/bin/env bash
#
# check-version-sync.sh — assert every version manifest agrees.
#
# Four places declare the plugin version. They drifted badly once already
# (package.json and marketplace.json sat at 1.0.0 while plugin.json was at
# 3.3.12), which matters because RUNTIME's refresh mechanism gates on
# semver(plugin) > semver(vendored). A version stamp nobody maintains is worse
# than no stamp at all — the gate silently stops firing.
#
# Exit 0 when all agree, 1 otherwise. Prints every value either way.
#
# Usage: check-version-sync.sh [--quiet]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
QUIET=false
[[ "${1:-}" == "--quiet" ]] && QUIET=true

# Each entry: label|file|python-expression-against-parsed-json
MANIFESTS=(
    "package.json|package.json|d['version']"
    "marketplace metadata|.claude-plugin/marketplace.json|d['metadata']['version']"
    "marketplace plugin 'full'|.claude-plugin/marketplace.json|[p for p in d['plugins'] if p['name']=='full'][0]['version']"
    "plugin.json|packages/full/.claude-plugin/plugin.json|d['version']"
)

read_version() {
    local file="$1" expr="$2"
    python3 -c "
import json, sys
try:
    d = json.load(open('$REPO_ROOT/$file'))
    print($expr)
except Exception as e:
    print('ERROR: %s' % e, file=sys.stderr)
    sys.exit(1)
" 2>/dev/null || echo "UNREADABLE"
}

declare -a labels=() values=()
for entry in "${MANIFESTS[@]}"; do
    IFS='|' read -r label file expr <<< "$entry"
    labels+=("$label")
    values+=("$(read_version "$file" "$expr")")
done

reference="${values[0]}"
mismatch=false
for v in "${values[@]}"; do
    [[ "$v" != "$reference" ]] && mismatch=true
done

if [[ "$mismatch" == "true" || "$QUIET" != "true" ]]; then
    echo "Version manifest sync check"
    for i in "${!labels[@]}"; do
        marker="  "
        [[ "${values[$i]}" != "$reference" ]] && marker="!!"
        printf '  %s %-28s %s\n' "$marker" "${labels[$i]}" "${values[$i]}"
    done
fi

if [[ "$mismatch" == "true" ]]; then
    echo ""
    echo "FAIL: version manifests disagree."
    echo "Set every manifest above to the same value before committing."
    exit 1
fi

if [[ "$reference" == "UNREADABLE" ]]; then
    echo ""
    echo "FAIL: no manifest could be read — check the paths above."
    exit 1
fi

[[ "$QUIET" == "true" ]] || echo "  OK — all manifests at $reference"
exit 0
