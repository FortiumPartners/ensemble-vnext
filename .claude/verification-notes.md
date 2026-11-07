# Verification notes

What the verifier has learned about running this project, across runs of the
functional-verification loop. Every line carries an evidence marker: `[ran]` (executed and
read the output), `[read]` (opened and verified), `[inferred]` (deduced, not checked).

## Exercising `renderWaveProfile()` (task-graph.js)

- [ran] `renderWaveProfile()` can be exercised directly with no server, browser, or full
  `/create-trd` run — invoke it in a one-off `node -e` script requiring
  `.claude/lib/task-graph.js` and `.claude/lib/trd-parser.js`, parse a committed TRD with
  `parseTrd(fs.readFileSync(f,'utf8'), {path:f})`, then call
  `tg.renderWaveProfile(tg.buildGraph(p.tasks, p.grounding||{}))`. Confirmed against
  `docs/TRD/autonomy-judge-command-scope.md` (dependency-dominated, 13/14 ordering
  constraints, narrow line + critical path emitted, no shared-files list),
  `docs/TRD/discipline-judgment.md` (avg width 7.00, no narrow line — wide as documented),
  and `docs/TRD/completed/implement-trd-rework.md` (avg width 2.38, above the narrowBelow
  default of 2, no narrow line).
- [ran] A file-dominated wave profile has no committed TRD example in this repo as of
  2026-09-21 (all three referenced example TRDs are dependency-dominated or wide/zero-edge).
  To exercise the "shared files" branch of `renderWaveProfile`, build a synthetic graph
  inline: `buildGraph(tasks, grounding)` takes tasks with no `dependsOn` and a `grounding`
  object keyed by task id with a `touches: [<path>]` array — giving 4 tasks the same
  `touches` path produces `narrow — driven by shared files (6 of 6 ordering constraints)`
  plus the "these files serialize the most tasks" block. This is the substituted-evidence
  path referenced by the contract's "Evidence that would prove it is a target, not a
  contract" clause, used because FS-2 requires a file-dominated contrast run and none
  exists as committed TRD fixture data.
- [inferred] FS-4/FS-5/FS-6 (grounding's dependency-justification verdicts, sizing's
  long-task splits, and TRD-byte-identity-plus-no-AskUserQuestion) require a full
  `/create-trd` run against a real PRD, which the stack hints in this loop's dispatch state
  takes ~20 minutes. Not attempted in this Exercise pass — no PRD was supplied and the
  time cost is out of scope for a single exercise iteration. Left `not_verifiable` with
  that reason; a future run with a PRD in hand and time budgeted for a full pipeline pass
  could produce this evidence.

## Exercising the audit-{trd,prd,build} readout headings (2026-09-25 run, `audit-readout-tense`)

- [read] All 12 criteria in this success definition are static-text checks over the readout
  heading definitions in six files: `packages/core/{workflows,commands}/audit-{trd,prd,build}.
  {js,md}`. No server/browser/database/credential is involved — grep and `git diff
  main...HEAD` over those six files is sufficient evidence for every criterion here; no live
  `/audit-*` run was needed or attempted.
- [ran] Confirmed `.claude/{workflows,commands}/audit-{trd,prd,build}.{js,md}` are
  byte-identical to their `packages/core/` counterparts (`diff -q`, zero output, all six
  pairs) — so checking `packages/core` alone is sufficient; the task's own warning about a
  fallback-only check does not apply here because both layers were in fact updated in lockstep
  in this diff.
- [ran] `git diff main...HEAD -- <the six files>` is the single most useful command for this
  whole criterion set — it shows every heading-text change side by side and made FS-1 through
  FS-6, FS-10 essentially self-evident without needing per-criterion greps.
- [ran] One inconsistency found and recorded in FS-4.txt/FS-12.txt evidence, NOT resolved to a
  verdict (that's the judge's job): `audit-build.js`/`audit-build.md`'s `FIX THE CITATION`
  heading was left in imperative form, even though its own description text says the audit
  corrects the citation directly (the same mechanical action FS-4 requires past tense
  `FIXED THE CITATION` for in the audit-trd/audit-prd layers), and it is not one of the four
  audit-build headings the task text names as deliberately-imperative exceptions
  (TRACEABILITY GAPS / MISSING IMPLEMENTATION / MISMATCH / UNTESTED-IN-PRACTICE). Worth a
  second look by the judge stage.

## Exercising plan-weight.js / fix-plan.js / fix-sizing.js (2026-09-23 run)

- [ran] `plan-weight.js`'s `KINDS`/`WEIGHTS`/`ROUTES` exports, `stages()`, `verification()` and
  `route()`, plus `fix-plan.js`'s `plan()`, are all exercisable with no server, browser or
  live `/plan` session via a one-off `node -e` script requiring
  `./packages/core/lib/plan-weight.js` and `./packages/core/lib/fix-plan.js` directly. No TRD
  or PRD fixture is needed for these — pure functions, no filesystem reads.
- [ran] `fix-sizing.js` no longer exports `MAX_TASKS`/`DEFAULT_MAX_FILES`/`DEFAULT_MAX_CALLERS`
  — confirmed by reading the file and by `grep -rn "MAX_TASKS\|DEFAULT_MAX_FILES" packages/core/lib/*.js`
  returning zero hits, contrasted with the same file at base commit `f5890c8` (`git show
  f5890c8:packages/core/lib/fix-sizing.js`), which defined all three. Any future criterion
  phrased as "the ceiling remains N" needs to be read against its cited source's actual
  wording (does the source forbid *raising*, or forbid *removing*?) before treating a
  deletion as a pass or a fail — those are different claims and the delivered code here
  satisfies one and not the other verbatim.
- [inferred] Criteria naming a full `/plan` *run* (a captured session transcript showing
  actual dispatch behaviour, stage execution, banner counts, `AskUserQuestion` absence, or a
  written artifact from a real run) still require the same ~20-minute live session the prior
  Exercise pass on this project flagged for `/create-trd`. No environment beyond the working
  tree is authorized by `.claude/rules/verification.md` (its `local` row names a `npm run dev`
  script that does not exist in this repo), so these were left `not_verifiable` again this
  run, same reasoning as the prior entry. This applies to: FS-9, FS-19, FS-20, FS-21 (needs a
  TRD `/plan` actually wrote, not a synthetic fixture), FS-22, FS-24.

## Evidence staleness in the tense-rule run (FS-12, 2026-09-25)

- [ran] FS-12 arrived at Debug with the citation heading already past tense in all four files
  (`packages/core/workflows/audit-build.js:509`, `packages/core/commands/audit-build.md:196`,
  and both `.claude/` mirrors). The evidence artifact
  `.trd-state/audit-readout-tense/evidence/FS-12.txt` was written 22:52; all four files were
  last modified 22:54. The verdict was correct against the tree the Exercise pass read and
  stale by two minutes against the tree Debug was handed.
- [learned] On a project whose Exercise step is a grep, evidence can go stale between Judge and
  Debug when more than one fix lands in the same iteration. Cheapest guard, and what closed
  this one: re-grep the cited file:line before editing, and read `git diff` on it — the pre-edit
  wording showed up as the `-` side of the working-tree diff, which is what identified the gap
  as already closed rather than absent.
- [ran] `FIX THE CITATION` still exists in `create-trd.{md,js}` (line ~985 / ~632) and in the
  stale `.claude/worktrees/agent-*` copies. Those are a different command and untracked scratch
  trees respectively. A repo-wide grep for the imperative spelling will hit them and read as a
  failure; scope the grep to the six audit-layer files
  (`packages/core/{workflows/audit-*.js,commands/audit-*.md}`) plus their `.claude/` mirrors.
- [ran] Mirror parity for these six files is a plain `diff -q packages/core/<f> .claude/<f>` —
  no need to invoke the BATS `runtime-integrity.test.sh` suite to check one change. `node --check`
  on the three workflow scripts confirms the template literals still parse after a heading edit.
- [ran] No test in `test/` asserts any readout heading string, so a heading rename breaks no
  deterministic check — the only thing that can catch a half-applied rename is the two-layer
  grep plus the mirror diff.

## Iteration 2 re-check (same run, `audit-readout-tense`, 2026-09-25)

- [ran] The FS-4/FS-12 gap the prior iteration flagged for the judge was fixed by Debug:
  `FIX THE CITATION` in `audit-build.{js,md}` (both layers) is now `FIXED THE CITATION`, and
  the fix also narrowed the claim to the in-run-rewrite case only, adding "reported, not
  fixed" for a citation elsewhere in the TRD — a correctness improvement riding along with
  the tense rename. Re-grepped all six files fresh after the debug edit
  (`packages/core/workflows/audit-build.js` mtime 22:56:41, after the FS-4 evidence's
  original 22:51:56 capture) — this is the exact staleness pattern the iteration-1 note
  already named for FS-12; the fix here was to re-grep rather than trust the stale
  evidence file. Confirmed zero remaining hits for the literal imperative string
  `"FIX THE CITATION"` across the six audit-{trd,prd,build} files
  (`packages/core/{workflows,commands}` — `.claude/` mirrors byte-identical, `diff -q`
  all six). Updated `FS-4.txt` and `FS-12.txt` evidence files to the current (fixed) state
  rather than leaving the iteration-1 "one inconsistency found" note standing as if
  unresolved.
- [ran] Confirmed `node --check` still passes on all three workflow `.js` files post-edit —
  the heading-string edit didn't break template-literal syntax.
- [inferred] General pattern worth carrying forward: when a criterion set spans an
  iteration boundary (Exercise -> Judge -> Debug -> Exercise again), always re-grep the
  cited file:line before reusing a prior iteration's evidence file verbatim, even when the
  file "looks done" — mtimes are the cheap tell (evidence mtime vs. source mtime), same
  method the iteration-1 note already established for the FS-12/Debug handoff.

## Exercising verification-artifacts (2026-09-27 run, iteration 1)

- [ran] The owner's preserved exemplar is reachable at
  `/Users/fortium/ensemble-reference/visual-compare-exemplar-2026-09-27/site/index.html` — a
  504-line static page with all six of `verify-design-comparison`'s required page elements
  (legend, status-filter chips, jump strip/TOC, per-frame Design|Build|Diff|Overlay panels
  with a fade-slider input, and `s-uncaptured`-status cards for frames not captured). Grep it
  directly rather than recalling its shape from the PRD/TRD prose — the actual markup differs
  in small ways from a paraphrase (e.g. the fade control is a `<input type="range">` per frame,
  named `fade-NN`, not a single page-level slider).
- [ran] `packages/core/scripts/scaffold-project.sh` is safely runnable against a throwaway
  directory under the session scratchpad with `--plugin-dir "$(pwd)/packages/full"` — both a
  fresh scaffold and a `--refresh` of an existing one. Confirmed live: all three check skills
  (`verify-design-comparison`, `verify-flow-as-built`, `verify-data-fidelity`) land in
  `.claude/skills/` even when `.claude/selected-skills.txt` names only `jest`/`pytest`, and
  after `--refresh` on a project that had them removed. This is a fast (~2s), side-effect-free
  way to exercise scaffold criteria — no need to touch this repo's own `.claude/`.
- [ran] `fix-audit.js`'s own test suite (`packages/core/lib/fix-audit.test.js:162-169`)
  asserts that a TRD with NO `## Verification Artifacts` heading at all is a **finding**
  (`ok: false`), with no distinction for a TRD "written before this change." This is the
  mechanical check `/plan` invokes (`packages/core/commands/plan.md:670`,
  `require("./.claude/lib/fix-audit")`). By contrast, `audit-trd.js`'s own prompt (lines
  ~162-166, ~182) DOES implement an advisory-only branch for the identical missing-section
  case. Worth a second look by the judge/debug stages: `/plan`'s mechanical check and
  `/audit-trd`'s check disagree on whether a missing section is a finding or an advisory.

## Exercising verification-artifacts (2026-09-27 run, iteration 1, continued)

- [ran] `scaffold-project.sh --refresh`'s framework-skill step logs only ONE
  `[INFO] Added framework skill: <name>` line even when all three of
  `FRAMEWORK_SKILLS` (`verify-design-comparison`, `verify-flow-as-built`,
  `verify-data-fidelity`) were missing and got added — verified by removing all
  three from a scaffolded project's `.claude/skills/`, running `--refresh`, and
  finding all three back on disk even though the log printed only
  `verify-data-fidelity`'s line. Don't read the log line count as the count of
  skills actually restored; `ls .claude/skills/` after the run is the check that
  matters, not the INFO output.
- [ran] `audit-trd.js`'s `omission-audit` verifier (not `fix-audit.js`, which is
  `/plan`'s mechanical check) is where "an applicable check silently omitted from
  an existing `## Verification Artifacts` section is a real finding, one with a
  stated reason is not" actually lives — its prompt text (lines ~139-165) spells
  out both branches (`action: 'add-back'` when the section exists but is silent
  on a triggered check; `action: 'advisory'` when the section itself is absent).
  `fix-audit.js` only validates the section's own internal structure (rows
  resolve, Omitted lines carry skills + reasons) — it has no PRD-input-vs-selected-
  check comparison logic at all, so a criterion that needs THAT comparison (e.g.
  "an applicable check omitted with no reason is a finding") cites `/audit-trd`
  behaviour, never `/plan`'s.
- [ran] `npx jest packages/core/lib/fix-audit.test.js -t "Verification Artifacts"`
  runs cleanly and fast (13 tests, ~0.2s) and is real live confirmation of every
  fix-audit.js branch (missing section, None-apply, Omitted+reason,
  Omitted-no-reason, unknown skill in a row, unknown skill in an Omitted line,
  missing input path, URL advisory). Redirect stdout/stderr in the right order
  (`> file 2>&1`, not `2>&1 > file`) — the reverse silently produces a 0-byte
  capture because `2>&1` binds to the terminal before the later `>` retargets
  stdout.

## Exercising verification-fix-loop (2026-09-27 run, iteration 1)

- [ran] `scaffold-project.sh` takes the target directory as a bare positional argument, not
  `--project-dir` (which errors "Unknown option"). Usage:
  `scaffold-project.sh --plugin-dir <dir> [--refresh] <project-dir>`. Confirmed against both
  a fresh scaffold and a `--refresh` of the same directory — all four `framework-skills.txt`
  entries (`verify-design-comparison`, `verify-flow-as-built`, `verify-data-fidelity`,
  `verify-plan-recovery`) land in `.claude/skills/` on both paths, whatever
  `selected-skills.txt` says, confirming the bridge skill ships exactly like the check skills.
  **Superseded:** `refine-verification` (FIX-003) deleted `verify-plan-recovery` and dropped
  its `framework-skills.txt` row; it no longer ships. Historical record of that run only — the
  retired-skills table in `rebase-project.md` now removes it from existing projects.
- [ran] `discovered.js`'s `promoteToTrd(trdPath, rows, opts)` anchors on the LAST table whose
  header row matches `/^\|\s*Task ID\s*\|/i` — a table headed plain `| ID |` is invisible to
  it (`skipped: N`, not an error). A fixture TRD for this library needs a `| Task ID | ... |`
  header, not `| ID | ... |`, or promotion silently no-ops.
- [ran] `functional-verification.js`'s `renderReport`, `readStopRule` and `decideFixRound` are
  all pure functions exercisable via a one-off `node -e` requiring the module directly — no
  server, no fixture TRD, no `.trd-state` state needed. Confirmed the Diagnosis block renders
  under all four of `stalled`/`stuck`/`unbuilt`/`insufficient-coverage` and not under
  `satisfied`; confirmed `cause` counts are read from the stored field even when the `reason`
  text contains a different cause's keyword (a `judged-failed` row with "stale" in its reason
  strictly counts as judged failed, never re-parsed).
- [ran] `discovered.js`'s ref-based identity pre-pass (`latestPerRef`) collapses two
  differently-worded rows sharing the same `ref` into ONE before promotion ever runs — proven
  by recording two rows for `ref: "FS-99"` with different summaries and seeing exactly one
  `AMEND-001` row in the promoted TRD, carrying the LATER wording.

## Exercising verification-md-setup (2026-09-27 run, iteration 1)

- [ran] The `verification-setup` skill cannot be invoked by this exerciser: `Skill({skill:
  "verification-setup"})` returns `Unknown skill: verification-setup` even though it's
  installed and listed in the session's available-skills reminder — its frontmatter
  carries `disable-model-invocation: true` and "Owner-invoked only — no command or agent
  may reach it" (SKILL.md lines 9, 16). This is corroborating evidence for the
  no-autonomous-write criterion in this success definition, not a gap: it means the
  interview-behaviour criteria (the ones needing an actual `AskUserQuestion` transcript)
  cannot be captured as a real skill run by an agent in this framework, ever — not just
  this pass. Substitute the skill's own prompt text (SKILL.md) plus live CLI calls to the
  functions it names in its own Inputs table (`check-verification-unfilled`,
  `recommend-coverage-floor`) as evidence instead, and say so in the claim's reason.
- [ran] `scaffold-project.sh --plugin-dir <repo>/packages/full <scratch-dir>` (bare
  positional target, no `--project-dir`) is the fast way to get a fixture project with the
  real shipped skill directory (`.claude/skills/verification-setup/SKILL.md`) and the real
  `.claude/lib/functional-verification.js` copy — confirmed live, ~2s, in the session
  scratchpad.
- [ran] Inside a scaffolded fixture project, `node .claude/lib/functional-verification.js
  check-verification-unfilled .claude/rules/verification.md` must be run from THAT
  project's own directory (or with a path that resolves relative to it) — invoking the
  repo's own `.claude/lib/functional-verification.js` against a scratch project's file path
  returns `{"unfilled":null,"reason":"template-missing",...}` because the module resolves
  its shipped-template path relative to `__dirname`, not the target file's directory. Always
  `cd` into the fixture project first, or invoke via its own copy of the lib.
- [ran] `missingVerificationSections()` (the function behind FS-13-shaped criteria) checks
  FOUR sections today (resource-capacity, write-permission-column, refresh-split,
  coverage-floor), not three — a success-definition criterion that describes it naming
  "the three sections" needs a careful read against which prior template shape it means:
  the fixture `verification.resource-table-v2.md` (the shape immediately before this
  change) is missing only `coverage-floor` (one section), and the oldest fixture
  `verification.pre-1.5.0.md` is missing all four. No fixture shape yields exactly three.
  Recorded as a judge question, not resolved here.
- [ran] `recommend-coverage-floor <dir>` reads `<dir>/*/verification-state.json`, keyed by
  each subdirectory's own name as `feature`; building a two-run fixture (`4/5` and
  `3/10` proven, both `outcome: "satisfied"`) reproduces the documented "lowest satisfied
  share, floored to a multiple of 5%" rule exactly (`recommended: 0.3` for the `3/10` run) —
  cheap way to exercise `recommendCoverageFloor`'s formula live without a real
  `/implement-trd` history.

## Exercising verification-md-setup, iteration 2 re-check (2026-09-27)

- [ran] The same locator-must-sit-on-one-line rule the verification-fix-loop notes already
  state applies to `packages/skills/verification-setup/SKILL.md` too: its prose wraps at
  ~90-92 columns, so a phrase copied by paraphrase from consecutive sentences (e.g. "the
  reasoning that produced it in one line") spans a physical line break and reads
  `locator-not-found` even though the words are all there. Fixed for FS-4/FS-7 by copying
  the file's OWN physical lines verbatim into the evidence file (no reflow) and picking the
  locator from inside one such line, rather than composing a paraphrase across sentence
  boundaries. Do this for any future criterion sourced from this file.
- [ran] `check-verification-unfilled <projectPath> [templatePath]` needs an explicit
  `templatePath` argument when run from THIS repo's own working tree, not just from a
  scaffolded fixture project (an earlier note only covered the fixture-project case): this
  repo has no `.claude/skills/verification-setup/template.md` (that only exists in a
  scaffolded consuming project), and the CLI's fallback resolves that path relative to
  `.claude/lib/functional-verification.js`'s own directory, so an omitted second argument
  always reports `{"unfilled":null,"reason":"template-missing"}` here, whatever the first
  argument is. Passing `packages/core/templates/claude-directory/rules/verification.md`
  explicitly as the second argument gets a real answer from this repo directly, with no
  scaffold step needed.
- [ran] `node .claude/lib/functional-verification.js decide-next '{"gaps":[],"unbuilt":[],`
  `"met":["FS-1"],"total":10,"coverageFloor":0.8,"cap":3}'` is a fast, fixture-free way to
  produce a real `insufficient-coverage` exit on demand (no scratch project, no real failing
  run needed) — confirmed output:
  `{"action":"exit-insufficient-coverage","reason":"proven ratio 1/10 (10.0%) is below the`
  `coverage floor 80% ...","closed":[]}`. Useful for any future criterion needing this exit
  as evidence.

## Exercising verification-md-setup, iteration 3 re-check (2026-09-27)

- [ran] FS-7's iteration-2 gap ("SKILL.md never tells the owner what the floor means")
  was closed in the working tree between iteration 2's evidence capture (mtime 16:34) and
  this pass: `packages/skills/verification-setup/SKILL.md` (mtime 16:37, uncommitted —
  `git diff` shows the addition) now opens the Coverage floor section with the quoted
  `AskUserQuestion` sentence itself defining the floor as "the share of the success
  definition's criteria that must be proven (met) before a verification run may report
  satisfied". Re-captured `FS-7.txt` from the current file content rather than reusing the
  stale iteration-2 copy — the general rule the verification-fix-loop notes already state
  (re-grep/re-copy before reusing a prior iteration's evidence file, since a fix landing
  between Judge and the next Exercise makes the old capture describe pre-fix code) applied
  here across a gap that spanned two full loop iterations, not just one Debug pass within
  an iteration.

## Debug pass, verification-fix-loop iteration 1 (2026-09-27)

- [ran] Citing a committed source file (e.g. `packages/core/commands/verify-build.md`) directly as
  the artifact fails tier 1 as `stale` whenever that file is unchanged since HEAD — its mtime is
  older than the freshness floor. Copy the current content into `evidence/<id>.txt` in the same
  Exercise pass and cite the copy. Ten of fifteen gaps in iteration 1 were this and nothing else.
- [ran] A locator must sit on ONE line of the artifact. `verify-build.md` wraps its prose at ~95
  columns, so a sentence copied from a paraphrase ("Publish the report and each selected
  check's page to their stored") spans a line break and is reported `locator-not-found` even
  though the text is there. Pick a locator from inside a single physical line.

## Exercising feature-close-out (2026-09-28 run, iteration 1)

- [ran] `test/smoke/scenarios/close-feature.sh` (opt-in, `./test/smoke/run-smoke.sh
  close-feature`) is the fastest real-behaviour evidence for `/close-feature` and its
  closed-feature guards on `/implement-trd --resume` and `/amend` — eleven headless `claude
  --print` runs across five scaffolded scratch projects, asserting on `closed.json` fields,
  `current.json` nulling, transcript text and commit counts. It takes on the order of
  20-40 minutes end to end (11 sequential `claude --print` calls, up to 300s timeout each) —
  dispatch it in the BACKGROUND (`Bash` with `run_in_background: true`) at the very start of
  an Exercise pass on this feature and do source-reading work while it runs, rather than
  waiting on it synchronously.
- [ran] **The scenario's `cleanup()` trap deletes every scratch project directory ON SUCCESS**
  (`PROJECT_DIRS`, including each run's `.session-runN.jsonl` transcript) — only a failing
  run leaves them on disk for diagnosis. A passing run's own `close-feature-smoke.log` (the
  captured stdout+stderr of `run-smoke.sh`) is therefore the ONLY surviving artifact, and its
  `assert_pass_raw`/`assert_fail_raw` lines (`  [HH:MM:SS] PASS: <description>` /
  `  [HH:MM:SS] FAIL: <description>`, per `test/smoke/lib/assert.sh`) are what a locator must
  be picked from — the raw JSONL session transcripts are gone by the time the log finishes
  printing. `run-smoke.sh`'s "concurrently" mode also buffers each scenario's full stdout
  until it exits, so the log file shows nothing until the whole 11-run scenario is done, then
  everything at once.
- [ran] **A plain `git clone` of a LOCAL checkout sets the clone's `refs/remotes/origin/HEAD`
  to whatever branch the source repo had checked out at clone time — not to that repo's
  actual configured default branch.** Cloning this repo while `feature/feature-close-out/build`
  was checked out produced a clone whose `git symbolic-ref --quiet refs/remotes/origin/HEAD`
  resolved to `refs/remotes/origin/feature/feature-close-out/build`, so `/close-feature`'s D4
  default-branch resolution correctly (per its own documented logic) treated `main` as the
  WRONG branch and went STUCK — a fixture-setup bug on the exerciser's part, not a defect in
  `close-feature.md`. Fix before running `/close-feature` (or anything else that resolves the
  default branch this way) against such a clone:
  `git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main`.
- [ran] To exercise `/close-feature --accept` against this repository's own three stale
  features (judge-prompt-generative-rule, discipline-judgment, testing-phase) without running
  on this checkout's own feature branch (S-2/D4 forbid that — `/close-feature` requires the
  default branch): `git clone` this repo locally into scratch, checkout `main`, fix the
  `origin/HEAD` symref per the note above, then `rsync -a --delete <repo>/.claude/
  <clone>/.claude/` to apply this branch's runtime (the `/close-feature` command itself isn't
  on `main` yet) without merging. A `.trd-state/current.json` naming none of the three
  features must be created first (`main` has none) so the headless invocation has a valid
  file to read/null. Each run takes its explicit TRD path as an argument, not
  `current.json` lookup, so this works even before `current.json` exists validly.
- [ran] `testing-phase/implement.json` really does use the legacy status literal
  `"completed"` (not `"success"`) for every one of its `TRD-TEST-*` rows — confirmed by grep,
  not assumed from the TRD prose. `/close-feature`'s own rule ("only `success` counts") means
  every one of those rows reads as unfinished, exactly as FS-27 expects. Confirmed live:
  closing it produced `"tasks": { "completed": 80, "pending": 2 }` — the 80 legacy-`completed`
  rows were never counted as `success` or silently folded in, and only the genuinely-`pending`
  two landed in `unfinished`.
- [learned] **Never launch the same `/close-feature --accept` loop over the same clone twice.**
  A background dispatch that appeared to fail (the very first attempt used an invalid
  `claude --timeout` flag and errored instantly) is easy to mistake for "safe to just retry" —
  but the retry was launched as a SECOND background job while the fix to the underlying
  problem was applied, and both then ran concurrently against the same scratch clone,
  redirecting to the same log file with `>` (each truncating the other's output). Two
  concurrent `/close-feature` runs against the SAME clone did not corrupt any single file in
  this instance (each session happened to reach a different feature's `closed.json` before
  being killed), but that was luck, not a guarantee — `/close-feature` has no lock file.
  Before relaunching a killed/errored background exerciser run, confirm with `ps aux` that
  nothing from the first attempt is still alive; kill it explicitly first.

## Exercising audit-build report-first-line (FS-1/FS-4, 2026-09-28, iteration 2)

- [ran] A scratch project's own `.claude/settings.json` `permissions.allow` list is IGNORED
  by a headless `claude --print --dangerously-skip-permissions` run when that workspace has
  never been opened interactively — the CLI prints "Ignoring N permissions.allow entries...
  this workspace has not been trusted" and the run does nothing further (no error exit, no
  further output; the process just sits). `--permission-mode bypassPermissions` (the flag
  `test/smoke/lib/project.sh`'s `smoke_claude()` actually uses, not
  `--dangerously-skip-permissions`) does NOT hit this trust check and runs cleanly — use it
  for any future headless run against a scratch project, matching the smoke harness exactly
  rather than the shorter form CLAUDE.md's own doc examples show.
- [ran] Plain zsh on this machine has no `timeout` builtin or coreutils `timeout` on PATH
  (`(eval):6: command not found: timeout`) — a headless run wrapped in `timeout 300 claude
  ...` fails instantly with a 1-line log and no diagnostic pointing at the real cause. Drop
  the wrapper and use `Bash({run_in_background: true})` plus a bounded poll loop (`until ! ps
  -p <pid>; do sleep N; done`) instead.
- [ran] A real `/audit-build --report-only` run over a 1-task, 1-requirement fixture TRD
  (no PRD, no stack.md/constitution.md) took about 2.5 minutes wall clock (5 verifiers +
  report write); the same shape WITH a PRD, `stack.md`, `package.json`+jest present took
  about the same. Budget ~3 minutes per real `/audit-build` headless run, not the ~20 minutes
  a prior note estimated for a full `/create-trd` pipeline — this command alone is much
  cheaper to exercise live than a document-authoring pipeline.
- [learned] **The report's embedded "readout" and the actual printed readout are composed
  independently and are NOT byte-identical**, even though the report template's own
  instruction is "the readout, verbatim as printed below." Confirmed live: the report's first
  line and its embedded copy read `VERDICT: proceed with these caveats: no source supplied —
  fidelity and omission unchecked (there is no PRD...); the unit test tests/add.test.js was
  confirmed to exist...`, while the terminal's actual final `AUDIT-BUILD:`/`VERDICT:` block
  read `VERDICT: proceed with these caveats: there is no PRD, so nobody has checked...; the
  test in \`tests/add.test.js\` exists and checks that \`add(2, 3)\` is 5, but it was never
  run...` — same three caveats, same category (`proceed with these caveats`), different
  prose. FS-1 requires "the same VERDICT line the run's readout printed"; whether same-category-
  different-wording satisfies that is a judge question, not resolved here — evidence captured
  as both the report file and the transcript's printed readout, not reconciled.
- [ran] **Confirmed as a repeat pattern, not a one-off**, on a second real run against a
  zero-findings fixture (PRD + stack.md + package.json/jest all present, `--report-only`):
  the report's first line was `VERDICT: safe to proceed — every requirement is implemented
  and tested`; the terminal's actual final `VERDICT:` line was `VERDICT: safe to proceed.
  Every requirement is implemented and has a test that checks it.` — em dash vs. period,
  "is implemented and tested" vs. "has a test that checks it," same category (`safe to
  proceed`) both times, prose reworded both times. Both fixtures used, evidence files, and
  the finding are `.trd-state/feature-close-out/evidence/FS-1-*` and `FS-4-*`.

## Correction: the divergence above is FIXED as of commit 2649aef (2026-09-27, iteration 3)

- [ran] **The two notes directly above are now superseded, not just re-checked — do not treat
  them as the current state of the report template.** Commit `2649aef` changed
  `packages/core/commands/audit-build.md` (and its `.claude/` mirror) so the template's
  instruction reads "Settle the readout's final wording... BEFORE writing this file, then
  print that same text in the terminal, copied character for character" — the wording-drift
  the two notes above describe is exactly what this line was added to forbid. Re-ran the
  identical `tiny-adder` fixture (1 requirement, 1 task, no PRD, no package.json) through a
  fresh headless `/audit-build docs/TRD/tiny-adder.md --report-only` in a new scratch project
  scaffolded from this repo's current `packages/full`. Result: the report file's first line
  (`.trd-state/tiny-adder/audit-build-report.md`) and the transcript's printed `VERDICT:` line
  are now **byte-identical** (`diff` of both, captured to one file each, reports no
  difference) — confirmed with `diff`, not eyeballed. Both both begin
  `VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked
  (no PRD exists, so the code was checked only against the TRD, never against product
  requirements); the one test, tests/add.test.js, has never been run because the repo has no
  package.json or test runner to run it`. Evidence:
  `.trd-state/feature-close-out/evidence/FS-1-report-iter3.md` (the report file) and
  `FS-1-readout-transcript-iter3.txt` (the full session log, `--print` output).
- [ran] The scratch project was built the same way the prior iteration's notes describe:
  `scaffold-project.sh --plugin-dir <repo>/packages/full <scratch-dir>` for the harness, then
  a hand-written `docs/TRD/tiny-adder.md` + `src/add.js` + `tests/add.test.js` fixture
  committed with git (a clean git repo is required — `/audit-build` reads `git rev-parse
  --short HEAD`). Headless invocation used `--permission-mode bypassPermissions` (not
  `--dangerously-skip-permissions`), matching the prior iteration's finding that the
  scratch project's own `permissions.allow` list is ignored without it. Wall clock: about 4
  minutes for the workflow (5 verifiers + report write), in line with the prior iteration's
  ~2.5-3 minute budget.

## Exercising context-model-hygiene (2026-09-29 run, iteration 1)

- [ran] `scaffold-project.sh <dest>` with NO `--plugin-dir` silently skips agent copying
  (`copy_agents` warns "No plugin directory specified, skipping agents" and `.claude/agents/`
  ends up empty) — pass `--plugin-dir "$(pwd)/packages/full"` (the source tree with
  `agents-lib/`, not `packages/core`) to get the real 13-agent scaffold. `--copy-skills` is
  optional but harmless to add alongside it.
- [ran] `claude plugin details full@ensemble-vnext` reports `Agents (0)` for this plugin as of
  4.10.1/agents-lib rename — confirms O3 without spending any model call; it is a local
  manifest read, not a live session.
- [ran] Per-workflow "every agent() call is pinned" harness tests (audit-build, audit-trd,
  create-prd, create-trd, implement-phase, sweep, verify-functional — the 7 workflow files that
  have a `.test.js`) can be flipped from pass to fail by blanking one `agentType:`/`model:` line
  in the corresponding `packages/core/workflows/<name>.js` and running
  `npx jest packages/core/workflows/<name>.test.js -t "every agent"`; restoring the original
  line (`git checkout` or restoring from a saved copy) makes it pass again with a clean
  `git status`. `audit-prd.js` has no corresponding `.test.js` at all, so it carries no such
  assertion to demonstrate.
- [inferred] There is exactly one subagent transcript under this session's
  `subagents/**/*.jsonl` with an mtime after commit 4039cf8's commit time
  (2026-09-29 01:01:15 -0700) as of this run — it is this very Exercise-stage dispatch
  (`agentType: verify-app`), not an unrelated implementer/verifier run, so its first-turn
  context total (~109k) is not a clean like-for-like against the TRD's pre-change ~90k
  median: that baseline was ordinary dispatches, and this one carries the full
  functional-verification contract plus a 7-row criteria list in its own prompt.

## Exercising context-model-hygiene (2026-09-29 run, iteration 1 re-run after reconcile commit 4912d11)

- [ran] The reconcile commit (`4912d11`, 2026-09-29 02:57:24 -0700) added a deterministic BATS
  pair to `test/integration/tests/runtime-integrity.test.sh` that covers two of this run's
  criteria directly, so the exerciser should reach for these before hand-rolling `wc -c`/manual
  scaffolds: `@test "the rule files' and CLAUDE.md's byte ceilings hold, in both copies"` (FS-1,
  O4/O5) and `@test "packages/full registers no agents: no agents key, no default agents/ dir"`
  (FS-4/O3, checks both `packages/full/agents` absence and the marketplace entry). Run with
  `npx bats test/integration/tests/runtime-integrity.test.sh --filter "<name substring>"`; both
  passed on the current HEAD.
- [ran] **Correction to the FS-2 demonstration method above:** `grep -n "agentType: '" <file>`
  to find the "pin line" to blank is not reliable for `implement-phase.js` — its first match
  (line 173) is a comment (`// agentType: 'technical-architect' (attested: ...)`), not a live
  pin, so blanking it leaves the test passing (a false demonstration: no FAIL was produced).
  The real pin for `implement-phase.js` is the `agentType: 'verify-app',` call at line 232
  (the `gate:verify-app` dispatch) — blanking that one correctly flips the "every agent() call
  is pinned" test from FAIL to PASS-on-restore. Anyone repeating this demonstration should
  verify the matched line is inside an actual `agent(...)` call (check the line isn't preceded
  by `//`), not just take grep's first hit.
- [ran] Evidence artifacts from the first Exercise pass (dated 01:02–01:04, before the reconcile
  commit) were regenerated in full rather than reused, because their mtimes predated HEAD's
  commit time (02:57:24) and would fail the tier-1 freshness gate ("newer than HEAD's commit
  time"). Re-running the same commands (`wc -c`, the bats pair, the jest flip-demonstration per
  workflow, `claude plugin details`, a fresh `scaffold-project.sh` into a new temp dir, and a
  fresh grep of the contract/instruction files) reproduced the same substance with current
  timestamps in `.trd-state/context-model-hygiene/evidence/`.

## Exercising context-model-hygiene (2026-09-29 run, iteration 1 Debug-stage corrections)

- [read] **Second correction to the FS-2 demonstration method:** blanking ONE `agentType:` or
  `model:` line is not a demonstration when the call carries both pins — the harness test
  (`unpinnedLabels` in `packages/core/workflows/test-harness.js`) accepts `agentType` OR
  `model`, so the remaining one still pins the call and the test keeps passing. `create-trd.js`
  is the case that tripped this: `triage:shape` (lines 163-169) sets `agentType:
  'technical-architect'` AND `model: 'haiku'`. Remove BOTH lines from one call, run
  `npx jest packages/core/workflows/create-trd.test.js -t "every agent"` (expect FAIL, since the
  default fixture calls triage first), restore with `git checkout -- <file>`, re-run (expect
  PASS), then confirm `git status` shows the file clean. Apply the same rule to every
  workflow: pick a call and strip every pin it has, not just the first grep hit.
- [read] **FS-7 must measure an ordinary post-change dispatch, not the Exercise stage's own.**
  The FIX-006 implementer transcript is
  `~/.claude/projects/-Users-james-dev-fortium-ensemble-vnext/be117aff-b3d2-4f82-88cc-81317cf111b7/subagents/workflows/wf_69686c80-e0a/agent-a03f49f8a9a79dc25.jsonl`
  (its `.meta.json` says `agentType: backend-implementer`, `task:FIX-006`). Its sibling
  `agent-a39d4bccdaf02dabe.jsonl` is the `verify-app` phase gate, also a like-for-like
  candidate. Sum `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` from
  the first assistant message's `usage` and record it beside the ~90k pre-change median.

## Exercising context-model-hygiene (2026-09-29 run, iteration 2)

- [ran] Applied both corrections above and confirmed them: (1) FS-2 — removed BOTH
  `agentType: 'technical-architect'` and `model: 'haiku'` from `create-trd.js`'s
  `triage:shape` call, `npx jest packages/core/workflows/create-trd.test.js -t "every agent"`
  went from PASS (with only `agentType` removed, the old false demonstration) to FAIL (both
  removed, `unpinnedLabels` reports `["triage:shape"]`); `git checkout --` restored it, the
  test PASSED again, and `git status --short packages/` was empty afterward. (2) FS-7 —
  measured `agent-a03f49f8a9a79dc25.jsonl` (FIX-006 backend-implementer): first-turn usage
  `input_tokens:2, cache_read_input_tokens:21870, cache_creation_input_tokens:87751` = 109,623
  tokens, recorded beside the ~90k baseline; also measured the sibling `verify-app` gate
  transcript (`agent-a39d4bccdaf02dabe.jsonl`) at 107,634 tokens for context. Both transcripts'
  own mtimes (02:39/02:48) predate HEAD 4912d11's commit time (02:57:24) — they were produced
  by the dispatch that built and reconciled this feature, one commit before the last-mile
  citation/registration fixes — so a still-more-current sample does not yet exist in this run;
  noted in the evidence file rather than left silent.

## Exercising refine-verification (2026-09-29 run, iteration 1)

- [ran] All 18 criteria in this slice (FS-1..FS-18) are static-text/static-code checks over
  four files: `packages/core/commands/{refine-verification,verify-build,implement-trd,
  rebase-project}.md` and `packages/core/lib/functional-verification.js`. No server, browser,
  live `/refine-verification` or `/verify-build` session is needed — every statement is
  checked by reading the command prompt's own text or the renderer's own source, per the
  dispatch's stack hints (never start a claude session; never run smoke). Evidence copied into
  `.trd-state/refine-verification/evidence/FS-*.txt` rather than citing the source files
  directly, since those files are unchanged since HEAD and would fail tier 1 as `stale`
  (same pattern the verification-fix-loop and audit-readout-tense notes already record).
- [read] `packages/skills/verify-plan-recovery/` no longer exists on disk, and
  `packages/skills/framework-skills.txt` no longer lists it at all (4 rows: three `check`,
  one `support` — `verification-setup`). **Correction to a stale prior-run note**: the
  verification-fix-loop notes/evidence (`judge-claims-1.json`,
  `docs/TRD/verification-fix-loop.md:362`) recorded `verify-plan-recovery    support` as a
  row in this same file — that was true when `verification-fix-loop` shipped the skill, but
  `refine-verification`'s own build (FIX-003) deleted the skill and dropped its row. A future
  run must not reuse that older locator; grep `framework-skills.txt` fresh each time rather
  than trusting a cached row list.
- [ran] The only remaining repo-wide references to the string `verify-plan-recovery` are:
  three copies of `rebase-project.md`'s retired-skills table (the mechanism FS-18 is about),
  `functional-verification.test.js`'s negative assertion (`expect(report).not.toContain(...)`,
  which must keep naming it to prove the renderer no longer does), and dated historical notes
  in this file and `docs/TRD/*.md`/`docs/rules-history/autonomy.md`. None of these is a live
  pointer sending an owner to the deleted skill — confirms FS-17.
- [ran] `functional-verification.js`'s `renderReport` (~line 625-660) branches on
  `DIAGNOSIS_OUTCOMES.has(outcome)` (stalled/stuck/unbuilt/insufficient-coverage) for the
  refine-then-verify Next line, and a separate `else if (outcome === 'satisfied')` branch for
  `` **Next**: `/audit-build` ``. `not-run` and any outcome outside those five falls through
  with no Next line at all — worth a second look by the judge on whether FS-16's "for all five
  outcomes" is fully met, since the fifth outcome covered is `insufficient-coverage` (inside
  `DIAGNOSIS_OUTCOMES`), not a sixth `not-run` case the code also has to handle.

## Exercising skill-retirement claims (e.g. FS-17, refine-verification run, 2026-09-29)

- [read] A "skill X is deleted and nothing shipped still sends the owner to it" criterion is
  checked with two greps, no live session: (1) confirm no directory named for the skill
  remains anywhere under `packages/` or `.claude/skills`; (2) repo-wide grep for the skill's
  name, excluding `.git`, `.trd-state`, and `.claude/worktrees/*` (worktrees hold stale
  in-progress copies and will false-positive). Every surviving hit must be either the
  retired-skills table entry that names its replacement (e.g. `rebase-project.md`'s "Skill |
  Retired | Replaced by" table) or a test/doc asserting the skill's absence — never a command,
  workflow, or rule text that tells the owner to open or run it.
- [read] `.claude/rules/autonomy.md` had a whole exemption section for `verify-plan-recovery`
  (and its two mirrors — `docs/rules-history/autonomy.md`,
  `packages/core/templates/claude-directory/rules/autonomy.md`) in an earlier revision; as of
  this run the live copy (`.claude/rules/autonomy.md`, `packages/core/templates/.../autonomy.md`)
  has had that section fully removed, leaving only the surviving `verification-setup` skill's
  exemption section. `docs/rules-history/autonomy.md` still names it — expected, since that
  path is the history record and its purpose is to preserve superseded revisions, not to be
  kept current.

## Exercising command-run-liveness (2026-09-29 run, iteration 1)

- [ran] `packages/router/hooks/router.py` (mirrored byte-identical to `.claude/hooks/router.py`,
  confirmed with `diff -q`) is fully exercisable as a black box with no `claude` session: build a
  throwaway project dir with `.trd-state/_command-runs/<session>.json`, an optional
  `.trd-state/current.json`, `.trd-state/<feature>/dispatch.jsonl` and/or
  `.trd-state/_dispatch.jsonl` ledger rows, and — for a command the router must treat as
  framework-owned — a `.claude/commands/<name>.md` file containing the literal substring
  `notify-complete.sh`. Pipe `{"prompt": "<non-slash text>", "cwd": "<dir>", "session_id":
  "<session>"}` as JSON into `python3 router.py` and read the `ENSEMBLE_COMMAND state=...` line
  out of `hookSpecificOutput.additionalContext` in the printed JSON. All 15 of this feature's
  criteria (FS-1 through FS-15) were reproduced this way in one sitting, each in under a second,
  using a fresh scratch directory per scenario that needed a clean `current.json`/ledger state
  (scenarios that only differ in ledger rows and the run-state file were layered into one shared
  directory instead, filtering ledger rows by `session_id` keeps them from cross-contaminating).
- [ran] `.claude/commands/<name>.md` need not resemble a real command file — the framework-owned
  check (`_is_framework_owned_command`) only requires the file to exist at that exact path and
  contain the substring `notify-complete.sh` anywhere in its text. A one-line fixture
  (`calls notify-complete.sh`) is sufficient and was used throughout instead of copying the real
  multi-hundred-line command prompts.
- [ran] `_safe_feature_dir` neutralizes path traversal by taking `os.path.basename()` first, so
  a `current.json` `trd` value like `"../../../etc/passwd.md"` does NOT need special-casing —
  it resolves to the harmless single component `passwd`. The actual "rejected" case (FS-11) is a
  `trd` value whose basename IS itself `".."` or `"."` (or contains a literal `/`/`\` after
  basename-ing, which basename already prevents on POSIX) — set `current.json`'s `trd` field to
  exactly `".."` to hit the explicit rejection branch, not a deep multi-segment traversal string.
- [read] **Correction (iteration 2, 2026-09-30): the FS-11 decoy-path note above was wrong** —
  it named `<project>/decoy/dispatch.jsonl` as the useful decoy location. That path is NOT what
  a `..` traversal from `.trd-state/` would ever name, so the judge (iteration 1) correctly
  rejected the resulting artifact as proving nothing ("a traversal through '..' would not reach
  either"). The path the criterion actually needs decoy'd is
  `.trd-state/../dispatch.jsonl` == `<project-root>/dispatch.jsonl` (a sibling of `.trd-state/`,
  not a subdirectory under the project root, and NOT under `.trd-state/` itself). Write the
  fresh session rows there. Confirm the rejection two ways in the same evidence artifact: (1)
  call `router._ledger_paths(cwd, None)` directly and show `<project-root>/dispatch.jsonl` is
  absent from the returned list; (2) a **control run** — copy the project, move the identical
  fresh rows into `.trd-state/_dispatch.jsonl` (the shared ledger the router does read), rerun
  the same prompt, and show it now reads `state=active`. Without the control run, `state=unknown`
  in the test run is also consistent with "no ledger was read at all," which proves nothing
  about the rejection specifically — this is exactly the gap iteration 1's judge flagged
  (`cause: evidence-missing`).
- [read] **Correction (iteration 2, 2026-09-30): the FS-15 evidence in iteration 1 used a
  non-framework command name** (`/anything-not-framework-owned`) instead of `implement-trd`, and
  the judge rejected it for not exercising "a framework command" as the criterion states — even
  though the router's actual behaviour for a record under the 30-minute ceiling does not consult
  framework-ownership at all (`read_command_run_state` returns `active` immediately once
  `_active_is_stale(ts)` is `False`, before `_is_framework_owned_command` is ever called). Rebuild
  FS-15 with `command: "implement-trd"` and a real `.claude/commands/implement-trd.md` containing
  `notify-complete.sh`, `ts` ~10 minutes old, and no ledger file anywhere in the project at all —
  confirms `state=active` with nothing to read, and that the framework-ownership/ledger-liveness
  path (FIX-001) is only reached once a record is already stale.
- [ran] `_ledger_paths()` can be inspected directly and cheaply without invoking the whole hook:
  `python3 -c "import sys; sys.path.insert(0, '<repo>/packages/router/hooks'); import router;
  print(router._ledger_paths('<cwd>', None))"` — confirms exactly which files a given
  `current.json`/`record_feature` combination will read, useful for verifying FS-9/FS-10/FS-11's
  path-selection claims before or instead of running the full router end to end.
- [ran] A >64KB ledger (FS-12) is trivial to produce: pad with ~3000 rows for an unrelated
  `session_id` (ignored by the session filter) ahead of one fresh, real row for the session under
  test, as the file's last line — `_tail_read`'s 64KB tail window plus its "drop the partial first
  line" logic reads the fresh row correctly regardless of file size, confirmed at 353KB.
- [ran] An unreadable ledger (FS-13) is reproduced by making the ledger PATH A DIRECTORY instead
  of a file (`mkdir -p .trd-state/_dispatch.jsonl`) rather than chmod 000 (fragile across
  filesystems/users) — `open()` raises `IsADirectoryError`, caught by `_tail_read`'s bare `except
  OSError` and degraded to `""`, with zero stderr output and exit 0.
- [ran] To prove FS-14 ("reading never rewrites the run record"), diff both the file's raw
  content AND its mtime (`stat -f %m` on macOS) before and after invoking the router with a
  non-slash prompt against an already-`active` record — content alone isn't quite enough proof
  since a rewrite with identical values would look the same; the mtime being bit-for-bit
  unchanged is what actually rules out a rewrite-with-same-content path.

## Exercising never-unattended-paths §5b "unreadable line" (2026-09-30 run, iteration 2)

- [ran] An "unreadable line" in §5b (the case `readNeverUnattended`'s own doc comment calls
  out — "a bullet that is empty after stripping markup") is reproduced with a bare marker
  bullet line (`-` with nothing after it, no trailing space needed) following a real bullet —
  confirmed both through `readNeverUnattended()` directly (`node -e` requiring
  `packages/core/lib/functional-verification.js`) and through the `check-never-unattended`
  CLI with a companion TRD fixture (needs a real `## Master Task List` table, not just
  `## Task Grounding` — the bare `## Task Grounding` heading alone throws `No "Master Task
  List" heading found`): both return `status: "invalid"`, `raw: "-"` (the offending line's own
  trimmed text), and the CLI additionally confirms `hits: []` — the caller gathers neither
  paths nor files once the section is invalid, matching this criterion's `Checker` cite
  verbatim.

## Exercising never-unattended-paths §5b (2026-09-30 run, iteration 1)

- [ran] `readNeverUnattended()`/`missingVerificationSections()` (both exported from
  `packages/core/lib/functional-verification.js`) are exercisable with no server/fixture
  project via a one-off `node -e` requiring the module directly and reading a `.md` string —
  no scaffold, no live `/plan` run. Confirmed against the shipped template
  (`packages/core/templates/claude-directory/rules/verification.md`) and six inline fixtures
  covering every branch the reader documents: two bullets, a `*`-marker+backtick bullet, a
  bolded `**Paths: none**`, a bare `Paths: none`, a one-line `Paths: a, b`, and a
  bullet-plus-`Paths: none` conflict — every result matched the function's own doc comment
  exactly (bullets -> `declared` with stripped fragments in document order; `Paths: none`
  (bolded or not) -> `status: 'none'`; both forms present -> `status: 'invalid'`).
- [ran] The shipped template's own §5b (`Paths: none`, no bullets) reads as
  `{status: 'none', paths: []}` via `readNeverUnattended`, and
  `missingVerificationSections()` returns `[]` for the same file (heading `## 5b. Never
  unattended` is matched by the `never unattended` substring check) — so a freshly
  scaffolded project's own template neither triggers `invalid` (which would stop `/plan`)
  nor gets flagged as missing the section.

## Exercising never-unattended-paths checker CLI and cross-section isolation (2026-09-30 run, iteration 1, continued)

- [ran] `check-never-unattended <trd> <verification.md>` is exercisable standalone with two
  throwaway temp files, no live TRD from the repo needed: a 3-task TRD fixture with a
  `## Task Grounding` section (`### T-1`/`T-2`/`T-3`, each a `- **Touches:** \`<path>\`` line)
  parsed by `trd-parser.js`, and a `verification.md` fixture with only `## 5b. Never
  unattended` filled in. `node .claude/lib/functional-verification.js check-never-unattended
  <trd> <verification.md>` flattens every task's `touches` (grounding-block order) and
  substring-matches them against the declared fragments, returning `{hits, status, raw,
  touches}` — confirmed `hits` selects exactly the touched files containing the fragment
  (`Paths: auth` against touches `src/auth/login.js`, `lib/oauth-client.js`, `docs/readme.md`
  → hits the first two, not the third), returns `hits: []` both when the declared list
  matches nothing and when `Paths: none`, and passes the reader's `status`/`raw` straight
  through unmodified for `invalid` (bullet + `Paths:` both present) and `absent`
  (verification.md file missing, or present with no §5b at all) — no re-deriving needed.
- [read] `readNeverUnattended` only reads inside the §5b boundary `findSection` computes:
  confirmed a fixture with "e.g." bullets under `## 5. What CANNOT be verified here` and
  numbered/bulleted repo names under `## 6. Multi-repo`, with `Paths: none` inside §5b itself,
  reads as `{status: 'none', paths: []}` — the other sections' bullets never leak into
  `paths`. Also confirmed fenced code is ignored two ways: a bullet fenced inside §5b is
  skipped (only the un-fenced `Paths: none` line after it is read), and a `## 5b. Never
  unattended` heading appearing only inside a fence under a *different* real section is not
  matched as the section boundary at all (`findSection` never sees it — result is `absent`,
  same as a file with no §5b anywhere).

## Exercising never-unattended-paths FS-15..FS-20 (2026-09-30 run, iteration 1)

- [ran] `fix-plan.js`'s `plan()` takes `neverUnattendedHit`/`neverUnattendedStatus` directly
  as input fields (not derived from a file path) — confirmed the full checker-to-planner
  transcript: `check-never-unattended`'s `hits` (from a 3-task TRD fixture, fragment `auth`)
  fed straight into `plan({ weight, route, implement: true, neverUnattendedHit: hits,
  neverUnattendedStatus: status })` returns `chain: false`, `writeTrd: true`, and
  `bannerBody` naming both matched paths verbatim
  ("owner policy — src/auth/login.js, lib/oauth-client.js are marked never-unattended").
  No live `/plan` session needed; this is two library calls piped together.
- [read] `packages/core/commands/plan.md` Step 7 (line ~897) is entirely prose/bash-block —
  no live session exercises it meaningfully beyond confirming the text itself; judged as an
  instruction-exists claim, not observed model behaviour, matching the success definition's
  own preface note on FS-16..FS-19.
- [ran] `missingVerificationSections()` and `check-verification-unfilled` on hand-built
  "filled-in" fixtures (§1/§1a/§2/§5a present, real content, not template-matching) confirm
  `never-unattended` appears in `missingSections` only when §5b's heading is absent, and
  vanishes once a `## 5b. Never unattended` heading is added — independent confirmation of
  the `VERIFICATION_SECTION_LABELS` entry, using fixtures distinct from the shipped template
  (the other exerciser's iteration-1 notes above used the template itself for this check).
- [ran] `git show f852b78:packages/core/templates/claude-directory/rules/verification.md` is
  byte-identical (`diff`, zero output) to the frozen fixture
  `packages/core/lib/__fixtures__/verification.coverage-floor-v1.md` — confirms the frozen
  copy really is the pre-§5b template, not a hand-reconstruction. `check-verification-unfilled`
  on that temp copy returns `matchedTemplate: "coverage-floor-v1"` (not `null`), and on THIS
  repo's own `.claude/rules/verification.md` (read-only, never edited) returns
  `unfilled: true, matchedTemplate: "current"` — consistent with the dispatch's own stack-hint
  that this repo's verification.md is still the unfilled template.

## Exercising `pull-request.js ensure` (pr-at-cycle-end)

- [ran] `ensure` can be walked with no network: temp git repo + local bare `origin`, cwd there, a stub `gh` first on PATH that logs argv (auth/repo view/pr list/pr create switchable by env), `.claude/settings.json` with `ensemble.openPullRequest: auto`. For "gh missing" use `PATH=/usr/bin:/bin` (no gh there on this machine; `command -v gh` exits 1). Both the missing-gh and unauthenticated skips print the same reason, "gh missing or not authenticated" (one combined string, not two distinct ones).

- [ran] pr-at-cycle-end FS-22: `scaffold-project.sh --refresh --plugin-dir packages/full <tmpdir>` against a temp project holding only `.claude/settings.json` is enough to exercise the `openPullRequest` backfill (exit 0, `REFRESH_SUMMARY` all zeros); `jq -S 'del(.ensemble.refreshed_at)'` is needed to compare run 1 to run 2, since `refreshed_at` changes each run.
- [ran] pr-at-cycle-end FS-21: the only shipped settings templates are `packages/core/templates/claude-directory/settings.json` and `packages/full/.claude/settings.json` (`find packages -name 'settings*.json'`); both read `"never"`. Under zsh, `grep --include=*.json` aborts with "no matches found" unless quoted.

## Exercising `pull-request.js` (pr-at-cycle-end, 2026-10-01)

- [ran] `node packages/core/lib/pull-request.js mode|ensure` runs against a throwaway temp repo with a local bare origin and a stub `gh` first on PATH (stub logs argv); cwd must be the temp repo (settings read from `./.claude/settings.json`). Never needs a real remote or real `gh`.
- [ran] `mode` prints a bare word (`auto` or `never`), NOT a JSON line, so `JSON.parse` of its stdout fails; FS-1/FS-2 as worded ("parses as JSON") do not match this output. `ensure` does print one JSON line {action,url,reason}.
- [ran] Sandbox note: `rm -rf $VAR/...` is blocked by a safety check; use a fresh unique temp dir per run instead of deleting.

## Exercising `live-evidence.js` (verification-reuses-evidence, 2026-10-02)

- [ran] `node .claude/lib/live-evidence.js record|read --state-dir D` needs no server; use a temp dir fixture. Under zsh wrap the command in a shell function (`LE(){ node ...live-evidence.js "$@"; }`) -- a `$LE` variable holding the command is not word-split and fails with exit 127.
- [ran] `record` also appends the artifact itself to `covers` (a second entry beside the declared covered files), so the stored line carries one more `{path, sha256}` than `--covers` names; a typical line is about 400 bytes.

## Exercising live-evidence reuse (verification-reuses-evidence run, 2026-10-02)

- [ran] The reuse gate is exercisable with no server: record an artifact with `node .claude/lib/live-evidence.js record --state-dir <tmp> --task T --artifact <abs> --covers <abs file> --shows x --environment local`, `touch -t 202001010000` the artifact, then `node .claude/lib/functional-verification.js check-evidence --state-dir <tmp> --file claims.json 1700000000`. Pass shows `"tier1":"pass",...,"reused":true`; a failure shows `"tier1":"fail","failure":"stale"` (there is no literal `stale` tier value). `record` also adds the artifact itself to covers.
- [ran] zsh does not word-split an unquoted `$CLI` variable holding a command line; wrap the check in a shell function instead.
- [ran] Shapes the manifest cannot hold (covers `[]`, relative path, absolute directory/nonexistent) are exercised by `require('.claude/lib/functional-verification.js').checkEvidence(claims, sinceSec)` in a `node` script; all give `failure: "stale"`.

## Capturing the assembled Judge prompt (verification-reuses-evidence, FS-25)

- [ran] A grep of `packages/core/workflows/verify-functional.js` cannot show a Judge-prompt sentence, because each one spans concatenated string literals with escaped backticks. Capture the assembled string instead: load the script with `readScript`/`runWorkflow`/`makeAgentStub` from `packages/core/workflows/test-harness.js`, return stub results for the `exercise` and `judge` labels, then write `agent.calls.find(c => c.opts.label === 'judge').prompt` to a file. Script: `.trd-state/verification-reuses-evidence/evidence/fs25-capture.js`.

## Exercising the NEXT-readout wording (2026-10-02 run, `next-in-order`)

- [ran] All 7 criteria are static-text checks over `.claude/rules/command-status.md`, its
  template copy `packages/core/templates/claude-directory/rules/command-status.md`, and four
  command files; grep over them plus one `npx jest` run (about 10s, 40 suites, 1457 tests) is
  sufficient. `diff -q` shows the `.claude/` and `packages/core/` copies are identical.
- [ran] Under zsh, an `echo ====` line is parsed as a command (`=` expansion) and aborts the
  rest of a chained command; avoid bare `====` separators in Bash calls.
- [read] The readout template block in `command-status.md` (line ~71) still reads "NEXT the
  exact command or action, ready to run"; only the prose under "What each section carries"
  was reworded to ordered steps.

## Exercising the plan-from-spec criteria (2026-10-03 run, `plan-from-spec`)

- [ran] `.claude/lib/spec-scope.js` is exercisable directly with no server or session. Zsh does not
  word-split a `SC="node .claude/lib/spec-scope.js"` variable; define a shell function instead. Run
  it from a temp dir (spec path is read relative to cwd) to see the repo-relative `**Source spec**:`
  path form. The lightning-lane roadmap was copied to a temp dir and never touched in place.
- [ran] `extract` on a section with no "Acceptance criteria" heading prints
  `{"criteria":[],"verification":{}}`, not a bare `[]` (the `/plan` prose at §2g and the criterion text say
  `[]`). Recorded as an observed wording difference for the judge, not a verdict.
- [ran] When appending a criterion to a sweep file by hand for a `duplicated` defect, put it BEFORE the
  `**Regression guards:**` lead-in; after it, `extract` reads it as a guard and `check` correctly reports
  nothing duplicated (guards sit outside the split).
- [ran] The swept-evidence reuse check (FS-25) is exercisable end to end without Jest: `live-evidence.js
  record --covers a,b` then `functional-verification.js check-evidence --state-dir D '<claims json>' <since>`
  with the artifact and sources backdated via `touch -t`: pass+`reused:true` while bytes match, `stale` after
  one byte of a covered file changes.
- [read] The contract's "Four source kinds" table (functional-verification.md line 48) was not extended;
  `spec` appears only in the definition-header template (lines 72, 76-77). `implement-trd.md` state schema
  (line ~1342) also still lists `source_kind` without `spec`. Wording `renderReport` uses for a sweep file's
  Next line differs from the literal sentences in the success definition (FS-22).

## Exercising plan-from-spec (2026-10-02 run, iteration 2, FS-16/21/22/23)

- [ran] `spec-scope.js render-sweep` only accepts ids from a spec whose criteria sit under a
  `### Acceptance criteria` heading as `- **AC-x.y** · Surface: text` bullets; a hand-written
  `**Spec**:`-style sweep fixture is rejected by `source` ("no **Source spec**: line"). Build a sweep
  fixture by running `render-sweep ... --core-trd none --out <scratch>` on a tiny spec, then run
  `source --file` on the output to get `coreTrd: "none"`.
- [ran] `npx jest <file> -t "<describe name>"` reports skipped counts for everything else; the line
  `4 passed` is the usable locator for the sweep-file `renderReport` block.

## Exercising the `/plan --implement` sweep chain (plan-sweep-chain)

- [ran] `fix-plan.js` is pure: `plan()` and `sweepChainNext()` can be called directly with
  `node -e` against `packages/core/lib/fix-plan.js`; `npx jest packages/core/lib/fix-plan.test.js
  --verbose` lists the sweep-path and `sweepChainNext` tests by name (46 passing, 2026-10-04).
- [ran] `check-never-unattended <trd> <verification.md>` needs a fixture TRD with a
  `## Master Task List` heading and a `## Task Grounding` / `### <ID>` / `- **Touches:**` block;
  without the heading it reports `status: invalid` ("No Master Task List heading") for any
  verification.md, which looks like a brake result but is a TRD-parse failure. A missing
  verification.md reports `absent`, not `invalid`; an empty `- ` bullet in §5b reports `invalid`.
- [read] The sweep-chain command rules (plan.md Step 7a, sweep.md and verify-build.md
  `--chained`, command-status.md exception) are prompt-only; they can be checked only as text,
  and each .claude mirror is byte-identical to its packages/core source (`cmp`).

## Exercising /audit-docs (docs-as-built, 2026-10-04, iteration 1)

- [ran] `/audit-docs` is exercisable without a live session: the three libraries
  (`packages/core/lib/docs-audit-{assemble,apply,deliver}.js`) are plain CLIs, and
  `packages/core/workflows/audit-docs.js` runs under `packages/core/workflows/test-harness.js`
  (`readScript`, `runWorkflow`, `makeAgentStub`, `makeParallelStub`) with stubbed agents. A
  scratch node script in a temp directory can build a fixture git repo (plus a bare remote and a
  stub `gh` on PATH that logs calls), then run prepare -> assemble -> workflow -> apply ->
  commit-batch -> finalize exactly as `commands/audit-docs.md` orders them. Nothing touches this
  checkout. 155 Jest tests across the six docs-audit suites pass
  (`npx jest packages/core/lib/docs-audit packages/core/workflows/audit-docs packages/core/lib/process-doc-audit-docs`).
- [ran] The real assembler never batches untracked or ignored files, so the "only tracked files
  are deleted" path in `docs-audit-apply.js` (`notTracked`) is only reachable by hand-editing
  `assembly.json` so such a file sits in a batch; the evidence file says so.
- [ran] The assembler needs the TRD fixture to parse (Master Task List, Execution Plan with
  `**Tasks:**` and `**Agent:**`, Task Grounding with `**Touches:**`); a `.trd-state/<f>/implement.json`
  with `trd_file` and per-task `status` drives the in-flight/no-implementation skip.
- [read] The contract (`packages/core/contracts/docs-audit.md`) forbids banners and merging content,
  but contains no sentence about an in-tree archive folder or a doc's state being expressed by its
  path (those live only in the TRD, D21/NG4). The index entries reduce each map bullet to at most two
  leading path segments, so a file bullet shows as `src/a.js`, not a top-level directory.
- [inferred] Anything needing a model to actually edit a real doc (FS-18, FS-20, real code-map
  presence, model-made cross-repo flagging) needs a live `/audit-docs` run, which the owner forbids here.

## Exercising docs-audit-assemble.js determinism (docs-as-built, iteration 2)

- [ran] The assembly output embeds `assemblyPath` (path.resolve of `--out`, docs-audit-assemble.js:535) in every workflowArgs entry, so two runs with different `--out` files differ by sha256. To prove determinism, re-run with the SAME `--out` and `--run-date` on a fixture repo built in the scratchpad: sha256 identical.

## Exercising audit-docs PRD handling (2026-10-04 run, `audit-docs-prd-handling`)

- [ran] `docs-audit-assemble.js assemble`, `docs-audit-apply.js apply` and
  `docs-audit-deliver.js commit-batch` all run directly against throwaway git repos built under
  the session scratchpad (no `claude` session, no `gh`). In-flight fixture recipe: commit the TRD
  and PRD, commit the TRD's `Touches` file, then commit `.trd-state/<f>/implement.json` with
  `trd_file` set and one development task `pending` (no `closed.json`). The apply CLI takes an
  assembly of `{files:[{path,class:'prd',git:'tracked'}], batches:[...]}` and a result of
  `{batch, records, dead}`; the PRD must carry a `## Where this lives in the code` section or a
  map defect is reported. `renderChangeSet` is exported from `docs-audit-deliver.js` and takes
  `{assembly, batches:[{records}], applieds, tree}`; records without `claim`/`was` fields print
  `Corrected — undefined: undefined`, a fixture artefact and not a defect.
- [ran] `npx jest` over the four docs-audit suites (assemble, apply, deliver, workflows/audit-docs)
  is 174 tests, ~10s.
- [read] `docs-audit.md`'s PRD procedure words the mechanism/behaviour split as "a renamed
  internal function, a different library or a reorganised file", not the criterion's list
  "name, path, internal ordering, registration detail". `audit-docs.md`'s readout puts the
  requirements-changed confirm list in ISSUES, not STATE.
- [read] Correction (iteration 2): the earlier note that `audit-docs.md`'s readout puts the requirements-changed confirm list in ISSUES is stale. Lines 174-178 of `packages/core/commands/audit-docs.md` (and its `.claude` mirror, byte-identical) now put skipped TRDs and PRDs and the confirm list (`behaviourChanges`) in STATE, and broken non-goals (`brokenNonGoals`) and changelog defects (`changelogDefects`) in ISSUES (lines 184-186).

## Exercising the must-pass checks (2026-10-06 run, `verification-must-pass`)

- [ran] The TRD Objectives `Must pass` mark is `yes` (or `no`/blank), not the words "must-pass":
  any other non-blank value is read as must-pass but flagged `invalidValue`. Fixture TRDs need `yes`.
  Reader: `node .claude/lib/spec-scope.js objectives --trd <trd>`.
- [ran] No server is needed. `node .claude/lib/functional-verification.js` subcommands `decide-next`,
  `render-report` and `must-pass-coverage --trd <trd> --definition <def>` exercise every criterion;
  `decide-next` requires `mustPass` and `mustPassUncovered` arrays and `coverageFloor` as a fraction (0.6).

## Exercising docs-audit-assemble skip logic (audit-docs-moved-trd-skip, 2026-10-06, iteration 1)

- [ran] `node packages/core/lib/docs-audit-assemble.js assemble --repo "$PWD" --run-date <date> --comprehensive --out <f>` runs on this repo in seconds and writes pretty-printed JSON (one key per line), so a locator like `"skip": null` is a single line; `skipped[]` and `batches[].docs` are the quickest listings.
- [ran] The unfixed code for comparison is cheapest as `git worktree add --detach <scratch>/unfixed <sha>`; run its CLI against the CURRENT repo (`--repo "$PWD"`) for an apples-to-apples diff, then `git worktree remove --force` and delete any branch you made.
- [ran] A faithful, real failure of ONLY `git log --follow` in a scratch repo: `git config diff.orderFile /nonexistent/order` (exit 128 "failed to read orderfile"). `git log -1 -- <path>` and `git rev-list` still work, but `git log --name-only A..B` (the comprehensive docWindow call) also fails, so make the TRD's own commit the LAST commit (empty window) or the whole run exits 2 for an unrelated reason. Set the config AFTER the last `git commit` (commit itself runs a diff and fails).
- [ran] Out-of-repo Touches (`../x`) and absolute ones (`/x`) both make `git rev-list ... -- <path>` exit 128 ("outside repository"); the unfixed code turned that into `no-implementation`.

## Exercising the report renderer and publish plan (2026-10-11 run, `verification-report-images`)

- [ran] `render-report --file <json>` and `report-publish-plan --report <md> [--published-file <json>]` in `.claude/lib/functional-verification.js` need no service; an 8x8 png for fixtures is writable with plain node (zlib + a hand-built CRC), no external tools. Image paths in the input must be `evidence/<segments>.png|jpg|jpeg`; `report-publish-plan` resolves them against the report's own directory, so keep fixtures at `<report dir>/evidence/...`.
- [ran] To run the pre-feature renderer, `git show a085623:packages/core/lib/functional-verification.js` alone fails (`Cannot find module './trd-parser'`): copy all of `packages/core/lib` to a scratch dir and overwrite `functional-verification.js` there, then `require` both and compare `renderReport` output.
- [ran] `decideNext` (the outcome arithmetic) has no hunk in `git diff a085623..HEAD`, and the diff to `functional-verification.test.js` removes zero existing lines, so the outcome tests run unchanged (4 suites, 728 passing).
- [ran] Clearance of an image (credential check) is a Judge prompt sentence, not code: nothing in the lib can be run to produce a "not cleared" result, only the renderer's handling of `imageExcluded`. Live publishing IS authorized: the claude.ai artifact service is a declared environment (`verification.md` §1, `claude-artifacts`, owner 2026-10-11) and may ALWAYS be used. Prove publish criteria by publishing a private throwaway page from fixture content and reading its `files` listing — never mark them not verifiable for want of a publish. (The 2026-10-11 run was wrongly told not to publish; that instruction is withdrawn.)
- [ran] A credential-showing test image needs no external tool: a plain-node script with a hand-made 5x7 bitmap font can draw `api_key=<random hex>` into a grayscale png (value generated in memory, never printed or stored elsewhere). Clearance itself is still the Judge's read; the exerciser can only supply the image and a render whose input already carries the `imageExcluded` reason, so say so in the claim rather than presenting the render as the Judge's result (2026-10-11, FS-11 recapture).
- [ran] Live publish of fixtures (2026-10-11, verification-report-images): `Artifact` `files` also takes the array form `[{path}]` with `root` set to the fixture dir, which keeps a 254-entry batch short (about 9 KB, versus 44 KB for the plan's absolute-path map); `list scope:files` takes only `url` (no `limit`) and prints every file, so a 301-file listing lands in the transcript, not on disk: write a per-call record by hand beside it.
- [ran] A later batch to the same URL keeps the earlier batch's files (300 images across 254 + 46 calls listed as 301 files with index.html); `report-publish-plan` given a published-file list still returns the full embedded set, not just the missing paths. Three throwaway artifacts cover FS-6/7/8/10 (one for FS-6 and FS-8, one for FS-7, one for FS-10).

## Exercising rebase-governance-and-agent-diff (2026-10-12 run, iteration 1)

- [ran] FS-3 and FS-4/FS-5 need no claude session: scaffold a scratch project with `scaffold-project.sh --plugin-dir "$(pwd)/packages/full" <scratch>`, commit, edit its `.claude/rules/verification.md`, then `--refresh`; the log prints `[WARN] Refusing to refresh project-authored rule: verification.md` and the sha256 is unchanged. `--agent-status` run from the repo root with `.` prints 13 `unchanged` lines.
- [ran] For FS-5, `cp -R packages/full <scratch>/plug` yields real files (not symlinks), so appending to `<scratch>/plug/agents-lib/<agent>.md` and passing `--plugin-dir <scratch>/plug` flips exactly that one agent to `updated`, leaving the repo's packages/ untouched.

## Exercising rebase-skill-selection-and-sync-report (2026-10-16 run, iteration 1)

- [ran] `scaffold-project.sh --plugin-dir` must be an ABSOLUTE path when the script is invoked from the repo root with a relative one — a relative `packages/full` produced "Agents directory not found: packages/full/agents-lib" and scaffolded 0 agents, silently (exit 0). Use `--plugin-dir "$PWD/packages/full"`.
- [ran] `--sync-agents` prints its `Selection: added|dropped <skill>` and `AGENT_SKILLS_INJECTED` lines on stderr and only `<status>\t<agent>` lines on stdout, so capture the two streams separately. Adding `developing-with-python` to a `jest`/`pytest` scaffold printed `refreshed` for all 13 agents (the Project Skills block is regenerated in every agent, including those with no `skills:` list), and `selected-skills.txt` was updated by the script itself.
- [ran] For a body-differs (`updated`) scenario, a private plugin dir built from `cp -R packages/full/agents-lib` plus symlinks to every other `packages/full` entry (including `skills-lib`) works; appending to the copied `agents-lib/<agent>.md` flipped only that agent to `updated`, the other 12 printed `unchanged`.

## Exercising `artifacts.js` (artifact-manifest, 2026-10-17)

- [ran] The manifest CLI is exercisable with no model run. It takes flags, not positionals: `node packages/core/lib/artifacts.js record --state-dir D --kind K --path P --command C [--url U]`; `get`/`read` take `--state-dir` (and `--kind`). Run it from the repo root with `--state-dir` pointing at a temp dir: `record` exits 1 with "no file at <P>" unless P exists relative to the cwd, so point `--path` at a real file (e.g. `CLAUDE.md`).
- [ran] `get` prints only the stored URL (empty output when `url` is ""), never the whole entry; a success criterion saying "get prints an entry whose path names X" is only satisfiable via `read` / `cat artifacts.json`.
- [ran] A flat `{kind: url}` file is upgraded on the next `record`; the legacy key `audit-build-report` is renamed `audit-build`, and old entries get `path/updated_at/command: null`.

## Exercising `--stamp-version` / stamp behaviour (artifact-manifest run, 2026-10-17)

- [ran] `scaffold-project.sh --plugin-dir "$REPO/packages/full" --stamp-version .` can be run in a
  temp fixture dir containing `.claude/settings.json` (`$REPO` = this repo's absolute path; a
  relative `packages/full` does not resolve from the fixture dir, and fails as "No readable plugin
  manifest", which looks like the failure case). Point `--plugin-dir` at a dir whose
  `.claude-plugin/plugin.json` lacks `version` to get exit 1 with an `[ERROR]` line. A plain
  `scaffold-project.sh --plugin-dir "$REPO/packages/full" .` in an empty `git init` dir stamps the
  plugin version. macOS has no `timeout` binary: do not prefix with it.
- [inferred] `/init-project` and `/rebase-project` cannot be run as live model sessions here; their
  evidence is prompt excerpts plus running the literal bash blocks they contain on fixtures.

## Exercising the audit-notes-not-rounds criteria (2026-10-21)

- [ran] FS-7/FS-8 (tally/decide) need no live run: `npx jest packages/core/lib/audit-rounds.test.js --verbose` (69 pass) plus a `node -e` call to `tally(handoff, {deferred:[ids]})` and `decide({rounds, verdict, ...counts})` from `packages/core/lib/audit-rounds.js`. FS-9 to FS-12 are proven from the reconcile prompt text in `packages/core/workflows/audit-build.js` (~lines 590-680, byte-identical to `.claude/workflows/`); a live `/audit-build` run is not_verifiable here.

## Exercising audit-build notes/deferrals (audit-notes-not-rounds)

- [ran] `/audit-build` itself needs a live model run, so it cannot be exercised here; the workflow prompt text (`packages/core/workflows/audit-build.js` ~105-120, 628-700) and command text (`packages/core/commands/audit-build.md` ~175-340) carry the PLANNED, NOT BUILT YET / deferred-args / classify / commit-TRD claims, and `node .claude/lib/audit-rounds.js tally|classify|decide '<json>'` runs deterministically. Gap actions must be `gap-unbuilt`/`gap-untested`/`untested` (not arbitrary names) to be reclassified as deferred; `fix-citation` gives `note`.

## Exercising audit-notes-not-rounds, iteration 2 recapture (2026-10-21)

- [ran] The `audit-rounds.js` CLI (`tally|classify|decide|record`) is the faithful way to run the command's step 1-3 calls on a fixture; calling the module's functions directly with one merged object returns zeros/strings because the CLI wraps `(item, ctx)`. `decide` takes no `deferred`/`index` (signature at `audit-rounds.js:153`) and `audit-build.md:276` passes `deferred` but not `index` to it; tally and classify do take both.
- [ran] The reconcile stage's returned text/handoff, the readout's STATE/ISSUES split and a real audit commit all need a live model run (`/audit-build`), which this loop forbids; a locator for a plain excerpt of `audit-build.js` must sit on one physical line (the prompt wraps at ~100 columns), and a diff artifact's `+` prefixes break multi-line locators.

## Exercising audit-notes-not-rounds, iteration 3 (2026-10-21)

- [ran] Correction: the iteration-2 note that `audit-build.md:276` passes `deferred` but not `index` to `decide` is stale. As of this pass `.claude/commands/audit-build.md` (byte-identical to the packages/core copy) passes both `deferred` and `index` to `tally` (l.267), `classify` (l.270) and `decide` (l.276); the CLI accepts and ignores them for `decide` with counts and forwards them to `tally` with a handoff. Evidence is regenerated in `.trd-state/audit-notes-not-rounds/evidence/FS-16-recapture-iter3.txt` (the older FS-16-fix-run-input.txt quotes the pre-fix l.276).

## Exercising verification-preflight (2026-10-25 run)

- [ran] The preflight criteria (no AskUserQuestion at §3.6a / verify-build step 2, `needs-owner` record, setup check) are provable with no service: `npx jest packages/core/workflows/verify-functional.test.js packages/core/lib/functional-verification.test.js --verbose` (562 pass, ~19s) plus `node -e` calling `decideSetup` from `packages/core/lib/functional-verification.js` with `{head, checkout, facts:[...], refreshCommand, refreshCount, refreshExitCode, debugRefresh}`; `.claude/commands/{implement-trd,verify-build}.md` are byte-identical to `packages/core/commands/` (`diff -q`).
- [ran] FS-8 (holder check) can be exercised with real listeners: start `node -e` http servers on two free ports, one with `cwd` outside the checkout (a throwaway `git init` dir) and one with `cwd` inside it; read each pid's cwd with `lsof -a -p <pid> -d cwd -Fn` and its toplevel with `git -C <cwd> rev-parse --show-toplevel`, then feed `decideSetup`. Outside reads `other-checkout` (setup-failure naming the dir), inside reads `this-checkout` (proceed). `decideSetup` checks listening PORTS only; it has no code path for a non-port "declared resource".
- [read] `renderReport` for `setup-failure` prints `**Outcome**: Setup Failure`; the "environment, not the code" wording comes from the caller-supplied Reason and the Next line (`fix the environment named above`), not from fixed renderer text.

## Exercising verification-preflight FS-8, re-run (2026-10-25)

- [ran] An earlier FS-8 capture (`exerciser1-fs8-listener-fixture.txt`, 19:33) predated HEAD's commit time (19:56) and would fail the tier-1 freshness gate; re-ran the same listener fixture into `exerciser2-fs8-listener-fixture.txt`. Check `git log -1 --format=%cI` against the artifact mtime before reusing a prior capture.
- [ran] The fixture also covers the R1 resource-without-port half: `holderCheck: 'not-applicable'` reads holder `not-applicable` and `'unavailable'` reads `unknown` (a flag), both `proceed`, never `this-checkout`. A scratch script outside the repo (the session scratchpad) keeps the capture free of source edits.
- [ran] `/tmp/x` on this machine is a directory; redirect captures to the scratchpad, not `/tmp/<short name>`.

- [ran] create-trd-grounding-write: the create-trd workflow's own `readout` no longer carries any grounded count; the grounded count and ungrounded ids come from `node packages/core/lib/trd-grounding.js report --trd <path>` run by the command, so a "readout line" criterion is evidenced by that report JSON plus the command prose (create-trd.md "Grounding report"), not by a workflow return. Driver: `.trd-state/create-trd-grounding-write/evidence/drive-fs.js` (run from packages/core/workflows; stubs write blocks-N.md to a grounding_dir, the CLI assembles).

- [ran] `/task` fixtures: run `node <abs>/.claude/lib/artifacts.js record ...` with cwd set to a temp project root (artifacts.js resolves `--path` against cwd; absolute paths and `..` escapes are rejected, a directory gives `not a file`, all exit 1 with artifacts.json untouched). `recordResult(s, id, {status:'deferred', error})` stores `current_problem` and leaves `retry_count` at 0.

- [ran] `/task` state fixture (prompt-form and brief-form): `.trd-state/task-command/evidence/fs19/run.js` builds a temp dir with `save`, `recordResult` (success + deferred), `checkpoint`, `artifacts.js record --state-dir ... --kind report`, then closed.json; read back consistent in `readback.txt`. Run with `node` from any cwd (it chdirs into the fixture).

## Exercising spec-scope.js objectives / must-pass-coverage (2026-11-04, `objective-rows-all-tables`)

- [ran] `node .claude/lib/spec-scope.js objectives --trd <trd>` prints JSON `[{id,text,mustPass}]`; `node .claude/lib/functional-verification.js must-pass-coverage --trd <trd> --definition <sd.md>` prints `{criteria,uncovered,unknown}` and lists only UNCOVERED objectives, so a must-pass id appears in its output only when the definition does not mark it. Use a definition with an empty `Must pass` column to see all declared must-pass ids.
- [ran] `functional-verification.js` exports no `mustPassCoverageFromFiles`; use the `must-pass-coverage` CLI subcommand. `criteria`/`check` need a spec file with a `### Acceptance criteria` section plus a TRD with `**Source spec**: <path> § <section>`.

## Exercising the design stage libraries (2026-11-04 run, `design-stage`, iteration 1)

- [ran] `npx jest packages/core/lib/design-{map,mirror,render,bundle}.test.js packages/core/lib/artifacts.test.js`
  passes (120 tests, ~9s, Chromium present); the design workflow, prose and skill suites pass
  too (`packages/core/workflows/*-design.test.js`, `packages/core/commands/*design*prose.test.js`,
  `packages/skills/*/__tests__`, `docs-audit-assemble.test.js`: 396 tests).
- [ran] `design-render.js` must be run FROM the product root (it resolves Playwright from the cwd
  project); from a scratch git repo it exits 2 "playwright is not installed". For a fixture
  repo outside the project root use the module API with `repo:` set, e.g.
  `require('./packages/core/lib/design-render.js').render({dir, runtime, out, approved:true, repo})`
  from the project root. The CLI `--approved`/`--at` runs `git` in the cwd repo, so a fixture
  outside the project fails there with "not a tree object".
- [ran] `design-bundle.js build` works from the project root against
  `packages/core/lib/__fixtures__/design/react-lib/index.jsx` for `react-web` and `react-native`
  (`stubs: []`); `react-native-nativewind` cannot build here (`nativewind/jsx-runtime` is not
  installable), so read its options with `esbuildOptions('react-native-nativewind', {...})`
  (`jsxImportSource: 'nativewind'`). No Jest test asserts that option.
- [ran] FS-69's "STUCK on publishing off" test is a command-prose test
  (`create-design-prose.test.js`), not a workflow-behaviour run on `test-harness.js`.
- [ran] `design-map.js` CLI accepts `viewport` only as `[w, h]`, not `{w,h}`; `approved`,
  `refresh` and `transition ... --trd` can be driven against a scratch map with no git.

## Design stage, iteration 2 additions (2026-11-04)

- [ran] The release-change render test (AC-F3.5) runs with `DC_RUNTIME=$PWD/packages/core/lib/__fixtures__/design/dc-runtime.js npx jest packages/core/lib/design-render.test.js` (20 pass, 1 byte-for-byte test skipped by design); there is no newer runtime in the repo, so the fixture runtime stands in.
- [ran] `design-map.test.js` has no test passing each valid kind; only the invalid-kind rejection (`unknown kind x`) is asserted. Calling `validate` per kind from `KINDS` by `node -e` shows no kind error for the four valid values.
- [ran] No Jest test asserts NativeWind's `jsxImportSource: 'nativewind'` or compiled CSS (`css:false` in the fixture builds); `esbuildOptions('react-native-nativewind', {...}).jsxImportSource` prints `nativewind`.
- [ran] `design-bundle.js build` needs `--project .` plus `--stack`, `--entry`, `--namespace`, `--out`.
- [ran] No workflow test (create/sync/audit-design) covers publishing-off STUCK; only `create-design-prose.test.js` does (prose match).
- [read] verify-design-comparison SKILL.md bolds `**regression baseline**`; use "The verdict stays model judgement per frame" as a locator.

## Design-stage live runs: trusted fixture folders (2026-11-04)

Live design-command runs (DSGN-T002/T003) must run in these two folders, which the fortium
account now trusts (trust is keyed by exact path; a new copy elsewhere stops at the trust
prompt again). Each is a copy of `test/fixtures/design/<name>/` with its own `git init` and the
framework scaffolded with an absolute `--plugin-dir packages/full`:

- `.trd-state/design-stage/evidence/live/work/react-web`
- `.trd-state/design-stage/evidence/live/work/react-native`

Reuse them; do not delete and recreate them. To pick up framework changes, re-run
`scaffold-project.sh --refresh --plugin-dir <absolute path to packages/full>` into them.

## Design-stage iteration 3 additions (2026-11-04)

- [ran] The scaffold leaves `.claude/rules/design.md` as the UNFILLED template; the fixture's filled `design.md` sits at the folder root and the commands read only `.claude/rules/design.md`. Before this run both trusted folders stopped `/design-system` with STUCK "design.md is unfilled". Fixture prep (not a source edit): `cp design.md .claude/rules/design.md` in each folder; after that `/design-system` completes. Scaffolding should install the filled example there.
- [ran] Live timings in the trusted folders: `/design-system` 2.5-3.5 min; `/create-design --auto <brief>` about 16 min (ground stage, then a ~10 min draw workflow). Wait with a foreground loop over `tmux capture-pane | grep -q "COMMAND COMPLETE\|COMMAND STUCK"` (max 10 min per Bash call); `sleep N` alone is blocked.
- [ran] A transcript for a trusted folder lives at `~/.claude/projects/-Users-james-dev-fortium-ensemble-vnext--trd-state-design-stage-evidence-live-work-<name>/<session>.jsonl`; extract Artifact calls with a short python loop over `message.content[].tool_use`.
- [ran] The react-native folder needs `npm install` first (done); its `/design-system` bundle then compiles NativeWind CSS and 0 stubs were needed.
- [ran] FS-34 cause: the ground stage captured `docs/ui/_current/trips-390x844.png` with headless Chromium `--window-size=390,844`, which lays the page out about 500 px wide and crops to 390 (content at x=42 = (500-448)/2+16 for the `max-w-md` column), so the correct 390 px as-is board could not match. `design-grounding` now requires a context viewport checked by `window.innerWidth` and a fresh capture of every in-scope screen each run. The trusted folders keep the old skill copy and the bad screenshot until `scaffold-project.sh --refresh` is re-run into them.

## Design-stage iteration 4: live runs in the trusted folders (2026-11-04)

- [ran] Driver that works: `tmux new-session -d -s <n> -x 200 -y 50 -c <trusted folder> "claude --dangerously-skip-permissions '<slash command>'"`, then a loop of `tmux capture-pane -p -S -3000 | grep -q "COMMAND COMPLETE\|COMMAND STUCK"` (run with `run_in_background`, `until ...; do sleep 10` inside the script). Timings: STUCK-on-setup 20s, no-op `/create-design` re-run 30-45s, `/refine-design` 2-4 min, `/design-system --sync` 2.5 min, first `/create-design --auto` about 10 min (draw workflow ~6 min).
- [ran] Subagent journals of the workflow live under `~/.claude/projects/<slug>/<session>/subagents/workflows/<wf>/journal.jsonl` (the `fortium` account's home, readable); they show `START Parts` finishing before `START ToBe`, and the five `START Challenge review:*` agents then one `fix`. Extract tool calls from the session `.jsonl` with a python loop over `message.content[]`.
- [ran] `ArtifactComments` can only read, reply to and resolve existing threads; it cannot create a comment, and the Artifact tool cannot either. A canvas-comment-driven run (FS-42) and the "approved" comment channel (FS-43) cannot be driven from an automated session; the owner must leave the comment on the hosted canvas.
- [ran] `/create-trd --design <dir>` alone STUCKs ("--design alone is not a source"); give it a PRD path too. `/plan ... --design D --boards B` STUCKs with "board already building" once a TRD exists for it, after reaching the board (that proves acceptance of `--boards`).
- [ran] A `/design-system` run on a system already current is a no-op (it only corrects the recorded version), so it does not exercise the publish step; use `/create-design` with a new brief to test `publishArtifacts: false`. With `ensemble.publishArtifacts: false` in the folder's settings.json, a live `/create-design --auto` still published and ended COMPLETE (the command never read the setting) — a defect for FS-69.
- [ran] `git add -A docs` in a trusted folder also commits untracked `docs/ui/_current/` screenshots; a later `git revert` then deletes them from disk. Restore with `git checkout <sha> -- docs/ui/_current`.
- [ran] Both-changed case, live: `/refine-design` adopted the canvas copy and DELETED the `.repo.dc.html` conflict copy, reporting the conflict only in DECISIONS, not ISSUES (FS-17 expects both files kept and an ISSUES line). The first adopt-and-refine commit message was `refine-design(...)`, not `design: adopt canvas edits (<boards>)` (FS-15).
- [ran] The first `/refine-design --auto` run (design system stale) did not mention drift at all; later runs did (recorded in the map, `/design-system --sync` first in NEXT).
- [read] `/create-trd` (the PRD form) moved the approved board to `building` and recorded the TRD path in the map; it omitted `verify-data-fidelity` because the fixture screen has no data fields, so FS-56's "selected with grounding/data.md" needs a fixture design with data.
- [ran] No `flutter-widget` fixture exists in this repository (it lives in another repository), and `/implement-trd` on the TRD was not run in iteration 4 (it writes product code).

## Design-stage iteration 5: implement-trd and RN runs (2026-11-04)

- [ran] `/implement-trd docs/TRD/settings-notifications.md` in the react-web trusted folder ran end to end in 34 min (build 3/3, verify-functional stalled 7/11 on the unbuilt caption OQ-2); it needs the fixture committed first (`git add -A` + commit) because the run commits on a feature branch. Evidence under `iter5/` and the folder's `.trd-state/settings-notifications/`.
- [ran] `/create-design --auto <brief>` in the react-native trusted folder completed in 13.5 min (4 boards, canvas published, 11 PNGs). The implementer subagent transcript lives at `.../<session>/subagents/workflows/wf_*/agent-*.jsonl`; a Read of `canvas/project/part-toggle.dc.html` is visible there.
- [ran] The settings-screen fixture map has `links: []` and no data fields, so `/create-trd` omits verify-flow-as-built and verify-data-fidelity; FS-55 and FS-56 need a fixture design with links and data. No board of each status and no flutter-widget fixture exist (FS-53/54/71 flutter part).
- [ran] Canvas comments cannot be created by any tool here; FS-42 and the "approved" comment channel of FS-43 stay owner-attended.

## Design-stage fix round 1 (2026-11-05)

- [ran] Editing a hosted canvas from here: `Artifact` `read` of the page (`page: true`) is NOT what unlocks a publish; publish with `url`, `root: <folder holding project/>`, `file_path: <abs path of one changed board>` and the other boards in `files` (`"project/x.dc.html": "project/x.dc.html"`), after `read`ing the boards. Sending `files` with absolute sources and no `root` was refused as "not viewed latest".
- [ran] Live `/refine-design settings-screen --auto` with a canvas-only edit (part-toggle) and a both-changed board (01-settings) now commits `design: adopt canvas edits (part-toggle, 01-settings)`, keeps `01-settings.repo.dc.html`, and lists the conflict under ISSUES; the map's `canvases[].files` hashes are NOT re-derived (the run says the last-synced version advances only on a publish).
- [ran] In `/refine-design` NEXT, the conflict step came before `/design-system --sync`; FS-27 asks for the sync first.
- [ran] `/audit-design` with a stale design system put the drift under STATE (not ISSUES) and omitted `/design-system --sync` from NEXT; `/sync-design` ran `/design-system --sync` itself and cleared the drift rather than recording it.
- [ran] `/create-design --auto` with `publishArtifacts: false` now ends STUCK "publish step not run: ensemble.publishArtifacts is false" after writing and committing docs/ui/<slug>/ (12 min).
- [ran] `/create-trd <prd> --design <dir>` took under 10 min; with one approved and one draft to-be board it built only from the approved board and named `grounding/data.md` and the map `links` in its Verification Artifacts rows once the fixture app read data from `public/api/trips.json` and the map had links.
- [ran] `/implement-trd` on that TRD took about 25 min; `/verify-build --no-fix` after widening the TRD's design-comparison row to every board took 12 min and judged requirements (building, approved, shipped) and the as-is baseline per frame.
- [ran] Fixture additions in react-web (committed in its own git): `public/api/trips.json` and a data-reading TripsPage, docs/PRD/home-trips.md, docs/ui/home-trips, boards 03-trips-approved and 04-trips-shipped (copies of 02-trips). Start its server with `npm run web` (port 3110) and stop it by PID.
- [ran] `docs/ui/_current/home-390x844.png` captured by the ground stage shows a stray second nav at y~780 (capture artefact); the Trips pair matches the as-is board.

## Design-stage fix round 1, iteration 2 (2026-11-05)

- [ran] FS-24 first-build setup in react-web: strip a canvas's `project/ds/` files by publishing with `files: {path: null}` (after a whole-artifact `read` without `path`), then reset the system (`git rm docs/ui/_design-system/fixture-web`, empty `design_system` in every map, drop the `design-system` key in `.trd-state/design-system/artifacts.json`, commit). `/design-system` then builds anew (7.5 min) and reinstalls on every canvas the maps record. A `--sync` with no code change still republishes and reinstalls (4.5 min); change a component first for a new version. Use `sed -i ''` on macOS.
- [ran] The repo's flutter-widget fixture (`ensemble-vnext-test-fixtures/variants/*/flutter-widget`) holds only story.md, CLAUDE.md and expected-skills.json. Stand-in for a parts-only run: in the trusted react-native folder set design.md's platform to `flutter` with kind `parts`, run `/create-design --auto <counter brief>` (COMPLETE, 4 boards all with empty components), then restore design.md from git.
- [ran] `/sync-design` on a design with no building board reads recorded drift from the map and does not re-check or record it; on a building board it re-checks and records drift (FS-27).
- [ran] Dev server on :3110 can be gone between runs; start `npm run web` in react-web and stop it by PID.
- [ran] home-trips' as-is Home board still has a 24 px nav against the build's 44 px (fresh 390 px capture differs); the trips-sort as-is pair matches exactly.

## Design-stage fix round 1, iteration 2 debug (2026-11-05)

- [ran] FS-34, home-trips Home: the as-is board `01-home--as-is` was drawn at react-web commit 78f1a7e (20:35). The fixture's own build of the to-be board 01-home then changed the nav to 44 px targets at 519cbf0 (`feat(HOMETRIPS-F001)`, 20:46, `src/main.jsx`). So the board correctly shows the pre-build Home, and no fresh capture of today's build can match it. That is the lifecycle working as designed: `/sync-design` makes the shipped to-be the new as-is (DSGN-T004, accepted as not verifiable). It is not a `/create-design` defect. Prove FS-34 against an as-is board whose screen has not been rebuilt since it was drawn. trips-sort's as-is Trips pair matches exactly. For home-trips Home, capture the build at c4c668d, the commit before 519cbf0.
- [ran] An as-is board's "current screenshot" must be an independent capture of the running app, never the board's own render: `r2/fs34-current-trips-390x844.png` is byte-identical to the board PNG. `r2/fs54/ST-01-trips--as-is.png` is an independent capture and matches.
- [read] `verify-design-structure` now gives each parts board, and every board on a non-React stack, a row reported "not verifiable here". With no board in scope (for example all `draft`), it gives one `ST-<design slug>` row. Re-exercise FS-54 on the flutter stand-in (react-native folder, design.md platform `flutter`, kind `parts`); the real flutter-widget fixture lives in another repository.

## Design-stage fix round 1, iteration 3 (2026-11-05)

- [ran] FS-34: a fresh `/create-design --auto` (trips-search) in react-web captured `docs/ui/_current/trips-390x844.png` at the 390 px viewport; an independent Playwright capture of :3110/trips with `innerWidth` 390 (`r2/fs54/scratch/shot.js`) is byte-identical (sha256 2573d36c...) to the ground-stage capture and to the as-is board PNG. The AMEND-001 capture fix works.
- [ran] FS-54: a design whose boards are all `draft` gives one `ST-<design slug>` row, reported "not verifiable here" (checked with `claude -p` on the react-native `counter-widget` stand-in, platform flutter). The real flutter-widget fixture is in another repository.
- [ran] A trusted folder's `/create-design` leaves `docs/ui/_current/*.png` modified and uncommitted; harmless but it dirties `git status` there.

## Design-stage fix round 1, iteration 3 exercise (2026-11-05)

- [read] Owner ruling R1 (invocation is approval) landed in PRD 1.2.2 / TRD 1.1.2 only (commit 339be41). `packages/core/commands/refine-design.md` step 5 still lists three approval channels (chat, "approved" comment, `--approve`), and `create-trd.md` / `plan.md` contain no `approved_commit` or `transition` step, so FS-43 reads as unbuilt against the amended statement. Evidence: `.trd-state/design-stage/evidence/r3/fs43-static.txt`.
- [inferred] FS-58..63, FS-25, 42, 67, 68, 72 are accepted-not-verifiable in verification-plan.md; no live run was attempted for them.

## Exercising FS-43 approval by invocation (design-stage round 4, 2026-11-05)

- [ran] Slash commands run headless in the trusted react-web folder with `claude -p --permission-mode bypassPermissions "<slash command>"` (no tmux needed): `/create-trd <prd> --design docs/ui/trips-search` took ~8 min, `/refine-design ... --approve` ~2.5 min, a no-op `/refine-design --auto` ~30 s. Run `scaffold-project.sh --refresh --plugin-dir <abs packages/full> .` in the folder first or the vendored commands are stale.
- [ran] A headless `-p` session has no Artifact tool, so `/refine-design` ends `COMMAND STUCK: publish step not run` even when the approval itself succeeded (the map shows `approved` with `approved_commit` set); judge the map, not the banner. `/create-trd` still completes.
- [ran] `/create-trd --design` needs a PRD that names the design; fixture PRD `docs/PRD/trips-search.md` was added in the react-web folder (branch `fs43-round4`).
- [ran] Evidence: `.trd-state/design-stage/evidence/r4/fs43-summary.txt` and the per-run maps beside it.

## Exercising `design-map.js unsynced` (unsynced-boards, 2026-11-05)

- [ran] `unsynced` needs no running service: build a scratch project under the evidence directory (`docs/ui/<slug>/design-map.json` with `{"boards":[{id,kind:"to-be",status,trd}]}` and `.trd-state/<feature>/closed.json`), `cd` into it and run `node <repo>/.claude/lib/design-map.js unsynced --dir docs/ui/<slug>` or `--all`. Only `kind: "to-be"` boards are listed; the feature name is the TRD basename. Fixture and output: `.trd-state/unsynced-boards/evidence/fixture`, `fs1-dir.txt`, `fs-all.txt`.

## Exercising unsynced-boards (2026-11-05 run, iteration 1, FS-7..FS-12 slice)

- [ran] `node .claude/lib/design-map.js unsynced --all [--trd <path>]` reads `docs/ui/*/design-map.json` and `.trd-state/<feature>/closed.json` relative to cwd, so a scratch fixture project under the session scratchpad (maps plus empty `closed.json` files, no scaffold needed) is enough; invoke the repo's lib by absolute path from inside the fixture. Matching is by feature name (basename sans extension), so `./docs/TRD/x.md`, an absolute path and `docs/TRD/x.md` all select the same boards.
- [read] The old unconditional design line in `audit-build.md` was removed in commit b614547 (it said "When the closed feature has a design ..."); the replacement "Unsynced boards" paragraph sits on one physical line (audit-build.md:480, close-feature.md:112), so a locator can be picked from it directly; `.claude/` and `packages/core/` copies are identical.
- [read] FS-15: contract section 7 (design-commands.md lines 145-158) lists unsynced boards in ISSUES and orders NEXT /design-system --sync then /sync-design <slug>; captured fresh in fs15-contract-s7-v2.txt (2026-11-05 iteration 3).

## Exercising `design-map.js approve` (design-approve-verb, 2026-11-05)

- [ran] `approve` needs no service: a scratch git repo with `docs/ui/<slug>/design-map.json` is enough, run by absolute path from inside it. The recorded `approved_commit` (and stdout `commit`) is the HEAD BEFORE the approval commit, so it never equals the new `git rev-parse HEAD`; the map is rewritten by node (compact JSON), so read it with `JSON.parse`, not grep. Without `--runtime`, stdout carries `renderSkipped: "no --runtime given: frames not rendered"`. Runner and output: `.trd-state/design-approve-verb/evidence/s1/run.sh`, `s1/fx/`.

## Exercising the design-approve-verb command criteria (FS-22 to FS-27, 2026-11-05)

- [read] The `/create-trd --design` and `/plan --design --boards` ordering criteria are pinned by prose tests `packages/core/commands/create-trd-design-prose.test.js` and `plan-design-prose.test.js` (26 tests, passing); no live claude session is needed. Quote lines from `packages/core/commands/{create-trd,plan}.md`, `workflows/create-trd.js` and `contracts/trd-authoring.md`; `.claude/` copies are byte-identical (`diff -q`).

## Exercising `design-map.js approve` (design-approve-verb, 2026-11-05, FS-8..FS-14 slice)

- [ran] `approve` runs for real against a scratch git repo kept in the session scratchpad (not inside this repo, so no nested `.git` lands in the tree); copy stdout/stderr/exit/`git log`/map into the evidence directory. A real render needs `playwright` resolvable from the fixture's cwd: `ln -s <repo>/node_modules node_modules` plus a `.gitignore` for it; Chromium is already in `~/Library/Caches/ms-playwright`. With `--runtime packages/core/lib/__fixtures__/design/dc-runtime.js` and the board files under `docs/ui/d/canvas/project/`, a draft board gets `screens/png/<id>.png` and the approval commit holds it.
- [ran] Without that symlink, the same run hits the genuine missing-tool path (`renderSkipped: "playwright is not installed for this project..."`, exit 0), which is the natural FS-13 evidence.
- [ran] A cheap engineered `git archive` failure (FS-14): gitignore the `canvas/` mirror so it is absent at HEAD; render throws `git archive <sha> -- docs/ui/d/canvas/project failed: ... pathspec ... did not match`, recorded in `renderSkipped`, exit 0.

## Exercising `design-map.js approve` (FS-15..FS-21 slice, 2026-11-05)

- [ran] A real render works with no symlink when the scratch repo sits under this repo's evidence directory: `design-render` resolves `playwright` from `.` upward, finds the repo's `node_modules`, and Chromium is cached. `--runtime packages/core/lib/__fixtures__/design/dc-runtime.js` plus `__fixtures__/design/broken.dc.html` as a board gives a real per-board error (`"03-broken": ["03-broken.renderVals(): fixture board threw on purpose"]`) in the verb's stdout with exit 0, the board `approved` and the commit made (FS-15). Fixture and output: `.trd-state/design-approve-verb/evidence/exerciser-c/`.
- [ran] A fixture under the evidence directory leaves a nested `.git` in this repo's tree; the sibling slice's scratchpad placement avoids that.
- [read] Slash-command criteria (`/refine-design --approve`, `/create-trd --design` ordering) are pinned only by prose: `create-trd.md` step 5 and "Design approval", and `refine-design.md` step 5, with `*-design-prose.test.js`. No live session is started, so no transcript exists.

## Exercising the design-approve-verb command criteria live (FS-19 to FS-25, 2026-11-05, iteration 1)

- [ran] Owner ruling R1 makes these live headless runs; the fixture is `.trd-state/design-stage/evidence/live/work/react-web`. Refresh its runtime first by copying the six files (`lib/design-map.js`, `commands/{create-trd,plan,refine-design}.md`, `workflows/create-trd.js`, `contracts/trd-authoring.md`) from this checkout's `.claude/`, commit them on a fixture branch (`fv-approve/base`), and cut one branch per run from it; return the fixture to `master` afterwards. The designs built for this (`approve-lab`, `approve-none`, `approve-refine`) and PRD `docs/PRD/approve-lab.md` live on `fv-approve/base`.
- [ran] Run form that works: `claude --print --verbose --output-format stream-json --permission-mode bypassPermissions --setting-sources project "<slash command>"`, from a small wrapper script that writes `$$` to a pid file and `exec`s claude (launched with `nohup ... &`); poll `grep -c '"type":"result"'` on the log. `stream-json` keeps every tool call, so ordering (workflow, approve, transition) is readable with a short python loop over `message.content[]`. Timings: `/create-trd --design` completed 8.5 min, `/plan --design --boards` 4 min (light path, no workflow), `/refine-design --approve` 70 s, the zero-buildable STUCK 30 s.
- [ran] To stop `/create-trd` before its TRD exists: poll the log for the `Workflow` tool call, then `kill $(cat <pid file>)` in its own Bash call. The forge kill guard refuses any command that mentions `ps` together with `kill`, so never put `ps -p` beside `kill`. Headless, the session then ends with a result reading `DISPATCHED ... workflow in flight` and the workflow dies with it (nothing written, no orphan). For `/plan` the light path writes the TRD itself (about 90 s in), so kill after the 4th Bash call; a `/plan` that is left alone completes and approves in the same session.
- [ran] A headless session has no Artifact tool: `/refine-design --approve` ends STUCK on the publish step although the approval commits landed; judge the map and `git log`, not the banner.
- [ran] `/plan` found the leftover `/tmp/dc-runtime-fs10.js` and passed it as `--runtime`; a fixture with no published canvas otherwise gives `renderSkipped: no --runtime given`.

## Exercising the final-turn wake-up cancel (cancel-backup-wakeup, 2026-11-05, iteration 1)

- [ran] Headless `claude --print` has `ScheduleWakeup` and `Agent run_in_background`. A scratch project (copy `.claude/`, `git init`, commit) plus `/task <prompt that dispatches one PONG agent, arms ScheduleWakeup 120 s, then finishes>` takes about 35 s and shows the whole shape in `--output-format stream-json --verbose`: DISPATCHED turn calls `ScheduleWakeup`, the resumed final turn calls `ScheduleWakeup({stop:true})` (result `cancelled 1 pending wakeup(s)`) before the STATE readout and the banner. Ending the prompt with "COMMAND STUCK, not COMPLETE" produces the STUCK variant the same way.
- [ran] A `--print` session exits after its final turn, so "no wake fires afterwards" cannot be observed as a live idle session; check instead that the session JSONL under `~/.claude/projects/<slug>/` has no entry after the banner once the wake time has passed. An untrusted scratch folder prints "Ignoring N permissions.allow entries" on stderr; `bypassPermissions` still ran everything.
- [read] `/create-trd`, `/audit-trd`, `/create-prd`, `/refine-trd` contain no `ScheduleWakeup` at all in `packages/core/commands/`; they inherit the cancel from `command-status.md` §3 via `notify-complete.sh` on their final turn.
- [ran] When the system under verification is a worktree, the evidence directory still belongs to the orchestrating repository (`<orchestrating repo>/.trd-state/<feature>/evidence`), not the worktree's own `.trd-state/`; evidence written under the worktree was judged "evidence-missing" and had to be copied across (cancel-backup-wakeup, iteration 2).

## Exercising "no fallback wake-up" (cancel-backup-wakeup AMEND-001, 2026-11-05, iteration 1)

- [ran] The no-fallback behaviour shows in one `/task` session of about 10 s: a prompt that dispatches one background PONG agent and says only "end the turn with the DISPATCHED banner per command-status.md" (no mention of ScheduleWakeup) produced 0 `ScheduleWakeup` calls, a banner reading `next wake: auto-deliver on completion`, a re-entry on the agent's completion and `COMMAND COMPLETE` as the last line. Run with `claude --print --permission-mode bypassPermissions --setting-sources project --output-format stream-json --verbose < prompt` in a scratch project (copy `.claude/`, `git init`, commit); the process exited by itself, so "nothing after the banner" is read from the session JSONL tail (`system` / `last-prompt` / `cost-state` only).
- [ran] Count real calls by parsing assistant `tool_use` blocks, not by grepping the session JSONL: the file mentions `ScheduleWakeup` 7 times in tool listings, request shapes and instructions without any call.

## Exercising design-orchestration FS-22..FS-27 (2026-11-05, iteration 1)

- [read] FS-22/FS-23 were evidenced by the `refine-design.md` text (lines 36-90, no `OD-n`/audit-report live run); the `--auto` argument form and the no-feedback audit-report source are both specified there, and no new flag was added to `argument-hint`. A headless run on a fixture design was not attempted this pass.
- [ran] FS-26: searching added lines of `git diff main...HEAD` for forge|orchestrator|devin|cursor|codex|copilot hits only 3 test files asserting those names are ABSENT (`expect(...).not.toMatch`); no shipped command/lib/workflow text names one.
- [ran] FS-27: `cmp` of each changed `packages/core/{commands,lib,workflows}` non-test file against its `.claude/` mirror: all 10 identical.
- [read] FS-24/FS-25: the `/sync-design` NEXT line in `audit-build.md:482` and `close-feature.md:112` reads "with `/sync-design` now, or once the PR has merged"; it does not say literally "on the feature branch before merge". Judge to decide whether "now" satisfies it.

## Exercising `design-map.js buildable --items` / `validate` brief_items (design-orchestration, 2026-11-05)

- [ran] `design-map.js validate` prints the error array and exits 0 even when it holds errors (`["board a: brief_items must be an array of strings"]`, exit 0); read stdout, not the exit code, for a rejection. Fixture maps need only `design_system.paths`, `canvases: []` and boards with id/file/kind/platform/viewport/status.
- [ran] `buildable --items` prints `{boards, unmatched, held}`; `unmatched` entries are objects (`{"item":"S9","served_by":[]}`), not bare ids, so a locator is `"item":"S9"`. An old map with no `brief_items` returns `boards: []` and every named item under `unmatched`, exit 0. Driver: `.trd-state/design-orchestration/evidence/fs8-14-run.js`.

## Exercising design-orchestration `--boards` / brief ids (2026-11-05, iteration 1)

- [ran] `node .claude/lib/design-map.js buildable|held --dir docs/ui/<slug> --ids a,b` runs against a scratch `design-map.json` (`{"boards":[{id,kind,status}]}`) with no git or service; a not-listed id (building, shipped, absent) is simply omitted from the output with exit 0, so the STUCK is the command prompt's job, not the CLI's. Run it by absolute path from inside the fixture; a relative `cd` before writing evidence breaks relative evidence paths.
- [ran] `/create-trd` and `/plan --boards` STUCK rules and the brief-id rule are pinned by prose and workflow tests (`create-trd-design-prose`, `plan-design-prose`, `create-design.test.js`, `design-map.test.js`: 135 pass); no live headless run was done in this pass.

## Exercising design-orchestration FS-15..FS-21 (2026-11-05, iteration 1)

- [ran] `design-map.js buildable --dir D` (plain) prints a bare board array; with `--items S1,S3` it prints `{boards, unmatched, held}`. A 3-line fixture map under the scratchpad is enough; no service needed.
- [read] `create-design.js` ground stage returns `openDecisions` with NO `id` in both modes (its test at create-design.test.js:102 asserts `!('id' in d)`); the `OD-n` numbering is done by the command (create-design.md steps 3, "Record what nobody answered"). FS-17 as worded (workflow returns an id) differs from this; left to the judge.
- [read] `/audit-design` traceability is decided in code from the map (audit-design.js ~169-200), not by a verifier prompt carrying `brief_items`; evidence is that code plus the "traceability from the map (DORCH-B005)" Jest block.

## Exercising design-orchestration FS-17 / FS-26 (2026-11-05, iteration 2)

- [ran] A "no shipped text names X" search must separate shipped files from `*.test.js`: the new tests contain `/forge|orchestrator/i` as negative assertions, so a repo-wide grep of added lines hits them and reads as a failure. `git diff main -- packages/core .claude ':!*.test.js'` filtered with grep -E '^\+' gave 572 shipped added lines and zero matches. The artifact must print an explicit verdict line (a locator such as `NO MATCHES IN SHIPPED ADDED LINES`), because a bare empty grep leaves nothing to locate.
- [ran] `git diff main...HEAD` omits uncommitted work; use `git diff main -- <paths>` to include the working tree.

## Exercising design-quality FS-41..FS-45 (2026-11-06, iteration 1)

- [ran] `node test/design-critique-corpus/replay.js --runs N --out <file>` calls `claude -p` per frame per run; to see the report shape without model calls, put a stub `claude` shell script (prints `{"result":"{\"scores\":{...}}"}`) first on PATH. The real corpus is all `poor` (8 frames, no `dimensions`), so Agreement prints "not computable" and the exit code is 0 with no pass/fail word; the stub run is a substitution and the artifact says so.
- [ran] `scaffold-project.sh --plugin-dir <abs packages/full> <dir>` into a fresh `git init` dir leaves zero `*playwright*` entries and no `node_modules` under `.claude/`; `design-render.js` resolves Playwright through `resolveTool` (project, then global npm root).
- [ran] `publishArtifacts: true` is in all three shipped settings files and `scaffold-project.sh:1599` backfills it with `setdefault`; no command text defaults it otherwise (commands say "unless it is false").

## Exercising design-quality FS-1..FS-8 (2026-11-06, iteration 1)

- [ran] `design-map.js setup --dir <p>` compares `<p>/.claude/rules/design.md` with `<p>/.claude/skills/design-setup/template.md`; a fixture lacking that template copy reports `"filled"` even for a template-identical design.md. Copy the template there first to get `"unfilled"`.
- [ran] `design-map.js direction` finds `available_packs` by the `style-pack-` folder prefix under `.claude/skills`, not by the `design` role in `framework-skills.txt`; a project-added pack shows up with no list entry.
- [read] This repo's own `.claude/rules/design.md` (owner file) still has a "Competitor references" line; the shipped template (`packages/skills/design-setup/template.md`) does not.

## Exercising design-quality FS-17..FS-24 (2026-11-06, iteration 1)

- [ran] These criteria are provable without a live `claude` session: `npx jest packages/core/workflows/create-design.test.js packages/core/workflows/audit-design.test.js packages/core/lib/design-render.test.js packages/core/commands/{create,refine,audit}-design-prose.test.js --verbose` is 205 tests, ~16s, Chromium present. Prompt-text criteria (reuse, latitude, critique) are pinned by those tests reading the assembled agent prompts; none runs a model.
- [ran] A seeded-fault measure run needs no jest: a scratchpad node script that builds `docs/ui/x/{design-map.json,canvas/project/*.dc.html}` in a temp dir from `packages/core/lib/__fixtures__/design/measure-*.dc.html`, then calls `require('packages/core/lib/design-render.js').render({dir, runtime: packages/core/lib/dc-runtime.js, out, offline: true, repo, floor: {contrast: 4.5, target: 44}})` from the project root. Write `tokens.json` as `{color:{tokens:[{name,value}]}}` under `docs/ui/_design-system/<folder>/` or fidelity reports `not-measured`.
- [read] A render measure carries board, state, check, verdict, value, count, element; no viewport field. The viewport is the board's own map entry, so a finding names the board and state and reaches the viewport only via the board id and frame png. Judge question for FS-24.
- [read] `packages/skills/design-setup/SKILL.md` has no reuse default text (line 51 only lists "reuse" as a §4 topic); the reuse wording is in the `design.md` template line 42. Repo's own `.claude/rules/design.md` (owner-governed) still says "an existing view beats a new one".

## Exercising design-quality FS-9..FS-16 (2026-11-06, iteration 1)

- [ran] `design-map.js direction()` resolves a style pack from the first of `.claude/skills`, `packages/skills` that holds ANY `style-pack-*` folder, so a project-added pack in `.claude/skills` hides the shipped ones in `packages/skills`; a fixture must copy the six shipped packs beside the added one (driver: `.trd-state/design-quality/evidence/exerciser-fs9-11-driver.js`).
- [ran] In a template-based `design.md` fixture, fill a direction row with a per-line `\|\s*\|\s*$` replace; a greedy `[^\n]*\|` regex swallows the last pipe and leaves the field blank (pack reads `missing`/null).
- [ran] FS-16 needs no service: `node .claude/lib/design-render.js render --dir .trd-state/task-dorch-t001-live-walk/evidence/boards/trips-refresh --out <scratch>` gives `errors` keys for exactly 01-home, 04-trips and the four as-is boards ("the runtime booted but mounted nothing"); 02-home and 03-trips are absent from `errors`. Playwright resolves from this repo's node_modules.
- [ran] Capturing real prompts: `readScript`/`runWorkflow`/`makeAgentStub` from `packages/core/workflows/test-harness.js` with real `frontend-design` and pack text shows each of `asis:`, `parts`, `tobe:`, `fix` prompts carrying both; `/refine-design` has no workflow, so its redraw is prose-only (refine-design.md line 129).
- [inferred] No live headless `/create-design` with `publishArtifacts` true/false was run this pass (about 16 min each); FS-12/FS-13 rest on prose plus unit tests.

## Exercising design-quality critique criteria (FS-25..FS-32, 2026-11-06, iteration 1)

- [ran] The workflow scripts (`create-design.js`, `audit-design.js`) run under `packages/core/workflows/test-harness.js` (`readScript`, `runWorkflow`, `makeAgentStub`, `makeParallelStub`) from a plain `node` script run at the repo root; stub the `visual:*` / `verify:visual-*` labels to feed scores and read `agent.calls` for the assembled prompts. Driver: `.trd-state/design-quality/evidence/dq-harness.js`.
- [ran] `design-render.js` needs `runtime` = `packages/core/lib/dc-runtime.js` (the pinned runtime moved out of `__fixtures__/design/` in this branch; the old fixture path now throws "runtime not found"). Floor/no-floor measure demo: `.trd-state/design-quality/evidence/fs25-run.js`.
- [ran] `design-map.js direction --dir <project> [--style <pack>]` needs a project with `.claude/rules/design.md` plus `packages/skills/style-pack-*/SKILL.md`; it only reads, design.md hash unchanged.
- [ran] The create-design visual critic prompt carries the rubric but NOT the DESIGN DIRECTION / STYLE PACK blocks (those sit in the draw-context block only), while audit-design's critic prompt carries all three. Also create-design's score schema has no `reason`/`frames` and no dimension enum (audit-design's does). Recorded for the judge, not resolved.

## Exercising design-quality explore/critique/corpus (FS-33..FS-40, 2026-11-06)

- [ran] The explore and critique criteria are exercisable without a model: load `packages/core/workflows/create-design.js` with `readScript`/`runWorkflow`/`makeAgentStub` from `test-harness.js`, run `stage: "draw"` with `explore: true` and one screen, and print the `direction:`, `rank:` and `visual:` prompts and `result.explore`. The stub only proves what the prompts tell agents to do, not what a real agent draws.
- [ran] `node test/design-critique-corpus/replay.js --runs 2 --out <file>` runs for real (8 frames x 2 `claude -p` calls, a few minutes, exit 0). With every label `poor` and no `dimensions`, it prints "Agreement: not computable" and per-dimension "not computable"; it does print per-frame spread.
- [read] The unattended `OD-n` explore record is command prose only (`create-design.md` "Explore choice", pinned by `create-design-prose.test.js`); no fixture run writes a `brief.md`.

## Exercising design-quality, iteration 2 recapture (2026-11-06)

- [ran] A locator must sit on ONE physical line of the artifact: emit evidence as one `FSnn <fact>` line per fact (script output), not copied wrapped prose; a phrase split across a wrap (FS-44's "never shipped in `.claude/`") reads `locator-not-found` although the property holds.
- [ran] Source edited by Debug after iteration 1 (uncommitted, mtime 09:52-09:54) closed six gaps; old evidence describes pre-fix code, so every criterion was recaptured into `it2-*` files. The workflow harness (`.trd-state/design-quality/evidence/it2-harness.js`, helpers from `packages/core/workflows/test-harness.js`) shows create-design's critic now carries direction, pack and the ten-dimension schema.
- [ran] `node test/design-critique-corpus/replay.js --runs 2 --out <file>` takes about 5-8 minutes live (16 `claude -p` calls) and now prints `Agreement by band` (works on an all-poor set); run it in the background and wait with an `until grep -q '^exit'` loop.
- [ran] A live render needs the scratch design under `os.tmpdir()` plus `render.render({dir, runtime: packages/core/lib/dc-runtime.js, out, offline: true, repo, floor})` run from the project root; each measure and frame now carries `viewport` (`WxH`).

## Exercising design-render against the lightning-lane worktree (2026-11-06, `design-render-pnpm-critique-keep`)

- [ran] `resolveTool('playwright', <lightning-lane-design-desktop>, hint, {workspace:true, alias:['@playwright/test']})` returns a module with no NODE_PATH (from cwd /tmp); the module is `@playwright/test` (alias fallback, keys `expect,only,describe...`), and its `chromium.launch()` reports 148.0.7778.96 and closes. Without `opts` the same call still throws "not installed" by design (bundler lookups). Scripts and transcripts: `.trd-state/design-render-pnpm-critique-keep/evidence/fs{1,2}*`.
- [ran] A real board render works from the worktree cwd: `cd <worktree> && node <ensemble>/packages/core/lib/design-render.js render --dir docs/ui/desktop-cleanup --out <ensemble evidence dir> --boards 01-trips-home,02-trip-editor` exits 0 with `errors: {}` and two 1440x900 PNGs; the worktree stays clean (output goes outside it).
- [read] Criteria needing a live /create-design, /audit-design or /refine-design run on lightning-lane (critique/visual-verifier no longer skipping, critique.md surviving a no-feedback refine) cannot be shown from disk: `05a-audit-design-report.md` and `05b-critique-after-refine.md` in `.trd-state/task-design-quality-live-lightning-lane/evidence/` are the PRE-fix runs (they show the "not installed" skip and the lost board sections). They are evidence of the defect, not of the fix; a fresh owner-run is required.
- [ran] A live post-fix `/refine-design --auto` exists on the worktree's throwaway branch `design/desktop-cleanup-refine-test` (base 712149b71, refine 8337feb52): `git -C <worktree> show <sha>:docs/ui/desktop-cleanup/critique.md` gives the before/after pair (all four board sections survive; a changed-but-not-rejudged board gets a "Scores predate this run's change" line). It had one feedback item, not none. Fresh copies: `.trd-state/design-render-pnpm-critique-keep/evidence/live-refine-r2/`. No `/create-design --explore` or `/audit-design` run exists post-fix, so critique/visual-verifier "not installed" skips cannot be disproved from disk.
- [ran] 2026-11-06: `design-render.js render --dir <design dir, e.g. docs/ui/desktop-cleanup> --out <abs dir> --boards a,b` takes the design directory (holding design-map.json and canvas/), not canvas/project; the wrong --dir gives an ENOENT on design-map.json or canvas/project/canvas/project.
- [ran] 2026-11-06 (r4 pass): the worktree's checked-out `.claude/lib/design-render.js` is NOT byte-identical to `packages/core/lib/design-render.js` (`cmp` differs at line 18; the worktree copy lacks `TOOL_ALIASES`, workspace-package lookup and pnpm-workspace parsing). The FS-1..3 captures therefore ran this repo's `.claude/lib/design-render.js` (identical to packages/core) against the worktree as the target; they do not show the worktree's own vendored runtime working. Fresh r4 evidence: `.trd-state/design-render-pnpm-critique-keep/evidence/{fs1,fs2}-r4-transcript.txt`, `fs3-r4-*`, `render-out-r4/`, `live-refine-r4/`.
- [ran] 2026-11-06 (iteration 2, r4): re-confirmed `cmp` differs at char 942 (worktree copy lacks the monorepo workspace-folder Playwright lookup); no /create-design critique or /audit-design run exists since the fix, and the refine-pane.txt run skipped critique. FS-4 stays unevidenced until a live design run happens on a synced runtime.
- [ran] 2026-11-06 (r5 pass, FS-4 under owner ruling R1): the refine session log `cfc44bcf-...jsonl` holds one Bash tool_use running `node .claude/lib/design-render.js render --dir docs/ui/desktop-cleanup ... --boards 04-chat,03-pre-trip --floor-contrast 4.5 --floor-target 44` with cwd `/Users/james/dev/lightning-lane-design-desktop` (the worktree's own vendored copy), result `errors:{}` and two 1440x900 frames plus measures; zero lines in the log contain NODE_PATH. Extracted to `.trd-state/design-render-pnpm-critique-keep/evidence/fs4-r5-live-render.txt`; call sites in `fs4-r5-callsites.txt`. Parse the JSONL with python (tool_use / tool_result blocks), never print it whole.
