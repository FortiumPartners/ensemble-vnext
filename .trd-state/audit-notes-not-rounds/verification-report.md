# Functional Verification Report: audit-notes-not-rounds

**Source PRD**: docs/TRD/audit-notes-not-rounds.md § Intended Change
**Success definition**: .trd-state/audit-notes-not-rounds/success-definition.md
**Outcome**: Must-Pass Unproven (no full-environment run declared)
**Reason**: must-pass criteria not proven: FS-10, FS-11, FS-13, FS-14, FS-17 — the core was not shown to work
**Criteria**: 17 total — 12 met, 0 not met, 5 not verifiable, 0 unbuilt
**Coverage**: 12 of 17 proven — uncovered: FS-10, FS-11, FS-13, FS-14, FS-17
**Must pass**: 9 of 14 proven — unproven: FS-10 (not verifiable), FS-11 (not verifiable), FS-13 (not verifiable), FS-14 (not verifiable), FS-17 (not verifiable)
**Diagnosis**: 5 open — 5 capability absent
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `decide`, given pm-interface's round shape (one `gap-unbuilt` item on PMI-T003, with PMI-T003 in the deferred list), returns `close: true` and does not return `reaudit: true` | .trd-state/audit-notes-not-rounds/evidence/fs1-6-classify-decide-transcript.txt | 1 |
| FS-2 | `classify` labels an item deferred when its action is `gap-unbuilt`, `gap-untested` or `untested` and its id is in the deferred task ids — for each of those three actions | .trd-state/audit-notes-not-rounds/evidence/fs1-6-classify-decide-transcript.txt | 1 |
| FS-3 | `classify` labels an item deferred when its id is a requirement whose `served_by` tasks, read from the supplied `index`, are all deferred; a requirement with at least one non-deferred `served_by` task is not labelled deferred | .trd-state/audit-notes-not-rounds/evidence/fs1-6-classify-decide-transcript.txt | 1 |
| FS-4 | A `gap-unbuilt` item that is not deferred (its id is not a deferred task and not a requirement served only by deferred tasks) is still classified a defect, under every check it can appear in | .trd-state/audit-notes-not-rounds/evidence/fs1-6-classify-decide-transcript.txt | 1 |
| FS-5 | `classify` labels an item a note when its action is `fix-citation` (under any check), or when it is a `mismatch` under the `citation` or `consistency` check | .trd-state/audit-notes-not-rounds/evidence/fs1-6-classify-decide-transcript.txt | 1 |
| FS-6 | `classify` still returns `'other'` for a `confirm-wanted` item, whether or not `deferred` and `index` are supplied | .trd-state/audit-notes-not-rounds/evidence/fs1-6-classify-decide-transcript.txt | 1 |
| FS-7 | `tally` never counts a note or a deferral toward `defects` or `testGaps`, and returns the number of notes and the number of deferrals as their own separate counts | .trd-state/audit-notes-not-rounds/evidence/fs7-8-transcript.txt | 1 |
| FS-8 | `decide` does not ask for another audit round when the only open items in a round are notes and/or deferrals | .trd-state/audit-notes-not-rounds/evidence/fs7-8-transcript.txt | 1 |
| FS-12 | The reconcile stage's in-place edits never change what an objective, acceptance criterion or task requires | .trd-state/audit-notes-not-rounds/evidence/fs9-12-reconcile-prompt.txt | 1 |
| FS-15 | `/audit-build` passes the TRD's deferred list, taken from `parseTrd().deferred` as `{id, why}` entries, to the audit workflow | .trd-state/audit-notes-not-rounds/evidence/FS-15-16-17-command-text.txt | 1 |
| FS-9 | The reconcile stage of `audit-build.js` fixes a stale citation or descriptive-wording slip in place in any section of the TRD, not only its Could Not Verify section, during the same audit run | .trd-state/audit-notes-not-rounds/evidence/FS-9-reconcile-excerpt.txt | 2 |
| FS-16 | `/audit-build` passes the deferred ids and the workflow's returned `index` to every `classify`, `tally` and `decide` call, including step 3's per-item `classify`, so a deferred item or a note never reaches the fix run | .trd-state/audit-notes-not-rounds/evidence/FS-16-recapture-iter3.txt | 3 |

## Not Met

_None._

## Not Verifiable

| ID | Statement | Reason |
|----|-----------|--------|
| FS-10 | Each citation or wording fix the reconcile stage makes is listed under the heading `FIXED THE CITATION` in its output, whichever TRD section it was in | Needs the reconcile stage's returned text from a live /audit-build run, which this loop may not start. Only the prompt instruction exists (audit-build.js ~669). |
| FS-11 | Each item the reconcile stage fixed appears in its `handoff` with `action: "fix-citation"` | Needs the returned handoff JSON from a live /audit-build run, which this loop may not start. Only the prompt instruction (~671) and the ACTIONS enum containing fix-citation (line 167) exist. |
| FS-13 | A gap whose only covering task is deferred is reported by the reconcile stage under the heading `PLANNED, NOT BUILT YET`, with that item's handoff `id` set to the deferred task's id | Needs the reconcile stage's returned text and handoff from a live run on a fixture with one deferred task, which this loop may not start. Only the prompt instruction exists (audit-build.js ~666-668, 679). |
| FS-14 | A note or a deferral is never the reason the audit's VERDICT says "do not proceed"; a round whose only findings are notes and deferrals does not produce that verdict | The VERDICT line is model output from a live run, which this loop may not start. Only the prompt rule exists (audit-build.js ~637-641). The deterministic half is in FS-16-fix-run-input.txt: decide returns close true and reaudit false. |
| FS-17 | `/audit-build` records the note count and the deferred count in the round, lists notes and deferrals in the readout's STATE section rather than ISSUES, and adds the TRD to the audit commit so in-place fixes travel with the branch | Two of three parts proven on fixtures: the round record carries notes 1 and deferred 1, and git show --stat of the audit commit lists the TRD. The readout placement (notes and deferrals under STATE, not ISSUES) is model output from a live /audit-build run, which this loop may not start. Only the command instruction exists (audit-build.md ~318-320). |

