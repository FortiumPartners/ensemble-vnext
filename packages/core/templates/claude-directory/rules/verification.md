# Verification environments

**Owner-governed, like `stack.md`. An agent READS this and never writes it.**

`stack.md` is a declarative inventory — languages, frameworks, hosting. It says nothing
about how to REACH a running instance, and that is exactly what a functional verifier needs.
This file is that missing half, and it is the difference between a verification loop that
can correct itself and one that reports `stalled` because it was measuring a build nobody
refreshed.

**Why the owner writes it and not an agent:** which instance is safe to exercise, whether a
deploy is allowed, where credentials live — these are infrastructure policy, not
observations. An agent inferring them from a codebase is guessing at your rules.

---

## 1. Environments

One row per environment the verifier may encounter. **An environment that is not listed is
not authorized** (S-2), and criteria needing it resolve to `not verifiable here` rather than
to a guessed endpoint. The `preview` row is listed first because a disposable per-branch
environment is the one to prefer whenever the project has one.

| Name | URL / how to reach it | What it is for | Loop may WRITE data? | Loop may DEPLOY to it? | Loop may RESTART it? |
|------|----------------------|----------------|-----------------------|------------------------|----------------------|
| preview | | per-branch, disposable — **prefer this** | may write | n/a — deploys automatically per branch | yes, freely |
| local | `http://localhost:3000` (`npm run dev`) | day-to-day functional verification | may write | n/a — it runs from the working tree | yes, freely |
| dev | | shared integration checks | may write | | |
| staging | | pre-release only | read-only | **no** | **no** |
| production | | — | **must not be touched** | **never** | **never** |

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
| e.g. iOS simulator | 4 | local | `xcrun simctl create … / xcrun simctl delete …` |
| e.g. dev server on :3000 | 1 | local | — (never created; it is already up) |
| e.g. shared Supabase project | 1 | dev | — |
| production database | 0 | production | — |

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
| preview | | | |
| local | e.g. hot reload — nothing to run | | — |
| dev | e.g. `railway up`, `vercel deploy`, `docker compose up -d --build` | | |

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
| test user | e.g. `1Password → "Acme dev login"`, `.env.local` key `TEST_USER` | |

## 4. Verification tooling actually installed

Not what the stack could support — what is wired up and runnable today.

| Tool | Installed? | Config |
|------|-----------|--------|
| Playwright / browser automation | | |
| HTTP client for API checks | | |

## 5. What CANNOT be verified here

**The most valuable section, and the one to fill in first.** An unverifiable capability that
is written down is a stated gap. The same capability unwritten is an invisible one, and the
report will show it as a pass.

- e.g. "Salesforce close flows — the sandbox token expires weekly and re-auth is manual."
- e.g. "Email delivery — no inbox we can read from in dev."

## 6. Multi-repo

When the system spans repositories, name them and say which holds what. A verifier that
resolves paths against the wrong tree reports gaps that do not exist.

| Repo | Path | Holds |
|------|------|-------|
| | | |
