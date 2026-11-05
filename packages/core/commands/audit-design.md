---
name: audit-design
description: Pipeline stage after /create-design. Runs read-only verifiers over a design's boards against its brief and sources, the canvas conventions and the codebase, and writes the audit report; changes no board.
version: 1.0.0
argument-hint: "<slug> [--project <dir>] [--drift]"
# MODEL-INVOCABLE, like /audit-prd and /audit-trd (owner-requested 2026-10-21, "verify and
# audit steps need to be model invocable"). Scope authorization is unchanged and stays
# autonomy.md's: a command runs to its own banner.
---

Audit a design and report. This command changes no board, map or canvas.

## User Input

```text
$ARGUMENTS
```

The slug names `docs/ui/<slug>/`. If none is given, and exactly one `docs/ui/*/design-map.json`
exists, use it; with several, take the one `current.json` names, else end STUCK listing them.

---

## What this command is for

`/create-design` and `/refine-design` draw boards. This checks them, the way `/audit-prd` checks
a PRD. It is **report only** (AC-F10.4): it never edits a board, never writes `design-map.json`
and never publishes. Findings are for the owner to act on with `/refine-design`.

| Verifier | Checks |
|---|---|
| `traceability` | A board with no source; a brief item with no board. |
| `conventions` | Boards against the canvas conventions (`designing-on-canvas`). |
| `reuse` | A component drawn by hand when the design system or codebase already has one. |
| `render` | Render errors, using `design-render.js` into a scratch folder, never `screens/png/`. |

**`--drift`** (AC-F13.7, runnable at any time, usually after `/sync-design`) adds verifiers:

| Verifier | Checks |
|---|---|
| `drift-boards` | Every `shipped` and as-is board against a fresh screenshot of the current build, captured into a scratch folder, never under `docs/ui/<slug>/`. |
| `drift-system` | The design system version installed on the canvas against the current one. |
| `drift-code` | Code changes since each board shipped that no design accounts for. |
| `drift-undesigned` | Routes with no board. The result lists each undesigned screen for `/create-design` to draw as an as-is board. |

Without the flag none of these run. With it, the run still changes no board, map or canvas.

Every finding names a **board** and a **line**. A finding the reconcile step finds wrong is
rejected and **names the file that refutes it**. Findable only: no opinions about taste, and
zero findings is a legitimate result.

## Steps

1. **Start** per `packages/core/contracts/design-commands.md` section 1, with these differences
   because this command is report-only: run `design-map.js setup` (a `missing` or `unfilled`
   `design.md` ends the command STUCK with "run `/design-setup`"); do **not** sync the canvas and
   do **not** write the map.
2. **Read the inputs the workflow cannot read** (only this session can, D2 and D12):
   ```bash
   node .claude/lib/design-map.js read --dir docs/ui/<slug>
   node .claude/lib/design-map.js stale --dir docs/ui/<slug>
   ```
   `stale` runs **without `--record`**: drift is reported, never written (AC-F6.9). On
   `"stale": true` the drift is an **ISSUES** line, never only a STATE line, however small the
   change looks (a comment-only edit included; whether it matters is `/design-system --sync`'s
   call, not this audit's): "the design system is out of date: <changed paths> changed since it
   was built" (with no `changed_paths`, name its `reason` in their place). And step 1 of NEXT is `/design-system --sync`, ahead of `/refine-design`. Read the
   `designing-on-canvas` skill's conventions if it is installed (else pass none; the workflow
   reports that), and the previous report's `## Could Not Verify` rows if
   `.trd-state/<slug>/audit-design-report.md` exists, so the section is **maintained** (AC-F10.1)
   and not lost when the report is overwritten.
3. **Run the workflow once:**
   ```
   Workflow({ name: "audit-design", args: { slug: "<slug>", dir: "docs/ui/<slug>", brief: "docs/ui/<slug>/brief.md", sources: "<sources path or empty>", project: "<dir or empty>", map: "<design-map.json text>", conventions: "<text or empty>", stale: <stale result>, priorCnv: [<prior rows>], runtime: "<pinned dc-runtime path or empty>" } })
   ```
   **With `--drift`**, add `"drift": true` and four more inputs only this session can supply:
   `routes` (the product's routes from `.claude/rules/design.md`, or empty), `systemVersions`
   (`{ installed, current }`, read from the hosted Design System artifact and the canvas, D12),
   `capture` and `rubric` (the `## Capture` and `## Rubric` text of `verify-design-comparison`'s
   `SKILL.md`), and `"environment": "local"` (an environment `verification.md` section 1 lists;
   never `staging` or `production`). The result then also carries `undesigned_screens`; print
   them under ISSUES with `/create-design` to draw each as an as-is board.
   It returns `readout`, `accepted`, `rejected` and `could_not_verify`, and no board edits.
   **If the workflow is unavailable**, run the verifiers above as parallel read-only subagents
   and reconcile their findings yourself.
4. **Write the report** (below), then **record** it, then print the readout.

## Writing the audit report

**Right after the workflow returns** and before printing the readout, write
`.trd-state/<slug>/audit-design-report.md`, overwriting any previous report:

```markdown
<the readout's VERDICT: line, copied - the report's first line>

# Audit report: <slug>

- Date: <YYYY-MM-DD>
- Audited commit: <output of `git rev-parse --short HEAD`, or "unknown" if it fails>
- Design: docs/ui/<slug>
- System: <current | stale: N component files changed | stale check not run>

<the readout, verbatim as printed below>

## Could Not Verify

<one bullet per workflow `could_not_verify` row, or "none">
```

**One text, written once, printed as written.** Print the readout character for character as
the file holds it; the only addition is STATE lines about the report itself.

Then record it. These reports are never published, so record passes `--url ""`:

```bash
node .claude/lib/artifacts.js record --state-dir .trd-state/<slug> --kind audit-design --path .trd-state/<slug>/audit-design-report.md --command /audit-design --url ""
```

There is no commit step. A failed write or record is one line in STATE; it never turns the run STUCK.

## Readout

**Format: the four-section readout in `.claude/rules/command-status.md`** (STATE, DECISIONS,
ISSUES, NEXT, in that order, one screen, written for someone who was not in the session). The
`AUDIT:` header and the `VERDICT:` line come first, then the workflow's finding lines. When the
system is stale (step 2), ISSUES carries the drift line and NEXT names `/design-system --sync`
first, then `/refine-design <slug>` for the findings; otherwise NEXT is `/refine-design <slug>`
for the findings, or nothing. Check this before printing: a stale result with no ISSUES drift
line, or with anything above `/design-system --sync` in NEXT, is a wrong readout.

---

## Output discipline (see `.claude/rules/command-status.md`)

**End your final turn with the banner — last line of output, nothing after it:**

```
═══ COMMAND COMPLETE: /audit-design ═══
<one-line summary of what was produced>
```

On unrecoverable failure, use `═══ COMMAND STUCK: /audit-design ═══` followed by `Reason:` and `Next:` lines.

**Programmatic completion notify** — on the same final turn, invoke the user's `NOTIFY_ON_COMPLETE` shell command (if set) for webhook/queue/shell-pipeline integration:

```bash
.claude/hooks/notify-complete.sh "audit-design" "complete" "<one-line summary>"
```

For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"`. The bracket-guard makes this a no-op when not configured.


---

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

This command runs **autonomously** from this invocation to the COMMAND COMPLETE banner.
**Do NOT pause mid-flow to ask the user to confirm decisions, review artifacts, verify
checkpoints, or defer to stakeholders.** The user already authorized the run by invoking
the command; do not ask them to authorize it again, in pieces.

`AskUserQuestion` is permitted ONLY in these four cases:

1. **Genuine requirement ambiguity** — the PRD/TRD/stack.md is silent on a decision
   that MUST be made, AND no reasonable default exists from documented constraints.
   *Try a default first; ask only if none fits.*
2. **Missing information that cannot be derived** — a value not in the codebase, env,
   config, or anywhere derivable (a user-specific URL, API key not in env, etc.).
3. **Truly irreversible destructive operations** — `--reset-state` with progress,
   `git push --force`, deleting user-authored files. Routine state mutations do NOT
   qualify.
4. **STUCK conditions** — retry exhaustion after the documented mitigations have run.

Outside these four cases: **decide based on documented constraints, document the
rationale in the artifact, and proceed.** The user iterates via `/refine-design`,
`/refine-trd`, or `/implement-trd --resume` — not via mid-loop confirmation prompts.

Forbidden patterns:
- "Should I proceed to phase N+1?" → no — emit PHASE banner, proceed.
- "Please review this artifact before I continue." → no — finish the artifact, emit
  COMMAND COMPLETE.
- "Multiple approaches possible; which do you prefer?" → pick the best fit, document
  why, mention alternatives in the artifact if useful.
- "Should I check with product/legal/stakeholders?" → no — decide based on documented
  goals; the user can correct via /refine-*.
- "Checkpoint reached. Continue?" → continue. Always.
- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- "Given the previous step went cleanly, do you want me to pause and review?" → self-defeating: you just acknowledged there's nothing to address. PROCEED.

### Autonomy is the default, not a mode

The COMMAND COMPLETE banner is the first and only return of control. A STUCK condition after
retry exhaustion is the one thing that stops a run early. Everything in the table above is
forbidden unconditionally — there is no flag that turns this on, and none that turns it off.
