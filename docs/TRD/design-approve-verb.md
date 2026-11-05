# TRD: design-approve-verb

**Source PRD**: None — small change decided in session (owner, 2026-11-05)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | One library call, `node .claude/lib/design-map.js approve`, approves boards (to-be boards and part boards alike). It commits any uncommitted change under `docs/ui/<slug>/` first, moves `draft` boards to `approved` with `approved_commit`, leaves an already-`approved` board and its `approved_commit` alone unless asked to re-approve, renders frames for exactly the boards it moved, and commits the map and frames. Any render failure (no runtime, missing Playwright/Chromium, a bad runtime path, a failed render) skips or cuts short the render and is reported, and the approval stands and is committed. A board in `building` or `shipped`, or not in the map, makes the call fail with that board named and nothing changed | your instruction, 2026-11-05 ("move the board-approve sequence … into one design-map.js approve verb, reconciling the drifted copies") | yes |
| O2 | `/refine-design --approve`, `/create-trd --design` and `/plan --design --boards` all approve through that call and carry no hand-written approve sequence of their own (no `transition --to approved`, no approve-time `design-render.js render`) | your instruction, 2026-11-05 ("hand-copied in refine-design, create-trd and plan … has drifted") | |
| O3 | `/create-trd --design` approves its boards only after the TRD is written, so a run that stops before the TRD exists leaves its `draft` boards in `draft`; the boards it passes to the TRD author are the buildable ones it checked (minus held boards), and `/plan --design --boards` follows the same order | your instruction, 2026-11-05 ("have /create-trd --design approve boards only after the TRD is written so a failed run leaves them unapproved") | yes |

## Intended Change

Today three commands each spell out the approve sequence by hand, and the copies differ
(`packages/core/commands/refine-design.md` step 5, `create-trd.md` "Design input" step 3,
`plan.md` "Design input"):

| | `/refine-design --approve` | `/create-trd --design` | `/plan --design --boards` |
|---|---|---|---|
| Boards transitioned | every named id, so an already-approved board gets a new `approved_commit` | draft ids only; approved keep theirs | draft ids only; approved keep theirs |
| Frames rendered | every approved board in the design (no `--boards`) | the draft ids | the draft ids |
| No runtime | not covered | skip render, ISSUES, approval stands | skip render, ISSUES, approval stands |
| Commit before | "the adopted edits and any board changes" | any uncommitted change under `docs/ui/<slug>/` | any uncommitted change under `docs/ui/<slug>/` |
| Commit message | none given | `chore(design): <slug> boards approved by /create-trd` | none given |

And `/create-trd --design` approves its draft boards (step 3) **before** the workflow writes the
TRD (step 4), then passes the boards `design-map.js approved` lists. A run that stops in the
workflow leaves those boards `approved` with no TRD and nothing built. `/plan`'s design input
has the same order.

After this change:

- **The verb.** `node .claude/lib/design-map.js approve --dir docs/ui/<slug> --ids <ids>
  [--commit <sha>] [--runtime <path>] [--reapprove] [--message <text>]` does the whole
  sequence and prints `{ commit, approved, kept, rendered, renderSkipped }`:
  1. Fails, changing nothing, when any id is not in the map or is `building` or `shipped` (the
     error names the board and its status). Any kind of board may be approved: a part board
     is approved this way too (`/refine-design <slug> --approve <part>` is the only remedy for
     a board held by a draft part).
  2. Without `--commit`: commits any uncommitted change under the design folder
     (`chore(design): <slug> board changes before approval`), when there is one, and takes
     `HEAD` as the approval commit. With `--commit <sha>`: takes that sha, and **fails,
     changing nothing,** when the design folder differs from it (`git diff <sha> -- <dir>` or
     an uncommitted change under it), naming the changed files, because an edit made after
     the source commit was not part of what the invocation approved.
  3. Moves every named `draft` board to `approved` with that commit. A named board already
     `approved` is moved again only with `--reapprove` (a new `approved_commit`); otherwise it
     is listed under `kept` with its commit unchanged.
  4. **Writes the map before rendering**, because `render` reads the map from disk and renders
     a board at its `approved_commit` only once its status says `approved`.
  5. Renders frames for exactly the boards moved in step 3, through `design-render.js`'s
     `render` with `approved` set, into `docs/ui/<slug>/screens/png/`. **Every render failure**
     (no `--runtime`, the missing-tool error, a runtime path that does not exist, a failed
     `git archive`, any other throw) puts the reason in `renderSkipped`, and `render`'s own
     per-board `errors` are passed through; the approval still stands.
  6. Commits the map and the frames it wrote, whatever happened to the render, staging and
     committing by pathspec (`git add -- <dir>` then `git commit -m <message> -- <dir>`, so
     nothing else the user staged is swept in; `--message`, default
     `chore(design): <slug> boards approved`), when anything changed.
  Its own errors exit 1, never render's exit 2.
- **`/refine-design --approve <ids>`** calls it with `--reapprove`: approving a board you have
  refined since its last approval records the new commit, as the TRD of the design stage
  already allows (`approved → approved`, re-approval).
- **`/create-trd --design`** keeps steps 1-2 (buildable, held, zero-boards STUCK). Before the
  workflow it commits any uncommitted change under the design folder and records
  `git rev-parse HEAD` as the source commit, then passes the kept boards from `buildable`
  (not `approved`, which would not list drafts) as `design.boards`. **After the TRD is
  written**, it calls `approve --ids <kept ids> --commit <source commit> --message
  "chore(design): <slug> boards approved by /create-trd"`, then moves the same boards to
  `building` as today. A run that stops before the TRD is written approves nothing.
- **`/plan --design --boards`** follows the same order: check, record the source commit, write
  the TRD, then `approve`, then `building`.
- **The TRD author's prompt** (`create-trd.js` `DESIGN SOURCE` text and its comments, and
  `trd-authoring.md` "Design as a source") says the listed boards are the to-be boards this run
  builds, approved by it once the TRD is written, instead of "approved to-be boards". Listed
  boards may carry `"status": "draft"`, so the contract's "Nothing builds from a draft board"
  bullet is narrowed to a draft board **not in the `DESIGN SOURCE` list** (a draft part, a
  draft to-be board this run is not building), and its "held back any approved board" sentence
  drops "approved".

## Decision

One verb that does the commits too, not a verb that only transitions: the drift is in the
steps around the transition (which commit, which frames, what a missing runtime means, what
gets committed), so a verb that left those in prose would leave the drift in place.
`design-map.js` already shells out to `git` (`stale`, `headCommit`); the commits are scoped to
the design folder by pathspec, never `git add -A`. The render is called in-process through a
lazy `require('./design-render')` inside `approve`, because `design-render.js` already requires
`design-map.js` and a top-level require would be circular.

Re-approval is opt-in (`--reapprove`), not the default: the two building commands must not
move an approved board's `approved_commit` (its frames are what verification compares
against), and `/refine-design --approve` is the one caller whose purpose is to approve again.

Approve after the TRD, against the commit the TRD was written from (`--commit`), not `HEAD` at
approval time: the source the owner approved by invoking the command is the source the author
read. Rejected: approving before the workflow and rolling back on failure (a rollback is a
second write path to the map, and a killed session never runs it). Also rejected: running
`design-render.js` as a child process (keeps `main()` synchronous, but the render could then
only be stubbed through the filesystem), and a `--snapshot` mode for the "commit the design
folder and record the source commit" step the two building commands still spell out before
their workflow (two short copies of one step; low drift risk next to the sequence this removes).

Corrections from the adversarial review, applied (none adds a task): the verb accepts part
boards, because `/refine-design --approve <part>` is the only way to release a held board;
every render failure is reported and the map is committed regardless; the map is written
before rendering; `--commit` refuses a design folder changed after that commit; staging and
committing are both by pathspec; the TRD author's contract is narrowed so a listed draft board
is not read as "do not build".

absorbed: `/plan --design --boards` approves before writing its TRD too — the same order in the same sequence being reconciled; leaving it would keep two orders after the reconcile  [BLOCKS]
not absorbed: `design-map.js` accepts `--all` for every verb and `unsynced --all --dir` scans silently — separate review finding, this works without it
not absorbed: the unsynced-board ISSUES line names boards by id only — owner's wording decision, unrelated

## Non-Goals

- Changing who or what may approve (AC-F9.4 stands: invocation only).
- Changing how parts are approved (they stay approvable through `/refine-design --approve`), or how held boards are found.
- Changing `transition`'s allowed moves.
- Publishing frames or touching the canvas.

## Verification Artifacts

None apply — the change is a library verb and command prose; no screens, journeys or data views change.

## Open Questions

none

Owner ruling (2026-11-05, `/refine-verification`, R1): the command-order criteria (`/create-trd --design` and `/plan --design --boards` approving only after the TRD, and `/refine-design --approve`) are proven by live headless sessions in the react-web fixture, as the design-stage checks were; verification may start `claude` sessions there for them.

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| DAV-001 | Add `approve` to `design-map.js` (function and CLI verb) with unit tests on a temp git repo, and copy to `.claude/lib/design-map.js` | O1 | None | Tests on a temp git repo with a design holding draft, approved, building and shipped to-be boards, a draft part board, and an uncommitted board edit: without `--commit` the edit is committed first and `approved_commit` equals that commit; drafts (the part included) move to `approved`; an approved board is `kept` with its old commit, and moves with a new one under `--reapprove`; `--commit <sha>` is used verbatim, and fails naming the file when the design folder changed after that sha; a `building`/`shipped`/unknown id fails naming it and leaves the map and HEAD unchanged; with no `--runtime`, `renderSkipped` names the missing runtime, the call exits 0 and the approved map is committed; a render that throws (missing tool, or any other error; render stubbed) is reported the same way and the map is still committed; a file staged outside the design folder is not in the approve commit; the CLI awaits the result and prints it (not `{}`); the map is committed with `--message`; the two copies are byte-identical |
| DAV-002 | `/refine-design --approve` calls `approve --reapprove`; its hand-written commit/transition/render/commit steps are removed; prose test updated | O2 | DAV-001 | `refine-design-prose.test.js` asserts the `design-map.js approve` call with `--reapprove`, that `--to approved` and an approve-time `design-render.js render` no longer appear in step 5, and that step 5 still says only `--approve <ids>` approves; the `.claude/` copy is byte-identical |
| DAV-003 | `/create-trd --design` records the source commit before the workflow, passes the `buildable` boards (minus held), and calls `approve --commit` only after the TRD is written, before `building`; `create-trd.js` `DESIGN SOURCE` wording and `trd-authoring.md` "Design as a source" updated; prose tests updated | O2, O3 | DAV-001 | `create-trd-design-prose.test.js` asserts the order held → source commit → `Workflow({ name: "create-trd"` → `design-map.js approve` → `--to building`; that `design-map.js approved` and `--to approved` no longer appear; and that a run stopping before the TRD is written approves nothing; the workflow's `DESIGN SOURCE` prompt and the contract say the boards are approved by this run once the TRD is written; every `.claude/` copy is byte-identical |
| DAV-004 | `/plan --design --boards` uses the same order and the verb; prose test updated | O2, O3 | DAV-001 | `plan-design-prose.test.js` asserts `buildable` and `held` before the TRD is written, `design-map.js approve --dir docs/ui/<slug> --ids` after it and before `--to building`, and no `--to approved` or approve-time render; the `.claude/` copy is byte-identical |

## Task Grounding

### DAV-001
- **Touches:** `packages/core/lib/design-map.js`, `packages/core/lib/design-map.test.js`, `.claude/lib/design-map.js`
- **Reuse:** `read()`, `write()`, `transition()` (its `ALLOWED.approved` already allows `draft → approved` and `approved → approved`, setting `approved_commit`), `buildable()`, `git()`, `headCommit()`, `idList()`, `parseArgs()` [read]; `design-render.js` `render(o)` (async, exported) with `o.boards` and `o.approved`, and its `ToolError` (exit code 2) for a missing tool [read]; the `stale()` tests' temp-repo helpers in `design-map.test.js` [read]
- **Follow:** pure function plus a thin CLI case, like `buildable`/`held`/`unsynced`; JSON on stdout, exit 1 on error [read]. `main()` was synchronous and the CLI printed `JSON.stringify(main(...))`, so an unawaited Promise would print `{}` and exit 0 (as built, the CLI awaits `main(...)` and prints its result at `design-map.js:446-449`): make the CLI await `approve`, copying the shape of `design-render.js:381-387` [read]
- **Decision:** the verb commits (design-folder pathspec on both `git add` and `git commit`, never `git add -A`) and renders; re-approval is opt-in with `--reapprove`; any board kind may be approved; validate every id, and the `--commit` folder check, before the first write or commit, so a bad call changes nothing; write the map before rendering; commit the map whatever the render did
- **Careful:** `design-render.js` requires `design-map.js` at top level, so require it lazily inside `approve` (safe: `design-map`'s exports are complete by then) [read]. `render` throws a plain `Error` (exit 1) for a missing runtime path (`design-render.js:294`), a failed `git archive` (`:142`) and `no board` (`:273`), as well as `ToolError` (exit 2): catch all of them [read]. `transition` throws on `building`/`shipped` already, but only after building a copy; check up front so no commit happens first. Add `--reapprove` to the boolean flag list beside `--record` (`design-map.js:402`) [read]. `git commit` with nothing staged fails: skip it when the pathspec has no change [inferred]

### DAV-002
- **Touches:** `packages/core/commands/refine-design.md`, `packages/core/commands/refine-design-prose.test.js`, `.claude/commands/refine-design.md`
- **Reuse:** step 5's "Approve, only on the owner's word" rules and its "No other channel approves" bullet stay as they are [read]
- **Replaces:** step 5's "Commit … first", "Transition", "Render the frames" and "Commit the map and frames" bullets — DELETE them; the verb does all four [read]
- **Follow:** other commands' one-line `node .claude/lib/...` calls in fenced bash blocks [read]
- **Careful:** step 5 runs after the publish step and after adopted canvas edits are committed; pass the saved runtime path (the one step 1 saved for the render check) as `--runtime`. `--approve <part>` must keep working (the verb accepts part boards). Today an illegal move "is reported under ISSUES" (`refine-design.md:87`); the verb now fails the whole call naming the board, so say that failure is one ISSUES line and approves nothing (as `transition` already did, all or nothing). Frames now render for the boards approved this run only, not every built board; state that. `renderSkipped` and render `errors` are ISSUES lines. `refine-design-prose.test.js` pins "six steps" and the approval wording [read]

### DAV-003
- **Touches:** `packages/core/commands/create-trd.md`, `packages/core/commands/create-trd-design-prose.test.js`, `packages/core/workflows/create-trd.js`, `packages/core/contracts/trd-authoring.md`, `.claude/commands/create-trd.md`, `.claude/contracts/trd-authoring.md`, `.claude/workflows/create-trd.js`
- **Reuse:** "Design input" steps 1-2 (buildable, held, zero-boards STUCK) unchanged; step 5's `--to building` move unchanged [read]
- **Replaces:** step 3's hand-written approve sequence and step 4's `design-map.js approved` list — DELETE both; boards come from `buildable` minus held [read]
- **Follow:** the step numbering and STUCK wording already in "Design input" [read]
- **Careful:** `create-trd.js` line ~95-99 builds the `DESIGN SOURCE` text ("Build from these approved to-be boards"); `buildable` returns board objects in the same shape as `approved`, so `design.boards` keeps its shape, but draft ones carry `"status": "draft"` [read]. The workflow has a `.claude/workflows/create-trd.js` mirror; keep it byte-identical, and update its comments at lines ~18 and ~95 ("the approved to-be boards", "`approved` output verbatim") [read]. `trd-authoring.md`'s "Nothing builds from a draft board" bullet (~line 738) names draft to-be boards too: narrow it to a draft board not in the `DESIGN SOURCE` list and drop "approved" from its held sentence, keeping the part-board sentence `create-trd-design-prose.test.js:51` pins [read]. A `renderSkipped` or render `errors` from the approve call is an ISSUES line, never STUCK. A `--commit` mismatch (the design folder changed during the run) fails the approve: report it in ISSUES, leave the boards unapproved, and do not move them to `building` [read]

### DAV-004
- **Touches:** `packages/core/commands/plan.md`, `packages/core/commands/plan-design-prose.test.js`, `.claude/commands/plan.md`
- **Reuse:** the "Design input (`--design`)" section's buildable/held/STUCK checks and its `--to building` move [read]
- **Replaces:** that section's hand-written approve sequence (commit, `transition --to approved`, render, commit) — DELETE it [read]
- **Follow:** DAV-003's order and wording, so the two building commands read the same [read]
- **Careful:** the section serves both the light TRD (5a) and the medium path (5b, which passes `design` to the `create-trd` workflow); the approve call goes after the TRD is written on both [read]. `plan-design-prose.test.js` currently pins approve before `--to building` and after `held`; keep both, add "after the TRD is written" [read]

## Could Not Verify

Updated by `/audit-build` (2026-11-05). Five of five audit verifiers reported; the TRD's four tasks and three objectives were checked against the delivered code and tests.

- **Fidelity to product requirements is unchecked.** This change has no PRD (the header records it as a small change decided in session, 2026-11-05), so the audit could check only that the code matches this TRD, not that the TRD matches what was wanted beyond the owner's quoted instructions in the Objectives table.

The earlier entry here, "no live run of `/create-trd --design` stopping mid-workflow", is closed: a headless session in the react-web fixture was killed after the TRD workflow started and before the TRD was written, and the design map was byte-identical afterwards with no approval commit (`.trd-state/design-approve-verb/evidence/live/A-summary.txt`, criterion FS-20 in `.trd-state/design-approve-verb/verification-report.md`).
