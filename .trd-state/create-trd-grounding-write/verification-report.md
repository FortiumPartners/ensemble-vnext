# Functional Verification Report: create-trd-grounding-write

**Source PRD**: docs/TRD/create-trd-grounding-write.md § Reproduction
**Success definition**: .trd-state/create-trd-grounding-write/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 7 total — 7 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 7 of 7 proven — uncovered: none
**Must pass**: 6 of 6 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Re-running the reproduction (8-task fixture, 2 ground agents, merge stubbed to return { findings: [] } and write nothing) no longer ends with the TRD lacking a grounding section while the readout says `grounded 8 tasks`: either the section is on disk with all 8 blocks, or the readout names the tasks that have none | .trd-state/create-trd-grounding-write/evidence/fs1-fs2-full-run.txt | 1 |
| FS-2 | When the ground agents return blocks for all 8 tasks, the TRD on disk afterwards contains a grounding section holding each of the 8 task blocks, put there by deterministic code the calling command runs — the merge agent writing nothing does not leave the TRD without them | .trd-state/create-trd-grounding-write/evidence/fs1-fs2-full-run.txt | 1 |
| FS-3 | No agent in the grounding fan-out path is told to write the grounding section into the TRD: the ground:merge agent's prompt no longer carries the "Write the section with Write/Edit" instruction, and no other agent prompt in the path carries an equivalent instruction to paste grounding blocks into the TRD | .trd-state/create-trd-grounding-write/evidence/fs3-grep.txt | 1 |
| FS-4 | The readout's grounded count is the number of task blocks parsed from the TRD file on disk, not the union of what the ground agents returned: when agents claim all 8 tasks but only some blocks are on disk, the readout reports the on-disk number | .trd-state/create-trd-grounding-write/evidence/fs4-fs5-fs6-partial-on-disk.txt | 1 |
| FS-5 | The readout names, by task id, each task that has no grounding block in the TRD on disk | .trd-state/create-trd-grounding-write/evidence/fs4-fs5-fs6-partial-on-disk.txt | 1 |
| FS-6 | The parse that feeds the readout runs on the TRD after the deterministic write, so the readout reflects the file as it stands when the readout is produced, not an earlier state or an agent's report of it | .trd-state/create-trd-grounding-write/evidence/fs4-fs5-fs6-partial-on-disk.txt | 1 |
| FS-7 | The Deferred-by-design table is not trusted to the defer:write agent's own written: true: when that agent is stubbed to return written: true and write nothing, the run does not report the table as written while it is absent from the TRD on disk | .trd-state/create-trd-grounding-write/evidence/fs7-deferred.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

