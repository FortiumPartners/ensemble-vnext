# Functional Verification Report: targeted-inner-loop-by-shared-cause

**Source PRD**: docs/plan/targeted-inner-loop-by-shared-cause.investigation.md
**Success definition**: .trd-state/targeted-inner-loop-by-shared-cause/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 24 total — 24 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 24 of 24 proven — uncovered: none
**Must pass**: 16 of 16 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | After a Debug pass, the next iteration's Exercise pass is dispatched only for the representative criterion of each cause that Debug pass addressed; no other open build-defect criterion appears in that iteration's Exercise dispatch | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-2 | In an iteration after a Debug pass, an open criterion that was not dispatched to Exercise is not re-judged: it reaches the Judge as "open, not re-checked this iteration" and its status and cause in verification-state.json are unchanged from the previous iteration | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-3 | An evidence-gap re-capture that F-1 already schedules is still dispatched in an iteration after a Debug pass, alongside the addressed causes' representatives | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-4 | The first iteration of every invocation (a fresh run, a resume, a /verify-build fix round) exercises the whole open set; targeting applies only after a Debug pass within the same invocation | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-5 | The Judge returns a cause key on every build-defect criterion it rules, and criteria the Judge rules to share a root cause carry the same key and are grouped by the workflow into one cause | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-6 | A build-defect criterion returned by the Judge with a missing or malformed cause key becomes its own cause, keyed criterion:<id>, and the substitution is logged | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-7 | verification-state.json records every cause with its key, its members and its representative (a top-level causes key), and each build-defect criterion's entry carries its causeKey | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-8 | verification-report.md shows a Causes section listing each cause's key, members and representative | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/lib-verbose.txt | 1 |
| FS-9 | Each cause's representative is chosen deterministically: the first member in success-definition order that is not check-derived, or, if every member is check-derived, the first member; the choice is the same on every iteration for the same membership | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-10 | A check-derived criterion (derivation: check:<skill>) is exercised in an iteration after a Debug pass only when it is its cause's representative, which happens only when every member of its cause is check-derived | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-11 | Debug receives one gap per open cause, carrying the representative's evidence plus the members' functional statements, rather than one gap per criterion | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-13 | A cause with many members (for example 20 criteria) is re-checked in the inner loop through exactly one representative: in an iteration after Debug addressed it, exactly one of its members is dispatched to Exercise | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-14 | When a cause's representative is judged met, the cause closes and its other members are marked awaiting: "regression"; they are not dispatched to Exercise or re-judged in any later inner-loop iteration | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-15 | Members awaiting the regression pass are excluded from the gaps the next-step decision counts, so a closed cause's other members do not hold the loop open to the iteration cap | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/lib-verbose.txt | 1 |
| FS-16 | When a representative is judged failing under a different (validated) cause key, its old cause closes, that cause's other members are marked awaiting the regression pass, and the representative becomes a member of the new cause | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-17 | When the loop reaches an exit other than exit-unbuilt or exit-setup-failure and members are awaiting the regression pass, the workflow runs exactly one Exercise and Judge pass over only those members, outside the iteration cap, with no Debug after it; criteria already met are not re-checked in it | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-18 | An awaiting member judged still failing in the exit confirmation pass keeps the run from ending satisfied, and that pass's next-step decision is made with the cap set to the current iteration so it can never return remediate | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-19 | Members of a cause the last Debug pass did not address stay open and untouched: neither the representative nor any other member is dispatched to Exercise or re-judged in the next iteration, and each keeps its last verdict | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-20 | Debug may return a pre-check (command, exitCode) per cause; a failing pre-check (non-zero exit code) marks the cause not addressed, so its representative is not re-captured that iteration | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-21 | A passing pre-check never settles a criterion met: the representative is still re-captured and judged, the pre-check reaches Exercise only as a hint, and the Judge's prompt never contains it | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-22 | The next-step decision counts closed causes as well as closed criteria: it reports the causes closed since the previous iteration, and it returns stalled only when neither a criterion nor a cause closed | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/lib-verbose.txt | 1 |
| FS-23 | When the Judge returns exit-stalled but the script's own cause map shows a cause closed that iteration, the script overrides the stall and the loop continues | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-24 | The inner loop stays bounded by the existing iteration cap: no targeted iteration runs beyond it, and the exit confirmation pass adds no inner-loop round | .trd-state/targeted-inner-loop-by-shared-cause/evidence/run/workflow-verbose.txt | 1 |
| FS-25 | A headless run in the fixtures environment, seeded with two causes spread over at least six criteria with one cause fixed and one not, produces a verification-state.json whose second iteration's exercised entry lists only the fixed cause's representative; the state file also carries the exercised history and the causes record, and a resume built from that state file still reads only iteration, criteria and gapsClosed | .trd-state/targeted-inner-loop-by-shared-cause/evidence/FS-25-recapture.txt | 2 |

## Not Met

_None._

## Not Verifiable

_None._

