# Verification plan: fix-design-command-defects

**Written**: 2026-11-16T11:00:00Z by /refine-verification --auto
**From run**: Must-Pass Unproven at 18/19 proven (14 of 15 must-pass), report `.trd-state/fix-design-command-defects/verification-report.md`
**Agreed with**: derived from the evidence; no open items. The one unproven criterion (FS-2) was already ruled on by the owner's delegate in the TRD (commit 41953b02, objective O1a).

## Blockers
none

## Slices
none

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | FS-2 (a canvas read that returns no-access, not just not-found, still republishes) can't be shown here: the Artifact tool gives one combined 404 for deleted and not-shared artifacts, and no artifact owned by another account exists in any authorized environment. The TRD already records the call: objective O1a (FS-2's objective) is not must-pass, because no-access and not-found share one code path, which FS-1 and FS-3 prove; filed as defect issue #160 so a person decides whether to fix it. Cited, not re-decided here. The latest report still lists FS-2 as unproven must-pass because it was written before that TRD change | `docs/TRD/fix-design-command-defects.md` Objectives table (O1a), already present |

## Accepted as not verifiable
| Criterion | Ruling | Why |
|-----------|--------|-----|
| FS-2 | accepted | kind not-checkable-here; its objective O1a is no longer must-pass (TRD, commit 41953b02), so acceptance is allowed; the gap is filed as #160 |

## Extra checks
| Skill | Inputs |
|-------|--------|
| none | |

## Stop rule
max-rounds: 3
stop-when-closed-below: 1
always: stop when nothing is left to build
