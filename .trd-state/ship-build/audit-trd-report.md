VERDICT: proceed with these caveats: the PRD and TRD count `repeat` rounds differently (PRD AC-F5.8 reads `rounds=2` as two passes, the TRD as two fix rounds then a final pass); two choices await the owner's confirmation (`sync-design` opening its own branch and PR, and `push` switching a default-branch sweep onto a branch); the owner has not yet reviewed the product PM's OQ-15 and OQ-22 decisions; 14 claims need live runs (the TRD's ## Could Not Verify)

# Audit report: ship-build

- Date: 2026-11-07
- Audited commit: 71b3e19
- TRD: docs/TRD/ship-build.md
- Source: docs/PRD/ship-build.md

AUDIT: docs/TRD/ship-build.md    SOURCE: docs/PRD/ship-build.md

VERDICT: proceed with these caveats: the PRD and TRD count `repeat` rounds differently (PRD AC-F5.8 reads `rounds=2` as two passes, the TRD as two fix rounds then a final pass); two choices await the owner's confirmation (`sync-design` opening its own branch and PR, and `push` switching a default-branch sweep onto a branch); the owner has not yet reviewed the product PM's OQ-15 and OQ-22 decisions; 14 claims need live runs (the TRD's ## Could Not Verify)

  REDESIGNED — could not be built as written, or broke the owner's primitive principles
  - The sequencer had the fallback string `push` built in, so it named a primitive and its own "names no primitive" test could not pass. `/ship-build` now passes the fallback (`start --fallback`) (D2, §3.1, SHIP-B015).
  - `repeat` defaulted to `until=clean`, a result only `collect-findings` has. Contracts now declare `repeat-until:`, so a bare `repeat` still works (D3, D40, D41).
  - Order rules (`needs:`) named other primitives, so adding a second PR-opener or merger meant editing other contracts. They now name data keys an earlier step provides (`head`, `pr`, `findings`, `merged`) (D5, D41, §3.2). `push`'s sweep-branch check reads those keys rather than looking for `open-pr` (D31).
  - `/ship-build`'s loop special-cased `await-approval`, `merge` and the findings primitives. It now reads generic result fields (`data.issues`, `remoteResume`) and the PR's merged state (D35, D38, §3.7).
  - A new primitive no longer needs a test or setup-skill edit: the name guard and `ship-primitives.test.js` read names from the directory, and `/ship-setup` asks each contract's declared parameters plus an optional `## Setup` section (D34, D41, SHIP-B014, SHIP-B015, SHIP-B016).
  - `next` no longer passes `pass` and `shipped`, which no contract read.
  - "The current head" now means the last pushed head, so CI and review never wait on a commit nobody can see (§3.2). `release` needs a pushed head, and the custody check fails when there is no anchor (D5, D12).

  PICK ONE — these contradict
  - Round counting: kept the TRD's reading (two fix rounds, then a final pass, as in PRD 2.1.0). PRD AC-F5.8 and its glossary need `/refine-prd` to match.

  CONFIRM THESE ARE WANTED
  - D43 (c): `sync-design` opens its own `design-sync/` branch and PR, because `push` and `open-pr` would check the wrong branch's custody.

  ADDED BACK
  - `merge` restored to J-5's common string, matching PRD J-5. The AC-F1.1, AC-F2.2 and AC-F3.6 rows now say the template ships with no active step.

  FIXED THE CITATION
  - OQ-15 (old sweep-ledger rows are not filed) and OQ-22 (the template ships with no active step) are now credited to the product PM, acting on the owner's behalf and pending the owner's review, in both documents. The PRD is now 2.2.1 and the TRD cites it. Bare `ship-build.md` paths are now written in full.

  CORRECTED A STALE CLAIM
  - D12 and D42 said only `push` publishes `HEAD`, but `pull-request.js` line 109 also pushes. The TRD now says a commit made between `push` and `open-pr` fails the push check loudly.

  CAVEAT — 14 claims left unchecked (see the TRD's ## Could Not Verify); all 5 verifiers reported, plus one owner-principle review.

  REJECTED THESE FINDINGS
  - "J-1's index lists close-issue, run, sync-design": the finding was about the verifier's own index, and the TRD's J-1 row is correct.
  - "D23 must name exactly one environment": refuted by docs/PRD/ship-build.md AC-F4.2 and F4 example 5 (`release` with no `env=`).
  - "SHIP-D003's router hint breaks the byte ceiling": refuted by SHIP-D003's grounding and packages/router/hooks/router.py line 84 (`/task`'s precedent).

  NO ACTION — the remaining objectives are sourced. The common string (open PR, outside reviewer plus CI, fix until clean, merge, release) is ordinary primitives in `ship.md`: merge is not gated on CI, and the reviewer is a parameter. TRD is now 2.2.0 and parses to 14 tasks with no warnings.
