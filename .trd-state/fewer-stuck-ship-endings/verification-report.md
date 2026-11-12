# Functional Verification Report: fewer-stuck-ship-endings

**Source PRD**: docs/TRD/fewer-stuck-ship-endings.md § Intended Change
**Success definition**: .trd-state/fewer-stuck-ship-endings/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 18 total — 18 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 18 of 18 proven — uncovered: none
**Must pass**: 9 of 9 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | The merge contract (`packages/core/contracts/ship-primitive-merge.md`) declares `params: method=merge rounds=2`, `results: merged, red`, `stops-on: red`, `loop-on: red`, `loop-via: collect-findings, fix-findings, push, wait-ci` and `loop-rounds: rounds`, and the contract loader accepts it | .trd-state/fewer-stuck-ship-endings/evidence/it1-merge-contract-copy.md | 1 |
| FS-3 | When a policy lists collect-findings, fix-findings, push and wait-ci as steps (a repeat body counts) before a top-level `merge` with rounds above 0, the parsed plan gives that merge step a `loop` of `{ on, rounds, body }`, with body step ids `<step id>.1`, `<step id>.2`, … and the rounds bound stored in the snapshot | .trd-state/fewer-stuck-ship-endings/evidence/it1-jest-tests.txt | 1 |
| FS-4 | Each synthesized loop body step carries the params of the nearest earlier listed step of the same primitive, so the owner's own fix-findings and wait-ci settings (`format=`, `bar=` included) are what the loop runs | .trd-state/fewer-stuck-ship-endings/evidence/it1-jest-tests.txt | 1 |
| FS-5 | A policy that does not list the fix steps before `merge` gets no loop: a red merge stops the run as before and no fix the owner did not list is run | .trd-state/fewer-stuck-ship-endings/evidence/it1-jest-tests.txt | 1 |
| FS-6 | No loop is synthesized when `rounds=0`, when the `merge` step sits inside a `repeat`, and a snapshot taken before this change (with no `loop`) stops exactly as today | .trd-state/fewer-stuck-ship-endings/evidence/it1-jest-tests.txt | 1 |
| FS-7 | Recording `red` on a merge step that has rounds left moves the cursor to the loop's first body step instead of stopping; the body runs in order, and the last body step's success hands `merge` out again | .trd-state/fewer-stuck-ship-endings/evidence/it1-jest-tests.txt | 1 |
| FS-8 | Inside the loop, a body step's `stops-on` result (wait-ci `failed`) starts the next round, and a body step's `repeat-until` result (collect-findings `clean`) ends the loop and hands `merge` out again | .trd-state/fewer-stuck-ship-endings/evidence/it1-jest-tests.txt | 1 |
| FS-9 | With `rounds=2` the run follows exactly: merge pass 1 `red` → body round 1 → merge pass 2 `red` → body round 2 (`final: true`) → merge pass 3 `red` → stuck; or, inside round 2, wait-ci `failed` → stuck. `rounds=N` therefore means N body rounds and at most N+1 merge attempts | .trd-state/fewer-stuck-ship-endings/evidence/it1-jest-tests.txt | 1 |
| FS-10 | When the loop's bound is spent, the stuck reason names the owning step and the step that ended it, in the form `step <owner id> (<primitive>) loop ended after <n> rounds: step <id> (<primitive>) recorded <result>` | .trd-state/fewer-stuck-ship-endings/evidence/it1-stuck-reason.txt | 1 |
| FS-11 | The `/ship-build` guide states that a loop with `rounds=N` makes N body rounds while a `repeat` with `rounds=N` makes N+1 body passes | .trd-state/fewer-stuck-ship-endings/evidence/it1-guide-merge-loop.txt | 1 |
| FS-12 | While rounds remain, `laterNeedsOf` counts the owning step and the next round; `status()` marks each loop step `loop: true` so the readout counts it only once it has run; `authorization()` includes loop bodies | .trd-state/fewer-stuck-ship-endings/evidence/it1-jest-tests.txt | 1 |
| FS-13 | Merge step 1 waits for the PR head's checks the way wait-ci does (find the checks, re-arm `Monitor` while pending, re-run failed jobs once, record flakes) when this attempt pushed a merge commit, or when the PR's `headRefOid` differs from the `commit` of the latest `pushed` result in context | .trd-state/fewer-stuck-ship-endings/evidence/it1-merge-contract-copy.md | 1 |
| FS-14 | A head the owner's repeat already judged keeps that verdict: merge does not wait on its checks again, so a run that merges today still merges | .trd-state/fewer-stuck-ship-endings/evidence/it1-jest-tests.txt | 1 |
| FS-16 | When the head's checks pass, or there are none, merge goes on to the custody gate; a merge reached after the loop still passes that gate and calls `gh pr merge` matched to the fixed head | .trd-state/fewer-stuck-ship-endings/evidence/it1-jest-tests.txt | 1 |
| FS-17 | End to end: a merge-up head that is red makes the run loop through collect-findings, fix-findings, push and wait-ci, and `gh pr merge` is called exactly once, matched to the fixed head, within the bound | .trd-state/fewer-stuck-ship-endings/evidence/it1-jest-tests.txt | 1 |
| FS-18 | End to end: when CI stays red, the bound is spent, the run ends `stuck`, and `gh pr merge` was never called | .trd-state/fewer-stuck-ship-endings/evidence/it1-jest-tests.txt | 1 |
| FS-2 | The contract loader refuses a contract whose `loop-on` result is not also in `stops-on`, whose `loop-via` names a primitive that is outward or itself declares `loop-via`, or whose `loop-rounds` is not a declared parameter with a whole-number value | .trd-state/fewer-stuck-ship-endings/evidence/it2-loader-cases.txt | 2 |
| FS-15 | When the waited-for checks fail, merge re-reads the PR state; a PR found `MERGED` (merged by hand during the wait) proceeds to step 2; otherwise merge returns `red` with `data: { failed, head }` before the custody gate, so `gh pr merge` is not called on a red head | .trd-state/fewer-stuck-ship-endings/evidence/fs15-merge-contract-step1-iter3.txt | 3 |

## Not Met

_None._

## Not Verifiable

_None._

