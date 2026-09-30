# Functional Success Definition: command-run-liveness

**Source**: docs/TRD/command-run-liveness.md §Intended Change (received as extracted text: scratchpad/crl-intended.md; line numbers below refer to that extract)
**Source kind**: intended-change
**Derived**: 2026-09-30T01:25:00Z
**Criteria**: 15

**How every row is exercised (shared harness).** Build a throwaway project directory in the
scratchpad containing enough ensemble scaffolding that `router.py` emits its marker (the
router suppresses output in an unscaffolded project), a `.claude/commands/implement-trd.md`
that references `notify-complete.sh`, a `.trd-state/current.json` naming a TRD, a run record at
`.trd-state/_command-runs/<session>.json`, and whatever dispatch-ledger rows the row needs, with
`ts` values computed relative to now. Then pipe a **non-slash** prompt as UserPromptSubmit JSON
(`{"prompt": ..., "cwd": <temp dir>, "session_id": <session>}`) into
`python3 packages/router/hooks/router.py` and save stdout and exit code to a file. That file
is the artifact; the locator is the literal marker text in it. No claude session is started.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts |
|----|----------------------|-------|------------------------------|------------|--------|-------|
| FS-1 | A framework command (`/implement-trd`, whose command file calls `notify-complete.sh`) opened 45 minutes ago, whose workflow agents are still starting and stopping (newest ledger row for this session a few minutes old, after `ts`), reads `active` | lines 28-29 (first rule to check); lines 6-13, 24 (age measured from last sign of life; within 30 min reads `active`); line 4 (the observed 28-minute wait that delivered `state=unknown`) | Router stdout captured from the shared harness with the record `ts` = now-45 min and the feature ledger `.trd-state/<trd basename>/dispatch.jsonl` holding `start`/`stop` rows for this session at now-40 min … now-3 min; stdout contains `ENSEMBLE_COMMAND state=active` | [read] | locator | |
| FS-2 | The same framework command, 31 minutes after its last agent stopped and with no agent still open, reads `unknown` | line 30 (second rule to check); lines 24-25 | Same harness, record `ts` = now-60 min, ledger rows for this session all at or after `ts`, every `start` matched by a `stop`, newest `stop` at now-31 min; stdout contains `ENSEMBLE_COMMAND state=unknown` | [read] | locator | |
| FS-3 | A `/code-review` run (not a framework command) reads `unknown` once it is past 30 minutes old, however many subagents the session dispatched afterwards | lines 31-32 (third rule to check); lines 24-25 ("for any other slash command … `unknown`") | Same harness, record `command` = `code-review`, `ts` = now-31 min, no `.claude/commands/code-review.md`, and many fresh ledger rows for this session (e.g. 20 `start`/`stop` pairs in the last 5 min, plus one open `start`); stdout contains `ENSEMBLE_COMMAND state=unknown` | [read] | locator | |
| FS-4 | A slash command whose `.claude/commands/<name>.md` exists but does NOT call `notify-complete.sh` is not treated as a framework command: past the ceiling it reads `unknown` despite fresh ledger activity | lines 6-8 (framework command = file exists AND calls `notify-complete.sh`); lines 24-25 | Same harness with a `.claude/commands/<name>.md` whose body never mentions `notify-complete.sh`, record for `<name>` at now-45 min, fresh ledger rows for this session; stdout contains `ENSEMBLE_COMMAND state=unknown` | [read] | locator | |
| FS-5 | Ledger rows belonging to a different session do not keep a run alive | line 13 ("the newest dispatch-ledger row **for this session**") | FS-1's setup, but every fresh ledger row carries a different `session_id`; stdout contains `ENSEMBLE_COMMAND state=unknown` | [read] | locator | |
| FS-6 | An agent that started BEFORE the record's `ts` and never stopped does not count as a sign of life | line 15 ("an agent started **at or after** `ts` with no `stop` yet") | Record `ts` = now-45 min; the only ledger row for this session is an unmatched `start` at now-50 min; stdout contains `ENSEMBLE_COMMAND state=unknown` | [read] | locator | |
| FS-7 | An agent started at or after `ts`, still open, with its `start` under 4 hours old, keeps the run `active` even with no ledger row in the last 30 minutes | lines 15-16 (open agent counts as a sign of life *now* while its `start` is under 4 hours old) | Record `ts` = now-3h05m; one unmatched `start` for this session at now-3h (nothing newer); stdout contains `ENSEMBLE_COMMAND state=active` | [read] | locator | |
| FS-8 | An agent left open for 4 hours or more no longer counts, so the run reads `unknown` | lines 15-16 ("but only while its `start` is less than 4 hours old") | Record `ts` = now-4h10m; one unmatched `start` for this session at now-4h05m (nothing newer); stdout contains `ENSEMBLE_COMMAND state=unknown` | [read] | locator | |
| FS-9 | Rows in the shared `.trd-state/_dispatch.jsonl` count as signs of life even when `current.json` names a feature | line 21 ("It also reads the shared `_dispatch.jsonl`") | FS-1's setup with the feature ledger absent or empty and the same fresh rows written only to `.trd-state/_dispatch.jsonl`, `current.json` still naming the TRD; stdout contains `ENSEMBLE_COMMAND state=active` | [read] | locator | |
| FS-10 | With no `current.json`, the router still finds signs of life in `.trd-state/_dispatch.jsonl` | lines 19-21 (`ledgerPath()` falls back to `.trd-state/_dispatch.jsonl`) | FS-1's setup with `current.json` removed and the fresh rows in `.trd-state/_dispatch.jsonl`; stdout contains `ENSEMBLE_COMMAND state=active` | [read] | locator | |
| FS-11 | A `current.json` TRD name that would resolve outside `.trd-state/` is rejected: the router does not read a ledger through it | line 20 ("rejecting `..` and path separators") | `current.json` `trd` = `docs/TRD/...md` (basename minus `.md` is `..`); fresh rows for this session planted ONLY at `<temp>/dispatch.jsonl` (the file `.trd-state/../dispatch.jsonl` would name); record at now-45 min; stdout contains `ENSEMBLE_COMMAND state=unknown`. Control run: the same rows moved into `.trd-state/_dispatch.jsonl` reads `state=active` | [read] | locator | |
| FS-12 | A ledger larger than 64 KB is handled: the run reads `active` from a fresh row at the end of the file, and the router exits 0 with well-formed output | line 22 ("reads the last 64 KB of each file, skipping a partial first line") | FS-1's setup with the feature ledger padded to well over 64 KB (e.g. ~200 KB) of older rows, so the 64 KB window starts mid-line, and the fresh rows last; captured stdout contains `ENSEMBLE_COMMAND state=active`, and the captured exit code line reads `exit=0` | [read] | locator | |
| FS-13 | A ledger that cannot be read degrades to `unknown`, never to an error or a crash | line 25 ("on any read error, it reads `unknown`, exactly as today") | Record at now-45 min for `implement-trd`; the only ledger locations are unreadable (e.g. the feature `dispatch.jsonl` path is a directory and no `_dispatch.jsonl` exists, or the file is `chmod 000`); stdout contains `ENSEMBLE_COMMAND state=unknown` and the captured exit code line reads `exit=0` | [read] | locator | |
| FS-14 | Reading the run never rewrites its record: the record's `ts` is unchanged after a read that resolves `active` through the ledger | line 12 ("the record's `ts`, which is never rewritten") | The run record file's contents (or `shasum`) captured before and after FS-1's router invocation, shown identical, including the original `ts` string | [read] | locator | |
| FS-15 | A framework command's run younger than 30 minutes still reads `active` with no ledger at all, as it does today | line 6 (the change applies only "when the router reads an `active` record older than the ceiling"); line 2 (today's behaviour) | Record for `implement-trd` at now-10 min, no ledger files; stdout contains `ENSEMBLE_COMMAND state=active` | [read] | locator | |

## Notes

- **The 30-minute boundary in FS-3 is set at 31 minutes on purpose.** The source says "30
  minutes after it opened" (line 31), while today's rule is "older than 30 minutes" (line 2).
  At exactly 1800 seconds the two readings disagree, and the source gives no ruling, so the
  row tests just past the boundary, where they agree. The source's other rule (line 30) uses
  31 minutes the same way.
- **The Stop judge's behaviour is not a criterion here.** The source's outcome is the marker
  the router emits (lines 2, 24-25); what the judge then does with `state=active` is today's
  behaviour and unchanged. Every row is checked at the router, as instructed, with no claude
  session.
- **The 4-hour figure is taken as stated, with its own caveat.** Line 16 sources it to one
  observation (a 28-minute phase) and points at an open question (OQ-1). FS-7 and FS-8 test the
  value the source states; whether 4 hours is the right bound is that open question, not
  something this definition decides.
- **FS-11's control run is part of the evidence**: without it, `state=unknown` could come from
  the router failing to read any ledger at all, which would pass FS-11 for the wrong reason.
