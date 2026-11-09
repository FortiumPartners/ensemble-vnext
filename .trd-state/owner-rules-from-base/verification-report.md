# Functional Verification Report: owner-rules-from-base

**Source PRD**: docs/TRD/owner-rules-from-base.md § Intended Change
**Success definition**: .trd-state/owner-rules-from-base/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 22 total — 22 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 22 of 22 proven — uncovered: none
**Must pass**: 13 of 13 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | When `origin/main` changed `verification.md` after the feature branch was cut and the branch did not (the base-only, Storybook case), `resolve` returns for `verification.md` a `use` path whose file content is byte-identical to `origin/main`'s copy, with `differs: true` | .trd-state/owner-rules-from-base/evidence/FS-1.txt | 1 |
| FS-2 | In that base-only case, `resolve`'s `notices` list carries one line naming `verification.md` and `origin/main`, saying the branch copy is stale, that `origin/main`'s copy is used, and how many lines differ | .trd-state/owner-rules-from-base/evidence/FS-2.txt | 1 |
| FS-3 | In the base-only fixture where the branch says `Coverage floor: 50%` and `origin/main` says `Coverage floor: 80%`, `functional-verification.js read-coverage-floor "$(owner-rules.js path verification.md)"` reads 80, where reading the branch copy directly reads 50 | .trd-state/owner-rules-from-base/evidence/FS-3.txt | 1 |
| FS-4 | When the branch copy and the base copy of `verification.md` are identical, `resolve` returns `use: ".claude/rules/verification.md"`, `differs: false`, and no notice for it | .trd-state/owner-rules-from-base/evidence/FS-4.txt | 1 |
| FS-5 | When only the branch changed `verification.md` since the merge-base (committed on the branch), `resolve` keeps the branch copy (`use: ".claude/rules/verification.md"`) and emits a notice that the file was changed on this branch and differs from `origin/main` | .trd-state/owner-rules-from-base/evidence/FS-5.txt | 1 |
| FS-6 | An uncommitted working-tree edit to a rule file on the branch counts as a branch change: with the base unchanged, the branch copy is used with the branch-only notice; it is never silently replaced by the base copy | .trd-state/owner-rules-from-base/evidence/FS-6.txt | 1 |
| FS-7 | When both the branch and `origin/main` changed `verification.md` since the merge-base, differently, `resolve` uses the base copy and emits a notice that the file was changed on BOTH this branch and `origin/main` | .trd-state/owner-rules-from-base/evidence/FS-7.txt | 1 |
| FS-8 | `resolve` prints exactly one JSON line covering each owner-governed rule file (`verification.md`, `ship.md`, `design.md`), and for each one carries `use`, `source`, `differs`; the line carries a `notices` list | .trd-state/owner-rules-from-base/evidence/FS-8.txt | 1 |
| FS-9 | `path <file>` prints only the `use` path for that one file and performs no fetch: with the fixture's `origin` made unreachable after the initial fetch, `path verification.md` still prints the base-copy path in the base-only case | .trd-state/owner-rules-from-base/evidence/FS-9.txt | 1 |
| FS-10 | `resolve` fetches `origin/<base>` on a best-effort basis: when the fetch fails (origin unreachable) it still exits 0 and resolves against the existing `origin/<base>` ref | .trd-state/owner-rules-from-base/evidence/FS-10.txt | 1 |
| FS-11 | The base copy is written to an untracked file under the path `git rev-parse --git-path ensemble/owner-rules` names, and running `resolve` leaves `git status` showing nothing new in the working tree | .trd-state/owner-rules-from-base/evidence/FS-11.txt | 1 |
| FS-12 | When the git-path location is not writable, the base copy is written under a per-repo directory in the OS temp dir instead, and the base copy is still used | .trd-state/owner-rules-from-base/evidence/FS-12.txt | 1 |
| FS-13 | When neither the git-path location nor the temp-dir location is writable, the branch copy is used and a notice says so | .trd-state/owner-rules-from-base/evidence/FS-13.txt | 1 |
| FS-14 | When there is nothing sound to compare against (no base found, no `origin/<base>` ref, or no merge-base), `resolve` uses the branch copy for every file and emits a notice saying why; it exits 0 | .trd-state/owner-rules-from-base/evidence/FS-14.txt | 1 |
| FS-15 | When the project root is not the git top level (a fixture slot directory inside another repo's tree), `resolve` uses the slot's own branch copy and emits a notice, and never substitutes the enclosing repo's rule files | .trd-state/owner-rules-from-base/evidence/FS-15.txt | 1 |
| FS-16 | A rule file present on neither the branch nor the base keeps `use: .claude/rules/<file>` (so the reader's existing missing-file handling applies) | .trd-state/owner-rules-from-base/evidence/FS-16.txt | 1 |
| FS-17 | The base is chosen in the stated order and `main` is never assumed: `--base` wins; with `--no-gh` and no `--base`, `origin/HEAD` is used; in a fixture whose default branch is `develop` and that has no `main`, the base resolves to `develop` | .trd-state/owner-rules-from-base/evidence/FS-17.txt | 1 |
| FS-18 | The verification steps run `owner-rules.js resolve` once at their start and read `verification.md` through `owner-rules.js path` (recomputed with `$(...)` at each read) rather than straight from `.claude/rules/verification.md` | .trd-state/owner-rules-from-base/evidence/FS-18.txt | 1 |
| FS-19 | The ship steps (`/ship-build` and the ship primitives that read rules, including the `sync-design` step's read of `design.md`) run `owner-rules.js resolve` once at their start and read `ship.md`, `verification.md` and `design.md` through `owner-rules.js path` rather than straight from the working tree | .trd-state/owner-rules-from-base/evidence/FS-19-iter2.txt | 2 |
| FS-20 | A verification or ship step prints each notice `resolve` returns to the owner, so a branch copy that differs from the base is named out loud rather than only sitting inside the JSON | .trd-state/owner-rules-from-base/evidence/FS-20.txt | 1 |
| FS-21 | `resolve` and `path` exit 0 in every comparison outcome (neither, base only, branch only, both) and every fallback; nothing about owner-rule resolution fails the run | .trd-state/owner-rules-from-base/evidence/FS-21.txt | 1 |
| FS-22 | The automated test suite builds a fixture git repo (bare `origin`, `main`, a feature branch cut earlier) and asserts both the differing case (base changed the coverage floor 50% to 80%: base copy used, notice naming `verification.md` and `origin/main`) and the identical case (`use: ".claude/rules/verification.md"`, `differs: false`, no notices), and that suite passes | .trd-state/owner-rules-from-base/evidence/FS-22.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

