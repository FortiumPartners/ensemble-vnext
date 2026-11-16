# TRD: publish-artifacts-per-kind

**Source PRD**: None — small change decided by the owner; roadmap item 4 of workplan
`storybook-framework-requests` (`docs/plans/storybook-framework-requests/roadmap.md`, feature F-4)

**Kind**: change

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Whether a document is published is decided per kind by one resolver in the artifacts library. With no setting or `true`, the default publishes `trd`, `report` (task and spike reports) and the design canvases (`design`, `design-system`); every other kind (`prd`, `audit-prd`, `audit-trd`, `verification-report`, `audit-build`, check-skill pages, `docs-audit`, any unnamed kind) records its path only | roadmap item 4 brief; owner's words "spikes, design rounds, TRDs always publish. Others do not unless requested", 2026-11-16 | yes |
| O2 | `ensemble.publishArtifacts: false` turns every publish off, a run's own request to publish included, and a refresh or rebase never reverses it (nor an owner's per-kind object) | roadmap item 4 brief | yes |
| O3 | A run asked to publish (`--publish` in its arguments) publishes a kind that is off by default, unless the setting is `false` | roadmap item 4 brief ("unless the run is asked to publish") | |
| O4 | An object value `{ "<kind>": true \| false, ... }` overrides the default for the kinds it names; everything it does not name keeps the default | roadmap item 4 brief ("per-kind overrides") | |
| O5 | No command or contract reads the old boolean directly: every publish step asks the resolver | roadmap item 4, "How it will be checked" | yes |
| O6 | The settings template, `scaffold-project.sh`, `command-status.md` and the guides describe the per-kind setting | roadmap item 4 brief | |

## Intended Change

**Before** [read 2026-11-16]: `ensemble.publishArtifacts` is one boolean, shipped `true`
(`packages/core/templates/claude-directory/settings.json:161`). Eleven command prompts carry
their own "Unless `.claude/settings.json` sets `ensemble.publishArtifacts: false`, publish…"
sentence (create-prd, refine-prd, create-trd, refine-trd, plan, task, verify-build,
implement-trd, audit-build, audit-docs, design-system via the contract), and the design
contract reads it with an inline `node -e` (`packages/core/contracts/design-commands.md:24`).
With it on, PRDs, verification reports, audit-build reports and check pages all publish;
audit-prd and audit-trd reports never publish.

**After**:

1. `node .claude/lib/artifacts.js publish --kind <K> [--requested] [--settings <path>]` prints
   exactly `publish: on` or `publish: off (<reason>)` and exits 0. Reasons: `ensemble.publishArtifacts
   is false`, `<K> is off by default; pass --publish to publish it`, `ensemble.publishArtifacts.<K>
   is false`. A missing or unreadable settings file resolves to the default.
2. Resolution, in order: setting `false` → off (always, `--requested` included); `--requested`
   → on; object naming `K` with a boolean → that value; otherwise `PUBLISH_DEFAULTS[K]`, which
   is `true` for `trd`, `report`, `design`, `design-system` and absent (off) for everything else.
   `true`, absent, `null` or any non-object value → the defaults alone.
3. Every command that publishes asks the resolver once, before its first `Artifact` call, with
   its own kind, adding `--requested` when the command's arguments carry `--publish`. A check
   page asks with `--kind <skill>`; `/task` asks once with `--kind report` and applies the answer
   to every output (`report-2`, `report-3` included); `/design-system` asks `--kind
   design-system` for the system and `--kind design` for each canvas it republishes. A
   non-zero exit, or output with no `publish:` line, is read as `publish: off` plus one ISSUES
   line ("publish setting could not be read: <stderr>") — never as on. `/audit-prd` and `/audit-trd`, which today never publish,
   gain the same opt-in publish step (off unless `--publish`). `/audit-design` is unchanged
   (it never publishes; not in the brief).
4. A design command whose kind resolves off still ends STUCK as today (contract §5); its
   message names the per-kind setting.
5. **On `publish: off`, the record step passes `--url ""`**, the convention `audit-prd.md:148`
   and `refine-verification.md:285` already use for a kind that is never published. A stored
   link to a page that no longer updates is cleared (the manifest keeps it as `previous_url`),
   so no later step republishes to it or reads owner comments from it
   (`implement-trd.md` §8.1b). On `publish: on` the record step is unchanged.
6. **`--publish` is a standalone flag token**, stripped from the subject like `--implement`
   (so `/plan` and `/task` never read it as free text), and passed on when a command chains
   another: `/plan --implement` → `/implement-trd`, `/verify-build` → `/implement-trd
   --chained`, `/audit-build` → `/implement-trd --reconcile`.
7. `scaffold-project.sh` keeps `setdefault("publishArtifacts", True)`: `false` and an object
   both survive a refresh unchanged.

Checks that fail if this does nothing: with the template's shipped `true`, `publish --kind prd`
prints `publish: off …` (today's behaviour would publish it); `publish --kind trd --settings
<file with false>` prints `publish: off (publishArtifacts is false)`; a refresh over
`{"publishArtifacts": false}` and over `{"publishArtifacts": {"prd": true}}` leaves each
byte-for-byte; a grep of `packages/core/commands` and `packages/core/contracts` finds no
`publishArtifacts: false` / `publishArtifacts===false` / "`publishArtifacts` is `false`" test.

## Decision

One resolver in `packages/core/lib/artifacts.js` (`PUBLISH_DEFAULTS`, `publishDecision(kind,
{settings, requested})`, CLI verb `publish`) is the only reader of `ensemble.publishArtifacts`;
command prompts call the CLI and act on `publish: on|off`, never parse the setting themselves.
It lives in `artifacts.js` because that module already owns the kinds and is the one every
publishing command already calls (`get`/`record`).

- **The value stays `true` in the shipped template**, and `true` means "the per-kind default".
  Shipping an explicit object would pin today's defaults into every project, so a later
  default change would never reach them.
- **`prd` is off by default.** The brief lists neither prd nor its absence; the owner's own
  words name only TRDs, spikes and design rounds as always-on and say "others do not unless
  requested". `/create-prd --publish` still publishes.
- **The run's request is the `--publish` argument.** One token the prompt can see in its
  arguments, the same for every command; the lib takes it as `--requested`.
- **`false` beats a request.** The brief: "false still turns every publish off".
- **A request beats a per-kind `false`.** Both are the owner's; the run-time one is the more
  specific.
- **A switched-off kind clears its stored link** (`--url ""`), so a stale page is never
  republished or read for comments. This is the one exception to the Non-Goal below.
- **A resolver error reads as off**, plus an ISSUES line: publishing is the convenience, so the
  failure mode is not publishing. In a design command that means STUCK naming the reason.
- **Unnamed kinds are off.** Check-skill page names are open-ended; "others do not unless
  requested" covers them without a list.
- Rejected: a separate `publishArtifactKinds` key beside the boolean. Two keys that can
  disagree need a precedence rule nobody reads; one key with three shapes (`false`, `true`,
  object) has none.

absorbed: none.
not absorbed: `/audit-design` publishes nothing and is not named in the brief — left as is.
not absorbed: historical TRDs/PRDs under `docs/` that quote the old sentence — as-built records
of their own features; `/audit-docs` owns their drift.

## Non-Goals

- Deleting or unpublishing anything already published (roadmap out-of-scope fence).
- Changing what any command writes, records or commits; only whether its publish call runs —
  except that a switched-off kind records `--url ""` (Decision).
- Roadmap items 1–3 of the same workplan (built separately).
- A per-kind `icon` or any change to how a publish is made once it is on.

## Verification Artifacts

None apply — the change is a library function, command prose and a settings backfill; no
screen, design frame, data-rendering view or user journey is in scope.

## Verification Environment

**Environment**: local
**Refresh**: none declared — tests read the working tree
**Cannot be checked there**: a live `Artifact` publish (not needed: the change decides whether
the call runs, and every decision is printed by the CLI)

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should PRDs publish by default? | No: the owner's words name only TRDs, spikes/tasks and design rounds as always-on; `--publish` or `{"prd": true}` turns it on | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add the per-kind resolver to `packages/core/lib/artifacts.js`: `PUBLISH_DEFAULTS`, `publishDecision(kind, { settings, requested })` returning `{ publish, reason }`, `readPublishSetting(settingsPath)`, and CLI verb `publish --kind K [--requested] [--settings P]` printing `publish: on` or `publish: off (<reason>)`. Jest tests in `artifacts.test.js` | O1, O2, O3, O4 | None | Tests prove: absent/`true`/`null`/string → trd, report, design, design-system on and prd, audit-prd, audit-trd, verification-report, audit-build, `verify-design-comparison`, docs-audit off; `false` → every kind off, with `--requested` too; `--requested` turns prd on; `{"prd": true}` → prd on, trd still on; `{"trd": false}` → trd off, `--requested` turns it back on; non-boolean object values ignored; missing and malformed settings file → defaults; CLI prints exactly the two line forms and exits 0; invalid kind exits 1 |
| FIX-002 | Route every command's publish step through the resolver: replace each "Unless `.claude/settings.json` sets `ensemble.publishArtifacts: false`" sentence with a call to `node .claude/lib/artifacts.js publish --kind <K>` (adding `--requested` when the arguments carry `--publish`) and "publish only on `publish: on`", in create-prd, refine-prd (prd), create-trd, refine-trd, plan (trd), task (report), verify-build and implement-trd (verification-report; each check page `--kind <skill>`), audit-build (audit-build), audit-docs (docs-audit); add the same opt-in publish step to audit-prd and audit-trd (replacing "These reports are never published"); route verify-build's fix-round republish steps (step 4 "Publish the report and each selected check's page to their stored URLs", step 6 "republish it under the same stored URL") through the same answer; on `publish: off` each record step passes `--url ""`; a resolver error reads as off plus one ISSUES line; `/task` asks once with `--kind report` for every output; document `--publish` (a standalone flag token, stripped from free-text subjects) in each command's usage and pass it on in the chains plan→implement-trd, verify-build→implement-trd --chained, audit-build→implement-trd --reconcile | O1, O2, O3, O5 | FIX-001 | Each listed command contains `artifacts.js publish --kind <its kind>`; none contains a direct read of the old boolean; each says off records `--url ""`; verify-build's round republish names the resolver's answer; prose tests updated to the new wording |
| FIX-003 | Design contract and design commands: replace the inline `node -e` in `design-commands.md` §1 step 2 with `node .claude/lib/artifacts.js publish --kind design` (`/design-system`: `--kind design-system` for the system and `--kind design` for each canvas it republishes), keep the `publish: on/off` answer and §5 STUCK, reword §5's Reason/Next to name the per-kind setting; update the design-system, create-design, refine-design, sync-design references to "the publishing switch" if they restate it | O1, O2, O5 | FIX-001 | `design-commands.md` holds no `publishArtifacts===false`; §5 still says "Make no publish call at all"; `design-commands.test.js` updated and passing |
| FIX-004 | Settings and scaffold: keep `"publishArtifacts": true` in `packages/core/templates/claude-directory/settings.json` and `packages/full/.claude/settings.json`; update the comment above `setdefault("publishArtifacts", True)` in `scaffold-project.sh` to say `true` means the per-kind default and that `false` and an object both survive; extend `scaffold-project.test.sh` and `test/integration/tests/scaffold-delivery.test.sh` so a refresh keeps an owner's `false` and an owner's object byte-identical | O2, O6 | None | BATS: refresh over `false` keeps `false`; refresh over `{"prd": true, "trd": false}` keeps that object; fresh scaffold ships `true` |
| FIX-005 | Guard test and docs: a Jest test (in `packages/core/commands/verify-command-surface.test.js` or a new `publish-switch-prose.test.js`) that fails when any file under `packages/core/commands/` or `packages/core/contracts/` reads the old boolean (`publishArtifacts: false`, `publishArtifacts===false`, "`publishArtifacts` is `false`") and that every `##`/`###` section of a command or contract containing `Artifact({ file_path` contains `artifacts.js publish --kind` or names the section that does (per publish site, not per file); rewrite "Artifact links" in `packages/core/templates/claude-directory/rules/command-status.md` for the per-kind setting (three shapes, defaults, `--publish`, false-wins, rebase-safe); update `docs/guides/CONCEPTS.md`, `INSTALL.md`, `PROCESS.md`, `ARCHITECTURE.md`, `docs/reference/authoring.md`, `design.md`, `implement-trd.md` mentions; add a CHANGELOG `Unreleased` entry | O5, O6 | FIX-002, FIX-003 | Guard test passes on the tree and fails if one old sentence is restored; docs describe the three shapes and the default list |
| FIX-006 | Refresh the vendored runtime: run `packages/core/scripts/scaffold-project.sh --refresh --plugin-dir packages/full .` so `.claude/` (commands, contracts, lib, rules/command-status.md) matches `packages/core`; confirm `.claude/settings.json` still reads `"publishArtifacts": true`; run the full Jest battery and the touched BATS files | O5, O6 | FIX-001, FIX-002, FIX-003, FIX-004, FIX-005 | `diff -r` shows `.claude/commands` and `.claude/lib/artifacts.js` equal to their `packages/core` sources; `npx jest` passes; `bats packages/core/scripts/scaffold-project.test.sh test/integration/tests/scaffold-delivery.test.sh test/integration/tests/notify-on-complete.test.sh` passes |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/artifacts.js`, `packages/core/lib/artifacts.test.js`
- **Reuse:** `KINDS`, `KIND_RE`, `parseArgs`, `main` switch and the CLI's `try/catch` exit-1 pattern in `artifacts.js` [read]; the test file's tmpdir fixtures and CLI `spawnSync` helpers [read]
- **Replaces:** nothing in the lib; the per-command `node -e` reader in FIX-003 [read]
- **Follow:** pure function plus thin CLI, as `get`/`record`; `--settings` defaults to `.claude/settings.json` relative to cwd; never throw on a missing or malformed settings file (resolve to defaults), unlike the manifest, because publishing is a convenience and a broken settings file must not stop a command
- **Careful:** `report-<n>` is NOT special-cased in the resolver (`/task` asks with `report`); `publish` must not call `recordRef.ensure` (it reads no manifest); `parseArgs` requires a value after every flag, so `--requested` needs a flag-only branch; `main` currently demands `--state-dir` for every verb — `publish` must not

### FIX-002
- **Touches:** `packages/core/commands/create-prd.md`, `packages/core/commands/refine-prd.md`, `packages/core/commands/create-trd.md`, `packages/core/commands/refine-trd.md`, `packages/core/commands/plan.md`, `packages/core/commands/task.md`, `packages/core/commands/verify-build.md`, `packages/core/commands/implement-trd.md`, `packages/core/commands/audit-build.md`, `packages/core/commands/audit-docs.md`, `packages/core/commands/audit-prd.md`, `packages/core/commands/audit-trd.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** each file's existing "Artifact link" block (create-prd.md:842, refine-trd.md:285, create-trd.md:1258, refine-prd.md:251, verify-build.md:803-811, task.md:164, audit-build.md:425-449, implement-trd.md:2403-2465, plan.md:1261, audit-docs.md:135) [read]; audit-prd.md:148 and audit-trd.md:136 record steps [read]
- **Replaces:** the sentence "Unless `.claude/settings.json` sets `ensemble.publishArtifacts: false`" and its variants, and "These reports are never published, so record passes `--url \"\"`" in audit-prd/audit-trd [read]
- **Follow:** one wording everywhere: "Ask first: `node .claude/lib/artifacts.js publish --kind <K>` (add `--requested` when this run's arguments carry `--publish`). On `publish: on`, publish …; on `publish: off (…)`, make no publish call and name the local path." Leave every "ALWAYS record" step as is
- **Careful:** implement-trd §9.0a also gates on `--no-verify`; keep that gate. Check pages ask per skill, not once for all. `verify-command-surface.test.js:419` asserts §9.0a wording — update, don't delete. `/plan`'s own `--implement` chain passes its args to `/implement-trd`; `--publish` must not be confused with `--implement`

### FIX-003
- **Touches:** `packages/core/contracts/design-commands.md`, `packages/core/contracts/design-commands.test.js`, `packages/core/commands/design-system.md`, `packages/core/commands/create-design.md`, `packages/core/commands/refine-design.md`, `packages/core/commands/sync-design.md`
- **Reuse:** §1 step 2's `publish: on|off` answer, which the lib's output matches [read]; §5 STUCK block [read]
- **Replaces:** the inline `node -e '...publishArtifacts===false...'` at design-commands.md:24 [read]
- **Follow:** design commands pass `--kind design`; `/design-system` passes `--kind design-system` (its manifest kind, `design-system.md:97`; `system` is only `design-map.js`'s name) and `--kind design` per canvas; both default on, so a project with `true` behaves exactly as today
- **Careful:** today's inline reader treats any error as on; the CLI can exit 1 — the contract must say a non-zero exit or missing `publish:` line is off plus the reason, which then ends STUCK per §5. design-commands.test.js:61 and :110 assert the old text (`publishArtifacts`, `publishArtifacts===false`) — move them to the lib call; the STUCK `Next:` must tell the owner how to turn the kind on (`"design": true`, or remove `false`), not just "set to true"

### FIX-004
- **Touches:** `packages/core/scripts/scaffold-project.sh`, `packages/core/scripts/scaffold-project.test.sh`, `test/integration/tests/scaffold-delivery.test.sh`, `packages/core/templates/claude-directory/settings.json`, `packages/full/.claude/settings.json`
- **Reuse:** `ensemble.setdefault("publishArtifacts", True)` at scaffold-project.sh:1651 [read]; the false-survives tests at scaffold-project.test.sh:2683-2700 and scaffold-delivery.test.sh:136-162 [read]
- **Replaces:** only the comment above the setdefault [read]
- **Follow:** setdefault, never assignment (the file's own stated rule)
- **Careful:** `test/integration/tests/notify-on-complete.test.sh:568-603` asserts the template value is a boolean and `true` — still true after this change; leave it passing, do not loosen it

### FIX-005
- **Touches:** `packages/core/commands/publish-switch-prose.test.js`, `packages/core/templates/claude-directory/rules/command-status.md`, `docs/guides/CONCEPTS.md`, `docs/guides/INSTALL.md`, `docs/guides/PROCESS.md`, `docs/guides/ARCHITECTURE.md`, `docs/reference/authoring.md`, `docs/reference/design.md`, `docs/reference/implement-trd.md`, `CHANGELOG.md`
- **Reuse:** the `read`/`flat` helpers pattern of `verify-command-surface.test.js` [read]
- **Replaces:** "On by default; turn off per project with `ensemble.publishArtifacts: false`" and "honored everywhere — commands skip the publish step" in command-status.md:202 and :239 [read]
- **Follow:** command-status.md's own voice: say what each shape does, then the defaults, then `--publish`; keep "Turning it off is a real decision" and the rebase guarantee
- **Careful:** `docs/rules-history/command-status.md` is history — do not rewrite it. Old TRDs/PRDs under `docs/TRD`, `docs/PRD` are records of their features; leave them

### FIX-006
- **Touches:** `.claude/commands/`, `.claude/contracts/design-commands.md`, `.claude/lib/artifacts.js`, `.claude/rules/command-status.md`, `.claude/settings.json`
- **Reuse:** `packages/core/scripts/scaffold-project.sh --refresh` — this repo's own vendored copy is refreshed from the plugin the same way every project's is [inferred from commit 14510fb4 touching `.claude/commands` alongside `packages/core/commands`]
- **Replaces:** the vendored copies of the files changed above [read]
- **Follow:** commit the refreshed `.claude/` with the source changes
- **Careful:** a refresh rewrites `ensemble.refreshed_at`/version fields in `.claude/settings.json`; keep only intended changes (revert stamp-only churn if the repo's prior refresh commits did); never touch `.trd-state/`

## Could Not Verify

- That `scaffold-project.sh --refresh` is how this repository updates its own `.claude/` [inferred]; FIX-006 checks by `diff -r` either way.
- A live `Artifact` publish under each kind — not exercised; the decision is checked through the CLI's printed answer, which is what every command acts on.
