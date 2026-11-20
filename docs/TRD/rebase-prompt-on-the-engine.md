# TRD: rebase-prompt-on-the-engine

**Source PRD**: None — small change, owner's instruction of 2026-11-20 (feature F-3 of workplan
`rebase-project-fast`, `docs/plans/rebase-project-fast/roadmap.md` item 3). Builds on the
deterministic rebase engine (`docs/TRD/deterministic-rebase-engine.md`, merged into this branch
at 3e27acd1).

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | `/rebase-project` makes exactly one engine call (`scaffold-project.sh --rebase`, with `--dry-run` and/or `--preserve-all` passed through) and the model does nothing to the tree except resolve the conflicts that call reports; it does no per-component diffing, copying, deleting, settings merging, mode setting, preload injection, git-file, cutover or stamp step of its own | roadmap item 3 brief and acceptance: "the prompt makes one engine call and the model only resolves reported conflicts and writes the readout" | yes |
| O2 | The prompt no longer contains Step 2's per-component diff prose, Step 4's selective-update prose, the stack.md skill table or capability-word inference | roadmap item 3 acceptance: "Step 2 and Step 4 per-component prose and the stack.md skill table are gone" | yes |
| O3 | The prompt keeps Step 0 (installation check, clean-tree precondition, `--force` override), the plugin-path resolution, conflict handling — an owner-edited vendored file: show the owner's change against the new shipped version, then merge or keep the owner's copy, saying which; an unmergeable settings key: resolve or leave it, saying which — and the four-section readout and banner | roadmap item 3 brief | yes |
| O4 | `lint-command-structure.js` passes on the prompt's copies, `generate-hooks-artifacts.sh` leaves no diff, and the battery is green apart from failures already present on the merge base | roadmap item 3 acceptance | |
| O5 | A headless `/rebase-project` on an aged fixture ends with `═══ COMMAND COMPLETE: /rebase-project ═══` and every filesystem assertion of `test/smoke/scenarios/rebase-old-tree.sh` passes | roadmap item 3 acceptance | yes |

## Intended Change

Before: `packages/core/commands/rebase-project.md` is 1,451 lines. Steps 2 (component diff,
line 237) and 4 (selective update, lines 684–1180) have the model diff and update every
component itself, including a ~30-row stack.md→skill table with capability-word inference
(§2.2), a hand-run settings merge with an inline `python3` count (§4.6), and three separate
script calls for git files (§4.7a), records cutover (§4.7b) and the version stamp (§4.8) [read].

After, the prompt is:

1. **Frontmatter, usage, Goals** rewritten to the engine's terms: a framework file is replaced
   when it differs *and* matches a version the framework shipped; one that matches none is an
   owner edit, reported as a conflict; `--preserve-all` adds new agents/skills only, leaves
   framework rules and retired files, and still regenerates the ensemble-owned `hooks` block.
2. **Step 0** as today (installation check — `stack.md` no longer "required for skill
   recomputation" — clean-tree precondition, `--force` override), plus: record the vendored
   `ensemble.version` and the list of `refs/ensemble/records/*` before anything runs.
3. **Path Resolution** as today (plugin root; the `@packages` → plugin-root table), reframed as
   also "where the shipped version of a conflicted file lives".
4. **Recovery is git** and **Rollback** kept, with references to deleted step numbers replaced
   by "the engine's records cutover"; the ref-delete step applies "only if `git ls-remote
   origin` lists it".
5. **Step 1 — one engine call**: `bash "<plugin-root>/scripts/scaffold-project.sh" --rebase
   --plugin-dir "<plugin-root>" [--dry-run] [--preserve-all] "<project-root>"`, reading only
   the last stdout line, `REBASE_RESULT <json>`. `error` present: `COMMAND STUCK`. An error
   from the planning stage wrote nothing; an apply-stage error (a failed copy, delete or
   settings write) can leave a partly applied tree with no stamp — the STUCK readout says so
   and points at `git status --short .claude/` and `git restore .claude/`.
6. **Step 2 — conflicts** (skipped entirely under `--dry-run`, which lists conflicts and
   resolves none):
   - *File conflict* (`categories.<cat>.conflicts`, `reason: "owner edit"`). Find the owner's
     change from the project's own history: `git log --format='%h %ad %s' --date=short --
     .claude/<path>` and `git log -p -- .claude/<path>`. If the history shows no change to
     the file after the commit that installed it, there is no owner edit (the file came from
     an untagged plugin build — engine TR1) — **replace it with the shipped version**, and say
     so in DECISIONS. Otherwise diff the owner's change against the shipped version (located
     through the Path Resolution table) and either **merge** (shipped version plus the owner's
     change, when the change applies cleanly and nothing of either is lost) or **keep the
     owner's copy** (when the change overlaps lines the framework changed), saying which, per
     file, in DECISIONS; a kept file goes in ISSUES as needing a manual merge. Never discard an
     owner change. A merged hook keeps its mode; a merged or kept agent keeps the project
     copy's `skills:` list and `ENSEMBLE:SKILLS` block (the engine leaves conflicted agents
     out of the preload step), and the readout says its preloads were not refreshed.
   - *Settings conflict* (`settings.conflicts`). Resolve it only when the local value can be
     put into the shape the engine understands without losing any of it (the shipped shape is
     `templates/claude-directory/settings.json`; the generated hook table lists the current
     hook set); otherwise leave it. Either way say which in DECISIONS. No second engine call:
     a resolved or left settings conflict, and a guard refusal (`settings.refused`), go in
     ISSUES, and NEXT says to commit and run `/rebase-project` again, because the engine
     stamped the version while the old `hooks` block may still be in force.
7. **Step 3 — readout** from the result: version before/after (Step 0's value, the stamp's
   `ensemble.version` and `previous_version`, or `pluginVersion` under dry-run); per category
   added/replaced/removed/preserved; framework rules; governance files preserved; each `steps`
   entry that is `failed: …` or `skipped: …` (other than an expected skip such as no remote)
   in ISSUES, `stamp` failed or skipped meaning "re-run"; git files and records cutover:
   files untracked (`git diff --cached --name-only --diff-filter=D -- .trd-state`, named by
   folder), refs seeded (records refs present now that Step 0 did not list), pushed or kept
   local (`git ls-remote origin 'refs/ensemble/records/*'`), and the instruction to commit the
   untracking on the base branch. The engine does not report why a feature was not seeded;
   the prompt says nothing it cannot see. Then the four-section readout, notify, banner.

## Decision

The prompt is a thin caller of the engine: one engine call, then conflict resolution and the
readout, nothing else. The engine (F-2) already does, and tests in
`packages/core/scripts/rebase-engine.test.sh`, every behaviour Steps 2 and 4 described, so the
tests that asserted those behaviours *as prompt prose* are retargeted at the prompt's new
contract (it delegates to the engine, and the engine's code carries the guarantee), never
rebuilt as new engine tests.

- **A conflict with no owner commit is replaced (OWNER-CALL, Forge).** The brief's two
  outcomes, merge or keep, presume an owner edit. The engine also reports as "owner edit" any
  file installed from a plugin build that was never tagged (engine TR1); a two-way diff
  cannot separate such drift from an owner's change, so a merge would reintroduce old
  framework text and "keep" would freeze the file. The project's git history decides: no
  change after install → no owner edit → replace, stated in DECISIONS. An owner change is
  never discarded.
- **The generated hook table stays** (so `check-hook-prose.py` and `generate-hooks-artifacts.sh`
  are unchanged), placed in the settings-conflict section beside a pointer to the shipped
  `settings.json`, which is the actual source for a `hooks` repair.
- **The `@packages/...` → plugin-root table stays**, also used to locate the shipped version of
  a conflicted file (the render the engine compared against is gone when it exits); an agent
  conflict is diffed against `agents-lib/<name>.md` ignoring the generated preload content.
- **No second engine call** for a settings conflict or guard refusal; NEXT says re-run.
- **The prompt's `--force` is not passed to the engine**; it only overrides the clean-tree stop.
- **Records cutover facts come from git**, not the engine's result, which records only `ok`
  or the first warning: `git diff --cached`, `git for-each-ref` before and after, `git
  ls-remote`. The old "skipped: <slug> (why)" line is dropped because nothing reports it.
- **Smoke fixture**: the aging now plants `autonomy.md` as release v4.10.0 shipped it (blob
  listed in `shipped-hashes.json`), saved as `test/fixtures/rebase-engine/older/rules/autonomy.md`,
  so the engine replaces it deterministically; and it commits an owner edit (one appended line)
  to `commands/plan.md`, so the conflict path runs on a real model session and the scenario can
  assert the owner's line survives.
- **`retired-files.test.js` assertion (a)** read the retired tables out of the prompt. The
  engine TRD (D10) planned to delete it here; it is kept instead as a ratchet over a frozen
  literal list of the names the prose carried, so no entry can be dropped from
  `retired-files.json` unnoticed (OWNER-CALL, Forge).
- **Docs that this change makes false are corrected** (constitution quality gate,
  "Documentation updated"): skills are no longer recomputed from `stack.md`, agents no longer
  go through `--agent-status`/`--sync-agents`, and the CHANGELOG's "not yet proven" bullets
  about F-3 change.

size: 21 files touched (packages/core/commands/rebase-project.md, .claude/commands/rebase-project.md, packages/full/commands/plugin-only/rebase-project.md, packages/core/commands/init-project.md, .claude/commands/init-project.md, packages/full/commands/plugin-only/init-project.md, packages/core/commands/records-cutover-prose.test.js, packages/core/lib/retired-files.test.js, packages/core/scripts/scaffold-project.test.sh, test/integration/tests/runtime-integrity.test.sh, test/smoke/scenarios/rebase-old-tree.sh, test/smoke/lib/project.sh, test/fixtures/rebase-engine/older/rules/autonomy.md (new), test/fixtures/rebase-engine/README.md, docs/guides/INSTALL.md, docs/guides/ARCHITECTURE.md, docs/reference/other-commands.md, docs/reference/agents.md, docs/reference/README.md, CHANGELOG.md, docs/TRD/rebase-prompt-on-the-engine.md)

predecessor: deterministic rebase engine (merged into this branch 2026-11-20, 3e27acd1; not yet on `origin/main`) already provides: the engine, `rebase-engine.test.sh` (retired-file removal, owner-edit conflicts, governance byte-identity, settings merge and guard, hook modes, preloads, git files, cutover, stamp, dry-run), `retired-files.json`, `shipped-hashes.json`, the `older/` fixture pattern.
rebuilds: none. The prompt-prose tests for execute bits, rule replacement, custom-skill preservation, framework-skill protection, the git-files step and the stamp are retargeted to assert delegation, not re-tested.

the description asks for updates to `check-hook-prose.py` and `scaffold-delivery.test.sh` beyond the change; cut - the hook table and the plugin-path table both stay, so neither file's assertion changes
the description asks for a headless rebase on an aged fixture beyond the change; kept - the owner made it acceptance, and it is the only check that the rewritten prompt runs end to end

absorbed:     the smoke aging plants a hand-written autonomy.md the engine reads as an owner edit — O5's assertion cannot pass deterministically without a shipped older version  [BLOCKS]
absorbed:     init-project.md (three copies) points at "`/rebase-project` Step 4.7a", a heading this change deletes  [BLOCKS]
absorbed:     scaffold-project.test.sh "FIX-006 stamp" reads `#### 4.7`/`#### 4.8`/`### Step 5` headings this change deletes — the battery cannot be green without retargeting it  [BLOCKS]
absorbed:     docs and CHANGELOG lines this change makes false — the quality gate "Documentation updated" fails without them  [BLOCKS]
not absorbed: `scaffold-project.sh` comments name "/rebase-project Step 4.7b", "Step 4.8" and "§4.6" — comments only; the engine is a non-goal and its tests pin it

## Non-Goals

- No change to the engine (`scaffold-project.sh`), `retired-files.json`, `shipped-hashes.json`
  or `--refresh`.
- No change to the flags or their meaning (`--dry-run`, `--preserve-all`, `--force`) or the
  clean-tree precondition.
- No timing measurement (workplan item 4, to come).
- `/init-project` changes only where its text points at the deleted steps or describes the
  removed skill recomputation.

## Verification Artifacts

None apply — the change is a command prompt, its tests and docs; no screen, design,
data-rendering view or designed flow is in scope.

## Verification Environment

**Environment**: local (unit, BATS, prose tests) and fixtures (a headless `claude --print --plugin-dir packages/full --setting-sources project --permission-mode bypassPermissions` session in a scaffolded, aged fixture repo; `test/smoke/scenarios/rebase-old-tree.sh` builds one)
**Refresh**: local: none needed; fixtures: `scaffold-project.sh --refresh --plugin-dir packages/full <slot folder>`, or rebuild the scenario's temp project
**Cannot be checked there**: `claude --remote` sessions and failures that occur only on the GitHub Actions runner

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | When a conflicted file has no owner commit after install, may the rebase replace it with the shipped version? | Yes — it is not an owner edit; stated per file in DECISIONS. An owner change is never discarded | |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Rewrite `packages/core/commands/rebase-project.md` as a thin engine caller (Intended Change items 1–7), run `bash packages/core/scripts/generate-hooks-artifacts.sh` to refresh its hook table and sync the plugin-only copy, copy it to `.claude/commands/rebase-project.md` | O1, O2, O3, O4 | None | Exactly one line invokes `scaffold-project.sh` with `--rebase` and no other line invokes `scaffold-project.sh`; no `#### 2.`/`#### 4.` headings, no `--sync-agents`, `--agent-status`, `--git-files`, `--records-cutover` or `--stamp-version`, no stack-indicator table, no `chmod +x`; the conflict section names both file outcomes (merge, keep the owner's copy), the no-owner-commit replace rule, both settings outcomes (resolve, leave), and "under `--dry-run` … resolves none"; the `error` rule distinguishes planning (nothing written) from apply (may be partly applied); `settings.refused` and a `skipped` stamp reach ISSUES; the three copies are byte-identical; `lint-command-structure.js` exits 0 on all three; `generate-hooks-artifacts.sh --check` exits 0 |
| FIX-002 | Retarget every test that reads the prompt's text: `records-cutover-prose.test.js` (new headings; report guidance from git; rollback's `git ls-remote` condition), `retired-files.test.js` (assertion (a) against a frozen literal list of the former prose names), `scaffold-project.test.sh` ("FIX-002: … uses the script for the agent steps", "FIX-001 (f)" and "FIX-006 stamp: rebase-project.md runs --stamp-version …" become one-engine-call / no-own-stamp assertions; governance-list tests keep passing), `runtime-integrity.test.sh` (execute-bit, framework-rule, custom-skill, framework-skill, git-files and orphaned-row tests assert delegation and the engine code that carries each guarantee; add a test that the stack.md skill table and per-component steps are gone) | O2, O4 | FIX-001 | Each retargeted test fails against the old prompt (`git show 3e27acd1:packages/core/commands/rebase-project.md` swapped in) and passes on the new one; `npx jest packages/core/commands/records-cutover-prose.test.js packages/core/lib/retired-files.test.js` and `bats packages/core/scripts/scaffold-project.test.sh test/integration/tests/runtime-integrity.test.sh test/integration/tests/scaffold-delivery.test.sh` pass (apart from failures present on 3e27acd1) |
| FIX-003 | Smoke: add `test/fixtures/rebase-engine/older/rules/autonomy.md` (bytes of `v4.10.0:packages/core/templates/claude-directory/rules/autonomy.md`) and a README line; `smoke_age_project` plants it and appends a marked owner line to `.claude/commands/plan.md` before its commit; `smoke_assert_aged` checks both took; `rebase-old-tree.sh` asserts `autonomy.md` equals the current template byte for byte and the owner line in `plan.md` survives; header comments say classification is the engine's | O5 | FIX-001 | `git hash-object` of the fixture is `c37d1f9ad954a179b84e9e05e4da95b47a3a68d6`; `bash -n` passes on both scripts; running `test/smoke/scenarios/rebase-old-tree.sh` (one headless model session) passes every assertion and the final output carries `═══ COMMAND COMPLETE: /rebase-project ═══` |
| FIX-004 | Correct docs this change makes false: `init-project.md` (three copies) lines on "Step 4.7a", "can add later with `/rebase-project` after updating stack.md" and "/rebase-project's version detection"; `docs/reference/agents.md` (agent compare via `--agent-status`/`--sync-agents`), `docs/reference/other-commands.md` (`/rebase-project` row), `docs/reference/README.md` ("Steps 1–5"), `docs/guides/INSTALL.md` and `docs/guides/ARCHITECTURE.md` where they describe how a rebase decides; `CHANGELOG.md` [Unreleased]: an entry for the prompt rewrite and the two F-3 "not yet proven" bullets updated | O3 | FIX-001 | No line in those files says the rebase recomputes skills from `stack.md`, compares agents with `--agent-status`/`--sync-agents`, or names a `/rebase-project` Step 4.x; the init-project copies stay byte-identical and `generate-hooks-artifacts.sh --check` exits 0 |
| AMEND-001 | [test-gap] O3: no test proves the prompt states its conflict rules — settings resolve-or-leave, dry-run resolves none, planning-vs-apply error, missing REBASE_RESULT line is STUCK, settings.refused to ISSUES, replace only when history shows the file arrived unedited; add prose assertions on packages/core/commands/rebase-project.md (e.g. in test/integration/tests/runtime-integrity.test.sh) that fai — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: packages/core/commands/rebase-project.md Steps 1-2; grep of rebase test files finds no assertion) | O3 | FIX-001, FIX-002 | `test/integration/tests/runtime-integrity.test.sh` carries one assertion per rule (file-conflict replace-only-on-proven-unedited-install and never discard an owner change; settings resolve-or-leave with no second engine call; `--dry-run` resolves none; planning-stage error wrote nothing vs apply-stage partial tree; a missing `REBASE_RESULT` line is COMMAND STUCK; `settings.refused` and a skipped `stamp` go to ISSUES), each fails against the old prompt (`git show 3e27acd1:packages/core/commands/rebase-project.md`) and `bats test/integration/tests/runtime-integrity.test.sh` passes |
| AMEND-002 | [test-gap] O5: test/smoke/scenarios/rebase-old-tree.sh banner check accepts COMMAND STUCK; it must require ═══ COMMAND COMPLETE: /rebase-project ═══ — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: test/smoke/scenarios/rebase-old-tree.sh:166-172) | O5 | FIX-003 | `test/smoke/scenarios/rebase-old-tree.sh` passes its banner assertion only on `═══ COMMAND COMPLETE: /rebase-project ═══`; a run ending `COMMAND STUCK` fails it; `bash -n` passes on the script |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/commands/rebase-project.md`, `.claude/commands/rebase-project.md`, `packages/full/commands/plugin-only/rebase-project.md`
- **Reuse:** the engine CLI and result: `scaffold-project.sh --rebase --plugin-dir DIR [--dry-run] [--preserve-all] [project-dir]`; last stdout line `REBASE_RESULT <json>`; keys `mode`, `preserveAll`, `pluginVersion`, `categories.<commands|agents|hooks|hook-libs|hook-prompts|workflows|libs|contracts|skills|rules>.{added,replaced,removed,preserved (lists), unchanged (count), conflicts ({path, reason})}` with paths relative to `.claude/`, `settings.{added,replaced,removed,preserved,unchanged,conflicts,counts,written,refused}`, `steps.{modes,selection,preloads,gitFiles,recordsCutover,stamp}` each `ok`/`skipped: …`/`failed: …`/`not run`, `error` [ran: dry-run on this repo printed exactly this shape]. Keep: Step 0, "Path Resolution", "Recovery is git", Rollback, Output discipline, Autonomous-execution discipline, the `ENSEMBLE:HOOKS-TABLE` markers [read]
- **Replaces:** Steps 1–5 (`### Step 1: Version Detection` through `</rebase-report>`), "Error Handling", "Flag Behavior Summary", "Notes"; the §2.2 stack table and capability inference, §4.6 merge rules, §4.7a/b and §4.8 script calls [read]
- **Follow:** `### Step 0: Validate Installation` directly followed by `### Path Resolution`, `## Rollback` directly followed by `## Error Handling` (runtime-integrity slices between them). Every governance list naming `process.md` also names `verification.md`; framework rules named exactly `async-discipline.md`, `autonomy.md`, `command-status.md`, never on a line with `verification.md` (scaffold-project.test.sh governance tests). Keep "Uncommitted changes under `.claude/`", "Not a git repository", "BEFORE anything else writes", "`--force` - Proceed even when" and no "Create backup" wording (runtime-integrity) [read]
- **Careful:** the engine exits 1 on `--force` [read: scaffold-project.sh:233-236]. Dry-run steps are all `not run`. Apply errors can leave a partial tree [read: scaffold-project.sh:2883-2900 per reviewer]. A guard refusal shows as `stamp: skipped: settings write refused by the guard` [read: scaffold-project.sh:3082-3086]. Never print `settings.json` `env` values in the readout

### FIX-002
- **Touches:** `packages/core/commands/records-cutover-prose.test.js`, `packages/core/lib/retired-files.test.js`, `packages/core/scripts/scaffold-project.test.sh`, `test/integration/tests/runtime-integrity.test.sh`
- **Reuse:** `proseNames()` in `retired-files.test.js`, run once against the pre-change prompt, produces the frozen literal [read]. Engine tests already prove each behaviour (`rebase-engine.test.sh`: post steps, aged fixture, settings, retired removal, owner-edit conflict) [read]
- **Replaces:** `runtime-integrity.test.sh` tests slicing `#### 4.7 Rules`, `#### 4.1 Update Skills`, `#### 2.2 Skill Diff`, `#### 4.7a`/`#### 4.8`, and the `chmod +x .claude/hooks/*.js` grep; `scaffold-project.test.sh` "FIX-002: rebase-project.md uses the script for the agent steps", "FIX-001 (f)" and "FIX-006 stamp: rebase-project.md runs --stamp-version as the last subsection of Step 4" (line ~2777); `records-cutover-prose.test.js` slices on `#### 4.7b`/`#### 4.8 ` [read]
- **Follow:** each retargeted test keeps a short WHY comment and says the behaviour is now the engine's; keep the three-copy byte-identity checks [read]
- **Careful:** keep "rebase writes no backup copies" and "rebase refuses to run on a dirty or unversioned .claude tree" passing unchanged; the CLAUDE.md half of the framework-skills test keeps asserting `framework-skills.txt` in CLAUDE.md [read]

### FIX-003
- **Touches:** `test/fixtures/rebase-engine/older/rules/autonomy.md`, `test/fixtures/rebase-engine/README.md`, `test/smoke/lib/project.sh`, `test/smoke/scenarios/rebase-old-tree.sh`
- **Reuse:** `git show v4.10.0:packages/core/templates/claude-directory/rules/autonomy.md` (blob `c37d1f9ad954a179b84e9e05e4da95b47a3a68d6`, listed under `rules/autonomy.md` in `shipped-hashes.json`) [ran]; `smoke_claude`, `smoke_final_text`, `smoke_file_hash` [read]
- **Replaces:** the hand-written `--wiggum` stale `autonomy.md` in `smoke_age_project` and the `--wiggum` greps in `smoke_assert_aged` and `rebase-old-tree.sh` [read]
- **Follow:** fixture README style of `test/fixtures/rebase-engine/README.md` [read]
- **Careful:** the retired team commands are in `retired-files.json`, so the engine removes them whatever their frontmatter [ran]; the owner line must be committed in the aging commit, so the prompt's history rule sees an owner change; the smoke sets `ENSEMBLE_RUNTIME_REFRESH_DISABLE=1` [read]

### FIX-004
- **Touches:** `packages/core/commands/init-project.md`, `.claude/commands/init-project.md`, `packages/full/commands/plugin-only/init-project.md`, `docs/guides/INSTALL.md`, `docs/guides/ARCHITECTURE.md`, `docs/reference/other-commands.md`, `docs/reference/agents.md`, `docs/reference/README.md`, `CHANGELOG.md`
- **Reuse:** the engine renders skills from the project's installed skill folders (`render_plugin_tree`, scaffold-project.sh ~1522-1530), so a skill is added by copying its folder from the plugin's `skills-lib/` into `.claude/skills/`; the next rebase keeps it current and adds it to `selected-skills.txt` [read]
- **Replaces:** `init-project.md:536`, `:618-620`, `:719`; `agents.md:20-26`; `other-commands.md:588`; `docs/reference/README.md:98`; CHANGELOG [Unreleased] "Not yet proven" F-3 bullets, lines 27-28 before this change (31-32 once the new "Changed" section sits above them) [read]
- **Follow:** edit `packages/core/commands/init-project.md`, then run `generate-hooks-artifacts.sh` (syncs the plugin-only copy) and copy to `.claude/commands/init-project.md` [read]
- **Careful:** `init-project.md` carries a generated hook table; edit outside its markers only

### AMEND-001

- **Touches:** `test/integration/tests/runtime-integrity.test.sh`
- **Careful:** the discovery recorded no `file`; `Touches` was filled in by hand from the files the fix edits, so the file-conflict guard in `task-graph.js` sees that it shares a file with FIX-002.

### AMEND-002

- **Touches:** `test/smoke/scenarios/rebase-old-tree.sh`
- **Careful:** the discovery recorded no `file`; `Touches` was filled in by hand from the file the fix edits, so the file-conflict guard in `task-graph.js` sees that it shares a file with FIX-003.

## Could Not Verify

State after `/audit-build` (2026-11-20): 5 of 5 verifiers reported; 11 requirements and 4 tasks were checked against the delivered code. Gaps that audit found are in its report, not here.

- **No PRD was supplied**, so nothing checked the delivered code against product requirements. The source is the roadmap item 3 brief (`docs/plans/rebase-project-fast/roadmap.md`); no verifier compared the TRD's objectives with that brief for fidelity or omissions.
- **The headless run that O5 and FIX-003 require was not made.** The audit read `test/smoke/scenarios/rebase-old-tree.sh` but started no model session, `implement.json` records no run, and the CHANGELOG still says "No headless `/rebase-project` run was made against the engine." This belongs to the functional verification loop (fixtures environment), not to a read-only audit.
- **A settings conflict is not planted in the smoke fixture** (`smoke_age_project` only rewrites `ensemble.version` in `settings.json`), so the settings half of Step 2's conflict rules is proven by prose assertions only, never by a live run, unless verification builds such a fixture.
- **Whether `CLAUDE_PLUGIN_ROOT` is set in the Bash tool's environment of a `--plugin-dir` session.** Earlier headless `--plugin-dir` rebases completed end to end [read: `.claude/verification-notes.md` 1456, 1469], but those notes do not say whether the run reached the plugin through `CLAUDE_PLUGIN_ROOT` or through the cache fallback. The prompt keeps the cache fallback and the "verify before trusting" check. Only a live session can settle this, and the audit ran none.
