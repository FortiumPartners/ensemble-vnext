<task>
  <id>RIMG-D001</id>
  <description>Sync docs/TRD/functional-verification.md §3.6: renderReport's interface gains the three fields, and the Behavior bullets gain the Screenshots line, the Met-row flag, the ## Evidence section and the left-out table, as RIMG-B001 delivered them; add a changelog row "Synced to docs/TRD/verification-report-images.md", following that document's own convention</description>
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
  <touches>docs/TRD/functional-verification.md</touches>
  <reuse>that document's changelog convention — newest row first, opening `**Synced to \`docs/TRD/<feature>.md\` (<TASK-ID>).**`, as in the 2.8.0 row (verification-must-pass, VMP-B002) and the 2.5.0 row, which last edited §3.6's interface and Behavior; the `cause?:` entry in the §3.6 interface block (`:1026-1029`) for an added optional field's comment style [read].</reuse>
  <replaces>nothing. §3.6's closing paragraph stays true; add bullets, do not rewrite it. Do not touch §4 task rows or §9 grounding blocks, which the document keeps as the historical build record [read]. — DELETE it and its tests in the same change.</replaces>
  <follow>how the 2.5.0 change (VFIX-D002) documented `Diagnosis`/`Next` in §3.6: an interface field plus one Behavior bullet saying when it renders and that older inputs are unchanged [read].</follow>
  <careful>- The header must move with the changelog: `verify-functional-trd-sync.test.js` (`:170-187`) requires `**Version**` to equal the highest changelog version and `**Last Updated**` that row's date. Today: 2.8.0, 2026-10-06 [read].
  - §3.6 is not compared to code by the sync test; describe the layout RIMG-B001 delivered, from its code, not from D7 [read].
  - §3.3's claim shape ("Each claim is `{criterion, artifact, locator, reason}`", line 742) and §3.3a step 3's state-file key list will not name `screenshot`, `image`, `ui` or `imageExcluded` after RIMG-B003. Both already omit `cause`, neither is compared by the sync test, and this task depends on RIMG-B001 only, so they are left to `/audit-docs` [read].
  - **Collision:** no other task edits this file.</careful>
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
Each failing before the change: §3.6's interface lists image, ui, imageExcluded; a 2.9.0 changelog row naming this TRD and RIMG-D001, with Version and Last Updated moved to match. Guard: verify-functional-trd-sync.test.js passes
</objective>

<skills>
  <matched>none</matched>
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
          foundBy: "RIMG-D001",
          phase: 2,
          summary: "one line, what it is",
          file: "path/to/file.js",
          evidence: "how you know"
        })'

    This is a RECORD, not a task. Do not fix it, do not expand your scope.
  </instruction>
</discovered>

You are a subagent. Do not spawn your own type with this task. Do not run git commit; the orchestrator commits at the phase checkpoint. Another implementer may be editing other files in this tree concurrently — touch only your task's files.
