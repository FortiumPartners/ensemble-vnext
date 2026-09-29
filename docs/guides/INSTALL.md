# Installing Ensemble

This guide takes you from nothing to a project Ensemble can work in. For what the commands do
once you are set up, read [PROCESS.md](PROCESS.md).

---

## 1. What you're installing

Ensemble has two layers.

- **The plugin** is the generator. You install it once into Claude Code. It carries the
  templates, agents, commands, hooks and skill library. Two commands stay in the plugin
  because they create or refresh a project's runtime: `/init-project` and `/rebase-project`.
- **The runtime** is what the plugin copies into each project's `.claude/` directory. It holds
  the workflow commands, the 13 subagents, the hooks, the rules and the skills that project
  uses. **You commit it to git.**

```
plugin (installed once)  ──/init-project──▶  project/.claude/  (committed)
                         ──/rebase-project─▶  (refreshed when you choose)
```

Committing it is deliberate: the project behaves the same in a local CLI session and a web
session (which sees only the repo), each project stays pinned to its own runtime version, and
every framework change arrives as a diff you can review.

## 2. Prerequisites

| Need | Why |
|------|-----|
| Claude Code CLI, current | Runs everything |
| git | The runtime is committed, and `/rebase-project` relies on git as its undo |
| Node.js 18+ | Most hooks are JavaScript |
| Python 3 (`python3` on your PATH) | The prompt router hook, and the session-start refresh check |
| jq (optional) | Used by some helper scripts; they degrade without it |

## 3. Install the plugin

The plugin lives in the public repo `FortiumPartners/ensemble-vnext`. Its root defines a
marketplace called `ensemble-vnext`, which contains one plugin called `full`.

```bash
claude plugin marketplace add FortiumPartners/ensemble-vnext
claude plugin install full@ensemble-vnext
```

Inside Claude Code: `/plugin marketplace add FortiumPartners/ensemble-vnext`, then
`/plugin install full@ensemble-vnext`. Restart Claude Code afterwards. **Scope** defaults to
`user` (every project on this machine); `--scope project` records it in the repo for teammates.

**To update later:**

```bash
claude plugin marketplace update ensemble-vnext
claude plugin update full@ensemble-vnext     # restart Claude Code to apply
```

Then bring each project up to date ([section 7](#7-keeping-current)).

## 4. Initialize a project

From the project root, in Claude Code, run `/init-project`. It works on new and existing
codebases:

1. **Detects your stack** from manifests and config (languages, frameworks, test runners,
   infrastructure) and writes it to `.claude/rules/stack.md`.
2. **Asks a few questions** — project name and description, development methodology, test
   coverage targets, which changes need your approval, and how deeply features must be
   verified (unit tests only, against a running instance, end-to-end, or with your sign-off).
   `/init-project minimal` skips the questions and takes defaults.
3. **Writes the rest of your governance files** in `.claude/rules/`: `constitution.md` (your
   quality gates, approval rules and verification level) and `process.md` (the workflow).
4. **Vendors the runtime** into `.claude/`:
   - `agents/` — the 13 subagents
   - `commands/` — 17 workflow commands (`/init-project` and `/rebase-project` stay in the plugin)
   - `hooks/` plus hook registrations in `settings.json`
   - `rules/` — the framework rules (`async-discipline.md`, `autonomy.md`,
     `command-status.md`) and an unfilled `verification.md`
   - `skills/` — skills chosen for your stack, plus five that ship to every project: three
     verification checks (`verify-design-comparison`, `verify-flow-as-built`,
     `verify-data-fidelity`), `verify-plan-recovery`, and `verification-setup`
   - `workflows/`, `lib/`, `contracts/` — scripts and reference text the commands use
5. **Creates** `CLAUDE.md`, `docs/PRD/`, `docs/TRD/`, `.trd-state/` (where implementation
   progress is tracked), and adds local-only files (`.claude/settings.local.json`, `*.local.*`, `.env`, `.env.local`) to
   `.gitignore`.

If the directory already has a `.claude/` from something else, Ensemble adds to it rather
than replacing it. If it already has Ensemble, you are offered migration options instead.

Then commit:

```bash
git add .claude CLAUDE.md .trd-state docs .gitignore
git commit -m "chore: initialize Ensemble runtime"
```

## 5. Set up verification

After `/implement-trd` builds a feature, it checks the result against the running software,
not just the tests — this is on by default. To do that it needs to know how to reach a running
instance, and how to bring that instance up to date after it fixes something; otherwise it
keeps measuring the old build and reports it could not converge. `/init-project` ships
`.claude/rules/verification.md` unfilled. Run `/verification-setup` to fill it: it interviews
you one topic at a time, offering what it can detect from the repo as the default. Until you
do, checks that need a running instance are reported as "not verifiable here".

What the file records:

- **Environments** — local, preview, dev, staging, production: how to reach each, and whether
  the loop may write data to it, deploy to it, or restart it. An environment not listed is
  off-limits.
- **Resource counts** — how many of a thing (a simulator, a dev server, a shared database) may
  exist at once. `0` means never touch it; no entry means one at a time.
- **Refresh and full-deploy commands** — a fast refresh run after every fix, and a full deploy
  run once at the end.
- **Test credentials — where they live, never their values.** The file is committed.
- **Tooling installed, and what cannot be verified here** — a gap written down is reported as
  a gap; a gap left out reads as a pass.
- **Coverage floor** — the share of acceptance criteria that must actually be proven before a
  run may call itself satisfied. The command recommends a value from this project's past runs,
  or says it has none yet.

Running the command is your approval to write the file; there is no second confirmation.
Re-run it whenever environments, credentials locations or tooling change — it asks only about
what differs.

## 6. Who owns what

| Owned by you — the framework never overwrites these | Owned by the framework — refreshed on rebase |
|---|---|
| `.claude/rules/stack.md`, `constitution.md`, `process.md` | `.claude/agents/`, `commands/`, `hooks/`, `workflows/`, `lib/`, `contracts/` |
| `.claude/rules/verification.md` (changed only via `/verification-setup`) | `.claude/rules/async-discipline.md`, `autonomy.md`, `command-status.md` |
| `CLAUDE.md` (grows via `/update-project`, pruned via `/cleanup-project`) | Skills the plugin ships (yours are kept) |
| Settings values you have set | New default keys in `.claude/settings.json` |

## 7. Keeping current

After updating the plugin, run in each project, on a clean git tree:

```
/rebase-project            # or --dry-run to preview
```

It replaces every framework-owned file that differs from the plugin, adds new ones, removes
commands and agents the framework has retired, and recomputes plugin skills against your
`stack.md`. It writes no backup copies: git is the undo, which is why it refuses to run with
uncommitted changes under `.claude/`, or outside a git repo, unless you pass `--force`
(which discards those changes). Review with `git diff`, then commit.

It never touches anything in the left column of [section 6](#6-who-owns-what), nor skills,
agents or hooks you added yourself. `--preserve-all` narrows it to commands, hooks,
`workflows/`, `lib/` and `contracts/`: agents, skills and rules stay as they are and settings
only gain new keys. It exists for heavily customized projects.

**Between rebases,** a session-start hook refreshes the framework files a project already has
whenever the installed plugin is newer, leaving the changes uncommitted for you to review. It
never adds or removes anything — that stays `/rebase-project`'s job — and it skips while an
implementation is in progress. Set `ENSEMBLE_RUNTIME_REFRESH_DISABLE=1` to turn it off.

## 8. Settings worth knowing

- **Documents are published as private claude.ai pages by default.** PRDs, TRDs and
  verification reports get a link you can open and later share. To turn it off, set this in
  `.claude/settings.json` — no upgrade will turn it back on:
  ```json
  { "ensemble": { "publishArtifacts": false } }
  ```
- **A stop-time guard** checks each turn's final message for false "I'll let you know when
  it's done" claims and for needless "shall I continue?" pauses, and sends the turn back once
  if it finds one. The details are in your project's `.claude/rules/async-discipline.md`.

## 9. Check it works

```bash
ls .claude/agents/*.md | wc -l        # 13
ls .claude/commands/*.md | wc -l      # 17
jq .ensemble.version .claude/settings.json   # the plugin version you installed (needs jq)
```

For a full check, run the plugin's validator against the project:

```bash
"$(jq -r '.plugins["full@ensemble-vnext"][0].installPath' ~/.claude/plugins/installed_plugins.json)/scripts/validate-init.sh" .
```

Then try a small real task: `/plan <one small change you actually want>`. It should size the
work and write a plan to `docs/TRD/`.

**If something is off:**

- **Commands don't appear after installing or updating** — restart Claude Code. Plugin
  changes apply on restart.
- **Hooks error on every prompt** — `node` or `python3` is not on the PATH Claude Code sees.
- **`/rebase-project` refuses to start** — you have uncommitted changes under `.claude/`
  (perhaps from the session-start refresh). Review and commit them, or stash them.
- **The CLI shows `Stop hook error:` with a reason** — that is the stop-time guard sending a
  turn back, displayed by Claude Code as an error. Nothing is misconfigured.
- **Verification reports criteria "not verifiable here", or stalls** — `verification.md` is
  unfilled or has no refresh command for the environment. Run `/verification-setup`.

## 10. Running from source (contributors)

```bash
git clone https://github.com/FortiumPartners/ensemble-vnext.git
claude plugin marketplace add ./ensemble-vnext
claude plugin install full@ensemble-vnext
```

The local directory registers under the same marketplace name, `ensemble-vnext`, as the GitHub
one, so remove one before adding the other (`claude plugin marketplace remove ensemble-vnext`).
For one-off testing without installing, `claude --plugin-dir ./ensemble-vnext/packages/full`
loads the plugin for that session only.
