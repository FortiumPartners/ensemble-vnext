# TRD: artifact-manifest

**Source PRD**: None — small change decided in session (owner instruction, 2026-10-17)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Every command that produces a document records it in `.trd-state/<feature>/artifacts.json` under its kind as `{path, url, updated_at, command}`, beside a top-level `"version": 2`, through one lib helper. No command writes the JSON itself. | your instruction, 2026-10-17 | yes |
| O2 | The recorded `path` names a file that exists on disk, for each kind: `prd`, `trd`, `audit-prd`, `audit-trd`, `success-definition`, `verification-plan`, `verification-report`, `audit-build` | your instruction, 2026-10-17 | yes |
| O3 | An old manifest (one claude.ai URL string per kind) is read as `{url}` and upgraded to the version-2 shape in place on the next write, keeping every URL it held | your instruction, 2026-10-17 | yes |
| O4 | With `ensemble.publishArtifacts: false` the path is still recorded and `url` is left empty | your instruction, 2026-10-17 | yes |
| O5 | `/audit-prd` and `/audit-trd` write `.trd-state/<feature>/audit-prd-report.md` / `audit-trd-report.md` the way `/audit-build` writes its report: the VERDICT line first, then a header (date, audited commit, document path), then the readout word for word | your instruction, 2026-10-17 | |
| O6 | After `/init-project` and after `/rebase-project` (every mode, `--preserve-all` included), `.claude/settings.json` has `ensemble.version` set to the plugin version | your instruction, 2026-10-17 | yes |
| O7 | `packages/core` and the vendored `.claude` copy stay byte-identical for every file this change touches | your instruction, 2026-10-17 | |

## Intended Change

**Before** (checked 2026-10-17):

- Eight command prompts (`create-prd`, `refine-prd`, `create-trd`, `refine-trd`, `plan`,
  `implement-trd`, `verify-build`, `audit-build`) each tell the model to store a returned URL
  "into `.trd-state/<feature>/artifacts.json` under `<key>`". The model writes the JSON by
  hand. All 25 manifests on disk are flat `{ "<kind>": "<url>" }` maps with no path, no time
  and no command [ran: `cat .trd-state/*/artifacts.json`].
- The audit report's key is `audit-build-report`. The instruction names the kind `audit-build`.
- With `publishArtifacts: false` nothing is recorded at all, so a tool reading the manifest
  cannot find the document [read: every "Artifact link" section is gated on the switch].
- `/audit-prd` and `/audit-trd` write no report file; their readout exists only in the terminal
  [read: `audit-prd.md`, `audit-trd.md`].
- `success-definition` and `verification-plan` are never recorded [read].
- `/init-project` stamps `ensemble.version` through `scaffold-project.sh`'s
  `stamp_ensemble_version`, which warns and returns 0 when it cannot read the plugin version.
  The init prompt then only *echoes* a warning when the stamp is missing [read:
  `init-project.md:622-627`].
- `/rebase-project` writes the version from the model's own prose in §4.6 step 5. That step sits
  under "If `settings_preserve=true`: Do NOT modify any existing values", so
  `--preserve-all` leaves the old version in place [read: `rebase-project.md:1032-1048`]. No
  script stamps it during a rebase.

**After:**

- `packages/core/lib/artifacts.js` (vendored to `.claude/lib/artifacts.js`) owns the manifest:
  `read(stateDir)`, `get(stateDir, kind)`, `record(stateDir, kind, {path, url, command})`, and a
  CLI with the same three verbs. The file is `{ "version": 2, "<kind>": {path, url,
  updated_at, command}, ... }`.
- Every command named above (plus `/audit-prd`, `/audit-trd` and `/refine-verification`)
  calls the CLI to read the stored URL and to record the document, publishing on or off.
- `/audit-prd` and `/audit-trd` write their report file and record it.
- `scaffold-project.sh --stamp-version` stamps the version and exits non-zero when it cannot.
  `/rebase-project` runs it as a final step in every mode. `/init-project` re-runs it, and
  stops, when the stamp is missing after scaffolding.

## Decision

One CommonJS module with a CLI, shaped like `live-evidence.js` and `discovered.js`: plain
functions, an injectable clock, an atomic temp-file-plus-rename write. Command prompts call
the CLI (`node .claude/lib/artifacts.js record|get|read`) and never edit the JSON.

- **Kinds sit at the top level beside `version`**, not under a nested `artifacts` key. A
  reader that already looks up `trd` keeps finding it. Check-skill page keys (a skill's own
  name, written by `/implement-trd` §9.0a) stay valid kinds, so a kind is any lower-case slug.
  The eight document kinds are the documented set. `version` is reserved and rejected as a
  kind, so it can never overwrite the top-level `"version": 2`.
- **Upgrade on read, write on record.** `read` turns a string into `{path: null, url,
  updated_at: null, command: null}` and renames the old `audit-build-report` key to
  `audit-build`. If both keys exist, `audit-build` wins. Nothing writes the file until the next
  `record`, which writes the whole upgraded manifest with `"version": 2`.
- **`record` refuses a path that is not a file inside the project.** It rejects absolute
  paths, any path that resolves outside the project root, and a path with no file behind it.
  So "the path exists on disk" holds for every write the helper makes, rather than being a
  promise kept by each prompt.
- **A `record` that changes nothing writes nothing.** When the stored entry already has the same
  path, url and command, and the file is already version 2, `updated_at` is not bumped and the
  file is not rewritten. Otherwise every republish to the same URL would leave the tracked
  `artifacts.json` dirty, and `/audit-docs` stops on a dirty tree.
- **`get` prints the URL alone**, with a trailing newline, and prints nothing (exit 0) when there
  is no entry or its URL is `""`. So "empty output" means "no stored URL", which is the test
  `/implement-trd` §9.0a already branches on.
- **`url` omitted keeps the stored one; `url: ""` clears it.** A new entry with no URL gets
  `""`. With publishing off, commands record without `--url`, so a new kind gets an empty URL
  and an existing link is not thrown away. A later run with publishing on still updates that
  link in place.
- **The order in every command is: get the stored URL, publish if the switch allows, then
  record once**, with `--url` only when a publish returned one.
- **Version stamping is a script mode, not prose.** `--stamp-version` reuses
  `stamp_ensemble_version` in a strict form that exits 1 when the plugin version cannot be read
  or written, or when `settings.json` is absent. Only that strict mode also writes `rebased_at` when a version was
  already stamped (a first stamp is init recovering, not a rebase), and `previous_version` when the
  version changes; `--refresh` and the initial scaffold write
  exactly what they write today. `/rebase-project` runs it as the last step of Step 4, so it
  runs in every mode that applies changes (`--preserve-all` included) and never in `--dry-run`,
  which skips Step 4 and writes nothing. §4.6 step 5's prose is replaced by a pointer to that
  step. The reason a rebase misses the stamp today is that Step 1 has no reliable source for the
  plugin version and §4.6's preserve rule forbids changing an existing value; the script reads
  `plugin.json` and is outside the preserve rule. `/init-project`'s scaffold already stamps; no
  case of it missing was observed, so the init change is detection (re-run, then stop), not a
  cause fix.
- **Not chosen:** having each workflow (`verify-functional.js`, `audit-build.js`) record its own
  output. Workflow scripts run no shell, and the commands already own publishing, so recording
  beside the publish keeps one place per command.

absorbed:     `audit-build-report` → `audit-build` rename — the `audit-build` kind cannot be found under the old key without it  [BLOCKS]
absorbed:     `--preserve-all` skips the version write — O6 fails on that rebase mode without it  [BLOCKS]
not absorbed: `/amend` edits a TRD but publishes nothing — no document is produced, so nothing to record
not absorbed: publishing `audit-prd`/`audit-trd` reports as artifacts — not asked; the path is recorded and `url` stays empty

## Non-Goals

- No change to what any command publishes, or when. Only recording is added.
- No migration pass over the 25 existing manifests: each upgrades on its next write.
- No reader for Forge. This change defines the file; serving it is Forge's job.
- No change to `--refresh`'s existing stamping behaviour beyond sharing the stamp function.

## Verification Artifacts

None apply — no user interface, user flow or displayed data; the outcomes are files on disk
and script exit codes, checked by Jest and BATS.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `packages/core/lib/artifacts.js` (`read`, `get`, `record`, CLI `read`/`get`/`record`), its Jest tests, the `packages/full/lib/artifacts.js` symlink and the vendored `.claude/lib/artifacts.js` copy | O1, O2, O3, O4, O7 | None | Jest: for each of the eight document kinds a recorded `path` exists and the file has `"version": 2`; a URL-only file reads as `{url}` (with `audit-build-report` read as `audit-build`) and is rewritten as version 2 on `record`, keeping every other URL; `record` without a URL stores `url: ""` for a new kind and keeps an existing URL; a repeated identical `record` leaves the file's bytes unchanged; `record` throws on a missing file, an absolute path, a `../` escape and the kind `version`, and leaves the manifest unchanged; CLI `get` prints only the URL, and nothing when it is absent or `""` |
| FIX-002 | Wire `prd`, `trd` and `audit-build` recording into `create-prd`, `refine-prd`, `create-trd`, `refine-trd`, `plan` and `audit-build`. Each reads its stored URL with `artifacts.js get`, publishes as before, then records with `artifacts.js record`, publishing on or off. `audit-build` uses the kind `audit-build` and always commits `artifacts.json` on a close | O1, O2, O4 | FIX-001 | No `artifacts.json` write instruction is left in these six prompts; each names `artifacts.js record` with its kind and command, outside the publish switch; a Jest surface test fails if any command prompt tells the model to store or read a URL in `artifacts.json` directly, and is shown failing on today's prompts before they are edited |
| FIX-003 | `/audit-prd` and `/audit-trd` write `.trd-state/<feature>/audit-prd-report.md` / `audit-trd-report.md` (VERDICT line, then header with date, audited commit and document path, then the readout verbatim) and record the kinds `audit-prd` / `audit-trd` | O1, O2, O5 | FIX-001 | Both prompts specify the report path, the three-part order, the header fields, and the `record` call; the surface test checks each |
| FIX-004 | Record `success-definition` (`/implement-trd` §8.1 once the file exists; `/verify-build` step 3/3a), `verification-plan` (`/refine-verification` Writes) and `verification-report` plus check pages (`/implement-trd` §9.0a, `/verify-build` Artifact link), publishing on or off. Switch the two places that READ stored URLs (`/implement-trd` §8.1b step 5, check-page comments; `/verify-build` fix-loop step 4) to `artifacts.js get` | O1, O2, O4 | FIX-001 | Each named step calls `artifacts.js record` with the right kind and path; `verification-report` is recorded outside the publish switch; §8.1b step 5 and verify-build step 4 read through `get`; the surface test checks each |
| FIX-005 | Update `command-status.md` "Artifact links" (template and the vendored `.claude/rules` copy) to describe the version-2 manifest and the helper | O1, O7 | FIX-001 | The rule names `artifacts.js`, the `{path, url, updated_at, command}` shape, `"version": 2`, and recording with publishing off; the existing check-skill-keys test still passes; both copies are byte-identical |
| FIX-006 | Add `scaffold-project.sh --stamp-version` (strict: exit 1 when it cannot stamp, including no `settings.json`; writes `version`, `refreshed_at`, and, in this mode only, `rebased_at` and `previous_version` on change). Add a step at the end of `/rebase-project`'s Step 4 that runs it in every mode that applies changes, with all three copies kept identical. Make `/init-project` (all three copies) re-run it when `ensemble.version` is missing after scaffolding, and go STUCK if it is still missing | O6, O7 | None | BATS: `--stamp-version` on a settings file without a version sets it to the plugin version; on an older version it updates it, records `previous_version` and keeps owner keys (`publishArtifacts: false`, permissions); with no readable plugin manifest, or no settings.json, it exits non-zero and leaves files unchanged; `--refresh` writes no `rebased_at`/`previous_version`; the rebase prompt runs `--stamp-version` as the last step of Step 4, not under the `settings_preserve` rule, and its dry-run path still skips Step 4; the init prompt re-runs `--stamp-version` and ends STUCK when the stamp is still missing |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/artifacts.js`, `packages/core/lib/artifacts.test.js`, `packages/full/lib/artifacts.js`, `.claude/lib/artifacts.js`
- **Reuse:** `packages/core/lib/live-evidence.js`: its CLI argument style (`--state-dir`) and module header comment layout [read]. `packages/core/lib/implement-state.js` `save`: the atomic temp-and-rename write [inferred].
- **Replaces:** nothing in code. The prose instruction "Store the returned URL back into `.trd-state/<feature>/artifacts.json`" is replaced in FIX-002/004 [read].
- **Follow:** `'use strict'`, CommonJS, pure functions with an injectable `now`; CLI under `if (require.main === module)`; tests sit beside the module as `*.test.js` and are not shipped (`copy_libs` skips `*.test.js`, `scaffold-project.sh:395`) [read]. `packages/full/lib/*.js` are relative symlinks to `../../core/lib/<name>.js` [ran: `ls -la packages/full/lib`].
- **Careful:** the whole-tree parity test (`test/integration/tests/runtime-integrity.test.sh`, "every file mirrored into .claude/ matches its packages/ source") compares `packages/core/lib` with `.claude/lib` byte for byte. Copy, never symlink, into `.claude/lib`. `scaffold-delivery.test.sh` checks delivered libs are real files that load [read].

### FIX-002
- **Touches:** `packages/core/commands/create-prd.md`, `packages/core/commands/refine-prd.md`, `packages/core/commands/create-trd.md`, `packages/core/commands/refine-trd.md`, `packages/core/commands/plan.md`, `packages/core/commands/audit-build.md`, `packages/core/commands/verify-command-surface.test.js`, and the same six files under `.claude/commands/`
- **Reuse:** the existing "Artifact link" paragraph in each (create-prd.md:839, refine-prd.md:214, create-trd.md:1118, refine-trd.md:248, plan.md:1156) and audit-build.md's "Publish it" block (≈ lines 323-341) [read].
- **Replaces:** "reusing the stored URL from `.trd-state/<feature>/artifacts.json` (key `<k>`) … and storing it when one is not" and audit-build's "Store the returned URL back into … under `audit-build-report`" [read].
- **Follow:** keep each paragraph's wording otherwise; the order is get, publish, record. `/plan`'s feature is the TRD slug. audit-build's "commit that file first" becomes unconditional on a close, since `record` always changes the file [read].
- **Careful:** `verify-command-surface.test.js:414` asserts that command-status.md names the check-skill keys, so do not drop that sentence [read]. `.claude/commands/<f>.md` must equal `packages/core/commands/<f>.md` [read: the parity test].

### FIX-003
- **Touches:** `packages/core/commands/audit-prd.md`, `packages/core/commands/audit-trd.md`, `.claude/commands/audit-prd.md`, `.claude/commands/audit-trd.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** audit-build.md's "Writing the audit report (D1, D2, D12)" section: the template, and the "One text, written once, printed as written" rule [read].
- **Replaces:** nothing; neither command writes a file today [read].
- **Follow:** `<feature>` is the audited document's basename without its extension. Header lines: `- Date:`, `- Audited commit:` (`git rev-parse --short HEAD`, or "unknown"), `- PRD:` / `- TRD:` with the document path. Do not commit the report; these commands have no commit step [read].
- **Careful:** the readout's first lines are `AUDIT: <path>    SOURCE: <path>` and then the VERDICT line. The report's first line is the VERDICT line, copied [read: audit-prd.md:126-146].

### FIX-004
- **Touches:** `packages/core/commands/implement-trd.md`, `packages/core/commands/verify-build.md`, `packages/core/commands/refine-verification.md`, `packages/core/commands/verify-command-surface.test.js`, and the same three command files under `.claude/commands/`
- **Reuse:** implement-trd §8.1 step 2's success-definition check, §8.1b step 5's per-skill URL read (≈ line 1602), verify-build fix-loop step 4's stored-URL read (≈ line 521), §9.0a's publish sequence (≈ lines 2022-2085); verify-build's step 3/3a and "Artifact link" section (≈ 563-577); refine-verification's "## Writes" [read].
- **Replaces:** "Store the returned URL back into `.trd-state/<feature>/artifacts.json` under `verification-report`" and "Store the returned URL back under the skill's own name in `artifacts.json`", plus each "`<artifacts.json's … key, if present>`" placeholder, which becomes an `artifacts.js get` call [read].
- **Follow:** record `verification-report` outside the publish switch but inside the "Step 8 ran" condition (`--no-verify` produces no report). Under `--chained`, `/implement-trd` skips §9.0a. The report is still written by Step 8, which `--chained` also skips, so nothing is recorded there [read].
- **Careful:** §9.0a's listing logic depends on "with no stored URL". Keep that test, now reading `get`'s output (empty means none) [read].

### FIX-005
- **Touches:** `packages/core/templates/claude-directory/rules/command-status.md`, `.claude/rules/command-status.md`
- **Reuse:** the "Store the URL and redeploy to it." paragraph (template line ≈190) [read].
- **Replaces:** "Write the returned URL to `.trd-state/<feature>/artifacts.json` keyed by artifact kind" [read].
- **Follow:** keep the paragraph short; name the helper and the shape [read].
- **Careful:** `runtime-integrity.test.sh:516` runs `cmp` on the two copies [read].

### FIX-006
- **Touches:** `packages/core/scripts/scaffold-project.sh`, `packages/core/scripts/scaffold-project.test.sh`, `packages/core/commands/rebase-project.md`, `.claude/commands/rebase-project.md`, `packages/full/commands/plugin-only/rebase-project.md`, `packages/core/commands/init-project.md`, `.claude/commands/init-project.md`, `packages/full/commands/plugin-only/init-project.md`
- **Reuse:** `stamp_ensemble_version` (`scaffold-project.sh:1506-1591`) and the whole-run-mode pattern of `--agent-status`/`--sync-agents`: flag parse, exclusivity check, early exit (`scaffold-project.sh:61-125`) [read].
- **Replaces:** rebase-project.md §4.6 step 5's prose JSON block, which writes the version by hand [read: lines 1032-1041].
- **Follow:** `--stamp-version` is exclusive with `--refresh`, `--force`, `--agent-status` and `--sync-agents`, and needs `--plugin-dir`. Keep the `setdefault` backfills exactly as they are. Strictness is opt-in through a parameter, so `--refresh` and the initial scaffold keep warning and returning 0 [read].
- **Careful:** zsh arrays are 1-indexed when tests are run by hand; BATS runs bash. `--refresh` must still print `REFRESH_SUMMARY` as its last line (`scaffold-project.sh:1756`) [read]. All three copies of rebase-project.md must stay byte-identical (`runtime-integrity.test.sh:347-348`) [read], and so must the three copies of init-project.md (`scaffold-project.test.sh:1934`) [read by reviewer]. `--dry-run` skips Step 4 and promises no writes (`rebase-project.md:680`, `:1276`) [read by reviewer]. The rebase-project.md headings sliced by runtime-integrity tests (`#### 4.1 Update Skills`) must not be renumbered [read].

## Could Not Verify

- Whether a model running these prompts calls `artifacts.js record` at every step is not checked
  by any automated test. The surface tests prove the prompts say so; only a live run proves a
  model does.
- Forge's own reading of the manifest is outside this repository.
