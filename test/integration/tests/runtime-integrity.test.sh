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
    local rule
    for rule in "${REPO_ROOT}/packages/core/templates/claude-directory/rules/"*.md; do
        local base
        base="$(basename "$rule")"
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
    REBASE_MD="${CORE_COMMANDS}/rebase-project.md"
    # Hooks are invoked DIRECTLY by the harness, so a copy that drops the mode
    # yields "/bin/sh: .claude/hooks/router.py: Permission denied" on every event.
    # scaffold-project.sh has always chmod'd every hook regardless of extension;
    # this step did not, so a scaffolded-then-rebased project came out WORSE than
    # one never rebased. Six hooks lost the bit in the reported case.
    grep -q 'RESTORE THE EXECUTE BIT ON EVERY HOOK' "$REBASE_MD"
    grep -q 'chmod +x .claude/hooks/\*.js' "$REBASE_MD"
    grep -q 'Permission denied' "$REBASE_MD"
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
         ('packages/full/agents', '.claude/agents')]
# Tests and their harness are deliberately NOT shipped into a project -- a tree
# with no runner wired up does not need them (copy_workflows/copy_libs skip them).
SKIP = lambda f: f.endswith('.test.js') or f == 'test-harness.js'
# The agents pair carries one legitimate, deterministic exception: scaffold-project.sh
# --refresh injects a per-project "Project Skills" block the plugin source cannot
# contain -- it names the CONSUMING project's stack, which packages/full/agents/*.md
# has no way to know. Strip exactly that generated region (frontmatter `skills:` list
# + the marked body block) before comparing, so real drift elsewhere in these files
# still fails the test.
GENERATED_PAIRS = {('packages/full/agents', '.claude/agents')}
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
    # Found 2026-08-21 from a live rebase in another project: its autonomy.md still
    # documented an autonomous-mode flag deleted five releases earlier. Nothing had
    # failed — rebase-project's §4.7 declared "two categories with opposite update
    # policies" and then gave BOTH categories the same policy (preserve-as-is), so a
    # framework rule was copied once and could never be updated again. Rules were
    # getting strictly worse treatment than commands, which are replaced-if-differs.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"
    SECTION="$(sed -n '/^#### 4.7 Rules/,/^<\/selective-update>/p' "$RP")"
    [ -n "$SECTION" ]

    # The framework category must say UPDATED, and must NOT say preserve-as-is.
    grep -q 'Framework-shipped rules (UPDATED on rebase' <<<"$SECTION"
    refute grep -q 'copied-if-missing on rebase' <<<"$SECTION"
    refute grep -q 'preserve as-is' <<<"$SECTION"

    # Replacement must point at git for recovery — no parallel backup copies.
    grep -q 'Recovery is git' <<<"$SECTION"
    refute grep -q 'bak-' <<<"$SECTION"

    # User-owned governance must STILL be untouchable. The fix must not have
    # widened to constitution/stack/process.
    grep -q 'NEVER modified by rebase' <<<"$SECTION"
    for g in constitution stack process; do
        grep -q "rules/${g}.md" <<<"$SECTION"
    done
    grep -q 'still never modified' <<<"$SECTION"
}

@test "every framework rule template matches the live copy it ships" {
    # The rebase fix above only delivers current rules if the TEMPLATE is current.
    # A drifted template ships a stale rule to every project on the next rebase,
    # which is the same failure one layer up.
    TPL="${REPO_ROOT}/packages/core/templates/claude-directory/rules"
    [ -d "$TPL" ]
    count=0
    for t in "$TPL"/*.md; do
        base="$(basename "$t")"
        live="${REPO_ROOT}/.claude/rules/${base}"
        [ -f "$live" ]
        diff -q "$t" "$live"
        count=$((count + 1))
    done
    # Discovered, not hardcoded — but a template dir that went empty must fail.
    [ "$count" -ge 4 ]
}

@test "a user-authored skill is never removed by rebase" {
    # Found 2026-08-21 from a live rebase. Commands get a frontmatter discriminator,
    # agents get a name list, hooks get extension rules — skills had NOTHING. The
    # stack-match table only knows plugin skills, so a project-authored skill matched
    # nothing and was classified "no longer matches the stack" -> removed, on EVERY
    # rebase. Four survived only because that agent overrode its own instructions.
    # This is the one category where a wrong removal destroys unrecoverable work.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"

    # The diff step must carry a Custom row keyed on absence from the plugin library.
    grep -q 'does not exist in the plugin.s skill library at all' "$RP"

    # The APPLY step must check it before deleting — a table row nothing reads is not a guard.
    APPLY="$(sed -n '/^#### 4.2 Update Skills/,/^#### 4.3/p' "$RP")"
    grep -q 'Check the Custom guard FIRST' <<<"$APPLY"
    grep -q 'Do not delete it' <<<"$APPLY"

    # The discriminator it names must actually be a real, populated directory.
    [ -d "${REPO_ROOT}/packages/skills" ]
    [ "$(ls "${REPO_ROOT}/packages/skills" | wc -l)" -gt 10 ]
}

@test "the skill stack-match table has no rows orphaned outside it" {
    # Three rows (Tailwind, Jira, Linear) sat AFTER a prose paragraph, outside the
    # table, so they rendered as stray text and read as not-part-of-the-mapping.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"
    SECTION="$(sed -n '/^#### 2.2 Skill Diff/,/^#### 2.3/p' "$RP")"
    # Every pipe-delimited mapping row must be preceded by another row or a header
    # separator — never by a blank line or prose.
    mapfile -t LINES <<<"$SECTION"
    for i in "${!LINES[@]}"; do
        line="${LINES[$i]}"
        [[ "$line" =~ ^[[:space:]]*\|.*\|[[:space:]]*$ ]] || continue
        prev="${LINES[$((i - 1))]:-}"
        next="${LINES[$((i + 1))]:-}"
        # Legitimate: a body row following another row, or a header row whose
        # very next line is the |---|---| separator.
        [[ "$prev" =~ ^[[:space:]]*\| ]] && continue
        [[ "$next" =~ ^[[:space:]]*\|[[:space:]]*-+ ]] && continue
        echo "orphaned table row: $line (preceded by: '$prev')" >&2
        false
    done
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
