# Brief: design-quality

**Source**: this session's conversation, 2026-11-05/06
(`~/.claude/projects/-Users-james-dev-fortium-ensemble-vnext/7348a86a-641c-4089-9f06-0c4cf6808534.jsonl`),
from the DORCH-T001 live walk onward. No source document exists; this brief is the authoring input
and a checkable claim about the transcript. Evidence the conversation rests on:
`.trd-state/task-dorch-t001-live-walk/findings.md` and its `evidence/`, and the rendered boards at
https://claude.ai/artifact/JwNxK9CWwYPxiAifTXkgxu.

## Settled

| What | Where it was settled |
|---|---|
| **The goal, in the owner's words:** "The entire goal of this capability is to autonomously produce on-brand, design-system aligned, GOOD LOOKING UX/UI." | Owner message after the render review ("So where do we set design standards…") |
| **The problem, in the owner's words:** "But the output of this task is visually poor" — said of the boards `/create-design --auto` drew in the DORCH-T001 walk. | Owner message after "Why would publishing be off?" |
| The owner wants a place to **set design standards**, and to **bring in frontend design and other top UI skills** "from anthropic, our own", with "a few different styles available". | Owner message "So where do we set design standards…" |
| The owner wants a **model-judged, "somewhat subjective" visual evaluation of the produced designs**, naming usability, visual appeal and brand alignment, and asking "what else?". | Same message |
| **Scope as the owner invoked it** (the `/create-prd` arguments): (1) a design-direction section in `design.md` covering brand, style pack, references and departure latitude, set by `/design-setup`; (2) a `design` skill role holding craft skills and selectable style packs; (3) an explore mode that draws several directions; (4) a visual critique of RENDERED frames, using the repo-pinned runtime so it works whether or not publishing is on, run inside `/create-design` and `/refine-design` and as an `/audit-design` verifier; (5) code-measured checks: design-system fidelity, contrast, target size, layout faults; (6) model-judged rubric scores: usability, hierarchy, craft, brand, consistency, responsiveness, states, copy, density, distinctiveness; (7) comparative where possible; (8) calibrated against a labelled set. | `/create-prd` invocation arguments |
| **Constraint, in the owner's words:** "It must do so without overengineering the solution — keep it simple and elegant, not brittle." | `/create-prd` invocation arguments |
| **Diagnosis the owner accepted as the basis for the work** (from the walk): every `/create-design` reviewer (five `code-reviewer` axes: flow, consistency, reuse, data, standards) and every `/audit-design` verifier reads board markup, none looks at a rendered image; the `frontend-design` skill is in `packages/skills/` but no design command loads it; the `design.md` rule "an existing view beats a new one" made to-be boards reproduce the current layout (the boards copied the nav "unchanged from src/main.jsx", including lowercase links and 24 px targets the agent itself noted were under the 44 px floor). | Assistant analysis "Agreed. The boards are wireframes…", then the owner's next message builds on it; restated in the `/create-prd` arguments |
| **Component reuse stays mandatory; layout reproduction is not the intent.** "Reuse" must mean reusing the design system's components and tokens, while how far a to-be board may depart from today's screen becomes a separate setting (departure latitude). | Assistant analysis; adopted as "departure latitude" in the `/create-prd` arguments |
| `design.md` stays owner-governed: only `/design-setup` writes it, and running it is the owner's approval. | `.claude/rules/design.md` header; `constitution.md` governance split |
| Six of eight walk boards did not render (no `<x-dc>` root, props passed as `data-props`), because with publishing off the draw agents had no canvas conventions and nothing rendered the boards. A render that does not depend on publishing catches this as a side effect. | `.trd-state/task-dorch-t001-live-walk/findings.md`, "Six of eight boards do not render" |
| Publishing is ON by default; the walk turned it off only because the DORCH-T001 TRD row specified `publishArtifacts: false`. The render-defect severity was corrected: it is the publish-off path's defect, and whether the publish-on path produces good boards is unproven. | Assistant answer to "Why would publishing be off?" |

## Superseded

| Earlier position | Replaced by | Why |
|---|---|---|
| Fix the render problem alone with a `/plan` ("use the repo-pinned dc-runtime to render-check boards before commit") | This PRD: a design-quality capability of which the render check is one part | The owner said the output is visually poor, not just broken; a render check makes broken boards visible but does not make good ones |
| A second `/plan` covering visual critique, design guidance, a stronger model and the reuse rule | A PRD (`/create-prd`) | It holds product decisions (style packs, rubric, thresholds, latitude default) and is bigger than one fix |
| "The render finding is the most serious thing the walk found" | It is the publish-off path's defect; the publish-on path is unproven | Publishing is on by default; the walk turned it off by TRD instruction |
| Run a publishing-on re-check `/task` next | Run it after this capability lands, not before | Before, it would only confirm the boards render, not that they are any good |

## Raised, not adopted

These came from the assistant's proposals and were not taken into the owner's invocation. They are
not requirements. Weigh each against the owner's "keep it simple" constraint.

| Idea | Status at end of conversation |
|---|---|
| Density and motion fields in `design.md`'s design direction | Proposed; the invocation lists brand, style pack, references and departure latitude only |
| A panel of critics, one lens each, plus a reconciler | Proposed; not in the invocation. "Visual critique" was adopted without a shape |
| An Opus-class vision model for the critic; a stronger model for the to-be draw agents | Proposed; the invocation does not name models |
| The owner's overrulings of critiques feeding the calibration set and the critic's examples | Proposed; the invocation says only "calibrated against a labelled set" |
| A richer fixture product with a real design system for calibration | Proposed ("the react-web fixture has four components and almost no tokens, so it can't look good whatever we do"); not in the invocation |
| The same quality rubric applied to the BUILT UI after `/implement-trd` | Proposed as optional; not in the invocation |
| A `--style <pack>` per-design override; under `--auto`, explore mode's top-ranked direction recorded as an `OD-n` decision | Proposed mechanisms; the invocation says "selectable style packs" and "explore mode" without a mechanism |
| axe-core through the existing Playwright render for accessibility | Proposed mechanism; the invocation says "contrast, target size" |
| A pass/fail threshold that blocks a board below the bar | Proposed ("reported, not passed quietly"); no threshold or blocking rule was settled |
| Platform craft skills (web, iOS, Android conventions) | Proposed; not in the invocation |
| Which style packs ship, and how many | Never settled |

## Facts the author should ground against

- `packages/skills/framework-skills.txt` lists each framework skill once with a role (`check` or
  `support`); today's design skills are `design-setup`, `designing-on-canvas`, `design-grounding`
  (support) and `verify-design-structure`, `verify-design-comparison` (check).
- `packages/skills/frontend-design/SKILL.md` exists; its own opening says "In an existing product,
  reuse beats a bold new look" — a tension with departure latitude.
- `/create-design` already passes skill text into its workflow (`conventions`, `groundingSkill`
  arguments, `packages/core/commands/create-design.md` step 2).
- The five review axes are `AXES` in `packages/core/workflows/create-design.js`; the to-be draw
  agents are `frontend-implementer` on Sonnet at high effort.
- The runtime used to render the walk's boards is
  `packages/core/lib/__fixtures__/design/dc-runtime.js`, a TEST FIXTURE. Belief, not fact: that it
  may be shipped to consuming projects and kept current with the Design type's runtime. Settle by
  checking how the fixture was obtained and whether the Design type's runtime changes.
- `/refine-design --auto` with no feedback already consumes the latest `/audit-design` report's
  open findings (4.16.0), so an `/audit-design` visual verifier feeds an unattended
  create → audit → refine loop with no new plumbing.
- `design-render.js` renders boards to PNG with Playwright, which it resolves from the product.
- The discipline judge (`test/discipline-corpus/`) is this repo's precedent for calibrating a
  model judge against a labelled corpus with thresholds stated over several runs.
