# Workflow run artifacts

Outputs from live `/create-trd` and `/create-prd` workflow runs, kept as the A/B baseline
for item 8's keep-or-revert call. Not TRDs for any real feature — do not implement from them.

## Run 1 — `create-trd-run1-xhigh.md` (2026-08-14)

| | |
|---|---|
| Source PRD | `docs/PRD/stop-hook-notification.md` (22 KB) |
| Output | 949 lines / 72 KB (human-written TRD for the same PRD: 849 lines / 31 KB) |
| Cost | **1,025,070 subagent tokens, 170 tool uses, 23 min** |
| Agents | 9, zero errors, 6/6 verifiers reporting |
| Findings | 11 raised, 10 applied, **0 rejected** |

Stage timings: author 634s (**47%**), ground 195s, verify 305s (6 in parallel),
reconcile 223s.

**Configuration under test:** author `xhigh` (from `technical-architect` frontmatter),
`derivation-audit` and `omission-audit` at `medium`, no model overrides.

### What it establishes

- The verify wave works end to end. Buildability found a real bug **and** proved the TRD's
  own prescribed fix was also wrong, with reproducible `jq` exit codes (4, 4, 0).
- Restored C2 (`derivation-audit`) found the single task with no PRD objective, proven by
  grep — §9.1's largest failure category, caught on `medium` effort.
- C0 (`omission-audit`) found an acceptance criterion that was structurally unreachable,
  also on `medium`.
- Zero manufactured findings across 11. Every one names a file, a line, or a command.
- The coverage floors came from `constitution.md` (60/50), not the retired 80/70 template
  values — the root-cause fix, working in a live run.

### Size is not bloat

Line-for-line the document is *leaner* than the human TRD where they overlap (Technical
Specifications 97 vs 178; Appendices 23 vs 135). The entire delta is one section the human
version lacks: `## 9. Task Grounding`, 302 lines, 42% of the document.

### Known confounds — do not treat run 1 as a clean baseline for grounding quality

The author wrote §9 Task Grounding **before** the grounding stage ran, because the command's
structure spec listed it as required. Two stages produced it, so grounding quality cannot be
attributed to either. Fixed after this run.

### Open

`0 rejected` — the reconcile prompt instructs pushing back on wrong findings. Either all 11
were correct (it claims each reproduced against the files) or reconcile rubber-stamps. One
run cannot distinguish these.

## Run 2 — pending

Changes under test: author `xhigh` → `high`; `derivation-audit` and `omission-audit`
`medium` → `high`; `citations` pinned to haiku; author no longer writes §9.

**Compare architecture and decomposition sections, not finding counts.** The wave is
findable-only and structurally cannot see decomposition quality, so that is the dimension
the author's effort drop actually risks.

Note run 1 is evidence *against* the medium→high change: both stages hit their targets on
`medium`.
