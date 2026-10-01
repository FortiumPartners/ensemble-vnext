# TRD: pr-at-cycle-end

**Source PRD**: None — small change decided in session (owner, 2026-09-30)
**Kind**: change
**Weight**: small

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | When the implement → verify → audit cycle ends on a feature branch, the framework pushes and opens (or updates) the pull request itself, rather than naming `gh pr create` for the owner to run. Merging stays the owner's | owner, 2026-09-30: "Ensemble has become much too hesitant about creating PRs. My general expectation is that PRs are the terminal state of the implement/verify/audit cycle" |
| O2 | This is a per-project setting, and an owner's choice survives every refresh and rebase | owner, same turn: "Perfectly ok for that to be a configuration point for the framework, but that's how I want MY ensemble configured" |
| O3 | This repository is configured to open PRs automatically | owner, same turn |

## Intended Change

**Today:**
- A passing `/audit-build` closes the feature, commits its report, and NEXT says "open or update the PR" (`audit-build.md:318`).
- `/close-feature`'s NEXT says the same on a feature branch (`close-feature.md:101`).
- `/implement-trd`'s NEXT template lists `gh pr create --title "<title>"` and says "The PR is the owner's to open" (`implement-trd.md:1871-1875`).
- Nothing in the framework ever opens a PR.

**After:**
- **The setting.** `.claude/settings.json` gains `ensemble.openPullRequest`, either `"auto"` or `"never"`.
  - The shipped templates set `"never"`, so other projects keep today's behaviour unless their owner opts in.
  - This repository's own settings set `"auto"`.
  - `scaffold-project.sh` backfills the key with `setdefault("openPullRequest", "never")`, so a refresh never overwrites an owner's choice. This is the same rule as `publishArtifacts`.
  - A missing or unrecognised value reads as `"never"`.
- **One script does the git and `gh` work.** `packages/core/lib/pull-request.js` reads the setting and decides what to do. It has two CLI subcommands, and each prints one JSON line:
  - `node .claude/lib/pull-request.js mode` prints `auto` or `never`.
  - `node .claude/lib/pull-request.js ensure --title <t> --body-file <f>` prints `{ action: 'opened'|'updated'|'skipped'|'failed', url, reason }`.

  `ensure` works out the default branch with `gh repo view --json defaultBranchRef`, falling back to `git symbolic-ref refs/remotes/origin/HEAD`. If neither answers, it skips with "default branch unknown"; it never assumes `main`. It skips, with the reason, when:
  - the setting is `never`;
  - the branch is the default branch;
  - HEAD is detached;
  - the default branch is unknown;
  - `gh` is missing or not authenticated.

  Otherwise it pushes the branch with `-u`. It looks for an **open** PR on the branch (`gh pr list --head <branch> --state open`). If it finds one, it reports `updated` with that PR's URL; a closed or merged PR is never reused. If it finds none, it opens one against the default branch. A push or `gh pr create` that fails reports `failed`, with the error's first line as the reason. It never merges.
- **`/audit-build`.** It calls `ensure` after its commit and publish steps, under three conditions: the audit closed the feature (this includes a re-audit of an already-closed feature, which updates the open PR), the run is not `--report-only`, and the audit commit succeeded. STATE names the PR link, or the skip or failure reason. When a PR is open, NEXT is `gh pr merge <number> --merge`, with a line above it saying to run it once you've reviewed the PR; merging is still yours. When there is no PR (`never`, skipped or failed), NEXT is `gh pr create …` as today. A run that hands work to `/implement-trd --reconcile`, or ends "do not proceed", opens no PR, because the feature isn't done.
- **`/close-feature`.** On a feature branch, after the close record commits successfully, it calls `ensure` the same way. The "already closed" path changes nothing and opens no PR.
- **`/implement-trd`.** Its NEXT template keeps naming one command, normally `/audit-build`. The `gh pr create` line is reworded: a passing `/audit-build` opens the PR when the setting is `auto`, and `gh pr create` is the owner's command when it is `never`. The "PR is the owner's to open" paragraph is replaced with one that says the same, and it keeps the measured reason: a run that ended without saying how to ship left the work stranded on a branch.
- **`autonomy.md`** (and its template) gains one clause. With `openPullRequest: auto`, opening a PR, never merging one, is authorized by that setting. Otherwise the rule that a command's authorization doesn't reach an outward-facing act would forbid what the owner asked for. `async-discipline.md` and `autonomy.md` must stay within their combined 17,000-byte limit (16,917 today), so trim elsewhere in `autonomy.md` if needed.

## Decision

- **A script, not prose, does the git and `gh` work.** That covers the default-branch check, the existing-PR check and the push. Principle 3: the steps that must always come out the same are a script; the model only writes the title and body. Prose "open a PR if appropriate" is how a framework ends up hesitant one run and reckless the next.
- **The shipped default is `"never"`; this repo is set to `"auto"`.** Opening a PR publishes the branch to a shared remote, so other projects keep today's behaviour unless their owner chooses otherwise. The owner asked for this as a setting and for their own setup to be `auto`. OQ-1 records that the shipped default is the owner's call.
- **A failure never blocks the command.** No `gh`, no auth, a failed push or a failed `gh pr create` is one STATE line with the reason. It never makes the command STUCK, and it is never retried, the same rule as artifact publishing. **No PR without the audit commit:** if that commit failed, the report isn't on the branch, so `ensure` is not called.
- **Only open PRs count, and the default branch is asked of GitHub** (adversarial review, 2026-09-30). `gh pr view <branch>` also returns merged PRs, and a `main` fallback would treat `master` as a feature branch and push it.
- **Only the commands that end the cycle open the PR.** That is `/audit-build` when it closes the feature, and `/close-feature`. `/implement-trd` does not: the audit is the gate, and the owner's own words name the audit as the end of the cycle.

absorbed:     none
not absorbed: `/sweep` opening a PR. `/sweep`'s contract is "Never commit — the owner splits a batch
              of unrelated changes into commits themselves", and a PR needs commits. The owner's
              request names the implement/verify/audit cycle, which `/sweep` is not.
not absorbed: `/plan --implement` and `/verify-build`. Both end in a NEXT of `/audit-build`, which
              is where the PR opens.

## Non-Goals

- No automatic merge, tag or release; those still need the owner's explicit go.
- No change to `/sweep`'s never-commit rule.
- No PR from `/implement-trd`, `/verify-build` or `/plan --implement` directly.
- No edit to `.claude/rules/command-status.md`, which sits near its byte ceiling (12,402 of 12,500).

## Verification Artifacts

None apply — no UI designs, interaction diagrams or data views; the surfaces are a lib, settings files, a scaffold script and command prompts.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should the shipped default for other projects be `auto` rather than `never`? | `never` for shipped templates (no change for other projects); `auto` for this repo | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Create `packages/core/lib/pull-request.js`: `readMode(settingsPath)` (`'auto'`, or `'never'` for missing/unknown), a pure `decide({ mode, branch, defaultBranch, ghAvailable, openPrUrl })` returning the action and reason, and the `mode` and `ensure` CLI subcommands (git and `gh` through `spawnSync` with argument arrays; never `execSync` with interpolated strings). The lib never invokes `pr merge`. Mirror it to `.claude/lib/pull-request.js` and symlink `packages/full/lib/pull-request.js -> ../../core/lib/pull-request.js`, like the other libs. Jest tests: readMode for auto, never, missing and garbage values; decide for each skip reason and for `opened` vs `updated`; the CLI against a temp git repo whose `origin` is a local bare repo, with cwd set to the temp repo, `GIT_DIR`/`GIT_WORK_TREE` cleared, and a stub `gh` on PATH. Cases:<br>• on the default branch → `skipped`;<br>• a feature branch with no open PR → the stub is called with `pr create --base <default>`;<br>• an open PR → `updated`, and no create call;<br>• only a closed PR (the stub's `pr list --state open` returns nothing) → `opened`;<br>• default branch unknown → `skipped`;<br>• the stub's `pr create` exits non-zero → `failed`;<br>• the source never contains a `pr merge` invocation. | O1, O2 | None | <ul><li>The new tests pass.</li><li>A test fails if `ensure` calls `gh pr create` while on the default branch, or reuses a closed PR.</li><li>`npx jest` passes.</li><li>`cmp` shows the mirror identical, and the `packages/full` link resolves.</li></ul> |
| FIX-002 | Settings and scaffold: add `"openPullRequest": "never"` to the `ensemble` block of `packages/core/templates/claude-directory/settings.json` and `packages/full/.claude/settings.json`, and `"auto"` to this repo's `.claude/settings.json`. In `packages/core/scripts/scaffold-project.sh`, add `ensemble.setdefault("openPullRequest", "never")` beside the `publishArtifacts` one, with a comment. BATS tests in the `notify-on-complete.test.sh` L2c style: the key is present in all three copies; the shipped templates say `never`. Add a behavioural test modelled on `test/integration/tests/scaffold-delivery.test.sh:136`: a refresh of a project whose settings say `"auto"` keeps `"auto"`, and one with no key gets `"never"`. Add `pull-request` to the delivered-module list at `scaffold-delivery.test.sh:85` | O2, O3 | FIX-001 | <ul><li>The new BATS tests pass and fail if the key is removed from any copy.</li><li>The refresh test fails if `setdefault` is replaced by assignment.</li><li>`node .claude/lib/pull-request.js mode` prints `auto` in this repo.</li><li>The existing settings and scaffold BATS suites pass.</li></ul> |
| FIX-003 | Commands: in `packages/core/commands/audit-build.md`, after "Publish it", add "Open the pull request". When the audit closed the feature and the run is not `--report-only`, write a one-paragraph PR body (the verdict and the report link) to a temp file and run `node .claude/lib/pull-request.js ensure --title "<feature>: <one line>" --body-file <tmp>`. STATE names the URL or the skip reason, It runs only when the audit closed the feature (re-audits included), the run is not `--report-only`, and the commit succeeded. When a PR is open, NEXT is `gh pr merge <number> --merge`, alone in its fenced block, with a line above saying to run it once you've reviewed the PR. Otherwise NEXT is `gh pr create …`. In `close-feature.md`, do the same after a successful close commit on a feature branch; the "already closed" path opens nothing. In `implement-trd.md` (~:1865-1880), reword the `gh pr create` NEXT line and replace the "PR is the owner's to open" paragraph, as in Intended Change, keeping the measured reason. Add the `openPullRequest` clause to `.claude/rules/autonomy.md` and `packages/core/templates/claude-directory/rules/autonomy.md` (byte-identical, combined limit with `async-discipline.md` 17,000). Mirror all three to `.claude/commands/` byte-identically. Add assertions to `packages/core/commands/verify-command-surface.test.js`. Each must fail against today's files:<br>• audit-build.md and close-feature.md name `pull-request.js ensure`;<br>• audit-build.md ties it to `--report-only` being absent;<br>• implement-trd.md says `/audit-build` opens the PR when `openPullRequest` is `auto`;<br>• autonomy.md names `openPullRequest`. | O1 | FIX-001 | <ul><li>The new command-surface assertions pass, and each fails against today's files.</li><li>The mirrors are byte-identical.</li><li>The runtime-integrity BATS byte-ceiling test passes.</li><li>`npx jest packages/core/commands` passes.</li></ul> |
| FIX-004 | Docs: in `docs/reference/implement-trd.md` and `docs/reference/other-commands.md`, describe `ensemble.openPullRequest`: its values, the default, what opens the PR, when it skips, and that merging stays the owner's | O1, O2 | FIX-001 | <ul><li>`grep -c "openPullRequest"` is at least 1 in each of the two docs; it is 0 today.</li></ul> |
| AMEND-001 | Add a test that this repo own .claude/settings.json sets ensemble.openPullRequest to auto (O3); today the only test checks it is a string (`test/integration/tests/notify-on-complete.test.sh`) — promoted from a gap discovery found by audit-build | amendment — no objective recorded | None | Add a test that this repo own .claude/settings.json sets ensemble.openPullRequest to auto (O3); today the only test checks it is a string no longer reproduces: audit-build 2026-10-01: notify-on-complete.test.sh:609-626 passes with never |
| AMEND-002 | Add command-surface assertions for when the PR opens: close-feature.md only after a successful close commit and never on the already-closed path; audit-build.md only when the audit commit succeeded (`packages/core/commands/verify-command-surface.test.js`) — promoted from a gap discovery found by audit-build | amendment — no objective recorded | None | Add command-surface assertions for when the PR opens: close-feature.md only after a successful close commit and never on the already-closed path; audit-build.md only when the audit commit succeeded no longer reproduces: audit-build 2026-10-01: verify-command-surface.test.js:669-698 tests only the --report-only condition |
| AMEND-003 | Strengthen the never-merges test in pull-request.test.js so it fails on any merge invocation form (pr merge string, template literal, separate merge arg), not only a quoted merge token (`packages/core/lib/pull-request.test.js`) — promoted from a gap discovery found by audit-build | amendment — no objective recorded | None | Strengthen the never-merges test in pull-request.test.js so it fails on any merge invocation form (pr merge string, template literal, separate merge arg), not only a quoted merge token no longer reproduces: audit-build 2026-10-01: pull-request.test.js:208 only matches a quoted merge token |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/pull-request.js`, `packages/core/lib/pull-request.test.js`, `.claude/lib/pull-request.js`, `packages/full/lib/pull-request.js`
- **Reuse:**
  - `gh repo view --json defaultBranchRef` first, then `close-feature.md:78`'s `git symbolic-ref` rule. Not its `main` fallback: unknown means skip [read]
  - the `spawnSync` argument-array pattern required by CLAUDE.md "Command Injection Prevention" [read]
  - the CLI dispatch style of `functional-verification.js` [read]
- **Replaces:** nothing
- **Follow:**
  - `packages/full/lib/*.js` are relative symlinks into `packages/core/lib`; add the new one the same way [ran]
  - `.claude/lib/*.js` are byte-identical copies [ran]
- **Careful:**
  - The CLI tests use a temp git repo with a local bare `origin`, cwd set to the temp repo, `GIT_DIR`/`GIT_WORK_TREE` cleared, and a stub `gh` first on PATH. Never touch this repository's real remote, and never call a real `gh` [read: adversarial review]
  - Read the setting from `.claude/settings.json` relative to the cwd [inferred]

### FIX-002
- **Touches:** `packages/core/templates/claude-directory/settings.json`, `packages/full/.claude/settings.json`, `.claude/settings.json`, `packages/core/scripts/scaffold-project.sh`, `test/integration/tests/notify-on-complete.test.sh`, `test/integration/tests/scaffold-delivery.test.sh`
- **Reuse:** the `publishArtifacts` entries and their L2c BATS tests at `notify-on-complete.test.sh:568-615` [read]; `ensemble.setdefault("publishArtifacts", True)` at `scaffold-project.sh:1302` [read]
- **Replaces:** nothing
- **Follow:** `setdefault`, never assignment, so an owner's value survives a refresh [read]
- **Careful:** `.claude/settings.json` is also written by `scaffold-project.sh --refresh`; `setdefault` keeps this repo's `"auto"` [read]

### FIX-003
- **Touches:** `.claude/rules/autonomy.md`, `packages/core/templates/claude-directory/rules/autonomy.md`, `packages/core/commands/audit-build.md`, `.claude/commands/audit-build.md`, `packages/core/commands/close-feature.md`, `.claude/commands/close-feature.md`, `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:**
  - the "Publish it" paragraph in `audit-build.md` (~:248) as the shape: one tool call, a failure is one line, never STUCK [read]
  - the close-feature commit step at `close-feature.md:74-88` [read]
- **Replaces:**
  - `implement-trd.md`'s `gh pr create` NEXT line and its "The PR is the owner's to open" paragraph (~:1871-1878) [read]
  - "open or update the PR" in `audit-build.md:318` and `close-feature.md:101` [read]
- **Follow:** command-status.md's NEXT rule: one command, in its own fenced block, or "nothing — this is done" [read]
- **Careful:**
  - Merging stays the owner's; no command may call `gh pr merge` [read]
  - A failed `ensure` is one STATE line, never STUCK [read]

### FIX-004
- **Touches:** `docs/reference/implement-trd.md`, `docs/reference/other-commands.md`
- **Reuse:** the `publishArtifacts` description at `docs/reference/implement-trd.md:298` [read]
- **Replaces:** nothing
- **Follow:** plain language, as in the rest of the reference [read]
- **Careful:** none

### AMEND-001

- **Touches:** `test/integration/tests/notify-on-complete.test.sh`

### AMEND-002

- **Touches:** `packages/core/commands/verify-command-surface.test.js`

### AMEND-003

- **Touches:** `packages/core/lib/pull-request.test.js`

## Could Not Verify

Updated by `/audit-build`, 2026-10-01. Gaps that audit found are in its report, not here.

| Claim | Why not checked |
|-------|-----------------|
| A live `/audit-build` or `/close-feature` run opens a real PR on GitHub, and only under the conditions in Intended Change (audit closed the feature, not `--report-only`, the commit succeeded; the "already closed" path opens nothing) | Needs a live run against the remote. The unit tests use a stub `gh`, and the command conditions are prompt prose, so tests can only show the wording is there, not that a run follows it |
| The change matches what the owner asked for | No PRD exists; the source is the owner's in-session statement quoted under Objectives. The audit checked the TRD against the code only, so nothing was checked against the request itself or for omissions |
