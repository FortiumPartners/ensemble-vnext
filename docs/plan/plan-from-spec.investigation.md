# Investigation: plan-from-spec

**Kind**: change
**Weight**: medium (re-weighed from small after the adversarial review found 17 problems across more surfaces than first assessed)
**Route**: plan

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | When `/plan`'s source already carries acceptance criteria, its scope is locked: every criterion is carried verbatim with its id, nothing is added, reworded, merged, narrowed or widened, and a criterion that looks wrong becomes an owner-only open question quoting the spec line. | owner, 2026-10-02: "Strong risk of changing something the owner thinks is a locked scope. I've seen this happen multiple times." |
| O2 | `/plan` splits such work: independent low-risk findings go to a `/sweep` list built first, and only the coupled core gets a TRD; every criterion lands in exactly one of the two, checked mechanically, or the plan stops. | owner, 2026-10-02: "Splitting out small items to sweep dramatically speeds up implementation by keeping the heavy process to the high risk, complex core. It also rebuilds the lower risk items and has them built and ready—so the total surface change of the 'big' portions is small and simpler. Keeps verification and audit tight." |
| O3 | The swept criteria are verified before the core is built, passed verbatim as criteria to the verification loop with no derive step, in one run grouped by surface; a failure goes back through `/sweep`, never into the TRD. | owner, 2026-10-02: "Do the /sweeps get a verification before the core?", and the design agreed in reply |
| O4 | The core's verification proves only the core's criteria, taken verbatim from the locked spec rather than re-derived. | owner, 2026-10-02 (same exchange) |

## Intended Change

The owner's request, verbatim (2026-10-02): "/plan from a finished spec (lightning-lane
signup-disney-optional, 2026-10-02: 18 roadmap ACs became 29 objectives plus unasked
consolidations, and 26 findings went through one heavy TRD): (1) when the source already carries
acceptance criteria, its scope is LOCKED — every AC carried verbatim with its id, no added
objectives, no rewording, merging, narrowing or widening; a spec that looks wrong becomes an
owner-only open question quoting the spec line, never a silent edit; (2) split the work:
independent low-risk findings (no file shared with the core, no dependency on it, no
auth/data/shared-contract change) go to a /sweep built first, and only the coupled core gets a
TRD; every AC must land in exactly one of the two or the plan stops; (3) the swept ACs are
verified before the core is built — passed verbatim as criteria to the verification loop (no
derive step), one run grouped by surface, a failure going back through /sweep, never into the
TRD — so the core's verification reuses that evidence and proves only the core's criteria."

Owner, also 2026-10-02: "It may not save as much verification but I think it's much more build
savings than you're crediting it for", and "Next in order needs to kept small" (applied to the
previous change; this one is kept as small as the corrections allow).

Measured case: lightning-lane `docs/plans/trip-management-correction-roadmap.md`, Item 4. Its
`### Acceptance criteria` subsection holds 18 criteria written `- **AC-4.1** · <surface>: <text>
*(Traces: …)*`, then `**Regression guards:**` with `- **RG-4.1:** <text>`. Its `### Issues
addressed` subsection holds the findings in the same bold-id list shape (`- **W-006** · major ·
…`). Its `### Verification` subsection maps ids, sometimes as ranges ("AC-4.1 to AC-4.3"), to a
method. `### Done when` restates criteria.

## Decision

See the TRD's `## Decision`. In short: a library reads the criteria (section- and
heading-scoped) and writes the copied text itself, so verbatim holds by construction; the split
and verbatim checks read the written documents, not lists the model supplies; the sweep is
verified through the existing `/verify-build` with criteria from the library, one iteration, no
debug; uncertain items stay in the core.

## Grounding

The adversarial review (2026-10-02) grounded every surface with file:line evidence; its findings
are applied in the TRD and its Task Grounding carries the citations.

## Open Questions

none
