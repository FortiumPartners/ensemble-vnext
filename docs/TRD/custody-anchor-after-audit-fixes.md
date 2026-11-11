# TRD: custody-anchor-after-audit-fixes

**Source PRD**: None — small change decided by the owner's plan `ship-cost-reduction`, item 1 (`docs/plans/ship-cost-reduction/roadmap.md`)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | When `/audit-build` closes a feature after a chained fix run that did not end STUCK, the custody anchor a first `/ship-build` sets is the branch head after that fix run committed, so the first custody check finds no changed shipped code and asks for no re-proof | roadmap item 1, 2026-11-11 | yes |
| O2 | The audit report and `closed.json` keep the commit the audit actually examined (`auditedCommit`) as its own truthful field, distinct from the anchor | roadmap item 1, 2026-11-11 | yes |
| O3 | A feature closed with no chained fix run, closed by the owner, or whose fix run ended STUCK, anchors exactly as today (the audited commit, else the pushed head) | roadmap item 1, 2026-11-11 | |

## Intended Change

Today (`[read]`): `/audit-build` writes `- Audited commit: <git rev-parse HEAD>` into its report
before step 3 chains `/implement-trd <trd> --reconcile --chained`
(`packages/core/commands/audit-build.md` "Writing the audit report" and "After the workflow
returns", step 3). The close (step 4) copies that header value into `closed.json`
`audit.auditedCommit`. When no `custody.json` exists, `custody.js reconcile` reads
`auditedCommitOf(closed.json)` and anchors there with `source: 'audited'`
(`packages/core/lib/custody.js` `reconcile`, the `if (!custody)` block). The fix run's own
commits then sit after the anchor, so the first ship's reconcile sees shipped differences and
asks for re-verification (or moves with `no-success-definition`), re-proving work the audit
already accepted.

After this change:

1. `closed.json`'s `audit` object gains `anchorCommit`: the full id of `git rev-parse HEAD`
   taken once the chained fix run is completely done, written only when (a) step 3 chained a
   fix run in this round, (b) its `[STATUS: /implement-trd] RETURN →` line is not
   `RETURN → STUCK`, and (c) `decide` returned `close: true` (a close means this round's verdict
   passed with no open defect; a re-audit that closes has passed). In every other close it is
   `null`. **"Completely done" includes the fix run's end-of-run whole-branch review**
   (`implement-trd.md` §7.2): that review runs in the background and commits its edits
   (`fix(<feature>): end-of-run review edits`) only when its result arrives, which under plain
   `--chained` can be after the RETURN line. So the close waits for that review's result and
   its edit commit — the same wait `--shipping` imposes for `/ship-build` — before taking the
   head. If the review's `[review-pending]` row for this fix run is still unresolved when the
   close is written, `anchorCommit` is `null` (today's behaviour), never a head the review may
   still change.
   `auditedCommit` stays the report header's value, unchanged.
2. `custody.js reconcile`, when no anchor is set, prefers a valid `audit.anchorCommit` (anchor
   `source: 'audit-fixed'`), then `audit.auditedCommit` (`source: 'audited'`), then the head
   (`source: 'pushed'`). A present-but-unresolvable `anchorCommit` is refused with a reason
   naming it, exactly as an unresolvable `auditedCommit` is today.
3. Checkable outcome: in a repo where `closed.json` carries `auditedCommit = A`,
   `anchorCommit = F` and F is A plus fix-run commits touching shipped source, followed only by
   record-file commits (the audit report, `closed.json`), the first `reconcile` returns
   `action: 'set'` with `anchor: F`, and a second `reconcile` returns `action: 'none'`. With the
   same history but `anchorCommit` absent or `null`, the first reconcile anchors at A and does
   not return `none`/`set` (it moves or asks to re-verify, as today) — so the test fails if the
   new field is ignored.

## Decision

Add a separate `audit.anchorCommit` field rather than overwriting `auditedCommit` with the
post-fix head. Overwriting would make the report header and the close record disagree about
what was audited, and `audit-rounds.js` re-audits read `auditedCommit` as "the files changed
since that audited commit" — rewriting it would shrink a re-audit's scope to exclude the fix
run's own changes. The command (prose) decides whether the fix run ended cleanly and records
the head; the library only prefers the field when present. No condition logic moves into
`custody.js`: it cannot see the RETURN line, and a `null`/absent field already means "today's
behaviour".

This trusts the fix run's own checks for the code it changed. The audit examined the audited
commit, not the post-fix one; under `--chained` the fix run skips functional verification, so
the post-fix changes are proven by the fix run's phase gate (verify-app plus the test battery)
and its whole-branch review, not by the audit. The plan accepts that trade: a closing round has
no open defect (`decide` closes only at zero defects), so its fix run carries test gaps and
review edits, and re-proving them at ship time is the cost this item removes.

Rejected: taking the anchor at the head of the close commit itself. It works today because
everything after the fix run is a record file, but it would silently swallow any unaudited
commit that ever slipped in between. Rejected: chaining the fix run with `--shipping` to get
its review wait — that flag also skips the push and bypasses the closed-feature guard, which
are ship semantics, not audit ones.

## Non-Goals

- No change to `check`, `move`, `affectedIds`, the base excuse, path classes or re-proof rules
  (roadmap items 2–3, built separately).
- No change to `/close-feature`'s owner close (`audit: null`) or to `/task` closes.
- No change to `audit-rounds.js` or what a re-audit reads.
- No live `/audit-build` → `/ship-build` run here (deferred; see Could Not Verify).

## Verification Artifacts

None apply — the change is a library rule and command prose; no screen, data view or user flow is involved.

## Verification Environment

**Environment**: local
**Refresh**: none declared — tests and libraries read the working tree
**Cannot be checked there**: a real `/audit-build` then `/ship-build` run; that needs the `github-live-test` environment and is deferred

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | `custody.js reconcile`: prefer `closed.json` `audit.anchorCommit` (source `audit-fixed`) over `audit.auditedCommit` when no anchor is set; refuse an unresolvable one; update the header comment and the vendored copy | O1, O3 | None | New Jest tests in `packages/core/lib/custody.test.js`: (a) audited commit A, fix-run commits to `src/` making F, then a commit of `closed.json` itself (under `.trd-state/`, a record path); `closed.json` `{auditedCommit: A, anchorCommit: F}` → first reconcile `{action:'set', anchor:F}`, `custody.json` source `audit-fixed`, second reconcile `{action:'none'}`; (b) same history with `anchorCommit: null` → anchor is A, source `audited`, first reconcile action is not `set`/`none`; (c) `anchorCommit: 'deadbee'` → `refused`, reason names the anchor commit, no `custody.json`; existing tests pass; `.claude/lib/custody.js` identical to `packages/core/lib/custody.js` |
| FIX-002 | `/audit-build` close: once the chained fix run has returned AND its end-of-run review result has arrived and its edits are committed, record `anchorCommit` (post-fix `git rev-parse HEAD`) in `closed.json`'s `audit` object only when this round chained a fix, its RETURN line is not STUCK, and `decide` returned close; otherwise `null`; `auditedCommit` stays the report header's value. Update `docs/reference/other-commands.md`'s `closed.json` fields row (`anchorCommit` nullable); sync the vendored command copy | O1, O2, O3 | FIX-001 | New tests in `packages/core/commands/verify-command-surface.test.js` assert `audit-build.md` (a) carries `"anchorCommit"` in the close's audit object, (b) takes it from `git rev-parse HEAD` only after the fix run's RETURN line and after its end-of-run review edits are committed (names `end-of-run review edits` / the `[review-pending]` row), (c) writes `null` when no fix run was chained, the RETURN line is `RETURN → STUCK`, or the review's pending row is still unresolved, (d) still writes `auditedCommit` from the report header; `docs/reference/other-commands.md` names `anchorCommit` as nullable; `.claude/commands/audit-build.md` equals `packages/core/commands/audit-build.md`; `npx jest packages/core/lib/custody.test.js packages/core/commands` passes |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/custody.js`, `.claude/lib/custody.js`, `packages/core/lib/custody.test.js`
- **Reuse:** `auditedCommitOf(closedPath)` (custody.js ~244) reads `closed.json` defensively — generalise it to read a named field, or add a sibling reader; `resolveCommit` already resolves and refuses short/ambiguous/missing ids [read]. Tests reuse `setup()`, `s.commit`, `s.args()`, `s.readCustody()` from `custody.test.js` and mirror "a unique short audited id resolves…" [read]
- **Replaces:** the single-source `if (audited)` branch in `reconcile`'s `if (!custody)` block [read]
- **Follow:** every expected failure returns `refused` with a reason, never throws; header comment documents the rule; `.claude/lib/custody.js` is a byte copy of the package file (currently identical, `diff -q` clean) [ran]
- **Careful:** `.trd-state/**` and the TRD are `ignored` paths, so the record-file commit after F must be under `.trd-state/` (where the test's stateDir lives) for the second reconcile to read `none`; check `stateDir` in `setup()` is inside the repo. Don't change the `pushed` path or the `setOnly` path's semantics [inferred]

### FIX-002
- **Touches:** `packages/core/commands/audit-build.md`, `.claude/commands/audit-build.md`, `packages/core/commands/verify-command-surface.test.js`, `docs/reference/other-commands.md`
- **Reuse:** the `[review-pending]` row and its resolution (`implement-trd.md` §7.2 steps 1–3, `discovered.resolve`) to tell whether the review's edits are committed; step 4's existing close sentence (`"audit": { "verdict": …, "report": …, "auditedCommit": "<the header's value>" }`) — extend it in place; the RETURN line contract (`implement-trd.md` ~1066 and ~1074: success vs `RETURN → STUCK: <reason>`) [read]
- **Replaces:** nothing; adds one field and its rule [read]
- **Follow:** the describe block "audit-build owns the fix run and the round decision" (verify-command-surface.test.js ~785) uses `flat(read(...))` and regex `toMatch` on prose — add the new tests there; the test at ~878 asserts the vendored command copy is identical [read]
- **Careful:** existing tests pin exact phrasing of the close sentence and the `previous`/`record` lines that mention `auditedCommit` (lines ~829–836) — do not reword those; the re-audit's `previous.auditedCommit` must stay the ledger's audited commit, not the anchor [read]

## Could Not Verify

- A live `/audit-build` then `/ship-build` on `github-live-test` showing the first custody check asks for no re-proof — deferred by the plan; it waits on this build.
- The wait for the fix run's background review is prose the model follows; if the model closes before the review returns, the rule degrades to `anchorCommit: null` (today's behaviour), not to a wrong anchor — but that degradation is itself only checked by contract tests.
- Whether the model running `/audit-build` reliably distinguishes a STUCK RETURN line from a successful one is prose-following, checked only by contract tests here.
