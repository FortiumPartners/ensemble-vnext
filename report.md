# Cutover proof on a fixture project

Feature F-6 of workplan `run-records-off-branch`. Report-only. Run 2026-11-12 against
`origin/main` at `0c769c86` (the writer move #122, the ship-record fold #121 and the rebase
cutover #124 all merged), plugin `packages/full` from that commit.

**Verdict: all six checks pass.** Run records now live on `refs/ensemble/records/<slug>`, not
on the feature branch; the ref reaches `origin`; a fresh clone resumes from it; and when
`origin` refuses the ref, records fall back to branch commits and the command still completes.
Two small findings, neither in the cutover itself, are listed under Follow-ups.

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | A small change through `/plan --implement` to a passing audit | pass | `/implement-trd` COMMAND COMPLETE (1 of 1 task, 6 of 6 criteria proven); `/audit-build` round 1 closed the feature |
| 2 | The feature branch has no commit that touches only `.trd-state/` | pass | 2 branch commits, neither touches `.trd-state/` |
| 3 | The ref exists locally and on `origin`; `record.json` names the branch and the `FORGE_FEATURE_ID` | pass | same sha `0317ca6` both places; `record.json` below |
| 4 | The ref carries `implement.json`, `closed.json`, `verification-report.md` and each referenced image | pass (images proven by a direct writer call; the run's report referenced none) | tree listing below; image probe below |
| 5 | Delete the worktree folder, clone afresh, the resume path finds the records | pass | headless `/implement-trd --resume` in a fresh clone restored 17 files and stopped with "add-subtract was closed" |
| 6 | `origin` refuses the ref push: records fall back to the branch, the run does not fail | pass | two writer lines `outcome: fallback, fallbackReason: push-failed`; `/implement-trd` COMMAND COMPLETE |

## Setup

Fixture under `.trd-state/task-cutover-proof-on-a-fixture-project/evidence/live/work/`
(environment `fixtures`, `verification.md` §1; 2 slots and 2 extra clones, inside the pool of 4):

- `origin.git`: a bare local repository, default branch `main`.
- `slot-1`: `scaffold-project.sh --plugin-dir <abs>/packages/full --force .` (exit 1, the known
  macOS `cp`/`chmod` packaging noise; `.claude/` complete: 26 commands, `.gitignore` carries the
  `.trd-state/*` ignore lines, `settings.json` carries `"records": "ref"`). Filled
  `constitution.md`, `stack.md` (Node, `node --test`) and a one-environment `verification.md`
  (local only, coverage floor none). App: `src/calc.js` exporting `add`, one `node:test` test.
  Committed on `main`, pushed, then branch `feature/60-add-subtract` created and pushed.
- Headless sessions: `claude --print --verbose --plugin-dir <abs>/packages/full
  --setting-sources project --permission-mode bypassPermissions --output-format stream-json`,
  with `FORGE_FEATURE_ID=f6-cutover-proof-0001` and this session's own Forge/Claude session
  variables unset (launcher: `run-fixture.sh` in the session scratchpad). Transcripts:
  `evidence/live/work/{plan-implement,audit-build,resume-fresh-clone,plan-implement-refused}.jsonl`.

## Check 1: `/plan --implement` to a passing audit

```
/plan --implement Add a subtract(a, b) function to src/calc.js that returns a minus b,
exported beside add, with a node:test test in test/calc.test.js
```

Final lines of the run:

```
═══ COMMAND COMPLETE: /implement-trd ═══
add-subtract: 1 of 1 task built, all 6 checks proven, branch feature/60-add-subtract pushed
```

The functional verification loop ran (not `--no-verify`): 6 of 6 criteria met, 3 of 3
must-pass. Then, in the same slot:

```
/audit-build docs/TRD/add-subtract.md
...
═══ COMMAND COMPLETE: /audit-build ═══
add-subtract closed: subtract(a, b) built and tested (2 of 2 tests pass); one caveat, no PRD to check against
```

The caveat (no PRD, so the code was checked against the TRD only) is the normal verdict for a
`/plan`-route change; the audit wrote `closed.json`.

## Checks 2 to 4 (slot-1, after the audit)

Full output: `checks-2-4.txt`.

```
$ git log --format='%h %s' main..feature/60-add-subtract
0af7931 docs(audit): audit-build citation fixes for add-subtract
8462001 chore(phase 1): checkpoint (battery green; verify-app pass)
commit 0af7931 touches: docs/TRD/add-subtract.md                         -> outside .trd-state/: 1
commit 8462001 touches: docs/TRD/add-subtract.md src/calc.js test/calc.test.js -> outside .trd-state/: 3
$ git log --format='%h %s' main..feature/60-add-subtract -- .trd-state
(no output)

$ git for-each-ref --format='%(objectname) %(refname)' refs/ensemble
0317ca654c4cc745ef77fa5a6eda55fc53b20c39 refs/ensemble/records/add-subtract
$ git ls-remote ../origin.git 'refs/ensemble/*'
0317ca654c4cc745ef77fa5a6eda55fc53b20c39	refs/ensemble/records/add-subtract

$ git cat-file -p refs/ensemble/records/add-subtract:record.json
{
  "forge_feature_id": "f6-cutover-proof-0001",
  "branch": "feature/60-add-subtract",
  "slug": "add-subtract"
}

$ git log --format='%h %s' refs/ensemble/records/add-subtract
0317ca6 records(add-subtract): /audit-build - round 1: proceed with caveats (no PRD); closed
5be57e1 records(add-subtract): /implement-trd - run complete
145b9dd records(add-subtract): /implement-trd - phase 1 checkpoint

$ git ls-tree -r --name-only refs/ensemble/records/add-subtract
artifacts.json audit-build-report.md audit-index.json audit-rounds.jsonl closed.json
criterion-covers.json discovered.jsonl implement.json judge-claims-1.json judge-decide-1.json
judge-report-input-1.json judge-state-1.json preclassify-input.json record.json
setup-decide-1.json success-definition.md verification-report.md verification-state.json
```

`closed.json` on the ref: `"closedBy": "audit"`, `"auditedCommit": "8462001…"`. `implement.json`
on the ref: `FIX-001 success`, checkpoint commit `8462001…` (the code commit). `dispatch.jsonl`
stayed out of the ref, as designed.

**Images.** This run's `verification-report.md` references no image: a Node library change
produced text evidence only (`evidence/fs1.txt` … `fs6.txt`). So the image half of check 4 was
proven with a direct writer call in a separate clone (`check-4b-images.txt`), using a report
that references two images and a folder holding a third it does not:

```
$ FORGE_FEATURE_ID=f6-cutover-proof-0001 node .claude/lib/record-ref.js write \
    --state-dir .trd-state/image-probe --command /task --step "image probe"
{"ok":true,"outcome":"ref","push":"pushed","folded":[],"commit":"d71441f…","files":4,"missingImages":[],…}
$ git ls-tree -r --name-only refs/ensemble/records/image-probe
evidence/chart.png                    <- referenced as ![…](evidence/chart.png)
evidence/screens/calc-referenced.png  <- referenced as .trd-state/image-probe/evidence/screens/…
implement.json
record.json
verification-report.md
```

`evidence/screens/not-referenced.png` stayed off the ref; no branch commit was made.

## Check 5: fresh clone resumes from the ref

```
$ rm -rf slot-1/.trd-state/add-subtract
$ git clone -q origin.git clone-fresh && git -C clone-fresh checkout -q feature/60-add-subtract
$ git for-each-ref refs/ensemble        (nothing: a clone does not fetch refs/ensemble/*)
$ ls .trd-state
ls: .trd-state: No such file or directory
```

Headless `/implement-trd docs/TRD/add-subtract.md --resume` in `clone-fresh`. Its closed-feature
guard ran `node .claude/lib/record-ref.js ensure --state-dir .trd-state/add-subtract`, which
fetched the ref from `origin` and printed `{"ok":true,"outcome":"restored","files":17}`. The run
then ended:

```
═══ COMMAND STUCK: /implement-trd ═══
Reason: add-subtract was closed on 2026-11-12T16:20:28Z
Next:   delete .trd-state/add-subtract/closed.json to reopen
```

That is the correct outcome: without the ref, the clone has no `closed.json` and the guard
would not have fired. Working tree stayed clean; no commit.

Restore in the original worktree (`check-5b-slot1.txt`), the local ref only:

```
$ FORGE_FEATURE_ID=<a different id> node .claude/lib/record-ref.js ensure --state-dir .trd-state/add-subtract --local
{"ok":false,"outcome":"mismatch"}
$ env -u FORGE_FEATURE_ID node .claude/lib/record-ref.js ensure ... --local
{"ok":true,"outcome":"restored","files":17}
$ FORGE_FEATURE_ID=f6-cutover-proof-0001 node .claude/lib/record-ref.js ensure ... --local   (after rm again)
{"ok":true,"outcome":"restored","files":17}
(again) {"ok":true,"outcome":"present"}
implement-state load: FIX-001 success
```

A session carrying another feature's Forge id is refused (`mismatch`): the identity guard
working as designed, so one feature's records are never restored into another's session.

## Check 6: `origin` refuses the ref push

`origin.git/hooks/pre-receive` rejects any `refs/ensemble/*` update and accepts branches:

```
$ git push origin HEAD:refs/ensemble/records/probe
 ! [remote rejected] HEAD -> refs/ensemble/records/probe (pre-receive hook declined)
```

New clone `slot-2`, branch `feature/60-add-multiply` pushed, then headless
`/plan --implement --no-verify Add a multiply(a, b) function …`. Each records write printed
(`check-6-writer-lines.txt`):

```
{"ok":true,"outcome":"fallback","fallbackReason":"push-failed",
 "detail":"remote: fixture: refusing refs/ensemble/records/add-multiply …",
 "committed":true,"commit":"04998ce…","slug":"add-multiply",
 "ref":"refs/ensemble/records/add-multiply","refCommit":"8fbd837…","push":"failed"}
```

and the run ended `═══ COMMAND COMPLETE: /implement-trd ═══` (1 of 1 task, 2 of 2 tests). Branch
afterwards (`check-6.txt`):

```
b898564 records(add-multiply): /implement-trd - run complete     .trd-state/add-multiply/discovered.jsonl
04998ce records(add-multiply): /implement-trd - phase 1 checkpoint .trd-state/add-multiply/implement.json
6979804 chore(phase 1): checkpoint (battery green; verify-app pass)  docs/TRD, src/calc.js, test/calc.test.js
$ git ls-remote origin       (no refs/ensemble/records/add-multiply; branch at 04998ce)
$ git for-each-ref refs/ensemble   -> refs/ensemble/records/add-multiply 5c08301 (kept locally)
```

The fallback behaves as designed: the records are committed on the branch, the ref is kept
locally, and the command completes. The second fallback commit (`b898564`) is local only. The
writer does not push the branch, so it reaches `origin` on the branch's next push. The fixture
session flagged this in its ISSUES: a PR from this branch would carry the run records.

## Other observations (no action needed)

- The first commit on the ref is `/implement-trd`'s phase checkpoint. `/plan`'s own write is
  skipped when `/plan` hands off to `/implement-trd`, as `command-status.md` says.
- `/audit-build`'s citation-fix commit (`0af7931`) was not pushed to `origin`'s branch, while
  its records write was. Pushing the branch is not the audit's job.
- In both runs `implement.json` holds each task's commit at the phase checkpoint, not on the
  task (`FIX-001.commit` is null). The second fixture session reported this as a bookkeeping
  gap. It is how today's data model works, not a cutover effect.

## Follow-ups

1. **`implement-state.js` `save()` does not create the state folder.** In the refused-push run
   (`--no-verify`, so no earlier writer had made `.trd-state/add-multiply/`), `/implement-trd`'s
   first `save(` threw `ENOENT: … open '.trd-state/add-multiply/implement.json.tmp.…'`. The
   session recovered with `mkdir -p` and carried on. Evidence: `plan-implement-refused.jsonl`,
   tool result after the first `save(` call. Fix candidate: `save()` creates the parent folder,
   or the command's seed step says to. Likely older than the cutover, since a committed folder
   used to exist from earlier writes. Not checked against a pre-cutover plugin.
2. **No command-run proof that a report's screenshots ride the ref.** The fixture produced no
   images, so check 4's image half is proven only by a direct `record-ref.js write` with a
   hand-made report. A UI fixture whose verification captures screenshots would close it.
