# TRD: owner-rules-from-base

**Source PRD**: None — small change decided by the owner's delegate (Forge workplan
`fix-ship-custody-order`, feature F-2; GitHub issue FortiumPartners/ensemble-vnext #90)

**Kind**: change  ·  **Weight**: small

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Verification steps (`/implement-trd`'s verification pass and `/verify-build`) and ship steps (`/ship-build` and its primitive contracts) read every owner-governed rule file from `origin/<base>`, not from the feature branch's copy | issue #90; workplan brief, Feature 2, acceptance (1) | yes |
| O2 | When the feature branch's copy of an owner-governed rule file differs from the base copy, the step names the file and the difference loudly (a printed line and an ISSUES line) and carries on with the base copy — it never fails the run over it | issue #90; brief acceptance (2); decision taken by Forge 2026-11-08 | yes |
| O3 | A branch copy identical to the base copy behaves exactly as today: the step reads `.claude/rules/<file>` itself and reports nothing | brief acceptance (3) | |
| O4 | Tests that build a fixture git repo (a bare `origin`, a base branch and a feature branch) cover the differing case and the identical case | brief acceptance (4) | yes |

## Intended Change

**Before** [read]: every verification and ship step reads `.claude/rules/verification.md`
(and `/ship-build` reads `.claude/rules/ship.md`, the `sync-design` ship step reads
`.claude/rules/design.md`) straight from the working tree. A feature branch cut before the
owner changed one of those files keeps the old copy, and the step acts on the stale rule. The
Storybook case, 2026-11-08: the owner moved `develop`'s `verification.md` to per-worktree
ports; in-flight branches still said "localhost:3000 only, count 1"; a later feature's
verification collided on the port and was reported as `setup-failure`.

**After**: one library, `packages/core/lib/owner-rules.js`, decides which copy of each
owner-governed file a step reads. Two CLI forms:

- `node .claude/lib/owner-rules.js resolve [--base <branch>]` — run once at the start of each
  verification and ship step. Fetches `origin/<base>` (best effort), then prints one JSON line:
  per file the path to read (`use`), its `source`, `differs`, and a `notices` list — one loud
  line per file whose copy is not the branch's own.
- `node .claude/lib/owner-rules.js path <file> [--base <branch>]` — prints only the `use` path
  for one file, with no fetch, so every later read (hundreds of tool calls on, after a
  compaction, or inside a workflow agent) can recompute it with `$(...)` instead of trusting a
  remembered value.

**Which copy, by a three-way comparison against `git merge-base HEAD origin/<base>`:**

| Changed since the merge-base | Use | Notice |
|---|---|---|
| neither (branch copy equals base copy) | `.claude/rules/<file>` | none — today's behaviour |
| base only (the Storybook case) | the base copy | "<file> on this branch is stale: origin/<base> changed it since the branch was cut; using origin/<base>'s copy (N lines differ)" |
| branch only (the owner edited it on the branch, or the local base is ahead and unpushed) | the branch copy | "<file> was changed on this branch and differs from origin/<base>; using the branch copy" |
| both, differently | the base copy | "<file> was changed on BOTH this branch and origin/<base>; using origin/<base>'s copy" |

The branch copy is the working-tree file, so an uncommitted owner edit counts as a branch
change. The base copy is written to an untracked file under the git directory
(`git rev-parse --git-path ensemble/owner-rules`), falling back to a per-repo directory under
the OS temp dir when that is not writable; if neither is writable, the branch copy is used and
a notice says so.

**Falls back to the branch copy, with one notice, whenever there is nothing sound to compare
against:** no base found, no `origin/<base>` ref, no merge-base, or the project root is not the
git top level (a headless fixture slot under `.trd-state/…/work/slot-<n>`, which sits inside
this repo's tree but is not its own repo — comparing its rules with this repo's would replace
them with the wrong project's). A file on neither side keeps `use: .claude/rules/<file>`, so
every reader's existing "missing" handling applies.

**Base**, in order: `--base`; the open PR's base (`gh pr view --json baseRefName`); the
GitHub default branch (`gh repo view`); `origin/HEAD`. Never assume `main` — same rule as
`pull-request.js`. `--no-gh` skips the two `gh` lookups (tests, offline).

Checkable outcomes:
- In a fixture repo (bare `origin`, `main`, a feature branch cut earlier) where `origin/main`
  later changed `verification.md`'s `Coverage floor: 50%` to `80%`, `resolve` returns a `use`
  whose content is the base copy, a notice naming `verification.md` and `origin/main`, and
  `functional-verification.js read-coverage-floor "$(owner-rules.js path verification.md)"`
  reads 80. A step that kept reading the branch copy would read 50.
- Identical copies return `use: ".claude/rules/verification.md"`, `differs: false`, no notices.
- A branch-only edit keeps the branch copy, with a notice.
- `resolve` and `path` exit 0 in every comparison outcome; nothing about it fails the run.

## Decision

Read the base copy when the base changed the file since the branch was cut, and report loudly
whenever the branch copy differs, rather than failing the run (owner's call, taken by Forge
2026-11-08; the owner may overrule). The three-way merge-base comparison is how "stale" is
told apart from "deliberately edited here": a plain two-way diff would discard an owner's
`/verification-setup` answer given on the feature branch, which `/refine-verification` →
`/verify-build` depends on.

How:
- **One lib, recomputed at every read.** `owner-rules.js` owns the file list and the git work.
  Commands and contracts read `$(node .claude/lib/owner-rules.js path <file>)` wherever they
  used to name `.claude/rules/<file>` for a read, so no step depends on the model remembering
  a path across compaction, `--resume --verify`, or a workflow boundary.
- **The verify-functional workflow's agents are readers too** (they hit the Storybook port
  collision): `contracts/functional-verification.md` tells them to use the `path` form, and the
  `stackHints` `/implement-trd` §8.3 assembles carry the resolved copies.
- **The owner-governed list** is the six files `scaffold-project.sh`'s `AUTHORED_RULES` already
  refuses to overwrite: `constitution.md`, `stack.md`, `process.md`, `verification.md`,
  `design.md`, `ship.md`. A test keeps the two lists equal.
- **Discoveries still name the real file** (`file: '.claude/rules/verification.md'`): the owner
  edits that file, never the base copy.
- **The `sync-design` ship step is already safe**: it switches to a branch cut from
  `origin/<base>` before reading `design.md`, so it needs no change.
- **Rejected:** failing the run on a difference (the owner's call); rewriting the branch's
  `.claude/rules/` files in place (an autonomous edit of owner-governed files, which each of them
  forbids, and it puts rule changes into a feature's diff); merging the base into the branch
  before verifying (it changes the code under test and can conflict — feature F-1 of this
  workplan owns how a base merge is re-verified).

absorbed: none
not absorbed: `/plan`'s own never-unattended brake (Step 7) reads `verification.md` from the
branch — a planning step, not a verification or ship step; this change works without it.
not absorbed: `custody.js` counting `.claude/verification-notes.md` as shipped code — feature F-1
of the same workplan, built separately.

## Non-Goals

- Changing how any rule file is parsed or what any rule means.
- Editing, merging or committing any `.claude/rules/` file.
- Failing or stopping a run because a branch copy is stale.
- `/plan`'s planning-time brake, `/rebase-project`, and the design commands outside the ship
  `sync-design` step.
- Feature F-1 (custody ordering) and F-3 (design-render) of the workplan.

## Verification Artifacts

None apply — the change is a library and command prose with no screen, data view or designed
flow; Jest tests over a fixture git repo are its proof.

## Verification Environment
**Environment**: local
**Refresh**: none declared
**Cannot be checked there**: nothing known

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should a stale branch copy fail the run instead of being reported? | No — read the base copy and report (Forge's call 2026-11-08, recorded as an OWNER-CALL) | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `owner-rules.js` (`resolve` and `path` exports and CLI, three-way merge-base comparison, base lookup order, fallbacks) with Jest tests over a fixture git repo; ship it to `packages/full/lib/` (symlink) and `.claude/lib/` (copy) | O1, O2, O3, O4 | None | Fixture repo (bare origin, `main`, feature branch): base-only change → `use` holds the base content, notice names the file and `origin/main`, and `read-coverage-floor` on the `path` output reads the base floor; identical → `use: ".claude/rules/verification.md"`, no notices; branch-only change → branch copy with a notice; both changed → base copy with a notice; no remote / no base / root not the git top level → branch copy, one notice, exit 0. The file list equals `AUTHORED_RULES` in `scaffold-project.sh`. Tests fail if `resolve` returns the branch path on a base-only change |
| FIX-002 | Wire the verification steps: `/implement-trd` (§3.6a runs `resolve` first and puts its notices in ISSUES; `check-verification-unfilled`, `read-coverage-floor`, §8.3's `stackHints` reads and the `[LIVE]` refresh instruction read via `owner-rules.js path`), `/verify-build` (step 2 and `--chained`), and `contracts/functional-verification.md` (the loop's agents read `verification.md` and `stack.md` via the `path` form) | O1, O2, O3 | FIX-001 | The three files (core and vendored, identical) name `owner-rules.js`; no read of `.claude/rules/verification.md` or `stack.md` in the verification pass is left naming the raw path; a notice is an ISSUES line, never a stop |
| FIX-003 | Wire the ship steps: `/ship-build` runs `resolve` before Step 3, passes `"$(owner-rules.js path ship.md)"` to `ship-sequencer.js start --policy`, and puts notices in ISSUES; `ship-primitive-release.md` reads `verification.md` and `ship-primitive-close-issue.md` reads `stack.md` via the `path` form | O1, O2, O3 | FIX-001 | `ship-build.md` and both contracts (core and vendored, identical) name `owner-rules.js`; `--policy` no longer takes `.claude/rules/ship.md` |
| FIX-004 | A wiring test asserting the verification and ship files call `owner-rules.js` and read through it, and that each vendored copy equals its source; CHANGELOG Unreleased entry | O1, O4 | FIX-002, FIX-003 | Test fails if any wired file drops `owner-rules.js` or hands `.claude/rules/ship.md` to `--policy`; CHANGELOG names issue #90 |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/owner-rules.js`, `packages/core/lib/owner-rules.test.js`, `packages/full/lib/owner-rules.js`, `.claude/lib/owner-rules.js`
- **Reuse:** `spawnSync` with array arguments and the `run()` / `findDefaultBranch()` shapes from `packages/core/lib/pull-request.js` [read]; CLI `read-coverage-floor` in `functional-verification.js` for the end-to-end assertion [read]; `AUTHORED_RULES` in `packages/core/scripts/scaffold-project.sh` for the parity test [read]
- **Replaces:** nothing — new module [read]
- **Follow:** module header with WHY / CONTRACT / CLI sections like `pull-request.js`; CLI prints one JSON line (or one path) and exits 0 for every comparison outcome, 2 on a usage error; `packages/full/lib/<name>.js` is the relative symlink `../../core/lib/<name>.js` [read]
- **Careful:** never write into the tracked tree; `GIT_TERMINAL_PROMPT=0` on fetch; the `path` form never fetches; compare bytes; in a linked worktree `--git-path` points outside the working directory and may be unwritable — fall back to the OS temp dir, then to the branch copy with a notice

### FIX-002
- **Touches:** `packages/core/commands/implement-trd.md`, `packages/core/commands/verify-build.md`, `packages/core/contracts/functional-verification.md`, `.claude/commands/implement-trd.md`, `.claude/commands/verify-build.md`, `.claude/contracts/functional-verification.md`
- **Reuse:** §3.6a's `check-verification-unfilled` call, §8.1a's `read-coverage-floor` call, §8.3's `stackHints` reads, the `[LIVE]` `<live_evidence>` refresh instruction (implement-trd.md ~640); contract lines ~160, ~450, ~513 [read]
- **Replaces:** the literal `.claude/rules/verification.md` / `stack.md` read paths in those places [read]
- **Follow:** discoveries keep `file: '.claude/rules/verification.md'` [read]
- **Careful:** `runtime-integrity.test.sh` requires `.claude/commands/implement-trd.md` to equal its source — copy after editing [read]

### FIX-003
- **Touches:** `packages/core/commands/ship-build.md`, `packages/core/contracts/ship-primitive-release.md`, `packages/core/contracts/ship-primitive-close-issue.md`, `.claude/commands/ship-build.md`, `.claude/contracts/ship-primitive-release.md`, `.claude/contracts/ship-primitive-close-issue.md`
- **Reuse:** `ship-build.md` Step 3's `start --policy` call; the release contract's `readFullDeploy` snippet; close-issue step 1 [read]
- **Replaces:** `--policy .claude/rules/ship.md`; `readFileSync(".claude/rules/verification.md")`; the close-issue `stack.md` read [read]
- **Follow:** no `--base` from `ship-build` (the lib's own lookup finds the open PR's base) [inferred]
- **Careful:** a resumed run ignores `ship.md` (state snapshot); resolving is still harmless [read]

### FIX-004
- **Touches:** `packages/core/lib/owner-rules.wiring.test.js`, `CHANGELOG.md`
- **Reuse:** the prose-assertion style of `packages/core/contracts/ship-primitives.test.js` [inferred]
- **Replaces:** nothing [read]
- **Follow:** repo root via `path.join(__dirname, '..', '..', '..')` [inferred]
- **Careful:** assert stable tokens only, so ordinary prose edits do not break the test

## Could Not Verify

- That a live `/verify-build` session follows the new prose — Jest proves the instruction is
  present, not that a model obeys it.
- The Storybook reproduction itself (another product's `develop` branch) — reproduced in shape
  by the fixture repo, not on that repository.
