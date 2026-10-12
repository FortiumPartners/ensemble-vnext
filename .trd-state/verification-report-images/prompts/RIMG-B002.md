<task>
  <id>RIMG-B002</id>
  <description>reportPublishPlan and the report-publish-plan --report <path> [--published-file <path>] CLI (D9), using RIMG-B001's guard. Mirror to .claude/lib/. Owns the render-to-plan CLI-chain test, since it consumes RIMG-B001's renderer</description>
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
  <reuse>RIMG-B001's `isEmbeddableImagePath` for both the report scan and `remove` [read: D8]. The CLI's `resolveJsonPayload` (`functional-verification.js:1579-1590`) for how a `--file` payload is read, and the `flag = (name) => …` helper in the `must-pass-coverage` branch (`:1663-1666`) for `--report` and `--published-file` [read]. Real-path precedent: `coverEntry` in `packages/core/lib/live-evidence.js:74-85` (`fs.realpathSync`); inside-root precedent: `checkInputsCell` in `packages/core/lib/fix-audit.js:148-160` (`resolved.startsWith(absRoot + path.sep)`) [read]. CLI tests: the `describe('CLI'` temp-dir pattern (`functional-verification.test.js:1049`) with `execFileSync('node', [MODULE_PATH, …])`; pass `cwd: tmpDir` so relative sources resolve against the fixture [read].</reuse>
  <replaces>nothing is made unreachable. The 1.0.0 design's `stage-report-images` CLI, `stageReportImages()` and `report-images/` folder were never built — do not build them [read: 1.0.0 of this TRD]. — DELETE it and its tests in the same change.</replaces>
  <follow>pure half exported plus a thin CLI branch, like `mustPassCoverage` / `must-pass-coverage`, printing one JSON line via `console.log(JSON.stringify(…))`. Add the subcommand to `usage()` (`:1556-1573`) and the CLI header comment (`:1519-1553`); the new branch goes before the final `else { usage(); }` [read].</follow>
  <careful>- Every batch ≤ 254 entries, `null`s included, because every call re-sends the page as `file_path`; whether the page or a `null` counts toward the 255-file limit is untested (Could Not Verify) [read: Artifact tool limits; inferred for nulls].
  - Collect only whole `![<ID>](<path>)` lines from `## Evidence` onward, never a reference inside a cell or heading: `escapeCell` (`functional-verification.js:850-857`) folds newlines and escapes `\` and `|` but leaves `![`, `]` and `(` as written, so Judge-written free text can carry an image reference into the page, and a whole-report scan would send it [read].
  - Removals first, so a failure on a later call never leaves a withdrawn image published while new ones went up (O4) [inferred].
  - `remove` considers only listed paths the guard accepts; `index.html` and anything else not under `evidence/` are never nulled [ran 2026-10-11: the probe's listing showed `index.html` beside the images].
  - Real-path both sides: on macOS `os.tmpdir()` sits under `/var/folders`, which resolves to `/private/var/folders`, so comparing a real file path against an unresolved directory reads every image as outside [inferred from platform behaviour].
  - Batch sources are `path.join(reportDir, ref)`, relative to the working directory: the Artifact tool requires `files` sources under the working directory [read: Artifact tool contract].
  - No byte or size accounting (old D6 dropped); a refused publish is the command's one-line failure [read: review finding 4].
  - **Collision:** same files as RIMG-B001, serialized by the declared dependency, which is real: the CLI-chain test consumes RIMG-B001's renderer and guard.</careful>
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
Unit tests on the pure half, each failing before the change: for 0, 1, 254, 255 and 300 embedded images with 0 or 3 removals, every batch holds at most 254 entries, removal nulls come before any image, and the batches together hold exactly the guard-accepted references the resolver reports on disk plus the removals, nothing else; remove lists exactly the published paths the guard accepts that the report no longer references, and never index.html; a reference the resolver reports missing or outside is in rejected with that reason and in no batch; a hand-edited reference the guard refuses is in no batch; an ![x](evidence/FS-2/other.png) string in a Not Met reason cell, a Met Artifact cell or an Evidence heading, with that file on disk, is in no batch, and when that path is also listed as published it appears in remove — only the ## Evidence image lines count. CLI-chain test in a temp dir: render-report --file → write the report → report-publish-plan --report <it> --published-file <json> yields one entry per embedded image; an imageExcluded criterion's file, present on disk, is in no batch; a symlink under evidence/ pointing outside the temp dir is rejected as "resolves outside the report directory"; a --published-file that is not a JSON array of strings exits 1. Coverage of changed lines ≥ 60%; integration (CLI chain) ≥ 50% of the new CLI branch; mirror byte-identical
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
          foundBy: "RIMG-B002",
          phase: 2,
          summary: "one line, what it is",
          file: "path/to/file.js",
          evidence: "how you know"
        })'

    This is a RECORD, not a task. Do not fix it, do not expand your scope.
  </instruction>
</discovered>

You are a subagent. Do not spawn your own type with this task. Do not run git commit; the orchestrator commits at the phase checkpoint. Another implementer may be editing other files in this tree concurrently — touch only your task's files.
