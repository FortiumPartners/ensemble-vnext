---
name: fix
description: Defect, minor enhancement, or refactor where the full PRD/TRD pipeline is overkill — investigate, write a light TRD, audit it, and implement when it is demonstrably safe
version: 1.0.0
argument-hint: "[description | source path | issue ref] [--spec-only]"
category: implementation
---

> **Usage:** `/fix <what>` — or bare `/fix` to write up something decided in this conversation.
>
> **Arguments:**
> - `<description>` — a sentence: `/fix the 500 on /api/session when the token expires`
> - `<source>` — a bug report, Jam link, GH issue ref, stack trace, log excerpt. **Prefer this**: a written report already carries steps, environment and actual-vs-expected.
> - *(bare)* — read this conversation for a decided change
> - `--spec-only` — stop after the TRD regardless of tier

---

## User Input

```text
$ARGUMENTS
```

---

## What this command is for

**Work where the full `/create-prd → /audit-prd → /create-trd → /audit-trd → /implement-trd`
pipeline is overkill relative to the complexity and risk of what you are doing** — and where
the alternative would otherwise be straight prompting and editing.

The gate is **proportion, not category**. Three kinds qualify:

| Kind | Example | What success means |
|---|---|---|
| **defect** | the export returns an empty file across month boundaries | the reproduction no longer reproduces |
| **change** | move the export button to the header; fix copy; a contained backend tweak | the stated outcome holds |
| **refactor** | extract a helper; collapse a duplicated branch; rename through a module | **behaviour is unchanged** — the existing tests pass before AND after |

**Say which kind it is.** Step 3 scores different axes for each, because a refactor has no root
cause to demonstrate and nothing to reproduce, while its test coverage matters more than for
either of the others.

**It exists because the alternative is chatting and editing**, which is this framework's
commonest source of bad code. And because the full
`/create-prd → /audit-prd → /create-trd → /audit-trd → /implement-trd` path is half an hour
of ceremony for a two-line fix.

**Short-circuiting the PRD here is correct, not a compromise.** A PRD supplies provenance for
objectives — what to build and why. For a defect that question is already answered: the spec
exists and is being violated. For a small change, **your instruction is the source**, which
`/create-trd`'s typing rule already admits as valid provenance. So every objective traces to
the reproduction or to you, and nothing is invented.

**What this command is NOT for:** anything where the correct behaviour is still a product
decision. Step 3 detects that and sends you to `/create-prd`.

---

## Step 1: Establish the subject

**Strip the flags from the argument first.** `--spec-only` is not part of the subject.
`/fix the login copy is wrong --spec-only` has the subject *"the login copy is wrong"*;
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
User: /fix
```

One candidate, so the count test passed, and `/fix` would have specced a problem the user had
just **withdrawn**. Later gates would have caught it — a non-reproducible defect stops at
REVIEW (Step 2a), and a definition deriving zero criteria caps the tier — but only after a
full investigation, and the artifact would still be a plausible-looking TRD for a
non-problem.

**Ambiguity resolves to asking, never to guessing.** Assembling a TRD out of loosely related
discussion produces something that *looks* well-founded and addresses a problem nobody
raised — the manufactured-requirement failure arriving through a new door. "Specific enough
to name in one line" is the bar: a defect, a file, a behaviour. *"It feels slow"* is not a
subject; it is the start of a conversation that has not happened yet.

### 1.1 Cheap pre-triage — reject the obviously-large before investigating

Read the subject only. If it is plainly not small work — "redesign the dashboard", "add SSO",
anything naming a new subsystem — stop now:

```
═══ COMMAND COMPLETE: /fix ═══
Not light-path work: <why>. Use /create-prd.
```

**This gate may only REJECT, never accept.** Accepting requires the investigation, because
you cannot size what you have not root-caused (Step 3).

---

## Step 2: Investigate

**Do this in full. Skipping it is what turns a small fix into a symptom patch.** Depth varies
by input; rigour does not.

### 2a. Defect

1. **Reproduce it.** Run the steps. Record what actually happens.
2. **Find the mechanism** — the line or interaction that causes it, not the line where the
   error surfaces.
3. Mark the root cause `[ran]` when the repro isolated it, `[inferred]` when you reasoned it
   out from reading. **This marker decides the tier in Step 3 — do not inflate it.**

**If it will not reproduce, say so and stop at REVIEW.** A defect that cannot be reproduced
cannot be verified fixed.

### 2b. Small change

No reproduction exists. Instead confirm the **current** behaviour, so the TRD states a real
before-and-after rather than an assumed one.

### 2c. Refactor

There is no defect and no new outcome — the claim is that **behaviour is identical and the
structure is better**. So the investigation is different in kind:

1. **Establish the behaviour that must survive.** Find the tests that cover the code you are
   about to move, and RUN them. Record that they pass, now, before you touch anything.
2. **If there are no such tests, record that and CONTINUE — do not abort.** Write
   `covered: false` and let sizing hold it at REVIEW, which is correct: nothing would
   witness that behaviour was preserved. You still produce the TRD, the audit and the
   report; a human then decides.

   ("Stop and say so" stood here and contradicted the next sentence — REVIEW *means* write
   the TRD and then stop, which is more work than aborting at this step. A literal reader
   would have produced no artifact at all.)

   Writing tests first is a legitimate separate `/fix` — and as a `change`, where
   `addsCoverage` does satisfy the coverage axis — and it is a better one than refactoring
   blind.
3. **Name what the refactor must NOT change** — the public surface, the call signature, the
   observable output. That goes in Non-Goals.

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

---

## Step 3: Size it

**Now — after the investigation, before writing the TRD.** You cannot size what you have not
root-caused; sizing a raw report is guessing at the moment guessing is most expensive.

### 3.1 Gather the evidence mechanically

**Six of the nine inputs are MEASURED; three are PLANNED. Keep them straight** — the "do not
estimate" rule below applies to the measured ones, and pretending it applies to all nine
makes it unfollowable, because Step 3 runs before Step 4 writes any tasks.

| Input | Kind | How |
|---|---|---|
| `touches`, `callers`, `covered` | **measured** | the commands below |
| `rootCause`, `reproducible`, `specCertain` | **measured** | Step 2's investigation |
| `taskCount`, `criteriaCount`, `addsCoverage` | **planned** | what Step 4 is about to write |

A planned input is a commitment, not a guess: if you pass `addsCoverage: true`, Step 4 **must**
write that task, and the adversarial pass reads the task list. If you cannot yet say how many
tasks Step 4 will need, you have not finished Step 2.

Do not estimate the measured ones. Measure them, so the numbers are in the transcript:

```bash
# callers of each symbol the fix changes
grep -rn "<symbol>" --include='*.{ts,tsx,js,py,go,rb}' src/ | wc -l

# do the touched files carry tests?
ls <file>.test.* <file>.spec.* 2>/dev/null || \
  grep -rl "<module>" test/ tests/ __tests__/ 2>/dev/null
```

Read the owner's never-unattended paths from `.claude/rules/verification.md` if it lists any
(auth, payments, migrations, secrets, deletion paths). Absent → empty list.

### 3.2 Get the verdict

```bash
node -e '
  const { size } = require("./.claude/lib/fix-sizing");
  console.log(JSON.stringify(size(JSON.parse(process.argv[1])), null, 2));
' "$(cat <<'"'"'JSON'"'"'
{ "kind": "defect", "taskCount": 2, "rootCause": "demonstrated", "reproducible": true,
  "specCertain": true, "criteriaCount": 1,
  "touches": ["src/session.ts"], "callers": 3,
  "covered": true, "addsCoverage": false,
  "neverUnattended": [] }
JSON
)"
```

`criteriaCount` is how many checkable success criteria Step 4 will write. Zero is legitimate
(some changes have no statable outcome) — and caps the tier at REVIEW, because nothing would
verify the change.

`kind` is `defect` | `change` | `refactor`, and it decides which axes are scored. A refactor
is not asked for a root cause or a reproduction — it has neither — but its `covered` rule is
**stricter**: `addsCoverage` does not satisfy it, because tests written during a refactor
describe the NEW structure and cannot witness that the OLD behaviour survived. An omitted
`kind` defaults to `defect`, the strictest reading, so forgetting it never buys a laxer
verdict.

`covered` is whether the touched files carry tests **today**; `addsCoverage` is whether one of
this change's own tasks adds them. Either satisfies the axis, because the question is whether
a regression would be caught **after** this lands. Do not claim `addsCoverage` unless a task in
the TRD actually writes the test — the adversarial pass reads the task list.

**The lib owns this decision.** Do not re-derive a tier in prose or talk yourself past its
verdict; every rule in it can only lower a tier, never raise one.

| Tier | Then |
|---|---|
| **AUTO** | write the TRD, audit it, chain into `/implement-trd` — **unless `--spec-only`, which stops after the audit** |
| **REVIEW** | write the TRD, audit it, stop, report the tier and why |
| **ESCALATE** | stop now, name the failing axis, point at `/create-prd` |

---

## Step 4: Write the light TRD

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

### Every task prompt must carry the DECISION, not just the task

Add a `## Decision` section stating the approach chosen and, when an alternative was
considered and rejected, **why**. **That is all — no duplication into tasks is needed.**

`trd-parser.js` parses the section into `parsed.decision`, and `/implement-trd` §3.5 emits it
as `<decision>` into **every** task's prompt. So one statement reaches every implementer of
this change, which is the point: two tasks of one fix must not rediscover its approach
independently.

**This took three attempts and the first two fixed nothing** — worth knowing, because both
looked right. "Repeat it in every task's prompt" failed because `/fix` never writes task
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

**Measured on the first live run.** FIX-001 was told to emit `{}` (the audit had refuted
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

**Every acceptance criterion must be able to FAIL if the fix does not work.** Measured on the
first live run: a criterion read *"prints JSON with no `hookSpecificOutput` key"* while the
proposed fix swapped in a key that was schema-legal but delivered the message to the wrong
audience. Both the criterion and its test passed **whether the message reached anyone or
nobody**. The audit caught it; the criteria could not.

Before writing each one, ask: *what would this criterion look like if the fix silently did
nothing?* If the answer is "the same", it is not a criterion — it is a restatement of the
diff. Write one that distinguishes the two, or record in `## Could Not Verify` that you
could not.

**A reproduction must not mutate live state.** The same run appended bogus checkpoints to a
real `.trd-state/` session log, because the repro passed `cwd: $PWD`. Reproducing a defect
should be safe to run twice. `test/smoke/scenarios/hooks-health.sh` shows the pattern — an
isolated temp `cwd`.

**Write `.trd-state/current.json` only when work is actually starting** — tier AUTO **and**
no `--spec-only` — `{prd: null, trd: "<path>", branch: "<branch>"}`.

Key it on whether work begins, not on the tier. An earlier version said "only when the tier is
AUTO", which instructed writing the pointer on an AUTO `--spec-only` run — a run that
deliberately starts nothing — contradicting its own reason two sentences later.

On REVIEW, ESCALATE, or `--spec-only`, no work is starting, and `current.json` answers "what are we working
on?" for the SessionStart banner, the dispatch ledger and `notify-complete.sh`. Overwriting a
live pointer for work that is not beginning loses the real answer and replaces it with a
false one. Report the TRD path in the banner instead; `/implement-trd` writes the pointer
itself (its Step 1.3a) when a human later runs it.

---

## Step 5: Audit — automatically, always

### 5.1 Mechanical checks — call the lib, do not re-implement them

```bash
node -e '
  const { parseTrd } = require("./.claude/lib/trd-parser");
  const { audit } = require("./.claude/lib/fix-audit");
  const fs = require("fs");
  const parsed = parseTrd(fs.readFileSync(process.argv[1], "utf8"), { path: process.argv[1] });
  const r = audit(parsed, {
    objectiveIds: ["O1"],                       // IDs from the Objectives table
    kind: "defect",                             // the SAME kind you passed to sizing
    markdown: fs.readFileSync(process.argv[1], "utf8"),
    // Every path a task's grounding CREATES rather than edits — read them off the
    // Touches lines. Getting this wrong produces the false failure the paragraph
    // below warns about: a new file reported as a missing citation.
    expectedNew: ["path/to/file/this/TRD/creates"],
  });
  console.log(JSON.stringify(r, null, 2));
' "docs/TRD/<slug>.md"
```

It checks: grounding present with `Touches`, cited paths exist (or are declared new),
`Serves` resolves to a stated objective, and the parser reports no fatal warning. It returns
`footprint` for the scope-creep check.

**Do not hand-roll these.** The first live `/fix` run wrote them as an ad-hoc script and got
`task.serves` wrong — it is an ARRAY, and comparing it as a string reported two false failures
on a correct TRD. A false failure is worse than a missing check: it invites "fixing" a good
document to satisfy a broken test.

The one thing the lib cannot judge is whether an objective's *source* is real. Confirm by
eye that each traces to the reproduction, the recorded decision, or the user.

### 5.2 One adversarial pass — design correctness

The checks above prove the TRD is well-formed. They cannot tell whether the fix is *right*.

```
Agent(subagent_type="code-reviewer", prompt="<the TRD> + <the investigation> +
  Judge FOUR things and nothing else:
   1. Root cause or symptom — does this address the mechanism, or the place the error surfaced?
   2. Regression — for each caller identified in sizing, does the change hold?
   3. Is there a simpler correct fix? A clever small diff is a smell.
   4. Does it contradict local convention? A fix fighting the surrounding code usually
      means the root cause was misread.
   5. IS THE DECLARED `kind` HONEST? Look at the diff, not the label. If nothing about
      observable behaviour changes, this is a REFACTOR however it was declared — and a
      refactor on untested code must not reach AUTO. `kind` is the one sizing input a
      caller can misstate to buy a laxer verdict: the default guards omission, not
      misstatement, and `change` is laxer than `refactor` on coverage. The audit lib
      checks that the declared kind matches the TRD's verification section; only you can
      check it against what the code actually does.
  Report findings only. Do not edit.")
```

**Its verdict can lower the tier and never raise it.** If it finds the root cause is inferred
rather than demonstrated, AUTO becomes REVIEW — re-run Step 3.2 with the corrected input. This
is what stops the command talking itself into acting unattended on a guess.

**The adversarial pass runs ONCE.** Re-running Step 3.2 recomputes the tier; it does not
re-enter Step 5.2. There is nothing to re-audit — the TRD has not changed, only the sizing
input the audit corrected — and a pass that could re-trigger itself has no termination
condition.

Apply clearly-correct findings; report the rest in `## Could Not Verify`.

---

## Step 6: Implement, or stop — the lib decides, you execute

```bash
node -e '
  const { plan } = require("./.claude/lib/fix-plan");
  console.log(JSON.stringify(plan({
    tier: "AUTO",           // from Step 3.2
    specOnly: false,        // was --spec-only passed?
    kind: "defect",         // defect | change | refactor
    slug: "<slug>"
  }), null, 2));
'
```

Then do exactly what it returns, and nothing else:

| Field | Meaning |
|---|---|
| `writeTrd` | false on ESCALATE — a light TRD would be the wrong artifact, not an incomplete one |
| `writePointer` | write `.trd-state/current.json` only when **work actually begins** |
| `chain` + `chainArgs` | `Skill({ skill: "implement-trd", args: chainArgs })` |
| `handoffLine` | emit before chaining |
| `banner` / `bannerBody` | emit as the LAST line — **or `null`, meaning emit nothing** |
| `notify` | run `.claude/hooks/notify-complete.sh "fix" "complete" "<summary>"` |
| `verificationSection` | which TRD section carries the success definition, per kind |

**Do not re-derive any of this in prose, and do not second-guess a `null` banner.**
`banner: null` on a chained run is correct: `command-status.md` forbids anything following
`COMMAND COMPLETE`, and `/implement-trd` emits the run's terminator. `Skill()` loads into THIS
session, so control returns here when it finishes — **when it does, the run is over. Emit
nothing.**

**Why this is a lib call and not a table you read.** These six outputs were prose in five
different places and disagreed with each other in four of them: `--spec-only` was honoured in
one branch, the pointer was keyed on the tier rather than on whether work begins, the handoff
was numbered `PHASE 1/2` (inviting a second banner after `/implement-trd`'s), and the
completion signal had no guard at all — so a chained run told webhooks "complete" at the
moment the work *began*. One table written five times cannot stay consistent; a function with
tests can.

**There is deliberately no `--force-auto`.** A flag overriding the gate defeats the gate. To
implement a REVIEW TRD, run `/implement-trd` yourself — an explicit human decision, recorded
as a human invocation.

---

## Output discipline (see `.claude/rules/command-status.md`)

The banner is the LAST line of the final turn, nothing after it. **Step 6's plan decides
whether you emit one at all** — `banner: null` means emit nothing. On unrecoverable failure use
`═══ COMMAND STUCK: /fix ═══` with `Reason:` and `Next:`.

```bash
.claude/hooks/notify-complete.sh "fix" "complete" "<one-line summary>"
```

**Never on a chained AUTO run.** This helper signals completion to webhooks, queues and tmux
panes, and `command-status.md` Path B requires it fire **exactly once, at the actual
completion moment, never during dispatch**. On a chained run the work is just *beginning* at
handoff — `/implement-trd` fires its own. Call this only on the paths that genuinely end here:
the Step 1.1 early reject, and REVIEW / ESCALATE / `--spec-only`.

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
(Step 1), and a STUCK condition. Everything else — which tier, which files, whether to chain —
is decided from evidence and proceeded on.

Forbidden:
- "Should I proceed?" / "Please review before I continue." → no. Decide and continue.
- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- **The declarative forms are the same move and are the ones that slip past**: "I can
  implement this if you want", "say the word and I'll chain into implement", "that's
  available whenever". None is a question; each hands the decision back identically.
