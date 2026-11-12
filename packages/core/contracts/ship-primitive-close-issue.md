---
primitive: close-issue
params:
results: closed, none
outward: yes
needs:
section: after
---

# Primitive: close-issue

Closes the one issue the work names, and nothing else (D28, D29).

## Input

`work`, `context`. The tracker comes from `stack.md`'s `## Issue Tracker` section.

## Do

1. **Tracker.** Read `Tracker:` and `Project:` under `## Issue Tracker` in the file at
   `$(node .claude/lib/owner-rules.js path stack.md)` (the base branch's copy when the base changed it).
   Absent, unfilled or `none`: return `none` and name that in `data.issues`.
2. **The source issue.** Read the bold `**Key**: value` header lines above the first `---` of the
   work's PRD and TRD, then the branch's `<issue-id>-<session>` prefix. A reference is GitHub
   `#N`, `<Project>#N` or an issues URL for the `Project:` repository, or Jira/Linear `KEY-N`.
3. **Exactly one distinct reference: close it. None: close nothing. More than one: close nothing
   and name them** in `data.issues`. A header can cite a related issue, and the one-reference
   rule fails toward closing nothing.
4. **Close it.** GitHub: `gh issue close <n> --comment "Shipped in <pr-url>"`. Linear and Jira
   close only by a state update, through `managing-linear-issues` / `managing-jira-issues`
   (`linearis issues update <id> --state <done state>`; `jira issues transitions <key>` then
   `jira issues update <key> --status <done>`).

A waived-defect issue is never closed by the feature that waived it, only when a later feature cites it as its source.

## Result

`closed` with `data`: `{ issue, tracker }`, or `none` with the reason in `data.issues`.

## Waiting

Nothing.
