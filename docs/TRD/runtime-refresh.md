# Technical Requirements Document: Runtime Refresh & Delivery Coherence

**Document Version**: 1.0.0
**Status**: Draft
**Created**: 2026-08-11
**Updated**: 2026-08-11
**Author**: Technical Architecture
**Source PRD**: None — derived from the Claude Code / Sunstone comparison review (2026-08-10/11)
**Task ID Prefix**: RUNTIME

**Stakeholders**:
- Framework maintainer (implementation)
- Consumers of `/init-project` (affected by the delivery bug)

---

## 1. Overview

### 1.1 Technical Summary

Three defects share one root cause: `packages/` is the source of truth, but the paths that
carry it to a consumer project are hand-maintained and have fallen behind, while the dogfood
copy in this repo is kept current by daily use. This TRD closes the gap in both directions —
it fixes what ships today, and it makes the vendored runtime refresh itself from the installed
plugin so the gap cannot reopen.

The three defects:

1. **The plugin registers the entire 61-skill library** (`plugin.json` → `"skills": "./skills"`),
   which globally defeats `/init-project`'s curation. Measured by `claude plugin details` at
   **~12,366 tokens added to every session**, on every project on the machine.
2. **Five hook files never shipped.** `scaffold-project.sh` copies from a hardcoded seven-entry
   array and `packages/full/hooks/` lacks symlinks for `async-discipline.js`,
   `autonomy-discipline.js`, `precompact.js`, `session-context.js`, and `notify-complete.sh`.
   A project scaffolded today receives none of the 3.3.9–3.3.12 work.
3. **No version stamp.** `.claude/settings.json` has no `ensemble.version`, so
   `/rebase-project`'s version detection always falls through to "unknown → full sync," and
   no automated refresh is possible.

### 1.2 Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Refresh trigger | SessionStart hook | Fires without user action; the only automatic hook point before work begins |
| Refresh scope | Components **already present** in `.claude/` | Cannot un-curate or add surprise components; makes automatic application safe |
| Add / remove components | `/rebase-project` only | Selection is a judgment call; refresh is mechanical |
| Version gate | Monotonic — write only when plugin > vendored | Prevents ping-pong rewrites between teammates on different plugin versions |
| Plugin `hooks.json` | **Stays empty** | Hooks are registered by the project's `settings.json`. Plugin registration would double-fire every hook |
| Skill library delivery | Ships as `skills-lib/`, unregistered | Library still auto-updates with the plugin; nothing enters context until selected |
| Hook inventory | Single `hooks.manifest.json` | One declaration generates the copy list, the template settings block, and the docs table |

### 1.3 Integration Points

| Component | Interaction |
|-----------|-------------|
| `packages/full/.claude-plugin/plugin.json` | Stops declaring `skills`; keeps `agents`, `commands` |
| `packages/core/scripts/scaffold-project.sh` | Gains `--refresh`; hook list becomes manifest-driven |
| `packages/core/templates/claude-directory/settings.json` | Hook block generated from manifest; gains `ensemble.version` |
| `.claude/hooks/runtime-refresh.sh` | New SessionStart hook (thin wrapper over the scaffold script) |
| `.claude/commands/rebase-project.md` | Version detection starts working once the stamp exists |
| `.claude/rules/constitution.md` | Governance table corrected to describe hooks that actually run |

---

## 2. System Architecture

### 2.1 Refresh flow

```
SessionStart
   │
   ├─ runtime-refresh.sh
   │     ├─ Guard 1: plugin installed?            no → exit 0 silent
   │     ├─ Guard 2: this repo IS the plugin?     yes → exit 0 silent
   │     ├─ Guard 3: task in_progress?            yes → exit 0 with notice
   │     ├─ Compare installed version vs .claude/settings.json ensemble.version
   │     │     equal or older → exit 0 silent  (~10ms short-circuit)
   │     │     newer          → continue
   │     ├─ scaffold-project.sh --refresh --plugin-dir <installPath> .
   │     ├─ Stamp new ensemble.version
   │     └─ emit additionalContext summary
   │
   └─ session-context.js  (existing, unchanged)
```

### 2.2 Refresh semantics

`--refresh` iterates the components already present under `.claude/` and replaces each from the
plugin. It never creates a component that is absent and never deletes one that the plugin no
longer carries.

| Component | Refreshed | Notes |
|-----------|-----------|-------|
| `.claude/commands/*.md` | Yes, per-file | Only files that already exist |
| `.claude/agents/*.md` | Yes, per-file | Only files that already exist |
| `.claude/hooks/*` | Yes, per-file | Only files that already exist |
| `.claude/skills/<name>/` | Yes, per-directory | Only skills already selected |
| `.claude/rules/*.md` | Framework rules only | `constitution.md`, `stack.md`, `process.md` are project-authored — never touched |
| `.claude/settings.json` | `ensemble.version` only | Permissions, env, and hook registrations are user-owned |
| `.trd-state/` | Never | Runtime state |

### 2.3 Hook manifest

`packages/core/hooks/hooks.manifest.json` becomes the single declaration. Every hook file has
exactly one entry, including the ones that are deliberately not registered.

```json
{
  "hooks": [
    { "file": "permitter/permitter.js", "event": "PermissionRequest", "timeout": 5,
      "source": "packages/permitter/hooks/permitter.js" },
    { "file": "router.py", "event": "UserPromptSubmit", "timeout": 10,
      "source": "packages/router/hooks/router.py" },
    { "file": "formatter.sh", "event": "PostToolUse", "matcher": "Edit|Write|MultiEdit", "timeout": 30 },
    { "file": "status.js", "event": "SubagentStop", "timeout": 5 },
    { "file": "async-discipline.js", "event": "Stop", "order": 1, "timeout": 5 },
    { "file": "autonomy-discipline.js", "event": "Stop", "order": 2, "timeout": 5 },
    { "file": "wiggum.js", "event": "Stop", "order": 3, "timeout": 10 },
    { "file": "notify.sh", "event": "Stop", "order": 4, "timeout": 60 },
    { "file": "session-context.js", "event": "SessionStart", "order": 1, "timeout": 5 },
    { "file": "runtime-refresh.sh", "event": "SessionStart", "order": 2, "timeout": 10 },
    { "file": "precompact.js", "event": "PreCompact", "timeout": 5 },
    { "file": "notify-complete.sh", "registration": "model-invoked" },
    { "file": "learning.sh", "registration": "none", "note": "Retained for /update-project; not auto-registered" },
    { "file": "save-remote-logs.js", "registration": "none", "note": "Opt-in via ENSEMBLE_SAVE_REMOTE_LOGS" }
  ]
}
```

Three consumers are generated from it: the scaffold copy list, the template `settings.json`
hook block, and the hook table in `init-project.md`.

---

## 3. Technical Specifications

### 3.1 `runtime-refresh.sh`

**Input**: SessionStart hook JSON on stdin (`cwd`, `session_id`).
**Output**: `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "..."}}`.
**Exit**: always 0. Never blocks session start.

| Env var | Default | Effect |
|---------|---------|--------|
| `ENSEMBLE_RUNTIME_REFRESH_DISABLE` | `0` | `1` skips entirely |
| `ENSEMBLE_RUNTIME_REFRESH_DEBUG` | `0` | `1` logs decisions to stderr |

**Plugin discovery**: read `~/.claude/plugins/installed_plugins.json`, select the
`full@ensemble-vnext` entry, take `installPath` and `version`. `$CLAUDE_PLUGIN_ROOT` is **not**
available — this hook is project-scoped, not plugin-scoped.

**Guards**, evaluated in order:

1. **Plugin absent** — no `installed_plugins.json`, no matching entry, or `installPath` missing
   from disk → exit silently. CI and fresh clones hit this constantly.
2. **Self-repo** — `packages/full/.claude-plugin/plugin.json` exists under `$PWD`, or `$PWD`
   equals the marketplace `source.path`. The marketplace is a `directory` source pointing at this
   repository, so without this guard a stale plugin cache would overwrite live source edits.
3. **In-flight work** — `.trd-state/*/implement.json` contains a task with status `in_progress`.
   Emit a one-line notice and skip; a command's prose changing mid-loop is the nondeterminism the
   framework exists to prevent.
4. **Version** — `semver(plugin) > semver(vendored)`. Equal, older, or unparseable → exit silently.

**Summary message** on a successful refresh:

```
ENSEMBLE runtime refreshed 3.3.10 → 3.3.12 — 4 commands, 2 hooks, 1 skill updated.
Changes take effect in the NEXT session (this session's components were already loaded).
```

### 3.2 `scaffold-project.sh --refresh`

Reuses the existing `copy_*` functions with a present-only filter. Mutually exclusive with
`--force`. Implies neither `--copy-skills` nor directory creation.

```bash
scaffold-project.sh --refresh --plugin-dir <path> <target>
```

Prints a machine-readable tally on the last line for the hook to parse:

```
REFRESH_SUMMARY commands=4 agents=0 hooks=2 skills=1
```

### 3.3 Version stamp

```json
"ensemble": {
  "version": "3.3.12",
  "refreshed_at": "2026-08-11T14:22:03Z",
  "agents_dir": ".claude/agents"
}
```

Written by `scaffold-project.sh` on initial scaffold and on every successful `--refresh`.

---

## 4. Master Task List

### 4.1 Curation Fix

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| RUNTIME-P001 | Remove skill registration | Delete `"skills": "./skills"` from `packages/full/.claude-plugin/plugin.json` | None | backend-implementer |
| RUNTIME-P002 | Remove skills symlink | Delete `packages/full/skills`; retain `packages/full/skills-lib -> ../skills` | RUNTIME-P001 | backend-implementer |
| RUNTIME-P003 | Repoint scaffold skill source | `copy_skills()` reads from `$PLUGIN_DIR/skills-lib`, falling back to `$PLUGIN_DIR/skills` for older installs | RUNTIME-P002 | backend-implementer |
| RUNTIME-P004 | Verify token reduction | `claude plugin details full@ensemble-vnext` reports Skills (2) and always-on cost under 500 tok | RUNTIME-P003 | verify-app |

### 4.2 Delivery Fix

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| RUNTIME-P005 | Author hook manifest | Create `packages/core/hooks/hooks.manifest.json` per §2.3, one entry per hook file | None | backend-implementer |
| RUNTIME-P006 | Add missing hook symlinks | Symlink `async-discipline.js`, `autonomy-discipline.js`, `precompact.js`, `session-context.js`, `notify-complete.sh` into `packages/full/hooks/` | RUNTIME-P005 | backend-implementer |
| RUNTIME-B001 | Manifest-drive the copy list | Replace the hardcoded `hooks_to_copy` array in `scaffold-project.sh:272` with a manifest read | RUNTIME-P005 | backend-implementer |
| RUNTIME-B002 | Generate template settings hooks | Emit the template `settings.json` hook block from the manifest, preserving event order | RUNTIME-P005 | backend-implementer |
| RUNTIME-B003 | Generate init-project hook table | Regenerate the enumeration at `init-project.md:547` from the manifest; currently says "9 total" and omits `autonomy-discipline` | RUNTIME-P005 | backend-implementer |
| RUNTIME-P007 | Confirm plugin hooks.json stays empty | Assert `packages/full/hooks/hooks.json` is `{"hooks": {}}` with a comment explaining that project settings own registration | RUNTIME-P005 | backend-implementer |

### 4.3 Versioning

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| RUNTIME-B004 | Stamp version on scaffold | Write `ensemble.version` and `ensemble.refreshed_at` into the target `settings.json` | None | backend-implementer |
| RUNTIME-B005 | Reconcile manifests | Align `package.json`, `.claude-plugin/marketplace.json`, and `packages/full/.claude-plugin/plugin.json` on one version | None | backend-implementer |
| RUNTIME-B006 | Add version-sync check | Script asserting all manifests agree; wire into CI | RUNTIME-B005 | cicd-specialist |

### 4.4 Refresh Mechanism

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| RUNTIME-B007 | Implement `--refresh` flag | Argument parsing, mutual exclusion with `--force` | RUNTIME-B001 | backend-implementer |
| RUNTIME-B008 | Present-only filter | Each `copy_*` function skips components absent from the target | RUNTIME-B007 | backend-implementer |
| RUNTIME-B009 | Protect authored rules | `constitution.md`, `stack.md`, `process.md` excluded from refresh | RUNTIME-B008 | backend-implementer |
| RUNTIME-B010 | Emit refresh tally | Print `REFRESH_SUMMARY commands=N agents=N hooks=N skills=N` as the final line | RUNTIME-B008 | backend-implementer |
| RUNTIME-B011 | Create `runtime-refresh.sh` | New SessionStart hook per §3.1 | RUNTIME-B010, RUNTIME-B004 | backend-implementer |
| RUNTIME-B012 | Implement plugin discovery | Resolve `installPath`/`version` from `installed_plugins.json` | RUNTIME-B011 | backend-implementer |
| RUNTIME-B013 | Implement four guards | Plugin-absent, self-repo, in-flight, monotonic version | RUNTIME-B012 | backend-implementer |
| RUNTIME-B014 | Implement summary emission | `additionalContext` including the next-session caveat | RUNTIME-B010, RUNTIME-B013 | backend-implementer |
| RUNTIME-B015 | Register the hook | Add to SessionStart in the manifest, template, and dogfood settings | RUNTIME-B014, RUNTIME-B002 | backend-implementer |

### 4.5 Corrections

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| RUNTIME-D001 | Fix governance table | `constitution.md:70` claims a SessionEnd hook maintains CLAUDE.md; none is registered. Correct the row to describe the real mechanism | None | backend-implementer |
| RUNTIME-D002 | Vendor missing command | Copy `augment-trd-figma.md` from `packages/core/commands/` into `.claude/commands/` | None | backend-implementer |
| RUNTIME-D003 | Document the refresh model | Add a section to `docs/guides/ARCHITECTURE.md` covering the refresh/rebase split and the next-session caveat | RUNTIME-B014 | backend-implementer |
| RUNTIME-D004 | Inject per-project skill preloads | `/init-project` Step 5 should write each agent's `skills:` frontmatter from the project's own `selected-skills.txt`, restoring the startup preload that RUNTIME-T009 removed — this time correct per project. See §9. | RUNTIME-T009 | backend-implementer |

### 4.6 Testing

| ID | Task | Description | Dependencies | Assignee |
|----|------|-------------|--------------|----------|
| RUNTIME-T001 | Extend scaffold BATS suite | Add `--refresh` cases to `scaffold-project.test.sh` | RUNTIME-B008 | verify-app |
| RUNTIME-T002 | Test present-only semantics | Absent component stays absent; present component is replaced | RUNTIME-T001 | verify-app |
| RUNTIME-T003 | Test authored-rule protection | A modified `constitution.md` survives a refresh byte-identical | RUNTIME-T001 | verify-app |
| RUNTIME-T004 | Create hook test file | `packages/core/hooks/runtime-refresh.test.sh` with BATS setup | RUNTIME-B011 | verify-app |
| RUNTIME-T005 | Test all four guards | Each guard exits 0 and writes nothing | RUNTIME-T004, RUNTIME-B013 | verify-app |
| RUNTIME-T006 | Test monotonic gate | Older plugin against newer vendored tree makes no writes | RUNTIME-T004 | verify-app |
| RUNTIME-T007 | Test manifest consumers | Generated copy list, template settings, and docs table all match the manifest | RUNTIME-B003 | verify-app |
| RUNTIME-T008 | End-to-end scaffold parity | A freshly scaffolded project receives the same 10 registered hooks this repo runs | RUNTIME-B002, RUNTIME-P006 | verify-app |

---

## 5. Execution Plan

### 5.1 Phase 1 — Curation and versioning (parallel-safe)

`RUNTIME-P001` → `P002` → `P003` → `P004`, alongside `RUNTIME-B004`, `B005`, `B006`,
`D001`, `D002`.

Independent of everything downstream and delivers the ~12.4k token/turn reduction on its own.
Ship it before starting Phase 2.

### 5.2 Phase 2 — Manifest and delivery

`RUNTIME-P005` → `P006`, `B001`, `B002`, `B003`, `P007` → `T007`, `T008`.

Fixes the shipping bug. `T008` is the gate: scaffold a throwaway project and count the hooks.

### 5.3 Phase 3 — Refresh mechanism

`RUNTIME-B007` → `B008` → `B009`/`B010` → `B011` → `B012` → `B013` → `B014` → `B015`,
with `T001`–`T006` tracking.

### 5.4 Phase 4 — Documentation

`RUNTIME-D003`.

### 5.5 Critical path

`P005 → B001 → B007 → B008 → B010 → B011 → B012 → B013 → B014 → B015`

### 5.6 Parallelization

Phase 1 is fully parallel with itself and blocks nothing. `T001`–`T006` run concurrently with
their implementation tasks. `D001`, `D002` can land at any point.

---

## 6. Quality Requirements

- BATS coverage for every guard and for `--refresh` present-only semantics
- `claude plugin details` reports always-on cost under 500 tokens after Phase 1
- A scaffolded project and this repo register an identical hook set after Phase 2
- No refresh path writes to `constitution.md`, `stack.md`, `process.md`, or `.trd-state/`
- `runtime-refresh.sh` exits 0 on every path, including malformed JSON and a missing plugin
- Short-circuit (version match) completes in under 100ms

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Refresh applies a session late** — Claude Code loads `.claude/` before or during SessionStart hooks, so updated commands may not take effect until the next session | High | Medium | Verify empirically first (see below). State it in the summary message. Behaviour is still correct, just eventually consistent |
| Git churn on shared repos | Medium | Medium | Monotonic version gate; older plugin never overwrites a newer tree |
| Stale cache overwrites live source in this repo | High without guard | High | Self-repo guard (RUNTIME-B013) |
| SessionStart budget exceeded | Low | Low | Version short-circuit before any filesystem walk; 10s timeout |
| Partial copy leaves a mixed runtime | Low | Medium | Stamp the version only after all copies succeed; git restores on failure |
| Older installs lack `skills-lib` | Medium | Low | Fallback to `skills` in `copy_skills()` (RUNTIME-P003) |

**Verify before building Phase 3.** Add a marker line to a vendored command, bump the plugin
version, start a session, and check whether the refreshed text is visible to that same session
or only the next one. If it is same-session, drop the caveat from the summary message. If it is
next-session, the design is unchanged but the message must say so — silently applying a change
that appears to have no effect is worse than a one-session lag the user knows about.

#### Result: next-session (resolved 2026-08-11)

Run in an isolated project with a `SessionStart` hook that rewrites
`.claude/commands/loadprobe.md`, flipping its frontmatter `description` from `MARKERBEFORE`
to `MARKERAFTER`:

| Session | Hook fired | File on disk after | Description the session reported |
|---------|-----------|--------------------|----------------------------------|
| 1 | yes | `MARKERAFTER` | **`MARKERBEFORE`** |
| 2 | yes | `MARKERAFTER` | `MARKERAFTER` |

Claude Code loads `.claude/` **before** `SessionStart` hooks run. The refresh is therefore
eventually consistent with a lag of exactly one session — not a race, and stable.

Consequences for the build:

- **RUNTIME-B014 keeps the caveat.** The "Changes take effect in the NEXT session" line in
  §3.1's summary message is required, not optional.
- The design in §2.1 is otherwise unchanged.
- The in-flight guard (§3.1 guard 3) matters less than assumed for mid-loop prose changes —
  a running session already holds its loaded copy — but is still correct: it prevents the
  *next* session of a multi-session `/implement-trd` loop from picking up different command
  text mid-feature. Keep it.

---

## 8. Non-Goals

- Moving commands, hooks, or agents into the plugin as registered components. The vendored
  runtime remains the executable truth; the plugin is a delivery mechanism.
- Populating `packages/full/hooks/hooks.json`. Project `settings.json` owns hook registration;
  plugin registration would double-fire every hook.
- Adding or removing components automatically. That remains `/rebase-project`.
- Refreshing `constitution.md`, `stack.md`, or `process.md`. Project-authored.
- Extracting `/rebase-project`'s 962 lines of prose into a script. Related and worth doing,
  but separate work.

---

## 9. Per-project skill preloads (RUNTIME-D004) — implemented

RUNTIME-P001 removed the plugin's global skill registration, which exposed a latent
defect: all 13 shipped agents carried a hardcoded `skills:` frontmatter pool, and those
names resolved only *because* the whole library was registered globally.

### What was actually happening

`/init-project` did resolve those pools correctly in practice — a real run produced
`verify-app: jest, smoke-test-runner, smoke-test-api`, exactly the intersection of its
13-entry pool with that project's 4 selected skills. But **nothing instructed it to.**
Step 5 said only "preserve the existing frontmatter structure (name, description, model,
color, skills)". The pruning was emergent model judgment, so an equally valid run would
have preserved the pool verbatim and produced preloads naming skills the project never
selected. This repo's own dogfood copy is the proof: never pruned, all 13 broken.

The defect was therefore never "preloads are wrong" — it was **"resolution is
nondeterministic."**

### Measured behaviour

| Question | Answer |
|---|---|
| Does a nonexistent skill fail the spawn? | No — spawn succeeds |
| Any error / warning? | None; the entry is silently dropped |
| Does `skills:` preload content for skills that exist? | **Yes** — a marker token reached the agent's context with zero tool uses |
| Do `Agent({team_name})` teammates get the preload? | **No** — teammates read skills from the project instead |

### Design

Two channels, because the two spawn styles consume different things:

1. **`skills:` frontmatter** — a genuine preload, reaches subagents.
2. **A managed body block** delimited by `<!-- ENSEMBLE:SKILLS:BEGIN/END -->` — reaches
   teammates, who never see the frontmatter preload. Names the agent's most relevant
   skills with one-line descriptions, then explicitly lists the remaining installed
   skills as still available and states the list is not a restriction.

Both are produced by `inject_agent_skills()` in `scaffold-project.sh` from a single
declaration, `packages/core/agents/skill-affinity.json` — mirroring the
`hooks.manifest.json` decision in §2.3. The manifest holds **candidate pools**, not
preloads; the script intersects each pool with the project's `selected-skills.txt`.

Deliberately a script and not prompt prose, for two reasons:

- Determinism. A set intersection is not a judgment call, and the constitution puts
  deterministic work in scripts. Skill *selection* remains an LLM task; resolving the
  pool against it is not.
- **Refresh survival.** §2.2 has `--refresh` re-copying `.claude/agents/*.md` from the
  plugin. Anything `/init-project` injected into those files would be wiped on the next
  refresh. Injection must live in the path refresh itself runs.

### Verification

The deterministic output is **byte-identical** to what `/init-project`'s model produced
in the earlier real run, across all 13 agents — same result, now guaranteed. A Rails
project (`rails`, `rspec`, `developing-with-react`, `managing-railway`) resolves
correctly, which is the case that was always broken. Idempotent across repeated runs;
changing the selection re-derives rather than accumulates. 11 BATS cases
(`scaffold-project.test.sh` 42 → 53).

## Appendices

### A. Evidence

| Claim | Source |
|-------|--------|
| Library registered globally, ~12,366 tok always-on | `claude plugin details full@ensemble-vnext`, run from `/tmp` |
| Plugin installed at user scope, v3.3.10, commit `a87097a` | `~/.claude/plugins/installed_plugins.json` |
| Marketplace is a `directory` source pointing at this repo | `~/.claude/plugins/known_marketplaces.json` |
| Scaffold copies seven hardcoded hooks | `packages/core/scripts/scaffold-project.sh:272` |
| Five hook files absent from the plugin | `comm` of `packages/core/hooks` against `packages/full/hooks` |
| Template settings registers `SessionEnd`, omits both discipline hooks | `diff templates/claude-directory/settings.json .claude/settings.json` |
| No `ensemble.version` field exists | `.claude/settings.json` |
| `/rebase-project` expects that field | `rebase-project.md:118` |

### B. Resolved: `Agents (0)` is accurate (2026-08-11)

`claude plugin details` reports `Agents (0)` while sessions list `ensemble-vnext:`-namespaced
agents and all 13 declared paths resolve. The CLI is **not** under-reporting.

Evidence — a fresh headless session run from `~` (a directory with no `.claude/agents/` and
outside this repo) asked to name every available `ensemble-vnext:`-prefixed subagent replied
`NONE`. The plugin's array-of-files `agents` declaration does not register agents for
consumer projects.

The namespaced agents visible inside *this* repo are an artifact of the marketplace being a
`directory` source whose `installLocation` is this repository
(`~/.claude/plugins/known_marketplaces.json`), so agent files resolve off the working tree —
the same circularity that motivates the self-repo guard in RUNTIME-B013.

Consequences:

- The vendored `.claude/agents/` directory is the **only** working delivery path for agents.
  That reinforces §8's non-goal: agents do not belong in the plugin as registered components
  until the array-of-files form is shown to work.
- No change to `--refresh`, which updates only what is already present in `.claude/agents/`.
- The directory form is **not** an alternative. Setting `"agents": "./agents"` makes the CLI
  reject the manifest outright — `claude plugin details full@ensemble-vnext` then reports
  `Plugin "full@ensemble-vnext" not found`. The array-of-files form is the only accepted
  shape, and it yields `Agents (0)`. Reverted; do not retry this.
- Worth retesting against a future CLI release. Until then, treat plugin agent registration
  as non-functional and rely on the vendored directory.
