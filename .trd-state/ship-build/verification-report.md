# Functional Verification Report: ship-build

**Source PRD**: docs/PRD/ship-build.md
**Success definition**: .trd-state/ship-build/success-definition.md
**Outcome**: Satisfied (1 of 67 not verifiable) (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 67 total — 66 met, 0 not met, 1 not verifiable, 0 unbuilt
**Coverage**: 66 of 67 proven — uncovered: FS-66
**Must pass**: 11 of 11 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | A `ship.md` template exists in `packages/core/templates/claude-directory/rules/`, and scaffolding a new project writes it to `.claude/rules/ship.md` through the same mechanism that writes `verification.md` | .trd-state/ship-build/evidence/exercise/fs1-listing.txt | 1 |
| FS-2 | A scaffolded, unedited `ship.md` lists no active ship step: parsing it yields zero steps, and nothing under its `## Examples` is ever run | .trd-state/ship-build/evidence/exercise/fs2-parse-scaffolded.json | 1 |
| FS-3 | The template's first worked example is the default string, labelled as `/ship-setup`'s default (push, open a PR, then repeat request-review, wait-ci, collect-findings, fix-findings until clean, merge, release; after shipping sync-design, close-issue, file-followups), followed by the owner's five examples and example `run <command>` lines for version bump, changelog, tag, publish, mobile build, store submission, OTA update and a deployed-build check | .trd-state/ship-build/evidence/exercise/fs3-fs8-template-lines.txt | 1 |
| FS-4 | `ship.md` expresses an ordered string of steps, each a primitive name plus parameters, in two parts (ship steps and after-shipping steps), with a bounded `repeat` block grouping steps that run again until a stated result or a round count | .trd-state/ship-build/evidence/exercise/fs4-summary.txt | 1 |
| FS-5 | `close-issue` and `file-followups` can only be after-shipping steps: placing either among the ship steps is rejected, and a string that leaves one out never runs it | .trd-state/ship-build/evidence/exercise/fs5-parse-errors.txt | 1 |
| FS-6 | A `repeat` block with `rounds=N` makes at most N fix rounds and then exactly one final pass; with no round count written it makes two fix rounds and then the final pass | .trd-state/ship-build/evidence/exercise/fs6-fs7-driver-output.txt | 1 |
| FS-7 |  | .trd-state/ship-build/evidence/it2/fs7-bar-parameter-runs.txt | 2 |
| FS-8 | The `ship.md` file states that it is owner-governed and changes only through `/ship-setup` | .trd-state/ship-build/evidence/exercise/fs3-fs8-template-lines.txt | 1 |
| FS-9 | Invoking `/ship-setup` interviews the owner and writes `.claude/rules/ship.md`; it offers the default string as its default answer (accepting it is one answer), a round count of 2 for each `repeat`, and the significance bar for each `collect-findings`, each changeable | .trd-state/ship-build/evidence/fs9-18/fs9-setup-final-transcript.txt | 1 |
| FS-10 | For a `release` whose environment has no full-deploy command in `verification.md` §2, `/ship-setup` records the release command in `ship.md` | .trd-state/ship-build/evidence/fs9-18/fs9-written-ship-section.txt | 1 |
| FS-11 |  | .trd-state/ship-build/evidence/fs-ship2/fs11-summary.txt | 2 |
| FS-12 | `/ship-build` ships whatever Ensemble is currently working on, resolving it as `/implement-trd` does, for each of the three kinds of work: a PRD/TRD feature, a `/plan`, and a `/sweep` | .trd-state/ship-build/evidence/fs12-resolution-text.txt | 1 |
| FS-13 | The sequencer hands out steps in the order `ship.md` lists them; a step starts only after the previous one recorded success; a step that stops ends the run `COMMAND STUCK` and no later step runs | .trd-state/ship-build/evidence/fs13-14-sequencer-runs.txt | 1 |
| FS-14 | The work is recorded as shipped only when the last ship step succeeded, with no listed step left to run by hand; only then do the after-shipping steps run, in order, and `/ship-build` writes `shipped.json` in `.trd-state/<feature>/` beside `closed.json`; a run that stops or waits before the last ship step leaves the feature closed but not shipped | .trd-state/ship-build/evidence/fs13-14-sequencer-runs.txt | 1 |
| FS-15 | Every `/ship-build` and `/ship-setup` run ends with the four-section readout and a `COMMAND COMPLETE` or `COMMAND STUCK` banner as its last line; a `COMMAND COMPLETE` does not itself claim the work shipped, the shipped record does | .trd-state/ship-build/evidence/fs9-18/fs11-outward-steps.txt | 1 |
| FS-16 |  | .trd-state/ship-build/evidence/fs-ship2/fs16-summary.txt | 2 |
| FS-17 | In that same no-step case, where a PR is already open for the branch, the readout names that PR instead of saying the branch is ready for one | .trd-state/ship-build/evidence/fs9-18/fs17-open-pr.txt | 1 |
| FS-18 | A full PRD → TRD feature without `.trd-state/<feature>/closed.json` stops before the first step, with `/audit-build` or `/close-feature` named as NEXT; a `closed.json` written by `/close-feature` with `"audit": null` satisfies the gate; `/plan` and `/sweep` work ship without one | .trd-state/ship-build/evidence/fs9-18/fs18-a-no-closed.txt | 1 |
| FS-19 | Each of the 13 primitives is recognised in a `ship.md` string: `open-pr`, `wait-ci`, `request-review`, `await-approval`, `collect-findings`, `fix-findings`, `merge`, `release`, `push`, `run <command>`, `close-issue`, `file-followups` and `sync-design` | .trd-state/ship-build/evidence/fs19-parse-all13.json | 1 |
| FS-20 | Each of the six strings in the F4 table (the default and the owner's five) is valid `ship.md` content | .trd-state/ship-build/evidence/fs20-six-strings-parse.txt | 1 |
| FS-21 |  | .trd-state/ship-build/evidence/fs-ship2/fs21-summary.txt | 2 |
| FS-22 | `open-pr` opens a PR against the base `ship.md` names whatever `ensemble.openPullRequest` is set to, and where a PR is already open for the branch it reuses that PR and opens no second one | .trd-state/ship-build/evidence/fs22-gh-call-log.txt | 1 |
| FS-23 | `merge`, `release`, `run` and every other outward primitive run only because `ship.md` lists them: a `ship.md` that lists no `merge` is never merged by `/ship-build`, and `pull-request.js` itself still never merges | .trd-state/ship-build/evidence/fs23-no-merge-evidence.txt | 1 |
| FS-24 | A listed `release` deploys to the environment it names, production included, even where `verification.md` §1 forbids the verification loop from deploying there | .trd-state/ship-build/evidence/fs-ship/driver-str5-main-prod.txt | 1 |
| FS-25 |  | .trd-state/ship-build/evidence/it2/fs25-fresh.txt | 2 |
| FS-26 |  | .trd-state/ship-build/evidence/it2/fs26-sweep-push-run.txt | 2 |
| FS-27 |  | .trd-state/ship-build/evidence/fs-ship2/fs27-summary.txt | 2 |
| FS-28 | `.claude/commands/implement-trd.md` and its `packages/core/commands/` copy admit `/ship-build` as a `--chained` caller beside `/verify-build` and `/audit-build` | .trd-state/ship-build/evidence/fs28-chained-callers-grep.txt | 1 |
| FS-30 |  | .trd-state/ship-build/evidence/it2/fs30-ownership-run.txt | 2 |
| FS-31 | After a fix, only criteria whose covered files the fix changed are re-verified, every other proven criterion stays proven, and the fix is never re-audited | .trd-state/ship-build/evidence/fs-ship/fs31-reconcile.txt | 1 |
| FS-32 |  | .trd-state/ship-build/evidence/it2/fs32-label-vs-judge-run.txt | 2 |
| FS-33 | In a `repeat` block's final pass, a critical finding still open stops the run `COMMAND STUCK`, says what is still failing, and leaves the PR as it is (not merged, not closed); every below-critical finding is recorded at once as a follow-up and the block ends clean | .trd-state/ship-build/evidence/fs-ship/driver-fs33-critical.txt | 1 |
| FS-35 |  | .trd-state/ship-build/evidence/fs-ship2/fs35-summary.txt | 2 |
| FS-36 | `/ship-build --resume` runs the remaining steps from that record without re-running the steps that already succeeded | .trd-state/ship-build/evidence/fs36-37-sequencer-walk.txt | 1 |
| FS-37 |  | .trd-state/ship-build/evidence/iter2/fs37-summary.txt | 2 |
| FS-38 |  | .trd-state/ship-build/evidence/fs-ship2/fs38-summary.txt | 2 |
| FS-39 |  | .trd-state/ship-build/evidence/iter2/fs39-summary.txt | 2 |
| FS-40 | From findings ledgers a ship files only the rows of the work it ships and those this ship found; older rows belonging to other work are neither filed nor marked; for `/sweep` work, rows already in `.trd-state/_sweep/discovered.jsonl` before the ship are left exactly as they were and only findings this ship recorded are filed | .trd-state/ship-build/evidence/exercise-followups/followups-evidence.txt | 1 |
| FS-41 | Review findings below the significance bar are not filed unless `ship.md` opts in, including those in the `/implement-trd` unfixed-findings record | .trd-state/ship-build/evidence/exercise-followups/followups-evidence.txt | 1 |
| FS-42 | Each filed issue links back to the work it was found in, and each finding is filed at most once, keyed by a stable id, so a re-run files no duplicate | .trd-state/ship-build/evidence/exercise-followups/followups-evidence.txt | 1 |
| FS-43 |  | .trd-state/ship-build/evidence/iter2/readout-fs43-notracker.txt | 2 |
| FS-44 | `/implement-trd`'s end-of-run review step writes every review finding it chose not to fix, whatever its severity, to a file under `.trd-state/<feature>/` (in `.claude/commands/implement-trd.md` and its `packages/core/commands/` copy), and `file-followups` reads that file | .trd-state/ship-build/evidence/iter1-fs44-grep.txt | 1 |
| FS-45 | The `stack.md` template has a place to declare the project's issue tracker, and `close-issue` and `file-followups` use the tracker that declaration names, not one named in `ship.md` | .trd-state/ship-build/evidence/iter1-fs45-grep.txt | 1 |
| FS-46 | On a pass, `/audit-build` names `/ship-build` in NEXT and never runs it; its PR opening under `openPullRequest: auto` is unchanged | .trd-state/ship-build/evidence/iter1-fs46-grep.txt | 1 |
| FS-47 | `ensemble.openPullRequest` stays in place: `/audit-build`, `/close-feature`, `/implement-trd`'s NEXT wording and `pull-request.js` still read it, and `/rebase-project` writes no `ship.md` from it | .trd-state/ship-build/evidence/exercise-gov/gov-evidence.txt | 1 |
| FS-48 | A drafted amendment to `constitution.md`'s Governance Split table adds `ship.md` to the owner-governed slow layer beside `verification.md`, with running `/ship-setup` as the confirmation | .trd-state/ship-build/evidence/exercise-gov/gov-evidence.txt | 1 |
| FS-49 | A drafted amendment to `autonomy.md` makes a `merge`, `release` (any environment, production included), `run` or other outward step listed in `ship.md` the owner's standing authorization, names `/ship-setup` as interactive by purpose beside `/verification-setup`, and keeps the `openPullRequest: auto` exception | .trd-state/ship-build/evidence/exercise-gov/gov-evidence.txt | 1 |
| FS-50 | Neither `constitution.md` nor `autonomy.md` is changed until the owner approves | .trd-state/ship-build/evidence/fs50-56-58-greps.txt | 1 |
| FS-51 | The anchor starts at the audited commit (`closed.json`'s `audit.auditedCommit`); with no audited commit (`/plan` and `/sweep` work, and `/close-feature`'s `"audit": null`) it is the commit `/ship-build`'s `push` step pushed | .trd-state/ship-build/evidence/fs50-58-custody-tests.txt | 1 |
| FS-52 | Two commits' code is equal when their trees differ in no file outside the ignored paths (`.trd-state/`, the audit report, the feature's TRD, test-only files); a difference in any other file is a difference in shipped source | .trd-state/ship-build/evidence/fs50-58-custody-tests.txt | 1 |
| FS-53 | Push link: after each push `/ship-build` makes, including the push with no `ship.md`, the check confirms the remote branch head's code equals the anchor's | .trd-state/ship-build/evidence/iter1-slice-custody-test-names.txt | 1 |
| FS-54 |  | .trd-state/ship-build/evidence/iter2/fs54-merge-methods.txt | 2 |
| FS-55 | Deploy link: after `release`, the deployed build reports a commit whose code equals the anchor's; a build that reports no identity, or a different one, fails the link | .trd-state/ship-build/evidence/fs50-58-custody-tests.txt | 1 |
| FS-56 | `/audit-build` writes the full commit id in its report header's `Audited commit:` line (both copies of `audit-build.md`), so `closed.json` stores it in full; a stored short id resolving to exactly one commit is used normally, and an ambiguous one fails with that reason, never a guess | .trd-state/ship-build/evidence/fs50-56-58-greps.txt | 1 |
| FS-57 | Any change to shipped source after the audited commit (a chained fix before shipping, a `/ship-build` fix, a commit made by a `run` step) is re-verified for the must-pass criteria whose covered files it changed and then becomes the anchor before the next custody link; with no must-pass covered file changed, nothing is re-run and the anchor still moves; a formatter/linter commit moves it without re-verification; a failed re-verification leaves the anchor where it was; a change only to ignored paths does not move it | .trd-state/ship-build/evidence/fs50-58-custody-tests.txt | 1 |
| FS-58 | Each anchor move is recorded by the custody check alone, in a record no other part of `/ship-build` writes, and nothing else moves the anchor | .trd-state/ship-build/evidence/fs50-56-58-greps.txt | 1 |
| FS-59 |  | .trd-state/ship-build/evidence/fs-ship2/fs59-summary.txt | 2 |
| FS-60 | The custody check is a deterministic lib function, outside `pull-request.js`, whose unit tests cover each link (push, merge, deploy), the ignored-path classification, each way the anchor moves and each failure condition | .trd-state/ship-build/evidence/ship-jest-tests.txt | 1 |
| FS-61 | Each primitive states a defined input, a defined result and a defined waiting state, naming what it waits on and the bounded primitive it waits with; a CI wait uses a bounded primitive | .trd-state/ship-build/evidence/fs61-waiting-sections.txt | 1 |
| FS-62 | Iteration is one generic bounded `repeat` around any steps, not special handling of one string, and the same sequencer code runs a string with a human approval step and a string with no outside reviewer | .trd-state/ship-build/evidence/ship-jest-tests.txt | 1 |
| FS-63 | A piece is either a primitive or the sequencer, never both, and adding a primitive is one new unit with no change to the sequencer | .trd-state/ship-build/evidence/ship-jest-tests.txt | 1 |
| FS-64 |  | .trd-state/ship-build/evidence/iter2/fs64-summary.txt | 2 |
| FS-65 | Neither `/ship-build` nor `/ship-setup` calls or assumes Forge | .trd-state/ship-build/evidence/fs65-forge-grep.txt | 1 |
| FS-67 |  | .trd-state/ship-build/evidence/fs-ship2/fs67-summary.txt | 2 |
| FS-29 | Each of the seven failure classes in the triage table is handled as the table says: a flaky failure re-runs CI once with no code change; a lint or format failure runs the project's formatter/linter and commits its output, never a model edit; a test or build failure in this feature's code is fixed through the recorded path; a failure in code this feature did not touch stops, is reported and filed; a review finding at or above the bar is fixed through the recorded path; one below the bar is not fixed; a deploy failure stops and is never auto-fixed | .trd-state/ship-build/evidence/it3/fs29-summary.txt | 3 |
| FS-34 | A below-critical finding recorded in the final pass is filed by `file-followups`, and the readout lists it with its issue in a run that reaches `file-followups`, otherwise as recorded and not yet filed | .trd-state/ship-build/evidence/it3/fs34-summary.txt | 3 |

## Not Met

_None._

## Not Verifiable

| ID | Statement | Reason |
|----|-----------|--------|
| FS-66 | When a trigger is set on the PR at `await-approval`, the event it names (e.g. approval) runs the remaining steps as `--resume` would | Needs ensemble-ship-resume.yml on a real GitHub default branch and an approving review. verification.md declares no GitHub environment and production must not be touched; this is the owner's live proof SHIP-T002, deferred by design. |

