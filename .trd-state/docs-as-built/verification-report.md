# Functional Verification Report: docs-as-built

**Source PRD**: docs/PRD/docs-as-built.md
**Success definition**: .trd-state/docs-as-built/success-definition.md
**Outcome**: Satisfied (2 of 30 not verifiable) (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here (28 met, 2 not verifiable here: FS-18, FS-20 need a live /audit-docs run)
**Criteria**: 30 total — 28 met, 0 not met, 2 not verifiable, 0 unbuilt
**Coverage**: 28 of 30 proven — uncovered: FS-18, FS-20
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | The assembly step lists every file under `docs/` in the checked-out tree, of any type (Markdown, images, data files, nested folders) | .trd-state/docs-as-built/evidence/assembly-inventory-class-git.txt | 1 |
| FS-2 | Every listed file carries exactly one class (PRD, TRD or loose doc); a file whose folder and structure disagree, such as a non-PRD file inside `docs/PRD/`, is reported as a disagreement and classed as a loose doc | .trd-state/docs-as-built/evidence/assembly-inventory-class-git.txt | 1 |
| FS-3 | The commit list is every commit on the checked-out branch after the last-run marker; with no marker there is no commit window and the run is comprehensive | .trd-state/docs-as-built/evidence/assembly-commit-window.txt | 1 |
| FS-4 | Each listed file is marked tracked, untracked or git-ignored | .trd-state/docs-as-built/evidence/assembly-inventory-class-git.txt | 1 |
| FS-5 | The assembly step makes no model call, and identical inputs give identical output | .trd-state/docs-as-built/evidence/assembly-determinism.txt | 2 |
| FS-6 | Every PRD and TRD gets a Haiku impact score from the commit list and the doc, including a doc with no code map; loose docs are not scored | .trd-state/docs-as-built/evidence/workflow-scoring-dispatch.txt | 1 |
| FS-7 | A score at or above the high threshold routes the doc to an Opus full audit, a score at or above the medium threshold to a Sonnet once-over, anything lower to no review; the defaults are 70 and 40 on a 0–100 scale and both can be overridden per project | .trd-state/docs-as-built/evidence/workflow-routing-thresholds.txt | 1 |
| FS-8 | The change set shows each scored doc's score and the depth it received, including docs that received no review | .trd-state/docs-as-built/evidence/pipeline-run1-change-set.md | 1 |
| FS-9 | The run records a last-run marker that survives into a clean checkout, so the next run's commit window starts after it | .trd-state/docs-as-built/evidence/marker-survives-clone.txt | 1 |
| FS-10 | A light run reviews only within the commits-since-last-run window, gives low-scoring docs no review, does not sweep loose docs, and still refreshes both indexes and the marker | .trd-state/docs-as-built/evidence/light-run-dispatch.txt | 1 |
| FS-11 | A comprehensive run ignores the commit window, reviews every PRD and TRD with at least a Sonnet once-over (Opus where scored high), sweeps the loose docs, and refreshes both indexes and the marker | .trd-state/docs-as-built/evidence/comprehensive-run-dispatch.txt | 1 |
| FS-12 | The fan-out workflow uses the class and depth it is given by assembly and scoring; it does not re-decide either | .trd-state/docs-as-built/evidence/workflow-uses-given-class.txt | 1 |
| FS-13 | A run in a repository with no last-run marker is comprehensive and delivers its change set as several reviewable batches | .trd-state/docs-as-built/evidence/pipeline-run1-log.txt | 1 |
| FS-14 | A TRD with no implementation work, or whose work is clearly in flight, is skipped (not reviewed, not cut); a TRD whose development tasks are all done is reviewed even when test, doc or infrastructure tasks remain open | .trd-state/docs-as-built/evidence/assembly-trd-skip.txt | 1 |
| FS-15 | PRDs, TRDs and loose docs each have their own review procedure: a PRD is reviewed per requirement (built as stated, built differently, not built), a TRD by its tasks, decisions and status, a loose doc by its claims (prose) or by keep-or-remove (non-text files, never corrected). Checkable as text in the contract file | .trd-state/docs-as-built/evidence/contract-text-checks.txt | 1 |
| FS-16 | The workflow sends each class to its own procedure, and never sends a non-text file (image, data) to be corrected | .trd-state/docs-as-built/evidence/workflow-class-procedures-nontext.txt | 1 |
| FS-17 | A PRD requirement the code shows was never built is surfaced to the owner in the change set, not cut from the PRD | .trd-state/docs-as-built/evidence/unbuilt-surfaced-not-cut.txt | 1 |
| FS-19 | The contract states the correct-or-cut rule: per section, content the code contradicts is corrected, content describing something absent is cut, valid content is left; a doc is deleted only when nothing valid remains; surviving content is never merged or moved into another doc; no superseded or archived banner is added and no in-tree archive folder used; a doc's state is expressed by its path, not by text inside it. Checkable as text in the contract file | .trd-state/docs-as-built/evidence/contract-correct-or-cut.txt | 2 |
| FS-21 | A file is removed only after a reference check across the whole repository, including CI configuration and tests, finds nothing using it | .trd-state/docs-as-built/evidence/removal-reference-check.txt | 1 |
| FS-22 | Only git-tracked files are deleted; untracked and ignored files are reported, never deleted | .trd-state/docs-as-built/evidence/removal-untracked-ignored.txt | 1 |
| FS-23 | Every removal writes a recovery record naming the path, the last commit that contained it, and why it was removed | .trd-state/docs-as-built/evidence/removal-reference-check.txt | 1 |
| FS-24 | A path a doc names that no longer exists is checked against git history before it is called drift: a path that once existed is distinguished from one that never did | .trd-state/docs-as-built/evidence/assembly-missing-path-history.txt | 1 |
| FS-25 | Every reviewed PRD, TRD and system-describing loose doc carries a "Where this lives in the code" section naming directories, modules or symbols with no line numbers, and the review corrects that map with the rest of the doc. Checkable as text in the contract file; that real reviewed docs carry it is only provable by a live `/audit-docs` run, which is not available here | .trd-state/docs-as-built/evidence/contract-text-checks.txt | 1 |
| FS-26 | After every run, light or comprehensive, the PRD index and the TRD index each list every doc of their class in the tree and nothing absent from it; each entry gives the doc's path and the top-level code directories from its map | .trd-state/docs-as-built/evidence/light-run-index-marker-refresh.txt | 1 |
| FS-27 | The run commits to a new local branch created from the checked-out commit, prints the exact command to push it and open a PR, and does not push, open a PR or merge | .trd-state/docs-as-built/evidence/branch-lifecycle-no-push.txt | 1 |
| FS-28 | The change set lists corrections, cuts, removals with their recovery records, each doc's score and depth, and every item surfaced for the owner: classification disagreements, unbuilt PRD requirements, untracked or ignored files not deleted, and claims about other repositories | .trd-state/docs-as-built/evidence/pipeline-run1-change-set.md | 1 |
| FS-29 | A doc's claims about another repository's code are reported in the change set, and are not corrected, not cut and not counted as drift | .trd-state/docs-as-built/evidence/crossrepo-flag.txt | 1 |
| FS-30 | The command is `/audit-docs`; its prompt lets the owner start a light run and a comprehensive run by explicit invocation, emits the standard status banners and the four-section readout, and asks no mid-run confirmation, including none per deletion. Checkable as text in the command prompt | .trd-state/docs-as-built/evidence/command-text-checks.txt | 1 |

## Not Met

_None._

## Not Verifiable

| ID | Statement | Reason |
|----|-----------|--------|
| FS-18 | Run on a PRD and a TRD with known drift, the review corrects a requirement built differently to the as-built behaviour and corrects a TRD status that does not match what was delivered. Only provable by a live `/audit-docs` run, which is not available here | Correcting a drifted requirement and a mismatched TRD status is model behaviour, provable only by a live /audit-docs run; the owner forbids live sessions in this verification, so no artifact exists. |
| FS-20 | Run on a part-stale doc, the review keeps the one valid section alone, cuts or corrects the rest, and adds no banner. Only provable by a live `/audit-docs` run, which is not available here | Keeping a part-stale doc's one valid section and adding no banner is model behaviour, provable only by a live /audit-docs run; the owner forbids live sessions here. Jest covers only the mechanical banner revert. |

