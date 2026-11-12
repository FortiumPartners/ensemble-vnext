# Custody gate

Shared by the `merge` and `release` contracts; not a primitive (no front matter, never loaded by
the sequencer). It proves that the code about to be merged or released is the code that was
verified, and it is the only place a shipped-source change re-opens verification. `push` and
`open-pr` do not run it: a push is not gated by custody, the merge and the release are.

The caller gives the gate `work`, `context`, and which act it guards (`merge` or `release`).

## Do

1. **Merge only: get the PR head and the base.** `git fetch origin <base>` (the PR's base). Then
   poll `gh pr view <pr> --json headRefOid` up to 8 times, 15s apart, until it equals the id
   `git ls-remote origin refs/heads/<branch>` reports for what was pushed (the branch the work is
   on now); the PR's reported head can trail a push by about 80s. Not local `HEAD`: a parked
   record commit that was never pushed sits on it, and the PR head would never match. Still
   different after 8 polls: return `stop` naming both ids. Skip the poll when
   `gh pr view <pr> --json state` reads `MERGED` (merged by hand while the run was parked; its
   branch may already be deleted, so `ls-remote` reports nothing): the merged PR's `headRefOid`
   is final. Keep the PR's `headRefOid` as `<PR headRefOid>`.
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
     would pass stale). That file holds the merged result after the re-proof's one retry, and
     `retried: true` marks a criterion re-judged on the second try (a criterion met on retry
     passes custody; its flag keeps the flake visible). `moved`: go on.
   - `refused`, or any failure: return `stop` with the reason, naming the criteria that are not
     `met` and the differing files. This includes "local HEAD has shipped changes not on the PR
     head": push (or pull, when the PR head is the one ahead), let CI pass, then
     `/ship-build --resume`.
4. **Report.** Put the `reused` ids (proof reused because their files did not change) and the
   `excused` paths (they came from the base) in `data.custody`, one readout line each. When the
   result carries `mergeBases` (`old` and `new`: where the anchor and the base last met, then and
   now), put it there too: `old` differing from `new` means the base moved since verification;
   when no shipped path differs as well, only the criteria covering what the base changed were
   re-judged. They are not issues, so they stay out of `data.issues`.

   What needs re-proof is set by `ensemble.reproof` in `.claude/settings.json` (absent means the
   defaults; `docs` `none`, `testOnly`/`ciConfig`/`deps` `ci`, `depsReprove` `[]`, `format` `none`,
   `shipped` `covers`). When the rule is `tier-none` (only docs-class paths changed, left alone) or
   `tier-ci` (test, CI-config or lockfile paths changed, left to CI), the anchor moved with no
   re-proof: say so in one line naming the classes from the result's `reason`. A value outside the
   allowed set comes back `refused` with a reason naming the setting; report it, do not edit it.
5. **Do not commit or push anything between the gate and the act it guards.** The re-anchor in
   `custody.json` stays uncommitted, so the PR head stays the one CI checked and
   `--match-head-commit` matches.
