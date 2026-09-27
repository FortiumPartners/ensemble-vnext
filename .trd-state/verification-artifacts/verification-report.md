# Functional Verification Report: verification-artifacts

**Source PRD**: docs/plan/verification-artifacts.investigation.md
**Success definition**: .trd-state/verification-artifacts/success-definition.md
**Outcome**: Unbuilt (no full-environment run declared)
**Reason**: 2 criterion/criteria absent (unbuilt), not misbehaving — loop stops rather than debugging missing code
**Criteria**: 33 total — 29 met, 2 not met, 0 not verifiable, 2 unbuilt
**Coverage**: 29 of 33 proven — uncovered: FS-18, FS-21, FS-22, FS-28

## Unbuilt

Implementation did not deliver these criteria. The loop stopped rather than debugging absent code (D14).

| ID | Statement | Reason |
|----|-----------|--------|
| FS-21 | `/plan`'s mechanical check for light TRDs reports a check the inputs call for that the section omits without a stated reason, and treats a missing section on an older TRD as advisory only | The applicable-omission half is absent by design: fix-audit.js checks only the section's shape, skill names and inputs (the Jest run's 13 tests are all format checks; "a section with none of the three forms" is an empty section, not a silently omitted applicable check). TRD decision D5 rejected applicability checking in fix-audit.js (regex over image paths gives false findings) and gives /plan's light TRDs O3a "by instruction" only. The older-TRD advisory half is not applicable: /plan only audits a TRD it just wrote (plan.md §5a.1, D6). Owner decision needed: accept D5 and amend the criterion, or build an applicability check for light TRDs. |
| FS-28 | Each check's page is re-rendered from the check verdicts on every loop iteration and republished to the same URL, which is stored in `.trd-state/<feature>/artifacts.json` | Stored-URL reuse is built (URL stored under the skill's name in artifacts.json and passed back), and the workflow's Render stage re-renders each page every iteration. But publishing happens once, after the loop returns (implement-trd §9.0a; TRD 2.0.0 change (5): "The orchestrator publishes it to the stored URL when the loop returns"), not on every iteration, so the owner cannot see or comment on a page mid-run. Owner decision needed: accept publish-at-return or build per-iteration publishing. |

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Ensemble ships a design ↔ build comparison skill in `packages/skills/`: a `SKILL.md` whose frontmatter has `name`, `description`, `when_to_use` and `allowed-tools`, and whose body says when it applies and names the inputs it needs | .trd-state/verification-artifacts/evidence/FS-1.txt | 1 |
| FS-2 | Ensemble ships a designed ↔ as-built interaction-flow skill in `packages/skills/`, same frontmatter format, stating when it applies and naming its inputs | .trd-state/verification-artifacts/evidence/FS-2.txt | 1 |
| FS-3 | Ensemble ships a data ↔ screen fidelity skill in `packages/skills/`, same frontmatter format, stating when it applies and naming its inputs | .trd-state/verification-artifacts/evidence/FS-3.txt | 1 |
| FS-4 | The three check skills are prompts only. None ships a script for cropping, diffing or page assembly; each tells the agent to write any such script itself at run time | .trd-state/verification-artifacts/evidence/FS-4.txt | 1 |
| FS-5 | The design-comparison skill produces, for every design frame, a row showing Design, Build@commit, Diff labelled "N% differs", and an Overlay with a fade slider | .trd-state/verification-artifacts/evidence/FS-5.txt | 1 |
| FS-6 | The design-comparison skill requires the agent to look at every stitched design / build / diff image and write each frame's verdict itself: a status from match / minor / deviates / superseded / uncaptured / spec, one sentence, and notes. The diff percentage is evidence and never sets the status | .trd-state/verification-artifacts/evidence/FS-6.txt | 1 |
| FS-7 | The design-comparison page carries: cross-cutting problems stated once, a legend, a status filter, a jump strip, the navigation route to each frame, and uncaptured frames shown with the reason they were not captured | .trd-state/verification-artifacts/evidence/FS-7.txt | 1 |
| FS-8 | The design-comparison skill takes the exemplar's project-specific values as inputs rather than hard-coding them: bezel crop box, frame size, status-bar height, device/capture commands, evidence paths, data caveat, title | .trd-state/verification-artifacts/evidence/FS-8.txt | 1 |
| FS-9 | No check skill's published page, or the agent summary that produces it, contains a credential value; a page records where a credential lives, not what it is | .trd-state/verification-artifacts/evidence/FS-9.txt | 1 |
| FS-10 | The flow skill derives an as-built interaction diagram from the code and compares it, journey by journey, against the designed flow, reporting where they do not match | .trd-state/verification-artifacts/evidence/FS-10.txt | 1 |
| FS-11 | The data skill compares what a screen renders against the API or store data behind it, view by view, and reports rows that do not match | .trd-state/verification-artifacts/evidence/FS-11.txt | 1 |
| FS-12 | The TRD authoring contract documents a `## Verification Artifacts` section: a table with one row per chosen check (skill name, inputs, why it applies), an `Omitted: <skill> — <reason>` line per applicable check left out, or `None apply — <reason>` | .trd-state/verification-artifacts/evidence/FS-12.txt | 1 |
| FS-13 | A TRD written by `/create-trd` contains a `## Verification Artifacts` section | .trd-state/verification-artifacts/evidence/FS-13.txt | 1 |
| FS-14 | A TRD written by `/plan` contains a `## Verification Artifacts` section, on both the light template and the medium path | .trd-state/verification-artifacts/evidence/FS-14.txt | 1 |
| FS-15 | Selection is weighted toward each of three input kinds: reference UI screens make the design comparison the default; an interaction diagram or screen-to-screen journeys make the flow check the default; screens rendering API or store data make the data check the default | .trd-state/verification-artifacts/evidence/FS-15.txt | 1 |
| FS-16 | Selection is not hard-coded: an applicable check may be omitted with any stated reason, and the authoring guidance accepts any reason rather than a fixed list of allowed ones | .trd-state/verification-artifacts/evidence/FS-16.txt | 1 |
| FS-17 | `/audit-trd` reports a finding when a TRD's `## Verification Artifacts` section names a check skill that Ensemble does not ship | .trd-state/verification-artifacts/evidence/FS-17.txt | 1 |
| FS-19 | `/audit-trd` reports a real finding when a check the inputs call for is omitted from the section without a stated reason, and reports nothing for one omitted with a reason | .trd-state/verification-artifacts/evidence/FS-19.txt | 1 |
| FS-20 | On a TRD written before this change that has no `## Verification Artifacts` section, `/audit-trd` reports an advisory only, never a finding, and does not write the section into the TRD | .trd-state/verification-artifacts/evidence/FS-20.txt | 1 |
| FS-23 | The derive pass that writes the success definition stays source-only and TRD-blind; check criteria are appended after it, and each cites its design input, never the task list | .trd-state/verification-artifacts/evidence/FS-23.txt | 1 |
| FS-24 | Inside the verification loop, Exercise captures each check criterion's evidence by that check skill's procedure, and the Judge rules it using that skill's rubric | .trd-state/verification-artifacts/evidence/FS-24.txt | 1 |
| FS-25 | A check criterion the Judge rules `not_met` is handed to Debug and fixed like any other gap | .trd-state/verification-artifacts/evidence/FS-25.txt | 1 |
| FS-26 | `/verify-build` runs the selected checks inside its verification loop the same way `/implement-trd`'s verification step does | .trd-state/verification-artifacts/evidence/FS-26.txt | 1 |
| FS-27 | The verification readout links each check's page | .trd-state/verification-artifacts/evidence/FS-27.txt | 1 |
| FS-29 | The owner's comments on a check's page are read before the next fix batch and used as input to it | .trd-state/verification-artifacts/evidence/FS-29.txt | 1 |
| FS-30 | When a TRD has no `## Verification Artifacts` section, the verification step applies the weighted defaults to the PRD's inputs itself and reports each check it selected that way | .trd-state/verification-artifacts/evidence/FS-30.txt | 1 |
| FS-31 | When a TRD's section is silent on an applicable check (neither lists it nor omits it with a reason), the verification step selects it by default and reports that; a check the section omits with a stated reason is not re-added | .trd-state/verification-artifacts/evidence/FS-31.txt | 1 |
| FS-32 | A freshly scaffolded project ends with all three check skills in `.claude/skills/`, even when `.claude/selected-skills.txt` names none of them | .trd-state/verification-artifacts/evidence/FS-32.txt | 1 |
| FS-33 | An existing project that lacks the three check skills has all three in `.claude/skills/` after `scaffold-project.sh --refresh` | .trd-state/verification-artifacts/evidence/FS-33.txt | 1 |

## Not Met

| ID | Statement | Tier 1 | Reason | Blocker | Attempts |
|----|-----------|--------|--------|---------|----------|
| FS-18 | `/audit-trd` reports a finding when an input named in the section does not resolve |  | Tier-1 check failed: locator "and report a miss as a finding, check 'citation', action 'fix-citation'" not found in the artifact (the FS-18 excerpt is cut off mid-sentence at the per-span input lookup). Recapture a complete excerpt of the per-span input lookup in audit-trd.js, or a fixture run. | Tier-1 check failed: locator "and report a miss as a finding, check 'citation', action 'fix-citation'" not found in the artifact (the FS-18 excerpt is cut off mid-sentence at the per-span input lookup). Recapture a complete excerpt of the per-span input lookup in audit-trd.js, or a fixture run. |  |
| FS-22 | Each selected check adds one success-definition criterion per design screen, per journey and per data view, each passing on its own: a 32-frame design becomes 32 criteria, not one criterion with 32 parts |  | Tier-1 check failed: locator "one row per selected check, not a single criterion with N parts" is a paraphrase and does not appear in the artifact; the exerciser said so itself. Recapture with a literal locator from §8.1b / the skills' Criteria sections (e.g. "One row per designed journey"), or a produced success definition showing one row per frame. | Tier-1 check failed: locator "one row per selected check, not a single criterion with N parts" is a paraphrase and does not appear in the artifact; the exerciser said so itself. Recapture with a literal locator from §8.1b / the skills' Criteria sections (e.g. "One row per designed journey"), or a produced success definition showing one row per frame. |  |

## Not Verifiable

_None._

