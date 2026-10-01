VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; no test checks that this repo's setting is "auto" (O3); no test covers the conditions that decide when /close-feature and /audit-build open a PR; a live PR-opening run has never happened

# Audit report: pr-at-cycle-end

- Date: 2026-10-01
- Audited commit: d68a43e
- TRD: docs/TRD/pr-at-cycle-end.md
- PRD: none
- Findings: 6 · applied: 5 · rejected: 0 · still unverified: 2 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/pr-at-cycle-end.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; no test checks that this repo's setting is "auto" (O3); no test covers the conditions that decide when /close-feature and /audit-build open a PR; a live PR-opening run has never happened

Coverage: all 5 verifiers reported. No PRD was supplied (the source is the owner's in-session statement), so validation against product requirements did not run. Every disputed file was re-opened; all six findings match the code, so none was rejected.

TRACEABILITY GAPS — implemented, but no test proves it. Each is covered by an existing task, so each goes to /implement-trd --reconcile, recorded as a must-fix item for this feature.
- This repo's own setting is "auto" (O3, settings task FIX-002). `.claude/settings.json:162` says "auto", and `node .claude/lib/pull-request.js mode` prints "auto". But the only test that reads this repo's settings (`test/integration/tests/notify-on-complete.test.sh:609-626`) checks only that the value is a string, so it would pass with "never".
- When the cycle-ending commands open a PR (O1, commands task FIX-003). /close-feature opens one only after a successful close commit, and its "already closed" path opens nothing (`packages/core/commands/close-feature.md:88-93`). /audit-build opens one only if its audit commit succeeded (`audit-build.md:262-276`). None of these conditions has an assertion in `verify-command-surface.test.js:669-698`; only `--report-only` is tested.

UNTESTED-IN-PRACTICE — a test exists but proves less than the requirement
- FIX-003's command tests check only that sentences exist in the prompts; they cannot show that a run follows them. That limit is recorded in Could Not Verify as needing a live run.
- FIX-001's "never invokes pr merge" test (`packages/core/lib/pull-request.test.js:208`) matches only a quoted `'merge'` token, so `'pr merge'` or a template literal would get past it. The source has no merge call today, so nothing is wrong now, but the test is weaker than the acceptance criterion. Goes to /implement-trd --reconcile under FIX-001.

REJECTED THESE FINDINGS
- none. One sub-claim was confirmed: the setdefault grep test is text-only, but `test/integration/tests/scaffold-delivery.test.sh:169-201` tests the behaviour (a refresh keeps "auto", a missing key gets "never").

NO ACTION — implemented, tested, sourced
- O2 (the setting survives refresh and rebase) and FIX-004 (docs). The pull-request lib's tests and the command-surface tests pass, 111 of 111. Command mirrors are byte-identical.

Could Not Verify (rewritten in docs/TRD/pr-at-cycle-end.md): the live-run row is widened to cover the PR-opening conditions as well as opening a real PR, and a new row records that no PRD exists.
