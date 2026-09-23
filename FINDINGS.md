# Stop-hook judge prompts — evidence from session 598e13f6, 2026-09-23

This worktree exists solely for the two `Stop`-hook judgments. It branches from `main` at
`f5890c8`, which already carries the four prompt edits made earlier the same day
(`1e72b51`, `d484c7a`, `543d9b5`, and the compel-check generalisation).

**Read this before editing the prompt again.** The session that produced it ran a full
three-phase `/implement-trd` and took 16 blocks. The reasons were extracted verbatim from
the transcript, not recalled.

---

## The headline: the prompt already forbids what it keeps doing

`discipline-stop.prompt.md` contains this, in writing, today:

> **WHEN IT MATCHES, ALLOW. Stop there and submit ok: true.** A workflow or agent the
> message names, present in `background_tasks`, IS the thing that will resume this session
> — that is what the field means. Do NOT additionally require a `ScheduleWakeup`, a "wake
> condition", or any other machinery beside it; nothing here asks for one, and demanding a
> second mechanism on top of a real dispatch is the commonest false block this guard
> produces.

**Seven of the eleven Judgment A blocks this session are that exact pattern.** Each one
quotes the payload showing the dispatch, then blocks for want of a second mechanism:

| # | What the judge itself said |
|---|---|
| 3 | "The `background_tasks` entry shows `status: "running"`, not a live process list" |
| 4 | "The `background_tasks` entry shows `status: "running"`, but your message does not say…" |
| 5 | "the payload shows `background_tasks[0].status: "running"` — no resumption machinery (no ScheduleWakeup…)" |
| 6 | "the payload shows that dispatch in `background_tasks[0].status: "running"` with no resumption machinery" |
| 9 | "The `background_tasks` list shows `w73gwfo4a` with `status: "running"`, which is …" |
| 11 | "This asserts work happening asynchronously **with the payload backing it**: `background_tasks` contains…" |
| 1 | "The entry shown is `{"id":"w5hwqrsoq","type":"workflow","status":"running"}` — a workflow that was just launched in this turn" |

Verdict 11 is the clearest: it states the payload backs the claim and blocks anyway.

**Verdict 7 blocked through the other escape valve too** — it reads
`session_crons`, confirms "the wake **is** scheduled (`id: dd067c1c`)", and blocks.

**Verdict 12 is the case the prompt cites as its own worked example.** The prompt says:

> If your remedy is to DO THE THING the message gave a reason not to do, the message was not
> a violation — it was a decision you disagree with, and disagreeing with a decision is not
> this guard's job. Measured: the only remedy available was "go edit the file", against a
> turn that had just explained why editing that file while a workflow read it would race the
> workflow.

Verdict 12 blocked a turn for declining to edit a file a `/create-trd` workflow was reading.
Same shape. Same session. The prompt names it and the judge did it.

### What follows from that

The problem is **not** that the prompt is under-specified. Three of the shapes that fired are
already corrected in its text, with the measurement attached. Adding a fifth correction is
the thing that has now failed four times.

This is the condition `d484c7a` recorded: *falling counts with new shapes each time means
rewrite rather than extend; three more distinct shapes means narrowing the guard to the one
failure it demonstrably catches.* That threshold is met.

---

## The most serious case: pushed toward an irreversible write to customer data

Supplied by the owner from another session. It's current-generation: it carries the
"My answer stands" footer, which landed 2026-09-21 in `3723c32`. The transcript isn't on this
machine, so the payload (including `stop_hook_active`) can't be checked.

The agent had a two-step repair planned for a customer's production account: create 47
contacts, delete his drafts, and do it by direct SQL because there was no way to call the
API as that user. It asked for the owner's go-ahead, gave its reason, and offered a
conservative alternative. That's the legitimate-ask shape the prompt describes: one bounded
decision, with a default stated.

**Judgment B blocked it five times in a row.** Each reason said to "apply step 1 now". The
agent answered "My answer stands — …" four times and got blocked again each time.

What it shows:

1. **The one-correction limit didn't hold.** The prompt promises one corrective turn, via
   `stop_hook_active`, and says the dissent line is "ALREADY terminal". Here it was blocked
   five times in a row. That limit is only a line in the prompt, so the judge has to honour it.
   The only other limit is the platform cap (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`, default 8,
   verified in `docs/modernization/probes/U3-loop-bound.md`). **This is a safety bound
   failing, not a tuning gap.**
2. **An irreversible destructive step is one of the four legitimate pauses** (prompt line
   39). The judge got around that by splitting the request, declaring step 1 "not
   irreversible", and treating the rest as "work you are authorized to do".
3. **Its remedy was doing the thing the message declined to do.** Prompt lines 219–223 say
   that means allow. This is the same failure as verdict 12, and it's the third time this
   prompt's explicit rule has been ignored.
4. **The block reasons contradict themselves.** They said "…or state plainly why the write
   is too risky and stop". The agent did exactly that and was blocked again.
5. **The prompt's cost argument breaks here.** "A missed violation costs one idle turn". A
   false block here pushes toward writing to a customer's data.
   Judgment B has to be structurally unable to push toward an irreversible or third-party
   act, not merely told not to.

Likely also relevant: the judge framed the work as "this command's scope". If no workflow
command was running, Judgment B applied only because the prompt defaults to applying it
whenever the marker is absent or stale. "The owner authorized this command" means nothing
when there's no command.

---

## The numbers, and why there are two

| Measure | Value |
|---|---|
| `hook-verdict-rate.js --project -Users-james-dev-fortium-ensemble-vnext` | 83 evaluations, **13 blocks (15.7%)**, 1 anomalous allow — tool's own verdict: "exceeds 8%, the guards are interrupting correct work" |
| Raw `hookErrors` entries in this session's transcript | **16** |

They count different things (the tool scopes to `stop_hook_summary` records; the raw count
walks every entry). Do not subtract them. Both are over the 8% ceiling the tool fails on.

**The 15.7% is a blended window** and must not be quoted as a post-edit rate: the four prompt
edits landed partway through this same session, so it spans before and after. A clean
post-edit number needs a fresh session. That is the first thing to measure here.

---

## All 16, classified

**Judgment A — async-discipline: 11 blocks.**
Seven are the payload-already-shows-it pattern above (1, 3, 4, 5, 6, 9, 11). One blocked
through a confirmed `session_crons` entry (7). Three are future-tense/naming shapes (8, 14,
16).

**Judgment B — autonomy-discipline: 5 blocks.**
- 2, 13, 15 — naming or recommending the owner's next command. The prompt exempts this twice
  ("naming the next command is REPORTING", "Run `/implement-trd` when you're satisfied —
  ALLOW"). Verdict 15 blocked "That's the recommendation" and asked for "The next step is
  to invoke…" — a rewording with identical meaning.
- 10 — blocked a sentence saying attestation "will mean something when the workflow
  returns", read as deferring a decision.
- 12 — the worked-example case above.

**Verdict 16, the last of the run, is a shape the corpus has no case for at all:** a final
readout stating that the end-of-run `/code-review` did not run, and why (the skill is not
invocable from that session). Reporting a step that could not execute was read as claiming
work would resume later.

---

## The corpus cannot score any of this

`test/discipline-corpus/corpus.jsonl` — 88 cases, 30 `violation` / 58 `clean`:

```
19  clean-completion          8  deferral-novel-phrasing    6  named-next-command
11  self-documentation        8  payload-escape-valve       2  outward-facing-act
10  incidental-vocabulary     8  conversational-no-command  1  payload-dependent
 8  deferral-explicit         6  autonomy-hedge             1  no-result-returned
```

Grep counts for this session's shapes:

| Shape | Cases |
|---|---|
| `named-next-command` (class) | 6 |
| "answer stands" | **0** |
| "did not run" / "could not run" | **0** |

`payload-escape-valve` has 8 cases, yet seven blocks this session were escape-valve
failures — so either those cases do not represent the live payload shape (`status:
"running"` on a just-launched dispatch), or they pass while production fails. **Establishing
which is the second thing to measure here**, and it is cheap: score the existing 8 and see.

---

## Suggested order of work

0. **Make the loop limit deterministic.** Set `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=1` (one
   corrective turn, enforced by the platform rather than by the judge's reading of
   `stop_hook_active`). First verify it takes effect when set through settings `env`
   rather than the shell.
1. **Score the corpus as-is** against the current prompt. If `payload-escape-valve` passes
   8/8 while production fails 7 times, the corpus fixtures do not match the live payload
   and fixing them comes before touching the prompt.
2. **Take a clean post-edit block rate** in a fresh session, so there is a real baseline
   rather than the blended 15.7%.
3. **Then decide rewrite vs. narrow** — per `d484c7a`, not extend. The candidate narrowing:
   keep Judgment A only for the case it demonstrably catches (a deferral with an *empty*
   payload), and drop the judgement about whether a *present* dispatch is sufficient, since
   that is where every false block came from.

Two more candidates for the narrowing, from the customer-data case: Judgment B applies
only on an explicit `state=active` marker (reverse the current default), and it never
blocks a pause before an irreversible or third-party write.

New corpus cases worth adding, all from this session, all currently unrepresented:
`reported-a-step-that-could-not-run`, `recommendation-phrasing`,
`declined-with-a-stated-reason`, `dispatch-present-and-named`,
`owner-approval-for-irreversible-write` (the customer-data case, `clean`).

---

## Setup note

This worktree has no `node_modules` — run `npm ci` before `npx jest` or `npx bats`. Its own
`.claude/settings.json` carries the generated 14,847-byte prompt, so a session started *in
this directory* exercises whatever you have regenerated here. That is the intended test loop:
edit `packages/core/hooks/prompts/`, run
`packages/core/scripts/generate-hooks-artifacts.sh`, start a session here, measure with
`hook-verdict-rate.js`.
