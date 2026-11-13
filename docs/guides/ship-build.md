# Shipping: `/ship-build` and `/ship-setup`

`/ship-build` ships the work a closed feature (or a sweep) left on your branch: it runs the
steps your project lists in `.claude/rules/ship.md`, in order. `/ship-setup` is the interview
that writes that file. This guide describes both as built; where a prose file (the `ship.md`
template, the `/ship-setup` skill) disagrees with the code, it follows the code.

`/ship-setup` also checks your GitHub Actions workflows (`node .claude/lib/ci-baseline.js check`)
for three properties that keep ship runs from churning: a summary job that gates on every other
job, docs-only and record-only changes skipped by job-level conditions, and record commits on a
PR not re-running the heavy jobs. It reports each gap in its readout with how to close it and
never edits a workflow.

## The policy file, `ship.md`

`.claude/rules/ship.md` is the project's release policy: the list of shipping actions
(primitives) to run, in order. It is owner-governed like `verification.md`. It changes only when
you run `/ship-setup`, which asks, then writes; no autonomous run edits it. It holds no
credential, only the commands that use one.

A project with no `ship.md`, or none with a step under `## Ship`, has **no policy**. `/ship-build`
then runs the single step `push` and its readout says how to set shipping up.

### Line format

```
## Ship
1. push
2. open-pr base=main
3. repeat rounds=2
   - push
   - wait-ci
   - collect-findings
   - fix-findings
4. merge method=squash

## After shipping
1. close-issue
```

- **Numbered steps** under two headings: `## Ship` (before and through the merge and release) and
  `## After shipping` (things that run once the code has shipped).
- **Parameters** are `key=value` pairs after the primitive's name; quote a value that holds
  spaces: `identity="<command>"`.
- **`repeat` blocks** take indented `- <primitive> ...` lines. A block cannot contain another
  block (no nesting).
- **`run` takes the rest of the line** as the command, verbatim (`1. run npm version patch`);
  any contract declaring `rest:` does the same.
- **Fenced blocks and the `## Examples (not run)` section are never parsed.** Copy from there
  and edit; nothing under that heading takes effect.

A string that does not parse stops the run, naming each bad line: a step needs a key no earlier
step provides (`merge` needs `pr` from `open-pr`), a primitive sits under the wrong heading, or
`release` has no `identity=`.

### How `repeat` counts

`N. repeat [until=<result>] [rounds=<n>]`. `rounds` defaults to 2. The block makes **up to
`rounds` + 1 passes**: the first pass plus `rounds` more, and the last pass is the one handed
`final: true`. The block ends early when the `until` result is recorded.

- With no `until=`, the repeat takes the `repeat-until` its body's contract declares
  (`collect-findings` declares `clean`).
- Ending the last pass without the `until` result stops the run:
  `repeat ended without <until> after <n> rounds`.
- A failure result (one a contract lists under `stops-on`, such as `wait-ci`'s `failed`) cannot
  be an `until`.

(The `/ship-setup` skill calls `rounds` "the most passes the block makes"; the code's count is
`rounds` + 1.)

### The merge loop

A contract may declare a bounded recovery loop for one of its own results: `loop-on: <result>`
(it must also be in `stops-on`), `loop-via: <primitives, in order>` (each `outward: no`) and
`loop-rounds: <param>` (the parameter holding the bound). `merge` declares `loop-on: red, moved` (a contract may list several words, each also in `stops-on`),
`loop-via: collect-findings, fix-findings, push, wait-ci` and `loop-rounds: rounds`.

When `merge` records `red` (CI failed on a head nothing judged, so no merge ran), the sequencer
runs those four steps, with the params of the same primitives you listed earlier, then hands
`merge` out again. The loop exists only if `ship.md` lists all four primitives before the merge
(a `repeat` body counts) and `rounds` is above 0; the sequencer never adds a step you did not
list. With no loop, `red` stops the run as before.

**A moved head.** Before anything else `merge` runs `merge-up.js sync-head`, which fetches the PR
branch and brings local up to its pushed tip: a fast-forward, or a local merge when the only
local-only commits are run-record files. Commits by another writer on non-record files that are
not on the branch are a conflict and stop the run; nothing is rebased or reset. `merge` waits for
CI on every head that is not the one a step last judged (`wait-ci` and `collect-findings` record
`judgedHead`; so does `merge` when it returns `red`). A red wait is `red`. A green wait on a head
that moved by more than the base merged in returns `moved`: the loop collects findings on the new
commits, fixes any, and hands `merge` out again, spending a round from the same `rounds` bound as
`red`. With no round left, the custody gate re-proves what the new commits affect and the merge
goes ahead pinned to the new head, with one line in ISSUES saying so.

How this differs from `repeat`: a `repeat` re-runs its whole body, and `rounds` is the number of
extra passes (rounds + 1 passes in all). The merge loop runs its body only after a `red`, and
`rounds=N` is N body rounds and at most N + 1 attempts of `merge`. Spent without a merge, the run
stops with `step <id> (merge) loop ended after <N> rounds`.

### What stops a run, and what does not

Stops are sorted by who clears them. A **wait** clears itself on a later check, with no decision:
`merge` re-reads an unreadable PR up to 8 times (15s apart), polls mergeability up to 8 times,
and polls for the PR head to catch up to the push up to 40 times (10 minutes). A **loop** is
bounded mechanical retry: a red head under `merge` (above). A **real** stop needs a person: a PR
closed unmerged, a clash `merge-base-in` cannot resolve, a failed push, a custody-gate stop, a
pr-head mismatch, a `gh pr merge` refusal (branch protection, a required review, the base moved:
`--resume` merges the base in again), a failed merge-link proof, an unauthorized step, an
unreadable record, and a `repeat` or loop spent without its exit.

## The 13 primitives

Each primitive is one contract file, `packages/core/contracts/ship-primitive-<name>.md`, copied
to `.claude/contracts/` in a project. The front matter says what the sequencer needs; the
`## Do` section is the whole instruction set for the step.

**Outward** means the step acts beyond your branch (opens, comments, merges, deploys, files). An
outward step is subject to the [authorization gate](#the-outward-authorization-gate).

| Primitive | What it does | Outward | Needs / provides | Results |
|---|---|---|---|---|
| `push` | Publishes the work's `HEAD`; sets the custody anchor if none exists (it never moves one). | no | provides `head` | `pushed` |
| `open-pr` | Opens the work's pull request, or reuses the open one. Param `base`. | unless `ensemble.openPullRequest=auto` | needs `head`, provides `pr` | `opened`, `reused` |
| `request-review` | Asks an outside reviewer to review the current head (a PR comment) and waits. Param `tool` (`coderabbit`, `codex`, `claude`, or a GitHub login). | yes | needs `pr` | `reviewed` |
| `wait-ci` | Waits for CI on the current head; re-runs failed jobs once. A job that passes only on rerun is recorded as a flake; once it has flaked 3 times across every feature, the rerun-pass counts as `failed`. | no | needs `head`; `stops-on: failed` | `passed`, `failed`, `no-checks` |
| `collect-findings` | Gathers what CI and reviewers found, decides which the work must fix, and records it. Never fixes or files. Param `bar` (default `significant`). | no | needs `head`, provides `findings`; `repeat-until: clean` | `clean`, `found` |
| `fix-findings` | Turns the open blocking findings into code through the recorded path; never pushes. A CI failure whose fix lies only in test files or CI config is fixed directly, without the reconcile build or a whole-branch review. Param `format` (the project's format/lint command). | no | needs `findings` | `fixed`, `nothing` |
| `await-approval` | Parks the run until a human approves the PR. Param `trigger` (`github-actions` is the one value). | no | needs `pr` | `approved` |
| `merge` | Merges the PR at the verified head and proves what merged is what was verified. Params `method` (`merge`, `squash`, `rebase`; default `merge`) and `rounds` (default 2; `0` turns the merge loop off). First catches local up with the PR branch (`sync-head`); waits for CI on every head that is not the last judged one (a moved head, or after merging the base in); `red` there, or `moved` (green, but another writer's commits), runs the merge loop. | yes | needs `pr`, provides `merged`; `stops-on: red, moved`, `loop-on: red, moved` | `merged`, `red` |
| `release` | Runs the release or deploy command and proves the environment now runs the verified commit. Params `env`, `command`, `identity` (required). | yes | needs `head` | `released` |
| `run` | Runs one command exactly as written in `ship.md` (a version bump, a tag, a store submission). Takes the rest of the line. | yes | none | `ran` |
| `sync-design` | After a merge, brings each design's boards in step with the merged build. Never stops the run. | yes | needs `merged` | `synced`, `nothing`, `skipped` |
| `close-issue` | Closes the one issue the work names, and nothing else. | yes | none | `closed`, `none` |
| `file-followups` | Files what the work left over as tracker issues, once, product rows first (then host, tooling, paperwork, not-verifiable). The only primitive that files. Param `below-bar` (default `no`). | yes | none | `filed` |

Sections: `run` is allowed under either heading; `sync-design`, `close-issue` and
`file-followups` belong under `## After shipping`; the other nine under `## Ship`.

Notes: outside a `repeat`, `wait-ci` recording `failed` stops the run on that step.
`merge` recording `red` or `moved` runs its loop instead (see [The merge loop](#the-merge-loop)).
`await-approval` returns `wait` without an approval and never polls in-session. `fix-findings`
never edits a lint finding by model: with no `format=` set, a lint row stops the step and says
to set one with `/ship-setup`. `release` resolves its command in a fixed order and never
guesses: `verification.md` section 2 for `env=`, then `command=`, then nothing; `identity=`
is a command that prints the commit the environment runs.

## Adding a primitive

The sequencer is primitive-blind: it names no primitive and no result word. It reads all it
knows from the contract file's front matter, so a new primitive is a new file and no
sequencer change. There are two routes.

### Route 1: in the framework

1. Add `packages/core/contracts/ship-primitive-<name>.md`. The front matter holds
   `primitive` (must match the filename), `params`, `results`, `outward` (`no`, `yes`, or
   `unless <key>=<value>`), `needs`, `provides`, `section` (`ship`, `after` or `any`), and
   optionally `rest`, `repeat-until`, `stops-on` and the three loop keys (`loop-on`, `loop-via`,
   `loop-rounds`; see [The merge loop](#the-merge-loop)). A param may not be named `work`, `final`,
   `laterNeeds` or `context`: the sequencer adds those to every step's input. The body has four
   sections: `## Input`, `## Do`, `## Result`, `## Waiting`.
2. Copy the file byte-identical to `.claude/contracts/`. A test enforces the match.
3. Add an entry for it to `EXPECTED` in `packages/core/contracts/ship-primitives.test.js`:
   its `results`, `outward`, `needs`, `provides` and `section`, matching the front matter. The
   "the set is the thirteen" test fails until the name is there, and "front matter matches the
   table" fails until the entry matches.
4. Nothing else. `/ship-setup` offers the new primitive from the directory listing, asking the
   params its front matter declares plus anything in an optional `## Setup` section.

### Route 2: in one consuming project

Drop the contract file into that project's `.claude/contracts/`. `scaffold-project.sh` never
deletes a contract it did not ship, so it survives `--refresh` and `/rebase-project`. It is
available to that project's `ship.md` and `/ship-setup` only.

## The default string

This is the first labelled example `/ship-setup` offers ("The default string, which
`/ship-setup` offers first"). Replace `identity` with a command that prints the commit the
deployed environment runs:

```
## Ship
1. push
2. open-pr
3. repeat until=clean rounds=2
   - push
   - request-review tool=coderabbit
   - wait-ci
   - collect-findings
   - fix-findings
4. merge
5. release env=production identity="<command that prints the deployed commit>"

## After shipping
1. sync-design
2. close-issue
3. file-followups
```

The template carries other labelled examples (push only, PR then human approval, PR to `develop`,
merge and deploy, and `run` lines for version bumps, tags and store submissions).

## The outward-authorization gate

The sequencer, not the `ship.md` template, decides whether an outward step may run. This is the
rule as built, in `isAuthorized()` in `packages/core/lib/ship-sequencer.js`:

- A step whose contract says `outward: no` is always let through.
- Any other step needs one of these:
  1. `.claude/rules/autonomy.md` contains, with whitespace collapsed, this exact sentence:

     > A step listed in `.claude/rules/ship.md` is the owner's standing authorization for that act.

  2. The contract's `unless` setting holds. Only `open-pr` has one:
     `outward: unless ensemble.openPullRequest=auto`, read from `.claude/settings.json`.

**Listing a step in `ship.md` does not by itself authorize an outward step.** (The `ship.md`
template's opening paragraph says it does; the code says otherwise, and the code is what runs.)

**As built today, outward steps are refused.** No `autonomy.md` on `main` carries the sentence,
and nothing writes it: not `/ship-setup`, not `/init-project`. A refused step is recorded `stop`
with the reason `not authorized: <primitive>`, and the readout names the primitive and says the
authorization is missing. With the default string that means:

- the run stops at `open-pr`, unless `ensemble.openPullRequest` is `auto` (the shipped default
  is `never`); or
- with `openPullRequest` set to `auto`, it stops at the first `request-review`.

Adding the sentence is the owner's call, but `autonomy.md` is a framework-owned rule file, not
an owner-governed one: `scaffold-project.sh --refresh` (run by the `runtime-refresh.sh`
SessionStart hook) and `/rebase-project` overwrite it with the plugin's copy, so a sentence
added by hand is lost at the next refresh. Until the framework ships a durable place for it, a
string ships only as far as its last non-outward step.

## Running `/ship-build`

```
/ship-build [trd-path] [--resume]
```

### Resolving the work

First hit wins:

1. An explicit TRD path.
2. The branch name, parsed against the two patterns in `process.md` (`<issue-id>-<session>`,
   `feature/<trd-name>/<session>`) and matched to a TRD filename or a `.trd-state/` directory.
3. Exactly one `.trd-state/*/` directory whose `implement.json` `branch`, or `shipped.json`
   `work.branch`, equals the current branch. More than one match is not a hit. Directories
   starting with `_`, and task directories, are skipped; a closed feature is not.
4. Sweep work: no TRD work, and the working tree has changes outside `.trd-state/`. Its id is
   `sweep-<YYYYMMDD-HHMMSS>` and its state directory `.trd-state/ship-<id>/`.
5. Otherwise `COMMAND STUCK`, listing the candidates.

### The closed-feature gate

A **full feature** (Source PRD names a `docs/PRD/` file, or no Source PRD line) needs
`.trd-state/<feature>/closed.json`, which a passing `/audit-build` writes; without it the command
stops and points at `/audit-build`. A `/plan` TRD and a sweep have no gate.

### The loop

`/ship-build` is a thin loop over `ship-sequencer.js`:

1. `start` snapshots the steps from `ship.md` into `<state-dir>/shipped.json`; `ship.md` is never
   read again, so a resume cannot be changed by a mid-run edit.
2. `next` hands out a step. The command reads that step's contract and does exactly what its
   `## Do` says, then `record`s a result word the contract declares (a word it does not declare
   is refused), or `wait`, or `stop`.
3. It loops until `record` returns `waiting` or `stuck`, or `next` returns `done`. A step the
   gate refuses is recorded `stop` by the sequencer itself.

The sequencer is the only writer of `shipped.json`, `custody.js` of `custody.json`. The command
never edits code itself, never probes a service by acting on it, and never calls
`AskUserQuestion`: an unauthorized step is reported, not asked about.

### Parked and stopped

- A **wait** (for example `await-approval` with no approval yet) parks the run. It is a
  successful stop: the banner is `COMMAND COMPLETE` and NEXT carries `/ship-build --resume`.
- A **stop** (a failed step, a refused step, a repeat that ended without its `until`) ends
  `COMMAND STUCK` with the reason and what would unblock it.
- Either way the state directory is committed by pathspec so the record travels with the branch
  (skipped when the PR is already merged; NEXT then says to commit it on the default branch).
- ISSUES lists every `data.issues` line, `not authorized` step and stray uncommitted change.

## Resuming a parked run

`/ship-build --resume` continues a parked or stopped run from `shipped.json`. The step that
parked or stopped is handed out again, so a step is re-run, not skipped. When the tracked
`shipped.json` is gone (the branch or worktree was deleted after a merge), the resume continues
the record kept under the git directory whose kind, id and branch all match the work, the branch
being the one in `implement.json`; with no such record it begins a fresh run.

### The resume workflow

`.github/workflows/ensemble-ship-resume.yml` resumes a run on its own when a reviewer approves.
`/ship-setup` installs it only on your yes, and only when the string has an `await-approval`
step. It fires on `pull_request_review` (submitted) and runs only when all of these hold:

- the review state is `approved`;
- the reviewer's `author_association` is `OWNER`, `MEMBER` or `COLLABORATOR`;
- the PR's head repository is this repository (no fork's branch, which would run with this
  repository's secret).

It then runs `anthropics/claude-code-action@v1` with the prompt `/ship-build --resume`, using the
repository secret `ANTHROPIC_API_KEY`. You add that secret under Settings, Secrets and variables,
Actions; its value is never written to any file. The workflow file **must be on the default
branch** to fire.

`await-approval trigger=github-actions` records `remoteResume` only when the workflow file is on
the remote default branch. Only then does `/ship-build` push the state record at the wait, since
the remote run needs it on the branch. Without it the wait is not pushed and no trigger is
claimed.

**Unverified.** The workflow's own header says it is unproven until a live run shows that the
action runs a project slash command from the vendored `.claude/` directory on a review event.

## Custody: ship what was verified

The principle: the code that ships is the code that was verified. `custody.js` keeps one anchor
commit in `<state-dir>/custody.json`: the head after `/audit-build`'s own fix run
(`closed.json` `audit.anchorCommit`) when there is one, else the audited commit
(`audit.auditedCommit`), otherwise `HEAD` at the first push.

**Code equality** between two commits is `git diff --no-renames --name-only`, with every
changed path classed as ignored (`.trd-state/` and the work's TRD), test-only, or shipped. The
commits are equal when no shipped path differs.

**Reconcile** is the custody gate (`ship-custody-gate.md`). It runs before `merge` and before
`release`, not in `push`: a push is not gated by custody. `push` only records the anchor when none
exists yet (`reconcile --set-only`); it never compares or moves one. The gate runs on the pushed
head (for `merge`, the PR's `headRefOid` after a poll until it matches the branch's commit on `origin`), against
the base fetched from `origin`. Paths that differ only because they came from the base are
excused, not counted as shipped changes.

| Shipped source since the anchor | Outcome |
|---|---|
| no anchor yet | the anchor is recorded (post-fix head, else audited commit, else `HEAD`); `set` when `HEAD` equals it, otherwise the rows below apply |
| unchanged (or changed only by files that came from the base) | `none`: the anchor stays |
| changed by the formatter commit (`--reason format`) | `moved`, with no re-verification |
| changed, and no success definition or no must-pass criterion is affected | `moved` |
| changed, and a must-pass criterion is affected | `reverify`: the gate runs `/verify-build --criteria <ids> --no-fix --chained` on the pushed head, then `moved` if all are met (criteria whose files did not change are `reused`); if not, the run stops |

### What a change re-proves: `ensemble.reproof`

Each changed path is classed `ignored` (record files, `OWNER-CALLS.md`, the work's TRD), `test-only`,
`ci-config` (workflows and other CI definitions), `deps` (lockfiles only; `package.json` and other
manifests stay shipped), `docs` (`docs/`, README/CHANGELOG-style files) or `shipped`. The pr-head,
merge and deploy links still fail on any non-ignored, non-test difference: the tiers decide only what
`reconcile` re-proves. Set them in `.claude/settings.json`; an absent key means its default, and
`/rebase-project` never writes the key, so your value survives a refresh.

| Key | Allowed | Default | Meaning |
|---|---|---|---|
| `docs` | `none` / `ci` / `reprove` | `none` | a docs-only change re-proves nothing |
| `testOnly` | same | `ci` | left to CI |
| `ciConfig` | same | `ci` | left to CI |
| `deps` | same | `ci` | left to CI, unless `depsReprove` names a package |
| `depsReprove` | array of package names | `[]` | a lockfile whose diff changes a line in an entry naming one of these (whole word) is re-proved |
| `format` | `none` / `reprove` | `none` | `reprove` stops the formatter-commit shortcut (`--reason format`) |
| `shipped` | `covers` / `all` | `covers` | `covers`: re-prove only criteria whose recorded files changed; `all`: every must-pass criterion |

When every changed path is non-shipped at `none` or `ci`, the anchor moves with no re-proof: rule
`tier-none` (all at `none`) or `tier-ci` (any at `ci`), and the reason names the classes. A path at
`reprove` puts every must-pass criterion in doubt, and a base-branch excuse does not soften it. A
changed shipped path that no criterion's record names also puts every must-pass criterion in doubt.
The per-criterion file lists come from `record-criteria`, run by `/implement-trd` and `/verify-build`
after a verification run; they live in `<state-dir>/evidence/criterion-covers.json`. A value outside
the allowed set, or `settings.json` that is not valid JSON, makes `reconcile` return `refused` naming
the setting.

The gate commits and pushes nothing before the act it guards: the re-anchor in `custody.json`
stays uncommitted, so the PR head stays the one CI checked and `--match-head-commit` matches.
After the merge, `shipped.json` is written to the feature's records ref
(`refs/ensemble/records/<feature>`), not to the tracked state directory, and the custody anchor
(`custody.json`) goes beside it: every later reconcile or check reads and writes that copy, and the
ref is pushed with it when there is an origin. `ship-sequencer.js status` reports them as
`recordPath` and `custodyPath`, which then read `<ref>:shipped.json` and `<ref>:custody.json`; read
them with `git show <that value>`. Only if a ref write fails does the old file under the git common
directory (`<git common dir>/ensemble/ship/<feature>/`) and its pointer hold them, as before. Runs
started before this change keep loading from that folder, after the ref. `ship-sequencer.js start`
restores the state folder from the records ref itself, a plain start included; a plain start drops
a restored `shipped.json` (and a restored `custody.json` stamped with an earlier run) and begins a
fresh run. `shipped.json` also carries `work.forge_feature_id`.

**Check** proves three links against the anchor:

- **push**: the pushed branch is checked against the anchor.
- **merge**: the PR merged at `--match-head-commit`, and that commit compares equal.
- **deploy**: the output of `release`'s `identity=` command resolves to a commit equal to the
  anchor. The readout reports the commit released from this work.

Nothing is fixed automatically: a failed link is reported and the run stops.

### Re-proof record

Each time the custody gate re-proves criteria (the `reverify` row above), the run keeps a trace in
the `reproof` block of `shipped.json`, so Forge can read what was re-proved and how it went. A new
record starts with `reproof: { count: 0, runs: [] }`. The custody gate writes one entry per
re-proof through `ship-sequencer.js reproof --state-dir <d> --custody '<the reconcile line that
returned reverify>' --reverified <path> --started-at <ISO time taken before /verify-build>
[--outcome <word>]`; never write the block by hand. A call is refused, leaving the record
unchanged, when there is no record, the run is done, the custody value is not JSON or lacks
`action` or an `ids` list, or `--started-at` is not a time. The block is reporting, not proof.

After a merge the record, and so this block, lives on the records ref as `<ref>:shipped.json`
(or, if a ref write failed, in the old file under the git directory); `ship-sequencer.js status`
reports it as `recordPath`; read it there with `git show`, not in the tracked state directory.

| Field | Meaning |
|---|---|
| `reproof` | The block itself, holding `count` and `runs`. |
| `count` | Number of re-proofs recorded so far; always the length of `runs`. |
| `runs` | One entry per re-proof, oldest first. |
| `step` | Id of the ship step handed out when the gate ran, so the entry names the act the gate was guarding. `null` when no step was handed out. |
| `primitive` | The primitive of that step (for example `merge` or `release`). `null` when no step was handed out. |
| `pass` | The pass number (of a `repeat`) the step was on. `null` when no step was handed out. |
| `criteria` | The success-definition criterion ids re-proved: the `ids` of the custody line, exactly what was passed to `/verify-build --criteria`. |
| `met` | The criteria, among `criteria`, that the re-verification file marks `met`. Empty when that file is missing, unreadable, or older than `startedAt` (a leftover from an earlier re-proof). |
| `id` | Inside a `met` item: the criterion id. |
| `retried` | Inside a `met` item: true when the verification re-judged that criterion after a first failed attempt. |
| `outcome` | The verification outcome: `--outcome` when given, else the outcome in the re-verification file, else `null`. |
| `custody` | What the gate saw when it asked for the re-proof. |
| `action` | Inside `custody`: the gate's action, always `reverify` here. |
| `classes` | Inside `custody`: the distinct classes of the differing paths (today `shipped`), plus `base` when `excused` is non-empty. So `["shipped"]`, `["base"]` or both. |
| `differing` | Inside `custody`: the shipped paths that differ from the anchor. |
| `excused` | Inside `custody`: paths that differ only because they came from the base, so were not counted. Empty when none. |
| `startedAt` | When the re-proof began, the time taken before `/verify-build` ran (ISO time). |
| `endedAt` | When the entry was recorded (ISO time). |
| `durationSeconds` | Whole seconds from `startedAt` to the recording call. |
