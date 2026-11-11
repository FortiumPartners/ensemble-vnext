# Ensemble ship-churn fixes (request from Forge's PM, approved by the owner 2026-11-10)

Owner's answer: plan and build all three changes below as one plan.

Already on main (PR #99, issue 97): `.gitattributes` merge=union for `.claude/verification-notes.md`, written by `scaffold-project.sh`'s `ensure_gitattributes()`; `/ship-build`'s merge step carries on when a clash touches only record files (`packages/core/lib/record-files.js`). Build on it; do not redo it.

## Request, verbatim

From the Forge PM, on the owner's behalf. A read-only profile of Storybook's ship work (2026-11-10 03:00Z to 2026-11-11 03:15Z; 17 PRs merged) found that the build process Storybook inherited from Ensemble causes most of its shipping churn. The owner wants the baseline fixed so a project built this way cannot get into this state. Numbers: build-finished to merged 74.6 feature-hours against about 8.5 h of real work; 61 /ship-build sessions, 31 conflict-resolution sessions and 43 merge-ups of develop for 17 PRs; about 820M ship-stage tokens, about 60% on repeated sessions. Only one merge-up caught a real conflict. Three changes are Ensemble's:

1. No shared mutable files on feature branches. Storybook commits .trd-state/current.json, .claude/verification-notes.md and OWNER-CALLS.md, and every feature writes them, so any two features shipping in parallel conflict on framework files alone. Make every framework write per-feature (.trd-state/<feature>/...), keep a single-pointer file like current.json out of git, and for any log that must stay shared, have /init-project and /rebase-project write a .gitattributes merge=union line. Done when: two features built in parallel on a fixture repo merge into the base in either order with no conflict on any framework file.

2. Re-prove only what a merge-up changed. Today a merge of the base into a PR branch leads to a full re-run of the checks, a full re-proof of the success criteria and a custody re-anchor, then the merge step refuses because the head moved, then another resume. The evidence checker already reuses an artifact while its covered files are byte-identical. Use that: after a merge-up, re-prove only the criteria whose covered files differ between the old and new merge base, re-anchor custody, and go on to merge without another full loop. Also merge-up only when GitHub reports the PR CONFLICTING, or branch protection requires an up-to-date branch (Storybook's develop has no protection, yet every PR was brought up to date after every merge). Done when: on the same fixture, a merge-up that touches none of a feature's covered files costs no Exercise or Judge agents and at most one CI run.

3. A CI and flake baseline from /ship-setup (or /init-project). Check that the project's CI has one always-reporting summary check, skips its heavy jobs on docs-only and record-only pushes, and does not run the full suite on custody or ship-record commits. Make wait-ci's flaky list do something: file each flaky job as a follow-up the first time, and stop treating a job that has flaked 3 times as passing on rerun. Done when: /ship-setup reports a CI that lacks these, and a flaky job yields a filed follow-up.

The Forge side (its conflict brief asking for a full re-proof, and health findings that show this churn) is going to a Forge issue. Storybook's own flaky test and CI path filter went to Storybook as islayjames/storybook#89 and #90. Reports: /private/tmp/claude-505/-Users-james-dev-forge-vnext/3eda76eb-5124-415e-9da2-6714f1768992/scratchpad/shipprofile/forge.md and github.md.

