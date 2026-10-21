---
name: audit-prd
description: Pipeline stage after /create-prd. Runs the verification wave over an existing PRD against its source, the design corpus and the code, applies the findings that survive checking, and writes the audit report.
version: 1.0.0
argument-hint: "[path-to-prd] [--source <path>] [--project <dir>]"
# MODEL-INVOCABLE as of 2026-10-21, owner-requested ("verify and audit steps need to be model
# invocable"), the same change /plan received on 2026-09-26. The flag guarded one thing,
# accidental selection by description match, and the remedy is now in the description: it
# opens on the MECHANISM (where the command sits and what it runs) rather than echoing how a
# user phrases the task. Scope authorization is unchanged and stays autonomy.md's: a command
# runs to its own banner, and a Skill() call by an agent that has decided to run it is a
# different act from a description match.
---

Run the verification wave over a PRD and apply what survives checking.

## User Input

```text
$ARGUMENTS
```

If no path is given, use `current.prd` from `.trd-state/current.json`.

---

## What this command is for

`/create-prd` writes a PRD. It does not verify one. **This does**, and it is a separate
command for three reasons:

1. **It runs on any PRD** — one this pipeline authored, one written by hand eighteen months
   ago, one inherited from another team. It re-derives its own index from the document and
   never depends on how the document was produced.
2. **It can run more than once** — after `/refine-prd`, before `/implement-trd`, or when
   someone wants a stale document rechecked. Verification is not a one-time event at
   authoring.
3. **It makes the cost visible.** The wave is the expensive half. Splitting it means you
   choose when to pay for it instead of paying on every draft.

## The audit is the ONLY stage that asserts fact

The rule the whole pipeline turns on:

> **The corpus states intent. The code states fact.**

Design documents — including the PRD under audit — say what was *decided*. They do not
describe what *exists*: most stop being maintained the moment implementation starts. Every
verifier here reads **code** to check claims, and cites a document only as the *source* of a
decision. Where a document and the code disagree, **the code wins and the disagreement is
itself a finding** — it means a design doc has gone stale, and a stale doc that reads as
current is worse than no doc.

## What it checks

| Verifier | Checks |
|---|---|
| `source-fidelity` | Both directions against the SOURCE. source → PRD: which requirements, decisions and **rejections** are missing? PRD → source: which requirements trace to nothing? Strictness is checked too — an unsourced threshold on a sourced requirement is the commonest invention, and it looks legitimate because the requirement is real. |
| `grounding` | Does any of this **already exist**? A PRD asking for something already shipped costs a full implementation cycle to discover. Also catches stale assertions about the system. |
| `conformance` | Anything violating `stack.md` or `constitution.md`; citations that do not resolve. |

## What it may NOT do

**Findable only.** Every finding names a source, a contradiction, or a specific mechanism
failure, and is checkable in seconds.

- *"REQ-4 traces to nothing in the source"* — checkable, permitted.
- *"I think REQ-4 is unnecessary"* — manufactured, **forbidden**.

No verifier may invent a requirement or strike one on judgment. **Striking a real
requirement is harder to detect than adding a fake one.** A finding asserting severity
carries the same sourcing burden as a requirement. **Zero findings is a legitimate result** —
do not manufacture findings to look thorough.

## Rejecting a bad finding is part of the job

Apply what survives; **reject what does not, and name the file that refutes it.** In one
measured run 6 of 9 findings were wrong — a verifier resolved `.claude/rules` against the
authoring repository instead of the project under design — and five of those wrong findings
were reported at HIGH confidence. Confidence is not evidence.

Pass `--project <dir>` when the PRD lives somewhere other than the codebase it designs.
That single argument is what prevents the failure above.

## `## Could Not Verify` — the section this command owns

`/create-prd` writes a `## Could Not Verify` section listing what the author asserted but
could not check. **This command consumes it and rewrites it** with what is true after the
audit: confirmed claims removed, false ones promoted to findings, unchecked ones kept with a
reason, new gaps added.

That is what lets anyone open a PRD and see **whether it has been verified and what remains
unchecked**, without running anything.

## Execution: the workflow is the orchestrator

```
Workflow({ name: "audit-prd", args: { prd: "<path>", source: "<source path or empty>", project: "<dir or empty>" } })
```

The workflow returns a readout. Print it. Findings live in script variables and never enter
this context, so a large finding set costs nothing here.

**If the workflow is unavailable**, fall back to running the verifiers as parallel subagents
from this context and reconciling their findings yourself — the checks above are the
contract, the workflow is only the execution vehicle.

### Session fidelity is `/create-prd`'s job, not this command's

**Do not add a forked session-fidelity pass here.** It was written into this command on
2026-09-20 and moved the same day, for a reason that is structural rather than stylistic:

This command is built to audit *"one written months ago by anyone"* — routinely in a fresh
session, often by someone who was not present for the design. A fork inherits the conversation
of whoever forks it, so a fork dispatched from HERE inherits a session that never saw the
design discussion. It would check the PRD against nothing and return clean, which is worse
than not running: a fidelity pass that cannot fail is a false assurance.

`/create-prd` runs it as its final step, in the session that holds the conversation. What
reaches this command is the RESULT, recorded in the PRD's verification header.

## Writing the audit report

**Right after the workflow call above returns** and before printing the readout, write
`.trd-state/<feature>/audit-prd-report.md` (`<feature>` is the audited PRD's basename without
its extension), overwriting any report from a previous run:

```markdown
<the readout's VERDICT: line, copied - the report's first line>

# Audit report: <feature>

- Date: <YYYY-MM-DD>
- Audited commit: <output of `git rev-parse --short HEAD`, or "unknown" if it fails>
- PRD: <prd path>
- Source: <source path, or "none">

<the readout, verbatim as printed below - it opens with the AUDIT:/SOURCE: header>
```

**One text, written once, printed as written.** Settle the readout's final wording, the
`AUDIT:`/`SOURCE:` header, the `VERDICT:` line and every finding line, BEFORE writing this
file, then print that same text in the terminal, copied character for character. Do not
rephrase, re-punctuate or shorten it on the way to the terminal: a printed VERDICT that
differs from the report's first line is two verdicts. The only thing the printed readout adds
is STATE lines about the report itself (where it was written), which do not exist in the file.

Then record the report. These reports are never published, so record passes `--url ""`:
that clears any link a past version left behind, which would otherwise point at an old page:

```bash
node .claude/lib/artifacts.js record --state-dir .trd-state/<feature> --kind audit-prd --path .trd-state/<feature>/audit-prd-report.md --command /audit-prd --url ""
```

There is no commit step. A failed write or record is one line in STATE; it never turns the run STUCK.

## Readout


**Format: the four-section readout in `.claude/rules/command-status.md`** — STATE, DECISIONS,
ISSUES, NEXT, in that order, one screen, written for someone who was not in the session.
Any section may be "none". The command-specific content below fills those sections; it does
not replace them.

A VERDICT line comes first, immediately after the `AUDIT:`/`SOURCE:` header and before any
heading below — one of exactly three forms, with every caveat or blocker named inline, never
merely counted (an unnamed caveat tells the reader nothing):

```
VERDICT: safe to proceed
VERDICT: proceed with these caveats: <named>
VERDICT: do not proceed until <named>
```

With no source supplied, "safe to proceed" is not available: however clean the findings, the
verdict is capped at `proceed with these caveats: no source supplied — fidelity and omission
unchecked`, because nothing checked the document against what it was written from.

Every line names the ACTION this audit took, not a classification of the finding and not
something left for the reader to do. Use these headings, omitting empty ones:

```
AUDIT: <path>    SOURCE: <path>

VERDICT: <one of the three forms above>

  DELETED — nothing in the source asked for these
  LOWERED TO THE CONSTITUTION FLOOR — no reason was given for exceeding it
  ADDED BACK — in the source, missing from this document
  ALREADY BUILT — name the file; decide whether the requirement survives
  PICK ONE — these contradict
  CONFIRM THESE ARE WANTED — no objective named
  FIXED THE CITATION — referenced ID did not resolve
  CORRECTED A STALE CLAIM — asserted something the code contradicts
  CAVEAT — what this run did NOT check: <n> claims left unchecked (see the PRD's
    ## Could Not Verify), plus any verifier that failed to report. Name both if both apply.
  REJECTED THESE FINDINGS — and the file that refutes each
  NO ACTION — sourced, listed for completeness
```

One screen. If 40 objectives are sourced, print the count as one line, not forty.

---

## Output discipline (see `.claude/rules/command-status.md`)

**End your final turn with the banner — last line of output, nothing after it:**

```
═══ COMMAND COMPLETE: /audit-prd ═══
<one-line summary of what was produced>
```

On unrecoverable failure, use `═══ COMMAND STUCK: /audit-prd ═══` followed by `Reason:` and `Next:` lines.

**Programmatic completion notify** — on the same final turn, invoke the user's `NOTIFY_ON_COMPLETE` shell command (if set) for webhook/queue/shell-pipeline integration:

```bash
.claude/hooks/notify-complete.sh "audit-prd" "complete" "<one-line summary>"
```

For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"`. The bracket-guard makes this a no-op when not configured.


---

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

This command runs **autonomously** from this invocation to the COMMAND COMPLETE banner.
**Do NOT pause mid-flow to ask the user to confirm decisions, review artifacts, verify
checkpoints, or defer to stakeholders.** The user already authorized the run by invoking
the command; do not ask them to authorize it again, in pieces.

`AskUserQuestion` is permitted ONLY in these four cases:

1. **Genuine requirement ambiguity** — the PRD/TRD/stack.md is silent on a decision
   that MUST be made, AND no reasonable default exists from documented constraints.
   *Try a default first; ask only if none fits.*
2. **Missing information that cannot be derived** — a value not in the codebase, env,
   config, or anywhere derivable (a user-specific URL, API key not in env, etc.).
3. **Truly irreversible destructive operations** — `--reset-state` with progress,
   `git push --force`, deleting user-authored files. Routine state mutations do NOT
   qualify.
4. **STUCK conditions** — retry exhaustion after the documented mitigations have run.

Outside these four cases: **decide based on documented constraints, document the
rationale in the artifact, and proceed.** The user iterates via `/refine-prd`,
`/refine-trd`, or `/implement-trd --resume` — not via mid-loop confirmation prompts.

Forbidden patterns:
- "Should I proceed to phase N+1?" → no — emit PHASE banner, proceed.
- "Please review this artifact before I continue." → no — finish the artifact, emit
  COMMAND COMPLETE.
- "Multiple approaches possible; which do you prefer?" → pick the best fit, document
  why, mention alternatives in the artifact if useful.
- "Should I check with product/legal/stakeholders?" → no — decide based on documented
  goals; the user can correct via /refine-*.
- "Checkpoint reached. Continue?" → continue. Always.
- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- "Given the previous step went cleanly, do you want me to pause and review?" → self-defeating: you just acknowledged there's nothing to address. PROCEED.

### Autonomy is the default, not a mode

The COMMAND COMPLETE banner is the first and only return of control. A STUCK condition after
retry exhaustion is the one thing that stops a run early. Everything in the table above is
forbidden unconditionally — there is no flag that turns this on, and none that turns it off.
