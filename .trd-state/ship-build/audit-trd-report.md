VERDICT: proceed with these caveats: 13 claims in the TRD's Could Not Verify section are still unchecked (each needs a live GitHub remote, a fixture session, an outside reviewer bot, a tracker CLI or the owner), and the wording of owner ruling J (J-1 to J-7) rests on relayed text only

# Audit report: ship-build

- Date: 2026-11-07
- Audited commit: ae1e297
- TRD: docs/TRD/ship-build.md
- Source: docs/PRD/ship-build.md

AUDIT: docs/TRD/ship-build.md    SOURCE: docs/PRD/ship-build.md

VERDICT: proceed with these caveats: 13 claims in the TRD's Could Not Verify section are still unchecked (each needs a live GitHub remote, a fixture session, an outside reviewer bot, a tracker CLI or the owner), and the wording of owner ruling J (J-1 to J-7) rests on relayed text only

REDESIGNED — could not be built as written
- The post-merge design sync step (D43 (c), §3.2 sync-design, SHIP-B016's test). Switching to the `design-sync/<feature>` branch failed when the run's uncommitted state files (shipped.json and the others D38 leaves uncommitted after a merge) differed from `origin/<base>`; reproduced in a scratch repo ("Your local changes ... would be overwritten"). The step now sets the working tree aside with a tagged `git stash push -u`, takes the stash's SHA by that tag, runs the sync, and on every way out switches back, runs `git stash apply <sha>` and drops the entry. If the apply fails it names the SHA in its issues and keeps the stash; it still never returns `stop`. Tested in the scratch repo; files came back intact. Rejected alternatives: committing the state first (D38 forbids it); a git worktree (the chained Skill runs from the session's directory).
- Lint and format fixes (D19, §3.2 fix-findings, SHIP-B016's test and grounding). A `[lint]` row the formatter had already fixed stayed open, so the chained `/implement-trd --reconcile` turned it into a TRD task (on a scratch ledger: AMEND-001) and sent an implementer to it. `fix-findings` now resolves each `[lint]` row with `discovered.resolve` before the chained build, and afterwards resolves every row it handed over except those the RETURN line (implement-trd.md line 1035) lists as not built. Rejected: filtering `[lint]` rows inside `promotable()`.

FIXED THE CITATION — referenced ID did not resolve
- The header and the Objectives paragraph now cite PRD 2.2.2, not 2.2.1 (still 57 criteria; 2.2.2 reworded the round count without changing a requirement).
- The Ruling J cell for the round cap and final pass (AC-F5.8) no longer says the PRD reads `rounds=2` as two passes. PRD 2.2.2 says "makes at most N fix rounds and then one final pass", which matches this TRD. The criterion text keeps its 2.1.0 wording; changes go in the Ruling J column.

REJECTED THESE FINDINGS — and the file that refutes each
- none

CAVEAT — what this run did NOT check: 13 claims are left unchecked (listed in the TRD's ## Could Not Verify): the wording of ruling J; a forked /code-review reporting back what it fixed; gh behaviour after a squash or rebase merge; Monitor re-arming over gh pr checks; gh run rerun --failed; gh pr edit --base; --reconcile --chained --shipping; the CodeRabbit and Codex review triggers; a headless claude -p review posting comments; /sync-design --chained with no build running; GitHub Actions resuming /ship-build; the "done" state of the Jira and Linear trackers; whether a workflow script can call a Skill. All 5 of 5 verifiers reported. One row was removed from that section: "promoteToTrd does not add a discovery twice across repeat passes" (on a scratch ledger, promoting the same rows twice added 2 tasks, then 0).

NO ACTION
- The provenance of J-1 to J-7 is circular: the TRD says PRD F18/F19 are now the J rows' source, while the PRD says ruling J is recorded in TRD 2.0.0 and not in the brief. The brief's §10 owner-rulings table (docs/plan/ship-build.brief.md) ends at the 2026-11-03 AC-F5.1 row, and the only commit naming ruling J is 132c9f7, the PRD edit itself. The owner's 2026-11-07 restatement of J-3, J-5 and J-6 could not be opened. J-1, J-2, J-4 and J-7 rest on relayed wording. A flagged gap, not an invented requirement.
- The §3.3 `Contract` type lists `primitive, params, results, outward, needs, section, rest, path` and omits `provides` and `repeat-until`, which D5 and D41 require the sequencer to read. The decisions are consistent and buildable; the type sketch is the stale part.
- D36's present-tense "Drafted in" names a path that does not exist yet; it is the output of SHIP-D001, so absence is expected until that task runs.
- The two signature blocks are labelled typescript while the files they describe are CommonJS JavaScript per stack.md; notation only.

TRD is now 2.3.0 (docs/TRD/ship-build.md), uncommitted.
