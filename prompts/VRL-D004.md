<task id="VRL-D004">
You are implementing ONE task of the TRD at docs/TRD/cap-verification-runs-per-feature.md (repo root /private/tmp/ensemble-vnext-feature-20-cap-verification-runs-per-feature; work only there).

<objective>
| VRL-D004 | Reference and history: `docs/reference/verification.md`, `docs/reference/implement-trd.md` and `docs/reference/other-commands.md` describe the per-feature run limit, the setting, what counts and the ruling request; a dated `AMENDED 2026-11-16 by docs/TRD/cap-verification-runs-per-feature.md D13` marker on `docs/TRD/refine-verification.md` O4 (the one NEXT rule gains the at-limit exception), original wording kept; CHANGELOG `[Unreleased]` entry. | O4, O5, O6, D13 | | VRL-D001, VRL-D002, VRL-D003 | Each reference file names `ensemble.verificationRunLimit`, its default 2, and `ruling-request.md`; `docs/TRD/refine-verification.md` carries the marker and nothing else in it changes; CHANGELOG `[Unreleased]` names the feature. |
</objective>

<grounding>
### VRL-D004
- **Touches:** `docs/reference/verification.md`, `docs/reference/implement-trd.md`, `docs/reference/other-commands.md`, `docs/TRD/refine-verification.md` (O4 row only), `CHANGELOG.md` (`## [Unreleased]`). None of the reference pages or the TRD is mirrored into `.claude/` [read: no copies exist; a grep of `packages/` and `test/` finds one Jest suite that reads `docs/reference/verification.md`, see Careful 1].
- **Reuse:** the passages already present, edited in place [read]: `docs/reference/verification.md` flag table row for `--cap N` (~line 47: "Inner iteration cap, default 3; a total budget across every resume of one run") gets a sibling sentence that the per-feature run limit is a different cap; the files table (~lines 56-70, row for `verification-plan.md`) gets a `ruling-request.md` row and `implement.json`'s `functional_verification.runs`; `## 12. Recovery` (~line 579, "The chat (`/refine-verification`)" steps 1-4) gets the limit exception before step 1; the outcome table rows (~lines 426-428, "same" for `stuck`) and the report row (~line 461: "Next names `/refine-verification` then `/verify-build`") get the at-limit exception. `docs/reference/implement-trd.md` Step 8 passages (~lines 166, 190, 289) and the §9 Readout row (~line 307) [read] describe `functional_verification` and NEXT. `docs/reference/other-commands.md` verification summary table (~lines 556-570) and the sentence "A plan is used once: refine, run, repeat." (~line 569) [read]. For the settings key, follow how `ensemble.openPullRequest` is documented in `other-commands.md` (~lines 328, 409-411, 467) and `implement-trd.md` (~line 310): name, allowed values, shipped default.
- **Replaces:** the sentences that go false, to be edited not left beside the new text: "A plan is used once: refine, run, repeat." (`other-commands.md` ~569) reads as unbounded; `verification.md` ~line 461 "Next names `/refine-verification` then `/verify-build`" (the readout, at the limit, names the ruling request while the report still does, see D002 Careful 1); `implement-trd.md` ~line 307 NEXT wording "after any other outcome short of `satisfied`, `/refine-verification` then `/verify-build`"; and `docs/TRD/refine-verification.md` O2's loop "`/refine-verification` → `/verify-build` → ... → …" and its quoted "repeat as necessary", which O2 states as the owner's words [read]: the TRD scopes the marker to O4 only, so O2 keeps an unbounded loop with no marker (decide whether to mark O2 too; the TRD says "nothing else in it changes").
- **Follow:** the AMENDED convention that now exists in the corpus (the `accepted-gaps` TRD said none existed [ran: grep found it only in that TRD at its time], but `docs/TRD/verification-must-pass.md` D16 now carries it): a leading bold marker inside the cell with the original wording kept after it, e.g. `**AMENDED 2026-11-16 (by cap-verification-runs-per-feature D13): ...**` [read: `verification-must-pass.md` line 119; `functional-verification.md` D8 row uses `— **AMENDED date by path D#**` in the title cell plus an italic note]. For the CHANGELOG entry: `## [Unreleased]` currently holds a bold lead paragraph, `### Fixed` with three bullets of the form `- **Title (#N).** body`, no `### Added` [read]; add `### Added` (41 earlier releases use that heading) with one bullet `- **Per-feature verification run limit.** ...` and a short `### Not yet proven` (16 releases use it) that says VRL-T001's live evidence status.
- **Careful:**
  1. **`waived-defect-wording.test.js` pins `docs/reference/verification.md`**: it must match `/defect\s+issue/` and must NOT contain "listed and filed as" or "non-blocking follow-up" [read]. The ship/drop description must say a waived criterion "is filed as a defect issue" and avoid "follow-up" in that phrase.
  2. **Describe built behaviour, not the TRD.** Take the CLI verbs, flag names, `ruling-request.md` sections and the `rulingDue` rule from the built `verification-runs.js` (VRL-B001) and the final prose of D001-D003, not from TRD §3. That, not a file dependency, is the only reason this task follows them (see findings).
  3. **No collision on files:** no other task edits these five paths. `docs/reference/implement-trd.md` is a different file from VRL-D001's `packages/core/commands/implement-trd.md`. `docs/TRD/functional-verification.md` §3.3 is pinned by `verify-functional-trd-sync.test.js`; do not touch it.
  4. State the OQ answers an owner will ask first: runs before the feature shipped are not counted (OQ-1); `setup-failure` counts (OQ-2); `--reset-state` clears the count (OQ-5); the setting accepts any integer of at least 1 and an invalid value stops the command (D12).
  5. Mark who acts, as `docs/reference/verification.md` does: the count, limit and refusal are **code** (`verification-runs.js`), the ruling itself is the PM's.

</grounding>

<decision>
Read the TRD's §1.2 "Key Technical Decisions" (D1–D14) and §3 "Technical Specifications" before writing code; they are binding, including the corrections recorded in the changelog row 1.0.1/1.0.2. Two tasks of one change must not rediscover its design independently.
</decision>

<scope_boundaries>
TRD §8 Non-Goals NG1–NG6 are hard limits. Touch only the files your grounding's Touches lists (plus their .claude/ mirror copies it names). Do NOT edit the TRD. Do NOT commit — the orchestrator commits at the phase checkpoint. Completed tasks so far: VRL-B001, VRL-B002, VRL-B003 (read packages/core/lib/verification-runs.js's header for its exact CLI: check/start/finish/request/record-ruling, flags, JSON shapes and exit codes — call it exactly as it is, never restate its logic).
</scope_boundaries>

<strategy_instructions>
Strategy tdd: write the failing test first, in this same task, then the minimal implementation, then make it pass.
</strategy_instructions>

<check_battery>
  <unit>npx jest &lt;the test files you added or changed&gt; (and npx jest packages/core/commands when you edit a command file)</unit>
  <shell>shellcheck / bats on any .sh you change</shell>
  <instruction>Run these against files you changed. On failure debug it yourself (5 Whys, fix, re-run) before returning; report "failed" only if still red after a genuine attempt. NEVER run a live, model-spending check (anything that starts claude sessions); report such a check "not run".</instruction>
</check_battery>

<discovered>
If you find work this task does not cover, RECORD it and carry on: node -e 'require("./.claude/lib/discovered").record(".trd-state/cap-verification-runs-per-feature",{kind:"bug",foundBy:"VRL-D004",phase:2,summary:"...",file:"...",evidence:"..."})'. Do not fix it and do not spawn an agent for it.
</discovered>

<deliverables>
Return status (success|failed), filesChanged (every path you created or edited, mirrors included), filesDeleted (if any), and a short summary including the test commands you ran and their results.
</deliverables>
</task>