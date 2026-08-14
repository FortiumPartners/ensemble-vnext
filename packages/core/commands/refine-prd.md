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

| Mode | When | Behaviour |
|---|---|---|
| **Interactive** (default when a human invoked it) | A person is watching | Run the challenge pass, present findings, ask, apply their decisions. |
| **Non-interactive** (`--non-interactive`, or invoked by another command) | Unattended runs, composition into other commands | Same checks, resolved deterministically: unsourced requirements **removed** and listed; contradictions raised as **STUCK**. One readout, no questions. |

**The autonomy exemption is conditional on MODE, not on command name.**
`.claude/rules/autonomy.md` exempts this command because it is *intentionally interactive*
— that applies to **interactive mode only.** In non-interactive mode it obeys autonomy
discipline like every other command, and "this requirement has no source" is explicitly
**not** grounds to ask: the deterministic resolution is to remove it and say so.

---

## Workflow

### Phase 1: Challenge pass (runs in both modes)

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
