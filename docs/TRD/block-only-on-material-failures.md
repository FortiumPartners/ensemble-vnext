# TRD: block-only-on-material-failures

**Source PRD**: None — small change decided by the PM's instruction of 2026-11-12 (workplan `verification-targeted-loop`, feature F-5; roadmap item 5, `docs/plans/verification-targeted-loop/roadmap.md`; GitHub issue FortiumPartners/ensemble-vnext#113). The instruction replaces the roadmap item's design: materiality is no longer judged by the Judge at run time; it is fixed by the must-pass marks set at plan time, and an owner-set policy in `verification.md` decides whether anything else blocks.

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | With `Blocking: must-pass only` in `verification.md` and at least one criterion marked must-pass, a verification run whose open failures, once the inner fix loop and the closing regression pass are done, are all on criteria not marked must-pass ends `satisfied`; the result, state file and report list those failures, and each is written to the follow-up ledger (`discovered.jsonl`) as one product follow-up row (`rankClass: "product"`, `blocksFeature: false`). | your instruction, 2026-11-12 | yes |
| O2 | With no blocking setting (section absent, line absent, or `verification.md` missing or unreadable), with `Blocking: all criteria`, or with no criterion marked must-pass (any TRD with none marked, and every sweep file), a failure on any criterion still prevents `satisfied`, exactly as today; and `/verify-build`'s fix rounds never build a failure the run listed as non-blocking. | your instruction, 2026-11-12 | yes |
| O3 | A failure on a must-pass criterion prevents `satisfied` under either setting, including when the Judge's own exit wrongly says `satisfied`; the must-pass recheck (`applyMustPassRecheck`) and custody behave as today for must-pass criteria. | your instruction, 2026-11-12 | yes |
| O4 | An invalid `Blocking:` value (anything but `all criteria` or `must-pass only`, or two `Blocking:` lines) is refused: verification is not run and the stop reason names the offending line. | your instruction, 2026-11-12 | |
| O5 | The Judge never judges materiality and never applies the blocking policy: the policy is applied only by the workflow script, from the must-pass marks and the owner's setting. | your instruction, 2026-11-12 (PM decision 2026-11-11) | |
| O6 | The four-part definition from issue #113 (a main user flow broken; data lost or corrupted; private data exposed; money or AI spend charged wrongly) is stated in the TRD and success-definition authoring guidance as the test for which objectives to mark must-pass, with the note that verification-check rows (design comparison, data fidelity…) never carry a must-pass mark and so never block under `must-pass only`. | your instruction, 2026-11-12 | |
| O7 | `/verification-setup` asks for the blocking policy, offering `all criteria` as the default, and writes it in a form the parser reads. | your instruction, 2026-11-12 | |
| O8 | The shipped `verification.md` template carries the new short section with `Blocking: all criteria`, and a project still holding the current unfilled template is still recognised as unfilled after the template changes. | your instruction, 2026-11-12; `KNOWN_UNFILLED_DIGESTS` convention | |
| O9 | A headless fixture run (the `fixtures` environment in `verification.md`) with the policy set to `must-pass only`, one must-pass and one non-must-pass seeded defect, shows the non-must-pass failure listed as non-blocking, filed as a follow-up row, and the outcome `satisfied` only once the must-pass defect is met. | your instruction, 2026-11-12 (acceptance) | |

**Must pass** marks the objectives without which the feature does not exist. Write `yes` in
that column for those and leave it blank for the rest. Mark sparingly: a plan that marks
everything marks nothing. A TRD with none marked is valid, and verification then behaves as it
does today.

## Intended Change

Today (`[read]`, `packages/core/lib/functional-verification.js` `decideNext` ~:331-523): any open
`not_met` criterion that is not a settled evidence gap keeps the run from `exit-satisfied`; at the
end of the loop it exits `stalled` (an iteration closed nothing) or `stuck` (the cap). The must-pass
marks (success-definition `Must pass` column, from the TRD's Objectives) only add a further block
(`exit-must-pass-unproven`). There is no owner setting that lets a non-must-pass failure through.

After this change:

1. `verification.md` gains a short owner-set section, `## 5c. Blocking policy`, holding one line:
   `Blocking: all criteria` (the default, today's behaviour) or `Blocking: must-pass only`. A
   parser beside `readCoverageFloor`, `readBlockingPolicy`, returns
   `{ policy: 'all'|'must-pass'|null, status: 'declared'|'absent'|'invalid', raw }`; absent heading,
   absent line or a missing file mean `policy: 'all'`; any other value, or two `Blocking:` lines,
   is `invalid`.
2. Under `must-pass`, when at least one criterion is marked must-pass, once the loop would exit
   `stalled` or `stuck` (the inner loop is done) and the closing regression pass has run, a run
   whose open failures are all on criteria not marked must-pass and that has no `unbuilt`
   criterion ends `satisfied`. With no must-pass criterion the policy changes nothing (a sweep
   file, or a TRD with none marked, behaves as today). The coverage floor and the
   must-pass recheck then apply exactly as they do to any `satisfied`. The run's result, state file
   and report carry `nonBlocking: [{ id, reason }]`; each entry is written to `discovered.jsonl` as a
   product follow-up. A must-pass failure is never converted, under either setting.
3. Under `all` (or no setting) nothing changes: no new key is written to the state file, the
   report, or `decideNext`'s return.
   `/verify-build`'s fix rounds treat a non-blocking failure as not buildable: no failing
   discovery row and no count toward `buildableOpen`.
4. An invalid value stops verification before the workflow is dispatched, naming the line.
5. The four-part definition goes into authoring guidance only. No prompt asks the Judge to rate a
   failure.

Checkable: `npx jest packages/core/workflows/verify-functional.test.js packages/core/lib/functional-verification.test.js packages/core/lib/custody.test.js` with the new cases listed per task, plus the fixture scenario (FIX-010).

## Decision

**The policy is applied once, by the workflow script, never by the Judge.** `decideNext` (the
pure library function) gains an optional `blocking` input (`'all'` default, `'must-pass'`; any
other value throws) as the specification of the rule, tested in the library: under `'must-pass'`
with a non-empty `mustPass`, a base `exit-stalled` or `exit-stuck` whose open gaps are all outside
`mustPass` becomes `exit-satisfied`, adding `nonBlocking: <ids>` to its return only when the
conversion fires, before the coverage re-label and the must-pass step. **The Judge's decide-next
payload does not carry `blocking`**, so the Judge's exit is today's exit and a model can never
reach `satisfied` with gaps open by misapplying a lenient policy. The workflow applies the same
rule deterministically in `applyBlockingPolicy`, called inside `runRegressionPass` after the
regression rounds and before its single `syncState` (and on the exit path where no regression pass
syncs), so "once the inner loop and regression pass are done" is literal and the state file is
written once with the final action. `remediate` is never converted, and the stall-replacement
(`replaceStalledExit`) still sees the Judge's real stall.

**A must-pass failure behind a `satisfied` exit is demoted, under either setting.** Today
`applyMustPassRecheck` leaves an exit untouched when an open failure exists (`blocked`), trusting
that decide-next could not have said `satisfied`. `applyBlockingPolicy` adds the backstop: an
`exit-satisfied` over an open, unsettled `not_met` on a must-pass criterion, or any `unbuilt`,
becomes `exit-stuck` with a reason naming the criteria. This only ever blocks. An
`exit-insufficient-coverage` is left alone: `decideNext` legitimately re-labels a stalled or stuck
base with open gaps (must-pass ones included) to it when the floor is missed, and it already
blocks (code review: demoting it would change today's outcome under `all`, against O2).

**With no must-pass criterion the policy is inert.** Converting would let every failure through on
a sweep file (always `mustPassIds: []`) or any TRD with none marked, contradicting "a TRD with none
marked is valid, and verification then behaves as it does today."

**Only `not_met` converts; `unbuilt` still blocks.** `decideNext` evaluates `unbuilt` first on
purpose (D14 of functional-verification: "never built" is the truer statement and must win), and an
unbuilt criterion is missing work, whose route is `/implement-trd --reconcile`, not a follow-up.
OWNER-CALL, recorded here.

**`mustPassCheckState` reads the policy.** Under `must-pass` (with must-pass criteria), its
`blocked` flag ignores an open `not_met` on a criterion not in `MUST_PASS_IDS`, so `applyMustPassRecheck` and
`upgradeOffHostExit` still act on a `satisfied` that carries non-blocking failures. Under `all` it
is byte-for-byte today's expression.

**Follow-up rows are written by the commands, through one library call, after the workflow
returns.** `recordNonBlockingFollowups(stateDir, nonBlocking, nowIso)` in
`functional-verification.js` (CLI `record-nonblocking --state-dir <dir> --payload <json>`, the
payload being the result's `nonBlocking`) records one `discovered.record` row per entry:
`kind: 'gap'`, `foundBy: 'verify-functional'`, `status: 'not_met'`, `ref: <id>`,
`rankClass: 'product'`, `blocksFeature: false`, `summary: "[non-blocking] <id>: <reason>"`. It
skips an id that already has an open row with that `ref` and that summary prefix, so a resumed run
or a fix round writes no duplicate. `blocksFeature: false` keeps `promotable()` from turning the
row into a TRD task. It runs beside the existing `record-criteria` call in `/implement-trd` §8.4
and in `/verify-build`, so a dead agent cannot lose the rows. `/verify-build`'s fix-round step 2
skips every id in the latest state's `nonBlocking` when it records failing rows and counts
`buildableOpen`; otherwise a later round's `blocksFeature: true` row would supersede the
follow-up (`latestPerRef`) and get the failure built anyway.

**Follow-ups are written only on a `satisfied` exit.** A converted exit that the floor re-labels
`insufficient-coverage`, or the recheck turns `must-pass-unproven`, keeps its failures open for
`/refine-verification`, as today.

**An invalid value stops; it is not defaulted.** Unlike the coverage floor (an `invalid` floor is
reported and ignored, D9 of verification-md-setup), an invalid blocking line is refused: defaulting
to `all` would silently ignore a policy the owner meant to set, and defaulting to `must-pass` would
let failures through on a typo. The workflow throws on any `args.blocking` other than `'all'`,
`'must-pass'` or absent; the commands stop before dispatch.

**The new section is not added to `missingVerificationSections`.** Absence is a valid answer
(`all criteria`), so an older `verification.md` without it must not be flagged as incomplete.

**Rejected:** a Judge-assigned materiality verdict per failure (the roadmap item's original design)
— replaced by the PM decision of 2026-11-11: materiality is fixed by plan-time must-pass marks, never
judged at run time. A per-criterion `blocking` column in the success definition — duplicates the
must-pass mark the instruction names as the marker.

Absorbed-scope check (Step 2f): none absorbed. Freezing the current template's digest before
changing it (FIX-001) is the routine step every template change takes, not absorbed scope.

Weight: `small`, kept after the adversarial pass. Its three blocking findings (the fix loop building
non-blocking failures, an inert-less policy on unmarked work, a Judge path to a lenient exit) changed
how the tasks are written, not how many there are; they are applied above.

## Non-Goals

- No runtime materiality judgement anywhere; the Judge's schema and prompt gain no materiality field.
- No change to custody (`packages/core/lib/custody.js`), the re-proof retry, or what 4.17.5 shipped.
- No edit to this repository's own `.claude/rules/verification.md` (owner-governed; only the shipped template changes).
- No follow-up ranking work (roadmap item 6, "Rank follow-ups, product items first") beyond setting `rankClass: 'product'` on the new rows.
- No new verification outcome; `satisfied` keeps its name.
- `unbuilt` criteria are not converted under either policy.

## Verification Artifacts

None apply — the change is library, workflow and prompt text with no UI, no rendered data screen, no
design handoff and no designed screen-to-screen journey.

## Verification Environment
**Environment**: local (jest, bats) for FIX-001 to FIX-009; fixtures (headless `claude --print` session in a scaffolded slot) for FIX-010
**Refresh**: fixtures: `packages/core/scripts/scaffold-project.sh --refresh --plugin-dir packages/full <slot folder>`; local: none needed
**Cannot be checked there**: `claude --remote` sessions and failures that occur only on the GitHub Actions runner (`verification.md` §5)

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should a non-must-pass `unbuilt` criterion also stop blocking under `must-pass only`? | No: `unbuilt` still blocks (see Decision); recorded as an OWNER-CALL | |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `## 5c. Blocking policy` to the shipped `verification.md` template (one-paragraph explanation, then `Blocking: all criteria`); add `readBlockingPolicy(content)` beside `readCoverageFloor` and the CLI subcommand `read-blocking-policy <path>` (missing file → `{policy:'all', status:'absent', raw:null, reason:'missing'}`); freeze the current template as `packages/core/lib/__fixtures__/verification.artifact-service-v1.md` and add its digest to `KNOWN_UNFILLED_DIGESTS` | O2, O4, O8 | None | New `functional-verification.test.js` cases: `Blocking: all criteria` → `{policy:'all', status:'declared'}`; `Blocking: must-pass only` (also bold key, code-wrapped value, list marker, any case, `must pass only`) → `'must-pass'`; no heading, or heading with no line → `{policy:'all', status:'absent'}`; `Blocking: some` and two `Blocking:` lines → `{policy:null, status:'invalid', raw}` naming the line; a `Blocking:` line quoted inside a fenced block elsewhere is ignored; the CLI on a missing path prints `status:'absent'`; the frozen fixture is reported unfilled with `matchedTemplate: 'artifact-service-v1'`; `missingVerificationSections` on a file without §5c does not name it |
| FIX-002 | `decideNext` gains optional `blocking` (`'all'` default; `'must-pass'`; anything else throws a TypeError naming the value). Under `'must-pass'` with a non-empty `mustPass`, a base `exit-stalled` or `exit-stuck` with no `unbuilt` and every open gap outside `mustPass` becomes `exit-satisfied` with reason naming the non-blocking ids and the policy, and the return gains `nonBlocking: [ids]`; the coverage re-label and the must-pass step then run unchanged | O1, O2, O3 | None | New `functional-verification.test.js` cases: no `blocking` key, and `blocking:'all'`, with one non-must-pass open gap at the cap → `exit-stuck` and no `nonBlocking` key (unchanged); `'must-pass'` with only non-must-pass gaps at the cap → `exit-satisfied`, `nonBlocking` lists them; same at a stall → `exit-satisfied`; `'must-pass'` with a must-pass id among the gaps → `exit-stuck`/`exit-stalled` unchanged; `'must-pass'` before the cap with gaps open → `remediate` (never converted mid-loop); `'must-pass'` with an `unbuilt` → `exit-unbuilt`; `'must-pass'` with `mustPass: []` and open gaps at the cap → `exit-stuck` (inert); converted exit below the coverage floor → `exit-insufficient-coverage`; converted exit with a must-pass criterion `not_verifiable` → `exit-must-pass-unproven`; `blocking:'some'` throws naming it. Every pre-existing `decideNext` test passes unmodified |
| FIX-003 | Add `recordNonBlockingFollowups(stateDir, nonBlocking, nowIso)` and CLI `record-nonblocking --state-dir <dir> --payload <json>` per the Decision; `renderReport` prints `**Not blocking**: <n> failure(s) on criteria not marked must-pass, filed as product follow-ups: <ids> (verification.md: Blocking: must-pass only)` directly after the `**Reason**` line when the report input carries a non-empty `nonBlocking`, and nothing when it does not | O1 | None | New `functional-verification.test.js` cases (temp dir): two `nonBlocking` entries write two rows to `discovered.jsonl`, each with `ref`, `status:'not_met'`, `rankClass:'product'`, `blocksFeature:false`, summary starting `[non-blocking] <id>:`; a second call writes none (dedupe); an empty list writes nothing and creates no file; `discovered.promotable(readAll(dir))` returns none of the rows; `renderReport` with `nonBlocking` shows the line, and without it the output is byte-identical to today's for the same input |
| FIX-004 | Workflow `verify-functional.js`: read and validate `args.blocking` (absent → `'all'`; not `'all'`/`'must-pass'` → throw naming the value). Do NOT put it in the Judge's decide-next payload. Add `applyBlockingPolicy(judgeResult, settled)`: (a) under either policy, demote an `exit-satisfied`/`exit-insufficient-coverage` carrying an open unsettled must-pass `not_met` or any `unbuilt` to `exit-stuck`, naming them; (b) under `'must-pass'` with `MUST_PASS_IDS` non-empty, convert `exit-stalled`/`exit-stuck` whose open failures are all non-must-pass (and no `unbuilt`) to `exit-satisfied`, or `exit-insufficient-coverage` when the floor is missed. Call it inside `runRegressionPass` after the regression rounds and before its `syncState`, passing the corrected outcome through `reportFixOf`, and sync whenever the action changed (on every path, keeping the regression record). Make `mustPassCheckState`'s `blocked` ignore non-must-pass `not_met` under an active `'must-pass'` policy. Compute `nonBlocking` (`[{id, reason}]`) when the final action is `exit-satisfied` under an active policy, `[]` otherwise; add it to `buildFinalResult` and every other return path; write top-level `blocking`/`nonBlocking` into the state file and report input only when non-empty. Update `docs/TRD/functional-verification.md` §3.3 (`VerifyFunctionalArgs.blocking`, `VerifyFunctionalResult.nonBlocking`) | O1, O2, O3, O5 | FIX-002, FIX-003 | New `verify-functional.test.js` cases: no `blocking` arg + Judge `exit-stuck` over a non-must-pass `not_met` (with a must-pass FS-2 met) → `stuck`, `nonBlocking: []`, no sync prompt containing `nonBlocking`; `blocking:'must-pass'`, same Judge → `satisfied`, `nonBlocking:[{id:'FS-1',…}]`, and the state-sync prompt writes `"outcome":"satisfied"` and `"nonBlocking"`; same with no must-pass criterion declared → `stuck` (inert); Judge stub returning `exit-satisfied` over an open must-pass `not_met` → `stuck` under both settings (this case fails on today's code); `'must-pass'` with a must-pass `not_verifiable` beside a non-blocking failure → `must-pass-unproven`; `'must-pass'` with the floor missed after conversion → `insufficient-coverage`, state synced; a Judge `exit-stalled` that the script's stall replacement turns into `remediate` is not converted; `blocking:'some'` throws before any agent runs; the Judge prompt's decide-next payload contains no `"blocking"` key under either setting. `npx jest packages/core/workflows/verify-functional-trd-sync.test.js` passes with the read-field count updated to 31 |
| FIX-005 | Commands: `implement-trd.md` §8.1a gains a step running `node .claude/lib/functional-verification.js read-blocking-policy "$(node .claude/lib/owner-rules.js path verification.md)"` and setting `blocking` from `policy`; on `status:'invalid'` the workflow is not dispatched and verification reports `not run: verification.md's blocking policy does not parse ("<raw>") — fix it with /verification-setup` in Step 9; §8.3's args block gains `blocking` as the last field (31 fields); §8.4 carries `nonBlocking`, runs `record-nonblocking` beside `record-criteria` when it is non-empty, and Step 9's STATE names it. `verify-build.md` step 3c reads the same policy (invalid → `COMMAND STUCK: /verify-build`, Reason naming the raw line, Next `/verification-setup`), §4 lists the identical 31 fields, its readout names `nonBlocking`, it runs `record-nonblocking` after each workflow return, and fix-round step 2 skips every id in the latest state's `nonBlocking` when recording failing rows and counting `buildableOpen`. Update the field-count and order assertions in `verify-command-surface.test.js` and `verify-build-criteria.test.js` | O1, O4 | FIX-001, FIX-004 | `npx jest packages/core/commands/verify-command-surface.test.js packages/core/commands/verify-build-criteria.test.js packages/core/commands/owner-rules-wiring.test.js packages/core/lib/owner-rules.wiring.test.js` pass, with new assertions: both commands run `read-blocking-policy` through `owner-rules.js path verification.md`; both args blocks end `offHostProofs, blocking`; `verify-build.md` says `All 31 fields`; both name the invalid-policy stop with the raw line; both readouts name `nonBlocking`; both run `record-nonblocking`; `verify-build.md` step 2 names `nonBlocking` as never recorded as a failing row nor counted buildable |
| FIX-006 | Custody regression guard only (no change to `custody.js`; it already reads must-pass ids only, so this guards O3 rather than proving new behaviour): a feature whose state records a non-must-pass criterion `not_met` (a non-blocking follow-up) and outcome `satisfied` does not put that id in `reconcile`'s `reverify` ids or `affectedIds` | O3 | None | New `custody.test.js` case: with must-pass `FS-1` met and non-must-pass `FS-2` not_met, a shipped change to `FS-2`'s covered file yields ids containing only must-pass ids (never `FS-2`); existing custody tests unchanged |
| FIX-007 | Authoring guidance: after the "Mark sparingly" paragraph in `trd-authoring.md` §1a, all three `plan.md` Objectives templates and `create-trd.md`, add the test for marking must-pass: mark an objective must-pass when its failure would break a main user flow, lose or corrupt data, expose private data, or charge money or AI spend wrongly; and that the mark is what decides blocking when the owner sets `Blocking: must-pass only`. In `functional-verification.md`'s "Must pass" section add the same test, and that neither the Judge nor the exerciser applies it to a failure; in its outcomes section add one paragraph: under `Blocking: must-pass only` (with at least one must-pass criterion) a `satisfied` run may carry non-blocking failures, listed and filed as follow-ups, and check rows, which never carry a mark, never block under it | O5, O6 | None | `verify-command-surface.test.js` gains: `trd-authoring.md` §1a, `create-trd.md` and each of `plan.md`'s three templates contain "main user flow", "lost or corrupted", "private data" and "AI spend"; the contract's "Must pass" section contains the four parts and states the Judge never applies them; existing assertions (three Objectives templates, "without which the feature does not exist" three times) still pass |
| FIX-008 | `/verification-setup` (`packages/skills/verification-setup/SKILL.md`): new topic `§5c Blocking policy` after §5b in the Topics list, a `## Blocking policy` section with the question (one sentence stating what each value means, that it has no effect on work with no must-pass criterion, and that verification-check rows never carry a must-pass mark so they never block under `must-pass only`; `all criteria` offered first as the default), the two written forms, and `read-blocking-policy` added to the post-write re-check (an `invalid` result is the skill's own defect, reported in ISSUES) | O7 | FIX-001 | `npx jest packages/skills/verification-setup/__tests__/skill-md.test.js` passes with new assertions: the topic list names §5c; the section offers `all criteria` first as the default; it names both forms `Blocking: all criteria` and `Blocking: must-pass only`; the Writing section re-runs `read-blocking-policy` |
| FIX-009 | Mirror every changed file under `packages/core/{lib,workflows,commands,contracts}/` and `packages/skills/verification-setup/SKILL.md` into its vendored `.claude/` copy (they are byte-identical today) | O1, O2, O3 | FIX-001, FIX-002, FIX-003, FIX-004, FIX-005, FIX-007, FIX-008 | `cmp` of each changed `packages/core/<dir>/<file>` against `.claude/<dir>/<file>` (and the skill) reports no difference; the full Jest battery (`npx jest`) passes |
| FIX-010 | [LIVE] Headless fixture scenario `test/smoke/scenarios/verify-blocking-policy.sh` in the `fixtures` environment: a scaffolded fixture whose `verification.md` sets `Blocking: must-pass only`, whose TRD marks O1 must-pass, and whose pre-seeded success definition has one must-pass criterion with a seeded fixable defect and one non-must-pass criterion with a seeded defect; one live `/verify-build`. Register it in `test/smoke/run-smoke.sh` (`LLM_OPT_IN_SCENARIOS`, `SCENARIO_TIMEOUT`) and `test/smoke/README.md` | O9 | FIX-009 | Asserted from the fixture's `verification-state.json`, report and `discovered.jsonl`: the must-pass criterion is `met`; if the non-must-pass criterion is still `not_met`, the outcome is `satisfied`, `nonBlocking` names it, the report has the `**Not blocking**` line, and `discovered.jsonl` has one `[non-blocking]` row for it with `rankClass:"product"`. A Debug that also fixes the non-must-pass defect, or leaves the must-pass defect open, is a named INCONCLUSIVE, never a pass. `bats test/integration/tests/smoke-registration.test.sh` passes |
| AMEND-001 | [defect] O2 (FIX-001): read-blocking-policy crashes (EISDIR / permission error) on a verification.md path that exists but cannot be read, instead of returning the all-criteria default O2 requires; no test covers an unreadable path — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: packages/core/lib/functional-verification.js:3177-3185 (existsSync guard then unguarded readFileSync); `node packages/core/lib/functional-verification.js read-blocking-policy packages` throws EISDIR; functional-verification.test.js:2535 tests only a nonexistent path) | amendment — no objective recorded | None | [defect] O2 (FIX-001): read-blocking-policy crashes (EISDIR / permission error) on a verification.md path that exists but cannot be read, instead of returning the all-criteria default O2 requires; no test covers an unreadable path no longer holds |
| AMEND-002 | [test-gap] O9 (FIX-010): headless fixture scenario verify-blocking-policy.sh is written and registered but has never been run; no live evidence that the non-must-pass failure is listed non-blocking, filed as a follow-up, and the outcome satisfied once the must-pass defect is met — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: test/smoke/scenarios/verify-blocking-policy.sh; test/smoke/run-smoke.sh:148,202; evidence/ holds only jest/grep text; implement.json FIX-010 commit: null) | amendment — no objective recorded | None | [test-gap] O9 (FIX-010): headless fixture scenario verify-blocking-policy.sh is written and registered but has never been run; no live evidence that the non-must-pass failure is listed non-blocking, filed as a follow-up, and the outcome satisfied once the must-pass defect is met no longer holds |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/templates/claude-directory/rules/verification.md`, `packages/core/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`, `packages/core/lib/__fixtures__/verification.artifact-service-v1.md`
- **Reuse:** `readCoverageFloor` (~:1050) is the exact shape to copy: `maskFencedLines`, `findSection(lines, 'blocking policy')`, the same per-line trim that tolerates a list marker, `*` and backticks, a case-insensitive `/blocking\s*:/i` key. `read-coverage-floor` CLI branch (~:2989) is the shape for `read-blocking-policy`; add both to `module.exports` and to `usage()` [read]. `matchKnownUnfilledDigest`/`normalizeVerificationContent` (~:2318) for the digest [read]
- **Replaces:** nothing [read]
- **Follow:** the template's existing §5a/§5b wording style: a heading, two or three plain sentences saying what the line means and that a missing line means the default, then the line itself (`Blocking: all criteria`). Place it after §5b and before `## 6. Multi-repo`. The fixture is a byte-for-byte copy of the template as it stands before this change; compute the digest over `normalizeVerificationContent(<fixture>)` and add it with a comment in the style of the four existing entries (~:2271-2291)
- **Careful:** the template is symlinked as `packages/skills/verification-setup/template.md` [ran `ls -la`], so it changes the skill's template too. Two `Blocking:` lines (an owner leaving `all criteria` above an added `must-pass only`) is `invalid`, as `readNeverUnattended` does for two `Paths:` lines. Accept `must-pass only` and `must pass only`, `all criteria` and `all`; nothing else. Do NOT add the section to `missingVerificationSections` (~:2371): absence is the default

### FIX-002
- **Touches:** `packages/core/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`
- **Reuse:** `decideNext` (~:331); its `openGaps` (gaps minus settled evidence gaps and members awaiting regression), `mustPass`, the base `result` chain, step 4 (coverage re-label) and step 5 (must-pass) [read]
- **Replaces:** nothing; the new step is inserted between the base chain and step 4 [read]
- **Follow:** the function's "validate rather than default" comments, but here the default (`'all'`) is the strict direction, so an absent key defaults and only a present-but-wrong value throws. Add the field to the JSDoc input block in the same `// NEW (...)` style. Add the `nonBlocking` key only when the conversion fires
- **Careful:** do not convert `exit-unbuilt`, `exit-setup-failure` or `remediate`. A converted exit must still pass through step 4 (`COVERAGE_RELABELABLE_ACTIONS` includes `exit-satisfied`) and step 5. Many existing tests `toEqual` the whole return object: an unconditional new key would break them [inferred from the return shape]

### FIX-003
- **Touches:** `packages/core/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`
- **Reuse:** `discovered.record(stateDir, entry, nowIso)` and `discovered.readAll(stateDir, { open: true })` (`packages/core/lib/discovered.js` ~:484, ~:609); `RANK_CLASSES` includes `'product'`, `VERIFICATION_STATUSES` includes `'not_met'` [read]. `renderReport` (~:1509), its `**Reason**` line (~:1627) and `escapeCell` [read]. The `readJsonOrNull` helper in the CLI block (~:2718) for reading the state [read]
- **Replaces:** nothing [read]
- **Follow:** the CLI's `--flag value` parsing as `merge-reproof-retry` does it (~:3010); print one JSON line `{ recorded: [ids], skipped: [ids] }`
- **Careful:** `require('./discovered')` inside `functional-verification.js` must not create a cycle (check `discovered.js` requires nothing from it [read: it requires only fs and path]). The report section order is load-bearing (`## Evidence` must stay last; `/verify-build` appends after it), so the new content is a header line, not a section [read ~:1895-1977]

### FIX-004
- **Touches:** `packages/core/workflows/verify-functional.js`, `packages/core/workflows/verify-functional.test.js`, `docs/TRD/functional-verification.md`, `packages/core/workflows/verify-functional-trd-sync.test.js`
- **Reuse:** the `FLOOR` arg validation (~:82) for `BLOCKING`; `mustPassCheckState` (~:1742), `applyMustPassRecheck` (~:1765), `upgradeOffHostExit` (~:1815); the exit sequence `runRegressionPass` → `recheckAndReconcile` → renders → `buildFinalResult` (~:3590-3606); `syncState` (~:2163), `buildStateSyncPrompt` (~:2107) and `reportFixOf` for the outcome correction; `coverageOf` for the floor check [read]
- **Replaces:** nothing [read]
- **Follow:** "Only when set, so a run without one writes the bytes it always did" (the `regression` key in `syncState`, ~:2184): `blocking`/`nonBlocking` appear in the state JSON and the report input only when `nonBlocking` is non-empty. The test harness's `baseArgs()`/`satisfiedJudge()`/`remediateJudge()` (`verify-functional.test.js` ~:30-90) for the new cases
- **Careful:** `applyBlockingPolicy` runs inside `runRegressionPass` after the rounds (they can change the exit) and before its single `syncState` at ~:3462, so the state is written once with the final action; `syncState` rewrites the whole state file, so any extra sync must pass `regressionRecord` again or `regression` vanishes from the state. When the sync agent dies, append a reason suffix as `reconcileOutcome` does (~:2250-2262). It must also reach the exit path that never enters a regression round (no Debug ran). It runs BEFORE `recheckAndReconcile`. The zero-criteria branch (~:2514), `endOnSetupFailure` (~:2280) and the no-Judge exits also return results: give each `nonBlocking: []` so the shape is the same on every path. `verify-functional-trd-sync.test.js` counts `a.*` reads (30 → 31) and compares `buildFinalResult`'s keys with `VerifyFunctionalResult` in `docs/TRD/functional-verification.md` §3.3: update both interfaces there, not the test's logic [read]. The Judge's decide-next payload (~:893) is left without `blocking` (O5)

### FIX-005
- **Touches:** `packages/core/commands/implement-trd.md`, `packages/core/commands/verify-build.md`, `packages/core/commands/verify-command-surface.test.js`, `packages/core/commands/verify-build-criteria.test.js`
- **Reuse:** §8.1a step 6 (`read-coverage-floor` through `owner-rules.js path verification.md`, `implement-trd.md` ~:1850) as the template for the new step; the §8.3 args block (~:2000-2030) and `verify-build.md` §4 args block (~:306-370); `verify-build.md` 3c (~:278-300) [read]. The field-count assertions at `verify-command-surface.test.js` ~:263-310 and `verify-build-criteria.test.js` ~:79 [read]
- **Replaces:** the "30 fields" counts in both commands and their tests (→ 31) [read]. In `verify-build.md` fix-round step 2 (~:633-650), the buildable rule gains an exclusion for ids in the state's `nonBlocking`, beside the existing `awaiting` exclusion [read]
- **Follow:** the dispatch-line comment style `name, // §ref -- meaning; default when none`. `setupTargets` must stay right after `coverageFloor` (asserted at ~:269 and ~:2147), so `blocking` goes last, after `offHostProofs`
- **Careful:** under `--criteria` (re-proof) the policy is passed as read; it changes nothing there because the subset is must-pass criteria. `verify-build.md` line ~540 ("the same 30 fields except") and ~368 also carry the count

### FIX-006
- **Touches:** `packages/core/lib/custody.test.js`
- **Reuse:** the existing `affectedIds`/`reconcile` fixtures around "a base-only change to a file in FS-1 covers but not FS-2 covers re-verifies only FS-1" (~:1277) [read]; `affectedIds` reads must-pass ids from `must-pass-coverage` only (`custody.js` ~:465-516) [read]
- **Replaces:** nothing
- **Follow:** the surrounding test's repo-building helpers
- **Careful:** no change to `custody.js`; if the test fails, that is a finding to report, not a reason to edit custody (Non-Goals)

### FIX-007
- **Touches:** `packages/core/contracts/trd-authoring.md`, `packages/core/commands/plan.md`, `packages/core/commands/create-trd.md`, `packages/core/contracts/functional-verification.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** the existing "Must pass marks the objectives…Mark sparingly" paragraph (`trd-authoring.md` ~:144, three copies in `plan.md`, one in `create-trd.md`) and the contract's "## Must pass" section (~:259) and outcomes paragraph (~:666-690) [read]
- **Replaces:** nothing
- **Follow:** additive sentences only; keep "without which the feature does not exist" and "none marked is valid" intact (asserted at `verify-command-surface.test.js` ~:1072-1095) [read]
- **Careful:** the contract text reaches the Exercise and Debug prompts (`CONTRACT`, `verify-functional.js` ~:640, ~:1204) but not the Judge's [read]; state the four parts as authoring guidance and say plainly that no stage applies them to a failure

### FIX-008
- **Touches:** `packages/skills/verification-setup/SKILL.md`, `packages/skills/verification-setup/__tests__/skill-md.test.js`
- **Reuse:** the "## Coverage floor" and "## Never unattended" sections (~:84-120) and the Topics list (~:48-66) [read]
- **Replaces:** the Topics numbering after §5b (§6 Multi-repo becomes item 10)
- **Follow:** the never-unattended section's shape: the question's one-sentence explanation, the default offered first, the exact forms the parser reads
- **Careful:** the skill is owner-invoked and interactive by purpose (`autonomy.md`); add no autonomous default-writing path

### FIX-009
- **Touches:** `.claude/lib/functional-verification.js`, `.claude/workflows/verify-functional.js`, `.claude/commands/implement-trd.md`, `.claude/commands/verify-build.md`, `.claude/commands/plan.md`, `.claude/commands/create-trd.md`, `.claude/contracts/functional-verification.md`, `.claude/contracts/trd-authoring.md`, `.claude/skills/verification-setup/SKILL.md`
- **Reuse:** plain copies; each pair is byte-identical today [ran `cmp`]
- **Replaces:** nothing
- **Follow:** the previous feature's practice (commit f02453d9 changed `packages/core/lib/functional-verification.js` and `.claude/lib/functional-verification.js` together) [ran `git log`]
- **Careful:** `.claude/rules/verification.md` is owner-governed and is NOT copied from the template; `packages/full/` is symlinks into `packages/core/` and needs nothing [ran `ls -la`]

### FIX-010
- **Touches:** `test/smoke/scenarios/verify-blocking-policy.sh`, `test/smoke/run-smoke.sh`, `test/smoke/README.md`
- **Reuse:** `test/smoke/scenarios/verify-regression-pass.sh` and `verify-triage-kinds.sh` (pre-seeded success definition, fixture TRD, one live `/verify-build`, state-file assertions, named INCONCLUSIVE), `test/smoke/lib/project.sh` (`smoke_scaffold_project`, `smoke_claude`) [read]
- **Replaces:** nothing
- **Follow:** registration in `LLM_OPT_IN_SCENARIOS` and `SCENARIO_TIMEOUT` (`run-smoke.sh` ~:138-148 and :202) and the README table row and tree line, as `verify-regression-pass` is registered [read]
- **Careful:** to keep the non-must-pass defect open past Debug, make its fix out of the debugger's reach in a way the fixture states plainly (for example a vendored file the fixture's `verification-notes.md` marks read-only); a Debug that fixes it anyway is INCONCLUSIVE, not a failure. Write the policy into the fixture's own `verification.md`, never this repository's

### AMEND-001

- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is written here — the file-conflict guard in `task-graph.js` cannot protect this task from a concurrent one until an owner fills in `Touches` by hand. Until then this task has no inferred conflict edges and may be scheduled alongside anything.

### AMEND-002

- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is written here — the file-conflict guard in `task-graph.js` cannot protect this task from a concurrent one until an owner fills in `Touches` by hand. Until then this task has no inferred conflict edges and may be scheduled alongside anything.

## Could Not Verify

State after the `/audit-build` re-audit (2026-11-12). Five of five verifiers reported. The re-audit was limited to the previous round's two gaps and to files changed since commit 46d03934; it took no fresh sample, so it re-checked nothing else. Both previous gaps are closed: the live fixture scenario for O9 ran once and passed 15 of 15 assertions (`.trd-state/block-only-on-material-failures/evidence/live/AMEND-002/run.log`, AMEND-002), and an unreadable `verification.md` now reads as `all` (AMEND-001, commit 59319671).

- **Validation against product requirements was not checked.** This TRD has no PRD; its source is the PM's instruction of 2026-11-12 (issue #113), which was not supplied to either audit. Only traceability between this TRD and the delivered code was checked, so whether the TRD itself omits or distorts something the instruction asked for is unchecked.
- **Requirements outside the re-audit's scope rest on the first audit only.** Objectives O1 to O8 and tasks FIX-001 to FIX-009 were not re-checked by this round, except where their files changed after commit 46d03934; their standing is whatever the first `/audit-build` round found.
- **Promises stated only in prose were not traced.** Neither round traced a checkable promise stated only in Intended Change, Decision or Non-Goals to code or tests.
- **The O9 live scenario has one recorded run.** It depends on the live Debug leaving the non-must-pass defect open; it did on that run (FS-2 stayed `not_met`), but a later run whose Debug fixes it reports INCONCLUSIVE, not a pass.
- **The coverage-floor recommendation may drift lower under `must-pass only`.** `recommendCoverageFloor` (`packages/core/lib/functional-verification.js:1198`) learns from runs that ended `satisfied`; a converted run that still carries `not_met` criteria lowers the share it learns from, so `/verification-setup` may recommend a lower floor in such a project. Reported, not changed; out of both audits' scope because no objective covers it.
