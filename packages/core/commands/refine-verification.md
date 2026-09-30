---
name: refine-verification
description: Plan the next verification-and-fix round from a stalled functional-verification run — the one place that writes verification-plan.md
version: 1.0.0
argument-hint: "[feature-or-trd] [--auto]"
# Expensive, and its description matches how a user would phrase the task —
# so it must not be picked up by description match. Scope authorization is autonomy.md's job, not this flag's.
disable-model-invocation: true
category: verification
---

Plan a verification round: read the latest functional-verification report, work out
`verification-plan.md`'s six sections from that evidence, ask the owner only what the
evidence cannot settle, and write the plan. It is the only place any command writes
`verification-plan.md`, and the only step between a verification run that fell short and the
next one.

## User Input

```text
$ARGUMENTS
```

If no path or feature is given, resolve from `.trd-state/current.json`'s `trd`. Either a
feature slug (`.trd-state/<feature>/`) or a TRD path resolves to the same feature; the feature
slug is the TRD basename, exactly as `/verify-build` resolves it.

## Modes

`/refine-verification` exists to get judgment a verification run could not supply on its own
into a plan the next `--fix` round can execute. Most of that plan follows directly from the
diagnosis, the TRD and `.claude/rules/verification.md` — asking about those would be a
checkpoint, not a decision. The mode controls only who answers the small remainder.

| Mode | Who answers | When |
|---|---|---|
| **Interactive** (default) | **You.** Each open item is put to you with `AskUserQuestion`, one at a time, shown with its evidence. | A human is available. Your judgment is the point. |
| **`--auto`** | One `product-manager` subagent answers every open item. | Unattended runs — the loop between `/implement-trd` and `/verify-build` needs to close with nobody watching. |

**The autonomy exemption is conditional on mode, not on command name** (`autonomy.md`).
Interactive mode's purpose is to ask. `--auto` obeys autonomy discipline like any other
command and asks nothing.

---

## Inputs

| Input | Where it comes from | Required / optional |
|---|---|---|
| Latest verification report, with its Diagnosis block | `.trd-state/<feature>/verification-report.md` | required |
| Verification state file | `.trd-state/<feature>/verification-state.json` | required |
| Discovery ledger | `.trd-state/<feature>/discovered.jsonl` — including any `verification.md` need a prior `--fix` run recorded | required |
| Existing plan, if any | `.trd-state/<feature>/verification-plan.md` | optional — revise rather than start over when present |
| PRD and TRD | `docs/PRD/<feature>.md`, `docs/TRD/<feature>.md` | required — rulings are written into one of these |
| `.claude/rules/verification.md` and `.claude/verification-notes.md` | project root | required — environments, resource capacity, instance-naming notes |
| The framework skill list | `.claude/skills/framework-skills.txt` (falling back to `packages/skills/framework-skills.txt` in this checkout) | required — extra checks are restricted to `check`-role rows |

This command does not apply to a run that ended `satisfied` with nothing open, and it never
diagnoses on its own initiative — the diagnosis it reads was already written by the
functional-verification loop; this command's job starts after that.

---

## Derive (both modes)

**1. Diagnose, in plain words.** The outcome, proven/total, and the causes by name and count
— "9 open on evidence missing, 3 on judged failed", never a bare cause identifier.

**2. Work out every section of `verification-plan.md` from the evidence, without asking:**

- **Blockers** — one task-sized change per `judged-failed` or `not-built` gap the diagnosis
  confirms; order them via each row's `After` column. A confirmed gap is built — that is what
  `--fix` is for.
- **Slices** — the open, buildable criteria grouped by the resource or surface they need,
  scarcest resource first (`verification.md` §1a); a criterion with no group is its own slice.
- **Accepted as not verifiable** — every criterion whose cause is `environment-unreachable` or
  `capability-absent` (never buildable), with the diagnosis's reason, and any criterion the TRD
  already assigns to a later or production-only task.
- **Owner rulings** — a criterion that contradicts a decision already written in the PRD or TRD
  is aligned with that decision and recorded here as a ruling, citing it. That is not a
  question: the owner made the call when they approved the document.
- **Extra checks** — only `check`-role rows from the framework skill list that fit a gap the
  diagnosis shows; `none` when none do.
- **Stop rule** — `max-rounds: 3` and `stop-when-closed-below: 1`, unless an existing plan or a
  prior owner ruling says otherwise.

## Open items

**3. What is left to ask** — everything the Derive step could not settle from evidence:

- a criterion whose meaning must change and no PRD/TRD decision settles how (a scope or
  acceptance call only the owner can make);
- a gap the evidence cannot classify (buildable or not, real or a harness artefact);
- something the run needs that only the owner has — an account, access, an approval for a data
  change — named by where it lives, never its value.

"Should we fix the confirmed gaps?", "what order?", "how many rounds?", "accept these?" and
"write the plan?" are not on this list. **If nothing is left, ask nothing.**

### Interactive

One **`AskUserQuestion`** per open item, each shown with what the check saw, the criterion's
own text, the attempts made so far, and the cause. Give a real option, not a blank prompt — a
recommended default is always one keystroke away. Batch related items into one call where the
tool allows it.

If the ledger carries a `verification.md` need recorded by a prior `--fix` run, name it in the
diagnosis and point the owner at `/verification-setup`, which owns changing that file — this
command proposes nothing for it and writes nothing to it (see Never).

### `--auto`

**`--auto` closes every open item. It asks nothing and it leaves nothing open.**

Spawn **one `product-manager` subagent**. Give it the diagnosis, the open items, the PRD, the
TRD, `.claude/rules/verification.md` and the codebase. Every answer carries one of the same
three verdicts `/refine-trd --auto` uses:

| Verdict | Meaning |
|---|---|
| **answered** | Evidence settles it. Cite the file, line, or document. |
| **default** | No evidence, but one choice is clearly conventional here. Say why, and that it is a default. |
| **OWNER-CALL** | Genuinely the owner's to make. **Decide it anyway**, on the owner's behalf, and make the decision maximally reviewable: the question unchanged, the decision taken, the reasoning, and an explicit marker that this was the owner's call taken in their absence. |

**Access only the owner has is never guessed.** An item asking for a credential, an account,
or an approval the agent has no way to supply is marked not verifiable, and the need is named
in the readout's ISSUES for the owner to take to `/verification-setup` — the same way the
interactive path names one in its diagnosis. Nothing is recorded or written for it (see Never).

---

## Writes

- `.trd-state/<feature>/verification-plan.md`, in exactly this shape and these section names
  (`## Blockers`, `## Slices`, `## Owner rulings`, `## Accepted as not verifiable`,
  `## Extra checks`, `## Stop rule`) — written once the open items are answered, or straight
  away when there were none. Any section with nothing in it is written as `none`, not omitted.
  `**Agreed with**` says which items the owner (or the `--auto` agent) answered, or "derived
  from the evidence; no open items".

  ```markdown
  # Verification plan: refine-verification

  **Written**: 2026-09-29T00:00:00Z by /refine-verification
  **From run**: stalled at 5/8, report `.trd-state/refine-verification/verification-report.md`
  **Agreed with**: derived from the evidence; no open items

  ## Blockers
  | ID | Blocker | Files | After | Unblocks |
  |----|---------|-------|-------|----------|
  | B1 | wire the `--no-fix` flag through to the report renderer | `packages/core/lib/functional-verification.js` | — | SC-3 |

  ## Slices
  | Order | Slice | Criteria |
  |-------|-------|----------|
  | 1 | report and NEXT-line rewording | SC-3, SC-4 |

  ## Owner rulings
  | ID | Ruling | Written into |
  |----|--------|--------------|
  | R1 | `--resume` still builds nothing (OQ-2) | `docs/TRD/refine-verification.md` Open Questions |

  ## Accepted as not verifiable
  | Criterion | Ruling | Why |
  |-----------|--------|-----|
  | SC-7 | accepted | needs a live run that falls short; only sample had the owner accept every default |

  ## Extra checks
  | Skill | Inputs |
  |-------|--------|
  | none | |

  ## Stop rule
  max-rounds: 3
  stop-when-closed-below: 1
  always: stop when nothing is left to build
  ```

  A ruling made by the `--auto` agent is marked `decided by: agent (--auto)` in the `Owner
  rulings` table and goes **only** into the plan — never into the PRD or TRD, which record the
  owner's own decisions. An owner ruling from interactive mode is written into the PRD or TRD,
  with a dated changelog line, the same as any other ruling in this framework.

- The PRD or TRD, only for an owner ruling made in interactive mode (above). Nothing else —
  no other file, and never `.claude/rules/verification.md`.

## Never

- **Never edits `.claude/rules/verification.md`.** That file is owner-governed and changes
  only when the owner runs `/verification-setup`. A change it needs is named in the
  conversation (or the readout, under `--auto`) for the owner to take there, never applied or
  recorded here.
- **Never writes a credential's value** anywhere — only where a credential lives, if a need
  for one comes up.
- **Never starts `/verify-build`.** Writing the plan is this command's whole job; running it is
  the owner's own next invocation.

---

## Readout

**Format: the four-section readout in `.claude/rules/command-status.md`** — STATE, DECISIONS,
ISSUES, NEXT, in that order, one screen, written for someone who was not in the session.

**STATE opens with every ruling made** — each `Owner rulings` row, and each `Accepted as not
verifiable` row — before anything else, so the owner sees the whole plan without opening the
file. Then the rest of STATE: the plan's path, the blocker and slice counts.

**NEXT** is `/verify-build`, naming the plan path.

```
═══ COMMAND COMPLETE: /refine-verification ═══
<plan path>, <n> blockers, <n> slices, <n> owner rulings — next: /verify-build
```

On unrecoverable failure, use `═══ COMMAND STUCK: /refine-verification ═══` followed by
`Reason:` and `Next:` lines.

**Programmatic completion notify** — on the same final turn, invoke the user's
`NOTIFY_ON_COMPLETE` shell command (if set):

```bash
.claude/hooks/notify-complete.sh "refine-verification" "complete" "<one-line summary>"
```

For `COMMAND STUCK`, set the status argument to `"stuck"`. The bracket-guard makes this a
no-op when not configured.
