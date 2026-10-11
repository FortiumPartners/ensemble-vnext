# Investigation: verification-report-images

**Kind**: change
**Weight**: medium
**Route**: plan

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | When a criterion's proving artifact is an image (png/jpg/jpeg; for video, a frame grab the run captured), the verification report shows that one image inline next to the criterion. No design frames or journey are required. Exactly one image per criterion, the one cited as its proof, never every capture | owner instruction, 2026-10-11, intended change 1 | yes |
| O2 | A criterion about UI (it names a screen, element, layout or visual state, or its Tier 1 is judge-only for a visual property) that is `met` with no image is flagged in the report as "UI criterion proven without a screenshot". It still counts as met | owner instruction, 2026-10-11, intended change 2 | |
| O3 | The published report carries its images, through the existing publish path in `/implement-trd` §9.0a and `/verify-build`: images go up as supporting files (`files` map), every publish stays under the per-publish file limit (several publishes to the same URL when needed), and the feature keeps one report URL in `artifacts.json` | owner instruction, 2026-10-11, intended change 3 | yes |
| O4 | No image showing a password, token, key or other credential value is ever published. Each image is cleared before it can be embedded; an image that cannot be cleared is left out and named in the report | owner instruction, 2026-10-11, intended change 4 | yes |
| O5 | Behaviour preserved: the check-role skills' pages and triggers are unchanged; a report with no images and no UI criteria renders byte-identically to today; outcome logic (satisfied / stalled / insufficient-coverage / must-pass-unproven) is unchanged; with `ensemble.publishArtifacts: false`, the on-disk report embeds its images by relative path and nothing is published | owner instruction, 2026-10-11, "Behaviour preserved" | |

## Intended Change

The decided outcome, from the owner's instruction of 2026-10-11:

1. **Images inline.** Whenever a criterion's proving artifact is an image, the verification
   report shows it next to that criterion. One image per criterion: the one cited as its proof.
   Video evidence contributes a frame grab, not the video.
2. **Imageless UI criteria flagged.** A UI criterion that is `met` without an image carries the
   visible flag "UI criterion proven without a screenshot" in the report. It still counts as met.
3. **Published with its images.** `/implement-trd` §9.0a and `/verify-build`'s artifact step
   publish the report together with its images as supporting files, in batches that stay under
   the per-publish file limit, all to the same URL, which `artifacts.json` keeps under
   `verification-report`.
4. **No credential in a published image.** Each image is cleared before it is embedded. One that
   is not cleared is not embedded, not published, and is named in the report with the reason.

Checkable:
- A report rendered from a fixture input whose criteria cite image artifacts contains exactly one
  image reference per such criterion, and none for a criterion whose artifact is text.
- A fixture UI criterion that is `met` with no image renders the flag; the same criterion with an
  image does not; a non-UI criterion with no image does not.
- A fixture with an image marked not cleared renders no image for it and names it with the reason.
- The publish plan for a fixture with N images yields batches of at most the per-publish limit,
  together covering exactly the images the report embeds and nothing else.
- Today's renderReport tests pass unchanged, and a fixture with no new fields renders
  byte-identically to the current output.

### Current behaviour, confirmed

- `renderReport` (`packages/core/lib/functional-verification.js:884`) renders each criterion's
  `artifact` as text in a table cell: `| ID | Statement | Artifact | Proven at |` for Met
  (`:1056`), no artifact at all for Not Met / Not Verifiable / Unbuilt. No image is ever
  embedded. [read]
- The report input is composed by the Judge agent in `verify-functional.js` STEP 5 (`:613-626`):
  per criterion `id, statement, cites, status, artifact, reason, cause, provenAt, attempts,
  blocker`, then `node <checker> render-report --file <input>` writes the report. A reconcile
  agent re-renders the same input when the must-pass re-check changes the outcome
  (`:1072-1086`, "Leave every other key exactly as it is"). [read]
- `/implement-trd` §9.0a (`packages/core/commands/implement-trd.md:2022-2050`) publishes
  `verification-report.md` with no `files` map; only check-skill pages get one.
  `/verify-build` (`packages/core/commands/verify-build.md:565-575`) does the same, and its fix
  run re-publishes the report after appending `## Fix run` (`:535-537`). [read]
- No image-credential rule exists in the framework. The contract's S-1
  (`packages/core/contracts/functional-verification.md:478`) covers notes, the report and the
  success definition, not image content; the check skills forbid credential values in their
  pages and manifests. The "evidence-hygiene rule" the owner named is not present in this
  repository. [ran: grep across packages/, docs/, .claude/]
- `.trd-state/*/evidence/` is gitignored (`.gitignore:78`); `verification-report.md` is tracked
  as the durable record. [read]
- The owner's consuming-project counts (one-active-trip 578 screenshots and no visual page, and
  the rest) were not re-checked here. [not checked]

## Decision

- **The report input gains three optional per-criterion fields**, and nothing else changes in
  its shape: `image` (the one proving image, repo-relative path), `ui` (boolean), and
  `imageExcluded` (a reason string when an image was found but not cleared). Absent fields render
  exactly as today, which is what keeps O5's byte-identical guarantee checkable.
- **The Judge selects and clears the image.** It already reads image evidence for judge-only
  criteria; in STEP 5 it records, per criterion, the single image its verdict rests on and looks
  at it before citing it. An image that shows a credential value is recorded as `imageExcluded`
  with the reason, never as `image`. It also sets `ui` from the contract's definition (names a
  screen, element, layout or visual state, or is judge-only for a visual property).
  - Rejected: a separate clearance agent in each command's publish step. It would duplicate the
    check in two commands, and a report already rendered would then need re-rendering to name the
    exclusion. Clearing at selection time means the report on disk and the published one agree.
  - Video: the Exercise stage that captures a video also saves a frame grab and cites it; the
    renderer never handles video.
- **Images are staged next to the report, one per criterion.** A new pure-plus-CLI step,
  `stage-report-images`, copies each cleared `image` to `.trd-state/<feature>/report-images/<ID>.<ext>`
  and rewrites the input's `image` to that report-relative path before `render-report` runs.
  Evidence can live anywhere, and a published path cannot contain `..`; staging gives every image
  a stable, report-relative path and guarantees one per criterion.
- **The renderer embeds images in an `## Evidence` section**, one block per criterion with an
  image (`### <ID> — <statement>` then `![<ID>](report-images/<ID>.<ext>)`), and the criterion's
  row in Met / Not Met links to its block. Images in table cells render poorly; a linked block
  keeps the tables readable. The flag for an imageless UI criterion appears in its Met row and
  in the Evidence section's summary line. Excluded images are listed in the same section with
  their reasons.
- **The publish step asks the library which files to send.** A new CLI, `report-publish-plan
  --report <path>`, reads the image references the report actually embeds and returns batches
  of `files` maps, each within the per-publish limit (255 files, one page). §9.0a and
  `/verify-build` publish the first batch with the page and send later batches to the same URL.
  A file the report does not reference is never in a batch, so an excluded image cannot leak
  through the publish step.
- **The contract gains an S-3 image rule**: a capture showing a credential value is deleted and
  never cited; the Judge's clearance is where it is enforced for anything the report embeds.

absorbed: none
not absorbed: `.trd-state/*/evidence/` is gitignored, so the committed report's evidence paths do not resolve on another clone — the staged `report-images/` copy, not this, is what the change relies on
not absorbed: check-skill pages (design comparison, flow, data fidelity) carry their own images and publish path — unchanged by design (O5)

## Grounding

- `packages/core/lib/functional-verification.js` — `renderReport` at `:884`; Met table `:1049-1063`;
  `escapeCell` `:848`; CLI dispatch `:1639` (`render-report`). Pure function plus CLI, both
  exported and tested in `functional-verification.test.js` (`describe('renderReport')` at `:751`).
  Add the Evidence section and the UI flag here; add `stageReportImages` and `reportPublishPlan`
  as exported pure helpers with CLI subcommands, following the existing `resolveJsonPayload`
  pattern. Careful: the renderer must stay pure — staging (file copy) is a separate CLI step,
  never inside `renderReport`. [read]
- `packages/core/workflows/verify-functional.js` — Judge STEP 5 prompt (`:613-626`) lists the
  report-input fields; add `image`, `ui`, `imageExcluded`, the clearance instruction, and the
  `stage-report-images` call before `render-report`. The reconcile prompt (`:1072-1086`) re-renders
  the same input; it must not drop the new keys (it already says "leave every other key") and must
  not need to re-stage. Covered by `verify-functional.test.js` and the TRD-sync test
  `verify-functional-trd-sync.test.js`. The workflow source may not call `Date.now()` (a
  source-level test enforces it). [read]
- `packages/core/commands/implement-trd.md` §9.0a (`:2022-2050`) and
  `packages/core/commands/verify-build.md` artifact step (`:565-575`) plus its fix-run
  re-publish (`:535-537`) — change the report publish to use `report-publish-plan` and the
  `files` map, several calls to one URL when needed. Mirror each command to `.claude/commands/`
  byte-identically (`runtime-integrity.test.sh` checks). [read]
- `packages/core/contracts/functional-verification.md` — evidence rules (`:125`, `:155-158`,
  `:210-212` on tier 1 and images) and S-1 (`:478`). Add the image-citation rule (one proving image
  per criterion, frame grab for video), the `ui` definition, and S-3. Mirror to `.claude/contracts/`.
  [read]
- `.gitignore` — decide whether `.trd-state/*/report-images/` is ignored (see Open Questions).
- `packages/full/lib` and `packages/full/contracts`, `packages/full/commands` are symlinks to core;
  do not replace them with copies. [read: handoff gotchas, `ls packages/full`]
- Hazards: `escapeCell` must be applied to the statement in the Evidence heading; image paths must
  be validated report-relative (no `..`, no absolute) before embedding, per CLAUDE.md's
  path-traversal rule; the per-publish limit is the Artifact tool's 255 files per call. [read]

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should the staged `report-images/` be committed with the report, or gitignored like `evidence/`? Committed, the tracked report's images resolve on any clone; ignored, the repository stays lean (one image per criterion, often 50+ screenshots per feature) and the published artifact is the shared record | gitignored, matching `evidence/`; the published report is what reviewers open | owner-only |
| OQ-2 | Should a `not_met` criterion with a cited image show it too, or only `met` ones? | show it for any status when the Judge cites one — a failing screenshot is the most useful thing to review | |
