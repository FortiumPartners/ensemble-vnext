VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; no automated test asserts the new doc text (this audit checked it by grep, which is the check the roadmap names); the live-proof report the CHANGELOG cites is not in git or on any records ref; the owner has not yet checked the wording of the Storybook sentence, a check the roadmap leaves to them; 19 of 136 Jest suites could not run in this worktree because it has no node_modules (none of them reads the two edited files)

# Audit report: document-the-graded-merge

- Date: 2026-11-21
- Audited commit: 2950c5acb743e7eedc80f92d9cf3ffbb3070cd64
- TRD: docs/TRD/document-the-graded-merge.md
- PRD: none
- Findings: 8 · applied: 3 · rejected: 2 · still unverified: 4 · verifiers reporting: 5/5

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; no automated test asserts the new doc text (this audit checked it by grep, which is the check the roadmap names); the live-proof report the CHANGELOG cites is not in git or on any records ref; the owner has not yet checked the wording of the Storybook sentence, a check the roadmap leaves to them; 19 of 136 Jest suites could not run in this worktree because it has no node_modules (none of them reads the two edited files)

Coverage: all 5 verifiers reported. No PRD was supplied, so the docs were never checked against product requirements. They were checked only against the TRD and the feature description (F-6). 10 requirements and 1 task were indexed.

TRACEABILITY GAPS
- The new documentation text has no test asserting it (DOC-001). Nothing checks automatically for the #97/#136 entry or the `ship_queue` sentence for Storybook's PM. The only test of the guide, `packages/core/lib/ship-build.seam.test.js:1031-1060`, checks older content. I grepped both files myself and every required item is present, and the delivered code matches each claim the docs make. DOC-001 covers this, so it goes to `/implement-trd --reconcile`. It hides no defect, and the roadmap's own check for this item is a grep, not a test.

FIXED THE CITATION
- The objectives' sources (O1–O5) and the Source PRD line cited "feature description" without naming a file. They now point to `docs/plans/ship-graded-merge/workplan-input.json:84` (the F-6 entry) and roadmap item 6.
- The "doc-consistency tests" in O5 now name the suites that read `CHANGELOG.md` or the guide: `ship-build.seam.test.js`, `run-limit-reference-docs.test.js`, `record-criteria-prose.test.js`, `custody.test.js` and `verify-functional.test.js`. No suite is called "doc-consistency". All five pass.
- Added a `## Could Not Verify` section to the TRD, which had none.

REJECTED THESE FINDINGS
- The claim that the live-proof report is missing, so its figures could not be checked (DOC-001, verification; also the "could not compare" half of the O4 finding). The report exists at `/private/tmp/ensemble-vnext-feature-50-live-proof-on-the-ship-build-test-repository/.trd-state/ship-graded-merge/live-proof-report.md`. The records ref `refs/ensemble/records/task-live-proof-ship-build-test-repo` lists it as that task's output. I compared it with the CHANGELOG: PRs #7, #8 and #9, the 9-second figure and the three caveats all match. That finding also said the doc tests were not run. I ran the full `npx jest`: every suite that reads either edited file passed. The 41 failures (of 5227 tests) are all missing modules or a sandbox EPERM.

ISSUES
- The live-proof report is not durable. It lives only in feature 50's working tree and on its published artifact page, so the CHANGELOG cites a path nobody else can open. The owner decides whether it goes on a records ref. I handed it off as confirm-wanted.
- Minor wording: the CHANGELOG says "9 seconds after the run reached wait-ci". The report measures the 9 seconds from the moment the PR was reused (21:58:46 to 21:58:55). No action unless you want it exact.

NO ACTION
- O1–O3: the content checks out against the code. That covers `ensemble.mergeChecks`, the 500-line limit, the stop after two failed fix attempts, and `wait-ci` returning `conflicted`. Only `CHANGELOG.md` and the guide changed, and no setting changed.
- Conformance with `stack.md` and `constitution.md`: no findings.

NEXT
1. Check the wording of the Storybook sentence in `CHANGELOG.md` and `docs/guides/ship-build.md`.
2. Decide whether the missing test for the doc text is worth adding. If it is:
```
/implement-trd docs/TRD/document-the-graded-merge.md --reconcile
```

I have not committed the TRD edits. They are in `/private/tmp/ensemble-vnext-feature-60-document-the-graded-merge-and-tell-storybook/docs/TRD/document-the-graded-merge.md`.
