# Functional Verification Report: plan-weight-router

**Source PRD**: docs/PRD/plan-weight-router.md
**Success definition**: .trd-state/plan-weight-router/success-definition.md
**Outcome**: Satisfied (updated after three live smoke runs)
**Reason**: 29 of 32 criteria met — 26 from read-derived evidence plus FS-9, FS-19 and FS-24 from three executed live smoke runs. The remaining 3 all concern the open-question channel, which no smoke scenario plants. No gaps, nothing unbuilt.
**Criteria**: 32 total — 29 met, 0 not met, 3 not verifiable, 0 unbuilt

**Live-run update.** Three opt-in smoke scenarios were executed (plan-light-fix 9/9, plan-decoy-root-cause 10/10, plan-medium-weight 8/8), closing FS-9, FS-19 and FS-24 by OBSERVED behaviour rather than by code reading. FS-20, FS-21 and FS-22 remain not verifiable: all three concern open questions, and no scenario plants one. The earlier reason for those six — that no environment was authorized for a live session — was overtaken by the owner authorizing the opt-in LLM set.

## Met

| ID | Statement | Artifact |
|----|-----------|----------|
| FS-1 | The `kind` axis accepts exactly `defect`, `change` and `refactor`; a fourth value is rejected rather than silently coerced | .trd-state/plan-weight-router/evidence/FS-1-2-3-axis-transcript.txt |
| FS-2 | The `weight` axis accepts exactly `trivial`, `small` and `medium`; a fourth value is rejected | .trd-state/plan-weight-router/evidence/FS-1-2-3-axis-transcript.txt |
| FS-3 | `feature` is not accepted as a value of `kind` or of `weight` — it is a routing outcome, not an axis member | .trd-state/plan-weight-router/evidence/FS-1-2-3-axis-transcript.txt |
| FS-4 | None of the nine `kind` x `weight` cells carries an individual name in code, in the command's prose, or in a run's output | .trd-state/plan-weight-router/evidence/FS-4-no-cell-names.txt |
| FS-5 | At `trivial`, the stage list is exactly: write a light TRD, then implement | .trd-state/plan-weight-router/evidence/FS-5-6-7-8-stage-lists.txt |
| FS-6 | At `small`, the stage list is everything `trivial` runs plus an adversarial pass | .trd-state/plan-weight-router/evidence/FS-5-6-7-8-stage-lists.txt |
| FS-7 | At `medium`, the stage list is everything `small` runs plus grounding and an audit | .trd-state/plan-weight-router/evidence/FS-5-6-7-8-stage-lists.txt |
| FS-8 | `trivial` and `small` run NO audit stage — a deliberate reduction against `/investigate`'s unconditional audit, not an oversight | .trd-state/plan-weight-router/evidence/FS-5-6-7-8-stage-lists.txt |
| FS-10 | No `weight` produces an outcome whose action is "stop and wait for a human decision" | .trd-state/plan-weight-router/evidence/FS-1-2-3-axis-transcript.txt |
| FS-11 | The only differences between the three weights are stage count and review depth — never permission | .trd-state/plan-weight-router/evidence/FS-11-permission-parity.txt |
| FS-12 | A `medium` `refactor` runs its named tests before AND after the change, and both runs are recorded | .trd-state/plan-weight-router/evidence/FS-12-16-verification-grid.txt |
| FS-13 | A `medium` `refactor` checks that the public surface has not moved | .trd-state/plan-weight-router/evidence/FS-12-16-verification-grid.txt |
| FS-14 | A `medium` `change` is verified against the stated outcome and is NOT asked for a before-run | .trd-state/plan-weight-router/evidence/FS-12-16-verification-grid.txt |
| FS-15 | A `refactor` is never asked for a root cause | .trd-state/plan-weight-router/evidence/FS-12-16-verification-grid.txt |
| FS-16 | A `defect` at `medium` is asked for a demonstrated root cause | .trd-state/plan-weight-router/evidence/FS-12-16-verification-grid.txt |
| FS-17 | The decision to route to `/create-prd` is stated in terms of what the PRD would contain — personas, user value, trade-offs about what to build — not in terms of task or file count | .trd-state/plan-weight-router/evidence/FS-17-18-content-vs-count.txt |
| FS-18 | Neither `MAX_TASKS` nor the touched-file ceiling participates in the decision of whether a PRD is needed | .trd-state/plan-weight-router/evidence/FS-17-18-content-vs-count.txt |
| FS-23 | The delivered step one adds no new workflow script under `packages/core/workflows/` | .trd-state/plan-weight-router/evidence/FS-23-25-29-30-delivered-state.txt |
| FS-25 | `/plan` exists as its own command file, and `/investigate` no longer appears as a separate entry point | .trd-state/plan-weight-router/evidence/FS-23-25-29-30-delivered-state.txt |
| FS-26 | Every surface naming `/investigate` is updated in the same release — the 18 command files, the router hint in `router.py`, `CLAUDE.md`, `process.md`, the templates under `packages/core/templates/`, and the vendored `.claude/` copies | .trd-state/plan-weight-router/evidence/FS-26-investigate-surfaces.md |
| FS-27 | At feature weight, `/plan` INVOKES `/create-prd` rather than printing a pointer to it, then stops | .trd-state/plan-weight-router/evidence/FS-27-28-32-command-text-reads.md |
| FS-28 | `/create-trd` and `/create-prd` keep separate identities in this release — neither is collapsed into `/plan` | .trd-state/plan-weight-router/evidence/FS-27-28-32-command-text-reads.md |
| FS-29 | No stage prompt has been extracted to a contract except as part of an edit that stage was already receiving | .trd-state/plan-weight-router/evidence/FS-23-25-29-30-delivered-state.txt |
| FS-30 | No stage logic is shared between workflow scripts by `require` — the pattern is a contract plus a dumb dispatcher receiving assembled prompts in `args` | .trd-state/plan-weight-router/evidence/FS-23-25-29-30-delivered-state.txt |
| FS-31 | The 6-task / 10-file ceiling is not raised — `MAX_TASKS` remains 6 and the touched-file ceiling remains 10 | .trd-state/plan-weight-router/evidence/FS-31-ceiling-judgment.md |
| FS-32 | No `transcript` input is exposed as the middle path: `/create-trd` gains no `--transcript` flag and its existing `transcript` argument acquires no caller | .trd-state/plan-weight-router/evidence/FS-27-28-32-command-text-reads.md |
| FS-9 | No stage of any weight stops to ask the owner to authorise continuing | live: all three scenarios reached a terminal banner under `claude --print`, which cannot accept a user turn |
| FS-19 | Work of 12-18 tasks carrying no product decision routes to `medium` and does not reach `/create-prd` | live: plan-medium-weight — 14 route handlers sized to medium, 2-phase TRD, no /create-prd |
| FS-24 | A run emits exactly one `COMMAND COMPLETE` banner — one per run, not one per chained command | live: plan-medium-weight — asserted exactly one COMMAND COMPLETE banner |

## Not Met

_None._

## Not Verifiable

| ID | Statement | Reason |
|----|-----------|--------|
| FS-20 | The presence of an open question does not by itself route work to `/create-prd` | Needs a live run's readout. Same unauthorized-environment reason as FS-9. Structurally supported by route()'s signature having no openQuestionCount parameter (FS-18's evidence), but that is a different claim from an observed run. |
| FS-21 | Open questions written by this path are parsed by `trd-parser.js`'s `openQuestions` with `ownerOnly`, and reach task prompts as `<open_question>` | Needs a TRD that /plan itself authored, which needs a live run. A synthetic fixture would re-test trd-parser.js's own covered behaviour rather than /plan's output shape reaching it. Same unauthorized-environment reason as FS-9. |
| FS-22 | At `medium` with open questions, `/refine-trd` is named in the readout and NOT invoked, and no stage waits for it | Needs a live medium-weight readout and transcript. Same unauthorized-environment reason as FS-9. Partially supported by the refineTrdRecommended flag being true only at change/medium with an open question. |

