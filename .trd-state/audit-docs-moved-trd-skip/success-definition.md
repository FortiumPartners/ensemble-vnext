# Functional Success Definition: audit-docs-moved-trd-skip

**Source**: audit-docs-moved-trd-skip TRD §Reproduction (extracted text, supplied verbatim by the caller; the TRD file itself was not opened)
**Source kind**: reproduction
**Derived**: 2026-10-07T05:36:52Z
**Criteria**: 5

All five criteria are exercised the way the reproduction itself was: invoke
`node packages/core/lib/docs-audit-assemble.js assemble --repo <repo> --run-date <date> --comprehensive --out <scratch>/asm.json`
as a user would (CLI hint row) and read its output file, exit code and stderr. The command is
read-only apart from `--out` (§Reproduction › Steps), so running it against this repository is a
local, authorized exercise. FS-3 and FS-4 need a git failure the real repository does not
produce on the fixed path, so their target is a disposable scratch repository the exerciser
builds and deletes.

**A criterion carrying a `Parts` count cannot pass incrementally**: FS-2 resolves `met` only
when all 19 tasks show `"success"`; 18 of 19 is `not_met` with the shortfall named.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | Running the reproduction's assemble command on this repository, the entry for `docs/TRD/completed/implement-trd-rework.md` (renamed there from `docs/TRD/implement-trd-rework.md` in `c1d6901`, while its committed `implement.json` still records the old path) has `skip: null` and appears in one of the review batches, rather than `skip: "no-implementation"` | §Reproduction › Expected, bullet 1 ("`skip: null`, so the TRD is reviewed and batched"); › Actual, bullet 1; › Root cause 1 (match by current path only) | `asm.json` from the Steps command, with the excerpt of that TRD's entry showing `"skip": null` and the batch listing that contains its path | [read] | locator | | O1 |
| FS-2 | In that same run, all 19 tasks of `docs/TRD/completed/implement-trd-rework.md` show `status: "success"`, matching the 19-of-19 `success` recorded in `.trd-state/implement-trd-rework/implement.json` | §Reproduction › Expected, bullet 2 ("All 19 tasks show `status: \"success\"`"); › Actual, bullets 2–3; › Root cause 1 (`analyseTrd` uses the same current-path match) | `asm.json` excerpt of that entry's task list: 19 task rows, each with `"status": "success"`, none `null` | [read] | locator | 19 | O1 |
| FS-3 | When the no-implementation fallback hands git a Touches path it cannot resolve — one outside the repository such as `../core/contracts`, or one like `/verify-trd-team` — and git exits non-zero with no output, the TRD is sent to review (`skip: null`), not skipped as having no implementation | §Reproduction › Root cause 2 (git exits 128, empty output read as "no Touches file changed", so the TRD is skipped); › Expected, bullet 1 (the TRD is reviewed) | Scratch git repository holding a TRD with no matching `implement.json` and Touches only of the kinds named in Root cause 2; `asm.json` from assemble against it, showing that TRD's entry with `"skip": null` | [read] | locator | | O2 |
| FS-4 | When the `git log --follow` call made for a TRD fails, the assemble run still completes (exit 0, no `AssembleError`) and that one TRD is sent to review (`skip: null`) | §Reproduction › Root cause 3 ("Any failure there throws `AssembleError` and stops the whole run, where it should send the one TRD to review" — marked [read; not reproduced] in the source) | Scratch git repository arranged so `git log --follow` fails for one TRD; captured exit code `0`, stderr free of `AssembleError`, and `asm.json` showing that TRD's entry with `"skip": null` | [read] | locator | | O2 |
| FS-5 | In the reproduction run, `docs/TRD/completed/implement-trd-rework.md` was the only doc skipped as `no-implementation`, one of five skipped; after the fix, four docs are skipped and none of them as `no-implementation` — the other four keep the skips they had | domain-derived: the source records the full skip picture (§Reproduction › Actual, bullet 1: "one of five skipped docs, and the only one skipped as having no implementation"), and a fix to the no-implementation test that also changed the other four docs' skips would be a regression the expected outcome does not ask for | `asm.json` from the Steps command, with the list of skipped entries: four paths and their `skip` reasons, none equal to `"no-implementation"`, compared with the same listing from the unfixed code | domain-derived | locator | | |

## Must-pass coverage

- **O1** (a moved TRD is matched to its `implement.json` by any path it has had, reviewed, task statuses shown): FS-1, FS-2.
- **O2** (when the skip test cannot get an answer from git, the TRD is reviewed, never skipped and never fatal): FS-3, FS-4.

No must-pass objective is uncovered.

## Considered and not made a criterion

- "read-only — it writes only `--out`" (§Reproduction › Steps) describes how the reproduction
  was run, not a behaviour the fix is expected to change, so it is not a criterion.
