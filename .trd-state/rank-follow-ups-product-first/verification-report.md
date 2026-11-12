# Functional Verification Report: rank-follow-ups-product-first

**Source PRD**: docs/TRD/rank-follow-ups-product-first.md § Intended Change
**Success definition**: .trd-state/rank-follow-ups-product-first/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 12 total — 12 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 12 of 12 proven — uncovered: none
**Must pass**: 10 of 10 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `classOf(row)` returns a row's recorded `rankClass` when it is one of the five classes, ahead of every other signal: a row with `rankClass: "host"` and summary `[flaky-ci] ...` is `host`, and one with `rankClass: "paperwork"` and summary `[not-verifiable] ...` and `status: "not_verifiable"` is `paperwork` | .trd-state/rank-follow-ups-product-first/evidence/fs1-6-classof.txt | 1 |
| FS-2 | A row with no `rankClass` (a legacy row) is classed from its summary prefix: `[review:<label>]`, `[below-critical]`, `[not-this-feature]`, `[below-bar]`, `[review-pending]`, `[out-of-scope]` and `[task-followup]` give `product`; `[flaky-ci]` and `[flaky-capped]` give `tooling`; `[not-verifiable]` gives `not-verifiable`; a summary matching none of these gives `product`. No prefix ever gives `host` | .trd-state/rank-follow-ups-product-first/evidence/fs1-6-classof.txt | 1 |
| FS-3 | A row with `status: "not_verifiable"` and no `rankClass` is `not-verifiable` whatever its prefix — e.g. `[review:blocker] ...` with that status is `not-verifiable`, not `product` | .trd-state/rank-follow-ups-product-first/evidence/fs1-6-classof.txt | 1 |
| FS-4 | A row of `kind: "stale-grounding"` with no `rankClass` and no matched prefix is `paperwork`; when the same row's summary carries a mapped prefix, the prefix wins (e.g. `[flaky-ci]` gives `tooling`) | .trd-state/rank-follow-ups-product-first/evidence/fs1-6-classof.txt | 1 |
| FS-5 | A recorded `rankClass` that is not one of the five classes (e.g. `"urgent"`) is ignored and the row is classed from status, prefix and kind as if no `rankClass` were recorded | .trd-state/rank-follow-ups-product-first/evidence/fs1-6-classof.txt | 1 |
| FS-6 | `rank(rows)` returns the rows ordered product, host, tooling, paperwork, not-verifiable, each row carrying a `class` field; rows of the same class keep their input (ledger) order | .trd-state/rank-follow-ups-product-first/evidence/fs1-6-classof.txt | 1 |
| FS-7 | `node .claude/lib/followup-rank.js open --state-dir <a> --state-dir <b>` prints every open row of both ledgers, merged into one ranked list, each row carrying `class` and the `dir` of the ledger it came from; closed rows of either ledger are not printed | .trd-state/rank-follow-ups-product-first/evidence/fs7-8-cli-summary.txt | 1 |
| FS-8 | `discovered.record` keeps a valid `rankClass` on a new row: a row recorded with `rankClass: "host"` reads back with that field, and is classed `host` (a class no prefix carries) | .trd-state/rank-follow-ups-product-first/evidence/fx/a/discovered.jsonl | 1 |
| FS-9 | `file-followups` reads its open rows through the `followup-rank.js open` CLI, files them in that ranked order (product first), and records `{ summary, url, class }` for each filed row | .trd-state/rank-follow-ups-product-first/evidence/fs9-10-run-record.json | 1 |
| FS-10 | `file-followups` step 5 writes its `data.issues` row lines in rank order, each line starting with the row's class, and lists `data.unfiled` summaries in rank order | .trd-state/rank-follow-ups-product-first/evidence/fs9-10-run-record.json | 1 |
| FS-11 | `/ship-build`'s readout states the rank order and shows the class on every filed, unfiled and "recorded, not yet filed" follow-up line | .trd-state/rank-follow-ups-product-first/evidence/fs11-readout-iter2.txt | 2 |
| FS-12 | `docs/guides/ship-build.md`'s `file-followups` row says follow-up rows are filed product first | .trd-state/rank-follow-ups-product-first/evidence/fs12-guide-row-iter2.txt | 2 |

## Not Met

_None._

## Not Verifiable

_None._

