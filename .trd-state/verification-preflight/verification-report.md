# Functional Verification Report: verification-preflight

**Source PRD**: docs/plan/verification-preflight.investigation.md
**Success definition**: .trd-state/verification-preflight/success-definition.md
**Outcome**: Unbuilt (no full-environment run declared)
**Reason**: 20 of 21 criteria are met. One must-pass criterion (FS-8, detecting a checkout that holds a declared non-port resource) is unbuilt: the port half works, the resource half does not exist, so the loop stopped rather than debug missing code.
**Criteria**: 21 total — 20 met, 0 not met, 0 not verifiable, 1 unbuilt
**Coverage**: 20 of 21 proven — uncovered: FS-8
**Must pass**: 13 of 14 proven — unproven: FS-8 (unbuilt)
**Diagnosis**: 1 open — 1 not built
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Unbuilt

Implementation did not deliver these criteria. The loop stopped rather than debugging absent code (D14).

| ID | Statement | Reason |
|----|-----------|--------|
| FS-8 | The setup check reports an environment as held by another checkout when a process listening on a declared port, or holding a declared resource, has a working directory outside this checkout; a process whose working directory is inside this checkout is not reported as held | The Debug stage reported this as unbuilt: the setup check decides 'held by another checkout' only from processes listening on declared ports. Nothing detects a process holding a declared non-port resource, because the setup targets carry ports and no resource field. The port half works (iteration 1: a listener outside the checkout was reported held, naming its directory; one inside was not). |

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | When an environment needs something from the owner (an expired credential, a deploy approval, a service to start by hand), `/implement-trd`'s pre-phase environment check asks no question: no `AskUserQuestion` is issued and the phase loop starts without waiting | .trd-state/verification-preflight/evidence/fs1-3-implement-trd-3.6a.txt | 1 |
| FS-2 | `/verify-build`'s environment step, reached as its own entry point, asks no question of the owner for an environment that needs one; it records the environment and proceeds | .trd-state/verification-preflight/evidence/fs2-verify-build-step2.txt | 1 |
| FS-3 | An environment that needs the owner is recorded with the status `needs-owner`, the reason it needs the owner, and the default applied — criteria needing that environment resolve `not_verifiable` | .trd-state/verification-preflight/evidence/fs1-3-implement-trd-3.6a.txt | 1 |
| FS-4 | The command's readout ISSUES section names each environment recorded `needs-owner` and says what the owner must do for it | .trd-state/verification-preflight/evidence/fs1-3-implement-trd-3.6a.txt | 1 |
| FS-5 | No environment or setup check added or changed by this work calls `AskUserQuestion`, ends a run STUCK, or withholds the build; each records a status and a default instead | .trd-state/verification-preflight/evidence/fs1-2-askuserquestion-grep.txt | 1 |
| FS-6 | Each verification iteration begins with a setup check that runs before Exercise and reports, for every environment that iteration will touch, three facts: whether it is reachable, whether its running build matches HEAD, and whether another checkout holds it | .trd-state/verification-preflight/evidence/fs6-7-jest-setup.txt | 1 |
| FS-7 | "Matches HEAD" is decided only by the build-identity method the project declares in `verification.md`; when the project declares none, the result is `unknown`, which is recorded as a flag and does not by itself produce a setup failure | .trd-state/verification-preflight/evidence/fs7-decidesetup-unknown.json | 1 |
| FS-9 | When the setup check fails, the loop runs the environment's declared fast refresh (`verification.md` §2) exactly once and then re-checks; it does not refresh a second time | .trd-state/verification-preflight/evidence/exerciser1-jest-workflow-setup.txt | 1 |
| FS-10 | When the re-check still fails, that attempt is recorded as a setup failure and neither Judge nor Debug runs for it: no criterion is judged from that attempt and nothing is sent to the debugger | .trd-state/verification-preflight/evidence/exerciser1-jest-workflow-setup.txt | 1 |
| FS-11 | A setup-failure attempt never counts toward `stalled`: the loop's decision, given a history that includes setup-failure attempts, never returns `stalled` on account of them | .trd-state/verification-preflight/evidence/exerciser1-decide-next-setup-failure.txt | 1 |
| FS-12 | A setup failure ends the verification run with the outcome `setup-failure` rather than skipping one iteration and continuing, and that outcome is returned instead of `stalled` or `stuck` — including when the failing attempt is the last one the iteration cap allows | .trd-state/verification-preflight/evidence/exerciser1-decide-next-setup-failure.txt | 1 |
| FS-13 | The verification report for a `setup-failure` run names what is wrong with the environment (for example: unreachable, running build not HEAD, held by another checkout at a named path) and what would fix it | .trd-state/verification-preflight/evidence/exerciser1-render-setup-failure.txt | 1 |
| FS-14 | `setup-failure` is a distinct outcome beside satisfied, stalled, stuck, unbuilt, insufficient-coverage and must-pass-unproven, with its own label, and it is rendered wherever outcomes are rendered; its rendering says the environment, not the code, is at fault | .trd-state/verification-preflight/evidence/exerciser1-render-setup-failure.txt | 1 |
| FS-15 | When verification ends `setup-failure` inside `/implement-trd`, every phase is still built, the build is not stopped or retried, and the command's final banner reports the verification outcome `setup-failure` with the named problem | .trd-state/verification-preflight/evidence/exercise-1-fs15-implement-trd-banner.txt | 1 |
| FS-16 | `/verify-build`'s outcome rendering and closing readout recognise `setup-failure` and present it as an environment problem rather than a code problem | .trd-state/verification-preflight/evidence/exercise-1-fs16-verify-build.txt | 1 |
| FS-17 | `/refine-verification` treats a `setup-failure` run as an environment problem, not a code gap, and nothing in the fix path promotes a setup failure to a fix task | .trd-state/verification-preflight/evidence/exercise-1-fs17-refine-verification.txt | 1 |
| FS-18 | The light TRD template in `/plan` contains a `## Verification Environment` section that records the environment verification runs against, whether the loop can refresh it and with what command, and what cannot be checked there | .trd-state/verification-preflight/evidence/exercise-1-fs18-19-template-and-contract.txt | 1 |
| FS-19 | The TRD authoring contract contains the same `## Verification Environment` section with the same three items | .trd-state/verification-preflight/evidence/exercise-1-fs18-19-template-and-contract.txt | 1 |
| FS-20 | A TRD with no `## Verification Environment` section is valid: its absence is reported, and nothing fails or stops because of it | .trd-state/verification-preflight/evidence/exercise-1-fs20-21-reading-step.txt | 1 |
| FS-21 | When a TRD has a `## Verification Environment` section, `/implement-trd`'s pre-phase environment check reads it as that feature's declared verification target | .trd-state/verification-preflight/evidence/exercise-1-fs20-21-reading-step.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

