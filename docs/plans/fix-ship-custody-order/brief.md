# Brief: /ship-build custody fixes from real Storybook runs (issues 85, 86, 87, 88)

GitHub issues FortiumPartners/ensemble-vnext #85, #86, #87, #88. One change, not a list: they all touch the order of push, re-verify, re-anchor, custody check and merge. Worked under a different spawn user than the product default (owner request, 2026-11-08).

## Steps
1. A feature branch merges the base branch (the base brought in other PRs' files), then runs /ship-build with a merge step.
2. Re-verification after the base merge runs; the custody re-anchor commit is pushed.
3. The merge step runs.

## Expected
- A base merge whose extra files came from the base passes custody; a file the feature itself changed (or a conflict resolution rewrote) still fails it.
- Framework-written files (at least .claude/verification-notes.md) never count as shipped code.
- The push to a feature branch is not gated by custody; custody gates the merge. Order: push, re-verify (including preview criteria that need a pushed preview), re-anchor, custody check, merge.
- After the PR has merged, the run record (shipped.json) has a home that needs no commit.
- Re-verification after a base merge carries the feature's PM rulings and verification-plan decisions into the re-check session, and reuses evidence whose source files are unchanged between the old anchor and the merge head (git diff --quiet old..new -- paths).
- The re-anchor commit never leaves the merge head mismatched, so the merge is not refused with "Head branch was modified".

## Actual
- custody.js compare() diffs raw commits, so every base-supplied file is reported as differing (72 files in the Storybook case, PR 12).
- classifyPath() ignores only .trd-state/ and the TRD, so .claude/verification-notes.md is counted as shipped code and every verification run fails custody by construction.
- The push contract reconciles custody and demands must-pass criteria be re-proven BEFORE pushing, but preview criteria can only be proven on a preview that exists after the push (deadlock, PR 16).
- shipped.json is written after the merge onto a branch that has already merged, so it has nowhere to go (PR 12).
- The re-check after a base merge does not receive the PM's standing rulings, and judges committed evidence the merge never touched as stale (PR 15: 4 of 22 criteria missed for these reasons).
- Already improved on main by PR 82 (4.17.2): the merge contract checks a pr-head link before gh pr merge and matches the PR's current headRefOid, which covers issue 85 part 1 and most of issue 88. Confirm with a test that the re-anchor commit cannot leave the merge head mismatched; fix any remaining gap.

## Where
- packages/core/lib/custody.js: classifyPath (about line 81), compare (about line 144), check and the pr-head link, reconcile (about line 268).
- packages/core/contracts/ship-primitive-push.md (steps 2 to 4), ship-primitive-merge.md (steps 1 to 3).
- packages/core/lib/ship-sequencer.js: STATE_FILE shipped.json (line 48) and record() (about line 656).
- the re-verify call in the push contract and packages/core/commands/verify-build.md (the --criteria subset run and what it is handed).
- Tests: packages/core/lib/custody.test.js, packages/core/contracts/ship-primitives.test.js, packages/core/lib/ship-sequencer.test.js.
- .claude/ vendored copies of every changed lib and contract must stay identical to their packages/core sources.

## How to check
npx jest packages/core/lib/custody.test.js packages/core/contracts/ship-primitives.test.js packages/core/lib/ship-sequencer.test.js, with new tests that fail before the change and pass after:
1. A base merge whose files came from the base passes custody; a file the feature changed still fails; a conflict-resolved file still fails.
2. .claude/verification-notes.md does not count as shipped code.
3. The push contract no longer requires custody reconcile before the push; the merge contract runs the custody check before gh pr merge and a failure leaves the PR unmerged.
4. A preview criterion can be proven after the push and the run then re-anchors.
5. The post-merge record is written outside the tracked tree and survives the branch being deleted.
6. Re-verify is handed the PM rulings, and evidence whose source files are unchanged between the old anchor and the merge head is reused.
7. The re-anchor never leaves the merge head mismatched.

## Open questions
None. Decisions taken by Forge as routine engineering calls, owner may overrule:
- Excuse a path when its content at the head equals its content at the base tip (files the feature or a conflict resolution changed still count). Reason: the base's own PR verified that content; interplay with the feature stays a verification concern.
- Before the merge the record stays committed on the branch as now; after the merge it goes to a local untracked file under the git dir (survives branch deletion, needs no commit). Limit: a fresh GitHub Actions runner cannot see it, which matters only for resuming after the merge.
- The optional format= parameter on fix-findings in /ship-setup is out of scope; record it as a follow-up.

Scope: this change only. Do not change how verification criteria are judged or how a feature with no ship.md is shipped.

---

# Feature 2: owner-governed rule files are read from the base branch (issue 90)

GitHub issue #90. Verification and ship steps read .claude/rules/verification.md from the feature branch, so a branch cut before the owner changed the rule keeps a stale copy (Storybook, 2026-11-08: per-worktree ports changed on develop, in-flight branches kept "localhost:3000 only, count 1", a later feature hit a port collision reported as setup-failure).
Expected: owner-governed rule files (verification.md and any other file the framework documents as owner-governed) are read from the base branch (origin/<base>) by verification and ship steps; or the step compares the branch copy with the base copy and says loudly when they differ.
Where: packages/core/lib/functional-verification.js (reads of verification.md), packages/core/commands/verify-build.md and implement-trd.md (how they load it), packages/core/commands/ship-build.md.
How to check: a test with a fixture repo whose branch copy of verification.md differs from origin/base: the loop reads the base copy (or reports the difference by name); a branch copy equal to the base copy behaves as today.
Decision taken by Forge (owner may overrule): read the base copy, and report loudly when the branch copy differs, rather than failing the run.

# Feature 3: design-render.js fails under /private/tmp and drops state names with a question mark (issue 91)

GitHub issue #91. design-render.js fails with a permission error (EPERM) when its temp folder is under /private/tmp: fs.cpSync copies setgid design-system folders and preserves modes the spawn user cannot set. Separately a board state whose name contains "?" never renders (an unescaped path or URL component; the request handler splits req.url on "?").
Expected: the copy does not preserve setgid or ownership (or falls back on EPERM); state names are slugged or escaped so every state renders.
Where: packages/core/lib/design-render.js (mkdtemp and cpSync, about lines 327 to 334; the static server handler about line 255).
How to check: tests in design-render.test.js: copying a fixture folder with a setgid directory does not throw; a state named "Empty?" renders and is found by its slug.
