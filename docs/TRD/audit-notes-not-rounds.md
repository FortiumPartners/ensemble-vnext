# TRD: audit-notes-not-rounds

**Source PRD**: None — small change decided in session (owner instruction, 2026-10-21)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A gap on a task the TRD lists under `## Deferred by design` is recorded as a note ("planned, not built yet"), never counted as a defect or test gap, never chained to a fix run, and never the reason for another audit round | your instruction, 2026-10-21; measured in forge-vnext pm-interface, where the deferred live check PMI-T003 was the one "defect" in all three rounds | yes |
| O2 | A stale citation (wrong line number, path or id) or descriptive wording that the code contradicts, anywhere in the TRD, is fixed in place in the same audit run and recorded as a note; it is never counted, chained or re-audited | your instruction, 2026-10-21; pm-interface carried the stale PMI-P002 row ("the code is right") through three rounds unfixed | yes |
| O3 | Only a product defect (code that is missing or does something other than required, on a task that is not deferred) opens another round; the round cap, the "do not proceed" rule and test-gap handling are unchanged otherwise | your instruction, 2026-10-21 | |

## Intended Change

Today, `audit-rounds.js` `classify()` turns any `gap-unbuilt` into a defect, whatever task it is
on, and `decide()` re-audits while defects are open. A task the TRD deliberately defers is never
dispatched by `/implement-trd` (§4.1a), so it is always "unbuilt", and the feature can never close
on its own: pm-interface hit the cap with exactly that one defect in each of its three rounds.

Separately, the reconcile stage of `audit-build.js` may fix a citation only inside the TRD's
Could Not Verify section ("this step edits no other section"). Every other stale citation or
wording slip is carried in the VERDICT as a caveat, round after round.

After the change:
- `classify`, `tally` and `decide` accept `deferred` (the TRD's deferred-by-design task ids) and
  an optional `index` (the workflow's returned index). An item is **deferred** when its action is
  `gap-unbuilt`, `gap-untested` or `untested` AND its id is a deferred task, or its id is a
  requirement whose `served_by` tasks are all deferred. An item is a **note** when its action is
  `fix-citation` (any check), or it is a `mismatch` under `citation` or `consistency` (today's
  `'other'` scope, renamed). A non-deferred `gap-unbuilt` stays a defect whatever its check. Notes
  and deferrals never count toward `defects` or `testGaps`; `tally` returns them as separate
  counts. `confirm-wanted` stays `'other'` (an owner question).
- The reconcile stage fixes stale citations and descriptive wording anywhere in the TRD, in
  place, lists each under the existing heading `FIXED THE CITATION` (widened from Could Not
  Verify only to the whole TRD), and returns each fixed item in `handoff` as
  `action: "fix-citation"`. It never changes what an objective, acceptance criterion or task
  requires. It reports a gap whose only covering task is deferred under a new heading
  `PLANNED, NOT BUILT YET`, with the handoff `id` set to the deferred task's id. A note or a
  deferral is never a reason for VERDICT "do not proceed".
- `/audit-build` passes the deferred list (from `parseTrd().deferred`, `{id, why}`) to the
  workflow, and the ids plus the returned `index` to every `classify`, `tally` and `decide` call
  — including step 3's per-item `classify`, which decides what reaches the fix run. It records
  the note and deferred counts in the round, lists them in STATE rather than ISSUES, and adds the
  TRD to the audit commit so in-place fixes travel with the branch.

Checkable before and after: `decide` on pm-interface's round shape (one `gap-unbuilt` on
PMI-T003, which is deferred) returns `reaudit: true` today and `close: true` after.

## Decision

Classify deferrals and notes in `audit-rounds.js` (deterministic, tested), not by asking the
reconcile agent to leave them out of `handoff`. The agent still returns them; the lib decides
they do not count. Rejected: filtering in the prompt alone, because that is the prose-only rule
that let the six-round loop happen (`audit-rounds.js` header) and cannot be tested.

A `mismatch` on a deferred task stays a defect: deferral means "not built yet", and code that
exists and is wrong is still wrong. Only the gap actions are reclassified.

The reconcile agent, not the command, makes the in-place TRD edits, because it already holds the
evidence for each finding and already rewrites Could Not Verify. Edits are limited to text that
DESCRIBES (line numbers, paths, ids, a description the code contradicts while the code is what
is required); a change to what is required is a mismatch or an owner question, as today.

absorbed: none.
not absorbed: the re-audit index reuse (`trdHash`) is invalidated when a citation fix lands in
the Master Task List — acceptable, since a re-audit only follows a real defect now.

## Non-Goals

- No change to the round cap (`MAX_REAUDITS`), the uncovered-item rule, or the test-gap rule.
- No change to `/audit-trd` or `/audit-prd`.
- The audit does not build, schedule or run a deferred task; `/implement-trd --include-deferred`
  and `/verify-build` stay the ways to do that.
- No edits to objectives, acceptance criteria or task requirements by the audit.

## Verification Artifacts

None apply — this changes a lib, a workflow prompt and a command prompt; the proof is the Jest
suites and the replayed pm-interface decision, not a published page or UI.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should a deferred task's gap appear in the VERDICT's caveat list at all? | Yes, once, as "planned, not built yet: <task> — <the TRD's reason>", so a close still says what is outstanding | |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | `audit-rounds.js`: add classes `note` and `deferred` (rules in Intended Change); `classify`, `tally` and `decide` take `deferred` ids and an optional `index`; `tally` returns `notes` and `deferred` counts; the CLI passes `deferred` and `index` through its `classify`, `tally` and `decide` cases. Tests in `audit-rounds.test.js`. Mirror to `.claude/lib/` | O1, O2, O3 | None | NEW behaviour (each fails on today's code): `decide` with handoff `[{id:"PMI-T003",action:"gap-unbuilt",check:"traceability",covered:true}]` and `deferred:["PMI-T003"]` returns `close:true, chain:false, reaudit:false`; CLI `classify` on that item with `deferred` returns `deferred`; a requirement item whose `index` `served_by` is all deferred tasks is `deferred`; `tally` reports `notes:1` for a `fix-citation` item and for a `consistency` `mismatch`. REGRESSION guards (pass today, must still pass): the same input without `deferred` returns `reaudit:true`; a `mismatch` on a deferred id is a defect; a non-deferred `gap-unbuilt` under check `citation` is a defect; `covered:false` stays uncovered-only; all 51 existing tests pass |
| FIX-002 | `audit-build.js` reconcile stage: accept `args.deferred` (`[{id, why}]`, the parser's shape); widen `FIXED THE CITATION` from Could Not Verify to the whole TRD (descriptive text only), in both the prompt's opening and its heading block; each fixed item goes back in `handoff` as `action: "fix-citation"`; add heading `PLANNED, NOT BUILT YET`, handoff `id` = the deferred task's id; add a deferred exception to the "choose do not proceed when a MISSING IMPLEMENTATION…" rule; never edit what an objective, criterion or task requires. Tests in `audit-build.test.js`. Mirror to `.claude/workflows/` | O1, O2 | None | Tests (each fails on today's prompt): the reconcile prompt carries each deferred id and its `why`; it no longer contains "this step edits no other section" nor restricts correction to Could Not Verify; it requires `fix-citation` for in-place fixes and the deferred task id as handoff `id`; the do-not-proceed rule names the deferred exception; it forbids edits to requirements |
| FIX-003 | `/audit-build` command: read `parseTrd().deferred`; pass the list to the workflow and pass the ids plus the returned `index` to step 1's `tally`, step 2's `decide`, and step 3's per-item `classify`; record `notes` and `deferred` in the round line; list notes and deferrals in STATE, never ISSUES, and never as a reason for NEXT `/audit-build`; reword step 3's "an `other` item — a citation to fix…"; mirror the heading-block change at ~403-405; add the TRD path to the audit commit's `git add` and pathspec. Mirror to `.claude/commands/` | O1, O2, O3 | FIX-001, FIX-002 | The command text passes `deferred` in the workflow call and in every `classify`, `tally` and `decide` example; the `record` example carries `notes` and `deferred`; the commit lines name the TRD; the heading block matches the workflow's; `verify-command-surface.test.js` and `runtime-integrity` mirror parity pass |
| AMEND-001 | Guard the audit's in-place TRD edits: the reconcile and index prompts find Could Not Verify only by a heading at the start of a line, never a mid-line mention; `audit-rounds.js` gains `trd-snapshot` (copy the TRD and its heading list into the state dir before the workflow) and `trd-guard` (after it, restore the copy and report the missing headings when any pre-existing heading is gone); `/audit-build` runs both around the workflow call and ends STUCK, TRD restored, when the guard fails — amendment, 2026-10-22 | amendment | | | `trd-guard` on a TRD truncated the way round 1 truncated this one returns `ok:false` naming `### FIX-003` and `## Could Not Verify`, and the file is byte-identical to the snapshot afterwards; on an edit that only changes citation text it returns `ok:true` and leaves the edit; a heading inside a fenced example is not counted; the prompts no longer say "headings CONTAINING" or grep for a bare "## Could Not Verify"; mirror parity and the three suites pass |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/audit-rounds.js`, `packages/core/lib/audit-rounds.test.js`, `.claude/lib/audit-rounds.js`
- **Reuse:** `classify` (as built: `classify({id, action, check}, ctx)` at `audit-rounds.js:69`) and `tally(handoff, ctx)` at `:91` — extended signatures, return shapes additive [read]
- **Replaces:** the rule that made every `gap-unbuilt` a defect regardless of task (as built, deferred gaps return `'deferred'` at `:75` before the `gap-unbuilt` rule at `:79`); the `'other'` return for citation/consistency mismatches became `'note'` (`:80`) [read]
- **Follow:** `decide` already takes counts; `cli` (`:202`) builds `ctx` from `input.deferred` and `input.index` at `:208`, and its `decide` case spreads `tally(input.handoff, ctx)` at `:211`. The 51 pre-change tests passed [ran]
- **Careful:** `covered: false` items stay uncovered-only, checked in `tally` before classification (`:97`); do not let a deferred id bypass that. Keep the gap-before-check order (`:79` before the `mismatch` rule at `:80`) so a non-deferred `gap-unbuilt` under `citation` stays a defect. Other callers: `verify-command-surface.test.js:776-828` pins the `tally`/`record` wording by prefix — additive fields are safe [read by reviewer]

### FIX-002
- **Touches:** `packages/core/workflows/audit-build.js`, `packages/core/workflows/audit-build.test.js`, `.claude/workflows/audit-build.js`
- **Reuse:** the readout heading block in the reconcile prompt (`audit-build.js` ~656-675 as built, "FIXED THE CITATION ...") and `ACTIONS`/`CHECKS` at `:167-168` [read]
- **Replaces:** "A citation that does not resolve anywhere ELSE in the TRD is reported, not fixed: this step edits no other section." and the opening's "you may correct the TRD's Could Not Verify section" (both removed; the widened opening is at ~:590-596); amends the verdict rule at ~:637-641 [read]
- **Follow:** args are read from `a` (`a.report_only` at `:102`); `a.deferred` is read the same way at `:110`, defaulting to `[]`. Prompt fragments are built as consts (`PREV_COVERAGE`, `CHAIN_NOTE`) [read]
- **Careful:** the reconcile stage is the Opus `technical-architect` stage; keep its schema unchanged (`applied` already lists what it changed)

### FIX-003
- **Touches:** `packages/core/commands/audit-build.md`, `.claude/commands/audit-build.md`
- **Reuse:** "After the workflow returns" section (`audit-build.md` ~252-385): the `tally`, `classify`, `record` and `decide` CLI examples; the workflow call at `:175`; the commit block at `:336-337`; the heading block at ~419-433, with the two new headings at `:427-429` [read]
- **Follow:** `parseTrd` returns `deferred[]` with ids (`trd-parser.js:875-890`), as `/implement-trd` §4.1a already uses [read]
- **Careful:** the readout rule "never NEXT `/audit-build` when `capReached`" stays; notes must not appear as ISSUES, which the owner reads as "who has to act"

## Could Not Verify

Rewritten by `/audit-build` on 2026-10-22. The three tasks (FIX-001, FIX-002, FIX-003) were
checked against the delivered code and tests and are not listed here; the three Jest suites
named in their acceptance criteria pass (387 tests).

- **No PRD exists for this change** (it was decided in session, 2026-10-21), so the audit could
  not check the objectives against product requirements — only that the code does what this
  TRD says. Whether O1-O3 capture the owner's intent fully is unchecked.
- **The pm-interface evidence behind O1 and O2 lives in another repository.** PMI-T003 and
  PMI-P002 are ids in forge-vnext's pm-interface TRD, which is not checked out here, so neither
  the evidence nor the reconstructed "before" shape (`{id:"PMI-T003", action:"gap-unbuilt"}`,
  rebuilt from round counts and report text, not a stored handoff) was checked.
- **In-place TRD edits are made by a model.** The tests prove the prompt asks for them and
  forbids requirement edits, not that every run obeys. This audit is the first live instance:
  it corrected the stale line citations in all three Task Grounding blocks in place, touching no objective,
  criterion or task requirement. One run is not a rate.
- **Kind is declared `change`;** the reviewer noted O1 is closer to a defect (the parser's own
  intent is that deferrals are reported, not discovered as failures). A classification for the
  owner, not a delivery claim; not checked.
- **The web-chat-parity "six stale line numbers" loop did not reproduce:** on 4.13.6 its round 2
  closed with zero defects, the citations carried as a caveat. Not re-run by this audit.
- **This audit's own rewrite truncated the TRD, and was repaired by hand.** The reconcile agent
  looked for the section by grepping "## Could Not Verify", matched a quote of that phrase inside
  FIX-002's grounding, and replaced everything from there to the end of the file. The rest of
  FIX-002's grounding, all of FIX-003's grounding and this heading were lost, then restored from
  the previous commit with the agent's citation fixes kept. The quote no longer contains "##".
  Nothing in the workflow checks that an edit leaves the other headings in place.
