# Case 2 — greenfield, outside this repository

The first A/B (`runs/ab-test/`) ran **inside ensemble-vnext**, where the grounding stage had
`scaffold-project.sh`, `runtime-refresh.sh` and the hooks manifest to read. That is the new
path's best case, and it is where its win came from — the implementer named four specific
rediscoveries the grounding block saved it, each worth a wrong implementation plus a debug
cycle.

**Case 2 removes that advantage on purpose.** `/Users/james/dev/ab-calendar` is a fresh Node
project: empty `src/`, empty `test/`, no prior art, scaffolded with the plugin so it has
`.claude/rules/` and nothing else.

| | |
|---|---|
| Spec | `/Users/james/dev/ab-calendar/SPEC.md` — 38 lines |
| Explicit MUSTs | 5 |
| Non-goals | 2 |
| **Numbers in the spec** | **0** — any threshold in either artifact is provably invented |
| Named hard problem | requirements 2 and 4 pull against each other; the spec says outright "I have no answer for it" |

The hard problem is real and has no lookup answer: keeping wall-clock time across a DST
transition means occurrences are not evenly spaced in absolute time, so you cannot reach the
Nth occurrence by arithmetic — but requirement 4 forbids expanding the series to find the
next one. Whether a pipeline *designs* that or merely restates it is the sharpest available
quality signal.

## Arms

- **old** — `create-prd.md` / `create-trd.md` + agents from `a17316c~1`, single agent per
  stage, exactly as before the item-10 rewrite.
- **v3** — the current optimised workflows: authoring contracts, records-as-index with the
  grounding rule, `design-audit` folded into grounding, `citations`+`conformance` merged.

v2 is skipped deliberately — its lever-2 implementation broke verification (findings 16 → 2,
both fabricated) and was corrected in `d1f4e29`.

## What would change the conclusion

Case 1 concluded the new path wins: −5% total tokens, half the wall clock, and a 31% cheaper
implement stage because the plan was better. **If v3 loses here, the win is brownfield-specific**
— and the recommendation becomes conditional on repository maturity rather than default-on.
