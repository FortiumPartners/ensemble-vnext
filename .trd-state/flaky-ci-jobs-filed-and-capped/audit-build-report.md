VERDICT: proceed with these caveats: no PRD was supplied, so the code was checked against the TRD alone (its source is roadmap item 4 of the ship-churn-fixes plan); a real GitHub Actions rerun of a flaky job was never exercised (Jest only); a flake seen after a merge is counted only on the machine that saw it; two parallel branches can each file the same job's first flake.

# Audit report: flaky-ci-jobs-filed-and-capped

- Date: 2026-11-11
- Audited commit: 1221a7a46e55fd1a423cc42b21a7ecfb490ec1d6
- TRD: docs/TRD/flaky-ci-jobs-filed-and-capped.md
- PRD: none
- Findings: 5 · applied: 4 · rejected: 2 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/flaky-ci-jobs-filed-and-capped.md    PRD: none

VERDICT: proceed with these caveats: no PRD was supplied, so the code was checked against the TRD alone (its source is roadmap item 4 of the ship-churn-fixes plan); a real GitHub Actions rerun of a flaky job was never exercised (Jest only); a flake seen after a merge is counted only on the machine that saw it; two parallel branches can each file the same job's first flake.

STATE
- Round 1 of at most 3. No defects and no test gaps, so the audit closes the feature; nothing goes back to /implement-trd --reconcile.
- 8 requirements and 2 tasks checked, all 5 verifiers reported.

NO ACTION — implemented, tested, sourced
- Both tasks are built and tested. The flaky-CI history library (FIX-001) is `packages/core/lib/flaky-ci.js`; its wiring into the wait-ci, file-followups and collect-findings shipping contracts (FIX-002) is in `packages/core/contracts/`. `flaky-ci.test.js` and `ship-primitives.test.js` pass, 143 of 143 tests.
- The vendored copies under `.claude/lib/` and `.claude/contracts/` are byte-identical to the core files; `packages/full/lib/flaky-ci.js` is a symlink to the core file.
- The Non-Goals held: the feature's commits touch none of `ship-sequencer.js`, `custody.js` or `.claude/rules/ship.md`.

FIXED THE CITATION (descriptive text in the TRD; notes, not defects)
- Non-Goals named bare `shipped.json`, `ship.md`, `ship-sequencer.js` and `custody.js`; they now give full paths.
- The Intended Change described the file-followups import as one `flaky-ci.js import --state-dir <dir>` call for every job. The delivered CLI takes `--job` and `--run-id` and the contract calls it once per distinct job; the sentence now matches. The required behaviour (one row per job, filed once) is unchanged.
- The TRD's Could Not Verify section was rewritten: it now names the missing PRD and keeps the three things this audit could not exercise, each with its reason.

REJECTED THESE FINDINGS
- "The F-4 label does not exist": it is in `docs/plans/ship-churn-fixes/workplan-input.json:50`.
- "`.trd-state/_flaky.jsonl` is missing": the TRD rejects that shared file on purpose; its absence is what the no-shared-mutable-file objective (O3) requires, and `packages/core/lib/flaky-ci.js` reads only per-feature `flaky.jsonl` files.

DECISIONS
- none

ISSUES
- none. The five review findings left open earlier (a capped flake after a merge stops the run with no explanatory row, 60-character job-name truncation, a cap that never resets, and two minor CLI issues) are recorded as non-blocking follow-ups in `discovered.jsonl`.

NEXT
1. Ship it: /ship-build docs/TRD/flaky-ci-jobs-filed-and-capped.md
