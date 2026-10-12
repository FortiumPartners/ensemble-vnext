<task>
  <id>RIMG-B005</id>
  <description>/implement-trd §9.0a publishes the report by the §3.5 sequence (D10): a fresh listing when a URL is stored, the page alone plus one ISSUES line when the listing fails, otherwise the plan's batches to the one URL. /verify-build's three publish points — step 4, step 6's republish and ### Artifact link — defer to §9.0a. New assertions in verify-command-surface.test.js. Both command files in one task — merged: the two publish steps are twins and are checked as one unit. Mirror both to .claude/commands/</description>
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
  <touches>packages/core/commands/implement-trd.md, packages/core/commands/verify-build.md, packages/core/commands/verify-command-surface.test.js, .claude/commands/implement-trd.md, .claude/commands/verify-build.md</touches>
  <reuse>the `report-publish-plan` CLI (RIMG-B002); do not assemble a `files` map in prose. The check-page publish block in §9.0a (`implement-trd.md:2036-2049`) for the `files:` call shape. `/verify-build`'s existing deferral, "identical to `/implement-trd` §9.0a — read that section and follow it" (`verify-build.md:569-571`), and its habit of deferring to `/implement-trd` sections (`:118-120`, `:265`) [read]. The hand probe, [ran 2026-10-11]: a Markdown report published with `files` `{evidence/a.png, evidence/b.png}` rendered as `<img src="evidence/a.png">` and `<img src="evidence/b.png">` with both files served at those paths; a second publish to the same URL sending only `evidence/c.png` kept `a.png` and `b.png` — the listing showed all three plus `index.html`.</reuse>
  <replaces>§9.0a's bare report call (`implement-trd.md:2027-2030`), which survives only as the failed-listing branch; `/verify-build`'s `### Artifact link` report one-liner (`verify-build.md:564-567`), replaced by the deferral; step 6's "republish it under the same stored URL" (`:537`), which now points at the Artifact link section. Exactly one written report-publish sequence remains, in §9.0a [read]. — DELETE it and its tests in the same change.</replaces>
  <follow>step 4 (`verify-build.md:520-522`) already routes its per-round publish through the Artifact link section ("the same mechanism, run again each round, not a second one"); keep that wording, so every round runs §9.0a's fresh listing [read].</follow>
  <careful>- The Artifact tool refuses a `files` republish that replaces or removes a path this session has not listed or published, and sends nothing. With a stored URL, list first, every time the sequence runs; on a failed listing publish the page alone and write the one ISSUES line — never send a `files` map [read: Artifact tool contract].
  - Each later batch is its own publish to the same URL and still needs `file_path` (the report) [read: Artifact tool contract].
  - Write the listing's paths to `.trd-state/<feature>/report-published.json`, beside the Judge's payload files, and pass `--published-file`; never put JSON on the command line [read: `functional-verification.js` CLI comment].
  - Keep the `--no-verify` gate (implement-trd only), the `ensemble.publishArtifacts: false` skip and the `--chained` skip (`verify-build.md:559`) as they are; §9.0a's `--no-verify` clause does not apply to `/verify-build` [read].
  - Existing assertions in `verify-command-surface.test.js` must keep passing: §9.0a matches `/publish each selected check's page/`, `/files:/`, `/Store the returned URL back under the skill's own name/` (`:374-379`) and `/--no-verify/` (`:508-511`); the Artifact link section matches `/publish each selected check's page/` and the §9.0a deferral (`:407-411`). That last test already passes today, so the new assertion must target the report paragraph alone [read].
  - `docs/reference/implement-trd.md` and `docs/reference/verification.md` describe the old publish step; they are not in Touches and are left to `/audit-docs` [read].
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
New assertions in verify-command-surface.test.js, each failing before the change: §9.0a (up to ### 9.1) names report-publish-plan, --published-file, a listing with scope: "files", the ISSUES line "report images not updated: could not list the published artifact", and that no files map goes to a stored URL without a successful listing; /verify-build's ### Artifact link report paragraph (up to Then, under the same switch) carries "identical to /implement-trd §9.0a — read that section and follow it"; /verify-build no longer contains Artifact({ file_path: ".trd-state/<feature>/verification-report.md", icon: "check" }); step 6's republish sentence points at the Artifact link section. Guards: the existing §9.0a and Artifact-link assertions (:374-379, :407-411, :508-511) pass; the check-page publish text is unchanged (O5); both mirrors byte-identical
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
          foundBy: "RIMG-B005",
          phase: 2,
          summary: "one line, what it is",
          file: "path/to/file.js",
          evidence: "how you know"
        })'

    This is a RECORD, not a task. Do not fix it, do not expand your scope.
  </instruction>
</discovered>

You are a subagent. Do not spawn your own type with this task. Do not run git commit; the orchestrator commits at the phase checkpoint. Another implementer may be editing other files in this tree concurrently — touch only your task's files.
