VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; the replay that scores the fix (FIX-002) was run on the first wording of the clause, not the shipped one, so the shipped prompt is unscored; the allow case passes with or without the fix, so nothing shows the live block is fixed (it never reproduced); nothing automated asserts the clause stays in the built prompt and settings files

# Audit report: stop-judge-auto-armed-monitor

- Date: 2026-11-20
- Audited commit: 5d67c7b5e1b7d3718afbd3d1acccd8c28ffa5382
- TRD: docs/TRD/stop-judge-auto-armed-monitor.md
- PRD: none
- Findings: 6 · applied: 1 · rejected: 0 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/stop-judge-auto-armed-monitor.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; the replay that scores the fix (FIX-002) was run on the first wording of the clause, not the shipped one, so the shipped prompt is unscored; the allow case passes with or without the fix, so nothing shows the live block is fixed (it never reproduced); nothing automated asserts the clause stays in the built prompt and settings files

Coverage: 5 of 5 verifiers reported. 7 requirements and 2 tasks indexed. No PRD exists for this defect, so validation against product requirements was NOT checked. Only traceability between the TRD and the delivered code was checked.

TRACEABILITY GAPS — implemented, no test proving it
- The shipped wording of the clause was never replayed (FIX-002-AC). The replay ran at 16:57 on "a running task the agent did not start ... keeps no promise either". The end-of-run review commit 5d67c7b5 (17:02) then narrowed it to "armed on its own ... keeps none for other work". replay-after.jsonl quotes the old text 4 times and the new text 0 times. Covered by FIX-002, so this chains to /implement-trd --reconcile, which re-runs score.py on the current built prompt.
- The promise-block objective (O2) is proven only by that stale replay (5/5 blocked on both block cases). No Jest, BATS or pytest test asserts it. Covered by FIX-002, so this chains to /implement-trd --reconcile.

UNTESTED-IN-PRACTICE — a test exists but does not prove the requirement
- The allow objective (O1), and the allow case inside FIX-002: the replay case stands for the reported block, but it already passed with the pre-change prompt (0 of 5 runs blocked, 0 of 20 across variants). Passing it shows no regression. It does not show the clause causes the allow. The TRD discloses this, and the owner has to decide whether that is enough evidence (confirm-wanted). A real case needs the live transcript or the block reason from the owner's session.
- The clause has no regression guard (FIX-001). I re-checked by hand: 'armed on its own' appears once in the built prompt, the vendored prompt, all three settings.json files and docs/reference/hooks.md. The vendored copy is byte-identical to the built one, and `npx jest packages/core/hooks/prompts` passes 32 of 32. But no test would catch the clause being dropped later. Nothing is defective today.

REJECTED THESE FINDINGS
- none. I re-checked every finding against the files and all of them hold.

NO ACTION — implemented, tested, sourced
- FIX-001's acceptance criteria are met as written. Verified in packages/core/hooks/prompts/discipline-stop.prompt.md (4,880 bytes, under the 6,000-character limit) and .claude/hooks/prompts/discipline-stop.prompt.md. The matching exemption is in .claude/rules/async-discipline.md:45.

Could Not Verify, rewritten in /private/tmp/ensemble-vnext-feature-6-fix-stop-judge-auto-armed-monitor/docs/TRD/stop-judge-auto-armed-monitor.md: 4 entries. They are: no PRD, so validation is unchecked; the live block is unreproduced and its transcript sits under the owner's account; the allow case's final message was written for the TRD, not taken from the real turn; the watch's entry shape in `background_tasks` is assumed (open question OQ-1). The stale-replay gap is not listed there because it is an audit finding, reported above.
