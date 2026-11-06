# Functional Verification Report: design-quality

**Source PRD**: docs/PRD/design-quality.md
**Success definition**: .trd-state/design-quality/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 45 total — 45 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 45 of 45 proven — uncovered: none
**Must pass**: 8 of 8 proven
**Screenshots**: 1 shown
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | The `design.md` template that `/design-setup` writes from (`packages/skills/design-setup/template.md`) has a design-direction section with four fields: brand, style pack, references, departure latitude | .trd-state/design-quality/evidence/FS-1-7-template.txt | 1 |
| FS-2 | `/design-setup` asks the owner about each of the four direction fields, one topic at a time, each with a stated default, and writes the answers into `design.md` | .trd-state/design-quality/evidence/FS-2-3-4-skill-copy.txt | 1 |
| FS-3 | `/design-setup`'s style-pack question offers the available packs as its choices, including a pack a project has added, and the field it writes names a pack in the `design` role | .trd-state/design-quality/evidence/FS-3-direction-fixture.txt | 1 |
| FS-4 | Departure latitude is its own field, separate from the reuse rule, taking one of a fixed set of named levels, and `/design-setup` offers a default level | .trd-state/design-quality/evidence/FS-2-3-4-skill-copy.txt | 1 |
| FS-5 | `/create-design`, `/refine-design` and `/audit-design` pass the design-direction section of `design.md`, as text, to every draw agent and to the visual critique | .trd-state/design-quality/evidence/it2-harness-out.txt | 2 |
| FS-6 | A run where a direction field is blank does not stop: it draws with the product's own design system and no style pack, names each blank direction field in ISSUES, and points at `/design-setup`; a template-identical `design.md` still ends COMMAND STUCK | .trd-state/design-quality/evidence/FS-6-blank-fields.txt | 1 |
| FS-7 | The template has one "References" field, in the design-direction section, for every product or site to draw toward (competitors included), and §4 no longer has a "Competitor references" line | .trd-state/design-quality/evidence/FS-1-7-template.txt | 1 |
| FS-8 | `framework-skills.txt` accepts the role `design`, and every reader of the file, including `/rebase-project` and project scaffolding, processes a `design`-role entry without error | .trd-state/design-quality/evidence/FS-8-scaffold-fixture.txt | 1 |
| FS-9 | `frontend-design` is listed in `framework-skills.txt` with role `design` | .trd-state/design-quality/evidence/exerciser-fs9-framework-skills.txt | 1 |
| FS-10 | Every draw agent in `/create-design` (as-is, parts, to-be, fix) and the `/refine-design` redraw receives the text of the `design`-role craft skills and the text of the style pack `design.md` names | .trd-state/design-quality/evidence/exerciser-fs10-capture.txt | 1 |
| FS-11 | Six style packs ship in the `design` role (clean product UI; dense data / enterprise; expressive editorial; playful consumer; modern consumer; modern B2B SaaS), each selectable by name from `design.md`, and a pack a project adds is selectable the same way | .trd-state/design-quality/evidence/exerciser-fs11-packs.txt | 1 |
| FS-12 | Each of the three commands, `/create-design`, `/refine-design` and `/audit-design`, renders the boards it draws, changes or audits with the runtime pinned in the repository, with publishing on and with publishing off | .trd-state/design-quality/evidence/exerciser-fs12-13-prose.txt | 1 |
| FS-13 | With `ensemble.publishArtifacts: false`, no other canvas in the project and no Artifact tool, a `/create-design` run still renders every board it draws | .trd-state/design-quality/evidence/exerciser-fs12-13-prose.txt | 1 |
| FS-14 | `design-commands.md` §1 step 3 no longer contains a path that leaves a run with no runtime and skipped renders | .trd-state/design-quality/evidence/exerciser-fs14-contract.txt | 1 |
| FS-15 | A board whose render reports an error, including "the runtime booted but mounted nothing", is a high-ranked finding in `/create-design`'s fix round, in `/refine-design`'s re-challenge and in `/audit-design`'s report | .trd-state/design-quality/evidence/exerciser-fs15-create.txt | 1 |
| FS-16 | Rendering the walk's eight boards through the new render path reports `01-home`, `04-trips` and the four as-is boards as render failures, and `02-home` and `03-trips` as clean | .trd-state/design-quality/evidence/exerciser-fs16-summary.txt | 1 |
| FS-17 | When the product lacks Playwright or its Chromium (`design-render.js` exit 2), each design command names the missing tool and its install step in ISSUES and lists the visual critique as not run, never as passed | .trd-state/design-quality/evidence/FS-17.txt | 1 |
| FS-18 | The reuse rule in the `design.md` template and in `/design-setup`'s default says reuse means the design system's components and tokens, and sends layout departure to departure latitude | .trd-state/design-quality/evidence/it2-FS-18.txt | 2 |
| FS-19 | The to-be draw prompt in `create-design.js` and the `/refine-design` redraw are given departure latitude, and neither instructs nor implies drawing the current screen unchanged unless latitude says so | .trd-state/design-quality/evidence/FS-19.txt | 1 |
| FS-20 | The `/create-design` reuse reviewer axis and the `/audit-design` reuse verifier flag a hand-drawn copy of an existing component, and do not flag a layout change that departure latitude permits | .trd-state/design-quality/evidence/FS-20.txt | 1 |
| FS-21 | `/create-design`'s challenge stage runs the visual critique over the rendered frames, and its findings go to the existing single fix round together with the markup reviewers' findings | .trd-state/design-quality/evidence/FS-21.txt | 1 |
| FS-22 | `/refine-design`'s re-challenge of the boards it changed includes the visual critique | .trd-state/design-quality/evidence/FS-22.txt | 1 |
| FS-23 | `/audit-design` has a visual-critique verifier whose findings appear in the audit report like any other verifier's, and `/refine-design --auto` with no feedback works through those findings | .trd-state/design-quality/evidence/FS-23.txt | 1 |
| FS-24 | The critique runs four code-measured checks, computed by code from the rendered page rather than by a model: design-system fidelity, contrast, target size and layout faults; each finding names the board, the frame (state and viewport) and the measured value | .trd-state/design-quality/evidence/it2-FS-24.txt | 2 |
| FS-25 | Contrast and target-size findings are judged against the "Accessibility floor" in `design.md` §4; with no floor recorded, the check reports measured values with no pass/fail and the run names the unfilled field, and no default number is supplied | .trd-state/design-quality/evidence/FS-25.txt | 1 |
| FS-26 | The critique scores ten rubric dimensions (usability, hierarchy, craft, brand, consistency, responsiveness, states, copy, density, distinctiveness) on a 1–5 scale, each score carrying the board, the frame(s) read and a reason specific enough to act on | .trd-state/design-quality/evidence/it2-harness-out.txt | 2 |
| FS-27 | Brand and distinctiveness are scored against the design direction and the named style pack, and a dimension that cannot be judged for a board (responsiveness with one viewport, states with one state) is reported as not judged rather than scored | .trd-state/design-quality/evidence/it2-harness-out.txt | 2 |
| FS-28 | The visual critique changes no board: only `/create-design`'s fix round and `/refine-design`'s redraw change boards, and `/audit-design` stays read-only | .trd-state/design-quality/evidence/FS-28.txt | 1 |
| FS-29 | A critique that returns nothing is reported as not run, through the existing "NO REPORT FROM" / dead-axis handling, never as a clean result | .trd-state/design-quality/evidence/FS-29.txt | 1 |
| FS-30 | No critique score blocks a commit: a run whose boards score low still commits them, with the scores reported and sent to the fix round | .trd-state/design-quality/evidence/FS-30.txt | 1 |
| FS-31 | `frontend-design`'s skill text keeps "match established components and tokens" and refers how far the look may depart to the design direction's departure latitude, instead of the fixed "reuse beats a bold new look" line | .trd-state/design-quality/evidence/FS-31.txt | 1 |
| FS-32 | `/create-design --explore` draws several directions as a flag on the existing command, and `/create-design --style <pack>` overrides `design.md`'s style pack for that one design | .trd-state/design-quality/evidence/FS-32-direction.txt | 1 |
| FS-33 | In explore mode each direction is drawn with the same components and design direction, differing only within departure latitude and the style choice | .trd-state/design-quality/evidence/FS-33-34-36-37-38-explore-fixture-run.txt | 1 |
| FS-34 | In explore mode every direction is rendered and critiqued, and the directions are compared and ranked against each other with the reason | .trd-state/design-quality/evidence/FS-33-34-36-37-38-explore-fixture-run.txt | 1 |
| FS-35 | When explore runs attended the owner chooses the direction; when unattended, the top-ranked direction is taken and recorded in the brief as an `OD-n` decision listing the options, the one taken and why | .trd-state/design-quality/evidence/FS-35-36-command-text.txt | 1 |
| FS-36 | Explore draws three directions by default | .trd-state/design-quality/evidence/FS-33-34-36-37-38-explore-fixture-run.txt | 1 |
| FS-37 | A to-be board with an as-is predecessor is critiqued against the predecessor's frame, and the critique says, for each rubric dimension, whether the to-be board is better | .trd-state/design-quality/evidence/FS-33-34-36-37-38-explore-fixture-run.txt | 1 |
| FS-38 | A board with nothing to compare against is critiqued alone, and the critique output says it had no comparison | .trd-state/design-quality/evidence/FS-33-34-36-37-38-explore-fixture-run.txt | 1 |
| FS-39 | A labelled set of rendered frames is committed, each frame carrying the owner's label (overall, or per dimension where given), and it includes the walk's boards labelled poor | .trd-state/design-quality/evidence/FS-39-labelled-set.txt | 1 |
| FS-40 | A replay scores the critique against the labelled set over several runs and reports agreement with the owner's labels (per dimension only for frames with per-dimension labels) and the run-to-run spread | .trd-state/design-quality/evidence/it2-FS-40.txt | 2 |
| FS-41 | Until the owner sets the agreement bar, the replay reports its measurements and does not pass or fail anything | .trd-state/design-quality/evidence/FS-41.txt | 1 |
| FS-42 | No new command is added: the critique and explore live inside `/create-design`, `/refine-design` and `/audit-design`, and no `/critique-design` or `/explore-design` command exists | .trd-state/design-quality/evidence/FS-42.txt | 1 |
| FS-43 | No code path other than `/design-setup` writes `.claude/rules/design.md`; a design command run leaves it unchanged | .trd-state/design-quality/evidence/FS-43.txt | 1 |
| FS-44 | Playwright is resolved from the product and never shipped under `.claude/` | .trd-state/design-quality/evidence/it2-FS-44.txt | 2 |
| FS-45 | Publishing stays on by default: a project with no `ensemble.publishArtifacts` setting still publishes | .trd-state/design-quality/evidence/FS-45.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

## Evidence

### FS-16 — Rendering the walk's eight boards through the new render path reports `01-home`, `04-trips` and the four as-is boards as render failures, and `02-home` and `03-trips` as clean (met)

![FS-16](evidence/exerciser-fs16-02-home-clean.png)

