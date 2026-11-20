#!/usr/bin/env bats
# =============================================================================
# runtime-integrity.test.sh - the checks that catch what you did NOT mean to do
#
# This file was 47 tests. 34 of them grepped a markdown prompt for a sentence.
# A prompt is edited deliberately, so those tests could only ever report an
# intentional change as a regression -- they made improving prose cost a test
# edit, and caught nothing. Removed 2026-09-26, owner's call.
#
# What survives asserts something NOBODY intends: the two copies of a file
# drifting apart, a generated artifact going stale against its generator, a
# rebase eating a user's own skill, the router naming a command that is not on
# disk. Mirror parity earned its keep the day this was written -- it caught
# status.js fixed in packages/core and never mirrored to .claude/, so the fix
# was not live in the tree that runs it.
# =============================================================================
# These assertions span the command file, the delegation contract, and the
# workflow script written by separate tasks (ITR-B005, ITR-D001, ITR-B008,
# ITR-B010, ITR-B014) — no single implementation task owns them, which is
# why they exist as their own task (ITR-T001) rather than as any one task's
# acceptance criteria.
#
# Run with:
#   npx bats test/integration/tests/implement-trd-structure.test.sh
# =============================================================================

# `! cmd` does NOT fail a bats test unless it is the LAST line: bash suppresses
# errexit for any command prefixed with `!` (POSIX: "the -e setting shall be ignored
# ... when the command is preceded by !"). Every negated assertion above the last
# line of its test was therefore dead — `! true` passed. Found 2026-08-21 when a
# reintroduced backup step failed to trip its own guard. `refute` is a plain command,
# so its non-zero exit DOES trip errexit.
refute() {
    if "$@"; then
        echo "refute: expected failure, but this SUCCEEDED: $*" >&2
        return 1
    fi
    return 0
}

setup() {
    REPO_ROOT="$(cd "$(dirname "${BATS_TEST_FILENAME}")/../../.." && pwd)"
    CORE_COMMANDS="${REPO_ROOT}/packages/core/commands"
    CORE_CONTRACTS="${REPO_ROOT}/packages/core/contracts"
    IMPLEMENT_TRD_MD="${CORE_COMMANDS}/implement-trd.md"
    TASK_DELEGATION_MD="${CORE_CONTRACTS}/task-delegation.md"
}

# Owner-authored rules (verification.md, design.md, ship.md, ...): the template
# ships a blank shape the owner fills in, so byte parity with the live copy is
# meaningless. Read from scaffold-project.sh's AUTHORED_RULES — the list that
# already keeps --refresh and rebase off these files — so a newly owner-governed
# rule is exempted here the moment it is exempted there.
authored_rules() {
    grep -E 'local AUTHORED_RULES=\(' "${REPO_ROOT}/packages/core/scripts/scaffold-project.sh" \
        | grep -oE '"[^"]+\.md"' | tr -d '"'
}

# =============================================================================
# 1. The delegation contract carries inferred-grounding markers
# =============================================================================

@test "packages/core/ <-> .claude/ mirror parity for every file this TRD adds or edits" {
    local core_files=(
        "packages/core/lib/trd-parser.js"
        "packages/core/lib/task-graph.js"
        "packages/core/lib/implement-state.js"
        "packages/core/hooks/status.js"
        "packages/core/commands/implement-trd.md"
        "packages/core/workflows/implement-phase.js"
        "packages/core/commands/audit-build.md"
        "packages/core/workflows/audit-build.js"
        "packages/core/contracts/task-delegation.md"
        "packages/core/hooks/dispatch-ledger.js"
        "packages/core/hooks/lib/dispatch-ledger.js"
        "packages/core/hooks/prompts/discipline-stop.prompt.md"
    )
    local claude_files=(
        ".claude/lib/trd-parser.js"
        ".claude/lib/task-graph.js"
        ".claude/lib/implement-state.js"
        ".claude/hooks/status.js"
        ".claude/commands/implement-trd.md"
        ".claude/workflows/implement-phase.js"
        ".claude/commands/audit-build.md"
        ".claude/workflows/audit-build.js"
        ".claude/contracts/task-delegation.md"
        ".claude/hooks/dispatch-ledger.js"
        ".claude/hooks/lib/dispatch-ledger.js"
        ".claude/hooks/prompts/discipline-stop.prompt.md"
    )

    local drift=()
    local i=0
    while [ "$i" -lt "${#core_files[@]}" ]; do
        local core="${REPO_ROOT}/${core_files[$i]}"
        local claude="${REPO_ROOT}/${claude_files[$i]}"
        if [ ! -f "$core" ]; then
            drift+=("MISSING (core): ${core_files[$i]}")
        elif [ ! -f "$claude" ]; then
            drift+=("MISSING (.claude mirror): ${claude_files[$i]}")
        elif ! cmp -s "$core" "$claude"; then
            drift+=("DRIFT: ${core_files[$i]} != ${claude_files[$i]}")
        fi
        i=$((i + 1))
    done

    if [ ${#drift[@]} -gt 0 ]; then
        printf 'packages/core/ <-> .claude/ mirror drift found:\n%s\n' "$(printf '%s\n' "${drift[@]}")" >&2
        return 1
    fi
}

# =============================================================================
# 7. harden-trd-team / verify-trd-team removal (ITR-B012) does not leave a
#    dangling mirror behind in either tree.
# =============================================================================

@test "every .claude/rules/ file matches its shipped template" {
    local drift=()
    local rule authored
    authored="$(authored_rules)"
    [ -n "$authored" ]
    for rule in "${REPO_ROOT}/packages/core/templates/claude-directory/rules/"*.md; do
        local base
        base="$(basename "$rule")"
        grep -qxF "$base" <<<"$authored" && continue
        local vendored="${REPO_ROOT}/.claude/rules/${base}"
        if [ ! -f "$vendored" ]; then
            drift+=("MISSING (.claude/rules): ${base}")
        elif ! cmp -s "$rule" "$vendored"; then
            drift+=("DRIFT: rules/${base}")
        fi
    done

    if [ ${#drift[@]} -gt 0 ]; then
        printf 'A rule file was edited in .claude/rules/ without updating the shipped template (or vice versa) — a scaffolded project would receive the stale text:\n%s\n' \
            "$(printf '%s\n' "${drift[@]}")" >&2
        return 1
    fi
}

# =============================================================================
# 9. The three discipline prompts are GENERATED by build-judge-prompts.js.
#    Hand-editing the .prompt.md files "works" until someone regenerates, at
#    which point the edit silently vanishes from the prompt AND from every
#    settings.json the hooks generator derives from it. Assert that
#    regenerating is a no-op.
# =============================================================================

@test "discipline prompt files match what build-judge-prompts.js generates" {
    command -v node >/dev/null || skip "node not available"
    run node -e '
      const { buildStopDisciplinePrompt, STOP_DISCIPLINE_PROMPT_FILE } =
        require(process.argv[1]);
      const fs = require("fs");
      const path = require("path");
      const dir = path.dirname(process.argv[1]);
      const drift = [];

      // subagent-discipline: NO LONGER EMITTED (4.2.1). The SubagentStop judge was
      // unregistered, so the manifest declares no prompt file for it and
      // build-judge-prompts.js deletes a stale one. Its HOOKS entry survives purely so the
      // discipline corpus can score SubagentStop cases -- the corpus detector calls
      // buildPrompt() in memory and never reads a .md. Asserting the file exists here would
      // re-create exactly the dead-artifact class this project deletes on sight.
      if (fs.existsSync(path.join(dir, "subagent-discipline.prompt.md"))) {
        drift.push("subagent-discipline.prompt.md exists but no manifest entry declares it");
      }

      // The Stop prompt: discipline-stop.source.md wrapped in the display banners.
      {
        const generated = buildStopDisciplinePrompt() + "\n";
        const onDisk = fs.readFileSync(path.join(dir, STOP_DISCIPLINE_PROMPT_FILE), "utf8");
        if (generated !== onDisk) drift.push(STOP_DISCIPLINE_PROMPT_FILE);
      }

      if (drift.length) {
        console.error("Hand-edited (regeneration would discard the edit): " + drift.join(", "));
        process.exit(1);
      }
    ' "${REPO_ROOT}/packages/core/hooks/prompts/build-judge-prompts.js"
    [ "$status" -eq 0 ]
}

@test "harden-trd-team.md and verify-trd-team.md are absent from both packages/core and .claude" {
    [ ! -f "${REPO_ROOT}/packages/core/commands/harden-trd-team.md" ]
    [ ! -f "${REPO_ROOT}/packages/core/commands/verify-trd-team.md" ]
    [ ! -f "${REPO_ROOT}/.claude/commands/harden-trd-team.md" ]
    [ ! -f "${REPO_ROOT}/.claude/commands/verify-trd-team.md" ]
}

# =============================================================================
# 8. The --verify --resume composition gate reads `outcome`
# =============================================================================
# The gate at Step 3.6 step 0 is PROSE executed by a model, not code, so this is
# a documentation-level assertion — it proves the command tells the model to read
# the terminality marker, not that a given run obeyed. That is the strongest
# check available at this layer, and it is worth having: the gate was written as
# "resumable iff the state file records a non-terminal outcome" while the Judge
# wrote no outcome key at all, so every state file read as non-terminal and
# `--verify --resume` skipped the derive pass, the whole phase loop
# and Step 7 even after a run that exited satisfied.

@test "rebase restores the execute bit on every hook, not just .sh" {
    # WHY: hooks are invoked DIRECTLY by the harness, so a copy that drops the mode yields
    # "Permission denied" on every event. The execute bit is now the engine's (the `modes`
    # step of `scaffold-project.sh --rebase`); the prompt must delegate to it and not carry
    # its own chmod, and the engine's post steps must still call ensure_hooks_executable.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"
    SCAFFOLD="${REPO_ROOT}/packages/core/scripts/scaffold-project.sh"
    grep -q 'scaffold-project.sh" --rebase' "$RP"
    grep -q '`modes`' "$RP"
    refute grep -q 'chmod +x' "$RP"
    POST="$(sed -n '/^rebase_post_steps() {/,/^}/p' "$SCAFFOLD")"
    [ -n "$POST" ]
    grep -q '_rebase_step ensure_hooks_executable' <<<"$POST"
}

@test "every file mirrored into .claude/ matches its packages/ source" {
    run python3 - "$REPO_ROOT" <<'PY'
import os, re, sys, filecmp
root = sys.argv[1]
PAIRS = [('packages/core/hooks', '.claude/hooks'),
         ('packages/core/hooks/lib', '.claude/hooks/lib'),
         ('packages/core/lib', '.claude/lib'),
         ('packages/core/workflows', '.claude/workflows'),
         ('packages/core/contracts', '.claude/contracts'),
         ('packages/core/commands', '.claude/commands'),
         ('packages/full/agents-lib', '.claude/agents')]
# Tests and their harness are deliberately NOT shipped into a project -- a tree
# with no runner wired up does not need them (copy_workflows/copy_libs skip them).
SKIP = lambda f: f.endswith('.test.js') or f == 'test-harness.js'
# The agents pair carries one legitimate, deterministic exception: scaffold-project.sh
# --refresh injects a per-project "Project Skills" block the plugin source cannot
# contain -- it names the CONSUMING project's stack, which packages/full/agents-lib/*.md
# has no way to know. Strip exactly that generated region (frontmatter `skills:` list
# + the marked body block) before comparing, so real drift elsewhere in these files
# still fails the test.
GENERATED_PAIRS = {('packages/full/agents-lib', '.claude/agents')}
def strip_generated(text):
    text = re.sub(r'\n\n<!-- ENSEMBLE:SKILLS:BEGIN.*?ENSEMBLE:SKILLS:END -->', '', text, flags=re.S)
    text = re.sub(r'\nskills:\n(?:  - .*\n)+', '\n', text)
    return text
def same(fa, fb, pair):
    if pair not in GENERATED_PAIRS:
        return filecmp.cmp(fa, fb, shallow=False)
    with open(fa, encoding='utf-8') as h: ta = h.read()
    with open(fb, encoding='utf-8') as h: tb = h.read()
    return ta == strip_generated(tb)
drift = []
for a, b in PAIRS:
    da, db = os.path.join(root, a), os.path.join(root, b)
    if not (os.path.isdir(da) and os.path.isdir(db)):
        continue
    for f in sorted(os.listdir(da)):
        fa, fb = os.path.join(da, f), os.path.join(db, f)
        if not os.path.isfile(fa) or not os.path.isfile(fb) or SKIP(f):
            continue
        if not same(fa, fb, (a, b)):
            drift.append(f"{a}/{f} != {b}/{f}")
if drift:
    print("MIRROR DRIFT:")
    for d in drift: print("  " + d)
    sys.exit(1)
PY
    [ "$status" -eq 0 ] || { echo "$output"; false; }
}

@test "framework-shipped rules are UPDATED on rebase, not frozen on first install" {
    # WHY (found 2026-08-21): a framework rule was once copied once and never updated again.
    # The update policy is now the engine's (it replaces a framework rule that matches a shipped
    # version, and reports an owner edit as a conflict); the prompt must delegate to it, keep
    # recovery on git, and keep the user-owned governance files untouchable.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"
    SCAFFOLD="${REPO_ROOT}/packages/core/scripts/scaffold-project.sh"
    grep -q 'scaffold-project.sh" --rebase' "$RP"
    grep -q 'framework rule' "$RP"
    refute grep -q 'copied-if-missing on rebase' "$RP"
    refute grep -q 'preserve as-is' "$RP"
    refute grep -q 'bak-' "$RP"
    grep -q 'Recovery is git' "$RP"
    # Governance stays untouchable: the prompt says NEVER modified, and the engine's
    # authored-rules list (the one source) holds all six.
    grep -q 'NEVER modified' "$RP"
    for g in constitution stack process verification design ship; do
        grep -q "\`${g}.md\`" "$RP"
        grep -q "AUTHORED_RULES=(.*\"${g}.md\"" "$SCAFFOLD"
    done
}

@test "every framework rule template matches the live copy it ships" {
    # The rebase fix above only delivers current rules if the TEMPLATE is current.
    # A drifted template ships a stale rule to every project on the next rebase,
    # which is the same failure one layer up.
    TPL="${REPO_ROOT}/packages/core/templates/claude-directory/rules"
    [ -d "$TPL" ]
    count=0
    authored="$(authored_rules)"
    [ -n "$authored" ]
    for t in "$TPL"/*.md; do
        base="$(basename "$t")"
        grep -qxF "$base" <<<"$authored" && continue
        live="${REPO_ROOT}/.claude/rules/${base}"
        [ -f "$live" ]
        diff -q "$t" "$live"
        count=$((count + 1))
    done
    # Discovered, not hardcoded — but a template dir that went empty must fail.
    [ "$count" -ge 3 ]
}

@test "a user-authored skill is never removed by rebase" {
    # WHY (found 2026-08-21): the one category where a wrong removal destroys unrecoverable work.
    # The guard is now structural in the engine: a file the plugin does not ship is removed only
    # when retired-files.json lists it, so a project-authored skill matches nothing and stays.
    # The prompt must say so and must not carry a skill stack-match table of its own.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"
    SCAFFOLD="${REPO_ROOT}/packages/core/scripts/scaffold-project.sh"
    grep -q 'removed only when they are on the framework.s retired-file list' "$RP"
    grep -q 'preserved as a user customization' "$RP"
    grep -q 'retired-files.json' "$SCAFFOLD"
    refute grep -q 'Check the Custom guard' "$RP"
    # The discriminator it relies on must be a real, populated directory.
    [ -d "${REPO_ROOT}/packages/skills" ]
    [ "$(ls "${REPO_ROOT}/packages/skills" | wc -l)" -gt 10 ]
}

@test "the three framework skills are never classified Stale by rebase" {
    # WHY (VFIX-P001): framework skills match nothing in a stack table, so under a Stale rule
    # they would be removed on every rebase. There is no Stale rule or stack table any more:
    # the engine removes only retired-listed files, and the framework skills are read from the
    # one list, framework-skills.txt, by copy_framework_skills and reconcile_selected_skills.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"
    SCAFFOLD="${REPO_ROOT}/packages/core/scripts/scaffold-project.sh"
    LIST_FILE="${REPO_ROOT}/packages/skills/framework-skills.txt"
    [ -f "$LIST_FILE" ]
    refute grep -q 'Stale' "$RP"
    grep -q 'scaffold-project.sh" --rebase' "$RP"
    grep -q '^load_framework_skills() {' "$SCAFFOLD"
    grep -q 'load_framework_skills "\$src"' "$SCAFFOLD"
    diff -q "$RP" "${REPO_ROOT}/.claude/commands/rebase-project.md"
    diff -q "$RP" "${REPO_ROOT}/packages/full/commands/plugin-only/rebase-project.md"
}

@test "rebase delivers the framework git files: the engine's post steps run git files before the version stamp" {
    # WHY (per-feature-framework-writes FIX-002): without the ignore and union lines, parallel
    # feature branches keep clashing on current.json. That delivery is now the engine's
    # (`gitFiles` step); the prompt makes one engine call and has no stamp or git-files step of
    # its own, and in the engine _rebase_git_files runs before stamp_ensemble_version.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"
    SCAFFOLD="${REPO_ROOT}/packages/core/scripts/scaffold-project.sh"
    [ "$(grep -c 'scaffold-project.sh" --rebase' "$RP")" -eq 1 ]
    grep -q '`gitFiles`' "$RP"
    refute grep -q -- '--git-files' "$RP"
    refute grep -q -- '--stamp-version' "$RP"
    POST="$(sed -n '/^rebase_post_steps() {/,/^}/p' "$SCAFFOLD")"
    [ -n "$POST" ]
    lg="$(grep -n '_rebase_step _rebase_git_files' <<<"$POST" | head -1 | cut -d: -f1)"
    ls="$(grep -n '_rebase_step stamp_ensemble_version' <<<"$POST" | head -1 | cut -d: -f1)"
    [ -n "$lg" ]
    [ -n "$ls" ]
    [ "$lg" -lt "$ls" ]
    # The flag the standalone mode uses is still a real mode of the script, not a stale name.
    grep -qE '^[[:space:]]+--git-files\)' "$SCAFFOLD"

    # gitignore-additions.txt no longer tells projects to commit the shared pointer.
    GA="${REPO_ROOT}/packages/core/templates/gitignore-additions.txt"
    refute grep -q '^#   current\.json ' "$GA"
    refute grep -q 'Current feature pointer' "$GA"
    grep -A2 'current\.json' "$GA" | grep -q 'deliberately untracked'
    diff -q "$RP" "${REPO_ROOT}/.claude/commands/rebase-project.md"
    diff -q "$RP" "${REPO_ROOT}/packages/full/commands/plugin-only/rebase-project.md"
}

@test "rebase-project.md and CLAUDE.md name framework-skills.txt, not a hardcoded skill list" {
    # WHY (VFIX-P002): the framework-skill protection reads the one list, so a fifth line added
    # to framework-skills.txt is protected without editing prose. That protection is now the
    # engine's; the prompt must not name any framework skill literally, and CLAUDE.md's delivery
    # sentence must still name the list.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"
    SCAFFOLD="${REPO_ROOT}/packages/core/scripts/scaffold-project.sh"
    CLAUDE_MD="${REPO_ROOT}/CLAUDE.md"

    refute grep -q 'verify-design-comparison' "$RP"
    grep -q 'framework-skills.txt' "$SCAFFOLD"

    grep -q 'framework-skills.txt' "$CLAUDE_MD"
    refute grep -q 'verify-design-comparison' "$CLAUDE_MD"
    diff -q "$RP" "${REPO_ROOT}/.claude/commands/rebase-project.md"
    diff -q "$RP" "${REPO_ROOT}/packages/full/commands/plugin-only/rebase-project.md"
}

@test "the skill stack-match table and the per-component Step 2 / Step 4 sections are gone" {
    # WHY: the stack.md-driven skill table (and its orphaned-row hazard) was the model's job and
    # is replaced by the engine, which does not read stack.md. A table back in the prompt means
    # the model is deciding skills again, so fail on it, and on the per-component sections.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"
    refute grep -q '^#### 2\.[0-9]' "$RP"
    refute grep -q '^#### 4\.[0-9]' "$RP"
    refute grep -q '^### Step 4' "$RP"
    refute grep -q 'Skill Diff' "$RP"
    refute grep -qi 'stack-match' "$RP"
    refute grep -q 'Tailwind' "$RP"
    # Exactly the new shape: Step 1 (engine call), Step 2 (conflicts), Step 3 (readout).
    [ "$(grep -c '^### Step [123]:' "$RP")" -eq 3 ]
}

@test "rebase writes no backup copies — git is the undo" {
    # Backups duplicated git (.claude/ is committed per constitution.md), cluttered the
    # user's tree with four parallel <dir>.backup.<timestamp>/ directories, needed their
    # own cleanup step, and made rollback MORE dangerous than git: the documented restore
    # was `rm -rf .claude/skills && mv .claude/skills.backup.<ts> .claude/skills`, which
    # destroys any skill added since the backup was taken.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"

    # No step may instruct creating a backup directory.
    refute grep -qi 'Create backup' "$RP"
    refute grep -q 'copy to `.claude/commands.backup' "$RP"
    refute grep -q 'copy the entire current' "$RP"
    refute grep -qi 'Cleanup Old Backups' "$RP"
    refute grep -qi 'always-backup\|always backs up\|Backups are always created' "$RP"

    # Rollback must be git, and must not tell the user to rm -rf and mv a backup in.
    ROLLBACK="$(sed -n '/^## Rollback/,/^## Error Handling/p' "$RP")"
    grep -q 'git restore .claude/' <<<"$ROLLBACK"
    refute grep -q 'mv .claude/skills.backup.<timestamp>' <<<"$ROLLBACK"
}

@test "rebase refuses to run on a dirty or unversioned .claude tree" {
    # With no backups, a clean tree is the ONLY thing between an uncommitted local edit
    # and permanent loss. The command previously had no git check of any kind.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"

    # The check must live in the EXECUTION path (Step 0), not only in prose.
    STEP0="$(sed -n '/^### Step 0: Validate Installation/,/^### Path Resolution/p' "$RP")"
    grep -q 'git status --porcelain -- .claude/' <<<"$STEP0"
    grep -q 'BEFORE anything else writes' <<<"$STEP0"

    # Both failure modes must be named, and both must abort.
    grep -q 'Uncommitted changes under `.claude/`' "$RP"
    grep -q 'Not a git repository' "$RP"

    # --force must be a documented flag, since the precondition points at it.
    grep -q 'argument-hint.*--force' "$RP"
    grep -q '`--force` - Proceed even when' "$RP"
}

@test "every command the router banner names exists on disk" {
    # The banner is hand-maintained prose injected on EVERY UserPromptSubmit, so a
    # stale name is the most-repeated wrong statement in the framework. It pushed
    # /harden-trd-team and /verify-trd-team for five releases after ITR-B012
    # deleted them. Test 33 greps for those two names specifically; this is the
    # general form, and it fails in BOTH directions — a deleted command still
    # advertised, and a command advertised before it is built.
    R="${REPO_ROOT}/packages/router/hooks/router.py"
    CMD_DIR="${REPO_ROOT}/packages/core/commands"

    # Slash tokens inside the banner constant only.
    banner="$(python3 - "$R" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
m = re.search(r'FRAMEWORK_HINT = """(.*?)"""', src, re.S)
print(m.group(1) if m else '')
PY
)"
    [ -n "$banner" ]

    # A slash-COMMAND follows whitespace or starts a line; a path SEGMENT follows a
    # path character. Without that boundary this matched `current` in
    # `.trd-state/current.json` and `rules` in `.claude/rules/`.
    missing=()
    for name in $(grep -oE '(^|[[:space:]])/[a-z][a-z0-9-]+' <<<"$banner" \
                  | sed -E 's|^[[:space:]]*/||' | sort -u); do
        # Platform built-ins, not project commands.
        case "$name" in
            goal|compact|clear|help) continue ;;
        esac
        [ -f "${CMD_DIR}/${name}.md" ] || missing+=("$name")
    done

    if [ ${#missing[@]} -gt 0 ]; then
        printf 'Router banner names commands with no .md in packages/core/commands:\n%s\n' "${missing[*]}" >&2
        false
    fi
}

@test "packages/full registers no agents: no agents key, no default agents/ dir" {
    # This plugin ships its 13 subagents through packages/full/agents-lib (mirrored
    # to .claude/agents), not through the plugin's own agent registration. Either
    # registration path would add a second, competing agent set the mirror-parity
    # tests above never look at -- silently:
    #   - an `agents` key on plugin.json, or on the marketplace entry for `full`;
    #   - a directory at the plugin root's DEFAULT location, packages/full/agents,
    #     which the platform auto-discovers with no manifest key at all (the reason
    #     FIX-003 renamed it to agents-lib rather than only dropping the key).
    [ ! -e "${REPO_ROOT}/packages/full/agents" ]
    PLUGIN_JSON="${REPO_ROOT}/packages/full/.claude-plugin/plugin.json"
    MARKETPLACE_JSON="${REPO_ROOT}/.claude-plugin/marketplace.json"
    [ -f "$PLUGIN_JSON" ]
    [ -f "$MARKETPLACE_JSON" ]
    run python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    plugin = json.load(f)
with open(sys.argv[2]) as f:
    market = json.load(f)
entries = [p for p in market.get('plugins', []) if p.get('name') == 'full']
sys.exit(1 if 'agents' in plugin or any('agents' in p for p in entries) else 0)
" "$PLUGIN_JSON" "$MARKETPLACE_JSON"
    [ "$status" -eq 0 ]
}

@test "command-status.md's chaining exception names the sweep chain, in both copies" {
    # plan-sweep-chain FIX-006: /plan --implement on a sweep list chains
    # /sweep and /verify-build, which emit no banner of their own.
    for dir in "${REPO_ROOT}/.claude/rules" "${REPO_ROOT}/packages/core/templates/claude-directory/rules"; do
        grep -q -F '/plan --implement` on a sweep list' "${dir}/command-status.md"
        grep -q -F '/sweep --chained' "${dir}/command-status.md"
        grep -q -F '/verify-build --chained' "${dir}/command-status.md"
    done
    cmp "${REPO_ROOT}/.claude/rules/command-status.md" "${REPO_ROOT}/packages/core/templates/claude-directory/rules/command-status.md"
}

@test "the rule files' and CLAUDE.md's byte ceilings hold, in both copies" {
    # O4/O5 (amended, context-model-hygiene): async-discipline.md + autonomy.md
    # combined <= 17000 bytes, command-status.md <= 15000, CLAUDE.md <= 15500.
    # "No rule is deleted" outranks a size target, so these are ceilings the
    # trim must fit under, not targets to shrink toward. command-status.md's
    # ceiling went 12500 -> 13000 for the sweep-chain exception (plan-sweep-chain
    # FIX-006): the chaining paragraph must name three more banner-less commands.
    # It went 13000 -> 13500 for issue #63 (cancel-backup-wakeup): the rule
    # against fallback wake-ups for harness-tracked work, trimmed once, still
    # left it 377 bytes over.
    # It went 13500 -> 15000 for writers-move-to-the-ref: the one statement of the
    # run-records rule (records go to refs/ensemble/records/<slug>, never a commit),
    # trimmed once from 2,880 to ~1,600 bytes, still left it 1,470 bytes over.
    # CLAUDE.md's went 15000 -> 15500 at release 4.13.1: one trim (dropping the
    # 4.13.0 status line) left it 11 bytes over, and the known-open list grows by
    # a line per release; per the owner's rule, trim once, then raise with a reason.
    # It went 15500 -> 16000 for ship-build (SHIP-D003): the Forge PM charter had already
    # taken it to 17160, one trim (the 4.13.7-and-earlier known-open entries, now pointed
    # at CHANGELOG.md) brought it to 15,834 with /ship-build's pipeline line and the
    # 27 -> 28 command count added, still over 15500.
    # It went 16000 -> 16500 at release 4.17.9: two trims of the status block left it 44
    # bytes over with the 4.17.9 line and its three new unproven-live issue numbers added;
    # the owner approved the 44 bytes (2026-11-17), and 16500 leaves room for the next line.
    for dir in "${REPO_ROOT}/.claude/rules" "${REPO_ROOT}/packages/core/templates/claude-directory/rules"; do
        async_bytes=$(wc -c < "${dir}/async-discipline.md")
        autonomy_bytes=$(wc -c < "${dir}/autonomy.md")
        combined=$((async_bytes + autonomy_bytes))
        if [ "$combined" -gt 17000 ]; then
            echo "async-discipline.md + autonomy.md in ${dir} = ${combined} bytes, exceeds 17000" >&2
            false
        fi

        status_bytes=$(wc -c < "${dir}/command-status.md")
        if [ "$status_bytes" -gt 15000 ]; then
            echo "command-status.md in ${dir} = ${status_bytes} bytes, exceeds 15000" >&2
            false
        fi
    done

    claude_md_bytes=$(wc -c < "${REPO_ROOT}/CLAUDE.md")
    if [ "$claude_md_bytes" -gt 16500 ]; then
        echo "CLAUDE.md = ${claude_md_bytes} bytes, exceeds 16500" >&2
        false
    fi
}
