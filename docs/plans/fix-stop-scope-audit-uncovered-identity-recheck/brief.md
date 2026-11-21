# Brief: Three Ensemble fixes — stop check scope, audit over unservable requirements, verify identity re-check

This is a list of three independent issues, each with its own steps, expected, actual, where and how to check. The owner's list comes first, verbatim except that one flag token is spelled as words.

## Owner's list (verbatim)

# Three Ensemble defects from the Storybook / dart / BD4 log review (2026-11-14 to 2026-11-21)

Owner-approved 2026-11-21 ("A"). Three independent fixes.

## 1. The stop check applies its "mid-command pause" rule outside Ensemble commands, and can press for production or credential acts

- **Cause, confirmed.** `.claude/hooks/router.py` `resolve_marker_fields()` writes `state=active` for any slash-command prompt (`is_slash_command(prompt)`), including other plugins' commands such as Forge's `/forge-inbox`. That command never prints COMMAND COMPLETE, so the marker stays `active` for up to 30 minutes, and `discipline-stop` case B then judges ordinary replies.
- **Evidence.** All 5 Stop blocks in dart's PM session (`/Users/dart/.claude/projects/-Users-james-dev-lightning-lane/dd8f8112-76a2-47ae-8320-b1c061078409.jsonl`, 2026-11-21 00:43, 01:39, 01:51, 09:09 and 12:15 UTC) have `state=active` as the last marker before them.
- **What the judge did.** At 01:39 it called a second question about deleting backup files that hold keys "the running task's own next step". At 01:51 it said the same about switching production's workers to a new key. Both times it offered "or state plainly you are not doing it". Across dart, 29 blocks happened in 7 days, and about 12 were wrong.
- **A second, residual misfire.** Once, the judge applied case B when the marker read `state=none`: the Ensemble PM session 91db5959, 2026-11-21.
- **Fix:**
  - Mark `active` only for this framework's own commands. A list exists (`packages/skills/framework-skills.txt` or the commands directory); pick the authoritative source.
  - In `packages/core/hooks/prompts/discipline-stop.source.md`, make "asking before anything irreversible, destructive, outward-facing, or touching production, credentials or someone else's data" never case B. That holds even when it is asked again, and even when the judge thinks the answer is obvious.
  - Rebuild with `build-judge-prompts.js` and `generate-hooks-artifacts.sh`.
  - Add router tests: a non-framework slash command must not write `active`, and a framework one must.
  - Re-score with `test/discipline-corpus/replay/`, adding the dd8f8112 cases as labelled allow cases.

## 2. The build audit cannot close a feature over requirements no task can cover

- **Coverage targets.** `packages/core/commands/create-trd.md:123` defines coverage targets as **Objectives**, and `/plan` writes the same rows. No task is ever told to serve them, so the audit's traceability check counts them `uncovered`. `packages/core/lib/audit-rounds.js` `decide()` then returns early (`if (uncovered > 0) return out;`, around line 209) and the feature never closes.
  - BD4 evidence: self-enrichment-apply-fix-the-user-path (O9 and O10, 2026-11-16), own-profile-api (O14, 2026-11-16) and resume-upload-ai-parsing (O9, 2026-11-18). That cost 2 owner escalations, 1 `/refine-trd`, 1 the reconcile option, 1 re-audit and 2 `/amend` runs. Measured coverage was already 98% and 79% in two of the cases. See `refs/ensemble/records/*/audit-rounds.jsonl` in /Users/james/dev/fortium/tbd/tbd-backend (`uncovered: 1` or `2`, 0 defects).
- **Deferred requirements.** A requirement that the brief or TRD explicitly defers is also counted `uncovered`. Examples: a check that can only run after the merge, a live proof blocked by a shared environment, and coverage left unmeasured.
  - dart evidence (/Users/james/dev/lightning-lane): 7 Forge escalations, 2026-11-14 to 2026-11-20, whose reason begins "PB-2b". Four features were closed by hand rather than by the audit: desktop-three-column-workspace, dev-test-access, dining-plan-flow-on-web and find-decide-book-chain-local.
- **Fix:**
  - A coverage objective counts as covered when the phase gate's measured coverage meets it, and as a test gap when it does not. Alternatively, `/create-trd` and `/plan` generate a coverage-measurement task for each coverage objective; choose one approach.
  - A requirement served only by a deferred-by-design task (the `[LIVE]` and deferred markers `/implement-trd` already understands) counts as `deferred`, which already "never counts", not `uncovered`.
  - Keep "genuinely unserved requirement → stays open". That behaviour is correct.
  - Add tests in `audit-rounds.test.js` and in whichever tally or classify path changes.

## 3. Functional verification does not notice the environment changing under it

- **What happens.** `packages/core/workflows/verify-functional.js` runs the setup and identity check only before Exercise. An empty identity (no identity command declared) passes as fine.
- **Evidence.** At BD4, dev `api` was redeployed under two running checks:
  - brief-sender-background-and-common-ground (2026-11-16): "Dev `api` got a new deployment at 09:35:57Z, 12 seconds after I confirmed the branch was live";
  - resume-upload-ai-parsing (2026-11-17 to 18).
    That caused 2 `/verify-build` STUCK runs and about 3 extra verification runs.
- **Fix:**
  - When the target has an identity command, re-run it after each Exercise pass. If the build changed, mark that pass's evidence stale and re-exercise, counting it against the cap, and record it in the report.
  - When the target is remote or shared and declares no identity command, say so as one ISSUES line ("build identity not checkable"), never silently treat it as fine.
  - Add tests.
- **Out of scope:** a cross-session lease on shared environments, and daily quotas.

## Issue 1: the stop check applies its mid-command pause rule outside Ensemble commands

### Steps

1. In a scaffolded project, submit a prompt that starts with another plugin's slash command, for example `/forge-inbox`.
2. Read the marker the router writes: `resolve_marker_fields("/forge-inbox", <project dir>, "<session id>")`.

### Expected

Only this framework's own commands write `state=active`. A foreign slash command writes nothing active, so `discipline-stop` case B (mid-command pause) never judges ordinary replies after it. Separately, asking before anything irreversible, destructive, outward-facing, or touching production, credentials or someone else's data is never case B, even when asked a second time and even when the judge thinks the answer is obvious.

### Actual

Run on 2026-11-21 against the current tree: it returns `('active', '/forge-inbox', None, 'abc-123')`. The marker then stays active for up to 30 minutes and the judge blocked 5 ordinary replies in dart's PM session (all with `state=active` as the last marker before them), twice pressing for production or credential acts (deleting backup files that hold keys; switching production's workers to a new key). A residual misfire also happened once with `state=none` (Ensemble PM session 91db5959).

### Where

`packages/router/hooks/router.py:806` (`resolve_marker_fields`, which calls `is_slash_command`; the vendored copy `.claude/hooks/router.py` is byte-identical today and must stay so). Judge prompt: `packages/core/hooks/prompts/discipline-stop.source.md` (case B wording). Authoritative list of the framework's own commands: the commands directory (`.claude/commands/<name>.md`, 28 commands), because `packages/skills/framework-skills.txt` lists skills (check, support, design), not slash commands.

### How to check

New router tests in `packages/router/tests/test_router.py`: a non-framework slash command (`/forge-inbox`) must not write `active`; a framework one (`/plan`) must. Run `pytest packages/router/tests`. They fail now on the first case. Then rebuild the judge prompt with `build-judge-prompts.js` and `generate-hooks-artifacts.sh`, re-score with `test/discipline-corpus/replay/`, adding the dd8f8112 cases as labelled allow cases in the corpus.

## Issue 2: the build audit cannot close a feature over requirements no task can cover

### Steps

1. Hand `tally` a reconcile item for a coverage-target objective that no task serves: `tally([{id:'O9', covered:false, action:'gap-untested', check:'traceability'}])`.
2. Pass the result to `decide({rounds:[{}], verdict:'VERDICT: proceed', ...tally})`.

### Expected

A coverage objective counts as covered when the phase gate's measured coverage meets it, and as a test gap when it does not. A requirement served only by a deferred-by-design task (the `[LIVE]` and deferred markers `/implement-trd` already understands) counts as `deferred`, not `uncovered`. A genuinely unserved requirement still stays open.

### Actual

Run on 2026-11-21: `tally` returns `uncovered: 1` and `decide` returns `close: false`, so the feature never closes. At BD4 this cost 2 owner escalations, 1 `/refine-trd`, 1 reconcile run, 1 re-audit and 2 `/amend` runs (features self-enrichment-apply-fix-the-user-path, own-profile-api, resume-upload-ai-parsing), with measured coverage already 98% and 79% in two cases. At dart, 7 Forge escalations beginning "PB-2b" and four features closed by hand (desktop-three-column-workspace, dev-test-access, dining-plan-flow-on-web, find-decide-book-chain-local).

### Where

`packages/core/lib/audit-rounds.js:110` (`tally` counts any `covered === false` item as uncovered before `classify` runs) and `packages/core/lib/audit-rounds.js:209` (`decide` returns early on `uncovered > 0`). Origin of the rows: `packages/core/commands/create-trd.md:123` defines coverage targets as Objectives; `/plan` writes the same rows.

### How to check

New tests in `packages/core/lib/audit-rounds.test.js` (and any other tally or classify test the change touches): a coverage objective met by measured coverage closes; one unmet becomes a test gap; a requirement served only by deferred tasks counts `deferred`; a genuinely unserved requirement stays `uncovered` and keeps the feature open. Run `npx jest packages/core/lib/audit-rounds.test.js`. The first two fail now.

Decision taken (owner's call, default): use the measured-coverage approach, not generating a coverage-measurement task in `/create-trd` and `/plan`, because it needs no TRD format change and also frees TRDs already written.

## Issue 3: functional verification does not notice the environment changing under it

### Steps

1. Run the verification loop against a remote or shared target that has an identity command.
2. Redeploy the target between the Setup check and the end of the Exercise pass.

### Expected

When the target has an identity command, it is re-run after each Exercise pass. If the build changed, that pass's evidence is marked stale and re-exercised, counted against the iteration cap, and recorded in the report. When a remote or shared target declares no identity command, the report says so as one ISSUES line ("build identity not checkable"), never silently treated as fine.

### Actual

The Setup check and identity command run only before Exercise (`packages/core/workflows/verify-functional.js:3850`), and an empty identity passes (`:504` accepts `""`). At BD4 dev `api` was redeployed under two running checks (brief-sender-background-and-common-ground, 2026-11-16, 12 seconds after the branch was confirmed live; resume-upload-ai-parsing, 2026-11-17 to 18), causing 2 `/verify-build` STUCK runs and about 3 extra verification runs.

### Where

`packages/core/workflows/verify-functional.js`: the Exercise call at about line 3850 (`exercisePass`), the Setup prompt `buildSetupPrompt` at line 1322, and the identity validation at line 504.

### How to check

New tests in `packages/core/workflows/verify-functional.test.js`: with an identity command whose output differs before and after Exercise, the pass is marked stale and re-exercised against the cap and the report records it; with no identity command on a remote or shared target, one "build identity not checkable" line appears. Run `npx jest packages/core/workflows/verify-functional.test.js`. They fail now.

Out of scope: a cross-session lease on shared environments, and daily quotas.

## Open questions

- Issue 1: which list is authoritative for "own commands". Default taken (owner's call): the vendored commands directory, `.claude/commands/`. Plugin-prefixed forms such as `/ensemble-vnext:plan` count as the framework's own.
- Issue 2: measured-coverage approach chosen over generated tasks (owner's call, default, above). The audit needs the phase gate's measured coverage figure from the run record; if the record lacks one, the objective is treated as a test gap, not covered.
- Issue 3: the exact "remote or shared" test for a target is not defined in the code; default taken (owner's call): a target whose environment has a url that is not localhost.

Decisions: Authoritative command list: the vendored commands directory (owner's call, default taken, 2026-11-21). Coverage approach: measured coverage meets the objective (owner's call, default taken, 2026-11-21). Remote or shared target: has a non-localhost url (owner's call, default taken, 2026-11-21).
