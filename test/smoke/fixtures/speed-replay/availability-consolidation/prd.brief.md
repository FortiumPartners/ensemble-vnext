# Brief — availability-consolidation

**Status:** PRD complete, 2026-09-23  
**Command:** `/create-prd docs/proposals/availability-consolidation.md ; keep it lean`

## Design Corpus Index

Inherited decisions (do not re-decide):
- **Single authority / Disney is truth** (ll-state-authority.md: LSA-D001) — availability is observation, not ledger
- **Sweep pacing: 540s frontier, 1200s light** (dining-sweep NG14) — window layout stays 7-8d; demanded tuples reuse
- **Alert pipeline unchanged** (dining-sweep NG13) — observation → diff → match → enqueue is out of scope
- **No feature flags** (reactive-alert-engine) — change in place, delete dead code
- **Decider sees arm-state + deterministic gate** (v2-decider) — context shows what agent sees

Rejected patterns (do not repeat):
- Skipping on phantom-fresh entries (10% savings but misses sold-out)
- Bespoke per-watch window layouts (breaks sublinear dedup)
- Inferring history as if Disney said it (ledger written only from Disney)

Related documents (by relevance):
1. dining-sweep-cadence-ip-allocation.md (sweep infra, pacing)
2. reactive-alert-engine.md (observation pipeline, watches)
3. ll-state-authority.md (single-writer pattern)
4. v2-decider-exclusive.md (decider context)
5. always-on-eligibility-monitoring.md (eligibility vs availability)
6. prearrival-multipass-availability.md (future-day bundle)

## Settled by Owner

| What | Where settled |
|---|---|
| **Keep PRD lean.** No personas, journeys, padding. Source's 7 decisions are requirements; each gets acceptance criteria. | `/create-prd` args, "keep it lean" |

## Open Questions (settle from prod data)

1. **Bundle "available" flag party-dependent?** Determines if future-day store is per-party or shared
2. **Bundle sweep coverage and call cost** Must read from `disney_call_audit` captures

Both deferred to data-driven resolution, not by asking.

## Out of Scope

- `ExperienceMetadata` currency and overlay validation (separate workstream)
- Showing decider >12h out (future-day in same-day decisions)
- Eligibility workstream ("can they book?" — reason codes, three-answer model)
