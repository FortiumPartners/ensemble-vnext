# Functional Verification Report: per-feature-framework-writes

**Source PRD**: docs/TRD/per-feature-framework-writes.md § Intended Change
**Success definition**: .trd-state/per-feature-framework-writes/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 18 total — 18 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 18 of 18 proven — uncovered: none
**Must pass**: 11 of 11 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Scaffolding a fresh project writes each of the four ignore lines into the project's `.gitignore` | .trd-state/per-feature-framework-writes/evidence/walk1-gitfiles-transcript.txt | 1 |
| FS-2 | In a freshly scaffolded project inside a git work tree, staging and committing everything (`git add -A && git commit`) does not track `.trd-state/current.json`, even though the file exists on disk | .trd-state/per-feature-framework-writes/evidence/walk1-gitfiles-transcript.txt | 1 |
| FS-3 | `.gitignore` handling is idempotent and leaves other content alone: when a `.gitignore` already holds unrelated lines and some of the four, only the missing lines are added, nothing is duplicated, every pre-existing line survives in place, and a second run leaves the file byte-identical | .trd-state/per-feature-framework-writes/evidence/walk1-gitfiles-transcript.txt | 1 |
| FS-4 | When the project's `.gitignore` cannot be written, the scaffold step prints a warning and the script still exits 0 | .trd-state/per-feature-framework-writes/evidence/walk1-gitfiles-transcript.txt | 1 |
| FS-5 | On an existing project whose git index tracks `.trd-state/current.json`, `scaffold-project.sh --git-files <dir>` removes it from the index only: `git ls-files` no longer lists it, the file is still on disk with unchanged content, the removal is staged and not committed (HEAD unchanged), and the output says the removal should be committed on the base branch | .trd-state/per-feature-framework-writes/evidence/walk1-gitfiles-transcript.txt | 1 |
| FS-6 | `--git-files` also removes from the index every other listed path that is tracked (`.trd-state/_dispatch.jsonl`, a `.trd-state/<feature>/dispatch.jsonl`, files under `.trd-state/_command-runs/`), leaving each on disk; listed paths that are not tracked cause no error | .trd-state/per-feature-framework-writes/evidence/walk1-gitfiles-transcript.txt | 1 |
| FS-7 | `--refresh` on an existing project appends the missing ignore lines but does not untrack anything: a tracked `.trd-state/current.json` is still in the index afterwards | .trd-state/per-feature-framework-writes/evidence/walk1-gitfiles-transcript.txt | 1 |
| FS-8 | Run in a directory that is not inside a git work tree, `--git-files` still writes the ignore lines, attempts no index removal, and exits 0 | .trd-state/per-feature-framework-writes/evidence/walk1-gitfiles-transcript.txt | 1 |
| FS-9 | Scaffold and `--refresh` both write all 3 union lines into the project's `.gitattributes`: `.claude/verification-notes.md merge=union`, `.trd-state/_session-log.md merge=union`, `.trd-state/_sweep/discovered.jsonl merge=union` | .trd-state/per-feature-framework-writes/evidence/walk1-gitfiles-transcript.txt | 1 |
| FS-10 | `scaffold-project.sh --git-files <dir>` on an existing project writes both the ignore lines into `.gitignore` and the union lines into `.gitattributes` | .trd-state/per-feature-framework-writes/evidence/walk1-gitfiles-transcript.txt | 1 |
| FS-11 | `/rebase-project` always runs the `--git-files` step, just before its version stamp, so an existing project rebased onto the plugin receives the ignore and union lines and stops tracking `.trd-state/current.json` | .trd-state/per-feature-framework-writes/evidence/walk1-gitfiles-transcript.txt | 1 |
| FS-12 | `/init-project` Step 11 says the framework's ignore lines are written by the scaffold script, and `gitignore-additions.txt` no longer tells projects to commit `.trd-state/current.json` | .trd-state/per-feature-framework-writes/evidence/fs12-13-grep.txt | 1 |
| FS-13 | This repository's own `.gitattributes` contains `.trd-state/_session-log.md merge=union` and `.trd-state/_sweep/discovered.jsonl merge=union` | .trd-state/per-feature-framework-writes/evidence/fs12-13-grep.txt | 1 |
| FS-14 | The non-strict version stamp (run by scaffold and `--refresh`) writes `ensemble.version` but does not write or change `ensemble.refreshed_at`, so two `--refresh` runs to the same plugin version at different times leave `.claude/settings.json` byte-identical | .trd-state/per-feature-framework-writes/evidence/walk2-stamp-transcript.txt | 1 |
| FS-15 | The strict `--stamp-version` still writes both `ensemble.refreshed_at` and `ensemble.rebased_at` | .trd-state/per-feature-framework-writes/evidence/walk2-stamp-transcript.txt | 1 |
| FS-16 | On a fixture repo scaffolded by the script, two feature branches that each perform the framework writes (the `current.json` pointer, the `_dispatch.jsonl` ledger fallback, `_command-runs/<session>.json` command-run state, the `_session-log.md` fallback, the `_sweep/discovered.jsonl` sweep ledger, `.claude/verification-notes.md`, and their own `.trd-state/<feature>/` files) merge into the base, branch A first and then branch B, with zero conflicts | .trd-state/per-feature-framework-writes/evidence/walk4-merge-transcript.txt | 1 |
| FS-17 | The same two-branch scenario as FS-16 merges with zero conflicts when branch B is merged first and branch A second | .trd-state/per-feature-framework-writes/evidence/walk4-merge-transcript.txt | 1 |
| FS-18 | Without the new ignore and union lines (control), the same two-branch scenario does produce a merge conflict | .trd-state/per-feature-framework-writes/evidence/walk4-merge-transcript.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

