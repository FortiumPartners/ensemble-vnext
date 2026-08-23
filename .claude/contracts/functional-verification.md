# Functional verification contract

**This is the complete, binding instruction set for the functional-verification loop** —
deriving a success definition from a source, exercising a system against it, judging the
evidence, and fixing what is genuinely broken. It is read by three different agents at three
different moments (the success-definition author, the exerciser, the judge, and the
debugger), each of whom sees only the sections that apply to their stage. None of them reads
`verify-functional.js` or `implement-trd.md`; this file is the whole of what they need.

Three properties hold across every stage below and are not repeated at each one:

- **Evidence outranks assertion.** A criterion is gated first by a deterministic check — the
  artifact exists, is non-empty, and is newer than the code it claims to prove — before any
  agent is asked what the artifact shows.
- **The judgment is delegated; the control flow is not.** Whether a criterion is met is an
  agent's call. Whether the loop continues, stops, or has stalled is arithmetic in
  `packages/core/lib/functional-verification.js`, never an agent's own reading.
- **This loop assumes the requirements are fundamentally implemented.** It looks for the
  divergence that survives a green test suite, not a wholly absent capability. A wholly
  absent capability is an implementation failure caught upstream, and it is the one thing
  this loop refuses to iterate on.

---

## Evidence markers — the key travels with the grounding

Notes and reports produced by this loop carry evidence markers, same convention as TRD
grounding:

| Marker | Means | How much to trust it |
|--------|-------|----------------------|
| `[ran]` | Someone executed this and read the output | **Most trustworthy.** Treat as fact. |
| `[read]` | Someone opened the file and verified the claim | Trust it. |
| `[inferred]` | Deduced, not checked | **Verify before you rely on it.** |

Any line written into `.claude/verification-notes.md` (see "The notes file", below) carries
one of these three markers. An unmarked line is a claim of uniform-looking precision this
convention exists to prevent — do not write one.

---

## Deriving the success definition

**Who does this:** a `product-manager` agent, given **the source and nothing else** — no TRD
path, no TRD excerpt, no task list. It does not know what was built; it knows only what was
asked for.

**Three source kinds are valid.** The loop needs a statement of what success looks like; a PRD
is one way to supply that, not the only one. Whichever applies, the agent receives **that
source alone**:

| Source | Given to the agent as | Used when |
|---|---|---|
| **PRD** | the PRD path | feature work |
| **Reproduction** | the extracted `## Reproduction` text | a defect: steps, actual, expected |
| **Intended change** | the extracted `## Intended Change` text | a small change decided in conversation |
| **Behaviour preserved** | the extracted `## Behaviour Preserved` text | a refactor: the tests that passed before, and the surface that must not move |

**The isolation rule is the same for all three, and it is why the last two are passed as
EXTRACTED TEXT rather than as a TRD path.** A deriver that can see the task list writes
criteria the plan satisfies by construction, and verification becomes circular — it confirms
the plan was followed rather than that the outcome was reached. A reproduction and a recorded
decision are statements of *outcome*, and stay legitimate sources; the TRD file that happens
to contain them also contains the plan, and must never be handed over.

**Output:** `.trd-state/<feature>/success-definition.md` —

```markdown
# Functional Success Definition: <feature>

**Source**: docs/PRD/<feature>.md   <!-- or: <trd path> §Reproduction | §Intended Change -->
**Source kind**: prd | reproduction | intended-change
**Derived**: <ISO8601>
**Criteria**: <n>

| ID | Functional statement | Cites | Evidence that would prove it | Derivation |
|----|----------------------|-------|------------------------------|------------|
| FS-1 | A user can sign in with a valid password and reach the dashboard | FR-2, §4 line 51 | HTTP transcript: POST /auth/login → 200 with a session cookie; screenshot of the dashboard | [read] |
| FS-2 | A repeated submit does not create two orders | domain-derived: payment flows must not double-charge | Two POSTs with one idempotency key → one row in `orders` | domain-derived |
```

**The citation rule (mandatory).** Every row's `Cites` column names **a line or section of the
source** — a PRD line, the reproduction's expected-behaviour line, the recorded decision — or
the row is labelled `domain-derived` with its reasoning written out inline in that same
column — never bare. A row that can do neither — nothing in the source supports it and no
domain reasoning is stated — is **dropped, not invented**. This mirrors the PRD-authoring contract's
own rule: a missing criterion surfaces as a gap in coverage someone can notice; a fabricated
one is executed as if it were real and consumes a debug round before anyone questions it.

**The empty-definition rule.** Zero rows is a legitimate outcome, not a failure. When the
source yields no criteria that satisfy the citation rule, the file is still written, with
`**Criteria**: 0` and one paragraph explaining why — which line(s) were considered and why
none qualified. A missing file and an empty-but-present file are different failures and must
never be reported as the same thing: a missing file means the derive step did not run or
died; an empty file means it ran and correctly found nothing to check.

**`Evidence that would prove it` is a target, not a contract.** The exerciser aims to produce
that artifact. An exerciser that produces a *different* artifact proving the same functional
statement is not wrong — it records why in its notes rather than treating the definition's
suggestion as mandatory.

---

## The four stack hint rows (D12)

The framework ships hints about how to exercise a system, never a harness. This is
deliberate: how to exercise a given project is the project's own responsibility (its
`CLAUDE.md`, its `stack.md`, its existing suites), and this contract does not invent one where
none exists.

| Stack shape | Hint |
|---|---|
| Web UI | Browser driving — load the page, perform the user action, capture a screenshot or DOM assertion as the artifact |
| HTTP API | Request/response transcript, diffed against the declared interface (OpenAPI, route table, or equivalent) |
| CLI | Invoke the command as a user would, assert on its output (stdout, exit code, files it wrote) |
| Mobile | Simulator harness — drive the simulated app, capture a screenshot or an accessibility-tree assertion |

**Before applying any of these**, read the project's `CLAUDE.md`, `.claude/rules/stack.md`,
and its existing test suites — they may already document how this specific project starts up,
what ports it uses, and what a passing run looks like. The hint table is a starting point for
an unfamiliar stack, not a substitute for what the project already says about itself.

**A stack this table does not cover, and that the project's own docs do not resolve, is one
the exerciser cannot exercise.** It produces no artifact and states the reason plainly — "no
hint row matches this stack and the project's own docs do not document a way to exercise it" —
the same as any other criterion it cannot produce evidence for. It does **not** write `not
verifiable here` or any other judge status itself (see "The exercise discipline", below): that
is the judge's conclusion, drawn from the stated reason, not the exerciser's to assert.
Inventing a harness for a stack nobody documented a way to exercise is explicitly out of scope
(NG2) — do not build one, however plausible it seems in the moment.

---

## What counts as an evidence artifact

An artifact is a file on disk that a deterministic check can gate before any agent reads its
content:

- it **exists** at the claimed path;
- it is **non-empty** (more than zero bytes);
- its mtime is **newer than HEAD's commit time** — an artifact older than the code it claims
  to prove is not evidence of anything the current code does.

A claim that names no artifact — because none applies, or none could be produced — is not
automatically a failure. It carries a stated reason instead, and the criterion can still
resolve to `not verifiable here` on the judge's reading of that reason. What it cannot do is
resolve to `met`: an unbacked assertion is exactly what this loop exists to refuse.

---

## The exercise discipline

**One exerciser, one boot, every criterion.** The exerciser brings the system up **once** and
walks the **whole** criterion list in that single running instance — it does not start and
stop the system per criterion, and it does not run in parallel with other exercisers against
the same criteria. A human verifies a build the same way: start it once, walk the list. Ten
criteria against one already-running system is a longer walk, not ten startups.

**One artifact per criterion.** For each criterion, the exerciser performs the user action the
criterion describes and captures the artifact that would prove it (per the definition's
`Evidence that would prove it` column, or a different artifact it records the reason for
substituting). It returns a claim per criterion — an artifact path, or a stated reason none
exists — never a verdict. Deciding `met` / `not met` belongs to the judge, a different agent,
so nothing certifies its own evidence.

---

## The four judge statuses, and the unbuilt/misbehaving boundary (D14)

The judge assigns exactly one of four statuses to each criterion:

| Status | Means | Ever a gap? |
|---|---|---|
| `met` | The evidence, having passed the deterministic gate, actually shows the criterion is satisfied | No |
| `not_met` | The capability exists and was exercised, but the evidence shows it does not do what the criterion requires | **Yes** — handed to the debugger |
| `not_verifiable` | The project has no way to exercise this criterion — no harness matches its stack, or nothing in the project's own docs authorizes a target | No — this is not a gap and is never handed to the debugger |
| `unbuilt` | The capability the criterion names is **absent**, not misbehaving — there is nothing here to debug, only something to build | No — this is not a gap in the debugger's sense; it ends the loop |

**The unbuilt/misbehaving boundary is the load-bearing distinction in this contract.**
`app-debugger`'s own stated exclusion is *"anything that's really a missing feature — that's
implementation work, not debugging."* Honoring that boundary means: a criterion the judge
assigns `unbuilt` is **never** hidden inside `not_met` and never handed to the debugger. It
ends the loop immediately, even when ordinary `not_met` gaps exist alongside it — a report
that iterates on the fixable half while staying silent about "this was never built" is the
more misleading of the two possible outputs.

**Do not collapse `unbuilt` into `not_verifiable`, and do not collapse either into `not_met`.**
The three answer different questions and each one licenses different next steps:

- `not_met` → keep debugging, there is code here to fix.
- `not_verifiable` → nothing this loop can do; the project does not offer a way to check.
- `unbuilt` → stop; this was never delivered, and no amount of debugging fixes that.

Reporting `not_verifiable` for something that is actually `unbuilt` recreates exactly the
"green for a check that never ran" failure this loop exists to catch. Reporting `unbuilt` for
something that is actually just broken wastes the one exit that is supposed to mean
"implementation did not deliver this."

---

## The debugger's brief

**Given:** every `not_met` gap — its criterion id, functional statement, the judge's stated
reason, the evidence artifact path, and the implicated source files — plus the verifier's
notes and the stack hints.

**Does:** fixes the code in place, one gap at a time. Nothing else.

**Brings the environment to the new code before returning — and this is not optional.**

The next iteration's Exercise stage measures whatever is RUNNING, not the source you just
edited. On a hot-reloading local server those are the same thing. Anywhere else they are
not, and if nothing refreshes the environment the loop measures the OLD build: the gap
cannot close, the same gaps come back, the stall rule fires, and the run exits `stalled`
**blaming the debugger for a fix that actually worked.**

`checkEvidence` does not save you here — it makes it worse. The artifact from the next
iteration is genuinely newer than the freshness floor, so tier 1 PASSES. The evidence looks
fresh while describing stale code, which is the precise shape of a false negative this
whole feature exists to prevent.

So: read `.claude/rules/verification.md` §2 and run the refresh command for the environment
you are verifying against. If that file names no refresh command for it, or marks the
environment as one the loop may not deploy to, then **say so in your return** — the loop
must report that it cannot correct against this target rather than iterating into a stall.

**There is no rule anywhere that forbids the loop from deploying.** Observed 2026-08-20: a
run asserted it was "deliberately sandboxed — it edits + re-checks but doesn't perform
outward-facing deploys" and stopped at source. Nothing in this contract said that, then or
now. A live verification loop that cannot bring its target to the code it just wrote has no
correction loop at all. What governs deploys is §2 of `verification.md` — the owner's
explicit per-environment answer — not an inference.

**Does not re-verify its own fix.** The next iteration's Exercise and Judge stages are the
check, running seconds later against a fresh boot of the system. A debugger that tries to
confirm its own fix is re-creating the self-certification problem the judge exists to avoid
one level down.

**Does not implement absent capability.** If a gap turns out, on investigation, to be a
missing feature rather than broken behaviour — the boundary above — the debugger reports it
back as `unbuilt`, exactly as `app-debugger`'s own frontmatter already instructs it to for any
other missing-feature request. It does not build the feature to close the gap. Implementing
what was never delivered is implementation work, routed through the phase loop, not something
a debug round absorbs quietly.

**Returns**, per gap: what was changed, or why it could not be fixed. It does not write to any
TRD and it does not render a phase — there is no remediation phase or task graph in this loop;
one debugger fixing gaps sequentially cannot collide with itself on a file, so the machinery
that exists solely to prevent that collision has nothing to do here.

---

## The notes file — `[read]` / `[ran]` / `[inferred]`, and correct-don't-work-around

`.claude/verification-notes.md` is what the verifier has learned about running this specific
project, across every run of this loop. It is committed (see S-1, below) and read at the start
of every Exercise stage.

**Every line added to it carries one of the three evidence markers** from the top of this
contract — `[read]`, `[ran]`, or `[inferred]` — stating how the note was established, so the
next reader knows how much to trust it without re-deriving that themselves.

**Correct, don't work around.** When the notes reveal that a documented way of exercising the
project is wrong — a stale port number, a command that no longer exists, a stack hint that
does not apply — the correction goes into the notes as a new marked line. It is not silently
routed around by inventing an ad hoc workaround that leaves the stale note in place for the
next run to trip over again. A workaround fixes one iteration; a correction fixes every
iteration after it.

---

## S-1 — the credential rule

`.claude/verification-notes.md`, the report, and the success definition record **where** a
credential comes from, **never its value**. "Test account credentials are in `.env.test`
under `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`" is a legitimate note. The email address or
password itself is not, under any evidence marker. This file is committed, so this rule is not
optional — a value written once is a value in git history permanently.

---

## S-2 — the authorization rule

The verifier exercises only a target the project authorizes: something named in `stack.md`,
`CLAUDE.md`, or an explicitly local/ephemeral instance (a dev server the exerciser itself
starts and stops, a local database, a simulator). Where nothing in the project's own
documentation authorizes a target, the exerciser produces no artifact and states the reason —
"target not authorized by stack.md/CLAUDE.md and not a local/ephemeral instance" — never to
a guessed endpoint, and never to a production or shared environment the project did not name. An
unauthorized target is not a quality problem; it is a production-impact one, and silence in
the project's docs is exactly where an agent would otherwise improvise its way into exercising
something it should not touch. The judge is the one who reads that stated reason and resolves
the criterion to `not_verifiable here` — the exerciser states the reason, it does not name the
status.

---

## The report shape

Every criterion in the success definition appears in the report, and every one carries the
status the **final** iteration produced — this loop re-walks the full criterion list on every
iteration, so there is never a carried-forward status to disambiguate from a fresh one.

- `not_verifiable` criteria render in their own section, with the stated reason, never folded
  into failures — a project that cannot check something is not the same as a project that
  checked and failed.
- `unbuilt` criteria render in their own section too, under an outcome line that says plainly
  implementation did not deliver these criteria and that the loop stopped rather than
  debugging absent code.
- Every `not_met` criterion's section carries what the debugger attempted on each iteration it
  touched that gap, so the report shows the history of an attempted fix, not just its final
  state.

**What this contract never instructs:** inventing a criterion the source does not support, and
inventing a harness for a stack the hint table and the project's own docs do not cover. Both
are explicit non-goals of this feature — the loop reports honestly what it cannot check or
cannot verify rather than manufacturing a way to make the report look more complete than the
evidence supports.
