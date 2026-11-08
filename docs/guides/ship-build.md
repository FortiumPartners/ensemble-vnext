# Shipping: `/ship-build` and `/ship-setup`

`/ship-build` ships the work a closed feature (or a sweep) left on your branch: it runs the
steps your project lists in `.claude/rules/ship.md`, in order. `/ship-setup` is the interview
that writes that file. This guide describes both as built; where a prose file (the `ship.md`
template, the `/ship-setup` skill) disagrees with the code, it follows the code.

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

## The 13 primitives

Each primitive is one contract file, `packages/core/contracts/ship-primitive-<name>.md`, copied
to `.claude/contracts/` in a project. The front matter says what the sequencer needs; the
`## Do` section is the whole instruction set for the step.

**Outward** means the step acts beyond your branch (opens, comments, merges, deploys, files). An
outward step is subject to the [authorization gate](#the-outward-authorization-gate).

| Primitive | What it does | Outward | Needs / provides | Results |
|---|---|---|---|---|
| `push` | Publishes the work's `HEAD`; the one step that reconciles the custody anchor first. | no | provides `head` | `pushed` |
| `open-pr` | Opens the work's pull request, or reuses the open one. Param `base`. | unless `ensemble.openPullRequest=auto` | needs `head`, provides `pr` | `opened`, `reused` |
| `request-review` | Asks an outside reviewer to review the current head (a PR comment) and waits. Param `tool` (`coderabbit`, `codex`, `claude`, or a GitHub login). | yes | needs `pr` | `reviewed` |
| `wait-ci` | Waits for CI on the current head; re-runs failed jobs once. | no | needs `head`; `stops-on: failed` | `passed`, `failed`, `no-checks` |
| `collect-findings` | Gathers what CI and reviewers found, decides which the work must fix, and records it. Never fixes or files. Param `bar` (default `significant`). | no | needs `head`, provides `findings`; `repeat-until: clean` | `clean`, `found` |
| `fix-findings` | Turns the open blocking findings into code through the recorded path; never pushes. Param `format` (the project's format/lint command). | no | needs `findings` | `fixed`, `nothing` |
| `await-approval` | Parks the run until a human approves the PR. Param `trigger` (`github-actions` is the one value). | no | needs `pr` | `approved` |
| `merge` | Merges the PR at the verified head and proves what merged is what was verified. Param `method` (`merge`, `squash`, `rebase`; default `merge`). | yes | needs `pr`, provides `merged` | `merged` |
| `release` | Runs the release or deploy command and proves the environment now runs the verified commit. Params `env`, `command`, `identity` (required). | yes | needs `head` | `released` |
| `run` | Runs one command exactly as written in `ship.md` (a version bump, a tag, a store submission). Takes the rest of the line. | yes | none | `ran` |
| `sync-design` | After a merge, brings each design's boards in step with the merged build. Never stops the run. | yes | needs `merged` | `synced`, `nothing`, `skipped` |
| `close-issue` | Closes the one issue the work names, and nothing else. | yes | none | `closed`, `none` |
| `file-followups` | Files what the work left over as tracker issues, once. The only primitive that files. Param `below-bar` (default `no`). | yes | none | `filed` |

Sections: `run` is allowed under either heading; `sync-design`, `close-issue` and
`file-followups` belong under `## After shipping`; the other nine under `## Ship`.

Notes: outside a `repeat`, `wait-ci` recording `failed` stops the run on that step.
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
   optionally `rest`, `repeat-until` and `stops-on`. A param may not be named `work`, `final`,
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
parked or stopped is handed out again, so a step is re-run, not skipped. The run is always
continued from its state file, never restarted.

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
commit in `<state-dir>/custody.json`: the audited commit from `closed.json` when there is one,
otherwise `HEAD` at the first push.

**Code equality** between two commits is `git diff --no-renames --name-only`, with every
changed path classed as ignored (`.trd-state/` and the work's TRD), test-only, or shipped. The
commits are equal when no shipped path differs.

**Reconcile** runs in `push` (and for the formatter commit `fix-findings` makes, with
`--reason format`). It sets or moves the anchor:

| Shipped source since the anchor | Outcome |
|---|---|
| no anchor yet | the anchor is recorded (audited commit, or `HEAD`); `set` when `HEAD` equals it, otherwise the rows below apply |
| unchanged | `none`: the anchor stays |
| changed by the formatter commit (`--reason format`) | `moved`, with no re-verification |
| changed, and no success definition or no must-pass criterion is affected | `moved` |
| changed, and a must-pass criterion is affected | `reverify`: `push` runs `/verify-build --criteria <ids> --no-fix --chained`, then `moved` if all are met; if not, the run stops |

**Check** proves three links against the anchor:

- **push**: the pushed branch is checked against the anchor.
- **merge**: the PR merged at `--match-head-commit`, and that commit compares equal.
- **deploy**: the output of `release`'s `identity=` command resolves to a commit equal to the
  anchor. The readout reports the commit released from this work.

Nothing is fixed automatically: a failed link is reported and the run stops.
