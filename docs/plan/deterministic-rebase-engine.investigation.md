# Investigation: deterministic-rebase-engine

**Kind**: change
**Weight**: medium
**Route**: plan

Feature F-2 ("Deterministic rebase engine") of workplan `rebase-project-fast`
(`docs/plans/rebase-project-fast/roadmap.md` item 2). Source: the owner's instruction as relayed
by the workplan PM, 2026-11-20 (the `/plan --implement` invocation text, quoted in the
Objectives' Source column below).

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | One `scaffold-project.sh` call (a new `--rebase` mode) copies every framework component — commands, agents, hooks, hook libs, hook prompts, workflows, libs, contracts, framework skills, selected library skills, framework-shipped rules — into the target's `.claude/`, adding files that are absent and replacing files whose bytes differ, and leaving byte-identical files alone | instruction 2026-11-20: "copy every framework component ... adding new files and replacing differing ones by byte comparison" | yes |
| O2 | The same call removes retired framework files named in ONE declared retired list (a data file the script reads), covering retired agents, skills, hooks (incl. `hooks/lib/` and `hooks/prompts/` entries) and commands; a file not on the list and not shipped by the plugin is preserved. A test keeps that list in step with the retired tables in `rebase-project.md` and with the plugin (no listed name is still shipped) | instruction: "remove retired files using one declared retired list (move the ... lists out of `rebase-project.md` prose into a data file the script reads, with a test that keeps it in step)" | yes |
| O3 | Library-skill selection uses the selection file and `reconcile_selected_skills()`; the engine reads no stack.md table and does no capability-word inference | instruction: "select skills through the existing `reconcile_selected_skills()` logic rather than a second stack.md table" | |
| O4 | The engine merges `.claude/settings.json`: the ensemble-owned `hooks` block is regenerated from the manifest-generated plugin default; every non-ensemble registration is carried forward on its own event, keyed by (event, registration) and never de-duplicated by filename; registrations pointing at retired hooks are dropped; every other local key is kept (a key only in the plugin is added; a key present locally keeps its local value) | instruction: "merge `.claude/settings.json` (regenerate ... carry forward non-ensemble registrations per event without deduplicating by filename, keep every other local key) ... drop registrations pointing at retired hooks" | yes |
| O5 | The engine refuses to write `settings.json` when the merged `hooks` block has fewer registrations, or fewer prompt-type entries, than the plugin default, and reports the refusal | instruction: "refuse to write if the merged block has fewer registrations or prompt-type entries than the plugin default" | yes |
| O6 | After copying, the engine sets the execute bit on every manifest hook, re-injects agent skill preloads, stamps the version through the existing strict stamp, and runs the existing git-files and records-cutover steps | instruction: "set hook file modes; re-inject agent skill preloads; stamp the version (the existing stamp-version mode ...); run the git-files and records-cutover steps it already has" | |
| O7 | A vendored framework file the owner has edited is reported as a conflict and left byte-identical. It is told apart from an older shipped version by hash: a file whose hash matches a version of that path the framework shipped in a release is an older version (replaced); one that matches none is an owner edit (conflict) | instruction: "a vendored framework file the owner has edited (the script must tell an owner edit apart from an older shipped version, for example by recording the hashes of the files it ships)" | yes |
| O8 | A `settings.json` key the engine cannot merge (a shape it does not understand, such as a `hooks` value that is not an object of lists, or a local value whose JSON type differs from the plugin's object) is reported as a conflict and left untouched | instruction: "and a settings key it cannot merge" | |
| O9 | The engine prints one machine-readable result: per category (commands, agents, hooks, hook-libs, hook-prompts, workflows, libs, contracts, skills, rules, settings), the lists `added`, `replaced`, `removed`, `unchanged`, `preserved`, `conflicts` | instruction: "prints a machine-readable result (per category: added, replaced, removed, unchanged, preserved, conflicts)" | yes |
| O10 | Under a dry-run flag the engine computes and prints the same result and writes nothing: the target's file tree, modes and git index are unchanged | instruction: "under a dry-run flag, writes nothing" | yes |
| O11 | Under the preserve-all flag the engine adds what is missing but replaces and removes nothing that exists (matching `--preserve-all`'s documented meaning in `rebase-project.md`) | instruction: "It honours the preserve-all flag" | |
| O12 | The engine never writes constitution.md, stack.md, process.md, verification.md, design.md or ship.md, in any mode | instruction: "never writes constitution.md, stack.md, process.md, verification.md, design.md or ship.md" | yes |
| O13 | `--refresh` keeps its present contract: it never creates a component directory and never deletes a file; its existing tests stay green | instruction: "The refresh mode keeps its present contract (never creates, never deletes)" | yes |
| O14 | Running the engine a second time on its own output reports zero added, replaced and removed files and leaves the tree byte-identical | instruction (acceptance): "a second run reports zero changes" | yes |
| O15 | New BATS cases prove O1, O2, O4, O5, O7, O8, O10, O12, O13 and O14, and the full battery (`npx jest`, the BATS suites, pytest) is green | instruction (acceptance): "new BATS cases prove each of the above and the full battery is green" | |

## Intended Change

Today `/rebase-project` (`packages/core/commands/rebase-project.md`, 1,451 lines) has the model
diff and copy each component by hand: Step 2 (lines 237–683) builds per-component diffs, Step 4
(684–1180) applies them, the settings merge and its registration-count check are inline prose
plus a `python3` one-liner (§4.6), and the retired agent/skill/hook/command lists are tables in
that prose (§2.1, §2.2, §2.3, §2.4). `scaffold-project.sh` already owns pieces — `--sync-agents`,
`--stamp-version`, `--git-files`, `--records-cutover`, `reconcile_selected_skills()` — but has
no mode that copies with byte comparison, removes anything, or merges settings.

After this change, `scaffold-project.sh --rebase --plugin-dir DIR [--dry-run] [--preserve-all]
[project-dir]` does all of that in one call and prints a JSON result. The prompt is NOT rewritten
here (that is F-3, "Rebase prompt on the engine"); the prose tables stay in place, and a test holds
them equal to the data file until F-3 removes them.

Checkable outcomes:
- On an aged fixture (a project scaffolded, then mutated to look like an older install: a
  framework file replaced with a previously-shipped version, a framework file missing, a
  retired file present, a user agent, a user hook registration, an owner-edited framework
  file, an owner-filled `verification.md`), one `--rebase` call: restores the missing file
  (`added`), replaces the old version (`replaced`), deletes the retired file (`removed`), keeps
  the user agent (`preserved`), keeps the user hook registration, reports the owner-edited file
  under `conflicts` and leaves it byte-identical, and leaves all six owner-governed rules
  byte-identical.
- `--rebase --dry-run` on the same fixture prints the same lists and leaves `git status
  --porcelain` empty, and file modes unchanged.
- A second `--rebase` reports empty `added`/`replaced`/`removed` everywhere.
- A settings fixture whose merged block would fall below the plugin's registration or prompt
  count is not written, and the result says why.
- `--refresh` on a tree with a retired file still leaves that file in place.

## Decision

Revised 2026-11-20 by the TRD 1.1.0 review; every change from the first version of this section
is an OWNER-CALL (Forge, routine engineering choice), recorded in the TRD's changelog for the
owner to review. The TRD's decision IDs are given in brackets.

**One new mode in `scaffold-project.sh`, `--rebase`, with `--dry-run` and `--preserve-all`
modifiers, exclusive with every other mode [D1].** NOT a separate script: the render below runs
this file's own scaffold, and a second script would call into it anyway. NOT a change to
`--refresh`: it runs unattended at SessionStart, and the owner's default (roadmap open question
3) is that only the rebase removes files.

**What the plugin ships is a render, not a source map [D4, D13].** The mode runs this same
script's ordinary scaffold (`--plugin-dir <absolute dir> --copy-skills`) into a temp directory
outside the target, with a selection file naming the skill folders the target already has
installed, so no library skill is added that the target does not have. The scaffold already
resolves both plugin layouts (plugin cache vs monorepo), applies every copy-loop exclusion and
copies skill folders whole; its output is, by construction, what the plugin installs. The
engine compares that temp `.claude/` with the target's, tree against tree. The scaffold runs
fine outside a git work tree (`ensure_gitignore untrack` skips untracking there); the render
sets `GIT_CEILING_DIRECTORIES` so that holds even when `TMPDIR` sits inside a repository, and
passes an absolute plugin dir because the scaffold `cd`s into its target before copying.

**Plan, then apply [D2, D3].** A Python planner (as the existing manifest and settings logic
already are), invoked from the bash mode, computes the full plan without writing; `--dry-run`
prints it and stops, otherwise the same program applies it. That makes "dry-run writes nothing"
structural rather than a flag checked at every write site.

**Owner-edit detection: hashes of what each release installed [D5, D6, D7, D8].**
- The plugin ships `packages/core/templates/shipped-hashes.json` (reachable in both layouts via
  the `templates` symlink): for each installed path, the git blob ids of every version a `v*`
  release installed there (agents hashed with their generated preload block stripped and
  normalised, through a new `normhash` mode of the existing `agent_skills_program()`), plus the
  hashes of every prompt-type hook text a release's settings carried, taken exactly as stored.
- It is seeded by rendering each `v*` tag with that tag's own `scaffold-project.sh`, every
  library skill selected, and hashing what lands. Symlinked sources, renames and layout moves
  are resolved by construction. A release appends the tag before it (`--append <tag>`); a check
  verifies the file's structure always, that every path a release installed but the plugin no
  longer ships is on the retired list always, and, on a full clone with tags, that the newest
  listed tag is the newest `v*` tag older than HEAD.
- A differing vendored file is an **older shipped version** (replaced) when its hash is listed
  for its path; otherwise it is an **owner edit** (conflict, untouched). The current plugin's
  bytes are recognised by direct comparison with the render, so the list never needs the
  release being built. Nothing is written into the project.
- A file installed from a build that was never tagged reads as a conflict: the fail-safe
  direction, nothing is overwritten.
- Rejected: a per-project record of what the engine wrote (one more file in every project, and
  it must never record an owner edit's hash or the next run replaces the edit); a per-file
  `git log --raw` walk over the sources (renames and symlinks by hand, and it lists versions no
  release shipped); treating every differing file as older-shipped (today's behaviour: it fails
  the owner's requirement outright).

**Retired list: `packages/core/templates/retired-files.json` [D9, D10]**, one entry per retired
installed path (e.g. `commands/harden-trd-team.md`, `hooks/learning.sh`, `hooks/permitter/` as a
directory, `hooks/lib/transcript-text.js`, `hooks/prompts/subagent-discipline.prompt.md`,
`skills/verify-plan-recovery/`), each with the release it was retired in and what replaced it,
seeded from the three prose tables and the retired-hooks paragraph and from `git log
--diff-filter=D`, then completed against the release renders. The engine removes a file only
when it is listed there (never by "in vendored, not in plugin"), so a user's own file can never
be deleted by inference. Its Jest test asserts every name in the `rebase-project.md` retired
tables and paragraph is in the file and no listed path is shipped by the current plugin;
completeness against history is the shipped-hash check above, which needs no git history.

**Settings merge** (Python, in the planner) [D11, D12]:
1. The ensemble-owned block is the plugin default's `hooks` (from
   `templates/claude-directory/settings.json`, which `generate-hooks-artifacts.sh` already
   generates from `hooks.manifest.json` and a CI check keeps equal). No second generator.
2. A vendored registration is ensemble-owned, and dropped, when it is a `command` referencing
   `.claude/hooks/<file>` for a `<file>` in the manifest or the retired list (on any event, so a
   manifest file registered on the wrong event goes too), or a `prompt` whose text equals the
   plugin default's or whose hash, of the text exactly as stored, is in the shipped prompt-hash
   set.
3. Every other registration is the user's and is carried forward on its own event and matcher
   group, after the plugin's groups, in its original order — compared as whole registrations,
   never by filename. A user command naming a file that shares a manifest hook's name at
   another path (`scripts/formatter.sh`) is the user's.
4. Every other top-level key: absent locally → added from the plugin; present locally →
   local value kept, recursing into objects so nested new plugin keys are added. A key whose
   local and plugin values are both present but one is an object and the other is not is a
   conflict: local value kept, reported. A `hooks` value (or an event's value) of the wrong
   shape is a conflict: the merge does not write `settings.json`, and the result says so.
5. Pre-write guard, also exposed as its own `guard` mode so it can be tested on crafted blocks:
   count registrations and prompt-type entries in the merged block; if either is below the
   plugin default's, do not write and report `refused`.
6. Version keys are left to the strict stamp, which runs last; it rewrites `refreshed_at` and
   `rebased_at` on every apply, so tests compare `settings.json` with those two keys removed.
7. Unchanged result → file not rewritten (bytes untouched), matching `stamp_ensemble_version`.

**Preserve-all [D14]** follows `rebase-project.md`'s documented table, not O11's wording above
(the TRD corrects O11, its OQ-4): agents and skills add new only; commands, hooks, hook libs,
hook prompts, workflows, libs and contracts are replaced when they differ; framework rules are
preserved; nothing is removed. Settings: the `hooks` block is still regenerated and retired
registrations dropped (it is ensemble-owned, never a user preference: §4.6 3a), absent keys are
added, and no other existing value changes. Owner-governed rules are excluded in every mode by
the existing `AUTHORED_RULES` list, read through a helper that keeps its line unchanged [D15].

**Apply order [D17]**: files, `settings.json`, hook modes, selection reconcile, preloads
(conflicted agents excluded), git files, records cutover, and the strict version stamp last, as
`refresh_project()` and `rebase-project.md` §4.7a/§4.7b/§4.8 already order them. Every written
file gets an explicit mode: a replaced file keeps its prior mode, an added file takes the
source's (`mkstemp` would leave 0600).

**Result format [D16]**: one JSON object on stdout's last line, prefixed `REBASE_RESULT `, so
callers (F-3's prompt) parse it the way `runtime-refresh.sh` parses `REFRESH_SUMMARY`:
`{"mode":"apply|dry-run","preserveAll":bool,"categories":{"<cat>":{"added":[],"replaced":[],
"removed":[],"unchanged":<count>,"preserved":[],"conflicts":[{"path":..,"reason":..}]}},
"settings":{<the same six>, "counts":..,"written":..,"refused":..},"steps":{"modes":..,
"selection":..,"preloads":..,"gitFiles":..,"recordsCutover":..,"stamp":..}}`.
`unchanged` is a count (it is large and never acted on); the others are lists.

O14's byte-identity is corrected in the TRD for the stamp's two timestamps (its OQ-5), and
O15's "green" is read as no new failure against the merge-base battery (its D18).

size: 8 files touched (packages/core/scripts/scaffold-project.sh; new packages/core/templates/retired-files.json; new packages/core/templates/shipped-hashes.json; new packages/core/scripts/generate-shipped-hashes.sh; new packages/core/scripts/rebase-engine.test.sh; new packages/core/lib/retired-files.test.js; new test/fixtures/rebase-engine/ (older-version fixtures copied from a release render); CHANGELOG.md). This repository's own vendored `.claude/` is not touched.

predecessor: none recent — the newest commit touching `scaffold-project.sh` or `rebase-project.md` on `origin/main` is #166, merged 2026-11-16, four days ago, and it built none of this.

Description items beyond the change: none. Every listed mechanism (retired data file, its
in-step test, settings guard, conflict detection, dry-run, BATS cases) is named in the
description and is needed to show the change works; all kept.

## Grounding

- `packages/core/scripts/scaffold-project.sh` (2,256 lines) [read]
  - Modes parsed at lines 85–203; each strict mode is exclusive with the others (pattern to
    follow for `--rebase`, `--dry-run`, `--preserve-all`). Mode dispatch at the bottom
    (`if [[ "${BASH_SOURCE[0]}" == "${0}" ]]`, ~line 2236) [read].
  - Copy functions `copy_commands` (551, excludes `init-project.md`, `rebase-project.md`),
    `copy_workflows` (485, excludes `*.test.js`, `test-harness.js`), `copy_contracts` (380),
    `copy_libs` (448, `cp -L`, excludes `*.test.js`, prefers `$PLUGIN_DIR/lib` when it holds
    `*.js`), `copy_agents` (314), `copy_hooks` (906; cache vs monorepo source layout; manifest
    driven), `copy_hook_libs` (835), `copy_hook_prompts` (786), `copy_framework_skills` (1031),
    `copy_skills` (1090) [read]. Every loop is "exists → skip unless --force", none compares
    bytes, so they cannot do the rebase in place; **reuse them whole** by running the ordinary
    scaffold into an empty temp directory (the render, TRD D4), where "skip if exists" never fires.
  - `refresh_rules` (1719) holds `AUTHORED_RULES` = constitution, stack, process, verification,
    design, ship [read]. Reuse that list through a helper that keeps the `local AUTHORED_RULES=(`
    line as it is (three test greps read that exact form; TRD D15), not by lifting it to a global.
  - `reconcile_selected_skills` (1467), `inject_agent_skills` (1410), `agent_skills_program`
    (1192; Python with `strip_skills`/`strip_body_block`), `sync_agents` (1539) [read]. Reuse.
  - `stamp_ensemble_version` (1589; `strict` writes rebased_at/previous_version; writes nothing
    when unchanged; atomic replace preserving mode) [read]. Reuse; its atomic-write pattern is
    the convention for the settings merge.
  - `ensure_gitignore untrack` / `ensure_gitattributes` (`--git-files`, 1780–1876) and
    `records_cutover` (1878) [read]. Reuse unchanged, apply-only.
  - `refresh_project` (1956) prints `REFRESH_SUMMARY` as its last stdout line, parsed by
    `runtime-refresh.sh` [read]. Must not change.
  - Hazard: `set -euo pipefail`; `info`/`warn` write to stdout — the rebase mode must send
    chatter to stderr so the last stdout line stays the result [read].
- `packages/core/commands/rebase-project.md` [read]: retired tables at §2.1 (agents: none
  yet), §2.2 (skills: `verify-plan-recovery`), §2.3 (commands: `harden-trd-team.md`,
  `verify-trd-team.md`, `implement-trd-team.md`, `fix-issue.md`, `investigate-issue.md`,
  `fix.md`, `investigate.md`), §2.4 (hooks: `permitter/`, `learning.sh`, `save-remote-logs.js`,
  `async-discipline.js`, `autonomy-discipline.js`, `subagent-discipline.js`,
  `lib/async-claim-detector.js`, `lib/transcript-text.js`, `wiggum.js`,
  `prompts/subagent-discipline.prompt.md`); settings rules §4.6 (lines 965–1040); rules policy
  §4.7. Not edited by this feature (F-3 rewrites it).
- `git log --diff-filter=D` over framework sources on main [ran] adds names absent from the
  prose: `commands/create-prd-team.md`, `create-trd-team.md`, `implement-trd-proposed.md`,
  `implement-trd-tasklist.md`; `hooks/prompts/async-discipline.prompt.md`,
  `autonomy-discipline.prompt.md`; `hooks/hooks.json` (not an installed file — exclude);
  `commands/init-project.md.bak` (never shipped — exclude).
- `packages/core/templates/claude-directory/settings.json` [ran]: keys `$schema`, `env`,
  `permissions`, `hooks`, `ensemble`; 10 registrations, 1 prompt-type (Stop). Its `hooks` is
  generated from `hooks.manifest.json` by `generate-hooks-artifacts.sh` (line 131) [read].
- Prompt-type hook text has changed shape across releases (v4.6.0 began
  "**** STOP HOOK FIRED — FORCING CONTINUATION ****"; today "Ensemble stop discipline: ...")
  [ran] — so ownership of a prompt entry cannot be decided by a fixed marker; the hash set taken
  from each release's rendered settings, plus direct comparison with today's template, decides it.
- `packages/full/` [ran]: `templates`, `scripts`, `workflows`, `contracts` and `skills-lib` are
  directory symlinks into core/skills; `lib/` and `hooks/` hold per-file symlinks. New data files
  under `packages/core/templates/` are therefore reachable in the cache layout with no new symlink.
- `packages/core/scripts/scaffold-project.test.sh` (3,167 lines, 160 cases) [read]: setup/teardown
  pattern with `mktemp -d` and restore maps. New cases go in a sibling file
  (`rebase-engine.test.sh`) so this one does not grow further; it must be picked up by the
  battery's BATS glob (`packages/core/scripts/*.test.sh`).
- `.github/workflows/ci.yml` sets no `fetch-depth` [ran] → shallow clone in CI; history-based
  assertions must skip there, and the shipped-hash list must be committed, not generated in CI.
- `test/integration/tests/scaffold-delivery.test.sh`, `runtime-integrity.test.sh` read scaffold
  behaviour [read]; they must stay green (no change expected).
- Hazard: this repository's own `.claude/` is a vendored copy; the feature does not rebase it.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Is `autonomy.md` owner-governed? (roadmap open question 1) | It stays framework-shipped and is replaced when it is an older shipped version; an owner-edited copy is a conflict and left untouched (the owner's recorded default) | owner-only |
| OQ-2 | Should `--refresh` also remove retired files? (roadmap open question 3) | No: only `--rebase` removes; `--refresh` keeps never-create/never-delete (the owner's recorded default) | owner-only |
| OQ-3 | How an owner edit is told apart from an older shipped file | One shipped-hash list in the plugin, built by rendering every `v*` release tag with that tag's own scaffold; the current plugin's bytes recognised by direct comparison; no per-project record. Installs from untagged builds read as conflicts, the fail-safe direction (OWNER-CALL, recorded by Forge as a routine engineering choice; revised in the TRD 1.1.0 review) | |
| OQ-9 | `--refresh` (run at SessionStart after every plugin upgrade) already replaces framework files without comparing bytes, so O7's conflict detection protects only edits made since the last upgrade, or with refresh turned off. Should refresh skip owner-edited files using the same hash list? | No change to refresh in this feature (the out-of-scope fence; O13). Recorded in the TRD's changelog, Could Not Verify and the CHANGELOG's Not-yet-proven list | owner-only |

The TRD carries further design questions of its own (OQ-4 to OQ-8 and OQ-10), each with the
assumption it made; the IDs above are shared with it.
