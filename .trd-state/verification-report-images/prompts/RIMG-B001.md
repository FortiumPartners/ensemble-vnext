<task>
  <id>RIMG-B001</id>
  <description>renderReport: the Screenshots line, the Met-row flag, the ## Evidence section and the left-out table (D7); the embedding guard as the exported helper isEmbeddableImagePath (D8). Mirror to .claude/lib/. Kept apart from RIMG-B002 though both edit functional-verification.js — size: this change ships a byte-identity regression suite over every existing report shape; RIMG-B002 ships file-system tests (temp dirs, a symlink escape, batch arithmetic at 254) and the render-to-plan CLI chain, which needs this renderer finished. They serialize by dependency</description>
</task>

<context>
  <trd_file>docs/TRD/verification-report-images.md</trd_file>
  <strategy>tdd</strategy>
  <quality_gates>
    <unit_coverage>60%</unit_coverage>
    <integration_coverage>50%</integration_coverage>
  </quality_gates>
  <completed_tasks>none</completed_tasks>
</context>

<grounding>
  <evidence_key>
    [ran]      Someone executed this and read the output. Trust it most.
    [read]     Someone opened the file and verified the claim. Trust it.
    [inferred] Deduced, not checked. VERIFY IT BEFORE YOU RELY ON IT.
               If it turns out to be wrong, say so in your deliverables —
               the next task's grounding is probably wrong the same way.
  </evidence_key>
  <touches>packages/core/lib/functional-verification.js, packages/core/lib/functional-verification.test.js, .claude/lib/functional-verification.js</touches>
  <reuse>`escapeCell()` (`functional-verification.js:850`) for every cell and heading — statement, ids, reasons; it escapes `\` before `|` and folds `\r\n`; do not write a second escaper [read]. The must-pass gating pattern (`:953-955`): compute, then push lines only when present — that is how "byte-identical when the field is absent" is already achieved [read]. The byte-identity precedent `test('with both lists empty (or absent) the report has no Must pass line and is byte-identical'` (`functional-verification.test.js:3094`) and its `crit()`/`input()` helpers (`:3086-3092`) — but that test compares two current outputs; the golden string this task needs must be captured from the pre-change renderer [read]. The Met row is built at `:1064-1066` as `` `| ${c.id} | ${escapeCell(c.statement)} | ${escapeCell(c.artifact)} | ${escapeCell(provenAt)} |` ``: append the flag to the Artifact cell after escaping [read].</reuse>
  <replaces>nothing. No existing rendering becomes unreachable; do not change the `## Met` header or column order [read]. — DELETE it and its tests in the same change.</replaces>
  <follow>header lines are pushed Outcome, Reason, Criteria, Coverage, Must pass (conditional), then Diagnosis/Next (`:983`). Insert `**Screenshots**` after Must pass and before Diagnosis; the test that Must pass sits at Coverage + 1 stays true [read: `:3121-3123`]. `## Evidence` goes after the `## Not Verifiable` section (`:1093-1104`), before `return lines.join('\n')` (`:1106`); `/verify-build` step 6 appends `## Fix run` after the whole file, so Evidence precedes it [read: `verify-build.md:535-537`].</follow>
  <careful>- The guard is the Decision section's rule exactly: `evidence/`, segments of `[A-Za-z0-9._-]` not starting with `.`, a lower-case `.png`/`.jpg`/`.jpeg` ending. Export it as `isEmbeddableImagePath` from `module.exports` (`:1499-1517`); RIMG-B002 uses it, so do not inline a second copy [read].
  - Unrecognised-status criteria (`:891-899`) still get an Evidence block when they carry an embeddable `image` (D12: any status); decide and pin it in a test [inferred].
  - A `ui: true` criterion that is not `met` and has no image still opens the gate, so the `**Screenshots**` line can read "0 shown" with no flags. D7 states the gate that way; pin it in a test rather than leave it implicit [read: D7].
  - Alt text: the criterion id when it matches `[A-Za-z0-9._-]+`, else the word `image` — an id with `]` would break the link [inferred].
  - When a criterion carries both `image` and `imageExcluded`, `imageExcluded` wins and nothing is embedded (§3.2) [read: §3.2].
  - Purity: `renderReport` does no file I/O; keep it so. Update its JSDoc typedef (`:860-883`) with the three fields [read].
  - **Collision:** RIMG-B002 edits the same two files and the same mirror; they serialize by its declared dependency. RIMG-D001 edits only the parent TRD [read].</careful>
  <instruction>
    This grounding was established by reading the codebase during TRD authoring.
    Treat it as findings you already own, not as suggestions:

    - Do NOT reimplement anything named in <reuse>. Import and use it. If it genuinely
      does not fit, say so in your deliverables and explain why — do not silently
      build a parallel path.
    - If <replaces> names something, DELETE it and its tests in the same change.
    - <follow> names an existing pattern in this repository. Match it.
    - Weigh each line by its evidence marker. An [inferred] claim is the author's reasoning — check it first.
    - If the grounding turns out to be wrong or stale, report the discrepancy in your deliverables.
  </instruction>
</grounding>

<decision>
The Judge picks, clears and records one image per criterion in the iteration where it rules
that criterion; the renderer embeds it by a path relative to the report; the publish step sends
exactly what the rendered report embeds.

- **Where the image comes from.** The criterion's artifact when it is itself a png/jpg/jpeg (a
  judge-only criterion); otherwise the claim's new optional `screenshot`, which the Exercise
  agent attaches for every criterion about UI. A video contributes a frame grab, never the video.
  Most criteria are proven by a text artifact, so without `screenshot` nearly every UI criterion
  would be flagged.
- **Paths, no copying.** The evidence directory is always `<report dir>/evidence`, so `image` is
  written as `evidence/<path under the evidence directory>` and the on-disk report resolves it
  as is. An image anywhere else is `imageExcluded: "outside the evidence directory"`. There is no
  staging step, no `report-images/` folder and no `.gitignore` change.
- **Carried, never re-picked.** `image`, `ui` and `imageExcluded` travel through the Judge's
  return, the script's settled map, the resume seed and the state file exactly as `cause` does.
  A settled criterion keeps the image chosen when it was ruled. Nothing re-selects an image from
  a settled criterion's artifact path.
- **The Judge never sees the contract**, so these two sentences are written word for word into
  both the contract and the Judge prompt, and a test checks they match:
  - KS-1: "An image that shows a password, token, key or other credential value is never cited as a criterion's image; one that cannot be cleared is recorded as excluded, with the reason."
  - KS-2: "A criterion is about UI when it names a screen, element, layout or visual state, or its Tier 1 is judge-only for a visual property."
- **Publishing.** `report-publish-plan` reads the image references the report embeds and returns
  `files` batches of at most 254 entries, removal `null`s first; each batch goes with the page to
  the one stored URL. With a stored URL the command first lists the artifact's files, freshly,
  every time it publishes; if that listing fails it publishes the page alone, as today, and
  reports one ISSUES line. It never sends a `files` map without a listing. `/verify-build`
  follows `/implement-trd` §9.0a for this sequence rather than restating it.
- **Rejected:** a staging copy, because the evidence directory already sits beside the report;
  size and count limits enforced in the library, because a refused publish is already a one-line
  failure; the asset store, because the 2026-10-11 probe showed a Markdown page serves its
  `files` map at the referenced paths.

---
</decision>

`<decision>` is NOT prior art. It is the approach chosen for THIS change and may describe behaviour that does not exist yet — the task next to yours may be creating it. Follow it as a constraint. If your task would contradict it, stop and report that rather than proceeding. The TRD's §1.2 Key Technical Decisions table (D1–D15) and §3 Technical Specifications in docs/TRD/verification-report-images.md carry the full detail — read the parts your task cites.

<scope_discipline>
  <instruction>
    Implement what the task asks for. Do NOT add delivery machinery — feature flags,
    rollout phases, migration scaffolding, guard infrastructure, eval gates, config
    toggles — unless the task or the TRD explicitly calls for it and names the
    objective it serves. If you believe such machinery is genuinely needed, report it as a
    finding; do not build it on your own judgment.
  </instruction>
</scope_discipline>

<scope_boundaries>
  <non_goals>
## 8. Non-Goals (Scope Boundaries)

| Source | Non-Goal | Rationale |
|--------|----------|-----------|
| owner instruction, O1 | Embedding every capture, or more than one image per criterion | "One image per criterion, the one cited as its proof, not every capture" |
| owner instruction, O5 | Any change to the check-role skills' pages, triggers or publish calls | preserved behaviour |
| owner instruction, O5 | Any change to outcome logic or must-pass handling; an imageless UI criterion still counts as met | preserved behaviour; consistent with verification-must-pass D14 |
| investigation, "not absorbed" | Making the tracked report's images resolve on another clone | `.trd-state/*/evidence/` is gitignored (`.gitignore:78`). With no staging copy, the tracked report's `evidence/` links resolve only in the working tree that ran the loop; the published artifact carries the images and is the shared record |
| investigation | Re-checking the consuming project's screenshot counts | motivating evidence, not a requirement |
| adversarial review 2026-10-11, finding 9 | Carrying a sweep run's `screenshot` into the core feature's live-evidence record (`verify-build.md:168-177` records only `artifact`) | Not trivial, so Non-Goal rather than carried: `live-evidence.js record` has no image field, and a swept image lives under `.trd-state/<slug>-sweep/evidence/` (`verify-build.md:160-162` with `:282`), outside the core run's evidence directory, where D2 would exclude it anyway. A swept UI criterion reused in the core run is flagged "proven without a screenshot" unless the core run captures one |
| adversarial review 2026-10-11, finding 4 | Enforcing the Artifact platform's size and count limits in the library | a publish the platform refuses is the existing one-line failure (§3.7) |
  </non_goals>
  <instruction>
    If the task requirements or your implementation approach would address any
    non-goal item, STOP and report the scope conflict.
  </instruction>
</scope_boundaries>

<objective>
Each of these fails before the change: a fixture whose criterion carries image: "evidence/FS-1/shot.png" renders exactly one ![FS-1](evidence/FS-1/shot.png) in ## Evidence, and a criterion with only a text artifact renders none; a met ui: true criterion with no image renders  — UI criterion proven without a screenshot in its Met row and is named on the Screenshots line, while the same criterion with an image, and a non-UI criterion with none, are not; an imageExcluded criterion renders no image and appears in the left-out table with its reason; image values evidence/../x.png, /abs/evidence/x.png, report-images/x.png, evidence/a b.png, evidence/x.PNG and evidence/x.gif are not embedded and are listed as "not an embeddable image path"; isEmbeddableImagePath is exported and unit-tested on the same cases; a statement containing | and a newline does not break its Evidence heading. Guards, which pass before and after and fail only if the change leaks: every existing renderReport test passes unchanged; a golden string, rendered by the pre-change renderer from a fixture that reaches every section and committed before the renderer is edited, still equals the output for that fixture with no new fields, and with ui: false, image: null, imageExcluded: null on every criterion; the Must pass line still sits at Coverage + 1. Coverage of changed lines ≥ 60%; mirror byte-identical
</objective>

<skills>
  <matched>jest</matched>
  <instruction>
    You MUST invoke each listed skill using the Skill tool BEFORE writing code.
    Extract concrete rules from each skill and apply them. In your deliverables, report:
    - SKILLS_USED: exact skill names invoked (or "none available")
    - RULES_APPLIED: 1-2 concrete rules per skill that influenced your code
  </instruction>
</skills>

<strategy_instructions>
Strategy is: tdd

- **tdd** — write the failing test and the minimal fix within this task; do not add
  beyond what the test requires, and do not refactor.

Note: no separate RED stage runs before you. Write the failing test YOURSELF, in this same task, confirm it fails, then write the fix.
</strategy_instructions>

<deliverables>
1. Implementation complete per objective
2. Every file changed, with paths
3. Tests written
4. Brief outcome summary
5. Anything deleted under <replaces>, named explicitly — or a statement that <replaces> was empty
6. Any [inferred] grounding you checked, and what you found
7. Scope compliance confirmation (no non-goal work performed)
8. Skills used and rules applied
</deliverables>

<check_battery>
  <unit>npx jest {paths this task touches that Jest can run}</unit>
  <shell>shellcheck {changed .sh files, if any}</shell>
  <!-- typecheck and lint are empty for this project. Do not invent commands for them. -->
  <mirror>Mirrors must be byte-identical: cmp each changed packages/core/{lib,workflows,commands,contracts} file against its .claude/ copy. Never replace a packages/full symlink with a copy.</mirror>
  <instruction>
    Run the commands above against files you changed. On failure, debug it yourself
    (5 Whys, fix, re-run) before returning — do NOT return status "failed" on the first
    red run. Only report "failed" if the battery is still red after you've genuinely tried.

    NEVER run a live, model-spending check — anything that starts `claude` sessions, e.g.
    `test/smoke/run-smoke.sh` or `claude -p`. Report such a check "not run".
  </instruction>
</check_battery>

<discovered>
  <instruction>
    If you find work this task does not cover -- a bug outside your scope, stale grounding,
    a gap nobody planned for -- RECORD it and carry on with your own task:

      node -e 'require("./.claude/lib/discovered").record(
        ".trd-state/verification-report-images", {
          kind: "bug",            // bug | scope-conflict | stale-grounding | gap | risk
          foundBy: "RIMG-B001",
          phase: 1,
          summary: "one line, what it is",
          file: "path/to/file.js",
          evidence: "how you know"
        })'

    This is a RECORD, not a task. Do not fix it, do not expand your scope.
  </instruction>
</discovered>

You are a subagent. Do not spawn your own type with this task. Do not run git commit; the orchestrator commits at the phase checkpoint. Another implementer may be editing other files in this tree concurrently — touch only your task's files.
