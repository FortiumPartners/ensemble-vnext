# Functional Verification Report: verification-report-images

**Source PRD**: docs/TRD/verification-report-images.md § Intended Change
**Success definition**: .trd-state/verification-report-images/success-definition.md
**Outcome**: Must-Pass Unproven (no full-environment run declared)
**Reason**: must-pass criteria not proven: FS-6, FS-7, FS-8, FS-10 — the core was not shown to work
**Criteria**: 16 total — 11 met, 0 not met, 5 not verifiable, 0 unbuilt
**Coverage**: 11 of 16 proven — uncovered: FS-6, FS-7, FS-8, FS-10, FS-16
**Must pass**: 5 of 9 proven — unproven: FS-6 (not verifiable), FS-7 (not verifiable), FS-8 (not verifiable), FS-10 (not verifiable)
**Screenshots**: 0 shown — 1 left out: FS-11
**Diagnosis**: 5 open — 4 environment not reachable, 1 capability absent
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | When a criterion's proving artifact is an image, the verification report shows that image beside that criterion | .trd-state/verification-report-images/evidence/fs1-render.md | 1 |
| FS-2 | A criterion shows exactly one image — the one cited as its proof — even when other images were captured for it | .trd-state/verification-report-images/evidence/fs2-render.md | 1 |
| FS-3 | When a criterion's proving evidence is a video, the report shows a still frame taken from it and does not embed or link the video itself | .trd-state/verification-report-images/evidence/fs3-render.md | 1 |
| FS-4 | A UI criterion that is `met` without an image carries the visible flag "UI criterion proven without a screenshot" | .trd-state/verification-report-images/evidence/fs4-render.md | 1 |
| FS-5 | A flagged imageless UI criterion still counts as met: its status and the run's outcome are what they would be without the flag | .trd-state/verification-report-images/evidence/fs5-compare.txt | 1 |
| FS-9 | An image is embedded only after it has been cleared; an image that was not cleared is not embedded, and the report names it with the reason it was left out | .trd-state/verification-report-images/evidence/fs9-render.md | 1 |
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
| FS-6 | A report published by either publish step — `/implement-trd` §9.0a or `/verify-build` — carries the images it embeds, so each embedded image displays on the published page | Requires a published artifact's file listing; the claude.ai artifact service is not a declared environment in verification.md, so no publish was made. Only prose and a publish plan exist. |
| FS-7 | When a report's images are more than one publish may carry, they are published in several batches, each under the per-publish limit, and together they carry every embedded image | Plan splits 300 images into batches of 254 and 46 covering all embeds, but per-publish records and the final listing need a live publish to an undeclared environment. |
| FS-8 | Every publish of the report, including every batch and every later re-publish, goes to the one URL `artifacts.json` keeps under `verification-report`; the feature never gains a second report URL | Needs artifacts.json after a real multi-batch publish and re-publish; none possible (undeclared environment). Command text is instruction, not a captured run. |
| FS-10 | An image that was not cleared is not among the files published with the report | Plan sends only cleared.png and nulls uncleared.png if already published, but the published file listing needs a live publish to an undeclared environment. |
| FS-16 | With `ensemble.publishArtifacts: false`, nothing is published — neither the report nor its images | Needs a run of /implement-trd or /verify-build with publishing off. Both are LLM-driven commands this loop cannot run; only the prose gating was inspected. |

## Evidence

### Images left out

| ID | Image left out because |
|----|------------------------|
| FS-11 | shows a credential value; not cleared |

