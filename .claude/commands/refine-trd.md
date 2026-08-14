---
name: refine-trd
description: Refine and enhance existing TRD with stakeholder feedback and additional detail
version: 1.0.0
argument-hint: "[path-to-trd] <feedback>"
disable-model-invocation: true
---

Refine and enhance an existing Technical Requirements Document based on stakeholder
feedback, technical review, or identified gaps. Delegates to @technical-architect
for iterative refinement. Updates TRD while maintaining version history and traceability.

## Agent Delegation

This command delegates to **@technical-architect** from the vendored `.claude/agents/` directory.
The technical-architect specializes in technical requirements refinement and architecture decisions.

## Modes

`/refine-trd` runs in one of two modes. **The mode determines whether questions are allowed.**

| Mode | When | Behaviour |
|---|---|---|
| **Interactive** (default when a human invoked it) | A person is watching | Run the challenge pass, present findings, ask, apply their decisions. |
| **Non-interactive** (`--non-interactive`, or invoked by another command) | Unattended runs, composition into `/implement-trd` | Same checks, resolved deterministically: unsourced requirements are **removed** and listed; contradictions are raised as **STUCK**; buildability failures are reported with evidence. One readout, no questions. |

**The autonomy exemption is conditional on MODE, not on command name.**
`.claude/rules/autonomy.md` exempts this command because it is *intentionally interactive*.
That exemption applies to **interactive mode only.** In non-interactive mode this command
obeys autonomy discipline like every other, with `AskUserQuestion` restricted to the four
documented cases — and "this requirement has no source" is explicitly **not** grounds to
ask, because the deterministic resolution is to remove it and say so.

A fabricated requirement is *most* dangerous unattended, because nobody is there to ask
"what's the impact of this?" — which is how most of them were historically caught. That is
exactly why the challenge pass must be able to run without a human.

---

## Workflow

### Phase 1: Challenge pass (runs in both modes)

**Deletion is a first-class outcome of this command.** This is the change that matters:
previously every question this command asked was about what was *absent* — missing
considerations, insufficient granularity, opportunities missed, concerns not addressed —
so running it against a TRD carrying fabricated requirements made things worse. Asked
"are there performance concerns not addressed?", the honest answer *adds* a latency
criterion. This command must be able to take things out.

Type every line first — **objective | decision | task**, by nature not by section (a
measurable threshold is an objective wherever it appears). Then apply:

| Check | Applies to | Question |
|---|---|---|
| **Provenance** | objectives | Does it trace to the PRD, a named constraint, a measurement, or the user? |
| **Severity** | objectives | Is the *strictness* sourced, not just the requirement's existence? Anything exceeding a `constitution.md` floor must state why. |
| **Omission** | source → TRD | Which source objectives never appear in the TRD at all, and are not under Non-Goals? |
| **Buildability** | decisions | Can this be built as specified? |
| **Consistency** | pairs | Does it contradict a sibling — or a document that supersedes it? |
| **Derivation** | tasks, delivery machinery | Does every task, flag, rollout phase and guard name the objective it serves? |
| **Grounding** | tasks | Does every task carry a grounding block? Is anything the plan replaces left unnamed? |
| **Citations** | cross-artifact refs | Grep every referenced ID in the live target document; fail on a miss. |

**Severity applies to your own findings too.** A finding asserting *"this will regress
checkout"* or *"this needs a guard"* carries the same sourcing burden as an objective.
Inflating severity is the observed reviewer failure here, far more than striking valid
requirements — *"You've become far too conservative — this is a preproduction beta system;
I am currently the only user."*

**Never strike a requirement on judgment.** *"REQ-4 traces to nothing in the PRD"* is
checkable and permitted. *"I think REQ-4 is unnecessary"* is manufactured and forbidden.

### Phase 1b: Living-document handling

**Artifacts here are living documents** — many carry several versions and supersession
markers. A one-shot audit re-run on v1.5.1 will flag legitimately-derived v1.2.0
requirements as unsourced.

**On refinement, the source is: the original source ∪ every ruling cited in the changelog.**
Read the changelog before judging provenance. If the TRD or its PRD carries a supersession
marker, resolve what supersedes it and treat that as in-scope — a TRD verified against a
retired design certifies a retired design.

### Phase 2: Apply

**Interactive:** present findings grouped by action, ask, apply the user's decisions.

**Non-interactive:** remove unsourced requirements and list them; lower unsourced
severities to the `constitution.md` floor and list them; report buildability failures with
evidence; raise contradictions as STUCK, since resolving them needs a judgment call.

Then refine as asked — clarify, restructure, add what the feedback genuinely calls for.
Adding is legitimate; adding *unsourced* is not, and anything this command adds is subject
to the same checks above.

### Phase 3: Output

**1. TRD Update** — update in place, increment version, add a changelog entry recording
what was removed as well as what was added.

**2. Cross-references** — verify PRD alignment, update task IDs if changed, re-grep every
cross-artifact citation.

---

## Readout

**Every line names the action, not the classification.**

```
TRD: docs/TRD/<feature>.md    SOURCE: docs/PRD/<feature>.md + changelog rulings

  REMOVED — nothing in the source asks for these (2)
    A5     latency p95 <= 2000ms      no PRD line, no measurement, no user instruction

  LOWERED TO THE CONSTITUTION FLOOR — strictness had no source (1)
    Q-1    unit coverage 90% -> 60%   no reason was given for exceeding the floor

  ADD BACK — in the source, missing here (1)
    PRD 5.1 concurrent tool calls >=50 RPS — not present, not in Non-Goals

  CANNOT BE BUILT AS WRITTEN (1)
    D5     runtime kill switch        a prompt hook runs no code that can read an env var

  STUCK — these contradict, and choosing needs you (1)
    B009 deletes the code D5's rollback path depends on

  ADDED THIS PASS (3)
    ...  each with its source
```

## Expected Output

**Format:** Refined Technical Requirements Document (TRD)

**Location:** Same path as input TRD (in-place update)

**Structure:**
- **Updated TRD**: Enhanced TRD with feedback incorporated
- **Version History**: Changelog of updates and refinements
- **Refinement Summary**: Brief description of changes made

## Vendored Runtime

This command operates within the vendored `.claude/` runtime structure:
- Agent definitions: `.claude/agents/technical-architect.md`
- TRD location: `docs/TRD/`
- State tracking: `.trd-state/`
- Rules reference: `.claude/rules/constitution.md`

## Usage

```
/refine-trd [path-to-trd]
```

**Path Resolution:**
- If `<path-to-trd>` is provided, use that path directly
- If no path provided, read from `.trd-state/current.json` field `trd`
- Error if neither available

### Examples

```
/refine-trd docs/TRD/user-authentication.md   # Explicit path
/refine-trd                                    # Uses current.json
```

## Handoff

After refinement:
1. Review changes with stakeholders
2. Update `.trd-state/` if execution plan changed
3. Proceed to `/implement-trd` when ready for implementation
4. Or iterate with another `/refine-trd` if more feedback needed


---

## Output discipline (see `.claude/rules/command-status.md`)

**End your final turn with the banner — last line of output, nothing after it:**

```
═══ COMMAND COMPLETE: /refine-trd ═══
<one-line summary of what was produced>
```

On unrecoverable failure, use `═══ COMMAND STUCK: /refine-trd ═══` followed by `Reason:` and `Next:` lines.

**Programmatic completion notify** — on the same final turn, invoke the user's `NOTIFY_ON_COMPLETE` shell command (if set) for webhook/queue/shell-pipeline integration:

```bash
.claude/hooks/notify-complete.sh "refine-trd" "complete" "<one-line summary>"
```

For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"`. The bracket-guard makes this a no-op when not configured.
