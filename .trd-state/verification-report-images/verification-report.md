# Functional Verification Report: verification-report-images

**Source PRD**: docs/TRD/verification-report-images.md § Intended Change
**Success definition**: .trd-state/verification-report-images/success-definition.md
**Outcome**: Satisfied (1 of 16 not verifiable) (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 16 total — 15 met, 0 not met, 1 not verifiable, 0 unbuilt
**Coverage**: 15 of 16 proven — uncovered: FS-16
**Must pass**: 9 of 9 proven
**Screenshots**: 0 shown — 1 left out: FS-11
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | When a criterion's proving artifact is an image, the verification report shows that image beside that criterion | .trd-state/verification-report-images/evidence/fs1-render.md | 1 |
| FS-2 | A criterion shows exactly one image — the one cited as its proof — even when other images were captured for it | .trd-state/verification-report-images/evidence/fs2-render.md | 1 |
| FS-3 | When a criterion's proving evidence is a video, the report shows a still frame taken from it and does not embed or link the video itself | .trd-state/verification-report-images/evidence/fs3-render.md | 1 |
| FS-4 | A UI criterion that is `met` without an image carries the visible flag "UI criterion proven without a screenshot" | .trd-state/verification-report-images/evidence/fs4-render.md | 1 |
| FS-5 | A flagged imageless UI criterion still counts as met: its status and the run's outcome are what they would be without the flag | .trd-state/verification-report-images/evidence/fs5-compare.txt | 1 |
| FS-6 | A report published by either publish step — `/implement-trd` §9.0a or `/verify-build` — carries the images it embeds, so each embedded image displays on the published page | .trd-state/verification-report-images/evidence/live/fs6-fs8-fxA-publish-record.txt | 1 |
| FS-7 | When a report's images are more than one publish may carry, they are published in several batches, each under the per-publish limit, and together they carry every embedded image | .trd-state/verification-report-images/evidence/live/fs7-batch-publish-record.txt | 1 |
| FS-8 | Every publish of the report, including every batch and every later re-publish, goes to the one URL `artifacts.json` keeps under `verification-report`; the feature never gains a second report URL | .trd-state/verification-report-images/evidence/live/fs6-fs8-fxA-publish-record.txt | 1 |
| FS-9 | An image is embedded only after it has been cleared; an image that was not cleared is not embedded, and the report names it with the reason it was left out | .trd-state/verification-report-images/evidence/fs9-render.md | 1 |
| FS-10 | An image that was not cleared is not among the files published with the report | .trd-state/verification-report-images/evidence/live/fs10-publish-record.txt | 1 |
| FS-11 | An image showing a credential value is not cleared, so it is neither embedded nor published | .trd-state/verification-report-images/evidence/FS-11/render-excluded.md | 2 |
| FS-12 | Each of the three check-role skills — verify-design-comparison, verify-flow-as-built, verify-data-fidelity — keeps its own published page and its own trigger, unchanged by this feature | .trd-state/verification-report-images/evidence/fs12-check-skills.txt | 1 |
| FS-13 | A report with no image evidence and no UI criteria renders exactly as it did before this feature | .trd-state/verification-report-images/evidence/fs13-14-old-vs-new.txt | 1 |
| FS-14 | The run outcome — satisfied, stalled, insufficient-coverage, and the must-pass outcome — is the same for a given input as before this feature | .trd-state/verification-report-images/evidence/fs13-14-old-vs-new.txt | 1 |
| FS-15 | With `ensemble.publishArtifacts: false`, the report on disk embeds its images by relative path | .trd-state/verification-report-images/evidence/fs15-relative.txt | 1 |

## Not Met

_None._

## Not Verifiable

| ID | Statement | Reason |
|----|-----------|--------|
| FS-16 | With `ensemble.publishArtifacts: false`, nothing is published — neither the report nor its images | Proving that nothing is published with publishing off needs a live run of an LLM-driven command (/implement-trd or /verify-build) with ensemble.publishArtifacts false; this loop cannot run one, and the verification plan accepted it as not verifiable here. |

## Evidence

### Images left out

| ID | Image left out because |
|----|------------------------|
| FS-11 | shows a credential value; not cleared |


## Fix run

| Round | Tasks promoted | Criteria closed | Still open |
|-------|-----------------|------------------|-------------|
| 1 | 0 | 4 | 1 |

| ID | Statement | Status | Cause | Stop reason |
|----|-----------|--------|-------|-------------|
| FS-16 | With `ensemble.publishArtifacts: false`, nothing is published — neither the report nor its images | not_verifiable | capability absent | not verifiable here: proving it needs a live run of /implement-trd or /verify-build with publishing off, which this loop cannot start; accepted as not verifiable in verification-plan.md |

