# Brief: Decide none, targeted or full before every re-verification, re-audit, re-proof or CI rerun

Source: GitHub issue #157 in FortiumPartners/ensemble-vnext. Owner ruling 2026-11-16: keep
quality, but do not run tests several times when the reruns add no new value; the model judges
whether a full rerun adds value, and asks the PM (the owner's delegate) when unsure.

This is the central rule. Issues #153 (custody re-proof scope), #154 (functional-verification
regression pass without covers records), #155 (CI-proven criteria re-proved by a full manual CI
run) and #156 (implement-trd phase gates running the full battery twice) each apply it to one
mechanism, and land after it. Their mechanical fixes are NOT part of this change.

## Steps

1. Read the five commands that re-run checks: `packages/core/commands/verify-build.md`,
   `refine-verification.md`, `audit-build.md` (a re-run of the audit), `ship-build.md` (the
   custody re-proof and wait-ci reruns) and `implement-trd.md` (phase-gate battery, line 1256:
   "the command runs the FULL battery here").
2. Look for a step, in any of them, that reads what changed since the last satisfied or green
   result and chooses how much to re-run before re-running.
3. Look under `packages/core/contracts/` for a shared contract stating such a rule.

## Expected

- One shared contract, `packages/core/contracts/rerun-scope.md`, that every re-running command
  reads before it re-runs anything. It says: before a re-verification, re-audit, re-proof or CI
  rerun, read the change since the last satisfied or green result (the anchor) and choose one of
  - **none**: only run records (`.trd-state/`), docs, rulings or framework files changed;
  - **targeted**: only the open or affected criteria, the related tests, or the failed CI jobs;
  - **full**: the change is wide or touches shared code, or the change cannot be read.
- It names the anchor each command reads (the last satisfied verification report and its
  commit, the custody anchor, the last green CI run's head, the last passing audit report, the
  last green phase-gate tree) and what counts as "related" for each.
- The choice and its reason are stated in the command's readout (DECISIONS), in plain words:
  "targeted: only `src/layout/Phone.tsx` changed since the last green run; re-checked the 3
  criteria that cover it".
- When the model is unsure, it does not default to full. Interactively it asks the owner one
  question, with the scope it would take as the default. Unattended (a Forge-driven session, an
  automatic mode, or a chained call) it stops with COMMAND STUCK carrying the scope question and
  its proposed default, for the PM to answer and resume.
- Each of the five commands has a short step that reads the contract at the point it would
  re-run, and records the choice. Quality is kept: a criterion the change can affect is always
  re-checked; "none" is allowed only when nothing the checks exercise changed.
- A `/verify-build` resumed after a session restart continues the open criteria from
  `verification-state.json`, rather than restarting the loop over every criterion.

## Actual

- No such contract exists: `ls packages/core/contracts/rerun-scope.md` reports "No such file or
  directory".
- None of the five commands has a scope-decision step; `grep -c rerun-scope` returns 0 for each.
- Scope today is decided mechanically inside each mechanism, and widens to full on any doubt:
  `packages/core/lib/custody.js:501` re-proves every must-pass criterion when one changed file
  matches no covers record; `packages/core/workflows/verify-functional.js:3250-3256` re-checks a
  criterion with no covers record whenever anything changed; `implement-trd.md:1256` re-runs the
  full battery after the gate already ran it.
- Observed cost (issue #157, Storybook phone-layout builds): five `/verify-build` sessions on
  build 1, the last a full 2 h 44 m run after a docs-only commit; build 2 a full round after a
  TRD-only commit; re-proofs of every criterion after small merge-ups. The resume flag only
  re-enters a loop whose state has `outcome: null` (`verify-build.md:617-625`); a fresh session
  after a restart re-ran the whole loop.

## Where

- New: `packages/core/contracts/rerun-scope.md` (the rule), beside
  `packages/core/contracts/functional-verification.md`; vendored to `.claude/contracts/` the
  way the other contracts are.
- `packages/core/commands/verify-build.md:595-625` (the fix, no-fix and resume section, and the
  start of a plain run: read the contract, choose scope, and continue open criteria on a
  restarted session).
- `packages/core/commands/refine-verification.md` (the plan it writes names the chosen scope for
  the next run).
- `packages/core/commands/audit-build.md` (a re-run of the audit).
- `packages/core/commands/ship-build.md` and `packages/core/contracts/ship-custody-gate.md`
  (state the scope before the custody re-proof); `packages/core/contracts/ship-primitive-wait-ci.md:35`
  (CI reruns: failed jobs only unless the contract says full).
- `packages/core/commands/implement-trd.md:1254-1256` (phase-gate battery).

## How to check

Fails now, passes after the fix:

```bash
test -f packages/core/contracts/rerun-scope.md \
  && for c in verify-build refine-verification audit-build ship-build implement-trd; do
       grep -q "rerun-scope" "packages/core/commands/$c.md" || { echo "missing: $c"; exit 1; }
     done && echo ok
```

Plus a Jest test beside the other contract tests (pattern:
`packages/core/contracts/functional-verification.test.js`) asserting the contract states the
three scopes, the anchor per command, the readout line and the unsure-case behaviour (ask
interactively, COMMAND STUCK unattended), and that each of the five commands references it.
Run with `npx jest packages/core/contracts`.

## Open questions

- **How a command knows it is unattended (owner's call, default taken).** No command today
  detects Forge (`grep -rn "under Forge" packages/core/commands` finds nothing). Default:
  treat a chained call, an automatic mode or a non-interactive session as unattended, and
  COMMAND STUCK there; ask interactively otherwise. A Forge-specific signal is left to Forge.
- **Prose rule or deterministic helper (owner's call, default taken).** Default: the contract
  is prose the model applies (the owner ruled the model judges scope), with one small helper
  in `.claude/lib/` that lists the files changed since an anchor and marks each as record,
  doc, framework or code, so the model judges from facts rather than from memory. The
  helper decides nothing.
- **Boundary with #153–#156 (default taken).** This change delivers the rule and the decision
  step in each command; changing `custody.js`, `verify-functional.js`, the CI-proof mechanism
  and the implement-trd battery is left to those four issues.

Decisions: ship path: CLAUDE.md "Shipped" names `.github/workflows/ci.yml`, which exists and references no secrets; no migrations touched; nothing to decide (checked 2026-11-16).
Decisions: how a command knows it is unattended: owner's call, default taken (chained, automatic or non-interactive means unattended, so COMMAND STUCK with the scope question; otherwise ask) (auto, 2026-11-16).
Decisions: prose rule or helper: owner's call, default taken (prose contract the model applies, plus a fact-only changed-files helper that decides nothing) (auto, 2026-11-16).
Decisions: boundary with issues #153 to #156: default taken (this change ships the rule and the decision step only; the four mechanism fixes land after it) (auto, 2026-11-16).
