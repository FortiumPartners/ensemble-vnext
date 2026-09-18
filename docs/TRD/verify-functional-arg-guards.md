# TRD: verify-functional-arg-guards

**Source PRD**: None — defect found in a live `/verify-build` run (lightning-lane-prompt-fixes, 2026-08-25/26)

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | A `verify-functional` run started with a required argument missing fails immediately with a message naming that argument, instead of a `TypeError` naming a JavaScript internal | the reproduction below |
| O2 | A required argument that is missing but not dereferenced fails the same way, rather than silently interpolating `undefined` into an agent prompt | the reproduction below |
| O3 | `/verify-build` dispatches the workflow with a complete, literal argument object, so no argument can go missing through per-run reconstruction | the adversarial review, 2026-08-26 |

## Reproduction

### Steps

The workflow runtime supplies `args`; the failure is in the argument prelude
(`packages/core/workflows/verify-functional.js:55-101`). Reproduced by executing that
block verbatim against argument objects with one field omitted — no live state touched:

```bash
sed -n '55,101p' packages/core/workflows/verify-functional.js > /tmp/prelude.js
# execute with `new Function('a', prelude)` for each arg object
```

### Actual

```
all args present         : no throw
statePath MISSING        : TypeError: Cannot read properties of undefined (reading 'replace')
checker MISSING          : TypeError: Cannot read properties of undefined (reading 'replace')
reportPath MISSING       : no throw
evidenceDir MISSING      : no throw
criteria MISSING (guard) : Error: verify-functional: args.criteria is required and must be an array (possibly empty)
cap MISSING (guard)      : Error: verify-functional: args.cap is required and must be a positive integer (the iteration cap, ordinarily 3)
```

In production (Bun) the same defect surfaced as
`undefined is not an object (evaluating 'STATE_PATH.replace')` at `workflow.js:79`, which
names neither the argument nor the workflow. It blocked every `/verify-build` rerun in that
session; the owner's reading of it was *"the command cannot be so brittle...?"*.

Two distinct failure shapes, not one:

- **`statePath`, `checker`** — dereferenced by `.replace(/\/[^/]*$/, '')` at lines 91 and 98,
  so a missing value throws a `TypeError` at a line that has nothing to do with the caller's
  mistake.
- **`since`** — a third shape, found by the adversarial review. Unpacked bare at line 64 with no
  default and interpolated into a shell command the judge is told to run
  (`node ${CHECKER} check-evidence --file ${claimsFile} ${SINCE}` at line 174). The checker CLI
  does reject a non-finite value (`.claude/lib/functional-verification.js:421-423`), so it is not
  silent — but it surfaces as a CLI usage error inside a dispatched subagent, which is precisely
  the diagnostic gap O1 exists to close.
- **`reportPath`, `evidenceDir`** — never dereferenced in the prelude, so they pass silently
  and reach the model as the literal string `undefined` inside dispatched prompts
  (`Evidence directory: ${EVIDENCE_DIR}` at line 133, `write the output to ${REPORT_PATH}` at
  line 220). This is the worse shape: the run proceeds and reports a result derived from a
  prompt that told an agent to look in a directory named `undefined`.

### Expected

Each required argument is validated where it is unpacked, and a missing one throws
`verify-functional: args.<name> is required …` — the treatment `criteria` and `cap` already
receive twelve lines above.

## Decision

Guard each required argument at its unpack site with a terse one-liner, and **fix the caller in
the same change**.

**Form: the family's one-liner, not a paragraph block.** `criteria` and `cap` carry
paragraph-long comments because each documents a non-obvious downstream failure — `cap`'s
explains a silent no-op loop dressed as a stuck outcome. `statePath`, `checker`, `reportPath`,
`evidenceDir` and `since` fail obviously once named, so they follow the sibling convention
instead: `implement-phase.js:73`, `audit-trd.js:45` and `audit-build.js:51` all use a single
`if (!X) throw new Error('<workflow>: args.<name> (<what it is>) is required')`.

**Rejected — reusing `required()` at line 47.** It is the closest existing helper, but it is for
*dead agent results*, not arguments: its message reads `"<stage> stage returned no result (the
agent died or was skipped)"`. Correct shape, wrong semantics — it would report a missing argument
as a dead subagent, which is a worse diagnostic than the `TypeError` being replaced.

**Rejected — defaulting the missing values.** `statePath` derives `STATE_DIR` (line 91), the
write destination for the judge-payload files; `checker` derives `STATE_WRITER` (line 99). A
guessed value writes real files where nobody asked. Stopping is correct.

**The caller is absorbed, not deferred** (`/fix` rule 2f — a blocker in the path of the fix is
part of the fix). The reported incident was a `/verify-build` rerun, and the guards alone do not
restore it. `.claude/commands/verify-build.md:112` dispatches the workflow as
`Workflow({ name: "verify-functional", args: {…} })` — a literal `{…}` placeholder — and points
at "every field §3.3 names" across two documents without naming either. `grep` for the four
argument names across all 170 lines returns **zero**. `implement-trd.md:1120-1136` dispatches the
same workflow with all 15 fields spelled out. So one caller is complete by construction and the
other requires the model to reconstruct a 15-field object from prose on every run. That
reconstruction is the mechanism by which `statePath` went missing, and it is non-deterministic:
it will recur.

`verify-build.md:66-72` makes the indirection deliberate — *"Read those sections rather than
restating them here — a second copy of an argument list is a second copy to drift."* That
reasoning is sound about drift and traded it for a per-run reconstruction risk, which fired. A
literal block re-introduces the drift exposure; the existing mirror check in
`test/integration/tests/implement-trd-structure.test.sh` is what makes that acceptable, and
FIX-003 leaves the §3.3 pointer in place as the authority.

**Sequencing.** FIX-003 lands with or before FIX-001. Today a `/verify-build` run that drops only
`reportPath`/`evidenceDir` completes and returns a result; after FIX-001 it dies at the prelude.
That is the intended direction — the current "success" is a false pass built on a prompt reading
`Evidence directory: undefined` — but with the caller unfixed it would make `/verify-build` fail
harder and more often than it does today.

## Non-Goals

- Changing the workflow's interface, control flow, or any behaviour when arguments are complete.
- Validating the eight remaining arguments (`contract`, `notes`, `stackHints`, `feature`, `prd`,
  `definitionPath`, `resume`, `project`). Each has an `|| ''` / `|| null` default, so none can
  crash or interpolate `undefined`. Note this is **not** the same as being optional: §3.3 declares
  `feature`, `prd` and `definitionPath` as required, and the `FEATURE`/`PRD`/`DEFINITION_PATH`
  comment block records that
  all three once rendered as `undefined` in every report header (Finding A). `|| ''` makes that
  header empty rather than `undefined` — quieter, still wrong. Out of scope here, but they are
  defaulted, not optional.
- Auditing other workflow scripts for the same pattern. Likely present in `audit-trd.js` and
  `audit-build.js`; that is a separate `/fix` and is reported, not absorbed — the requested
  work succeeds without it.

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-003 | Replace the `args: {…}` placeholder at `verify-build.md:112` with the complete literal 15-field argument object, in both copies of the command | O3 | None | `grep -c "statePath\|reportPath\|evidenceDir\|checker" .claude/commands/verify-build.md` returns non-zero (it returns 0 today); the dispatch block names all 15 fields §3.3 declares; `diff .claude/commands/verify-build.md packages/core/commands/verify-build.md` reports no difference |
| FIX-001 | Add fail-loud one-liner guards for `statePath`, `reportPath`, `evidenceDir`, `checker` and `since` at their unpack sites, in both copies of the workflow | O1, O2 | FIX-003 | Executing the argument prelude with `statePath` omitted throws an `Error` (not a `TypeError`) whose message contains `args.statePath`; likewise for `checker`, `reportPath`, `evidenceDir` and `since`. With all arguments present the prelude throws nothing. `diff .claude/workflows/verify-functional.js packages/core/workflows/verify-functional.js` reports no difference |
| FIX-002 | Add a test case per newly-guarded argument asserting the named-error behaviour | O1, O2 | FIX-001 | `npx jest packages/core/workflows/verify-functional.test.js` passes and contains a case per guarded argument that fails if that argument's guard is removed |

## Task Grounding

### FIX-003
- **Touches:** `.claude/commands/verify-build.md`, `packages/core/commands/verify-build.md`
- **Reuse:** the literal dispatch block at `.claude/commands/implement-trd.md:1120-1136` — all 15 fields with inline `// §8.1` style provenance comments. Copy its shape [ran]
- **Replaces:** the `args: {…}` placeholder at `verify-build.md:112` [ran]
- **Follow:** keep the existing pointer to §3.3 of `docs/TRD/functional-verification.md` as the authority for the field list; the literal block is the dispatch, not a competing spec [read]
- **Careful:** the two command copies are byte-identical today and a mirror-drift check in `test/integration/tests/implement-trd-structure.test.sh` enforces it — edit both or that suite fails. Values differ from implement-trd's: `/verify-build` resolves its own feature and definition (Step 3, lines 66-72), so paths must come from that resolution, not be copied verbatim [read]

### FIX-001
- **Touches:** `packages/core/workflows/verify-functional.js`, `.claude/workflows/verify-functional.js`
- **Reuse:** the sibling one-liner guard convention — `implement-phase.js:73-74`, `audit-trd.js:45`, `audit-build.js:51` — a single `if (!X) throw new Error('verify-functional: args.<name> (<what it is>) is required')`. Do NOT reuse `required()` at line 47: it reports a dead agent stage, not a missing argument [read]
- **Replaces:** nothing — additions at existing unpack sites (lines 62, 63, 64, 74, 75) [ran]
- **Follow:** message form `verify-functional: args.<name> is required and must be <shape>`, matching the two existing throws verbatim in prefix and tone [read]
- **Careful:** the two files are byte-identical today (`diff` confirms) and must stay so — `.claude/workflows/` is the vendored runtime, `packages/core/workflows/` is the source. Edit both. `checker` is dereferenced at line 98 into `LIB_DIR`/`STATE_WRITER`, so its guard must precede that line, not merely its unpack site [ran]

### FIX-002
- **Touches:** `packages/core/workflows/verify-functional.test.js`
- **Reuse:** the existing 801-line suite's conventions — `describe`/`it`, and the source-level constraint tests at lines 79-105 which already read the file as text rather than importing it [read]
- **Replaces:** nothing — new `describe` block [read]
- **Follow:** the file tests a workflow script that cannot be `require`d; existing cases either read the source as text or drive it through a stubbed `agent()`. Match whichever the neighbouring cases use for prelude behaviour [read]
- **Careful:** a test asserting only "throws" would pass against the CURRENT code too, since the unguarded path already throws a `TypeError`. Each case must assert on the message naming the argument, or it cannot fail if the fix does nothing [inferred]

## Could Not Verify

- That the production Bun stack trace (`workflow.js:79`) corresponds to line 91 of this
  source. The line numbers differ because the workflow runtime wraps the script; the error
  text (`STATE_PATH.replace`) and the reproduction both point at the same expression, but the
  mapping itself was not confirmed.
- `audit-trd.js:45` and `audit-build.js:51` DO carry the same pattern — each guards only `trd`
  and unpacks every other field bare (confirmed by the adversarial review). Out of scope here;
  reported as a separate defect rather than absorbed, because this fix succeeds without it.
- Whether FIX-003's literal block re-introduces the argument-list drift that
  `verify-build.md:66-72` deliberately avoided. The mirror-drift suite covers copy-to-copy
  divergence but nothing checks either copy against §3.3's field list.

- **Corrected during hardening:** the row above understated the coverage. `implement-trd-structure.test.sh`'s
  test 30 is a directory-wide sweep of `packages/core/commands` ↔ `.claude/commands`, so both
  `verify-build.md` copies and both `verify-functional.js` copies ARE pinned — mutation-tested
  by drifting one copy and watching it go red. A hardening lens reported this as uncovered
  after inspecting only the explicit 13-pair list (test 11); that report was wrong and a change
  made on it was reverted. What genuinely remains unchecked is narrower: nothing compares
  either dispatch block to §3.3's field list, and nothing compares `implement-trd.md`'s block
  to `verify-build.md`'s. They already differ intentionally (`cap: 3` vs `cap: capArg ?? 3`),
  so there is no mechanism to tell intentional divergence from a dropped field.
- `contract` and `stackHints` keep their `|| ''` defaults and have no documented empty-value
  semantics, unlike `notes`/`project`/`prd`. A missing `contract` therefore still degrades
  silently — the O2 shape, evading O2's wording because the value is `''` rather than
  `undefined`. Out of this fix's scope; reported, not absorbed.
- A guard throw leaves no `verification-state.json`, so `/implement-trd --verify --resume`
  cannot re-enter the loop after one (§8.2's gate needs a non-terminal state file). Recovery is
  `/verify-build`. Correct, but undocumented in either command.
