<task id="VRL-B003">
You are implementing ONE task of the TRD at docs/TRD/cap-verification-runs-per-feature.md (repo root /private/tmp/ensemble-vnext-feature-20-cap-verification-runs-per-feature; work only there).

<objective>
| VRL-B003 | Shipped surface: `"verificationRunLimit": 2` in `packages/core/templates/claude-directory/settings.json` and `packages/full/.claude/settings.json` (a second, regular-file template); `ensemble.setdefault("verificationRunLimit", 2)` in `scaffold-project.sh` beside `publishArtifacts`, with a case in `scaffold-project.test.sh`; `ruling-request` added to `artifacts.js KINDS` (its doc comment says twelve) and to the kinds list in `packages/core/templates/claude-directory/rules/command-status.md` and `.claude/rules/command-status.md`; copy `artifacts.js` to `.claude/lib/`. One task: each piece is one line registering the new surface, and none has behaviour of its own. | O6, O8, D10, D12, D14 | `jest` | None | `bats packages/core/scripts/scaffold-project.test.sh` passes, including a case where a project with `"verificationRunLimit": 4` keeps 4 after a refresh and one without the key gains 2; `npx jest packages/core/lib/artifacts.test.js` passes with the `KINDS` list updated to twelve entries and `grep -rn eleven packages/core/lib/artifacts*.js` finds nothing; both settings templates carry the key and `cmp` reports them identical; both `command-status.md` copies name `ruling-request` and `cmp` reports them identical; `cmp packages/core/lib/artifacts.js .claude/lib/artifacts.js` reports no difference. |
</objective>

<grounding>
### VRL-B003
- **Touches:** `packages/core/templates/claude-directory/settings.json`, **`packages/full/.claude/settings.json`** (a second shipped settings template, byte-identical to the first today and not a symlink [ran — `diff` reports identical; `ls -la packages/full/.claude` shows a regular file]; the `pr-at-cycle-end` TRD FIX-002 edited both, and `notify-on-complete.test.sh` pins `openPullRequest` "in all three settings copies"), `packages/core/scripts/scaffold-project.sh` (the `ensemble.setdefault(...)` run: `publishArtifacts`, `openPullRequest`, `records`), `packages/core/scripts/scaffold-project.test.sh` (new case next to `records: scaffold stamps ensemble.records ref; an owner's branch survives --refresh`, `:2955`), `packages/core/lib/artifacts.js` (`KINDS`, plus the comment "lists the eleven document kinds" at the file header `:17` and the `/** The eleven document kinds. … */` comment at `:39`), `packages/core/lib/artifacts.test.js` (`describe('KINDS')` test is named `lists the eleven document kinds` and asserts the exact array), `.claude/lib/artifacts.js` (copy; `cmp` clean today [ran]), `packages/core/templates/claude-directory/rules/command-status.md` and `.claude/rules/command-status.md` (the kinds list at line 220 in both; `cmp` clean today [ran]) [read].
- **Reuse:** the three-line `setdefault` run in `scaffold-project.sh` (comment style: "setdefault, never assignment: an owner who chose X must keep it across every refresh") [read]; the refresh-keeps-owner-value test shape in `scaffold-project.test.sh` (`records:` case: scaffold, edit the key with python, `--refresh`, re-read) and in `test/integration/tests/scaffold-delivery.test.sh` (`refresh keeps an owner's openPullRequest and backfills never when absent`; read for its shape only, not edited — see Careful) [read].
- **Replaces:** nothing. The word "eleven" in `artifacts.js` (two places) and in the `artifacts.test.js` test title become "twelve"; `grep -rn "eleven" packages/core/lib/artifacts*.js` should find nothing afterwards [ran — currently 3 hits].
- **Follow:** commit-level precedent `a89d64c0`/`5f5b9cf1` ("PR at cycle end") for adding an `ensemble` key: template + `packages/full/.claude/settings.json` + setdefault + two BATS tests [read — `docs/TRD/pr-at-cycle-end.md` FIX-002 Touches]. This repo's own `.claude/settings.json` needs no edit: `readLimit` defaults to 2 when the key is absent (D12).
- **Careful:**
  - `any valid slug` is already accepted by `artifacts.js record` (`KIND_RE`), so adding `ruling-request` to `KINDS` changes documentation and the `it.each(artifacts.KINDS)` test only; nothing depends on it before VRL-D001/D002/D003 call `record --kind ruling-request` [read].
  - **Edit no integration test.** The precedent's extra BATS cases in `test/integration/tests/scaffold-delivery.test.sh` and `test/integration/tests/notify-on-complete.test.sh` are not copied: the refresh-keeps-owner-value case goes in `scaffold-project.test.sh` (this task's acceptance), and `notify-on-complete.test.sh` pins only `openPullRequest`. VRL-B001 edits `scaffold-delivery.test.sh` (delivered-module list) in the same wave, so editing it here would collide.
  - Wave note: no other task touches this task's files.

</grounding>

<decision>
Read the TRD's §1.2 "Key Technical Decisions" (D1–D14) and §3 "Technical Specifications" before writing code; they are binding, including the corrections recorded in the changelog row 1.0.1/1.0.2. Two tasks of one change must not rediscover its design independently.
</decision>

<scope_boundaries>
TRD §8 Non-Goals NG1–NG6 are hard limits. Touch only the files your grounding's Touches lists (plus their .claude/ mirror copies it names). Do NOT edit the TRD. Do NOT commit — the orchestrator commits at the phase checkpoint. Completed tasks so far: none.
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
If you find work this task does not cover, RECORD it and carry on: node -e 'require("./.claude/lib/discovered").record(".trd-state/cap-verification-runs-per-feature",{kind:"bug",foundBy:"VRL-B003",phase:1,summary:"...",file:"...",evidence:"..."})'. Do not fix it and do not spawn an agent for it.
</discovered>

<deliverables>
Return status (success|failed), filesChanged (every path you created or edited, mirrors included), filesDeleted (if any), and a short summary including the test commands you ran and their results.
</deliverables>
</task>