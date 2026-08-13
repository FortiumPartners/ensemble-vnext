# U3 Probe — Bounded Loop Mechanism for `type: "prompt"` Stop/SubagentStop Hooks

**Task:** DISC-P003 (`docs/TRD/discipline-judgment.md` §2.1 U3, promoted to highest-priority
after DISC-P002 materialized R2 — a prompt hook that always blocks demonstrably loops).
**Method:** static extraction of the exact loop-driving source from the CLI bundle
(`/Users/james/.local/bin/claude`, v2.1.229), cross-checked against six live probes in
throwaway `mktemp -d` git repos (`claude --print --setting-sources project
--dangerously-skip-permissions`).

Tags as before: **[OBSERVED]** live probe evidence, **[BUNDLE]** literal extracted source,
**[INFERRED]** reasoned from the other two.

---

## Headline verdict

**Yes — a demonstrable bounded mechanism exists, and in fact there are two independent
ones layered on top of each other:**

1. **A hard platform-level cap** (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`, default 8) that force-ends
   the turn regardless of what the hook or the evaluated model do. This is Shape A's backstop
   — it requires no hook-author action.
2. **A prompt-level self-check pattern** (inspect `stop_hook_active`, return `ok:true` once
   it's `true`) that the platform's own override-warning text explicitly recommends, and
   which live-tested at exactly 1 extra turn — tighter than the hard cap and the pattern this
   project's hooks should actually use.

Additionally, **Shape C (agent-type hook with a self-managed persistent counter) works** and
was live-demonstrated end-to-end: a `type: "agent"` SubagentStop hook read and wrote a real
file-backed counter across separate invocations and used it to release the subagent — a
working, code-executing replacement for the retired per-`agent_id` cap in
`subagent-discipline.js`.

**Framing this against §6.1 A6**: the requirement is satisfied. A bounded mechanism is not
merely theoretically available — it is the platform's default behavior (the hard cap applies
whether or not the hook author does anything), and a tighter, hook-author-controlled version
(the `stop_hook_active` pattern) is directly achievable in a prompt-only hook with no
additional infrastructure. Which of Shape A / B / C to adopt is an operational choice (see
§5), not a blocked decision.

---

## 1. `continueOnBlock` — what it actually does

**[BUNDLE]**, exact extracted logic from the prompt/agent hook evaluation function:

```js
preventContinuation: !c && e.continueOnBlock !== true
```

`c` in this scope is the boolean "is this event Stop or SubagentStop" (set from
`r==="Stop"||r==="SubagentStop"` earlier in the same function — see the U2 probe's system-
prompt extraction, where the same `c` selects between the stop-condition system prompt and
the generic one). **For Stop and SubagentStop, `c` is always `true`.** Substituting:

```
preventContinuation = !true && (...) = false
```

**`preventContinuation` is unconditionally `false` for Stop/SubagentStop prompt hooks,
regardless of `continueOnBlock`.** The schema's own doc-string ("Default false (turn ends)...
Whether continue:true lets the turn proceed depends on the event's decision:'block'
semantics") is accurate as written — it explicitly flags that the effect is event-dependent
— but the practical upshot for this TRD's three hooks (all Stop/SubagentStop) is:
**`continueOnBlock` is a no-op on the events this project cares about.** A block always lets
the turn continue (i.e., loop) up to whatever other cap applies (§2). This setting matters
for other hook events (e.g. `PostToolUse`, per the doc-string's own example), not for
Stop/SubagentStop.

**[OBSERVED]** corroboration: every live probe in this and the prior (P002) round used either
the default (`continueOnBlock` omitted) or never set it to `true`, and all of them looped
(ranging 1–8 cycles depending on hook design) rather than ending on the very first block —
consistent with `preventContinuation` never being `true` on these events. A dedicated
`continueOnBlock: true` A/B was not run (redundant given the source is unambiguous and
directly names the condition), but if a future check wants belt-and-suspenders confirmation,
compare cycle counts with and without it on Stop and expect no difference.

## 2. The hard platform cap

**[BUNDLE]** — extracted directly from the query-loop driver, immediately after a prompt/agent
hook reports a blocking result:

```js
if (ti.blockingErrors.length > 0) {
  let un = fe + 1, Mo = ae + 1;                      // ae = prior stopHookBlockingCount
  if (c && un > c) return ...max_turns...;            // unrelated session-wide max-turns cap
  let xo = Ggt(process.env.CLAUDE_CODE_STOP_HOOK_BLOCK_CAP, 8);   // parse env var, default 8
  if (xo > 0 && Mo > xo)
    return L("tengu_stop_hook_block_count", {count: Mo, is_subagent: Boolean(F.agentId),
              hit_max_turns: false, hit_cap: true}),
           yield sl(
             `A hook blocked the turn from ending ${Mo} consecutive times — overriding and `
             + `ending turn. For Stop/SubagentStop hooks, check stop_hook_active in the input `
             + `and return success while it's true. Set CLAUDE_CODE_STOP_HOOK_BLOCK_CAP to `
             + `raise this limit.`,
             "warning"
           ),
           {reason: "completed"};
  // otherwise: append the blocking feedback message and loop again
  h = {..., stopHookBlockingCount: Mo, turnCount: un, transition: {reason: "stop_hook_blocking"}};
  continue;
}
```

Key facts:

- **`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`** — parsed with `Ggt(env_value, 8)` (an int-parse-with-
  default helper: `if (e===undefined) return t; let r = Oh(e); return Number.isNaN(r) ? t : r`).
  **Default 8.** Configurable, and explicitly documented as configurable in the override
  message itself ("Set CLAUDE_CODE_STOP_HOOK_BLOCK_CAP to raise this limit").
- The counter (`stopHookBlockingCount`, internal var `ae`/`Mo`) starts at 0 for a fresh query
  and increments by 1 on every consecutive block. Override fires when `Mo > cap`, i.e. **after
  `cap + 1` total blocks** (cap=8 default → override on the 9th block; cap=2 → override on the
  3rd).
- This mechanism is **identical for `Stop` and `SubagentStop`** — the only difference is the
  `is_subagent` telemetry flag, not the cap logic itself.
- This is a **separate, unrelated cap** from the session-wide `max_turns` check (`CLAUDE_CODE_MAX_TURNS`,
  which defaults to unset/unbounded) — do not conflate the two; `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`
  is specific to consecutive stop-hook blocking.

### Live confirmation (cap=2)

**[OBSERVED]** — throwaway repo with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=2` and a Stop hook
that unconditionally returns `ok:false` with a fixed reason (`'always-block-test-cap3'`):
exactly **3** `"Stop hook feedback"` messages appear in the transcript (matching the
`cap+1` formula), and the transcript ends immediately after the 3rd — **no further assistant
turn is generated.** This is the override firing exactly where the source predicts.

### Critical operational finding: the override is silent in headless mode

**[OBSERVED]** — in `--print` (headless) mode, when the cap fires:
- `stdout` is **empty** (nothing captured, confirmed via `2>&1` redirect to a file — zero
  bytes).
- The transcript JSONL contains **no trace of the override warning text** at all — no
  `"warning"`, `"overriding"`, `"hit_cap"`, or similar strings appear anywhere in the
  persisted session file. The `sl(..., "warning")` call is evidently a UI-layer / terminal
  toast that is not persisted to the transcript and not written to stdout in `--print` mode.

**This means: a discipline hook that gets wedged into a block loop and hits the hard cap
produces a silently-empty `claude --print` result, with no error surfaced to the caller.**
For this project's headless test harness (`echo "..." | claude --print ...`, per
`CLAUDE.md`'s Headless Testing section) and for any CI/automation consuming `claude --print`
output, this is indistinguishable from "the session produced no output" — there is no
`stderr` diagnostic, no non-zero-looking failure signal beyond an empty response, that a
caller can reliably detect. Any adopted design should treat the cap firing as a real failure
mode to guard against operationally (e.g., via `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` telemetry —
`tengu_stop_hook_block_count` with `hit_cap:true` — if that telemetry is accessible to this
project's own observability, or by relying on the prompt-level self-check in §3 so the cap is
never reached in practice).

### Voluntary give-up is not a substitute — and is not deterministic

**[OBSERVED]**, across six live runs of an always-blocking hook without the `stop_hook_active`
self-check: the evaluated model voluntarily stopped retrying (recognizing the loop and giving
up on its own, well before any hard cap) after **1, 3 (cap-forced), 4, 4, and 6** cycles across
different runs — including runs with an explicit "never give up, keep trying" instruction in
the initial prompt. The count is not fixed and is not reliably tied to the configured cap.
**Relying on the evaluated model's own judgment to bound the loop is not a structural
guarantee** — it is a second, unreliable line of defense on top of the real ones in §2 and §3.

## 3. `stop_hook_active` as a prompt-level loop bound — the platform's own recommended design

**[BUNDLE]** confirmed from the state machine: the initial query state sets
`stopHookActive: e.stopHookActive ?? false`, and every time the loop re-enters after a block
it sets `stopHookActive: true` for the next iteration. **[OBSERVED]**, confirmed identically
live in the DISC-P002 probe: `stop_hook_active=false`/`ABSENT`-adjacent on the very first
entry, `true` on every subsequent re-entry.

The override-warning text itself (§2) is explicit platform guidance: *"For Stop/SubagentStop
hooks, check stop_hook_active in the input and return success while it's true."* This is not
an inferred workaround — it is the documented intended usage pattern, discoverable only by
triggering the failure path (it does not appear in any prior public docs surface this project
has found).

### Live confirmation

**[OBSERVED]** — a Stop hook instructed: *"If `stop_hook_active` is true, return `ok:true`
immediately... Otherwise return `ok:false`"*: exactly **1** block cycle occurred, then the
hook allowed on the retry. This is the tightest possible bound — one extra turn, deterministic,
requires no state outside what the hook input already provides, and works identically on
`SubagentStop` by construction (same field, same semantics per U2).

**This is the recommended pattern for this TRD's three hooks.** It fully addresses A6 without
needing the hard cap as anything but a backstop, and needs no companion command-type hook or
file-based state — consistent with Shape A.

## 4. Shape C — agent-type hook with a self-managed counter (works, live-demonstrated)

**[OBSERVED]** — a `type: "agent"` hook registered on `SubagentStop`, instructed to
read/increment/write a counter file at a path keyed by the input JSON's `agent_id`, and to
return `ok:true` once its own persisted count reached a threshold:

- The hook correctly extracted `agent_id` from its input and used it to key the counter file
  path (confirmed: file `/tmp/p003f-counter-<real-agent-id>.txt` was created, matching the
  actual spawned subagent's id — the same live value class documented in U2).
- The file was read and rewritten across **separate hook invocations** (i.e., state
  genuinely persisted between one blocked turn and the next re-entry — this is not a single
  invocation simulating memory).
- The hook eventually returned `ok:true` once its counter logic was satisfied, and the parent
  session's final output confirmed the subagent was released normally (`"The subagent ran and
  returned: done"`).

**This confirms Shape C is viable as described in the dispatch message**: an agent-type hook
has real tool access (Read/Write/Bash, per the schema in the U2 probe) and can implement
exactly the kind of per-`agent_id` consecutive-block counter that `subagent-discipline.js`
used to do in-process, restoring that capability without a prompt-type hook needing to fake
state it structurally cannot hold. The tradeoffs to weigh against Shape A (not resolved by
this probe, a design decision for Phase 2):
- Agent hooks default to **Haiku** (vs. "the default small fast model" for prompt hooks) and
  a **60s default timeout / 50-turn cap** — materially higher latency and cost per evaluation
  than a single prompt-hook round-trip, relevant to §6.1 A5's p95 ≤ 2000ms budget (see §5).
  A p95 budget compatible with an agent hook's multi-tool-call round trip was not verified in
  this probe.
- It requires the hook to reliably write to a shared, unsandboxed path (here `/tmp`, real
  deployment would need a project-scoped location) — a new small piece of state-management
  surface that Shape A avoids entirely.
- The `stop_hook_active` pattern (§3) already gets the loop bound to 1 extra turn with no
  state file and no tool access needed, which is a strictly tighter bound than any counter-
  based cap running at ≥2 by construction. Shape C's marginal value is for judgments that
  need cross-turn memory *for reasons other than the loop bound itself* — the loop bound on
  its own does not require Shape C.

## 5. Not resolved by this probe (explicitly flagged, not silently skipped)

- **`model` pinning** — confirmed only at the schema level (`model: string` accepted, bundle
  doc-string: *"Model to use for this prompt hook... If not specified, uses the default small
  fast model"*). Not independently live-verified that a pinned model is actually honored
  (e.g., by observing a latency/behavior difference) — time-boxed out of this probe's scope.
  If §6.1 A5's p95 ≤ 2000ms budget is load-bearing, this should get a dedicated timing probe
  before committing to a specific model choice.
- **`timeout` behavior on exceed** — not empirically triggered in any of these runs (all
  evaluator calls completed well under their configured timeouts), and no clear bundle text
  was found describing whether a prompt-hook timeout resolves to allow, block, or an error
  surfaced to the user. **Open question**, not answered here — flag explicitly rather than
  assume either direction.

---

## Appendix — cleanup

All `mktemp -d` throwaway repos (`p003a`–`p003f`, `p004a`, `p004b`) under `$CLAUDE_JOB_DIR/tmp`
and the one scratch counter file under `/tmp` were deleted after use. No files under
`packages/`, `.claude/`, or `test/` in this repository were modified. Only this findings file
and its P004 sibling were created.
