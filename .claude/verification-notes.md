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
