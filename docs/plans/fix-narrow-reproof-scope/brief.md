# Brief: Narrow what gets re-proved — custody re-proof, verification re-checks, CI-proven criteria

One change, from GitHub issues #153, #154 and #155 in FortiumPartners/ensemble-vnext. All three
re-prove far more than a change can have affected, and they share the same input: the
per-criterion covers record (`<state-dir>/evidence/criterion-covers.json`, the list of repo
paths each criterion depends on). Custody's narrowing (#153) is only safe once design criteria
have covers (#154), so they land together as one change, not as a sweep list.

Measured cost (Storybook phone-layout builds 1 to 4, 2026-11-15/16): about 191 min of custody
re-proof across three features (34 to 40 criteria each time, one real regression found, which a
scoped re-proof would also have caught); about 117 min of end-of-run verification re-checks done
only because criteria had no covers record; about 818 runner-minutes of full manual CI dispatches
for one CI-proven criterion, two of which failed only on jobs already red on the base branch.

Owner ruling 2026-11-16 (on #153 and #157): keep quality, but no full re-runs that add no new
value; the model judges scope.

Related: issue #157 (one shared "rerun scope" rule: before any re-run, read the change since the
last green result and choose none, targeted or full, and say so). It is registered as the separate
feature `fix-rerun-scope-rule` in the same fixes plan, linked as related (gates nothing). This change does not need its code: it narrows scope inside
the libraries and the workflow and uses the same three words (none, targeted, full) in what it
reports, so #157 can later point at this behaviour rather than re-implement it.

## 1. Custody re-proof puts every must-pass criterion in doubt (#153)

### Steps
1. `node -e "const c=require('./packages/core/lib/custody.js'); for (const p of ['.claude/commands/plan.md','.claude/workflows/x.js','CLAUDE.md','.gitattributes','.gitignore','.env.example']) console.log(p, c.classifyPath(p,null))"`
2. Read `affectedIds` in `packages/core/lib/custody.js` (line 465 on): after a merge-up, any
   changed shipped-class path that no criterion's covers record names returns every must-pass id.

### Expected
- Framework and project-housekeeping files are not shipped code for custody: `.claude/**`
  (except the project-authored rules a build reads: `.claude/rules/**`), `CLAUDE.md`,
  `.gitattributes`, `.gitignore`, and docs.
- One changed file that no covers record names puts in doubt only the criteria whose covers
  share its directory (or, for design criteria, render it at their route), not every must-pass
  criterion. A changed file nothing can be related to at all still widens to the full set.
- Before re-proving, the command states what changed since the custody anchor and the scope it
  chose (none, targeted or full) with the reason.

### Actual
Step 1 prints `shipped` for every one of those six paths. `custody.js:501`:
`if (shipped.some((p) => !allMatchers.some((m) => m(p)))) return { ids, reused: [] };` — one
unnamed file re-proves everything. In builds 2 and 4 Ensemble's own runtime refresh
(`.claude/commands/*.md`, `.claude/workflows/*.js`) led the "differing" lists.

### Where
- `packages/core/lib/custody.js:139` (`classifyPath`, the classification)
- `packages/core/lib/custody.js:501` (`affectedIds`, the all-or-nothing fallback)
- `packages/core/contracts/ship-custody-gate.md` and `packages/core/contracts/ship-primitive-merge.md:120` (the custody gate that runs the re-proof; it states the chosen scope)

### How to check
New Jest cases in `packages/core/lib/custody.test.js`:
- `classifyPath('.claude/commands/plan.md')`, `('CLAUDE.md')`, `('.gitattributes')`,
  `('.gitignore')` are not `shipped`; `('.claude/rules/constitution.md')` and `('src/app.ts')` are.
- `affectedIds` with criterion A covering `src/a/` and B covering `src/b/`, and one changed
  unnamed file `src/a/new.ts`: returns A in `ids` and B in `reused` (today: both in `ids`).
Both fail on `main` today (step 1 output above).

## 2. Verification re-checks every criterion with no covers record; design criteria never get one (#154)

### Steps
1. Read `regressionScope` in `packages/core/workflows/verify-functional.js` (line 3255 on).
2. Read `deriveCriterionCovers` in `packages/core/lib/live-evidence.js` (line 259 on): covers
   come only from TRD task Touches (or backticked paths in a task row).

### Expected
- Design criteria (design-frame and design-structure rows, the ones the
  `verify-design-comparison` and `verify-design-structure` checks prove) get covers built from the
  design's `docs/ui/<slug>/design-map.json`: board -> its `route` -> the page file that serves
  that route, plus the files of the components the board names (`components`).
- A criterion still without a record is re-checked only when a changed file is rendered at its
  route (or shares a directory with its covers), not whenever anything changed.
- The verification report says how many criteria the regression pass re-checked and why
  (per reason: covers-changed, changes-unknown, no-covers, ...).

### Actual
`verify-functional.js:3278`: `else if (covers.length === 0 && counting.some((r) => r.files.length > 0)) scope.push({ id: c.id, reason: 'no-covers' })`
— any Debug edit anywhere re-checks every uncovered criterion. Builds 2 to 4 re-checked
182/182, 144/154, 140/158, 89/89, 52/126, 56/134 and 84/122 criteria this way. Build 1, whose
records were complete, ran a justified 45-minute pass.

### Where
- `packages/core/lib/live-evidence.js:259` (`deriveCriterionCovers`: add the design-map source)
- `packages/core/workflows/verify-functional.js:3278` (the `no-covers` branch)
- `packages/core/lib/design-map.js` (the reader for `design-map.json`; boards carry `route` and
  `components`, not file paths)

### How to check
New Jest cases: (a) `deriveCriterionCovers` over a fixture TRD + definition whose design
criterion names a board in a fixture `design-map.json` returns covers for it (today: no entry);
(b) a `regressionScope` case in `verify-functional.test.js` with one uncovered criterion and a
change record touching an unrelated file does not re-check it (today: reason `no-covers`).

## 3. A CI-proven criterion is re-proved by dispatching the whole CI workflow (#155)

### Steps
1. Read `settleOffHost` in `packages/core/workflows/verify-functional.js` (line 1998 on) and
   `lookupOffHostProofs` in `packages/core/lib/functional-verification.js` (line 997 on).
2. `grep -rn "gh workflow run\|gh run rerun" packages/core` — the only targeted re-run is in
   `packages/core/contracts/ship-primitive-wait-ci.md:35`, which only `/ship-build` reads.

### Expected
- A must-pass criterion proven by a named CI job (the TRD's `Off-host proof` column) is
  re-proved by re-running that job only, or the run's failed jobs only
  (`gh run rerun` with its job-id option, or its failed-jobs-only option), never by dispatching the whole workflow.
- A job that is also red on the base branch head is baseline: reported as such, not as a failure
  of this feature, and it does not block the criterion its own named job proves.
- `/plan` and `/create-trd` (the TRD authoring contract) do not declare a criterion whose only
  proof is a full manual CI run; a local or single-job proof is preferred.

### Actual
`verify-functional.js:2010`: each Debug edit voids the proof ("declared off-host proof ... is
green but its covered files were changed by Debug in this run"), and nothing tells the session
how to re-prove it, so sessions dispatched the whole CI workflow four times on PR #396 (54, 48,
46 cancelled and 74 min). Two finished runs failed only on jobs already red on `develop`.
`lookupOffHostProofs` reads the job on HEAD only; it never compares with the base head.

### Where
- `packages/core/lib/functional-verification.js:997` (`lookupOffHostProofs`: base-head baseline)
- `packages/core/workflows/verify-functional.js:2010` (`settleOffHost`: the voided-proof reason
  should name the targeted re-run)
- `packages/core/commands/verify-build.md:326` and `packages/core/commands/implement-trd.md:1994`
  (what to do when a declared proof is voided, `missing` or `red`)
- `packages/core/contracts/trd-authoring.md` (the `Off-host proof` column guidance)

### How to check
New Jest cases for `lookupOffHostProofs` with a stubbed `gh`: the named job red on both HEAD and
the base head reads as baseline, not `red` (today: `red`). A text check that
`verify-build.md`, `implement-trd.md` and `trd-authoring.md` name the single-job re-run and
forbid a full manual dispatch (`grep` for `gh run rerun` in each; today no match).

## Open questions
- **Route -> page file for design covers.** `design-map.json` boards carry `route` and component
  names, not file paths. Owner's call, default taken: resolve route and components through
  `design.md` §2 (component library paths) and §3 (route list); a board that cannot be resolved
  stays without covers and is reported, never guessed.
- **Which `.claude/**` paths stay shipped.** Default taken: `.claude/rules/**` stays shipped (a
  build reads the owner-governed rules); everything else under `.claude/` is framework runtime.
- **Unnamed-file widening rule.** Default taken: same directory, else full. The model-judged
  scope of the owner ruling is #157's; this change stays deterministic.
- **Dependency on #157.** None: the code does not need it. Recorded as related only.

Decisions: Ship path (CLAUDE.md "Shipped": merge to main, then `.github/workflows/ci.yml` on the push): checks passed (`ci.yml` exists; it references no secrets; no migrations) (owner's call, default taken under auto mode, 2026-11-16).
Decisions: Route -> page file resolution for design covers: through design.md §2/§3; unresolvable boards reported, not guessed (owner's call, default taken, 2026-11-16).
Decisions: `.claude/rules/**` stays shipped for custody; the rest of `.claude/**` does not (owner's call, default taken, 2026-11-16).
Decisions: Dependency on issue #157: none, related only (owner's call, default taken, 2026-11-16).
