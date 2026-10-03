# Functional Verification Report: plan-from-spec

**Source PRD**: docs/TRD/plan-from-spec.md ## Intended Change
**Success definition**: .trd-state/plan-from-spec/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 25 total — 25 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 25 of 25 proven — uncovered: none
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `extract` scoped to the fixture's Item 4 section returns its 18 criteria (AC-4.1 … AC-4.18) and its 2 regression guards (RG-4.1, RG-4.2, each `kind: 'guard'`), and nothing from any other item's "Acceptance criteria" heading | .trd-state/plan-from-spec/evidence/fs1-2-5-extract-item4.txt | 1 |
| FS-2 | An extracted criterion's text keeps its surface label and drops the trailing `*(Traces: …)*`, which is returned separately as `traces` | .trd-state/plan-from-spec/evidence/fs1-2-5-extract-item4.txt | 1 |
| FS-3 | A criterion spanning a first line, deeper-indented continuation lines and nested sub-bullets is returned as one text joined with single spaces, and a bolded id with a colon inside the bold (`**RG-4.1:**`) is recognised | .trd-state/plan-from-spec/evidence/fs3-wrapped-criterion.txt | 1 |
| FS-4 | A criterion opening a table row's first cell under an "Acceptance criteria" heading is extracted, and table rows or list items outside such a heading are not | .trd-state/plan-from-spec/evidence/fs4-table-criteria.txt | 1 |
| FS-5 | `extract` reads the section's "Verification" subsection into an id → verification-line map, expanding ranges such as "AC-4.1 to AC-4.3" | .trd-state/plan-from-spec/evidence/fs1-2-5-extract-item4.txt | 1 |
| FS-6 | A document with no acceptance criteria yields `[]`; with no `section` given, `extract` reads the whole document | .trd-state/plan-from-spec/evidence/fs6-empty-and-whole-doc.txt | 1 |
| FS-7 | `source --file <doc>` returns `{spec, section}` from a TRD, investigation record or sweep file whose header is `**Source spec**: <path> § <section heading>`, adds `coreTrd` for a sweep file, and exits non-zero when the header is absent or does not parse | .trd-state/plan-from-spec/evidence/fs7-23-source.txt | 1 |
| FS-8 | `render-sweep` writes a sweep file — `**Source spec**:` header with the path relative to the repository holding the spec, a `**Core TRD**:` line (a TRD path or `none`), swept criteria under `## Acceptance criteria`, every guard under `**Regression guards:**` — that `extract` with no section reads back as the same items and guards | .trd-state/plan-from-spec/evidence/fs8-render-sweep.txt | 1 |
| FS-9 | `render-objectives --trd <file>` replaces only the TRD's `## Objectives` table (one row per core criterion, then one per guard, criterion text copied with each pipe character escaped as backslash-pipe) and sets the `**Source spec**:` line under the title, leaving every other byte unchanged | .trd-state/plan-from-spec/evidence/fs9-render-objectives.txt | 1 |
| FS-10 | `check --spec --section --sweep --trd` reports `ok` when every spec criterion is in exactly one of sweep file or TRD Objectives, every guard is in the Objectives, texts match the spec (whitespace-collapsed), and the TRD header parses | .trd-state/plan-from-spec/evidence/fs10-check-ok.txt | 1 |
| FS-11 | `check` reports each of its five problem kinds — `missing`, `duplicated`, `added`, `reworded`, `noHeader` — naming the offending id, and is not `ok` when any is non-empty | .trd-state/plan-from-spec/evidence/fs11-check-five-defects.txt | 1 |
| FS-12 | Guards sit outside the split: a guard in both files is never `duplicated`, while a guard absent from the TRD's Objectives is `missing` | .trd-state/plan-from-spec/evidence/fs12-guards-outside-split.txt | 1 |
| FS-13 | `criteria --spec --section --ids` writes a whole `success-definition.md` (header lines included) whose rows are the named criteria verbatim plus every guard, ordered by surface; Evidence quotes that id's verification line (blank when none); Tier 1 is `judge-only` when that line names a screenshot, else `locator` | .trd-state/plan-from-spec/evidence/fs13-criteria-definition.txt | 1 |
| FS-14 | `overlap --sweep-files <list> --trd <file>` reports every swept file the TRD's grounding also touches, and nothing when they are disjoint | .trd-state/plan-from-spec/evidence/fs14-overlap.txt | 1 |
| FS-15 | `trd-authoring.md` states the conditional rule: with a `**Source spec**:` header on the TRD or its source, objectives are the spec's core criteria and guards verbatim with ids and no others; swept criteria go under Non-Goals as "handled by `/sweep <file>`"; a wrong-looking criterion becomes an owner-only open question quoting the spec line; header-less and PRD-sourced TRDs are unchanged (prompt-only — checked as text) | .trd-state/plan-from-spec/evidence/fs15-trd-authoring-text.txt | 1 |
| FS-16 | `/plan`, when `extract` finds criteria, passes `prdWouldHaveContent: false`, classifies each criterion sweep or core by the owner's rule quoted verbatim, keeps uncertain/guarded/open-question criteria in the core, weighs only the core at Step 4, writes the sweep list via `render-sweep` to `docs/plan/<slug>.sweep.md`, writes no TRD when all are swept and no sweep file when all are core, and behaves as today when none are found (prompt-only — checked as text) | .trd-state/plan-from-spec/evidence/it2-fs16-plan-text.txt | 2 |
| FS-17 | `/plan` runs `render-objectives --trd` then `check` after the last model writer (after `audit-trd` at medium, after Step 6's findings at small), and a failed `check` stops the plan naming each problem (prompt-only — checked as text) | .trd-state/plan-from-spec/evidence/fs16-17-plan-text.txt | 1 |
| FS-18 | `plan()` called with `sweepList` and `coreTrd` never chains (even with `--implement`), writes no state pointer, keeps a TRD only when `coreTrd` is true, gives NEXT in order `/sweep <file>`, `/verify-build <file>`, commit the swept fixes, `/implement-trd docs/TRD/<slug>.md` (omitted with no core TRD), and its DECISIONS says the sweep is built, verified and committed first | .trd-state/plan-from-spec/evidence/fs18-plan-live-call.txt | 1 |
| FS-19 | `/sweep` triage (`sweep.js`) uses each criterion id as the item id when the list carries criterion ids, and deferred items keep their id; lists without criterion ids triage as today | .trd-state/plan-from-spec/evidence/fs19-sweep-jest.txt | 1 |
| FS-20 | After attestation, `/sweep` checks every criterion id landed in fixed / already fine / failed, ends `COMMAND STUCK: /sweep` with "<id> is not a sweep item — re-run /plan to move it to the core" for a deferred or too-big criterion, and runs `overlap` against the `**Core TRD**:` (skipped for `none`), stopping on any shared file (prompt-only — checked as text) | .trd-state/plan-from-spec/evidence/fs20-sweep-text.txt | 1 |
| FS-21 | `/verify-build` given a sweep file or a `**Source spec**:` TRD writes `success-definition.md` with `spec-scope.js criteria` instead of dispatching the derive agent; a sweep file runs as feature `<slug>-sweep` with `cap: 1`, never runs the fix loop, and sets `prd_path` to the sweep file; the verification contract lists `spec` as a source kind (prompt-only — checked as text) | .trd-state/plan-from-spec/evidence/it2-fs21-23-verify-build-text.txt | 2 |
| FS-22 | `renderReport`, given a `prd` ending in `.sweep.md`, writes on `satisfied` "commit the swept fixes, then build the core TRD named on the sweep file's `**Core TRD**:` line", and on any other outcome "re-run `/sweep <file>` for the failed criteria, then `/verify-build <file>`", instead of the general `/audit-build` / `/refine-verification` next steps | .trd-state/plan-from-spec/evidence/it2-fs22-renderReport-live.txt | 2 |
| FS-23 | `/verify-build`'s readout NEXT, for a sweep file, gives the same steps as literal commands, resolving the core TRD with `spec-scope.js source` and dropping the `/implement-trd` step when the core TRD is `none` (prompt-only — checked as text) | .trd-state/plan-from-spec/evidence/it2-fs23-source-none.txt | 2 |
| FS-24 | `/implement-trd` on a TRD with `**Source spec**:` writes its success definition with `spec-scope.js criteria` (spec and section from `spec-scope.js source`), covering every criterion of the locked spec — core and swept — plus guards, verbatim; sets `source_kind: "spec"`; dispatches no derive agent; and §8.1b reads the spec section as its source text (prompt-only — checked as text) | .trd-state/plan-from-spec/evidence/fs24-implement-trd-text.txt | 1 |
| FS-25 | In the core's verification, a swept criterion's evidence captured by the sweep's run is accepted as current while every file that criterion's fix changed is byte-identical, and is rejected (re-proved) as soon as the core changed any of those files | .trd-state/plan-from-spec/evidence/fs25-evidence-reuse-live.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

