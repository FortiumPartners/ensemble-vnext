<task>
  <id>RIMG-B003</id>
  <description>verify-functional.js: screenshot on EXERCISE_SCHEMA and the Exercise return spec (D14); image, ui, imageExcluded on JUDGE_CRITERION_SCHEMA, the Judge return spec, the settled-map fold, the resume seed, and STEP 4's and STEP 5's key lists (D15); the STEP 2 selection-and-clearance rule with KS-1 and KS-2 written in verbatim (D2, D3, D13). Depends on RIMG-B004 because its shared-sentence test reads the contract file. Mirror to .claude/workflows/</description>
</task>

<context>
  <trd_file>docs/TRD/verification-report-images.md</trd_file>
  <strategy>tdd</strategy>
  <quality_gates>
    <unit_coverage>60%</unit_coverage>
    <integration_coverage>50%</integration_coverage>
  </quality_gates>
  <completed_tasks>RIMG-B001, RIMG-B004</completed_tasks>
</context>

<grounding>
  <evidence_key>
    [ran]      Someone executed this and read the output. Trust it most.
    [read]     Someone opened the file and verified the claim. Trust it.
    [inferred] Deduced, not checked. VERIFY IT BEFORE YOU RELY ON IT.
               If it turns out to be wrong, say so in your deliverables —
               the next task's grounding is probably wrong the same way.
  </evidence_key>
  <touches>packages/core/workflows/verify-functional.js, packages/core/workflows/verify-functional.test.js, .claude/workflows/verify-functional.js</touches>
  <reuse>how `cause` was threaded through, which is the exact shape needed: the vocabulary written into STEP 2 (`verify-functional.js:540-556`), STEP 4's key list (`:587-588`), STEP 5's list (`:622-623`), the Return spec (`:641`), the schema enum (`:772-785`) and its diff test against the library (`verify-functional.test.js:2430-2447`) [read]. Carry-through precedents: `'carries cause through a resume…'` (`:2475`) and `'folds a non-met cause from this iteration's Judge return into the settled map and the final result'` (`:2495`) [read]. `EVIDENCE_DIR` (`:126`) is already in scope; `STATE_DIR`'s string derivation (`:176`) is the precedent if the report's directory is ever needed [read].</reuse>
  <replaces>nothing. The 1.0.0 plan's `stage-report-images` call in STEP 5 and its no-restage sentence for the reconcile prompt are withdrawn: the reconcile prompt's "Leave every other key exactly as it is" (`:1084`) already keeps the new keys, so do not edit `reconcileOutcome` (`:1068-1098`) [read]. — DELETE it and its tests in the same change.</replaces>
  <follow>append each new key after the last existing one in its list; never reorder. Existing regexes pin today's order: `/"id", "status", "tier1", "artifact", "reason", "cause",\s+"provenAt"/`, `/artifact, reason, cause, provenAt, attempts, blocker/`, `/"id","status","tier1","artifact","reason","cause","files"/` (`verify-functional.test.js:2448-2473`) [read].</follow>
  <careful>- The Judge never sees the contract: `buildJudgePrompt` (`:452-651`) has no `${CONTRACT}`; only Exercise (`:417`) and Debug (`:683`) do. Write KS-1 and KS-2 into STEP 2 verbatim; do not inject the whole contract [read].
  - The shared-sentence test reads `packages/core/contracts/functional-verification.md`, but that file is deliberately not in this task's Touches: listing it would create a file-conflict edge, which `task-graph.js` orients lexically (RIMG-B003 before RIMG-B004), contradicting the declared dependency and forming a cycle [read: `task-graph.js` header].
  - Selection belongs in STEP 2, for criteria ruled this iteration, returned in `criteria` and folded by the script (`:1414-1421`). Settled entries are copied verbatim; do not re-select an image from a settled criterion's artifact path [read: review finding 2].
  - Add the three fields to the resume seed (`:1187-1194`) and the fold. An entry carried from a state file written before this change has no image fields; leave it so (it renders as today, unflagged) — do not backfill [inferred].
  - The `evidence/` form assumes the evidence directory sits beside the report, which all three callers satisfy (`implement-trd.md:1795`, `verify-build.md:282`, and the sweep run at `verify-build.md:160-162`, which reuses `:282`'s `.trd-state/<feature>/evidence` template with `feature: "<slug>-sweep"`). State the prefix to strip as `${EVIDENCE_DIR}/`; an absolute path to the same place counts as inside [read; inferred for absolute paths].
  - Source constraints: no `require`, no `fs.`, no `Date.now()`/`Math.random()`/argless `new Date()`, and the word "TRD" nowhere in the source, comments included (`verify-functional.test.js:94-122`) [read].
  - `verify-functional-trd-sync.test.js:70` counts exactly 25 `a.*` reads; this task adds none [read].
  - `reconcileClaims` already passes `screenshot` through (`:917-918`) and `check-evidence` ignores it (`functional-verification.js:127`); no change is needed there [read].
  - The `implement-trd.md:1777-1778` sentence "A `met` criterion carried forward … keeps its artifact and `provenAt`" stays true; it is RIMG-B005's file, so leave it [read].
  - **Collision:** no other task touches these files.</careful>
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
In verify-functional.test.js, each failing before the change: (a) a source-level test, by the cause-enum extraction technique (:2430-2447), that EXERCISE_SCHEMA's claim item declares screenshot (string or null) and JUDGE_CRITERION_SCHEMA declares image (string or null), ui (boolean) and imageExcluded (string or null), both still additionalProperties: false; (b) the captured Exercise prompt's return spec names "screenshot"; the captured Judge prompt's Return spec reads "files","image","ui","imageExcluded", STEP 4's list "provenAt", "image", "ui", "imageExcluded", STEP 5's attempts, blocker, image, ui, imageExcluded, and the prompt names the evidence/ form and the reason "outside the evidence directory"; (c) KS-1 and KS-2 each appear, whitespace-flattened, in both packages/core/contracts/functional-verification.md and the captured Judge prompt; (d) the iteration-1 Judge returns FS-1 met with image: "evidence/FS-1/shot.png", ui: true while FS-2 stays not_met (remediate), and the run exits at iteration 2: the iteration-2 Judge prompt's settled list — what STEP 5 copies into the report input — carries FS-1's image and ui unchanged, and result.criteria carries them too; (e) a resume entry carrying image, ui, imageExcluded reaches the Judge prompt's settled list unchanged. Guards: the source-level constraints (:94-122), verify-functional-trd-sync.test.js (still 25 a.* reads), every existing prompt regex, mirror byte-identical
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
          foundBy: "RIMG-B003",
          phase: 2,
          summary: "one line, what it is",
          file: "path/to/file.js",
          evidence: "how you know"
        })'

    This is a RECORD, not a task. Do not fix it, do not expand your scope.
  </instruction>
</discovered>

You are a subagent. Do not spawn your own type with this task. Do not run git commit; the orchestrator commits at the phase checkpoint. Another implementer may be editing other files in this tree concurrently — touch only your task's files.
