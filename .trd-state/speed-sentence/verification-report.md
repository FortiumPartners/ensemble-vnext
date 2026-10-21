# Functional Verification Report: speed-sentence

**Source PRD**: docs/TRD/speed-sentence.md ## Intended Change
**Success definition**: .trd-state/speed-sentence/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 10 total — 10 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 10 of 10 proven — uncovered: none
**Must pass**: 9 of 9 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | In the after-side build the replay measured, every prompt the source names by reference to O1 (each implementer task prompt, the phase-gate verify-app prompt, each sweep fix prompt, and the mechanical stages: verify-functional's render and reconcile, create-trd's grounding merge) ends with THE SENTENCE, word for word, as its last line | .trd-state/speed-sentence/evidence/iter1-fs12-after-side-grep.txt | 1 |
| FS-2 | In the after-side build the replay measured, THE SENTENCE appears at no dispatch site other than those FS-1 covers — in particular no audit verifier, judge, exercise, debug, triage or authoring prompt carries it | .trd-state/speed-sentence/evidence/iter1-fs12-after-side-grep.txt | 1 |
| FS-3 | The current tree matches the replay's verdict: if the verdict is keep, THE SENTENCE is back at the FS-1 sites and nowhere else; if the verdict is remove or no measurable difference, a grep for "Time matters" over packages/ and .claude/ prints nothing | .trd-state/speed-sentence/evidence/iter1-fs3-head-grep.txt | 1 |
| FS-4 | The replay ran the ten-task fixture four times, two runs per side, in the order before, after, before, after; the before side ran a build with no "Time matters" text in packages/ or .claude/, and the after side ran the separate after-side build | .trd-state/speed-sentence/evidence/iter1-fs4-run-record.txt | 1 |
| FS-5 | The replay result reports the median, over all 20 matched implementer pairs, of the per-task change in implementer time, and states whether that median fell by more than 20% | .trd-state/speed-sentence/evidence/iter1-fs5-table.txt | 1 |
| FS-6 | The replay result reports the median, over all 6 matched gate pairs, of the per-phase change in verify-app gate time, and states whether that median fell by more than 20% | .trd-state/speed-sentence/evidence/replay-fs6-gate-median.txt | 1 |
| FS-7 | For each of the two after-runs, the replay result reports its failed tasks, retries and tasks reopened by reconcile beside the same three counts for its paired before-run, and says whether the after-run has more of any of them | .trd-state/speed-sentence/evidence/replay-fs7-counts.txt | 1 |
| FS-8 | Each of the two after-runs has an /audit-build report, and the replay result compares its gaps against the baseline /audit-build report on before-run 1, naming any gap the after-run's audit reports that the baseline did not | .trd-state/speed-sentence/evidence/replay-fs8-audits.txt | 1 |
| FS-9 | The replay result's verdict follows the source's rule: keep only when both medians fell by more than 20% and no after-run added a count or a gap; otherwise it names which case it was | .trd-state/speed-sentence/evidence/replay-fs9-verdict.txt | 1 |
| FS-10 | The first measurement is recorded as done, over 5 runs of the same fixed task before and 5 after, with the verdict "no measurable difference", and the sentence was removed from the tree after it | .trd-state/speed-sentence/evidence/replay-fs10-first-measurement.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

