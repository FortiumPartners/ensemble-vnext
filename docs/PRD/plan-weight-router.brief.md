# Brief — plan-weight-router (in-session delta only)

**The verbatim source is `docs/modernization/2026-08-improvement-plan.md`, section
"## Item 21 — one entry point that picks the weight (owner-agreed 2026-09-22)".** Read that
section and nothing else in that file; the plan's other twenty items are out of scope and
share no requirements with this one.

This brief carries only what the session added after item 21 was written, plus the positions
the conversation abandoned on the way — recorded so the author does not re-propose them.

## Settled

| What | Where it was settled |
|---|---|
| **Keep the PRD lean.** Explicit instruction on invoking `/create-prd`: "on item 21 -- but keep it lean". No manufactured personas, no invented non-functional requirements, no section filled to look complete. | The `/create-prd` invocation itself |
| Two axes and one exit: `kind` (defect \| change \| refactor) × `weight` (trivial \| small \| medium), with `feature` as the exit to `/create-prd` rather than a member of either list. Nine cells, none individually named. | Owner: "yes - this is the correct answer" |
| `kind` changes the **stage list**, not only the scoring — a medium refactor's proof is "named tests pass before and after, public surface unmoved"; a medium change's is "the stated outcome holds". | Same exchange; owner's own observation that medium refactor and medium change are different things |
| Tiers select a **pipeline shape**, never a permission. Owner: *"Never once have I actually read a 'REVIEW' TRD."* Every TRD this framework has built was built by a machine running unattended. | Owner correction, verbatim in item 21 |
| An open question is not a feature. The test for needing a PRD is whether the PRD would contain anything the TRD would not. | Owner: "Should we use a slider or a text input box" is open and not PRD-worthy |
| Build by **chaining existing commands first**, extracting stage prompts to contracts only as each is next edited. Chaining proves the weights before anyone pays for a refactor. | Owner asked directly: chain, or build its own workflow. Chaining first, contracts second. |

## Superseded

| Earlier position | Replaced by | Why |
|---|---|---|
| Expose `/create-trd`'s existing `transcript` argument as the middle path | Nothing — dropped entirely | The argument has **never been used**: zero callers in the live tree, and all six PRD-less TRDs on disk came through `/investigate`'s light path. It is an untested code path, not a capability. A session transcript is also not a requirements document, and feeding one to `/audit-trd`'s omission audit would turn every abandoned idea in a conversation into a missing requirement. |
| Raise `/investigate`'s 6-task / 10-file ceiling | Two axes, where `weight` selects stages and the ceiling stops gating the PRD decision | The ceiling is calibrated to "the shape real fixes actually take" and is the wrong ruler for design work — but raising it would make the light TRD format carry work it cannot (no phases, so `/implement-trd` gets one phase and no gates). |
| "Phased TRD at REVIEW rather than AUTO" as the safeguard for medium work | Pipeline shape, with review depth as the dial | REVIEW is never read, so it buys a stall rather than safety. |
| A five-name tier list (defect / minor / sweep / medium / escalate) | The two-axis grid | Mixed size and kind on one axis. |
| A six-label list (defect / trivial change / small change / medium refactor / medium change / feature) | The two-axis grid | Gave `change` three sizes, `refactor` one, and `defect` and `feature` none — leaving a large defect and a trivial refactor real but unnamed. |

## Raised, not adopted

| Idea | Status at end of conversation |
|---|---|
| A `--transcript` flag on `/create-trd` | Not adopted. No such flag exists; `/create-trd` parses no flags at all. Would need the omission-audit semantics designed first. |
| `MINOR` as a tier distinct from trivial | Not adopted. `kind` already changes what is scored; a trivial-vs-small distinction decides nothing new. |
| `/sweep` as a tier of this command | Not adopted. Sweep is answered from the *shape* of the input before any investigation — making it a tier means investigating a list before discovering it is a list, which is the 22.7-minute failure that created `/sweep`. |
| Refactoring the two workflows into shared callable stages as step one | Not adopted as step one; it is the end state. No workflow script can `require` anything, so stages cannot be shared between workflows — the route is contracts plus a dumb dispatcher, reached after chaining proves the weights. |

## Open at the end of the conversation — not requirements, not rejections

These three were explicitly left to the owner and must reach the PRD's Open Questions rather
than being decided by the author:

1. Does `/refine-trd` at medium-with-open-questions **run**, or only get **recommended**?
   Given a REVIEW TRD is never read, a recommendation is likely a no-op.
2. Does `ESCALATE` survive at all once "would the PRD have content" replaces the size and
   certainty tests?
3. Do `/create-trd` and `/create-prd` keep separate identities, or collapse into `/plan` with
   a weight?

## Naming

`/investigate` describes only its first phase and is already wrong for a command handling
defects, changes and refactors. `/plan` was the name discussed. Renaming is the expensive part
— 18 command files, the router hint, three governance docs, the templates, and every consuming
project's vendored copy — so the conversation's position was: do it once, deliberately, not as
a side effect. Whether the rename is in scope for the first release is not settled.
