# Functional Verification Report: design-stage

**Source PRD**: docs/PRD/design-stage.md
**Success definition**: .trd-state/design-stage/success-definition.md
**Outcome**: Stuck (no full-environment run declared)
**Reason**: iteration cap (3) reached with 1 gap(s) still open
**Criteria**: 72 total — 59 met, 1 not met, 12 not verifiable, 0 unbuilt
**Coverage**: 59 of 72 proven — uncovered: FS-25, FS-42, FS-43, FS-54, FS-58, FS-59, FS-60, FS-61, FS-62, FS-63, FS-67, FS-68, FS-72
**Must pass**: 10 of 11 proven — unproven: FS-43 (not verifiable)
**Screenshots**: 2 shown
**Diagnosis**: 13 open — 8 environment not reachable, 4 capability absent, 1 evidence missing
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | A `design.md` template exists under `packages/core/templates/claude-directory/rules/` and has a place for each of the four groups of fields: the design system (artifact link, namespace, source of truth, build command, whether the product build may run), per platform (board component kind, tokens source, component library paths, viewport sizes), how to reach a screen (route list, sign-in and seed data pointing at `verification.md` environments, capture command, where current screenshots live), and design rules (reuse, accessibility floor, competitor references, process rules) | .trd-state/design-stage/evidence/ex1/FS1-2-template.txt | 1 |
| FS-2 | The `design.md` template's sign-in entry points at `verification.md` §3 and has no field for a credential value | .trd-state/design-stage/evidence/ex1/FS1-2-template.txt | 1 |
| FS-3 | The `design-setup` skill is owner-invoked only (`disable-model-invocation: true`), asks one question per topic offering defaults detected from the repository, offers contrast 4.5:1 and 44 px touch targets as the accessibility-floor default, and writes the owner's answer into `design.md` | .trd-state/design-stage/evidence/ex1/FS3-design-setup.txt | 1 |
| FS-4 | `design-map.js` writes a map and reads it back with `canvases` (a list, each entry `url`, `version`, `synced_at`), `design_system` (`url`, `version`, `code_commit`, `paths`) and `boards[]` carrying `id`, `file`, `kind`, `replaces`, `platform`, `viewport`, `route`, `states` (each with a `setup`), `components`, `parts`, `links`, `brief_items`, `status`, `trd`, `shipped_commit`; a map with more than one canvas round-trips intact | .trd-state/design-stage/evidence/ex1/jest-design-libs.txt | 1 |
| FS-5 | The map library accepts only `as-is`, `to-be`, `part` and `flow` as a board's `kind` and rejects any other value | .trd-state/design-stage/evidence/iter2/fs5-direct.txt | 2 |
| FS-6 | The map library moves a board's `status` only along `draft` → `approved` → `building` → `shipped`, or to `superseded`, and is the code path that moves it | .trd-state/design-stage/evidence/ex1/jest-design-libs.txt | 1 |
| FS-7 | Given a board's source, the map library derives that board's `components` (from its `x-import`s), `parts` (from its `dc-import`s) and `links`, rather than taking them as typed values, and a unit test covering fields derived from board source passes | .trd-state/design-stage/evidence/ex1/FS44-49-design-map-cli.txt | 1 |
| FS-8 | `design-render.js` renders committed boards locally with no claude.ai login, writing one PNG at each board's viewport and one per state (each `sc-if` branch or tweak value) named `NN-name--state.png`, plus each board's render errors | .trd-state/design-stage/evidence/ex1/FS8-9-render-run.txt | 1 |
| FS-9 | Frames rendered for verification come from the board source at the commit the board was approved, so an edit made after approval does not appear in them | .trd-state/design-stage/evidence/ex1/FS8-9-render-run.txt | 1 |
| FS-10 | A unit test shows a known board renders to a stable PNG, and a release-change test renders the fixture boards with the current `dc-runtime.js` | .trd-state/design-stage/evidence/iter2/fs10-dcruntime.txt | 2 |
| FS-11 | Each design command whose contract includes a local render pass says so in that contract | .trd-state/design-stage/evidence/ex1/FS11-render-pass.txt | 1 |
| FS-12 | `design-bundle.js` applies each of the four stack recipes: React web as an esbuild IIFE assigning the namespace global with React mapped to the page's globals plus compiled CSS; React Native with the `react-native` → `react-native-web` alias and Node built-in stubs; React Native with NativeWind 4 using `jsxImportSource: 'nativewind'` and CSS from the app's own Tailwind config with no Babel step; any other stack producing no bundle, so parts are used | .trd-state/design-stage/evidence/iter3/design-system-react-native-pane.txt | 1 |
| FS-13 | `design-bundle.js` reports every stub it adds, and the design system's README lists each of those stubs | .trd-state/design-stage/evidence/live/work/react-native/docs/ui/_design-system/fixture-native/README.md | 1 |
| FS-14 | A fixture React component library bundled by `design-bundle.js` mounts under `dc-runtime` | .trd-state/design-stage/evidence/ex1/jest-design-libs.txt | 1 |
| FS-15 | When the canvas changed and the repository did not (measured against the `version` recorded for that canvas in the map's `canvases` list), the mirror adopts the canvas edit into `docs/ui/<slug>/canvas/project/`, commits it as "design: adopt canvas edits (<boards>)", and re-derives the map's fields | .trd-state/design-stage/evidence/r1/fs15-17-git.txt | 1 |
| FS-16 | When the repository changed and the canvas did not, the mirror publishes the repository source to the canvas | .trd-state/design-stage/evidence/ex1/jest-design-libs.txt | 1 |
| FS-17 | When both changed on the same board, the canvas version is kept, the repository version is written beside it as `<board>.repo.dc.html`, the conflict is reported under ISSUES, and neither side is overwritten | .trd-state/design-stage/evidence/r1/fs15-17-27-43-refine-design-pane.txt | 1 |
| FS-18 | When the canvas refuses a publish over a newer save, the mirror re-reads the canvas, redoes the change and publishes again, and ends STUCK after a third refusal | .trd-state/design-stage/evidence/ex1/jest-design-libs.txt | 1 |
| FS-19 | The mirror's unit tests cover each of the issue's four sync cases — canvas changed, repository changed, both changed, publish refused — and pass | .trd-state/design-stage/evidence/ex1/jest-design-libs.txt | 1 |
| FS-20 | Any agent that publishes to the canvas first does a whole-artifact `read` (no `path`) | .trd-state/design-stage/evidence/iter3/create-design-auto-artifact-calls.txt | 1 |
| FS-21 | The mirror leaves `project/ds/` out of the repository copy and records the design system's version instead | .trd-state/design-stage/evidence/ex1/jest-design-libs.txt | 1 |
| FS-22 | Every design command starts by comparing the live canvas's version with the last synced version in `design-map.json`, and reads the boards and runs the three change cases only when it differs; with no change there is no full read | .trd-state/design-stage/evidence/iter4/fs22-create-design-unchanged-canvas-pane.txt | 2 |
| FS-23 | `/design-system` turns tokens into list-format `tokens.json`, copies fonts and logos, bundles components per platform with `design-bundle.js`, writes a README and preview per component, runs the product build only when `design.md` allows it, and records the system's version and code commit in each `design-map.json` and never in `design.md` | .trd-state/design-stage/evidence/iter4/fs23-system-listing.txt | 2 |
| FS-24 | `/design-system` installs the system on the product's canvases on its first build, and `--sync` re-runs it after code changes and reinstalls it on each canvas that records it | .trd-state/design-stage/evidence/r2/fs24-first-build-and-sync.txt | 2 |
| FS-26 | When `design.md` says Figma is the source, `/design-system` uses the Figma connector route (`from-design-tool.md`, main session only) | .trd-state/design-stage/evidence/ex1/FS26-figma.txt | 1 |
| FS-27 | Each of the four design commands (`/create-design`, `/refine-design`, `/audit-design`, `/sync-design`) checks whether the design system is older than its code (`git log <code_commit>..HEAD -- <paths>`); on a change it carries on against the installed system, asks nothing, records the drift under ISSUES and puts `/design-system --sync` first in NEXT; all but `/audit-design` also record it in `design-map.json`, and `/audit-design` writes no map | .trd-state/design-stage/evidence/r2/fs27-summary.txt | 2 |
| FS-28 | The `designing-on-canvas` skill states the board conventions (`x-import` for every real component, shared parts as `dc-import`, `is_interactive` on linked boards, tweaks for states and variants, one canvas page per flow, NN-name ids, board titles, no inline copies) and reads the canvas rules live from the Design type rather than holding them; the `design-grounding` skill says how to inventory screens, components, flows and data per stack and how to capture missing screenshots | .trd-state/design-stage/evidence/ex1/FS28-skills.txt | 1 |
| FS-29 | `/create-design` with no `design.md` ends STUCK naming `/design-setup` | .trd-state/design-stage/evidence/iter4/fs29-create-design-no-designmd-pane.txt | 2 |
| FS-30 | `/create-design` writes each of the five grounding files — `screens.md` (with screenshot paths, captured where missing), `components.md` (props and where each is used), `flows.md`, `data.md` (fields the backend returns), `standards.md` | .trd-state/design-stage/evidence/iter3/cd/grounding/screens.md | 1 |
| FS-31 | `/create-design` writes `brief.md` covering screens and their empty, loading and error states, per board the components and views it reuses and anything new with its reason, and open decisions; under `--auto` it asks nothing and records every assumption in `brief.md`; with a person present it asks at most one round of at most four questions, each about a decision with no reasonable default | .trd-state/design-stage/evidence/iter3/cd/brief.md | 1 |
| FS-32 | Every board in the map cites its `brief_items`, and every brief item cites its PRD or issue source | .trd-state/design-stage/evidence/iter3/cd/design-map.json | 1 |
| FS-33 | Each screen in scope gets an as-is board (skipped with `--new` for screens with no predecessor), rendered and compared with the current screenshot, and a board that still differs carries a mark in the map that the design checks can read | .trd-state/design-stage/evidence/iter3/cd/design-map.json | 1 |
| FS-34 | Each as-is board, rendered, matches the current screenshot of its screen | .trd-state/design-stage/evidence/iter3/fs34/board-01-trips--as-is.png | 3 |
| FS-35 | `/create-design` writes the shared parts the design system lacks before the to-be boards, then writes the to-be boards (one agent per board) following `designing-on-canvas`, each starting from its as-is board where one exists and mounting real components with `x-import` | .trd-state/design-stage/evidence/iter4/fs35-36-draw-workflow-journal.txt | 2 |
| FS-36 | `/create-design` renders every board, collects ranked findings from read-only reviewers on flow and logic, consistency, reuse, data reality, standards and accessibility, and render errors, and runs one fix round | .trd-state/design-stage/evidence/iter4/fs35-36-draw-workflow-journal.txt | 2 |
| FS-37 | At publish, `/create-design` does a whole-artifact read, publishes `canvas.json` and the parts, then the boards in order, and installs the design system on the canvas when it is missing or outdated | .trd-state/design-stage/evidence/iter3/create-design-auto-artifact-calls.txt | 1 |
| FS-38 | `/create-design` writes `design-map.json` with every board at status `draft`, exports `screens/png/NN-name[--state].png`, commits `docs/ui/<slug>/` (`brief.md`, `grounding/`, `canvas/project/`, `design-map.json`, `screens/png/`), and records the canvas as a `design` artifact | .trd-state/design-stage/evidence/iter3/cd/commit-files.txt | 1 |
| FS-39 | `/create-design` ends with the four-section readout and a COMMAND COMPLETE or STUCK banner, with the canvas link above the banner | .trd-state/design-stage/evidence/iter3/create-design-auto-pane.txt | 1 |
| FS-40 | A second `/create-design` run leaves `grounding/` unchanged when the code it covers has not changed | .trd-state/design-stage/evidence/iter4/fs40-grounding-diff.txt | 2 |
| FS-41 | `/refine-design` reads the live canvas first and adopts hand edits through the mirror before applying feedback | .trd-state/design-stage/evidence/iter4/fs15-41-45-refine-design-auto-pane.txt | 2 |
| FS-44 | Nothing builds from a `draft` board: `/create-trd` or `/plan` given a design whose boards are `draft` produces no tasks from them | .trd-state/design-stage/evidence/r1/fs44-55-56-trd-home-trips.md | 1 |
| FS-45 | `/refine-design` runs in the main session with no workflow script, interactive by default, and under `--auto` asks nothing | .trd-state/design-stage/evidence/iter4/fs45-no-workflow-and-auto-asks.txt | 2 |
| FS-46 | `/audit-design` writes `audit-design-report.md` with a `## Could Not Verify` section, its findings name a board and line, rejected findings name the file that refutes them, it reports any board with no source and any brief item with no board, and it changes no board | .trd-state/design-stage/evidence/iter4/audit-design-report-seeded.md | 2 |
| FS-47 | `/create-trd` accepts a design through a PRD reference or `--design docs/ui/<slug>`, and `/plan` accepts one board or a small set | .trd-state/design-stage/evidence/iter4/fs47-plan-design-boards-pane.txt | 2 |
| FS-48 | Each `approved` to-be board becomes TRD tasks citing its board id, carrying its route, components and props (from `x-import`), new shared components (from parts), states (from `sc-if` and tweaks), interactions (from links) and data fields (from `grounding/data.md`) | .trd-state/design-stage/evidence/iter4/trd-settings-notifications.md | 2 |
| FS-49 | When its TRD is written, a board moves to `building` and the TRD path is recorded in the map | .trd-state/design-stage/evidence/iter4/fs49-map-draft-to-building.txt | 2 |
| FS-50 | A real-component board's task says which components and props go at which route; a parts board's task carries the board's PNG and source as reference; the implementer reads board source from `docs/ui/<slug>/canvas/project/`; new shared components are their own tasks ahead of the screens that use them | .trd-state/design-stage/evidence/iter5/implementer-transcript.jsonl | 3 |
| FS-51 | A TRD written from a design selects the design checks in its `## Verification Artifacts` section automatically | .trd-state/design-stage/evidence/iter4/trd-settings-notifications.md | 2 |
| FS-52 | `verify-design-comparison` accepts `design-map.json` as the route-and-state manifest for each frame | .trd-state/design-stage/evidence/r1/fs52-manifest-03-trips-approved.json | 1 |
| FS-53 | `verify-design-comparison` treats only `approved`, `building` and `shipped` to-be boards as requirements and as-is boards as regression baselines, and its verdict stays model judgement per frame | .trd-state/design-stage/evidence/r1/fs53-design-comparison-verdicts.json | 1 |
| FS-55 | `verify-flow-as-built` takes the designed screen-to-screen edges from the board links in `design-map.json` | .trd-state/design-stage/evidence/r1/fs55-flow-see-trips.txt | 1 |
| FS-56 | `verify-data-fidelity` is selected with `grounding/data.md` as its input and its skill file is unchanged | .trd-state/design-stage/evidence/r1/fs44-55-56-trd-home-trips.md | 1 |
| FS-57 | A TRD built from approved boards is verified against them inside `/implement-trd`'s functional-verification loop | .trd-state/design-stage/evidence/iter5/verification-report.md | 3 |
| FS-64 | `lib/artifacts.js` documents the artifact kinds `design` and `audit-design` | .trd-state/design-stage/evidence/ex1/FS64-65.txt | 1 |
| FS-65 | `packages/skills/frontend-design/SKILL.md` states that in an existing product, reuse beats a bold new look | .trd-state/design-stage/evidence/ex1/FS64-65.txt | 1 |
| FS-66 | `/audit-docs` leaves `docs/ui/` out of its document set | .trd-state/design-stage/evidence/ex1/jest-design-workflows-prose-skills.txt | 1 |
| FS-69 | With no claude.ai artifact access, or with `ensemble.publishArtifacts: false`, a design command writes the repository copy and renders, then ends STUCK naming the publish step | .trd-state/design-stage/evidence/r1/fs69-fs34-create-design-publish-off-pane.txt | 1 |
| FS-70 | No published board or design-system page contains a credential | .trd-state/design-stage/evidence/iter4/fs70-credential-scan.txt | 2 |
| FS-71 | The design workflows have tests on `test-harness.js`, and each of the three live fixture runs — React web, React Native, and the `flutter-widget` variant (parts only) — passes | .trd-state/design-stage/evidence/r2/fs71-summary.txt | 2 |

## Not Met

| ID | Statement | Tier 1 | Reason | Blocker | Attempts |
|----|-----------|--------|--------|---------|----------|
| FS-54 | `verify-design-structure` walks the React tree in Playwright and compares the components rendered at a board's route with the board's `components`; on a stack other than React or react-native-web, and for parts boards, it does not run the structure check and reports "not verifiable here" | pass | The React half is proven: SKILL.md states the rule and the live walk of /trips found Card and Chip for board 01-trips--as-is. The non-React and parts-board half is not: the only Flutter run was a stand-in whose four boards are all draft, so the skill answered through its no-board-in-scope rule, and the stack and parts-board rules were only described hypothetically ("if the boards were approved"), never applied. The flutter-widget fixture itself was not run. | the flutter-widget fixture is in another repository; a stand-in with approved parts boards on a non-React stack is needed | iter 2: not_met; iter 3: not_met |

## Not Verifiable

| ID | Statement | Reason |
|----|-----------|--------|
| FS-25 | A board drawn with the installed design system renders its real components on the hosted canvas | Accepted (DSGN-T005, owner-attended): needs a screenshot of the hosted canvas. |
| FS-42 | `/refine-design` takes feedback from the argument, chat, canvas comments and the viewer's selected elements; changes only the affected boards, re-challenges them, publishes only what changed, posts a before/after, and answers each comment it handled | No tool here can create a canvas comment, so a comment-driven run cannot start. |
| FS-43 | `/refine-design` sets a board to `approved` only on the owner's word, through each of three channels — in chat, by an "approved" comment on the board, or with `--approve <ids>` — and a run with none of them leaves every board `draft` | Chat and --approve channels proven (iter4), --auto with no approval approved nothing; the 'approved' comment channel cannot be exercised without a tool that creates canvas comments. |
| FS-58 | `/audit-build`'s NEXT names `/sync-design <slug>` when the closed feature has a design, and does not run it | Accepted (DSGN-T004, deferred until the fixture build merges). |
| FS-59 | `/sync-design` captures, for each `building` board, the built screen at its route and states into `as-built/png/` | Accepted (DSGN-T004, deferred until the fixture build merges). |
| FS-60 | When the build matches its board, `/sync-design` sets the board `shipped` with `shipped_commit`, makes the to-be board the new as-is for that screen, and moves the old as-is to a "History" page on the canvas | Accepted (DSGN-T004, deferred until the fixture build merges). |
| FS-61 | When the build differs from its board, `/sync-design` rebuilds the board from the shipped components only when an owner ruling accepts the difference, citing that ruling in a canvas note; a TRD decision the architect wrote does not count, and with no owner ruling the board stays `building` and the difference is reported under ISSUES | Accepted (DSGN-T004, deferred until the fixture build merges). |
| FS-62 | When component or token paths changed, `/sync-design` runs `/design-system --sync`, then publishes, commits and updates the map | Accepted (DSGN-T004, deferred until the fixture build merges). |
| FS-63 | `/audit-design --drift` compares every `shipped` and as-is board with a fresh screenshot of the current build and the installed design system's version with the current one, reports code changes made outside any design and screens never designed, and lists each screen with no board for `/create-design` to rebuild | Accepted (DSGN-T004, deferred until the fixture build merges). |
| FS-67 | The NativeWind board, drawn on the hosted canvas, shows its chips | Accepted (DSGN-T005, owner-attended): needs the NativeWind board seen on the hosted canvas. |
| FS-68 | A session started by an orchestrator under the james account creates and publishes an artifact | Accepted (DSGN-T005, owner-attended): needs a session under the james account. |
| FS-72 | The 44-board flow redone with these commands has to-be boards that use `x-import`, links that are playable, and hand edits and comments that round-trip between canvas and repository | Accepted (DSGN-T006): the owner's own 44-board flow is not available here. |

## Evidence

### FS-34 — Each as-is board, rendered, matches the current screenshot of its screen (met)

![FS-34](evidence/iter3/fs34/board-01-trips--as-is.png)

### FS-54 — `verify-design-structure` walks the React tree in Playwright and compares the components rendered at a board's route with the board's `components`; on a stack other than React or react-native-web, and for parts boards, it does not run the structure check and reports "not verifiable here" (not_met)

![FS-54](evidence/iter3/fs54/ST-01-trips--as-is.png)


## Fix run

| Round | Tasks promoted | Criteria closed | Still open |
|-------|-----------------|------------------|-------------|
| 0 | 0 | 26 | 25 |
| 1 | 1 | 12 | 13 |

| ID | Statement | Status | Cause | Stop reason |
|----|-----------|--------|-------|-------------|
| FS-25 | A board drawn with the installed design system renders its real components on the hosted canvas | not_verifiable | capability absent | accepted as not verifiable: DSGN-T005, owner-attended |
| FS-42 | `/refine-design` takes feedback from the argument, chat, canvas comments and the viewer's selected elements; changes only the affected boards, re-challenges them, publishes only what changed, posts a before/after, and answers each comment it handled | not_verifiable | capability absent | not verifiable here: No tool here can create a canvas comment, so a comment-driven run cannot start. |
| FS-43 | `/refine-design` sets a board to `approved` only on the owner's word, through each of three channels — in chat, by an "approved" comment on the board, or with `--approve <ids>` — and a run with none of them leaves every board `draft` | not_verifiable | capability absent | not verifiable here: Chat and --approve channels proven (iter4), --auto with no approval approved nothing; the 'approved' comment channel cannot be exercised without a tool that creates canvas comments. |
| FS-54 | `verify-design-structure` walks the React tree in Playwright and compares the components rendered at a board's route with the board's `components`; on a stack other than React or react-native-web, and for parts boards, it does not run the structure check and reports "not verifiable here" | not_met | evidence missing | not buildable by cause: evidence missing — re-verified each round, never built |
| FS-58 | `/audit-build`'s NEXT names `/sync-design <slug>` when the closed feature has a design, and does not run it | not_verifiable | environment not reachable | accepted as not verifiable: DSGN-T004, deferred until the fixture build merges |
| FS-59 | `/sync-design` captures, for each `building` board, the built screen at its route and states into `as-built/png/` | not_verifiable | environment not reachable | accepted as not verifiable: DSGN-T004, deferred until the fixture build merges |
| FS-60 | When the build matches its board, `/sync-design` sets the board `shipped` with `shipped_commit`, makes the to-be board the new as-is for that screen, and moves the old as-is to a "History" page on the canvas | not_verifiable | environment not reachable | accepted as not verifiable: DSGN-T004, deferred until the fixture build merges |
| FS-61 | When the build differs from its board, `/sync-design` rebuilds the board from the shipped components only when an owner ruling accepts the difference, citing that ruling in a canvas note; a TRD decision the architect wrote does not count, and with no owner ruling the board stays `building` and the difference is reported under ISSUES | not_verifiable | environment not reachable | accepted as not verifiable: DSGN-T004, deferred until the fixture build merges |
| FS-62 | When component or token paths changed, `/sync-design` runs `/design-system --sync`, then publishes, commits and updates the map | not_verifiable | environment not reachable | accepted as not verifiable: DSGN-T004, deferred until the fixture build merges |
| FS-63 | `/audit-design --drift` compares every `shipped` and as-is board with a fresh screenshot of the current build and the installed design system's version with the current one, reports code changes made outside any design and screens never designed, and lists each screen with no board for `/create-design` to rebuild | not_verifiable | environment not reachable | accepted as not verifiable: DSGN-T004, deferred until the fixture build merges |
| FS-67 | The NativeWind board, drawn on the hosted canvas, shows its chips | not_verifiable | capability absent | accepted as not verifiable: DSGN-T005, owner-attended |
| FS-68 | A session started by an orchestrator under the james account creates and publishes an artifact | not_verifiable | environment not reachable | accepted as not verifiable: DSGN-T005, owner-attended |
| FS-72 | The 44-board flow redone with these commands has to-be boards that use `x-import`, links that are playable, and hand edits and comments that round-trip between canvas and repository | not_verifiable | environment not reachable | accepted as not verifiable: DSGN-T006, the owner's own 44-board flow |

