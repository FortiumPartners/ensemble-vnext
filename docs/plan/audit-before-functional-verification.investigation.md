# Investigation: audit-before-functional-verification

**Kind**: change
**Weight**: medium
**Route**: plan

Source: feature F-1 of Forge workplan `storybook-framework-requests`, roadmap item 1
("Audit before functional verification"), roadmap committed at `bf2cf062`
(`docs/plans/storybook-framework-requests/roadmap.md`, not on this branch). Item text, verbatim:

> Change the delivery order so the code audit (/audit-build) runs before the functional-verification
> loop, not after it, in /implement-trd's end-of-run sequence, its NEXT text and /verify-build's
> hand-off, so fixes the audit causes land before verification and verification evidence is
> produced once, on the final code. A passing audit still opens the PR when
> ensemble.openPullRequest is auto, but only after verification has also run. Keep /audit-build
> usable on its own after the fact. Update the command text, the docs that describe the order and
> the tests that pin it.
>
> How it will be checked: npx jest and bats for the touched command-surface tests pass; a grep
> shows no command text still saying verification runs before the audit; a headless fixture
> session shows /implement-trd running the audit step first.

Original request (Storybook PM message b8002d99): "Run the code audit (/audit-build) before or
alongside functional verification, not after it. Today audit fixes land after verification and
throw away its evidence."

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A default `/implement-trd` run (not `--chained`) runs the code audit (`/audit-build`, with its fix run) after the end-of-run code review and BEFORE the functional-verification loop, so verification runs once, on code that already carries the audit's fixes | roadmap item 1; PM instruction, 2026-11-16 | yes |
| O2 | The feature is closed and the PR opened (when `ensemble.openPullRequest` is `auto`) only after BOTH the audit has passed AND verification has run with outcome `satisfied` (or was skipped by `--no-verify`); a passing audit followed by a failing verification closes nothing and opens no PR | roadmap item 1 ("only after verification has also run") | yes |
| O3 | `/implement-trd`'s readout NEXT and `/verify-build`'s hand-off follow the new order: neither tells the owner to run `/audit-build` after a verification when an audit has already passed on this feature; `/verify-build` with outcome `satisfied` and an audit pass on record completes that deferred close (and PR) itself | roadmap item 1 ("its NEXT text and /verify-build's hand-off") | |
| O4 | `/audit-build` invoked on its own by the owner behaves exactly as today: audits, chains its fix run, closes the feature and opens the PR on a pass | roadmap item 1 ("Keep /audit-build usable on its own") | yes |
| O5 | Command text (`packages/core/commands/` and the `.claude/commands/` mirror) and docs that describe the order (`CLAUDE.md`, `.claude/rules/process.md`, `docs/guides/*`, `docs/reference/implement-trd.md`, `docs/reference/verification.md`, others grep finds) state audit-first; a grep finds no text still saying verification runs before the audit | roadmap item 1 "How it will be checked" | |
| O6 | Jest tests pin the order: the existing tests that pin "satisfied → NEXT `/audit-build`" are rewritten to pin audit-first, and new tests pin the deferred-close mode and its library support | roadmap item 1 | |
| O7 | A headless fixture session (the `fixtures` environment of `verification.md` §1) shows `/implement-trd` running the audit step before the verification step | roadmap item 1 "How it will be checked"; PM acceptance | |

## Intended Change

Today [read]: `/implement-trd` ends with Step 7.2 (`/code-review high --fix` over the branch diff),
then Step 8 (one `Workflow(verify-functional)` dispatch), then Step 9's readout, whose NEXT on any
outcome other than the refine/setup-failure branches is `/audit-build <trd> --prd <prd>`
(`packages/core/commands/implement-trd.md` ~line 2374). `/implement-trd` itself never runs the audit
and never closes the feature. `/verify-build`'s readout rule O4 is "outcome `satisfied` →
`/audit-build`" (`packages/core/commands/verify-build.md` ~line 473 and ~line 786). `/audit-build`
then audits, may chain `/implement-trd --reconcile --chained` to fix gaps (which changes code after
verification proved it — the defect the request names), and on a pass runs the waived-defect gate,
performs `/close-feature`'s close step with `closedBy: "audit"`, commits the TRD, publishes,
writes the records ref and opens the PR when `ensemble.openPullRequest` is `auto`
(`packages/core/commands/audit-build.md` "After the workflow returns", steps 2–4 and the PR
paragraph).

After:

1. `/implement-trd`, default run: Step 7.2 review → **new Step 7.3: audit** → Step 8 verification
   → Step 9. Step 7.3 runs `Skill({ skill: "audit-build", args: "<trd> --prd <prd> --defer-close" })`.
   It is skipped under `--chained` (a fix run never audits — this is what stops
   implement-trd → audit-build → implement-trd --reconcile --chained from recursing) and is NOT
   skipped by `--no-verify` (the audit is not part of verification).
2. `/audit-build --defer-close` (callers only, like `--chained`, never typed by hand): runs the
   audit, records the round, chains its fix run exactly as today; but where `decide` returns
   `close: true` it does NOT run the gate, write `closed.json`, publish or open the PR. It records a
   **pending close** (verdict, report path, `auditedCommit`, `anchorCommit` computed by today's rule)
   in the feature's run records, writes the records ref, and ends with one
   `[STATUS: /audit-build] RETURN → <passed, close deferred | re-audit needed | cap reached | open: <why> | STUCK: <why>>`
   line instead of a banner, `notify-complete.sh` or `PushNotification`. Every non-close branch
   (reaudit, capReached, uncovered) behaves as today except it returns instead of printing a banner.
3. `/audit-build --close-deferred` (callers only): reads the pending close and performs today's close
   tail from it — waived-defect gate, close step with `closedBy: "audit"` and the pending audit
   fields, commit the TRD if needed, publish, records ref, open the PR per
   `ensemble.openPullRequest` — without re-running any verifier, then clears the pending close and
   returns one RETURN line. No pending close → returns `RETURN → nothing to close`.
4. `/implement-trd` Step 9: when Step 7.3 returned "passed, close deferred" AND Step 8's outcome is
   `satisfied` with no `definition-problem` criterion (or Step 8 was skipped by `--no-verify`), run
   `Skill(audit-build, "<trd> --close-deferred")` before the readout; STATE then says the feature is
   closed and names the PR (or the skip/fail reason). Otherwise nothing closes, the pending close
   stays, and NEXT follows the verification outcome (`/refine-verification` → `/verify-build`, or the
   setup-failure fix) or the audit's own result (re-audit `/audit-build`, capped `/close-feature`,
   uncovered → design work). NEXT never names `/audit-build` merely because verification passed.
5. `/verify-build`: outcome `satisfied` (no `definition-problem` criterion) with a pending close on
   record → run `Skill(audit-build, "<trd> --close-deferred")`, and NEXT is shipping (`/ship-build`)
   or the PR step. Outcome `satisfied` with no pending close and no closed feature → NEXT is
   `/audit-build` (the audit has not run; standalone use stays possible). Under `--chained` and for a
   sweep file nothing changes.
6. `/audit-build` with neither flag: unchanged (O4).

Checkable: a default `/implement-trd` transcript shows the `audit-build` Skill call before the
`Workflow(verify-functional)` call; a run whose verification is not `satisfied` leaves no
`closed.json` and opens no PR while the pending close exists; `/audit-build` alone on a passing
feature still writes `closed.json`.

## Decision

- **Audit runs first, not in parallel** (OWNER-CALL by the PM, 2026-11-16): running both at once
  would still discard verification evidence whenever the audit's fix run changes code.
- **Defer the close, do not move it.** The close and the PR stay owned by `/audit-build`
  (one implementation of the close tail), split into a deferred record written by the audit and a
  `--close-deferred` completion run after verification. Rejected: copying the close tail into
  `/implement-trd` and `/verify-build` (three copies of the waived-defect gate, close fields and PR
  logic would drift); rejected: re-running a full `/audit-build` after verification (a second
  verifier wave on unchanged code, the cost the request is trying to remove).
- **The close must follow verification** for a second reason: the waived-defect gate files the
  failures verification waived under `Blocking: must-pass only` (owner rule, 2026-11-12); run before
  verification, it would see none.
- **Code changed by verification's Debug stage after the audit does not invalidate the pending
  close.** Verification proved that code; `/ship-build`'s custody check re-proves from
  `anchorCommit` regardless, and when the close follows a satisfied verification in the same run,
  `anchorCommit` is the head at close time (OWNER-CALL, 2026-11-16). A later round of any audit
  supersedes a pending close; a change to the TRD since the audit makes it stale.
- **A re-audit runs inside `/implement-trd`'s audit step**, up to the audit cap, before
  verification, so NEXT never sends the owner to a standalone `/audit-build` for one (refines
  Intended Change item 4).
- The pending close is a line on the existing audit round ledger (`audit-rounds.jsonl`), written
  through `record` with the round's run id, `closeDeferred: true` and the close fields, its TRD
  hash taken after the fix run. `audit-rounds.js` (source `packages/core/lib/`, mirror
  `.claude/lib/`), the owner of round decisions, gains one read helper and one CLI verb
  (`pending-close`) and folds a round's lines by run id, unit-tested with Jest. Nothing is
  deleted: a later round supersedes it and a close consumes it. Run records go to the records ref,
  never committed on the branch.
- Mirrors: every edited command exists in `packages/core/commands/` and `.claude/commands/` and must
  stay byte-identical (existing tests check this); `packages/full/` is refreshed the way the repo's
  existing sync does it.

absorbed: none.
not absorbed: verification Debug commits landing after `anchorCommit` — `/ship-build` custody already handles it; separate.
not absorbed: capping verification runs per feature — roadmap item 2, built separately (to come).

## Grounding

- `packages/core/commands/implement-trd.md` — Execution Model block (~line 72), Step 7 intro and
  §7.2 (~1572–1636), Step 8 intro (~1638), Step 9 NEXT template (~2350–2380) and the paragraph
  "A passing `/audit-build` opens the PR…" (~2380), §3.7 `--chained` (~1018), argument list and
  usage header (lines 1–66). [read]
- `packages/core/commands/audit-build.md` — frontmatter argument-hint, User Input parsing,
  "After the workflow returns" steps 0–4 (~286–380), PR paragraph (~312 of the tail), readout. [read]
- `packages/core/commands/verify-build.md` — readout rule O4 (~473), the final-round readout (~786),
  `--chained` section, sweep-file NEXT (unchanged). [read]
- `.claude/lib/audit-rounds.js` — `record`, `decide`, `tally`, `stale-wake`; the place to add the
  pending close. [inferred: confirm source location and CLI shape]
- `packages/core/commands/close-feature.md` "The close step" — reused unchanged by `--close-deferred`. [inferred]
- Tests pinning today's order [read]: `packages/core/commands/verify-command-surface.test.js`
  ("satisfied branch: NEXT names /audit-build" ×2, ~681 and ~727; "implement-trd.md says
  /audit-build opens the PR when openPullRequest is auto", ~809; §3.7 callers, ~664/912);
  `packages/core/commands/waived-defects-close-prose.test.js` (gate before close; mirror identity).
- Docs naming the order [read, by grep]: `CLAUDE.md`, `README.md`, `.claude/rules/process.md`,
  `.claude/rules/command-status.md`, `docs/guides/{PROCESS,QUICK-REFERENCE,CONCEPTS,ARCHITECTURE,README,ship-build}.md`,
  `docs/reference/{implement-trd,verification,other-commands,README}.md`.
- Live check: `fixtures` environment, scaffold with
  `packages/core/scripts/scaffold-project.sh --plugin-dir packages/full <slot>`, headless pattern in
  `test/smoke/lib/project.sh`. [read]
- Hazard: `/implement-trd --chained` must skip Step 7.3, or audit → fix run → audit recurses. [inferred]
- Hazard: `/audit-build`'s stale-wake check and the fix run's §7.2 review that can finish after the
  RETURN line (anchorCommit waits for it) still apply inside `--defer-close`. [read]

## Open Questions

none
