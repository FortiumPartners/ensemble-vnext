# Functional Verification Report: task-command

**Source PRD**: docs/TRD/task-command.md § Intended Change
**Success definition**: .trd-state/task-command/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 21 total — 21 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 21 of 21 proven — uncovered: none
**Must pass**: 12 of 12 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `/task` accepts either a prompt or a path to a brief, and creates `.trd-state/task-<slug>/`, with the slug taken from the brief's basename (brief form) or the prompt's first words (prompt form) | .trd-state/task-command/evidence/iter1-task.md-snapshot.md | 1 |
| FS-2 | A slug that clashes with an existing `.trd-state/*/` directory or with `docs/TRD/<slug>.md` is given a `-2`, `-3` suffix rather than reusing or overwriting the existing one | .trd-state/task-command/evidence/iter1-task.md-snapshot.md | 1 |
| FS-3 | When `.trd-state/current.json` names no feature in flight, the command points `current.json` at the task with `trd: null` and `status: .trd-state/task-<slug>/implement.json` | .trd-state/task-command/evidence/iter1-task.md-snapshot.md | 1 |
| FS-4 | When a feature is in flight, the command leaves `current.json` unchanged and says so in the readout | .trd-state/task-command/evidence/iter1-task.md-snapshot.md | 1 |
| FS-5 | The step list is written as `implement.json` in the existing shape: `tasks` entries carrying `description`, `status`, `started_at`, `completed_at`; a `phase_cursor`; a `checkpoints` array; `trd_file: null`; and `"kind": "task"` | .trd-state/task-command/evidence/iter1-fixture-transcript.txt | 1 |
| FS-6 | `brief` in `implement.json` holds the brief's path in the brief form and `null` in the prompt form | .trd-state/task-command/evidence/iter1-fixture-transcript.txt | 1 |
| FS-7 | A checkpoint with no commit is recorded with `commit: null` | .trd-state/task-command/evidence/iter1-fixture-transcript.txt | 1 |
| FS-8 | Each step is run once. A step that cannot be done is recorded `deferred` with its reason, and is not retried | .trd-state/task-command/evidence/fs-8-14-fixture-transcript.txt | 1 |
| FS-9 | The command honours `.claude/rules/verification.md`'s environment permissions and resource capacity, and the repo's shared-machine rules | .trd-state/task-command/evidence/iter1-task.md-snapshot.md | 2 |
| FS-10 | Each output file is recorded with `artifacts.js record`: the first under kind `report`, later ones under `report-2`, `report-3` | .trd-state/task-command/evidence/fs-8-14-fixture-transcript.txt | 1 |
| FS-11 | Outputs are published when publishing is on, and the published URL is the one stored against the output's kind | .trd-state/task-command/evidence/fs-8-14-fixture-transcript.txt | 1 |
| FS-12 | An output that `artifacts.js record` rejects (a directory, or a path outside the project) is not recorded in `artifacts.json` and is listed only in `closed.json`'s `outputs` | .trd-state/task-command/evidence/fs-8-14-fixture-transcript.txt | 1 |
| FS-13 | The command writes `closed.json` with `feature: task-<slug>`, `trd: null`, `closedAt`, `closedBy: task`, `note: null`, `audit: null`, `reason`, `outputs`, `followups` | .trd-state/task-command/evidence/iter1-task.md-snapshot.md | 2 |
| FS-14 | `closed.json`'s `reason` is `task-complete` for a run that finishes and `task-stuck` for one where no step could be done | .trd-state/task-command/evidence/iter1-task.md-snapshot.md | 2 |
| FS-15 | `followups` lists what the findings say needs doing, each entry with its evidence, and the command does not act on any of them | .trd-state/task-command/evidence/iter1-task.md-snapshot.md | 2 |
| FS-16 | The command ends in this order: the four-section readout; `notify-complete.sh "task" …` with `task-<slug>` in the summary; a `PushNotification`; and only then the `current.json` clean-up | .trd-state/task-command/evidence/iter1-task.md-snapshot.md | 2 |
| FS-17 | At the end, `current.json`'s four keys are cleared only if they still point at this task | .trd-state/task-command/evidence/iter2-task.md-snapshot.md | 2 |
| FS-18 | The last line of a finished run is `═══ COMMAND COMPLETE: /task ═══`; when no step could be done it is `COMMAND STUCK`. A run with some deferred steps and at least one done still ends COMMAND COMPLETE and writes closed.json | .trd-state/task-command/evidence/iter2-task.md-snapshot.md | 2 |
| FS-19 | A prompt-form run and a brief-form run each reach COMMAND COMPLETE, leaving implement.json (every step success or deferred), closed.json (with outputs and followups) and, when an output was published, a `report` entry in artifacts.json — so tooling no longer sees the job as an unfinished feature | .trd-state/task-command/evidence/fs19/readback.txt | 1 |
| FS-20 | `/task --resume` finds the most recent `.trd-state/*/implement.json` with `kind: task` and no sibling closed.json, without reading current.json | .trd-state/task-command/evidence/iter2-task.md-snapshot.md | 2 |
| FS-21 | A resumed task continues from the first step whose status is neither success nor deferred; deferred steps are not re-run | .trd-state/task-command/evidence/iter2-task.md-snapshot.md | 2 |

## Not Met

_None._

## Not Verifiable

_None._

