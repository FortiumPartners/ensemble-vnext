# Changelog

All notable changes to ensemble-vnext are documented in this file.

**Versioning during the modernization run:** items 1–9 of
`docs/modernization/2026-08-improvement-plan.md` land as successive **patch** releases
(4.1.x), including ones that remove commands or otherwise break compatibility. Nothing in
this run is exposed to users until the whole sequence completes, so burning a minor or major
number per item would land users on 4.9+ or 9.0.0 for what is one coordinated change. The
breaking changes are still labelled as such below. A single minor/major bump marks the point
the work is actually released.

## [4.1.15] - 2026-08-14

### Changed

- **Subagent nesting is now forbidden by default** (constitution §1, user-approved). Prompted by an
  observed live chain: `backend-implementer → backend-implementer → backend-implementer`, with an
  **identical task description at the last two levels** — recursion, not decomposition. Roughly
  **567k tokens** across the chain, the deepest agent doing the work while two wrappers waited.

  **The previous stance inverted its own justification.** It permitted nesting by default and
  forbade it for three named leaf agents. The rationale given was *"agents whose work genuinely
  fans out — the canonical case is a reviewer dispatching a verifier per finding"* — and
  `code-reviewer`, that canonical case, was one of the three **forbidden**. Meanwhile every
  implementer, which fans nothing out, was permitted.

  All eight agents now declare `disallowedTools: Agent`. Nesting is permitted only where an agent
  has a **named fan-out rationale in its own definition** — no agent qualifies today, and adding
  one is a deliberate act rather than a default. **Same-type self-delegation is forbidden
  outright**, because a depth limit does not catch it: three levels of one agent on one task sits
  inside depth 3 and is pure recursion.

- **The three implementers no longer instruct themselves to delegate.** Each carried
  *"If a request involves [other domain], delegate appropriately"* — which contradicted principle 1
  outright. The orchestrator owns the task list, so a scope conflict is information it must
  *receive*; a nested spawn hides the decision and its reasoning from the only context that can act
  on it. They now stop and report the conflict, which is what the adjacent line already told them
  to do.

### Note

Nothing changed in 3.x to cause this. Subagent nesting was impossible when principle 1 was written,
became a platform default, and the constitution was updated to permit it deliberately — but the
permission was granted broadly while the justification stayed narrow. It was latent in every
implementer and surfaced when a task was decomposable enough to invite it.

## [4.1.14] - 2026-08-14

### Fixed

- **The "no about to at Stop" clause only covered payload-observable actions.** Found from a live
  failure in a project running 4.1.12 with both prompt hooks installed and firing: an agent ended
  two consecutive turns with *"Next I'll run -17, -18, -19 against prod"* and *"Next I'll bring up
  the local stack"*, and the judge allowed both.

  The judge was right. The clause required *"the asserted imminent action would be observable in
  the payload (a dispatch in `background_tasks`, a schedule in `session_crons`)"* — and a Bash call,
  a file read, an edit leave **no payload trace at all**. Its precondition was never satisfied.

  **The clause was built around one failure mode: the author's own.** 4.1.10's motivating case was
  *"I'm going to dispatch those three now"* — payload-observable, which is exactly why the self-audit
  passed 3/3 and the gap stayed invisible. The overwhelmingly commoner case is *"next I'll run /
  read / edit X"*, which has no payload signature whatsoever.

  Payload evidence was never necessary. The over-trigger guard already establishes the real test:
  the judge sees only the turn's **final** message, so mid-turn narration never reaches it. If the
  final message leaves an action stated-but-unstarted, then at `Stop` it did not happen — the same
  by-construction argument as the subagent case. Payload absence is now **corroboration for
  dispatch-type claims, never a precondition.**

  Added a discriminator the widening makes necessary: **the agent's own next action versus advice
  to the user.** *"Next I'll run the migration"* is a claim; *"Next step: run `npm install`"* is
  advice, and a completion summary recommending what the **user** should do next is correct
  behaviour. The test is whose action it is.

  Verified against the live failures and two controls: **TP=2 FP=0 TN=2 FN=0** — both live cases
  now caught, advice-to-user and reports-of-completed-work both correctly allowed. No regression:
  `self-documentation` 0 FP (11 cases), `clean-completion` 0 FP (17), original self-audit still
  3/3.

### Note on how this was caught

A guard shipped two releases ago failed live, and the offline corpus had scored it 3/3. The corpus
contained only the author's own failure shape. **A test suite written from the same mental model as
the implementation confirms the model rather than probing it** — the identical lesson as the
`waiting for` / `waiting on` regex miss that started this whole line of work, arriving one
abstraction layer up.

## [4.1.13] - 2026-08-13

### Fixed

- **`rebase-project.md` is now generator-managed.** 4.1.12 fixed the merge rule by hand; this fixes
  the reason it was wrong. `init-project.md` carried the generated `ENSEMBLE:HOOKS-TABLE` block and
  stayed correct through the entire 4.1.9–4.1.11 conversion. `rebase-project.md` described the same
  hook set in hand-written prose and rotted the moment that set changed. Both now carry the block,
  and `--check` detects drift in either — verified by tampering with it deliberately.

  The generated table also fixes a second-order lie: prompt-type entries now render as
  `.claude/hooks/prompts/<name>.prompt.md`, the artifact scaffolding actually delivers, instead of
  a `.js` path no scaffolded project has ever had.

### Added

- **`check-hook-prose.py` + `T009` + a smoke assertion** — a guard asserting every hook-*managing*
  command carries the generated block. Wired into BATS and `artifact-contracts`, and verified by
  stripping the markers and watching it fail.

  **The first version of this guard was wrong in an instructive way.** It flagged any command
  naming two or more hook files, and caught six that legitimately *reference* hooks without
  describing the installed set — `implement-trd.md` names five while explaining its own loop, which
  is correct and useful. A guard that fires on correct code gets disabled, and then it protects
  nothing. The distinction that matters is not "mentions hooks" but "tells you what an install must
  **contain**", which is a small knowable set, so it is listed explicitly rather than guessed.

### Why this keeps happening

Item 1 made the hook set manifest-driven with three generated consumers. `rebase-project` was never
counted as one, so it silently opted out of the guarantee — and `--check`, which validates exactly
the consumers it already knows about, could not see the gap. **A drift checker only covers what
someone remembered to enrol.** `T009` closes that by making enrolment itself the thing under test.

## [4.1.12] - 2026-08-13

### Fixed

- **`/rebase-project` could never update the hooks block.** Found from a real rebase that reported
  **9 registrations where the manifest declares 13** — silently missing all three model-judged
  discipline hooks and `dispatch-ledger.js`'s `SubagentStop` registration.

  The generic settings merge rule is *"existing key, different value → preserve vendored value."*
  `hooks` is an existing key whose value differs **by definition** whenever the hook set changed —
  which is the only time a rebase matters. So the hook set could never be updated by a rebase at
  all.

  The observed pattern matches exactly: `SubagentStart`, `SessionStart` and `PreCompact` landed
  because they were *new* keys; `Stop` and `SubagentStop` already existed, so their old values were
  preserved and every new registration on them was dropped. No error — preserving is what the rule
  said to do.

  `hooks` is now framework-owned and replaced wholesale, with any non-manifest registration carried
  forward so a user's own hooks survive. A pre-write check refuses to write if the merged block has
  fewer registrations or prompt entries than the plugin default.

  Two properties are now stated explicitly, because each had already caused a separate bug here:
  registrations are keyed by **`(event, file)`, never file alone** (`dispatch-ledger.js` registers
  on two events), and **prompt-type entries have no `command` field**, so anything identifying
  hooks by parsing `command` cannot see them.

- **`hooks/prompts/*.prompt.md` added to the rebase copy table.** A project receiving the
  registrations without the prompt text is broken a different way.

### Why this shipped as a version bump

The fix is content, not schema, and 4.1.11's cache was already built. Plugin caches are keyed by
version, so `/plugin install` would have reported "already 4.1.11" and skipped the corrected
command. Any behavioural fix to a shipped command needs a version bump to propagate.

**Root cause worth recording:** `init-project.md` is generator-managed via `ENSEMBLE:HOOKS-TABLE`
markers and stayed correct through the whole conversion. `rebase-project.md` is hand-written prose
and rotted the moment the hook set changed. `--check` validates the three generated consumers and
is blind to this one. Item 1 made the hook set manifest-driven with three generated consumers —
`rebase-project` was never one of them.

## [4.1.11] - 2026-08-13

### Removed

- **The regex apparatus, and the rollback lever it existed for — together.** `DISC-B009` was
  deferred because deleting the pattern battery would leave `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE`
  emitting `command`-type hooks with no detection logic. Sound reasoning, false premise: **the
  lever never worked outside this repository.** The three `.js` hooks are not delivered to
  scaffolded projects — the generator prunes their `packages/full/hooks/` symlinks once the entry
  becomes prompt-type, so the scaffold has nothing to copy, and `runtime-refresh.sh` is
  present-only so existing projects cannot acquire them either. It resurrected files that exist
  only during development.

  Deleted: `{async,autonomy,subagent}-discipline.js` and their vendored copies,
  `lib/async-claim-detector.js`, `lib/transcript-text.js` (orphaned — verified by grep, not
  assumed), the dead `subagent-discipline.test.js`, and every trace of the lever from the
  generator, `scaffold-project.sh`, and their tests. A comment survives at the removal site so
  nobody re-adds it.

- **The `init-project` hook table stopped rendering a path that never existed.** Prompt-type
  entries were listed as `.claude/hooks/<name>.js` — a file no scaffolded project has ever had.
  That was tolerable only while the lever could resurrect it. They now render as
  `.claude/hooks/prompts/<promptFile>`, the artifact scaffolding actually delivers, and the header
  count derives from delivered paths rather than manifest identifiers — honest by construction
  rather than by coincidence.

### Preserved

- **The retired detector survives as a frozen baseline**, moved into
  `test/discipline-corpus/detectors/regex.js` and made self-contained. `--detector regex` still
  runs and still produces an identical score, per-class as well as overall, so the judge's
  comparison stays reproducible after its subject is gone. Marked explicitly as a historical
  snapshot: not maintained, not extended. The regexes are no longer runtime code — they are a test
  fixture.

### Fixed

- **A stale regex floor quoted throughout the project.** `100% precision / 13.6% recall` appears in
  `RESULTS.md` and in 4.1.9's and 4.1.10's changelog entries. It was measured on the 61-case corpus,
  before the `payload-escape-valve` class existed. The correct figure on the current 66-case corpus
  is **66.7% precision / 16.0% recall**.

  The recall drift is immaterial — the judge's 96–100% dwarfs either number. The precision drop is
  not: this project repeatedly summarized the baseline as *"regex precision is perfect; recall is
  the structural problem,"* which held only while the corpus was text-only. The payload cases give
  the matcher two false positives because it cannot read the payload at all — it blocks a
  legitimate deferral backed by real `background_tasks` and clears a fabricated one where it is
  empty. On payload-sensitive cases the matcher is wrong in *both* directions.

  That reasoning was recorded when the payload class landed; the corrected *numbers* were never
  propagated to the summary tables, so the stale pair kept being quoted. Released entries are left
  as they were — the correction lives here so history stays honest about what was believed when.

  Found because the agent doing the deletion measured the baseline on `main` **before** touching
  anything, specifically so a stale target could not be mistaken for a regression it had caused.

## [4.1.10] - 2026-08-13

### Added

- **A third violation shape: "there is no 'about to' at `Stop`".** A final message asserting it is
  *about to* take an action has not taken it — at the moment the hook fires that assertion is
  already false, not merely unfulfilled. It is judged like the past- and present-tense forms it
  differs from only by tense: if the asserted action would be observable in the payload (a dispatch
  in `background_tasks`, a schedule in `session_crons`) and is not there, the claim is unbacked.

  **This exists because the session that built the judge produced the failure three times.** The
  orchestrator ended turns with "I'm going to dispatch those three now" and dispatched nothing. The
  judge did not catch it, and was right not to — the rule had no clause it violated. `Stop`
  discipline was written against hallucinated *notifications*; this is a hallucinated *action*.

  Measured before and after on the failures actually committed during development:

  | Case | Before | After |
  |---|---|---|
  | False `DISPATCHED` banner, empty `background_tasks` | caught | caught |
  | Silent non-delivery with real machinery armed | caught | caught |
  | "I'm going to dispatch those three now", nothing dispatched | **missed** | **caught** |
  | Control — identical banner prose, dispatch was real | allowed | allowed |

  Zero false positives on `self-documentation` (11 cases) and `clean-completion` (17), before and
  after — including against the new rule-file section, which necessarily contains the phrase "I'm
  going to dispatch". The clause carries an explicit over-trigger guard: the judge sees only the
  turn's *final* message, so ordinary mid-turn narration is out of scope, and ambiguity fails open.

  Added once to `build-judge-prompts.js` and spliced into all three prompts, so it cannot drift
  between hooks the way per-hook regex patches did.

- TRD §8's scope override recorded explicitly. That non-goal said this TRD would not change what
  the rules *say*. It does. Deferring would have meant shipping a guard while knowing it missed a
  failure the build session produced three times.

## [4.1.9] - 2026-08-13

The three discipline hooks move from regular expressions to model judgment.
Implements `docs/TRD/discipline-judgment.md` (improvement-plan item 5b).

### Changed

- **`async-discipline`, `autonomy-discipline` and `subagent-discipline` are now
  `hookType: "prompt"`** — evaluated by the platform's judge against the turn's final message and
  payload, rather than by a phrase battery inside a `.js` hook.

  Regex was the wrong tool for a question about intent, and it failed in production four separate
  times, most cheaply on `\bcompletion\b` versus "completion**s**" — one character defeating a
  word boundary. The deeper problem is structural: a matcher only ever finds what someone already
  thought to write a pattern for, and every new pattern widens the false-positive surface that the
  code-span/quote/meta-marker apparatus existed to contain.

  Measured against a 66-case corpus built from real transcripts: **recall 13.6% → 96–100%**, with
  zero self-documentation false positives across three consecutive runs. The judge also reads the
  **payload**, which the regexes structurally cannot — identical prose blocks when
  `background_tasks` is empty and passes when it is not, and on payload-sensitive cases the regex
  detector is wrong in *both* directions.

  Verified live against the real evaluator on both events, including the highest-risk case: a
  compliant `[STATUS: …] DISPATCHED` banner with real background work is **not** blocked.
  `command-status.md` requires that banner from every workflow command, and blocking it would have
  made every compliant command unrunnable.

- **The loop guard is a prompt instruction, not infrastructure.** `stop_hook_active` is `false` on
  first entry and `true` on re-entry, so the judge allows unconditionally on re-entry — exactly one
  corrective turn. Proven live by forcing byte-identical offending text through a second time and
  observing it pass; a content-based judge would have blocked again. The platform's own
  `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` (default 8) sits underneath as a backstop, deliberately not
  relied upon: when it fires under `--print`, stdout is empty and the transcript carries no trace.

- **A judge timeout resolves to allow.** Verified by forcing aborts and confirmed in the CLI source
  (`outcome:"cancelled"`, a distinct branch from `"blocking"`). The hook cannot wedge a session on
  evaluator unavailability.

### Added

- **`hookType` / `promptFile` in `hooks.manifest.json`**, emitted by
  `generate-hooks-artifacts.sh` with `--check` drift detection and delivery through
  `scaffold-project.sh`. Prompt text lives in files under `packages/core/hooks/prompts/`, generated
  from `build-judge-prompts.js` — one generator, three outputs, so the shared clauses cannot drift
  apart the way the patterns did.

- **A rollback lever — with a known defect, see below.** `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE=1`
  regenerates every prompt entry as command-type. It is a regenerate-and-refresh lever, not an
  instant switch, because a prompt hook runs no code of ours that could read an env var.

- **`test/discipline-corpus/`** — a 66-case acceptance corpus drawn from real transcripts, a
  detector-agnostic scoring harness, and `RESULTS.md`.

### Fixed

- The generator never **pruned** a `packages/full/hooks/` symlink whose manifest entry stopped
  being eligible, leaking stale links after conversion.
- Six tests invoked the generator against the live repo and restored file *contents* but not its
  *symlink side effects*, drifting the tree for every later test.
- `autonomy.md` claimed the rule was "NOT hook-enforced" — wrong since 3.3.12. `CLAUDE.md` still
  showed `learning.sh` in the Stop chain, retired in 4.1.0.

### Known limitations

- **The dispatch ledger loses its compensating `blocked` row.** `recordBlockInLedger` lives in
  `subagent-discipline.js`'s `main()`, which no longer executes. Hooks run concurrently, so
  `dispatch-ledger.js` cannot observe the judge's verdict. The error is transient — the ledger
  converges on the subagent's next stop — so the wrong window is one corrective turn.
- **The judge is non-deterministic in both directions.** False-negative counts across three
  identical runs were 0, 1, 0. Acceptance criteria are stated over multiple runs for this reason.
- **The rollback lever does not work outside this repository.** Found immediately after tagging,
  and stated here rather than left for a user to discover. The three `.js` hooks are no longer
  delivered to scaffolded projects — the generator prunes their `packages/full/hooks/` symlinks
  once the manifest entry becomes prompt-type, so the scaffold has nothing to copy, and this holds
  **even when the lever is set**. `runtime-refresh.sh` is present-only, so an existing project
  cannot acquire them later either.

  The consequence: setting the variable and regenerating produces `command`-type hooks pointing at
  `.claude/hooks/async-discipline.js`, a file that exists only in this monorepo. Rollback works
  here and nowhere else.

- **Deleting the regex apparatus is deferred**, on the reasoning that it would leave the rollback
  lever emitting hooks with no detection logic. That reasoning is sound in this repository and
  moot everywhere else, per the defect above — the deferral is currently protecting a path that
  only functions during development. Resolving the two together is the open decision: either
  deliver the `.js` hooks so the lever genuinely works in installed projects, or drop the lever
  and delete the apparatus with it. Shipping a documented safety mechanism that does not function
  is the worse option, and is exactly the argument used to defer the deletion in the first place.

## [4.1.8] - 2026-08-13

Completes item 5e: the orchestrator can now find its own in-flight subagents.

### Added

- **`dispatch-ledger.js` — a durable record of what was dispatched.** The scheduled-nudge
  pattern added in 4.1.7 had a hole: on wake, the lead had to *remember* what it dispatched,
  and that memory is exactly what compaction destroys — the case the pattern exists to
  survive. The ledger moves that knowledge to disk, written by hooks on `SubagentStart` and
  `SubagentStop` whether or not the lead remembers anything.

  `node .claude/hooks/dispatch-ledger.js --open` reports every subagent whose last recorded
  event is not `stop`, oldest first, with how long each has been running (`--json`,
  `--session <id>`). `/implement-trd` now reads it on every RESUMED turn instead of
  reconstructing the list from context.

  This is the first hook in the set registered on **two** events.

  Two design facts, both established by probing live payloads rather than trusting the docs:

  - **Neither event carries a `name` field.** The `name` passed to `Agent({name: "be-001"})`
    never reaches a hook, so the ledger keys on `agent_id` — which is what `SendMessage`
    should target anyway, since the CLI changelog records `SendMessage` misrouting when a
    re-spawned agent reused a previous agent's name.
  - **`prompt_id` is not stable across an agent's lifetime.** A live run produced a `stop`
    row whose `prompt_id` differed from its own `start` row.

  `subagent-discipline.js` appends a compensating `blocked` row when it blocks a stop. A
  blocked subagent has not actually stopped — without that row the ledger would report a
  still-running agent as finished, and the orchestrator would skip nudging precisely the
  agent most likely to be stuck.

- **The generator now maintains `packages/full/hooks/` symlinks from the manifest.** The
  plugin-cache layout resolves hooks from there, so a hook with no link is simply not
  delivered to anyone who installed the plugin — while every local test keeps passing,
  because the monorepo layout reads from `packages/core/` directly. This exact
  silent-absence failure has recurred throughout this project. `--check` now fails on a
  missing, dangling, or misdirected link; both cases were verified by breaking them
  deliberately.

### Fixed

- **`subagent-discipline.js` missed "waiting **on**" and "awaiting".** Found by a live run,
  not by the suite: a background subagent ended with *"Waiting on the monitor event for
  completion."* and was not blocked. Every pattern and all 24 tests had used "waiting
  **for**", so the other preposition walked straight through. Extended with regression cases
  in both directions, including false-positive guards ("the user is waiting for a response").

- **The `--open` kill switch was latched at module load**, so `ENSEMBLE_DISPATCH_LEDGER_DISABLE`
  could not be exercised by a test. Read at call time now — the same defect class as the
  `--check` flag that silently always passed.

### Changed

- A hook file may now declare one manifest entry **per event** it registers on. The copy
  list dedupes by file and fails loudly on conflicting sources; `T007` checks uniqueness of
  the `(source, event)` pair rather than of the file.

## [4.1.7] - 2026-08-12

Item 5b (partial) and 5e of the improvement plan.

### Added

- **`subagent-discipline.js` — the discipline guard now covers subagents.** The existing hooks
  run only on `Stop`, so they protected the orchestrator and nothing else. Three subagents in a
  single session ended with *"I'll wait for the monitor notifications to arrive"* and
  *"Waiting for background scenario completions"*, burning ~240k tokens across 179 tool calls and
  returning nothing — exactly what `async-discipline.js` catches, in the one place it never looked.

  The rule is **stricter** for subagents than for the lead: `ScheduleWakeup` is removed from every
  subagent by the platform's tool filter, so a subagent claiming it will come back later is false
  *by construction*. The lead's hook must check `background_tasks`/`session_crons` because the
  claim might be legitimate; for a subagent it never is.

  Blocking **continues the same subagent with its existing context** rather than respawning, and
  the block reason reaches it — so it can correct course without losing completed work. Loop
  safety is enforced two ways: `stop_hook_active` from the payload, plus a per-`agent_id`
  consecutive-block cap, after which the claim is allowed through and the counter resets. Blocking
  forever would be worse than the failure being guarded.

  24 new tests. Verified live: a real subagent was blocked, resumed under the same `agent_id`,
  abandoned the deferral framing, and completed.

- **The scheduled-nudge pattern**, documented in `async-discipline.md`. `ScheduleWakeup` is
  unavailable to subagents but available to the lead, and `SendMessage` reaches a named background
  agent with its context intact — so an orchestrator can dispatch, schedule a wake, and nudge
  anything still grinding. This covers the failure the `SubagentStop` guard cannot: an agent that
  keeps running without progressing never stops, so the guard never fires. No timeouts: a timeout
  kills work that may be nearly done, a nudge lets it continue.

### Changed

- **Hooks now read `last_assistant_message` instead of parsing the transcript.** All three
  discipline/loop hooks hand-parsed `transcript_path` JSONL backwards to find the last assistant
  message; the Stop payload carries it directly, and the docs warn the transcript file can lag the
  in-memory conversation. The transcript reader survives only as a fallback.

  This also removed a genuine duplication: `readLastAssistantText` and `stripCitations` were
  byte-identical copies in two hooks, and the fire-and-forget pattern battery is now a single
  shared module rather than something a second hook would have had to copy.

Deliberately unchanged: wiggum's re-injection design (state + completion promise), which waits on
item 8's keep-or-revert — if `/implement-trd` becomes workflow-driven, wiggum's role changes and
the redesign would be done twice.

## [4.1.6] - 2026-08-12

### Fixed

- **The plugin exposed ZERO commands since 4.1.2.** Item 2 replaced
  `packages/full/commands/plugin-only/*.md` with symlinks into
  `packages/core/commands/`, to stop the shipped copies going stale. Claude Code does not
  load plugin commands through symlinks: `claude plugin details` went from `Skills (2)` to
  `Skills (0)`, and `/init-project` and `/rebase-project` — the plugin's only two commands,
  and its entire purpose — became `Unknown command`. Restored as real files.

  Staleness was a genuine problem (the shipped copy had drifted two releases and still
  documented a hook deleted in 4.1.0), so it is now solved without breaking loading:
  `generate-hooks-artifacts.sh` syncs the copies, and `--check` fails on drift **or** on a
  symlink.

  Three tests asserted the symlinks and passed throughout, because a symlink resolving on
  the filesystem says nothing about whether the plugin loads it. They now assert real files,
  and `artifact-contracts` additionally asks the CLI what the plugin actually exposes —
  the assertion that would have caught this.

- **`/init-project` now installs the formatters it configures.** Step 10 wrote `.prettierrc`
  and then *"show install command and ask user to install"*, leaving every scaffolded JS/TS
  project with config and no tool — so `formatter.sh` fell through to `npx` on every edit,
  forever. It now installs project-scoped formatters (prettier, ruff, php-cs-fixer,
  csharpier), matching the project's package manager via its lockfile, and only *reports*
  system-scoped ones (`brew`, `go install`, `cargo`, `gem`) because this command owns the
  project, not the developer's machine. A failed install never fails initialization.

  Verified end to end: a fresh TS project now finishes with prettier in `devDependencies`
  and `node_modules/.bin/prettier` present, so the hook uses the local pinned copy and npx
  never runs.

### Changed

- The router gained two closing rules: end a turn with clear, actionable next steps unless
  there genuinely are none (rather than inventing work), and decide obvious low-risk next
  steps instead of dressing them up as questions. Both were prompted by this session
  producing exactly those failure modes.

## [4.1.5] - 2026-08-12

### Fixed

- **Reverted 4.1.4's formatter gate — it turned formatting off for exactly the projects the
  framework scaffolds.** `/init-project` Step 10 writes `.prettierrc` and then *"show install
  command and ask user to install"* — it does **not** install prettier. So for a scaffolded
  JS/TS project the `npx prettier` fallback is the only branch of the hook that ever fires,
  and gating it behind an opt-in disabled the formatter entirely.

  The gate rested on a single **cold-cache** measurement (~2s). Warm npx is **~0.6s**, because
  npx caches. Restored as the fallback; `node_modules/.bin/prettier` is still preferred when
  present, since that respects the project's pinned version and is faster.

  The upstream decision is recorded in the improvement plan: either Step 10 installs the
  formatter it configures, or the docs stop implying a local install. Today the framework does
  neither.

- A test added in 4.1.4 wrote a fake `prettier` into the repo's own `node_modules/.bin` — the
  suite creates a temp dir but does not `cd` into it, and the hook's `node_modules/.bin` check
  is relative to cwd (correct for the hook, which `settings.json` invokes through a `cd`
  wrapper). A stub executable on the repo's own bin path would have silently hijacked real
  formatting. Tests now isolate cwd, and the reason is recorded inline.

## [4.1.4] - 2026-08-12

Item 5c of the improvement plan, plus the router decision that had been left open
since 5a.

### Changed

- **The router now fires only when it can help.** It injected a 687-character block on
  *every* prompt — including slash-command turns, where the command carries hundreds of
  lines of its own instructions and the reminder is pure redundancy. Three deterministic
  skip conditions (no keyword matching, which is what misfired and got the original
  routing removed): empty prompt, prompt starting with `/`, and no ensemble scaffolding
  in the project.

  The content was rewritten around what it is actually for — turning a raw request like
  "build me a login page" into guidance down the core path. It now names both flows with
  confirmed command names (`/create-prd` → `/create-trd` → `/implement-trd` →
  `/harden-trd-team` → `/verify-trd-team`; and `/investigate-issue` → `/fix-issue`),
  points at `.trd-state/current.json`, notes that code review runs *inside*
  `/implement-trd` rather than being a separate step, prompts a deliberate
  skills-and-subagents decision, and asks for the request to be assessed against project
  memory and `.claude/rules/`. It closes by saying explicitly that conversational and
  trivial turns need none of it.

  It still does not name agents or skills by keyword. That was the original behaviour and
  it misfired — recommending an implementer and a test skill for a pure research
  question. Native description-based selection routes better; this names the *choice*,
  not the answer.

- **`formatter.sh` no longer silently downloads prettier.** It fell back to bare
  `npx prettier`, which fetches the package on every invocation when the project has no
  local copy — ~2s, on a `PostToolUse` hook that fires after every Edit/Write. It now
  prefers `node_modules/.bin/prettier` and gates the npx path behind
  `FORMATTER_ALLOW_NPX=1`. A project that wants formatting should declare the dependency.

### Fixed

- **`resolve-project-root.js` could silently resolve to a *different project*.** It walked
  up looking for `.claude`/`.trd-state`/`.git`, so a `cwd` outside the project did not
  fail — any sibling or nested git repo satisfied the `.git` marker, and hooks would then
  read and write the wrong `.trd-state/`. It now prefers `$CLAUDE_PROJECT_DIR` when set,
  which is also how every hook in `settings.json` is already invoked, and falls back to
  the walk only when it is absent.

- `stack.md` still listed `packages/permitter/` in the package structure — a directory
  deleted in 4.1.0. Caught by the new `artifact-contracts` smoke scenario on its first
  real run.

## [4.1.3] - 2026-08-12

Item 3 of the improvement plan: re-baselines vNext's assumptions about *how agents execute*
against the current platform. Those assumptions were correct when written; three of the four
had since degraded silently.

### Changed — BREAKING

- **The hardcoded concurrency limit is gone.** `implement-trd` said "Max 2 concurrent tasks",
  a heuristic from when subagents could not nest and the platform allowed very few at once.
  The platform now defaults to **20** (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`) and the
  per-session 200-spawn cap was removed. Concurrency is now derived: build the eligible set
  from unblocked tasks, partition by file ownership, spawn the partition. **Conflict, not a
  constant, is what serializes work** — the graph already proves what is safe to run together,
  and the platform ceiling is the backstop.

- **All 13 agents declare `background:` explicitly.** Subagents run in the background by
  default (v2.1.198+), and a background subagent keeps every MCP tool but only a fixed list of
  built-ins — the task tools and `AskUserQuestion` are removed *"whether inherited or listed in
  the `tools` field"*, and *"the removal reports no error."* The same definition therefore
  resolves to different tools depending on where it runs, silently. An inherited default is a
  latent trap; a declared value is reviewable. Each agent carries a one-line rationale.

- **Nesting stance decided: permitted to depth 3, restricted per agent.** Subagents can now
  spawn subagents — impossible when "commands orchestrate, subagents execute" was written, so
  that principle described the platform as much as a choice. It is now a deliberate one.
  `code-reviewer`, `code-simplifier`, and `verify-app` declare `disallowedTools: Agent`: they
  report, they do not delegate. The accepted cost is that a nested subagent's intermediate
  output is *designed* not to reach the orchestrator, so a wrong conclusion several layers down
  arrives as a confident summary with its reasoning discarded — restricting the leaf agents is
  what keeps that bounded.

### Added

- **`constitution.md` now states that the orchestrator owns the task list.** Task-list mutation
  is the command's job, never a subagent's: a subagent does not complete a task, it returns a
  result and the orchestrator records completion. This was already true of every command by
  accident; it is now true by statement, and it is what makes the background tool filter a
  non-issue rather than a silent failure waiting to happen. A worker that genuinely must
  self-claim is an agent-team teammate (teammates keep the task tools), not a subagent.
- Regression tests asserting both invariants: every agent declares `background:`, and the three
  leaf agents declare `disallowedTools: Agent`.

### Fixed

- `agent-validation.test.js` still enumerated **12** agents. `agent-implementer` — added in
  3.3.x — was absent from `REQUIRED_AGENTS`, so it was silently excluded from every assertion
  in that suite, including the two added here.

## [4.1.2] - 2026-08-12

Item 2 of the improvement plan: removes tooling that no longer exists, and one command that was
built on a construct that turned out to be wrong for it.

### Removed — BREAKING

- **`/implement-trd-team` is deleted.** Not deprecated — removed. It was built on agent teams, and
  three independent facts say that was the wrong construct:

  1. Its teammates only ever messaged the lead — status, completion, STUCK. They never messaged
     each other. Teams exist for peers who share findings and challenge each other.
  2. It relied on `--resume` with `teammate_session_id` recovery to span sessions, and teams
     cannot do that: *"`/resume` and `/rewind` do not restore in-process teammates."*
  3. The platform docs name its exact workload as the wrong fit: *"For sequential tasks, same-file
     edits, or work with many dependencies, a single session or subagents are more effective."*

  *Migration:* the three-pass workflow is now `/implement-trd` → `/harden-trd-team` →
  `/verify-trd-team`. Parallel implementation returns to `/implement-trd` once it has a real task
  graph, where parallel sets fall out of the graph itself rather than needing a separate command.

- **All `TeamCreate` / `TeamDelete` calls removed** from `create-prd-team`, `create-trd-team`, and
  `fix-issue`. Both tools were removed from Claude Code in v2.1.178; a team now forms automatically
  on the first teammate spawn, and cleanup happens when the session exits. The commands were
  calling tools that no longer exist. **These four commands keep using teams** — research and
  review is the correct use case for them.

- **`team_name` no longer used to encode grouping.** It is accepted but ignored by the platform, so
  phase and group identity now live where the platform can act on them: task names plus `blockedBy`
  dependencies on the shared task list. A pending task with unresolved dependencies cannot be
  claimed, and completing a task unblocks its dependents automatically.

### Fixed

- **`owner: "self"` created phantom task assignments.** `implement-trd` §4.2 instructed it, and the
  platform reads `owner` as an *agent name* — filing a task-assignment message into a mailbox for a
  teammate that does not exist. Nine accumulated unread during a single real run. Claiming is now
  `TaskUpdate({ taskId, status: "in_progress" })`, with the reason documented inline.

- **`async-discipline.md` asserted that teammate auto-delivery "silently stalls"** and mandated a
  paired `ScheduleWakeup` on every team spawn. A live experiment disproved it: a spawned teammate's
  `SendMessage` calls auto-delivered and re-invoked the lead with no wake involved. The wake is now
  a recommended fallback rather than a requirement. The evidence is one experiment plus current
  docs, so it stays as cheap insurance rather than being dropped.

- **The guides documented three hooks deleted in 4.1.0** (`permitter.js`, `learning.sh`,
  `save-remote-logs.js`) and omitted `runtime-refresh.sh`, added in 4.1.1. Every hook inventory in
  `docs/guides/` is now derived from `hooks.manifest.json`, including the distinction that
  `notify-complete.sh` is model-invoked rather than event-registered. No guide claims a `SessionEnd`
  hook exists, because none does.

## [4.1.1] - 2026-08-11

Completes item 1 of the improvement plan: the vendored runtime now ships correctly and
keeps itself current. Phases 2 and 3 of `docs/TRD/runtime-refresh.md`.

### Added

- **`packages/core/hooks/hooks.manifest.json`** — one declaration of every hook (file,
  event, matcher, order, timeout, registration kind, description). Three artifacts now
  generate from it: the scaffold's copy list, the template `settings.json` hook block, and
  the hook table in `init-project.md`. Adding a hook is one manifest entry instead of five
  hand-edits that drift apart.
- **`generate-hooks-artifacts.sh`** — the build-time generator, with `--check` for CI drift
  detection.
- **`scaffold-project.sh --refresh`** — updates only components already present in
  `.claude/`. Never creates one that is absent, never deletes one the plugin dropped. That
  restraint is what makes it safe to run unattended: it cannot un-curate a project. Adding
  and removing stays with `/rebase-project`.
- **`runtime-refresh.sh`** — a `SessionStart` hook that refreshes the vendored runtime when
  the installed plugin is newer. Four guards (no plugin, self-repo, in-flight task,
  monotonic version), always exits 0, sub-100ms when there is nothing to do. Documented in
  `docs/guides/ARCHITECTURE.md`.
- 30 tests: `scaffold-project.test.sh` 53 → 80, new `runtime-refresh.test.sh` (18).

### Fixed

- **A freshly scaffolded project now registers the same hooks this repo runs.** It
  previously received 5 of them; the five added in 3.3.9–3.3.12 never shipped.
- **Every template hook command used a bare `$(git rev-parse --show-toplevel)`** with no
  fallback, so scaffolded hooks failed outside a git worktree. All now use the
  `CLAUDE_PROJECT_DIR` form.
- **The `/init-project` that consumers actually run was never a generated consumer.**
  `packages/full/commands/plugin-only/` held real files while its siblings were symlinks,
  and `plugin.json` ships only that directory — so the shipped command still instructed
  users to verify a hook deleted in 4.1.0. Now symlinked into `packages/core/commands/`.
- **Two drift-checker defects that would have reported CI green while drifted**: `--check`
  compared bash's lowercase `true` against Python's `"True"` and always exited 0; and any
  unrecognized flag fell through to write mode.
- **Two path-traversal regressions** introduced by making the hook copy list data-driven: a
  crafted manifest `file` could set the exec bit outside the target project or copy an
  arbitrary file into `.claude/hooks/`. Manifest values are now validated at parse time.
- **The self-repo guard tested root equality rather than ancestry**, so a project nested
  inside the plugin checkout would have been refreshed — this repo holds ~40 eval-fixture
  projects (~1482 tracked files) in exactly that shape, pinned deliberately at a runtime
  version. Only the absence of a version stamp was masking it, and 4.1.0 began writing that
  stamp on every scaffold.
- **A failing refresh emitted nothing.** A project whose installed plugin predates
  `--refresh` failed identically every session with no indication, and never self-heals.
  Now reports the condition and the remedy.
- Authored-rule protection gained a denylist alongside its structural derivation, so
  shipping a default `constitution.md` template can no longer silently overwrite every
  project's governance.
- `ENSEMBLE_SAVE_REMOTE_LOGS` removed from the template — dead since 4.1.0 retired the hook
  it gated.

## [4.1.0] - 2026-08-11

Retires three hook components. Pulled forward from item 5 of the improvement plan because
item 1's Phase 2 authors a `hooks.manifest.json` that enumerates every hook file and
generates three consumers from it — declaring hooks that were about to be deleted would
mean writing that declaration twice. Deletions only; the item's modifications (prompt
hooks, wiggum re-injection, `resolve-project-root`, formatter) are unchanged and still to come.

### Removed — BREAKING

- **`permitter.js` and `packages/permitter/`** — a 241-line semantic permission matcher on
  `PermissionRequest`. It predates auto mode and prompt-based permission hooks, and is
  bypassed entirely in the permissions mode this framework recommends. Decisive evidence:
  **it had been completely broken in every scaffolded project and nobody noticed** — the
  plugin shipped `hooks/permitter.js` flat while `settings.json` registered
  `.claude/hooks/permitter/permitter.js`, and its `allowlist-loader`, `command-parser`, and
  `matcher` modules never shipped at all, so it threw `Cannot find module` on every
  permission request. Removing a security control that never ran changes nothing about
  actual behaviour; it removes the illusion that one was running.

  *Migration:* permission handling reverts to Claude Code's native path. Run
  `/fewer-permission-prompts` to generate an allowlist if you were relying on prompt
  reduction.

- **`learning.sh`** — orphaned. Unregistered in this repo, registered in the template,
  invoked by nothing: `/update-project` performs its own analysis and never called it,
  despite documentation (including this project's own constitution) claiming otherwise.
  20 of its 41 tests were failing.

- **`save-remote-logs.js`** — committed session transcripts to the repository, gated only on
  `ENSEMBLE_SAVE_REMOTE_LOGS=1`. A stale export in a shell profile meant every session
  silently committing its transcript. Log archival that writes to git should be an explicit
  act, not an ambient one.

**There is now no `SessionEnd` hook anywhere in the framework.** The constitution's
"no auto-commit in SessionEnd" prohibition is structural rather than aspirational.

### Changed

- `scaffold-project.sh` lost ~55 lines of permitter-specific copying, including the
  symlink-following logic that resolved its `lib/` directory — the code path that was
  silently failing in cache installs.
- The template `settings.json` no longer registers `PermissionRequest` or `SessionEnd`.
- `validate-init.sh` no longer requires `permitter/permitter.js`; required hooks are now
  `router.py` and `status.js`.
- `init-project.md`'s hook enumeration dropped the permitter and gained
  `autonomy-discipline.js`, which had been missing since 3.3.12.
- `rebase-project.md` lost ~40 lines of permitter layout rules and now reports a vendored
  `permitter/`, `learning.sh`, or `save-remote-logs.js` as *retired* rather than as drift to
  be repaired by re-adding them.
- `constitution.md`'s governance note corrected — an earlier fix in 4.0.0 replaced one wrong
  claim with another, asserting `/update-project` "builds on" `learning.sh`. It never did.

Incidentally fixed a pre-existing `validate-init.test.sh` failure: `Required hooks are
validated` had been failing because its fixture created a flat `permitter.js` that could
never match the required subdirectory path. 3 pre-existing failures → 2.

## [4.0.0] - 2026-08-11

Phase 1 of the **runtime refresh & delivery coherence** work
(`docs/TRD/runtime-refresh.md`). The headline change is that the plugin no longer
registers the skill library, cutting always-on context cost by ~99%.

### Changed — BREAKING

- **The plugin no longer registers the 61-skill library.** `plugin.json` dropped
  `"skills": "./skills"`, which had loaded every skill into every session on the
  machine and globally defeated `/init-project`'s per-project curation. Measured with
  `claude plugin details full@ensemble-vnext`: **Skills (63) / ~12,366 tok always-on →
  Skills (2) / ~95 tok**. The library still ships and still auto-updates with the
  plugin, now as an unregistered `skills-lib/` directory; nothing enters context until
  `/init-project` selects it.

  *Why this is breaking:* any project relying on library skills being globally
  available without appearing in its own `.claude/skills/` will stop seeing them. Run
  `/rebase-project`, or add the skill to `.claude/selected-skills.txt` and re-scaffold.

- **`packages/full/skills` removed.** Consumers reading that path directly must use
  `skills-lib/`. `scaffold-project.sh` prefers `skills-lib/` and falls back to
  `skills/` so older plugin installs keep working.

- **All 13 agents no longer declare a `skills:` frontmatter preload.** Agents ship in
  the plugin; skills are curated per project by `/init-project`. A hardcoded `skills:`
  list in a shipped agent therefore cannot be correct across projects — it names skills
  a given project never selected. This was masked until now: the global skill
  registration removed above made every hardcoded name resolve. Without it, 8 of 13
  agents pointed at skills absent from every curated project (`managing-railway`,
  `developing-with-react`, `framework-detector`, `managing-jira-issues`,
  `developing-with-flutter`), and the remaining 5 resolved only by coincidence of this
  project's selection — in a Rails project they would break identically.

  *Measured behaviour:* a nonexistent skill in this field does **not** fail the spawn
  and emits **no** warning — the entry is silently dropped. All 13 agents spawn
  successfully before and after. So the practical effect is a lost startup preload, not
  a broken agent.

  Agents retain full access to every installed skill through the Skill tool. Guarded by
  a regression test (`RUNTIME-T009` in `packages/core/agents/agent-validation.test.js`),
  because the silent-drop behaviour means nothing else would catch a reintroduction.

### Added — per-project agent skill preloads

- **Skill preloads are now generated per project, deterministically.** The hardcoded
  lists removed above were really *candidate pools*, and `/init-project` did intersect
  them against the project's `selected-skills.txt` in practice — but nothing instructed
  it to. Step 5 only said "preserve the existing frontmatter structure", so the pruning
  was emergent model judgment; an equally valid run preserved the pools verbatim, which
  is exactly what this repo's own agents did.

  `scaffold-project.sh` now performs that intersection in code, from a single
  declaration in `packages/core/agents/skill-affinity.json`. The generated output is
  byte-identical to what the model produced in a real `/init-project` run, across all 13
  agents — same result, now guaranteed rather than emergent. It is idempotent, and
  re-derives whenever the skill selection changes.

- **Agents also get a managed body block** between
  `<!-- ENSEMBLE:SKILLS:BEGIN -->` / `<!-- ENSEMBLE:SKILLS:END -->` markers.
  `Agent({team_name})` teammates do **not** receive frontmatter preloads — they read
  skills from the project — so the frontmatter channel alone reaches only half the spawn
  styles. The block names the agent's most relevant skills with one-line descriptions,
  then explicitly lists every other installed skill as still available and states that
  the list is not a restriction. Edits inside the markers are overwritten on the next
  scaffold or rebase.

### Added

- **`ensemble.version` / `ensemble.refreshed_at` stamped into `settings.json`** by
  `scaffold-project.sh`, on initial scaffold and on rebase. `/rebase-project`'s version
  detection has always read this field and never found it, so every rebase fell through
  to "unknown → full sync". Verified end-to-end: a runtime pinned to 3.3.9 now reports
  `3.3.9 → 4.0.0` rather than `unknown`. The stamp merges into any existing `ensemble`
  block and preserves the file's mode.
- **`packages/core/scripts/check-version-sync.sh`** — asserts `package.json`,
  both `marketplace.json` entries, and `plugin.json` agree. Available as
  `npm run check:versions`. The four had drifted to 1.0.0 / 1.0.0 / 1.0.0 / 3.3.12;
  silent drift disables the refresh mechanism's monotonic gate.
- **`.github/workflows/ci.yml`** — the repo had no CI. Four jobs: version sync,
  shellcheck, Jest, BATS. Jest and BATS are scoped to suites passing today, with the
  known-failing ones named in-file; delete entries from those lists as they are fixed.
- **`augment-trd-figma.md` vendored** to `.claude/commands/`, which had never been
  copied. `packages/core/commands/` and `.claude/commands/` are now at full parity.

### Fixed

- **`/init-project` Step 9 erased the version stamp.** Step 3 scaffolds and stamps;
  Step 9 then copied the raw template over the same file. Step 9 now copies only when
  the file is absent and verifies the stamp survived.
- **`constitution.md` governance table** claimed `CLAUDE.md` is maintained
  automatically by a `SessionEnd` hook. No such hook is registered in this repo. Now
  describes the real mechanism (`/update-project`, `/cleanup-project`) and notes that
  the shipped template *does* register `SessionEnd` → `learning.sh` +
  `save-remote-logs.js`, which stage and save only.
- **Stale 13-agent count** in `helpers/setup.sh` `REQUIRED_AGENTS` (silently stopped
  checking the full set), three `vendoring.test.sh` assertions, and the constitution's
  subagent table.
- **`cleanup_temp_dir`** refused every cleanup on macOS: `mktemp -d -t` allocates under
  `/var/folders/<...>/T/` even with `TMPDIR` unset, matching neither guard branch.

### Known gaps (Phase 2 of the TRD)

- Five hooks still do not ship: `async-discipline.js`, `autonomy-discipline.js`,
  `precompact.js`, `session-context.js`, `notify-complete.sh`. They lack symlinks in
  `packages/full/hooks/` and are absent from `scaffold-project.sh`'s hardcoded copy list.
- `packages/core/templates/claude-directory/settings.json` is ~3.3.8 era. A project
  scaffolded from it registers neither discipline hook, so those guards ship unwired.
- `scaffold-project.sh` copies the permitter's `lib/` modules to a path
  `permitter.js`'s `../lib/` cannot resolve, so the `PermissionRequest` hook fails with
  `MODULE_NOT_FOUND` in a cache install.

## [3.3.12] - 2026-05-30

Adds a **Stop-hook backstop** for the autonomy discipline — `autonomy-discipline.js`
blocks Stop events when a workflow command's last message contains a hedged-pause-offer
("I'll continue unless...", "Want me to keep going, or pause for a look?", "shall I
proceed?", etc.). Same defense-in-depth pattern as `async-discipline.js` for
fire-and-forget claims.

### Added

- **`packages/core/hooks/autonomy-discipline.js`** — new Stop hook (vendored to
  `.claude/hooks/`). Detects 12 hedged-pause-offer patterns in the current turn's
  assistant text. Only enforces when a `[STATUS: /...]` or `═══ COMMAND` banner is
  present (workflow-command context); regular conversational questions about next
  actions are not blocked. `/refine-prd` and `/refine-trd` are exempt (intentionally
  interactive). Self-documentation bypass (text discussing the rule itself doesn't
  trigger). Strict turn-boundary scanning (same as async-discipline).
- **Stop hook chain order**: `async-discipline.js → autonomy-discipline.js →
  wiggum.js → notify.sh`. Both `async-discipline` and `autonomy` block first; if
  neither catches, `wiggum` decides whether to extend the loop; `notify` always
  runs last.
- **BATS suite extended 36 → 43 tests** with Layer 4 covering: hook exists +
  executable + valid; vendored to dogfood; Stop chain order across both
  settings.json files; the exact user-reported phrase from 3.3.11 matches; helper
  functions (isCommandContext / isExemptCommand) work; init-project hook enumeration
  updated.

### Changed

- **Both `settings.json` Stop chains** register `autonomy-discipline.js` between
  `async-discipline.js` and `wiggum.js`. Byte-identical across template + dogfood.
- **`init-project.md` hook enumeration** updated 9 → 10 hooks (now lists
  `autonomy-discipline.js` alongside the others).
- **`autonomy-discipline.js` `require.main === module` guard** — the stdin-driven
  main flow only runs when invoked as a script, not when `require()`'d from tests
  (a pattern that was missing on initial implementation; caught by failing L4 tests).

### Why a Stop-hook backstop

The prompt-level enforcement added in 3.3.10 + sharpened in 3.3.11 was already in
place, but per the user's report, the model still drafted the exact "I'll continue
unless you want to pause" pattern. The hook is the next layer: the model produces
the text, the hook scans it on Stop, and if a hedged offer slipped through it gets
blocked with a re-injected instruction to delete the offer and continue. Same
defense-in-depth as async-discipline (prompt rule + Stop-hook guard).

### Tested against the user-reported failure

```
Input text (from 3.3.11 user report):
  "[STATUS: /implement-trd-team] PHASE 0/4 COMPLETE. Given Phase 0 went cleanly
   and your --wiggum choice, I'll continue autonomously into Phase 1 unless you
   want to pause and review first. Want me to keep going, or pause for a look?"

Hook result: BLOCK with reason instructing model to delete the offer and continue.
```

---

## [3.3.11] - 2026-05-29

Sharpens the 3.3.10 autonomy discipline after a real-world hedged-offer slip-through.

### Why

User report: `/implement-trd-team --wiggum` (autonomous mode flag explicitly set) finished
Phase 0 cleanly, then asked: *"Given Phase 0 went cleanly and your --wiggum choice, I'll
continue autonomously into Phase 1 unless you want to pause and review what's on
feature/notify-completion-events first. Want me to keep going, or pause for a look?"*

Two failures stacked:
1. The model knew the answer ("Given Phase 0 went cleanly… I'll continue autonomously")
   then asked anyway via a hedged "unless you want to pause" framing.
2. `--wiggum` literally means autonomous mode; asking under `--wiggum` is doubly wrong,
   but 3.3.10's autonomy block didn't call this out.

### Fixed

- **`autonomy.md`** gained two new explicit anti-pattern entries and a dedicated
  `--wiggum and other autonomous-mode flags` section:
  - "I'll continue unless you want me to pause" / "Want me to keep going, or pause for a
    look?" → **Hedged offers are still pauses. Just proceed without announcing.**
  - "Given X went cleanly, want me to pause and review?" → self-defeating; you just
    acknowledged there's nothing to address. Proceed.
  - `--wiggum` doubles enforcement: the four valid `AskUserQuestion` cases shrink to
    ONE (STUCK conditions only); all hedged offers and announcement-of-intent are
    forbidden; COMMAND COMPLETE is the FIRST and ONLY return of control.
- **All 16 non-refine commands' embedded autonomy block** gained the matching tightening
  — two new forbidden patterns + a `--wiggum and other autonomous-mode flags` callout
  at the end of each block.

### Verified

BATS suite extended 32 → 36 tests:
- `autonomy.md` forbids hedged "I'll continue unless..." offers
- `autonomy.md` documents the --wiggum doubly-enforced rule
- Every non-refine command's embedded block forbids hedged offers
- Every non-refine command's embedded block mentions --wiggum doubly-enforced rule

---

## [3.3.10] - 2026-05-29

Behavioral correction: workflow commands had drifted from autonomous orchestration toward
defensive checkpointing — asking the user to confirm decisions the command already had
enough information to make, "please review and confirm" mid-loop, deferential "should we
check with stakeholders?" deflections, "checkpoint reached, continue?" prompts at routine
phase boundaries. The framework was designed to run from one explicit user invocation to
one final result; defensive prompts contradicted that design and made unattended
execution impossible.

### Added

- **`.claude/rules/autonomy.md`** — new framework-shipped rule. Defines the four valid
  uses of `AskUserQuestion` (genuine requirement ambiguity with no documented default,
  missing information that cannot be derived, truly irreversible destructive operations,
  STUCK conditions after retry exhaustion) and lists nine common anti-patterns to
  eliminate. Documents `/refine-prd` and `/refine-trd` as the exempt commands
  (intentionally interactive — solicting user feedback is their purpose).
  Framework-shipped: copies to new projects via `/init-project` and existing projects
  via `/rebase-project` automatically.
- **Constitution Prohibited Pattern #8: "No defensive checkpointing"** referencing the
  new rule. Mirrored in `constitution.md.template` so new projects inherit. User-provided
  `ADDITIONAL_PROHIBITIONS` now number from 9.
- **`Autonomous-execution discipline` section appended to 16 workflow commands**:
  `implement-trd`, `implement-trd-team`, `verify-trd-team`, `harden-trd-team`,
  `fix-issue`, `create-prd-team`, `create-trd-team`, `create-prd`, `create-trd`,
  `update-project`, `cleanup-project`, `fold-prompt`, `investigate-issue`,
  `augment-trd-figma`, `init-project`, `rebase-project`. Each block tells the model
  explicitly: do not pause to confirm decisions, do not request artifact review mid-loop,
  do not defer to stakeholders, do not checkpoint at routine boundaries. Decide based
  on documented constraints, document the rationale in the artifact, proceed.

### Explicitly NOT changed

- **`refine-prd` and `refine-trd`** — the only two commands intentionally exempt. Their
  input IS user feedback; their output is a revised artifact; the iteration is the point.
  Both BATS Layer-2b verify the autonomy block is **ABSENT** from these two files (and
  PRESENT in the other 16).

### Verified

BATS suite extended to 32 tests (was 27); new Layer-2b group covers:
- `autonomy.md` exists in dogfood + framework template + is byte-identical
- Rule documents all four valid `AskUserQuestion` cases by name
- Constitution PP#8 references the new rule
- All 16 non-refine commands embed the autonomy block
- `refine-prd` and `refine-trd` do NOT embed the block

### Why

User report: "the commands have drifted to asking too many questions, including
questions they don't need to ask… this is built to be an orchestrated/autonomous
framework — we plan so that the commands run through."

The framework's design is: user invokes → command runs → COMMAND COMPLETE banner →
user reviews artifact → user iterates via `/refine-*` or `--resume`. Mid-loop
confirmation prompts break that contract and force the user back into babysitting
mode, defeating the design.

---

## [3.3.9] - 2026-05-29

Adds opt-in mitigations for the documented Claude Code TTY-backpressure / unfocused-tmux-
pane hang. **Workaround, not a fix** — the underlying bugs are upstream (Anthropic
[#57103](https://github.com/anthropics/claude-code/issues/57103) /
[#34668](https://github.com/anthropics/claude-code/issues/34668) /
[#25979](https://github.com/anthropics/claude-code/issues/25979)) and the framework
can't patch Claude Code itself. What we can ship is a one-shot setup script that applies
known-good tmux settings + a heartbeat daemon, plus the docs explaining why.

### Added

- **`packages/core/scripts/ensemble-tmux-apply.sh`** — vendored one-shot script that:
  1. Backs up `~/.tmux.conf` to a timestamped file
  2. Idempotently appends an `# ENSEMBLE TMUX MITIGATIONS` block with `focus-events on`,
     `history-limit 1000000`, `buffer-limit 100`, `mouse on`, `aggressive-resize off`,
     `monitor-activity off`, `monitor-bell off`
  3. `tmux source-file ~/.tmux.conf` — **live reload, no session restart, no
     Claude-session interruption**
  4. Verifies settings took effect via `tmux show-options`
  5. Installs `~/.local/bin/ensemble-claude-tmux-heartbeat.sh` — a daemon that every
     60s iterates every tmux pane running `claude`/`node` and toggles
     `pipe-pane -O 'cat >/dev/null'` then `pipe-pane` to force-drain the pane's PTY
     buffer (the same drain operation that focusing the pane manually triggers,
     without sending any keystrokes)
  6. Starts the heartbeat in a dedicated `ensemble-heartbeat` tmux window
- **`docs/operations/tmux-mitigations.md`** — full explanation of the symptom, root
  cause (Node.js event loop + tmux PTY backpressure), what the mitigations do, how to
  apply / tune / revert, and what they do NOT fix.
- **`docs/operations/anthropic-issue-draft.md`** — paste-ready GitHub issue draft
  linking to all related Anthropic + tmux issues, with a clean reproduction recipe.
  Users can paste it into a new issue or comment to add weight to existing reports.
- **`/init-project` Step 13.5** — new optional notice instructing the model to surface
  the tmux mitigations script at the end of init if the user runs Claude in tmux.
  Opt-in only; the script is never run automatically.

### Why

The framework's prior mitigation strategy was the `ScheduleWakeup` belt added in 3.3.3
for `Agent({team_name})` spawns. That worked for the specific team-mode case but
generalizing it to every async-wait situation was the wrong abstraction — we'd be
papering over a real Claude Code bug with framework-level workarounds that cost tokens
on every wake. The tmux mitigations attack the underlying cause (PTY backpressure)
directly and cheaply, without changing any command logic or scheduling more wakes.

### Not changed

- The 3.3.3 team-spawn `ScheduleWakeup` belt **stays at 1200s** — defensible as a true
  long-async backstop, not changed to fight the TTY symptom.
- The cadence recommendation in `command-status.md` stays unchanged. The strategic
  "generalize ScheduleWakeup to every wait" plan from earlier is explicitly **withdrawn**
  as the wrong abstraction.

---

## [3.3.8] - 2026-05-29

Patch release adding rich **session identity** to programmatic completion notifications.
The 3.3.6 contract sent only `NOTIFY_CMD` / `NOTIFY_STATUS` / `NOTIFY_SUMMARY` — fine for
a single project, but with multiple parallel Claude sessions across projects/branches/
features, the webhook receiver couldn't tell them apart.

### Added

- **`packages/core/hooks/notify-complete.sh` (new helper)** — vendored to projects via the
  existing hook-copy machinery (no scaffold changes needed). Discovers session identity
  from environment + working tree and exports 10 NOTIFY_* context vars before invoking
  the user's `$NOTIFY_ON_COMPLETE` command:

  | Var | Source |
  |---|---|
  | `NOTIFY_CMD` / `NOTIFY_STATUS` / `NOTIFY_SUMMARY` | Positional args from the command |
  | `NOTIFY_PROJECT` / `NOTIFY_CWD` | `$PWD` basename / full path |
  | `NOTIFY_BRANCH` | `git branch --show-current` |
  | `NOTIFY_FEATURE` | Basename of TRD path from `.trd-state/current.json` (jq if available, sed fallback) |
  | `NOTIFY_SESSION_ID` | `$CLAUDE_SESSION_ID` (set by `session-context.js`; `unknown` if absent) |
  | `NOTIFY_TMUX_SESSION` / `NOTIFY_TMUX_PANE` | `tmux display-message -p '#S'` / `$TMUX_PANE` |

- **`session-context.js` captures the Claude Code session_id** on SessionStart and writes
  `export CLAUDE_SESSION_ID=<id>` to `$CLAUDE_ENV_FILE`. CLAUDE_ENV_FILE is Claude Code's
  documented mechanism for SessionStart hooks to inject env vars that persist across all
  Bash invocations for the rest of the session. The session_id is sanitized
  (`^[A-Za-z0-9_.\-]+$`) before write to prevent env-file injection.

### Changed

- **All 18 workflow commands** migrated from inline bracket-guarded Bash to a single
  helper-script invocation:

  **Before (3.3.6):**
  ```bash
  [ -n "$NOTIFY_ON_COMPLETE" ] && \
    NOTIFY_CMD="implement-trd-team" NOTIFY_STATUS="complete" \
    NOTIFY_SUMMARY="<one-line>" /bin/sh -c "$NOTIFY_ON_COMPLETE"
  ```

  **After (3.3.8):**
  ```bash
  .claude/hooks/notify-complete.sh "implement-trd-team" "complete" "<one-line summary>"
  ```

  Discovery logic centralized in one place; commands stay readable. The helper handles
  the unset-env no-op, exports all 10 context vars, and exits with the user command's
  status.

- **`command-status.md` rule rewritten** to document the new contract: helper-script
  invocation, full 10-var context table with discovery sources, expanded user-setup
  recipes including JSON webhook, signal file, tmux-pane send-message, Slack with
  project context.

- **BATS regression suite extended** from 16 to 27 tests covering three layers:
  - Layer 1 (helper behavior, 13 tests): exists/executable; unset/empty silent no-op;
    fires-once with all 10 vars; graceful degradation when CLAUDE_SESSION_ID/tmux/git
    missing; feature discovery from `.trd-state/current.json`; STUCK status passes
    through; helper exits with user-command status; arg-count validation (rejects
    fewer with EX_USAGE 64); pass-through of values with shell-chars (sanitization
    is at the env-file write boundary).
  - Layer 2 (documentation contract, 9 tests): rule documents all 10 vars; template
    parity; all 18 commands invoke helper; helper arg-1 matches command name (no
    copy-paste drift); legacy inline form fully removed; canonical/dogfood/vendored
    helper mirrors stay in sync.
  - Layer 3 (session-context.js CLAUDE_SESSION_ID export, 5 tests): hook references
    the env-file mechanism; appends export with valid session_id; sanitizes injection
    attempts; no-ops cleanly without CLAUDE_ENV_FILE.

### Fixed (in the same release)

- **`session-context.js` env-file write was unreachable** in the initial implementation
  because it was placed AFTER the early-return for "no `.trd-state/current.json`".
  Moved to the top of `main()` so the session_id export runs unconditionally — useful
  for projects with no in-flight feature too. Caught by the new BATS Layer 3 tests.

---

## [3.3.7] - 2026-05-29

Patch release fixing `/implement-trd` and `/implement-trd-team` stopping after every
phase. The "Recommendation: Run /compact" prompt at each phase boundary was making the
commands hand control back to the user between phases, requiring the user to manually
restart them N times for an N-phase TRD. That's not the intent; the orchestration
loop is supposed to run through every phase to completion uninterrupted, pausing only
on STUCK / unrecoverable error conditions.

### Fixed

- **`/implement-trd §5.4`** (Context Management at Phase Boundary) — removed the
  "Recommendation: Run /compact before continuing to Phase {N+1}" prompt that was
  effectively a pause point. Replaced with explicit "DO NOT PAUSE" semantics: emit the
  `[STATUS: /implement-trd] PHASE N/M COMPLETE` banner and immediately spawn the next
  phase in the same orchestration loop. Compaction auto-fires at ~95% via the
  `precompact.js` hook; the state file (`implement.json`) survives compaction
  independently — neither requires user intervention.
- **`/implement-trd §8`** (formerly "Pause for User", renamed "Pause Conditions") —
  explicit list of the ONLY conditions that pause: STUCK after 3 retries, unrecoverable
  error, user Ctrl+C. Routine phase transitions, successful checkpoint commits, and
  `/compact` recommendations are NOT pause conditions.
- **`/implement-trd-team §4.3 + §6`** — same pattern applied. PHASE banner emitted +
  immediate next-phase spawn; pause only on the explicit STUCK conditions (plus the
  team-mode "reassign" option).

### Why

Pre-3.5.0 the commands' state durability rested on the user remembering to `/compact`
between phases. Once `precompact.js` (3.5.0) made compaction auto-archive the decision
trail to `session-log.md` and the state file kept all task-level progress independently
of conversation history, the manual /compact prompt became vestigial — and worse,
trained the model to hand control back to the user at each phase boundary. The
implement loop is supposed to be autonomous through completion; the pause was
contradicting its core promise.

---

## [3.3.6] - 2026-05-29

Patch release adding the missing **programmatic** completion-notify path. The existing
two paths (PushNotification, NOTIFY_ON_STOP) couldn't both alert external systems AND
fire precisely once per command — PushNotification routes only to Claude Code's
notification surfaces (no webhook redirect), and `notify.sh` Stop hook fires on every
turn end (including dispatch turns and ScheduleWakeup re-entries). For orchestration
patterns — webhooks, queues, shell pipelines, CI/CD triggers — there was no clean
single-fire programmatic signal.

### Added

- **`NOTIFY_ON_COMPLETE` env var contract** documented in `command-status.md` as **Path
  B** (programmatic). The model invokes the user's shell command via Bash from the same
  final turn that emits the COMMAND COMPLETE banner. Distinct from `NOTIFY_ON_STOP`
  (Path C, per-Stop) and `PushNotification` (Path A, user-facing alert):

  | Path | Audience | Mechanism | Fires |
  |------|----------|-----------|-------|
  | A. PushNotification | User (desktop / phone) | Claude Code native tool | Once, final turn |
  | B. NOTIFY_ON_COMPLETE | External systems (webhook/queue/shell) | Bash call invoking user's shell command | Once, final turn |
  | C. NOTIFY_ON_STOP | Per-Stop patterns (tmux, parent process) | Stop hook (`notify.sh`) | Every Stop |

- **Three context vars exported to the user's `NOTIFY_ON_COMPLETE` command:**
  - `NOTIFY_CMD` — slash command name without leading slash (e.g. `implement-trd-team`)
  - `NOTIFY_STATUS` — `complete` or `stuck`
  - `NOTIFY_SUMMARY` — the one-line summary used in the banner

- **All 18 workflow commands** updated to invoke `NOTIFY_ON_COMPLETE` from their final
  turn (long-running commands also keep their `PushNotification` step; short one-shot
  commands skip the PushNotification but still invoke the programmatic notify). The
  Bash call is bracket-guarded so it's a no-op when the user hasn't configured the env
  var — zero cost for users who don't want it.

### Why

Stop hooks are noisy. PushNotification is opaque to external systems. The right primitive
for "tell my CI / Slack / queue that this command finished" is a single Bash invocation
of a user-supplied shell command, fired exactly at the moment the model decides the
command is done. Same UX as `NOTIFY_ON_STOP` (an env var the user sets in shell init),
but precise — fires once per command, never on dispatch turns or ScheduleWakeup re-entries.

### Recipes

```bash
# Webhook (POST JSON)
export NOTIFY_ON_COMPLETE='curl -fsS -X POST -H "Content-Type: application/json" \
  -d "{\"cmd\":\"$NOTIFY_CMD\",\"status\":\"$NOTIFY_STATUS\",\"summary\":\"$NOTIFY_SUMMARY\"}" \
  "$ENSEMBLE_WEBHOOK_URL"'

# Slack
export NOTIFY_ON_COMPLETE='curl -fsS -X POST "$SLACK_WEBHOOK" \
  -d "{\"text\":\":white_check_mark: $NOTIFY_CMD: $NOTIFY_SUMMARY\"}"'

# Signal file / log
export NOTIFY_ON_COMPLETE='echo "$NOTIFY_CMD $NOTIFY_STATUS: $NOTIFY_SUMMARY" >> ~/ensemble-log.txt'

# Trigger downstream shell pipeline
export NOTIFY_ON_COMPLETE='make post-claude-deploy'
```

---

## [3.3.5] - 2026-05-29

Patch release fixing a real limitation in 3.3.4's notification story: the Stop-hook
`notify.sh` fires on EVERY turn end — including dispatch turns and ScheduleWakeup
re-entries during multi-turn commands — so it can't reliably distinguish "the command
finished" from "we just spawned background work and idled." 3.3.4 hinted at a
transcript-grep gate as a workaround; this release adopts the right primitive instead.

### Changed

- **`command-status.md` rewritten notification section into two paths:**
  - **Path A — `PushNotification` (preferred for completion alerts).** The model calls
    Claude Code's native `PushNotification` tool **directly from the command's final
    turn** as part of the same atomic gesture that emits `═══ COMMAND COMPLETE ═══`.
    One precise fire when the command is done, zero false positives during intermediate
    Stops. Notification is delivered via Claude Code's own surfaces (desktop notification
    in the terminal where the session runs; if Remote Control is connected, also push to
    the user's phone).
  - **Path B — `notify.sh` Stop hook (orchestration / external integration).** Unchanged
    behavior; documented as the right path for webhook triggers, signal files, queue
    messages, tmux pings to a parent pane — anything that legitimately wants every Stop
    event.
- **All 7 long-running commands** (`/implement-trd`, `/implement-trd-team`,
  `/verify-trd-team`, `/harden-trd-team`, `/fix-issue`, `/create-prd-team`,
  `/create-trd-team`) — Output Discipline section gained a step 5 instructing the model
  to call `PushNotification({status: "proactive", message: "<cmd> done: <one-line
  summary>"})` from the FINAL turn only (never DISPATCHED, RESUMED, or PHASE turns).
  Same pattern for `COMMAND STUCK` with Reason + Next embedded in the message so the
  user knows what to come back and unblock.
- **Short one-shot commands** intentionally NOT updated — the user is watching their
  turn; a desktop ping would be noise. The COMMAND COMPLETE banner alone is sufficient
  signal. Per the `PushNotification` tool's own guidance ("err toward not sending one").
- **Notification budget rules documented** in the rule, lifted verbatim from the
  PushNotification tool: under 200 characters, one line, no markdown, lead with what
  the user would act on, err toward not sending. Distinguishes notifications that drive
  action from notifications that just announce.

---

## [3.3.4] - 2026-05-29

Patch release giving every workflow command a uniform, visually unmistakable completion
signal so the user always knows when a command is truly done versus mid-flight. Closes a
recurring "is it done yet?" friction point.

### Added

- **`.claude/rules/command-status.md`** — new framework-shipped rule defining the standard
  status-emission contract for every command:
  - **`[STATUS: /<cmd>] DISPATCHED → ...`** when a turn ends with work in flight
  - **`[STATUS: /<cmd>] RESUMED → ...`** at the start of a wake/message-driven turn
  - **`[STATUS: /<cmd>] PHASE N/M COMPLETE → ...`** at each phase boundary
  - **`═══ COMMAND COMPLETE: /<cmd> ═══`** as the **last line** of the command's final
    turn (box-drawing chars make it impossible to miss in terminal output)
  - **`═══ COMMAND STUCK: /<cmd> ═══`** with `Reason:` and `Next:` on unrecoverable
    failure
  Shipped via the framework-rules folder, so `/init-project` and `/rebase-project` copy
  it to every project automatically.
- **Constitution gains Prohibited Pattern #7: "No silent completion"** referencing the
  rule. A command that ends silently is now a documented bug. Mirrored in the
  `constitution.md.template` so new projects inherit the rule.
- **Inline output-discipline section added to all 18 workflow commands** so the model
  doesn't depend on reading the rule. Long-running commands (`/implement-trd`,
  `/implement-trd-team`, `/verify-trd-team`, `/harden-trd-team`, `/fix-issue`,
  `/create-prd-team`, `/create-trd-team`) get the full DISPATCHED + RESUMED + PHASE +
  COMPLETE pattern; single-turn commands get the COMPLETE banner instruction.
- **Notification recipes documented** in the new rule for the existing `notify.sh` Stop
  hook (`NOTIFY_ON_STOP` env var). Concrete copy-pasteable recipes for: macOS desktop
  notification + terminal bell, plain bell, Slack webhook. Includes guidance for the
  noisy-on-every-stop concern (gate the alert by `grep -q "COMMAND COMPLETE"` against
  the transcript when only end-of-command alerts are wanted).

### Why

You should never have to ask "is it done?", "what's it waiting for?", or "did it stall?"
Three banners — DISPATCHED, RESUMED, COMMAND COMPLETE — answer those three questions at a
glance. The COMMAND COMPLETE banner is intentionally visually heavy (`═══`) so it's
easy to find when scanning long output. Optional desktop notification via the existing
`notify.sh` hook closes the loop for long-running unattended runs.

---

## [3.3.3] - 2026-05-29

Patch release closing a real architectural gap in team-mode orchestration: when the lead
session spawns teammates via `Agent({team_name, ...})` and ends its turn, Claude Code's
auto-re-invocation on inbound teammate `SendMessage` deliveries is **not reliable**.
Observed failure: teammates complete, send their reports, the lead idles, and no new turn
fires until the user types the next prompt — messages queue indefinitely; the long-running
orchestration loop stalls.

### Fixed

- **Team-spawn safety-net pattern added to `/implement-trd-team`, `/create-prd-team`,
  `/create-trd-team`**. Each command now includes a MANDATORY Step 2a / 3a directly after
  the `Agent({team_name})` spawn that requires pairing with
  `ScheduleWakeup({delaySeconds: 1200, prompt: "<re-enter the command>"})`. If auto-
  delivery does fire, the scheduled wake is a harmless no-op; if it stalls, the wake
  catches the mailbox within 20 minutes. This is the documented re-invocation belt —
  treat it as non-optional. (`/harden-trd-team`, `/verify-trd-team`, `/fix-issue`
  inherit via their reference to `/implement-trd-team` Step 4.)
- **`async-discipline.md` rule updated** to declare `Agent({team_name})` partial async
  that requires pairing — explicitly NOT one of the four self-sufficient async
  primitives. New section "`Agent({team_name})` — partial async, requires pairing"
  documents the observed stall, the pairing requirement, and notes that the Stop-hook
  guard is conservative (accepts non-empty `background_tasks` as sufficient, which is a
  false-positive of safety in the team case) — correctness is enforced at the command
  level via the mandatory Step 2a/3a.
- **Rule template synced** so new projects scaffolded via `/init-project` and existing
  projects rebased via `/rebase-project` both get the updated rule documenting the
  pairing requirement.

### Known follow-up

The Stop-hook guard (`async-discipline.js`) currently accepts any non-empty
`background_tasks` as satisfying the async-claim check — including teammates spawned via
`Agent({team_name})`. A more sophisticated guard would distinguish "background work
in flight" from "lead has a re-invocation path" and flag claims like "waiting on teammate
reports" when no `session_crons` / `Monitor` / `/goal` is paired with the team spawn.
Deferred to a follow-up PR; the command-level enforcement above closes the practical gap.

---

## [3.3.2] - 2026-05-28

Patch release fixing a latent bug across all native-team-mode commands: teammates were
producing report XML as plain text and going idle, but the lead never saw the reports —
in native team mode (`Agent({team_name, ...})`), plain text output is invisible to the
lead and only `SendMessage` delivers. Reports were stuck in teammate transcripts.

### Fixed

- **`/create-prd-team`, `/create-trd-team`, `/implement-trd-team`** — added an explicit
  **Report Delivery** section after each command's XML contract documenting that
  teammates MUST conclude their turn with a `SendMessage({to: "team-lead", summary,
  message})` call carrying the full `<teammate_report>` payload. The SendMessage tool
  docs state plainly: *"Your plain text output is NOT visible to other agents — to
  communicate, you MUST call this tool."* The commands were originally authored against
  the older `Task` tool pattern (where the agent's final text is returned to the caller);
  the native team model is different — teammates are long-running and communicate via
  `SendMessage` only.
- **Teammate prompts updated to make delivery explicit** — every teammate prompt in
  `/create-prd-team` (3 prompts) and the briefing template in `/create-trd-team` now
  include a concrete `SendMessage` example with the right `to`/`summary`/`message` shape
  and the closing instruction "Conclude your turn with the `SendMessage` call — then go
  idle." `/implement-trd-team`'s teammate template gained the same delivery contract for
  per-task and final-completion status messages.
- **Wait instructions clarified** — lead-side "wait for all teammates" lines now say
  "wait for `SendMessage` deliveries" with explicit recovery guidance: if a teammate
  idles without sending, re-prompt them via `SendMessage` with an instruction to call
  the tool. A teammate going idle does NOT mean it delivered — only a received
  `SendMessage` does.

`/harden-trd-team`, `/verify-trd-team`, and `/fix-issue` inherit the fix via their
reference to `/implement-trd-team`'s orchestration mechanics — no direct edits needed.

---

## [3.3.1] - 2026-05-28

Patch release fixing real bugs in `/rebase-project` discovered during the first downstream
rollout of 3.3.0. All fixes are to the `rebase-project.md` command prompt; no runtime
code or agent/skill changes.

### Fixed

- **`/rebase-project` v1.0.0 → v2.0.0** — non-interactive, content-diff, always-backup.
  Three bugs in v1.0.0: (1) existing agents were never updated even when the plugin's
  content changed — frontmatter updates, sharpened descriptions, new skill lists never
  propagated; (2) skills only checked stack-match, never content drift — `paths:` globs,
  `when_to_use` rewrites, currency-check sections never propagated to existing projects;
  (3) blocked on `AskUserQuestion` with four options. Rewritten to byte-diff every shipped
  file against the plugin and replace any that differ, always create a timestamped backup,
  proceed without prompting. Removed the `--force` flag (its old semantics is now the
  default). `--dry-run` and `--preserve-all` retained.
- **Permitter subdirectory layout preserved by rebase.** v1.0.0's hook discovery scanned
  for flat `*.js` files and would have flattened the correct installed layout
  (`.claude/hooks/permitter/permitter.js` + `permitter/lib/*`) back to a flat
  `.claude/hooks/permitter.js`, losing the `lib/` files and breaking the `settings.json`
  reference. Added "Install-time layout transformations" section documenting the permitter
  + core-lib subdirectory layouts; added `permitter/permitter.js`, `permitter/lib/*.js`,
  and `lib/*.js` to the explicit install-path table; added a settings.json sanity check
  that fixes stale flat references rather than flattening the hook.
- **AI-ecosystem skill mapping in `/rebase-project` table.** The skill-matching table in
  §2.2 was missing the 5 new AI skills shipped in 3.3.0 (`using-langfuse`,
  `building-rag-pipelines`, `building-agent-memory`, `building-tool-orchestration`,
  `using-pgvector`). Result: rebases on AI projects mapped only the provider skill
  (`using-openai-platform`) and missed everything else. Added all 5 rows plus capability-
  inference hints ("Langfuse" / "RAG" / "tool calling" / "agent memory" / "pgvector") so
  the right skills land even when `stack.md` doesn't name them explicitly. Added a "when
  in doubt, include the skill" note — skills are lazy and cost nothing until invoked.

---

## [3.3.0] - 2026-05-28

Claude Code modernization release. Brings the plugin into line with the current Claude Code
subagent / skill / command frontmatter spec and team-orchestration model; introduces an AI-
feature specialist (`agent-implementer`) plus the LLM-ecosystem skill library that supports
it; and closes several structural gaps the framework had been documenting-but-not-enforcing
(fire-and-forget async claims, cold session starts, lost decision trail on compaction).

Full assessments + rationale: `docs/modernization/2026-05-claude-code-alignment.md` (Phase 1)
and `docs/modernization/2026-05-phase2-recommendations.md` (Phase 2).

### Added

#### New specialist & AI-ecosystem skills
- **`agent-implementer` subagent** — the 13th specialist. Builds AI features end-to-end: LLM
  SDK integrations, RAG pipelines, agent loops, tool calling, agent memory, prompt
  observability/evals — with currency verification, retries, cost/latency awareness, and PII
  discipline baked into the role. Plugin manifest updated (`agents: 13`); `/implement-trd`
  agent-routing table gained a row for LLM/agent/RAG keywords → `agent-implementer`.
- **5 new AI-ecosystem skills** under `packages/skills/`:
  - **`using-pgvector`** — Postgres-native vector storage (HNSW/IVFFlat, vector/halfvec/sparsevec,
    distance ops, hybrid filters, raw SQL + Prisma + SQLAlchemy patterns). Postgres-native
    alternative to `using-weaviate`.
  - **`building-rag-pipelines`** — End-to-end RAG architecture (chunking, embedding, retrieval,
    reranking, citation/grounding, evaluation). Provider- and store-agnostic; delegates
    wire-level concerns to the provider and vector-store skills.
  - **`building-agent-memory`** — Conversation buffer, summary memory, vector-backed long-term,
    hierarchical (working/short/long), eviction/compaction, PII redaction.
  - **`building-tool-orchestration`** — Modernized cross-provider tool-calling: agent loop,
    parallel tool calls, dynamic tool selection for large tool sets, failure recovery
    (retry → fallback → escalate), structured outputs.
  - **`using-langfuse`** — Prompt observability (tracing, prompt versioning, eval datasets,
    A/B testing, cost/latency, multi-provider integration). Designated default observability
    skill.
- **LLM-platform skills added to `backend-implementer`** so backends that ship AI features
  have first-class access alongside the new `agent-implementer`: `using-anthropic-platform`,
  `using-openai-platform`, `using-perplexity-platform`, `building-langgraph-agents`,
  `using-weaviate`.

#### Phase 2 structural primitives
- **Async-discipline rule + Stop-hook guard** (`.claude/rules/async-discipline.md` +
  `packages/core/hooks/async-discipline.js`). Addresses a real recurring failure mode: an
  agent claims "I'll let you know when done" / "running in the background" but uses no
  actual async machinery, then sits idle until the user nudges (hallucinated notification).
  The Stop hook scans the last assistant turn for fire-and-forget claims; if a claim is
  present without any of the four legitimate async primitives in flight
  (`Agent({run_in_background: true})`, `ScheduleWakeup`, `Monitor`, `/goal`), the Stop is
  BLOCKED with a reason explaining the options. Constitution gains Prohibited Pattern #6
  referencing the rule.
- **SessionStart context hook** (`packages/core/hooks/session-context.js`). On every new
  session, reads `.trd-state/current.json` and surfaces the in-flight feature (PRD/TRD
  paths, task progress from `implement.json` or assertion verdicts from `verify.json`)
  into `additionalContext`. Removes the "remind me what we're working on" friction.
- **PreCompact decision-trail archiver** (`packages/core/hooks/precompact.js`). Before
  `/compact` (or auto-compaction at ~95%), appends a structured checkpoint to
  `.trd-state/<feature>/session-log.md`: timestamp + trigger, PRD/TRD, phase, strategy,
  branch, in-flight tasks (id + cycle + `current_problem`), tasks in retry, last 5
  completions, and a **Decisions & rationale (model: fill on resume)** stub. State records
  *what*; the log records *why* — both survive compaction.
- **Skill `paths:` globs for stack-specific auto-activation** (35+ skills). Language,
  framework, ORM, test-runner, vector-store, infra, and platform skills now declare
  `paths:` so Claude Code's native selector only auto-activates them when matching files
  are present (`developing-with-react` doesn't fire on a pure-backend session because the
  word "component" appeared; `rails` doesn't fire in a Python project).

#### Tooling, frontmatter, governance
- **`verify-goal` skill** (`packages/skills/verify-goal/SKILL.md`) — single-session,
  `/goal`-drivable live verification. The skill supplies the *structure* (per-assertion
  `verify.json` contract); `/goal` supplies the *loop*. `/verify-trd-team` emits a
  ready-to-paste `claude -p "/goal …"` invocation at preflight as the autonomous
  alternative to its team-based loop.
- **`effort` frontmatter on all 13 subagents** — `technical-architect: xhigh`; PM /
  spec-planner / code-reviewer / app-debugger / code-simplifier: `high` (code-simplifier
  uses `opus/medium`); implementers / verify-app / devops / cicd: `medium`.
- **`argument-hint` frontmatter on every arg-taking command** — `implement-trd`,
  `fix-issue`, `verify-trd-team`, `harden-trd-team`, `implement-trd-team`,
  `investigate-issue`, plus the PRD/TRD authoring family and lifecycle commands.
- **`disable-model-invocation: true`** on user-only commands: `init-project`,
  `rebase-project`, `create-prd`, `create-prd-team`, `refine-prd`, `create-trd`,
  `create-trd-team`, `refine-trd`, `augment-trd-figma`.
- **`when_to_use` on all 56 skills** with explicit disambiguation between overlapping
  families (smoke-test-*, per-language test runners, detectors as "run-first-then-handoff",
  the Playwright trio, SDK / platform-manager / infra boundaries).
- **Framework-shipped vs user-owned rules split** in `.claude/rules/`:
  - **User governance** (`constitution.md`, `stack.md`, `process.md`) — generated/customized
    at `/init-project`; `/rebase-project` NEVER modifies.
  - **Framework-shipped** (`async-discipline.md`, plus any future `.md` in
    `templates/claude-directory/rules/`) — copied-if-missing on BOTH init AND rebase.
    Folder-driven; the next framework rule is a drop-in.
- **Agent teams shipped enabled** — `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in the template
  `settings.json` so `*-team` commands work out of the box.
- **Modernization roadmap docs** (`docs/modernization/2026-05-claude-code-alignment.md`,
  `docs/modernization/2026-05-phase2-recommendations.md`) capturing per-mechanism analysis,
  decisions, and tracked follow-ups.

### Changed

- **Subagent dispatch renamed** `Task(subagent_type=…)` → the **`Agent`** tool across
  `implement-trd`, `implement-trd-team`, `harden-trd-team`, `verify-trd-team`, `fix-issue`,
  `create-prd-team`, `create-trd-team`. Added a "Task vs Agent (do not conflate)" note so
  the `TaskCreate / TaskUpdate / TaskList / TaskGet` work-list verbs stay distinct from
  the spawner.
- **`router.py` slimmed 841 → 126 lines** — replaced keyword-routing against
  `router-rules.json` with a single static "leverage the framework" reminder + a judgment
  clause ("skip for trivial / informational replies"). Fixes misfiring on analysis turns.
  New env: `ROUTER_DISABLE=1`. Tests rewritten end-to-end via subprocess (25 passing).
- **Team commands aligned to native shared-tree model** — research confirmed Agent Teams are
  designed around a *shared* working tree + file ownership + shared task list (`blockedBy`
  + file-locked claiming) + direct commits; `isolation: worktree` is opt-in for
  *independent* cross-feature work with no documented auto-merge. `implement-trd-team`,
  `create-prd-team`, `create-trd-team`, and `fix-issue` API modernized:
  `Teammate({operation:"spawnTeam"})` → `TeamCreate`; `Task({team_name,…})` →
  `Agent({subagent_type, team_name, name, prompt})`; `SendMessage` shutdown uses
  `{to, message:{type:"shutdown_request"}}`; cleanup → `TeamDelete`. Added Workspace-model
  note; reframed Step 3.3 as **File Ownership** (native safety mechanism).
- **Agent skill lists reconciled with the 56-skill library** (over-listing intentional;
  `init-project` downsizes per project). Orphaned skills assigned to the right specialists
  (devops gains `kubernetes/helm/aws-cloud/flyio/cloud-provider-detector/tooling-detector`;
  verify-app gains the `smoke-test-*` family + `test-detector`; cicd gains
  `act-local-ci/changelog-generator/flyio`; implementers gain `rails/phoenix/blazor` and
  `git-town`; PM / spec-planner / technical-architect picked up issue-tracker + detector
  skills).
- **Currency-check pattern enforced across all LLM-ecosystem skills** (`using-anthropic-platform`,
  `using-openai-platform`, `using-perplexity-platform`, `building-langgraph-agents`,
  `using-weaviate`). Each gains a forceful "**Stay current**" section requiring `WebFetch`
  of provider-specific docs/pricing/changelog URLs **before** recommending a model, comparing
  options, or citing pricing — citing source URL + fetch date in deliverables. The directive
  is mirrored in each skill's `when_to_use`. Existing "Models" tables flagged with ⚠️
  verify-current callouts. All 5 new AI-ecosystem skills inherit the pattern.
- **Template `settings.json` reconciled** with the working runtime — fixed `Stop` hook
  (was mis-running `learning.sh`; now `async-discipline.js → wiggum.js → notify.sh`); all
  hook commands use a 3-strategy CWD-resolution wrapper (`CLAUDE_PROJECT_DIR` → silenced
  `git rev-parse` → `pwd`); registered the new `SessionStart`/`PreCompact` hooks; shipped
  the teams flag. Template and dogfood `settings.json` are byte-identical.
- **`implement-trd.md` cycle_position enum** — resume table and stageOrder constant now
  cover the full on-disk enum (`implement | verify_red | verify | debug | simplify |
  verify_post_simplify | review | update | complete`), with explicit anchor mapping into
  the four stage groups. Previously truncated to 4 values; a `--resume` on `verify_red`,
  `debug`, `verify_post_simplify`, `update`, or `complete` fell through to "resume from
  implement" and re-did work.
- **`implement-trd.md §5.4` + `verify-trd-team.md`** document the `session-log.md`
  convention so the post-compaction model knows to re-read it and backfill rationale.
- **Sharpened routing descriptions** for the 5 most-confused specialists (longer,
  imperative descriptions with USE/DO-NOT-USE clauses and examples): `app-debugger` is now
  explicit "debugger of LAST resort"; `backend-implementer ↔ agent-implementer` boundary
  spelled out both ways; `devops-engineer` vs `cicd-specialist` boundary explicit.
- **Capture model:** the `SessionEnd` hooks (`learning.sh`, `save-remote-logs.js`) are
  deliberately removed. Learning capture now flows through explicit `/update-project`;
  native file-based memory (`MEMORY.md`) is documented as the *personal/per-machine*
  complement to the *committed/team-shared* CLAUDE.md layer.
- **`status.js`** SubagentStop hook header rewritten to accurately describe the
  complementary design (command sets cycle_position on entry; hook advances on subagent
  completion).
- **`init-project.md` hook enumeration** updated to the current 9-hook set
  (`permitter/permitter.js, router.py, formatter.sh, status.js, wiggum.js, notify.sh,
  async-discipline.js, session-context.js, precompact.js`); `learning.sh` removed
  throughout.
- **`augment-trd-figma.md` frontmatter** — replaced non-standard `user_invocable: true`
  with `disable-model-invocation: true`.
- **`fold-prompt.md` / `cleanup-project.md` / `update-project.md`** got `version` /
  `category` / `argument-hint` frontmatter for consistency with the rest of the suite.

### Fixed

- **`/rebase-project` no longer leaves stale agents/skills/commands behind.** Three
  bugs in the previous implementation: (1) agents were PRESERVED whenever they existed
  locally — content changes from the plugin (frontmatter updates, sharpened descriptions,
  new skill lists) never propagated; (2) skills were checked for stack-match only — content
  drift (`paths:` globs, `when_to_use` rewrites, currency-check sections) never propagated;
  (3) the command blocked on `AskUserQuestion` with four options including a confusing
  "preserve existing skills" choice. Rewritten to: byte-diff every shipped file against the
  plugin and replace any that differ, always create a timestamped backup before replacing,
  non-interactive by default (display summary then proceed; `--dry-run` and
  `--preserve-all` remain as opt-in modes). Command bumped to v2.0.0.


- **`wiggum.js` autonomous loop was abandoning incomplete work every other Stop event.**
  A self-managed `stop_hook_active` flag (set on block, cleared+exit on next call) made
  the hook alternate block → allow-exit regardless of completion. Removed; the
  infinite-loop guard is now solely the iteration cap + completion detection. Real-fs
  sandbox verified 5 sequential Stops all `block`, all-tasks-complete → `ALLOW-EXIT`.
- **`status.js` over-advanced `cycle_position` during DEBUG retries.**
  `advanceCyclePosition()` now SKIPS when the in-progress task has `retry_count > 0` or
  `current_problem` set — both signal the command has put the task into a DEBUG cycle and
  will re-dispatch verify after `app-debugger`. Added `'verify_red'` to `CYCLE_ORDER`
  (advances to `'implement'`) for TDD support.
- **Async-discipline false-positives on meta-discussion** (two iterations from real fires):
  - `stripCitations()` removes fenced code blocks, inline code spans, double-quoted
    strings before matching; single-quoted strings are stripped only when both quotes sit
    on word/sentence boundaries (preserving contractions like `don't`, `I'll`, `it's`).
  - `META_MARKERS` skips matches preceded within ~80 chars by `something like` /
    `for example` / `phrases like` / `the phrase` / `e.g.` / etc.
  - `readLastAssistantText` enforces a strict **turn boundary** — only scans assistant
    text produced AFTER the most recent user message, so earlier turns and hook-injected
    BLOCK_REASON content (user-side) can no longer leak into the scan.
  - `SELF_DOC_MARKERS` bypasses the entire match check when the text contains
    `[ASYNC-DISCIPLINE GUARD`, `async-discipline.md`, `async-discipline.js`, or the term
    `fire-and-forget` — self-evident meta-discussion.
- **`/init-project` no longer false-positives "existing installation" on a bare `.claude/`
  directory.** Detection now requires an **ensemble fingerprint** (`.trd-state/` dir, or
  `.claude/rules/constitution.md`, or `.claude/settings.json` with an `"ensemble"` block,
  or one of our specialist agent files in `.claude/agents/`). If `.claude/` exists without
  fingerprint → treated as greenfield-with-existing-`.claude/`: scaffold around it, preserve
  user files, merge the `ensemble` block into any pre-existing `settings.json`.
- **Hooks no longer break silently when `git` is missing or the directory isn't a repo.**
  Old wrapper `bash -c 'cd "$(git rev-parse --show-toplevel)" && X'` failed silently when
  git errored. New wrapper tries `CLAUDE_PROJECT_DIR` → silenced `git rev-parse` → `pwd`
  fallback. Applied across both template and dogfood `settings.json` (all hook commands,
  both JSON-valid).
- **Permitter scaffold dropped its `lib/` files silently.** The scaffold read the symlink
  target as a relative path, then resolved `[[ -d lib_dir ]]` against the *target project*'s
  CWD instead of the plugin dir, so `matcher.js` / `allowlist-loader.js` /
  `command-parser.js` never landed. Now anchored to the symlink's directory via
  `cd && pwd`. BATS scaffold suite: **42/42** (was 41/42).
- **`validate-init`** had the wrong permitter path (`permitter.js` vs the actual
  `permitter/permitter.js`), so it always reported "Missing required hook: permitter.js"
  even on a correctly scaffolded project. Path corrected. `validate-init` also now checks
  for `.claude/rules/async-discipline.md`.
- **`verify-app` had invalid `color: magenta`** per the current subagent spec (allowed:
  red/blue/green/yellow/purple/orange/pink/cyan). Changed to `pink`.
- **`app-debugger` body referenced a non-existent skill `playwright-test`.** Corrected to
  `writing-playwright-tests`.

### Removed

- **`router-rules.json` plumbing** (vestigial after the slim router):
  - Commands: `generate-router-rules`, `generate-project-router-rules`.
  - JSON files: all `router-rules.json` copies under packages/templates/dogfood.
  - References across `init-project.md`, `update-project.md`, scaffold, BATS tests,
    rebase docs.
- **`SessionEnd` hook block** (`learning.sh` + `save-remote-logs.js`) from both template
  and dogfood `settings.json`. Capture moved to explicit `/update-project`.

### Follow-ups (tracked, separate PRs)

- **#12** — repair hook jest harness (`mock-fs@5.2.0` incompatible with Node 25). New
  hook behavior verified via real-fs sandboxes pending jest harness repair.
- Scheduled autonomous PM/architect runs via `--agent` + `/schedule`.
- `memory: project` flag decision on `code-reviewer`, `app-debugger`, `technical-architect`.

---

## [3.2.0] - 2026-02-23

### Added

- **Agent Team commands** -- three new `/...-team` command variants using Claude Code's
  experimental Agent Teams for parallel multi-agent execution:

  - **`/create-prd-team`** (`packages/core/commands/create-prd-team.md`)
    Spawns parallel teammates (product-research, tech-feasibility, optional
    devils-advocate) for multi-perspective PRD analysis. Output structurally
    identical to `/create-prd`.

  - **`/create-trd-team`** (`packages/core/commands/create-trd-team.md`)
    Spawns domain-expert teammates (backend-arch, frontend-arch, quality-strategy,
    optional infra-perspective) who each propose tasks in their domain. Lead
    synthesizes into unified TRD with merged dependency graph and execution plan.

  - **`/implement-trd-team`** (`packages/core/commands/implement-trd-team.md`)
    Executes TRD work sessions in parallel -- one teammate per session within each
    phase. References `/implement-trd` templates (A.1-A.8), does not duplicate them.
    State files interoperable with sequential `/implement-trd`.

  Vendored copies in `.claude/commands/` for project runtime.

- **7 new skills** in `packages/skills/`:
  - `building-integrations` -- Third-party API integration patterns (webhooks,
    idempotency, retry with Polly, circuit breakers, HttpClientFactory)
  - `developing-with-dotnet` -- .NET 9 with Clean Architecture, MediatR CQRS,
    EF Core, minimal APIs (SKILL.md + REFERENCE.md)
  - `managing-azure-devops` -- Azure DevOps YAML pipelines, multi-stage deployments,
    template references, variable groups (SKILL.md + REFERENCE.md)
  - `playwright-automation` -- Production browser automation for RPA, web scraping,
    and workflow automation; distinct from E2E testing (SKILL.md + REFERENCE.md)
  - `using-azure-functions` -- Isolated worker model for .NET 8/9 with HTTP,
    Service Bus, Timer, and Durable Functions triggers (SKILL.md + REFERENCE.md)
  - `using-clerk` -- Clerk authentication with C# SDK, React integration,
    Svix webhook verification, organization multi-tenancy (SKILL.md)
  - `using-terraform-azure` -- Terraform with azurerm 4.x provider, Key Vault,
    Managed Identity, App Service, Azure Verified Modules (SKILL.md + REFERENCE.md)

- **Explicit skill invocation in delegation flow** -- skills declared in agent
  frontmatter are now actively injected into delegation prompts instead of
  relying on agents to independently discover them:

  - **`/create-trd`**: New `Skills` column in Master Task List phase tables,
    populated via dynamic discovery from target agent's frontmatter `skills:`
    list and each skill's description. New Section 4.1.2 "Skill Hints" with
    discovery instructions. Validation checklist updated.

  - **`/create-trd-team`**: `<skills>` element added to teammate task proposal
    XML contract. Teammate briefing includes skill discovery instructions.
    Synthesis preserves skill hints when merging tasks.

  - **`/implement-trd`**: Hardcoded keyword-to-skill table replaced with
    dynamic resolution (TRD Skills column > agent frontmatter fallback,
    intersected with agent's declared skills). New `<skills>` block with
    invocation instruction added to templates A.2 (IMPLEMENT), A.3 (VERIFY),
    A.6 (SIMPLIFY), A.7 (REVIEW). IMPLEMENT deliverables extended with
    SKILLS_USED and RULES_APPLIED reporting.

  - **`/implement-trd-team`**: `<skills>` element added to teammate task XML.
    Delegation instruction added to pass skills to subagents.

  Vendored copies in `.claude/commands/` updated.

- **`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var** added to project template
  (`packages/core/templates/claude-directory/settings.json`), project settings
  (`.claude/settings.json`), and global config (`~/.claude/settings.json`).

### Changed

- **Agent model assignments** -- all 12 agents now have explicit `model:` field:
  - **Opus**: product-manager, technical-architect, spec-planner, code-reviewer,
    code-simplifier, app-debugger
  - **Sonnet**: frontend-implementer, backend-implementer, mobile-implementer,
    verify-app, devops-engineer, cicd-specialist

- **Agent skill lists updated** -- new skills distributed to relevant agents:
  - `developing-with-dotnet` added to: backend-implementer, code-reviewer,
    code-simplifier, app-debugger
  - `using-azure-functions` added to: backend-implementer, devops-engineer,
    app-debugger, code-reviewer
  - `using-clerk` added to: frontend-implementer, backend-implementer,
    app-debugger, code-reviewer
  - `building-integrations` added to: backend-implementer, app-debugger,
    code-reviewer
  - `playwright-automation` added to: frontend-implementer, app-debugger,
    code-reviewer
  - `managing-azure-devops` added to: cicd-specialist, devops-engineer,
    code-reviewer
  - `using-terraform-azure` added to: devops-engineer, code-reviewer
  - Skill lists reformatted from inline to YAML list syntax for readability

- **Router injection templates** (`packages/router/lib/router-rules.json`)
  Added teammate routing hint to all 5 injection templates: "If spawning a
  teammate, use the most appropriate ensemble agent (subagent_type) for the task."

- **Plugin CLAUDE.md** (`packages/full/CLAUDE.md`)
  Added delegation guidance: "When delegating work -- whether via subagent or
  teammate -- always use the named agent matching the task domain."

- **`/init-project` command** -- support inline config for unattended initialization;
  expanded plugin-only commands (`init-project.md`, `rebase-project.md`).

- **`agent-validation.test.js`** -- updated to reflect new model field in agents.

## [3.1.0] - 2026-02-19

### Changed

- Consolidated `/implement-trd` with TaskTools integration for dependency chains
  and structural stage enforcement.
- Active cycle position advancement via `status.js` hook on SubagentStop.
- Context management: single-line result summaries, `/compact` recommendation
  at phase boundaries.
- State-write-before-delegate pattern for implement.json updates.
- SIMPLIFY template requires actual file reads and evidence.

### Added

- `resolve-project-root.js` lib for hooks that need project root resolution.
- `formatter.sh` hook for PostToolUse formatting.
- `save-remote-logs.js` improvements for session log capture.
- Verification level support in constitution.md (`unit-only`, `live-required`,
  `e2e-required`, `manual-required`).
- `[LIVE]` task marker for per-task verification level override.

## Prior Versions

See git log for history prior to changelog adoption.
