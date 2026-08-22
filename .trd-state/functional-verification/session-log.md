
## Compaction checkpoint — 2026-08-22T01:45:06.651Z

**Trigger:** manual
**PRD:** docs/PRD/functional-verification.md
**TRD:** docs/TRD/functional-verification.md
**Phase:** 4
**Strategy:** tdd
**Branch:** feature/functional-verification/impl

**Recently completed (last 5):**
- `FV-B002` — Build packages/core/workflows/verify-functional.js per §3.3/§3.3a/§3.5 — the whole bounded loop (D1) as three sequential agent() calls per iteration: Exercise (one agent, agentType: 'verify-app', every criterion), Judge (one untyped agent, checker-first, runs the lib CLI and touches disk), and Debug
- `FV-B003` — Repoint packages/full/agents/verify-app.md: add a Functional Success Definition mode — input is the whole criterion set, the agent brings the system up once and walks it, output is one claim plus an artifact path or a stated reason per criterion, never a verdict on its own evidence — plus the D12 hi
- `FV-B004` — Add --verify-functional to /implement-trd (packages/core/commands/implement-trd.md): usage block, Parse: line, Execution Model diagram, its composition with the existing --resume (§3.7, D13), and Step 3.6's background derive dispatch with PRD-path resolution (TRD Source PRD: header → .trd-state/curr
- `FV-B005` — Add Step 8 to /implement-trd per §3.7 — one dispatch, not a loop (D1): read the definition from disk (absent → not run: no definition produced per §3.1/TR3; never wait on the background task and never derive one inline — no primitive exists for a lead to block on a specific Agent({run_in_background}
- `FV-T001` — [LIVE]: add test/smoke/scenarios/verify-functional.sh and register it in run-smoke.sh's SCENARIO_TIMEOUT and LLM_OPT_IN_SCENARIOS. It scaffolds a throwaway project with a one-requirement PRD and a matching one-task TRD, runs /implement-trd without the flag and asserts no success definition appears, 

**Decisions & rationale (model: fill on resume):**
- _Why was the in-flight approach chosen? Anything tried and rejected? Open questions?_

**Transcript:** `/Users/james/.claude/projects/-Users-james-dev-fortium-ensemble-vnext/be78afb0-be07-4575-975d-b221cabbf78a.jsonl`

---
