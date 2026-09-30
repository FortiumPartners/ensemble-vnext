---
name: verify-build
description: Run the functional verification loop on its own — does the delivered software do what the PRD says, checked with artifacts
version: 1.0.0
argument-hint: "[trd-path] [--resume] [--cap N] [--no-fix] [--fix [plan-path]]"
category: verification
---

Run the bounded functional-verification loop against already-delivered code.

## User Input

```text
$ARGUMENTS
```

If no TRD path is given, resolve from `.trd-state/current.json`'s `trd`.

---

## Why this exists separately from `/implement-trd`'s verification pass

The loop is the same loop — one `Workflow(verify-functional, …)` call, identical arguments,
identical outcomes. This command is `/implement-trd`'s Step 8 with nothing else attached.
Functional verification now runs **by default** inside `/implement-trd` (VCON O6), so this
command's reason for existing is no longer "the flag was never passed" — it is that **the
three commonest reasons to want the loop have nothing to do with running an implementation**:

- The implementation ran with **`--no-verify`** (opted out of the now-default pass) and you
  want the check now.
- The loop **crashed or was interrupted** (`outcome: null` in `verification-state.json`), and
  re-running `/implement-trd` to reach it would re-enter the phase loop over already-complete
  tasks. A run that ended **`stalled`** already finished — that is not this case; run
  `/refine-verification`, then this command, whose fix loop (below) runs that plan.
- You **fixed something by hand** — a credential, a config, the environment — and want to
  re-verify without touching implementation at all.

Running `/implement-trd --verify --resume` (the EXPLICIT flag, not the now-default behaviour)
covers the second case, but only because §3.6 step 0's composition gate skips the phase loop;
that is a subtle path to rely on for the ordinary act of "verify what is already built."

**This command never dispatches an implementer itself.** It runs no phase, writes no task
state, and makes no commit beyond the loop's own artifacts — its fix loop (below) chains
`/implement-trd`, which is the implementer; this command still never dispatches one directly.

**It DOES derive the success definition when one is absent** — see step 3. That is the whole
point of the command: the case it exists for is a run that used `--no-verify`, or one whose
loop crashed out, and in both the definition was never produced. A `/verify-build` that
refuses to derive can only ever run second, after a verification pass that already did the
work, which is precisely when you would not need it.

---

## Steps

### 1. Resolve the TRD and feature

Explicit path argument wins; otherwise `.trd-state/current.json`'s `trd`. The feature slug is
the TRD basename. No branch derivation — you are verifying what is on disk now.

### 2. Preflight the environment

**Identical to `/implement-trd` §3.6a — read that section and follow it.** No criteria exist
yet at this point (that only changes at step 3/3a, below), so this step resolves
ENVIRONMENTS only: read `.claude/rules/verification.md`'s §1 and resolve each DECLARED
ENVIRONMENT as usable / unusable / needs-one-thing-from-the-owner, batch that last bucket into
ONE question — naming the environments, not criteria — with a stated default, then persist the
per-environment result exactly as §3.6a documents (`state.functional_verification.environments`,
set in memory then saved). Report the file's shape too, exactly as §3.6a's `missingSections`-
derived reporting does — naming `/verification-setup` and whichever sections are missing
(D10, D11) — not a fixed sentence. Partial verification with stated gaps beats none.

**When the fix loop runs (default whenever a plan is present, unless `--no-fix` was passed),
that one question is NOT asked** (O3: the fix loop asks the owner nothing, start to finish).
Every environment in the needs-one-thing bucket takes the question's stated default — unusable
for this run, so its criteria resolve `not_verifiable` — and the thing it needs is recorded as
a `verification.md` need exactly as the fix loop's step 2 records one (D13: `kind: 'gap',
blocksFeature: false, file: '.claude/rules/verification.md'`), named in ISSUES for "the owner,
at the next bridge". The owner answers it in `/refine-verification`, not mid-run.

### 3. Read the inputs from disk

Exactly the inputs §8.1–§8.3 assemble. Read those sections for how each is derived rather than
restating the derivations here.

**The argument LIST itself is now restated deliberately, at §4.** That reverses the earlier rule
and the reversal is the point: pointing at "every field §3.3 names" across two documents without
naming any of them required reconstructing a 15-field object from prose on every run, and a
dropped `statePath` is how that failed in the field. Drift is the cost, and it is the cheaper
one — a drifted list is visible in a diff, whereas a reconstruction that silently omits a field
is visible only when the workflow crashes. §3.3 of `docs/TRD/functional-verification.md` remains
the authority on what the fields ARE; §4 is the dispatch, not a competing spec.

- `.trd-state/<feature>/success-definition.md` — **present → use it. Absent → DERIVE it,
  then proceed.** See 3a.
- `.claude/verification-notes.md`, the stack hints, the contract text, `.claude/rules/verification.md`
- `.trd-state/<feature>/verification-state.json` — for `--resume`
- `since` — resolved per §8.3
- `checks`, `checkComments`, `pagesDir` — resolved at step 3b, below (identical to
  `/implement-trd` §8.1b), once `criteria` exists
- `exerciseLanes`, `refreshCommand`, `fullRunCommand` — resolved at step 3c, below (identical to
  `/implement-trd` §8.1a), once `criteria` exists
- **`prd_path`** — bind it HERE, because §4's dispatch passes it and 3a runs on only one
  branch. Read `.trd-state/<feature>/implement.json`'s `functional_verification.prd_path` when
  that file and key exist and the value is non-null; otherwise `""`. Note the key is written
  only by an `/implement-trd` run whose verification pass actually ran (i.e. not
  `--no-verify`), and this command's primary case is a run made with `--no-verify` — so `""`
  is the ordinary outcome here, not the exceptional one.

  It is a **display string for the report header** — nothing resolves it to a file — so `""`
  yields a blank `**Source PRD**:` field and nothing else. Leaving it unbound is not the
  catastrophe an earlier draft of this line claimed: `verify-functional.js` reads it as
  `a.prd || ''`, so unbound and `""` render identically. The reason to bind it is the positive
  one — when a source IS known, the header should name it instead of going blank.

### 3a. Absent definition → derive it, in the FOREGROUND

Resolve the source exactly as `/implement-trd` §3.6 step 1 does — PRD, else the TRD's
`## Reproduction`, `## Intended Change` or `## Behaviour Preserved`. **No source at all →
`not run: no success definition derivable`, and STOP**; that one is a real dead end, because
nothing states what success means.

With a source, dispatch the same agent §3.6 dispatches, with the same contract text, and
**wait for it**:

```
Agent(subagent_type="product-manager",
      prompt="<packages/core/contracts/functional-verification.md text> + <the source> + <output path .trd-state/<feature>/success-definition.md>")
```

**Foreground, not background — and that is the difference from Step 8.** §3.6 backgrounds the
derive because it has a phase loop to get on with; Step 8 then cannot wait for it, since no
attested primitive lets a lead block on a specific background `Agent`. This command has
nothing else to do, so it simply waits, and both of Step 8's objections evaporate:

- *nothing to race* — no derive was dispatched earlier in this run, so an absent file here
  means "never asked for", not "the agent died".
- *not a second production path* — it is the SAME agent with the SAME contract, invoked from a
  different command. The objection §8.1 raises is to deriving **inline**, in the orchestrator's
  own context without the contract's mandatory-citation discipline. Passing the contract to the
  contract's own agent is that discipline, not a bypass of it.

**Bind `prd_path` when you resolve the source — 3a is the branch that knows it.** Step 3's
read yields `""` here by construction (no run's verification pass wrote the key — `--no-verify`
was set, or the run predates this command's invocation), so if 3a does not set it the header
goes blank even though a source WAS found — the one case this whole binding exists for.

Set it exactly as `/implement-trd` §3.6 does, and note the shape differs by source kind:

| Source kind | `prd_path` |
|---|---|
| `prd` | the PRD path |
| `reproduction` / `intended-change` / `behaviour-preserved` | the **TRD path plus the section name** — e.g. `docs/TRD/foo.md ## Reproduction` |

**Never the section's body text.** It is a one-line display string, interpolated into the
report header without escaping; a multi-line section body would break the header block. The
qualification matters because "the source it resolved" reads naturally as the extracted TEXT
for section kinds — which is what you pass to the derive AGENT, and is not what you pass here.

**`not run: no definition produced` survives, narrowed:** it now means the derive ran and wrote
nothing — the agent died, or found no criterion satisfying the citation rule and wrote a file
you should read. It no longer means "nobody ever asked".

**Reported from the field, 2026-08-23.** A run of `/implement-trd` with `--no-verify` was
followed by `/verify-build`, which stopped at `no definition produced` and declined to derive,
citing Step 8's reasoning. The reasoning was inherited without checking whether its premises
held here. They did not.

### 3b. Append the check criteria

**Identical to `/implement-trd` §8.1b — read that section and follow it.** `criteria` now
exists (step 3 or 3a); select the checks the TRD's `## Verification Artifacts` section names
(or the same defaults §8.1b applies when it is absent or silent), append their rows, and
resolve `checks`, `checkComments` and `pagesDir` exactly as §8.1b documents.

Under the fix loop (below), union the plan's `## Extra checks` table into this selection
first, restricted to rows naming a `check`-role skill in `framework-skills.txt` — a row naming
the `support`-role `verification-setup`, or any other skill whose role is not `check`, is left
out of the selection and reported in ISSUES (D11).

### 3c. Resolve criteria to environments and lanes

**Identical to `/implement-trd` §8.1a — read that section and follow it.** `criteria` now
includes the check rows appended at step 3b, and step 2's per-environment results are on disk
(`.trd-state/<feature>/implement.json`'s `functional_verification.environments`) — bucket each
criterion exercisable / not-verifiable against those results (no new `AskUserQuestion`; the
one question already ran at step 2), then derive `exerciseLanes`, `refreshCommand`,
`fullRunCommand` and `coverageFloor` from `verification.md` §1a/§2/§5a exactly as §8.1a
documents — `coverageFloor` via `read-coverage-floor`, `null` on an `invalid` line, named in
ISSUES with the same D9 wording.

### 4. Dispatch

All 22 fields §3.3 of `docs/TRD/functional-verification.md` declares — values from THIS
command's own resolution (Steps 1–3c), not copied from `/implement-trd`:

```javascript
Workflow({ name: "verify-functional", args: {
  criteria,                                                    // §3, from success-definition.md
  contract,                                                    // packages/core/contracts/functional-verification.md text
  notes,                                                        // .claude/verification-notes.md text, or ""
  stackHints,                                                   // stack.md + CLAUDE.md + verification.md excerpts (see /implement-trd §8.3)
  evidenceDir: ".trd-state/<feature>/evidence",
  checker: ".claude/lib/functional-verification.js",
  since,                                                         // resolved per implement-trd.md §8.3 -- max(HEAD commit time, loop start)
  cap: capArg ?? 3,                                              // "--cap N" overrides; default 3
  statePath: ".trd-state/<feature>/verification-state.json",
  reportPath: ".trd-state/<feature>/verification-report.md",
  resume,                                                        // from verification-state.json when --resume and its outcome is null; else null
  project: "",                                                   // set only when the TRD targets a codebase other than this repo
  feature: "<feature>",                                          // TRD basename (Step 1) -- renderReport()'s header
  prd: prd_path,                                                 // bound in Step 3 (implement.json's functional_verification.prd_path, or ""), overwritten by 3a when it runs
  definitionPath: ".trd-state/<feature>/success-definition.md",  // present (Step 3), or just-derived (Step 3a)
  exerciseLanes,                                                 // resolved per implement-trd.md §8.1a (step 3c here) -- verification.md §1a; omitted defaults to one lane of concurrency 1
  refreshCommand,                                                // resolved per implement-trd.md §8.1a (step 3c here) -- verification.md §2's fast refresh, or "" when none is declared
  fullRunCommand,                                                // resolved per implement-trd.md §8.1a (step 3c here) -- verification.md §2's full deploy, or "" when none is declared
  coverageFloor,                                                 // resolved per implement-trd.md §8.1a (step 3c here) -- verification.md §5a as a fraction, or null when none is declared
  checks,                                                        // resolved per implement-trd.md §8.1b (step 3b here) -- { "<skill>": "<SKILL.md text>" }; {} when none
  checkComments,                                                 // resolved per implement-trd.md §8.1b (step 3b here) -- open threads on each check's published page; [] when none
  pagesDir,                                                       // resolved per implement-trd.md §8.1b (step 3b here) -- ".trd-state/<feature>/verification-artifacts"; always set
} })
```

### 5. Report

Render the outcome — `satisfied` / `unbuilt` / `stalled` / `stuck` / `insufficient-coverage`,
or either `not run` case — with the per-criterion counts, the report path, and the coverage
ratio when the outcome is `insufficient-coverage`. A failed final full-environment run appears
in ISSUES with who acts (VCON-B009); it does not retract the criteria proven before it.

**State the coverage floor whenever this run reached step 4 (D19):** "Coverage floor: {N}%
(from verification.md)" when 3c's `coverageFloor` is non-null; "Coverage floor: not applied —
the line in verification.md does not parse" when `read-coverage-floor` returned `invalid`
(with the ISSUES line 3c requires); else "Coverage floor: none declared".

**§8.5 applies here in full: while the loop is in flight, its gaps are not yours to fix.**
Record them and let it finish.

---

## Readout

**Format: the four-section readout in `.claude/rules/command-status.md`** — STATE, DECISIONS,
ISSUES, NEXT, in that order, one screen, written for someone who was not in the session. Any
section may be "none". No section for what was dispatched or which stages ran: that is in the
transcript and does not change what the owner does next.

**NEXT follows one rule, stated once here (O4): outcome `satisfied` → `/audit-build`. Any
other outcome (`stalled`, `stuck`, `unbuilt`, `insufficient-coverage`) → `/refine-verification`,
then `/verify-build`. The report's Next line says the same, so the readout and the report never
disagree on what comes next.**

**When the outcome is `stalled`, `stuck`, `unbuilt` or `insufficient-coverage`** (D3;
verification-fix-loop TRD §3.1): STATE carries a Diagnosis line, counted over `criteria`'s
non-`met` entries exactly as `renderReport` counts them for the report — descending by count,
in words, cause-less entries as "unrecorded". Never re-derive the verdict here; this is a
count, not a second judgement. NEXT is `renderReport`'s own exact wording per O4, above:
"refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run
`/verify-build`".

## `--fix [plan-path]`, `--no-fix`, and `--resume`

**The build-and-reverify loop below runs by default whenever a plan is present** —
`.trd-state/<feature>/verification-plan.md`, or a different path named explicitly with
`--fix <plan-path>`. `--fix` with no path never disables anything; it only ever names a plan.

**`--no-fix` makes the run report-only**, even with a plan on disk: it runs Steps 1–5 above
once and stops there, exactly like the no-plan case below.

**With no plan present** (and nothing to opt out of): the run is a single verify pass — Steps
1–5 above — and NEXT follows O4, above: `/refine-verification`, then `/verify-build`.

**A plan is used once.** It counts as present only when its `**Written**` timestamp is later
than the last verification run's finish — the modification time of
`.trd-state/<feature>/verification-report.md`, or no report at all. `/refine-verification`
writes a plan after a run that fell short, so a fresh plan is always newer. Once a
`/verify-build` run has used it, the report it writes is newer than the plan, so the next
plain `/verify-build` reads that plan as spent: a single verify pass, NEXT `/refine-verification`.
Refine, run, repeat — never an old cycle's plan re-applied, with its rulings, to a run the
owner meant as a check. `--fix <plan-path>` names a plan explicitly and is used whatever its
timestamp; say in DECISIONS that an older plan was applied on request.

**`--resume` builds nothing (OQ-2).** It only continues an interrupted verification loop, so
it implies `--no-fix`: a plan on disk is ignored for that run, never a reason to refuse it —
otherwise a crashed loop could not be resumed while any plan exists. Only an explicit `--fix`
passed together with `--resume` is refused: stop before step 1 and name both flags in one
line. Fixing after a resumed run is a fresh `/verify-build`.

### `--resume`

Re-enters at the next iteration from `verification-state.json`, seeding `previousGaps`. The
state file's `outcome` key decides: `null` means the run stopped mid-loop and is resumable;
any of the five outcome strings means it finished and `--resume` starts a fresh run instead.
Only the file's `met` entries carry forward into the resumed run — `not_verifiable` and
`unbuilt` entries do not, so they are walked again this run. The iteration cap (`--cap N`,
default 3) is a total budget across every resume of one run, not a fresh budget each time
`--resume` is passed.

### The fix loop (default when a plan exists; verification-fix-loop TRD §3.6, D1, D8–D11, D13)

Owns an outer loop of build-then-verify rounds wrapped around the steps above (D1) — it builds
by chaining `/implement-trd`, never by dispatching an implementer itself (see "Why this exists
separately", above). The plan path defaults to `.trd-state/<feature>/verification-plan.md`
when that file exists; `--fix <plan-path>` names a different one explicitly.

0. **Steps 1–3c run exactly as above, with three additions when a plan is present.** Fold its
   `## Owner rulings` table into `notes` under a `## Owner rulings (verification-plan.md)`
   heading, so the Judge applies them (D11). Union its `## Extra checks` table into step 3b's
   selection (above). Read the stop rule with `readStopRule(planText)`
   (`.claude/lib/functional-verification.js`) rather than the model re-deriving it from prose
   (D6, D7) — a plan whose stop rule is missing or unreadable runs as if there were no plan
   (one round), and ISSUES says so. **Either way
   the run is bounded, and the readout names the rule it applied**: ISSUES carries
   "no readable stop rule in `<plan path>` (`<readStopRule's first error>`) — applied the
   default, `max-rounds: 1` (one round)", and STATE's round count reads against that `1`.
   The owner's fix is a `## Stop rule` section, written at the next bridge. Initialise
   `implement.json`'s `functional_verification.fix = { plan, stopRule, rounds: [], stopped:
   false }` (D9).

1. **Round 0.** With a plan: record each `## Blockers` row as a discovery
   (`kind: 'gap', foundBy: 'verify-build --fix', blocksFeature: true, ref: 'plan:<id>'`,
   `after` from its `After` column as `plan:<id>` refs, `—` meaning none — §3.2), passing the
   plan's `**Written**` timestamp as `record()`'s `nowIso` so a re-run of `--fix` on the same
   plan never re-promotes a blocker. Without `blocksFeature: true` nothing promotes and the
   chained build has nothing to build. Then chain
   `Skill({ skill: "implement-trd", args: "<trd> --reconcile --chained" })` to build them, then
   verify (step 4, below, with its synthesised `resume`). (There is no "no plan" case inside
   this loop any more — a run with no plan, and no `--fix`, never enters it; see the no-plan
   branch under the section above.)

2. **Round k ≥ 1 — record.** From the latest `verification-state.json`: for each criterion now
   `met` that carries an earlier ref'd discovery row, record a `met` row for that same `ref`
   (retiring the earlier failure, promoting nothing new). For each criterion still open whose
   cause is buildable (`judged-failed` or `not-built` — D4; every other cause is re-verified
   next round and never built) and which no `## Accepted as not verifiable` ruling in the plan
   covers: record a failing row (`kind: 'gap', foundBy: 'verify-build --fix', blocksFeature:
   true, status: 'not_met' | 'unbuilt', ref: '<criterion id>', evidence: '<cause>: <reason>'`
   — §3.2), but only for criteria in the plan's **active slice** — the
   first `## Slices` row, in order, that still has an open buildable criterion (D11). Slicing
   limits what is BUILT this round, never what is VERIFIED: step 4 below still walks every
   open criterion regardless of slice, so a regression outside the active slice is still seen.
   **Never recorded as a failing row, in any round:** a `not_verifiable` criterion (its causes,
   `environment-unreachable` and `capability-absent`, are never promoted — D4), and the run's
   outcome itself, `insufficient-coverage` included. A coverage shortfall is made of criteria
   nobody could check, not of code that failed; no build task can raise it, so it is reported
   in the readout and never turned into one.
   Record any `verification.md` need found this round as an ordinary discovery (D13):
   `kind: 'gap', blocksFeature: false, file: '.claude/rules/verification.md'`, summary naming
   the change — this command never edits that file itself (O6, NG7). **If nothing was recorded
   this round, skip to step 6.**

3. **Round k ≥ 1 — build.** Chain `Skill({ skill: "implement-trd", args: "<trd> --reconcile
   --chained" })` **exactly once per round** — ONE fix batch covering every row step 2
   recorded, never one build per criterion. On `RETURN → chained by /verify-build: <n> of <m> tasks built…`,
   continue to step 4. On `RETURN → STUCK: <reason>`, end the whole run now with `═══ COMMAND
   STUCK: /verify-build ═══` — under `--chained` the caller owns the run's only terminator, and
   a build that cannot proceed leaves nothing for another round to verify.

4. **Verify.** Step 4's dispatch (above), unchanged, with `resume` synthesised instead of read
   from disk (D8): `{ iteration: 0, criteria: <the latest state file's entries with status
   'met'>, gapsClosed: [] }`, dropping any criterion carrying an owner comment first — the same
   filter `/implement-trd` §8.2 already applies on its own `--resume` path. `iteration: 0`
   gives this round its own inner cap; passing the real state file as `resume` instead would
   read as an already-exhausted budget and return `stuck` at once. Because those `met` entries
   arrive as settled, **this round re-verifies only criteria still open**: a criterion already
   `met` is carried forward with its original `provenAt` and is not exercised again. Publish the report and each
   selected check's page to their stored `artifacts.json` URLs (the "Artifact link" section,
   below — the same mechanism, run again each round, not a second one), then read comments on
   each published check page (§8.1b step 5) so the next round's step 3b selection carries them
   and this step's filter un-settles any criterion they comment on.

5. **Close the round.** Append `{ round, promoted, closed, open, buildable }` to
   `functional_verification.fix.rounds` (D9) and emit `[STATUS: /verify-build] PHASE
   <k>/<maxRounds> COMPLETE → <closed> closed, <open> open`. Then run `node
   .claude/lib/functional-verification.js decide-fix-round --file <payload>` (§3.5) with this
   round's `round`, `maxRounds` and `closedBelow` (from the stop rule read at step 0),
   `closedThisRound` and `buildableOpen` (from this round's own counts). `action: 'continue'`
   returns to step 2 for round k+1. `action: 'stop'` — for any reason, including "nothing left
   to build" — falls through to step 6, and sets `functional_verification.fix.stopped = true`.

6. **Render and close.** Build the `## Fix run` section with `node
   .claude/lib/functional-verification.js render-fix-summary` (D10) and append it to
   `verification-report.md`, republish it under the same stored URL. Its `criteria` input is
   **every criterion not `met`** in the latest state file, each with a non-empty `stopReason`
   composed from the first of these that applies: `not verifiable here: <the Judge's reason>`
   (status `not_verifiable`); `accepted as not verifiable: <the plan's ruling>`; `not buildable
   by cause: <cause in words> — re-verified each round, never built` (a cause other than
   `judged-failed`/`not-built`); `outside the active slice`; `stop rule reached: <decide-fix-round's
   reason>`. The renderer prints `no stop reason recorded` for a blank one so an omission is
   visible, but a blank one is a defect in this step, never an acceptable row. Emit the readout: STATE
   carries the Diagnosis counts (above, unchanged); ISSUES names each `verification.md` need
   recorded at step 2, "the owner, at the next bridge" (D13); NEXT follows O4, above:
   `/refine-verification`, then `/verify-build`, when anything buildable or blocked remains,
   otherwise `/audit-build`. Exactly **one** `═══
   COMMAND COMPLETE: /verify-build ═══` banner for the whole run — never one per round —
   `notify-complete.sh`, and a `PushNotification` (`command-status.md` Path A for
   long-running commands).

---

## Output discipline (see `.claude/rules/command-status.md`)

### Artifact link (see `.claude/rules/command-status.md`)

Unless `.claude/settings.json` sets `ensemble.publishArtifacts: false`, publish the verification report with
`Artifact({ file_path: ".trd-state/<feature>/verification-report.md", icon: "check" })` — the markdown FILE, never a
rendering of it — reusing the stored URL from `.trd-state/<feature>/artifacts.json` (key
`verification-report`) when one is present, and storing it when one is not.

**Then, under the same switch, publish each selected check's page** (identical to
`/implement-trd` §9.0a — read that section and follow it): one call per skill with a `files`
map for its images, reusing the stored URL under the skill's own name in `artifacts.json` when
present and storing it when not. A page over 255 files goes up in several calls to the same
URL (TR4). With publishing off, name each page's local path instead.

Emit the link ABOVE the banner. A failed publish — the report's or any check page's — is one
line of prose and nothing more; it never blocks the banner.

**The banner is the LAST line of the turn. Nothing after it — not a caveat, not a finding, not
a recommendation.** Anything worth saying goes above it.

```
═══ COMMAND COMPLETE: /verify-build ═══
<outcome, criterion counts, report path>
```

On unrecoverable failure use `═══ COMMAND STUCK: /verify-build ═══` with `Reason:` and `Next:`.

```bash
.claude/hooks/notify-complete.sh "verify-build" "complete" "<one-line summary>"
```

---

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

Runs autonomously from invocation to the banner. `AskUserQuestion` is permitted only for the
four cases in `autonomy.md` — and on this command the realistic one is §2's preflight batch:
information that genuinely cannot be derived, asked ONCE, up front, with a stated default.

**Under the fix loop, not even that: it asks the owner no questions from start to finish** (O3).
Step 2's question takes its stated default and becomes a recorded `verification.md` need (step
2, above); the chained build runs under `--chained`, where no `AskUserQuestion` reaches the
owner (`/implement-trd` §3.7); and every decision the run needs comes from the plan the owner
already agreed in `/refine-verification`.

Do not pause to report interim findings. Do not offer to fix what the loop surfaces — the fix
loop fixes because a plan was present (or `--fix` named one) and `--no-fix` was not passed,
never because a plain run offered to.

- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- The declarative form is the same move: "I can fix that if you want", "say the word".
  Neither is a question; both hand the decision back and the work does not happen.
