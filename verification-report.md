# Functional Verification Report: publish-artifacts-per-kind

**Source PRD**: docs/TRD/publish-artifacts-per-kind.md § Intended Change
**Success definition**: .trd-state/publish-artifacts-per-kind/success-definition.md
**Outcome**: exit-satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 22 total — 22 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 22 of 22 proven — uncovered: none
**Must pass**: 14 of 14 proven

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | With the template settings (`publishArtifacts: true`), the resolver prints exactly `publish: on` and exits 0 for each of these 4 kinds: `trd`, `report`, `design`, `design-system` | .trd-state/publish-artifacts-per-kind/evidence/regression-1/resolver-transcript.txt | iteration 3 (regression pass 1) |
| FS-2 | With the template settings, `publish --kind prd` prints `publish: off (off by default for prd: pass --publish to publish it)` and exits 0 — today's behaviour would have published it | .trd-state/publish-artifacts-per-kind/evidence/iter2-recapture.txt | 2 |
| FS-3 | With the template settings, each of these 6 kinds resolves `publish: off (off by default for <K>: pass --publish to publish it)` with exit 0: `audit-prd`, `audit-trd`, `verification-report`, `audit-build`, a check-skill kind (e.g. `verify-design-comparison`), and a kind no default names (e.g. `no-such-kind`) | .trd-state/publish-artifacts-per-kind/evidence/regression-1/resolver-transcript.txt | iteration 3 (regression pass 1) |
| FS-4 | When the settings file is missing, or exists but is unreadable / not valid JSON, the resolver resolves to the defaults: `--kind trd` prints `publish: on` and `--kind prd` prints the off-by-default line, exit 0 in both cases | .trd-state/publish-artifacts-per-kind/evidence/regression-1/resolver-transcript.txt | iteration 3 (regression pass 1) |
| FS-5 | Each of these 4 values of `ensemble.publishArtifacts` resolves to the defaults alone (`trd` on, `prd` off by default): `true`, key absent, `null`, a non-object value such as `"yes"` or `1` | .trd-state/publish-artifacts-per-kind/evidence/regression-1/resolver-transcript.txt | iteration 3 (regression pass 1) |
| FS-6 | With `publishArtifacts: false`, `publish --kind trd` prints exactly `publish: off (publishArtifacts is false)`, and the same line is printed when `--requested` is added, for a default-on kind (`trd`) and a default-off kind (`prd`) | .trd-state/publish-artifacts-per-kind/evidence/regression-1/resolver-transcript.txt | iteration 3 (regression pass 1) |
| FS-7 | When the setting is not `false`, `--requested` turns a kind on regardless of its default or of a per-kind object: `--kind prd --requested` with the template settings prints `publish: on`, and `--kind trd --requested` with `{"publishArtifacts":{"trd":false}}` prints `publish: on` | .trd-state/publish-artifacts-per-kind/evidence/regression-1/resolver-transcript.txt | iteration 3 (regression pass 1) |
| FS-8 | An object setting naming a kind with a boolean decides that kind: `{"prd": true}` makes `--kind prd` print `publish: on`; `{"trd": false}` makes `--kind trd` print `publish: off (set false for trd in publishArtifacts)`; a kind the object does not name, or names with a non-boolean value, falls back to its default | .trd-state/publish-artifacts-per-kind/evidence/regression-1/resolver-transcript.txt | iteration 3 (regression pass 1) |
| FS-9 | A refresh (`scaffold-project.sh --refresh`) over a project whose settings hold `{"ensemble":{"publishArtifacts": false}}` leaves that settings file byte-for-byte unchanged | .trd-state/publish-artifacts-per-kind/evidence/fs9-fs10-iter3-refreshed-form-transcript.txt | 3 |
| FS-10 | A refresh over a project whose settings hold `{"ensemble":{"publishArtifacts": {"prd": true}}}` leaves that settings file byte-for-byte unchanged | .trd-state/publish-artifacts-per-kind/evidence/fs9-fs10-iter3-refreshed-form-transcript.txt | 3 |
| FS-11 | A refresh over a project whose settings carry no `publishArtifacts` key adds it as `true` (the `setdefault` is kept) | .trd-state/publish-artifacts-per-kind/evidence/regression-1/fs11-and-template-transcript.txt | iteration 3 (regression pass 1) |
| FS-12 | No file under `packages/core/commands` or `packages/core/contracts` tests the old boolean directly: a grep finds no `publishArtifacts: false`, `publishArtifacts===false`, or "`publishArtifacts` is `false`" test, and the design contract's inline `node -e` read of the setting is gone | .trd-state/publish-artifacts-per-kind/evidence/regression-1/prose-transcript.txt | iteration 3 (regression pass 1) |
| FS-13 | Each of these 13 publishing prompts runs the resolver (`artifacts.js publish --kind <its kind>`) once before its first `Artifact` call: create-prd, refine-prd, create-trd, refine-trd, plan, task, verify-build, implement-trd, audit-build, audit-docs, audit-prd, audit-trd, and the design-commands contract | .trd-state/publish-artifacts-per-kind/evidence/regression-1/prose-transcript.txt | iteration 3 (regression pass 1) |
| FS-14 | The resolver is asked with the right kind in the three special cases: a check page asks `--kind <skill name>`; `/task` asks once with `--kind report` and applies that answer to every output (`report-2`, `report-3` included); `/design-system` asks `--kind design-system` for the system and `--kind design` for each canvas it republishes | .trd-state/publish-artifacts-per-kind/evidence/iter2-recapture.txt | 2 |
| FS-15 | Every command adds `--requested` to its resolver call when its own arguments carry `--publish`, and only then | .trd-state/publish-artifacts-per-kind/evidence/regression-1/prose-transcript.txt | iteration 3 (regression pass 1) |
| FS-16 | A resolver call that exits non-zero, or whose output has no `publish:` line, is treated as `publish: off` and adds one ISSUES line reading "publish setting could not be read: <stderr>" — never as on | .trd-state/publish-artifacts-per-kind/evidence/iter2-recapture.txt | 2 |
| FS-17 | `/audit-prd` and `/audit-trd` publish their report only when invoked with `--publish`; without it they record the path only | .trd-state/publish-artifacts-per-kind/evidence/regression-1/prose-transcript.txt | iteration 3 (regression pass 1) |
| FS-18 | `/audit-design` gains no publish step: it still never publishes | .trd-state/publish-artifacts-per-kind/evidence/regression-1/prose-transcript-2.txt | iteration 3 (regression pass 1) |
| FS-19 | A design command whose kind resolves off still ends STUCK, and its STUCK message names the per-kind setting (not only the old boolean) | .trd-state/publish-artifacts-per-kind/evidence/regression-1/prose-transcript-2.txt | iteration 3 (regression pass 1) |
| FS-20 | `artifacts.js record` with `--url ""` over an entry that holds a stored URL clears the entry's `url` and keeps the old link as `previous_url` | .trd-state/publish-artifacts-per-kind/evidence/regression-1/fs20-transcript.txt | iteration 3 (regression pass 1) |
| FS-21 | On `publish: off`, every publishing command's record step passes `--url ""`, so no later step republishes to or reads owner comments from a stale link; on `publish: on` the record step passes the published URL as before | .trd-state/publish-artifacts-per-kind/evidence/iter2-recapture.txt | 2 |
| FS-22 | `--publish` is a standalone flag token stripped from the subject in `/plan` and `/task` (never read as free text), and is passed on in each of these 3 chains: `/plan --implement` → `/implement-trd`, `/verify-build` → `/implement-trd --chained`, `/audit-build` → `/implement-trd --reconcile` | .trd-state/publish-artifacts-per-kind/evidence/regression-1/prose-transcript.txt | iteration 3 (regression pass 1) |

## Not Met

_None._

## Causes

| Cause | Representative | Members | Status |
|-------|----------------|---------|--------|
| resolver-reason-strings | FS-2 | 4 (FS-2, FS-3, FS-6, FS-8) | closed at iteration 2 |
| resolver-fallback-wording-missing | FS-16 | 1 (FS-16) | closed at iteration 2 |
| refresh-rewrites-settings | FS-10 | 1 (FS-10) | closed at iteration 3 |

## Not Verifiable

_None._

## Regression pass

After the loop exited, the criteria whose covered files changed (or whose coverage was unknown) were re-checked against the finished build.

### Round 1 (iteration 3)

Scope: targeted — re-checked 16: no-covers 13, cause-member 3

| ID | Why re-checked | Changed files |
|----|----------------|---------------|
| FS-1 | no-covers |  |
| FS-3 | cause-member |  |
| FS-4 | no-covers |  |
| FS-5 | no-covers |  |
| FS-6 | cause-member |  |
| FS-7 | no-covers |  |
| FS-8 | cause-member |  |
| FS-11 | no-covers |  |
| FS-12 | no-covers |  |
| FS-13 | no-covers |  |
| FS-15 | no-covers |  |
| FS-17 | no-covers |  |
| FS-18 | no-covers |  |
| FS-19 | no-covers |  |
| FS-20 | no-covers |  |
| FS-22 | no-covers |  |

Caught: _none._

Not re-walked (covered files unchanged): FS-2, FS-9, FS-10, FS-14, FS-16, FS-21

Changed files no criterion covers: .claude/commands/audit-build.md, .claude/commands/audit-docs.md, .claude/commands/audit-prd.md, .claude/commands/audit-trd.md, .claude/commands/create-prd.md, .claude/commands/create-trd.md, .claude/commands/implement-trd.md, .claude/commands/plan.md, .claude/commands/refine-prd.md, .claude/commands/refine-trd.md, .claude/commands/task.md, .claude/commands/verify-build.md, .claude/contracts/design-commands.md, .claude/lib/artifacts.js, .claude/verification-notes.md, packages/core/commands/audit-build.md, packages/core/commands/audit-docs.md, packages/core/commands/audit-prd.md, packages/core/commands/audit-trd.md, packages/core/commands/create-prd.md, packages/core/commands/create-trd.md, packages/core/commands/implement-trd.md, packages/core/commands/plan.md, packages/core/commands/publish-switch-prose.test.js, packages/core/commands/refine-prd.md, packages/core/commands/refine-trd.md, packages/core/commands/task.md, packages/core/commands/verify-build.md, packages/core/contracts/design-commands.md, packages/core/lib/artifacts.js, packages/core/lib/artifacts.test.js, packages/core/scripts/scaffold-project.sh, packages/core/scripts/scaffold-project.test.sh

