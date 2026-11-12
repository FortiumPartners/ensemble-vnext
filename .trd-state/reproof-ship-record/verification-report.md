# Functional Verification Report: reproof-ship-record

**Source PRD**: docs/TRD/reproof-ship-record.md § Intended Change
**Success definition**: .trd-state/reproof-ship-record/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 17 total — 17 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 17 of 17 proven — uncovered: none
**Must pass**: 10 of 10 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `ship-sequencer.js start` on a state directory with no record writes a new `shipped.json` that contains `reproof: { count: 0, runs: [] }` | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-2 | With a step handed out and a reverified file written after `--started-at`, one `ship-sequencer.js reproof` call appends one entry to `reproof.runs` carrying the handed-out step's `step` and `primitive`, `pass`, `criteria`, `met`, `outcome`, `custody` (`action`, `classes`, `differing`, `excused`), `startedAt`, `endedAt` and `durationSeconds`, and raises `reproof.count` by one | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-3 | Two successive re-proof runs, one of whose criteria the reverified file marks `retried: true`, leave `reproof.count` at 2 and both entries in call order, the retried criterion's `met` item reading `retried: true` and the others `retried: false` | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-4 | An entry's `criteria` equals the custody line's `ids`, and its `met` lists only those of `criteria` whose status in the reverified file is `met` | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-5 | A reverified file last modified before `--started-at` is read as absent: the run is recorded with `met: []` | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-6 | A `--reverified` path that does not exist, or that holds content that cannot be read as the verification state, is recorded with `met: []` rather than refused | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-7 | An entry's `outcome` is the `--outcome` value when one is passed, otherwise the reverified file's `outcome`, otherwise `null` | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-8 | An entry's `custody.classes` is the set of distinct classes `classifyPath` assigns to the custody line's `differing` paths, plus `base` when `excused` is non-empty; a custody line with no `excused` key adds no `base` | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-9 | An entry's `durationSeconds` is the whole number of seconds from `startedAt` to the time of the `reproof` call, with `endedAt` the time of that call | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-10 | A `reproof` call made when no step is handed out is still recorded, with the entry's step fields (`step`, `primitive`) `null` | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-11 | `reproof` returns `ok: false` and leaves the record byte-for-byte unchanged when there is no record, when the run is `done`, when `--custody` is not JSON, when it has no `action`, when it has no `ids` array, and when `--started-at` is not parseable | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-12 | A record written before this change, with no `reproof` key, gains a `reproof` block holding `count: 1` and the one run on its first `reproof` call | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-13 | After the record has been detached, a `reproof` call writes its entry into the detached record file, not into a tracked `shipped.json` | .trd-state/reproof-ship-record/evidence/transcript-b.txt | 1 |
| FS-14 | The library function `recordReproof(stateDir, {custody, reverifiedPath, startedAt, outcome})` exported by `ship-sequencer.js` appends the same entry the CLI subcommand does and increments `count` | .trd-state/reproof-ship-record/evidence/transcript-a.txt | 1 |
| FS-15 | The custody gate contract's `reverify` bullet tells the run to note the time before `/verify-build`, to run `ship-sequencer.js reproof` after it and before the repeat reconcile, and to treat a refused call as one readout line, never a stop | .trd-state/reproof-ship-record/evidence/fs15-contract-excerpt.txt | 1 |
| FS-16 | The ship-build guide's Custody section contains a "Re-proof record" table that names each field of the re-proof block | .trd-state/reproof-ship-record/evidence/fs16-guide-excerpt.txt | 1 |
| FS-17 | `npx jest packages/core/lib/ship-sequencer.test.js` passes and includes a case that records two re-proof runs (one retried), reads both back with every field, reads a proof file older than `--started-at` as absent, and records a call with no step handed out with null step fields | .trd-state/reproof-ship-record/evidence/fs17-jest.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

