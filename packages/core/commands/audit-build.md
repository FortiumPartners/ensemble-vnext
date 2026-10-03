---
name: audit-build
description: Verify delivered code against its TRD and PRD, with traceability as the headline check
version: 1.0.0
argument-hint: "[path-to-trd] [--prd <path>] [--project <dir>] [--report-only]"
# Expensive, and its description matches how a user would phrase the task —
# so it must not be picked up by description match. Scope authorization is autonomy.md's job, not this flag's.
disable-model-invocation: true
---

Verify the code that was actually delivered against what the TRD specified and what the PRD
required — and confirm every requirement has both an implementation and a test proving it.

## User Input

```text
$ARGUMENTS
```

If no path is given, use `current.trd` from `.trd-state/current.json`. If `--prd` is omitted,
use `current.prd` from the same file.

**No TRD (D14).** No path argument was given, AND `current.json` is either absent or its
`trd` is null or empty (this is exactly what closing a feature leaves behind) → do not call
the workflow. End immediately:

```
═══ COMMAND STUCK: /audit-build ═══
Reason: no TRD path given and .trd-state/current.json names none (closing a feature clears it)
Next:   /audit-build docs/TRD/<feature>.md
```

**Parse `--report-only`.** Present → produce the findings and stop at the readout; absent →
the automatic `/implement-trd --reconcile` chain below applies. The flag was documented at
§"`--report-only` suppresses the chain" before any step parsed it, so a user who typed it got
a full implementation run anyway.

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

**This command does not write application code or tests.** The reconcile stage may correct
the TRD's `## Could Not Verify` section; it never implements. Writing the code is
implementation work and belongs to `/implement-trd`, with its gates and its review.

### But it DOES close the loop — chaining is the default (2026-09-20, owner)

Reporting a gap and leaving the owner to carry it into the TRD by hand was measured costing
several turns of confusion, with "completion" and "most of the work wasn't done" both true and
neither reconcilable without a human in the middle. Turning a gap into a task is a mechanical
transform and nothing performed it.

**Split the gaps by whether they need a DECISION:**

| gap | meaning | action |
|---|---|---|
| **A task exists in the TRD and was not built** | nothing to decide — the plan already says what to do | write it back to `pending` and chain |
| **A requirement has no task covering it** | someone must decide HOW — that is design | record it, STOP, report it |

Only the first chains. The second is a TRD change, and a command that invents tasks to close
its own findings is manufacturing requirements — the failure `/create-prd` and `/create-trd`
spend most of their length preventing.

For chainable gaps, the command records each as a discovery and runs the fix as part of this
run (steps in "After the workflow returns", below):

```
Skill({ skill: "implement-trd", args: "<trd-path> --reconcile --chained" })
```

`--chained` makes the fix run end with one RETURN line instead of its own banner, so this
command owns the run's single banner (`implement-trd.md` §3.7).

`--reconcile` is the right flag, not `--resume`: resume SKIPS anything already marked
success, which is exactly the state a phantom task is in.

**`--report-only` suppresses the chain** when you want the findings without the work.

**Why this does not violate the command-scope rule.** `.claude/rules/autonomy.md` says a
command's authorization does not reach a successor command. It survives because this is
`/audit-build`'s **documented contract**, not a decision the command makes at runtime:
invoking it authorizes the audit and the mechanical repair, the same way invoking
`/implement-trd` authorizes its gates. What the rule forbids is a command *deciding on its
own* to continue — which is precisely why design-level gaps stop rather than chain.

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
Workflow({ name: "audit-build", args: { trd: "<path>", prd: "<source PRD path or empty>", project: "<dir or empty>", report_only: <true if --report-only was parsed, else false>, trdHash: "<the trdHash, computed as below>", previous: <on a re-audit only: { reportPath, auditedCommit, index, trdHash }> } })
```

**`trdHash` covers only the TRD's `## Objectives` and `## Master Task List` sections**, never the
whole file, so promoted rows and a rewritten Could Not Verify section do not defeat requirement-list
reuse. Compute it with this command and pass it on every run, first audits included (it finds the
sections the way the TRD parser does, so a numbered `## 4. Master Task List` counts, and it hashes
the whole file when a TRD has neither section, so such a TRD never hashes the same after an edit):

```
node .claude/lib/audit-rounds.js trd-hash '{"trd":"<trd-path>"}'
```

`report_only` is not decoration. The workflow drafts the readout, and every "chains to
`/implement-trd --reconcile`" line in it is a claim about what happens next. Omit the flag on a
`--report-only` run and the printed readout announces a handoff that was suppressed — the
false-completion signal the destination wording exists to remove.

The workflow returns a readout, plus `handoff` (the findings the fix run can act on) and `index`
(the requirement list). Print the readout — **as written into the report (next section), not
reworded.** Findings live in script variables and never enter this context, so a large finding
set costs nothing here.

**If the workflow is unavailable**, fall back to running the verifiers as parallel subagents
from this context and reconciling their findings yourself — the checks above are the
contract, the workflow is only the execution vehicle.

## Writing the audit report (D1, D2, D12)

**Right after the workflow call above returns** — before printing the readout, and before
any `/implement-trd --reconcile` chain below, on `--report-only` runs too — write
`.trd-state/<feature>/audit-build-report.md` (`<feature>` is the TRD's basename without its
extension), overwriting whatever report was there from a previous run:

```markdown
<the readout's VERDICT: line, copied — the report's first line>

# Audit report: <feature>

- Date: <YYYY-MM-DD>
- Audited commit: <output of `git rev-parse --short HEAD`, or "unknown" if it fails>
- TRD: <trd path>
- PRD: <prd path, or "none">
- Findings: <n> · applied: <n> · rejected: <n> · still unverified: <n> · verifiers reporting: <as returned>

<the readout, verbatim as printed below — it opens with the AUDIT-BUILD: header and its VERDICT: line>
```

The workflow's return already carries `findings`, `applied`, `rejected`, `still_unverified`
and `verifiers_reporting` — this header adds only the date and `git rev-parse --short HEAD`.
The report opens with the VERDICT line so a reader sees the verdict before anything else; the
readout below repeats it. Keep the `- Audited commit:` line and the `VERDICT:` line exactly as
shown: the close record below copies both.

**One text, written once, printed as written.** Settle the readout's final wording — the
`AUDIT-BUILD:` header, the `VERDICT:` line and every finding line — BEFORE writing this file,
then print that same text in the terminal, copied character for character. Do not rephrase,
re-punctuate, shorten or "plain-English" it on the way to the terminal: a printed VERDICT that
differs from the report's first line by so much as a dash is two verdicts, and the owner reads
one while the close record holds the other. If the wording can be clearer, make it clearer in
the text you write here; the terminal then shows the improved text too. The only thing the
printed readout adds is STATE lines about this report itself (where it was written, whether
it was committed, the link) — those come after the write and do not exist in the file. A failed write is one line in
STATE; it never blocks the reconcile chain and never turns the run STUCK.

## After the workflow returns: rounds, the fix run, the close

`audit-rounds.js` (`.claude/lib/audit-rounds.js`) owns whether this run chains a fix, re-audits,
or closes. The decision is its `decide`, never your reading of the findings. Skip every step in
this section except the report and the readout when the run is `--report-only`: nothing is
recorded, handed off or closed.

**0. A stale wake-up does nothing.** Every fallback `ScheduleWakeup` this command schedules
carries the workflow run id in its prompt. On ANY re-entry (a wake, a resume), first run
`node .claude/lib/audit-rounds.js stale-wake '{"stateDir":".trd-state/<feature>","runId":"<run id>"}'`.
It matches on the run id alone, never the commit: a new audit at an unchanged commit is not stale.
When it prints `{"stale":true}`, print one line (this audit run already recorded its round) and stop:
no workflow, no report, no banner.

**1. Count.** Tally the whole `handoff` in one call:
`node .claude/lib/audit-rounds.js tally '{"handoff":<the workflow's handoff array>}'` returns
`{ defects, testGaps, uncovered }`. An item with `covered: false` counts only as uncovered, never
as a defect or test gap. (`classify '{"action":"<action>","check":"<check>"}'` gives one item's
class — `defect`, `test-gap` or `other` — for step 3.)

**2. Record and decide.** Record the round (skipped on `--report-only`):
`node .claude/lib/audit-rounds.js record '{"stateDir":".trd-state/<feature>","round":{"round":<n>,"runId":"<run id>","auditedCommit":"<the report header's commit>","trdHash":"<the trdHash above>","verdict":"<verdict>","defects":<n>,"testGaps":<n>,"uncovered":<n>,"ts":"<ISO time>"}}'`,
then write the workflow's returned `index` to `.trd-state/<feature>/audit-index.json`
(overwritten each round). Then run `node .claude/lib/audit-rounds.js decide '{"stateDir":".trd-state/<feature>","verdict":"<verdict>","defects":<n>,"testGaps":<n>,"uncovered":<n>,"reportOnly":false}'`;
it returns `{ chain, reaudit, close, capReached, caveats }`. `round` is the number of ledger lines
since the last close, counting this one. The cap is two re-audits after defects, so at most three
audits (a first audit and two re-audits).

**3. Chain the fix.** When `chain` is true, record each COVERED handoff item whose class is
`defect` or `test-gap` as a discovery (an `other` item — a citation to fix, a question for the
owner — is reported, never turned into a build task):
`require("./.claude/lib/discovered").record(".trd-state/<feature>", { kind: "gap", foundBy: "audit-build", blocksFeature: true, phase: 1, summary: "[<class>] <item summary>", evidence: "<item evidence>" })`,
then run `Skill({ skill: "implement-trd", args: "<trd-path> --reconcile --chained" })`. The fix
run ends with a `[STATUS: /implement-trd] RETURN →` line; anything it reports as not built is a
caveat. **Uncovered items (`covered: false`) are never recorded for the fix run or chained.**
They are reported for design, and the feature stays open.

**4. Close, or re-audit.**
- `close` true: after the chained run's RETURN line, perform `/close-feature`'s "The close step"
  (`.claude/commands/close-feature.md`) with `"closedBy": "audit"`, `"note": null` and
  `"audit": { "verdict": "<the VERDICT line>", "report": ".trd-state/<feature>/audit-build-report.md", "auditedCommit": "<the header's value>" }`,
  except that its commit is folded into the one below. Then commit, publish and open the PR as
  below, and print the run's single banner. Add every caveat `decide` returned, and anything
  the fix run did not finish, to the readout. A feature that is already closed (a re-audit)
  gets its `closed.json` rewritten with this run's audit fields.
- `reaudit` true: the feature stays open and NEXT is `/audit-build` (the next round passes
  `previous` and `trdHash`, below). Commit the report; no close record, no PR.
- `capReached` true: **the feature stays open. It never closes with a caveat while a defect is
  open.** The defects still went to the fix run (step 3), but they are not re-audited. Commit the
  report; no close record, no PR. The readout names each open defect, and NEXT is the owner's
  call, not another audit: `/close-feature docs/TRD/<feature>.md` once satisfied. Never NEXT
  `/audit-build` here.
- Neither (uncovered items, or `do not proceed` with no defects — any test gaps are still
  chained): the feature stays open;
  say so in STATE, and NEXT is the design work the readout names.

**On a re-audit** (the ledger already has a round), pass the workflow `previous`:
`{ reportPath: ".trd-state/<feature>/audit-build-report.md", auditedCommit, index, trdHash }`,
taking `auditedCommit` and `trdHash` from the last ledger round and `index` from
`.trd-state/<feature>/audit-index.json`, along with `trdHash` for the TRD as it is now. When the
hashes match the workflow reuses the index. **A re-audit does not resample.** Every verifier checks
only whether the previous round's defects are fixed and the files changed since that audited commit.

**Out-of-scope items.** The workflow also returns an `outOfScope` list: things a re-audit noticed
beyond that scope. Record each as a non-blocking discovery, never a finding and never chained:
`require("./.claude/lib/discovered").record(".trd-state/<feature>", { kind: "gap", foundBy: "audit-build", blocksFeature: false, phase: 1, summary: "[out-of-scope] <why>", evidence: "<evidence>" })`,
and list them in the readout (ISSUES, under "noticed outside this re-audit's scope"). They never
change the verdict, `decide`, or whether the feature closes.

**Test findings.** A finding from the `test-quality` check is a test gap. Test gaps are fixed in
the fix pass, but they never block closing and never trigger a re-audit. A weak test matters only
when it masks a real defect, and then it is reported as that defect by its own check.

**Commit, so it travels with the branch.** On any branch other than the default one, commit
the report, and the close record when one was written, in one commit and nothing else:

```bash
git add .trd-state/<feature>/audit-build-report.md .trd-state/<feature>/closed.json
git commit -m "docs(audit): audit-build report for <feature>" -- .trd-state/<feature>/audit-build-report.md .trd-state/<feature>/closed.json
```

(Drop `closed.json` from both lines when the audit did not close the feature.) On a close, this commit comes after the chained fix run, so the fix run's own commits are already on the branch. The pathspec
keeps the commit to those files whatever else is staged. **On the default branch, do not
commit**: the owner decides what lands there, so NEXT tells them to commit the report and close
record. A failed
commit is one line in STATE, never STUCK.

**Publish it** (`.claude/rules/command-status.md` "Artifact links"; same publish-and-remember
shape as `implement-trd.md` §9.0a):

```
Artifact({ file_path: ".trd-state/<feature>/audit-build-report.md",
           url: "<artifacts.json's audit-build-report key, if present>" })
```

Store the returned URL back into `.trd-state/<feature>/artifacts.json` under
`audit-build-report`, so the next audit of this feature updates the same link instead of
minting a second one. **With publishing off (`ensemble.publishArtifacts: false`) or a failed
publish, STATE names the local report path instead of a link — one line, never STUCK, never
retried.** STATE always names the report path; add the link above it only when one was made.

**Open the pull request.** Only when the audit closed the feature (a re-audit included), the
run is not `--report-only`, and the audit commit above succeeded. When "Publish it" just
changed `artifacts.json`, commit that file first (`git commit -m "chore(<feature>): store audit
report link" -- .trd-state/<feature>/artifacts.json`), so the stored link is on the branch the
PR carries. Write a short PR body (the VERDICT line and the report link, or its path) to a
temp file, then run:

```bash
node .claude/lib/pull-request.js ensure --title "<feature>: <one line>" --body-file <tmp> \
  --expect-branch "<branch from .trd-state/<feature>/implement.json>"
```

`--expect-branch` makes it skip when the checked-out branch is not the one the feature was built on (omit it only when `implement.json` has no `branch`). It prints one JSON line `{action, url, reason}` and always exits 0; it acts only when
`ensemble.openPullRequest` is `auto`, and it never merges. STATE names the URL, or the
skip/failed reason, in one line — never STUCK, never retried. No audit commit, no PR.

## Readout


**Format: the four-section readout in `.claude/rules/command-status.md`** — STATE, DECISIONS,
ISSUES, NEXT, in that order, one screen, written for someone who was not in the session.
Any section may be "none". The command-specific content below fills those sections; it does
not replace them.

A VERDICT line comes first, immediately after the `AUDIT-BUILD:`/`PRD:` header and before any
heading below — about the DELIVERED CODE, not about fixing anything (this command writes no
application code or tests). One of exactly three forms, with every caveat or blocker named
inline, never merely counted:

```
VERDICT: safe to proceed — every requirement is implemented and tested
VERDICT: proceed with these caveats: <named>
VERDICT: do not proceed until <named>
```

The printed VERDICT line is the report's first line, character for character (see "One text,
written once, printed as written", above) — the `safe to proceed` form is printed exactly as
shown, em dash included, never re-worded into a sentence of your own.

Every line names the ACTION, not the classification — and, for a gap, WHERE IT GOES NEXT.
This command applies almost none of these findings itself (see "But it DOES close the loop",
above); naming the destination is how the reader knows what still has to happen. Use these
headings, omitting empty ones:

```
AUDIT-BUILD: <trd path>    PRD: <path>

VERDICT: <one of the three forms above>

  TRACEABILITY GAPS — implemented, no test proving it. A covering task exists in the TRD:
    chains to /implement-trd --reconcile. No task covers the requirement: recorded and
    reported here, not closed.
  MISSING IMPLEMENTATION — required, never built. Same split: a covering task exists ->
    chains to /implement-trd --reconcile; no covering task -> reported, not closed.
  MISMATCH — built, but does something other than what was required. The task that produced
    it exists in the TRD, so this always chains to /implement-trd --reconcile.
  UNTESTED-IN-PRACTICE — a test exists but does not prove the requirement
  FIXED THE CITATION — a referenced ID or path did not resolve AND the fix was inside this
    run's own rewrite of the TRD's Could Not Verify section. A citation that does not resolve
    anywhere else in the TRD is reported, not fixed: this step edits no other section.
  REJECTED THESE FINDINGS — and the file that refutes each
  NO ACTION — implemented, tested, sourced
```

`--report-only` (parsed above, before any of this) suppresses every `/implement-trd
--reconcile` handoff named in the block above — the findings still print under these
headings, nothing chains. **Say so on the line**: a gap whose chain was suppressed reads
"work for `/implement-trd --reconcile`, not handed off on this run", never "chains to". That
is why `report_only` is passed to the workflow, which drafts the readout.

One screen. If there are 40 clean requirements, print the count as one line, not forty.

**Name the round and the reason.** STATE says which round this was ("round 2 of at most 3") and
why the feature closes or is re-audited (for example "defects found, so one more audit;
re-audits used: 1 of 2", or "only test gaps, fixed and closed"). When `capReached`, STATE says the
feature stays open, ISSUES names each open defect and says its fix was not re-audited, and nothing
says the feature closes with a caveat.

**NEXT.** When `capReached` is true: a line saying the feature stays open and closing it is your
call once you are satisfied, then `/close-feature docs/TRD/<feature>.md` alone in its fenced block;
never `/audit-build`. When `reaudit` is true: `/audit-build <trd>` alone in its fenced block. When the audit closed the feature and a PR is open (`action` `opened` or
`updated`): a line saying to merge the PR once you have reviewed it (merging stays yours), in words, no
command. Closed on a feature branch with no PR: a line saying to open a PR for the branch.
Closed on the default branch (nothing was committed): a line saying to commit the report and
close record. On `do not proceed` with nothing chained: the design work the
readout names.

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
