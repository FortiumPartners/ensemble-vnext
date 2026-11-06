# Functional Verification Report: design-orchestration

**Source PRD**: docs/plan/design-orchestration.investigation.md
**Success definition**: .trd-state/design-orchestration/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 27 total — 27 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 27 of 27 proven — uncovered: none
**Must pass**: 17 of 17 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `/create-trd <prd> --design docs/ui/<slug> --boards <ids>`, naming buildable boards that no draft part holds, approves only the named boards, moves only them to `building`, and hands only them to the workflow; other buildable boards in the same map keep their previous status | .trd-state/design-orchestration/evidence/FS-create-trd-iter1.txt | 1 |
| FS-2 | When `--boards` names a board that is not buildable (not a to-be board in `draft`/`approved`, or not in the map), `/create-trd` ends COMMAND STUCK, naming that board and its status | .trd-state/design-orchestration/evidence/FS-create-trd-iter1.txt | 1 |
| FS-3 | When `--boards` names a board that a draft part holds, `/create-trd` ends COMMAND STUCK, naming the part and `/refine-design <slug> --approve <part>` | .trd-state/design-orchestration/evidence/FS-create-trd-iter1.txt | 1 |
| FS-4 | `/create-trd` strips `--boards` and its value before reading the PRD path, so `/create-trd docs/PRD/x.md --design docs/ui/<slug> --boards a,b` reads `docs/PRD/x.md` and never treats `--boards` or `a,b` as the PRD path | .trd-state/design-orchestration/evidence/FS-create-trd-iter1.txt | 1 |
| FS-5 | Without `--boards`, `/create-trd --design` behaves exactly as before: it approves and moves to `building` every buildable to-be board that no part holds, and the existing prose tests for its design sections still pass | .trd-state/design-orchestration/evidence/fs-jest-iter1.txt | 1 |
| FS-6 | `/create-trd` and `/plan` STUCK with the same wording on a bad `--boards` name, because `/create-trd` reuses `/plan`'s named-board rules rather than a second wording | .trd-state/design-orchestration/evidence/FS6-plan-iter1.txt | 1 |
| FS-7 | `/create-design` keeps item ids that arrive in its source (a source listing `S1: Cart`, `S2: Address` yields brief items `S1`, `S2`) and assigns `BI-n` ids only when the source carries none | .trd-state/design-orchestration/evidence/FS7-iter1.txt | 1 |
| FS-8 | Every board `/create-design` writes into `design-map.json` carries a `brief_items` field holding an array of item ids (parts carry `[]`), rather than depending on the model to include it | .trd-state/design-orchestration/evidence/FS-8.txt | 1 |
| FS-9 | After `/refine-design` changes a design, every board in `design-map.json` still carries a current `brief_items` array, including any board the refine adds or redraws | .trd-state/design-orchestration/evidence/FS-9.txt | 1 |
| FS-10 | `node .claude/lib/design-map.js validate` accepts a board whose `brief_items` is an array of strings, accepts a board with no `brief_items` field, and rejects a board whose `brief_items` is not an array (for example a string) or is an array holding a non-string | .trd-state/design-orchestration/evidence/fs8-14-cli.txt | 1 |
| FS-11 | `node .claude/lib/design-map.js buildable --items S2,S3` returns exactly the buildable to-be boards whose `brief_items` include `S2` or `S3`, and no buildable board that serves neither | .trd-state/design-orchestration/evidence/fs8-14-cli.txt | 1 |
| FS-12 | When `--items` names an item that no buildable board serves, `buildable` reports it in an `unmatched` list in its output rather than silently dropping it | .trd-state/design-orchestration/evidence/fs8-14-cli.txt | 1 |
| FS-13 | A board with no `brief_items` field is treated as serving nothing: `buildable --items` does not list it and does not error on it | .trd-state/design-orchestration/evidence/fs8-14-cli.txt | 1 |
| FS-14 | `buildable` accepts `--items` and `--ids` together, and a board is listed only when it is among the named ids and serves a named item | .trd-state/design-orchestration/evidence/fs8-14-cli.txt | 1 |
| FS-15 | Plain `buildable` (no `--items`) returns the same output it returned before this change, with no `unmatched` key, so existing callers are unaffected | .trd-state/design-orchestration/evidence/FS-15.txt | 1 |
| FS-16 | `/audit-design`'s traceability check decides "a brief item with no board" and "a board with no brief item" from the map's recorded `brief_items`, comparing the brief's item ids with the map's `brief_items` in both directions | .trd-state/design-orchestration/evidence/FS-16.txt | 1 |
| FS-17 | Under `--auto`, the create-design workflow returns its open decisions instead of an empty list, each carrying an id (`OD-1`, `OD-2`, …) alongside its question, options and recommended option | .trd-state/design-orchestration/evidence/fs17-jest-iter2.txt | 2 |
| FS-18 | Under `--auto`, `/create-design` records each open decision in `brief.md` under the fixed heading `## Decisions taken by default`, each entry giving its `OD-n` id, the question, the options and the option taken | .trd-state/design-orchestration/evidence/FS-18.txt | 1 |
| FS-19 | Under `--auto`, `/refine-design` likewise records each open decision it meets in `brief.md` under `## Decisions taken by default`, with an `OD-n` id, the question, the options and the option taken | .trd-state/design-orchestration/evidence/FS-19.txt | 1 |
| FS-20 | The readout of `/create-design --auto` and `/refine-design --auto` lists each recorded decision by its `OD-n` id, in the DECISIONS section | .trd-state/design-orchestration/evidence/FS-20.txt | 1 |
| FS-21 | Without `--auto`, `/create-design` still asks the owner its open decisions in its question round; recording under the heading is the `--auto` path only | .trd-state/design-orchestration/evidence/FS-21.txt | 1 |
| FS-22 | `/refine-design <slug> --auto "OD-2: <option>"` finds decision `OD-2` in `brief.md` by its id under the fixed heading and applies the named option to the design | .trd-state/design-orchestration/evidence/fs22-iter1.txt | 1 |
| FS-23 | `/refine-design --auto` given no other feedback takes the open findings from the latest `.trd-state/<slug>/audit-design-report.md` as its feedback, without a new flag | .trd-state/design-orchestration/evidence/fs23-iter1.txt | 1 |
| FS-24 | `/audit-build`'s NEXT step for `/sync-design` says it may be run now, on the feature branch before merge, as well as once the PR has merged | .trd-state/design-orchestration/evidence/fs24-iter1.txt | 1 |
| FS-25 | `/close-feature`'s NEXT step for `/sync-design` says it may be run now, on the feature branch before merge, as well as once the PR has merged | .trd-state/design-orchestration/evidence/fs25-iter1.txt | 1 |
| FS-26 | No shipped text this change adds names a particular product or orchestrator; every new instruction is worded for any unattended caller | .trd-state/design-orchestration/evidence/fs26-search-iter2.txt | 2 |
| FS-27 | Every `packages/core/` file this change edits is byte-identical to its `.claude/` mirror, so the vendored runtime carries the same behaviour | .trd-state/design-orchestration/evidence/fs27-iter1.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

