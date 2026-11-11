# Functional Verification Report: ci-baseline-check

**Source PRD**: docs/TRD/ci-baseline-check.md § Intended Change
**Success definition**: .trd-state/ci-baseline-check/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 24 total — 24 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 24 of 24 proven — uncovered: none
**Must pass**: 22 of 22 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `node .claude/lib/ci-baseline.js check --dir <dir>` prints exactly one line of JSON and exits 0, whatever it finds; the object carries `ok`, `noCi`, `workflows` (the files read), `checks` with exactly the keys `summary`, `docsRecordSkip`, `recordCommitSkip`, plus `gaps` and `unclear` arrays; each `checks.<name>` is `{ status, detail }` with `status` one of `pass`, `gap`, `unclear` | .trd-state/ci-baseline-check/evidence/ci-baseline-cli-transcript.txt | 1 |
| FS-2 | With `--dir` omitted, the CLI reads `.github/workflows` relative to where it runs | .trd-state/ci-baseline-check/evidence/ci-baseline-cli-transcript.txt | 1 |
| FS-3 | `ok` is `true` only when all three checks are `pass`; every check with status `gap` appears once in `gaps` as `{check, message}` naming that check, and every check with status `unclear` appears once in `unclear` the same way | .trd-state/ci-baseline-check/evidence/fs3-it2/FS-3-it2.txt | 2 |
| FS-4 | Run against this repository's own `.github/workflows/`, the check reports `summary`, `docsRecordSkip` and `recordCommitSkip` all as `gap`, with `ok: false` | .trd-state/ci-baseline-check/evidence/ci-baseline-cli-transcript.txt | 1 |
| FS-5 | Scope: the check reads `.yml` and `.yaml` files under the workflows directory; a workflow triggered by `pull_request`, `pull_request_target`, or `push` with no `branches:` list or with `branches-ignore:` is in scope, and a workflow that runs only on `push` to named branches (e.g. `push: branches: [main]`) is out of scope, so its jobs never cause a gap | .trd-state/ci-baseline-check/evidence/ci-baseline-cli-transcript.txt | 1 |
| FS-6 | The passing workflow yields `pass` on all three checks, `ok: true`, and empty `gaps` and `unclear` | .trd-state/ci-baseline-check/evidence/ci-baseline-jest-tests.txt | 1 |
| FS-7 | The passing workflow with its summary job removed yields exactly one gap, `summary`; `docsRecordSkip` and `recordCommitSkip` stay `pass` | .trd-state/ci-baseline-check/evidence/ci-baseline-jest-tests.txt | 1 |
| FS-8 | Each of these summary-job shapes is reported as a `summary` gap: (1) its `if:` holds neither `always()` nor `!cancelled()`; (2) its `needs:` omits another non-event-scoped job of the workflow; (3) it reads none of `needs.*.result`, `needs.<job>.result`, `toJSON(needs)` or a `re-actors/alls-green` step; (4) its workflow has a trigger-level `paths` or `paths-ignore` | .trd-state/ci-baseline-check/evidence/FS-8.txt | 1 |
| FS-9 | Each of the four recognised ways of reading needs' results (`needs.*.result`, `needs.<job>.result`, `toJSON(needs)`, a step using `re-actors/alls-green`) satisfies condition (3) of the summary check | .trd-state/ci-baseline-check/evidence/FS-9.txt | 1 |
| FS-10 | When the check runs, the `ship-setup` readout tells the owner that record commits must never carry `[skip ci]`, because a `[skip ci]` head commit skips every workflow, the summary's included | .trd-state/ci-baseline-check/evidence/FS-10.txt | 1 |
| FS-11 | The passing workflow with its change-detection job and every heavy job's `if:` removed (no path filtering at all) yields `docsRecordSkip` and `recordCommitSkip` as `gap`, the `docsRecordSkip` detail naming the ungated job; `summary` stays `pass` | .trd-state/ci-baseline-check/evidence/FS-11.txt | 1 |
| FS-12 | `docsRecordSkip` is `unclear`, naming the job or step, for each of: (1) a heavy job whose `if:` is not a conjunction of `needs.<X>.outputs.<Y>` / `needs.<X>.outputs.<Y> == 'true'` / `success()` / `always()` / `!cancelled()` terms; (2) a dorny `filters:` given as a file path; (3) a dorny step with `predicate-quantifier: every`; (4) a `run:` script used as the change detector | .trd-state/ci-baseline-check/evidence/FS-12.txt | 1 |
| FS-13 | A trigger-level `paths` or `paths-ignore` on any in-scope workflow holding heavy jobs makes `docsRecordSkip` a `gap`, even when the filter would exclude the probe files | .trd-state/ci-baseline-check/evidence/FS-13.txt | 1 |
| FS-14 | Jobs that are not heavy cause no `docsRecordSkip` gap even with no path condition: the summary job, the change-detection job (whose outputs another job's `if:` reads), and an event-scoped job whose `if:` mentions `github.event_name` or `github.ref` | .trd-state/ci-baseline-check/evidence/FS-14.txt | 1 |
| FS-15 | Filter matching follows dorny's semantics: a file matches a filter when any one of its patterns matches it, a `!p` pattern matching when `p` does not, with dotfiles matched by `**`; so a job gated on filter `['**', '!docs/**', '!**/*.md']` is NOT skipped on the docs-only probe (and `docsRecordSkip` is a `gap`), and a job gated on `['src/**']` IS skipped on both probes | .trd-state/ci-baseline-check/evidence/FS-15.txt | 1 |
| FS-16 | The passing workflow with its dorny step switched to API mode (no `token: ''`, no `base:` reading `github.event.before`) on a `pull_request` trigger yields exactly one gap, `recordCommitSkip`, while `docsRecordSkip` stays `pass` | .trd-state/ci-baseline-check/evidence/FS-16.txt | 1 |
| FS-17 | With a `run:` change detector, `recordCommitSkip` is `pass` when the script references `github.event.before` and names `.trd-state`, `unclear` when it references `github.event.before` without `.trd-state`, and `unclear` otherwise | .trd-state/ci-baseline-check/evidence/FS-17.txt | 1 |
| FS-18 | On a `push`-triggered in-scope workflow (no `branches:` list) gated by dorny, `recordCommitSkip` follows `docsRecordSkip`'s record-only result: `pass` when the heavy jobs skip on the record-only probe, `gap` when they do not | .trd-state/ci-baseline-check/evidence/FS-18.txt | 1 |
| FS-19 | A heavy job gated on a commit-message condition (e.g. `!contains(github.event.head_commit.message, 'record')`) is never counted as skipping record commits: neither `docsRecordSkip` nor `recordCommitSkip` reports `pass` for that workflow | .trd-state/ci-baseline-check/evidence/FS-19.txt | 1 |
| FS-20 | The five probe files are fixed: docs-only `README.md`, `docs/guide.md`; record-only `.trd-state/feature/custody.json`, `.trd-state/feature/shipped.json`, `.claude/verification-notes.md`, and loading the library asserts `isRecordFile(p) === true` for each record-only probe | .trd-state/ci-baseline-check/evidence/FS-20.txt | 1 |
| FS-21 | `ship-setup` has a CI-baseline step that runs `node .claude/lib/ci-baseline.js check` during the interview | .trd-state/ci-baseline-check/evidence/it1-fs21-toolcall.txt | 1 |
| FS-22 | The `ship-setup` readout's ISSUES section names each `gap` and each `unclear` property in plain words, each with how to close it | .trd-state/ci-baseline-check/evidence/it1-run2-transcript.txt | 1 |
| FS-23 | The `ship-setup` readout's STATE says the CI check ran and how many of the three properties hold | .trd-state/ci-baseline-check/evidence/it1-run1-transcript.txt | 1 |
| FS-24 | `ship-setup` writes no workflow file other than the resume workflow it already installs, and that one only on the owner's yes; it writes `ship.md` | .trd-state/ci-baseline-check/evidence/fs24-no-after.txt | 2 |

## Not Met

_None._

## Not Verifiable

_None._

