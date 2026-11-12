# Live CI probe: do pushed `refs/ensemble/records/*` refs start a workflow? (FIX-003)

Environment: `github-live-test` (`islayjames/ship-build-live-test`), fresh clone under the OS temp dir,
library `.claude/lib/record-ref.js` (FIX-001), `FORGE_FEATURE_ID` unset. Stamp `1794475375`.
Date 2026-11-12. Nothing was pushed to `FortiumPartners/ensemble-vnext`. No PR was opened.

Finding: **pushing a records ref started no workflow, both against the repo's own `ci.yml`
(`push: branches: [main]` + `pull_request`) and against an unfiltered `on: push` workflow that was
proven live on the same push window.**

## Probe 1: as-is repo

- main head (seed): `8c580c160406774faf002b2f2c449206f8721698`
- `git update-ref refs/ensemble/records/probe-asis-1794475375 8c580c16...`, then
  `node record-ref.js write --state-dir .trd-state/probe-asis-1794475375 --command probe --step "probe 1"`
  -> `outcome: ref, push: pushed`, commit `b878279b62feed32659eaa1bd0e838ae4b66c195`
- parent check: `git rev-parse <ref>^` = `8c580c160406774faf002b2f2c449206f8721698` (the seed)
- remote: `git ls-remote origin 'refs/ensemble/*'` listed the commit on the ref.

## Probe 2: unfiltered `on: push` workflow

- Throwaway branch `probe/records-ref-ci-1794475375` adding `.github/workflows/probe-any-push.yml`
  (`on: push`, no filter, one echo job). Branch head `7b635175bcce87afb5a6c24bf1714903b7528a91`.
- Workflow live: run created 2026-11-12T09:23:06Z, event `push`, headBranch `probe/records-ref-ci-1794475375`,
  headSha `7b635175...`, conclusion success.
- `refs/ensemble/records/probe-branch-1794475375` seeded at that head, `record-ref.js write` ->
  `outcome: ref, push: pushed`, commit `f267c4a0cf34d30655c6b32672df28518ddf7e6f`;
  parent check `git rev-parse <ref>^` = `7b635175bcce87afb5a6c24bf1714903b7528a91` (the branch head).

## Evidence: `gh run list` after the wait

Checked at 09:25:46Z, about 160 s after the last records push (above the 90 s floor; probe 1 about
4 min). `gh run list -R islayjames/ship-build-live-test --json headSha,event,headBranch,createdAt -L 5`:

```
2026-11-12T09:23:06Z push         probe/records-ref-ci-1794475375  7b635175bcce87afb5a6c24bf1714903b7528a91
2026-11-09T05:21:56Z push         main                             8c580c160406774faf002b2f2c449206f8721698
2026-11-09T05:19:36Z pull_request feature/custody-live/pass        2dbb032f963ce161e1a3f818b4cb4a3f4f64d7eb
2026-11-09T05:16:03Z pull_request feature/custody-live/impl        3080208bf1427cd6dffe4ed5ba8f05343cfbbdd9
2026-11-07T20:28:37Z pull_request feature/greet-hi/impl            11d94f7136e324d683a61f891344e8f152104b8d
```

A filter over the latest 100 runs for headSha `b878279b...` or `f267c4a0...` returned 0 matches.
The only new run is the branch push of probe 2's workflow commit.

## Cleanup

`git push origin --delete refs/ensemble/records/probe-asis-1794475375 refs/ensemble/records/probe-branch-1794475375 probe/records-ref-ci-1794475375`
deleted all three. `git ls-remote origin | grep -E "probe|ensemble"` -> none remain. `gh pr list --state all
--head probe/records-ref-ci-1794475375` -> `[]`. The temp clone was removed. The one workflow run on the
throwaway branch stays in history (runs are not deletable here); it is harmless.

## Not verifiable here

A Claude Code Web (`claude --remote`) session pushing or fetching `refs/ensemble/*` cannot be tested
from this machine (`verification.md` section 5). Cover: any failed push takes the library's branch-commit
fallback (`outcome: fallback, fallbackReason: push-failed`), and `read`/`restore` report "no record"
when the fetch fails. It stays a stated gap until an environment for it is listed.

## Grounding notes

- `FORGE_FEATURE_ID` was set in the agent's environment and was unset for all writes, as required.
- Grounding held: `ci.yml` triggers were as described; the repo was reachable.
