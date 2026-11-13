# TRD: resume-re-proves-a-moved-pr-head

**Source PRD**: None — defect, GitHub issue #98 (FortiumPartners/ensemble-vnext)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | When the PR head has moved since this run last judged a head (another session pushed to the branch, e.g. a base merge), the merge step catches up with the new head: it brings the local branch to it, waits for CI on it, and merges it pinned to it with `gh pr merge --match-head-commit <new head>`. The run never ends STUCK asking for a hand merge just because the head moved | issue #98 reproduction; owner order 2026-11-13 | yes |
| O2 | Custody's rule is kept: the merge is pinned only to a head whose CI passed in this run (or whose CI failures the owner's findings bar accepted) and whose custody check passes. A moved head whose CI fails is never merged, and goes to the existing red-head fix loop instead | issue #98 "Expected"; your instruction 2026-11-13 | yes |
| O3 | When the moved head carries commits that are more than a base merge, the run collects findings on it (through the merge step's existing fix loop, when the owner's `ship.md` gives it one) before merging | issue #98 "Expected" | |
| O4 | A run that is already stuck on a moved head (its saved step list predates this fix) recovers on `/ship-build --resume` with no restart | issue #98 "Effect": PRs #75 and #81 wait on a resume | |

## Reproduction

### Steps

Ran 2026-11-13 in a scratch repo with a bare origin (`custody.js` from this branch):

1. Feature branch `feature/f` pushed at head A; `custody.js reconcile --set-only` anchors custody at A
   (as the `push` step does). CI is green on A.
2. A second clone (another session) commits to `main`, merges `main` into `feature/f`, and pushes
   head B. The local checkout of the ship run is still on A.
3. `/ship-build --resume` re-hands the merge step. Its custody gate runs
   `custody.js reconcile --state-dir .trd-state/f --base origin/main --head B`.

### Actual

```
{"action":"refused","anchor":"","differing":["src/c.js"],
 "reason":"local HEAD has shipped changes not on the PR head (or the PR head has changes not pulled here): src/c.js"}
```

The gate returns `stop`. Nothing in the run changes the local branch, so every later `--resume`
refuses identically: the "it will refuse every time" of the Storybook report. **Root cause
[ran]:** nothing in the merge step brings the local branch up to a head another session pushed, and
`reconcile --head` refuses whenever local HEAD and the PR head differ in shipped files.

A second gap sits beside it **[read]**: `ship-primitive-merge.md` step 1 waits for CI only on "a
head this step pushed by merge-in", so a head another session pushed is never waited on. Fixing
only the refusal would let the merge go ahead on B with no CI result seen for B, breaking O2. And no
step records WHICH head it judged: `wait-ci` and `collect-findings` record no head, while
`request-review` and `await-approval` record the PR's head without judging it
(`ship-primitive-request-review.md`, `ship-primitive-await-approval.md`), so `context.head` cannot
tell a judged head from an observed one.

The Storybook banners (PRs #75, #81) name `--match-head-commit A`. The current contract already
pins to the PR's observed head (`custody.js check --link pr-head`), so that exact symptom belongs to
the contract version Storybook ran; the STUCK ending on every resume is what this repo still does.

### Expected

On resume (or whenever the merge step finds the branch head is not the head the run last judged),
the merge step brings the local branch to the branch head, waits for CI on it, collects findings on
it when it is more than a base merge, passes the custody gate, and merges it with
`--match-head-commit <new head>`.

## Decision

**The merge step catches up with a moved head itself; a library verb decides, the contract acts.
Two questions are kept apart: "is local behind the branch?" (catch up) and "has CI judged this
head?" (wait).**

- **Every step that judges a head records which one, under its own key `judgedHead`.** `wait-ci`
  (any result) and `collect-findings` (any result) add `judgedHead`, the PR `headRefOid` they read;
  the merge step's own `red` and `moved` results add it for the head their CI wait judged. The
  sequencer merges data latest-wins, so `context.judgedHead` is the head most recently judged.
  `context.head` keeps its meaning (latest head any step saw) and is not used for this.
  Rejected: reusing `context.head` — `request-review` and `await-approval` write the PR's head
  there without judging it, so a head another session pushed during an approval wait would read as
  judged and merge with no CI seen.
- **New verb `merge-up.js sync-head --pr N --branch B --base <base> --judged <sha|none> --trd <path|none>`.**
  Stateless: the lead passes `context.judgedHead` (`none` when absent); the verb never reads the
  run record. It reads the PR's `state` (a `MERGED` PR returns `moved: false` and touches nothing; a
  `CLOSED` one is `ok: false`), fetches `origin <branch>` and `origin <base>`, and takes the
  **fetched branch tip** as the head, not GitHub's `headRefOid`, which can trail a push by about 80s.
  Then:
  - local HEAD equals the tip: nothing to sync;
  - local HEAD is a strict ancestor of the tip: `git merge --ff-only` (sync `fast-forward`);
  - local has commits not on the tip and every path they change is a record file (`isRecordFile`:
    a fallback run-record commit): `git merge --no-ff --no-edit <tip>` locally, so local differs from
    the tip only in record files, which custody's local-versus-head check ignores (sync `merged`);
    a conflicting merge is aborted and is `ok: false`;
  - local has other commits not on the tip: `ok: false`, reason naming the commits and the remedy
    (two writers on one branch is a conflict, not a moved head).
  It returns `{ok, head, judged, moved, sync, baseOnly, changed}` where `moved` is `head !== judged`
  (true when `judged` is `none` or unresolvable: unknown means wait) and `baseOnly` is true when
  every changed path between the judged head and the tip (record files aside, test files included)
  came from the base by custody's base-excuse rule. Test files count as feature changes: a test-only
  commit from another session is more than a base merge.
- **`ship-primitive-merge.md`** gains a step 0 that runs `sync-head` (retrying an unreadable PR up
  to 8 times, 15s apart, like `decide`). Step 1's CI wait applies to **every PR head that is not
  `context.judgedHead`**, replacing "a head this step pushed by merge-in": this covers a moved head,
  a merge-in commit this step pushed, and one pushed by an earlier attempt that stopped. A head
  equal to `context.judgedHead` is not waited on, so a failure the owner's bar accepted stays
  accepted. A red wait returns `red` as today (now with `judgedHead`). A green wait on a moved head
  that is not base-only returns the new result **`moved`**, `data: { failed: [], flaky: [], head,
  judgedHead }`, when the step has a fix loop with a round left (`input.loop`, below); the loop then
  runs `collect-findings` on the new head (and `fix-findings`, `push`, `wait-ci` when it finds
  something), then hands the merge out again. Otherwise the step goes on to the custody gate, which
  re-proves any must-pass criterion the new commits affect, and merges pinned to the new head; a
  non-base move merged with no loop round to collect findings is one `data.issues` line.
- **`ship-sequencer.js`:** a contract's `loop-on` may list several words (`loop-on: red, moved`,
  each also in `stops-on`). The parsed contract keeps `loopOn` as the first word (existing readers
  and tests are unchanged) and adds `loopOnAll`, the list. The saved snapshot's `loop.on` stays the
  string it always was. `record` matches a result against the **live contract's** `loopOnAll`, so a
  run started before this fix still loops on `moved` (O4). `next` adds a reserved input
  `loop: {on: <live loopOnAll>, roundsLeft}` for a step that owns a loop, `null` otherwise.
  `moved` shares the `rounds` bound with `red`: a move-and-collect round leaves one fewer for red.
- **Rejected: a sequencer-level "rewind" that re-hands the earlier `push`/`wait-ci` steps.** A run's
  step list is a snapshot taken at `start`; Storybook's stuck runs would not carry a rewind added
  now, so they would stay stuck (O4 fails). Their contracts, by contrast, are re-read on every
  hand-out. It would also hand out a `push` that cannot push (local is behind the PR head).
- **Rejected: overloading `red` for a green non-base move.** `collect-findings` reads `red` as "CI
  failed"; a distinct word keeps the readout and the record truthful.
- **A run whose record predates `judgedHead`** (Storybook's) has none, so `sync-head` reads its head
  as unjudged and waits for CI once. That is the safe direction; its cost is in Could Not Verify.
- **Kind:** the reviewer noted that O3 (collecting findings on another writer's commits) extends
  behaviour beyond restoring the resume. It stays in this defect fix because issue #98's Expected
  section asks for it; it is not marked must-pass.

## Non-Goals

- No change to `custody.js` rules: the anchor, the base excuse, re-proof tiers and the pr-head and
  merge links stay as they are.
- No force-push, rebase or reset of the branch. A branch diverged in non-record files stops; it is
  not repaired.
- No change to what `wait-ci`, `collect-findings` or `fix-findings` do; the two judging steps only
  add one key to the data they record.
- Not the "merge re-dispatched after its branch is deleted stops at custody" known-open item
  (CLAUDE.md, 4.17.3–4.17.5): a separate fix.

## Verification Artifacts

None apply — the deliverable is a library verb, a sequencer rule and contract prose, checked by Jest
unit and seam tests; nothing renders data, follows a designed flow, or matches a design.

## Verification Environment

**Environment**: local (Jest), with github-live-test (islayjames/ship-build-live-test) allowed for an optional live proof
**Refresh**: nothing — tests read the working tree
**Cannot be checked there**: whether a model session obeys the contract prose; the seam test plays the lead

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `sync-head` to `merge-up.js` (library function and CLI verb) with unit tests | O1, O3, O4 | None | Against a real git repo with a bare origin and a stubbed `gh`: (a) branch tip equal to `--judged` and to local returns `moved: false`, local HEAD untouched; (b) another clone merges the base and pushes B: `moved: true`, `baseOnly: true`, `sync: "fast-forward"`, local HEAD now B; (c) the pushed commit edits a feature file, and separately one adds only a test file: `baseOnly: false`, the path in `changed`; (d) `--judged` equal to B but local still at A (a step recorded B without syncing): `moved: false` and local HEAD is fast-forwarded to B anyway; (e) a local commit touching only `.trd-state/` not on the tip: `sync: "merged"`, and `custody.js reconcile --head <tip>` no longer refuses; (f) a local commit touching `src/` not on the tip: `ok: false` naming the divergence, local HEAD unchanged; (g) a MERGED PR: `moved: false`, nothing fetched or moved; a CLOSED PR: `ok: false`; (h) `gh` failing: `ok: false`; (i) `--judged none`: `moved: true`. Each fails before this change (the verb does not exist) |
| FIX-002 | `ship-sequencer.js`: `loop-on` takes a list (`loopOnAll`), `record` matches the live contract's list, `next` adds the reserved `loop` input | O3, O4 | None | Unit tests: (a) a contract with `loop-on: red, moved` parses with no error, `loopOn` reads `red` and `loopOnAll` `["red","moved"]`; one naming a word missing from `stops-on` is refused; (b) recording `moved` on a looped step hands out the loop body's first step, and after the last round ends `stuck` naming the bound; (c) a saved state whose step carries the snapshot `loop.on: "red"` loops on `moved` when the live contract lists it; (d) `next` gives a looped step `input.loop = {on: ["red","moved"], roundsLeft: n}` with n dropping by one per attempt, and a step without a loop `input.loop = null`; (e) a contract declaring a parameter named `loop` is refused. Existing `ship-sequencer.test.js` and `ship-primitives.test.js` cases pass unchanged |
| FIX-003 | Contract and command prose: `ship-primitive-merge.md` (step 0 `sync-head`, CI wait on every head that is not `context.judgedHead`, `moved` result and its data, `judgedHead` on `red`, `loop-on: red, moved`); `ship-primitive-wait-ci.md` and `ship-primitive-collect-findings.md` record `judgedHead`; `ship-build.md` Step 4 names `loop` among the input keys and both loop words; `docs/guides/ship-build.md` describes the moved-head path. `ship-primitives.test.js` pins the new prose | O1, O2, O3 | FIX-001, FIX-002 | `ship-primitives.test.js` asserts: the merge contract runs `merge-up.js sync-head` before `decide` and passes `context.judgedHead`; waits for CI on a head that is not `context.judgedHead`; still matches `--match-head-commit <observed>` and never `<head>`; declares `moved` in `results`, `stops-on` and `loop-on`, with data `{ failed: [], flaky, head, judgedHead }`; no longer says CI is waited on only for a head this step pushed. `wait-ci` and `collect-findings` declare `judgedHead` in their result data. All contracts load through `loadPrimitives` with no errors |
| FIX-004 | Seam test in `ship-build.seam.test.js`: CI green on A, another session pushes B, resume, merge B | O1, O2, O3, O4 | FIX-001, FIX-002, FIX-003 | The `gh` stub refuses `pr merge` whose `--match-head-commit` differs from origin's head with "Head branch was modified" (as GitHub does). `playMerge` follows the new contract (sync-head with the recorded `judgedHead`, CI wait on an unjudged head, gate, pr-head, merge); existing merge cases still pass. New cases: (a) base-only move: the CI wait ran on B (the stub logs which head `pr checks` read), and the merge log reads exactly `7 --merge --match-head-commit B`; the same start with the old play (no sync-head) ends in the custody `refused`; (b) CI red on B: `red` with `judgedHead` B, no merge call; (c) non-base move with a loop: `moved`, the loop hands out `collect-findings` with `context.head` B, then the merge again, which does not wait on B again and merges B; (d) the bar rule: a red head whose loop `collect-findings` records `clean` with `judgedHead` equal to it is merged with no second CI wait; (e) `await-approval` recorded `head: B` without judging it: the merge still syncs and waits on B; (f) a saved state with the old snapshot `loop.on: "red"` and no `judgedHead` anywhere still reaches `merged` on B |
| FIX-005 | Mirror every edited `packages/core` file into `packages/full` and `.claude`; CHANGELOG `[Unreleased]` entry; CLAUDE.md known-open check | O1 | FIX-001, FIX-002, FIX-003, FIX-004 | `cmp` of each edited core file against its `packages/full` and `.claude` copy reports no difference; the full Jest battery shows no failing test file beyond the 7 that fail on this branch before the change (`status.test.js`, `design-bundle`, `design-render-walk`, `design-render`, and the `design-setup`, `ship-setup`, `verification-setup` skill tests); CHANGELOG `[Unreleased]` names #98 |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/merge-up.js`, `packages/core/lib/merge-up.test.js`
- **Reuse:** `merge-up.js`'s `run()` and `decide()` shapes, one JSON line per CLI call, exit 0 even on refusal [read]; `record-files.js` `isRecordFile` [read]; custody's base-excuse rule (`custody.js` `compare`: a path is from the base when the head's blob equals the merge base's and the feature never touched it), applied to all non-record paths rather than calling `compare`, which drops test files [read]
- **Replaces:** nothing; a new verb beside `decide` [read]
- **Follow:** every git and gh call through `spawnSync` with an argument array (CLAUDE.md "Command Injection Prevention"); validate `--pr` as an integer and `--branch`/`--base`/`--judged` as not starting with `-` [read]
- **Careful:** take the head from the fetched `origin/<branch>`, not `headRefOid` (`ship-custody-gate.md` step 1: the PR head trails a push by about 80s). Never move local HEAD except by `--ff-only` or a local `--no-ff` merge whose own side touched only record files; abort a conflicted merge (`git merge --abort`). Fast-forward whenever local is behind, whatever `--judged` says [read]

### FIX-002
- **Touches:** `packages/core/lib/ship-sequencer.js`, `packages/core/lib/ship-sequencer.test.js`
- **Reuse:** `validateLoop`, `attachLoop`, `record`'s `entry.step.loop && result === entry.step.loop.on` branch, `next`'s input assembly and `RESERVED_INPUT` [read]
- **Replaces:** the snapshot-only single-word match in `record` [read]
- **Follow:** the module is primitive-blind: no primitive or result word is named in code (header comment) [read]
- **Careful:** keep `loopOn` a string and the snapshot's `loop.on` a string; `ship-sequencer.test.js:913` and `ship-primitives.test.js:300` read them. `laterNeedsOf` and `final` read `loop.rounds`; leave them. `input.loop.on` comes from the live contract, never the snapshot [read]

### FIX-003
- **Touches:** `packages/core/contracts/ship-primitive-merge.md`, `packages/core/contracts/ship-primitive-wait-ci.md`, `packages/core/contracts/ship-primitive-collect-findings.md`, `packages/core/contracts/ship-primitives.test.js`, `packages/core/commands/ship-build.md`, `docs/guides/ship-build.md`
- **Reuse:** the merge contract's "One rule for every stop" and its `red` path and data shape `{failed, flaky, head}` [read]
- **Replaces:** merge step 1's "the latest pushed commit, meaning one this step pushed by merge-in just now or on an earlier attempt that stopped" [read]
- **Follow:** contract style: numbered `## Do` steps, each lib call in a fenced bash block, every stop names its reason [read]
- **Careful:** keep "a head `wait-ci` or `collect-findings` already recorded against, or whose findings the owner's bar accepted, is judged: do not wait on it", now made literal by `judgedHead`. `sync-head`'s `ok: false` joins "One rule for every stop" [read]

### FIX-004
- **Touches:** `packages/core/lib/ship-build.seam.test.js`
- **Reuse:** `setup`, `twoCriteria`, `landOnBase`, `playMerge`, `playGate`, `runToMerge`, `toMerge`, the `gh` stub in the "merge step" describe [read]
- **Replaces:** nothing [read]
- **Follow:** the seam test plays the lead step by step; real sequencer, custody and git, stubbed `gh` [read]
- **Careful:** existing fixtures record placeholder heads (`head: 'h'`, no `judgedHead`), so under the new play every existing merge case reads its head as unjudged and waits once; the stub's checks pass, so they still merge. Making the stub refuse a mismatched `--match-head-commit` must not break them; they already pass the observed head. Criteria the test itself performs (a merge call not made) prove the play, not the model; the `sync-head`, `judgedHead` and sequencer parts are the real proof [read]

### FIX-005
- **Touches:** `packages/full/lib/merge-up.js`, `.claude/lib/merge-up.js`, `packages/full/lib/ship-sequencer.js`, `.claude/lib/ship-sequencer.js`, `packages/full/contracts/ship-primitive-merge.md`, `.claude/contracts/ship-primitive-merge.md`, `packages/full/contracts/ship-primitive-wait-ci.md`, `.claude/contracts/ship-primitive-wait-ci.md`, `packages/full/contracts/ship-primitive-collect-findings.md`, `.claude/contracts/ship-primitive-collect-findings.md`, `.claude/commands/ship-build.md`, `CHANGELOG.md`
- **Reuse:** core, full and `.claude` copies are byte-identical today (`cmp`) [ran]; `packages/full` carries no copy of the command [ran]
- **Replaces:** nothing [read]
- **Follow:** copy core over the mirrors; never hand-edit a mirror [read]
- **Careful:** CLAUDE.md has no known-open line for #98 [read]; leave its list alone unless the fix changes one

## Could Not Verify

- The Storybook incident itself (islayjames/storybook PRs #75 and #81) was not replayed; the
  reproduction above is the same sequence in a scratch repo.
- Whether a model session follows the new contract prose is not proven by the seam test, which
  plays the lead. An optional live proof in islayjames/ship-build-live-test is allowed; its one PR
  slot is held by PR #3.
- A run whose record predates `judgedHead` waits for CI once on its current head at the merge. If
  that head's CI failures had been accepted below the owner's findings bar before this fix, the wait
  reads them as `red` and sends them through the fix loop once more. Only runs in flight across the
  upgrade can meet this.
