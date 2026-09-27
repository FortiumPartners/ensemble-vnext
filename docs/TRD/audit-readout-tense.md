# TRD: audit-readout-tense

**Source PRD**: None — small change decided in session (2026-09-26)
**Weight**: small
**Kind**: change

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | A reader can tell, per line of an audit readout, whether the command already changed the document or whether that line needs them | your instruction, 2026-09-26 |
| O2 | `/audit-build`'s readout distinguishes the three destinations it genuinely has: corrected here, handed to `/implement-trd --reconcile`, and stopped because it needs a design decision | your instruction, 2026-09-26 |
| O3 | A reader is told that claims went unchecked, on its own line, without the readout reproducing the document section that lists them | your instruction, 2026-09-26 |

## Intended Change

All three audit commands instruct **"Apply what survives"** — they edit the document they
audit. Their readout headings are nevertheless imperatives addressed to the reader:

    DELETE — nothing in the source asks for these
    ADD BACK — in the source, missing from this document
    FIX THE CITATION — referenced ID does not resolve

So a reader cannot distinguish work already done from work handed to them. Observed in a real
`/audit-trd` readout, where the author bolted `(fixed)` onto
`CANNOT BE BUILT AS WRITTEN (fixed)` because the heading alone implies the opposite — while
`REJECTED THESE FINDINGS` in the same block was already past tense.

**After this change**, a heading applied by the audit is past tense; a heading needing the
owner stays imperative. No grouping headings are added:

| Now | After | Why |
|---|---|---|
| `DELETE` | `DELETED` | the audit removes it |
| `LOWER TO THE CONSTITUTION FLOOR, or say why it's higher` | `LOWERED TO THE CONSTITUTION FLOOR — no reason was given for exceeding it` | "or say why" is an instruction to the TRD's author, not a readout outcome: if a reason was given there is no finding. Always applied. |
| `ADD BACK` | `ADDED BACK` | the audit restores it |
| `FIX THE CITATION` | `FIXED THE CITATION` | mechanical |
| `THE DOC IS STALE` | `CORRECTED A STALE CLAIM` | "the code wins" is settled policy, so the direction of correction is not a judgement |
| `CANNOT BE BUILT AS WRITTEN` | **splits in two**: `REDESIGNED — could not be built as written` / `CANNOT BE BUILT — needs a design decision` | genuinely both-valued: sometimes an edit fixes it, sometimes inventing a replacement mechanism would be manufacturing design |
| `PICK ONE — these contradict` | unchanged | resolving a contradiction is the owner's |
| `CONFIRM THESE ARE WANTED` | unchanged | the owner's |
| `ALREADY BUILT` (`/audit-prd`) | unchanged | deciding whether the requirement survives is the owner's |

For O3, the readout reuses the spelling the clean path already emits — `CAVEAT` — and points
at the document rather than reprinting it:

    CAVEAT — 11 claims went unchecked; see the TRD's ## Could Not Verify

## Decision

**Rename in place. No grouping headings.** An earlier draft of this TRD grouped the headings
under `WHAT THE AUDIT CHANGED` / `WHAT NEEDS YOU` / `NOT CHECKED`. Rejected after the
adversarial pass, on three grounds it evidenced:

1. The grouping duplicates `command-status.md`'s own partition — STATE is "what is true on
   disk now", ISSUES is "what needs the owner; each one says who acts", NEXT is "the literal
   next command". The audit block "fills those sections; it does not replace them", so every
   `WHAT NEEDS YOU` item would appear twice under two headings meaning the same thing. [read]
2. It adds four to five heading lines to a block governed by "One screen", while this TRD's
   own reservation is that the block already hides too much. [read]
3. It does not resolve the both-valued headings — it relocates the ambiguity from "which
   tense?" to "which group?". The table above resolves them instead. [inferred]

**The edits go in the WORKFLOW scripts as well as the command prompts, and the workflow is the
one that matters.** `audit-trd.md:102` names the command's own heading list as the fallback
"if the workflow is unavailable"; the workflow's copy says "Use **exactly** these headings".
The first draft of this TRD edited only the command prompts — every readout the command
actually prints would have been unchanged, and all three acceptance criteria would still have
passed. [ran]

NOT absorbed, reported instead: **the heading vocabulary has no single owner.** It is written
twice per command with no parity check between the two layers, and has already drifted —
`REJECTED THESE FINDINGS` exists in `audit-trd.md` and not in `audit-trd.js` (verified by
count: 1 and 0). Unifying them, or adding a parity test between the `.md` and `.js` copies, is
a separate fix: the counterfactual says this work succeeds with the duplication still present.
`runtime-integrity.test.sh` already guards `packages/core` ↔ `.claude` drift for both
directories, so only the cross-layer gap is unguarded. [ran]

NOT a `VERDICT:` line. The reader's complaint was per-line; a verdict sits above the lines and
would not have removed the need for that `(fixed)` annotation. Deferred as additive — OQ-1.

NOT touching `.claude/rules/command-status.md`. Confirmed: it prescribes no heading tense, and
dropping the grouping removes the collision with its four sections that made it a question. [ran]

## Non-Goals

- No change to what any audit CHECKS, or to any verifier.
- No change to the four-section readout in `command-status.md`.
- No unification of the command/workflow heading lists, and no new parity test — reported above
  as a separate finding.
- No renaming of `/audit-build`'s finding categories (`MISMATCH`, `TRACEABILITY GAPS`); they are
  noun phrases already. Only their destination is stated.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Add a `VERDICT:` line on top of the tense fix? | Deferred — the tense fix is the root cause; a verdict is additive | owner-only |
| OQ-2 | `UNTESTED-IN-PRACTICE` in `/audit-build` fits none of the three destinations: a tautological test for an already-built requirement maps to no pending task, so it is neither reconcilable nor a design decision. | Left in place with no destination stated, rather than forcing it into one | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Rename `/audit-trd`'s readout headings to past tense where the audit applies them, split `CANNOT BE BUILT AS WRITTEN` into applied and handed-back forms, add the `CAVEAT` unchecked-claims line, and qualify the "names the ACTION" sentence to mean the action the command took — in the workflow script AND the command prompt | O1, O3 | None | In `packages/core/workflows/audit-trd.js` AND `packages/core/commands/audit-trd.md`: `grep -c "DELETE — nothing in the source"` is 0 and `DELETED` is present; `REDESIGNED` and `CANNOT BE BUILT — needs a design decision` both present; `CAVEAT` present in the findings-path heading list; `PICK ONE` still present and still imperative. All four files (both copies of each) byte-identical to their mirror |
| FIX-002 | Apply the same renames to `/audit-prd`, keeping `ALREADY BUILT` imperative, in workflow script and command prompt | O1, O3 | FIX-001 | In `packages/core/workflows/audit-prd.js` AND `packages/core/commands/audit-prd.md`: `ADD BACK` absent, `ADDED BACK` present; `ALREADY BUILT` present and unchanged; `CAVEAT` present; mirrors byte-identical |
| FIX-003 | State each `/audit-build` heading's destination — corrected here, handed to `/implement-trd --reconcile`, or stopped for a design decision — in workflow script and command prompt | O2 | FIX-001 | In `packages/core/workflows/audit-build.js` AND `packages/core/commands/audit-build.md`: the block names `/implement-trd --reconcile` as the destination for tasks in the TRD that were not built, and states that a requirement no task covers is reported rather than closed; `--report-only` noted as suppressing the handoff; mirrors byte-identical |
| AMEND-001 | Add a VERDICT line as the FIRST line of all three audit readout blocks, below the `AUDIT:`/`SOURCE:` header and above the heading list: one of `safe to proceed`, `proceed with these caveats: <named>`, or `do not proceed until <named>`. Resolves OQ-1 — owner approved 2026-09-26 | O1 | None | In all six files (`packages/core/{workflows/audit-trd.js,workflows/audit-prd.js,workflows/audit-build.js,commands/audit-trd.md,commands/audit-prd.md,commands/audit-build.md}`) and their `.claude/` mirrors: a VERDICT line is present, it appears BEFORE the first heading in the block, all three forms are offered, and each mirror is byte-identical to its source. `grep -c VERDICT` returns non-zero in all twelve |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/workflows/audit-trd.js`, `.claude/workflows/audit-trd.js`, `packages/core/commands/audit-trd.md`, `.claude/commands/audit-trd.md`
- **Reuse:** the heading list at `audit-trd.js:498-512` (primary) and `audit-trd.md:114-130` (fallback). Keep the `AUDIT: <path>    SOURCE: <path>` header and the closing "One screen" sentence. Reuse `CAVEAT`, already emitted by the clean-path template at `audit-trd.js:460`, rather than coining a new word for the same fact. [ran]
- **Replaces:** the imperative forms in both layers, and the bare sentence "Every line names the ACTION, not the classification." [read]
- **Follow:** edit the `packages/core/` copy and the vendored `.claude/` copy in the same change. `runtime-integrity.test.sh` asserts parity for both `commands/` and `workflows/` by directory comparison and will fail if one side moves alone — it caught exactly this omission on `status.js` earlier today. [ran]
- **Careful:** the two layers have ALREADY drifted (`REJECTED THESE FINDINGS`: 1 in the `.md`, 0 in the `.js`). Do not silently reconcile that difference while renaming — rename what is there in each file and leave the drift for the separate fix named in `## Decision`. [ran]
- **Careful:** no test asserts any heading string, so only the mirror check will catch a half-applied edit. [ran]

### FIX-002
- **Touches:** `packages/core/workflows/audit-prd.js`, `.claude/workflows/audit-prd.js`, `packages/core/commands/audit-prd.md`, `.claude/commands/audit-prd.md`
- **Reuse:** the wording FIX-001 settles — copy it rather than re-inventing phrasing, since consistency across the three readouts is the objective [inferred]
- **Replaces:** the imperative forms at `audit-prd.js:419-432` and `audit-prd.md:126-142` [read]
- **Follow:** mirror both copies, as FIX-001 [ran]
- **Careful:** `/audit-prd`'s list differs from `/audit-trd`'s — it has `ALREADY BUILT` where the TRD audit has `CANNOT BE BUILT AS WRITTEN`, and its `CONFIRM THESE ARE WANTED` gloss differs between its own two layers ("no objective named" vs "no source names them"). Do not homogenise either difference. [read]

### FIX-003
- **Touches:** `packages/core/workflows/audit-build.js`, `.claude/workflows/audit-build.js`, `packages/core/commands/audit-build.md`, `.claude/commands/audit-build.md`
- **Reuse:** the three destinations this command already documents in prose at `audit-build.md:110-118` — it rewrites the TRD's `## Could Not Verify` itself, chains task-shaped gaps via `/implement-trd --reconcile`, and stops on requirements no task covers because "a command that invents tasks to close its own findings is manufacturing requirements" [read]
- **Replaces:** the ungrouped heading list at `audit-build.js:475-486` and `audit-build.md:175-186` [read]
- **Follow:** mirror both copies, as FIX-001 [ran]
- **Careful:** this command fixes almost nothing its headings name — `audit-build.md:98` says it "does not write application code or tests". So four of its seven headings are never "corrected here". Do not force them into that destination. [read]
- **Careful:** `--report-only` suppresses the chain. When passed, the readout must not claim work was handed off. [read]

### AMEND-001

- **Touches:** `packages/core/workflows/audit-trd.js`, `packages/core/workflows/audit-prd.js`, `packages/core/workflows/audit-build.js`, `packages/core/commands/audit-trd.md`, `packages/core/commands/audit-prd.md`, `packages/core/commands/audit-build.md`, `.claude/workflows/audit-trd.js`, `.claude/workflows/audit-prd.js`, `.claude/workflows/audit-build.js`, `.claude/commands/audit-trd.md`, `.claude/commands/audit-prd.md`, `.claude/commands/audit-build.md`
- **Reuse:** the readout block each of the six files already carries — the `AUDIT: <path>    SOURCE: <path>` header line, then the heading list. The VERDICT line goes between them. `/audit-build`'s header reads `AUDIT-BUILD: <trd path>    PRD: <path>` instead; keep each file's own header wording. [read]
- **Replaces:** nothing. This is additive — the first thing in this change that is. [inferred]
- **Follow:** edit each `packages/core/` file and its vendored `.claude/` copy in the same change; `runtime-integrity.test.sh` asserts parity by directory comparison and fails if one side moves alone. [ran]
- **Careful:** the verdict must be a VERDICT, not a restatement of the counts. `safe to proceed` and `proceed with these caveats` are different answers and the caveats must be NAMED inline, not merely counted — an unnamed caveat is the opacity this whole change exists to remove. [inferred]
- **Careful:** `/audit-build` has three destinations rather than two outcomes, so its verdict speaks to whether the DELIVERED CODE matches, not to whether a document is safe to act on. Do not copy the other two's wording verbatim there. [read]

## Could Not Verify

- Whether the renamed readout actually reads better in a live run. This changes an instruction
  to a model, not code with an assertable output, so the only real test is the next `/audit-*`
  run against a real artifact. The acceptance criteria prove the instruction changed in the
  path that is used — which the first draft of this TRD would not have.
- Whether `NO ACTION — sourced, listed for completeness` should print more than a count. Your
  original complaint included five findings that "needed no change" and were invisible; the
  existing rule ("print the count as one line, not forty") is right for 40 clean objectives and
  arguably wrong at 5 of 9. Not resolved here: it trades against the one-screen limit, and it is
  a different change from tense.
- Whether the clean-path template's `NO ACTION` and the findings-path heading list will now
  disagree in vocabulary. FIX-001 renames the findings-path list; the clean-path template at
  `audit-trd.js:457-461` is assembled in JavaScript and is NOT in scope. Both spell it
  `NO ACTION`, so they agree today — but nothing checks that they stay agreed.
