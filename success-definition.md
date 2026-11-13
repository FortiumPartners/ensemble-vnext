# Functional Success Definition: resume-re-proves-a-moved-pr-head

**Source**: docs/TRD/resume-re-proves-a-moved-pr-head.md §Reproduction
**Source kind**: reproduction
**Derived**: 2026-11-13T18:06:20Z
**Criteria**: 7

The scenario every row refers to is the reproduction's own (Steps 1–3): a feature branch
pushed at head **A**, custody anchored at A with `custody.js reconcile --set-only`, CI green on
A; a second clone merges `main` into the branch and pushes head **B**; the ship run's local
checkout is still on A when `/ship-build --resume` hands out the merge step again. "The merge
step" means the `merge` primitive as `/ship-build` runs it. Where a row needs a real pull
request, CI and `gh pr merge`, the authorized place is the `github-live-test` environment
(one PR at a time); the git and custody parts reproduce in a scratch repo with a bare origin,
as the reproduction itself was run.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | When the merge step runs in the reproduction scenario, it brings the local branch up to the moved head B before the custody gate, and the gate (`custody.js reconcile ... --head B`) then does not refuse — the step does not return `stop` with "local HEAD has shipped changes not on the PR head (or the PR head has changes not pulled here): src/c.js" | §Reproduction Steps 1–3; Actual (the refusal JSON and "Nothing in the run changes the local branch … Root cause [ran]"); Expected ¶1 "brings the local branch to the branch head … passes the custody gate" | Transcript of the reproduction replayed in a scratch repo with a bare origin (or on github-live-test): `git rev-parse HEAD` printing B after the merge step's catch-up, followed by the gate's `custody.js reconcile` JSON for `--head B` with an action other than `refused` | [read] | locator | | O1 |
| FS-2 | The merge step waits for CI on the moved head B even though B was pushed by another session rather than by the merge step's own merge-in, and does not reach `gh pr merge` before a CI result for B has been seen | §Reproduction Actual ¶2 "`ship-primitive-merge.md` step 1 waits for CI only on 'a head this step pushed by merge-in' … Fixing only the refusal would let the merge go ahead on B with no CI result seen for B"; Expected ¶1 "waits for CI on it"; Expected ¶2 (issue #98) "repeat the `push` and `wait-ci` steps … against the new head" | Ship-run transcript on github-live-test (or the ship-build seam test driving the sequencer) showing a CI wait (`gh pr checks <pr>` / the wait-ci result) naming head B, ordered before the `gh pr merge` call | [read] | locator | | O1, O2 |
| FS-3 | When CI fails on the moved head B, the merge step does not merge B: it returns `red` naming B as the head, so the run enters the existing red-head fix loop instead of merging or ending STUCK | §Reproduction Actual ¶2 "Fixing only the refusal would let the merge go ahead on B with no CI result seen for B" (waiting on B exists to keep a red B from merging); domain-derived: a CI wait whose failing result still let the merge proceed would prove nothing, so a failing result on B must block the merge | Ship-run transcript or seam-test output for a moved head whose CI is failing: the merge step's result `red` with `data.head` equal to B and the failing check names, and no `gh pr merge` call for B | [read] | locator | | O2 |
| FS-4 | When the moved head B has passed CI and the custody gate, the merge step merges it pinned to B: `gh pr merge <pr> --<method> --match-head-commit B` (the new head, not the earlier head A) | §Reproduction Expected ¶1 "merges it with `--match-head-commit <new head>`"; Expected ¶2 (issue #98) "It should then merge that head"; Actual ¶3 (the Storybook banners naming `--match-head-commit A`) | Ship-run transcript on github-live-test showing the `gh pr merge … --match-head-commit <B>` command, and the PR's merge record showing B as the merged head | [read] | locator | | O1 |
| FS-5 | On the moved head B the merge step collects review findings when B's change over the last judged head is more than a base merge, and does not require a findings round when the change is only a base merge | §Reproduction Expected ¶1 "collects findings on it when it is more than a base merge"; Expected ¶2 (issue #98) "(and `collect-findings` when the diff is not base-only)" | Two ship-run transcripts (or seam-test cases): one where B adds a non-base commit, showing a `collect-findings` result recorded against B; one where B is a base merge only, showing the step going on to the custody gate with no `collect-findings` round | [read] | locator | | |
| FS-6 | Each step that judges a head records which head it judged (`wait-ci` and `collect-findings` record the head they ruled on), and a head that `request-review` or `await-approval` merely observed is not treated as judged — so the merge step can tell that B is not the head the run last judged | §Reproduction Actual ¶2 "no step records WHICH head it judged: `wait-ci` and `collect-findings` record no head, while `request-review` and `await-approval` record the PR's head without judging it, so `context.head` cannot tell a judged head from an observed one"; Expected ¶1 "whenever the merge step finds the branch head is not the head the run last judged" | The run record (`shipped.json` step entries, or the sequencer's context in a seam test) showing a judged-head value on the `wait-ci` / `collect-findings` entries equal to A, and the merge step treating B as unjudged even after a `request-review` or `await-approval` entry recorded B | [read] | locator | | O2 |
| FS-7 | Bringing the local branch up to the moved head never discards shipped work: if the local branch holds shipped commits that are not on the PR head, the catch-up does not overwrite them, and the custody gate still refuses that genuine divergence rather than merging | domain-derived: the refusal reason quoted in §Reproduction Actual ("local HEAD has shipped changes not on the PR head") is custody's guard against merging something other than what was verified; a catch-up that reset the branch to B would silence the guard by deleting the very changes it protects, so the fix must cure only the case where B is ahead of local | Scratch-repo transcript: a local commit touching a shipped file that was never pushed, plus a moved PR head B; the merge step's output showing that local commit still present (`git log` naming it) and a gate result of `refused` (or a `stop`) with no `gh pr merge` | domain-derived | locator | | O2 |

## Coverage notes

- **O1** (catch up with the moved head and merge it, never STUCK for a hand merge) is covered
  by FS-1, FS-2 and FS-4. The "never ends STUCK" half is not a separate row: it is the
  conjunction of FS-1 (the gate no longer refuses on every resume) and FS-4 (the moved head is
  merged).
- **O2** (merge pinned only to a head whose CI passed in this run, or whose failures the
  owner's findings bar accepted, and whose custody check passes; a failing moved head goes to
  the red-head loop) is covered by FS-2, FS-3, FS-6 and FS-7. **Its "findings bar accepted"
  branch has no supporting row**: the reproduction never mentions the owner's findings bar, so
  no criterion was written for it. That part of O2 is left uncovered rather than invented.
- FS-5 is an ordinary criterion: the reproduction asks for it, but neither must-pass objective
  names findings collection.
- Considered and dropped: "a head that has not moved is not waited on again." The reproduction
  says nothing about the unmoved case, so no row was written for it.
