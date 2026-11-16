# Rerun scope: none, targeted or full

**Read by:** `/verify-build`, `/refine-verification`, `/audit-build` (a re-audit), `/ship-build`
(the custody re-proof and CI reruns) and `/implement-trd` (the phase-gate battery). Each reads
this contract at the point it would re-run something, before it re-runs anything.

## The rule

Before a re-verification, re-audit, re-proof or CI rerun, read **what changed since the last
satisfied or green result** (the *anchor*, named per command below) and choose one scope. Quality
is kept and time is not wasted: a rerun that cannot find anything new is a repeat, and a repeat
adds no proof.

| Scope | Choose it when | What runs |
|---|---|---|
| **none** | only run records (`.trd-state/`), docs, rulings or framework files (`.claude/`) changed, and nothing the checks exercise is among them | nothing; the earlier result stands, and the readout says so |
| **targeted** | the change is narrow and readable: a few files that map to named criteria, tests or CI jobs | only the open or affected criteria, the related tests, or the failed CI jobs |
| **full** | the change is wide, touches shared code (code many things import), or **cannot be read** (no anchor, anchor not an ancestor, the diff fails) | everything the command would run on a first pass |

**The floor.** A criterion, test or job the change can affect is always re-checked. `none` is
allowed only when nothing the checks exercise changed. A docs-only change is `none` for a
verification run, but a doc that a check reads (a TRD the audit audits, a prompt a smoke run
executes) is something the checks exercise: that is not `none`.

**Never widen by reflex.** A criterion with no record of what covers it is not a reason to
run everything. Read the changed files, judge which criteria they can reach, and run those; widen to
`full` only when the files are wide or shared, or cannot be read.

## The facts: read them, do not remember them

```bash
node .claude/lib/rerun-scope.js changed --anchor <anchor commit> [--head <ref>] [--trd <path>]
```

It prints one JSON line: `readable`, `anchor`, `head`, `files` (each with a `class`: `record`,
`doc`, `framework`, `test`, `ci`, `deps` or `code`) and `counts`. **It decides nothing.** The
scope is the model's judgment from those facts and the table above. `readable: false` is `full`
unless a different reading of the change is possible from the command's own records.

## The anchor each command reads, and what counts as related

| Command | Anchor | Related means |
|---|---|---|
| `/verify-build`, `/refine-verification` | the last commit made at or before the finish time of the last report whose outcome was `satisfied` (`git rev-list -1 --before=<finish time> HEAD`; the report records no commit of its own); with no satisfied report, the same for the last run, whose `met` criteria carry forward | the criteria whose covering files, or whose environment, a changed file can reach, plus every criterion still open |
| `/ship-build` custody re-proof | the custody anchor (`custody.json`) | the must-pass criteria the changed shipped files cover; the criteria reused or excused by `custody.js` stay as it reports them |
| `/ship-build` CI rerun (`wait-ci`) | the head of the last green CI run | the failed jobs only; a job that passed on that head stays passed unless the change reaches its inputs |
| `/audit-build` re-audit | the commit audited by the last passing audit round (`auditedCommit` in the ledger) | the files changed since it and the previous round's defects, which is what a re-audit checks already |
| `/implement-trd` phase gate | the tree the last green phase gate (or the task's own targeted checks) passed on | tests that exercise the files the phase changed; the full battery when the change is wide or shared |

## Say the choice in the readout

DECISIONS carries one line, in plain words, naming the scope and the reason:

```
Rerun scope: targeted. Only `src/layout/Phone.tsx` changed since the last green run; re-checked the 3 criteria that cover it.
Rerun scope: none. Only `docs/` and `.trd-state/` changed since the last satisfied report; nothing re-run.
Rerun scope: full. The change touches `src/shared/theme.ts`, which most screens import.
```

## When you are unsure

Do not default to `full`. State the scope you would take and ask.

- **Interactive** (a person is at the session and the command was not chained): ask the owner
  one question with the scope you would take as the default, then continue on the answer.
- **Unattended** (a chained call such as `--chained`, an automatic mode such as `--auto`, or a
  non-interactive session, a Forge-driven session included): stop with `COMMAND STUCK`. `Reason:`
  carries the scope question, and `Next:` carries your proposed default, for the PM to answer and
  resume. No command here tries to tell Forge apart from any other unattended run.

Unsure means a real question about reach (a changed file whose callers you cannot trace), not a
reluctance to choose. A readable, narrow change is `targeted`; do not ask about it.

## What this contract does not do

It states the rule and the decision step. It does not change the mechanisms that apply a scope:
the custody re-proof set in `custody.js` (issue #153), the functional-verification regression pass
when a criterion has no covers record (issue #154), the CI-proven criteria re-proved by a full
CI run (issue #155) and the `/implement-trd` phase gate that runs the full battery twice
(issue #156) each land after it and make their mechanism follow this rule.
