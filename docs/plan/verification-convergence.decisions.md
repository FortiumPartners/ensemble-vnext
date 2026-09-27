# Owner decisions — verification-convergence

**Recorded 2026-09-26, from the session that produced this plan.** Companion source to
`verification-convergence.investigation.md`, which predates these. Where the two disagree,
**this file wins** — it is later and it is the owner's own words.

Audit both together: the investigation record carries the measurements and the grounding, this
file carries what the owner decided after reading the first plan.

---

## The owner's framing of the problem — six issues, verbatim

> 1. verification.md rules weren't propagating through the system
> 2. we had a serial approach that didn't actually provide enough time or resources to test everything
> 3. we conflated "couldn't test" with "didn't pass"
> 4. we couldn't actually reflect to the system "you have permission to deploy to this environment" to verify; and, when debugging, you may to a fast deployment so long as we guarantee a full run later
> 5. separate testing whether something passes from fixing something that failed
> 6. understand exclusive resources and managing them vs only allowing a single, serialized agent to USE them

**This list is the objective set.** Every objective in the TRD must trace to one of these six,
to the investigation record's measurements, or to a decision below. An objective tracing to
none of them is unsourced.

## Decisions

| # | Decision | Owner's words / basis |
|---|---|---|
| OD-1 | **Parallel exercise is IN.** | "YES we want parallelism" |
| OD-2 | **The `--verify` default flip is IN, in this TRD.** Not a separate TRD, not its own phase | "YES we want to flip the verifier"; "ZERO INTEREST in staging out fixes that are a few lines" |
| OD-3 | **No staging of small fixes.** Where two tasks edit the same file for the same reason and neither is independently valuable, they are one task | "I have ZERO INTEREST in staging out fixes that are a few lines" |
| OD-4 | **Capacity is one declared number per resource: how many may exist at once.** `N` = a pool the framework may create and tear down up to; `1` = a queue, one holder at a time; `0` = must not be touched | Owner's design, replacing the derived all-or-nothing budget |
| OD-5 | **Creatable resources are cheap and that is load-bearing.** Simulators, containers, preview deployments and ephemeral schemas are pooled, not queued | "in lightning-lane, the session we're using as our template, it was relatively trivial to fire up 4 simulators" |
| OD-6 | **An agent MAY create resources, up to the owner's declared count.** This supersedes the earlier non-goal forbidding it. It stays a declared allowance, never an agent's judgement, so read-never-probe holds | Answers the open question raised by the earlier run's `xcrun simctl create` |
| OD-7 | **A budget of 1 must follow from every open criterion contending for the same singular resource — never from one exclusive resource existing somewhere in the declarations** | Owner's item 6, stated as the failure to avoid |
| OD-8 | **The full-environment run gate stays.** It is the second half of item 4: the guarantee is what makes a fast deploy safe to ALLOW while debugging. Without the guarantee, fast deploys cannot be permitted at all | Owner reversing an earlier recommendation to drop it |
| OD-9 | **The declarations columns and the slicing both stay.** Items 1, 2 and 4. Neither defers | Owner, rejecting a proposed deferral |
| OD-10 | **The coverage denominator is EVERY criterion** — `met / total`, which is how 11 of 62 = 18% was computed. The blocked count is reported beside it | Answered open question OQ-5 |
| OD-11 | **The coverage floor stays UNSET.** The branch ships built and unit-tested; it never fires in production until the owner sets a number | Answered open question OQ-1 |
| OD-12 | **A hollow `satisfied` IS relabelled.** A run below the floor exits `insufficient-coverage` even with zero failures — the shape an unfilled declarations file guarantees. **Interacts with OD-11: built and tested, dormant until a floor exists** | Answered open question OQ-7 |
| OD-13 | **Judge and Debug stay single agents.** Only Exercise fans out | Carried forward, reaffirmed |
| OD-14 | **The capture/repair boundary keeps its own task**, separately revertable — it is the change the measured evidence turns on | The one split OD-3 does not collapse |

## Constraints that did NOT change

- **READ, never probe, never model.** The owner declares; the framework reads. Exclusivity and
  capacity are never inferred from a URL, a runtime, or an environment NAME — all three are
  already rejected non-goals.
- **The declarations file is owner-governed.** An agent reads it and never writes it. The
  shipped TEMPLATE may change; a filled-in copy may not, and the `--refresh` guard protecting
  one must not regress.
- **Slice size 8 and exact/literal/case-sensitive locator matching** keep their stated
  defaults. Both have cheap, immediately visible failure modes.

## Audit these specifically

1. **Does the TRD model resources per OD-4, or does it still collapse to a single serialized
   agent when one exclusive resource exists?** This is the defect the refinement was dispatched
   to fix. Check the concurrency decision directly, not the prose around it.
2. **Under the TRD as written, what budget would `lightning-lane` (an iOS simulator) and
   `gcats` (an undeletable probe row on a shared project) actually get?** If either is pinned
   to 1 by the mere existence of an exclusive resource, OD-7 is unmet and the fan-out is dead
   code. Name the number.
3. **Is the earlier non-goal forbidding resource creation explicitly superseded** per OD-6, or
   silently deleted? Silent deletion of a non-goal is a finding.
4. **Is the flip in this TRD** (OD-2), or split out again?
5. **Are the dormant branches honestly labelled** — OD-11 and OD-12 together mean the relabel
   is built, tested, and does not fire. A TRD implying it fires today is a stale claim.
6. **Did the merge under OD-3 lose anything?** Merging tasks must not drop an acceptance
   criterion or a grounding block. Compare against the pre-merge task set.
