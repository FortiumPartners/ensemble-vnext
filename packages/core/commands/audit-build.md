---
name: audit-build
description: Verify delivered code against its TRD and PRD, with traceability as the headline check
version: 1.0.0
argument-hint: "[path-to-trd] [--prd <path>] [--project <dir>]"
---

Verify the code that was actually delivered against what the TRD specified and what the PRD
required — and confirm every requirement has both an implementation and a test proving it.

## User Input

```text
$ARGUMENTS
```

If no path is given, use `current.trd` from `.trd-state/current.json`. If `--prd` is omitted,
use `current.prd` from the same file.

---

## What this command is for, and what it replaces

`/audit-prd` and `/audit-trd` verify **documents** — internal soundness, provenance,
buildability, consistency with the source they claim to trace to. Neither one opens the
delivered code. **This command does nothing else.** It answers three questions:

1. **Verification** — does the code match the TRD's tasks?
2. **Validation** — does it match the PRD's requirements?
3. **Traceability** — does every requirement have both an implementation AND a test proving
   it?

The third is the headline, and it is the check nothing else in this pipeline performs.
**A requirement with code and no test is a GAP, not a pass.** That is the acceptance
criterion, stated explicitly.

This command **replaces the per-task acceptance-criteria job** that used to run inside
`code-reviewer` during the implement loop (removed from that loop by the task that preceded
this one — `code-reviewer` stays on disk and in the scaffolded agent set, only its per-task
loop references moved here). Acceptance-criteria checking now happens once, over the whole
delivered surface, instead of once per task.

## The measured case this exists to catch

`sanitize_error_detail()` was documented in a design doc, inherited as fact through two
review passes, and **never existed in `src/` at all** — 0 hits in code, 5 in docs. A document
audit (`/audit-trd`) does not find that; it is checking the document's internal soundness, and
the document was internally consistent about a function that was never written. Only a check
that greps the delivered tree — this command's `traceability-audit` — finds it.

## What it checks

| Verifier | Checks |
|---|---|
| `traceability-audit` | **The headline.** For every indexed requirement: implemented + tested → pass. Implemented, no test proving the specific outcome → **GAP**. No implementation found in the delivered tree, regardless of what the docs say → **GAP**. Implementation present but doing something other than what was required → **mismatch**. |
| `verification-audit` | Does the delivered code match what each TRD task actually specified — reading the task's touched files, not trusting `implement.json` or a commit message that claims completion? |
| `validation-audit` | Does the delivered system satisfy the PRD's requirements, independent of how the TRD restated them? A requirement can survive faithfully into the TRD and still not be built. |
| `test-quality-audit` | Samples the tests the traceability check relies on. Distinguishes a test that asserts a specific outcome from one that only proves a call did not throw — "has a test" is gameable, and this catches the gaming. |
| `deterministic` | Citations resolve; nothing violates `stack.md` or `constitution.md`. |

## How traceability decides a requirement is proven — not just claimed

The easy way to fake this check is to report "has a test" whenever a test file merely imports
or exercises the same module. The verifier is instructed against that explicitly:

- It must find the **implementation** by reading the code's behavior, not by matching a
  function name that sounds right.
- It must find a test that asserts the requirement's **outcome** — the return value, the
  error path, the specific rejected input the requirement names — not a test that runs the
  code and checks nothing beyond "did not throw."
- A requirement documented in a design doc and referenced across two review passes is
  **still zero implementation** if grepping `src/` returns zero hits. The verifier is told to
  grep the tree directly and never assume presence from document mentions.
- `test-quality-audit` runs as a second, independent pass over a sample of the tests the
  traceability check would have accepted, specifically hunting for tautological assertions
  (mocking the exact thing under test, asserting the mock was called) and happy-path-only
  coverage that would pass the literal "a test exists" bar while proving little.

Together these mean the check that matters — implemented AND proven — cannot be satisfied by
a decoy test, and cannot be defeated by a document that insists something exists when the tree
says otherwise.

## What it may NOT do

**Findable only**, same discipline as `/audit-trd`. Every finding names a requirement or task
ID, a file, and either what is missing or what contradicts it — checkable in seconds. No
verifier may invent a requirement or strike one on judgment. Zero findings is a legitimate
result — do not manufacture findings to look thorough.

**This command reports gaps; it does not close them.** The reconcile stage may correct the
TRD's `## Could Not Verify` section, but it does not write application code or tests. A
TRACEABILITY GAP is a finding for the next `/implement-trd` pass, not something this command
fixes in place.

## Rejecting a bad finding is part of the job

Apply what survives; **reject what does not, and name the file that refutes it** — same
discipline `/audit-trd` uses, applied here to code instead of documents. In one measured run
6 of 9 findings from a document audit were wrong because a verifier resolved paths against the
wrong repository; the same failure mode applies here if a verifier reads the wrong project's
tree. Pass `--project <dir>` when the delivered code lives somewhere other than the repo
holding the TRD/PRD.

## `## Could Not Verify` — the section this command owns (jointly with `/audit-trd`)

This command rewrites the TRD's `## Could Not Verify` section with what is true after
checking the **delivered code**: claims confirmed implemented-and-tested are removed, claims
found to be gaps move to the readout (not this section), unchecked claims are kept with a
reason, new coverage gaps are added.

## Execution: the workflow is the orchestrator

```
Workflow({ name: "audit-build", args: { trd: "<path>", prd: "<source PRD path or empty>", project: "<dir or empty>" } })
```

The workflow returns a readout. Print it. Findings live in script variables and never enter
this context, so a large finding set costs nothing here.

**If the workflow is unavailable**, fall back to running the verifiers as parallel subagents
from this context and reconciling their findings yourself — the checks above are the
contract, the workflow is only the execution vehicle.

## Readout

Every line names the ACTION, not the classification. Use these headings, omitting empty ones:

```
AUDIT-BUILD: <trd path>    PRD: <path>

  TRACEABILITY GAPS — implemented, no test proving it
  MISSING IMPLEMENTATION — required, never built
  MISMATCH — built, but does something other than what was required
  UNTESTED-IN-PRACTICE — a test exists but does not prove the requirement
  FIX THE CITATION — referenced ID or path does not resolve
  REJECTED THESE FINDINGS — and the file that refutes each
  NO ACTION — implemented, tested, sourced
```

One screen. If there are 40 clean requirements, print the count as one line, not forty.

---

## Output discipline (see `.claude/rules/command-status.md`)

**End your final turn with the banner — last line of output, nothing after it:**

```
═══ COMMAND COMPLETE: /audit-build ═══
<one-line summary of what was produced>
```

On unrecoverable failure, use `═══ COMMAND STUCK: /audit-build ═══` followed by `Reason:` and `Next:` lines.

**Programmatic completion notify** — on the same final turn, invoke the user's `NOTIFY_ON_COMPLETE` shell command (if set) for webhook/queue/shell-pipeline integration:

```bash
.claude/hooks/notify-complete.sh "audit-build" "complete" "<one-line summary>"
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
