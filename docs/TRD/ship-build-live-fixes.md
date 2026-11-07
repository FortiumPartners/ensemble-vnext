# TRD: ship-build-live-fixes

**Source PRD**: None — defects found by the live `/ship-build` test against real GitHub
(`.trd-state/task-ship-build-live/findings.md`, 2026-11-07), fix list given by the owner in the
`/plan` invocation of 2026-11-07

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | `request-review tool=claude` can post its review in a default project, and a review "by the tool" has a defined, checkable identity when it posts under the owner's own login | findings defect 2; owner item (a) | yes |
| O2 | A `merge` after an `await-approval` park merges: the PR head moved by the parked record commit is re-read at merge time and proved to be the verified code before `--match-head-commit` uses it | findings defect 3; owner item (b) | yes |
| O3 | `await-approval` says, when the PR's author is the `gh` user this run acts as, that someone other than the author must approve | findings defect 4; owner item (c) | |
| O4 | `await-approval` claims a remote resume (`remoteResume: true`) only when the repository has the `ANTHROPIC_API_KEY` secret the resume workflow uses, and says so when it does not | findings defect 5; owner item (d) | |
| O5 | An edit made by the fix build's end-of-run review under `/implement-trd --reconcile --chained --shipping` is committed before the build returns, so the next `push` carries it to the merge and release | findings defect 6; owner item (e) | yes |
| O6 | When the policy contains a step that builds from the TRD (`fix-findings`), `/ship-build` refuses to start on a TRD `/implement-trd` cannot parse — before anything is pushed or a PR opened | findings defect 7; owner item (f) | |
| O7 | `/ship-setup` reports in ISSUES when `.claude/rules/autonomy.md` lacks the standing-authorization sentence, naming the listed steps that will therefore be refused; it edits no governance file | findings defect 1; owner item (g) | |
| O8 | A ship can wait for CI on what merged before it releases, without a new primitive | findings observation 1; owner item (h) | |

## Reproduction

### Steps

All from `.trd-state/task-ship-build-live/findings.md` (runs on `islayjames/ship-build-live-test`,
plugin at `origin/main` `d31c68e`, release 4.17.0):

1. Run 5b: `ship.md` with `request-review tool=claude`. The contract starts
   `claude -p "/code-review <pr-url> --comment"` with no permission flags.
2. Run 5c/5e: `await-approval trigger=github-actions` parks with `remoteResume: true`; Step 5
   pushes the record commit (`782f8c5` → `11d94f7`); the merge then runs
   `gh pr merge 3 --merge --match-head-commit 782f8c5…` from `context.head`.
3. Run 5d: `gh pr review 3 --approve` from the account that opened PR #3.
4. Run 5c: `gh secret list` on the repository is empty when `remoteResume: true` is recorded.
5. Run 4b: `fix-findings` chains `/implement-trd <trd> --reconcile --chained --shipping`; its
   §7.2 `/code-review high --fix` edits `test/run-tests.sh` and nothing commits it.
6. Run 4a: a hand-written checklist TRD; `fix-findings` throws `No "Master Task List" heading found`
   after PR #2 is open and CI has failed.
7. Run 3a: `/ship-setup` writes a merge-and-release string into a project whose `autonomy.md`
   lacks the sentence `ship-sequencer.js` requires, and ends COMPLETE without saying so.
8. Run 3b: the release was created at 20:12:54Z while CI run 42409952773 on the merge commit
   was still running.

### Actual

1. Every `gh` call by the headless reviewer is refused (`evidence/review-3-refused.log`); the step
   parks. When gh was allowed, the review posted as `islayjames`, and the run matched "the tool's
   login" by judgment (`"reviewer": "claude (posted as islayjames)"`).
2. `GraphQL: Head branch was modified. Review and try the merge again.`
   (`evidence/run-approval/gh-merge-stale-head.txt`) — the merge can never succeed. Root cause
   [read]: `ship-primitive-merge.md` step 1 pins `--match-head-commit` to `context.head`, the
   last `push` result; the Step 5 park push moves the PR head with no `push` step recorded.
3. `GraphQL: Review Can not approve your own pull request` — the park told the owner to do
   something GitHub forbids.
4. `remoteResume: true` recorded; the workflow (`anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}`)
   would fail on the first approval.
5. The edit is stranded on a merged branch (`evidence/run-ci-fail/uncommitted-review-edit.diff`).
   Root cause [read]: §7.2 runs `--fix`, which edits the working tree; under `--shipping` §9.0's
   push is skipped and no step commits the review's edits, and `fix-findings` returns `fixed`
   without looking at the tree.
6. The ship stops mid-way with an open PR, for a fault knowable before the first push. Root
   cause [ran]: `parseTrd` throws on a TRD without a `## Master Task List` heading.
7. `not authorized: open-pr` at the first outward step of the next `/ship-build`.
8. Nothing in any shipped string waits for CI on the merge commit.

### Expected

1. The headless review can call `gh`, posts, and is recognised as a review authored by the login
   `gh api user` returns, on the current head, submitted after this step requested it.
2. The merge reads the PR's `headRefOid` at merge time, proves its code equals the custody
   anchor (a `.trd-state/`-only difference is equal), and merges with that id.
3. The wait reason says the PR's author is this run's account and another person must approve.
4. `remoteResume: true` only with the secret present; otherwise `false` plus an ISSUES line.
5. The review's edits are a commit on the branch when the fix build returns.
6. `start` returns `ok: false` naming the TRD and the parser's message; nothing runs.
7. `/ship-setup`'s ISSUES names the missing sentence and the steps it blocks.
8. `wait-ci` placed after `merge` waits on the merge commit's checks; a failure stops the run
   before `release`.

## Decision

- **(a)** The `claude` reviewer is started with `--allowedTools` limited to the `gh` subcommands a
  posting review needs — `Bash(gh pr view:*)`, `Bash(gh pr diff:*)`, `Bash(gh pr comment:*)`,
  `Bash(gh pr review:*)`, `Bash(gh api:*)` (inline comments go through `gh api`) — not
  `Bash(gh:*)`, which would let a model reading untrusted PR text merge, release or set secrets.
  Its review is recognised by **author login == `gh api user --jq .login`, on the current head,
  submitted at or after the `requestedAt` this step records** — the run's own account, because
  that is whose credentials the headless `claude` uses; on a solo project an owner's own review
  posted in that window counts too, which the contract says. **A clean exit with nothing posted
  is NOT a review**: it returns `wait`, with the reviewer's output saved to
  `<stateDir>/review-<head>.log` and named in the reason — the live failure (every `gh` call
  refused, findings printed locally, exit 0) must never read as a clean review. A failing
  `gh api user` call means the login is unknown: `wait`, naming the failure.
- **(b)** A new custody link, `pr-head`, judges an **open** PR's `headRefOid` against the anchor.
  `merge` runs it only on the not-yet-merged branch of its step 1 (an already-merged PR still
  skips straight to the merge proof, so a resume after a failed proof is not blocked), and
  passes its `observed` id to `--match-head-commit`. It reads the PR's own head rather than
  reusing the `push` link's `git ls-remote`, because that is the id GitHub compares
  `--match-head-commit` against, and the two can disagree for about 80s after a push. Rejected:
  recording a synthetic `push` result after the park push — it would make Step 5 of the command
  a writer of step results, which the sequencer alone is.
- **(c)** and **(d)** live in the `await-approval` contract only: two read-only `gh` calls
  (`gh pr view --json author` against `gh api user`, and `gh secret list --json name`). The step
  still returns `wait` in both cases — another person can still approve, and a manual
  `--resume` still works. A failing `gh api user` skips the author message (unknown, not
  equal). `gh secret list` sees repository secrets only and needs admin access: a secret it does
  not list, or a refused call, gives `remoteResume: false` and an ISSUES line saying the secret
  could not be confirmed (an organization-level secret is not visible to this check) and that
  the run must be resumed by hand.
- **(e)** Fixed at the root, in every mode: §7.2's `--fix` edits were never committed by
  anything (§9.0 assumed they were). §7.2 now commits the files the review changed, by
  pathspec, when its result reaches the session; under `--shipping` the RETURN line also waits
  for that result. A second check in a different place, `fix-findings`, snapshots
  `git status --porcelain --untracked-files=all` plus `git hash-object` per listed path before
  the chained build and commits, by pathspec, any path the build changed and left uncommitted
  (including an already-dirty path it changed again) before it returns. Both are prose read by
  the model; neither is deterministic, which is why there are two.
- **(f)** Primitive-blind, like the rest of the sequencer: a contract may declare
  `requires: trd`; `start` then parses the run's TRD with `trd-parser.js` and refuses to start on
  a throw or zero tasks. `fix-findings` declares it. Sweep work (no TRD) is not checked —
  `fix-findings` already stops for sweep work by design.
- **(g)** A new sequencer verb, `authorization --policy <ship.md>`, reuses `isAuthorized` and
  reports whether the sentence is present and which listed outward primitives would be refused
  (an `unless` setting that holds counts as authorized). `/ship-setup` calls it after its
  re-parse and lists the refused steps in ISSUES. No governance file is edited.
- **(h)** No new primitive and no new parameter: `wait-ci` placed after a `merge` treats the
  PR's merge commit (`gh pr view --json mergeCommit`) as the current head and reads its runs with
  `gh run list --commit`. A run list that is empty right after a merge is polled for up to 120s
  before `no-checks` (GitHub registers runs a little after the push). Its existing
  `stops-on: failed` stops the run before `release`; its waiting loop polls the same run list,
  not `gh pr checks`, in that case. The default string gains `wait-ci` between `merge` and
  `release`. This item is an enhancement rather than a defect fix (it began as an observation);
  it is in scope because the owner asked for it.

absorbed:     none — every item above is on the owner's list; no other defect blocks them
not absorbed: close-issue/file-followups find no tracker without stack.md (findings observation 2) — separate fix, these work without it
not absorbed: PR-head sync lag before wait-ci reads `gh pr checks` (observation 3) — not observed to cause a wrong result
not absorbed: /ship-setup bundling two topics in one question (observation 4) — separate prose fix
not absorbed: the resume workflow firing on a branch with no pushed `shipped.json` starts a fresh run in Actions — pre-existing, these fixes work without it

## Non-Goals

- No edit to `.claude/rules/autonomy.md`, `constitution.md`, `stack.md`, `verification.md` or
  this repository's own `.claude/rules/ship.md` — governance edits wait for the owner.
- No new primitive. No change to the sequencer's order, repeat or gate semantics.
- No live re-run against GitHub (`verification.md` lists no GitHub environment); proof is unit
  tests and contract-text tests.

## Verification Artifacts

None apply — the deliverables are a Node library change and prose contracts; no screen, design,
data view or flow is in scope.

## Verification Environment

**Environment**: local
**Refresh**: nothing — tests and libraries read the working tree
**Cannot be checked there**: real GitHub behaviour (self-approval refusal, head-moved refusal, secret presence); covered by stubbed `gh` in tests

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should the default `/ship-setup` string include `wait-ci` after `merge`? | Yes — this repository's charter defines shipped as green CI on `main`, and without it the fix for (h) is invisible to a new project | |
| OQ-2 | Is the headless reviewer's `gh` grant (five subcommand patterns including the broad `gh api`) acceptable? It touches credentials, which the charter leaves to the owner | You asked for gh to be allowed; I narrowed it from `Bash(gh:*)` to the subcommands a posting review uses | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | `request-review` contract: start the `claude` reviewer with `--allowedTools` naming the five `gh` subcommand patterns in the Decision; define the tool's review for `claude` as authored by `gh api user`'s login, on the current head, submitted at or after a recorded `requestedAt`; a clean exit with nothing posted returns `wait` with the output saved to `<stateDir>/review-<head>.log` | O1 | None | A contract-text test fails on the 4.17.0 contract and passes after: the `claude` line carries `--allowedTools` with `Bash(gh pr comment:*)` and not `Bash(gh:*)`; the contract names `gh api user`, `requestedAt` and `review-<head>.log`, and says an exit with nothing posted returns `wait` |
| FIX-002 | `custody.js` gains a `pr-head` link that reads an OPEN PR's `headRefOid` and judges it against the anchor; `merge` contract runs it on the not-yet-merged branch before merging and uses its `observed` id for `--match-head-commit`, never `context.head` | O2 | None | Jest (stub `gh`): `pr-head` passes for an open PR whose head differs from the anchor only under `.trd-state/`, fails for a shipped-file difference and for a merged/closed PR; contract test asserts `--link pr-head` precedes `gh pr merge`, the already-MERGED branch still skips to the merge proof, and `context.head` is not the match id |
| FIX-003 | `await-approval` contract: compare `gh pr view --json author` with `gh api user --jq .login` and, when equal, say in the wait reason and `data.issues` that someone other than the author must approve; with `trigger=github-actions`, set `remoteResume: true` only when `gh secret list --json name` includes `ANTHROPIC_API_KEY`, else `false` and an ISSUES line naming the missing secret | O3, O4 | None | Contract-text test fails on 4.17.0 and passes after: names `author`, `gh api user`, `gh secret list` and `ANTHROPIC_API_KEY`, and ties `remoteResume: true` to both the workflow file and the secret |
| FIX-004 | `implement-trd.md` §7.2 (every mode): commit the files the review changed, by pathspec, when its result arrives; §3.7: under `--shipping`, the RETURN line waits for that result; `fix-findings` contract: snapshot `git status --porcelain --untracked-files=all` and `git hash-object` per path before the chained build and commit, by pathspec, any path the build changed and left uncommitted, before returning | O5 | None | Text tests fail on 4.17.0 and pass after: §7.2 requires a pathspec commit of the review's edits; the `--shipping` text requires the review result before RETURN; fix-findings names `git hash-object`, the before/after comparison and a pathspec commit |
| FIX-005 | `ship-sequencer.js`: contract front matter key `requires` (list); `start` parses `work.trd` with `trd-parser.js` when any snapshotted step's contract declares `requires: trd`, returning `ok: false` with the TRD path and the parser's message on a throw or zero tasks, and writing no state; `fix-findings` declares `requires: trd` (meaning: when the work has a TRD, it must parse); `ship-build.md` Step 3 names this refusal; `ship-build.seam.test.js`'s TRD fixture gains a Master Task List | O6 | None | Jest: `start` with a fixture contract declaring `requires: trd` and a checklist TRD returns `ok: false` naming `Master Task List` and writes no `shipped.json`; a parseable TRD starts; a policy with no such step does not read the TRD; sweep work (no TRD) starts; the seam test passes |
| FIX-006 | `ship-sequencer.js`: CLI/API verb `authorization --policy <file> [--autonomy] [--settings]` returning `{ sentence: present\|absent, refused: [primitives] }` via `isAuthorized`; `ship-setup` SKILL runs it after the re-parse and lists each refused step in ISSUES, naming the sentence and that the owner adds it; never edits `autonomy.md` | O7 | FIX-005 | Jest: without the sentence, a policy with an outward step and an `unless` step whose setting holds reports only the outward one; with the sentence, `refused` is empty; skill text test names `authorization` and ISSUES and keeps autonomy.md out of the files it writes |
| FIX-007 | `wait-ci` contract: after a `merge` (`context.merged`), the current head is the PR's merge commit, read with `gh run list --commit` in both Do and Waiting, polling up to 120s before `no-checks`; default string in the ship.md template (both copies) and the ship-setup skill's topic-1 description gain `wait-ci` between `merge` and `release`; `ship-template.test.js` updated | O8 | None | Template test asserts the default `## Ship` order push, open-pr, repeat, merge, wait-ci, release and that it parses; contract test asserts `mergeCommit`, the 120s poll, and that the Waiting section names the merge-commit run list |
| FIX-008 | Mirror every edited `packages/core` and `packages/skills` file into `.claude/`; add an Unreleased CHANGELOG entry; keep `CLAUDE.md` at or under 16,000 bytes | O1, O2, O3, O4, O5, O6, O7, O8 | FIX-001, FIX-002, FIX-003, FIX-004, FIX-005, FIX-006, FIX-007 | `ship-build-surface.test.js` mirror test and a `cmp` of each edited pair pass; `wc -c CLAUDE.md` ≤ 16000; full Jest battery green |
| FIX-009 | Amendment (found by verification: the tool=claude review match lived only in prose). `packages/core/lib/ship-review.js` exports `matchToolReview({reviews, login, head, requestedAt})` and a `match` CLI; the request-review contract calls it instead of judging the match | O1 | FIX-001 | Jest (`ship-review.test.js`): one matching review is recognised; a review failing each condition (another login, an older commit, submitted before the request) is rejected and named; the contract names `ship-review.js match` |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/contracts/ship-primitive-request-review.md`, `packages/core/contracts/ship-primitives.test.js`
- **Reuse:** the existing "current head" paragraph and the background-`Bash` wait for `claude` [read]
- **Replaces:** `claude -p "/code-review <pr-url> --comment"` with no permission flags [read]
- **Follow:** contract sections `## Input / ## Do / ## Result / ## Waiting`; test style of the `the waiting primitives` describe block in `ship-primitives.test.js` [read]
- **Careful:** keep `tool=claude` waiting on the background `Bash`, not `Monitor` (a Monitor kills the process at expiry) [read]

### FIX-002
- **Touches:** `packages/core/lib/custody.js`, `packages/core/lib/custody.test.js`, `packages/core/contracts/ship-primitive-merge.md`
- **Reuse:** `judgeLink`, the `merge` link's `gh pr view` parsing, and the stub-`gh` harness in `custody.test.js` (`check: merge link (stub gh)`) [read]
- **Replaces:** `--match-head-commit <head>` "where `<head>` is the full id in `context.head`" in the merge contract [read]
- **Follow:** custody's contract — `check` never writes, every failure is `ok: false` with a reason, `spawnSync` argument arrays only [read]
- **Careful:** update the CLI usage string and the JSDoc link union; `.trd-state/`-only differences must stay equal (that is what makes the park commit harmless) [read]

### FIX-003
- **Touches:** `packages/core/contracts/ship-primitive-await-approval.md`, `packages/core/contracts/ship-primitives.test.js`
- **Reuse:** step 3's workflow-file check (`git ls-tree origin/<default> …`) [read]
- **Replaces:** "Only if it does, put `remoteResume: true`" — now conditional on the secret too [read]
- **Follow:** read-only checks only (`ship-build.md` Step 4: never probe a service by acting on it) [read]
- **Careful:** the workflow template names the secret `ANTHROPIC_API_KEY` (`packages/core/templates/github/ensemble-ship-resume.yml`); keep the names in step [read]

### FIX-004
- **Touches:** `packages/core/commands/implement-trd.md`, `packages/core/contracts/ship-primitive-fix-findings.md`, `packages/core/contracts/ship-primitives.test.js`
- **Reuse:** §3.7's `--shipping` bullet list and §7.2's recording rows [read]; `/plan`'s Step 7a snapshot-and-compare pattern for changed files (`git status --porcelain --untracked-files=all` plus `git hash-object`) [read]
- **Replaces:** nothing — adds a commit where none happened [read]
- **Follow:** pathspec commits only, never `git add -A` [read]
- **Careful:** paths dirty before the build are not the build's and are not committed; `.trd-state/` is excluded (Step 5 of `ship-build.md` commits it) [inferred]

### FIX-005
- **Touches:** `packages/core/lib/ship-sequencer.js`, `packages/core/lib/ship-sequencer.test.js`, `packages/core/contracts/ship-primitive-fix-findings.md`, `packages/core/commands/ship-build.md`, `packages/core/lib/ship-build.seam.test.js`
- **Reuse:** `loadPrimitives`' `listOf`, `start`'s error shape `{ok:false, status:null, errors}`, `trd-parser.js`'s `parseTrd` (already a dependency via `maskFencedLines`) [read]
- **Replaces:** nothing [read]
- **Follow:** the module must stay primitive-blind — the test `the module source names no primitive` scans it [read]
- **Careful:** `parseTrd` throws on a missing `Master Task List` [ran]; resolve the TRD path relative to cwd; write no state on refusal [read]

### FIX-006
- **Touches:** `packages/core/lib/ship-sequencer.js`, `packages/core/lib/ship-sequencer.test.js`, `packages/skills/ship-setup/SKILL.md`, `packages/skills/ship-setup/__tests__/skill-md.test.js`
- **Reuse:** `isAuthorized`, `AUTHORIZATION_SENTENCE`, `parse`, the CLI `main` dispatch [read]
- **Replaces:** nothing [read]
- **Follow:** one JSON line per CLI call, exit 2 on usage error [read]
- **Careful:** the skill's `## Never` list forbids editing any file but ship.md and the workflow — keep it so [read]

### FIX-007
- **Touches:** `packages/core/contracts/ship-primitive-wait-ci.md`, `packages/core/templates/claude-directory/rules/ship.md`, `packages/skills/ship-setup/template.md`, `packages/core/contracts/ship-template.test.js`, `packages/skills/ship-setup/SKILL.md`
- **Reuse:** wait-ci's existing no-PR path (`gh run list --commit <sha>`) [read]
- **Replaces:** the default string's `4. merge` → `5. release` adjacency [read]
- **Follow:** the two template copies are identical today; keep them identical [ran]
- **Careful:** `ship-template.test.js` asserts the default order; `ship-primitives.test.js` parses every template example [read]

### FIX-008
- **Touches:** `.claude/lib/ship-sequencer.js`, `.claude/lib/custody.js`, `.claude/commands/ship-build.md`, `.claude/commands/implement-trd.md`, `.claude/contracts/ship-primitive-request-review.md`, `.claude/contracts/ship-primitive-merge.md`, `.claude/contracts/ship-primitive-await-approval.md`, `.claude/contracts/ship-primitive-fix-findings.md`, `.claude/contracts/ship-primitive-wait-ci.md`, `.claude/skills/ship-setup/SKILL.md`, `.claude/skills/ship-setup/template.md`, `CHANGELOG.md`, `CLAUDE.md`
- **Reuse:** plain copies; `packages/full/*` are symlinks into `packages/core` and need nothing [ran]
- **Replaces:** nothing [read]
- **Follow:** `.claude/rules/*` is owner-governed and is not touched [read]
- **Careful:** `CLAUDE.md` is 15,995 bytes on `origin/main` [ran] — any line added must be paid for by one trimmed

### FIX-009
- **Touches:** `packages/core/lib/ship-review.js`, `packages/core/lib/ship-review.test.js`, `packages/core/contracts/ship-primitive-request-review.md`, `packages/core/contracts/ship-primitives.test.js`, `.claude/lib/ship-review.js`, `packages/full/lib/ship-review.js`
- **Reuse:** the `gh pr view --json reviews` shape; CLI conventions of `ship-sequencer.js` (one JSON line, exit 2 on usage) [read]
- **Replaces:** the judged match in the request-review contract [read]
- **Follow:** `spawnSync`-free pure function; no network [read]
- **Careful:** `packages/full/lib/*` entries are symlinks into `packages/core/lib` [ran]

## Could Not Verify

- Real GitHub behaviour after the fix (a second account's approval followed by a merge, the
  headless reviewer posting with the new flag) — no second GitHub account and no GitHub
  environment in `verification.md`. The fixes are proved against stubbed `gh` and contract text.
- Whether `/code-review` invoked by `Skill` returns synchronously or in the background inside a
  chained run; FIX-004's `fix-findings` guard covers the synchronous case deterministically, and
  the `implement-trd` wait covers the background one only as far as the model follows the prose.
