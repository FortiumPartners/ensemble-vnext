# Functional Success Definition: verification-report-images

**Source**: owner's decided change, 2026-10-11 — §Intended Change (items 1–4) and §Behaviour Preserved, supplied to the deriver as extracted text (no TRD path, task list or plan was read)
**Source kind**: intended-change
**Derived**: 2026-10-12T00:14:29Z
**Criteria**: 16

## Source, as received (the lines the `Cites` column points at)

§Intended Change:

- **IC-1** — **Images inline.** Whenever a criterion's proving artifact is an image, the verification report shows it beside that criterion — one image per criterion, the one cited as its proof. Video evidence contributes a frame grab, never the video.
- **IC-2** — **Imageless UI criteria flagged.** A UI criterion that is `met` without an image carries the visible flag "UI criterion proven without a screenshot". It still counts as met.
- **IC-3** — **Published with its images**, through the two existing publish steps (`/implement-trd` §9.0a and `/verify-build`), in batches that stay under the per-publish limit, all to the one URL `artifacts.json` keeps under `verification-report`.
- **IC-4** — **No credential in a published image.** Each image is cleared before it is embedded; one that is not cleared is not embedded, not published, and is named in the report with the reason.

§Behaviour Preserved:

- **BP-1** — the check-role skills (verify-design-comparison, verify-flow-as-built, verify-data-fidelity) keep their own pages and triggers;
- **BP-2** — non-UI reports are unchanged apart from carrying no images;
- **BP-3** — outcome logic (satisfied / stalled / insufficient-coverage, must-pass) is unchanged;
- **BP-4** — with `ensemble.publishArtifacts: false`, the report on disk embeds the images by relative path and nothing is published.

## What can be exercised here

This repository has no UI and no running service. The report renderer is a pure Node function
with a CLI (`node .claude/lib/functional-verification.js render-report --file <input.json>`), so
criteria about report CONTENT (FS-1 to FS-5, FS-9, FS-13 to FS-15) can be proven by rendering
fixture input and reading the output. Criteria about PUBLISHING to the Artifact service (FS-6 to
FS-8, FS-10, FS-16) and about how a live image clearance rules on a real picture (FS-11) need a
live run; where none can be made, the exerciser states that reason and the Judge rules on it.
They are kept in the definition because the source asks for them — dropping them would hide
the gap rather than report it.

No row carries a `Parts` count: no functional statement below enumerates one except FS-12,
which names three skills.

**A criterion carrying a `Parts` count cannot pass incrementally**: FS-12 resolves `met` only
when all three skills are shown unchanged; two of three is `not_met` with the third named.

## Criteria

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | When a criterion's proving artifact is an image, the verification report shows that image beside that criterion | IC-1, "the verification report shows it beside that criterion" | `render-report` output for a fixture in which one criterion's cited artifact is an image file: the output contains an image embed of that file's path inside that criterion's own entry, not elsewhere in the report | [read] | locator | | O1 |
| FS-2 | A criterion shows exactly one image — the one cited as its proof — even when other images were captured for it | IC-1, "one image per criterion, the one cited as its proof" | `render-report` output for a fixture in which one criterion has several image captures but cites one: the cited path is embedded in that criterion's entry and no other capture's path is embedded there | [read] | locator | | O1 |
| FS-3 | When a criterion's proving evidence is a video, the report shows a still frame taken from it and does not embed or link the video itself | IC-1, "Video evidence contributes a frame grab, never the video" | `render-report` output for a fixture in which a criterion's evidence is a video with a captured frame grab: the frame-grab image is embedded in that criterion's entry and the video file's path appears in no embed | [read] | locator | | O1 |
| FS-4 | A UI criterion that is `met` without an image carries the visible flag "UI criterion proven without a screenshot" | IC-2, "carries the visible flag" | `render-report` output for a fixture with a `met` UI criterion whose artifact is not an image: that criterion's entry contains the literal text `UI criterion proven without a screenshot` | [read] | locator | | |
| FS-5 | A flagged imageless UI criterion still counts as met: its status and the run's outcome are what they would be without the flag | IC-2, "It still counts as met" | `render-report` output for the FS-4 fixture with every other criterion `met`: the flagged criterion is listed as met and the run outcome is satisfied | [read] | locator | | |
| FS-6 | A report published by either publish step — `/implement-trd` §9.0a or `/verify-build` — carries the images it embeds, so each embedded image displays on the published page | IC-3, "Published with its images, through the two existing publish steps" | For a run through each of the two publish steps: the published artifact's file listing contains every image the report embeds, at the path the report references | [read] | locator | | O3 |
| FS-7 | When a report's images are more than one publish may carry, they are published in several batches, each under the per-publish limit, and together they carry every embedded image | IC-3, "in batches that stay under the per-publish limit" | A publish of a report with more embedded images than one publish may carry: the record of each publish call shows a file count under the limit, and the final file listing contains every embedded image | [read] | locator | | O3 |
| FS-8 | Every publish of the report, including every batch and every later re-publish, goes to the one URL `artifacts.json` keeps under `verification-report`; the feature never gains a second report URL | IC-3, "all to the one URL `artifacts.json` keeps under `verification-report`" | `.trd-state/<feature>/artifacts.json` after a multi-batch publish and a re-publish: one `verification-report` URL, unchanged, and each publish call's target equal to it | [read] | locator | | O3 |
| FS-9 | An image is embedded only after it has been cleared; an image that was not cleared is not embedded, and the report names it with the reason it was left out | IC-4, "Each image is cleared before it is embedded; one that is not cleared is not embedded … and is named in the report with the reason" | `render-report` output for a fixture with one cleared and one uncleared image: the cleared image is embedded; the uncleared image's path appears in no embed, and its name appears in the report alongside a stated reason | [read] | locator | | O4 |
| FS-10 | An image that was not cleared is not among the files published with the report | IC-4, "one that is not cleared is … not published" | The published artifact's file listing for the FS-9 report: the cleared image is present and the uncleared image is absent | [read] | locator | | O4 |
| FS-11 | An image showing a credential value is not cleared, so it is neither embedded nor published | IC-4, "No credential in a published image" | Clearance result for a test image the exerciser generates showing a dummy credential-shaped value (its value never written to any note, report or this file, per S-1): the result says not cleared, and the report renders that image as left out with the reason | [read] | locator | | O4 |
| FS-12 | Each of the three check-role skills — verify-design-comparison, verify-flow-as-built, verify-data-fidelity — keeps its own published page and its own trigger, unchanged by this feature | BP-1 | For each skill: a diff of its trigger and publish instructions against the pre-feature base shows no change, and its page is still published under its own key in `artifacts.json`, separate from `verification-report` | [read] | locator | 3 | |
| FS-13 | A report with no image evidence and no UI criteria renders exactly as it did before this feature | BP-2 | `render-report` output for the same no-image, no-UI fixture from the pre-feature renderer and from the current one: the two outputs are byte-identical | [read] | locator | | |
| FS-14 | The run outcome — satisfied, stalled, insufficient-coverage, and the must-pass outcome — is the same for a given input as before this feature | BP-3 | For fixtures that each reach one of these outcomes: the outcome reported by the pre-feature code and by the current code is identical, and the project's existing outcome tests pass unchanged | [read] | locator | | |
| FS-15 | With `ensemble.publishArtifacts: false`, the report on disk embeds its images by relative path | BP-4, "the report on disk embeds the images by relative path" | The report file written with publishing off: each embedded image is referenced by a relative path (no URL, no absolute path) that resolves from the report's own location | [read] | locator | | |
| FS-16 | With `ensemble.publishArtifacts: false`, nothing is published — neither the report nor its images | BP-4, "and nothing is published" | A run of either publish step with publishing off: no publish call is made, and `artifacts.json`'s `verification-report` entry is unchanged by the run | [read] | locator | | |

## Must-pass coverage

- **O1** — covered by FS-1, FS-2, FS-3.
- **O3** — covered by FS-6, FS-7, FS-8. All three need a live publish; if none can be exercised
  here, O3 stays unproven and the run reports `must-pass-unproven` rather than passing.
- **O4** — covered by FS-9, FS-10, FS-11. FS-9 is checkable by rendering; FS-10 and FS-11 need
  a live publish and a live clearance respectively.
