# packages/full/hooks/

This directory ships the hook **files** (as symlinks into `packages/core/hooks/` and
`packages/router/hooks/`) that a scaffolded project copies into its own `.claude/hooks/`.

## Why `hooks.json` is `{"hooks": {}}`

This is deliberate, not an oversight — see `docs/TRD/runtime-refresh.md` §8 non-goal #2.

The plugin does **not** register any hooks for itself. Hook *registration* (which events
fire which hook, in what order, with what timeout/matcher) is owned exclusively by each
project's own `.claude/settings.json`. The registration block itself is produced at
**build time** by `packages/core/scripts/generate-hooks-artifacts.sh`, which regenerates
it from `packages/core/hooks/hooks.manifest.json` into the checked-in template at
`packages/core/templates/claude-directory/settings.json`. `scaffold-project.sh` only
copies that template verbatim into the project's `.claude/settings.json` at
scaffold/refresh time — it does not itself derive the hooks block from the manifest.

If `packages/full/hooks/hooks.json` also registered these hooks, every hook would fire
**twice** per event in any session that has both the plugin installed and a scaffolded
project runtime present — once via the plugin's own hook registration, once via the
project's `settings.json`. That double-fire is exactly what the two-layer architecture in
`.claude/rules/constitution.md` ("Plugin = Generator Layer, vendored runtime = Execution
Layer") exists to prevent.

Do not populate `hooks.json` with event registrations. If a new hook needs to ship, add it
to `hooks.manifest.json`, symlink the file into this directory, and let the manifest-driven
generators (`RUNTIME-B001`/`B002`/`B003`) update the scaffold copy list, the template
`settings.json`, and the `init-project.md` hook table — never this file.
