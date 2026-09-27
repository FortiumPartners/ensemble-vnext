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
to a guessed endpoint.

| Name | URL / how to reach it | What it is for | Loop may DEPLOY to it? | Loop may RESTART it? |
|------|----------------------|----------------|------------------------|----------------------|
| local | `http://localhost:3000` (`npm run dev`) | day-to-day functional verification | n/a — it runs from the working tree | yes, freely |
| dev | | shared integration checks | | |
| staging | | pre-release only | **no** | **no** |
| production | | — | **never** | **never** |

## 2. Bringing the environment to the new code

**This is the row that makes the correction loop work.** After the loop's Debug stage edits
source, the next Exercise pass measures whatever is RUNNING. If nothing refreshed it, it
measures the old build, the gap cannot close, and the loop exits `stalled` — blaming the
debugger for a fix that in fact worked.

State the command for each environment the loop is allowed to refresh:

| Environment | Refresh command | Roughly how long |
|-------------|-----------------|------------------|
| local | e.g. hot reload — nothing to run | — |
| dev | e.g. `railway up`, `vercel deploy`, `docker compose up -d --build` | |

**If an environment cannot be refreshed by the loop, say so here.** That is a legitimate
answer, and it is far better than silence: the loop then knows to verify once and report,
rather than iterating against a frozen target.

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
