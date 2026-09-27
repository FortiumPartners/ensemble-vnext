# Investigation: verification-artifacts

**Kind**: change
**Weight**: medium
**Route**: plan
**Source brief**: `docs/plan/verification-closeout.brief.md` §2 and §4 (owner decisions 2026-09-27,
recorded there verbatim)

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | Ensemble ships a set of **verification-artifact skills** — markdown `SKILL.md` prompts, each stating when it applies and which inputs it needs. The set starts with three: design ↔ build comparison, designed ↔ as-built interaction flow, data ↔ screen fidelity | owner, 2026-09-27 (brief §4: "a set of verification skills that ship with ensemble") |
| O2 | The design-comparison skill reproduces the owner's exemplar artifact: per design frame, Design \| Build@commit \| Diff "N% differs" \| Overlay with a fade slider; a model-written verdict per frame (status match/minor/deviates/superseded/uncaptured/spec, one sentence, notes); cross-cutting problems stated once; a legend; status filter and jump strip; navigation route per frame; uncaptured frames shown with the reason; republished to the same URL as fixes land | owner, 2026-09-27 ("That artifact was perfect… I want a skill to reproduce it"); anatomy in brief §2 and the preserved exemplar |
| O3 | Every TRD carries a `## Verification Artifacts` section naming the checks that apply to it, each with its inputs, stating a reason for every applicable check it omits, or stating that none apply — written by `/create-trd` and by `/plan` for the TRDs it writes | owner, 2026-09-27 ("review the available verification artifact skills, decide which apply to that effort, include them in the TRD") |
| O3a | Selection is heavily weighted, never hard-coded: reference UI screens make the design comparison the default; an interaction diagram or screen-to-screen journeys make the flow check the default; screens rendering API or store data make the data check the default. An applicable check is omitted only with a stated reason, and any stated reason is enough | owner correction, 2026-09-27: "near certain (not hard coded in, but heavily weighted)… Same with flow and data on screen" |
| O4 | `/audit-trd` checks the section: names only shipped check skills, every named input resolves, and no applicable check is omitted without a stated reason (a real finding). A missing section on a TRD written before this change is an advisory, never written in | brief §4 (owner-agreed design); owner correction, 2026-09-27 |
| O5 | The verification step — `/implement-trd` §8 and `/verify-build` — runs every selected check **inside** the functional-verification loop: its criteria are captured by Exercise, ruled by the Judge with the check's rubric, and fixed by Debug when not met, like any other gap; the readout links each check's page. *Amended 2026-09-27: was "invokes each named skill" after the loop* | owner, 2026-09-27 ("the verify step invokes the skill to create them"); owner correction, 2026-09-27 ("these aren't just artifacts. These are immensely valuable to the review process") |
| O5a | Each check contributes one criterion per design screen, per journey, per data view, each passing on its own — a 32-frame design is 32 criteria, not one criterion with 32 parts | owner correction, 2026-09-27 ("a screen by screen comparison of design to rendered output"); `docs/TRD/verification-convergence.md` AMEND-001 |
| O5b | The success-definition derive pass stays PRD-only and TRD-blind; check criteria are appended after it and cite their design input, never the task list | `functional-verification.md` contract, "The isolation rule" |
| O6 | When a TRD has no such section (written before this change), or its section is silent on an applicable check, the verification step applies O3a's defaults to the PRD's inputs itself and reports each such selection. *Amended 2026-09-27: was an unconditional guarantee* | owner, 2026-09-27 ("reproduce that artifact any time there is a UI design provided… ensure it's created each time"); owner correction, 2026-09-27 ("not hard coded in") |
| O7 | The check skills reach every project that has Ensemble, including existing ones on `--refresh` — not only projects whose stack selection happens to name them | domain-derived: O5 and O6 are false in any project that does not have the skills; today's delivery path (below) would never give them to an existing project |
| O10 | Each check's page is rendered from the check verdicts every loop iteration, republished to the same URL and linked in the readout; the owner's comments on it are an input to the next fix batch | owner correction, 2026-09-27 ("very helpful for human review"); O2 ("republished to the same URL as fixes land") |

## Intended Change

A shipped verification-artifact skill set (O1, O2), selected per feature in the TRD (O3), checked by
the audit (O4), produced by the verification step (O5) with a fallback that guarantees the design
comparison whenever designs exist (O6), delivered to every project (O7). Checkable end state:

- `packages/skills/` holds three new skills whose `SKILL.md` frontmatter follows the library's format
  (`name`, `description`, `when_to_use`, `allowed-tools`), and each names its inputs.
- `trd-authoring.md` documents the section; `/create-trd`'s authoring stage writes it; `/plan`'s light
  template and medium path carry it.
- `/audit-trd` and `/plan`'s mechanical check report a check the inputs call for that the section
  omits without a stated reason; a missing section on an older TRD is advisory only.
- Each selected check adds criteria to the success definition — one per design screen, journey or
  data view — which the verification loop captures, judges with the skill's rubric and debugs like
  any other gap; the page is re-rendered from those verdicts each iteration, published to a stored
  URL and linked in the readout.
- A scaffolded project and a `--refresh`ed existing project both end with the three skills present.

## Decision

- **Skills, not tools.** Each skill is a prompt. Any script it needs (cropping, diffing, page
  assembly) is written by the agent at run time, as the exemplar's ~170 lines of throwaway Python
  were. The framework ships no deterministic artifact tooling (owner: "I DO NOT want to go down a
  rabbit hole of building deterministic tools").
- **The judgement is the product.** The design-comparison skill must require the agent to look at
  every stitched design | build | diff image and write each verdict itself; the diff percentage is
  evidence, never the status. That is what made the exemplar good.
- **Selection lives in the TRD, shaped like `## Deferred by design`, and is heavily weighted.** A
  table with one row per chosen check (skill name, inputs, why it applies), an `Omitted: <skill> —
  <reason>` line per applicable check left out, or `None apply — <reason>`. A check whose inputs the
  PRD carries is included by default; any stated reason is enough to omit it (owner, 2026-09-27: "not
  hard coded in, but heavily weighted"). No parser: the orchestrating model reads the table, and the
  audits check it by lookup. Alternative rejected: selection in the PRD — the PRD states what must be
  true, the TRD decides how it is proven, and the success-definition derive pass must stay blind to
  the TRD.
- **Checks run inside the verification loop, as criteria** *(amended 2026-09-27; was: one agent per
  listed skill after `Workflow(verify-functional)` returns)*. The owner: "What do we mean artifacts
  are produced after verification loop returns? … these aren't just artifacts. These are immensely
  valuable to the review process." The orchestrator appends each selected check's criteria to the
  success definition after the derive pass — one per design screen, journey or data view, each
  citing its design input — and passes each `SKILL.md` as text to the workflow. Exercise captures
  their evidence by the skill's procedure, the Judge rules them by its rubric, and Debug fixes the
  ones not met like any other gap. The page is re-rendered from the verdicts every iteration and
  published to one URL; the owner's comments on it are read before the next run. Alternative
  rejected: producing pages after the loop returns — a finding the loop cannot act on is a report,
  not part of the review. This resolves OQ-2 below.
- **Delivery: a framework skill set, always copied.** `scaffold-project.sh` copies a named list of
  framework skills on scaffold AND on `--refresh`, independent of `selected-skills.txt`, the way
  commands and contracts are delivered. Alternative rejected: exposing them through the plugin's
  `skills` field — the constitution requires the runtime to live in the vendored `.claude/`, identical
  in local and web sessions.

absorbed:     scaffold delivery of always-present skills — O5/O6 cannot hold in a project that lacks the skills  [BLOCKS]
not absorbed: stale `--resume`/§3.6a wording in verification docs — separate `/sweep`, this works without it
not absorbed: the bridge and `/verify-build --fix` — separate plan (brief §1, §5)
not absorbed: `verification.md` setup skill — separate plan (brief §3)

## Grounding

- **`packages/skills/`** — 56 skills, one directory each with `SKILL.md` (frontmatter `name`,
  `description`, `when_to_use`, `allowed-tools`), optionally helper files beside it; e.g.
  `packages/skills/tooling-detector/SKILL.md` [read]. None produces a verification artifact; the
  closest are `playwright-automation`, `figma-pixel-perfect`, `verify-goal`, `smoke-test-*` [read].
  New skills go here.
- **Skill delivery** — `packages/full/skills-lib` is a symlink to `packages/skills` [ran]; the plugin
  does NOT expose it as plugin skills (deliberate: 56 stack skills). `scaffold-project.sh`
  `copy_skills()` (~:834) copies only names listed in `.claude/selected-skills.txt`, which
  `/init-project` writes from the stack [read]; on `--refresh` it re-copies **only skills already
  present** in `.claude/skills/` [read]. So a new skill never reaches an existing project today —
  the O7 gap. `inject_agent_skills()` (~:940) writes per-agent skill lists from
  `agents/skill-affinity.json` intersected with the selection [read]. Tests:
  `packages/core/scripts/scaffold-project.test.sh` [read].
- **TRD structure** — `packages/core/contracts/trd-authoring.md` (mirror `.claude/contracts/`) is the
  authoring contract `/create-trd`'s workflow reads; sections listed at `:81`–`:665` [ran: grep]. The
  new section is documented there. `packages/core/workflows/create-trd.js` authors from it [read].
- **`/plan`** — `packages/core/commands/plan.md` §5a light-TRD template (sections `## Objectives` …
  `## Could Not Verify`, `:519`–`:546`) [ran: grep] needs the section; the medium path goes through
  `create-trd.js`, so it inherits the contract change.
- **Parser** — no new parser: the orchestrating model reads the section's table directly, and the
  mechanical check reuses helpers `trd-parser.js` already exports [read].
- **Audit** — `packages/core/workflows/audit-trd.js` has index-free verifiers including a
  `deterministic` haiku verifier doing citation and conformance lookups (`:152`–`:166`) [read]. The
  section check belongs with it (or as a mechanical lib check the verifier calls), not as a new
  judgement verifier. `fix-audit.js` is `/plan`'s mechanical check for light TRDs [read in /plan
  command text] — the same check applies there.
- **Verification step** — `packages/core/commands/implement-trd.md` §8 (§8.1 resolve definition,
  §8.1a lanes, §8.3 dispatch, §8.4 render, §8.5 hands-off rule, §9.0a artifact link at `:1668`) [ran:
  grep]; `packages/core/commands/verify-build.md` steps 1–5 and its artifact-link section (`:221`)
  [ran: grep]. Artifact URLs go in `.trd-state/<feature>/artifacts.json` per
  `.claude/rules/command-status.md` "Artifact links" [read]. `verify-command-surface.test.js` pins
  command prose — extend it [read].
- **The exemplar** — `/Users/fortium/ensemble-reference/visual-compare-exemplar-2026-09-27/`:
  `site/index.html` (the page), `site/img/` (86 images), `pair.py` (crop, normalise, blur, red/blue/
  amber diff, % differs overall and by thirds), `build.py` (walk frames, newest evidence folder first,
  commit per screenshot), `gen.py` (HTML from `rows.json` + `meta.json`), `verdicts.json` (per-frame
  model verdicts), `meta.json` (lede and cross-cutting summary), `review/` (stitched pair images)
  [read by the close-out investigation]. Project-specific constants to parameterise: bezel crop box,
  frame size, 46 px status bar, device/capture commands, evidence paths, data caveat, title [read].
  Failure modes seen: capture agent stalling (forked itself; hit a turn limit), stale pre-fix
  screenshots, unreachable states, spec pages of a different size, a test password in an agent
  summary, 5.6 MB of images [read].
- **Flow and data artifacts** — no exemplar page exists. In the session: a "wiring matrix" (journey ×
  step, DB counts before/after) that found 3 defects no criterion covered, and a live-API row check
  (~50 rows, 4 parks) [read by the close-out investigation]. These skills are specified from those
  and from the owner's description ("an as built interaction diagram derived from the code… and
  verify they match").
- **Hazard** — `CLAUDE.md` / constitution: skills and agents are prompts only (Principle 2); every
  runtime file exists as `packages/core/<x>` + byte-identical `.claude/<x>`; `packages/full/{lib,
  workflows,scripts}` are symlinks [read]. Skills live in `packages/skills/` and reach `.claude/skills/`
  by scaffold copy, not by mirror [read].

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Skill names | `verify-design-comparison`, `verify-flow-as-built`, `verify-data-fidelity` — a shared `verify-` prefix marks the set | no |
| OQ-2 | When, relative to fixes, the artifacts are produced | resolved by the owner 2026-09-27: they are verification checks inside the loop, not reports after it — see Decision | no |
