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

