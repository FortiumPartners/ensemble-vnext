---
name: amend
version: 1.0.0
description: One change, in words, against the feature already in flight — grounded, recorded, verified, without a new TRD
argument-hint: "<what to change>"
---

> **Usage:** `/amend <what to change>` — plain language, about the feature you are already on.
>
> **Examples:**
> `/amend the retry backoff should be exponential, not fixed — src/queue.ts`
> `/amend roundMoney truncates; it should round to nearest cent`

---

## It ACTS. There is no flag.

`/amend` makes the change: it grounds, records, implements, verifies. No `--implement`, no
plan-then-stop mode, no confirmation step.

**This is the opposite default to `/plan`, deliberately, and the difference is what
you already know.** `/plan` stops after writing its TRD because you are asking it to
find something out — *"I want to understand an issue, I may or may not want to kick off the
fix."* `/amend` starts from the answer: you are telling it what to change. There is nothing
to decide afterwards, so pausing to ask would be the hedged-offer anti-pattern with extra
steps.

If you want the change understood rather than made, that is `/plan` — which is also
the right call when the correct behaviour is still a question rather than an instruction.

## What this is for

**The middle weight.** Between `/implement-trd --reconcile`, which re-attests the whole
feature and runs the phase loop, and raw "fix this" prompting — which this framework names as
its commonest source of bad code, because an unplanned edit is grounded in nothing and
recorded nowhere.

`/amend` is one change, done with the parts of the discipline that matter at this size:

| | `/amend` | `--reconcile` | raw prompting |
|---|---|---|---|
| grounded in the code first | yes | yes | no |
| recorded in the TRD | yes, one row | yes | no |
| success attested against disk | yes | yes | no |
| new TRD / PRD / audit wave | no | no | no |
| phase graph, review fan-out | **no** | yes | no |

**It requires a feature in flight.** With nothing in `.trd-state/current.json` there is no
document to amend — that is `/plan`. Say so and stop.

## Step 1: Is this one task?

Read the instruction and the code it names. Then ask one question: **is this a single
change?**

Signals it is NOT, any one of which is enough:
- it needs a decision nobody has made (the correct behaviour is a product call)
- **part of it must be done before another part** — ordering means more than one task, and
  ordering is what the phase graph exists for; this command has none
- **it needs more than one specialism** — this command dispatches ONE implementer, so work
  that genuinely wants a frontend and a backend agent is two tasks wearing one description
- it is really several changes described together

**File count is deliberately NOT a signal, and a "~3 files" one was removed on 2026-09-26.**
It was unsourced — the commit that introduced this command justified *having* a size signal by
citing a real failure (*"a 2-task fix absorbed an audit's findings, sized 4, and escalated"*),
which is about TASK count; nothing ever justified three, or files.

It also gave a wrong answer the first time it fired in anger. A twelve-file amendment that was
one identical edit in twelve places — no ordering, one specialism — was refused, while two
files of intertwined logic would have passed. Breadth is a poor proxy for coupling, and
coupling is the thing that actually decides whether this is one task.

Worse, it was structurally unusable here: every runtime file in this repository exists twice,
as `packages/core/<x>` and its vendored `.claude/<x>` mirror, which the parity test REQUIRES be
edited together. Three physical files meant at most ONE logical file.

**What this command drops is the phase graph and the review fan-out — and neither scales with
file count.** The wave partition and file-conflict serialization are vacuous for a single task;
`verify-app` and the end-of-run review matter by RISK, not breadth. So the question is never
"how many files", it is "does this need ordering, a second specialism, or a decision nobody has
made". The row lands in the TRD either way, where `--reconcile` re-attests it and
`/audit-build` traces it — the durable record is identical.

**If it is not one task, stop and say which signal fired**, and point at the heavier path:
`/implement-trd --reconcile` after adding it to the TRD, or `/plan` if it belongs to a
different feature entirely. Growing a one-line amendment into a feature is the failure this
step exists to prevent — the same inflation `/plan` §2f guards against, where a 2-task
fix absorbed an audit's findings, sized 4, and escalated.

## Step 2: Ground it

For the files this will touch: what they do now, what this **replaces** and must therefore
delete, and the local conventions to follow. Mark each claim `[ran]` / `[read]` /
`[inferred]`.

**This is the step raw prompting skips, and the reason it produces bad code.** An ungrounded
edit reimplements something that already exists, or deletes a guard whose purpose it never
read.

## Step 3: Record it BEFORE doing it

Write one row into the TRD's Master Task List, id `AMEND-<nnn>`:

```
| AMEND-007 | <what changes, in a sentence> — amendment, <date> | amendment | | | <what proves it> |
```

**Before, not after.** A crash mid-change then leaves a record of what was being attempted,
and the next `--reconcile` picks it up rather than losing it. The `AMEND-` prefix makes it
visible that this was not part of the architect's plan.

Also record it as a discovery so the feature's ledger is complete:

```bash
node -e 'require("./.claude/lib/discovered").record(".trd-state/<feature>",
  {kind:"gap", foundBy:"/amend", summary:"<one line>", blocksFeature:true})'
```

## Step 4: Do it

Dispatch ONE implementer with an explicit `agentType` — `backend-implementer`,
`frontend-implementer`, `mobile-implementer` or `agent-implementer`, chosen by
`lib/agent-routing.js`'s table.

**Never leave `agentType` unset.** Unset does not mean "no agent" — it means the generic
subagent, which inherits the session model, so ordinary work runs on Opus at roughly five
times the price of the Sonnet implementer that should take it. Measured, and it is silent:
it shows up as a cost line, never an error.

## Step 5: Verify, and attest

Run the project's check battery — the same one the phase gate resolves. Then record the
result through `implement-state`, which checks the claim against disk:

```bash
node -e '
  const { load, save, recordResult } = require("./.claude/lib/implement-state");
  const fs = require("fs");
  const p = ".trd-state/<feature>/implement.json";

  // /amend writes the row into the TRD, not into implement.json — nothing else creates the
  // task entry, and recordResult() THROWS on an unknown id. /amend also runs on features
  // where /implement-trd never ran at all, so load() can throw ENOENT. Both are ordinary
  // here, not errors: seed what is missing before attesting.
  const s = fs.existsSync(p)
    ? load(p)
    : { version: 1, trd_file: "<trd>", phase_cursor: 1, tasks: {} };
  if (!s.tasks["AMEND-007"]) {
    s.tasks["AMEND-007"] = { status: "pending", cycle_position: "implement", retry_count: 0 };
  }

  recordResult(s, "AMEND-007", {
    status: "success",
    filesChanged: [ /* real paths — files that now exist */ ],
    filesDeleted: [ /* real paths — files this amendment REMOVED */ ],
  });
  save(p, s);
  console.log(s.tasks["AMEND-007"].status, s.tasks["AMEND-007"].current_problem || "");
'
```

**Read the status back and believe it, not your own report.** A success claim naming files
that do not exist is failed automatically — that check exists because four tasks once sat in
a state file as `success` with no code behind them. If it comes back `failed`, the amendment
is not done; fix it and re-attest.

**Work that REMOVED files goes in `filesDeleted`, never `filesChanged`.** Deletions are
attested by absence; listing removed paths as changed fails the check on correct work.

## Readout

**Format: the four-section readout in `.claude/rules/command-status.md`** — STATE, DECISIONS,
ISSUES, NEXT, one screen, written for someone who was not in the session.

STATE names the files that changed and whether the battery is green. DECISIONS names anything
chosen that the instruction did not specify. ISSUES names what is still wrong. NEXT is usually
"nothing — this is done", and says so rather than inventing follow-up work.

Then the banner, as the last line:

```
═══ COMMAND COMPLETE: /amend ═══
<what changed, in one sentence>
```

## Completion signal

| step | what |
|---|---|
| `notify` | run `.claude/hooks/notify-complete.sh "amend" "complete" "<summary>"` |

Silent no-op when `$NOTIFY_ON_COMPLETE` is unset — zero cost when not configured.

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

This command runs **autonomously** from invocation to its final banner. Do NOT pause to ask
the user to confirm decisions, review artifacts, or verify checkpoints.

`AskUserQuestion` is permitted ONLY for: genuine requirement ambiguity with no default;
information that cannot be derived; a truly irreversible destructive operation; or a STUCK
condition after retries.

**In this command that narrows to exactly one:** the correct behaviour is a product call
nobody has made, which is also the Step 1 signal that this is not one task. Everything else —
which files, which implementer, how to verify — is decided from evidence and proceeded on.

Forbidden:
- "Should I proceed?" / "Please review before I continue." → no. Decide and continue.
- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- **The declarative forms are the same move and are the ones that slip past**: "I can
  also fix X if you want", "say the word and I'll handle the rest", "that's available
  whenever". None is a question; each hands the decision back identically.

Naming the next command when this one is DONE is reporting, not deferring — and for `/amend`
the honest next step is usually nothing at all.

## What this command must not do

- **Grow.** If the work turns out larger mid-flight, record a discovery and STOP. Report it.
  Do not absorb the extra scope — that is how a fix becomes a feature.
- **Chain.** It does not call `/implement-trd`, `/audit-build` or anything else. One change,
  one run.
- **Invent verification.** If the change has no checkable outcome, say so in ISSUES rather
  than writing a test that asserts the implementation back to itself.
