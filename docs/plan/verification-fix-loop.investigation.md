# Investigation: verification-fix-loop

**Kind**: change
**Weight**: medium
**Route**: plan
**Source brief**: `docs/plan/verification-closeout.brief.md` §1 and §5 (owner decisions 2026-09-27,
recorded there verbatim, including the reversal of verification-convergence NG2)

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | When a verification run ends `stalled`, `stuck`, `unbuilt` or `insufficient-coverage`, its readout and report give a **diagnosis by cause with counts** — e.g. evidence missing / stale / locator not found / judged failed / environment not reachable / capability absent / never exercised — and name the next step (a short chat, then `/verify-build --fix`). It does not try to fix anything itself | owner, 2026-09-27 (brief §1: "provide the mechanism… to do some planning and iterating") |
| O2 | A **bridge skill**, conducted by the orchestrator in a short chat with the owner, writes `.trd-state/<feature>/verification-plan.md` in a fixed, command-readable shape: blockers (each small enough to be a task), slicing and order, owner rulings (also written into the PRD/TRD), criteria accepted as not verifiable, extra checks to add, and a **stop rule** | owner, 2026-09-27 (brief §1: "if a short chat — even with an orchestrator agent — can be the bridge") |
| O3 | **`/verify-build --fix`** reads the plan and runs without questions: blockers → built; then verify → one fix batch for what failed → re-verify only what failed, repeating until the plan's stop rule; then reports the remainder, each with a reason | owner, 2026-09-27 (brief §1: "the /verify-build kicks off the next 6 hours of autonomy") |
| O4 | Without a plan, `--fix` does **one** fix-and-re-verify cycle | brief §1 |
| O5 | Check pages republish after each `--fix` round and the owner's comments are read before the next | owner, 2026-09-27 (FS-28 ruling; brief §5 "Check pages between batches") |
| O6 | An autonomous `--fix` run **never edits `verification.md`**; a change it needs is recorded for the next bridge | owner, 2026-09-27 (brief §3 approval model) |
| O7 | The outer loop runs **only on explicit invocation with `--fix`** and has **one** stop rule — the conditions on which the owner reversed NG2 | owner, 2026-09-27 (brief §1, NG2 reversal) |
| O9 | Framework-shipped skills are named in ONE list with a role (`check` or `support`); adding a skill is a one-line edit, and only `check` skills are selectable as verification checks | owner, 2026-09-27 ("yes to one list") |
| O8 | Verification documentation stops contradicting the delivered loop: what `--resume` re-enters, where lanes are derived, and whether `--verify` is required | brief §5 (stale list, re-grounded below) |

## Intended Change

Checkable end state:

- A failing criterion in the verification state file carries a **cause** from a fixed set; the
  report's header area gains a **Diagnosis** block (counts by cause) under the Coverage line, and
  both `/verify-build` and `/implement-trd` name `/verify-build --fix` as the next step when a run
  ends stalled/stuck/unbuilt/insufficient-coverage.
- `packages/skills/<bridge-skill>/SKILL.md` exists, ships to every project like the check skills,
  and is NOT selectable as a verification check.
- `/verify-build --fix [plan]` exists: records each open `not_met`/`unbuilt` criterion (and each
  plan blocker) as a blocking discovery carrying its criterion id; builds them through
  `/implement-trd --reconcile` in a chained mode that emits no banner and runs no verification of
  its own; re-verifies open criteria (carrying `met` forward); republishes check pages; reads
  comments; stops on the plan's stop rule (one round without a plan); ends with ONE banner.
- `not_verifiable` and `insufficient-coverage` are never turned into build tasks.
- The stale lines listed in Grounding (G) are corrected.

## Decision

- **`--fix` owns the outer loop; `/implement-trd` builds.** Each round: record gaps → build via
  `/implement-trd --reconcile` in a new **chained mode** (no banner, no notify, no Step 8 — the
  caller verifies) → re-run the verification workflow over what is open → republish pages → read
  comments → test the stop rule. Rejected: calling `/implement-trd --reconcile` plainly in a loop —
  it would print a COMMAND COMPLETE banner mid-turn every round (breaking "one banner per run",
  command-status.md) and run a second, redundant verification each round. Rejected: re-implementing
  phase dispatch inside `/verify-build` — duplicates `/implement-trd`.
- **Cause is stored, not re-parsed.** Add a `cause` to the Judge's per-criterion record (and the
  settled map) rather than pattern-matching free-text reasons; the checker already computes the
  failure kind and discards it.
- **Discoveries carry the criterion id** so promotion dedupes on it, not on a reworded summary.
- **The bridge skill is a framework-shipped skill but not a check.** It joins the ship/refresh/
  rebase lists; it does NOT join the list `/implement-trd` §8.1b, `trd-authoring.md` and
  `audit-trd.js` read to select checks.
- **The stop rule** lives in `verification-plan.md` in a small fixed vocabulary (e.g. max rounds,
  stop when a round closes fewer than N, stop when only blocked criteria remain); `--fix` without a
  plan = one round.
- **NG2 is amended, not deleted**, in `docs/TRD/verification-convergence.md`, citing the owner's
  reversal and its two conditions.

absorbed:     `cause` field on criteria — the by-cause diagnosis (O1) cannot be built from what is stored today  [BLOCKS]
absorbed:     `/implement-trd` chained mode — `--fix` cannot loop without a banner mid-turn and double verification  [BLOCKS]
absorbed:     criterion id on discovery rows — `--fix` re-runs would promote reworded gaps twice  [BLOCKS]
absorbed:     stale verification wording (O8) — owner-scoped into this plan (brief §5), same files
absorbed:     ONE shared list of framework-shipped skills, each with a role (`check` | `support`) — owner, 2026-09-27 ("yes to one list"). This plan adds the first `support` skill; every reader (scaffold `FRAMEWORK_SKILLS`, the three `rebase-project.md` copies, `trd-authoring.md`, `audit-trd.js`, `/implement-trd` §8.1b, `packages/skills/README.md`, `CLAUDE.md`, the runtime-integrity and scaffold tests) reads the list instead of a hand-copied set of names; check selection filters on `role: check`
not absorbed: CodeRabbit's smoke-scenario tightenings for verification-artifacts — separate
not absorbed: `verification.md` setup skill and coverage-floor question — separate plan (brief §3)

## Grounding

A. `packages/core/lib/functional-verification.js` — `decideNext` exits in fixed order
(:268-307): `exit-unbuilt` (any unbuilt), `exit-satisfied` (no gaps), `exit-stalled`
(previousGaps non-empty and none closed), `exit-stuck` (iteration ≥ cap), else `remediate`;
`exit-insufficient-coverage` re-labels satisfied/stalled/stuck last (:315-331), dormant while
`COVERAGE_FLOOR = null` (:210). Reasons are aggregate strings [read]. `checkEvidence` failure kinds:
`missing | empty | stale | no-artifact | not-a-file | no-locator | locator-not-found` (:69, :88-148)
— produced for the Judge's STEP 1 and never persisted [ran]. `renderReport` (:382-540): header
Outcome/Reason/Criteria/Coverage (:432-447), then tables; a Diagnosis block fits after :447 [read].

B. `packages/core/workflows/verify-functional.js` — `buildFinalResult` (:828-847) returns
`{outcome, reason, iterations, reportPath, criteria, gaps, unbuilt, exercised, debugAttempts,
notesUpdated, coverage, finalRun, pages}`; per-criterion `{id, status, tier1, artifact, reason,
files}`, `JUDGE_CRITERION_SCHEMA` `additionalProperties:false` (:642-653) — adding `cause` means the
schema, the state-file prompt (:478) and the settled map (:917-925) [read]. `cap` required
(:93-100); cap is a total across resumes; an exhausted resume returns `stuck` at once (:939-963).

C. `packages/core/commands/verify-build.md` — flags `[trd-path] [--resume] [--cap N]` (:5); steps
1 resolve (:53), 2 preflight (:58), 3 inputs (:69), 3a derive (:104), 3b checks (:157), 3c lanes
(:164), 4 dispatch (:173-202), 5 report (:204-212); readout (:216-221); banner (:252-255);
"do not offer to fix" (:271-275) and §8.5 import (:211) need a `--fix` carve-out [read]. The
`--resume` section (:223-227) is correct; line :31 ("crashed, stalled, or was interrupted") and :36
are stale [read].

D. `packages/core/lib/discovered.js` — `record()` (:347-402): kind, foundBy, phase, summary ≤400,
blocksFeature, file/files ≤20, evidence, status ∈ VERIFICATION_STATUSES (:49); no criterion field.
`PROMOTABLE_STATUSES = ['not_met','stalled','unbuilt']` (:50); `promotable()` (:68-75);
`promoteToTrd()` (:97-233) appends AMEND-NNN rows to the last task table, dedupes on normalized
summary (:166-192; test discovered.test.js:199-200) [read].

E. `packages/core/commands/implement-trd.md` §2.1a `--reconcile` (:241-292): reconcile(),
promoteToTrd(), then a normal run; Step 8 verification runs by default [read]. Chaining:
`fix-plan.js` chained paths return `banner:null, notify:false` (:87-90, :131-140);
`.claude/rules/command-status.md:449-458` "one banner per RUN"; `plan.md:943-944` "control returns
here when it finishes — when it does, the run is over" [read]. `implement-trd.md` has no
`disable-model-invocation`, so `Skill({skill:'implement-trd'})` is permitted [ran].

F. Skill shipping — `FRAMEWORK_SKILLS` in `packages/core/scripts/scaffold-project.sh:43-47`, used by
`copy_framework_skills()` (:854, :879), comment :39-42 lists the other places; also
`rebase-project.md` (:366, :692, :707, three copies incl. plugin-only), `packages/skills/README.md:48`,
`CLAUDE.md:535`, `runtime-integrity.test.sh:331`, `scaffold-project.test.sh:775` [ran]. The check
selection reads the same three names at `implement-trd.md:1379-1381`, `trd-authoring.md:616`,
`audit-trd.js:155` [read] — the bridge skill must not appear in those.

G. Stale wording still on main [ran]:
- `.claude/rules/process.md:142` and `packages/core/templates/process.md.template:142`:
  `--verify` + `--resume` "re-enters a **stalled** verification loop" — only an interrupted one
  (outcome null).
- `packages/core/commands/verify-build.md:31`, `:36`.
- `docs/TRD/functional-verification.md:1029-1038` (lanes derived at 3.6a — now §8.1a) and `:1074`
  (resume passed whenever a state file exists — drops the explicit-flag / outcome-null gate).
- `docs/TRD/verification-convergence.md` VCON-B009 `:753`, TR7 `:973`, §7.3 `:980`, and
  `:1125-1128`, `:1209`, `:1221` (§3.6a lanes).
- `packages/core/lib/fix-plan.js:132-134` ("--verify is not optional", `chainArgs …--verify`) and
  `:158` — verification is on by default.

H. Bounds — no time or cost budget exists anywhere [ran]. `/implement-trd` has whole-phase retry
and STUCK at retry ≥3 (:79, :1814). The outer `--fix` loop has no bound but the stop rule; a
default for the no-plan case is one round. NG2 at `docs/TRD/verification-convergence.md:1006`.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Bridge skill name | `verify-plan-recovery` | no |
| OQ-2 | Default stop rule inside a plan that omits one | at most 3 rounds, and stop early when a round closes no gap | no |
