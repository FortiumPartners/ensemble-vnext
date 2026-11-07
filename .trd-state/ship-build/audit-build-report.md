VERDICT: proceed with these caveats: planned, not built yet: SHIP-T002 -- the owner's live proof on a throwaway GitHub repo, which needs the owner, a real remote, a CI, a reviewer bot and a release target, so it cannot run unattended; planned, not built yet: SHIP-D002 -- the governance edits to constitution.md, autonomy.md and stack.md, which change only after the owner approves the SHIP-D001 draft; 13 Could Not Verify claims stay unchecked (live GitHub behaviour, the reviewer bots, the Actions-started resume, the tracker CLIs, and the wording of ruling J)

# Audit report: ship-build

- Date: 2026-11-07
- Audited commit: 55b0a77b0593969c50fbb9fdf40a3a0ec5a233d0
- TRD: docs/TRD/ship-build.md
- PRD: docs/PRD/ship-build.md
- Findings: 1 · applied: 2 · rejected: 0 · still unverified: 13 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/ship-build.md    PRD: docs/PRD/ship-build.md

VERDICT: proceed with these caveats: planned, not built yet: SHIP-T002 -- the owner's live proof on a throwaway GitHub repo, which needs the owner, a real remote, a CI, a reviewer bot and a release target, so it cannot run unattended; planned, not built yet: SHIP-D002 -- the governance edits to constitution.md, autonomy.md and stack.md, which change only after the owner approves the SHIP-D001 draft; 13 Could Not Verify claims stay unchecked (live GitHub behaviour, the reviewer bots, the Actions-started resume, the tracker CLIs, and the wording of ruling J)

Scope: this was round 2, a re-audit at head 55b0a77. It covered only the round-1 defects and the files changed since dc727fd. All 5 verifiers reported, the PRD was supplied, and 67 requirements and 21 tasks were indexed. No fresh sample was taken, so this is not evidence that every requirement is built and tested.

The round-1 defect (a failed step outside a `repeat` block did not stop the run) is fixed.

TRACEABILITY GAPS (fixed in this run)
- A `release` line without `identity=` must fail to parse (AC-F14.3: a build that reports no identity fails the deploy link). The rule was in place (commit e756fcf: `packages/core/contracts/ship-primitive-release.md` declares `identity` required), but the only test of the real release contract checked parameter names, so reverting `identity` to optional would have passed every test. Covering task SHIP-B016, so this chained to `/implement-trd --reconcile` as task AMEND-008. It is now built: `packages/core/contracts/ship-primitives.test.js` asserts `identity` is required (and `env`, `command` are not), and that a bare `release env=production` fails with "release needs identity" while the same line with `identity=` parses (commit ffc3f15).

FIXED THE CITATION
- TRD section 3.2 primitive table, `release` row: it said `env=`, `command=`, `identity=` (all none), but the delivered contract makes identity required (from the end-of-run review; matches OQ-3's "the deploy link stays strict"). The row now reads "`env=`, `command=` (both none); `identity=` required". No objective, acceptance criterion or task wording changed.

PLANNED, NOT BUILT YET
- SHIP-T002, the owner's live proof: needs the owner, a real remote, a CI, a reviewer bot and a release target.
- SHIP-D002, the governance edits: wait for the owner to approve the SHIP-D001 draft.

REJECTED THESE FINDINGS
- none

NO ACTION
- The round-1 defects in scope produced no other finding. Requirements outside the re-audit scope were not re-checked.

Could Not Verify in docs/TRD/ship-build.md was rewritten for this round. All 13 rows are kept: each needs a live remote, a fixture session, a third-party service, a tracker CLI or the owner, and none falls inside the re-audit's scope.
