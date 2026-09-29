# Functional Success Definition: context-model-hygiene

**Source**: docs/TRD/context-model-hygiene.md §Intended Change (received as extracted text: scratchpad/hyg-intended.md; line numbers below refer to that extract)
**Source kind**: intended-change
**Derived**: 2026-09-29T07:16:33Z
**Criteria**: 7

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts |
|----|----------------------|-------|------------------------------|------------|--------|-------|
| FS-1 | The byte targets named O4 and O5 hold on the delivered files | line 9 ("the byte targets in O4 and O5 hold"); line 5 gives the before sizes (`async-discipline.md` 35.9 KB, `autonomy.md` 19.0 KB, `command-status.md` 21.3 KB, `CLAUDE.md` 30.8 KB) as the baseline | `wc -c` output for each file O4 and O5 govern, set beside each target's stated value. The target values and which files each governs are NOT in this source; the exerciser must take them from where O4/O5 are defined, and must not substitute the before sizes as targets | [read] | locator | |
| FS-2 | Each workflow's existing harness test fails when any `agent()` call it records names neither `agentType` nor `model` | lines 9-10 | Test run transcript showing a deliberately unpinned `agent()` call (both `agentType` and `model` removed from one call) making that workflow's harness test fail, then passing again once restored; one such demonstration per workflow that has a harness test | [read] | locator | |
| FS-3 | The workflow steps that previously named neither `agentType` nor `model` (`verify-functional.js` Render and Judge) now name one, and `create-trd.js` sizing stays pinned | line 6 (before state); lines 9-10 (after state) | Passing run of the `verify-functional.js` and `create-trd.js` harness tests with the FS-2 assertion in force; plus the source lines of the Render and Judge `agent()` calls showing `agentType:` or `model:` | [read] | locator | |
| FS-4 | A Claude Code session in a scaffolded project lists each of the plugin's 13 agents once, not once under the plugin prefix and again unprefixed | line 7 (before: both `ensemble-vnext:backend-implementer` and `backend-implementer` listed); line 11 ("a session in a scaffolded project lists each agent once") | Agent listing captured from a session started in a freshly scaffolded project with the plugin installed, with the count of each agent name; e.g. `backend-implementer` appears exactly once | [read] | locator | 13 |
| FS-5 | The TRD authoring contract keeps live checks out of build tasks | lines 11-12 ("the TRD authoring contract keeps live checks out of build tasks") | The TRD authoring contract's text containing the instruction that live checks are not placed in build tasks | [read] | locator | |
| FS-6 | The implementer's check instruction says live scenarios are not the implementer's to run | line 12 ("the implementer's check instruction says live scenarios are not its to run") | The implementer's check-instruction text containing that statement | [read] | locator | |
| FS-7 | The first-turn context size of a subagent dispatched in this repo after the change is measured and recorded in the readout against the ~90k-token before figure | line 4 (before: median ~90k context tokens on every subagent's first turn); lines 12-14 ("starts measurably below ~90k (recorded in the readout, not gated...)") | First-turn token usage read from a post-change subagent transcript, and the readout line that records it beside the ~90k baseline. Whether the figure is below ~90k is REPORTED, not a pass condition: the source says explicitly it is not gated, because the platform's own prompt is most of the remainder | [read] | locator | |

## Notes

- **A criterion carrying a `Parts` count cannot pass incrementally.** FS-4 resolves `met` only
  when all 13 agents are shown listed once; 12 of 13 is `not_met` with the shortfall named.
- **FS-1 depends on values outside this source.** The extract names O4 and O5 but does not
  state their byte values or the files they cover. No number was invented to fill that gap.
- **FS-7 is deliberately the recording, not the threshold.** Lines 12-14 say the below-90k
  outcome is "recorded in the readout, not gated"; turning it into a pass/fail bar would add a
  severity the source declined to set.
