# Assessment rubric — old vs new generator pipeline

The counts in `collect.py` are inputs. **The assessment is a reading of the four artifacts.**
A script cannot tell whether a requirement is satisfied, only whether a word occurs; an
earlier version of this harness scored keyword presence and was discarded for exactly that
reason.

Each dimension below is judged by reading, and each verdict must cite the passage it rests
on — so a wrong call is checkable rather than a matter of taste.

## 1. Faithfulness to the spec — the priority dimension

For each of the five MUSTs, one of four verdicts:

| Verdict | Meaning |
|---|---|
| **Designed** | A mechanism exists that would actually satisfy it. Cite it. |
| **Asserted** | Restated as a requirement, with nothing designed to achieve it. This is the interesting failure — it looks like coverage. |
| **Distorted** | Present but changed in scope or meaning from what was asked. |
| **Absent** | Not there. |

"Asserted" is the verdict a keyword check can never produce and the one most worth having.

**Requirement 2 is the discriminator.** The spec says outright: *"How to tell them apart is
the hard part and I don't have an answer — that's what I want designed."* So judge the
answer on its merits: is the proposed distinction actually implementable against a runtime
that was scaffolded before the feature existed (which R5 demands), or does it quietly
require cooperation from the past? A plausible-sounding answer that needs a manifest nobody
wrote is a failure dressed as a design.

**Non-goals**: honoured, violated, or silently expanded. A mention is not a violation — read
the context.

**Invention**: everything the artifact requires that the spec never asked for. For each, is
it derived from a named source (`stack.md`, `constitution.md`, the codebase) or manufactured?
The spec contains **zero numbers**, so every number carries the burden of naming where it
came from.

## 2. Sizing — the priority dimension

Not task count. Count is meaningless without knowing what a task contains.

For each task, judge:
- **Independently implementable?** Can one agent complete it without another task's output?
- **Independently verifiable?** Is there a check that passes or fails on this task alone?
- **Right granularity?** Too large = unverifiable and blows a context window. Too small =
  five implement-loop invocations to change one line.

Then the aggregate: total implement-loop cost (tasks x 5 agent invocations), and whether
that cost is proportionate to the feature.

Both arms plan the same feature from the same spec, so this is genuinely like-for-like —
unlike the earlier stop-hook comparison, where a greenfield plan was compared against a
brownfield delta plan and the task counts were not comparable at all.

## 3. Secondary dimensions

- **Scope drift PRD -> TRD.** Requirements the TRD introduces that its own PRD never stated.
  This is where item 10 says invention concentrates, and the chained runs are what expose it.
- **Groundedness.** Claims about this repository: correct, or confidently wrong? Cite one of
  each if both exist.
- **Actionability.** Could an implementer start from this without asking questions?
- **Honest uncertainty.** Does the artifact mark what it does not know, or is everything
  stated flat?

## Reporting

Head-to-head per dimension, with the winner named and the citation given. Where the arms
are equivalent, say so — a comparison that finds the new pipeline better on every axis is
more likely flattering itself than reporting.

Record any dimension where the OLD pipeline is better. If none is found, treat that as a
signal the rubric is biased and say so explicitly.
