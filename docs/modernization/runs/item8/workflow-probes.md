# ITR-P003 — Workflow-runtime primitive probe

**Task:** ITR-P003, `docs/TRD/implement-trd-rework.md:657`. Serves AC-F7.3, AC-F7.4, AC-F8.4,
NFR-4, AC-N4, D10, OQ-6, TR1.

**File choice:** sibling file (`workflow-probes.md`), not appended to `sunstone-read.md` —
that file did not exist in this repo at probe time (`docs/modernization/runs/item8/`
contained only `SPEC.md`), so there was nothing to append to.

**Executive result: none of the three questions could be probed as scoped.** The first tool
call made in this investigation returned a decisive, platform-authoritative blocker that
applies to all three, and is itself the load-bearing finding of this task. Recorded below
as Finding 0, then each of (a)/(b)/(c) individually.

---

## Finding 0 — `Workflow` is not callable from this (subagent) context at all

**Probe run:** a literal `Workflow` tool call, minimal throwaway script, no production file
touched:

```
Workflow({
  name: "itr-p003-probe",
  args: {},
  script: "export const meta = { name: 'itr-p003-probe' }; log('probe start');"
})
```

**Raw evidence — the tool's own error, verbatim:**

```
Error: No such tool available: Workflow. Workflow is not available inside subagents.
Complete the task with the tools provided and return findings to the orchestrator.
```

This is not an inference from absence (the mistake v1.0.0 of the TRD made about
`pipeline()`) — it is the platform declining the call with an explicit, on-point reason
string naming the exact mechanism ("not available inside subagents") and telling the caller
what to do instead ("return findings to the orchestrator"). Confirmed independently before
the call: `Workflow` appears in neither this session's base tool list nor `ToolSearch`
(`select:Workflow` → "No matching deferred tools found"; broader keyword searches for
"workflow", "agent parallel phase log", "workflow.js" all missed it too) — consistent with
the error, not contradicting it.

**Corroborating textual evidence already in the TRD** (not new, but consistent with the
probe): `implement-trd-rework.md:1644` — *"Agents spawned inside a `Workflow` script surface
as `tool_use` records in the **lead** session's stream-json"* — the document already
distinguishes "the lead session" as the place `Workflow` activity is observed. The probe
confirms the stronger claim: it isn't just observed there, it can only be **invoked** there.

**Verdict: attested (not inferred).** `Workflow` is a lead/main-session-only tool. A
subagent — including this probing agent itself, and by the same mechanism any subagent
`implement-phase.js` would need to run inside — cannot call it. This was run as this task's
first action, specifically because ITR-P003 asked to run a probe before trusting any
document, and the document's own OQ-2/OQ-6 answers were themselves written by an agent in
an unstated execution context.

**Why this changes the shape of the remaining questions, not just their answer:** (a), (b)
and (c) all presuppose *running a workflow script* to observe `agent()`'s behavior from
inside it. That action is unavailable to me in this session. I have exhausted what is
directly attestable from here and am reporting the negative rather than substituting an
inferred answer, per this task's own instruction ("an honest 'could not attest' is worth
more than an inferred yes").

---

## (a) Can a workflow script's `agent()` name a `subagent_type`?

**Probe run:** the one above (Finding 0) was the only probe available; it failed before
reaching any `agent()` call.

**Raw evidence:** none obtainable from this session. No fallback path exists either —
there is no separate "dry run the contract" tool, and reading the tool's prose description
(the `opts.agentType` doc line the team-lead's brief quotes) is exactly the kind of
document-as-evidence this task was created to stop trusting.

**Verdict: could not attest.** Neither confirmed nor refuted. This must be run from the
lead/main session, not delegated further — delegating to another subagent will hit the
identical blocker (Finding 0 is a property of "subagent," not of which subagent).

## (b) Can a workflow-started agent be a BACKGROUND subagent?

**Probe run:** same as (a) — blocked at the same first step.

**Raw evidence:** none. `audit-trd.js`'s `agent()` calls (`packages/core/workflows/audit-trd.js:288-297`,
already cited in the TRD) show only `{label, phase, effort, model, schema}` in observed
`opts` — but per this task's own framing, that is evidence about this repo's usage, not
about the API, and is the same absence-as-evidence mistake that got `pipeline()` wrong in
v1.0.0. I am not resting the verdict on it.

**Verdict: could not attest.**

## (c) Can an agent started from a workflow invoke the `/code-review` skill?

**Probe run:** same blocker — no workflow could be started to put an agent inside, so there
is nothing to test skill-invocation from.

**Raw evidence:** none from inside a workflow. The team-lead's brief separately reports
`/code-review` is model-startable and fans out to 7 agents when run in the **lead** session
(`.trd-state/discipline-judgment/dispatch.jsonl`, 04:08–04:11) — that measurement stands on
its own but says nothing about invocation from a workflow-started agent, which is the actual
question.

**Verdict: could not attest.**

---

## What §3.4 / D10 / OQ-6 must now say

1. **OQ-6 cannot be resolved by this probe.** Its "default: the workflow" stands *only* as a
   default — TR1's contingency (typed-dispatch negative → OQ-6 resolves to the command by
   force) cannot be triggered either, because no negative was established. The TRD's
   Could Not Verify table should record OQ-2/OQ-6's `subagent_type` and background-spawn
   rows as **still open**, not narrowed to "ITR-P003 probes it" — ITR-P003 ran and returned
   inconclusive, which is a different state and should read differently in the document.

2. **D10's phase-scoped review must keep the foreground-`agent()`-inside-the-phase fallback
   as the operative design**, not as a placeholder pending this probe. AC-F16.7 still holds
   under it (workflow's return is one phase result either way, per D10's own text) — that
   part of the reasoning is unaffected by today's result and needn't be re-litigated.

3. **New, and not previously in the document: who can run this probe at all.**
   `implement-phase.js` (ITR-B008) itself will execute *as a workflow script*, i.e. from
   exactly the calling shape that Finding 0 shows is unprivileged relative to `Workflow`.
   That is expected and fine — a workflow script isn't trying to call `Workflow` on itself.
   But **re-attempting ITR-P003's probe must happen from the lead/main Claude Code session
   directly** (not delegated to any teammate/subagent, including via `/create-trd` or
   another team spawn) or it will reproduce Finding 0 and return nothing new. This is a
   procedural note for whoever re-runs ITR-P003, not a design decision, and should be added
   as a line in ITR-P003's own row so the next attempt doesn't repeat this one.

4. **TR1's risk entry should add a second contingency layer**: even if `agent()` does accept
   `subagent_type` and background spawn, ITR-B008 will need a verification step that can only
   be run from the lead session — meaning ITR-B008's own acceptance criteria (or a follow-up
   probe task) should specify that the phase-gate behavior is confirmed by running the actual
   built `implement-phase.js` from the lead session once, not by trusting a teammate-run
   probe of a throwaway script.

## Confirmation

No production workflow or command was modified. The only artifact touched by this probe is
this findings file; the attempted `Workflow` call failed before any script executed, so no
`.trd-state/*/dispatch.jsonl` entry, `wf_*.json` run record, or subagent of any kind was
created by it. Checked: `find .trd-state -iname dispatch.jsonl` shows only pre-existing
ledgers (`discipline-judgment`, `implement-trd-rework`, `runtime-refresh`), none touched by
this session; no `~/.claude/projects/*/workflows/` directory exists for this probe (workflow
run records are written by the runtime that executes the script, and no script executed).
