# Functional Verification Report: verification-must-pass

**Source PRD**: docs/TRD/verification-must-pass.md ## Intended Change
**Success definition**: .trd-state/verification-must-pass/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 13 total — 13 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 13 of 13 proven — uncovered: none
**Must pass**: 3 of 3 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | A TRD's Objectives table can mark an individual objective must-pass, and the framework reads that marking: given a TRD with one objective marked must-pass and one unmarked, the must-pass one is recognised as must-pass and the unmarked one as ordinary | .trd-state/verification-must-pass/evidence/FS-1.txt | 1 |
| FS-2 | A success definition that carries no must-pass marking at all — the pre-change seven-column format — still parses, and a run over it whose criteria are all `met` or `not_verifiable` still ends `satisfied`, exactly as before this change | .trd-state/verification-must-pass/evidence/FS-2.txt | 1 |
| FS-3 | The success definition records, per criterion, whether that criterion is must-pass | .trd-state/verification-must-pass/evidence/FS-3.txt | 1 |
| FS-4 | Every must-pass objective in the TRD is covered by at least one must-pass criterion in the success definition | .trd-state/verification-must-pass/evidence/FS-4.txt | 1 |
| FS-5 | A must-pass objective that no criterion covers is reported by name, not silently dropped | .trd-state/verification-must-pass/evidence/FS-5.txt | 1 |
| FS-6 | The decisive case: a definition whose must-pass criterion is `not_verifiable` while every other criterion is `met` does not end `satisfied` | .trd-state/verification-must-pass/evidence/FS-6.txt | 1 |
| FS-7 | When a run is blocked only by unproven must-pass criteria, it ends with a distinct outcome — not `satisfied`, `unbuilt`, `stalled`, `stuck` or `insufficient-coverage` — and that outcome's reason names every unproven must-pass criterion by ID | .trd-state/verification-must-pass/evidence/FS-7.txt | 1 |
| FS-8 | The coverage floor still applies, separately, over all criteria: with every must-pass criterion `met`, a run whose overall proven share of all criteria is below the declared floor still ends `insufficient-coverage`, with the ratio computed over the whole definition | .trd-state/verification-must-pass/evidence/FS-8.txt | 1 |
| FS-9 | The must-pass block is enforced deterministically by the verification workflow after the Judge returns: if the Judge's own return says `exit-satisfied` while a must-pass criterion in its criteria list is not `met`, the workflow's final outcome is still not `satisfied` | .trd-state/verification-must-pass/evidence/FS-9.txt | 1 |
| FS-10 | The `/implement-trd` readout names each unproven must-pass criterion when a run ends with the new outcome | .trd-state/verification-must-pass/evidence/FS-10.txt | 1 |
| FS-11 | The `/verify-build` readout names each unproven must-pass criterion when a run ends with the new outcome | .trd-state/verification-must-pass/evidence/FS-11.txt | 1 |
| FS-12 | The rendered verification report names each unproven must-pass criterion when the outcome is the new one | .trd-state/verification-must-pass/evidence/FS-12.txt | 1 |
| FS-13 | NEXT routes the new outcome exactly as it routes the other non-satisfied outcomes — `/refine-verification`, then `/verify-build` — in the `/implement-trd` and `/verify-build` readouts and in the report's own Next line | .trd-state/verification-must-pass/evidence/FS-13.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

