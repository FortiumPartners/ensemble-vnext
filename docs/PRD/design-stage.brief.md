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

### Owner rulings, `/refine-prd` 2026-11-04

| Question | Answer |
|---|---|
| OQ-2 `/sync-design` acceptance (2026-11-04, `/refine-prd`) | (chose: "Owner ruling only (Recommended)") — only an owner ruling accepts a build that differs from its board; a TRD decision does not. Keeps `verification-artifacts` D14 |
| OQ-7 `refine-design.js` (2026-11-04, `/refine-prd`) | (chose: "No workflow (Recommended)") — `/refine-design` runs like `/refine-prd`: in the main session, interactive by default, `--auto` unattended |
| Scope and priority, OQ-1 (2026-11-04, `/refine-prd`) | (chose: "Phases 1-4 P0, sync P1") — issue phases 1 to 4 (rules and libraries, `/design-system`, create/refine, `/audit-design`, design as TRD/plan input, the design checks) are P0; phase 5 (`/sync-design`, `--drift`) is P1 |
| OQ-5 publishing off (2026-11-04, `/refine-prd`) | (chose: "Write files, end STUCK (Recommended)") — with `ensemble.publishArtifacts: false` a design command writes the repository copy and renders, then ends STUCK naming the publish step |
| OQ-3 stale design system (2026-11-04, `/refine-prd`) | (chose: "Carry on, record drift (Recommended)") — draw against the installed system, record the drift in the map and ISSUES, `/design-system --sync` first in NEXT |
| OQ-4 `/audit-docs` scope (2026-11-04, `/refine-prd`) | (chose: "Exclude docs/ui/ (Recommended)") — `/audit-docs` skips `docs/ui/`; `/audit-design --drift` is the design's own drift check |
| OQ-6 accessibility floor (2026-11-04, `/refine-prd`) | (chose: "Offered default (Recommended)") — `/design-setup` offers 4.5:1 and 44 px; the owner's answer is what `design.md` records |
| OQ-8 as-is mismatch mark (2026-11-04, `/refine-prd`) | (chose: "Leave to the TRD (Recommended)") — the PRD requires the mark exist and be readable by the checks; the TRD names the field |
| Challenge-pass findings B1–B14 on PRD 1.1.0 (2026-11-04, `/refine-prd`) | Accepted all fourteen. B7 (chose: "design-map.json only (Recommended)"): `design.md` stays owner-only; the system's version and code commit live in each `design-map.json`. On B2 the owner asked about wall-clock cost ("I like B2 but worry it would add a lot of wall clock time") and accepted it as a cheap check: compare the canvas version with the last sync, read boards only when it changed. On B6/B8/B10 the owner asked to "balance a logical flow with not overengineering" and accepted all three as removing contradictions without adding machinery |

### Challenge-pass findings B1–B14, as the owner accepted them (2026-11-04)

The text of each finding the row above accepts, copied verbatim from the challenge-pass table
of the `/refine-prd` session (transcript `7348a86a-641c-4089-9f06-0c4cf6808534`), so that
"ruling Bn" in the PRD resolves here. Added by `/audit-prd`, 2026-11-04; no wording changed.

| Action | ID | Line as written, or the issue text it misses | Citation |
|---|---|---|---|
| add-back | B1 | The stale-system check sits only in AC-F8.1 (`/create-design`). | Issue, "Code and design system": "Every design command runs `git log <code_commit>..HEAD -- <paths>`". |
| add-back | B2 | F5's description says the sync runs "at the start and end of every design command", but no acceptance criterion carries it. | Issue, "Canvas and repository: `design-mirror.js`, run at the start and end of every design command". |
| add-back | B3 | No criterion covers `/design-system` installing the system on the product's canvases. AC-F6.5 covers only the `--sync` reinstall. | Issue, Commands: "installs it on the product's canvases". |
| record-rejection | B4 | Wrappers for Vue, Svelte, Angular and Web Components are neither a requirement nor a Non-Goal. AC-F4.4 says "no bundle, so parts are used". | Issue stack table: "React wrapper per component" and "real, through a thin React wrapper". The issue's Libraries row says "Others: none". Revisit if a product on one of those stacks needs the structure check. |
| record-rejection | B5 | Nothing records that the downstream orchestrator fixes its own stale `create-design` references. | Issue, Decisions: "which it fixes on its own side". |
| merge | B6 | AC-F12.1: "Only `approved` and `shipped` to-be boards are requirements". But AC-F11.3 moves boards to `building` at TRD time, so during `/implement-trd` no board qualifies. Fix: include `building`. | Issue Edits row (verify-design-comparison) vs "From design to code", first bullet. |
| merge | B7 | AC-F6.2: `/design-system` "Records the system's version and code commit in `design.md`". That contradicts F1, where only the owner changes `design.md`. Fix: keep the version in `design-map.json` only, or state this as the one exception. | Issue, "Owner-governed rules" vs Commands row; `verification.md` says "No autonomous run edits this file". |
| merge | B8 | NFR-3 says every canvas is "listed in each `design-map.json`", but the AC-F2.1 schema has a single `canvas` object. | Issue, Open risks vs issue schema. |
| merge | B9 | AC-F5.5: "The fourth case (neither changed) changes nothing". The issue's four sync cases are canvas changed, repository changed, both changed, and publish refused. Fix: fold this criterion into AC-F5.6. | Issue, "Keeping things in sync", the four bullets; phase 1 "all four sync cases". |
| merge | B10 | AC-F3.3 renders "at the commit the board was approved", but the schema has no approval commit, only `shipped_commit`. Fix: leave where it comes from to the TRD, as OQ-8 did. | Issue schema vs issue "How the frames are made". |
| merge | B11 | NG12 ("Machinery beyond what each criterion needs") repeats NFR-1 and is not a specific exclusion. | The PRD quality standard: non-goals must be specific. |
| merge | B12 | AC-F1.7 has `design.md` record credential locations. The issue has sign-in point at `verification.md`, which already holds them. Fix: fold into AC-F1.3 as "points at `verification.md` §3; holds no credential". | Issue, "How to reach a screen ... pointing at `verification.md` environments". |
| lower | B13 | AC-N3: "A design past 512 files is split per epic flow ... Unit test". This is automatic split machinery; the issue states a convention. Fix: lower to "the map can list more than one canvas". | Issue, Open risks: "Past 512 files, one canvas per epic flow, all listed in each `design-map.json`"; owner: "don't over engineer this". |
| lower | B14 | AC-F9.6: "May let a single agent publish a single board". A permission cannot be tested, and under OQ-7 the main session publishes. Fix: move it to a note in F9's description and keep the permission. | Issue: "`/refine-design` may let a single agent publish a single board"; ruling OQ-7. |

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
