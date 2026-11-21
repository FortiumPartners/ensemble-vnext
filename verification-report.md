# Functional Verification Report: rebase-prompt-on-the-engine

**Source PRD**: docs/TRD/rebase-prompt-on-the-engine.md § Intended Change
**Success definition**: .trd-state/rebase-prompt-on-the-engine/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 20 total — 20 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 20 of 20 proven — uncovered: none
**Must pass**: 11 of 11 proven
**Next**: close the feature — the command that ran this check closes it when an audit has already passed (its readout says whether it did); otherwise run `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Step 1 of the prompt makes exactly one engine call, `bash "<plugin-root>/scripts/scaffold-project.sh" --rebase --plugin-dir "<plugin-root>" [--dry-run] [--preserve-all] "<project-root>"`, passing `--dry-run` and `--preserve-all` through, and reads only the last stdout line, `REBASE_RESULT <json>` | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs1-step1.txt | 2 |
| FS-2 | In a headless `/rebase-project` on an aged fixture with no conflicts, the model issues exactly one `scaffold-project.sh --rebase` call and no tree-changing action of its own: no per-component diff, copy, delete, chmod, settings write, preload injection, git-file, records-cutover or version-stamp command | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs2/A-noconflict-toolcalls.txt | 2 |
| FS-3 | The prompt no longer contains the per-component diff prose (old Step 2), the selective-update prose (old Step 4), the stack.md→skill table, capability-word inference, the inline `python3` settings count, or the three separate git-file (§4.7a), records-cutover (§4.7b) and version-stamp (§4.8) script calls | .trd-state/rebase-prompt-on-the-engine/evidence/fs3-reverify2/fs3-search.txt | 1 |
| FS-4 | The prompt's frontmatter, usage and Goals describe the engine's rule: a framework file is replaced when it differs and matches a version the framework shipped; one matching none is an owner edit reported as a conflict; `--preserve-all` adds new agents and skills only, leaves framework rules and retired files, and still regenerates the ensemble-owned `hooks` block | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs4-usage-goals.txt | 2 |
| FS-5 | Step 0 keeps the installation check, the clean-tree precondition and the `--force` override, and no longer calls `stack.md` "required for skill recomputation" | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs5-step0.txt | 2 |
| FS-6 | Step 0 records the vendored `ensemble.version` and the list of `refs/ensemble/records/*` before anything else runs | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs6-order.txt | 2 |
| FS-7 | The Path Resolution section keeps the plugin-root resolution and the `@packages` → plugin-root table, and states it is also where the shipped version of a conflicted file is found | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs7-pathres.txt | 2 |
| FS-8 | "Recovery is git" and "Rollback" are kept; they reference no deleted step number (the cutover is "the engine's records cutover"), and the ref-delete step applies only if `git ls-remote origin` lists the ref | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs8-recovery-rollback.txt | 2 |
| FS-9 | An engine result carrying `error` ends the run `COMMAND STUCK`; for an apply-stage error the STUCK readout says the tree may be partly applied with no stamp and points at `git status --short .claude/` and `git restore .claude/` | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs9-error-branch.txt | 2 |
| FS-10 | Under `--dry-run`, the engine call carries `--dry-run`, Step 2 is skipped, conflicts are listed and none resolved, and the working tree is unchanged after the run | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs2/B-dryrun-toolcalls.txt | 2 |
| FS-11 | A file conflict whose project history shows no change to the file after the commit that installed it is treated as no owner edit: the file is replaced with the shipped version and DECISIONS says so | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs2/D-unchanged-readout.txt | 2 |
| FS-12 | A file conflict with a genuine owner change that applies cleanly is merged: the owner's change is found from the project's git history (`git log … -- .claude/<path>`, `git log -p`), the result is the shipped version plus the owner's change with nothing of either lost, and DECISIONS names the file as merged | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs2/C-conflicts-readout.txt | 2 |
| FS-13 | A file conflict whose owner change overlaps lines the framework changed keeps the owner's copy: DECISIONS names the file as kept, ISSUES names it as needing a manual merge, and the owner's change is not discarded | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs2/C-conflicts-readout.txt | 2 |
| FS-14 | A merged hook keeps its file mode; a merged or kept agent keeps the project copy's `skills:` list and `ENSEMBLE:SKILLS` block, and the readout says that agent's preloads were not refreshed | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/C-conflicts-readout.txt | 2 |
| FS-15 | A settings conflict is resolved only when the local value can be put into the engine's shape without losing any of it, otherwise left; DECISIONS says which; no second engine call is made; the resolved or left conflict and any guard refusal (`settings.refused`) go in ISSUES; NEXT says to commit and run `/rebase-project` again | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/C-conflicts-readout.txt | 2 |
| FS-16 | The readout reports the version before and after (Step 0's value, the stamp's `ensemble.version` and `previous_version`, or `pluginVersion` under dry-run), each category's added, replaced, removed and preserved files, framework rules, and the governance files preserved | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs16/readout.txt | 2 |
| FS-17 | Each engine `steps` entry that is `failed: …` or `skipped: …`, other than an expected skip such as no remote, is reported in ISSUES; a failed or skipped `stamp` is reported as meaning "re-run" | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs17-18-step3.txt | 2 |
| FS-18 | The readout reports git files and records cutover from what it can see: files untracked (from `git diff --cached --name-only --diff-filter=D -- .trd-state`, named by folder), records refs seeded (present now, not listed at Step 0), whether they were pushed or kept local (`git ls-remote origin 'refs/ensemble/records/*'`), and the instruction to commit the untracking on the base branch; it gives no reason for a feature not being seeded | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs17-18-step3.txt | 2 |
| FS-19 | The prompt ends with the four-section readout (STATE, DECISIONS, ISSUES, NEXT), the completion notification and the banner | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs19-closing.txt | 2 |
| FS-20 | A headless `/rebase-project` on an aged fixture completes and leaves the tree rebased: the output ends with `═══ COMMAND COMPLETE: /rebase-project ═══`; framework files are restored or replaced and retired ones removed; the owner's governance files and own skill are preserved; `ensemble.version` advances and `previous_version` records the aged value | .trd-state/rebase-prompt-on-the-engine/evidence/regression-2/fs20-smoke-rebase-old-tree.txt | 2 |

## Not Met

_None._

## Not Verifiable

_None._

