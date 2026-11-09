# Verification environments

**Owner-governed, like `stack.md`. It changes only when the owner runs
`/verification-setup`, which asks, then writes; running it is the approval. No autonomous
run edits this file.**

`stack.md` is a declarative inventory — languages, frameworks, hosting. It says nothing
about how to REACH a running instance, and that is exactly what a functional verifier needs.
This file is that missing half, and it is the difference between a verification loop that
can correct itself and one that reports `stalled` because it was measuring a build nobody
refreshed.

**Why the owner governs it, not an agent:** which instance is safe to exercise, whether a
deploy is allowed, where credentials live — these are infrastructure policy, not
observations. An agent inferring them from a codebase is guessing at your rules.
`/verification-setup` offers what it detects from the repo as a default for each question,
but the answer is always the owner's.

---

## 1. Environments

One row per environment the verifier may encounter. **An environment that is not listed is
not authorized** (S-2), and criteria needing it resolve to `not verifiable here` rather than
to a guessed endpoint. The `preview` row is listed first because a disposable per-branch
environment is the one to prefer whenever the project has one.

| Name | URL / how to reach it | What it is for | Loop may WRITE data? | Loop may DEPLOY to it? | Loop may RESTART it? |
|------|----------------------|----------------|-----------------------|------------------------|----------------------|
| local | this working tree: `npx jest`, `bats <file>`, `pytest packages/router/tests`, and `node <lib> <cli args>` against `.claude/lib/` and `packages/core/lib/` | unit, library and prose checks; the default for every criterion that needs no model session | may write | n/a — it runs from the working tree | yes, freely |
| fixtures | a headless `claude --print --plugin-dir packages/full --setting-sources project --permission-mode bypassPermissions` session in a scaffolded fixture repo under `.trd-state/<feature>/evidence/live/work/slot-<n>` (pattern: `test/smoke/lib/project.sh`); also the existing design fixtures `.trd-state/design-stage/evidence/live/work/{react-web,react-native}` | proving command and prompt behaviour with a live model session; interactive skills may be driven through a Forge-spawned session, whose `AskUserQuestion` prompts Forge can answer | may write | n/a — the slot's `.claude/` is refreshed from `packages/full` | yes, freely |
| claude-artifacts | the Claude `Artifact` tool (the claude.ai artifact service): publish with `Artifact({ file_path, files, url })`, inspect with `action: "list"` / `"read"` | **always authorized**: proving anything this framework publishes — a report and its images, check pages, batching, one URL per feature. Publish a private throwaway page built from fixture content, never content holding a credential | may write | yes — publishing a private page is the exercise | n/a |
| github-live-test | https://github.com/islayjames/ship-build-live-test (private, default branch `main`), reached with the running OS user's `gh` login | proving `/ship-build` merge-order behaviour (custody gate, pr-head check, merge) on real GitHub | may write | yes — inside that repo only: merges and GitHub releases there; never `FortiumPartners/ensemble-vnext` `main`, its tags or the marketplace | n/a |
| production | the published plugin: `origin/main`, release tags (`v*`) and the marketplace manifests | — | **must not be touched** | **never** | **never** |

Permitted values for **Loop may WRITE data?**: `read-only`, `may write`, `must not be
touched`. *read-only* authorises exercise that mutates nothing — no records created, no rows
written; *may write* authorises exercise that does; *must not be touched* forbids the loop
from reaching that environment at all, including for reads.

**This column is a permission, not a capacity — how many of a thing may exist is §1a's
question, not this one.** A `must not be touched` environment and a count of `0` for the
resource behind it are the same prohibition seen from two sides; where a file states both and
they disagree, the stricter reading wins.

## 1a. Resource capacity — how many may exist at once

One row per resource the verification loop must not over-subscribe, stated as **how many may
exist at once**. A resource is not one-to-one with an environment: a rate-limited
third-party account can be shared by several environments, and one environment can hold a
simulator pool and a singular database at the same time — which is why this is a table of
resources, not another column on §1.

| Resource | How many may exist at once | Which environments need it | How the loop creates and destroys one |
|----------|-----------------------------|------------------------------|------------------------------------------|
| working tree | 1 | local | — (never created; it is this checkout) |
| headless fixture session | 4 | fixtures | create: `packages/core/scripts/scaffold-project.sh --plugin-dir packages/full .trd-state/<feature>/evidence/live/work/slot-<n>` (n = 1..4; slot n belongs to exercise slice n, so no two slices share a folder), then accept its folder-trust prompt once (start `claude` in it in tmux, Down then Enter, kill the session); destroy: `rm -rf` that slot folder |
| claude.ai artifact (private throwaway page) | 4 | claude-artifacts | `Artifact({ file_path, files })` creates one; the owner deletes leftovers — the loop never deletes an artifact |
| published plugin (origin/main, tags, marketplace) | 0 | production | — |
| github-live-test pull request (a branch and its PR in islayjames/ship-build-live-test) | 1 | github-live-test | create: push a branch to islayjames/ship-build-live-test and open a PR from it; destroy: close the PR and delete the branch |

The count is the only thing the framework reads here — never probed, never modelled, never
inferred from any other cell in this file. The rules, not suggestions:

- **`N`** — a **pool**. The loop may create and tear down up to N of them, using the command
  in the last column. At most one per exercise slice touches it, so at most N slices touch it
  at once.
- **`1`** — a **queue**. One holder at a time. The loop never creates one.
- **`0`** — **must not be touched.** Criteria needing it resolve `not verifiable here` and are
  exercised by nothing.
- **An environment with no row in this table counts as one resource of its own, with a count
  of `1`.** Silence is a queue, never a pool — an owner who describes an environment here and
  forgets its capacity gets today's serial behaviour, not four agents racing one dev server.
- **A blank create/destroy cell means the loop may not create one, whatever the count says.**
  A count of 4 with no command means "four already exist"; a count of 4 with a command means
  "make up to four".
- **When N already exist, say how parallel checks tell them apart.** The framework gives each
  exercise slice its share of the count, but it cannot know which of your four simulators is
  which — that is specific to your project. Name the instances, or state the rule a check
  uses to claim one (a device name per slot, a port per instance, a lock file), in the
  create/destroy cell or in `.claude/verification-notes.md`. Without it, every slice may
  attach to the same instance, and the count protects nothing.

## 2. Bringing the environment to the new code

**This is the row that makes the correction loop work.** After the loop's Debug stage edits
source, the next Exercise pass measures whatever is RUNNING. If nothing refreshed it, it
measures the old build, the gap cannot close, and the loop exits `stalled` — blaming the
debugger for a fix that in fact worked.

State two commands per environment: a **fast refresh** the loop runs after every Debug pass,
and a **full deploy** it runs once, at the end of the run, as a gate that fails loudly — not
a convention to trust. A failed full deploy is reported on the run's Outcome line and in the
command's issues; it does not retract criteria already proven against the running system,
because those were proven, and the rebuild is what failed.

| Environment | Fast refresh (per iteration) | Full deploy (end of run) | Roughly how long |
|-------------|-------------------------------|-----------------------------|---------------------|
| local | nothing — tests and libraries read the working tree | | — |
| fixtures | `packages/core/scripts/scaffold-project.sh --refresh --plugin-dir packages/full <slot folder>` (re-copies the slot's vendored `.claude/` from the edited plugin) | | about 2s per slot |

**Where no full deploy is declared, leave the cell blank rather than guessing one.** A blank
cell and a command that ran and failed are two different facts, and the report says which:
nothing declared reads as "no full-environment run declared," never as a pass.

**If an environment cannot be refreshed by the loop at all, say so here.** That is a
legitimate answer, and it is far better than silence: the loop then knows to verify once and
report, rather than iterating against a frozen target.

## 3. Test identities and credentials

**Record WHERE a credential lives, never its value.** This file is committed. A test
password written here is a leaked credential in git history.

| What | Where it lives | Notes |
|------|---------------|-------|
| Claude model access (headless fixture sessions) | the running OS user's Claude Code login (`claude auth status`; stored under that user's `~/.claude`) | each Forge spawn user has its own login |
| GitHub (PRs, CI status) | the running OS user's `gh` CLI login (`gh auth status`) | |
| test user | none — the framework has no app sign-in to test | |
| GitHub for the live test (islayjames/ship-build-live-test) | the running OS user's `gh` CLI login (`gh auth status`) | needs repo and workflow scopes and merge rights on that repo |

## 4. Verification tooling actually installed

Not what the stack could support — what is wired up and runnable today.

| Tool | Installed? | Config |
|------|-----------|--------|
| Jest | yes | `package.json` `jest` key; `npx jest` |
| BATS | yes (`/opt/homebrew/bin/bats`, devDependency `bats`) | `*.test.sh` under `packages/core/` and `test/integration/tests/` |
| pytest | yes | `pytest packages/router/tests` |
| ShellCheck, jq, gh | yes (`/opt/homebrew/bin`) | none |
| `claude` CLI, headless | yes | `test/smoke/lib/project.sh` (`smoke_claude`, `--permission-mode bypassPermissions`) |
| Forge (spawn and drive sessions, answer their `AskUserQuestion` prompts) | yes — `forge@forge` plugin and MCP server | for interactive skills such as `verification-setup` and `design-setup` |
| Playwright / browser automation | no — not used by the loop (only the design render CLI uses it) | |
| HTTP client for API checks | no — nothing here serves HTTP | |
| Claude `Artifact` tool (publish, list files, read) | yes — always available | none; pages are private to the owner on publish |

## 5. What CANNOT be verified here

**The most valuable section, and the one to fill in first.** An unverifiable capability that
is written down is a stated gap. The same capability unwritten is an invisible one, and the
report will show it as a pass.

- `claude --remote` sessions and failures that occur only on the GitHub Actions runner (for example `packages/core/lib/discovered.test.js` hangs there only): neither can be reproduced from this machine.

## 5a. Coverage floor

The share of the success definition's criteria that must be PROVEN (`met`) before a
verification run may report `satisfied`, `stalled` or `stuck`. Below it the run reports
`insufficient-coverage` instead. Write a percentage or `none`; `none` leaves the check off.
`/verification-setup` recommends a value from this project's past runs and says why.

Coverage floor: 50%

## 5b. Never unattended

Paths `/plan --implement` will never build without you watching — auth, payments,
migrations, secrets, deletion, anything where a wrong unattended change is expensive to
undo. Matched by **substring, not glob**: a fragment like `auth` covers any path containing
it, including `src/auth/`, `lib/authorize.ts` and `packages/auth-service/`.

Write one `- <fragment>` bullet per path, or list them on one line as `Paths: a, b`. The
default is `Paths: none` — no brake. A trailing note is allowed and ignored: text after
` — `, ` - ` or ` #` is cut off (`- auth — the login flow`).

The brake can only check what a TRD says it touches. A task with no grounding **Touches**
makes the check report `invalid` (naming the task) and stops the build, rather than passing
silently with nothing to match.

Paths: none

## 6. Multi-repo

When the system spans repositories, name them and say which holds what. A verifier that
resolves paths against the wrong tree reports gaps that do not exist.

| Repo | Path | Holds |
|------|------|-------|
| | | |
