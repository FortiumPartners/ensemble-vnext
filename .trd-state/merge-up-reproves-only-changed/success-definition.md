# Functional Success Definition: merge-up-reproves-only-changed

**Source**: §Intended Change
**Source kind**: intended-change
**Derived**: 2026-11-11T12:43:09Z
**Criteria**: 11

Citations name the part of §Intended Change each row rests on: "Today" bullets 1–3, "After"
items 1–4, and the "Checkable outcome" paragraph. A "base-only" change is the source's own
term: no shipped (feature-side) path differs except the paths `compare()` excuses because the
base brought them in. No criterion here carries a `Parts` count; none of the source's
sentences enumerates one.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | On a base-only change, a must-pass criterion with no covers record is not affected: `affectedIds` keeps its proof (`reused`) instead of re-proving it | §Intended Change After item 1 ("a must-pass criterion with no covers record keeps its proof (`reused`)"; no-covers branch becomes `return shipped.length > 0`); Today bullet 1 (today it counts as affected "whenever anything changed") | Jest output of `packages/core/lib/custody.test.js` showing a passing case where shipped paths are empty, excused paths are non-empty, and a no-covers must-pass criterion is absent from the affected set | [read] | locator | | O1 |
| FS-2 | On a base-only change, a must-pass criterion with a covers record is affected exactly when one of its covered files is among the excused paths (files differing between the old and new merge base that the feature never touched before the anchor); one whose covered files are all outside them is reused | §Intended Change After item 1 ("A criterion with a covers record is judged against the excused paths ... as now"); Today bullet 1 ("re-proved only when one of its covered files is among them (already correct)") | Jest output of `custody.test.js` with a case holding two covered criteria, one covering an excused path (affected) and one not (not affected) | [read] | locator | | O2 |
| FS-3 | When a shipped (feature-side) path also differs, a must-pass criterion with no covers record is still affected (OQ-2 unchanged) | §Intended Change After item 1 ("When a shipped (feature-side) path also differs, OQ-2 is unchanged: a no-covers criterion is affected") | Jest output of `custody.test.js` with a case where shipped paths are non-empty and a no-covers must-pass criterion is in the affected set | [read] | locator | | |
| FS-4 | A must-pass objective that no criterion names (`cov.uncovered`) stays affected on every change, a base-only change included | §Intended Change After item 1 ("A must-pass objective that no criterion names (`cov.uncovered`) has no proof to reuse and stays affected on every change, base-only included") | Jest output of `custody.test.js` with a base-only case in which an uncovered must-pass objective is reported affected | [read] | locator | | |
| FS-5 | `reconcile`, given `--base` with the base taken in, reports `mergeBases: {old, new}` beside `excused`, where `new` is the base commit the head took in and `old` is `git merge-base <anchor> <new>` | §Intended Change After item 2; Today bullet 2 ("Nothing names the two merge bases") | `reconcile` JSON output (from a `custody.test.js` case or a direct CLI run on a fixture repo) containing a `mergeBases` object whose `old` and `new` equal the commits computed independently with `git merge-base` and `git rev-parse` | [read] | locator | | |
| FS-6 | `mergeBases` is present even when nothing shipped differs, i.e. when `compare()` returns early | §Intended Change After item 2 ("computed in `reconcile` itself (so it is present even when `compare()` returns early because nothing shipped differs)") | `reconcile` JSON output for a fixture where the base was taken in and no shipped path differs, still showing `mergeBases` with both commits | [read] | locator | | |
| FS-7 | `packages/core/lib/merge-up.js` decides from `gh pr view <pr> --json state,mergeable,mergeStateStatus`: state `MERGED` → `skip`; `mergeable` `UNKNOWN` → `poll`; `CONFLICTING` → `merge-in`; `MERGEABLE` with `mergeStateStatus` `BEHIND` → `merge-in`; any other → `skip` | §Intended Change After item 3; Today bullet 3 (a `MERGEABLE` but `BEHIND` PR is today sent straight to `gh pr merge`, which fails) | Jest output of `packages/core/lib/merge-up.test.js` with one passing case per row of the decision (five cases, including `MERGEABLE` + `BEHIND` → `merge-in` and `MERGEABLE` + a non-`BEHIND` status → `skip`) | [read] | locator | | O3 |
| FS-8 | The merge contract's step 1 (`ship-primitive-merge.md`) calls `merge-up.js` to decide whether to merge the base in, instead of reading `mergeable` itself | §Intended Change After item 3 ("The merge contract's step 1 calls it instead of reading `mergeable` itself"); Today bullet 3 (step 1 today merges the base in only on `CONFLICTING`) | The text of `ship-primitive-merge.md` step 1 naming `merge-up.js`, plus a passing `packages/core/contracts/ship-primitives.test.js` run | [read] | locator | | O3 |
| FS-9 | Played end to end on a fixture repository (bare origin, stubbed `gh`), a merge-up whose base changes touch none of the feature's covered files makes the custody gate re-prove no criterion (no `reverify`), re-anchor custody once (one `base-merge` move), and go on to `gh pr merge` in the same pass, with no second resume and one push | §Intended Change After item 4 (seam test on a fixture repo with a bare origin and stubbed `gh`, "proving O1–O3"); Checkable outcome ("before this change the O1 seam case fails (the gate returns `reverify` for a no-covers must-pass criterion)") | Jest output of `packages/core/lib/ship-build.seam.test.js` with the O1 case passing, its assertions covering: no `reverify`, exactly one `base-merge` custody move, a `gh pr merge` call recorded by the stub, one push to the bare origin | [read] | locator | | O1 |
| FS-10 | In the same seam setting, a merge-up whose base changes touch a covered file makes the gate re-prove exactly the must-pass criteria covering that file and reuse the rest | §Intended Change After item 4 ("proving O1–O3"); After item 1 (covered criteria judged against the excused paths) | Jest output of `ship-build.seam.test.js` with the O2 case passing, asserting the `reverify` set equals the criteria covering the touched file | [read] | locator | | O2 |
| FS-11 | In the same seam setting, the merge step merges the base in only when the stubbed `gh` reports the PR `CONFLICTING`, or `MERGEABLE` with `mergeStateStatus` `BEHIND`; for any other report it merges the PR as it is, without merging the base in | §Intended Change After item 4 ("proving O1–O3"); After item 3 (the decision); Today bullet 3 (the `BEHIND` PR that today fails at `gh pr merge` and stops the run) | Jest output of `ship-build.seam.test.js` with the O3 cases passing: a `BEHIND` case showing the base merged in before `gh pr merge` succeeds, and a plain `MERGEABLE` case showing `gh pr merge` called with no base merge | [read] | locator | | O3 |

## Considered and not written as separate rows

- **The Checkable outcome's command passing as a whole** (`npx jest` over the four named test
  files). Every row above is proven by a case in one of those four files, so the whole command
  passing is the union of FS-1 to FS-11 plus the pre-existing cases. It is not repeated as its
  own row; the exerciser should run the four files together and claim that one output for any
  row it fits.
- **"Before this change the O1 seam case fails."** This is a statement about the old code, not
  about the delivered behaviour. It is folded into FS-9's citation as the reason that case
  exists, rather than written as a criterion that would require checking out pre-change code.
  An exerciser that wants the stronger proof can revert only the no-covers branch of
  `affectedIds` to `return true` and show the O1 seam case then fails; that is optional.
- **`poll` handling after `UNKNOWN`.** The source names the decision (`poll`) but says nothing
  about how the merge contract polls or how often; no row is written for the polling behaviour
  itself.
