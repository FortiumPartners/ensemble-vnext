VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; no test checks that /rebase-project actually calls the new `--git-files` step (part of O2); two Could Not Verify rows are still open (whether GitHub's server-side PR merge honours `merge=union`, and projects partway through rollout that still track `current.json`)

# Audit report: per-feature-framework-writes

- Date: 2026-11-11
- Audited commit: 4aa5b06848c9a47e9417fc3137e95dbda9969e6e
- TRD: docs/TRD/per-feature-framework-writes.md
- PRD: none
- Findings: 7 · applied: 6 · rejected: 1 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/per-feature-framework-writes.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; no test checks that /rebase-project actually calls the new `--git-files` step (part of O2); two Could Not Verify rows are still open (whether GitHub's server-side PR merge honours `merge=union`, and projects partway through rollout that still track `current.json`)

Coverage: all 5 verifiers reported. 4 requirements and 3 tasks were indexed. No PRD exists for this change, so the code was checked against the TRD only. Nothing was checked against product requirements.

TRACEABILITY GAPS
- Part of O2: the rebase path that delivers the ignore lines has no test. The script half is built and tested: `ensure_gitignore()` and the `--git-files` mode in packages/core/scripts/scaffold-project.sh have BATS cases for adding the lines, idempotence and untracking. The command half is not tested. /rebase-project's new step 4.7a calls `scaffold-project.sh --git-files .` (packages/core/commands/rebase-project.md:1112), and all three copies of the command are byte-identical. But no test reads the command for `--git-files`, even though the acceptance criterion of the command-prose task (FIX-002) asks for it and test/integration/tests/runtime-integrity.test.sh already greps rebase-project.md the same way for other flags. The task exists, so this goes to /implement-trd --reconcile.

FIXED THE CITATION (in docs/TRD/per-feature-framework-writes.md, descriptive text only)
- `ensure_gitattributes()`: line 1712 changed to 1734, in the "Today" list and in FIX-001's grounding notes.
- Scaffold writing `current.json` from its template: line 1913 changed to 1987.
- The `refreshed_at` write: line 1585 changed to 1606-1608, noting it is now strict-only.
- The /sweep ledger: sweep.md Step 4 calls `discovered.js record`. The file name `discovered.jsonl` is built by `ledgerPath` (discovered.js:470-471), not written in the command.
- Also fixed, not flagged by any verifier: the `--stamp-version` dispatch in FIX-001's grounding moved from ~2038 to ~2113-2116.

REJECTED THESE FINDINGS
- "Untracking four `.trd-state/` files conflicts with stack.md's 'git-tracked'". Refuted by this repository's own .gitignore. Lines 7-8 keep `.trd-state/` tracked, and lines 21 and 88-96 already ignore `current.json`, `_dispatch.jsonl`, `*/dispatch.jsonl` and `_command-runs/`. stack.md's description has always held alongside exactly these ignores. The change gives scaffolded projects the same layout, and stack.md needs no change.

NO ACTION
- 3 of 4 requirements are implemented, tested and sourced to an owner instruction: O1 (parallel branches merge with no conflict on framework files), O3 (untracking keeps the file on disk) and O4 (`isRecordFile` stays the one definition; there is a Jest guard at record-files.test.js:221-233).

The Could Not Verify section was rewritten. It now says no PRD was checked, keeps the two unchecked rows with the reason each is out of scope, and adds a row for the rebase step never being run live.
