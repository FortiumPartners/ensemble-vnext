# Brief: design stage (issue 58), the in-session delta

The source document is `docs/plan/design-stage.issue-58.md`, a verbatim copy of GitHub issue
#58. This brief does not restate it. It carries only what this session added. Session
transcript: `/Users/fortium/.claude/projects/-Users-james-dev-fortium-ensemble-vnext/7348a86a-641c-4089-9f06-0c4cf6808534.jsonl`.

The phase-0 spike the issue names was run in this session. Its record is a second document,
to be read **verbatim**: `.trd-state/task-issue-58-phase-0-spike/findings.md`. Its evidence
is beside it.

## Settled

| What | Where it was settled |
|---|---|
| The owner's instruction for this PRD, verbatim: "Build per our design but don't over engineer this. Use our existing patterns" | the `/create-prd` invocation, 2026-11-03 |
| "Our design" is issue 58 as written. Its scope is the requirement set; "don't over engineer" governs how much machinery each part gets, not which parts exist. Any part of the issue left out must be a stated Non-Goal | the same invocation, read with the PRD rule that dropping a requirement must be explicit |
| "Use our existing patterns": the new commands follow the existing command shapes (create/refine/audit as `/create-prd`/`/refine-prd`/`/audit-prd` do; an owner interview like `verification-setup`; owner-governed rules like `verification.md`; workflows on `test-harness.js`; artifacts recorded through `artifacts.js`; the four-section readout and banners) | the same invocation; the issue's own tables already point at each of these |
| A record of the same direction on another feature: for `/ship-build` the owner said "I believe we've designed the right thing but have over designed it. It's supposed to solve a few simple problems", then of its first TRD, "18 tasks and 6 phase again feels like we may be overengineering". Context for what "don't over engineer" means to this owner, not a requirement of this PRD | `docs/plan/ship-build.brief.md` §10, rows dated 2026-11-02 |
| Spike (b): NativeWind 4 components keep their styles on the canvas runtime when bundled with `jsxImportSource: 'nativewind'` and the app's own Tailwind config. NativeWind's Babel transform is not needed. So the issue's "React Native, NativeWind: not yet" row is now "real" | findings.md §(b) |
| Spike (c): a workflow agent can publish to a canvas, provided it first reads the whole artifact (`read` with no `path`). A one-file read is refused | findings.md §(c) |
| Spike (d): an interactive session started the way Forge starts one (`sudo -u <user> tmux … claude --dangerously-skip-permissions`) can publish under fortium, islaygold, bd4 and tg. james was not tested (weekly limit). A launch into a folder the account has never trusted stops at Claude Code's trust prompt | findings.md §(d) |
| Spike (a): partly settled. Both boards drew on the hosted page and could be commented on; no board was reported with errors; no screenshot of the drawn components yet. The bundles were linked from `project/lib/`, not installed as a design system, so the design-system install path on the hosted page is unproven | findings.md §(a), with its 2026-11-04 update |
| The issue says `skills/frontend-design` has a "confirm with the client" step to drop. This repository's `packages/skills/frontend-design/SKILL.md` has no client, stakeholder or approval step (searched for `client`, `stakeholder`, `approval`: no match). The edit is either already done or aimed at a different skill (the plugin `frontend-design:frontend-design`) | a grep in this session, 2026-11-03 |

## Superseded

| Earlier position | Replaced by | Why |
|---|---|---|
| The issue's stack table: "React Native, NativeWind: not yet … real once the NativeWind transform is bundled" | real, with `jsxImportSource: 'nativewind'` and compiled Tailwind CSS | spike (b) |
| The issue's Phase 0 as an open gate on the rest | done, except one hosted-page screenshot (a) and the james account run (d) | findings.md |
| The issue's rule "Why the lead publishes, not the board agents", with workflow agents' ability unknown | any agent can publish after a whole-artifact read; one publisher per round stays a choice, not a necessity | spike (c) |

## Raised, not adopted

| Idea | Status at end of conversation |
|---|---|
| Starting the PRD in this session while the ship-build audit was still running | not done; the PRD was started after the audit finished and ship-build was parked |
