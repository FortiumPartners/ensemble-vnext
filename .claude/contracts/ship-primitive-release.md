---
primitive: release
params: env=, command=, identity=
results: released
outward: yes
needs: head
section: ship
---

# Primitive: release

Runs the project's release or deploy command and proves the environment now runs the verified
commit (D11, D23). A release is never fixed here.

## Input

`env`, `command`, `identity` (all default none), `work`, `context`.

## Do

1. **Resolve the command; never guess (D23, AC-F4.6).** `verification.md` section 2 first, then
   `ship.md`'s `command=`, then nothing:
   - **With `env=`:** run the snippet below with that name. A command there is the one to run.
     None there (a blank cell, or no such environment in section 2): use `command=` when the
     step sets one. A `command=` beside `env=` is this fallback, never ignored.
   - **With no `env=`:** use `command=` when the step sets one; otherwise run the snippet with
     an empty name, which returns the command only when exactly one environment declares one.
   ```bash
   node -e 'const f=require("./.claude/lib/functional-verification");const e=process.argv[1]||null;console.log(JSON.stringify(f.readFullDeploy(require("fs").readFileSync(".claude/rules/verification.md","utf8"),e)))' "<env or empty>"
   ```
   Neither source gives a command: return `stop` with the snippet's `reason` and say no
   `command=` is set either: no command is guessed. Record which source supplied it
   (`verification.md` or `ship.md`) in `data.source`.
2. Run the command as written. A non-zero exit returns `stop` with its output; do not fix it,
   retry it or run a different command (AC-F5.2).
3. Run the `identity=` command and capture its output. No `identity=` returns `stop`: the deploy
   link cannot pass without one.
4. Prove the deploy link:
   ```bash
   node .claude/lib/custody.js check --state-dir <work.stateDir> --link deploy \
     --identity-output "<captured output>" --trd <work.trd|none>
   ```
   `ok: false` returns `stop` with the reason. A `check` with no anchor fails; do not set one.

## Result

`released`, with `data`: `{ commit, env, command, source }` where `commit` is the commit the
identity output resolved to.

## Waiting

The release command is synchronous.
