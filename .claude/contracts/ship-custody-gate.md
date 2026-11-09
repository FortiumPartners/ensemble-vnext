# Custody gate

Shared by the `merge` and `release` contracts; not a primitive (no front matter, never loaded by
the sequencer). It proves that the code about to be merged or released is the code that was
verified, and it is the only place a shipped-source change re-opens verification. `push` and
`open-pr` do not run it: a push is not gated by custody, the merge and the release are.

The caller gives the gate `work`, `context`, and which act it guards (`merge` or `release`).

## Do

1. **Merge only: get the PR head and the base.** `git fetch origin <base>` (the PR's base). Then
   poll `gh pr view <pr> --json headRefOid` up to 8 times, 15s apart, until it equals the id
   `git rev-parse HEAD` reports for what was pushed; the PR's reported head can trail a push by
   about 80s. Still different after 8 polls: return `stop` naming both ids. Keep the PR's
   `headRefOid` as `<PR headRefOid>`.
2. **Reconcile:**
   ```bash
   node .claude/lib/custody.js reconcile --state-dir <work.stateDir> --trd <work.trd|none> \
     --closed <work.stateDir>/closed.json --definition <work.stateDir>/success-definition.md \
     --base origin/<base> [--head <PR headRefOid>]
   ```
   `merge` passes `--head <PR headRefOid>` and `--base origin/<base>`. `release` omits `--head`
   (the local `HEAD` is judged) and passes `--base origin/<context.base>` only when an earlier
   PR step gave a `base`. Read the one JSON line it prints.
3. **Act on the result:**
   - `set`, `none` or `moved`: go on.
   - `reverify` (shipped source changed since the anchor and the listed must-pass criteria need
     proof again): the head is already pushed, so a preview of it exists or is building. Run
     `/verify-build <work.trd> --criteria <ids> --no-fix --chained` (a synchronous Skill call; its
     setup check waits for the environment as `verification.md` declares), then repeat the
     reconcile above with `--reverified <work.stateDir>/reverify/verification-state.json` (the
     subset run writes there; the feature's own `verification-state.json` is the old full run and
     would pass stale). `moved`: go on.
   - `refused`, or any failure: return `stop` with the reason, naming the criteria that are not
     `met` and the differing files. This includes "local HEAD has shipped changes not on the PR
     head": push, let CI pass, then `/ship-build --resume`.
4. **Report.** Put the `reused` ids (proof reused because their files did not change) and the
   `excused` paths (they came from the base) in `data.custody`, one readout line each; they are
   not issues, so they stay out of `data.issues`.
5. **Do not commit or push anything between the gate and the act it guards.** The re-anchor in
   `custody.json` stays uncommitted, so the PR head stays the one CI checked and
   `--match-head-commit` matches.
