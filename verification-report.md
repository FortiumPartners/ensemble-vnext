# Functional Verification Report: refine-recommended-option

**Source PRD**: docs/TRD/refine-recommended-option.md § Intended Change
**Success definition**: .trd-state/refine-recommended-option/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 23 total — 23 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 23 of 23 proven — uncovered: none
**Must pass**: 15 of 15 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Each of the 4 refine command files has exactly one `### Putting a question to the owner` heading, and it sits inside that file's `## Modes` section | .trd-state/refine-recommended-option/evidence/fs1-headings.txt | 1 |
| FS-2 | The body of the `### Putting a question to the owner` subsection is the same text, word for word, in all 4 files, and matches the rule text under Decision in the Intended Change | .trd-state/refine-recommended-option/evidence/fs2-diffs.txt | 1 |
| FS-3 | The subsection, in each of the 4 files, requires that a question mark one option "(Recommended)" | .trd-state/refine-recommended-option/evidence/sub-prd.txt | 1 |
| FS-4 | The subsection, in each of the 4 files, requires that the recommended option be listed first | .trd-state/refine-recommended-option/evidence/sub-prd.txt | 1 |
| FS-5 | The subsection, in each of the 4 files, requires that the recommendation come with a reason | .trd-state/refine-recommended-option/evidence/sub-prd.txt | 1 |
| FS-6 | The subsection, in each of the 4 files, covers the case where no option is recommended, saying what the question does instead | .trd-state/refine-recommended-option/evidence/sub-prd.txt | 1 |
| FS-7 | The subsection, in each of the 4 files, says that in a batch of several items the rule applies to each item on its own | .trd-state/refine-recommended-option/evidence/sub-prd.txt | 1 |
| FS-8 | The subsection, in each of the 4 files, requires that each item put to the owner be explained in plain words | .trd-state/refine-recommended-option/evidence/sub-prd.txt | 1 |
| FS-9 | In `refine-prd.md`, the Phase 0 interactive instruction (where open questions are put to the owner) names `Putting a question to the owner` | .trd-state/refine-recommended-option/evidence/fs9-14-sites.txt | 1 |
| FS-10 | In `refine-prd.md`, the Phase 2 interactive instruction (where findings are presented and the owner is asked) names `Putting a question to the owner` | .trd-state/refine-recommended-option/evidence/fs9-14-sites.txt | 1 |
| FS-11 | In `refine-trd.md`, the Phase 0 `### Interactive` instruction names `Putting a question to the owner` | .trd-state/refine-recommended-option/evidence/fs9-14-sites.txt | 1 |
| FS-12 | In `refine-trd.md`, the Phase 2 interactive instruction names `Putting a question to the owner` | .trd-state/refine-recommended-option/evidence/fs9-14-sites.txt | 1 |
| FS-13 | In `refine-verification.md`, the `### Interactive` block under `## Open items` names `Putting a question to the owner` | .trd-state/refine-recommended-option/evidence/fs9-14-sites.txt | 1 |
| FS-14 | In `refine-design.md`, the `## Modes` paragraph that describes interactive asking names `Putting a question to the owner` | .trd-state/refine-recommended-option/evidence/fs9-14-sites.txt | 1 |
| FS-15 | A new Jest suite exists for this change and passes | .trd-state/refine-recommended-option/evidence/fs15-jest.txt | 1 |
| FS-16 | That suite asserts, for each of the 4 files, that the `### Putting a question to the owner` subsection and its key sentences are present | .trd-state/refine-recommended-option/evidence/fs15-jest.txt | 1 |
| FS-17 | That suite asserts that each asking site named in FS-9 to FS-14 points at the subsection | .trd-state/refine-recommended-option/evidence/fs15-jest.txt | 1 |
| FS-18 | That suite asserts that each `.claude/commands/` copy of the 4 files is byte-identical to its `packages/core/commands/` source | .trd-state/refine-recommended-option/evidence/fs15-jest.txt | 1 |
| FS-19 | Each of the 4 `.claude/commands/refine-*.md` copies is byte-identical to its `packages/core/commands/` source | .trd-state/refine-recommended-option/evidence/fs19-cmp.txt | 1 |
| FS-20 | In an interactive `/refine-prd` run, every Phase 0 question put to the owner marks one option "(Recommended)", lists it first and gives a reason, or says plainly why no option is recommended | .trd-state/refine-recommended-option/evidence/fs20-21-refine-prd-askuserquestion-inputs.txt | 1 |
| FS-21 | In an interactive `/refine-prd` run, when Phase 2 puts several findings to the owner in one multi-select batch, each finding is explained in plain words and carries its own recommendation and reason (or its own statement of why none) | .trd-state/refine-recommended-option/evidence/fs20-21-refine-prd-askuserquestion-inputs.txt | 1 |
| FS-22 | In an interactive `/refine-trd` run, every Phase 0 question put to the owner marks one option "(Recommended)", lists it first and gives a reason, or says plainly why no option is recommended | .trd-state/refine-recommended-option/evidence/fs22-23-refine-trd-askuserquestion-inputs.txt | 1 |
| FS-23 | In an interactive `/refine-trd` run, when Phase 2 puts several findings to the owner in one multi-select batch, each finding is explained in plain words and carries its own recommendation and reason (or its own statement of why none) | .trd-state/refine-recommended-option/evidence/fs23b-refine-trd-askuserquestion-inputs.txt | 2 |

## Not Met

_None._

## Not Verifiable

_None._

