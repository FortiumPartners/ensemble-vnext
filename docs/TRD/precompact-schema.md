# TRD: precompact-schema

**Source PRD**: None — defect

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | `precompact.js` emits a payload the platform accepts, so the hook stops erroring on every compaction | the reproduction below |

## Reproduction

### Steps

**Run it in an isolated `cwd`.** With `cwd` set to a real repo the hook appends a bogus
checkpoint to the live `.trd-state/<feature>/session-log.md` — reproducing the bug dirties the
working tree. `test/smoke/scenarios/hooks-health.sh` already solved this by invoking hooks
against a marker-free temp dir; do the same:

```bash
T="$(mktemp -d)"
echo '{"session_id":"t","transcript_path":"/dev/null","cwd":"'"$T"'","hook_event_name":"PreCompact","trigger":"manual"}' \
  | .claude/hooks/precompact.js
```

Or: trigger any compaction in a session with an active feature.

### Actual

The hook prints, and the platform rejects it:

```
{"hookSpecificOutput":{"hookEventName":"PreCompact","additionalContext":"Compaction imminent — …"}}
```

```
PreCompact [...precompact.js] failed: Hook JSON output validation failed — (root): Invalid input
```

The archive to `session-log.md` still happens; only the payload is rejected. The failure is
therefore **silent in effect** — the checkpoint nudge never reaches anything, and the run
looks fine apart from a red line.

### Expected

Exit 0 with a payload using only documented top-level keys, and no `hookSpecificOutput` for
PreCompact. No validation error.

## Non-Goals

- Changing what `precompact.js` archives, or the format of `session-log.md`.
- Touching any other hook. `session-context.js` uses the same shape for `SessionStart` and
  **works** — which the audit showed *strengthens* the diagnosis rather than weakening it: the
  shape is fine, the `PreCompact` **discriminator** is what has no union member. Do not
  "fix" it.
- Restoring the model-facing nudge through another channel. `SessionStart` with
  `source: compact` is the candidate — its `additionalContext` is proven to work in this repo —
  but that is a separate change with its own probe.

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Make `emit()` print `{}`, and delete the header comment asserting a PreCompact `additionalContext` spec | O1 | None | Running the hook prints exactly `{}`; exit 0; the archive to `session-log.md` still happens |
| FIX-002 | Add `precompact.test.js` asserting the emitted payload shape | O1 | FIX-001 | Test fails against the pre-fix `emit()` and passes after |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/hooks/precompact.js`, `.claude/hooks/precompact.js`
- **Reuse:** `emit()` at lines 41–49 is the single output path — every exit route calls it, so one
  edit covers all of them [ran]
- **Replaces:** the `hookSpecificOutput` object literal inside `emit()`, and the header comment at
  line 20 asserting *"Output (PreCompact spec): JSON with optional additionalContext"* — that
  sentence is the origin of the defect and must not survive the fix [read]
- **Follow:** emit `{}` — every top-level key in the platform's listing is optional, so `{}`
  validates. **Not `systemMessage`**: the audit refuted it. `additionalContext` reaches the
  MODEL; `systemMessage` is user-facing, and this text (`:253-261`) is written as an
  instruction to the model. Printed to the user it is meaningless to them and gone from the
  model — and auto-compaction fires repeatedly at ~95% context, so it becomes a ~430-char
  message on every compaction. That trades a red error line for recurring noise while
  restoring no function [read]
- **Follow:** keep `emit()` as the single output path rather than printing nothing, so FIX-002
  has one testable seam [read]
- **Careful:** `.claude/hooks/precompact.js` is a mirror copy, not a symlink — both must change or
  the vendored runtime keeps the bug [ran]

### FIX-002
- **Touches:** `packages/core/hooks/precompact.test.js`
- **Reuse:** `packages/core/hooks/status.test.js` is the closest existing pattern for asserting a
  hook's emitted JSON [read]
- **Replaces:** nothing — there is no test for this hook today, which is why the defect shipped
  [ran]
- **Follow:** Jest, matching the other `packages/core/hooks/*.test.js` files
- **Careful:** assert on the KEY SET, not on the message text — a test coupled to the wording
  would fail on every copy edit and teach people to ignore it

## Could Not Verify

- **This fix stops the error; it does not restore the nudge.** Stated plainly because the
  first draft of O1 hid it. The model-facing post-compaction instruction now rests solely on
  `implement-trd.md:838-846`, which already tells the model to re-read `session-log.md` after
  compaction — the hook's `additionalContext` was redundant with it. If the nudge is ever
  wanted back, `SessionStart` / `source: compact` is the channel, unverified.
- **Whether the platform's printed schema listing is complete.** It omits `SessionStart`, whose
  `hookSpecificOutput` demonstrably works. The fix is grounded on the observed REJECTION —
  direct evidence — not on the listing's silence.
- **`status.js` may carry the same defect, and this TRD deliberately does not touch it.**
  `status.js:364-368` emits `hookSpecificOutput` on `SubagentStop` with non-standard fields
  (`status`, `timestamp`). `SubagentStop` IS a listed variant, but if it rejects unknown keys
  then `status.js` is failing validation on every subagent stop in exactly the same silent
  way — nothing reads its stdout and the smoke check only requires exit 0 plus parseable
  JSON. One-command probe, separate work.
- **`docs/modernization/2026-05-phase2-recommendations.md:309` repeats the false claim**
  ("PreCompact `additionalContext` instructs post-compact model to re-read the log"). Left as
  historical record, but unannotated it reseeds the belief that produced this defect.
- **The smoke suite cannot catch this bug or its recurrence.** `hooks-health.sh` asserts exit 0
  and `assert_json_valid_or_empty`, which passes on empty, on `{}` and on the invalid payload
  alike. FIX-002 is the only thing that will detect a regression.
