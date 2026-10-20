# Functional Verification Report: speed-sentence

**Source PRD**: docs/TRD/speed-sentence.md ## Intended Change
**Success definition**: .trd-state/speed-sentence/success-definition.md
**Outcome**: Unbuilt (no full-environment run declared)
**Reason**: 11 of 12 criteria proven; FS-10 (per-after-run failure/retry/reopen counts and audit gaps against the baseline audit) is unbuilt: after-runs 2-5 were never audited and no reconcile output was captured.
**Criteria**: 12 total — 11 met, 0 not met, 0 not verifiable, 1 unbuilt
**Coverage**: 11 of 12 proven — uncovered: FS-10
**Must pass**: 11 of 12 proven — unproven: FS-10 (unbuilt)
**Diagnosis**: 1 open — 1 not built
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Unbuilt

Implementation did not deliver these criteria. The loop stopped rather than debugging absent code (D14).

| ID | Statement | Reason |
|----|-----------|--------|
| FS-10 | For every after-run, the measurement record gives its count of failed tasks, retries and tasks reopened by reconcile. It also gives the gaps `/audit-build` reported, set against the gaps the baseline audit reported, so that any gap the baseline did not have is visible | The measurement record has no per-after-run /audit-build result: only after-run 1 was audited, after-runs 2-5 have none, and the reopened-by-reconcile count was never read from a reconcile output (the runs used --no-verify). The Debug stage reported this as missing capability, not broken behaviour, and producing it would mean re-running four after-runs with audits. |

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | At the measured commit, every implementer task prompt (the prompt each implementer receives for one TRD task) ends with the sentence, word for word | .trd-state/speed-sentence/evidence/prompt-tails-34b7ae7.txt | 1 |
| FS-2 | At the measured commit, the phase-gate `verify-app` prompt ends with the sentence, word for word | .trd-state/speed-sentence/evidence/prompt-tails-34b7ae7.txt | 1 |
| FS-3 | At the measured commit, every sweep fix prompt (the prompt `/sweep` gives each agent that fixes one issue) ends with the sentence, word for word | .trd-state/speed-sentence/evidence/prompt-tails-34b7ae7.txt | 1 |
| FS-4 | At the measured commit, verify-functional's render stage prompt ends with the sentence, word for word | .trd-state/speed-sentence/evidence/prompt-tails-34b7ae7.txt | 1 |
| FS-5 | At the measured commit, verify-functional's reconcile stage prompt ends with the sentence, word for word | .trd-state/speed-sentence/evidence/prompt-tails-34b7ae7.txt | 1 |
| FS-6 | At the measured commit, create-trd's grounding merge prompt ends with the sentence, word for word | .trd-state/speed-sentence/evidence/prompt-tails-34b7ae7.txt | 1 |
| FS-7 | No prompt outside the sites in FS-1 to FS-6 carries the sentence, at the measured commit or in the current tree. In particular, no audit verifier, judge, exercise, debug, triage or authoring prompt carries it. Hits in files that are not prompts (tests asserting the sentence, changelog, docs) do not count against this | .trd-state/speed-sentence/evidence/grep-measured-and-before.txt | 1 |
| FS-8 | The before-runs measured the system without the sentence: at the commit they ran on, the grep for "Time matters" over `packages/` and `.claude/` finds no prompt carrying it | .trd-state/speed-sentence/evidence/grep-measured-and-before.txt | 1 |
| FS-9 | A measurement record exists for one fixed task, run 5 times before the change and 5 times after it. For each run it gives the implementer task time and the `verify-app` gate time, and for each set of 5 it gives the median of both. It names the fixed task once, and names the commit each set ran on | .trd-state/speed-sentence/evidence/measurement-rederived-iter2.txt | 2 |
| FS-11 | The record's verdict follows the source's rule, applied to its own figures. It records success only when both medians fell by more than 20% **and** every after-run has 0 failed tasks, 0 retries, 0 reconcile reopenings and no audit gap the baseline did not have. Where time fell but any of those counts is non-zero, the verdict is failure with removal of the sentence. The source does not say what follows when the counts are all zero but time did not fall by more than 20%. In that case this row requires only that the verdict does not claim success | .trd-state/speed-sentence/evidence/verdict-iter2.txt | 2 |
| FS-12 | The current tree matches the verdict. If the verdict removes the sentence, no prompt in `packages/` or `.claude/` carries it. If the verdict keeps it, it is still at the end of each site in FS-1 to FS-6 | .trd-state/speed-sentence/evidence/grep-current.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

