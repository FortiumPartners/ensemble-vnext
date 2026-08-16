# ITR-P001 — Sunstone reference read

**Task:** ITR-P001 (`docs/TRD/implement-trd-rework.md`). **Serves:** AC-F1.8, D2, R3.
**Date:** 2026-08-16.

## Provenance

| Field | Value |
|---|---|
| Repo | `https://github.com/Sunstone-Partners/ensemble.git` |
| Clone path | `/Users/james/.claude/jobs/e42e6763/tmp/sunstone/ensemble` (scratch, outside this working tree) |
| Commit read | `b2ef8cafe5ad2fe997ffa7451d7a86ac847e8f96` — "Merge pull request #27 from Sunstone-Partners/docs/fold-claude-md", Fri Aug 14 13:03:22 2026 -0500 |
| Clone modified? | **No.** `git status --porcelain` returned empty after the read; HEAD unchanged. The one script written during this task (`probe.js`) lives in the job tmp dir, not in the clone. |
| Depth | `--depth 50` |

All line citations below are `<path>:<line>` **within the clone at that commit**.

### Where the modules live

- `packages/development/lib/trd-parser.js` (1046 lines) — byte-identical to `packages/full/lib/trd-parser.js`.
- `packages/development/lib/trd-graph.js` (339 lines) — **only in `development`. `packages/full/lib/` has no `trd-graph.js`.** It is a development-time analysis tool, not shipped runtime.
- `packages/development/lib/cross-trd-deps.js` (97 lines) — byte-identical to `packages/full/lib/cross-trd-deps.js`.
- Test coverage: `packages/development/tests/trd-parser.test.js` (79 `it(` cases), `packages/development/tests/trd-graph.test.js`, `packages/development/tests/cross-trd-deps.test.js`.

---

## R3 verdict — answered first, because it decides everything else

**R3:** does the reference parser demand a TRD *format* that `/create-trd` does not produce?

**Verdict: YES, totally — and the reference does not solve the format-disagreement problem. It has the same problem, in its own repository, worse, and silently.**

### Evidence 1 — the reference parser extracts zero tasks from all three of our TRDs

Running the clone's `parseTRD` unmodified against this repo's real TRDs:

```
implement-trd-rework.md:      tasks=0  warnings=["No \"## Master Task List\" heading found …", "No tasks found in the TRD"]
discipline-judgment.md:       tasks=0  warnings=[same]
_workflow-test-stop-hook.md:  tasks=0  warnings=[same]
```

Three independent causes, each fatal on its own:

1. **Task shape.** `trd-parser.js:67` — `TASK_LINE_RE = /^(\s*)- \[[ xX]\]\s+\*\*(TRD-[A-Za-z0-9-]+)\*\*\s*[-—–:]?\s*(.*)$/`. The reference's Master Task List is a **nested markdown checklist**, one task per `- [ ] **TRD-NNN**:` line with structured sub-bullets (`Target File:`, `Actions:`, `Implementation AC:`) parsed from the body lines beneath it (`trd-parser.js:612-687`). Ours is a **table**. A `| ITR-B001 | … |` row cannot match a `^…- \[ \]` anchor.
2. **Task ID prefix.** The same regex hard-codes the literal `TRD-`. Our IDs are `ITR-B001`. No configuration point exists; the prefix is baked into `TASK_LINE_RE`, `extractVerifies` (`:420`), `extractInlineDepends` (`:437`), `extractDependsOn` (`:589`) and `cross-trd-deps.js:5`.
3. **Heading anchors.** `trd-parser.js:378` requires `/^##\s+Master Task List\s*$/i` — an **exact, unnumbered** heading. Ours is `## 4. Master Task List`. And `trd-parser.js:74` requires `/^###\s+Phase\s+(\d+)/i` — `###` level, phase word immediately after the hashes. Ours are `### 4.2 Phase 1: …`, `### 4.1 Phase 1 — …`, `### 5.1 Phase 1 — …`. None match.

Point 3 is worth dwelling on: **the reference has exactly the bug our §3.1 already corrected at v1.1.0** (the "`### 4.N Phase N:`" rule that matched none of the three real formats on disk). Our correction — match any heading whose text *contains* `Phase <n>`, take `<n>` from the text, ignore the section number — is right, and the reference is independent evidence of the failure mode it avoids, not a counter-argument to it.

### Evidence 2 — the reference's own TRDs do not parse either, and one fails silently

The reference's `docs/TRD/` is itself format-inconsistent, and its parser is the *cause* of the inconsistency being invisible:

| Reference TRD | Master Task List shape | `parseTRD` result |
|---|---|---|
| `docs/TRD/TRD-2026-021-tiered-model-aliases.md:111` | checklist, `### Phase N:` | **40 tasks**, 4 phases, 0 warnings — the format the parser was written for |
| `docs/TRD/implement-trd-beads.md:86` | **table**, 49 rows, `## 2. Master Task List`, `### 2.1 Phase 1:` | **3 tasks, ZERO warnings** |
| `docs/TRD/ensemble-feature-command.md:69` | `### TRD-NNN:` headings under `## 2. Master Task List` | **0 tasks**, 2 warnings |
| `docs/TRD/issue-31.md` | no Master Task List | 0 tasks, 2 warnings |

The `implement-trd-beads.md` row is the important one. Its table rows are written as
`| - [ ] **BEADS-P2-LOGIC-004** | Write Step 1 (Preflight)… | 1 | BEADS-P2-LOGIC-003 | |`
(`docs/TRD/implement-trd-beads.md:116`) — a hybrid that puts a checklist marker *inside* a table cell. `TASK_LINE_RE` fails on both counts (leading `|`, non-`TRD-` prefix). The parser then found 3 unrelated `- [ ] **TRD-00N**` lines elsewhere in the document, reported `tasks = 3`, and **emitted no warning at all**, because its only two warning conditions are "no `## Master Task List` heading" (the heading existed, just numbered → actually it fell back to whole-document scope, which then *did* find the 3 stragglers) and "zero tasks found" (3 ≠ 0). Forty-nine real tasks vanished with a clean bill of health.

**Bottom line for R3:** the reference does not solve the format disagreement, does not detect it, and is itself a live instance of it. Adopting its parsing approach imports the failure. This is a **reject**, and it is the single most important finding of this read.

---

## Per-module decisions

### `trd-parser.js` — **REJECT the design; ADOPT four narrow mechanics**

**Reject — the input contract.** Checklist-with-sub-bullets, hard-coded `TRD-` prefix, exact-match headings (`:67`, `:74`, `:378`). Our D2 makes `trd-authoring.md` the format authority and our §3.1 commits to the table. There is nothing to salvage in the extraction path; it reads a different document.

**Reject — "never throws."** `trd-parser.js:831` documents the contract explicitly: *"Never throws on malformed input — problems are collected into `warnings`."* Our §3.1 throws when the Master Task List section is absent. The reference is a case study for why: silent degradation to a 3-task parse of a 49-task TRD (Evidence 2). **But note the nuance — our throw would not have caught that case either**, because the section *was* present. See "Contradictions and gaps" below.

**Reject — `addSyntheticValidationTasks` (`:744-818`).** This is the closest thing the reference has to "verify delivered output against acceptance criteria," and it is the single largest divergence from our design. It scans `## Acceptance Criteria` / `## Requirements Validation` (`:704-724`) and `### XC-N:` headings (`:726-742`), then **invents task records that were never in the TRD** — synthesizing IDs, descriptions, `dependsOn` edges, and three canned `testAc` strings (`:776-780`), then pushing them into `phases[].taskIds` (`:786`). Our §3.1 opens with *"Deterministic markdown → records, with no interpretation."* This is pure interpretation, executed inside the parser, and it means `parseTRD`'s output is not a faithful reading of the file — a downstream consumer cannot tell an authored task from a fabricated one except by the `syntheticKind` marker (`:784`, `:811`). It also breaks the property our §3.2 relies on: `tasksById` keys are no longer all TRD-declared IDs (they include raw `AC-001`, `XC-01`), so a task-ID-ordered conflict edge (D3) would be ordering against fabricated identifiers. Reject outright. If we ever want AC-derived verification tasks, that belongs in `/audit-build`, downstream, visible, and not mixed into the parse result.

**Reject — `TEST_KEYWORDS` broad matching (`:80-93`, `:600-603`).** The comment is candid: *"Intentionally BROAD: recall over precision. A false-positive synthesized test bead is cheaper to close than a missed test."* That trade is only defensible because of the synthesis path above. With no synthesis, a substring match on `'test'` is noise. `live` in our `Task` type comes from an explicit `[LIVE]` marker, which is the right shape.

**Reject — the format-detection priority ladder (`:890-904`).** `PR > Phase > Sprint > synthesize-one-phase`. Three coexisting boundary vocabularies, resolved by precedence, with a silent fallback to a synthetic single phase named `"Implementation"` (`:909`). Our design has one vocabulary (`Phase <n>`) and, per §3.1, the phase's number comes from the heading text. Do not inherit the ladder. The `sawPR/sawPhase/sawSprint` scan also demonstrates why: `prFormat` becomes a boolean the *entire downstream* branches on (`complete-beads-planner.js:317` short-circuits phase gating entirely when `prFormat` is false), so a heading-vocabulary detection miss silently disables a correctness filter.

**Adopt — `normalizeLineEndings` up front (`:96-98`, called at `:841`).** The comment at `:833-840` earns it: every heading/task regex is `$`-anchored, and JS treats a lone `\r` as its own terminator that `.` cannot consume, so CRLF input makes `$`-anchored line regexes fail to match *even though the line trims correctly* — a bug they hit twice (also in `packages/e2e-testing/lib/prd-ac-parser.js`). Our §3.1 says nothing about line endings. **ITR-B001 should normalize once at entry.** Cheap, and the failure mode is invisible-until-it-isn't.

**Adopt — duplicate-ID detection, keep-first (`:987-994`).** `warnings.push('Duplicate task id: …')` and do not overwrite. Our §3.1's error-handling list does not mention duplicate IDs. It should: with D3 orienting conflict edges by lexical task ID, a duplicated ID is not a cosmetic defect, it makes the graph ambiguous.

**Adopt — loose heading matching, but go further than they did.** `extractArchitectureDecision` (`:244`) uses `/^##\s+(?:\d+\.\s+)?Architecture/i` — it *does* tolerate the section number. `findMasterTaskListScope` (`:378`) does not. The same file is inconsistent with itself about the one thing our §3.1 explicitly commits to (*"Heading matching … is loose: any heading whose text contains the phrase, at any level, with or without a leading number"*). Our rule is right; apply it uniformly — including to the Master Task List heading, which is where the reference's inconsistency bites.

**Adapt — section-scoping before task extraction (`:375-394`, `:865`).** Slicing to the Master Task List section before scanning for task rows is correct and worth keeping: it prevents ID-shaped lines elsewhere in the document (§9 grounding blocks, prose examples, this very file) from becoming tasks. **But the fallback is wrong** — on a scope miss the reference widens to the entire document (`:384`, `:863`), which is precisely how `implement-trd-beads.md` produced three phantom tasks from prose. Adapt: scope strictly, and on a miss, throw (our §3.1 already says so) rather than widening.

**Adapt — grounding fields, only as a warning about ours.** `targetFiles` (`:463-477`) is the reference's analogue of our mandatory `Touches`, and it is extracted from `Target File:` / `Target Files:` / `File:` body lines — line-oriented, so table-blind. Same for `extractDependsOn` (`:572-594`), which matches `/^\s*-?\s*Dependencies?\s*:\s*(.+)$/` per line. Our design reads both from a grounding block and a table column respectively, so nothing transfers except the observation that they de-duplicate while preserving document order (`:574-580`) — worth doing for `dependencies`, since our §3.2 wants deterministic output.

### `trd-graph.js` — **REJECT as a model; ADOPT one algorithm**

**This module answers a different question than our §3.2.** Its nodes are **whole TRDs**, keyed on filename-derived slug (`trd-graph.js:34-37`, `:91`); its edges are **cross-TRD** references only — `buildGraph` at `:149` explicitly `continue`s on a bare `TRD-NNN`: *"bare TRD-NNN => intra-TRD dependency, not a graph edge."* Our §3.2 is a **task-level** graph within one TRD. The two are near-disjoint. Reject the model.

**There is no wave/levelisation/critical-path logic anywhere in the reference.** Grepped `packages/development/lib/*.js` and `packages/full/lib/*.js` for `waves|Kahn|criticalPath|topolog` — zero hits. Our §3.2's `waves` (Kahn levelisation) and `criticalPath` have **no reference implementation to adopt or reject**. ITR-B002 is building something the reference does not have. That is a finding: do not go looking for it, and do not assume our design is unusual because the reference lacks it — the reference simply solves scheduling elsewhere and worse (next point).

**Reject the reference's answer to file conflicts — and note it validates our D3.** The reference has file-conflict avoidance, but it is a **dispatch-time greedy filter**, not a graph edge: `complete-beads-planner.js:179-204`, `applyFileClaimFilter` walks an ordered candidate list, accumulates a `selectedClaims` set, and defers any candidate whose claims intersect it with `deferReason: 'file-claim-conflict'`. The outcome therefore depends on candidate ordering and on live bead state, not on the TRD. Our D3 orients the conflict edge by lexical task ID *"which is what makes the graph identical across runs of the same TRD."* The reference's design cannot make that guarantee, and the comment at `complete-beads-planner.js:333` records the resulting pain (*"serializing what should be parallel work"*). **Keep D3.** The reference is corroboration, not competition.

The TRD-level analogue, `findOverlaps` (`:234-254`), does compute pairwise shared-file sets, and it is the one place the reference expresses conflict declaratively. It is O(n²) over TRDs with a sorted output. Note it as prior art for a future *cross*-TRD concurrency answer — the open question CLAUDE.md flags — but it does nothing for §3.2.

**Adopt — `detectCycles` (`:190-224`).** Iterative-ish DFS with a three-state colour map and back-edge extraction off the stack, normalising each cycle by sorted membership to de-duplicate (`:209-213`), returning cycles as node-id lists. This is exactly the shape our §3.2's `cycles: string[][]` wants, and our AC-F1.6 needs the *participating task IDs* named — which this returns. Two adaptations for ITR-B002: (a) it recurses (`:213`, `dfs(next)`), fine at TRD scale but our task graphs are larger — make it explicit-stack or accept the depth; (b) our §3.2 additionally requires `waves` to cover only *the acyclic prefix*, which this does not compute — that is new work.

**Adopt — the identity-rule discipline, as a documentation habit.** `trd-graph.js:12-19` states the key choice explicitly: slug is the key because it is what refs already resolve against; `document_id` is a correlation attribute; `label` is display-only and *never* a key; duplicate `document_id`s are surfaced as warnings rather than silently merged (`:109-115`). This is the right instinct and our D3 deserves the same paragraph at the top of `task-graph.js`.

### `cross-trd-deps.js` — **REJECT for §3.1–§3.3; note for the open cross-TRD question**

Ninety-seven lines, and it solves a problem our TRD's §3.1–§3.3 does not have. `parseQualifiedRef` (`:8-15`) parses `<trd-slug>#TRD-NNN` and `<trd-slug>#PR-N`; `buildIndex` (`:25-38`) indexes *scaffold plans* (not TRDs) by slug; `resolveCrossTrdDeps` (`:70-92`) emits `blockerId`/`blockedId` edges whose IDs are **bead title prefixes** (`:84-85`) for consumption by an external issue tracker (`bd`/`bv`). Every output shape is coupled to beads. We have no beads. Reject.

**Two things to carry forward anyway:**

1. **The qualified-reference syntax is the reusable part.** `<slug>#<TASK-ID>` (`:5`), slug derived from the filename (`trd-graph.js:34-37`). If ITR ever needs cross-TRD dependencies, that syntax is worth copying rather than inventing — it is one regex, it is unambiguous against bare task IDs, and `trd-graph.js:149` shows the clean discriminator (`parsed.ok` false ⇒ intra-TRD ⇒ not a cross edge).
2. **Unresolvable refs are reported, never dropped-and-forgotten.** `resolveCrossTrdDeps` returns `{ok, edges, errors}` with a per-ref `reason` (`:78-81`), and `trd-graph.js:152-159` warns with both endpoints named. Our §3.2 error-handling already says an unknown dependency ID *"is dropped from the graph and reported; it must not make a task permanently ineligible and silently stall the run."* Same conclusion, independently reached. Keep ours; the reference confirms it.

---

## Contradictions with our §3.1–§3.3 design, and gaps this read exposes

Reported rather than silently resolved, per the task brief.

1. **§3.1's error handling does not catch the reference's actual failure — and by extension would not catch ours.** Our two guards are "no Master Task List section → throw" and "malformed table row (wrong column count) → warn". `implement-trd-beads.md` defeats both: the section exists, and the rows are *well-formed tables with a shape the parser doesn't recognise as tasks*, so there is no wrong-column-count row to warn about — the rows simply are not seen. **Recommendation for ITR-B001: add a third guard — "the Master Task List section contains table rows but zero were parsed as tasks" is an error, not silence.** Zero-tasks-from-a-nonempty-section is the exact signature of a format drift, and it is cheap to detect. This is the one concrete design change this read produces.

2. **§3.1 is silent on line-ending normalisation.** Every rule in §3.1 is stated in terms of heading text and table rows, which implies `$`-anchored line regexes. See the adopt above; the reference hit this bug twice.

3. **§3.1 is silent on duplicate task IDs.** With D3 ordering conflict edges lexically by ID, a duplicate makes the graph ill-defined. Reference behaviour (warn, keep first) is a reasonable default; the point is that our spec should state one.

4. **§3.2's `waves` and `criticalPath` have no prior art here.** Not a contradiction — a scope note. ITR-B002 is net-new; budget for it accordingly and do not expect to lift an implementation.

5. **The reference's parser is not shipped runtime for graphing.** `trd-graph.js` is absent from `packages/full/lib/`. Nothing in our TRD depends on this, but if any prior conclusion assumed the reference ships a TRD graph to scaffolded projects, it does not.

6. **Corroboration, not contradiction, for §3.1's v1.1.0 phase-heading correction.** The reference's `/^###\s+Phase\s+(\d+)/i` (`:74`) is the exact rule our v1.1.0 revision replaced. Independent evidence the revision was right.

## What NOT to adopt — one-line summary

The whole extraction contract (checklist shape, `TRD-` prefix, exact headings); "never throws"; `addSyntheticValidationTasks` and its keyword heuristics; the PR/Phase/Sprint precedence ladder; whole-document fallback on scope miss; the TRD-level graph model; dispatch-time greedy file-claim filtering; every bead-coupled output shape in `cross-trd-deps.js`.

## What to adopt — one-line summary

`normalizeLineEndings` at parser entry; duplicate-ID warn-and-keep-first; uniform loose heading matching (applied to the Master Task List heading too, which the reference itself does not do); section-scoping before task extraction with a throwing rather than widening fallback; `detectCycles`'s colour-map DFS with sorted-membership de-duplication, extended to compute the acyclic prefix; the explicit identity-rule paragraph as a documentation habit; the `<slug>#<TASK-ID>` reference syntax, banked for the open cross-TRD question.
