# Investigation: feature-close-out

**Kind**: change
**Weight**: medium
**Route**: plan
**Source**: owner instruction, 2026-09-28 ("Let's address the audit and close out work"), naming
the open item recorded in CLAUDE.md since 4.7.1: "`/audit-build` writes no durable report, and
nothing closes a feature — `docs/TRD/completed/` holds 1 against 17 active, which is the
structural cause behind both the stale `in_progress` rows and the unbounded ledger." Owner:
ship it as a patch release.

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | `/audit-build` leaves a durable report: `.trd-state/<feature>/audit-build-report.md`, holding the VERDICT line, the counts (findings, applied, rejected, still unverified, verifiers reporting) and the readout, with the date and the commit it audited | owner, 2026-09-28; CLAUDE.md 4.7.1 known-open |
| O2 | The audit report is published as an artifact like the verification report, its URL stored under `audit-build-report` in `.trd-state/<feature>/artifacts.json` and reused on the next run; publishing off or failing is one line, never fatal | O1; `command-status.md` "Artifact links" |
| O3 | A finished feature can be CLOSED: a close record `.trd-state/<feature>/closed.json` holds when, the commit, the task tally, the audit-build verdict and report path, the verification outcome and report path, and any task accepted as unfinished with its reason | owner, 2026-09-28 |
| O4 | Closing refuses a feature with tasks not `success` (or `deferred` with the TRD's stated reason) unless the owner passes an explicit acceptance reason, which is recorded per task | O3; the three stale features found by grounding |
| O5 | A closed feature stops presenting as in flight: the router's IN FLIGHT hint, the SessionStart banner, and `.trd-state/current.json` (its fields nulled, the file kept — `validate-init.sh` requires it) | CLAUDE.md 4.7.1 ("stale `in_progress` rows"); grounding C |
| O6 | Closing is an explicit owner act, named as the next step after merge by `/implement-trd`'s Step 9 and `/audit-build`'s readout; no command closes a feature on its own | `autonomy.md` "authorization is scoped to ONE command" |
| O7 | A `deferred` task no longer keeps the router's IN FLIGHT hint alive once the feature is closed, and the router's `TRD/completed/` terminator is joined by the close record (process.md: nothing is archived by folder) | grounding C, D |

## Intended Change

Checkable end state:

- After `/audit-build` on a TRD, `.trd-state/<feature>/audit-build-report.md` exists, begins with
  the VERDICT line the readout printed, and names the audited commit; `artifacts.json` gains
  `audit-build-report` when publishing is on.
- A new command `/close-feature [trd-path] [--accept "<reason>"]` writes `closed.json`, nulls
  `current.json`'s fields when it points at that feature, and prints a four-section readout and
  one banner. On a feature with unfinished tasks and no `--accept`, it ends `COMMAND STUCK`
  naming each task and status, and writes nothing.
- `router.py`'s `feature_in_flight` returns false for a feature with `closed.json`; the
  SessionStart banner says the feature is closed instead of "N/N tasks complete".
- `/implement-trd` Step 9 and `/audit-build`'s readout name `/close-feature` as the step after
  the PR merges.

## Decision

- **The command writes the audit report, not the workflow.** `audit-build.js` has no filesystem
  access (no `require`, grounding A); the command already holds the returned readout and counts.
  A deterministic renderer in a lib builds the file so its shape is testable.
- **A new command, not a flag on `/audit-build`.** Closing happens after the merge, which
  `/audit-build` precedes; folding it in would either close unmerged work or make the audit wait
  on an outward-facing act. Rejected: auto-close inside `/audit-build` or `/implement-trd` —
  `autonomy.md` scopes a command's authorization to itself.
- **Close record is a file beside `implement.json`**, not a status field inside it. It is written
  once, read by several consumers, and its presence is the signal; `implement-state.js`'s task
  logic is untouched. Rejected: moving TRDs to `docs/TRD/completed/` — process.md says nothing
  is archived by folder, and docs-as-built keeps docs in place.
- **`current.json` is nulled, not deleted** — `validate-init.sh:242` fails on a missing file.
- **Refuse-by-default with an explicit `--accept "<reason>"`** so the three stale features
  (judge-prompt-generative-rule, discipline-judgment, testing-phase) can be closed honestly, their
  unfinished rows recorded with the owner's reason rather than rewritten to `success`.
- **The merge commit** is found from git (`git log main --merges --grep <branch>` or the TRD
  branch's tip reachable from main); when it cannot be found the record says so rather than
  guessing.

absorbed:     router `feature_in_flight` ignores the close record — O5 cannot hold without it  [BLOCKS]
absorbed:     session-context banner has no closed state — O5 cannot hold without it  [BLOCKS]
not absorbed: `testing-phase`'s legacy `completed` status value — closing it with `--accept` records it honestly; normalising the enum is separate
not absorbed: docs-as-built's "finished" definition (D19) — parked design; note in its TRD that `closed.json` is the better signal, but it is not built
not absorbed: discovery-ledger settling of a closed feature's rows — separate, the ledger already supersedes by ref

## Grounding

A. `packages/core/workflows/audit-build.js`: args `{trd, prd, project, report_only}` (:25-31);
zero-findings return with code-built VERDICT (:441-465); findings-path return from the Reconcile
agent's `{readout, applied, rejected, could_not_verify_remaining}` (:570-592); writes nothing
itself [read]. `packages/core/commands/audit-build.md`: Workflow call :157, "print it" :165,
readout format :172-222, no Artifact instructions [read].

B. Verification report pattern: `renderReport` `functional-verification.js:561`; publish in
`implement-trd.md` §9.0a :1856-1886 with `artifacts.json` keys [read].

C. `packages/core/lib/implement-state.js` exports (:417-425), no feature status [read]. Stale:
judge-prompt-generative-rule FIX-001..003 `in_progress`; discipline-judgment DISC-B009 `blocked`;
testing-phase 80 legacy `completed` + TRD-TEST-084/085 `pending` [ran]. `current.json` written
by implement-trd §1.3a :173-197, gitignored `.gitignore:21`; readers: session-context.js
:143-195, dispatch-ledger.js :97-119, notify-complete.sh :154-167, precompact.js :195,
router.py `feature_in_flight` :380-418 (terminates on `TRD/completed/` or all-success) [read];
validate-init.sh :242 requires the file [read].

D. `docs/TRD/completed/` holds one TRD [ran]; process.md.template :205-229 "nothing is
archived" [read]; docs-as-built D19 [read].

E. No command runs after merge; implement-trd Step 9 NEXT :1832-1839 [read]. New commands
ship via `scaffold-project.sh copy_commands` :400-440 automatically; need a `.claude/commands/`
copy; router FLOW hint lists commands :70-88 [read].

F. Tests: audit-build.test.js, implement-state.test.js, test_router.py
(`TestFeatureInFlightTerminator` :757+, IN FLIGHT :706-754), dispatch-ledger.test.js,
precompact.test.js, notify-on-complete.test.sh, validate-init.test.sh, runtime-integrity.test.sh
:59-62; no session-context test exists [read/ran].

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Command name | `/close-feature` | no |
| OQ-2 | Should closing also require the audit-build verdict to be "safe to proceed"? | No: the verdict is recorded, not gated; a feature closed with caveats says so in its record | no |

## Owner decisions after review (2026-09-28)

These supersede the matching parts above; the TRD (v2.0.2) carries them in full.

- **Closing is a judgement, not a status count.** `/close-feature` gathers the facts (every task's
  status and, for a deferred task, the TRD's reason; the verification outcome and unmet criteria;
  the audit-build verdict and the commit it audited; whether the last checkpoint commit is on the
  default branch) and the model judges `done`, `done-with-gaps` (each gap named, with why it does
  not undermine an objective) or `not-done` (what is missing, and which objective it leaves
  unproven). Example: a deferred live-verification task can be a gap (criteria met another way) or
  a reason for `not-done` (it was the only evidence the behaviour works).
- **The owner's evidence counts.** An optional free-text note ("deployed live and I tested it") is
  weighed with the repo facts and recorded verbatim as owner-attested.
- **`--accept "<reason>"` is an override**, used only when the judgement is `not-done`; recorded
  separately from owner evidence. A feature with no `implement.json` may be closed only with it,
  and is recorded as abandoned.
- **`/close-feature` runs only on the default branch**, writes `closed.json` without committing, and
  says to commit it; on any other branch it ends STUCK.
- **Closed features are guarded:** `/implement-trd` (every mode, including its automatic TRD
  lookup) and `/amend` refuse a closed feature and say how to reopen it.
- **The audit report is written by `/audit-build` itself** (no separate library); with no path and
  no current feature it ends STUCK asking for one. An absent or stale audit (a file this TRD
  touches changed after the audited commit) is named, never blocking.
- **No new libraries.** Status counting and the close decision need judgement; the facts are
  plain git and file reads.
