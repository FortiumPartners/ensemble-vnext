# Functional Success Definition: fix-audit-build-plan-route-close

**Source**: fix-audit-build-plan-route-close TRD §Reproduction (extracted text, supplied verbatim by the caller; the TRD file itself was not opened)
**Source kind**: reproduction
**Derived**: 2026-11-08T12:00:00Z
**Criteria**: 5

The reproduction has three lines, cited below as **Steps**, **Actual** (including its
**Root cause** sentence) and **Expected**. FS-1, FS-2, FS-4 and FS-5 are exercised the way the
reproduction itself was: call `tally` and then `decide` through the library's CLI, as a user
would (CLI hint row), on the `local` environment (`verification.md` §1):
`node packages/core/lib/audit-rounds.js tally '<json>'` and
`node packages/core/lib/audit-rounds.js decide '<json>'`, saving stdout as the artifact. FS-3
covers the "audit closes" half of Expected end to end, so its target is a headless `/audit-build`
run in a scaffolded fixture repository (`fixtures` environment, `verification.md` §1), not this
checkout.

The handoff item in Steps is "the item the validation verifier returns when no PRD is
supplied (check `validation`, `covered: false`)". The exerciser uses the item shape that verifier
actually returns; the definition does not fix its other fields, because the source does not.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | Tallying a handoff that holds only the no-PRD validation item (check `validation`, `covered: false`) counts it as a note, not an uncovered requirement: `uncovered` is 0 and `notes` is 1 | Expected ("The no-PRD item is a note"); Steps; Actual ("`tally` counts it as `uncovered: 1`") | stdout of `audit-rounds.js tally` on that one-item handoff, showing `"uncovered":0` and `"notes":1` | [read] | locator | | O1 |
| FS-2 | Calling `decide()` on the counts FS-1 produces (0 defects, 0 test gaps, 0 uncovered) with the capped verdict "proceed with these caveats: no source supplied" returns `close: true` | Expected ("the audit closes"); Actual ("`decide()` returns `close: false` while uncovered > 0") | stdout of `audit-rounds.js decide` with those counts and that verdict, showing `"close":true` | [read] | locator | | O1 |
| FS-3 | An `/audit-build` run on a feature with no PRD, whose only finding is the no-PRD item, ends with its verdict capped at "proceed with these caveats: no source supplied" and closes the feature: `closed.json` is written | Expected ("the verdict (capped at \"proceed with these caveats: no source supplied\") carries the caveat; the audit closes"); Actual ("so `closed.json` is never written") | From a headless `/audit-build` run in a fixture repository holding a plan-route TRD and no PRD: the audit report's verdict line containing `no source supplied`, and the feature's `closed.json` under that fixture's `.trd-state/<feature>/` | [read] | locator | | O1 |
| FS-4 | A `covered: false` validation item for a real PRD requirement (a PRD was supplied, and the requirement has no implementation) still tallies as `uncovered: 1`, and `decide()` on those counts returns `close: false` | domain-derived: Root cause ("treats every `covered:false` item as an uncovered requirement; the no-PRD finding has no marker that tells it apart") locates the defect in the no-PRD item being indistinguishable, not in `covered:false` counting as uncovered; a fix that stopped counting real uncovered requirements would close audits with genuine gaps, which Expected does not ask for | stdout of `audit-rounds.js tally` on a one-item handoff holding that requirement, showing `"uncovered":1`, and stdout of `audit-rounds.js decide` on those counts showing `"close":false` | domain-derived | locator | | O2 |
| FS-5 | A no-PRD handoff holding the no-PRD item AND a real uncovered TRD objective (`covered: false`) tallies `uncovered: 1` (the objective) with the no-PRD item as a note, and `decide()` returns `close: false` | domain-derived: the same Root cause sentence; Expected turns only "the no-PRD item" into a note, so every other `covered:false` item in the same handoff must keep counting as uncovered, or a no-PRD audit would close over a real gap | stdout of `audit-rounds.js tally` on that two-item handoff, showing `"uncovered":1` and `"notes":1`, and stdout of `audit-rounds.js decide` on those counts showing `"close":false` | domain-derived | locator | | O3 |

## Must-pass coverage

- **O1** (a plan-route audit with no PRD and only the no-PRD item closes, keeping the "no source supplied" caveat): FS-1, FS-2, FS-3.
- **O2** (a feature with a PRD and an uncovered requirement stays open): FS-4.
- **O3** (a no-PRD audit with a real uncovered TRD objective stays open): FS-5.
- **O4** (a no-PRD audit with a real defect still chains a fix run): **uncovered.** The
  reproduction says nothing about defects or about chaining a fix run, so no criterion can cite
  it; the run reports this objective as uncovered rather than passing.
- **O5** (`.claude/lib/audit-rounds.js` stays identical to `packages/core/lib/audit-rounds.js`):
  **uncovered.** The reproduction names `audit-rounds.js` once, as the location of the root
  cause, and says nothing about its two copies; no criterion can cite it.

## Considered and not made a criterion

- "the no-PRD finding has no marker that tells it apart" (Root cause) explains why the defect
  happens, not an outcome. How the item is told apart (a marker, an action value, a check name)
  is a design choice the source does not make, so no criterion requires a particular marker;
  FS-1 and FS-5 test the outcome either way.
