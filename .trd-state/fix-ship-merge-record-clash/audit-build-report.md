VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (no PRD exists; the change came from the owner's 2026-11-09 brief, so only TRD-to-code traceability was checked); the live GitHub path is unproven (a real PR's `mergeable` value, the push, the head poll and the CI wait on a live PR were deferred by the owner); the external references (issue 97, workplan feature F-1, islayjames/forge#265) were not resolved because they live outside this repository

# Audit report: fix-ship-merge-record-clash

- Date: 2026-11-10
- Audited commit: 059e3760bd9770f7873bddb994d464e60962276c
- TRD: docs/TRD/fix-ship-merge-record-clash.md
- PRD: none
- Findings: 5 · applied: 2 · rejected: 3 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/fix-ship-merge-record-clash.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (no PRD exists; the change came from the owner's 2026-11-09 brief, so only TRD-to-code traceability was checked); the live GitHub path is unproven (a real PR's `mergeable` value, the push, the head poll and the CI wait on a live PR were deferred by the owner); the external references (issue 97, workplan feature F-1, islayjames/forge#265) were not resolved because they live outside this repository

Coverage: all 5 verifiers reported. 13 requirements and 3 tasks were indexed. Validation against a PRD was not run because there is no PRD.

FIXED THE CITATION
- The grounding note for the record-file module task (FIX-001) said it "Replaces" custody.js:95 and custody.js:100 without naming a commit. Those lines held `FRAMEWORK_WRITTEN` and the inline `.trd-state` test at 5bbd2e8, and both were deleted as planned. The line now reads "at 5bbd2e8" and points at the new `isRecordFile` call (custody.js:99). Only this descriptive line in docs/TRD/fix-ship-merge-record-clash.md changed.

REJECTED THESE FINDINGS
- The two custody.js line citations in the "Before" section (FIX-001). The section heading already says "on main at 5bbd2e8", and `git show 5bbd2e8:packages/core/lib/custody.js` has `FRAMEWORK_WRITTEN` at line 95 and the inline prefix test at line 100. They are correct citations of the earlier code, not broken ones. The same lines in the FIX-001 grounding note had no commit named, so that copy was qualified (above).
- The citation ship-primitive-merge.md:39 (O2). It sits in the same "Before" section, scoped to 5bbd2e8. At that commit, lines 38-39 hold the stop text it cites ("returns `stop` with `gh`'s message"). The verifier checked the current file, where the line has since moved.
- "F-1, issue 97 and forge#265 do not resolve" (F-1). These are external IDs, not claims about the code. The owner's 2026-11-09 ruling names issue 97 directly. They are recorded under Could Not Verify as out of reach, not as a gap.

NO ACTION
- All 3 tasks are built and tested, and so are the 4 objectives they serve. The record-file module is checked by packages/core/lib/record-files.test.js; custody.js now requires `./record-files` and no longer defines `FRAMEWORK_WRITTEN`. The merge contract's new step 1 is checked by packages/core/contracts/ship-primitives.test.js. The scaffold's `.gitattributes` line is checked by a BATS case in packages/core/scripts/scaffold-project.test.sh (line 2772). Each `.claude/` mirror matches its source byte for byte, the packages/full symlink is in place, and the repo root's `.gitattributes` carries the union line.

The Could Not Verify section was rewritten. It keeps the two live-GitHub items the owner deferred and adds two: no PRD, and the external references were not resolved.
