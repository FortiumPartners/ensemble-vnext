# Functional Verification Report: flaky-ci-jobs-filed-and-capped

**Source PRD**: docs/TRD/flaky-ci-jobs-filed-and-capped.md § Intended Change
**Success definition**: .trd-state/flaky-ci-jobs-filed-and-capped/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 12 total — 12 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 12 of 12 proven — uncovered: none
**Must pass**: 8 of 8 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `node .claude/lib/flaky-ci.js record --state-dir <dir> --job <name> --run-id <id>` appends one entry to `<dir>/flaky.jsonl` and returns the job's flake count summed across every `.trd-state/*/flaky.jsonl`, not only the given directory's | .trd-state/flaky-ci-jobs-filed-and-capped/evidence/flaky-ci-cli-transcript.txt | 1 |
| FS-2 | Recording the same job and run id twice (a resumed step) counts once: the returned count does not rise on the repeat | .trd-state/flaky-ci-jobs-filed-and-capped/evidence/flaky-ci-cli-transcript.txt | 1 |
| FS-3 | The third flake of a job, spread across two feature directories, returns `capped: true`; the first and second do not | .trd-state/flaky-ci-jobs-filed-and-capped/evidence/flaky-ci-cli-transcript.txt | 1 |
| FS-4 | `wait-ci` step 3 instructs that each job that passes on its rerun is recorded with `node .claude/lib/flaky-ci.js record --state-dir <work.stateDir> --job <name> --run-id <id>` | .trd-state/flaky-ci-jobs-filed-and-capped/evidence/FS-4-5-6-wait-ci-iter2.txt | 2 |
| FS-5 | `wait-ci` takes the recorded job name from `gh run view <run-id> --json jobs` and never the workflow name `gh run list` returns | .trd-state/flaky-ci-jobs-filed-and-capped/evidence/FS-4-5-6-wait-ci-iter2.txt | 2 |
| FS-6 | When the returned count is 3 or more, `wait-ci` puts the job in `data.failed` with `capped: true` and the result is `failed`; below 3 the job stays in `data.flaky` and the step may still pass | .trd-state/flaky-ci-jobs-filed-and-capped/evidence/FS-4-5-6-wait-ci-iter2.txt | 2 |
| FS-7 | `collect-findings` step 1, for a `context.failed` entry with `capped: true`, records exactly one non-blocking `[flaky-capped] <job>` row with `ref: "flaky-capped:<job>"`, and records it only once | .trd-state/flaky-ci-jobs-filed-and-capped/evidence/FS-7-8-collect-findings-iter2.txt | 2 |
| FS-8 | `collect-findings` treats a capped entry as a known flake: it reads no logs for it, sends nothing about it to the judge, and returns `stop` naming the `[flaky-capped]` row | .trd-state/flaky-ci-jobs-filed-and-capped/evidence/FS-7-8-collect-findings-iter2.txt | 2 |
| FS-9 | After one rerun-pass is recorded, `node .claude/lib/flaky-ci.js import --state-dir <dir>` writes exactly one non-blocking `[flaky-ci]` row with `ref: "flaky:<job>"` into `<dir>/discovered.jsonl` | .trd-state/flaky-ci-jobs-filed-and-capped/evidence/flaky-ci-cli-transcript.txt | 1 |
| FS-10 | A later flake of a job already filed yields no new row from `import`, whether the later flake is in the same feature or another one | .trd-state/flaky-ci-jobs-filed-and-capped/evidence/flaky-ci-cli-transcript.txt | 1 |
| FS-11 | `file-followups` step 1 lists `node .claude/lib/flaky-ci.js import --state-dir <work.stateDir>` as a third import source, and its steps 3–5 file the resulting row like any other | .trd-state/flaky-ci-jobs-filed-and-capped/evidence/FS-11-file-followups-iter2.txt | 2 |
| FS-12 | After the record, cap and import runs, the only files written are `.trd-state/<feature>/flaky.jsonl` and `.trd-state/<feature>/discovered.jsonl`; no shared file outside a feature directory is created or changed | .trd-state/flaky-ci-jobs-filed-and-capped/evidence/flaky-ci-jest.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

