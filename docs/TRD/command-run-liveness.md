# TRD: command-run-liveness

**Source PRD**: None — small change decided in session (owner, 2026-09-29)
**Kind**: change
**Weight**: small

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | While a command is visibly still running — its session has subagents in flight, or dispatched or finished one within the last 30 minutes — every prompt in that session reports the command as running (`ENSEMBLE_COMMAND state=active`), however long the command has run. This includes the notification turns that deliver a workflow's result, so the Stop judge's check against "should I continue?" pauses (case B) covers long commands end to end | owner, 2026-09-29: "keep the command-run marker `active` for as long as a command is visibly still running, so the discipline-stop judge's case B (no 'should I continue?' pauses) covers long commands end to end"; `autonomy.md` Enforcement names this as the known gap |
| O2 | A command that has stopped showing activity — crashed, interrupted, or a slash command this framework does not own and so never closes — still stops counting as running 30 minutes after its last sign of life, as today | `router.py` `read_command_run_state` comments: the ceiling exists so that an unclosed run does not keep the pause check on for the rest of the session (D12, reversed 2026-09-24) |

## Intended Change

**Today.** `router.py` opens a run when a prompt is a slash command. It writes `{state: "active", command, ts}` to `.trd-state/_command-runs/<session>.json`. `notify-complete.sh` writes `{state: "none"}` on the command's final turn. On every other prompt, the router reads the file, and an `active` record older than 30 minutes (`ACTIVE_RUN_CEILING_SECONDS`) reads as `unknown`. The Stop judge applies case B only on an explicit `state=active`, so 30 minutes into any command the pause check switches off.

**Observed [ran].** In this session (2026-09-29), `/implement-trd` waited 28 minutes for its phase workflow. The notification turn that delivered the result carried `ENSEMBLE_COMMAND state=unknown`, although the command was still running and its dispatch ledger had just recorded the workflow's agents finishing.

**After.** When the router reads an `active` record older than the ceiling, and the command
that opened it is **one of this framework's own** (a `.claude/commands/<name>.md` exists and
calls `notify-complete.sh`, so it closes its own run), the router measures the run's age
from its **last sign of life** instead of from when it opened. The last sign of life is the
later of:

- the record's `ts`, which is never rewritten;
- the newest dispatch-ledger row for this session timestamped at or after `ts`.

An agent started at or after `ts` with no `stop` yet counts as a sign of life *now*, but only
while its `start` is less than 4 hours old (the longest single phase observed here was 28
minutes; see OQ-1).

The router reads the ledger at the same path `dispatch-ledger.js` writes, `ledgerPath()`:
`current.json`'s TRD basename with `.md` stripped, rejecting `..` and path separators, else
`.trd-state/_dispatch.jsonl`. It also reads the shared `_dispatch.jsonl`. It reads the last
64 KB of each file, skipping a partial first line.

If the last sign of life is within 30 minutes, the run reads `active`. Otherwise, and for any
other slash command, and on any read error, it reads `unknown`, exactly as today.

The rule to check:
- A framework command whose workflow agents are still starting and stopping 45 minutes in
  reads `active`.
- The same command 31 minutes after its last agent stopped reads `unknown`.
- A `/code-review` run reads `unknown` 30 minutes after it opened, however many subagents the
  session dispatches afterwards.

## Decision

- **Measure age from the last sign of life; never write.** The router's read path stays
  read-only. It keeps `ts` as the time the run opened and takes the newer of `ts` and the
  session's latest ledger activity since `ts`. This comes from the adversarial review
  (2026-09-29). The first draft rewrote `ts` on every sign of activity, which had three
  problems:
  - it could keep a run active forever;
  - it could race with `notify-complete.sh`'s `none` write;
  - it turned a read into a write.
- **Only commands that close their own run get the extension.** A slash command this
  framework does not own (`/code-review`, `/loop`) never writes `none`. Were ledger activity
  to extend it, any later subagent in the session would keep it `active`, breaking O2. Those
  commands keep today's flat 30 minutes from opening. "Owns its close" is read from
  `.claude/commands/<name>.md` calling `notify-complete.sh`, so it is derived from the
  commands themselves, never a list kept by hand.
- **Activity counts only if it happened after the run opened.** A stranded `start` row from
  an earlier command cannot revive a newer run. The `start`/`stop` rows of one agent can land
  in two files when `current.json` changes mid-agent; reading both the feature ledger and
  `_dispatch.jsonl` covers that.
- **Rejected: refreshing on status banners.** Only a Stop hook sees banners, and a long wait
  for a workflow has no Stop between dispatch and result.
- **Every failure reads `unknown`,** as the router already does. The work is bounded: two
  64 KB tail reads per prompt, and only when an `active` record has aged past 30 minutes.

absorbed:     none
not absorbed: a framework command that crashes without writing `none` stays `active` while
              the session keeps dispatching agents, then lapses 30 minutes after the last.
              That is bounded by activity, and the next slash command reopens the run.

## Non-Goals

- No change to the Stop judge's prompt, to case B's rule, or to how the marker line is written.
- No change to the 30-minute ceiling itself, or to what `notify-complete.sh` writes.
- No new hook, and no change to `dispatch-ledger.js`'s format.
- No allowlist of framework-owned commands.

## Verification Artifacts

None apply — no UI designs, interaction diagrams or data views; the surface is a hook script and its tests.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | How long may one agent run, with no stop row, and still count as the command being alive? | 4 hours from its `start`. The longest single phase observed here was 28 minutes; this bounds a crashed agent without cutting off a genuinely long one | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | In `packages/router/hooks/router.py`, when `read_command_run_state` finds an `active` record older than `ACTIVE_RUN_CEILING_SECONDS`, return `active` only if all of these hold: <ul><li>the record's command is framework-owned, meaning `.claude/commands/<name>.md` under the project root exists and contains `notify-complete.sh`;</li><li>its last sign of life, as defined in Intended Change, is within the ceiling.</li></ul>Otherwise return `unknown`. Never write the file on this path. Implement `ledgerPath()`'s resolution rule exactly: basename, strip `.md`, reject `.`/`..`/separators. Read a 64 KB tail of the feature ledger and of `_dispatch.jsonl`, skipping a partial first line. Parse timestamps with both `Z` and `+00:00` suffixes. Mirror to `.claude/hooks/router.py`. Add pytest cases, each in a temp project directory: <ol><li>a framework command stale by `ts`, with a recent row for this session after `ts` → `active`;</li><li>the same, but the row is older than 30 minutes → `unknown`;</li><li>the same, with an open agent started after `ts` less than 4 hours ago → `active`;</li><li>an open agent whose start predates `ts` → `unknown`;</li><li>recent rows for a different session only → `unknown`;</li><li>a foreign command (no command file) with recent session rows → `unknown`;</li><li>a `none` record with recent rows → `none`;</li><li>no ledger file → `unknown`;</li><li>the run-state file is byte-for-byte unchanged after every case.</li></ol> | O1, O2 | None | <ul><li>All nine cases pass.</li><li>Cases 1 and 3 fail when the ledger check is removed.</li><li>Cases 2, 4, 5 and 6 fail when the time, after-`ts`, session or ownership filter is removed. Prove each by a temporary local change, not committed.</li><li>Every existing router test passes.</li><li>`.claude/hooks/router.py` is byte-identical to the package copy.</li></ul> |
| FIX-002 | Docs. <ul><li>`autonomy.md` (+ template), Enforcement: replace "an `active` record older than 30 minutes degrades to `unknown` — a known gap for any command still running past that mark" (`:124-125`) with the new rule. A framework command stays active while its session shows agent activity after it opened, and lapses 30 minutes after the last; any other slash command lapses 30 minutes after it opened.</li><li>`CLAUDE.md`: drop the 4.7.0 known-open item about the 30-minute ceiling (`:341-344`).</li><li>`docs/reference/hooks.md`: describe the check in the router section.</li></ul>Keep every byte ceiling. | O1 | FIX-001 | <ul><li>`grep -c "a known gap for any command still running" .claude/rules/autonomy.md` is 0 (it is 1 today).</li><li>`grep -c "30-minute ceiling is a real gap" CLAUDE.md` is 0 (it is 1 today).</li><li>The template and vendored `autonomy.md` are byte-identical.</li><li>`runtime-integrity.test.sh` passes, including its byte ceilings.</li></ul> |

## Task Grounding

### FIX-001
- **Touches:** `packages/router/hooks/router.py`, `.claude/hooks/router.py`, `packages/router/tests/test_router.py`
- **Reuse:** `read_command_run_state`, `_active_is_stale`, `write_command_run_state` and `derive_feature` in `router.py` [read]; the ledger row shape `{ts, event, agent_id, session_id, …}` [read, `.trd-state/refine-verification/dispatch.jsonl`]
- **Replaces:** the unconditional stale → `unknown` return at `router.py:312-313` (rationale comment at `:301-311`)
- **Follow:**
  - `router.py`'s never-raise style: every failure degrades to `unknown` [read]
  - the ledger path resolution in `packages/core/hooks/lib/dispatch-ledger.js` `ledgerPath()` (`:98-120`): `current.json`'s feature, else `.trd-state/_dispatch.jsonl`; `openAgents()` (`:233`) is the JS reading of "still running" to match [read]. The ledger rotates when large (`rotateIfLarge`, `:123`), so a bounded tail read is safe [read]
  - pytest tests isolate state in a temp directory [read]
- **Careful:**
  - `packages/full/hooks/router.py` is a symlink and follows automatically [read, code review 2026-09-29]
  - the router runs on every prompt, so keep the read bounded and cheap [read]
  - timestamps are ISO-8601 with `Z` in the ledger and `+00:00` in the run-state file; parse both [read]

### FIX-002
- **Touches:** `.claude/rules/autonomy.md`, `packages/core/templates/claude-directory/rules/autonomy.md`, `CLAUDE.md`, `docs/reference/hooks.md`
- **Reuse:** the existing Enforcement paragraph 2 in `autonomy.md` [read]
- **Replaces:** `autonomy.md:124-125`'s "a known gap" sentence and `CLAUDE.md:341-344`'s known-open item
- **Follow:** byte ceilings held by `runtime-integrity.test.sh` [read]
- **Careful:** `CLAUDE.md` sits close to its 15,000-byte limit [read]

## Could Not Verify

| Claim | Why not checked |
|-------|-----------------|
| Whether every long wait inside a command has ledger activity at least every 30 minutes (for example, a lead waiting on a background shell task with no subagents) | Such a wait writes no ledger rows. It still lapses after 30 minutes, as today. Measuring how common it is needs live runs |
| Whether the Stop judge then applies case B correctly on those later turns | The judge's behaviour is unchanged. This change only makes the marker `active` on turns where it was `unknown`; a live long run is the check |
| Whether the delivered change matches product intent beyond this TRD's two objectives | No PRD exists for this feature (a small change decided in session, 2026-09-29; `current.json` records `prd: null`). `/audit-build` (2026-09-29) checked the code against this TRD's tasks only; checking it against product requirements had no source to run on |
