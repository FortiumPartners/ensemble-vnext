---
name: plan
description: Investigate a defect, change, or refactor and route it to the pipeline its weight earns — a light TRD, a phased TRD, or a PRD when the intent isn't settled. Stops there unless --implement is passed.
version: 1.0.0
argument-hint: "[description | source path | issue ref] [--implement]"
category: implementation
# Expensive, and its description matches how a user would phrase the task —
# so it must not be picked up by description match. Scope authorization is autonomy.md's job, not this flag's.
disable-model-invocation: true
---

> **Usage:** `/plan <what>` — or bare `/plan` to write up something decided in this
> conversation.
>
> **It investigates, decides how much verification the work earns, and STOPS.** Depending on
> that you get a light TRD or a fully authored and audited one. Building it is a separate,
> explicit request: pass `--implement`, or run `/implement-trd` on the TRD yourself.
>
> **Arguments:**
> - `<description>` — a sentence: `/plan the 500 on /api/session when the token expires`
> - `<source>` — a bug report, Jam link, GH issue ref, stack trace, log excerpt. **Prefer
>   this**: a written report already carries steps, environment and actual-vs-expected.
> - *(bare)* — read this conversation for a decided change
> - `--implement` — after the last stage the work earns, chain into `/implement-trd
>   --verify`. Honoured at every weight — this flag alone decides whether work begins; see
>   "Implement, or stop", below.

---

## User Input

```text
$ARGUMENTS
```

---

## What this command is for

**Work where the full `/create-prd → /audit-prd → /create-trd → /audit-trd → /implement-trd`
pipeline is overkill relative to the complexity and risk of what you are doing** — and where
the alternative would otherwise be straight prompting and editing. And work whose scope turns
out, once investigated, to earn that full pipeline anyway: this command routes there too,
rather than stopping short of it.

The gate is **proportion, not category**. Three kinds qualify:

| Kind | Example | What success means |
|---|---|---|
| **defect** | the export returns an empty file across month boundaries | the reproduction no longer reproduces |
| **change** | move the export button to the header; fix copy; a contained backend tweak | the stated outcome holds |
| **refactor** | extract a helper; collapse a duplicated branch; rename through a module | **behaviour is unchanged** — the existing tests pass before AND after |

**Say which kind it is.** It changes which axis the investigation below scores, because a
refactor has no root cause to demonstrate and nothing to reproduce, while its test coverage
matters more than for either of the others.

**It exists because the alternative is chatting and editing**, which is this framework's
commonest source of bad code. And because the full
`/create-prd → /audit-prd → /create-trd → /audit-trd → /implement-trd` path is half an hour
of ceremony for a two-line fix.

**Short-circuiting the PRD here is correct, not a compromise — when the PRD would add
nothing.** A PRD supplies provenance for objectives — what to build and why. For a defect that
question is already answered: the spec exists and is being violated. For a small change,
**your instruction is the source**, which `/create-trd`'s typing rule already admits as valid
provenance. So every objective traces to the reproduction or to you, and nothing is invented.

**What this command is NOT for:** anything where the correct behaviour is still a product
decision. The exit test, below, detects that and sends you to `/create-prd`.

---

## Step 1: Establish the subject

**Strip the flags from the argument first.** `--implement` is not part of the subject.
`/plan the login copy is wrong --implement` has the subject *"the login copy is wrong"*;
leaving the flag in puts it into the stated subject line and into the TRD's slug.

| Input (after flag-stripping) | Subject from |
|---|---|
| a sentence or source | the argument |
| nothing left | this conversation |

**Bare invocation states its subject back, then proceeds.** First line of output:

```
SPECCING: <one line>
   from: <which turn, quoted briefly>
```

This is a correction point, not a checkpoint — do not stop for confirmation. Blocking here
would also make unattended use impossible.

**Two tests decide whether the warm path may proceed — a COUNT test and a QUALITY test.**
Either one failing means ask (`autonomy.md` case 2 — information that cannot be derived):

| Conversation holds | Do |
|---|---|
| exactly one subject, stated in checkable terms | state it back and PROCEED |
| more than one candidate subject | **ASK** which |
| no subject stated in checkable terms — vague, hedged, or withdrawn | **ASK** what to spec |

**The quality test is not redundant with the count test, and omitting it was a real defect**
(found by a blind test 2026-08-23, fixed here). The rule used to key only on "more than one",
so a conversation containing exactly one *unusable* subject sailed through. The measured case:

```
User: the dashboard feels sluggish
User: I dunno, it just doesn't feel as snappy as it used to. Maybe it's fine.
User: hmm. anyway
User: /plan
```

One candidate, so the count test passed, and `/plan` would have specced a problem the user had
just **withdrawn**. Later stages would have caught it — a non-reproducible defect stops before
it is ever sized, and an investigation producing zero checkable criteria caps how much work is
worth doing — but only after a full investigation, and the artifact would still be a
plausible-looking TRD for a non-problem.

**Ambiguity resolves to asking, never to guessing.** Assembling a TRD out of loosely related
discussion produces something that *looks* well-founded and addresses a problem nobody
raised — the manufactured-requirement failure arriving through a new door. "Specific enough
to name in one line" is the bar: a defect, a file, a behaviour. *"It feels slow"* is not a
subject; it is the start of a conversation that has not happened yet.

### 1.1 Cheap pre-triage — reject the obviously-large before investigating

Read the subject only. If it is plainly not work this command should shape at all — no
description, no source, nothing checkable even after asking — stop now:

```
═══ COMMAND COMPLETE: /plan ═══
No checkable subject: <why>. Narrow the ask to one behaviour and re-run.
```

**This gate may only REJECT on a genuinely empty or unstated subject, never on size.** Size is
what the weight decision (Step 4) exists to answer, and you cannot weigh what you have not
root-caused (Step 2). A subject that turns out to be large is not rejected here — it is
investigated, then routed to whichever pipeline its content and scope earn.

---

## Step 2: Investigate

**Do this in full. Skipping it is what turns a small fix into a symptom patch.** Depth varies
by input; rigour does not.

### 2a. Defect

1. **Reproduce it.** Run the steps. Record what actually happens.
2. **Find the mechanism** — the line or interaction that causes it, not the line where the
   error surfaces.
3. Mark the root cause `[ran]` when the repro isolated it, `[inferred]` when you reasoned it
   out from reading. **This marker informs the weight decision in Step 4 — do not inflate it.**

**If it will not reproduce, say so and write the TRD anyway, flagged.** A defect that cannot
be reproduced cannot be verified fixed — record that plainly in `## Could Not Verify` and let
the weight decision (Step 4) and the reader account for it. Absorb it into how the fix is
written, not into whether one gets written.

### 2b. Small change

No reproduction exists. Instead confirm the **current** behaviour, so the TRD states a real
before-and-after rather than an assumed one.

### 2c. Refactor

There is no defect and no new outcome — the claim is that **behaviour is identical and the
structure is better**. So the investigation is different in kind:

1. **Establish the behaviour that must survive.** Find the tests that cover the code you are
   about to move, and RUN them. Record that they pass, now, before you touch anything.
2. **If there are no such tests, record that and CONTINUE — do not abort.** Write
   `covered: false` in the TRD and let the weight decision account for it: nothing would
   witness that behaviour was preserved, which argues for the heavier weight rather than the
   lighter one. You still produce the TRD and the report; the reader then decides.

   Writing tests first is a legitimate separate `/plan` — and as a `change`, where adding
   coverage satisfies its own concern — and it is a better one than refactoring blind.
3. **Name what the refactor must NOT change** — the public surface, the call signature, the
   observable output. That goes in Non-Goals, and — at `medium` — in `## Behaviour Preserved`
   (§3.3, below).

`/implement-trd`'s `refactor` strategy already encodes the rule: *tests pass before AND after*.

### 2d. From conversation

Extract the decision reached — then **re-ground it against the code**. The corpus states
intent; the code states fact. A discussion records what was decided, not what exists, and
writing it up without re-grounding enshrines whatever was assumed mid-conversation.

### 2e. Ground the fix (all paths)

For every file the fix will touch, establish: what it does now, what to reuse, what this
**replaces** (and must therefore delete), local conventions to follow, and what is risky
nearby. Mark each claim `[ran]` / `[read]` / `[inferred]`.

**This is the highest-value part of the command.** Ungrounded tasks are where invented code
comes from.

### 2f. A blocker sitting IN THE PATH of the fix is part of the fix

**Absorb it. Do not bounce the user to another `/plan` for it.**

When the investigation turns up a defect that must be repaired before the requested work is
possible — a broken path the fix depends on, a dangling reference, a red test that would mask
the result — that defect is **in scope**. Add a task for it, list it in `touches`, and weigh
the whole thing. One invocation, one artifact, one run.

**Why this rule exists.** Measured 2026-08-25: a request for a `/rebase-project` smoke scenario
turned up three defects in that command's own path. The run escalated and handed back a list of
follow-up invocations — one per blocker. That is precisely the chat-and-edit loop this command
replaces, with extra ceremony: the user asked for one thing and received homework.

**The test is dependency, not tidiness.** Absorb what the requested work cannot proceed
without. Do NOT absorb every defect the investigation happens to notice — an unrelated bug
found while reading a file is a finding to report, not scope to claim. If the requested work
would succeed with the defect still present, it is not in the path.

**Answer the counterfactual PER ITEM, in writing.** For each candidate, one line in the TRD's
`## Decision`:

```
absorbed:     withDeadline has no timeout — the watchdog cannot work without it  [BLOCKS]
not absorbed: transport timeout at hyperProvider:447 — separate fix, this one works without it
not absorbed: test-file mock cleanup — tidiness
```

The test is a counterfactual and it has a yes/no answer: **would the requested work succeed
with this defect still present?** Yes → it is a finding to report, not scope to claim. The rule
stated this already; what it lacked was a per-item answer someone can check. A list like the
one above makes an inflated scope visible before it reaches Step 4's weight decision.

#### An AUDIT FINDING is a correction, not new scope

**This is where the rule was actually failing.** The paragraph above governs what the
INVESTIGATION turns up (Step 2). A separate question is what to do with what the audit stage
turns up, for the weight that has one — so the absorb instinct must not get generalised to
audit findings, which are a different thing entirely.

An audit finding usually says *the fix you designed is wrong in this way*. That changes the
fix; it does not add work beside it. Run the same counterfactual: a finding that alters HOW the
existing tasks are written is a correction, and the task count does not move. A finding that
names a DIFFERENT defect is a separate fix, however true it is.

Measured 2026-08-29 in `lightning-lane-beta-phase2`: an audit returned four corrections. Two
changed how the fix was written; one named a different defect that in fact **superseded** the
fix; one was a test cleanup. All four were absorbed. The work went 2 tasks / 4 files —
comfortably light — to 4 / 6, and needed a heavier weight than it should have. The run's own
post-mortem: *"the extra weight was my construction, not the defect's size... I fed the
decision inflated numbers. Then I reported my own inflation as the command's verdict."*

#### Re-weighing after absorbing scope: weigh the FIX, not the conversation

What Step 4 weighs is **the fix as it will be implemented** — never the union of everything
discussed. Before re-weighing, re-read the absorbed list above: every entry must carry
`[BLOCKS]`.

**If absorbing scope pushes the weight up, suspect the inputs before the work.** Ask what the
ORIGINAL fix weighs on its own. If that is light and the bundle is not, the bundle is the
problem — strip it back to what blocks the fix, report the rest as findings, and weigh again.
A heavier weight earned by absorbed scope is self-inflicted, and reporting it as the command's
verdict tells the owner their small fix was too big when it never was.

**When absorbing changes the shape of the work, say so once, in the TRD's `## Decision`, and
continue.** It is not a checkpoint.

**Answering "no" to the exit test (Step 3) is not the way out of an absorbed blocker.** That
question asks whether a PRD would hold content a TRD would not — not whether you are simply
unsure yet. A blocker whose correct behaviour is discoverable by reading the code or the
environment answers "no" to the exit test, with an extra task. Routing a merely-unfamiliar
blocker to `/create-prd` sends a knowable defect somewhere it was never a product decision.

---

## Step 3: The exit test — would a PRD have content the TRD would not?

**Now — after the investigation, before deciding how much verification the work earns.** One
question, asked in prose, answered in writing:

> Would the PRD contain anything the TRD would not — personas, user value, trade-offs about
> *what* to build? If it would restate the TRD's intent, it is ceremony.

**Record the answer as a sentence, not a score.** Task count and touched-file count are not
consulted, and there is no ceiling to consult them against. An open question is explicitly
**not** an answer of yes — *"there is an open question"* is not the same claim as *"nobody has
decided what we are building"*, and the call below cannot see your open questions to be
tempted by them.

```bash
node -e '
  const { route } = require("./.claude/lib/plan-weight");
  console.log(route({ prdWouldHaveContent: false }));
'
```

Pass `true` only when the sentence you just wrote says so. The lib takes that one boolean and
nothing else — no count of any kind — which is what makes "the sizing ceiling no longer
participates in this decision" a structural fact rather than a promise kept by convention.

**If `route()` returns `'plan'`, continue to Step 4.**

### Route: `'prd'` — the feature exit

When `route()` returns `'prd'`, this command does not write a light TRD. It captures the
investigation in a durable investigation record and hands off to `/create-prd`, and the run's
single banner belongs to whichever command ends it — never both.

#### Write the investigation record first

Before calling anything, write `docs/plan/<slug>.investigation.md` — §3.4's format, with
`**Weight**` omitted (no weight was ever decided on this route) and `**Route**: prd`:

```markdown
# Investigation: <slug>

**Kind**: <defect | change | refactor>
**Route**: prd

## Objectives
| ID | Objective | Source |
|----|-----------|--------|
| O1 | <what must be true> | the reproduction below / your instruction, <date> |

## Reproduction | ## Intended Change | ## Behaviour Preserved
<whichever the kind calls for — Step 2's findings, not a summary of them>

## Decision
<the approach chosen; and why an alternative was rejected, if one was>

## Grounding
<per file: what it does now, what to reuse, what this replaces, conventions, hazards>
<each claim marked [ran] / [read] / [inferred]>

## Open Questions
<the table from §3.3, or "none">
```

It must exist on disk **before** the workflow call below — `create-trd.js`'s own sibling hard-
fails with no source, and a run that dies mid-call must not have lost the investigation.

#### Ask the lib, then dispatch what it names

```bash
node -e '
  const { plan } = require("./.claude/lib/fix-plan");
  console.log(JSON.stringify(plan({ weight: "trivial", route: "prd", kind: "<kind>", slug: "<slug>" }), null, 2));
'
```

`weight` is a required parameter of `plan()` but plays no part in this branch's output — pass
any valid value (`"trivial"` is fine; no weight is ever decided at `route:'prd'`). **Read
`chainSkill` from the result and dispatch on it; do not decide independently that the next
call is `create-prd`.** This is the same decide/execute split that already governs the
implement chain (`fix-plan.js:93-111` decides, this command performs) — one path, two halves.

For `route:'prd'`, `plan()` returns `chainSkill: 'create-prd'` with `chainArgs` set to the
investigation record's own path. `create-prd.md` carries `disable-model-invocation: true` —
this project's own PRD defines that flag as *"skill can only be invoked manually via
`/skill-name`"* — so a `Skill({skill: "create-prd"})` call is exactly what the flag exists to
refuse. This one dispatch, alone among this command's chains, goes through the **workflow**
instead, matching D5's convention for `create-trd` and `audit-trd`:

```
Workflow({ name: "create-prd", args: {
  source: "<chainArgs — the investigation record's path>",
  brief: "",
  prd: "docs/PRD/<slug>.md",
  feature: "<slug>",
  project: "<PROJECT_ROOT, or '' for this repo>",
} })
```

#### Skip the session-fidelity pass — a source document already exists

`/create-prd`'s own final step runs a forked session-fidelity check, but only *"whenever the
PRD was sourced from this session (no verbatim source document). Skip it when a source
document exists"* — because a file is a complete record and a conversation is not, and
`/audit-prd`'s `source-fidelity` verifier already checks the PRD against exactly that file.
The investigation record just written **is** that source document, so this run meets
`/create-prd`'s own skip condition on its own terms. State this in the readout rather than
running a check nothing asked for and `/audit-prd` will repeat against the same file.

#### This is the one chain that emits its own terminator

Calling the **workflow** rather than the **command** means nothing downstream prints a banner
— D5's rule (*workflows emit no banner; commands do*) applies here exactly as it does to
`create-trd` and `audit-trd`. So this is the one chain in this command where `plan()`'s
`banner: null` does not mean "say nothing": D8 states plainly that `/plan` "owns... the
readout" for this exit and "emits the run's single banner itself," precisely because the run
genuinely ends inside this turn — nothing further is dispatched. Print the four-section
readout first — **NEXT** names `/audit-prd docs/PRD/<slug>.md`, and **STATE** says the PRD is
**unverified** until that runs — then:

```
═══ COMMAND COMPLETE: /plan ═══
<slug>: investigation captured, PRD authored at docs/PRD/<slug>.md (unverified — run /audit-prd)
```

```bash
.claude/hooks/notify-complete.sh "plan" "complete" "<slug>: PRD authored, unverified — run /audit-prd"
```

Both the banner and the completion signal fire here, same as any other path that genuinely
terminates in this command — `plan()`'s own literal `banner: null` / `notify: false` on this
branch describe the OLD mechanism (`Skill({skill:"create-prd"})` invoking the command itself,
which would have printed its own terminator); they were not revisited when F6 moved the
dispatch to the workflow, which prints none. Recorded via the discovered-work channel below
rather than silently worked around.

---

## Step 4: Decide the weight

**`weight` is `trivial`, `small`, or `medium` — decided by this command from the investigation,
never by a flag.** There is no `--weight` override: the whole point is that weight is a
consequence of what Step 2 found, not an input the caller supplies.

This is a judgment call, the same kind Step 3's exit test is — there is no formula and no
task-or-file ceiling to consult (that ceiling is retired, not raised). Rough shape, for
calibration rather than as a gate:

| Weight | Roughly | Earns |
|---|---|---|
| `trivial` | a one-line or one-file fix; the approach is not in question | a light TRD, straight to implement |
| `small` | more than a one-liner, still a contained fix with one obvious approach | the same, plus a second pair of eyes before implementing |
| `medium` | a settled body of work that would naturally span several tasks — a dozen or more is typical — but carries no open product decision | full authoring, grounding and an audit, the way any other feature gets them |

**If you are unsure between two weights, the tie-break is what the extra stage would actually
buy.** Picking the lighter weight when you are confident the heavier one's stages would find
nothing new is the right call; when you are not confident of that, the heavier weight is.

`kind` (`defect` | `change` | `refactor`) is a declaration you already made in Step 1 or 2 — it
is not adjudicated here, and disagreeing with how a different reader might have classified it
is fine; note it and proceed.

```bash
node -e '
  const { stages } = require("./.claude/lib/plan-weight");
  console.log(JSON.stringify(stages({ kind: "defect", weight: "small" }), null, 2));
'
```

`stages()` returns the stage list and the TRD format for the weight you decided — it does not
decide the weight for you. The stage list for `medium` includes `ground` and `audit`, which
`trivial` and `small` never run (AC-F2.5, NG11): the lightest two weights are a deliberate
reduction in verification depth, not an oversight.

---

## Step 5: Write the TRD

### 5a. Light TRD (`trivial`, `small`)

`docs/TRD/<slug>.md` — the **same format** every other TRD uses, with fewer sections. It must
parse with `trd-parser.js` and run through `/implement-trd` unmodified.

**Required:**

```markdown
# TRD: <slug>

**Source PRD**: None — <defect | small change decided in session>

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | <what must be true> | the reproduction below / your instruction, <date> |

**State the objective the DEFECT implies, not the one the fix happens to satisfy.** Live run:
the reproduction correctly said the failure was *"silent in effect — the nudge never reaches
anything"*, and the objective then shrank to *"stops erroring"* — which a fix that abandons
the nudge entirely satisfies completely. Narrowing an objective until the intended fix clears
it is how a plan comes to verify itself. If the fix genuinely does not restore some of the
lost value, that is often fine — say so in `## Could Not Verify` rather than editing the
objective until it disappears.

## Reproduction              <!-- defects only -->
### Steps
### Actual
### Expected

## Intended Change           <!-- changes only -->
<the decided outcome, in checkable terms, cited to the conversation turn>

## Behaviour Preserved       <!-- refactors only -->
<the test command that passes BEFORE this change and must still pass after>
<the public surface that must not move>

## Decision
<the approach chosen; and if an alternative was considered and rejected, why>
<!-- repeat this as a **Follow:** bullet in every task's grounding — see below -->

## Non-Goals
<what this fix must not grow into>

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | <the open decision> | <what I did> | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | ... | O1 | None | ... |

## Task Grounding

### FIX-001
- **Touches:** `path/to/file.ts`
- **Reuse:** ... [read]
- **Replaces:** ... [ran]
- **Follow:** ...
- **Careful:** ...

**The field names MUST be bold.** `trd-parser.js` matches
`/^\s*-\s+\*\*(Touches|Reuse|...)[^*]*?:\*\*/` — an unbolded `- Touches:` parses as
nothing, the block warns "missing the mandatory Touches field", and the task ships with
EMPTY grounding. Grounding is this command's highest-value output; losing it silently is
the worst available failure.

## Could Not Verify
<anything asserted but not checked — empty is fine and honest>
```

**The `Owner-only` cell must read the literal string `owner-only`, not `yes`.**
`trd-parser.js` has no `ownerOnly` column role: it regex-tests the DATA row's own joined cell
text against `/owner-only|owner ruling/i`, over the row, not the header. A cell reading `yes`
never matches that pattern and parses to `ownerOnly: false` — the question then never reaches
a task prompt as `<open_question>`, silently. Carry the cell exactly as shown above.

**For `kind: refactor` at `trivial` or `small`, `## Behaviour Preserved` is the reproduction
section — the before-run only.** There is no after-run and no public-surface check at this
weight; both are `medium`-only (AC-F3.5). Record the test command and confirm it passed, now,
before anything is touched. If there is nothing to record here, that absence is itself the
signal a heavier weight was warranted — see Step 4.

#### Every task prompt must carry the DECISION, not just the task

Add a `## Decision` section stating the approach chosen and, when an alternative was
considered and rejected, **why**. **That is all — no duplication into tasks is needed.**

`trd-parser.js` parses the section into `parsed.decision`, and `/implement-trd` §3.5 emits it
as `<decision>` into **every** task's prompt. So one statement reaches every implementer of
this change, which is the point: two tasks of one fix must not rediscover its approach
independently.

**This took three attempts and the first two fixed nothing** — worth knowing, because both
looked right. "Repeat it in every task's prompt" failed because this command never writes task
prompts; `/implement-trd` does, and its placeholder list had no Decision element. Repeating it
as a `**Follow:**` bullet did work, but only if the author hand-copied it into every block —
and under a field whose own instruction calls it *"an existing pattern in this repository"*,
which is untrue of a decision being taken right now.

A per-task `- **Decision:**` bullet is now also valid, for the rare case where one task needs
an override. It is worth knowing why that used to be dangerous: an unrecognised bullet did not
merely get ignored, it **flushed the preceding field's body**, so the intuitive thing to write
silently destroyed the field above it.

```markdown
## Decision

Emit `{}`. NOT `systemMessage`: it is user-facing while this text is written to the model,
so it would add recurring noise and restore no function.
```

**Measured on a live run.** FIX-001 was told to emit `{}` (the audit had refuted
`systemMessage`). FIX-002 — a separate agent, told only "assert the key set" — wrote a test
asserting the hook *"conveys the archived checkpoint via an allowed top-level key (not
silently `{}`)"*, encoding the **rejected** remedy. The two tasks of one fix contradicted
each other, and the test failed against both the old code and the new.

The phase gate caught it and the review corrected it, so the loop held — but it cost a gate
failure and a repair pass for something the prompt could have prevented. A task that knows
only its own instruction cannot tell whether it is contradicting its sibling.

**No phases. No execution plan. No architecture, risks, or personas.** `trd-parser.js`
assigns a phase-less task list to phase 1 as a structural default, and agent selection falls
back to keyword matching. Adding those sections would be ceremony.

**`## Reproduction` / `## Intended Change` / `## Behaviour Preserved` are load-bearing, not
documentation.** Whichever one your `kind` calls for is what `/implement-trd`'s `--verify`
derives its success definition from when there is no PRD. Omit it and the fix ships
unverified — including a refactor, whose section is the one this sentence used to forget.

**Every acceptance criterion must be able to FAIL if the fix does not work.** Measured on a
live run: a criterion read *"prints JSON with no `hookSpecificOutput` key"* while the
proposed fix swapped in a key that was schema-legal but delivered the message to the wrong
audience. Both the criterion and its test passed **whether the message reached anyone or
nobody**. The audit caught it, at `medium`; at `trivial`/`small` there is no audit stage to
catch it, which is exactly why this criterion matters more here, not less.

Before writing each one, ask: *what would this criterion look like if the fix silently did
nothing?* If the answer is "the same", it is not a criterion — it is a restatement of the
diff. Write one that distinguishes the two, or record in `## Could Not Verify` that you
could not.

**A reproduction must not mutate live state.** A live run appended bogus checkpoints to a
real `.trd-state/` session log, because the repro passed `cwd: $PWD`. Reproducing a defect
should be safe to run twice. `test/smoke/scenarios/hooks-health.sh` shows the pattern — an
isolated temp `cwd`.

**Write `.trd-state/current.json` only when work is actually starting** — `--implement` was
passed and nothing suppressed the chain (see Step 7) — `{prd: null, trd: "<path>", branch:
"<branch>"}`.

This matches `fix-plan.js`'s `workBegins`, which is the authority: key the pointer on whether
work begins, never on the weight. On any run where work does not begin, no pointer is
written, and `current.json` keeps answering "what are we working on?" for the SessionStart
banner, the dispatch ledger and `notify-complete.sh`. Overwriting a live pointer for work that
is not beginning loses the real answer and replaces it with a false one. Report the TRD path
in the banner instead; `/implement-trd` writes the pointer itself (its Step 1.3a) when a human
later runs it.

### 5b. Phased TRD (`medium`)

At `weight: medium`, the TRD is authored and grounded by the existing `create-trd` workflow
and audited by the existing `audit-trd` workflow, from a durable investigation record this
command writes first.

#### Write the investigation record

The same §3.4 format as the `route:'prd'` record above, with `**Weight**: medium` and
`**Route**: plan`:

```markdown
# Investigation: <slug>

**Kind**: <defect | change | refactor>
**Weight**: medium
**Route**: plan

## Objectives
| ID | Objective | Source |
|----|-----------|--------|
| O1 | <what must be true> | the reproduction below / your instruction, <date> |

## Reproduction | ## Intended Change | ## Behaviour Preserved
<whichever the kind calls for>

## Decision
<the approach chosen; and why an alternative was rejected, if one was>

## Grounding
<per file: what it does now, what to reuse, what this replaces, conventions, hazards>
<each claim marked [ran] / [read] / [inferred]>

## Open Questions
<the table from §3.3, or "none">
```

Write it to `docs/plan/<slug>.investigation.md` **before** the `create-trd` call below — it is
that workflow's only source at this weight, and a run that dies mid-stage must not lose the
investigation (§2.2.5).

##### The kind-specific verification section

Ask `plan-weight.js` what this cell of the grid requires before writing the section:

```bash
node -e '
  const { verification } = require("./.claude/lib/plan-weight");
  console.log(JSON.stringify(verification({ kind: "<kind>", weight: "medium", openQuestionCount: <n> }), null, 2));
'
```

Write the section its `section` field names (`## Reproduction` / `## Intended Change` /
`## Behaviour Preserved`), and hold every criterion in it to §5a's rule unchanged: it must be
able to **fail** if the fix does nothing.

For `kind: refactor` at `medium` — the one cell where `afterRun` and `surfaceCheck` are both
true (AC-F3.1, AC-F3.2; this is what OQ-T3 resolved against this TRD's original assumption) —
the section carries all three:

```markdown
## Behaviour Preserved

Tests that pass BEFORE this change:
  <command>            [ran <date>]

Tests that pass AFTER this change:
  <command>            [ran <date>]

Public surface that must not move:
  <exported symbol / signature / observable output>
```

For `kind: change`, `beforeRunForbidden` is true (AC-F3.3) — `## Intended Change` states the
decided outcome only; there is nothing to preserve, only something new to reach, so no before-
run belongs in it. For `kind: defect`, `rootCauseRequired` is true (AC-F3.4) —
`## Reproduction`'s root-cause line carries its `[ran]`/`[inferred]` marker exactly as Step 2a
requires for the light-TRD path.

#### Author and ground: `Workflow(create-trd)`

```
Workflow({ name: "create-trd", args: {
  prd: "docs/plan/<slug>.investigation.md",
  trd: "docs/TRD/<slug>.md",
  feature: "<slug>",
  project: "<PROJECT_ROOT, or '' for this repo>",
} })
```

`args.prd` is read generically as "the source path" (`create-trd.js`'s `SOURCES` template) —
it does not require the file to literally be a PRD, so the investigation record fits with no
special-casing. The call hard-fails without `trd`, and without one of `prd`/`transcript`
(`create-trd.js:61-70`) — the write above must have already happened. Its Author and Ground
stages together ARE `stages()`'s `'author-trd'` and `'ground'` entries for this weight; no
separate call exists for `'ground'` because the workflow already performs it internally.

Print the workflow's own readout summary, not the whole thing (`command-status.md`: one
screen) — findings and grounding stay on disk, which is that command's own stated reason for
keeping them out of a fork.

#### Step 6 runs next, unchanged

`medium`'s stage list includes `'adversarial'` (`stages()`, §3.1), so **Step 6, above, runs
here as written** — the same code-reviewer pass that judges a `small` TRD now judges the
phased TRD `Workflow(create-trd)` just wrote, plus the investigation record beside it. Nothing
new to build: Step 6 already reads "the TRD" generically and does not care which format it is.
Apply its clearly-correct findings before continuing.

#### Verify: `Workflow(audit-trd)`

Once Step 6's findings are applied, run the one stage the grid grants to no other weight
(`'audit'` appears in no stage list but `medium`'s — AC-F2.5):

```
Workflow({ name: "audit-trd", args: {
  trd: "docs/TRD/<slug>.md",
  source: "docs/plan/<slug>.investigation.md",
  project: "<PROJECT_ROOT, or '' for this repo>",
} })
```

Pass the **same** `<slug>` as `feature` to both workflow calls above. `audit-trd.js` derives
its own feature slug from the TRD path (`TRD.match(/([^/]+)\.[^./]+$/)`, `audit-trd.js:39`) to
locate `.trd-state/<feature>/findings/grounding.json` — a mismatched slug silently splits that
state across two directories. The workflow applies what survives checking and rewrites the
TRD's `## Could Not Verify` section in place.

#### `/refine-trd` — named, never invoked

```bash
node -e '
  const { verification } = require("./.claude/lib/plan-weight");
  console.log(JSON.stringify(verification({ kind: "<kind>", weight: "medium", openQuestionCount: <n> }).refineTrdRecommended));
'
```

When this is `true` — `kind: change`, at least one open question still stands after the audit
above (AC-F6.3) — the readout's **NEXT** line names it:

```
NEXT: /refine-trd docs/TRD/<slug>.md — <n> open question(s) the audit could not resolve
```

**Do not call `/refine-trd` and do not wait for it.** It appears only as this one line of
readout text, per §3.6 — `/refine-trd` stays interactive precisely so a human is the one who
answers it, which is the same reason it is the one command `autonomy.md` exempts outright.

Once `Workflow(audit-trd)` returns, this weight's own work is done. Converge to **Step 7**
below like every other path, with its `plan()` call now carrying `weight: "medium"`.

---

## Step 6: Adversarial pass (`small`, `medium`)

**Runs whenever `stages()` (Step 4) returned `'adversarial'` in the list — `trivial` never
reaches this step.** The checks a TRD passes prove it is well-formed. They cannot tell whether
the fix is *right*.

```
Agent(subagent_type="code-reviewer", prompt="<the TRD> +
  Judge FOUR things and nothing else:
   1. Root cause or symptom — does this address the mechanism, or the place the error surfaced?
   2. Regression — for each caller the grounding identified, does the change hold?
   3. Is there a simpler correct fix? A clever small diff is a smell.
   4. Does it contradict local convention? A fix fighting the surrounding code usually
      means the root cause was misread.
   5. Does the declared `kind` match what the diff actually does? If nothing observable
      changes, a reviewer would call it a refactor whatever it was declared — and the
      coverage rule is scored differently for those. **SAY SO IF IT DIFFERS; do not
      override it.** The author may well have a reason, and the call is theirs. This is
      one line in the report, not a veto.
  Report findings only. Do not edit.")
```

**Its verdict can send you back to Step 4, and only that direction.** If it finds the root
cause is inferred rather than demonstrated, re-weigh — the honest answer may now be heavier
than first decided. This is what stops the command talking itself into acting unattended on a
guess.

**The adversarial pass runs ONCE.** Re-running Step 4 re-decides the weight; it does not
re-enter this step. There is nothing to re-review — the TRD has not changed, only the weight
input the pass corrected — and a pass that could re-trigger itself has no termination
condition.

Apply clearly-correct findings; report the rest in `## Could Not Verify`.

---

## Step 7: Implement, or stop — the lib decides, you execute

**Every path converges here** — `trivial`, `small`, and (once its own stages finish) `medium`.

```bash
node -e '
  const { plan } = require("./.claude/lib/fix-plan");
  console.log(JSON.stringify(plan(JSON.parse(process.argv[1])), null, 2));
' "$(cat <<'"'"'JSON'"'"'
{ "weight": "small", "route": "plan", "implement": false, "kind": "defect", "slug": "<slug>",
  "neverUnattendedHit": [] }
JSON
)"
```

`neverUnattendedHit` comes from matching this run's touched files against the owner's
never-unattended path list in `.claude/rules/verification.md` (empty list if it names none):

```bash
node -e '
  const { matchNeverUnattended } = require("./.claude/lib/fix-sizing");
  console.log(JSON.stringify(matchNeverUnattended(JSON.parse(process.argv[1]), JSON.parse(process.argv[2]))));
' "$(cat <<'"'"'TOUCHES'"'"'
["src/session.ts"]
TOUCHES
)" "$(cat <<'"'"'PATTERNS'"'"'
[]
PATTERNS
)"
```

Then do exactly what `plan()` returns, and nothing else:

| Field | Meaning |
|---|---|
| `writeTrd` | whether a TRD stays on disk for this path |
| `writePointer` | write `.trd-state/current.json` only when **work actually begins** |
| `chain` + `chainSkill` + `chainArgs` | `Skill({ skill: chainSkill, args: chainArgs })` |
| `handoffLine` | emit before chaining |
| `banner` / `bannerBody` | emit as the LAST line — **or `null`, meaning emit nothing** |
| `notify` | run `.claude/hooks/notify-complete.sh "plan" "complete" "<summary>"` |
| `verificationSection` | which TRD section carries the success definition, per kind |

**Do not re-derive any of this in prose, and do not second-guess a `null` banner.**
`banner: null` on a chained run is correct: `command-status.md` forbids anything following
`COMMAND COMPLETE`, and whichever command the chain lands in emits the run's terminator.
`Skill()` loads into THIS session, so control returns here when it finishes — **when it does,
the run is over. Emit nothing.**

**`--implement` is the only thing that starts work, and it is honoured at every weight.**
There is no weight at which the flag is refused; there is no weight at which it is implied.
`workBegins` in `fix-plan.js` does not read the weight at all — only whether `--implement` was
passed and whether `neverUnattendedHit` came back empty. A path the owner has named
never-unattended in `verification.md` suppresses the chain regardless of everything else,
with the reason naming the matched paths.

**Why this is a lib call and not a table you read.** These outputs used to be prose in five
different places and disagreed with each other in four of them: `--implement` was honoured in
one branch but not another, the pointer was keyed on a permission rather than on whether work
begins, the handoff was numbered in a way that invited a second banner, and the completion
signal had no guard at all — so a chained run told webhooks "complete" at the moment the work
*began*. One table written five times cannot stay consistent; a function with tests can.

**You can always implement a TRD this command wrote — that is what `/implement-trd` is.** The
TRD is written and on disk; running `/implement-trd docs/TRD/<slug>.md --verify` yourself does
exactly what a `--implement` run would have done.

There is no `--force` flag, and the distinction is narrow but real: the capability is yours
either way, and what the missing flag prevents is **this command** deciding on your behalf
that work should begin. This command's gate constrains what a machine does unattended; it was
never meant to constrain you.

---

## Readout

**Format: the four-section readout in `.claude/rules/command-status.md`** — STATE, DECISIONS,
ISSUES, NEXT, in that order, one screen, written for someone who was not in the session. Any
section may be "none". No section for what was dispatched or which stages ran: that is in the
transcript and does not change what the owner does next.


## Output discipline (see `.claude/rules/command-status.md`)

### Artifact link (see `.claude/rules/command-status.md`)

Unless `.claude/settings.json` sets `ensemble.publishArtifacts: false`, publish the TRD with
`Artifact({ file_path: "docs/TRD/<slug>.md", favicon: "📐" })` — the markdown FILE, never a
rendering of it — reusing the stored URL from `.trd-state/<feature>/artifacts.json` (key
`trd`) when one is present, and storing it when one is not. Emit the link ABOVE the
banner. A failed publish is one line of prose and nothing more; it never blocks the banner.

The banner is the LAST line of the final turn, nothing after it. **Step 7's plan decides
whether you emit one at all** — `banner: null` means emit nothing. On unrecoverable failure use
`═══ COMMAND STUCK: /plan ═══` with `Reason:` and `Next:`.

```bash
.claude/hooks/notify-complete.sh "plan" "complete" "<one-line summary>"
```

**Never on a chained run.** This helper signals completion to webhooks, queues and tmux
panes, and `command-status.md` Path B requires it fire **exactly once, at the actual
completion moment, never during dispatch**. On a chained run the work is just *beginning* at
handoff — the command it chains into fires its own. Call this only on the paths that
genuinely end here: the Step 1.1 early reject, and any Step 7 path that stops without
chaining.

Call it on the Step 1.1 early reject too. That path ends the command as surely as the others,
and skipping it there makes the completion signal depend on *which* way the command finished.

---

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

This command runs **autonomously** from invocation to its final banner. Do NOT pause to ask
the user to confirm decisions, review artifacts, or verify checkpoints.

`AskUserQuestion` is permitted ONLY for: genuine requirement ambiguity with no default;
information that cannot be derived; a truly irreversible destructive operation; or a STUCK
condition after retries.

**In this command that narrows to exactly two:** an ambiguous subject on a bare invocation
(Step 1), and a STUCK condition. Everything else — which weight, which files, whether to chain —
is decided from evidence and proceeded on.

Forbidden:
- "Should I proceed?" / "Please review before I continue." → no. Decide and continue.
- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- **The declarative forms are the same move and are the ones that slip past**: "I can
  implement this if you want", "say the word and I'll chain into implement", "that's
  available whenever". None is a question; each hands the decision back identically.
