# TRD: plan-sweep-chain

**Source PRD**: None — small change decided in session; investigation record `docs/plan/plan-sweep-chain.investigation.md`
**Weight**: medium (re-weighed from small after the adversarial review found 14 problems, four of which let the never-unattended brake fail open)

## Changelog

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.2.0 | 2026-10-03 | Audit applied (4 findings): `plan.md`, not the pure `fix-plan.js`, reads whether the core TRD exists; the sweep's changed-file list compares content hashes so a re-edit of an already-modified file reaches the brake and the commit; an unreadable §5b list with no core TRD now says why the chain stopped; a fold-back that leaves no sweep ids skips `render-sweep`, and the commit adds before committing and is skipped when nothing is staged | technical-architect (audit-trd) |
| 1.1.0 | 2026-10-03 | Adversarial review applied (14 findings): `sweepChainNext` is the only sequencer and returns the stop banner itself; the never-unattended brake is checked at every point work can begin (an unreadable list stops, folded tasks are re-checked, §5b paths are kept out of the sweep and a git-status backstop catches unclaimed edits); a stale verification state reads as not satisfied; the run starts on a feature branch; fold-back follows Step 6a's after-the-last-writer order; `/sweep` strips its flags; `/verify-build --chained` asks nothing; `command-status.md` lists the new chained commands. Re-weighed to medium | main agent |
| 1.0.0 | 2026-10-03 | Initial light TRD | main agent |

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | When `/plan` writes a sweep list and `--implement` is passed (and no owner never-unattended path is hit or unreadable), it runs the four steps itself, in order: `/sweep` on the sweep file, `/verify-build` on the sweep file, a commit of the swept fixes, then `/implement-trd` on the core TRD. Without `--implement` it stops and lists the same four steps, as today. | owner, 2026-10-03: "chain the sweep ending when --implement is passed: sweep, verify the sweep, commit the swept fixes, then implement the core" |
| O2 | The chain stops, without committing or building the core, when the sweep's verification is not `satisfied` in this run. | owner, 2026-10-03: "stop if the sweep is not satisfied" |
| O3 | When the sweep finds criteria that are not sweep items (deferred, too big, sharing a file with the core, or touching a never-unattended path), the chain moves them into the core plan and carries on without asking. | owner, 2026-10-03: "If the sweep determines that items need to be folded back into the plan step, accommodate that and automatically continue" |
| O4 | The run ends with exactly one banner. `/sweep` and `/verify-build` emit no banner of their own inside the chain; `/implement-trd` ends the run when it is reached, and `/plan` ends it on every earlier stop. | `.claude/rules/command-status.md`: "one banner per RUN, not one per command name" |
| O5 | The owner's never-unattended paths (`verification.md` §5b) are never edited unattended by the chain, and an unreadable list stops it. | `.claude/rules/verification.md` §5b ("Paths `/plan --implement` will never build without you watching"); `fix-plan.js:129-139` ("an unreadable list is never 'no brake'") |

## Intended Change

Today (`packages/core/lib/fix-plan.js` `finishSweep`, lines 206–239 [read]) a sweep list always
returns `chain: false`, even with `--implement`, and NEXT lists the four steps for the owner to run.
After this change:

1. **`plan()`** with `sweepList: true` chains only when `implement === true`, the never-unattended
   hits are empty and its status is not `invalid`. It then returns `chain: true`, a handoff line,
   `banner: null`, `notify: false`, `chainSkill: null`, and `chainSteps`, a lookup of skill and
   args per step (`sweep`, `verify`, `implement`), not an order. Otherwise its output is today's.
2. **`sweepChainNext`** (new, `fix-plan.js`) is the only thing that decides what runs next. It
   reads what the previous step left on disk, as values `plan.md` passes in: the sweep result, the
   verification outcome (null when this run wrote none), whether a core TRD exists, and the brake
   results for the sweep's changed files and for the core TRD. It returns the next action
   (`fold-back`, `verify`, `commit`, `implement` or `stop`) and, on `stop`, the banner, its body
   and the notify status, as `finish()` already does for the other endings.
3. **The run starts on a feature branch.** Before `/sweep`, `/plan` creates or switches to
   `feature/<slug>/impl`, so the sweep commit never lands on the default branch.
4. **`/sweep --chained`** strips its flags before reading the list, keeps any item whose fix would
   touch a never-unattended path out of the fix (it is deferred, so it folds back to the core,
   where the brake stops it), records not-a-sweep-item and overlapping ids in
   `sweep-result.json` (`notSweepItems`, `overlap`) instead of ending STUCK, records no `_sweep`
   discovery for them, and ends with one RETURN line.
5. **`/verify-build --chained`** on a sweep file asks no question (an environment needing the
   owner takes its stated default, as the fix loop already does) and ends with one RETURN line;
   the report and the evidence carry-over to the core still happen.
6. **Fold-back** moves the returned ids into the core in Step 6a's order: `render-sweep` with the
   remaining ids and `--core-trd docs/TRD/<slug>.md` → a task row and grounding block per folded
   criterion (or a light core TRD per Step 5a when none existed) → `audit-trd` once more at
   medium → `render-objectives` → §5a.1's checks → Step 6a's `check` → the never-unattended check
   on the core TRD. It never re-runs `/sweep`, and happens at most once per run. When every sweep
   id was folded back, `render-sweep` is skipped and the sweep file stays as `/sweep` read it, the
   record of what was attempted.
7. **Commit**, after a satisfied verification (or a fold-back that left no sweep ids), of every
   path the sweep changed (see Decision: status lines and content hashes before and after, not the
   fixers' claims), the sweep file and `.trd-state/<slug>-sweep/`: `git add -- <list>` then
   `git commit -- <list>`. The same file list is matched against §5b first; a hit stops the chain
   with the fixes uncommitted and says which §5b paths were edited. When nothing in the list is
   staged after the add, the commit is skipped and the chain continues; an empty commit is never
   attempted.

## Decision

The chain lives in `/plan`, which already owns the sweep ending and the `--implement` gate; it runs
the steps as `Skill()` calls in this session, the way it already chains `/implement-trd`. Neither
`/sweep` nor `/verify-build` disables model invocation, and `/verify-build` on a sweep file skips
its own fix loop (`verify-build.md:143-150`), so there is no nested chain. Inner commands skip
`notify-complete.sh` because it marks the run finished, which would switch off the autonomy
judge for the rest of the chain.

**`sweepChainNext` is the only sequencer.** An order fixed when `/plan` runs cannot see a fold-back
that creates a core TRD, so `plan()` supplies a lookup and the function decides each step. It
stays pure (`fix-plan.js` requires nothing and touches no file): `plan.md` checks whether
`docs/TRD/<slug>.md` exists immediately before each call and passes `coreTrdExists` in with the
other values. It also builds the stop banner, so no ending is worked out in prose — the drift
`fix-plan.js` was written to remove (`fix-plan.js:5-20`).

**The brake is checked wherever work can begin:** before the chain (an `invalid` list stops it, with
or without a core TRD — with none, Step 7 reads §5b with `read-never-unattended`), inside the
sweep (§5b items are deferred, so they fold back), on the core TRD after a fold-back, and on the
sweep's actual changed files before the commit. An `invalid` list with no core TRD gets the same
owner-policy sentence as with one, so the stop says why. Only exactly `satisfied` passes the
verification step, and a state file not newer than the step's start counts as no outcome.

**The changed-file list compares content, not just status lines.** `/plan` does not require a
clean tree before `/sweep` (it leaves its own documents uncommitted, and the owner may have work in
progress), so a file already modified before the sweep shows the same ` M path` line after a fixer
edits it again. Before `/sweep`, `plan.md` records `git status --porcelain --untracked-files=all`
and `git hash-object` of every path it lists; afterwards a path is changed when its status line is
new or different, or its hash differs. `--untracked-files=all` stops a new file inside an
already-untracked directory hiding behind the directory's line. A changed file that was already
dirty before the sweep is committed whole, and the readout names it as carrying earlier
uncommitted edits.

**The commit is for attribution,** not a clean tree: without it the swept fixes would be folded
into `/implement-trd`'s "chore(phase 1): checkpoint", which stages with `git add -A`.

Rejected: printing the four commands for the owner (today's behaviour, which O1 replaces); a fixed
step order from `plan()` (cannot follow a fold-back); a `/sweep` re-run after fold-back (redoes
finished fixes); the fixers' own claims as the commit and brake list (misses unclaimed edits); comparing status lines
alone (misses a re-edit of a file already dirty before the sweep); requiring a clean tree before
`/sweep` (`/plan`'s own uncommitted documents would always fail it); `git add -A` for the commit
(sweeps in unrelated untracked files).

## Non-Goals

- Changing anything when `--implement` is not passed, or when there is no sweep list.
- Retrying a failed sweep criterion inside the chain: a verification that is not `satisfied` stops
  it (O2), and the owner re-runs `/sweep` then `/verify-build`, as the report says.
- Re-running `/sweep` after a fold-back, or folding back more than once in a run.
- Changing `/sweep` or `/verify-build` when `--chained` is not passed, beyond flag-stripping and
  the two new `sweep-result.json` fields, which nothing outside the chain reads.

## Verification Artifacts

None apply — library code and command prompt text; no design frames, journeys or screens.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | `fix-plan.js` (core and `.claude/lib/` mirror): `finishSweep` chains only when `implement`, no hit and status not `invalid`, returning `chain: true`, `chainSkill: null`, `chainSteps` (a lookup: `sweep` → `/sweep <file> --chained`, `verify` → `/verify-build <file> --chained`, `implement` → `/implement-trd docs/TRD/<slug>.md`), the handoff line, `banner: null`, `notify: false`; otherwise today's output, except that the owner-policy sentence for an `invalid` status no longer requires `coreTrd` (today's `coreTrd &&` guard on it is dropped, so a stop with no core TRD says the §5b list could not be read). Add and export `sweepChainNext(input)` and `SWEEP_CHAIN_INPUTS` (its input key list) | O1, O2, O3, O4, O5 | None | `fix-plan.test.js`: with `implement: true` the sweep path chains with the three lookups, sweep and verify args carry `--chained` and name the sweep file, implement names the core TRD without it; `implement: false`, a hit, or status `invalid` return today's no-chain output (existing sweep tests pass; "whatever implement says" rewritten to `implement: false`; an `invalid` case added, with and without a core TRD, each `bannerBody` naming the unreadable §5b list). `sweepChainNext`: after `sweep` with `notSweepItems` or `overlap` → `fold-back` naming every id once; after `sweep` with neither → `verify`; after `fold-back` with sweep ids left → `verify`, with none left → `commit`; after `fold-back` with a core hit or core status `invalid` → `stop`; after `verify` with an outcome other than exactly `satisfied` (null included) → `stop` naming it; `satisfied` with a sweep hit or sweep status `invalid` → `stop` naming the paths; `satisfied` with neither → `commit`; after `commit` → `implement` when `coreTrdExists`, else `stop` as a completion. Every `stop` carries `banner` (STUCK, or COMPLETE when all done), `bannerBody`, `notify: true` and `notifyStatus`. Mirror byte-identical |
| FIX-002 | `functional-verification.js` (core and mirror): `check-never-unattended --files <comma-separated> <verificationPath>` matches the given files instead of a TRD's grounding, same output; an empty list returns `hits: []` with the list's status | O5 | None | Jest: a file containing a listed fragment is in `hits`; none → `hits: []`; empty list → `hits: []`; missing `verification.md` → `status: 'absent'`; an unreadable §5b → `status: 'invalid'`; the TRD form's existing tests pass; usage text names the new form. Mirror byte-identical |
| FIX-003 | `sweep.md` and `sweep.js` (core and mirrors): Step 1 strips `--chained` and `--project` before reading the list, and `argument-hint` lists `--chained`. Under `--chained`: triage and fixers receive the §5b fragments and defer any item whose fix would touch one; Step 3a writes `notSweepItems: [ids]` and `overlap: { id: [files] }` to `sweep-result.json` instead of ending STUCK; Step 4 records no discovery for those ids; the run ends `[STATUS: /sweep] RETURN → <n> fixed, <n> already fine, <n> not sweep items, <n> overlapping, <n> failed`, with no banner and no `notify-complete.sh`. Without `--chained`: unchanged except flag-stripping and the two fields always written | O3, O4, O5 | None | `sweep.test.js`: with fragments, the triage prompt names them and requires an item touching one to be deferred; without, the prompt is unchanged. Command-surface tests: flag-stripping, the hint, both fields, the RETURN line, no discovery for folded ids, and the STUCK wording still applying without `--chained`. Mirrors byte-identical |
| FIX-004 | `verify-build.md` (core and mirror): a `--chained` flag, honoured for a sweep file. Under it Step 2 asks nothing (an environment needing the owner takes the stated default and is recorded, as the fix loop does), and the run ends `[STATUS: /verify-build] RETURN → <outcome>, <met> of <total> met`, with no banner, `notify-complete.sh` or `PushNotification`; the report is still written and the evidence still carried to the core | O2, O4 | FIX-003 | Command-surface tests: the flag, the RETURN line, no question under it, the evidence step still running, a non-sweep run ignoring the flag. Mirror byte-identical |
| FIX-005 | `plan.md` (core and mirror) Step 7, spec path: with no core TRD, read §5b with `read-never-unattended` and pass its status. When `plan()` chains: switch to `feature/<slug>/impl`, print the handoff line, then loop — call `sweepChainNext` with the `SWEEP_CHAIN_INPUTS` it needs, run the action, repeat. `plan.md` checks whether `docs/TRD/<slug>.md` exists before each call and passes it as `coreTrdExists`. `sweep`/`verify`: `Skill()` with the lookup's args, recording `git status --porcelain --untracked-files=all` and each listed path's `git hash-object` before `/sweep` and the time before `/verify-build`, and reading `sweep-result.json` and a `verification-state.json` newer than that time. `fold-back`: §Intended Change item 6's order (no `render-sweep` when no sweep id remains). `commit`: the brake over the changed paths (status line or hash differs), then `git add -- <list>` and `git commit -- <list>`, skipped when nothing is staged; a changed file that was dirty before the sweep is named in the readout. `stop`: print the readout and the returned banner, run notify. `implement`: hand off and emit nothing after. The "run is over" sentence applies to the `implement` step only, and the generic `chainSkill` row is guarded against `chainSkill: null` | O1, O2, O3, O4, O5 | FIX-001, FIX-002, FIX-003, FIX-004 | Command-surface tests: the branch step before `/sweep`; the loop; `--chained` on the sweep and verify calls only; the fold-back order (render-sweep with `--core-trd`, tasks, `audit-trd` at medium only, render-objectives, §5a.1, 6a check, core brake) and that `/sweep` is not re-run; the state-file freshness rule; the file list from status lines and content hashes with `--untracked-files=all`; the pathspec add and commit (no `git add -A`) and its skip when nothing is staged; `coreTrdExists` read by `plan.md`, not by `fix-plan.js`; the "run is over" sentence limited to `implement`; the call payload's keys equal `SWEEP_CHAIN_INPUTS`. The surface tests at `verify-command-surface.test.js:1047` and `:1050` are rewritten to the new rule. Mirror byte-identical |
| FIX-006 | `command-status.md` (`.claude/rules/` and the template `packages/core/templates/claude-directory/rules/command-status.md`): the chaining exception names `/plan --implement` on a sweep list, and `/sweep --chained` and `/verify-build --chained` as commands that emit no banner | O4 | None | Both copies byte-identical and name the three; the runtime-integrity byte-ceiling test passes (raise `command-status.md`'s ceiling with a stated reason if the addition needs it) |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/fix-plan.js`, `packages/core/lib/fix-plan.test.js`, `.claude/lib/fix-plan.js`
- **Reuse:** `finishSweep` (lines 206–239) for the no-chain output; `finish()` (lines 182–200) as the model for the stop banner fields [read]
- **Replaces:** the unconditional `chain: false` inside `finishSweep`, and the `coreTrd &&` guard on the `invalid` owner-policy sentence (line 220) [read]
- **Follow:** keep the sweep branch where it is (line 112, before the owner-policy checks at 120–139, which would otherwise route a sweep run to the generic ending); decide inside `finishSweep` [read]
- **Careful:** the test "with a sweep list there is no chain and no pointer, whatever implement says" must be rewritten to `implement: false`, not deleted; route `prd` still wins over a sweep list; `fix-plan.js` stays pure — no filesystem access [read]

### FIX-002
- **Touches:** `packages/core/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`, `.claude/lib/functional-verification.js`
- **Reuse:** `readNeverUnattended` and `matchNeverUnattended`, as the TRD form uses them (lines 1628–1677) [read]
- **Follow:** same JSON shape `{ hits, status, raw, touches }`, `touches` being the given files [read]
- **Careful:** the positional parsing at lines 1629–1631 must accept `--files` in the TRD path's place, including an empty value [read]

### FIX-003
- **Touches:** `packages/core/commands/sweep.md`, `.claude/commands/sweep.md`, `packages/core/workflows/sweep.js`, `.claude/workflows/sweep.js`, `packages/core/workflows/sweep.test.js`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** Step 3a's accounting and `sweep-result.json` (lines 74–100); the triage prompt's existing deferral rules in `sweep.js` (around lines 101–135) [read]
- **Follow:** `plan.md`'s flag-stripping (Step 1) and `/implement-trd` §3.7's RETURN shape [read]
- **Careful:** `sweep.md:41` reads any argument that is a readable path as the list, so without stripping, `<file> --chained` becomes an inline issue list; `/sweep` never commits, chained or not [read]

### FIX-004
- **Touches:** `packages/core/commands/verify-build.md`, `.claude/commands/verify-build.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** the sweep-file branch (lines 61–65, 125–160), the fix loop's no-question rule for Step 2 (lines 79–85), the sweep NEXT rule (lines 316–332) [read]
- **Follow:** `/implement-trd` §3.7's RETURN shape and its "no `AskUserQuestion` reaches the owner under `--chained`" [read]
- **Careful:** the evidence carry-over (lines 151–160) must still run under `--chained` [read]

### FIX-005
- **Touches:** `packages/core/commands/plan.md`, `.claude/commands/plan.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** §2g's `render-sweep`, Step 5a, §5a.1, Step 6a, the Step 7 brake call and field table [read]
- **Replaces:** the Step 7 spec-path paragraph saying `plan()` "never chains, even with `--implement`", and the "skip the check when there is no core TRD" sentence [read]
- **Follow:** `command-status.md`'s one-banner-per-run rule; `autonomy.md` — the chain runs because `--implement` asked for it; Step 6a's "after the last model writer" [read]
- **Careful:** `plan.md:1018-1019` ends the run after any `Skill()` returns; limit it to `implement`. Nothing in `plan.md` requires a clean tree before `/sweep`, so the changed-file list must compare content hashes, not status lines alone; `git commit -- <path>` fails on a path never added, so add first. Surface tests at `verify-command-surface.test.js:1047` and `:1050` pin the old rule and must be rewritten [read]

### FIX-006
- **Touches:** `.claude/rules/command-status.md`, `packages/core/templates/claude-directory/rules/command-status.md`, `test/integration/tests/runtime-integrity.test.sh`
- **Reuse:** the "One legitimate exception" paragraph (lines 231–239) [read]
- **Careful:** the file sits at 12,495 of its 12,500-byte ceiling; the ceiling is a guardrail, raised with a reason rather than looped on [read]

## Could Not Verify

The 2026-10-03 audit (all 5 verifiers reported, against `docs/plan/plan-sweep-chain.investigation.md`)
checked the design against the code and applied its findings (v1.2.0). None of the rows below was
in its reach: each needs a live `claude` run, which an audit of the document does not start.

| Claim | Why unchecked | How to check |
|-------|---------------|--------------|
| The chain behaves as written in a live run (sweep, verify, commit, implement in one session) | Needs a real spec with sweepable criteria and a `claude` session, which this project's tests never start | Run `/plan <spec item> --implement` on a lightning-lane roadmap item with independent criteria |
| A folded criterion's task, written by `/plan` mid-run, is grounded as well as one written at planning time | Depends on the model's investigation at fold-back time | Inspect the first live fold-back's task block |
| Triage and fixers keep every §5b path out of the sweep | Model judgement; the backstop before the commit (status lines plus content hashes) catches what they miss, but only after the edit | Inspect the first live chain on a repo with a non-empty §5b |
