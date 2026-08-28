# TRD: discipline-rules-accuracy

**Source PRD**: None — defect found while investigating the discipline guards' block rate (2026-08-26)

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | `async-discipline.md` states the current measured allow-leak rate AND that the metric behind its historical figures was superseded, so a reader neither treats a stale number as live nor compares two differently-defined measurements | the reproduction below |
| O2 | Every place this framework recommends `/goal` as an async primitive also states that it loops unbounded, so a reader choosing between the four primitives knows the one that does not self-limit | the reproduction below |
| O3 | Both facts carry a regression test, so the next measurement-driven edit cannot silently restore a stale number | the reproduction below |

## Reproduction

### Steps

```bash
# 1. The sanctioned measurement tool, against the session that motivated this work
node packages/core/scripts/hook-verdict-rate.js --project -Users-james-dev-lightning-lane-prompt-fixes

# 2. What the rule file claims
grep -n "31 of 251\|~12%\|1.7% of 296" .claude/rules/async-discipline.md

# 3. Where /goal is recommended, and whether any warning accompanies it
grep -n "/goal" .claude/rules/async-discipline.md .claude/rules/constitution.md
```

### Actual

**Step 1** reports:

```
TOTAL: 957 evaluations | 100 blocks (10.4%) | 3 anomalous allows (0.3%)
VERDICT: allow-leak rate nominal
```

**Step 2** finds `async-discipline.md` still describing the leak as a live defect at
`31 of 251 (~12%)`, alongside a separate figure of `38 blocks to 5 such allows
(~1.7% of 296 evaluations)`.

**These are not merely out of date — they measured a definition the tool has since retired.**
`hook-verdict-rate.js:5-14` records the correction in its own header, dated **2026-08-18**,
after both figures were taken: *"The earlier version of this file called every entry a 'prose
leak'... That was wrong and actively misleading: it reported the fix had made things 2.5x
worse (11.4% -> 28.6%) when the real cause was simply that the agent got blocked more often."*
The current classifier splits `hookErrors` into blocks (upstream rendering, expected) and
allow-leaks (ours) via a structural signal at `:84`.

So the correct statement is narrower than "the fix held", and this TRD does **not** claim that.
What is measured today is `3 anomalous allows in 957 evaluations (0.3%)`, verdict `nominal`.
Whether that is an improvement on `31/251` is **not established**, because the two numbers
count different things. Attempting the like-for-like: the two older transcripts in the same
project return `0 blocks, 0 allows across 596 evaluations` — they predate the prompt-type
hooks, so they are not a comparison population, and the session behind the historical `251` is
not identified anywhere in the file.

This is not a cosmetic staleness. The file instructs the reader to *"verify the fix by
counting, not by looking"* and gives `31/251` as the number to beat. A reader who counts
today gets 0.3% and has no way to tell whether that is the fix working or a different
sample. The measured-and-resolved state is the missing fact.

**Step 3** finds `/goal` recommended as the fourth of four co-equal async primitives —
`async-discipline.md:23` ("keep the session working turn-after-turn until a machine-checkable
condition is met") and `constitution.md:239` (listed beside `run_in_background`,
`ScheduleWakeup`, `Monitor`) — with **no** statement anywhere that it does not self-limit.

Measured in the same transcript, separating the two mechanisms:

| Mechanism | Re-injections | Chains | Max consecutive | Chains over the platform's 8-block cap |
|-----------|--------------|--------|-----------------|-----------------------------------------|
| discipline hooks (`stop_hook_active` guard) | 47 | 38 | **2** | 0 |
| `/goal` | 114 | 15 | **17** | 10 |

The discipline hooks bound exactly as designed — one corrective round-trip, never more.
`/goal` ran to 17 consecutive re-injections, 27 of which were near-verbatim restatements of
the same verdict paragraph. The primitive the rules present as interchangeable with the other
three is the one with no bound.

### Expected

`async-discipline.md` records the current measurement and that the leak fix held; every
recommendation of `/goal` carries the bound caveat; a test fails if either regresses.

## Decision

**Correct the documentation and test the correction. Do not touch the judge prompt in this
change.**

The investigation that produced this TRD also found a real prompt defect — the autonomy judge
has no workflow-command precondition, so it evaluates purely conversational turns as though a
command were mid-run, and was measured blocking a bare factual answer (`` `pwd` — `cwd` isn't
a command `` ), the single word `Idle.`, and two direct answers to the owner's own repeated
question about which test account was used. That is a genuine defect and it is **deliberately
out of scope here**, for a reason the sizing lib made explicit: a judge-prompt change touches
nine files, six of them generated (two `.md` prompts and three `settings.json`), so it can
never clear the five-file AUTO ceiling. It needs a human in the loop, and bundling it here
would drag these three low-risk documentation facts through the same gate.

**Rejected — softening the guard's documentation instead of the guard.** The temptation on
finding a false-positive class is to write the exception into the rule file. That would leave
the guard behaving exactly as before while the docs claim otherwise, which is worse than
either the defect or the silence.

**Rejected — deleting the stale numbers rather than replacing them.** The file's argument
depends on having a before: `31/251` is what makes `0.3%` legible as a fix rather than a
sample. Both stay, dated and labelled.

**On `/goal`: document, do not wrap.** `/goal` is a platform feature with no file in this
repo — `.claude/commands/goal.md` does not exist. What this framework owns is the
*recommendation*, so that is what carries the caveat. Building a bounded wrapper around a
platform primitive is a different and much larger decision.

## Non-Goals

- The autonomy judge's missing workflow-command precondition. Real, measured, and the larger
  half of what the investigation found — but nine files, six generated, and it changes the
  behaviour of every session on the machine. Separate work, deliberately.

  **A design constraint for that separate work, established here so it is not rediscovered:**
  the fix CANNOT be a payload check. The `Stop` payload carries exactly `session_id`,
  `transcript_path`, `cwd`, `prompt_id`, `permission_mode`, `effort`, `hook_event_name`,
  `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons`
  (`docs/modernization/probes/U2-prompt-payload.md` §3, marked OBSERVED). **No field names the
  active command.** `transcript_path` is present but the prompt's own no-tools block forbids
  reading it. So "if no workflow command is running, allow" has nothing to test, and the
  implementable form is weaker: judge command-context from the shape of
  `last_assistant_message` itself — a status banner or mid-loop state versus a bare answer or
  fact — and lean on the prompt's existing *when uncertain, allow* principle.

  **UPDATE, probed 2026-08-26 — there IS a channel, and it is better than text-inference.**
  Three isolated probes settled what the two existing probe docs disagreed about:

  | Channel | Result |
  |---|---|
  | Flag file on disk | **NO** — the judge reported `NO_TOOL_ACCESS` when asked to read one. Confirms `U5-kill-switch-mechanism.md`; `U2-prompt-payload.md`'s "actual tool access" line applies to `agent`-type hooks, not `prompt`-type |
  | Environment variable | **NO** — already established in U5 |
  | Custom payload field | **NO** — the field set is fixed |
  | `UserPromptSubmit` → `additionalContext` | **YES** — verdict `SEES_MARKER`. The judge's context includes injected context from earlier in the session, not just the payload JSON |

  So a command-type `UserPromptSubmit` hook CAN inspect the submitted prompt and inject a
  marker the Stop judge will see. Caveats for the design: the judge sees the whole
  conversation, so a marker is **sticky** — inject a current-state line on EVERY prompt
  (active or inactive) and have the judge read the most recent, rather than injecting only on
  command start. U2 also records that long transcripts are truncated for the evaluator, which
  a per-turn injection survives and a once-per-command one may not. Evidence base is ONE clean
  observation — the Stop hook fired inconsistently under `--print` — so re-run the probe
  before building on it.
- Changing what any guard actually does. This change is entirely documentation plus its test.
- Re-scoring the discipline corpus. Nothing here alters a prompt, so `compare-runs.js` has
  nothing to compare.
- Adding a corpus class for the conversational false-positive shape. It belongs with the
  prompt fix, where it can be scored.

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Update `async-discipline.md`'s prompt-leak section: keep the historical figures, add the current measurement and the tool that produced it, and state that the fix held | O1 | None | The file contains the current rate (0.3%, 3 of 957) AND names `hook-verdict-rate.js` as how to reproduce it; the historical `31 of 251` figure survives, explicitly dated and labelled as pre-fix; the section states the metric was redefined on 2026-08-18 and does NOT assert the fix held; verified by reading the section, not by a bare-word grep — `grep -c "still"` returns 8 on innocuous prose ("still recommended", "still in flight") and can never reach zero |
| FIX-002 | Add the unbounded-loop caveat at every one of the four sites that recommend `/goal`: `async-discipline.md` (x2 copies), `.claude/rules/constitution.md`, and `packages/core/templates/constitution.md.template` | O2 | None | All four `/goal` recommendation sites carry the caveat within three lines, citing the measured 17-deep chain; `grep -L` over the four files returns nothing; the shipped templates carry it too, so a newly scaffolded project is not born with the uncaveated version |
| FIX-003 | Add a BATS regression test asserting both facts, following the intent-not-prose convention at `implement-trd-structure.test.sh:605` | O3 | FIX-001, FIX-002 | `npx bats test/integration/tests/implement-trd-structure.test.sh` passes; the new test FAILS when the current-measurement sentence is deleted from `async-discipline.md`, and FAILS when the `/goal` caveat is deleted from `constitution.md` — both verified by mutation |

## Task Grounding

### FIX-001
- **Touches:** `.claude/rules/async-discipline.md`, `packages/core/templates/claude-directory/rules/async-discipline.md`
- **Reuse:** the file's existing correction convention — see its `## Correction: the regex floor quoted above is stale (2026-08-13)` pattern in `test/discipline-corpus/RESULTS.md`, which keeps the superseded number, dates it, and says plainly "do not re-quote" [read]
- **Replaces:** nothing — the historical figures stay. This is an addition, not a substitution [read]
- **Follow:** the file already names its measurement command (`node packages/core/scripts/hook-verdict-rate.js --project <slug>`); cite the same one rather than introducing a second way to measure [read]
- **Careful:** `async-discipline.md` IS framework-shipped and has TWO copies —
  `.claude/rules/` and `packages/core/templates/claude-directory/rules/` — byte-identical today
  (`diff` confirms). EDIT BOTH. Editing only the first leaves every scaffolded project reading
  the stale numbers, which is exactly the failure `generate-hooks-artifacts.sh`'s header records
  against commit `35413ce`: a fix regenerated in one place and left un-shipped in the live
  copies. `implement-trd-structure.test.sh:251` iterates the template rules directory, so a
  divergence is catchable there [ran]

### FIX-002
- **Touches:** `.claude/rules/async-discipline.md`, `packages/core/templates/claude-directory/rules/async-discipline.md`, `.claude/rules/constitution.md`, `packages/core/templates/constitution.md.template`
- **Reuse:** the numbered four-primitive list at `async-discipline.md:19-30` and the prohibition-6 text at `constitution.md:239` — amend in place, do not restate the list elsewhere [read]
- **Replaces:** nothing [read]
- **Follow:** `constitution.md` is owner-governed and its Changelog records every amendment with a date and rationale; a change to prohibition 6 needs a Changelog entry in the same style as the 1.3.0 nesting entry [read]
- **Careful:** FOUR sites, not two, and an earlier draft of this grounding got it wrong twice — treat the count as the load-bearing fact. `async-discipline.md` needs both copies (see FIX-001). `constitution.md` ALSO has a shipped template, at `packages/core/templates/constitution.md.template` — its prohibition 6 carries the uncaveated `/goal` at line 168, and `/init-project` renders it into every new project, so editing only `.claude/rules/constitution.md` leaves every future project born with the defect [ran]. What is NOT a fourth edit: `docs/standards/constitution.md` is a symlink to `.claude/rules/constitution.md` and follows automatically [ran]; and the template RULES directory (`packages/core/templates/claude-directory/rules/`) holds `async-discipline.md`, `autonomy.md`, `command-status.md` and `verification.md` but no constitution — the constitution template lives one level up under `templates/`, which is why a search scoped to the rules directory misses it [ran]. `constitution.md` requires user approval for changes per its own Approval Requirements, and `CLAUDE.md` repeats that. This edit adds a factual caveat to an existing recommendation rather than changing a rule's substance — flag it in the deliverables as an owner-governed file touched, so the owner sees it explicitly rather than discovering it in a diff [read]

### FIX-003
- **Touches:** `test/integration/tests/implement-trd-structure.test.sh`
- **Reuse:** the assertion style at lines 605-620 — that block's own comment states the principle: assert the INTENT by `grep -qiE` over alternative wordings, never an exact sentence, because a prose-pinned test makes the document unrewritable [read]
- **Replaces:** nothing — new `@test` block [read]
- **Follow:** each existing test in that file opens with a comment explaining what failure motivated it and when it was found; match that [read]
- **Careful:** the suite is 45 tests today and is run by the BATS CI job; a new test must not depend on `SKIP_HEADLESS` or the external fixtures tree, since neither exists on a runner. Assert only against files in this repo [read]

## Could Not Verify

- Whether the 0.3% allow-leak rate holds across other projects' transcripts. Measured on
  `-Users-james-dev-lightning-lane-prompt-fixes` only (957 evaluations). `hook-verdict-rate.js`
  takes a `--project` argument, so a broader sweep is possible and was not run.
- The false-positive rate of the autonomy guard overall. Nine short conversational finals were
  classified by hand (four clear false positives, four correct blocks, one ambiguous); the
  remaining blocks were not classified, and short finals are a biased sample — they are
  exactly the conversational shape most likely to be misjudged. The honest claim is that the
  false positives CONCENTRATE in short no-command-running turns, not that the overall rate is
  known.
- Whether the platform's `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` was at its documented default of 8
  during the measured session. The 10 `/goal` chains exceeding 8 are consistent with the cap
  not applying to `/goal` re-injection at all, but that mechanism was not probed.
