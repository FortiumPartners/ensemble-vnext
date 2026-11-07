# Governance draft — ship-build

**Status:** draft, **not applied**. Written 2026-11-07 by SHIP-D001 of `docs/TRD/ship-build.md`
(decision D36; objectives AC-F12.1, AC-F12.2, AC-F12.3). Nothing below is in force until the
owner approves it; applying it is SHIP-D002, which is deferred by design for exactly that reason.

**Why it exists.** `/ship-build` merges and releases because `.claude/rules/ship.md` lists those
steps. Today `autonomy.md` says a command's authorization "does not reach an outward-facing or
irreversible act that merely follows from its work — a merge, a deploy, a release", with one
exception, `ensemble.openPullRequest: auto`. So two owner-governed files must say that a listed
step is the owner's own go: `constitution.md` puts `ship.md` among the files only the owner
changes, and `autonomy.md` gains the sentence the shipping sequencer looks for (TRD §3.10). The
sequencer is `ship-sequencer.js`, the code that hands out a `ship.md` list one step at a time.

**What happens until it is approved.** The sequencer refuses every outward step — one that acts
outside this machine: opening a PR, requesting a review, merging, releasing, a `run`, closing or
filing issues, the post-merge design sync — unless `autonomy.md` carries the sentence, or the
step's own setting already authorizes it (a PR under `openPullRequest: auto`). A refused step
ends the run with `not authorized: <step>` and points here (D24). A plain `push` needs no
amendment.

**How to approve.** Say so, then run `/implement-trd docs/TRD/ship-build.md --include-deferred`
so SHIP-D002 applies the five edits below exactly as written, substituting the approval date for
`<date of approval>`. SHIP-D002 must not re-derive the text.

---

## The four parts at a glance

| Part | File(s) | Change | Edits |
|------|---------|--------|-------|
| 1 | `.claude/rules/constitution.md`, `packages/core/templates/constitution.md.template` | A Governance Split row: `ship.md` is owner-governed beside `verification.md`, and running `/ship-setup` is the owner's confirmation (AC-F12.1). The live file also gains a Changelog entry | 1 (both files), 2 (live file only) |
| 2 | `.claude/rules/autonomy.md`, `packages/core/templates/claude-directory/rules/autonomy.md` | The authorization sentence on a line of its own, with what it covers; `ship-setup` joins the skills exempt as interactive by purpose; the `openPullRequest: auto` exception untouched (AC-F12.2) | 3, 4 (both files, one text) |
| 3 | `.claude/rules/stack.md` (this repository only) | A `## Issue Tracker` section naming GitHub, `FortiumPartners/ensemble-vnext` | 5 |
| 4 | — | Byte arithmetic against the 17,000-byte ceiling on `async-discipline.md` + `autonomy.md` | — |

Each edit is a find-and-replace: the **find** text occurs exactly once in each file it applies to,
and the **replace** text takes its place. Both are whole lines. The `<!-- edit N find -->` and
`<!-- edit N replace -->` comments mark the blocks for a script; they render as nothing.

---

## Part 1 — `constitution.md` Governance Split (AC-F12.1)

### Edit 1 — the row (both `constitution.md` and its template)

The row copies the `verification.md` row's shape, which the constitution's 1.4.0 change added to
this same table. In both files the `verification.md` row is the anchor (live file line 133,
template line 73).

<!-- edit 1 find -->
```markdown
| Slow | `verification.md` | Occasional, requires confirmation — running the `verification.md` setup skill is that confirmation; an autonomous run never edits it | User |
```

<!-- edit 1 replace -->
```markdown
| Slow | `verification.md` | Occasional, requires confirmation — running the `verification.md` setup skill is that confirmation; an autonomous run never edits it | User |
| Slow | `ship.md` | Occasional, requires confirmation — running `/ship-setup` is that confirmation; an autonomous run never edits it | User |
```

### Edit 2 — the Changelog entry (`.claude/rules/constitution.md` only)

A new minor version, as 1.4.0 was for `verification.md`. The approval is recorded here because
the implementation loop writes its own commit message (SHIP-D002's grounding). The template gets
no entry: a new project's constitution starts at its own 1.0.0 with the row already in the table,
and the template carried no entry for 1.4.0 either.

<!-- edit 2 find -->
```markdown
## Changelog

### Version 1.4.1 (2026-09-28)
```

<!-- edit 2 replace -->
```markdown
## Changelog

### Version 1.5.0 (<date of approval>)

- `ship.md` joins the slow, owner-governed layer beside `verification.md`. It lists the steps
  that ship the project's work, merges and releases included, so it changes only with the
  owner's confirmation. Running `/ship-setup` counts as that confirmation; an autonomous run
  never edits it. `autonomy.md` makes each step it lists the owner's standing authorization for
  that act. Owner-approved, <date of approval>.

### Version 1.4.1 (2026-09-28)
```

---

## Part 2 — `autonomy.md`, both copies, one text (AC-F12.2)

Both copies are byte-identical today and must stay so (`runtime-integrity.test.sh`'s template
parity check), so each edit applies to both.

### Edit 3 — the standing authorization

Placed as its own paragraph straight after the paragraph that holds the `openPullRequest: auto`
exception, which is left word for word as it is (ruling F; its pin in
`verify-command-surface.test.js`, "autonomy.md names openPullRequest", still passes).

- **The first line is TRD §3.10's sentence, verbatim and alone on its line** (92 characters, 93
  bytes with its newline). `ship-sequencer.js` treats `autonomy.md` as amended only when it finds
  this sentence, compared with whitespace collapsed (D24). On a line of its own it also matches
  uncollapsed, and the file's roughly 92-column wrapping cannot split it.
- **The second and third lines say what it covers**, because AC-F12.2 names it: a `merge`, a
  `release` to any environment, production included, a `run`, or any other listed step.
- **It does not make a second exception.** The paragraph above says these acts "need their own
  authorization"; a `ship.md` listing *is* that own authorization, given in advance by the owner
  running `/ship-setup`. So "The one exception: with `ensemble.openPullRequest: auto` …" stays
  true as written: it is still the one case where a setting, not the owner's listing, authorizes.

<!-- edit 3 find -->
```markdown
setting. The whole pipeline unattended stays available; it just has to be **asked for**.
```

<!-- edit 3 replace -->
```markdown
setting. The whole pipeline unattended stays available; it just has to be **asked for**.

A step listed in `.claude/rules/ship.md` is the owner's standing authorization for that act.
It is the act's own authorization, given in advance by running `/ship-setup`: a listed
`merge`, `run` or `release` (to any environment, production included) needs no further go.
```

### Edit 4 — `ship-setup` is interactive by purpose

The section headed "Two skills exempt for the same reason" becomes three. `ship-setup` is written
the way the paragraph already writes `design-setup` (the skill's name; the owner invokes it as
`/ship-setup`). The paragraph is re-wrapped only because the first line grew; no other word
changes.

<!-- edit 4 find -->
```markdown
## Two skills exempt for the same reason: interactive by purpose

`packages/skills/verification-setup/SKILL.md` and `design-setup` sit beside the refine
commands. Each is invoked directly by the owner, never chained or run unattended, and sets
`disable-model-invocation: true`. It interviews the owner (one `AskUserQuestion` per topic,
offering a default) because its answers are policy only the owner holds, not something to
derive a default for.
```

<!-- edit 4 replace -->
```markdown
## Three skills exempt for the same reason: interactive by purpose

`packages/skills/verification-setup/SKILL.md`, `design-setup` and `ship-setup` sit beside
the refine commands. Each is invoked directly by the owner, never chained or run unattended,
and sets `disable-model-invocation: true`. It interviews the owner (one `AskUserQuestion` per
topic, offering a default) because its answers are policy only the owner holds, not something
to derive a default for.
```

---

## Part 3 — this repository's `stack.md` `## Issue Tracker` (D28; PRD F10's dependency)

`stack.md` is owner-governed, so the template change (SHIP-B001, `stack.md.template`) ships to
new projects while this repository's own file waits for approval like the rest. The text copies
the template's section as SHIP-B001 wrote it on 2026-11-07, with the two values filled; if that
section's wording changes before SHIP-D002 runs, copy the template's current wording and keep
these values. It sits where the template puts it: after `## MCP Integrations`, before
`## Skill Categories`.

The values: this repository's `origin` is `https://github.com/FortiumPartners/ensemble-vnext.git`
(`git remote -v`), and `gh repo view FortiumPartners/ensemble-vnext --json hasIssuesEnabled`
returns `true` — both run 2026-11-07.

<!-- edit 5 find -->
```markdown
Additional MCP servers are project-configurable via `.mcp.json`.

---
```

<!-- edit 5 replace -->
```markdown
Additional MCP servers are project-configurable via `.mcp.json`.

---

## Issue Tracker

Where follow-ups are filed and finished work is closed. Read by `/ship-build`. Left blank, or
`none`, means no tracker: nothing is filed or closed.

Tracker: github
Project: FortiumPartners/ensemble-vnext

(`Tracker` is `github`, `linear`, `jira` or `none`. `Project` is `<owner/repo>` for GitHub, a team
key for Linear, a project key for Jira.)

---
```

---

## Part 4 — byte arithmetic

`test/integration/tests/runtime-integrity.test.sh` ("the rule files' and CLAUDE.md's byte
ceilings hold, in both copies") fails when `async-discipline.md` + `autonomy.md` exceeds
**17,000 bytes** in either `.claude/rules/` or `packages/core/templates/claude-directory/rules/`.
Both copies of each file are byte-identical, so one set of figures covers both directories.
Measured with `wc -c` on 2026-11-07, the "after" figures by applying edits 3 and 4 to copies of
the two files outside the repository:

| File (each directory) | Today | After edits 3 and 4 | Change |
|-----------------------|------:|--------------------:|-------:|
| `async-discipline.md` | 7,684 | 7,684 | 0 |
| `autonomy.md` | 8,871 | 9,159 | +288 |
| **Combined** | **16,555** | **16,843** | **+288** |
| Ceiling | 17,000 | 17,000 | — |
| **Headroom** | **445** | **157** | −288 |

Where the 288 bytes go: edit 3 adds 272 — the blank line before the new paragraph (1), the §3.10
sentence with its newline (93), and the two lines saying what it covers (178); edit 4 adds 16 —
"Three" for "Two" (2), and the list growing from "`…` and `design-setup`" to
"`…`, `design-setup` and `ship-setup`" (14). **The amendment fits: no
trim and no raised ceiling is needed.** 157 bytes remain for the next change to either file.

The PRD's risk R8 still quotes 16,995 bytes and 5 bytes of headroom; that figure predates a trim
and is stale. The TRD's 16,555 (risk R8, SHIP-D001's grounding) is current and matches the
measurement above.

The constitution and `stack.md` carry no byte ceiling; for the record:

| File | Today | After | Change |
|------|------:|------:|-------:|
| `.claude/rules/constitution.md` | 15,104 | 15,711 | +607 (edit 1: +145; edit 2: +462, measured with the `<date of approval>` placeholder — a `YYYY-MM-DD` date in both places makes it 16 bytes shorter) |
| `packages/core/templates/constitution.md.template` | 8,079 | 8,224 | +145 (edit 1) |
| `.claude/rules/stack.md` | 3,488 | 3,858 | +370 (edit 5) |

---

## What SHIP-D002 checks after applying

1. `cmp` the two `autonomy.md` copies, and the two `async-discipline.md` copies: identical.
2. `bats test/integration/tests/runtime-integrity.test.sh`: the byte-ceiling and template-parity
   tests pass. (That suite's `CLAUDE.md` ceiling already fails today, 17,160 bytes against 15,500;
   it is SHIP-D003's to fix, not this draft's.)
3. `npx jest packages/core/commands/verify-command-surface.test.js`: the `openPullRequest` pin passes.
4. `ship-sequencer.js` hands out an outward step against the amended `autonomy.md` (SHIP-D002's
   acceptance criteria).

## Deliberately not in this draft

- **`async-discipline.md`** — unchanged; the sentence belongs to `autonomy.md` alone.
- **The constitution's "Approval Requirements" list** names only `constitution.md` and `stack.md`.
  The 1.4.0 change that made `verification.md` owner-governed added it to the Governance Split
  table only, and this draft follows that precedent.
- **`CLAUDE.md`'s "Approval Requirements"** names `verification.md` beside `constitution.md` and
  `stack.md` but will not name `ship.md`. `CLAUDE.md` is not owner-governed and no task of this
  TRD edits that line; recorded as a gap in `.trd-state/ship-build/discovered.jsonl` rather than
  done here.
