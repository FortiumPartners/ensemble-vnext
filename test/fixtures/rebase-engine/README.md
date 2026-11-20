# Rebase-engine fixtures

`older/` holds files as the `v4.10.0` release installed them (its own scaffold, rendered
with the `jest` skill selected): `commands/plan.md`, `agents/backend-implementer.md` and
`stop-prompt.txt`, the exact decoded `prompt` string of that release's Stop hook (no
trailing newline added). Each differs from today's plugin. They stand in for "an older
shipped version" so no test needs git history at runtime (CI checks out shallow).
`packages/core/templates/shipped-hashes.json` lists their hashes; `rebase-engine.test.sh`
asserts it, and `generate-shipped-hashes.sh --append v4.10.0` re-renders the tag to prove
they are what that tag installs.

`older/rules/autonomy.md` is the exact bytes `v4.10.0` shipped for that rule (blob c37d1f9). The
smoke scenario `rebase-old-tree` plants it so the engine sees a known older shipped version
and replaces it deterministically, rather than reading a hand-written file as an owner edit.
