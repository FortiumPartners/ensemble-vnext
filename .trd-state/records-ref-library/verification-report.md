# Functional Verification Report: records-ref-library

**Source PRD**: docs/TRD/records-ref-library.md § Intended Change
**Success definition**: .trd-state/records-ref-library/success-definition.md
**Outcome**: Stalled (no full-environment run declared)
**Reason**: iteration closed no gaps — remediation is not converging: FS-10 (fall back to a branch commit when objects/ is unwritable) stayed unmet for three iterations; the fallback is attempted but cannot commit without writable objects/, so the criterion needs an owner decision
**Criteria**: 25 total — 24 met, 1 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 24 of 25 proven — uncovered: FS-10
**Must pass**: 20 of 21 proven — unproven: FS-10 (not met)
**Diagnosis**: 1 open — 1 build defect — 1 judged failed
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | In a scratch repo, `node .claude/lib/record-ref.js write --state-dir .trd-state/demo --command /implement-trd --step "phase 1 checkpoint"` prints exactly one JSON line carrying `"outcome":"ref"` and `"push":"pushed"`, creates `refs/ensemble/records/demo` locally, and `git ls-remote origin refs/ensemble/records/demo` shows the same commit as the local ref | .trd-state/records-ref-library/evidence/fs1-7-write-transcript.txt | 1 |
| FS-2 | The write in FS-1 does not touch the checked-out branch or the index: `git status --porcelain` and `git rev-parse HEAD` print the same output before and after the call | .trd-state/records-ref-library/evidence/fs1-7-write-transcript.txt | 1 |
| FS-3 | The ref's commit tree is rooted at the feature's state folder: `git cat-file -p refs/ensemble/records/demo:implement.json` is byte-for-byte equal to `.trd-state/demo/implement.json`, and the folder's other record files (the verification loop's per-iteration files included) appear at the tree root under their folder-relative paths | .trd-state/records-ref-library/evidence/fs1-7-write-transcript.txt | 1 |
| FS-4 | Images under the state folder's `evidence/` enter the ref only when the folder's `verification-report.md` references them: with one referenced and one unreferenced image present, the tree contains the referenced one and not the other, and no other file under `evidence/` is included | .trd-state/records-ref-library/evidence/fs1-7-write-transcript.txt | 1 |
| FS-5 | `dispatch.jsonl`, `implement.lock` and anything under `findings/` in the state folder never appear in the ref's tree | .trd-state/records-ref-library/evidence/fs1-7-write-transcript.txt | 1 |
| FS-6 | Every write puts `record.json` at the tree root holding exactly the fields `forge_feature_id`, `branch` and `slug`: `forge_feature_id` is the value of `FORGE_FEATURE_ID` when that env var is set and `null` when it is not, `branch` is the current branch, `slug` is the folder's slug — with the env var unset, `git cat-file -p refs/ensemble/records/demo:record.json` shows `{"forge_feature_id":null,"branch":"<branch>","slug":"demo"}` | .trd-state/records-ref-library/evidence/fs1-7-write-transcript.txt | 1 |
| FS-7 | Each write commits on the previous value of the ref, with a commit message naming the command and the step: after two writes, the second commit's parent is the first commit, and each message contains the `--command` and `--step` it was given | .trd-state/records-ref-library/evidence/fs1-7-write-transcript.txt | 1 |
| FS-8 | Two writers racing one ref both land, in some order, with no file from either lost; the ref is moved by compare-and-swap (`git update-ref` with the old value) and a lost swap is retried a bounded number of times | .trd-state/records-ref-library/evidence/fs8-10-9-rerun-transcript.txt | 1 |
| FS-11 | With no `.git` anywhere above the working directory, the write prints `{"ok":false,"outcome":"refused",...}` and exits 0 | .trd-state/records-ref-library/evidence/fs10-11-transcript.txt | 1 |
| FS-12 | Record files already tracked on the branch (left by Forge's hand-over or stop commit, or by an earlier fallback) are folded into the ref and removed from the index on the next successful write | .trd-state/records-ref-library/evidence/fs9-12-transcript.txt | 1 |
| FS-13 | The same writer serves the shared ref `refs/ensemble/records/_shared`, holding `.trd-state/_session-log.md` and `.trd-state/_sweep/discovered.jsonl` | .trd-state/records-ref-library/evidence/fs12-17-transcript.txt | 1 |
| FS-14 | `read` returns one file at a ref, from the local ref when it exists, and otherwise by fetching the ref from `origin` (a clone with no local copy of the ref still reads the file) | .trd-state/records-ref-library/evidence/fs12-17-transcript.txt | 1 |
| FS-15 | `list` lists the records refs present | .trd-state/records-ref-library/evidence/fs12-17-transcript.txt | 1 |
| FS-16 | `restore` materialises a missing state folder from its ref: after the folder is deleted, `restore` recreates it with the ref's files | .trd-state/records-ref-library/evidence/fs12-17-transcript.txt | 1 |
| FS-17 | Every operation (`write`, `read`, `list`, `restore`) is available both as a CLI verb and as a module function; each CLI call prints one JSON line and exits 0, and no operation throws, including on bad input | .trd-state/records-ref-library/evidence/fs12-17-transcript.txt | 1 |
| FS-18 | The library runs git only through `spawnSync` with argument arrays — no `exec`, `execSync`, or shell-string invocation | .trd-state/records-ref-library/evidence/fs18-19-20-transcript.txt | 1 |
| FS-19 | The library exists at `packages/core/lib/record-ref.js` and is vendored to `.claude/lib/record-ref.js`, the path the checkable outcome invokes | .trd-state/records-ref-library/evidence/fs18-19-20-transcript.txt | 1 |
| FS-20 | Nothing in the framework calls the library yet: no command, hook, or other library references `record-ref` apart from the library itself, its test and its vendored copy | .trd-state/records-ref-library/evidence/fs18-19-20-transcript.txt | 1 |
| FS-21 | `npx jest packages/core/lib/record-ref.test.js` passes and covers each of the 8 owner-named cases: two writers racing one ref; no git directory; a reader-only user via an unwritable `objects/`; a refused push; branch-tracked records folded into the ref; `record.json` fields; evidence images only when the report references them; the `_shared` ref | .trd-state/records-ref-library/evidence/fs21-jest-names.txt | 1 |
| FS-22 | Live, against `islayjames/ship-build-live-test` as it is: pushing a `refs/ensemble/records/*` probe ref starts no GitHub workflow — `gh run list -R islayjames/ship-build-live-test` shows no run whose head SHA is the probe ref's commit | .trd-state/records-ref-library/evidence/fs22-24-live-probe-transcript.txt | 1 |
| FS-23 | Live, with a throwaway branch carrying a workflow whose trigger is `on: push` with no branch filter: the throwaway branch's own push does start its run, and a records probe ref whose commit is parented on that branch's head starts none | .trd-state/records-ref-library/evidence/fs22-24-live-probe-transcript.txt | 1 |
| FS-24 | After the live probes, the throwaway branch and the probe refs are deleted from `islayjames/ship-build-live-test` | .trd-state/records-ref-library/evidence/fs22-24-live-probe-transcript.txt | 1 |
| FS-25 | Whether a Claude Code Web session can push or fetch a records ref is recorded in writing as a stated gap (not verifiable from this machine), alongside the statement that the branch-commit fallback covers that case | .trd-state/records-ref-library/evidence/fs25-search.txt | 1 |
| FS-9 | With the push refused (a bare `origin` whose `pre-receive` hook rejects `refs/ensemble/*`), the same write prints `"outcome":"fallback"` with a branch commit id, exits 0, and `git show --stat HEAD` lists only the state folder's selected files (ignored record paths force-added) | .trd-state/records-ref-library/evidence/fs9-10-iter2-transcript.txt | 2 |

## Not Met

| ID | Statement | Kind | Tier 1 | Reason | Blocker | Attempts |
|----|-----------|------|--------|--------|---------|----------|
| FS-10 | When the ref cannot be written — a reader-only OS user, simulated by an unwritable `objects/` directory — the write falls back to a branch commit and does not throw | build defect |  | With objects/ unwritable the write does not throw and exits 0 with one JSON line, but no branch commit is made: outcome is "failed" (fallbackReason ref-write-failed), the fallback was attempted and failed with the same permission error (git cannot add objects), and HEAD is unchanged. The criterion asks for a fallback branch commit, which cannot succeed when objects/ is unwritable, so the build cannot meet it as worded; third iteration with the same result. The owner must either accept "fallback attempted, reported as failed, no throw" by amending FS-10, or name a fallback that writes no objects. | Branch-commit fallback also needs writable objects/; criterion unachievable as worded | iter 1: not_met; iter 2: not_met; iter 3: not_met |

## Not Verifiable

_None._

