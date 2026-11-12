VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; untested: a ref write's commit message (O4); untested: `branch` is null on a detached HEAD (O3); Forge-side contract citations unverified from this repo; Claude Code Web push/fetch of the ref unverifiable here

# Audit report: records-ref-library

- Date: 2026-11-12
- Audited commit: 64e9466297682995fa1531754baad46a8beaa870
- TRD: docs/TRD/records-ref-library.md
- PRD: none
- Findings: 6 · applied: 2 · rejected: 1 · still unverified: 5 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/records-ref-library.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; untested: a ref write's commit message (O4); untested: `branch` is null on a detached HEAD (O3); Forge-side contract citations unverified from this repo; Claude Code Web push/fetch of the ref unverifiable here

Coverage: 5 of 5 verifiers reported; 13 requirements and 3 tasks indexed. No PRD was supplied (the source is the roadmap item 1 brief), so the code was checked against the TRD only. Whether it meets the product requirements was not checked.

TRACEABILITY GAPS — implemented, but no test proves it
- Commit message naming the command and step (O4). `packages/core/lib/record-ref.js:628` builds `records(<slug>): <command> - <step>`, and line 460 passes it to commit-tree. No assertion in `record-ref.test.js` reads a ref commit's message. Task FIX-002 (`record-ref.test.js`) covers it, so this goes to /implement-trd --reconcile.
- `branch` is null when HEAD is detached (O3). `currentBranch()` at `record-ref.js:129-132` uses `git symbolic-ref -q`, which fails on a detached HEAD, so the code is correct. No test detaches HEAD. Task FIX-002 covers it, so this goes to /implement-trd --reconcile.

FIXED THE CITATION
- FIX-001 grounding cited `ship-record-dir.js:35-38` for the env scrub. Those lines are the directory-walk loop. The env copy and the three `delete` lines are at 39-42, so the TRD now says 39-42.

REJECTED THESE FINDINGS
- "Test (c) is skipped under root, so the unwritable-objects failure path is unproven" (FIX-002). The skip at `record-ref.test.js:17,505` only applies when the process runs as root, and root ignores chmod anyway. Every place this suite runs uses a non-root user: locally the `tg` user, and in CI `.github/workflows/ci.yml` uses `ubuntu-latest` with no container, so tests run as `runner`. The test runs and can fail in both places.

NOT CHECKED, RECORDED IN THE TRD
- The Forge repository citations (`records-ref.ts` lines 19, 82, 270-291, `src/f3/pm/artifacts.ts`, reader TRD D3, D5, O12, O13) live in another repo. They are now an entry in Could Not Verify, not a defect.
- No PRD: now an entry in Could Not Verify, and also the first verdict caveat.

NO ACTION — the remaining 11 indexed requirements are implemented, tested and sourced.

Could Not Verify (docs/TRD/records-ref-library.md) rewritten with 5 entries:
- the missing PRD
- the unverified Forge-side citations
- Claude Code Web push/fetch of `refs/ensemble/*`
- the single non-fast-forward retry window
- writers on two machines
The note about the adversarial review stays. No other heading was touched.