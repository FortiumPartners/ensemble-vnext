
## Compaction checkpoint — 2026-09-23T15:39:48.829Z

**Trigger:** auto
**PRD:** docs/PRD/plan-weight-router.md
**TRD:** docs/TRD/plan-weight-router.md

**Decisions & rationale (model: fill on resume):**
- _Why was the in-flight approach chosen? Anything tried and rejected? Open questions?_

**Transcript:** `/Users/james/.claude/projects/-Users-james-dev-fortium-ensemble-vnext/598e13f6-ec96-46fc-b4d7-ba43193f17ca.jsonl`

---

## Compaction checkpoint — 2026-09-25T09:53:54.148Z

**Trigger:** auto
**PRD:** docs/PRD/plan-weight-router.md
**TRD:** docs/TRD/plan-weight-router.md
**Phase:** 3
**Strategy:** tdd
**Branch:** feature/plan-weight-router/build

**Recently completed (last 5):**
- `PLAN-T002` — [LIVE] Rename test/smoke/scenarios/investigate-{light-fix,decoy-root-cause}.sh to plan-*, update test/smoke/run-smoke.sh's ALL_SCENARIOS / LLM_OPT_IN_SCENARIOS rosters and test/smoke/baseline.json, and add test/smoke/scenarios/plan-medium-weight.sh: a real /plan run on a 12–18-task subject that asserts medium, a phased TRD, that audit-trd ran, and exactly one COMMAND COMPLETE banner
- `AMEND-001` — Two orphaned test files are committed in .claude/lib/ that copy_libs() deliberately never refreshes, so they drift permanently. fix-plan.test.js now tests the retired tier API against the refreshed weight/route module: 14 Jest failures. (.claude/lib/fix-plan.test.js) — promoted from a bug discovery found by implement-trd phase-2 gate review
- `AMEND-002` — The mirror-drift test compares packages/full/agents against .claude/agents, but scaffold-project.sh --refresh injects a generated per-project skills: frontmatter block into every .claude/agents/*.md. That pair can never match after any refresh, so the test fails for anyone who runs the refresh this feature requires. (test/integration/tests/implement-trd-structure.test.sh:511) — promoted from a bug discovery found by implement-trd phase-2 gate review
- `AMEND-003` — The CLAUDE.md template init-project installs into EVERY scaffolded project teaches a workflow missing 11 of the 18 commands — including all three shorter paths (/plan, /sweep, /amend) and all four verification commands (/audit-prd, /audit-trd, /audit-build, /verify-build). (packages/core/templates/CLAUDE.md.template) — promoted from a gap discovery found by consistency review after /audit-build
- `AMEND-004` — Make .claude/rules/process.md and packages/core/templates/process.md.template describe the loop that actually runs and list all 18 commands. Three defects, one file pair: the template still lists code-simplifier and a phase-scoped /code-review as active phase-gate stages plus a feature-scale hardening pass (all three removed 2026-08-18 and 2026-08-28); process.md's numbered Process list contradicts its own prose at :155 by keeping both as per-task steps; and neither lists /sweep, so both workflow maps enumerate 17 of 18 commands. Absorbed AMEND-005 and AMEND-006 — same two files, so one agent, not three racing.

**Decisions & rationale (model: fill on resume):**
- _Why was the in-flight approach chosen? Anything tried and rejected? Open questions?_

**Transcript:** `/Users/james/.claude/projects/-Users-james-dev-fortium-ensemble-vnext/598e13f6-ec96-46fc-b4d7-ba43193f17ca.jsonl`

---
