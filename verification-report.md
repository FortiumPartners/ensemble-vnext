# Functional Verification Report: deterministic-rebase-engine

**Source PRD**: docs/plan/deterministic-rebase-engine.investigation.md
**Success definition**: .trd-state/deterministic-rebase-engine/success-definition.md
**Outcome**: Must-Pass Unproven (no full-environment run declared)
**Reason**: All 27 criteria met, but must-pass objective O16 (every path the engine writes or deletes stays inside the target's .claude/, whatever a data file or symlink says) has no criterion covering it, so the core cannot be shown to work.
**Criteria**: 27 total — 27 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 27 of 27 proven — uncovered: none
**Must pass**: 21 of 21 proven — no criterion for: O16
**Diagnosis**: 0 open
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | On the aged fixture, one `--rebase` call restores the missing framework file, lists it under `added`, and the restored file is byte-identical to the plugin's copy | .trd-state/deterministic-rebase-engine/evidence/rbe1/aged.apply1.stdout | 1 |
| FS-2 | On the aged fixture, the previously-shipped version of a framework file is replaced, listed under `replaced`, and afterwards byte-identical to the current plugin's copy | .trd-state/deterministic-rebase-engine/evidence/rbe1/aged.checks.txt | 1 |
| FS-3 | A vendored framework file already byte-identical to the plugin's copy is left alone: counted in `unchanged`, never listed as added or replaced, and its bytes and mtime are not touched | .trd-state/deterministic-rebase-engine/evidence/rbe1/aged.checks.txt | 1 |
| FS-4 | After one `--rebase` call, the target's `.claude/` framework tree matches what the plugin installs, across every component kind (commands, agents, hooks, hook libs, hook prompts, workflows, libs, contracts, skills, framework rules): every difference left is a reported conflict, a preserved user file, an owner-governed rule or `settings.json` | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs4.diff-rq.txt | 1 |
| FS-5 | On the aged fixture, the retired file present in the target is deleted and listed under `removed` | .trd-state/deterministic-rebase-engine/evidence/rbe1/aged.apply1.stdout | 1 |
| FS-6 | A retired entry of each listed kind present in a target — a command, a hook, a `hooks/lib/` file, a `hooks/prompts/` file, a skill folder, and a directory entry (`hooks/permitter/`) — is removed by one `--rebase` call | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs6.stdout | 1 |
| FS-7 | A file in the target that is neither shipped by the plugin nor on the retired list (the aged fixture's user agent) is kept byte-identical and listed under `preserved` | .trd-state/deterministic-rebase-engine/evidence/rbe1/aged.apply1.stdout | 1 |
| FS-8 | The retired list is one data file the engine reads, and a test fails when it falls out of step: when a name in `rebase-project.md`'s retired tables or retired-hooks paragraph is missing from it, or when a path on it is still shipped by the plugin | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs8.jest.fail-missing-name.txt | 1 |
| FS-9 | On the aged fixture, the user's own hook registration in `settings.json` is still present, on its original event, after `--rebase` | .trd-state/deterministic-rebase-engine/evidence/rbe1/aged.checks.txt | 1 |
| FS-10 | After the merge, the ensemble-owned part of `settings.json`'s `hooks` equals the plugin default's `hooks`, and a registration pointing at a retired hook (on any event) or at a manifest hook registered on the wrong event is gone | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs10-12.checks.txt | 1 |
| FS-11 | User hook registrations are compared as whole registrations, never by filename: a user command naming a file that shares a manifest hook's name at another path (`scripts/formatter.sh`) is carried forward on its own event and matcher group, after the plugin's groups, in its original order | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs10-12.checks.txt | 1 |
| FS-12 | Every non-hooks `settings.json` key survives the merge: a key only in the plugin is added, a key present locally keeps its local value, and a new nested plugin key inside a local object is added beside the local values | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs10-12.checks.txt | 1 |
| FS-13 | A `settings.json` key whose local and plugin values disagree in shape (one an object, the other not) is reported as a conflict and its local value kept; a `hooks` value (or an event's value) of the wrong shape is reported and `settings.json` is not written | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs13.checks.txt | 1 |
| FS-14 | A settings fixture whose merged `hooks` block would hold fewer registrations than the plugin default's is not written, and the result says why | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs14-15.apply-refusal.txt | 1 |
| FS-15 | A settings fixture whose merged `hooks` block would hold fewer prompt-type entries than the plugin default's is not written, and the result says why | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs14-15.apply-refusal.txt | 1 |
| FS-16 | On the aged fixture, the owner-edited framework file is listed under `conflicts` (with a reason) and left byte-identical | .trd-state/deterministic-rebase-engine/evidence/rbe1/aged.checks.txt | 1 |
| FS-17 | The engine prints one machine-readable result: the last line of stdout is `REBASE_RESULT ` followed by one JSON object with `mode`, `preserveAll`, a `categories` object whose every entry carries `added`, `replaced`, `removed`, `preserved`, `conflicts` (lists) and `unchanged` (a count), a `settings` entry with the same six plus `counts`, `written`, `refused`, and a `steps` entry | .trd-state/deterministic-rebase-engine/evidence/rbe1/aged.apply1.result.json | 1 |
| FS-18 | `--rebase --dry-run` on the aged fixture prints the same lists an apply run would and writes nothing: `git status --porcelain` stays empty and every file's bytes and mode are unchanged | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs18.checks.txt | 1 |
| FS-19 | Each of the six owner-governed rules (constitution.md, stack.md, process.md, verification.md, design.md, ship.md) is left byte-identical by the engine in every mode — apply, dry-run and preserve-all — including the aged fixture's owner-filled `verification.md` | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs19.checks.txt | 1 |
| FS-20 | `--refresh` on a tree holding a retired file leaves that file in place | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs20.refresh.txt | 1 |
| FS-21 | `--refresh` keeps its never-create, never-delete contract and its existing tests stay green | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs21.bats.txt | 1 |
| FS-22 | A second `--rebase` on the first run's output reports empty `added`, `replaced` and `removed` in every category, and leaves the tree byte-identical except `settings.json`'s `refreshed_at` and `rebased_at` | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs22.checks.txt | 1 |
| FS-23 | Under `--preserve-all`, agents and skills only gain new files; commands, hooks, hook libs, hook prompts, workflows, libs and contracts are replaced when they differ; framework rules are preserved; nothing is removed; in `settings.json` the `hooks` block is regenerated with retired registrations dropped, absent keys are added and no other existing value changes | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs23.checks.txt | 1 |
| FS-24 | After an apply run, every manifest hook is executable, agent skill preloads are re-injected (conflicted agents excluded), the git-files and records-cutover steps have run, and the version is stamped last, each reported under `steps` | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs24-25.checks.txt | 1 |
| FS-25 | A file the engine adds takes the plugin source's mode (not 0600), and a file it replaces keeps its prior mode | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs24-25.checks.txt | 1 |
| FS-26 | The engine adds no library skill the target did not already have installed | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs26.checks.txt | 1 |
| FS-27 | `--rebase` combined with another scaffold mode is refused | .trd-state/deterministic-rebase-engine/evidence/rbe1/fs27.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

