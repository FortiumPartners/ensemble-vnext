# Task delegation contract

**This is the complete, binding instruction set for delegating one TRD task to an
implementer.** It is deliberately separate from `implement-trd.md`: that command file carries
the orchestration loop — state, phases, waves, banners, resolution, pause conditions — and the
orchestrator re-caches all of it on every turn of the loop. None of it is read by an
implementer. This file is read once per task dispatch.

Two audiences, one file:

- **The orchestrator** fills the `{placeholders}` and emits the prompt. The assembly rules are
  the `<!-- -->` comments and the "Assembly" notes; they are instructions to you, not text to
  pass through.
- **The implementer** reads everything else. Write it as it stands; do not paraphrase the
  instruction blocks.

---

## Evidence markers — the key travels with the grounding

TRD grounding lines carry evidence markers. **A grounding block passed without this key is a
document of uniform-looking precision, which is exactly what the markers exist to prevent.**
Emit the `<evidence_key>` whenever a `<grounding>` element is emitted.

| Marker | Means | How much to trust it |
|--------|-------|----------------------|
| `[ran]` | Someone executed this and read the output | **Most trustworthy.** Treat as fact. |
| `[read]` | Someone opened the file and verified the claim | Trust it. |
| `[inferred]` | Deduced, not checked | **Verify before you rely on it.** |

An `[inferred]` claim is the author's reasoning, not an observation. Check it before building
on it. If it turns out to be wrong, say so in your deliverables — the next task's grounding is
probably wrong the same way.

---

## The per-task IMPLEMENT prompt

```xml
<task>
  <id>{task_id}</id>
  <description>{task_description}</description>
</task>

<context>
  <trd_file>{trd_path}</trd_file>
  <strategy>{strategy}</strategy>
  <quality_gates>
    <!-- Read from constitution.md Quality Gates. Do NOT substitute a remembered
         or conventional number: constitution.md is the single source of truth for
         these floors, and a TRD may only exceed one where it states why inline. -->
    <unit_coverage>{constitution.unit_coverage}%</unit_coverage>
    <integration_coverage>{constitution.integration_coverage}%</integration_coverage>
  </quality_gates>
  <completed_tasks>{list of completed task IDs this phase}</completed_tasks>
</context>

<grounding>
  <!-- Verbatim from the TRD's Task Grounding block for THIS task id.
       Omit the whole element — evidence key included — if the TRD has no block
       for this task. A key with nothing to key is noise. -->
  <evidence_key>
    [ran]      Someone executed this and read the output. Trust it most.
    [read]     Someone opened the file and verified the claim. Trust it.
    [inferred] Deduced, not checked. VERIFY IT BEFORE YOU RELY ON IT.
               If it turns out to be wrong, say so in your deliverables —
               the next task's grounding is probably wrong the same way.
  </evidence_key>
  <touches>{files this task is expected to modify}</touches>
  <reuse>{existing code to use rather than reimplement}</reuse>
  <replaces>{what this makes unreachable} — DELETE it and its tests in the same change.</replaces>
  <follow>{existing pattern this should match}</follow>
  <decision>{the approach chosen for this change as a whole, and why an alternative was rejected}</decision>
  <careful>{contracts, callers, or constraints to respect}</careful>
  <instruction>
    This grounding was established by reading the codebase during TRD authoring.
    Treat it as findings you already own, not as suggestions:

    - Do NOT reimplement anything named in <reuse>. Import and use it. If it genuinely
      does not fit, say so in your deliverables and explain why — do not silently
      build a parallel path.
    - If <replaces> names something, DELETE it and its tests in the same change.
      Leaving superseded code in place is a defect, not a safe default: it still
      looks live to every later reader.
    - <follow> names an existing pattern in this repository. Match it rather than
      introducing a second way of doing the same thing.
    - Weigh each line by its evidence marker (see <evidence_key>). An [inferred]
      claim is the author's reasoning, not an observation — check it first.
    - If the grounding turns out to be wrong or stale, report the discrepancy in your
      deliverables. Do not just work around it silently — the next task's grounding
      is probably wrong in the same way.
  </instruction>
</grounding>

`<decision>` is NOT prior art and must not be read as such. It is the approach chosen for
THIS change, decided during planning, and it may describe behaviour that does not exist in
the repository yet — the task next to yours may be the one creating it. Follow it as a
constraint on your work, and do not "match the existing pattern" against it.

**If your task would contradict it, stop and report that rather than proceeding.** Two tasks
of one change disagreeing about its approach is a real, measured failure: one agent emitted
`{}` while another wrote a test asserting the opposite.

<unverified_claims>
  <!-- Emitted ONLY when the TRD's "Could Not Verify" section names a file, task or
       claim this task touches. Never emit an empty element: absence is meaningful,
       and an empty one says "checked, nothing found" when nothing was checked. -->
  <claim check="{how the author would have checked it}">{claim verbatim}</claim>
  <instruction>
    This task rests on a claim nobody verified. Check it first. If it is false,
    stop and report — do not build on it.
  </instruction>
</unverified_claims>

<open_question>
  <!-- Emitted ONLY for an Open Question that is owner-only, still unresolved, and
       covers this task. Informational: it is surfaced so you know what is
       unsettled, not so you can ask about it. Never emit an empty element. -->
  <id>{OQ id}</id>
  <question>{verbatim}</question>
  <assumed>{what the TRD assumed}</assumed>
  <instruction>
    Proceed on the stated assumption and record it in your deliverables. Do NOT stop
    to ask — see the autonomy note at the end of this file.
  </instruction>
</open_question>

<scope_discipline>
  <instruction>
    Implement what the task asks for. Do NOT add delivery machinery — feature flags,
    rollout phases, migration scaffolding, guard infrastructure, eval gates, config
    toggles — unless the task or the TRD explicitly calls for it and names the
    objective it serves.

    This is the largest single source of wasted work in this framework: machinery
    nobody asked for gets built, and features end up shipped dark behind flags no one
    turns on. If you believe such machinery is genuinely needed, report it as a
    finding for the orchestrator; do not build it on your own judgment.
  </instruction>
</scope_discipline>

<scope_boundaries>
  <non_goals>
    <!-- Extracted from the TRD's Non-Goals section — MUST NOT implement these -->
    {list of non-goals with IDs and descriptions}
  </non_goals>
  <instruction>
    If the task requirements or your implementation approach would address any
    non-goal item, STOP and report the scope conflict. Do not proceed with
    work that falls outside the defined scope.
  </instruction>
</scope_boundaries>

<objective>
{acceptance criteria for this task, from the Master Task List row}
</objective>

<skills>
  <matched>{comma-separated list of matched skill names, or "none"}</matched>
  <instruction>
    You MUST invoke each listed skill using the Skill tool BEFORE writing code.
    Extract concrete rules from each skill and apply them to your implementation.
    In your deliverables, report:
    - SKILLS_USED: exact skill names invoked (or "none available")
    - RULES_APPLIED: 1-2 concrete rules per skill that influenced your code
  </instruction>
</skills>

<tdd_context>
  <!-- Only when strategy=tdd and a RED phase produced failing tests -->
  <failing_tests>{test files from the RED phase}</failing_tests>
  <instruction>
    Write the MINIMAL implementation to make these tests pass. Do NOT add features
    beyond what the tests require. Do NOT modify the tests.
  </instruction>
</tdd_context>

<strategy_instructions>
Strategy is: {strategy}

- **tdd** — RED is written by verify-app, GREEN is yours: minimal code to pass the
  given failing tests. Do not add beyond them; do not refactor.
- **bug-fix** — REPRODUCE the bug, write a failing test that captures it, then apply
  the minimal fix.
- **characterization** — write tests that capture EXISTING behavior, not desired
  behavior. Do not change behavior. Failures are informational.
- **test-after** — implement to the acceptance criteria, then write tests covering it.
- **refactor** — all tests pass before you start; change structure, never behavior;
  work incrementally.
- **flexible** — your judgment on test-first vs test-after, based on the task.
</strategy_instructions>

<deliverables>
1. Implementation complete per objective
2. Every file changed, with paths
3. Tests written (for tdd / bug-fix / test-after strategies)
4. Brief outcome summary
5. Anything deleted under <replaces>, named explicitly — or a statement that
   <replaces> was empty
6. Any [inferred] grounding you checked, and what you found
7. Scope compliance confirmation (no non-goal work performed)
8. Skills used and rules applied
</deliverables>
```

**Invoke:** `Agent(subagent_type="{selected-implementer}", prompt="[above]")`

---

## UI tasks: `<design_references>`

For a UI or frontend task, prepend:

```xml
<ui_context>
  <design_references>{paths from the matched section}</design_references>
  <visual_capture>
    <screenshot_path>{from the TRD, or default tests/visual/__screenshots__/}</screenshot_path>
  </visual_capture>
  <instructions>
    1. Read the design documents listed above before building components
    2. Capture screenshots after implementation
    3. Include screenshot paths in your deliverables, and check them against the
       same design references before you report done
  </instructions>
</ui_context>
```

**Assembly — match the heading by TEXT, never by section number.** Authors renumber
sections; a number goes stale silently. Search the whole TRD, appendices included, for a
heading *containing* any of these three strings, first match wins in this order:

1. `Task Grounding` — the only one a TRD produced by `/create-trd` actually carries
2. `Design References`
3. `Reference Documents`

**If none matches, omit the whole `<ui_context>` element.** Do not guess a path and do not
emit an empty element.

---

## DEBUG, when a check fails

```xml
<debug_request>
  <task_id>{task_id}</task_id>
  <failures>{failure output from the checks — verbatim}</failures>
  <files_modified>{files changed by the implementer}</files_modified>
  <retry_count>{previous debug attempts on this task}</retry_count>
</debug_request>

<known_risks>
  <!-- From the TRD's Risk Assessment. Omit if the TRD names none. -->
  {risks with IDs, descriptions and mitigations; contingency plans for high-impact ones}
</known_risks>

<instructions>
1. Reproduce the failure
2. Check whether it matches a documented risk above — if so, apply that mitigation FIRST
3. Find the root cause (5 Whys); do not patch the symptom
4. Implement the fix
5. Report what was wrong, how it was fixed, and whether a documented risk materialized
</instructions>
```

**Invoke:** `Agent(subagent_type="app-debugger", prompt="[above]")`

---

## Autonomy

`<unverified_claims>` and `<open_question>` are **surfaced, not asked**. They reach you as
part of this prompt, before you start — which is the point: you know which of your inputs are
unchecked before you build on them.

Neither is a licence to stop and ask. Under `.claude/rules/autonomy.md`, `AskUserQuestion` is
restricted to four cases; "the TRD flagged this as unverified" is not one of them. State the
assumption, proceed, and record it in your deliverables. The exception is the one case the
`<unverified_claims>` instruction already names: a claim you check and find **false** — stop
and report that to the orchestrator, which is a return, not a question.

You are a subagent. Do not spawn subagents of your own (`constitution.md`, Principle 1). Work
that falls outside your scope is a finding you report to the orchestrator, not work you
delegate.
