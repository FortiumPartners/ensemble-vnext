# Docs-audit contract

**This is the complete, binding instruction set for reviewing a document against the code.**
It is deliberately separate from `audit-docs.md` (the command) and `audit-docs.js` (the
workflow): a reviewing agent re-caches everything in its context on every turn, and the
command carries orchestration, branching and readout prose no reviewer uses. Same pattern
as `trd-authoring.md` and `prd-authoring.md`.

If you are reviewing a document, read this file and nothing else from the command layer.
The workflow prompts cite the section headings below by name.

**The question this contract asks is the as-built question:** is what this document says
true of the code as it stands now? It is not the pre-build question `/audit-prd` and
`/audit-trd` ask (is this buildable, does it match its source). Those audits are not reused.

**Agents never delete files and never run git write commands** (`git rm`, `git commit`,
`git checkout`, `git reset`, `git stash` and the like). You edit the one document you were
given, in place, and return a record. A removal is only ever *proposed*, with a reason;
the library checks references across the whole repository and performs it.

---

**The ten sections, in the order below:**

1. Correct or cut: per section, rewrite what is wrong, remove what does not exist, leave what is valid.
2. No banners: never add a superseded, archived or deprecated marker to a document.
3. Absence must exhibit its search: a "does not exist" verdict carries the searches that were run.
4. Missing paths: check the assembly's history table before calling a missing path drift.
5. Other repositories: report, never correct, a claim about code that lives elsewhere.
6. PRD procedure: per requirement, built as stated, built differently, or not built.
7. TRD procedure: tasks, decisions and specifications against the code; the Status field against delivery.
8. Loose-doc procedure: prose that describes the system, and files that are not text.
9. Where this lives in the code: the coarse code map every reviewed document carries.
10. What you return: the record the workflow reads back.

---

## Correct or cut

Implements AC-F7.1 and AC-F7.2.

Go through the document one section at a time. For each section, exactly one of three things
is true, and you do exactly that one thing:

| What the code shows | What you do |
|---------------------|-------------|
| The section says something different from what the code does | Rewrite it to what the code shows (a **correction**) |
| The section describes something that does not exist | Remove it (a **cut**) |
| The section is true | Leave it alone, including its wording and its formatting |

Rules that follow from this:

- A document stays with whatever valid content remains, however little. One valid section
  is a document. Do not propose removal while anything valid is left.
- When nothing valid remains, do not delete the file and do not blank it. Set the outcome
  to `remove-proposed`, give the reason in one line, and the library takes it from there.
  Say "nothing valid remains" and mean it: you have been through every section.
- Never move content into another document, and never merge two documents (NG2). If a
  decision is still in force it is valid content, so its document stays.
- Do not restyle, reflow or improve prose that is true. Each edit must trace to a claim
  the code contradicts or does not support.
- A correction states what the code does now, in the document's own register. It does not
  narrate the change ("this used to say...").
- Record every correction (section and what changed) and every cut (section and why) in
  your return. One line each.
- If the document has a version table or changelog, it is content like any other: a row
  describing a past revision is history and stays; do not add a row for this review.

## No banners

Implements AC-F7.6 and NG3.

Never add a banner, header, status line or note that marks content as superseded, archived,
deprecated, outdated or stale: not at the top, not on a section, not in a blockquote. A
marker is not a correction and not a cut, and it leaves the false statement in the tree for
the next agent to read as true. Correct it or cut it instead.

This governs what you may **add**. A correction that says the *code* deprecates something
("the `--legacy` flag is deprecated in favour of `--compat`") is a true statement about the
code and is fine. What is forbidden is a line whose subject is the document itself or a
section of it. The library inspects every edited document's diff for such lines and reverts
the whole document if it finds one, so a banner costs you all your other corrections too.

Existing markers already in a document are existing content: judge them like any other
claim. Do not add, and do not rely on, the absence of a new one.

## Absence must exhibit its search

Restated from the audits' reconcile rule (the `CNV` block in `audit-trd.js`); keep the
wording consistent with it.

An absence claim is a finding that rests on something NOT being there: "not implemented",
"no source", "nothing in the code", "this path does not exist". It is only as good as the
search behind it, and a search that was wrong finds nothing in exactly the same way a
correct search does.

- Any absence verdict MUST carry the commands you actually ran and their output. Not "I
  looked": the literal patterns and paths.
- An absence finding that does not exhibit its search is a hypothesis. Do not cut on it.
- One whose exhibited search is too narrow to be conclusive is also a hypothesis: one
  exact-name grep in one directory does not establish that a capability is unbuilt. Real
  code uses different names than the document does. Search for the concept, the likely
  renames, the symbol and the file name, and across directories.
- If you cannot make the search conclusive, leave the content in place and note the doubt in
  the record. A wrongly cut valid section is worse than a stale one left standing.
- The apply agent (Opus depth) rejects an absence verdict from a verifier that does not
  exhibit its search, or whose search is too narrow, and leaves that ground unchanged.

## Missing paths

Implements AC-F7.7.

A path a document names that no longer exists is not automatically drift. The assembly gives
you a history table: for each path-shaped token the document names that does not exist at
HEAD, whether it ever existed in this repository (with its last commit) or never did.

Use it before you call anything drift:

| History table says | Meaning | What you do |
|--------------------|---------|-------------|
| Existed, last commit given | It was moved, renamed or removed | Find where it went (`git show` the last commit, search for the new home) and correct the reference, or cut the claim if the thing is gone |
| Never existed in this repository | A typo, an unbuilt plan, or another repository's path | Apply Other repositories before anything else |
| Exists at HEAD | The extractor over-matched | Ignore; nothing to do |

Do not run your own history search to replace the table; use it, and add to it only when it
does not cover a token you care about. Never treat a missing path as proof the whole claim
is false: the behaviour may live at a new path.

## Other repositories

Implements AC-F12.1 (decision D20).

A claim that names a path that never existed in this repository's history (the table above)
**and** that you read as belonging to another repository is reported and left exactly as
written. It is not corrected, not cut and not counted as drift. Return it under
`crossRepo` with the claim and the path.

Both conditions are required. A never-existed path that does not plausibly belong to
another repository (a plan nobody built, a typo) is not shielded by this rule: it is an
unbuilt or wrong claim and goes through Correct or cut like any other. When unsure which it
is, say why in the record; do not default to "other repository".

## PRD procedure

Implements AC-F4.1, AC-F4.2 and AC-F4.3.

For every requirement and every acceptance criterion in the PRD, decide one of three
outcomes against the code, using the searches Absence must exhibit its search requires:

| Outcome | Meaning | What you do |
|---------|---------|-------------|
| Built as stated | The code does what the requirement says | Leave it |
| Built differently | The code does something else, or a different amount | Correct the requirement to what is built (AC-F4.2), via Correct or cut |
| Not built | Nothing in the code implements it | **Leave it in the document** and report it under `unbuilt` with its id and statement (AC-F4.3) |

A requirement that is not built is the one place Correct or cut does not cut: a PRD
requirement states what the owner wants, and wanting it is not stale. Surface it so the
owner decides; do not remove it, and do not mark it.

Non-goals, rulings and decision tables are checked as claims only where they assert
something about the code; an owner's decision on what to build is not contradicted by code
that has not caught up.

## TRD procedure

Implements AC-F5.1 and AC-F5.2 (decision D19).

You are given a TRD that has already been judged reviewable. TRDs with no implementation
work, or whose work is clearly in flight, never reach you; do not second-guess that.

1. Take the tasks from the assembly's parse of the TRD, not by re-reading the table
   yourself. Check each task against the code: is the work it names there?
2. Check decisions and specifications against the code. A decision describing a mechanism
   the code does not use is a correction; one describing something not built is a cut.
3. Check the Status field. If it disagrees with what was delivered, correct the existing
   field in place and record `statusCorrection` (from, to). This corrects a field that is
   already there; it never adds a banner or a new field (see No banners).
4. Content that describes something not built is cut, per Correct or cut. A TRD with
   nothing valid left is proposed for removal, not deleted.
5. Keep the code map in step (see Where this lives in the code). For a TRD, the assembly
   seeds it from the union of the TRD's `Touches` blocks; check it like any other claim.

## Loose-doc procedure

Implements AC-F6.1 and AC-F6.2 (decision D18).

A loose doc is any file under `docs/` that is not a PRD or a TRD. You are given one file.

- **Prose that describes the system** (runbooks, guides, architecture notes): check its
  claims about the current system against the code and handle them by Correct or cut
  (AC-F6.1). It carries a code map.
- **Other prose** (reports, logs of past runs, meeting notes): it describes the past, and
  the past is not wrong. Check only claims it makes about the current system. Do not
  rewrite history, and do not add a code map.
- **Files that are not text** (images, data files): judge keep or remove. You never correct
  one (AC-F6.2). Propose removal only when it is no longer helpful, and say what you
  checked; the library's reference check still has the last word, because a file that
  looks dead may be read by CI or by tests.
- Files marked `generated` (the indexes) are not reviewed.

## Where this lives in the code

Implements AC-F8.1 and AC-F8.2 (decision D13).

Every reviewed PRD, TRD and system-describing loose doc carries a coarse map into the code
(AC-F8.1). Not line numbers: those go stale at once. The format is fixed so the index can be
built from it without a model:

```
## Where this lives in the code

- `packages/core/lib/` - the deterministic modules the command runs
- `packages/core/workflows/audit-docs.js` - the review workflow
- `parseTrd` - task and `Touches` extraction
```

Rules:

- The section heading is exactly `## Where this lives in the code`.
- Each bullet starts with a backticked directory, module file or symbol, then a short gloss.
- No line numbers and no `file:line` references, anywhere in the section.
- Name where the behaviour the document describes is implemented, at the coarsest level
  that is still useful to someone searching: a directory when a directory carries it, a
  file when one file does, a symbol when it is one function.
- A review corrects the map with the rest of the document (AC-F8.2): every entry must name
  something that exists, and an entry that does not is corrected or cut like any claim.
- If the document has no map, write one. If it is missing after your review, the library
  reports a map defect.

## What you return

The workflow reads these fields back, as the document's record. Return every one; use an
empty list or null when nothing applies.

- `path`: the document's path as given, unchanged.
- `class`: `prd`, `trd` or `loose`, as given.
- `depth`: `opus`, `sonnet` or `none`, as given.
- `score` and `scoreReason`: as given by the scorer, or null.
- `outcome`: one of `unchanged` (you made no edit), `edited` (you made corrections or
  cuts), `remove-proposed` (nothing valid remains, or a non-text file should go), `kept`
  (a non-text file stays), `not-reviewed` (a TRD skipped under D19, or no review ran),
  `failed` (you could not complete the review).
- `corrections`: one entry per correction, the section and what changed.
- `cuts`: one entry per cut, the section and why.
- `unbuilt`: PRD only; one entry per requirement not built, its id and statement.
- `statusCorrection`: TRD only; the Status value before and after, or null.
- `crossRepo`: one entry per claim about another repository, the claim and the path.
- `removeReason`: the one-line reason when the outcome is `remove-proposed`, else null.
- `mapWritten`: true if you wrote or changed the code map.

Report what you did, not what you intended. An edit you started and did not finish is
`failed`, not `edited`.
