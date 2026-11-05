<!-- Verbatim copy of GitHub issue FortiumPartners/ensemble-vnext#58, fetched 2026-11-03. Title: Design stage on the Claude canvas: create, refine, audit, build from, verify against and sync designs. No comments on the issue at fetch time. -->

# Design on the Claude canvas: create, refine, audit, build, sync and verify

## Summary

Ensemble has no design stage. Today a design is either:

- drawn by the built-in `/design` starter, which reads almost nothing and checks nothing; or
- hand-assembled over many rounds, as on one product's 44-board flow, which took about 20 rounds.

Either way, nothing ties a board to the code it describes. Nothing builds from it, nothing tests the build against it, and nothing updates it after the build ships.

This issue specifies a design stage that works on Claude Design canvases. It:

- grounds every design in the existing screens, components, routes and data;
- draws with the product's **real components** wherever the stack allows it;
- feeds approved boards into `/create-trd` and `/plan` as build tasks;
- tests the build against the boards with the existing verification skills;
- keeps the canvas, the repository copy and the design system in step, before and after the build.

**One rule runs through all of it.** Code owns what is built, and the design system follows the code. The canvas owns what is proposed. The repository holds a copy of the canvas source, which is the canvas's history.

## Evidence: research and a spike, 2026-11-03

**The canvas's own rules.** These come from the Design type's `SKILL.md`, `format.md`, `design-system-components.md`, `view-state.md`, `print.md` and `make-from-this.md`, and from the Design System type's `from-code.md` and `from-design-tool.md`.

- A board is one `.dc.html` file: HTML with inline styles, `{{holes}}`, `<sc-for>`/`<sc-if>`, and a small React-class logic block.
- A design system installed on the canvas (`project/ds/<folder>/` plus a `designSystems` record) lets a board mount real components: `<x-import component-from-global-scope="Ns.Button" variant="primary">`.
- Shared parts are their own `.dc.html` files, included with `<dc-import>`.
- Boards link to one another (`<a href="X.dc.html">`). Marking a board `is_interactive` gives it a Play button.
- Tweaks (`data-props` editors) hold variants.
- Comments are anchored to elements.
- While a viewer has the canvas open, each message they send carries their visible boards, their selected elements and the boards showing errors.

**Export, from the canvas editor's own code.** On a canvas made in Claude, the editor offers:

- PNG or JPEG of a board, or several boards zipped as PNGs;
- PDF of one board, the selected boards, or a page;
- HTML (.zip), "Web page with its images and code";
- a Code tab for editing an element's source in place.

**There is no "Handoff to Claude Code", PPTX or Send-to-app export on this surface.** Those belong to the standalone claude.ai/design site, which closes on Dec 14, 2026. **The hand-off to code is therefore the canvas source**, which any session can read exactly with the Artifact tool.

**Real components: spike results on a production React + Expo monorepo.**

- **React web: works.**
  - the web component package (React, Tailwind v4) was bundled with esbuild into one 43 KB IIFE script assigning the namespace global, with React and ReactDOM mapped to the page's globals, plus a 29 KB stylesheet compiled by Tailwind.
  - The product's real Banner, Card, Pill and Button rendered on the canvas runtime (React 18.3.1), although the package declares React 19.
  - A `dc-import` part inside a loop worked, and a click handler updated board state.
  - Publishing to a hosted canvas, with the design system copied across on the server, succeeded. How the hosted page draws it is not yet confirmed: nobody had the page open.
- **React Native with `StyleSheet` styling: works.** `react-native` was aliased to `react-native-web`, and the components rendered, SVG icons included.
  - A shared package pulled in Node's `crypto`, which had to be stubbed.
  - Expo fonts did not load.
- **React Native with NativeWind: not yet.** The text renders, but `className` styles are dropped, because the bundle lacks NativeWind's Babel transform. 33 of the app's mobile component files use it.
- **Local render: works.** Serving the board files with the type's `artifact-type/dc-runtime.js` as `support.js` renders them in headless Chromium. This needs no claude.ai login.
- **Subagent publish: works**, once that subagent has read the canvas itself. The first try was refused: "You haven't viewed the latest version of this artifact". After a `read`, the publish succeeded. Workflow agents were not tested.

**Limits.**

- Artifacts are off for `claude -p` and the Agent SDK.
- A canvas holds 512 files, and up to 4 design systems.
- The canvas has no version history.
- A canvas's copy of a design system never updates by itself.
- The Design type tells an agent never to render or verify unless the user asked. A command whose contract includes a local render pass is that ask.

**What that 44-board canvas did not use:** 0 design systems, 0 `x-import`, 0 `dc-import`, 0 interactive boards (43 boards link to others, but none was playable), 0 tweaks, 0 pages, and no comments.

## How far each stack can use real components

The canvas runs React 18. A stack gets real components on the canvas only if its components can run as React in a browser.

| Stack                         | Board components                                                            | Design → code                | Structure check |
| ----------------------------- | --------------------------------------------------------------------------- | ---------------------------- | --------------- |
| React web                     | **real** (bundle)                                                           | near-transcription           | yes             |
| React Native, StyleSheet      | **real** (bundle via react-native-web)                                      | near-transcription           | yes             |
| React Native, NativeWind      | real once the NativeWind transform is bundled; parts until then             | transcription or translation | yes, if real    |
| Vue, Svelte, Angular          | React wrapper per component, or parts                                       | translation                  | no              |
| Web Components                | real, through a thin React wrapper                                          | near-transcription           | partial         |
| Flutter, SwiftUI, Compose     | **parts** (tokens from the theme, parts redrawn per widget) and screenshots | translation                  | no              |
| Server HTML with Tailwind/CSS | parts written in the same classes                                           | near-copy                    | no              |

**Two kinds of board component:**

- **Real components:** the product's actual components, bundled into the design system and mounted with `x-import`.
- **Parts:** `dc-import` pieces recreated from the code once, from the tokens, and shared by every board.

`.claude/rules/design.md` records which kind each platform uses. With parts, the pixel comparison has to do the checking that the component-structure check does for real components.

## What gets created or edited

### On disk, per design: `docs/ui/<slug>/`

| Path                               | What                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brief.md`                         | Screens and their states, a reuse map (board → existing components and views; anything new has a stated reason), decisions, open questions                                   |
| `grounding/`                       | Read-only inventory: `screens.md` (with screenshot paths), `components.md`, `flows.md`, `data.md`, `standards.md`. Refreshed only when the code it covers changes            |
| `canvas/project/`                  | The committed mirror of the canvas source: `canvas.json`, every `.dc.html` and the support files. `project/ds/` is left out; the design system's version is recorded instead |
| `design-map.json`                  | **The link between design and code** (schema below)                                                                                                                          |
| `screens/png/NN-name[--state].png` | Board exports rendered locally from the committed source. These are the design frames the build is tested against                                                            |
| `as-built/png/`                    | The build's screenshots at the same routes and states, taken when the design ships                                                                                           |

**`design-map.json`, one entry per board:**

```json
{
  "canvas": { "url": "https://claude.ai/artifact/…", "version": "…", "synced_at": "…" },
  "design_system": {
    "url": "…",
    "version": "…",
    "code_commit": "abc1234",
    "paths": ["packages/ui/src", "packages/tokens/src"]
  },
  "boards": [
    {
      "id": "07-alert-review",
      "file": "AlertReview.dc.html",
      "kind": "to-be",
      "replaces": "07-alert-review--as-is",
      "platform": "mobile",
      "viewport": [390, 844],
      "route": "/alerts/new/review",
      "states": { "empty": { "setup": "…" }, "error": { "setup": "…" } },
      "components": ["Acme.Card", "Acme.Button"],
      "parts": ["AlertRow"],
      "links": ["08-alert-done"],
      "brief_items": ["B3"],
      "status": "approved",
      "trd": "docs/TRD/alerts.md",
      "shipped_commit": null
    }
  ]
}
```

- `kind` is one of `as-is` (rebuilt from the current screen), `to-be` (proposed), `part` or `flow`.
- `status` runs `draft` → `approved` → `building` → `shipped`, or `superseded`.
- `components`, `parts` and `links` are derived from the board source by a library, never typed by hand.

### Owner-governed rules: `.claude/rules/design.md`

This works like `verification.md`: only the owner changes it, by running `/design-setup`. It records:

- **Design system:** its artifact link and namespace; the source of truth (code, Figma or canvas); the build command; and **whether the product's build may run to bundle components**.
- **Per platform:** which kind of board component it uses (real or parts), the tokens source, the component library paths, and the viewport sizes.
- **How to reach a screen:** the route list, sign-in and seed data, pointing at `verification.md` environments; the capture command; and where the current screenshots live.
- **Design rules:**
  - reuse ("an existing view beats a new one; a new component needs a reason");
  - an accessibility floor (contrast 4.5:1, 44 px touch targets);
  - competitor references;
  - process rules, such as "every round publishes a before/after".

### Commands (new): `packages/core/commands/`

| Command                                               | What it does                                                                                                  | Notes                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/design-system [--sync]`                             | Builds or refreshes the product's Design System artifact from code, and installs it on the product's canvases | Tokens become list-format `tokens.json`; fonts and logos are copied; components are bundled per platform (`design-bundle.js`), plus a README and preview per component. Records version and code commit in `design.md` and in each `design-map.json`. Runs the product build only if `design.md` allows it. `--sync` re-runs after the code changes                           |
| `/create-design <brief\|PRD\|issue> [--new] [--auto]` | Grounds the design, writes the brief, draws the boards and challenges them                                    | **Modifying existing screens is the default mode**: each screen in scope gets an as-is board beside its to-be board. `--new` skips the as-is boards for screens with no predecessor. Workflow `create-design.js`                                                                                                                                                              |
| `/refine-design <slug> [feedback] [--auto]`           | Applies feedback                                                                                              | Reads the live canvas first and adopts hand edits. Takes feedback from the argument, chat, canvas comments and the viewer's selected elements. Changes only the affected boards, re-challenges them, publishes only what changed, posts a before/after and answers each comment it handled. Interactive by default; `--auto` for unattended runs. Workflow `refine-design.js` |
| `/audit-design <slug> [--drift]`                      | Report only                                                                                                   | Uses the audit skeleton (index, parallel verifiers, reconcile). Writes `audit-design-report.md` and maintains `## Could Not Verify`. `--drift` adds the after-build drift checks. Workflow `audit-design.js`                                                                                                                                                                  |
| `/sync-design <slug>`                                 | After a merge: brings the design up to what shipped                                                           | See "After the build". Workflow `sync-design.js`                                                                                                                                                                                                                                                                                                                              |

**There is no separate implement command.** Approved boards flow into the existing `/create-trd` and `/plan` (see "From design to code").

### Skills (new): `packages/skills/`

| Skill                     | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design-setup`            | Owner interview that writes `design.md`. It offers defaults detected from the repository, one question per topic, and is never chained. It follows `verification-setup`'s pattern and exemption                                                                                                                                                                                                                                    |
| `designing-on-canvas`     | Our board conventions only: `x-import` for every real component, shared parts as `dc-import`, `is_interactive` on any linked board, tweaks for states and variants, one canvas page per flow, NN-name board ids, board titles, no inline copies of components. **The canvas rules themselves are read live from the Design type's `SKILL.md` and references on every run, never vendored**, because they change release to release |
| `design-grounding`        | How to inventory screens, components, flows and data for each stack, and how to capture missing screenshots                                                                                                                                                                                                                                                                                                                        |
| `verify-design-structure` | Do the components a board names appear at its route in the build? A React tree walk in Playwright compares the components rendered against the board's `components`. For React and react-native-web only; otherwise "not verifiable here"                                                                                                                                                                                          |

### Libraries (new): `packages/core/lib/`

| Library            | Purpose                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design-map.js`    | Schema, read and write. Derives `components`, `parts` and `links` from board source. Moves boards through their statuses                                                                                                                            |
| `design-mirror.js` | Three-way sync between the live canvas, the repository copy and the last synced canvas version (below)                                                                                                                                              |
| `design-render.js` | Local render of committed boards with the type's `dc-runtime.js`, served locally. Writes PNGs at each viewport and state, plus each board's render errors                                                                                           |
| `design-bundle.js` | Per-stack bundle recipes. React web: an esbuild IIFE with global React mapping and compiled CSS. React Native: the react-native-web alias, Node built-in stubs, and the NativeWind Babel transform when it is used. Others: none, so parts are used |

### Workflows (new): `packages/core/workflows/`

`create-design.js`, `refine-design.js`, `audit-design.js` and `sync-design.js`, built on `test-harness.js` like the existing ones.

### Edits to existing files

| File                                               | Change                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands/create-trd.md`, workflow `create-trd.js` | Accept a design as a source, through a PRD reference or `--design docs/ui/<slug>`. Each `approved` to-be board becomes tasks that cite the board id: route, components and props (from `x-import`), new shared components (from parts), states (from `sc-if` and tweaks), interactions (from links) and data fields (from `grounding/data.md`). Selects the design checks in `## Verification Artifacts` automatically |
| `commands/plan.md`                                 | Same, for one board or a small set                                                                                                                                                                                                                                                                                                                                                                                     |
| `skills/verify-design-comparison`                  | Accept `design-map.json` as the route-and-state manifest for each frame. Only `approved` and `shipped` to-be boards are requirements; as-is boards are regression baselines                                                                                                                                                                                                                                            |
| `skills/verify-flow-as-built`                      | Take the designed screen-to-screen edges from the board links in `design-map.json`                                                                                                                                                                                                                                                                                                                                     |
| `skills/frontend-design`                           | Drop the "confirm with the client" step, which breaks autonomy. In an existing product, reuse beats a bold new look                                                                                                                                                                                                                                                                                                    |
| `lib/artifacts.js`                                 | New artifact kinds `design` (the canvas) and `audit-design`                                                                                                                                                                                                                                                                                                                                                            |
| `commands/audit-build.md`                          | NEXT names `/sync-design <slug>` when the closed feature has a design                                                                                                                                                                                                                                                                                                                                                  |
| `commands/augment-trd-figma.md`                    | Unchanged. When `design.md` says Figma is the source, `/design-system` uses the Figma connector route instead (`from-design-tool.md`, main session only)                                                                                                                                                                                                                                                               |
| `templates/claude-directory/rules/`                | Add a `design.md` template, filled by `/design-setup`                                                                                                                                                                                                                                                                                                                                                                  |

## Workflow: what `/create-design` does

1. **Resolve.**
   - Read `design.md`. If it is missing, STUCK with "run `/design-setup`".
   - Read the Design type's `SKILL.md` and references.
   - Check that the design system's recorded `code_commit` still matches the component and token paths. If not, ask the owner to run `/design-system --sync` first, or carry on and record the drift.
2. **Ground.** Read-only agents run in parallel and write `grounding/`:
   - screens in scope, with screenshots captured if missing;
   - components with their props and where each is used;
   - flows and routes;
   - fields the backend actually returns;
   - standards;
   - competitor patterns, optionally.
3. **Brief.** One agent writes `brief.md`:
   - the screens and their states (empty, loading, error);
   - for each board, the existing components and views it reuses, and anything new with its reason;
   - open decisions.

   With a person present, it asks one round of at most four questions written from the material. Otherwise it decides and records the assumptions.

4. **As-is boards** (skipped with `--new`). For each screen in scope, an agent rebuilds the current screen from real components or parts. `design-render.js` renders it, and an agent compares that with the current screenshot. A board that still differs is marked as such in the map, never silently kept.
5. **Parts first.** One agent writes the shared parts the design system lacks.
6. **To-be boards, in parallel.** One agent per board writes its board on disk, following `designing-on-canvas`. It starts by copying the as-is board where one exists.
7. **Render and challenge.**
   - `design-render.js` renders every board.
   - Read-only reviewers return ranked findings on: flow and logic; consistency (the same task done the same way everywhere); reuse (an inline copy of an existing component or view); data reality; standards and accessibility; and render errors.
   - One fix round follows.
8. **Publish and commit.**
   - The lead reads the canvas, publishes `canvas.json` and the parts, then the boards in order.
   - It installs the design system on the canvas if it is missing or outdated.
   - It writes `design-map.json` (status `draft`), exports `screens/png/`, and commits `docs/ui/<slug>/`.
   - It records the artifact and ends with the standard readout, with the canvas link above the banner.

**Why the lead publishes, not the board agents:**

- One publisher means one canvas version per round.
- It avoids refusals when two agents save at once.
- It works even if workflow agents turn out unable to publish.

The spike shows subagents can publish after a read, so `/refine-design` may let a single agent publish a single board.

**Approval is the owner's act.**

- `/refine-design` sets boards to `approved` when the owner says so, in chat, by an "approved" comment on the board, or with `--approve <ids>`.
- Nothing builds from a `draft` board.

## Keeping things in sync before the build

There are three copies to keep in step: the live canvas (people edit it), the repository mirror (`canvas/project/`), and the design system (a copy of the code).

**Canvas and repository: `design-mirror.js`, run at the start and end of every design command.**

- **Base:** the last synced canvas version, `design-map.canvas.version`.
- **Canvas changed, repository didn't:** someone edited on the canvas. Adopt it into the repository and commit "design: adopt canvas edits (<boards>)". Re-derive the map fields.
- **Repository changed, canvas didn't:** someone edited the source in a PR. Publish it.
- **Both changed on the same board:** keep the canvas version (it is the live one), write the repository version beside it as `<board>.repo.dc.html`, and report it under ISSUES for the owner. No silent overwrite in either direction.
- **The type refuses a publish over a newer save:** re-read, redo, and after a third refusal STUCK, per the type's own rule.

**Code and design system.**

- `design-map.design_system.code_commit` and `paths` say what the system was built from.
- Every design command runs `git log <code_commit>..HEAD -- <paths>`. A change means the system is stale: run `/design-system --sync`, which rebuilds it and **reinstalls it on each canvas that records it**, since a canvas's copy never updates by itself.

**Design and requirements.**

- Every board cites its `brief_items`, and every brief item cites its PRD or issue source.
- `/audit-design` reports any board with no source, and any brief item with no board.

## From design to code

- `/create-trd` (or `/plan`) reads `design-map.json` and turns each `approved` to-be board into tasks citing its board id. It moves the board to `building` and records the TRD path.
- **Real-component boards:** a task says which components and props go at which route. It is close to a transcription from `x-import` to JSX.
- **Parts boards:** the task carries the board's PNG and source as the reference.
- The implementer agent reads the board source from `docs/ui/<slug>/canvas/project/`, never from a screenshot alone.
- **New shared components** come from parts that the brief marked as new. They become their own tasks, ahead of the screens that use them.

## Testing against the design

The TRD's `## Verification Artifacts` gets four checks when the PRD or TRD references a design. All of them run inside the existing functional-verification loop (`/implement-trd`, `/verify-build`).

| Check                               | Requirement it proves                                                      | Input from the design                                              |
| ----------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `verify-design-comparison` (edited) | Each approved board's screen looks like its board, in each state           | `screens/png/` plus the route and state setup in `design-map.json` |
| `verify-design-structure` (new)     | Each screen is built from the components its board names, not a look-alike | the board's `components`                                           |
| `verify-flow-as-built` (edited)     | The screen-to-screen journey runs as the board links say                   | the board's `links`                                                |
| `verify-data-fidelity` (unchanged)  | Each field shows what its source returns                                   | `grounding/data.md`                                                |

**How the frames are made and kept stable:**

- They are rendered locally by `design-render.js` from the committed source at the commit the board was approved. That is deterministic and needs no login, so the build is always tested against the approved design, not a later edit.
- Each state on a board, whether an `sc-if` branch or a tweak value, is exported as its own frame, `NN-name--state.png`. The state's `setup` in the map says how to reach it in the build.

**How each kind of board is treated:**

- **As-is boards** are regression baselines: a screen the design did not mean to change must still match its as-is board.
- **Parts boards** (Flutter, native and the other parts-only stacks) skip the structure check, and the pixel comparison carries the weight.

## After the build: keeping the design current

**`/sync-design <slug>` runs after a feature with a design merges.** `/audit-build` names it in NEXT; it is not chained. For each `building` board, it:

1. Captures the built screen at the board's route and states into `as-built/png/`.
2. Compares the build with the board (the `verify-design-comparison` logic).
   - **Matches:** the board becomes `shipped`, with `shipped_commit` set. The to-be board becomes the new as-is for that screen, and the old as-is moves to a "History" page on the canvas.
   - **Differs, and an owner ruling or TRD decision accepts the difference:** the board is rebuilt from the shipped components to match the build, and the ruling is cited in a canvas note.
   - **Differs, with no ruling:** reported under ISSUES. The board stays `building` and the owner decides: fix the build, or accept and rebuild the board.
3. If component or token paths changed, runs `/design-system --sync`.
4. Publishes, commits and updates the map.

**`/audit-design --drift`** can run at any time. It compares every `shipped` and as-is board with a fresh screenshot of the current build, and the installed design system's version with the current one. It reports what has drifted: code changes made outside any design, and screens never designed. A screen with no board is listed for `/create-design` to rebuild as an as-is board.

## Delivery plan

| Phase | Contents                                                                                                                     | Done when                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Finish the spike                                                                                                             | (a) the hosted canvas draws `x-import` boards with no board errors; (b) a NativeWind component keeps its styles through the Babel transform or Expo's web export; (c) a workflow agent can or cannot publish (this decides whether the lead-publishes design stays); (d) a session started by an orchestrator under each OS account it uses can create and publish an artifact (decides unattended use) |
| 1     | `design.md` and `/design-setup`; libraries `design-map`, `design-mirror`, `design-render`, `design-bundle`; `/design-system` | A React component package and plain React Native components build into a system that renders on a canvas and locally; mirror unit tests cover all four sync cases                                                                                                                                                                                                                       |
| 2     | `/create-design`, `/refine-design`, `designing-on-canvas`, `design-grounding`                                                | The 44-board flow redone: as-is boards match their screenshots, to-be boards use `x-import`, links are playable, hand edits and comments round-trip                                                                                                                                                                                                                          |
| 3     | `/audit-design`                                                                                                              | Findings name a board and line; rejected findings name the file that refutes them                                                                                                                                                                                                                                                                                                  |
| 4     | `create-trd` and `plan` design input; the two `verify-*` edits; `verify-design-structure`                                    | A TRD built from approved boards verifies against them in `/implement-trd`'s loop                                                                                                                                                                                                                                                                                                  |
| 5     | `/sync-design`, `--drift`                                                                                                    | After a merge, shipped boards replace the as-is boards and drift is reported                                                                                                                                                                                                                                                                                                       |

**Testing this work:**

- Unit tests for each library:
  - **bundle:** a fixture React library mounts under `dc-runtime`;
  - **render:** a known board produces a stable PNG;
  - **mirror:** the four sync cases;
  - **map:** derived fields from board source.
- Workflow tests on `test-harness.js`.
- Live runs on fixtures: one React web, one React Native and the existing `flutter-widget` variant (parts only). Plus the 44-board flow as the real case.

## Decisions taken in this spec

- **Names:** `create-design`, `refine-design`, `audit-design`. These match the PRD and TRD commands, and nothing in Ensemble clashes. A downstream orchestrator has stale `create-design` references, which it fixes on its own side.
- **Modifying existing screens is create's default mode** (as-is boards), not a fourth command.
- **Whether the product's build may run to bundle components** is recorded per product in `design.md` by `/design-setup`.
- **No implement-design command.** `/create-trd` and `/plan` take a design as their source.
- **The canvas rules are read live, never vendored.**
- **Not in scope:** standalone claude.ai/design and the `DesignSync` tool, which close on Dec 14, 2026.

## Open risks

- **Artifacts unavailable:** with no claude.ai login (`claude -p`, Agent SDK, CI), the commands write the repository copy and renders, then end STUCK with the publish step named.
- **Canvas size:** past 512 files, one canvas per epic flow, all listed in each `design-map.json`.
- **The canvas type changes across releases:** `designing-on-canvas` holds only our conventions, and a release-change test renders the fixture boards with the current `dc-runtime.js`.
- **Bundles leak app logic**, as a shared package pulling in `crypto` showed. `design-bundle.js` reports every stub it adds, and `/design-system` lists them in the system's README.

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01GNpn33NYe7KWu9oD9QbodA
