---
name: refine-prd
description: Refine and enhance existing PRD with stakeholder feedback and additional detail
version: 1.0.0
argument-hint: "[path-to-prd] <feedback>"
disable-model-invocation: true
---

Refine and enhance an existing Product Requirements Document based on stakeholder
feedback, additional research, or identified gaps. Delegates to @product-manager
for iterative refinement. Updates PRD while maintaining version history and traceability.

## Agent Delegation

This command delegates to **@product-manager** from the vendored `.claude/agents/` directory.
The product-manager specializes in requirements refinement and stakeholder alignment.

## Modes

`/refine-prd` exists to get judgment the author did not have into the artifact. The author
recorded every such gap in the PRD's `## Open Questions` section — that is this command's input.

| Mode | Who answers | When |
|---|---|---|
| **Interactive** (default) | **You**, via `AskUserQuestion`, one question at a time with the author's assumption offered as an option | A human is available |
| **`--auto`** | Two subagents: one `product-manager` closes the open questions, a second agent runs the challenge pass | Unattended, or a first pass to shrink the list |

**The autonomy exemption is conditional on mode.** Interactive mode's purpose is to ask;
`--auto` obeys autonomy discipline and asks nothing.

---

## Phase 0: Answer the open questions

**Interactive:** put each open question to the user with `AskUserQuestion`. Real options, not
a blank prompt — the author stated its assumption and what breaks if that is wrong, so offer
both. Highest-consequence question first.

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


**Deletion is a first-class outcome.** Previously every question this command asked was
about what was *absent* — unclear requirements, missing scenarios, incomplete criteria —
so run against a PRD carrying fabricated requirements it made things worse. This command
must be able to take things out.

For every requirement:

| Check | Question |
|---|---|
| **Provenance** | Does it trace to the user's words, a source document, a measurement, or a named constraint? |
| **Severity** | Is the *strictness* sourced, not just the requirement? A number that appeared without a source is an invention even when the underlying need was real. |
| **Omission** | Which source requirements never appear in the PRD, and are not under Non-Goals? Dropping is the commoner failure — check this first. |
| **Consistency** | Does it contradict a sibling, or a document that supersedes this one? |

**Verify against the SOURCE — the original document or transcript — never against a
summary of it.** Checking a PRD against a paraphrase certifies the paraphrase.

**Severity applies to your own findings.** A finding asserting *"this will break onboarding"*
carries the same sourcing burden as a requirement. Reviewers inflating severity is the
observed failure, not reviewers striking valid requirements.

**Never strike a requirement on judgment.** *"REQ-4 traces to nothing in the source"* is
permitted; *"I think REQ-4 is unnecessary"* is manufactured and forbidden.

### Phase 1b: Living-document handling

**On refinement, the source is: the original source ∪ every ruling cited in the changelog.**
Read the changelog before judging provenance, or legitimately-derived earlier requirements
get flagged as unsourced. Where the PRD carries a supersession marker, resolve what
supersedes it and treat that as in-scope.

### Phase 2: Apply

**Interactive:** present findings grouped by action, ask, apply the user's decisions.
**Non-interactive:** remove unsourced requirements and list them; report contradictions as
STUCK.

Then refine as the feedback asks. Adding is legitimate; adding *unsourced* is not — anything
added this pass is subject to the same checks, including any requirement that arose from
answering "is anything missing?"

### Phase 3: Output

**1. PRD Update** — in place, version incremented, changelog recording removals as well as
additions.

**2. Cross-references** — flag if a TRD exists and is affected; re-grep cross-artifact
citations.

---

## Readout

**Every line names the action, not the classification.**

```
PRD: docs/PRD/<feature>.md    SOURCE: <document | transcript> + changelog rulings

  ADD BACK — in the source, missing here (1)
    Source records an LLM rewrite of descriptions; the PRD does not carry it

  REMOVED — nothing in the source asks for these (2)
    NFR-3   99.9% uptime target      no source
    REQ-7   p95 latency <= 2000ms    no source

  STUCK — these contradict, and choosing needs you (0)

  ADDED THIS PASS (3)
    ...  each with its source
```

## Expected Output

**Format:** Refined Product Requirements Document (PRD)

**Location:** Same path as input PRD (in-place update)

**Structure:**
- **Updated PRD**: Enhanced PRD with feedback incorporated
- **Version History**: Changelog of updates and refinements
- **Refinement Summary**: Brief description of changes made

## Vendored Runtime

This command operates within the vendored `.claude/` runtime structure:
- Agent definitions: `.claude/agents/product-manager.md`
- PRD location: `docs/PRD/`
- Rules reference: `.claude/rules/constitution.md`

## Usage

```
/refine-prd [path-to-prd]
```

**Path Resolution:**
- If `<path-to-prd>` is provided, use that path directly
- If no path provided, read from `.trd-state/current.json` field `prd`
- Error if neither available

### Examples

```
/refine-prd docs/PRD/user-authentication.md   # Explicit path
/refine-prd                                    # Uses current.json
```

## Handoff

After refinement:
1. Review changes with stakeholders
2. Proceed to `/create-trd` if ready for technical planning
3. Or iterate with another `/refine-prd` if more feedback needed


---

## Output discipline (see `.claude/rules/command-status.md`)

**End your final turn with the banner — last line of output, nothing after it:**

```
═══ COMMAND COMPLETE: /refine-prd ═══
<one-line summary of what was produced>
```

On unrecoverable failure, use `═══ COMMAND STUCK: /refine-prd ═══` followed by `Reason:` and `Next:` lines.

**Programmatic completion notify** — on the same final turn, invoke the user's `NOTIFY_ON_COMPLETE` shell command (if set) for webhook/queue/shell-pipeline integration:

```bash
.claude/hooks/notify-complete.sh "refine-prd" "complete" "<one-line summary>"
```

For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"`. The bracket-guard makes this a no-op when not configured.
