# Functional Success Definition: stop-judge-auto-armed-monitor

**Source**: .trd-state/stop-judge-auto-armed-monitor/derive-source.md §Reproduction
**Source kind**: reproduction
**Derived**: 2026-11-21T00:53:21Z
**Criteria**: 4

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | A finished turn (readout ending in `═══ COMMAND COMPLETE ═══`, issued after an `Artifact` publish) whose Stop payload's `background_tasks` holds only the live-updates watch the platform armed on its own is allowed by the `discipline-stop` judge | §Expected line 35-36 ("A finished turn with only that task running is allowed"); §Steps lines 5-13 (the publish, the auto-armed watch in `background_tasks`, the COMMAND COMPLETE ending) | A replay of the shipped `discipline-stop` prompt on `claude-sonnet-5` against a Stop payload reconstructed from §Steps 1-3 (final message ends with the readout and COMMAND COMPLETE; `background_tasks` holds one running watch the agent did not start), the output recording each run's verdict; locator is the allow verdict as the replay prints it | [read] | locator | | O1 |
| FS-2 | The allow in FS-1 holds for each of the 5 allow-case variants the source names: the watch mentioned in the final message, a generic task description on the watch, a missing task description, two watches plus a finished agent, and an earlier finished dispatch | §Actual lines 19-22 (the five variants of the allow case); §Expected lines 35-36 | Replay output as in FS-1, one case per variant, each run's verdict recorded per variant; locator is each variant's case name next to its allow verdict | [read] | locator | 5 | O1 |
| FS-3 | A turn whose final message promises later work that nothing in the turn will keep is blocked when `background_tasks` holds only the platform's auto-armed watch: that watch is not treated as the machinery that keeps the promise | §Expected line 35 ("neither evidence of a promise nor something that keeps one") and lines 36-37 ("a promise of other work is judged exactly as if the task were absent"); §Actual line 28 (case A needs a promise in the final message) | Replay output of the shipped prompt on `claude-sonnet-5` against a payload whose final message makes an unbacked promise of later work and whose `background_tasks` holds only the auto-armed watch, each run's verdict recorded; locator is the block verdict as the replay prints it | [read] | locator | | O2 |
| FS-4 | The same unbacked promise with `background_tasks` empty is blocked, so the verdict on a promise is the same with or without the auto-armed watch present | §Expected lines 36-37 ("judged exactly as if the task were absent"); §Actual line 28 | Replay output on the same final message as FS-3 with `background_tasks` empty, each run's verdict recorded beside FS-3's; locator is the block verdict for this case | [read] | locator | | O2 |

**Run counts and tolerance are not set here.** The source records the earlier replay as "0
blocks in 25 runs" (§Actual line 22) but states no number of runs or tolerated disagreement
for the fix. The judge is a model and can vary between identical runs; how many runs each case
gets, and whether any disagreement is tolerated, is not something this source supplies, so no
figure is invented for it.

**Not a criterion: reproducing the original live block.** §Actual line 17 records one live
block, and lines 19-22 record that replay did not reproduce it with the current prompt. The
source gives no way to recreate the live condition (lines 22-23: the transcript is under
another account; lines 28-31: the mechanism is inferred and the block's reason text was not
available). A criterion requiring the old prompt to block, or requiring a live session to show
the original failure, would have nothing in the source to check against, so none is written.
