# U6 Probe — What Happens When a `type: "prompt"` Hook's Evaluation Exceeds Its `timeout`?

**Task:** DISC-P00x (ad hoc, assigned directly by team-lead as the last correctness gate
for DISC-B008/TRD §6.1.2). **This is not a latency question and does not depend on the
numbers** — it would matter identically if evaluation took 50ms, because the question is
what the *mechanism* does when its own deadline is hit, not how often that deadline is hit
in practice.

**Method:** two independent lines of evidence, cross-checked against each other —

1. **[OBSERVED]** live probes in a throwaway repo (`$CLAUDE_JOB_DIR/tmp/u6-probe`),
   forcing a timeout by setting an explicit `timeout` shorter than a real API round trip
   (`1`s, then `0.3`s once `1`s proved marginal), with `--debug --debug-file` capturing
   the CLI's own internal debug log — which turned out to log the hook's dispatch, the
   aborted API request, and the session's subsequent exit path with millisecond timestamps.
2. **[BUNDLE]** source text extracted via `strings -a` from the CLI binary
   (`/Users/james/.local/share/claude/versions/2.1.229`), scoped with targeted `grep`
   (whole-binary `grep` on the 270MB executable is impractical — confirmed by the team
   lead's own note this session; every search below was pre-scoped to a keyword).

Tags: **[OBSERVED]**, **[BUNDLE]**, **[INFERRED]** (reasoned from the other two).

---

## Headline verdict

**On timeout, the hook resolves as ALLOW (fail-open) on both `Stop` and `SubagentStop` —
not block, not a surfaced error.** Confirmed empirically 4/4 times (1 run on `Stop`, 3 runs
on `SubagentStop`) and confirmed at the source level: the code path that catches an
aborted (timed-out) evaluator API call returns a distinct `outcome: "cancelled"` result —
**not** `outcome: "blocking"` — and does not go through the `"Hooks: Prompt hook error:"`
logging branch that other execution errors do. The evaluated session/subagent completed
normally every time, with **no** visible sign to the user or the evaluated model that a
hook had timed out. **This is good news for TRD §6.1.2/§6.2**: it means an evaluator that
is slow or briefly unavailable does not wedge turn ends — the specific failure mode the
team lead flagged as strictly worse than anything this TRD fixes did not occur.

## 1. Forcing an observable timeout

Config used (`Stop`, then repeated for `SubagentStop`):

```json
{
  "hooks": {
    "Stop": [
      { "matcher": "*", "hooks": [
        { "type": "prompt", "prompt": "Always return ok:true immediately with reason 'noop'. $ARGUMENTS", "timeout": 1 }
      ]}
    ]
  }
}
```

Triggered with:
```bash
claude --print --debug --debug-file captures/debug.log --setting-sources project \
  --dangerously-skip-permissions 'Say hello in one short sentence.'
```

`--debug --debug-file <path>` (discovered via `claude --help`) turned out to be the key
tool here — `--print`'s stdout alone shows only the final assistant text, which (per §3
below) is indistinguishable whether the hook allowed cleanly or timed out. The debug log
is where the hook's fate is actually visible.

## 2. Evidence — `Stop`, `timeout: 1`

**[OBSERVED]**, `captures/debug.log`:

```
14:17:43.779Z [DEBUG] Hooks: Processing prompt hook with prompt: ...
14:17:43.779Z [DEBUG] Hooks: Querying model with 6 messages
14:17:43.780Z [DEBUG] [API:timing] dispatching to firstParty model=claude-haiku-4-5-20251001
14:17:43.781Z [DEBUG] [API REQUEST] ... source=hook_prompt
14:17:44.793Z [ERROR] Error in API request: Request was aborted.
```

The abort fires at **1.012s** after dispatch — matching the configured `timeout: 1`
almost exactly (not a coincidence; reproduced at a different timeout value in §3).
Immediately after the abort, the log shows MCP servers and the LSP manager shutting down
— i.e., the process proceeded straight to normal exit. No `"Hooks: Prompt hook error:"`
line appears anywhere in the log (checked with `grep -in "prompt hook error"` — zero
matches). Final `--print` stdout: `"Hello! What can I help you today?"` — a single,
un-retried turn. Exit code 0. Reproduced twice with the same shape (`elapsed≈3.7-3.85s`
total wall time both runs, dominated by the main turn, not the aborted hook call).

## 3. Evidence — `SubagentStop`, `timeout: 0.3` (3/3 runs)

`timeout: 1` on `SubagentStop` proved marginal (one run's evaluator finished in 0.83s,
under the deadline, and the hook resolved normally with `"Hooks: Prompt hook condition
was met: noop"` — a useful negative control showing the hook path works correctly when it
doesn't time out). Lowering to `timeout: 0.3` forced the timeout reliably:

```
Run 1: dispatch 14:19:26.292 → abort 14:19:26.598  (306ms)
Run 2: dispatch 14:19:39.370 → abort 14:19:39.677  (307ms)
Run 3: dispatch 14:19:53.313 → abort 14:19:53.619  (306ms)
```

All three: abort at ~306-307ms against a 300ms configured timeout — consistent,
reproducible, and clearly deadline-driven (not random API jitter — jitter would not track
the configured value this tightly across three independent runs).

The decisive line, immediately following Run 1's abort:

```
14:19:26.598Z [ERROR] Error in API request: Request was aborted.
14:19:26.599Z [INFO] [Stall] agent_completion agentId=aa353cbdee3c8d8c2 agentType=general-purpose
             exitPath=completed durationMs=4577 turns=2 finalStopReason=end_turn ...
```

**1 millisecond** after the aborted hook evaluation, the subagent's own completion event
fires with `exitPath=completed` — i.e., the subagent was allowed to actually stop. All 3
runs' final `--print` output confirms the same: the lead session reports the subagent
completed its task (`echo hi` → `DONE`), no retry cycle, no block-feedback message
anywhere in stdout, exit code 0 all 3 times.

## 4. Source-level confirmation — why this happens

**[BUNDLE]** — the prompt-hook evaluator function (shared across `Stop`/`SubagentStop`,
parameterized by the event name `r`) contains this exact structure:

```js
let g = e.timeout ? e.timeout*1000 : 30000,
    {signal:y, cleanup:v} = wF(o, {timeoutMs:g});
try {
  // ... dispatch API call with signal:y ...
  C = await w(h);
  if (v(), C.isApiErrorMessage) {
    let O = Hu(C.message.content).trim();
    return E(`Hooks: prompt-hook evaluator API error: ${O}`, {level:"error"}),
           Oer(e, {hookName:t, toolUseID:l, hookEvent:r, stderr:`Hook evaluator API error: ${O}`, stdout:""});
  }
  // ... parse response, decide ok:true → outcome:"success", ok:false → outcome:"blocking" ...
} catch(S) {
  if (v(), y.aborted) return {hook:e, outcome:"cancelled"};   // <-- THE TIMEOUT PATH
  throw S;
} catch(u) {
  let d = ue(u);
  return E(`Hooks: Prompt hook error: ${d}`),
         Oer(e, {hookName:t, toolUseID:l, hookEvent:r, stderr:`Error executing prompt hook: ${d}`, stdout:""});
}
```

Three distinct outcomes fall out of this, and **timeout is its own branch, not an alias
for either of the other two**:

| Trigger | `outcome` | Logged as | Behavior |
|---|---|---|---|
| Evaluator returns `ok:false` | `"blocking"` | `"Hooks: Prompt hook condition was not met: ..."` | Blocks the stop (drives the retry loop U1/U3 documented) |
| Evaluator returns `ok:true` | `"success"` | `"Hooks: Prompt hook condition was met: ..."` | Allows the stop |
| Non-timeout execution error (network error, bad JSON, schema mismatch, API error) | (routed through `Oer(...)`) | `"Hooks: Prompt hook error: ..."` / `"Hooks: prompt-hook evaluator API error: ..."` | Distinct error path — **not tested by this probe**, see §6 |
| **Timeout (`AbortSignal` fires)** | **`"cancelled"`** | **nothing** (`y.aborted` short-circuits before any `E(...)` log call) | **[INFERRED, backed by 4/4 live observations]** treated as non-blocking — the evaluated session/subagent proceeds to stop normally |

This exactly matches what was observed: no `"Hooks: Prompt hook error:"` line ever
appeared in any of the 4 timeout runs, because the abort path returns before reaching that
log statement — it's a structurally silent path, distinct from every other error case the
code handles. This project's own docs (`.claude/rules/async-discipline.md` context,
`docs/modernization/probes/U3-loop-bound.md` for the hard-cap path) already established
that this platform has more than one *invisible* path around Stop/SubagentStop hooks; this
is a third one, and empirically a benign one (fails open) rather than a hazardous one.

**Also resolved by this same source line — the default-timeout question (Q4 in the
original ask):** `e.timeout ? e.timeout*1000 : 30000` — **the default timeout for a
`type: "prompt"` hook, when `timeout` is omitted, is 30 seconds** (30000ms). This is
distinct from the sibling `type: "agent"` hook, whose default is documented in the
bundle's own field description (`"Timeout in seconds for agent execution (default 60)"`)
and confirmed in its own source line as `e.timeout?e.timeout*1000:60000` — 60 seconds.
**[BUNDLE]** — extracted directly, not inferred; this is the literal fallback expression
in both functions.

## 5. Per-event comparison — `Stop` vs `SubagentStop`

**[OBSERVED]** identical behavior on both: abort at the configured deadline, `outcome`
distinct from `"blocking"`, evaluated session/subagent proceeds to stop normally, nothing
surfaced to `--print` stdout. **[BUNDLE]** the evaluator function is shared and
parameterized by event name (`r === "Stop" || r === "SubagentStop"` appears directly in
the extracted source for the system-prompt selection logic), so there is no separate
code path per event that could diverge on the timeout branch specifically — the `catch(S)`
block handling `y.aborted` has no event-conditional logic in it at all. Confidence that
this generalizes across the two events is therefore high, not just "two data points
happened to agree."

## 6. What this does NOT establish

- **[NOT OBSERVED]** the non-timeout error path (`"Hooks: Prompt hook error:"` / API
  errors that are NOT aborts — e.g., a 500 from the evaluator's own model call, or a
  malformed JSON response). §6.2's fail-open requirement is about *this* project's own
  hooks, and this probe only characterizes the *platform's* timeout path specifically, per
  the assignment. If DISC-B008 needs the platform's behavior on a genuine evaluator error
  (not a timeout) as well, that is a distinct, narrower follow-up — the source snippet in
  §4 shows that path routes through `Oer(...)` with a populated `stderr`, which reads as
  *plausibly* also non-blocking (same general shape as the timeout path, returning an
  error-carrying object rather than a `"blocking"` outcome), but this was **not verified
  live** and should be labeled **[INFERRED, unverified]** until someone forces it (e.g., by
  configuring an invalid `model` string on the hook) and watches what happens.
- **[NOT OBSERVED]** downstream dispatch code that consumes `outcome:"cancelled"` and maps
  it to the final allow/continue decision the session sees — grep for the exact comparison
  (`outcome==="cancelled"`) did not surface a clean match in the extracted strings (minified
  variable names obscure it), so the "cancelled → allow" conclusion rests on **observed
  behavior** (4/4 runs completed normally) plus the **structural fact** that `"cancelled"`
  is a distinct branch from `"blocking"` in the code that produces it — not on having traced
  the consuming code. Flagging this explicitly per the rigor standard set in prior probes:
  this is INFERRED from strong indirect evidence, not directly OBSERVED at the dispatch
  layer.
- **[NOT OBSERVED]** behavior for `type: "agent"` hooks under timeout — out of scope for
  this ask (which named `type: "prompt"` specifically); the agent-type default (60s, §4)
  was picked up incidentally from the same source region but its timeout-abort behavior
  was not probed.

## 7. Bottom line for DISC-B008 / TRD §6.1.2

**Result: ALLOW, on both `Stop` and `SubagentStop`, with no design changes indicated.**
Per the team lead's own framing, a `block` or `error` result would have required stopping
here and escalating rather than proceeding — that condition did not occur. An evaluator
that is slow (approaching or exceeding its `timeout`) or transiently unreachable behaves
exactly like an evaluator that was never invoked: the turn/subagent-stop proceeds. The one
practical follow-up worth flagging to whoever converts the three hooks: the timeout path is
**silent** (no log, no user-visible signal) — if DISC-B008's hooks want observability into
"how often is my evaluator timing out," that has to be added deliberately (e.g., wrapping
the hook's own `if` condition or `continueOnBlock` logic can't see this; only platform-level
logging control (`--debug`) currently surfaces it), since the platform gives nothing back
on this path by design.

---

## Appendix — cleanup

The throwaway repo `$CLAUDE_JOB_DIR/tmp/u6-probe` (including all `captures/*.log` debug
output) and the scratch `strings -a` dump (`$CLAUDE_JOB_DIR/tmp/strings_full.txt`, ~270MB
of extracted binary text) were deleted after evidence extraction. No files under
`packages/`, `.claude/`, or `test/` in this repository were modified. Only this findings
file was created.
