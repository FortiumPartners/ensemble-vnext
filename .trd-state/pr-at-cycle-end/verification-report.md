# Functional Verification Report: pr-at-cycle-end

**Source PRD**: docs/TRD/pr-at-cycle-end.md#Intended Change
**Success definition**: .trd-state/pr-at-cycle-end/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 30 total — 30 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 30 of 30 proven — uncovered: none
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | With `ensemble.openPullRequest: "auto"` in the repo's `.claude/settings.json`, `pull-request.js mode` prints exactly one line, which parses as JSON and names `auto` | .trd-state/pr-at-cycle-end/evidence/fs-1-mode-auto.txt | 2 |
| FS-2 | With `ensemble.openPullRequest: "never"`, `mode` prints one JSON line naming `never` | .trd-state/pr-at-cycle-end/evidence/fs-2-mode-never.txt | 2 |
| FS-3 | With the key absent (no `openPullRequest` key; also no `ensemble` block; also no settings file at all), `mode` reads it as `never` | .trd-state/pr-at-cycle-end/evidence/mode-transcript.txt | 1 |
| FS-4 | With an unrecognised value (e.g. `"always"`, `true`, `"AUTO "`), `mode` reads it as `never` | .trd-state/pr-at-cycle-end/evidence/mode-transcript.txt | 1 |
| FS-5 | `ensure` prints exactly one JSON line, an object with the keys `action`, `url` and `reason`, where `action` is one of `opened`, `updated`, `skipped`, `failed`. This holds in every FS-6 to FS-18 scenario | .trd-state/pr-at-cycle-end/evidence/ensure-fs6-8-transcript.txt | 1 |
| FS-6 | With the setting `never`, `ensure` reports `skipped` with a reason naming the setting. Nothing is pushed: the bare origin has no ref for the branch, and the stub `gh` log has no `pr create` | .trd-state/pr-at-cycle-end/evidence/ensure-fs6-8-transcript.txt | 1 |
| FS-7 | With `auto`, run on the default branch, `ensure` reports `skipped` with a reason saying it is on the default branch. No push, no `pr create` | .trd-state/pr-at-cycle-end/evidence/ensure-fs6-8-transcript.txt | 1 |
| FS-8 | With `auto` and HEAD detached, `ensure` reports `skipped` with a reason saying HEAD is detached. No push, no `pr create` | .trd-state/pr-at-cycle-end/evidence/ensure-fs6-8-transcript.txt | 1 |
| FS-9 | With `auto`, the stub's `gh repo view --json defaultBranchRef` fails, and `refs/remotes/origin/HEAD` is unset, so `ensure` reports `skipped` with reason "default branch unknown". It does not fall back to `main`, even when a local `main` branch exists: no push, and no `pr create` with `--base main` | .trd-state/pr-at-cycle-end/evidence/FS-9.txt | 1 |
| FS-10 | When `gh repo view --json defaultBranchRef` answers with a non-`main` branch (e.g. `develop`), `ensure` opens the PR against that branch | .trd-state/pr-at-cycle-end/evidence/FS-10.txt | 1 |
| FS-11 | When `gh repo view` fails but `refs/remotes/origin/HEAD` points at a non-`main` branch (e.g. `trunk`), `ensure` falls back to it and opens the PR against `trunk` | .trd-state/pr-at-cycle-end/evidence/FS-11.txt | 1 |
| FS-12 | With `auto` and no `gh` on `PATH`, `ensure` reports `skipped` with a reason saying `gh` is missing. No push | .trd-state/pr-at-cycle-end/evidence/FS-12.txt | 1 |
| FS-13 | With `auto` and a stub `gh` that reports not authenticated (`gh auth status` exits non-zero), `ensure` reports `skipped` with a reason saying `gh` is not authenticated. No push, no `pr create` | .trd-state/pr-at-cycle-end/evidence/FS-13.txt | 1 |
| FS-14 | On a feature branch with no open PR, `ensure` pushes the branch with upstream tracking, then opens a PR against the default branch using the given title and body file. It reports `opened` with the URL the stub returned | .trd-state/pr-at-cycle-end/evidence/FS-14.txt | 1 |
| FS-15 | When an open PR already exists for the branch, `ensure` still pushes the branch. It reports `updated` with that PR's URL and does not call `pr create` | .trd-state/pr-at-cycle-end/evidence/FS-15.txt | 1 |
| FS-16 | When the branch's only PRs are closed or merged, `ensure` does not reuse them. It queries open PRs only, opens a new PR, and reports `opened` with the new URL, not the closed PR's | .trd-state/pr-at-cycle-end/evidence/FS-16.txt | 1 |
| FS-17 | When the push fails (e.g. the bare origin rejects it through a `pre-receive` hook that prints a known message), `ensure` reports `failed` with the error's first line as `reason`. It does not call `pr create` | .trd-state/pr-at-cycle-end/evidence/fs17-18-19-transcript.txt | 1 |
| FS-18 | When `gh pr create` fails (the stub exits non-zero with a multi-line stderr), `ensure` reports `failed` with the first stderr line as `reason` | .trd-state/pr-at-cycle-end/evidence/fs17-18-19-transcript.txt | 1 |
| FS-19 | `ensure` never merges. Across every `ensure` run in FS-6 to FS-18, the stub `gh` log has no `pr merge` call, and the bare origin's default-branch ref is unchanged | .trd-state/pr-at-cycle-end/evidence/fs17-18-19-transcript.txt | 1 |
| FS-20 | This repository's own `.claude/settings.json` sets `ensemble.openPullRequest` to `"auto"` | .trd-state/pr-at-cycle-end/evidence/fs20-21-templates.txt | 1 |
| FS-21 | Every shipped settings template sets `ensemble.openPullRequest` to `"never"` | .trd-state/pr-at-cycle-end/evidence/fs20-21-templates.txt | 1 |
| FS-22 | Run against a temp project, `scaffold-project.sh` adds `openPullRequest: "never"` when the key is absent, and leaves an owner's existing value alone: a project set to `"auto"` is still `"auto"` after the run, and a second run changes nothing | .trd-state/pr-at-cycle-end/evidence/fs22-scaffold-transcript.txt | 1 |
| FS-23 | The shipped `/audit-build` command calls `pull-request.js ensure` after its commit and publish steps, under exactly three conditions: the audit closed the feature (including a re-audit of an already-closed feature), the run is not `--report-only`, and the audit commit succeeded | .trd-state/pr-at-cycle-end/evidence/fs23-24-section.txt | 1 |
| FS-24 | The shipped `/audit-build` command names the PR link, or the skip or failure reason, in STATE. When a PR is open, NEXT is `gh pr merge <number> --merge`, with a line above it saying to run it after reviewing the PR. When there is no PR (`never`, skipped or failed), NEXT is `gh pr create …` | .trd-state/pr-at-cycle-end/evidence/fs23-24-section.txt | 1 |
| FS-25 | The shipped `/audit-build` command opens no PR when the run hands work to `/implement-trd --reconcile` or ends "do not proceed" | .trd-state/pr-at-cycle-end/evidence/fs25-26.txt | 1 |
| FS-26 | On a feature branch, the shipped `/close-feature` command calls `ensure` only after the close record commits successfully, and its "already closed" path opens no PR | .trd-state/pr-at-cycle-end/evidence/fs25-26.txt | 1 |
| FS-27 | The shipped `/implement-trd` NEXT template still names one command (normally `/audit-build`). Its `gh pr create` line says a passing `/audit-build` opens the PR when the setting is `auto`, and that `gh pr create` is the owner's command when it is `never` | .trd-state/pr-at-cycle-end/evidence/fs27-28.txt | 1 |
| FS-28 | The shipped `/implement-trd` no longer says "The PR is the owner's to open". The replacement paragraph conditions PR opening on the setting and keeps the measured reason that a run ending without saying how to ship left the work stranded on a branch | .trd-state/pr-at-cycle-end/evidence/fs27-28.txt | 1 |
| FS-29 | Both `autonomy.md` and its template say that with `openPullRequest: auto`, opening a PR, but never merging one, is authorized by that setting | .trd-state/pr-at-cycle-end/evidence/fs29.txt | 1 |
| FS-30 | `.claude/rules/async-discipline.md` and `.claude/rules/autonomy.md` together are no larger than 17,000 bytes (the combined ceiling test/integration/tests/runtime-integrity.test.sh enforces) | .trd-state/pr-at-cycle-end/evidence/fs30.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

