# Functional Success Definition: plan-weight-router

**Source**: docs/PRD/plan-weight-router.md
**Source kind**: prd
**Derived**: 2026-09-23T23:12:25Z
**Criteria**: 32

The subject is a Claude Code command (`/plan`) and the libraries behind its decisions. There is
no HTTP surface, no browser and no database: "functional" here means the observable behaviour of
the command when a user invokes it, and the observable output of the decision functions when
called directly.

Every row below cites a line, requirement ID, non-goal ID or owner decision ID in
`docs/PRD/plan-weight-router.md`. No row is domain-derived; nothing was added that the source
does not ask for. Section 5 of the PRD is empty by design, so no non-functional criterion
appears here.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation |
|----|----------------------|-------|------------------------------|------------|
| FS-1 | The `kind` axis accepts exactly `defect`, `change` and `refactor`; a fourth value is rejected rather than silently coerced | AC-F1.1 (§4.1 F1, line 192) | Transcript of the decision library called with each of the three values (accepted) and with at least one other value (rejected), showing accept/reject per call | [read] |
| FS-2 | The `weight` axis accepts exactly `trivial`, `small` and `medium`; a fourth value is rejected | AC-F1.1 (§4.1 F1, line 192) | Same call transcript, for the weight axis | [read] |
| FS-3 | `feature` is not accepted as a value of `kind` or of `weight` — it is a routing outcome, not an axis member | AC-F1.2; §1.2 line 69 ("`feature` is not a member of either list — it is the exit") | Call transcript showing `kind=feature` and `weight=feature` both rejected, alongside a route call whose outcome is the feature exit | [read] |
| FS-4 | None of the nine `kind` x `weight` cells carries an individual name in code, in the command's prose, or in a run's output | AC-F1.3; NG10 (line 172) | Grep output over the command file, the libraries and a captured run transcript showing no per-cell label; plus a read of the command text confirming cells are referred to only by their two axis values | [read] |
| FS-5 | At `trivial`, the stage list is exactly: write a light TRD, then implement | AC-F2.1; §1.2 grid line 75 | Stage list returned by the library for each `kind` at `trivial`, printed verbatim; and a captured `/plan` run at `trivial` whose executed stages match it | [read] |
| FS-6 | At `small`, the stage list is everything `trivial` runs plus an adversarial pass | AC-F2.2; §1.2 grid line 76 | Printed stage lists for `trivial` and `small` side by side, showing `small` is a superset differing only by the adversarial pass | [read] |
| FS-7 | At `medium`, the stage list is everything `small` runs plus grounding and an audit | AC-F2.3; §1.2 grid line 77 | Printed stage lists for `small` and `medium` side by side, showing the two added stages | [read] |
| FS-8 | `trivial` and `small` run NO audit stage — a deliberate reduction against `/investigate`'s unconditional audit, not an oversight | AC-F2.5; NG11 (line 170); D4 (§9, line 479) | Printed stage lists for `trivial` and `small` containing no audit stage, plus a captured `/plan` run at each of those weights whose transcript shows no audit dispatched | [read] |
| FS-9 | No stage of any weight stops to ask the owner to authorise continuing | AC-F2.4; G2 (line 151) | Session transcript of a full `/plan` run at each weight, containing no `AskUserQuestion` outside the four cases `autonomy.md` permits, and reaching its terminal banner without a user turn in between | [read] |
| FS-10 | No `weight` produces an outcome whose action is "stop and wait for a human decision" | AC-F5.1; S1 (§8, line 439) | Enumeration of every outcome the route function can return, printed, with none of them being a wait-for-human verdict; contrasted against `/investigate`'s `REVIEW` outcome | [read] |
| FS-11 | The only differences between the three weights are stage count and review depth — never permission | AC-F5.2; §1.2 lines 79-81 | Diff of the three printed stage lists showing the deltas are stages and depth settings only; plus a read of the command text confirming permission is granted unconditionally at every weight | [read] |
| FS-12 | A `medium` `refactor` runs its named tests before AND after the change, and both runs are recorded | AC-F3.1; G5 (line 154); §1.2 line 82 | A captured `/plan` run on a refactor at `medium` whose transcript and written artifact contain both a pre-change and a post-change test run, each with its result | [read] |
| FS-13 | A `medium` `refactor` checks that the public surface has not moved | AC-F3.2; §1.2 line 82 | The same run's artifact recording a public-surface comparison and its verdict | [read] |
| FS-14 | A `medium` `change` is verified against the stated outcome and is NOT asked for a before-run | AC-F3.3; G5 (line 154); §1.2 line 83 | Printed stage list for `change`/`medium` containing no before-run stage, plus a captured run on a change at `medium` whose transcript shows no pre-change test run | [read] |
| FS-15 | A `refactor` is never asked for a root cause | AC-F3.4 | Printed stage list for every `refactor` cell containing no root-cause stage, plus a captured refactor run whose transcript never requests one | [read] |
| FS-16 | A `defect` at `medium` is asked for a demonstrated root cause | §4.1 F3 description, line 229-230; §1.4 diagram line 120 ("kind=defect: root cause demonstrated") | Printed stage list for `defect`/`medium` including the root-cause stage, plus a captured defect run at `medium` whose artifact records the demonstrated root cause | [read] |
| FS-17 | The decision to route to `/create-prd` is stated in terms of what the PRD would contain — personas, user value, trade-offs about what to build — not in terms of task or file count | AC-F4.1; G3 (line 152); §1.2 line 86-88 | A read of the command text showing the exit test expressed as a content question; plus a run transcript in which the routing decision cites content, not counts | [read] |
| FS-18 | Neither `MAX_TASKS` nor the touched-file ceiling participates in the decision of whether a PRD is needed | AC-F4.2; S2 (§8, line 440) | Call transcript showing the PRD-routing decision unchanged across inputs whose task and file counts differ widely; plus grep showing neither constant is read on that code path | [read] |
| FS-19 | Work of 12-18 tasks carrying no product decision routes to `medium` and does not reach `/create-prd` | AC-F4.3; G1 (line 150); §1.1 line 40-42 | A captured `/plan` run on this PRD's own subject (12-18 tasks, no product decision) whose readout states `weight=medium` and whose transcript shows `/create-prd` was never invoked | [read] |
| FS-20 | The presence of an open question does not by itself route work to `/create-prd` | AC-F6.1; G4 (line 153); §1.1 line 56-59 | A captured run on work carrying an open question of the "slider or text input box" shape, whose readout shows a `kind`/`weight` route rather than the feature exit | [read] |
| FS-21 | Open questions written by this path are parsed by `trd-parser.js`'s `openQuestions` with `ownerOnly`, and reach task prompts as `<open_question>` | AC-F6.2 (naming `trd-parser.js:613-614` and `.claude/commands/implement-trd.md`) | Parser output for a TRD this path wrote, showing the question in `openQuestions` with `ownerOnly` set; plus an assembled task prompt containing the `<open_question>` element | [read] |
| FS-22 | At `medium` with open questions, `/refine-trd` is named in the readout and NOT invoked, and no stage waits for it | AC-F6.3; D5 (§9, line 480) | Readout text of such a run naming `/refine-trd`; transcript of the same run showing no `/refine-trd` invocation and no pause, ending at its own terminal banner | [read] |
| FS-23 | The delivered step one adds no new workflow script under `packages/core/workflows/` | AC-F7.1; G6 (line 155); NG9 (line 169) | Directory listing of `packages/core/workflows/` diffed against the same listing at the release's base commit, showing no new script | [read] |
| FS-24 | A run emits exactly one `COMMAND COMPLETE` banner — one per run, not one per chained command | AC-F7.2 (citing `.claude/rules/command-status.md`'s chaining exception) | Session transcript of a full chained run, with a count of `COMMAND COMPLETE` occurrences equal to one | [read] |
| FS-25 | `/plan` exists as its own command file, and `/investigate` no longer appears as a separate entry point | AC-F7.3; D3 (§9, line 478) | File listing showing a `plan` command file present and no `investigate` command file; plus the command index/router surface offering `/plan` and not `/investigate` | [read] |
| FS-26 | Every surface naming `/investigate` is updated in the same release — the 18 command files, the router hint in `router.py`, `CLAUDE.md`, `process.md`, the templates under `packages/core/templates/`, and the vendored `.claude/` copies | AC-F7.4; D7 (§9, line 482); §4.1 F7 line 318-321 | Repository-wide grep for `/investigate` returning no live references outside historical changelog entries, enumerated per surface named in the criterion | [read] |
| FS-27 | At feature weight, `/plan` INVOKES `/create-prd` rather than printing a pointer to it, then stops | AC-F7.5; D6 (§9, line 481; recorded there as "Belief, not fact" on the reading of "route") | Session transcript of a run that reaches the feature exit, showing an actual `/create-prd` invocation followed by termination — not a readout line naming the command | [read] |
| FS-28 | `/create-trd` and `/create-prd` keep separate identities in this release — neither is collapsed into `/plan` | NG12 (line 171); OQ-3 (line 499) | File listing showing both commands still present as their own files, and `/plan` invoking them rather than reimplementing them | [read] |
| FS-29 | No stage prompt has been extracted to a contract except as part of an edit that stage was already receiving | AC-F8.1 | Diff review of the release: every contract-extraction hunk sits inside a change that stage was independently receiving; no extraction-only commit | [read] |
| FS-30 | No stage logic is shared between workflow scripts by `require` — the pattern is a contract plus a dumb dispatcher receiving assembled prompts in `args` | AC-F8.2 (naming `implement-phase.js` as the pattern) | Grep for `require(` across the non-test scripts under `packages/core/workflows/` returning zero hits | [read] |
| FS-31 | The 6-task / 10-file ceiling is not raised — `MAX_TASKS` remains 6 and the touched-file ceiling remains 10 | NG3 (line 163); §9 rejected-alternatives row (line 459) | The two constants read from source with their values, diffed against the release's base commit | [read] |
| FS-32 | No `transcript` input is exposed as the middle path: `/create-trd` gains no `--transcript` flag and its existing `transcript` argument acquires no caller | NG1 (line 161); NG2 (line 162) | `/create-trd`'s `argument-hint` read from source showing `[path-to-prd]` unchanged; grep for `transcript:` across the command directories returning only `create-trd.md`'s own invocation block | [read] |

## Notes on coverage

- **Section 5 (non-functional) is empty in the source**, and the PRD states that is the correct
  outcome (line 371). No latency, throughput or coverage figure is asserted here, because none
  was stated, documented or measured in the source.
- **The one performance-adjacent fact in the source** — that chaining re-reads three large prose
  files (§4.1 F7, line 318) — is recorded there as an accepted, deliberately temporary cost with
  no threshold, so it yields no criterion.
- **Several criteria can only be observed by running `/plan` in a live Claude session**
  (FS-9, FS-12, FS-13, FS-14, FS-16, FS-19, FS-20, FS-22, FS-24, FS-27). They are stated in full
  with the evidence that would prove them. Whether this environment can produce that evidence is
  not decided here.
- **Several are pure-function checks** with deterministic output (FS-1, FS-2, FS-3, FS-5, FS-6,
  FS-7, FS-8, FS-10, FS-11, FS-15, FS-18) and are answerable by calling the decision libraries
  directly.
- **Six claims the source itself marks unverified** (§"Could Not Verify", lines 518-525) — the
  56-minute pipeline figure, the 22.7-minute `/sweep` failure, the "never used" `transcript`
  argument, the six PRD-less TRDs, the 12-18 task estimate, and the absence of any `weight`
  implementation today — are statements about history or about the pre-change state, not
  properties the delivered system must have. None became a criterion. The 12-18 task figure is
  the one that touches a criterion: FS-19 tests the routing behaviour for work of that size, not
  that item 21's design is in fact that size.
