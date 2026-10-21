# Availability consolidation — source spec

**Status:** decisions settled with the owner, 2026-09-23. Source for `/create-prd`.
**Context:** Trip State, As Built §06 "What is available?" (https://claude.ai/artifact/UbsKeR4F7n3XtnGp2GzMsq).

## Problem

"What is available?" has one live writer but no single reader, a parallel cache, a dead
layer, and a history signal sampled at an unknown rate:

- The availability sweep (`DiscoverySweep`) writes `tipboard:{park}:{date}` for all four
  theme parks roughly every 32 seconds during park hours (measured 2026-09-22, 09:00–21:00 ET:
  ~1,330 sweeps per park, longest gap 223 s). **42 files** read that key directly and each
  parses it itself; one of them (`HeldLLReconciler.readTipboard`) parses the wrong shape and
  throws on every read into a silent `catch {}`.
- A cache miss reads as "nothing available", so a park day nobody swept looks sold out.
  No reader checks the data's age.
- The on-demand availability route (`GET /internal/disney/availability`, used only by the chat
  agent) keeps its own copy, `availboard:{park}:{date}`, fetched live from Disney with the
  user's own service account, and re-emits the sweep's change events. It also makes a live
  park-wide eligibility call (only to get guest ids for Disney's bundle call — the chat agent
  never reads the resulting `partyEligibility`) and caches tier in `bundle:{park}:{date}`.
- `AvailabilityStore` (a 10-minute cache of offered return-time grids) is built and never
  instantiated; its intended reader (the schedule-conflict gate) is now advisory.
- Availability velocity (`rae:avail-history`, 6 entries) and "just became available"
  (`rae:prev-avail`) are recorded per **engine run**, not per sweep: the sample rate varies
  with wakes and skips, and every user's runs at a park share one list.

## Decisions

1. **One authority for same-day availability: the sweep's `tipboard:` cache.** Every
   consumer reads it through **one shared reader** that returns the experiences plus a
   status — `fresh`, `stale` (with age) or `missing`. A CI gate forbids raw reads of the
   `tipboard:` key outside that reader. During park hours a `stale` or `missing` read is
   surfaced as **unknown** and logged loudly (it means the sweep is down); it is never
   rendered as "nothing available".
2. **The sweep owns availability history.** "Just became available" and availability
   velocity are derived from the sweep's own record over a **fixed time window** (e.g. the
   last 30 minutes), not from engine runs. The engine's `rae:prev-avail` and
   `rae:avail-history` writers are removed.
3. **Future-day availability gets a home.** A sweep of Disney's planning bundle covers trip
   days inside the booking window, stored beside `tipboard:` under the same freshness
   rules, with guest ids taken from the party table. It replaces the route's live bundle
   call and serves the engine and the chat agent alike.
4. **The availability route becomes a thin read with no Disney calls.** Same-day from
   `tipboard:` (via the shared reader), future-day from the bundle store, tier from
   `ExperienceMetadata.tier`.
5. **Tier's source is `ExperienceMetadata`.** The route's `bundle:` tier cache goes.
6. **The decider's availability context shows available, unavailable and unknown
   attractions explicitly**, built from the shared reader and the sweep history. (Today it
   shows a bare count of unavailable attractions, and cannot distinguish unknown from none.)
7. **Deleted:**
   - `availboard:` — its reader, writer, the route's live tipboard fetch, and its duplicate
     `detectTipboardChanges` emit;
   - the route's live eligibility call and the `partyEligibility` field;
   - the `bundle:` tier cache;
   - `AvailabilityStore` and its `avint:guard:*` key.

## Out of scope

- Keeping `ExperienceMetadata` (including tier) current, and checking the hand-loaded LL
  overlay against Disney's bundle.
- Showing the decider times more than 12 hours out, i.e. future-day availability in the
  decider's same-day decisions.
- The eligibility workstream ("can they book?" — three answers, unmodelled reason codes,
  eligibility-call failures). No eligibility code remains in the availability route after
  this work, so nothing is left behind for it.

## Open questions — to settle from captured data, not by asking

- **Is the bundle's "available" flag the same for every party**, or does it depend on the
  guests in the request? Determines whether the future-day store can be shared across
  parties (the per-guest remaining tier allowance is eligibility, not availability).
- **Which days the bundle sweep covers** (Disney's booking window) **and its call cost**
  against the scout accounts' budget.

Both can be read from captured `disney_call_audit` bundle responses (~5/day in prod).
Prod reads: direct host (never the pooler), each wrapped `BEGIN READ ONLY … ROLLBACK`.

## Constraints carried in

- **Ledger written only from Disney** (constitution): no availability or history value may
  be inferred and stored as if Disney had said it.
- **Fail loud:** a missing or stale value is "unknown", never a plausible default.
- **Allow over block:** "unknown" must not be treated as "unavailable" by any gate that
  would stop a booking attempt.
- **Agent-behaviour change:** decision 6 (and the new history source) changes what the
  decider sees, so eval Tier B is required before merge.
- Mock API is frozen (`packages/mock/**`).
