---
name: sweep
description: "Fix a list of small independent issues in parallel — grounded and attested, without a TRD"
argument-hint: "<path-to-issue-list | the issues inline> [--project <dir>]"
---

> **Usage:** `/sweep <file>` or `/sweep <issues, inline>`
>
> **Examples:** `/sweep .trd-state/walkthrough/findings.md`, `/sweep the rate box is too small and the confirmation page is missing the e-sign notice`

## What this is for

**A list of small, unrelated issues — the output of walking an app and writing down what's
wrong.** Each one is its own little fix. They arrived together; they are not one change.

This is the shape the framework was missing, and the gap had a measured cost. An owner
collected ~25 issues from a walkthrough and pointed `/create-trd` at the list. It ran for
**22.7 minutes**, was killed unfinished, and the owner said *"begin fixing these using our
skills and subagents — the TRD process is overly burdensome for quick wins."* Four ad-hoc
subagents dispatched in 39 seconds had the first fix back 100 seconds later and the batch done
in about 13 minutes.

The ad-hoc path won on time and lost on rigour: nothing grounded, nothing recorded, nothing
checked. The owner's own verdict was *"almost certainly at less quality — so this isn't the
answer."* **This command is that speed with the discipline put back.**

## When NOT to use it

| Situation | Use instead |
|---|---|
| One defect worth reproducing and root-causing | `/investigate` |
| One change to the feature you are already building | `/amend` |
| Work that holds together as a single design | `/create-prd` → `/create-trd` |
| A list where most items need decisions | `/create-prd` — triage will defer them anyway |

**The test is not size, it is coupling.** Thirty independent one-line fixes belong here.
Six tasks that must land in order do not, however small each one looks.

## Step 1: Resolve the list

An argument that is a readable file path is the list. Anything else is the list, verbatim.

**Pass the owner's words through unedited.** The reporter described a symptom, and a symptom
paraphrased upstream becomes someone's guess at a cause. The workflow gives triage the raw
text for exactly this reason.

## Step 2: Run the sweep

```
Workflow({ name: "sweep", args: { source: "<the list, verbatim>", project: "<dir or omit>" } })
```

Two stages, both inside the workflow: triage sorts the list into small-and-independent versus
everything else, then one grounded agent per issue — separate areas in parallel, issues in the
same area one after another, because two agents editing one file lose each other's work.

## Step 3: Attest what it claims — this is the step that makes it trustworthy

The workflow reports files it changed. **Check them against the disk before you believe it.**

```bash
git status --porcelain
git diff --stat
```

For every issue reported as fixed, confirm at least one of its claimed files actually shows
up as modified. **An issue whose claimed files are all untouched is not fixed** — report it as
failed, whatever the agent's summary says. This is the same rule the implementation loop
learned the hard way: four tasks once sat in a state file marked success with no code behind
them.

Then run the project's check battery once over the whole batch, not once per issue.

## Step 4: Record what was found but not done

For anything triage deferred or a fixer returned as too big, record it so it survives the
session:

```bash
node -e '
  const { record } = require("./.claude/lib/discovered");
  record(".trd-state/_sweep", {
    kind: "gap",
    summary: "<the issue, in the reporter's words>",
    foundBy: "sweep",
    blocksFeature: false,
    evidence: "<why it was not a quick win>"
  });
'
```

These are real findings. Losing them is how the same issue gets rediscovered three sessions
later.

## Readout

**Format: the four-section readout in `.claude/rules/command-status.md`** — STATE, DECISIONS,
ISSUES, NEXT, in that order, one screen, written for someone who was not in the session.

Say plainly, in the reporter's own terms rather than by issue number: what is fixed, what was
already fine, what turned out to be bigger than it looked, and what failed. An issue id is a
lookup key, not a description — `12` means nothing; "the confirmation page's missing e-sign
notice (12)" means something.

**Nothing is committed.** Say so, and leave the commit to the owner: a batch of unrelated
fixes is theirs to split into commits as they see fit.

## Completion signal

```
═══ COMMAND COMPLETE: /sweep ═══
<n> fixed, <n> already fine, <n> too big for a sweep, <n> failed — nothing committed
```

Then:

```bash
.claude/hooks/notify-complete.sh "sweep" "complete" "<the same one-line summary>"
```

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

This command runs **autonomously** from this invocation to the COMMAND COMPLETE banner. Do not
pause to ask which issues to fix, whether to continue after the first few, or whether a
borderline item counts — triage decides, fixers overrule triage when they have read the code,
and both outcomes are reported.

`AskUserQuestion` is limited to the four cases in that rule. "This issue is ambiguous" is not
one of them: defer it with a reason and move on.

- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- **The declarative forms are the same move and are the ones that slip past**: "I can
  also fix the bigger ones if you want", "say the word and I'll take the deferred list",
  "that's available whenever". None is a question; each hands the decision back identically.

The pull is strong here specifically, because a sweep always ends with a deferred list sitting
right there. Report it and stop. The owner decides whether any of it becomes a `/create-prd`.

## What this command must not do

- **Never commit.** The owner reviews a batch of unrelated changes and splits it themselves.
- **Never turn a large issue into a small one by narrowing it.** That is a design decision.
  Defer it and say why.
- **Never report an issue as fixed on the agent's word alone.** Step 3 exists because that is
  the failure this framework has actually shipped.
- **Never fan out inside one area.** Same region means one at a time, every time.
