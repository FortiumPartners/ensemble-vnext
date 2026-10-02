# TRD: verification-reuses-evidence

**Source PRD**: None — small change decided in session (owner, 2026-10-02, after the lightning-lane signup-disney-optional assessment)

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | Evidence produced before the verification loop started still proves a criterion when none of the source files it exercises has changed since the evidence was captured. The newest commit alone no longer makes all prior evidence stale. | owner instruction, 2026-10-02 ("freshness by touched files, not newest commit") |
| O2 | Evidence whose exercised source files HAVE changed since capture is still rejected as stale, so reuse never passes evidence that describes old code. | owner instruction, 2026-10-02 (implied by O1: freshness, not leniency) |
| O3 | A TRD's live-check tasks (`[LIVE]`) record what they captured where the verification loop can find it, and the loop uses those artifacts instead of capturing the same thing again. | owner instruction, 2026-10-02 ("live-check TRD tasks feed the verification loop instead of duplicating it") |
| O4 | The TRD authoring rules say that live-check tasks feed the verification loop, so new TRDs are planned that way. | owner instruction, 2026-10-02 |

## Intended Change

Measured case: lightning-lane `signup-disney-optional`, 2026-10-02. Phase 3 of the build was six
test tasks, five of them `[LIVE]` (real browser at 1280px and 390px, iOS Simulator, Maestro, the
assistant eval, scenario B against the mock Disney API). They ran 2 h 41 min. Eight minutes
after the end-of-run review committed five small fixes, the default verification loop started
re-proving all 40 checklist items from scratch. Two things forced that:

- **Locator rows** (proven by a literal string seen in the artifact): `checkEvidence` rejects
  any artifact whose mtime is not after `since = max(HEAD commit time, loop start)`, and every
  phase 3 artifact predated the loop by construction.
- **Judge-only rows** (screenshots and other pictorial evidence, ruled on by reading): no age
  check applies to them at all (`functional-verification.js:87-99`). They were re-captured
  because nothing told the exerciser the phase 3 artifacts existed.

After this change:

1. **Live-check tasks record their evidence with content hashes.** When `/implement-trd`
   assembles the prompt for a `[LIVE]` task (`task.live`, `trd-parser.js:431`), it adds an
   instruction to bring the environment to the current code first (the fast refresh in
   `verification.md` §2, when one is declared), save each artifact under
   `.trd-state/<feature>/evidence/live/<task-id>/`, and record it with
   `node .claude/lib/live-evidence.js record`. That appends
   `{task, artifact, shows, environment, covers: [{path, sha256}], ts}` to
   `.trd-state/<feature>/evidence/live-manifest.jsonl`. `covers` lists the source files whose
   behaviour the artifact exercises; the recorder resolves each to an absolute path (resolving
   symlinks) and stores its sha256 at record time. The task that captured the evidence declares
   `covers`; the exerciser never does.
   - Checkable: `record` appends one line under 2048 bytes with absolute paths and hashes; it
     rejects an entry with no artifact, a non-file artifact, empty `covers`, or a covered path
     that does not exist. `read` skips malformed lines and keeps the last entry per artifact.
2. **The checker accepts reused evidence when the covered files are byte-identical.**
   `checkEvidence` takes `covers` only from what the workflow attaches (item 3). An artifact
   that is not newer than `since` still passes tier 1, marked `reused: true`, when `covers` is
   non-empty, every path is absolute and an existing file, and every file's current sha256
   equals the recorded one. Any other old artifact is `stale`, as today. An artifact newer than
   `since` passes exactly as today. For a judge-only claim the checker still returns
   `tier1: 'skipped'`, and now also reports `stale: true|false` and `reused`, as information.
   - Checkable: old artifact + unchanged covered file → `pass`, `reused: true`; covered file
     edited → `stale`; covered file restored to its old bytes → `pass` again; `covers: []` →
     `stale`; relative covered path → `stale`; judge-only claim, old artifact, edited covered
     file → `skipped` with `stale: true`.
3. **The loop is handed the manifest, and `covers` comes only from it.** `/implement-trd` §8.3
   and `/verify-build` pass `liveEvidence` (the manifest's entries via
   `node .claude/lib/live-evidence.js read`, `[]` when absent) to `verify-functional`. The
   Exercise prompt lists them and says: before capturing a criterion, check whether a listed
   artifact already proves it; if one does, claim that artifact with a locator seen in it (or
   none for a judge-only row) and do not capture again. `reconcileClaims` sets each claim's
   `covers` from the manifest entry whose `artifact` equals the claim's, and discards any
   `covers` the exerciser sent; an artifact not in the manifest has no `covers` and cannot be
   reused. The Judge prompt says: a `reused` pass predates this run and proves the criterion
   only if its `shows` and content match it; a judge-only claim reported `stale: true` is
   `not_met` with cause `evidence-stale`.
   - Checkable: with a manifest entry, the Exercise prompt contains its artifact path; an
     exerciser-supplied `covers` is replaced by the manifest's; a non-manifest old artifact →
     `stale`; `liveEvidence` that is not an array, or an entry without `artifact` or `covers`,
     throws before any agent is dispatched, naming the index.
4. **The authoring rule says so.** `trd-authoring.md` §4.1.1 and the end-to-end paragraph in
   §5 (and the copy in `create-trd.md`) state that a `[LIVE]` task records its artifacts for the
   verification loop, which reuses them, so the run does not prove the same thing twice.

## Decision

- **Freshness by content hash of the declared covered files.** Recorded once by the live task,
  recomputed by the checker. Rejected: comparing mtimes, which a checkout or rebase rewrites
  (false staleness) and a retargeted symlink can dodge (false freshness). Hashing reads files,
  which `checkEvidence` already does under a byte cap; it stays free of clock and git.
- **`covers` belongs to the task that captured the evidence, never to the exerciser.** Same
  convention as `judgeOnly`, which `reconcileClaims` stamps from the definition and never takes
  from the agent. This keeps tier 1 a gate no agent at claim time can set.
- **A new `live-evidence.js` holds the recorder.** `functional-verification.js` promises no
  clock and has no writer; `discovered.js` is the local pattern for an append-only JSONL
  recorder with an injectable clock and a line-size cap, safe under parallel appends.
- **Feed the loop; do not delete live tasks.** Rejected: dropping `[LIVE]` tasks now that
  verification runs by default. The owner chose "feed"; and a live task owns setup a single
  criterion check does not (seeding a QA account, building a preview).
- **`since` keeps its meaning** for fresh evidence; reuse is a second path through tier 1.
- **No list of files changed since capture for the Judge.** Rejected from the review: the hash
  check already makes any change to a covered file disqualifying, deterministically. What it
  cannot see is a file the live task left out of `covers`, and a changed-files list would not
  tell the Judge which of them the criterion depends on either. Stated in Could Not Verify.
- absorbed: the false claim that `/implement-trd` sets `[LIVE]` tasks aside by default, in
  `trd-authoring.md:285` and `implement-trd.md:18` (only `## Deferred by design` tasks are set
  aside, `trd-parser.js:700-727`). Both sit in text this change rewrites. [same paragraphs]
- not absorbed: `/plan` re-investigating a source that is already a finished spec — separate change.
- not absorbed: asking owner questions before long work rather than after — separate change.

## Non-Goals

- No change to `since`'s derivation in `/implement-trd` §8.3 or `/verify-build`.
- No per-iteration freshness floor (the docblock's KNOWN LIMIT remains for fresh evidence).
- No change to which tasks `/create-trd` creates, beyond the live-task wording.
- No automatic mapping from criteria to source files.

## Verification Artifacts

None apply — libraries, a workflow script and prompt text; no screens, journeys or data views.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | New `packages/core/lib/live-evidence.js` (`record`, `read`, CLI `record`/`read`), modelled on `discovered.js`: injectable clock, 2048-byte line cap, absolute symlink-resolved `covers` with sha256, last entry per artifact wins; Jest tests; `.claude/lib/` mirror and `packages/full/lib` symlink | O3 | None | Tests show: a valid entry appends one line under 2048 bytes with absolute paths and correct hashes; no artifact, non-file artifact, empty `covers` or a missing covered path is rejected with nothing written; `read` skips a malformed line and returns the last entry for a repeated artifact; the CLI round-trips both |
| FIX-002 | `functional-verification.js` `checkEvidence`: reuse path by sha256 of `covers` for locator claims; `stale`/`reused` information on judge-only claims; amend the docblock's floor and purity text to name the reuse path; Jest tests; mirror | O1, O2 | None | Tests show: old artifact with unchanged covered files → pass, reused; one covered file edited → stale; restored to old bytes → pass; empty or relative `covers` → stale; missing covered file → stale; judge-only old artifact with an edited covered file → skipped, stale true; fresh artifact passes with no `covers` exactly as before; all existing checkEvidence tests pass |
| FIX-003 | `verify-functional.js`: `liveEvidence` arg validated per entry; Exercise prompt lists it with the reuse instruction; `reconcileClaims` sets `covers` from the manifest by artifact path and drops exerciser-sent `covers`; Judge prompt rules for `reused` and judge-only `stale`; `evidence-stale` cause text covers a rejected reuse; Jest tests; mirror. `docs/TRD/functional-verification.md` §3.3 gains `liveEvidence`, a 2.7.0 changelog row and version; the sync test's count 22 → 23 | O1, O3 | FIX-002 | Tests show: the prompt contains a manifest artifact path and the reuse block only when entries exist; an exerciser `covers` is replaced by the manifest's; a claim on a non-manifest artifact carries no `covers`; the Judge prompt names `reused` and judge-only `stale`; invalid `liveEvidence` throws naming the index; `verify-functional-trd-sync.test.js` passes at 23 |
| FIX-004 | Commands, contracts and docs: `implement-trd.md` §3.5 adds the live-evidence element to `[LIVE]` task prompts (`task.live`), §8.3 passes `liveEvidence` and qualifies its "produced by THIS run" paragraph, line 18's `[LIVE]` deferral claim corrected; `verify-build.md` passes `liveEvidence`; `contracts/functional-verification.md` qualifies the freshness bullet and the `evidence-stale` row; `trd-authoring.md` §4.1.1 and §5 end-to-end paragraph (and `create-trd.md`'s copy) say `[LIVE]` tasks record evidence for the loop and drop the false set-aside claim; `docs/reference/verification.md` freshness rows; mirrors; command-surface assertions | O3, O4 | FIX-001, FIX-003 | `verify-command-surface.test.js` asserts: §3.5 names `live-evidence.js record` for `[LIVE]` tasks; §8.3 and `verify-build.md` pass `liveEvidence`; the contract names the reuse path; `trd-authoring.md` and `create-trd.md` name the live-evidence manifest and no longer say `[LIVE]` tasks are set aside by default. All `.claude/` mirrors byte-identical |
| AMEND-001 | The checker CLI takes `covers` only from the manifest: `check-evidence` gains `--state-dir <dir>`, reads `<dir>/evidence/live-manifest.jsonl` through `live-evidence.read`, and attaches each claim's `covers` by resolved artifact path; any `covers` in the claims payload is discarded. `verify-functional.js` passes `--state-dir` in the Judge's check-evidence command and no longer copies hashes into claims. Found by the end-of-run review: the Judge was copying every sha256 into its claims file by hand, so hashes passed through a model | O1, O2 | FIX-002, FIX-003 | Tests show: the CLI with `--state-dir` reuses an old artifact recorded in the manifest with unchanged covers; a claims payload carrying forged `covers` for a non-manifest artifact is `stale`; a payload carrying forged hashes for a manifest artifact uses the manifest's; the Judge prompt's check-evidence command includes `--state-dir`; claims built by `reconcileClaims` carry no `covers` |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/live-evidence.js`, `packages/core/lib/live-evidence.test.js`, `.claude/lib/live-evidence.js`, `packages/full/lib/live-evidence.js`
- **Reuse:** `discovered.js`'s `record(stateDir, entry, nowIso)` shape and `MAX_LINE_BYTES` handling (`discovered.js:39-42, 474-530`) [read]; its reader that skips malformed lines [inferred]
- **Follow:** `packages/full/lib/*.js` are relative symlinks into `packages/core/lib`; create the new one the same way [ran]
- **Careful:** resolve `covers` with `fs.realpathSync` so a symlink records its target; hash with `crypto.createHash('sha256')` over the file bytes [inferred]

### FIX-002
- **Touches:** `packages/core/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`, `.claude/lib/functional-verification.js`
- **Reuse:** the existing `fs.statSync`, byte-cap and content-read handling in `checkEvidence` (`functional-verification.js:~84-205`) [read]
- **Replaces:** the unconditional `stale` return at `functional-verification.js:144-146` becomes "stale unless the reuse conditions hold"; the judge-only early return at `:87-99` gains `stale`/`reused` [read]
- **Follow:** the return-shape docblock above `checkEvidence` (`:~50-80`): document `covers` as `[{path, sha256}]`, `reused?`, and judge-only `stale?`; amend the floor paragraph (`:56-62`) and the module's purity note (`:15-21`) to say hashing reads covered files [read]
- **Careful:** the locator gate after the stale check must still run on reused artifacts; a covered path that is a directory fails reuse; `packages/full/lib/functional-verification.js` is a symlink [read]

### FIX-003
- **Touches:** `packages/core/workflows/verify-functional.js`, `packages/core/workflows/verify-functional.test.js`, `.claude/workflows/verify-functional.js`, `docs/TRD/functional-verification.md`, `packages/core/workflows/verify-functional-trd-sync.test.js`
- **Reuse:** `buildExercisePrompt` (`verify-functional.js:324`), `reconcileClaims` (`:817`, which already overwrites `judgeOnly` from the definition), the Judge prompt's STEP 2 and cause list (`:~455-470`), per-entry arg validation as `exerciseLanes` does it (`:~232-249`) [read]
- **Follow:** validate before any agent runs; do not add `covers` to `EXERCISE_SCHEMA` [read]
- **Careful:** the sync test asserts `toHaveLength(22)` against `docs/TRD/functional-verification.md` §3.3 `VerifyFunctionalArgs` (`verify-functional-trd-sync.test.js:66-73`); earlier arg additions bumped that TRD's version with a changelog row (2.4.0, 2.6.0) [read]. No `Date.now()` in workflow source [read]

### FIX-004
- **Touches:** `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`, `packages/core/commands/verify-build.md`, `.claude/commands/verify-build.md`, `packages/core/contracts/functional-verification.md`, `.claude/contracts/functional-verification.md`, `packages/core/contracts/trd-authoring.md`, `.claude/contracts/trd-authoring.md`, `packages/core/commands/create-trd.md`, `.claude/commands/create-trd.md`, `docs/reference/verification.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** §3.5's appended elements (`<check_battery>`, `<discovered>`) as the pattern for a `[LIVE]`-only element; §8.3's `Workflow({ name: "verify-functional", args: {…} })` block; `verify-build.md:~198-210` [read]
- **Replaces:** `implement-trd.md:18`'s "(`[LIVE]` etc.)" and `trd-authoring.md:285`'s "`/implement-trd` already sets `[LIVE]` tasks aside by default"; the "produced by THIS run" wording at `implement-trd.md:~1683-1688` and contract `:166-168` gains "unless it qualifies for reuse" [read]
- **Careful:** `create-trd.md:325-337` carries a copy of §4.1.1; keep them consistent. `.claude/contracts/*` mirror the core copies byte for byte [ran]

### AMEND-001
- **Touches:** `packages/core/lib/functional-verification.js`, `.claude/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`, `packages/core/workflows/verify-functional.js`, `.claude/workflows/verify-functional.js`, `packages/core/workflows/verify-functional.test.js`
- **Reuse:** `live-evidence.js` `read(stateDir)` and `manifestPath` [read]; the CLI's `resolveJsonPayload` [read]; the workflow's `STATE_DIR` (`verify-functional.js:156`) [read]
- **Replaces:** `COVERS_BY_ARTIFACT` and the covers attachment in `reconcileClaims` [read]
- **Careful:** keep `checkEvidence(claims, sinceSec)` itself unchanged for direct callers and its tests; the CLI is the only path agents use [read]

## Could Not Verify

| Claim | Why not checked |
|-------|-----------------|
| Reuse would have saved most of the lightning-lane loop's time | The phase 3 artifacts were not recorded with `covers`; the saving depends on which criteria the review fixes touched |
| A live task declares every source file its evidence depends on | Model judgement; a file left out of `covers` can change without making the evidence stale |
| A reused artifact was captured against a build that contained its covered files | The live task is told to refresh first; nothing checks the running build's contents |
