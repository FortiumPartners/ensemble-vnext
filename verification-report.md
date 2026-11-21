# Functional Verification Report: stop-judge-auto-armed-monitor

**Source PRD**: docs/TRD/stop-judge-auto-armed-monitor.md § Reproduction
**Success definition**: .trd-state/stop-judge-auto-armed-monitor/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: All 4 must-pass criteria met on iteration 2: the auto-armed live-updates watch no longer blocks a finished turn (allowed 30 of 30 runs across the core case and 5 variants), and an unbacked promise is still blocked with or without the watch (10 of 10).
**Criteria**: 4 total — 4 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 4 of 4 proven — uncovered: none
**Must pass**: 4 of 4 proven
**Next**: close the feature — the command that ran this check closes it when an audit has already passed (its readout says whether it did); otherwise run `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | A finished turn (readout ending in `═══ COMMAND COMPLETE ═══`, issued after an `Artifact` publish) whose Stop payload's `background_tasks` holds only the live-updates watch the platform armed on its own is allowed by the `discipline-stop` judge | .trd-state/stop-judge-auto-armed-monitor/evidence/exercise-i2-core-tally.txt | 2 |
| FS-2 | The allow in FS-1 holds for each of the 5 allow-case variants the source names: the watch mentioned in the final message, a generic task description on the watch, a missing task description, two watches plus a finished agent, and an earlier finished dispatch | .trd-state/stop-judge-auto-armed-monitor/evidence/exercise-i2-variants-tally.txt | 2 |
| FS-3 | A turn whose final message promises later work that nothing in the turn will keep is blocked when `background_tasks` holds only the platform's auto-armed watch: that watch is not treated as the machinery that keeps the promise | .trd-state/stop-judge-auto-armed-monitor/evidence/exercise-i2-core-tally.txt | 2 |
| FS-4 | The same unbacked promise with `background_tasks` empty is blocked, so the verdict on a promise is the same with or without the auto-armed watch present | .trd-state/stop-judge-auto-armed-monitor/evidence/exercise-i2-core-tally.txt | 2 |

## Not Met

_None._

## Not Verifiable

_None._

