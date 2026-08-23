---
name: fix
description: Fix a defect or make a small scoped change — investigate, root-cause, write a light TRD, audit it, and implement when it is demonstrably safe
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

Small work that still deserves a plan. A defect where the spec is known and violated, or a
scoped change already decided — moving a button, fixing copy, a contained backend change.

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

| Input | Subject from |
|---|---|
| a sentence or source | the argument |
| bare | this conversation |

**Bare invocation states its subject back, then proceeds.** First line of output:

```
SPECCING: <one line>
   from: <which turn, quoted briefly>
```

This is a correction point, not a checkpoint — do not stop for confirmation. Blocking here
would also make unattended use impossible.

**If the conversation holds more than one candidate subject, ask which** (`autonomy.md` case
2 — information that cannot be derived). Ambiguity resolves to asking, **never to guessing**:
assembling a plausible TRD out of loosely related discussion produces something that looks
well-founded and addresses a problem nobody raised.

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

### 2c. From conversation

Extract the decision reached — then **re-ground it against the code**. The corpus states
intent; the code states fact. A discussion records what was decided, not what exists, and
writing it up without re-grounding enshrines whatever was assumed mid-conversation.

### 2d. Ground the fix (all paths)

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

Do not estimate these. Measure them, so the numbers are in the transcript:

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
{ "taskCount": 2, "rootCause": "demonstrated", "reproducible": true,
  "specCertain": true, "criteriaCount": 1,
  "touches": ["src/session.ts"], "callers": 3, "covered": true,
  "neverUnattended": [] }
JSON
)"
```

`criteriaCount` is how many checkable success criteria Step 4 will write. Zero is legitimate
(some changes have no statable outcome) — and caps the tier at REVIEW, because nothing would
verify the change.

**The lib owns this decision.** Do not re-derive a tier in prose or talk yourself past its
verdict; every rule in it can only lower a tier, never raise one.

| Tier | Then |
|---|---|
| **AUTO** | write the TRD, audit it, chain into `/implement-trd` |
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

## Reproduction              <!-- defects only -->
### Steps
### Actual
### Expected

## Intended Change           <!-- small changes only -->
<the decided outcome, in checkable terms, cited to the conversation turn>

## Non-Goals
<what this fix must not grow into>

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | ... | O1 | None | ... |

## Task Grounding

### FIX-001
- Touches: `path/to/file.ts`
- Reuse: ... [read]
- Replaces: ... [ran]
- Follow: ...
- Careful: ...

## Could Not Verify
<anything asserted but not checked — empty is fine and honest>
```

**No phases. No execution plan. No architecture, risks, or personas.** `trd-parser.js`
assigns a phase-less task list to phase 1 as a structural default, and agent selection falls
back to keyword matching. Adding those sections would be ceremony.

**`## Reproduction` / `## Intended Change` are load-bearing, not documentation.** They are
what `/implement-trd`'s `--verify` derives its success definition from when there is no PRD.
Omit them and the fix ships unverified.

Write `.trd-state/current.json` with `{prd: null, trd: "<path>", branch: "<branch>"}`.

---

## Step 5: Audit — automatically, always

### 5.1 Mechanical checks

Cheap, deterministic, no agent:

- every task has a grounding block with `Touches`
- every path cited in grounding exists
- every task's `Serves` resolves to a stated objective
- every objective has a source (the reproduction, or your instruction)
- **no task touches a file outside the grounding footprint** — the scope-creep check
- `trd-parser.js` parses the file without fatal warnings

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
  Report findings only. Do not edit.")
```

**Its verdict can lower the tier and never raise it.** If it finds the root cause is inferred
rather than demonstrated, AUTO becomes REVIEW — re-run Step 3.2 with the corrected input. This
is what stops the command talking itself into acting unattended on a guess.

Apply clearly-correct findings; report the rest in `## Could Not Verify`.

---

## Step 6: Implement, or stop

### AUTO — chain, unless `--spec-only`

Do **not** emit a COMMAND COMPLETE banner here (`command-status.md`: nothing may follow it).
Emit the handoff, then invoke:

```
[STATUS: /fix] PHASE 1/2 COMPLETE → TRD authored, tier AUTO, chaining to /implement-trd
```

```
Skill({ skill: "implement-trd", args: "docs/TRD/<slug>.md --verify" })
```

`/implement-trd`'s own `COMMAND COMPLETE` terminates the run — one command from the user's
point of view.

**`--verify` is not optional.** Re-running the reproduction is the acceptance criterion. Without
it the run would assert "fixed" on the strength of a test suite that also passed before the fix.

**The chained run works on a branch and never merges.** The tier decides whether a machine may
write the branch — never whether it lands. A human still reviews.

### REVIEW / ESCALATE / `--spec-only` — stop here

```
═══ COMMAND COMPLETE: /fix ═══
<slug>: tier <TIER> — <the failing axis>. TRD at docs/TRD/<slug>.md. Run /implement-trd --verify when satisfied.
```

**There is deliberately no `--force-auto`.** A flag overriding the gate defeats the gate. If
you want to implement a REVIEW TRD, run `/implement-trd` yourself — an explicit human decision,
recorded as a human invocation.

---

## Output discipline (see `.claude/rules/command-status.md`)

The banner is the LAST line of the final turn, nothing after it. On a chained AUTO run,
`/implement-trd` emits it, not this command. On unrecoverable failure use
`═══ COMMAND STUCK: /fix ═══` with `Reason:` and `Next:`.

```bash
.claude/hooks/notify-complete.sh "fix" "complete" "<one-line summary>"
```

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
