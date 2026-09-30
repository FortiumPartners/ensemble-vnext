# Functional Verification Report: refine-verification

**Source PRD**: docs/TRD/refine-verification.md#Intended Change
**Success definition**: .trd-state/refine-verification/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 18 total — 18 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 18 of 18 proven — uncovered: none
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | /refine-verification exists as a command taking an optional feature-or-TRD argument and an optional --auto flag | .trd-state/refine-verification/evidence/FS-1.txt | 1 |
| FS-2 | /refine-verification holds the planning rules and writes the plan /verify-build then uses without being told a path | .trd-state/refine-verification/evidence/FS-2.txt | 1 |
| FS-3 | Interactive mode asks exactly one AskUserQuestion per open item, none for items not open | .trd-state/refine-verification/evidence/FS-3.txt | 1 |
| FS-4 | Each interactive question shows what the check saw, the attempts so far, and the cause | .trd-state/refine-verification/evidence/FS-4.txt | 1 |
| FS-5 | --auto hands every open item to a product-manager subagent and asks the owner nothing | .trd-state/refine-verification/evidence/FS-5.txt | 1 |
| FS-6 | In --auto mode every answer in the plan is marked exactly one of answered, default or OWNER-CALL | .trd-state/refine-verification/evidence/FS-6.txt | 1 |
| FS-7 | In both modes the readout opens with every ruling made | .trd-state/refine-verification/evidence/FS-7.txt | 1 |
| FS-8 | With a plan, /verify-build with no flags builds from the plan and re-verifies | .trd-state/refine-verification/evidence/FS-8.txt | 1 |
| FS-9 | /verify-build --no-fix only verifies, building nothing even with a plan present | .trd-state/refine-verification/evidence/FS-9.txt | 1 |
| FS-10 | With no plan, /verify-build verifies once, builds nothing, and names /refine-verification as NEXT | .trd-state/refine-verification/evidence/FS-10.txt | 1 |
| FS-11 | /verify-build --fix <plan-path> is accepted and uses the plan it names | .trd-state/refine-verification/evidence/FS-11.txt | 1 |
| FS-12 | When /verify-build's outcome is satisfied, its readout NEXT is /audit-build | .trd-state/refine-verification/evidence/FS-12.txt | 1 |
| FS-13 | For stalled, stuck, unbuilt and insufficient-coverage, /verify-build's NEXT is /refine-verification then /verify-build | .trd-state/refine-verification/evidence/FS-13.txt | 1 |
| FS-14 | When /implement-trd's verification outcome is satisfied, its readout NEXT is /audit-build | .trd-state/refine-verification/evidence/FS-14.txt | 1 |
| FS-15 | For stalled, stuck, unbuilt and insufficient-coverage, /implement-trd's NEXT is /refine-verification then /verify-build | .trd-state/refine-verification/evidence/FS-15.txt | 1 |
| FS-16 | The verification report's Next line follows the same rule for all five outcomes and no longer names verify-plan-recovery | .trd-state/refine-verification/evidence/FS-16.txt | 1 |
| FS-17 | The verify-plan-recovery skill is deleted and nothing shipped still sends the owner to it | .trd-state/refine-verification/evidence/FS-17.txt | 2 |
| FS-18 | /rebase-project removes verify-plan-recovery from a consuming project via a retired-skills list, and removes only skills that list names | .trd-state/refine-verification/evidence/FS-18.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

