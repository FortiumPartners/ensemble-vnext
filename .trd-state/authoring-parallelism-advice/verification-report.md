# Functional Verification Report: authoring-parallelism-advice

**Source PRD**: docs/TRD/authoring-parallelism-advice.md (## Intended Change)
**Success definition**: .trd-state/authoring-parallelism-advice/success-definition.md
**Outcome**: Satisfied
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 6 total — 3 met, 0 not met, 3 not verifiable, 0 unbuilt

## Met

| ID | Statement | Artifact |
|----|-----------|----------|
| FS-1 | On a plan whose average wave width is under 2, the readout states which edge kind dominates the graph — declared dependencies vs file conflicts — rather than assuming one. | .trd-state/authoring-parallelism-advice/evidence/FS1-FS3-autonomy-judge-command-scope.txt |
| FS-2 | The readout no longer presents shared files as the explanation for a low average width when file conflicts are not what set the depth; the shared-files list appears only when file conflicts do dominate. | .trd-state/authoring-parallelism-advice/evidence/FS2-synthetic-file-dominated.txt |
| FS-3 | The readout prints the chain that sets the depth — the longest dependency path through the plan. | .trd-state/authoring-parallelism-advice/evidence/FS1-FS3-autonomy-judge-command-scope.txt |

## Not Met

_None._

## Not Verifiable

| ID | Statement | Reason |
|----|-----------|--------|
| FS-4 | The readout lists the declared dependencies grounding could not justify, and for each one says whether it lies on the depth-setting chain. | This half of the readout is fed by grounding's per-dependency justification verdicts, which exist only inside a live /create-trd pipeline run (roughly 20 minutes, and it needs a source PRD to run against). Nothing in this environment can produce that input, so the criterion is unverifiable here rather than failing — no evidence shows the behaviour broken. |
| FS-5 | The readout lists the tasks sizing expects to run long, and for each one a proposed split. | Same shape as FS-4: the long-task estimates and their proposed splits come from the sizing stage of a live /create-trd run and have no offline source. Not exercisable in this pass; nothing shows it broken. |
| FS-6 | The two judgments are advisory: the TRD is still written, the run does not rewrite the plan it just advised on, and it asks the owner no question. | Proving this needs a whole /create-trd run to observe: a TRD file that exists afterwards, byte-identical before and after the advice is emitted, and no AskUserQuestion anywhere in the run. All three observations are properties of the live run, not of anything runnable here. |

