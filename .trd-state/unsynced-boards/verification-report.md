# Functional Verification Report: unsynced-boards

**Source PRD**: docs/TRD/unsynced-boards.md ## Intended Change
**Success definition**: .trd-state/unsynced-boards/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 17 total — 17 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 17 of 17 proven — uncovered: none
**Must pass**: 7 of 7 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `node .claude/lib/design-map.js unsynced --dir docs/ui/<slug>` prints a JSON array of `{ design, id, trd }` entries for that one design, and a board that is `building` and cites a TRD whose feature is closed (its `.trd-state/<feature>/closed.json` exists) appears in it | .trd-state/unsynced-boards/evidence/fs1-dir.txt | 1 |
| FS-2 | A `building` board whose TRD's feature is still open (no `closed.json`) is not listed | .trd-state/unsynced-boards/evidence/fs-all.txt | 1 |
| FS-3 | A board in any status other than `building` (for example `shipped`) is not listed, even when its `trd` names a closed feature | .trd-state/unsynced-boards/evidence/fs-all.txt | 1 |
| FS-4 | A board with no `trd` is never listed, by either `--dir` or `--all` | .trd-state/unsynced-boards/evidence/fs-all.txt | 1 |
| FS-5 | A building board is listed as soon as its feature is closed, whether or not that feature's work has merged to `main` | .trd-state/unsynced-boards/evidence/fs-all.txt | 1 |
| FS-6 | `unsynced --all` lists boards from every `docs/ui/*/design-map.json`, and subfolders without a map (such as `_current` and `_design-system`) are skipped without error | .trd-state/unsynced-boards/evidence/fs-all.txt | 1 |
| FS-7 | In a project with no `docs/ui` folder, `unsynced --all` prints `[]` and exits 0 | .trd-state/unsynced-boards/evidence/FS-7.txt | 1 |
| FS-8 | `unsynced --all --trd <path>` keeps only boards whose TRD names the same feature, matched by feature name, so `./docs/TRD/x.md`, an absolute path to it and `docs/TRD/x.md` all select the same boards, and a board citing a different closed feature is dropped | .trd-state/unsynced-boards/evidence/FS-8.txt | 1 |
| FS-9 | When `/audit-build` closes a feature and `unsynced --all --trd <trd-path>` lists boards, its NEXT gets one numbered step per design that names that design's boards and says to check them against the build with `/sync-design` once the PR has merged, with `/sync-design <slug>` alone in its fenced block | .trd-state/unsynced-boards/evidence/FS-9.txt | 1 |
| FS-10 | `/close-feature` does the same as FS-9: after writing `closed.json` it runs `unsynced --all --trd <trd-path>` and, when boards are listed, adds one numbered NEXT step per design naming the boards, with `/sync-design <slug>` alone in its fenced block | .trd-state/unsynced-boards/evidence/FS-10.txt | 1 |
| FS-11 | When the feature closed on the default branch (no PR), the step tells the owner to check the boards now rather than after a merge, in both `/audit-build` and `/close-feature` | .trd-state/unsynced-boards/evidence/FS-11.txt | 1 |
| FS-12 | When the check lists no boards, neither `/audit-build` nor `/close-feature` says anything about syncing in NEXT, and `/audit-build` no longer carries its old unconditional design line (which named `/sync-design` whenever any board, shipped ones included, cited the TRD) | .trd-state/unsynced-boards/evidence/FS-12.txt | 1 |
| FS-14 | The design commands' contract §1 step 6 is the stale-system and unsynced-board checks, runs `unsynced --dir docs/ui/<slug>`, and §1 still has six steps | .trd-state/unsynced-boards/evidence/fs14-contract-s1.txt | 1 |
| FS-17 | `/sync-design` and `/design-system` do not run the unsynced-board check | .trd-state/unsynced-boards/evidence/fs17-grep.txt | 1 |
| FS-13 | When the unsynced check itself fails, `/audit-build` and `/close-feature` each record one ISSUES line and still finish with COMMAND COMPLETE, never COMMAND STUCK; neither command runs `/sync-design` itself | .trd-state/unsynced-boards/evidence/fs13-close-feature-v2.txt | 2 |
| FS-16 | Each of the 3 design commands `/create-design`, `/refine-design` and `/audit-design` states the unsynced-board check alongside its stale-system check and puts `/sync-design <slug>` in its own NEXT order, in its own command text | .trd-state/unsynced-boards/evidence/fs16-all-v2.txt | 2 |
| FS-15 | A design command run on a design with a non-empty unsynced result shows the ISSUES line "boards <ids> are still building although their feature closed: check them against the build" and puts `/sync-design <slug>` in NEXT, after `/design-system --sync` when that is also due; contract §7's ISSUES and NEXT lists carry the same item | .trd-state/unsynced-boards/evidence/fs15-contract-s7-v2.txt | 3 |

## Not Met

_None._

## Not Verifiable

_None._

