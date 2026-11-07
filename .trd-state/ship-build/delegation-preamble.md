# Delegation preamble for the ship-build implementation run

Shared by every task prompt of this run (the orchestrator wrote it once so each prompt stays short). Binding.

<binding_instructions>
First read, in full: `packages/core/contracts/task-delegation.md` (your complete instruction set: evidence markers, scope discipline, deliverables, strategy instructions) -- then read this task's two TRD sources, which together are your grounding and your objective, verbatim:
 1. the Master Task List row for <your task id> in docs/TRD/ship-build.md (section 4: its Description, Serves, Dependencies and Acceptance Criteria -- the Acceptance Criteria are your <objective>);
 2. the `### <your task id>` block in section 9 "Task Grounding" of docs/TRD/ship-build.md (Touches / Owner / Reuse / Replaces / Follow / Careful), with its evidence key: [ran] = executed and read, trust it; [read] = file opened and verified, trust it; [inferred] = deduced, VERIFY before relying and say so in your deliverables if wrong.
Also read every decision (D-number) your row's "Serves" column cites, in section 1.2 "Key Technical Decisions" of the TRD, and section 3 subsections that your task's description names. Those decisions are binding for every task of this feature; do not rediscover them differently.
Mirror rule (TRD 4.1): every packages/core/ change is mirrored byte for byte to its .claude/ copy; a new lib also gets a packages/full/lib/ symlink like its siblings.
</binding_instructions>

<strategy_note>
Strategy is tdd: write the failing test(s) and the minimal implementation inside THIS task, in this same run (no separate RED stage exists).
</strategy_note>

<scope_boundaries>
Non-goals (hard boundaries, reject work in these): NG1 /ship-build does not chain after /audit-build; NG9 no dependency on Forge; NG10 tracker not declared in ship.md; NG14 no functional verification of a released build; NG15 /sweep does not start committing; NG18 no named release/platform primitives; NG19 ensemble.openPullRequest is not retired or migrated; NG20 no command taught to record a source issue, /sweep storage unchanged; nested repeat blocks, a --chained mode for /plan, /sync-design starting a build are out of scope.
Touch only files in this task's grounding "Touches" list (and their required mirrors). Do NOT edit constitution.md, stack.md, verification.md, or any autonomy.md (governance edits are deferred by design, SHIP-D002). Do NOT commit and do NOT push: the orchestrator commits at the phase checkpoint. Do NOT spawn your own agent type on this task. If you hit work outside your scope, record it as a discovery (below), do not do it.
</scope_boundaries>

<check_battery>
  <unit>npx jest {the test files you added or changed}</unit>
  <shell>shellcheck {changed .sh files, if any}; bats {changed .test.sh files, if any}</shell>
  <instruction>Run the commands above against the files you changed. On failure, debug it yourself (5 Whys, fix, re-run) before returning -- do NOT return status "failed" on the first red run. Only report "failed" if still red after genuinely trying. No separate debugging agent is spawned. NEVER run a live, model-spending check -- anything that starts `claude` sessions (e.g. test/smoke/run-smoke.sh or `claude -p`); report such checks "not run". Another task in this wave may be editing neighbouring files at the same time: run only your own tests, and do not "fix" a failure that is plainly in another task's files.</instruction>
</check_battery>

<discovered>
If you find work this task does not cover (a bug outside scope, stale grounding, a gap nobody planned), RECORD it and carry on; do not fix it:
  node -e 'require("./.claude/lib/discovered").record(".trd-state/ship-build",{kind:"bug",foundBy:"<your task id>",phase:<phase>,summary:"one line",file:"path",evidence:"how you know"})'
kind is one of bug | scope-conflict | stale-grounding | gap | risk.
</discovered>
