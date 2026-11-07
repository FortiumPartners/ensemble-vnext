# TRD: design-render-pnpm-critique-keep

**Source PRD**: None — two defects found by the design-quality live test on lightning-lane, 2026-11-06 (`.trd-state/task-design-quality-live-lightning-lane/findings.md`, Ensemble findings 1 and 3)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | In a pnpm (or npm/yarn) workspace monorepo whose Playwright is a dependency of a workspace package rather than of the root, the design commands find it and render, so the visual critique, explore ranking and the audit's visual verifiers run instead of reporting "Playwright not installed" | the reproduction below; owner instruction 2026-11-06 ("should check workspace packages and accept @playwright/test") | yes |
| O2 | A product that has `@playwright/test` but not `playwright` itself gets the same render as one with `playwright` | owner instruction 2026-11-06 | yes |
| O3 | `/refine-design` never loses scores it did not replace: a board this run did not re-judge keeps its earlier scores in `critique.md`, and a board it did not change keeps its whole section | the reproduction below; owner instruction 2026-11-06 ("/refine-design overwrites critique.md and loses the scores") | yes |
| O4 | A product with no Playwright anywhere still gets the existing exit-2 ToolError naming the install step (D13 of the design-quality TRD is unchanged in that respect) | `docs/TRD/design-quality.md` D13; existing test `design-render.test.js:221` | |

## Reproduction

### Steps

1. Defect A (Playwright lookup), run read-only against the live-test worktree:
   ```bash
   node -e 'const r=require("./packages/core/lib/design-render");
     for (const n of ["playwright","@playwright/test","tailwindcss"]) {
       try { r.resolveTool(n,"/Users/james/dev/lightning-lane-design-desktop","x"); console.log(n,"found"); }
       catch (e) { console.log(n,"FAIL"); } }'
   ```
2. Defect B (critique overwrite): compare the live run's `critique.md` after `/create-design`
   with the same file after `/refine-design --auto` with no feedback:
   `.trd-state/task-design-quality-live-lightning-lane/evidence/04-critique.md` vs `05b-critique-after-refine.md`.

### Actual

- A [ran]: all three FAIL. Yet `require.resolve("@playwright/test", { paths: ["<worktree>/apps/web"] })`
  succeeds and its `chromium.launch` is a function. lightning-lane's `pnpm-workspace.yaml` lists
  `apps/*` and `packages/*`; only `apps/web/package.json:52` declares `@playwright/test`, which pnpm
  links into `apps/web/node_modules/@playwright/test`. The `playwright` package itself exists only
  in pnpm's store (`node_modules/.pnpm/playwright@1.60.0`), which Node's lookup never reaches.
  Root cause [ran]: `resolveTool` (`packages/core/lib/design-render.js:116-128`) tries exactly two
  roots, the project root and `npm root -g`, and exactly one package name. Every design command's
  render, critique and ranking, and `/audit-design`'s visual verifiers, then skip as "not installed".
- B [read]: after refine, `critique.md` holds only the boards the run changed (`03-pre-trip`,
  `04-chat` and two parts), each scored "not judged"; the ten-dimension tables for `01-trips-home`
  and `02-trip-editor`, and the earlier scores for the two changed boards, are gone. Root cause
  [read]: `packages/core/commands/refine-design.md:136-138` says to write `critique.md`
  "overwritten each run" with a table "per changed board", and nothing tells the run to read
  the existing file or keep any part of it.

### Expected

- A: `resolveTool("playwright", <worktree>)` returns a module whose `chromium.launch` works.
- B: the four boards' sections all survive a refine; a changed board this run could not
  re-judge keeps its earlier scores, labelled as predating this run's change.

## Decision

**A. Widen the search for Playwright only; keep the order and the error.** `resolveTool` gains
an optional fourth argument, `{ workspace: true, alias: [...] }`, which only `launch()` passes.
Without it the function behaves exactly as today, so `design-bundle.js`'s lookups of
`tailwindcss`, `postcss` and `esbuild` do not change. With it, the search loops **folders
outer, names inner**, stopping at the first hit:

1. the project root, trying `playwright` then `@playwright/test`;
2. each workspace package folder, the same two names in each: read `pnpm-workspace.yaml`'s
   `packages:` list, else `package.json`'s `workspaces` (an array, or `{ packages: [...] }`);
   expand an entry of the form `dir/*` to that folder's immediate subfolders, **sorted by name**,
   and take a plain path as is; skip `!`-negated entries and anything containing `**`; keep only
   folders that exist and hold a `package.json`;
3. the global npm root, last (as today).

Folders outer means the product's own `@playwright/test` beats a global `playwright`, which keeps
D13's "the product's first". `@playwright/test` re-exports `playwright/test`, so `chromium.launch`
is the same [ran: `@playwright/test@1.60.0` from lightning-lane's `apps/web`]. The YAML line
parser reads the block form (`- 'apps/*'`, quoted or not) and the flow form
(`packages: ['apps/*', 'packages/*']`), and stops at the next top-level key (pnpm workspace files
also carry `catalog:` and `onlyBuiltDependencies:`).

The YAML is read with a line parser for the `packages:` block (`- 'apps/*'`, quoted or not),
because the framework ships no YAML dependency (`stack.md`) and the block's shape is fixed.
Rejected: walking every `node_modules` under the project — slow on a large monorepo and it
would pick up nested copies nobody declared; adding `NODE_PATH` instructions — the live test's
workaround, which moves the burden to every owner.

The workspace search is **not** applied to the bundler's tools. Playwright works at any version;
Tailwind does not. In lightning-lane, `apps/mobile` declares Tailwind 3 and `apps/web` Tailwind 4,
so a sorted workspace search would hand `/design-system` mobile's Tailwind 3 for a web design
system, and `tailwindcss` and `postcss` could come from two different packages [read: the
review's check of both `package.json` files]. Rejected for this fix; see "not absorbed".

**B. `critique.md` is merged per board, never overwritten whole by `/refine-design`.** The
refine step reads the existing file first. For each board section:

- a board this run changed **and** re-judged: its section is replaced by the new scores;
- a board this run changed but whose visual critique did not run: its earlier scores stay,
  under a line "scores predate this run's change (<date>); not re-judged: <reason>";
- a board this run did not change: its section is kept unchanged.

The file's header line names the run that last touched it (command and date). `/create-design` keeps writing the
file whole (it draws every board), unchanged.

Rejected: a lib helper that merges the markdown deterministically — the file is written by a
model from a returned structure and has no fixed per-board delimiter today, so a helper would
first need a format change across two commands; the prose rule plus a prose test is the
proportionate fix, revisit if a third writer appears.

absorbed: none
not absorbed: the bundler finding its tools in a workspace — needs a per-entry lookup (resolve from the folder of the entry being bundled), a separate fix
not absorbed: `postcss` and `esbuild` are transitive in lightning-lane (no workspace package declares them), so `/design-system` still needs them linked — separate fix, this one works without it
not absorbed: no Next.js + Tailwind 4 bundler recipe — separate fix
not absorbed: the shipped `/create-design` explore step returned no ranking and the fix round edited as-is boards (finding 2) — mostly downstream of A; re-test after this fix before planning it
not absorbed: craft and rubric passed as pointers; measures relayed as prose — separate fixes

## Non-Goals

- Shipping Playwright, or any package, in `.claude/` (D13 stands).
- Resolving transitive-only packages from pnpm's store.
- Changing `/create-design`'s or `/audit-design`'s critique output.
- Any change to how scores are produced.

## Verification Artifacts

None apply — the change is a Node module's lookup and a command's prose; no frames, screens or API data are added. The proof is the unit tests plus one live render (Could Not Verify).

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Give `resolveTool` an opt-in workspace search with a name alias, used only by `launch()` for `playwright` → `@playwright/test`, per the Decision; update the header comment's D13 line and make the not-found message name the folders it searched | O1, O2, O4 | None | Every test neutralises the global lookup (an empty `PATH` for the call, as the existing CLI test does) and each stub exports a unique marker the test asserts. (1) Fixture with `pnpm-workspace.yaml` listing `apps/*` and a stub `apps/web/node_modules/@playwright/test`: `resolveTool('playwright', root, hint, opts)` returns that stub; the same fixture without the workspace file throws ToolError. (2) The same with `package.json` `workspaces: ["apps/*"]`, with `{ packages: [...] }`, and with the flow-style YAML list; a YAML file whose `packages:` block is followed by `catalog:` reads only the packages. (3) `!apps/web` excludes it; an entry with `**` is skipped; a folder without `package.json` is skipped. (4) Two packages `apps/a` and `apps/b` each with a stub: `a`'s is returned (sorted order). (5) A root `@playwright/test` stub is returned in a single-package repo (O2 alone). (6) Without the opts argument the workspace stub is NOT found (bundler behaviour unchanged). (7) The not-found message names the searched folders. (8) Existing exit-2 tests and `design-bundle.js` tests still pass |
| FIX-002 | Rewrite `/refine-design` step 3's `critique.md` instruction as a per-board merge, per the Decision, and extend `refine-design-prose.test.js` | O3 | None | (1) `refine-design.md` no longer says "overwritten each run" for `critique.md`, and says to read the existing file first, keep unchanged boards' sections, and keep earlier scores labelled "predate this run's change" when a changed board was not re-judged. (2) It says the header line names the command and date of the run that last touched the file. (3) The prose test asserts each of these and fails on the old text. (4) `create-design.md`'s whole-file write is unchanged |
| AMEND-001 | Make `/refine-design`'s `critique.md` header rule its own step, so every run rewrites the file's first line with the command and date (a live refine on lightning-lane, 2026-11-06, merged per board but left the header "# Critique (before the fix round)") — amendment, 2026-11-06 | amendment | FIX-002 | | (1) `refine-design.md` (and its `.claude/` mirror) states the header rewrite as its own bullet, naming the line's form and that it is rewritten every run; (2) the prose test asserts that bullet and fails on the old single-sentence text |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/design-render.js`, `packages/core/lib/design-render.test.js`
- **Reuse:** the existing `resolveTool(name, projectRoot, installHint)` signature and its `ToolError` (exit 2) [read]; `spawnSync('npm', ['root','-g'])` fallback kept as the last root [read]; the test file's tmp-dir fixture pattern under `describe('missing tools exit 2 …')` (`design-render.test.js:209`) [read]
- **Replaces:** the two-root lookup at `design-render.js:116-128` [ran — reproduced failing]
- **Follow:** the fourth argument is optional, so `design-bundle.js:119-136` needs no change and keeps today's lookup; the alias table is internal, not exported; the full vendored copy under `packages/full` is produced by the usual build/sync, not hand-edited
- **Careful:** a workspace entry like `../x/*` resolves modules outside the repo; it comes from the owner's manifest, so allow it but do not follow symlinks out of it specially. `.claude/lib/design-render.js` is a separate vendored copy refreshed by the usual sync. A stub `@playwright/test` in a fixture must not shadow the real Playwright the render tests use — build the fixture under `os.tmpdir()`; `require` caches by resolved path, so resolve, don't import, in the order test

### FIX-002
- **Touches:** `packages/core/commands/refine-design.md`, `packages/core/commands/refine-design-prose.test.js`
- **Reuse:** the existing DQ-B009 prose test block (`refine-design-prose.test.js:202-210`) [read]
- **Replaces:** "Write `docs/ui/<slug>/critique.md` (overwritten each run, committed with the design): per changed board, …" at `refine-design.md:136-138` [read]
- **Follow:** keep the table shape (dimension, score or "not judged", versus predecessor, frames read, reason, then measured values) so the audit and later refines read the same format
- **Careful:** `refine-design.md:85` lists `## Visual critique scores` as part of the audit report it reads — a different file; do not touch that line

## Could Not Verify

- Applied from the adversarial review (2026-11-06): the workspace search is limited to Playwright (it picked lightning-lane's mobile Tailwind 3 for the bundler); the loop order is folders outer so a global install cannot beat the product's copy; the tests neutralise the global npm root and assert exact stubs.

- That a real `/create-design` run on lightning-lane now critiques and ranks unaided. Owner ruling 2026-11-06 (R1): FS-4 (critique, ranking and `/audit-design`'s visual checks run on rendered boards) is accepted as proven by the render evidence: each of those steps reaches Playwright only through `node .claude/lib/design-render.js render` (`create-design.js:357,489`, `audit-design.js:283`), and that command ran in a fresh session in the worktree on 2026-11-06 with no `NODE_PATH` and returned frames with no errors (`.trd-state/design-render-pnpm-critique-keep/evidence/live-refine-r4/refine-pane-r4.txt`). No live `/create-design` or `/audit-design` run is required for this fix; whether the critique agents score and rank well is outside it.
- That a model following the new refine prose actually merges rather than overwrites; the prose test proves only that the instruction is there.

## Changelog

- 2026-11-06: owner ruling R1 (via `/refine-verification`): FS-4 accepted as proven by the live render evidence; no hour-long design or audit run for this fix.
