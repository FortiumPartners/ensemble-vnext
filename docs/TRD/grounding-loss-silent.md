# TRD: grounding-loss-silent

**Source PRD**: None — defect

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | Content inside a fenced code block is never parsed as TRD structure | the reproduction below |

## Reproduction

### Steps

Pure parser call; nothing on disk is touched. The example markdown is BUILT FROM STRINGS
rather than written as a literal fenced block — deliberately, because a literal one would
trigger this very defect inside this document:

```bash
node -e '
const { parseTrd } = require("./packages/core/lib/trd-parser");
const H   = "#".repeat(2) + " Master Task List";
const hdr = "| Task ID | Description | Serves | Dependencies | Acceptance Criteria |";
const sep = "|---|---|---|---|---|";
const md = [
  "# T", "", "**Source PRD**: None", "",
  "## Example", "", "```markdown",
  H, "", hdr, sep, "| FAKE-001 | inside a fence | O1 | None | y |", "```", "",
  H, "", hdr, sep, "| REAL-001 | the actual task | O1 | None | y |", ""
].join("\n");
console.log(parseTrd(md, { path: "t" }).tasks.map(t => t.id));
'
```

### Actual

Prints `[ 'FAKE-001' ]`. The table inside the fenced block is read as the Master Task List;
`findSection` uses `strategy: "first"`, so the fenced example wins over the real section.

**Measured on this very TRD.** An earlier draft wrote its reproduction as a literal fenced
markdown example containing `FIX-001` / `FIX-002`. `parseTrd` returned those as the task
list — the real tasks were never seen. The mechanical audit caught it only because the
fenced example happened to cite a path that does not exist.

### Expected

Prints `[ 'REAL-001' ]`. Content inside a fenced block is illustration, not structure: no
heading, table row or grounding bullet within a fence is parsed as any part of the TRD.

## Decision

Skip fenced regions in ONE pass over `lines`, before any section or table parsing — not
inside each parser separately. `findSection`, the task-list reader and `parseGrounding` all
walk the same array, so a single fence-aware pass fixes every consumer and cannot drift
between them.

Do NOT "fix" this by switching to `strategy: "last"`. It would happen to work here because
the real section follows the example, but it is the wrong rule: a fenced example placed
AFTER the real section would then win instead. The defect is that fenced content is read at
all, not which copy wins.

## Non-Goals

- Changing `strategy: "first"` semantics for callers that legitimately want the first match.
- The missing-grounding warning — a real, separate defect found during this investigation and
  recorded to the discovered channel for its own run. Folding it in would put two unrelated
  fixes in one change.
- Indented four-space code blocks. Only fenced blocks are in scope; no TRD here uses indented
  ones, and widening the rule risks eating list continuations.

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| GLS-001 | Make the line scan fence-aware so nothing inside a fenced block is parsed as TRD structure | O1 | None | The reproduction prints `[ 'REAL-001' ]`; re-parsing every TRD in this repo changes no task or grounding count |
| GLS-002 | Add tests for fenced headings, fenced task rows and fenced grounding bullets | O1 | GLS-001 | Each fails against the pre-fix parser and passes after |

## Task Grounding

### GLS-001
- **Touches:** `packages/core/lib/trd-parser.js`
- **Reuse:** every consumer walks the same `lines` array — `findSection`, the task-list reader and `parseGrounding` — so ONE fence-aware pass serves all three [ran]
- **Replaces:** nothing is deleted; this adds a filter and changes no section's semantics [ran]
- **Careful:** line INDICES must stay stable. `findSection` returns `{start, end}` used to slice `lines`, so MASK fenced lines rather than removing them, or every index shifts [ran]
- **Careful:** track fence LENGTH, not just presence — a ````-delimited block may legally contain ``` ones. `packages/core/scripts/lint-command-structure.js` already does this correctly; match it [read]
- **Careful:** `.claude/lib/trd-parser.js` is a mirror COPY, not a symlink — both must change or the vendored runtime keeps the bug [ran]

### GLS-002
- **Touches:** `packages/core/lib/trd-parser.test.js`
- **Reuse:** the existing 50 tests establish the fixture style [ran]
- **Replaces:** nothing [ran]
- **Careful:** build fixtures by joining strings, never by writing a literal fenced heading, or the test file trips the defect it is testing [ran]

## Could Not Verify

- **Whether any TRD here currently depends on fenced content being parsed.** Unlikely — it
  would mean a document whose real task list lives inside an example — but GLS-001's
  acceptance criterion re-parses every TRD in the repo and compares counts, which settles it.
- **The missing-grounding warning defect**, found during this investigation and deliberately
  excluded. A task with no grounding block emits no warning at all, on any of three routes.
  Recorded to `.trd-state/grounding-loss-silent/discovered.jsonl`.
