# Functional Verification Report: reproof-retry

**Source PRD**: docs/TRD/reproof-retry.md § Intended Change
**Success definition**: .trd-state/reproof-retry/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 16 total — 16 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 16 of 16 proven — uncovered: none
**Must pass**: 8 of 8 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `node .claude/lib/functional-verification.js reproof-retry-set <state file>`, given a re-proof state file in which some criteria are not `met`, prints `{"retry": [...]}` listing exactly the ids whose status is not `met`, and no `met` id | .trd-state/reproof-retry/evidence/retry-set-mixed.txt | 1 |
| FS-2 | `reproof-retry-set` prints an empty list (`{"retry": []}`) both when every criterion is `met` and when no state file exists at the given path | .trd-state/reproof-retry/evidence/retry-set-empty.txt | 1 |
| FS-3 | In `verify-build.md`'s `--criteria` section, the workflow is dispatched a second time only when the retry list is non-empty, exactly once (no third dispatch), and the run reports as today when the list is empty; no path other than `--criteria` gains a retry | .trd-state/reproof-retry/evidence/verify-build-criteria-section.txt | 1 |
| FS-4 | The retry dispatch writes into its own folder `.trd-state/<feature>/reverify/retry/`: its `statePath`, `reportPath`, `evidenceDir` and `pagesDir` are all under that folder, so it shares no state, report, evidence or iteration-1 scratch file with the first run | .trd-state/reproof-retry/evidence/retry-dispatch-args.txt | 1 |
| FS-5 | The retry dispatch passes the same 26 fields as the first dispatch except four: `criteria` is the retry set, `mustPassIds` is restricted to the retry set, `resume` is `null`, and `since` is recomputed as the later of HEAD's commit time and the retry's own start, so evidence left by the first run cannot pass as fresh | .trd-state/reproof-retry/evidence/retry-dispatch-fields.txt | 1 |
| FS-6 | The retry runs with `cap: 1` and under `--no-fix`: it has no Debug stage, makes no code edit and runs no build | .trd-state/reproof-retry/evidence/retry-dispatch-nofix.txt | 1 |
| FS-7 | `node .claude/lib/functional-verification.js merge-reproof-retry --first <first state> --second <retry state>` writes the merged state back to the `--first` path, holding every first-run criterion in first-run order, with each retried criterion replaced by its second-run entry and marked `retried: true`, and non-retried criteria left as the first run had them | .trd-state/reproof-retry/evidence/merge-after.json | 1 |
| FS-8 | After the merge, the outcome is `satisfied` when every criterion is `met` | .trd-state/reproof-retry/evidence/merge-all-met.txt | 1 |
| FS-9 | When any criterion is still not `met` after the merge, the merged outcome is the retry's outcome; when the retry wrote no state file, it is the first run's outcome | .trd-state/reproof-retry/evidence/merge-not-all-met.txt | 1 |
| FS-10 | The merged file keeps exactly the workflow's four keys (`iteration`, `criteria`, `gapsClosed`, `outcome`) and adds one key, `retried`, holding the list of retried ids; the command prints `{outcome, met, total, retried}` | .trd-state/reproof-retry/evidence/merge-shape.txt | 1 |
| FS-11 | The merge writes the file through `implement-state.js`'s `save()`, not a direct file write | .trd-state/reproof-retry/evidence/merge-save-call.txt | 1 |
| FS-12 | The re-proof's RETURN line reports the merged counts (met of total after the retry), not the first run's | .trd-state/reproof-retry/evidence/return-line.txt | 1 |
| FS-13 | `reverify/verification-report.md` stays the first run's report, `reverify/retry/verification-report.md` is the retry's, and the command names the merged state file, not either report, as the record | .trd-state/reproof-retry/evidence/report-paths.txt | 1 |
| FS-14 | A criterion that is `met` only on the retry passes the custody gate: `node .claude/lib/custody.js reconcile --reverified <merged state>` does not return `refused` for a merged file whose criteria are all `met`, including one carrying `retried: true` | .trd-state/reproof-retry/evidence/custody-pass-after-retry.txt | 1 |
| FS-15 | A criterion still not `met` after the retry ends the ship as today: `custody.js reconcile --reverified <merged state>` returns `refused` for a merged file holding any non-`met` criterion | .trd-state/reproof-retry/evidence/custody-refused-after-retry.txt | 1 |
| FS-16 | The custody gate's contract gains one sentence saying the re-proof state file holds the merged result after the one retry and that `retried` marks a criterion re-judged on the second try; the gate's described behaviour is otherwise unchanged | .trd-state/reproof-retry/evidence/custody-contract-sentence.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

