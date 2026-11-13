# TRD: refine-recommended-option

**Source PRD**: None — small change decided by the owner, GitHub issue #59 (P0)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Every question `/refine-prd` (Phase 0 and Phase 2) and `/refine-trd` (Phase 0 and Phase 2) put to the owner in interactive mode marks one option "(Recommended)", lists it first and gives a one-line reason, or says plainly why there is no recommendation | issue #59; owner, 2026-11-04: "refine commands need to clearly state if there's a recommended path!" | yes |
| O2 | In a multi-select batch of findings the rule applies to each finding on its own, and each finding is explained in plain words, never by its id alone | issue #59, "Change" bullets 2 and 3 | yes |
| O3 | `/refine-verification` and `/refine-design` state the same rule in the same terms, so all four refine commands ask the same way | your instruction, 2026-11-13 | |
| O4 | The `.claude/commands/` copies of all four commands are byte-identical to `packages/core/commands/`, and a test pins the rule's wording in each | issue #59, "Done when" | |

## Intended Change

Today, as read from the files on 2026-11-13:

- `packages/core/commands/refine-prd.md` Phase 0 (line 37) asks for "real options … offer both"
  and never asks for a recommendation. Phase 2 (line 120) says only "present findings grouped
  by action, ask, apply". [read]
- `packages/core/commands/refine-trd.md` Phase 0 (lines 41–47) offers the author's assumption as
  "a default … one keystroke away" but does not mark it as recommended or require a reason.
  Phase 2 (line 145) has the same bare "present findings grouped by action, ask" line. [read]
- `packages/core/commands/refine-verification.md` line 155–157: "a recommended default is always
  one keystroke away". It implies a recommendation but does not require the label, the order,
  the reason, the no-recommendation case, item-by-item batches or plain words. [read]
- `packages/core/commands/refine-design.md` line 34–35: "Every question names one option
  "(Recommended)" and says why." It covers the label and the reason only. [read]

After: each of the four files carries one subsection, `### Putting a question to the owner`,
in its `## Modes` section, containing the rule text given under Decision, word for word. Every
place in the file where interactive mode asks (refine-prd and refine-trd: Phase 0 Interactive and
Phase 2 Interactive; refine-verification: `### Interactive` under Open items; refine-design: the
Modes paragraph) points at that subsection by name. A new Jest suite asserts that the
subsection and its key sentences are in each file, that each asking site points at it, and that
each `.claude/commands/` copy is byte-identical.

## Decision

One rule text, written identically into all four commands, so the four cannot drift apart
again. Each file carries the full text rather than pointing at a shared rule file. A command
prompt is read on its own; a pointer to another file is a lookup the model may skip.
`/refine-design` already shows that inline statement works. Rejected: a new section in
`autonomy.md`. That file governs when to ask, not how, and changing it would need owner
approval, and `autonomy.md` plus `async-discipline.md` must stay under the 17000-byte ceiling that
`refine-design-prose.test.js` enforces.

The rule text, verbatim (wrapping may differ; the words may not):

> ### Putting a question to the owner
>
> **Every question states a recommendation.** Each question in an `AskUserQuestion` call marks
> one option "(Recommended)", lists it first, and gives a one-line reason for it in that
> option's description (a multi-select batch of findings marks each finding instead, below).
> When no option is better than the others (the evidence supports each reading equally, or the
> choice is purely the owner's preference), say so plainly in the question text, and say why,
> rather than marking one at random.
>
> **Base the recommendation on what this command already does, not on taste.** For an open
> question, recommend the author's recorded assumption, or the default this command names for
> it, unless evidence you can cite says otherwise. For a finding, recommend what the
> non-interactive mode would do with it. Where that mode would stop rather than decide (a
> contradiction it reports as STUCK), or does nothing with the finding, there is no
> recommendation to borrow: say so, as above. A recommendation is held to the same sourcing as a
> finding: cite what supports it, never judgment alone.
>
> **In a multi-select batch of findings, the rule applies to each finding.** Mark
> "(Recommended)" on every finding you recommend applying and list those first. A question
> holds at most four options, so put at most four findings in one question, group them by
> action, and split a larger batch across questions (up to four per call). A question also needs
> at least two options, so ask a finding left alone in its group as its own apply-or-skip
> question. The option's label
> carries a short plain name and the id. Its description carries what the finding is, what
> applying it changes, and why you do or do not recommend it.
>
> **Explain each item in plain words, never by its id alone.** Write "the uptime target nothing
> in the source asks for (NFR-3)", not "NFR-3". The owner has to be able to decide from the
> question alone, without opening the artifact.
>
> This is the owner's rule (2026-11-04): "refine commands need to clearly state if there's a
> recommended path!" It exists because a batch of findings sent with no recommendations cost a
> second round of questions.

In refine-verification, "the non-interactive mode" is `--auto`. In refine-design, it is the
default `--auto` records under `## Decisions taken by default`. The general wording covers
both, so the text stays identical across all four files.

At each asking site, add one sentence: "Follow **Putting a question to the owner**, above."
The asking sites are: refine-prd and refine-trd, Phase 0 Interactive and Phase 2 Interactive;
refine-verification, `### Interactive` under Open items **and** the must-pass owner ruling under
Derive → Owner rulings ("Interactive, ask the owner", line 124), which becomes "Interactive,
ask the owner, following **Putting a question to the owner**, above;"; refine-design, its
Modes paragraph. refine-trd Phase 0 says "one question per call" and then "Batch related
questions into one call". The rule's "each question in an `AskUserQuestion` call" works under
either reading, so that line is left as it is.
In refine-design, replace "Every question names one option "(Recommended)" and says why." with
"Every question names one option "(Recommended)" and says why, as **Putting a question to the
owner**, below, sets out." That keeps the phrase `refine-design-prose.test.js` already pins
(`/names? one option "\(Recommended\)"/`).

`packages/full/commands/core` is a symlink to `packages/core/commands`, so the full-plugin copy
needs no edit. [ran: `ls -la packages/full/commands`]

## Non-Goals

- No change to `--auto` / non-interactive behaviour of any refine command; they ask nothing.
- No change to `autonomy.md`, `command-status.md` or any rule file.
- No change to `verification-setup` / `design-setup` skills, which also ask, but are outside
  this issue.
- No wording change to the existing Phase 0/Phase 2 content beyond the added pointer sentence.

## Verification Artifacts

None apply — the change is command prose with no UI, data screen, design or flow; it is proven by the Jest suite that pins it.

## Verification Environment
**Environment**: local
**Refresh**: nothing — tests read the working tree
**Cannot be checked there**: whether a live interactive refine session actually follows the rule. That needs a model session answering `AskUserQuestion`, which nothing in this run drives.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add the `### Putting a question to the owner` subsection (verbatim text from `## Decision`) to the `## Modes` section of refine-prd.md, refine-trd.md, refine-verification.md and refine-design.md in `packages/core/commands/`. Add the pointer sentence at every interactive asking site, copy all four files to `.claude/commands/`, and add `packages/core/commands/refine-recommend-prose.test.js` pinning the rule | O1, O2, O3, O4 | None | (1) Each of the four files contains the heading `### Putting a question to the owner` and the phrases `marks one option "(Recommended)"`, "lists it first", "one-line reason", "say so plainly in the question text", "the author's recorded assumption", "what the non-interactive mode would do", "at most four findings in one question", "the rule applies to each finding" and "never by its id alone". These tests fail on today's files. (2) The subsection, from its heading to the next heading, with whitespace collapsed, is identical in all four files. (3) Each asking site, tested in its own slice, contains "Putting a question to the owner": refine-prd and refine-trd Phase 0 and Phase 2, each sliced by its phase heading; refine-verification `### Interactive` and the must-pass owner-ruling bullet; refine-design's "conditional on mode" paragraph alone, not the whole Modes section. Removing any one pointer fails the test. (4) `.claude/commands/<name>.md` is byte-identical to `packages/core/commands/<name>.md` for all four. This guards against regressions only; it passes today. (5) The existing `refine-design-prose.test.js`, `refine-verification-must-pass.test.js` and `verify-command-surface.test.js` still pass, and the full Jest (`npx jest`) and BATS batteries pass |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/commands/refine-prd.md`, `packages/core/commands/refine-trd.md`, `packages/core/commands/refine-verification.md`, `packages/core/commands/refine-design.md`, `.claude/commands/refine-prd.md`, `.claude/commands/refine-trd.md`, `.claude/commands/refine-verification.md`, `.claude/commands/refine-design.md`, `packages/core/commands/refine-recommend-prose.test.js`
- **Reuse:** the prose-test pattern of `packages/core/commands/refine-design-prose.test.js`: read the file, flatten whitespace with `.replace(/\s+/g, ' ')`, assert phrases, and assert mirror parity with `toBe(raw)` [read]
- **Replaces:** refine-design.md line 34–35's one-sentence statement of the rule. It is kept, but now extended to point at the full subsection, and it must keep matching `/names? one option "\(Recommended\)"/` [read]
- **Follow:** insert the subsection as the last thing in `## Modes`, right after the "autonomy exemption is conditional on mode" paragraph. In refine-design it goes after that paragraph and before `### --auto: decisions, answers and audit findings`. Prose wraps at about 95 columns, like the surrounding text. Mirror with `cp`, never by hand [read]
- **Careful:** refine-prd has two identical `**Interactive:**` markers (Phase 0 and Phase 2), so slice by phase heading. `verify-command-surface.test.js` line ~1890 checks every command for hand-edit instructions about `artifacts.json`, so the new text must not mention artifacts.json. `notify-on-complete.test.sh` L2 compares `.claude/commands` mirrors with the canonical copies, so a missed `cp` fails BATS too [read]

## Could Not Verify

As of the delivered-code audit, 2026-11-13. Confirmed built and tested, and so not listed here:
the shared subsection in all four commands, every pointer at an asking site (including
refine-verification's must-pass owner ruling), the `.claude/commands/` mirrors, and
`refine-recommend-prose.test.js` passing, with `refine-design-prose.test.js`,
`refine-verification-must-pass.test.js` and `verify-command-surface.test.js` still passing.

- Whether a live interactive `/refine-prd`, `/refine-trd`, `/refine-verification` or
  `/refine-design` session now produces recommended options. The prompt states the rule, but
  obedience is model behaviour, which nothing in the audit exercises (see Verification
  Environment). Out of scope for a code audit.
- Fidelity to a product requirement. This change has no PRD (it comes from issue #59), so the
  audit checked the delivered code against this TRD only; whether the TRD captures everything
  the issue asks for was not checked.
- Acceptance criterion (5)'s "full Jest and BATS batteries pass". The audit re-ran the four suites
  named above, not the full batteries; the phase checkpoint recorded 7 suites failing for
  environment reasons only, which nothing here re-examined.
