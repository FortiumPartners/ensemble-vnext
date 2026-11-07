# Brief: `/ship-build` and `ship.md` — the project says what "shipped" means, Ensemble gets each item there

**Status:** brief, captured 2026-10-31; every open question was decided with the owner the same
day (section 6). Not designed in detail, not planned, not built. Input for `/create-prd`: a new
capability, not a `/plan`-sized change. The governance amendments it needs (section 2) are still
the owner's to approve.

**Owner's request (verbatim):**

> I think we need a /ship-build command, which uses a ship.md file (similar to how we have
> verification.md, along with a command to configure it), for shipping work when done.
>
> Depending on the project that might end at:
> - PR to develop, iterating until CI passes, and merging
> - merging to main and deploying to prod
> - PR, external review with code rabbit, fix all non-trivial issues, merge when green, deploy
> - etc.
> - submit PR, wait for human review
> - commit and push
>
> Essentially the project defines what "shipped" means for that project, but then there's an
> ensemble command that ensures each item ships (note that shipping should also close the issue)
>
> Related to that, closing the issue by default should take any issues found during verification
> but not fixed (out of scope) and ensure issues are created for them, wherever the project
> tracks issues

---

## 1. The gap this fills

The pipeline ends at `/audit-build`. A passing audit closes the feature and, with
`ensemble.openPullRequest: auto`, opens a PR. Everything after that is manual, and the
same project does it the same way every time: wait for CI, fix what fails, answer the
reviewer, merge, deploy, close the issue, file the leftovers. The 2026-10-30 session that
fixed #49 shows it: after `COMMAND COMPLETE: /audit-build`, the owner typed "Merge it". The
agent then checked CI by hand, merged by hand, and listed four unfiled leftovers in prose
that nobody will act on.

`verification.md` already set the pattern this copies. A project-specific policy file is
owned by the owner and filled in by an interview skill. Commands read it rather than guess.
`verification.md` answers "where and how may the loop exercise the build?". `ship.md` would
answer "what has to be true before this work counts as delivered?".

## 2. What exists today, and what each piece becomes

| Today | Where | Relationship to `/ship-build` |
|---|---|---|
| `ensemble.openPullRequest: auto \| never` | `.claude/settings.json`; read by `pull-request.js` `readMode()` | The one-bit version of `ship.md`. Superseded by it; a project with no `ship.md` keeps today's behaviour. |
| `pull-request.js ensure` — opens a PR, **never merges** | `packages/core/lib/pull-request.js` | Becomes one stage `/ship-build` calls. Its "never merges" guarantee moves from the lib to the policy file. |
| `/audit-build` opens the PR on a passing audit | `audit-build.md` "Open the pull request" | Moves to `/ship-build`'s `open-pr` stage. A passing audit commits and names `/ship-build` as NEXT (OQ-2, OQ-9). |
| `/close-feature` and `closed.json` | `close-feature.md` | "Closed" means the work was verified. "Shipped" means it was delivered. A feature can be closed and not yet shipped. `/ship-build` needs a record of its own (e.g. `shipped.json`) beside `closed.json`. |
| Unfixed findings: `discovered.jsonl` (non-blocking rows), `/audit-build`'s `outOfScope`, verification `not_verifiable` gaps, code-review "left open" items | `.trd-state/<feature>/` | The input to follow-up filing (section 5). Today they are records nobody reads after the readout. |
| Issue-tracker skills | `packages/skills/managing-linear-issues`, `managing-jira-issues`, `managing-azure-devops`; GitHub via `gh` | The "wherever the project tracks issues" part. `ship.md` names which one. |
| `verification.md` §1/§2: environments, deploy permissions, full-deploy command | `.claude/rules/verification.md` | A deploy stage reuses the declared full-deploy command and permissions instead of restating them. |
| `/verification-setup` skill: interviews the owner, writes the file | `packages/skills/verification-setup/SKILL.md` | The model for `/ship-setup`. |

**Governance.** `autonomy.md` says a command's authorization "does not reach an outward-facing or
irreversible act that merely follows from its work — a merge, a deploy, a release". The only
exception today is `openPullRequest: auto`. This capability works only because `ship.md` *is*
the owner's standing authorization for the acts it lists. So `ship.md` must join the
owner-governed slow layer beside `verification.md`, and running `/ship-setup` is the approval.
That needs amendments to `constitution.md`'s governance table and to `autonomy.md`, both
owner-approved changes.

## 3. `ship.md` — a sketch of its shape

An ordered list of stages, from a fixed vocabulary, each with its parameters. "Shipped" means
the last stage succeeded. Each of the owner's examples becomes a short list:

| Owner's example | Stages |
|---|---|
| commit and push | `push` |
| submit PR, wait for human review | `push` → `open-pr base=main` → `await-human-review` (ends the run, see OQ-4) |
| PR to develop, iterate until CI passes, merge | `push` → `open-pr base=develop` → `ci-green fix=yes cap=3` → `merge method=merge` |
| merge to main and deploy to prod | `push` → `open-pr base=main` → `ci-green` → `merge` → `deploy env=production` |
| PR, CodeRabbit review, fix non-trivial, merge when green, deploy | `push` → `open-pr` → `external-review tool=coderabbit fix=non-trivial` → `ci-green` → `merge` → `deploy` |

Every project also gets two stages after the last one, on by default and each switchable off:
`close-issue` and `file-followups` (sections 4 and 5).

Candidate vocabulary: `push`, `open-pr`, `ci-green`, `external-review`, `await-human-review`,
`merge`, `deploy`, `verify-deployed`, `close-issue`, `file-followups`. Release and platform
stages too (OQ-7): `version-bump`, `changelog`, `tag`, `publish`, `mobile-build`,
`store-submit`, `ota-update` (e.g. a Dart/Flutter project building and pushing an over-the-air
update). There is also `run <command>` for anything project-specific. Each stage that *fixes*
(`ci-green`, `external-review`) has a retry cap and a severity bar, and says what happens at the
cap. Each stage that *acts outward* (`merge`, `deploy`) is the authorization the governance note
above refers to.

## 4. Closing the issue

Shipping closes the issue the work came from. That needs the work to know its issue, which today
it only sometimes does (`/plan GitHub #49` carried it in the subject; the PR body's "Fixes #49"
closed it on merge). The brief's intent: record the source issue when the work starts
(`/plan`, `/create-prd`, `/sweep`) so `/ship-build` reads it rather than infers it. Closing
happens when the last stage succeeds, not when the PR opens: a PR still waiting for human
review has not shipped.

## 5. Filing the leftovers

**By default, shipping files an issue for every finding that was seen and not fixed**, in the
project's tracker. Sources: non-blocking `discovered.jsonl` rows, `/audit-build`'s
out-of-scope list, verification criteria left `not_verifiable`, and review findings marked left
open, plus failures the ownership judge ruled were not this feature's (section 7). Review
findings below the significance bar (nitpicks, style) are not filed by default, since they
would flood the tracker; `ship.md` can opt in. The tracker is the one `stack.md` declares
(OQ-6). Each filed issue links back to the work it was found in. Each finding is filed at most
once, keyed by a stable id so a re-run does not duplicate. Any it cannot file (no tracker
configured, a failed call) are listed in the readout, not dropped.

The #49 session produced exactly this list and filed none of it. It had three parser and
generator bugs, a shared findings file that loses data, and an unrelated `mock-fs` failure. Each
ended as a line in a readout.

## 6. Decisions — owner, 2026-10-31

| ID | Question | Decision |
|----|----------|----------|
| OQ-1 | What one `/ship-build` run ships | **Whatever Ensemble is currently working on**: the PRD/TRD feature, the `/plan` or the `/sweep` in flight. It is resolved the way other commands resolve the current work (explicit path, then branch, then `.trd-state/current.json`). |
| OQ-2 | Does `/ship-build` chain after `/audit-build`? | **No.** Shipping is a distinct decision. A passing audit names `/ship-build` as the clear next step in its NEXT; it never runs it. |
| OQ-3 | How fixes during shipping are made | **Agreed — section 7.** Robust, but proportionate about how much is re-verified and re-audited. |
| OQ-4 | Waits that take hours (human review) | **Stop and say so.** The run ends at the waiting stage with a resumable record. Remaining stages run on `/ship-build --resume`, or from a trigger set on the PR (e.g. on approval). No long-held turns. |
| OQ-5 | What "non-trivial" means for review findings | **Significant issues only.** This is mainly about external reviewers such as CodeRabbit: an instruction to fix everything it reports iterates forever, because each fix draws new comments. The bar is significance: correctness, security, data loss, a broken contract. Nitpicks, style and refactor suggestions are never fixed by `/ship-build`. Where the reviewer labels severity (CodeRabbit does), use its labels; otherwise a judge decides against the bar. The bar is a parameter of the review stage in `ship.md`, with that default. Section 7's round cap is the backstop. |
| OQ-6 | Where the issue tracker is declared | In project setup, not `ship.md`, because other commands file issues too. **`stack.md`** is the leaning: it is the owner's inventory of the systems a project uses, and it already drives skill selection, which is exactly what picks `managing-linear-issues` / `managing-jira-issues` / `managing-azure-devops`. (`process.md` describes workflow, not systems.) |
| OQ-7 | Release-style and platform shipping | **Defined in `ship.md`, as stages.** Version bump, changelog, tag and publish; mobile builds and store submission; OTA updates (e.g. a Flutter/Dart project building and pushing an over-the-air update). The vocabulary needs named stages for the common ones and a `run <command>` stage for the rest. |
| OQ-8 | Relationship to Forge's `ship-workplan` | **None.** Ensemble never assumes Forge exists. `ship-workplan` also works at a different level: it verifies a whole workplan's live system at the end. `/ship-build` delivers one feature. |
| OQ-9 | A project with no `ship.md` | **Commit and push; the branch is ready for a PR**, and none is opened. The readout points to `/ship-setup`. `ensemble.openPullRequest` folds into `ship.md` (`open-pr` as a stage), so that setting has one home. |

## 7. How fixes get made while shipping — agreed (OQ-3)

Shipping finds problems the build did not: CI failures, reviewer findings, a failed deploy. The
requirement is that each fix is as safe as a fix made during implementation, without re-running
the whole verification and audit for a one-line lint change.

**Every fix goes through the recorded path.** A problem becomes a discovery (`discovered.record`,
`blocksFeature: true`) and is built by `/implement-trd --reconcile --chained`, the same way
`/audit-build` already fixes its gaps. That gives each fix grounding, a TRD row, a commit and the
end-of-run code review. `/ship-build` never edits code itself.

**Triage first: not every failure is a code fix.**

| Failure | Action | Re-verify / re-audit |
|---|---|---|
| Flaky test or infrastructure (re-run passes) | Re-run CI once; no code change | none |
| Lint or format | Mechanical fix, committed | none — behaviour cannot have changed |
| Test or build failure in this feature's code | Fix via the recorded path | the affected criteria only (below) |
| Failure in code this feature did not touch | **Stop and report.** Not this feature's to fix. File it as a follow-up. A judge decides whether a failure is this feature's when the line is unclear. | — |
| Review finding at or above the bar | Fix via the recorded path | the affected criteria only |
| Review finding below the bar | Not fixed; filed as a follow-up if `ship.md` says so | — |
| Deploy failure | Stop and report; never auto-fix a deploy | — |

**Re-verify only what the fix could have changed.** The machinery mostly exists. Verification
evidence already records the source files it covers, and the checker treats evidence as valid
only while those files are byte-identical. After a fix, re-run only the criteria whose covered
files changed. Every other proven criterion stays proven.

**Re-audit narrowly, and only when requirement-bearing code changed.** `/audit-build` already has
a narrow re-audit that checks only the previous round's defects and the files changed since the
audited commit. Use that, and skip it entirely when the fix touched only tests, formatting or CI
configuration.

**Bounded.** Each fixing stage (`ci-green`, `external-review`) has a round cap in `ship.md`. At the
cap the run stops, says what is still failing, and leaves the PR as it is. It never merges past
an open problem.

**Settled with the owner, 2026-10-31:**
- **No full re-verify while shipping.** The widest it goes is re-checking the *must-pass*
  criteria, and only those whose own covered files the fix changed. Everything else follows the
  changed-files rule above.
- **Fix findings together.** All findings at or above the bar from one CI run or one review pass
  go into a single fix round. Each round costs real time and tokens, so rounds are few, not small.
- **A judge decides ownership.** When it is unclear whether a failure belongs to this feature, a
  judge decides. Failures it rules out of scope are reported and filed as follow-ups, never fixed
  here.

## 8. What the eventual build delivers, in one list

- `ship.md`: an owner-governed policy file, a template in `packages/core/templates/`, scaffolded
  like `verification.md`.
- `/ship-setup`: an interview skill that writes `ship.md`, modelled on `/verification-setup`.
  Running it is the owner's approval of the outward-facing stages it records.
- `/ship-build [--resume]`: runs the current work's stages in order. It fixes through the recorded
  path (section 7), stops at a human-review wait, closes the source issue and files follow-ups. It
  writes a `shipped.json` record and ends with the standard readout and banner.
- Recording the source issue when work starts (`/plan`, `/create-prd`, `/sweep`), so shipping
  can close it (section 4).
- An issue-tracker declaration in `stack.md` (OQ-6).
- `/audit-build`: stops opening PRs; on a pass it commits and names `/ship-build` as NEXT.
  `ensemble.openPullRequest` is retired into `ship.md`.
- Governance amendments, for the owner to approve: `constitution.md` (`ship.md` joins the
  owner-governed layer) and `autonomy.md` (`ship.md`'s stages are standing authorization for
  merges and deploys).

## 9. Not in scope for this brief

Building anything. Changing `autonomy.md`, `constitution.md` or `verification.md`; those are
owner-approved changes the PRD will propose, not make.

## 10. Owner rulings during `/refine-prd`, 2026-10-31, 2026-11-01 and 2026-11-02

Recorded verbatim from the interactive `/refine-prd` session that produced PRD 1.1.0, from
its second round (also 2026-10-31), which produced PRD 1.2.0, and from a third round on
2026-11-01, which produced PRD 1.3.0, and from a fourth round on 2026-11-02, which produced PRD
1.4.0. The second-round rows follow the "New requirement" row; the third-round rows are the three
after the "Derived requirements, confirmed" row; the fourth-round rows are the five after those.
The "Simplification" row, also 2026-11-02, is the owner's simplification, which produced PRD 2.0.0; the row after it, the same day, followed the owner's review of the first TRD and produced PRD 2.1.0. Each is a later decision on a question the PRD raised, and supersedes anything earlier in
this brief that it contradicts. Quotes are the owner's own answers; "(chose: …)" means the owner
selected that offered option.

| PRD question | Owner's answer |
|---|---|
| OQ-A — no `ship.md` | Already decided as OQ-9 above: "Commit and be ready for the PR as the result." The §2 line "a project with no `ship.md` keeps today's behaviour" predates that decision and is superseded. |
| OQ-B — `/ship-setup` form | (chose: "Skill, like /verification-setup") — owner-invoked only, interactive by purpose; still typed as `/ship-setup`. |
| OQ-C — `/close-feature`'s PR path | Asked "Should this retire close-feature?"; then (chose: "Keep, drop its PR path") — `/close-feature` stays the owner's "this is done" override; only `/ship-build` opens PRs. |
| OQ-D — existing `openPullRequest: auto` | (chose: "Rebase migrates it") — `/rebase-project` writes a minimal `ship.md` (push → open-pr) for such projects. |
| OQ-E — default round cap | "2. We also need to ensure we only allow critical issues to stop a feature from shipping on round 2" |
| OQ-F — production deploys | "VERIFICATION may not deploy to prod, but SHIP certainly can" |
| OQ-H — stopping at human review | (chose: "A distinct WAITING banner") — a third banner beside COMPLETE and STUCK. |
| OQ-I — `verify-deployed` | "Simply verify that the code is live" |
| OQ-J — first-version scope | (chose: "Core + release stages") — P0: core stages plus version-bump, changelog, tag, publish; P1: mobile-build, store-submit, ota-update, verify-deployed, PR trigger. |
| OQ-K — no recorded source issue | (chose: "Search and close a match") |
| OQ-L — `/task` follow-ups | (chose: "Yes, include them") — `/task` `closed.json` `followups` are a filing source. |
| OQ-M — audit gate | (chose: "Gate only full features") — PRD → TRD features need a passing audit; `/plan` light and `/sweep` work do not. |
| OQ-N — `ship.md` location | (chose: ".claude/rules/ship.md") |
| OQ-O — shipping a `/sweep` | (chose: "Yes, push commits it") |
| OQ-P — tracker declaration | Already decided as OQ-6 above ("Ok" to `stack.md`). |
| OQ-S — critical in the final round | (chose: "Judge decides") — a judge classifies final-round CI failures against the same bar as review findings. |
| OQ-T — no audited commit | (chose: "The commit /ship-build pushed") — the merged-to-target check compares against the pushed commit. |
| New requirement | "This command should also verify that the code verified and audited is merged to the target branch (assuming ship.md specifies a target branch). This should be a deterministic check" |
| OQ-S part 2 — the critical-only round under an edited cap | (chose: "The final round") — critical-only applies in the final round under whatever cap the project sets; with the default cap 2 that is round 2. |
| OQ-T part 2 and the merged-to-target design | "I want to be sure this is a meaningful test — but my thought is confirming with certainty that the exact code version verified and audited has been pushed, merged, deployed (or however far our process takes it)"; then (chose: the proposed CHAIN-OF-CUSTODY check) — after each stage that moves the code, deterministically confirm the code at that point is byte-identical to the audited code, ignoring only bookkeeping files (`.trd-state/` and the audit report). PUSH: the remote branch head's code equals the audited code. MERGE: the commit GitHub records as the PR's merged head has code equal to the audited code (works for merge, squash and rebase merges), and that PR merged into the target branch `ship.md` names. DEPLOY (when `ship.md` has a deploy stage): the deployed build reports the merged commit, tied to `verify-deployed`'s identity check. Fixes `/ship-build` itself makes are re-verified and become the new anchor before the next stage; any other code difference fails loudly, naming the stage and the differing files; never auto-fixed. Still deterministic code with unit tests, not a model judgement. Where there is no audited commit (OQ-T part 1), the anchor is the commit `/ship-build`'s push stage pushed. The owner unticked the separately offered items (an ancestry check with an "only bookkeeping or re-verified fixes after the audit" rule, and a `gh pr view` fallback); they are superseded by this ruling, not dropped. |
| Derived requirements, confirmed | Confirmed by owner: full commit IDs in `closed.json` (a change to `/audit-build` and `/close-feature`); `/close-feature`'s `closed.json` (`"audit": null`) satisfies the full-feature audit gate; `/ship-setup` records a deploy command in `ship.md` when `verification.md` declares none, and with neither the deploy stage stops; close an issue only when exactly one open issue clearly matches, otherwise close nothing and report the candidates. |
| OQ-U — code changed after the audited commit (2026-11-01) | (chose: "Audited commit + targeted re-verify") — "Anchor on the audited commit. After it, ignore bookkeeping, the TRD and test-only changes. A change to shipped source makes /ship-build re-verify only the must-pass items whose files changed, then move the anchor." The chain-of-custody anchor stays the commit `/audit-build` audited; changes after it to bookkeeping (`.trd-state/`, the audit report), the feature's TRD and test-only files are ignored by the check; any change to shipped source after the audited commit (e.g. a closing audit's chained code fix) makes `/ship-build` re-verify only the must-pass criteria whose covered files changed (the same proportionate rule as section 7), and that re-verified commit becomes the anchor before push. Supersedes the 2026-10-31 chain-of-custody row's "ignoring only bookkeeping files" where they differ. |
| What `/ship-build` fixes (2026-11-01, asked during OQ-U) | "I want to confirm ship-build only makes changes on third party review issues?" — answered no: `/ship-build` fixes in two fixing stages, `external-review` (third-party review findings) and `ci-green` (CI failures, `fix=yes`), plus formatter/linter tool runs and release-stage files; it never edits code itself. Then "Both, as written": CI failures stay fixable. A confirmation; no behaviour change. |
| OQ-V — release stages that commit (2026-11-01) | (chose: "Owned files + identity") — a release stage may move the anchor only if its commit touches exactly the files that stage owns (`version-bump`: the project's version fields; `changelog`: `CHANGELOG.md`; a `run <command>` stage declares its files in `ship.md`); a release commit touching anything else fails the check. `publish`, `store-submit` and `ota-update` get a deploy-style identity check (the destination reports the version or commit, compared with the anchor) where the destination can report one, and are reported explicitly as "not checkable here" otherwise — never as a pass. |
| OQ-X — does `verification.md`'s deploy column bind a `ship.md` deploy outside production? (2026-11-02) | (chose: "No: ship.md decides") — "Extend your production ruling to every environment: the column governs only the verification loop; a deploy stage listed in ship.md is the authorization. verification.md still supplies the deploy command. Avoids prod allowed but staging blocked." Section 1's "Loop may DEPLOY to it?" column governs only the verification loop; a deploy stage listed in `ship.md` is itself the authorization for any environment. Supersedes section 2's "reuses the declared full-deploy command and permissions" where they differ: the command is still reused, the permissions are not. |
| OQ-W — a record of review findings left open (2026-11-02) | (chose: "Build the record") — "The TRD adds a step in /implement-trd (Step 7.2) that writes the review findings it chose not to fix to .trd-state/<feature>/, and /ship-build files them. Nothing a reviewer raised is silently lost." The filename and format are the TRD's. |
| Ambiguous short anchor id (2026-11-02, PRD AC-F14.8) | (chose: "Yes, fail on ambiguity") — a unique short id resolves normally; an ambiguous one fails with that reason, never a guess. |
| `constitution.md` prohibited patterns 7 and 8 (2026-11-02, PRD AC-F12.8) | (chose: "Keep the draft") — the drafted `constitution.md` amendment covering prohibited patterns 7 and 8 stays in scope; the edit itself still needs the owner's approval when built. |
| OQ-Y — below-bar findings in the left-open review record (2026-11-02, raised by PRD 1.4.0) | (chose: "Record all, file above bar, list rest") — "The record keeps every unfixed finding. /ship-build files issues only for those at or above the bar (as the brief says), and its readout names the below-bar ones and where they are recorded. Nothing is silent, and the tracker isn't flooded." |
| Simplification — "over designed" (2026-11-02, PRD 2.0.0) | "I believe we've designed the right thing but have over designed it. It's supposed to solve a few simple problems: 1. Orchestrate a project-configurable ship process, which may be as simple as raising a PR or as complex as monitoring CI, fixing issues, re-verifying, merging, and deploying 2. Ensure issues identified but not fixed are logged 3. Ensure the code verified is the code shipped." Then, of four proposed simplifications, "Take all of A-D": **A** — no release or platform stages: `version-bump`, `changelog`, `tag`, `publish`, `mobile-build`, `store-submit`, `ota-update` and a standalone `verify-deployed` become example `run <command>` lines in the `ship.md` template `/ship-setup` writes, and the owned-files rule and the publish/store/OTA identity checks go (reverses OQ-J and OQ-V). **B** — no WAITING banner: a run stopped at `await-human-review` ends `COMMAND COMPLETE`, its readout saying the work is not shipped yet and to run `/ship-build --resume` (reverses OQ-H and "Keep the draft"). **C** — close the source issue only when one was recorded; no search (reverses OQ-K). **D** — no re-audit while shipping; a fix is re-verified only (supersedes section 7's narrow re-audit). |
| Simplification after the first TRD — "overengineering" (2026-11-02, PRD 2.1.0) | Of the first TRD (18 tasks over 6 phases): "18 tasks and 6 phase again feels like we may be overengineering". Then, of five proposals E–I, "Take: F G I". **F** — leave `ensemble.openPullRequest` alone for now: `/implement-trd`, `/audit-build`, `/close-feature` and `pull-request.js` keep reading it and `/rebase-project` migrates nothing; `/ship-build` becomes the recommended way to ship, and retiring the setting is a later, separate small change (defers OQ-9's folding, OQ-C's "only `/ship-build` opens PRs" and OQ-D). **G** — close only an issue the current work already names (the PRD/TRD header or the branch name); `/sweep`, `/plan` and `/create-prd` are not taught to record one. **I** — keep deterministic code only where a wrong answer is costly: parsing `ship.md`, the custody check and follow-up filing; stage sequencing, run-state bookkeeping and finding triage are the command prompt's job, checked by the run record. **E** and **H** were offered and declined: targeted re-verification of the affected must-pass criteria stays, and resuming from a trigger on the PR stays at P1. |
| AC-F5.1 must-pass mark (2026-11-03, raised by `/audit-trd` against TRD 1.1.1) | Asked whether the TRD's must-pass mark on AC-F5.1 (every fix made while shipping goes through the recorded, re-verified build) should stay, the PRD marking no criterion must-pass: "Keep it" |
