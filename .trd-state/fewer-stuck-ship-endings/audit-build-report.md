VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this change has no PRD; it comes from item 5 of the ship-cost roadmap, docs/plans/ship-cost-reduction/roadmap.md); the live check of a red merge-up head being fixed and merged on real GitHub (github-live-test) has not been run yet; whether Forge resumes a run parked at a wait without escalating is Forge's side and unchecked here

# Audit report: fewer-stuck-ship-endings

- Date: 2026-11-11
- Audited commit: ffa81b30ee982d3cb0b6bdc5fd1d1464536fc694
- TRD: docs/TRD/fewer-stuck-ship-endings.md
- PRD: none
- Findings: 2 · applied: 2 · rejected: 0 · still unverified: 0 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/fewer-stuck-ship-endings.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this change has no PRD; it comes from item 5 of the ship-cost roadmap, docs/plans/ship-cost-reduction/roadmap.md); the live check of a red merge-up head being fixed and merged on real GitHub (github-live-test) has not been run yet; whether Forge resumes a run parked at a wait without escalating is Forge's side and unchecked here

Coverage: all 5 verifiers reported, over 5 requirements and 4 tasks. With no PRD, the audit checked the delivered code only against the TRD.

FIXED THE CITATION
- The "do not copy to packages/full/lib" warning in the sequencer task's grounding notes (FIX-001) called packages/full/lib a symlink. It is a real directory, and its files are symlinks into packages/core/lib: `test -L packages/full/lib` is false, and packages/full/lib/ship-sequencer.js has git mode 120000. I corrected the sentence in docs/TRD/fewer-stuck-ship-endings.md. The advice not to copy files there still holds, and no requirement changed.

NO ACTION
- 5 of 5 requirements are implemented and tested: the merge step loops on a red head (O1), the loop has a bound (O2), each stop is classified (O3), the custody proof is kept (O4) and the sequencer names no primitive (O5). No gap, mismatch or weak test was found.

Could Not Verify, rewritten in the TRD, now holds three rows: no PRD, so nothing was checked against product requirements; real GitHub behaviour, deferred to github-live-test; and Forge resuming a parked run, which is Forge's side.
