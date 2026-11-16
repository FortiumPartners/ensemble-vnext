<task id="VRL-D003">
You are implementing ONE task of the TRD at docs/TRD/cap-verification-runs-per-feature.md (repo root /private/tmp/ensemble-vnext-feature-20-cap-verification-runs-per-feature; work only there).

<objective>
| VRL-D003 | `packages/core/commands/refine-verification.md`: a run-limit check in Inputs after `record-ref.js ensure`, before Derive, in both modes (D7); at the limit no `verification-plan.md` is written — `request`, `artifacts.js record --kind ruling-request`, publish (D10), the records-ref write, `COMMAND STUCK` with the D8 reason (D8); Writes, Never and Readout name the decline branch. New prose test `packages/core/commands/refine-verification-run-limit-prose.test.js`; copy to `.claude/commands/refine-verification.md`. | O3, D7, D8, D10 | `jest` | VRL-B001 | The prose test passes and fails if: the check is missing or follows the `## Derive` heading; Writes does not say no plan is written at the limit; the D8 reason line is missing; the `--auto` mode is not covered by the same check. `npx jest packages/core/commands` passes (including `refine-recommend-prose.test.js`). `cmp` against `.claude/commands/refine-verification.md` reports no difference. |
</objective>

<grounding>
### VRL-D003
- **Touches:** `packages/core/commands/refine-verification.md` and its mirror `.claude/commands/refine-verification.md` [read: byte-identical today; `refine-verification-must-pass.test.js` reads both paths]; new `packages/core/commands/refine-verification-run-limit-prose.test.js`.
- **Reuse:** (1) `verification-runs.js check` and `request` (VRL-B001). (2) The `record-ref.js ensure` block already at the top of `## Inputs` (~line 83-91) [read]: the check goes directly after it. (3) The command's own tail: `artifacts.js record ... --command /refine-verification` already exists for `verification-plan` (Writes, ~line 285) [read]; the ruling-request record is a second call of the same shape, with the stored URL from `artifacts.js get --kind ruling-request` passed as `url:` and `--url <returned URL>` only when a publish returned one. (4) The publish paragraph in `verify-build.md` `### Artifact link` is the pattern to copy (publish the FILE, the switch is `ensemble.publishArtifacts`, failure is one line and never blocks the banner); this command has NO publish step today, and says the plan "is never published" [read], so the new text must not contradict that sentence: it concerns `verification-plan.md` only. (5) The existing tail: `record-ref.js write ... --command /refine-verification --step "verification plan"` before the banner, and `notify-complete.sh "refine-verification" "stuck"` [read]; the decline branch reuses both with a different `--step`.
- **Replaces:** nothing is deleted. Statements that gain an exception: Writes' first bullet ("written once the open items are answered, or straight away when there were none"), the Never section's last bullet and the Readout's "**NEXT** is `/verify-build`, naming the plan path" [read]; each must say "except at the run limit".
- **Follow:** the "Modes" table sentence that `--auto` "obeys autonomy discipline like any other command and asks nothing"; the limit branch in `--auto` and interactive modes is identical and asks nothing in both (the decline needs no owner input). The section pins in `refine-verification-must-pass.test.js` slice `## Derive (both modes)` ... `## Open items`, `- **Owner rulings**` ... `- **Extra checks**`, `\n## Never` ... `\n---` and `**Access only the owner has is never guessed.**` ... `\n---` [read]; the new text must not disturb those slices.
- **Careful:**
  1. **A hidden fence trap.** `functional-verification.test.js` ("refine-verification.md's example plan", ~line 3073) extracts the example plan with `/^[ \t]*```markdown\n([\s\S]*?# Verification plan:[\s\S]*?)\n[ \t]*```/m` [read]. It takes the FIRST ```` ```markdown ```` fence in the file and lazily runs to the next closing fence after the string `# Verification plan:`. Any ```` ```markdown ```` fence placed before the existing example (that is, anywhere in Inputs, which comes first) would be matched first and swallow the text up to the plan; use ```` ```bash ```` fences or prose in the new Inputs text.
  2. **Satisfied with nothing open.** `## Inputs` already says "This command does not apply to a run that ended `satisfied` with nothing open" [read]. D9 says the limit applies whatever the latest outcome was, so at the limit after a `satisfied` run this check would end STUCK with a request listing nothing open. Decide which sentence wins and state it in the new text (the TRD's D9 is the later decision); otherwise the two sentences contradict each other.
  3. **Order.** `Derive` step 1 reads the report and state; the check must come before any read for the diagnosis, and BEFORE `**Next run scope**` is computed (that calls `rerun-scope.js changed` in Writes) [read]. `--auto` spawns a `product-manager` subagent in "Open items"; the decline must happen before it, so no agent is spent.
  4. **`Never starts /verify-build`** (Never section) stays true; the decline also never writes `verification-plan.md` or edits the PRD/TRD, so Writes should list the decline's only writes: `ruling-request.md` (via the CLI), the `artifacts.json` entry and the records ref.
  5. **No sweep case**: `/refine-verification` never takes a sweep file; nothing to skip. A feature with no `implement.json` has count 0 and cannot reach the limit (`status` reports count 0 when the file is absent, TRD §3.1).
  6. Mirror parity is asserted in `refine-verification-must-pass.test.js` only through reading both paths; keep `cmp` clean.

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
If you find work this task does not cover, RECORD it and carry on: node -e 'require("./.claude/lib/discovered").record(".trd-state/cap-verification-runs-per-feature",{kind:"bug",foundBy:"VRL-D003",phase:2,summary:"...",file:"...",evidence:"..."})'. Do not fix it and do not spawn an agent for it.
</discovered>

<deliverables>
Return status (success|failed), filesChanged (every path you created or edited, mirrors included), filesDeleted (if any), and a short summary including the test commands you ran and their results.
</deliverables>
</task>