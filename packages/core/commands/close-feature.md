---
name: close-feature
version: 1.0.0
description: Judge a finished feature against its TRD's objectives and record an explicit close
argument-hint: "[trd-path] [\"<what you know>\"] [--accept \"<reason>\"]"
---

> **Usage:** `/close-feature [trd-path] ["<what you know>"] [--accept "<reason>"]` — run on the
> default branch, after the PR has merged.
>
> **Examples:**
> `/close-feature docs/TRD/feature-close-out.md`
> `/close-feature docs/TRD/feature-close-out.md "deployed to staging on 2026-09-27 and I ran the live check myself; it passed"`
> `/close-feature docs/TRD/feature-close-out.md --accept "superseded by another design"`

---

## What this is for

`/audit-build` verifies delivered code. Nothing before this command ever marked a feature
**finished** — a shipped feature keeps presenting as in flight to the router's hint and the
SessionStart banner indefinitely (`CLAUDE.md` 4.7.1 known-open). This command closes that gap:
it gathers the facts on disk, **judges** the feature against its TRD's objectives (`done`,
`done-with-gaps`, `not-done`), and writes `.trd-state/<feature>/closed.json` — the record every
other reader treats as terminal.

**Closing is the owner's act, always explicit, never automatic.** No other command closes a
feature; `/audit-build`'s readout names this command as the step after the merge, and this is
the only command that runs it.

## User Input

```text
$ARGUMENTS
```

**Parse, in this order:**
1. The first argument ending in `.md` that names an existing file is `<trd-path>`. Otherwise
   use `current.trd` from `.trd-state/current.json`.
2. `--accept "<reason>"` — anywhere in the arguments — is the **override**: "close although
   not done." Its text is `<reason>`.
3. Any OTHER quoted free-text argument is **owner evidence**: a fact the repository does not
   hold ("deployed live and I tested it"), weighed by the judgement like any other fact and
   recorded verbatim.

Owner evidence and the override are different things and must not be conflated (D7): evidence
can make a feature done; `--accept` cannot — it only permits closing one that is not.

**No TRD named** (neither an argument nor `current.trd`):

```
═══ COMMAND STUCK: /close-feature ═══
Reason: no TRD named and .trd-state/current.json names none
Next:   /close-feature docs/TRD/<feature>.md
```

`<feature>` is the TRD's basename without its extension — the same rule `router.py`'s
`derive_feature()` and `notify-complete.sh`'s `NOTIFY_FEATURE` already use:
`path.basename(trd, path.extname(trd))`.

## The three deterministic stops (in this order, before any judgement)

**1. Already closed.** `.trd-state/<feature>/closed.json` exists:

```
STATE: <feature> was already closed on <closedAt from the record>. Nothing written.
```

```
═══ COMMAND COMPLETE: /close-feature ═══
<feature> was already closed on <closedAt>
```

Write nothing. Do not re-read `implement.json` or gather any other fact.

**2. Wrong branch (D4).** Resolve the default branch:
`git symbolic-ref --quiet refs/remotes/origin/HEAD` with the `refs/remotes/origin/` prefix
stripped; if that fails (no `origin`, detached, or any error), fall back to `main`. Compare
against `git branch --show-current`. Not equal:

```
═══ COMMAND STUCK: /close-feature ═══
Reason: closing records onto <default>, and this checkout is on <current>
Next:   switch to <default> after the PR merges, then re-run
```

Write nothing.

**3. Never implemented (D8).** No `.trd-state/<feature>/implement.json`:
- Without `--accept` →
  ```
  ═══ COMMAND STUCK: /close-feature ═══
  Reason: <feature> was never implemented
  Next:   /close-feature <trd> --accept "<reason>" to record it as abandoned
  ```
  Write nothing.
- With `--accept "<reason>"` → skip straight to **Write**, below, with `abandoned: true`,
  `verdict: "not-done"`, `acceptedReason: "<reason>"`, `tasks: {}`, `unfinished: []`,
  `checkpointCommit: null`, `merged: null`, `verification: { outcome: null, report: null }`,
  `audit: null`. No further fact-gathering or judgement runs for an abandoned feature — there
  is nothing on disk to gather.

## Gathering facts (plain reads and `git`, no judgement yet)

Skip this whole section for an abandoned feature (stop 3, `--accept` branch).

**Facts come from the files and `git` calls named below — never from independently
re-running or re-verifying the feature's own behaviour.** Do not execute the code the TRD
describes, start a server, or otherwise re-derive an objective's answer yourself: a
verification criterion recorded `not_verifiable` or `not_met` stays that fact regardless of
what a quick manual check might show, because the whole point of that status is that the
verification loop could not confirm it in **its** environment — `/close-feature` re-checking
it in a different one proves nothing about that and silently erases the distinction
`not_verifiable` exists to preserve. The only ways an objective becomes proven are: a `met`
verification criterion, a task recorded `success` whose acceptance criteria match the
objective, or owner evidence. If none of those covers an objective, it is unproven, full stop.

**Task statuses and checkpoints** — reuse `implement-state.js`'s `load()`, do not re-parse the
file by hand:

```javascript
node -e '
  const { load } = require("./.claude/lib/implement-state");
  const state = load(".trd-state/<feature>/implement.json");
  const tasks = state.tasks || {};
  const counts = {};
  const unfinished = [];
  for (const [id, t] of Object.entries(tasks)) {
    counts[t.status] = (counts[t.status] || 0) + 1;
    if (t.status !== "success") unfinished.push({ id, status: t.status });
  }
  console.log(JSON.stringify({ counts, unfinished, checkpoints: state.checkpoints || [] }));
'
```

**Deferral reasons** — reuse `trd-parser.js`'s `parseTrd(text).deferred`, do not re-parse the
TRD's deferred-by-design table by hand:

```javascript
node -e '
  const fs = require("fs");
  const { parseTrd } = require("./.claude/lib/trd-parser");
  const text = fs.readFileSync("<trd-path>", "utf-8");
  console.log(JSON.stringify(parseTrd(text).deferred));
'
```

**Verification** — read `.trd-state/<feature>/verification-state.json`: `outcome`, and every
criterion whose `status` is not `met` (`not_met`, `not_verifiable`, `unbuilt`) with its
`reason`; note `verification-report.md`'s path if it exists beside it. Absent file → both null.

**Audit** — read `.trd-state/<feature>/audit-build-report.md`: the first line beginning
`VERDICT:` and the `- Audited commit:` value. Absent → `audit: null`.

**Commit and merge status (D11)** — walk `checkpoints[]` from **last to first**. The first
`commit` value matching `^[0-9a-f]{7,40}$` that also resolves —
`git rev-parse --verify --quiet <value>^{commit}` exits 0 — is `checkpointCommit`. Only a value
that both matches the pattern and resolves counts; a checkpoint entry showing `pending`,
`PENDING`, a phase-label string (`phase3_complete`), or `null` is not a commit and is skipped,
not treated as a partial match. Then:
`git merge-base --is-ancestor <checkpointCommit> <default>` → `merged: true` on exit 0,
`false` on exit 1. **When no checkpoint value resolves**, `checkpointCommit` and `merged` are
both `null`, and the readout says plainly that no checkpoint commit was recorded, naming any
non-commit values found in `checkpoints[]`. Never search commit messages.

**Objectives** — read the TRD's `## 1.2 Objectives` (or equivalently-named Objectives) table.
Where the TRD has none, its Master Task List acceptance criteria stand in for objectives, one
per task.

**Staleness of the audit (D12, OQ-7)** — only relevant when `audit` is not null. The audited
commit reaches `git` under the same rule as a checkpoint value: it must match
`^[0-9a-f]{7,40}$` AND `git rev-parse --verify --quiet <auditedCommit>^{commit}` must exit 0.
A value that fails either — `/audit-build` writes the literal `unknown` when `rev-parse` failed,
and a feature branch deleted after a squash merge leaves its short sha unresolvable in a fresh
clone — is never passed to `git diff`: staleness cannot be computed, and ISSUES says so (see
below). Otherwise compare the audited commit against `<default>`:
`git diff --name-only <auditedCommit> <default>`, intersected with this TRD's own grounding
`Touches` paths (the file list under `### <task-id>` `Touches:` entries in the TRD's Task
Grounding section). A non-empty intersection is staleness; an audit commit whose diff touches
nothing this TRD names is not staleness, even if other, unrelated files changed.

**Owner evidence** — the free-text argument, verbatim.

## The judgement (D6)

For **each** objective, decide whether it is proven, and by what: a `met` verification
criterion, a task delivered `success`, or owner evidence — **only these three.** Do not
substitute your own quick check of the running code for a criterion that was not `met`; the
gathering step above is where that boundary is drawn, and the judgement does not cross back
over it. A task's status is **evidence, never the verdict** — the owner's own example: a deferred `[LIVE]` verification task that did not run
is "done with a gap" when its criteria were proven another way, and "not done" when it was the
only evidence the core behaviour works. Weigh an audit `do not proceed` VERDICT's named
blockers against each objective they touch; it is weighed, never gating (D12, OQ-2 — do not
refuse to close on the audit's word alone).

A `deferred` task is a gap only if what it would have proven is proven nowhere else. **Whether
a covered gap still belongs in `outstanding` depends on what covered it, not just that the
objective is proven:**
- A **criterion or a different task** standing in for what the deferred task would have shown
  proves the *objective*, but not the deferred task's own specific purpose — that task's own
  absence is still worth a line in `outstanding`, even though it says plainly why the objective
  is not undermined.
- **Owner evidence that directly describes doing the very thing the deferred task would have
  done** (not merely proving the objective by some other means) fully discharges that task —
  it does **not** appear in `outstanding` at all. D7's "owner evidence can make a feature done"
  is the point: evidence of exactly the missing act is not a substitute for it, it IS it.

A **missing** audit (`audit: null`) is a loose end for `outstanding`. A **stale** audit
(present, but the default branch moved since it was taken) is **never** in `outstanding` and
never affects `done` vs. `done-with-gaps` — it is a readout-only concern (ISSUES, "audit is of
…"), because the audit is not gating in the first place (D12, OQ-2).

Decide one of:
- **`done`** — every objective proven and nothing above belongs in `outstanding`. `outstanding`
  is empty — a stale-but-present audit or an owner-evidence-discharged task does not change this.
- **`done-with-gaps`** — every objective proven; every remaining loose end that DOES belong in
  `outstanding` per the rules above (a task whose own purpose stayed unfulfilled even though its
  objective is proven some other way, or a missing audit) is listed with why it does not
  undermine an objective.
- **`not-done`** — at least one objective is unproven. `outstanding` names what is missing and
  which objective it leaves unproven.

Name, for each `outstanding` item covered by owner evidence, "covered by owner evidence" rather
than silently dropping it from the list.

## Outcomes

- **`not-done` without `--accept`** → nothing is written.
  ```
  ═══ COMMAND STUCK: /close-feature ═══
  Reason: <the judgement's core in one line — which objective, what is missing>
  Next:   /close-feature <trd> --accept "<reason>" to close anyway, or finish the missing work first
  ```
  The full outstanding list goes in the STUCK message's body (ISSUES-shaped), not just the one-
  line Reason.
- **`--accept` given and the verdict is NOT `not-done`** → `acceptedReason` stays `null`; the
  override was not needed, and DECISIONS says so plainly rather than silently discarding the
  flag.
- **Otherwise (`done`, `done-with-gaps`, or `not-done` with `--accept`)** → proceed to Write.

## Write — `closed.json`, then a parse check

Use the Write tool for `.trd-state/<feature>/closed.json`, this shape (§3.3):

```typescript
interface CloseRecord {
  feature: string;                 // TRD basename without extension
  trd: string;                     // the TRD path
  closedAt: string;                // ISO 8601 timestamp, now
  defaultBranch: string;
  checkpointCommit: string | null;
  merged: boolean | null;          // null only when checkpointCommit is null
  abandoned: boolean;              // true only for stop 3's --accept branch
  verdict: "done" | "done-with-gaps" | "not-done";
  outstanding: Array<{ item: string; why: string }>;   // empty for "done"
  ownerEvidence: { text: string; attestedBy: "owner"; checkedByTooling: false } | null;
  acceptedReason: string | null;   // set only when verdict is "not-done" and --accept was given
  tasks: Record<string, number>;   // counts by status as found
  unfinished: Array<{ id: string; status: string }>;  // every task whose status is not "success"
  verification: { outcome: string | null; report: string | null };
  audit: { verdict: string | null; report: string; auditedCommit: string | null } | null;
}
```

Owner text (`ownerEvidence.text`, `acceptedReason`) is stored **verbatim** — never paraphrased,
never truncated.

**Parse check, immediately after writing:**

```bash
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' .trd-state/<feature>/closed.json
```

A file that fails this check is rewritten — never left broken on disk. No script validates the
record's shape beyond this parse check (D5, NG6): presence is the signal every consumer reads;
the fields are for display only.

## Nulling `current.json` (D9)

When `.trd-state/current.json`'s `trd` names `<feature>` (same basename rule), set all four
keys — `prd`, `trd`, `status`, `branch` — to `null` and keep the file (`validate-init.sh`
requires its presence, not its content). Otherwise leave `current.json` untouched — it is
pointing at something else and this close is not that feature's business.

**Do not delete the file, and do not commit.** `/close-feature` never runs `git add`, `git
commit`, or `git push` — the record is written, and NEXT tells the owner to commit and push it
(D4, D11).

## Readout

**Format: the four-section readout in `.claude/rules/command-status.md`** — STATE, DECISIONS,
ISSUES, NEXT, in that order, one screen, written for someone who was not in the session. Any
section may be "none".

- **STATE** — the record's path, the verdict, the task tally (e.g. "7 success, 1 deferred").
- **DECISIONS** — how each task not `success` was settled (deferred-and-covered vs. genuinely
  outstanding); owner evidence, quoted and labelled owner-attested, and what it covered; whether
  the override was used, or — when `--accept` was passed but not needed — that it was not
  needed.
- **ISSUES** — built in this order, checking `abandoned` FIRST (an abandoned record always also
  carries `acceptedReason`, so checking that field first would misreport it). **Every quoted
  string below is LITERAL text a downstream check greps for verbatim — reproduce it exactly,
  substituting only the bracketed values. Do not paraphrase it into your own words, however
  natural that reads; a rewording that means the same thing still fails the check.**
  - `abandoned` true → the line contains exactly `abandoned, never implemented: <acceptedReason>`
  - else `acceptedReason` set → the line contains exactly `closed with N of M tasks accepted
    unfinished: <acceptedReason>` (N = `unfinished.length`, M = the sum of all `tasks` counts) —
    write those literal words in that order, not a rephrasing like "N of M tasks were finished"
  - `audit` is `null` → the line contains exactly `never audited`; audit present and stale (per
    the staleness check above) → the line contains exactly `audit is of <sha>; <n> touched
    file(s) changed since` — not "the build audit is out of date" or any other rewording, even
    though it says the same thing; audit present but its audited commit does not resolve (per
    the staleness check above) → the line contains exactly `audit commit <value> does not
    resolve here; staleness unknown`
  - `merged` is `false` → the line contains exactly `checkpoint <sha> is not on <default>` (a
    squash or rebase merge leaves this false)
  - `checkpointCommit` is `null` → the line contains exactly `no checkpoint commit recorded`,
    naming any non-commit values found in `checkpoints[]`
  - "none" only when every one of the above is inapplicable.
- **NEXT** — exactly:
  ```
  git add .trd-state/<feature>/closed.json && git commit -m "chore(<feature>): close feature" && git push
  ```

Then the banner, as the last line:

```
═══ COMMAND COMPLETE: /close-feature ═══
<feature>: <verdict>, or the STUCK reason>
```

## Completion signal

```bash
.claude/hooks/notify-complete.sh "close-feature" "<complete or stuck>" "<feature>: <verdict or reason>"
```

The summary **names the feature** — deliberately, because `current.json` has just been nulled
and `notify-complete.sh`'s own `NOTIFY_FEATURE` would otherwise read empty (D9). Silent no-op
when `$NOTIFY_ON_COMPLETE` is unset.

**No `PushNotification`** — a one-shot command the owner is watching run.

## Security (S1, S2)

Owner-supplied text (the TRD path, the evidence, the `--accept` reason) never enters a shell
string it could break out of: `closed.json` is written with the Write tool, never string-
interpolated into a shell command; the TRD path is used only after it is confirmed to exist;
checkpoint values and the audit report's audited commit reach `git` only after matching
`^[0-9a-f]{7,40}$` (a value read from a file on disk is still untrusted input to `git`). The published-nowhere
scope of this command means no credential-leak surface beyond what `/audit-build`'s own report
already carries.

---

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

This command runs **autonomously** from this invocation to the COMMAND COMPLETE/STUCK banner.
**Do NOT pause mid-flow to ask the user to confirm the judgement, review the record before
writing it, or verify the commit/merge facts.** Invoking this command IS the authorization to
gather facts and judge; the owner already knows the verdict may be `not-done` — that is what
the STUCK path is for, not a mid-flow question.

`AskUserQuestion` is permitted ONLY in these four cases:

1. **Genuine requirement ambiguity** — the TRD is silent on what its objectives even are, AND
   no reasonable default (falling back to Master Task List acceptance criteria) applies.
2. **Missing information that cannot be derived** — none is expected in this command's normal
   operation; every input is a file read or a `git` call.
3. **Truly irreversible destructive operations** — none apply; `closed.json` is write-once by
   convention (deleting it to reopen is the owner's own separate act) and this command never
   deletes or force-pushes anything.
4. **STUCK conditions** — the three deterministic stops and a `not-done` verdict without
   `--accept` are STUCK by design, not by retry exhaustion; they end the run, they do not ask.

Outside those: **decide from the gathered facts, record the reasoning in `outstanding`, and
proceed to Write or to STUCK as the judgement dictates.**

Forbidden patterns:
- "The verdict looks like `done-with-gaps` — should I close it anyway?" → no. That is the
  verdict; write it.
- "I found the audit report is stale — do you want to re-audit first?" → no. Record the
  staleness in ISSUES and proceed; re-auditing is a separate, owner-invoked command.
- "Should I commit and push the record for you?" → no. NEXT names the exact commands; running
  them is an outward-facing act (D4) reserved to the owner.
