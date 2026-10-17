# Functional Verification Report: artifact-manifest

**Source PRD**: docs/TRD/artifact-manifest.md ## Intended Change
**Success definition**: .trd-state/artifact-manifest/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 18 total — 18 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 18 of 18 proven — uncovered: none
**Must pass**: 14 of 14 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `packages/core/lib/artifacts.js` exists and exports `read(stateDir)`, `get(stateDir, kind)` and `record(stateDir, kind, {path, url, command})`. A vendored copy at `.claude/lib/artifacts.js` exports the same three functions | .trd-state/artifact-manifest/evidence/fs1-exports.txt | 1 |
| FS-2 | Recording a document through the CLI (`artifacts.js record <stateDir> <kind> …`) into an empty state directory writes `artifacts.json` with a top-level `"version": 2` and, under the kind, an object holding `path`, `url`, `updated_at` and `command`. `updated_at` is a timestamp and `command` names the recording command | .trd-state/artifact-manifest/evidence/fs2-record.txt | 1 |
| FS-3 | The CLI's `get <stateDir> <kind>` prints the stored entry for that kind, and `read <stateDir>` prints the whole manifest. The two read verbs agree with what `record` wrote | .trd-state/artifact-manifest/evidence/fs3-get-read.txt | 1 |
| FS-4 | A manifest in the old flat shape (`{ "<kind>": "<url>" }`) can still be read: `get` returns its URL for a kind. The next `record` into that directory rewrites the file in the version-2 shape and keeps every URL the old file held, the recorded kind's and all the others | .trd-state/artifact-manifest/evidence/fs4-flat-upgrade.txt | 1 |
| FS-5 | Each of the 11 commands named in the source calls the `artifacts.js` CLI both to read the stored URL and to record the document it produces: `create-prd`, `refine-prd`, `create-trd`, `refine-trd`, `plan`, `implement-trd`, `verify-build`, `audit-build`, `audit-prd`, `audit-trd`, `refine-verification` | .trd-state/artifact-manifest/evidence/FS-5-commands-iter2.txt | 2 |
| FS-6 | No command prompt still tells the model to write `.trd-state/<feature>/artifacts.json` by hand. The CLI is the only writer the prompts name | .trd-state/artifact-manifest/evidence/fs6-grep.txt | 1 |
| FS-7 | `/audit-build` records its report and reads it back under one kind name. The kind its instruction names and the key in the manifest are no longer different (before this change they were `audit-build` and `audit-build-report`) | .trd-state/artifact-manifest/evidence/manifest-run.txt | 1 |
| FS-8 | With `ensemble.publishArtifacts: false`, a command that produces a document still records it: the manifest entry carries the document's `path`, and its `url` holds no URL | .trd-state/artifact-manifest/evidence/manifest-run.txt | 1 |
| FS-9 | `/audit-prd` writes its report to a file on disk and records that file in the manifest | .trd-state/artifact-manifest/evidence/manifest-run.txt | 1 |
| FS-10 | `/audit-trd` writes its report to a file on disk and records that file in the manifest | .trd-state/artifact-manifest/evidence/manifest-run.txt | 1 |
| FS-11 | The success definition (`success-definition`) is recorded in the manifest when one is written | .trd-state/artifact-manifest/evidence/manifest-run.txt | 1 |
| FS-12 | The verification plan (`verification-plan`) is recorded in the manifest when `/refine-verification` writes one | .trd-state/artifact-manifest/evidence/manifest-run.txt | 1 |
| FS-13 | Every entry the commands record has a `path` that names a file that exists on disk, so a tool reading the manifest can find the document | .trd-state/artifact-manifest/evidence/fs13-path-exists.txt | 1 |
| FS-14 | `scaffold-project.sh --stamp-version` sets `ensemble.version` in `.claude/settings.json` to the plugin's version | .trd-state/artifact-manifest/evidence/fs14-stamp-version.txt | 1 |
| FS-15 | `scaffold-project.sh --stamp-version` exits non-zero when it cannot read the plugin version, instead of warning and returning 0 as `stamp_ensemble_version` did | .trd-state/artifact-manifest/evidence/fs15-stamp-fail.txt | 1 |
| FS-16 | After `/rebase-project` in every mode, `--preserve-all` included, `.claude/settings.json` has `ensemble.version` set to the plugin version. Before this change, `--preserve-all` left the old version in place | .trd-state/artifact-manifest/evidence/fs16-rebase-modes.txt | 1 |
| FS-17 | After `/init-project`, `.claude/settings.json` has `ensemble.version` set to the plugin version | .trd-state/artifact-manifest/evidence/fs17-init-stamp.txt | 1 |
| FS-18 | When the stamp is missing after scaffolding, `/init-project` re-runs `--stamp-version` and stops, rather than only echoing a warning and finishing | .trd-state/artifact-manifest/evidence/fs18-init-stuck.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

