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

1. **Resolve the command; never guess (D23).** With `env=`, read that environment's full-deploy
   cell; with none, use `command=`, else the only environment that declares one:
   ```bash
   node -e 'const f=require("./.claude/lib/functional-verification");const e=process.argv[1]||null;console.log(JSON.stringify(f.readFullDeploy(require("fs").readFileSync(".claude/rules/verification.md","utf8"),e)))' "<env or empty>"
   ```
   With `env=` and a `command=` both set, `env=` wins. `{command: null, reason}` returns `stop`
   with the reason: no command is guessed.
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

`released`, with `data`: `{ commit, env, command }` where `commit` is the commit the identity
output resolved to.

## Waiting

The release command is synchronous.
