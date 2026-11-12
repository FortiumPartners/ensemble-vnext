# Binding instructions for every task of readers-fall-back-to-the-ref

TRD: docs/TRD/readers-fall-back-to-the-ref.md. Strategy: tdd (write the failing test and the minimal fix yourself, in this task). Coverage floors: unit 60%, integration 50%.

## Decision (binding)
Read the whole "## Decision" section of the TRD before writing code. It fixes the approach for every task: per-folder fallback; `ensure`/`restore` for readers that then write, `readRecord` for pure readers; identity check via `sameFeature` against {FORGE_FEATURE_ID env, current branch or caller-given branch}; hooks local-only (never fetch); `no-record` vs `failed` distinction; `status.js` code unchanged; `precompact.js` falls back to `.trd-state/_session-log.md`; `ship-sequencer start` ensures only under `resume`; record-ref.js API additions (`local` option, tolerant atomic restore via a temp sibling folder, `match`/`branch`, `ensure`, `readRecord`, `hasRecords`, CLI `ensure` and `--local`). Other tasks build against that same API in parallel — do not invent a different one. If your task would contradict the Decision, stop and report.

## Grounding rules
Evidence markers: [ran] executed and read — trust most; [read] file opened and verified — trust; [inferred] deduced — verify before relying. Do NOT reimplement anything in Reuse. Delete what Replaces names. Match Follow. If grounding is wrong or stale, report it.

## Mirroring
packages/core/ is the source. After editing a file under packages/core/lib, packages/core/hooks or packages/core/commands (or packages/router/hooks/router.py), copy it byte-identically to its .claude/ twin (.claude/lib, .claude/hooks, .claude/commands, .claude/hooks/router.py). packages/full symlinks into packages/core — do not touch it.

## Scope
Implement what the task asks for; no flags, toggles or machinery it does not name. Stay inside your Touches list — other agents edit the other files in parallel. A needed change outside Touches is a finding to report, not to make.
Non-goals (STOP and report on conflict): no writer changes (nothing new writes a ref; item 3); no ignore lines or `ensemble.records` key (item 3); no change to the detached ship record's write path (item 4); no /rebase-project seeding (item 5); no per-file fallback inside a folder that holds records; no network access from any hook; no change to `record-ref.js write`, its tree layout or record.json fields.

## Checks
Run your check battery on what you changed; on failure debug and re-run before returning; report failed only if still red after genuinely trying. Jest: use Node 22 — `PATH=/opt/homebrew/opt/node@22/bin:$PATH npx jest <files>` (mock-fs, used by status.test.js, does not load under the default Node 26). shellcheck any changed .sh. NEVER run a live, model-spending check (anything starting claude sessions). Do NOT git commit, do NOT git stash — the orchestrator commits at the phase checkpoint.

## Discoveries
Work outside your task: record it and carry on —
node -e 'require("./.claude/lib/discovered").record(".trd-state/readers-fall-back-to-the-ref", { kind: "bug", foundBy: "<task id>", phase: 1, summary: "one line", file: "path", evidence: "how you know" })'
(kinds: bug | scope-conflict | stale-grounding | gap | risk). Do not fix it; do not spawn an agent for it.

## Deliverables
1 implementation per objective; 2 every file changed; 3 tests written; 4 outcome summary; 5 anything deleted under Replaces; 6 [inferred] grounding checked; 7 scope compliance; 8 skills used (none). You are a subagent: never spawn an agent of your own type for this task.
