# Functional Verification Report: verification-artifacts

**Source PRD**: docs/plan/verification-artifacts.investigation.md
**Success definition**: .trd-state/verification-artifacts/success-definition.md
**Outcome**: Unbuilt (no full-environment run declared)
**Reason**: 1 criterion absent (unbuilt), not misbehaving -- loop stops rather than debugging missing code. FS-21 (/plan mechanical check lacks advisory-only handling of a missing section) is unbuilt; FS-4, FS-16, FS-18, FS-28, FS-30 remain not_met because iteration 2 captured no fresh evidence.
**Criteria**: 33 total — 27 met, 5 not met, 0 not verifiable, 1 unbuilt
**Coverage**: 27 of 33 proven — uncovered: FS-4, FS-16, FS-18, FS-21, FS-28, FS-30

## Unbuilt

Implementation did not deliver these criteria. The loop stopped rather than debugging absent code (D14).

| ID | Statement | Reason |
|----|-----------|--------|
| FS-21 | `/plan`'s mechanical check for light TRDs reports a check the inputs call for that the section omits without a stated reason, and treats a missing section on an older TRD as advisory only | Debug reported this capability absent rather than broken: /plan's mechanical check (fix-audit.js checkVerificationArtifacts) treats a missing section as a finding (ok:false), and has no advisory-only path for older TRDs as /audit-trd does. |

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Ensemble ships a design ↔ build comparison skill in `packages/skills/`: a `SKILL.md` whose frontmatter has `name`, `description`, `when_to_use` and `allowed-tools`, and whose body says when it applies and names the inputs it needs | .trd-state/verification-artifacts/evidence/FS-1.txt | 1 |
| FS-2 | Ensemble ships a designed ↔ as-built interaction-flow skill in `packages/skills/`, same frontmatter format, stating when it applies and naming its inputs | .trd-state/verification-artifacts/evidence/FS-2.txt | 1 |
| FS-3 | Ensemble ships a data ↔ screen fidelity skill in `packages/skills/`, same frontmatter format, stating when it applies and naming its inputs | .trd-state/verification-artifacts/evidence/FS-3.txt | 1 |
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
| FS-17 | `/audit-trd` reports a finding when a TRD's `## Verification Artifacts` section names a check skill that Ensemble does not ship | .trd-state/verification-artifacts/evidence/FS-17.txt | 1 |
| FS-19 | `/audit-trd` reports a real finding when a check the inputs call for is omitted from the section without a stated reason, and reports nothing for one omitted with a reason | .trd-state/verification-artifacts/evidence/FS-19.txt | 1 |
| FS-20 | On a TRD written before this change that has no `## Verification Artifacts` section, `/audit-trd` reports an advisory only, never a finding, and does not write the section into the TRD | .trd-state/verification-artifacts/evidence/FS-20.txt | 1 |
| FS-22 | Each selected check adds one success-definition criterion per design screen, per journey and per data view, each passing on its own: a 32-frame design becomes 32 criteria, not one criterion with 32 parts | .trd-state/verification-artifacts/evidence/FS-22.txt | 1 |
| FS-23 | The derive pass that writes the success definition stays source-only and TRD-blind; check criteria are appended after it, and each cites its design input, never the task list | .trd-state/verification-artifacts/evidence/FS-23.txt | 1 |
| FS-24 | Inside the verification loop, Exercise captures each check criterion's evidence by that check skill's procedure, and the Judge rules it using that skill's rubric | .trd-state/verification-artifacts/evidence/FS-24.txt | 1 |
| FS-25 | A check criterion the Judge rules `not_met` is handed to Debug and fixed like any other gap | .trd-state/verification-artifacts/evidence/FS-25.txt | 1 |
| FS-26 | `/verify-build` runs the selected checks inside its verification loop the same way `/implement-trd`'s verification step does | .trd-state/verification-artifacts/evidence/FS-26.txt | 1 |
| FS-27 | The verification readout links each check's page | .trd-state/verification-artifacts/evidence/FS-27.txt | 1 |
| FS-29 | The owner's comments on a check's page are read before the next fix batch and used as input to it | .trd-state/verification-artifacts/evidence/FS-29.txt | 1 |
| FS-31 | When a TRD's section is silent on an applicable check (neither lists it nor omits it with a reason), the verification step selects it by default and reports that; a check the section omits with a stated reason is not re-added | .trd-state/verification-artifacts/evidence/FS-31.txt | 1 |
| FS-32 | A freshly scaffolded project ends with all three check skills in `.claude/skills/`, even when `.claude/selected-skills.txt` names none of them | .trd-state/verification-artifacts/evidence/FS-32.txt | 1 |
| FS-33 | An existing project that lacks the three check skills has all three in `.claude/skills/` after `scaffold-project.sh --refresh` | .trd-state/verification-artifacts/evidence/FS-33.txt | 1 |

## Not Met

| ID | Statement | Tier 1 | Reason | Blocker | Attempts |
|----|-----------|--------|--------|---------|----------|
| FS-4 | The three check skills are prompts only. None ships a script for cropping, diffing or page assembly; each tells the agent to write any such script itself at run time |  | Not re-exercised in iteration 2: the Exercise stage submitted no claims, so no fresh evidence exists to rule on. Iteration-1 finding still stands: No skill ships a script (ls shows only SKILL.md and __tests__), but only verify-data-fidelity says the agent writes any needed script itself at run time; verify-design-comparison (whose crop/diff/stitch step most needs one) and verify-flow-as-built carry no such line. The criterion requires each of the three to say it. (Debug edited verify-design-comparison and verify-flow-as-built SKILL.md, uncommitted, but the change was not captured as evidence.) |  | iter 1: not_met; iter 2: not_met |
| FS-16 | Selection is not hard-coded: an applicable check may be omitted with any stated reason, and the authoring guidance accepts any reason rather than a fixed list of allowed ones |  | Not re-exercised in iteration 2: the Exercise stage submitted no claims, so no fresh evidence exists to rule on. Iteration-1 finding still stands: Tier-1 failed: locator 'any stated reason is enough' not found in the artifact. The artifact text wraps it across a line break ('any stated reason\\nis enough'), so the claim needs a locator copied verbatim from a single line. |  | iter 1: not_met; iter 2: not_met |
| FS-18 | `/audit-trd` reports a finding when an input named in the section does not resolve |  | Not re-exercised in iteration 2: the Exercise stage submitted no claims, so no fresh evidence exists to rule on. Iteration-1 finding still stands: Tier-1 failed: locator 'naming the row's skill and the path' not found. The artifact (a copy of FS-17's) is cut off at '...action 'fix-citation', naming the', so the missing-input finding text is not in the evidence. |  | iter 1: not_met; iter 2: not_met |
| FS-28 | Each check's page is re-rendered from the check verdicts on every loop iteration and republished to the same URL, which is stored in `.trd-state/<feature>/artifacts.json` |  | Not re-exercised in iteration 2: the Exercise stage submitted no claims, so no fresh evidence exists to rule on. Iteration-1 finding still stands: Tier-1 failed: locator 're-renders that skill's page from the Judge's verdicts' not found in the artifact, so the per-iteration re-render and same-URL republish is unproven by the evidence. |  | iter 1: not_met; iter 2: not_met |
| FS-30 | When a TRD has no `## Verification Artifacts` section, the verification step applies the weighted defaults to the PRD's inputs itself and reports each check it selected that way |  | Not re-exercised in iteration 2: the Exercise stage submitted no claims, so no fresh evidence exists to rule on. Iteration-1 finding still stands: Tier-1 failed: locator 'record one DECISIONS line' not found; in the artifact it wraps across a line break ('record\\n   one DECISIONS line'). Re-claim with a single-line locator. |  | iter 1: not_met; iter 2: not_met |

## Not Verifiable

_None._

