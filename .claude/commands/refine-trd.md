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

`/refine-trd` exists to get judgment the author did not have into the artifact. The author
recorded every such gap in the TRD's `## Open Questions` section — that section is this
command's input.

| Mode | Who answers | When |
|---|---|---|
| **Interactive** (default) | **You.** Each open question is put to you with `AskUserQuestion`. | A human is available. Your judgment is the point. |
| **`--auto`** | Two subagents: a `product-manager` closes the open questions, a `technical-architect` runs the challenge pass. | Unattended runs, or a first pass to shrink the list before you look. |

**The autonomy exemption is conditional on mode, not on command name.** `autonomy.md` exempts
this command because interactive mode's purpose is to ask. `--auto` obeys autonomy discipline
like any other command and asks nothing.

---

## Phase 0: Answer the open questions

### Interactive

Read `## Open Questions`. For each one, use **`AskUserQuestion`** — one question per call, with
the author's assumption offered as an option so a default is always one keystroke away.

Give real options, not a blank prompt. The author already stated what it assumed and what
goes wrong if that is mistaken; put both in front of the user. Batch related questions into
one call where the tool allows it, and ask the highest-consequence one first — the owner may
stop reading.

Do not ask questions the artifact already answers, and do not re-ask something the changelog
records as settled. A question the source resolved is a question the author should not have
raised; strike it and say so.

### `--auto`

**`--auto` closes every question. It leaves nothing open.**

The point of `--auto` is an unattended run that produces a finished artifact. A question left
open ships an incomplete document and gates nothing downstream — `/create-trd`, `/audit-*` and
`/implement-trd` all run straight over it. So every question gets a decision, and the owner
reviews the decisions afterwards rather than being waited on.

Spawn **one `product-manager` subagent** for this phase specifically — separate from whichever
agent runs the Phase 1 challenge pass. The two jobs are different: Phase 0 is product judgment
about what the owner would most likely want; Phase 1 is technical checking against code. One
agent doing both blurs the mandates.

Give it the open questions, the source, the design corpus and the codebase. Every answer
carries one of:

| Verdict | Meaning |
|---|---|
| **answered** | Evidence settles it. Cite the file, line, or document. |
| **default** | No evidence, but one choice is clearly conventional here. Say why, and that it is a default. |
| **OWNER-CALL** | Genuinely the owner's to make — business priority, scope trade-offs, risk appetite, naming, or a case where the evidence supports two reasonable readings. **Decide it anyway**, on the owner's behalf, and make the decision maximally reviewable. |

**`OWNER-CALL` is the one that matters, and "decide anyway" is the point.** Do not leave it
open and do not disguise it as `answered`. Record, in the artifact:

- the question, unchanged
- **the decision taken**
- **the reasoning** — what you weighed, and what you would have needed to decide differently
- an explicit marker that this was the owner's call, taken in their absence

The owner reads these and countermands what they disagree with. That only works if the
thinking is visible: a decision with no reasoning cannot be reviewed, only accepted. A
confident answer with its basis hidden is the failure this format exists to prevent — the
measured case being an author with no source for a performance target inventing one, where
everything downstream then treated it as real.

**The readout LEADS with every `OWNER-CALL` decision**, before removals, additions or anything
else. They are the reason the owner is reading it.

**The corpus states intent; the code states fact.** A design document is evidence of what was
decided, never of what exists. Where they disagree, the code wins and the disagreement is
itself worth reporting.

---

## Phase 1: Challenge pass (runs in both modes)


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

### Artifact link (see `.claude/rules/command-status.md`)

Unless `.claude/settings.json` sets `ensemble.publishArtifacts: false`, publish the refined TRD with
`Artifact({ file_path: "docs/TRD/<feature>.md", favicon: "📐" })` — the markdown FILE, never a
rendering of it — reusing the stored URL from `.trd-state/<feature>/artifacts.json` (key
`trd`) when one is present, and storing it when one is not. Emit the link ABOVE the
banner. A failed publish is one line of prose and nothing more; it never blocks the banner.

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
